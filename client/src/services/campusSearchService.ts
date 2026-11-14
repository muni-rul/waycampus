/**
 * campusSearchService.ts — Production-Quality Centralized Campus Search Engine
 * Christ College (Autonomous), Irinjalakuda
 *
 * Architecture:
 * Query → Normalization → Tokenization → Indexed Candidates → Weighted Scoring → Exact/Fuzzy Ranking → Canonical Entity → Existing Navigation
 *
 * Guaranteed Invariants:
 * 1. EXACT_ROOM_CODE (15,000) > EXACT_NAME (10,000) > BUILDING (9,000) > PREFIX (4,000) > ALIAS (3,500) > FUZZY (1,500).
 * 2. Room codes (e.g. AB13, AB 13, AB-13, ab13) match AB13 directly and NEVER rank below "AB Block".
 * 3. Exact identifiers never confuse AB13 with AB31 or AB1 with AB11.
 * 4. Fuzzy typo matching (Damerau-Levenshtein) works for words (e.g. "libary" -> Library, "chemestry" -> Chemistry, "frnacy" -> Francy),
 *    but is STRICTLY DISALLOWED for short alphanumeric room codes.
 * 5. Faculty results preserve the authoritative: FACULTY -> DEPARTMENT -> VERIFIED DEPARTMENT TAG relationship.
 * 6. ZERO modifications to physical tags, panorama nodes, arrows, or navigation graphs.
 */

import { SearchResult } from '../../../shared/types';
import {
  getAllCustomPlaceTags,
  CAMPUS_GRAPH_MAP,
  AREA_LABELS,
  CHRIST_COLLEGE_OFFICIAL_BLOCKS,
  detectBlockFromTag,
  CollegeBlockMeta,
} from '../data/campusGraph';
import { CAMPUS_PLACES, CampusPlace } from '../data/campusPlaces';
import {
  VERIFIED_CLASSROOMS,
  VERIFIED_LABORATORIES,
  ClassroomRecord,
  LaboratoryRecord,
} from '../../../shared/academicData';
import OFFICIAL_FACULTY_DATA from '../data/officialFaculty.json';
import OFFICIAL_DEPARTMENTS_DATA from '../data/officialDepartments.json';
import { getSessionTeachers, getSessionDepartments } from './sessionDataCache';
import { findNavigationRoute } from './campusPathfinder';

// ─────────────────────────────────────────────────────────────
// DATA TYPES
// ─────────────────────────────────────────────────────────────

export type SearchCategoryFilter =
  | 'ALL'
  | 'ROOMS'
  | 'FACULTY'
  | 'DEPARTMENTS'
  | 'BUILDINGS'
  | 'LABS'
  | 'FACILITIES'
  | 'ACADEMIC'
  | 'PLACES';

export interface SearchOptions {
  category?: SearchCategoryFilter;
  limit?: number;
  includeDiagnostics?: boolean;
  currentNodeId?: string;
}

export interface SearchDiagnostics {
  rawQuery: string;
  normalizedQuery: string;
  roomCodeDetected: string | null;
  tokens: string[];
  totalIndexedEntities: number;
  candidateCount: number;
  topScore: number;
  matchType: string;
  executionTimeMs: number;
}

export interface SearchEngineResult {
  query: string;
  normalizedQuery: string;
  matches: SearchResult[];
  bestMatch: SearchResult | null;
  didYouMean: string | null;
  grouped: {
    rooms: SearchResult[];
    faculty: SearchResult[];
    departments: SearchResult[];
    buildings: SearchResult[];
    labs: SearchResult[];
    facilities: SearchResult[];
    other: SearchResult[];
  };
  diagnostics?: SearchDiagnostics;
}

export interface IndexedEntity {
  id: string;
  type: 'ROOM' | 'CLASSROOM' | 'LAB' | 'DEPARTMENT' | 'FACULTY' | 'BUILDING' | 'FACILITY' | 'PLACE';
  title: string;
  subtitle: string;
  canonicalName: string;
  normalizedName: string;
  nameTokens: string[];
  cleanCompactName: string;
  // Room specific
  roomNumber?: string;
  canonicalRoomCode?: string; // e.g. "ab13", "sc482", "mg211", "sm153", "sj141", "13"
  pureRoomDigits?: string; // e.g. "13", "482"
  blockCode?: string; // e.g. "AB", "SC", "MG", "SM", "SJ"
  // Block / Location metadata
  buildingId?: string;
  buildingName?: string;
  floorNumber?: number;
  floorName?: string;
  nodeId?: string;
  tagId?: string;
  isLocationVerified: boolean;
  verifiedStatus?: string;
  // Faculty metadata
  facultyId?: string;
  honorific?: string;
  designation?: string;
  departmentName?: string;
  departmentType?: string;
  qualification?: string | null;
  officialEmail?: string | null;
  officialPhone?: string | null;
  profileImageUrl?: string;
  profileLink?: string;
  vidwanLink?: string;
  sourceUrl?: string;
  locationStatusNote?: string;
  // Search metadata
  aliases: string[];
  normalizedAliases: string[];
  keywords: string[];
  category: string;
}

// ─────────────────────────────────────────────────────────────
// QUERY NORMALIZATION & ROOM NUMBER EXTRACTION
// ─────────────────────────────────────────────────────────────

/**
 * Normalizes query string: trims, lowercases, standardizes punctuation.
 */
export function normalizeQuery(raw: string): string {
  return (raw || '')
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/[\-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes a room code to compact form: e.g. "AB 13" -> "ab13", "SC-482" -> "sc482", "AB.13" -> "ab13".
 */
export function normalizeRoomCode(raw: string): string {
  return (raw || '')
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/[\s\-_/]+/g, '')
    .trim();
}

export interface ExtractedRoomQuery {
  blockPrefix: string; // e.g. "ab", "sc", "mg", "sm", "sj"
  roomDigits: string; // e.g. "13", "482", "211"
  normalizedCode: string; // e.g. "ab13", "sc482"
  pureNumberOnly: boolean;
}

/**
 * Robust room-number extractor recognizing patterns like "AB13", "AB 13", "AB-13", "AB.13",
 * "room AB 13", "AB block room 13", "SC 482", "MG 211".
 */
export function extractRoomQuery(normQuery: string): ExtractedRoomQuery | null {
  const cleanQ = normQuery.replace(/\b(room|classroom|class|hall|cabin|no|num|number|block)\b/g, '').trim();

  // 1. Direct block + number pattern: e.g. "ab13", "ab 13", "sc 482", "mg211", "sm 153", "sj 141", "gb 04", "bba 371", "sb 05"
  const blockNumMatch = cleanQ.match(/^([a-z]{2,3})\s*(\d{1,4}[a-z]?)$/i);
  if (blockNumMatch) {
    const blockPrefix = blockNumMatch[1].toLowerCase();
    const roomDigits = parseInt(blockNumMatch[2], 10).toString();
    const normalizedCode = `${blockPrefix}${roomDigits}`;
    return { blockPrefix, roomDigits, normalizedCode, pureNumberOnly: false };
  }

  // 2. Compact block + number: e.g. "ab06", "ab13", "sc482", "mg211"
  const compactMatch = cleanQ.replace(/\s+/g, '').match(/^([a-z]{2,3})(\d{1,4}[a-z]?)$/i);
  if (compactMatch) {
    const blockPrefix = compactMatch[1].toLowerCase();
    const roomDigits = parseInt(compactMatch[2], 10).toString();
    const normalizedCode = `${blockPrefix}${roomDigits}`;
    return { blockPrefix, roomDigits, normalizedCode, pureNumberOnly: false };
  }

  // 3. Pure number query: e.g. "13", "482", "211", "12"
  const pureNumMatch = cleanQ.match(/^\d{1,4}[a-z]?$/i);
  if (pureNumMatch) {
    const roomDigits = parseInt(cleanQ, 10).toString();
    return { blockPrefix: '', roomDigits, normalizedCode: roomDigits, pureNumberOnly: true };
  }

  return null;
}

/**
 * Detects if a query refers to an official campus block/building.
 * Returns the normalized block code (e.g. "AB", "MG", "SJ", "SM", "SC", "MT", "HM", "SB", "BBA", "GB")
 * or null if no block matches.
 */
export function detectBlockQuery(normQuery: string): string | null {
  const clean = normQuery.trim().toLowerCase();
  if (!clean) return null;

  // Direct check against CHRIST_COLLEGE_OFFICIAL_BLOCKS
  for (const [code, block] of Object.entries(CHRIST_COLLEGE_OFFICIAL_BLOCKS)) {
    if (clean === code.toLowerCase() || clean === `${code.toLowerCase()} block` || clean === `${code.toLowerCase()} bld`) {
      return code;
    }
    for (const alias of block.aliases) {
      if (clean === alias.toLowerCase() || clean === `${alias.toLowerCase()} block`) {
        return code;
      }
    }
  }

  // Common phrases and nicknames with flexible suffix handling
  if (/^(ab|admin|administrative)(\s+(block|bld))?$/i.test(clean)) return 'AB';
  if (/^(mg|mariam goretti|gandhi|mahatma gandhi|heritage|main)(\s+(block|bld))?$/i.test(clean)) return 'MG';
  if (/^(sm|st mary|st marys|mary|commerce)(\s+(block|bld))?$/i.test(clean)) return 'SM';
  if (/^(sj|st joseph|st josephs|joseph|life science|life sciences)(\s+(block|bld))?$/i.test(clean)) return 'SJ';
  if (/^(sc|st chavara|chavara|research|south campus)(\s+(block|bld))?$/i.test(clean)) return 'SC';
  if (/^(mt|mother teresa|teresa|social science|social sciences)(\s+(block|bld))?$/i.test(clean)) return 'MT';
  if (/^(hm|lf|little flower|hotel management)(\s+(block|bld))?$/i.test(clean)) return 'HM';
  if (/^(sb|sneha|sneha bhavan|sneha bavan|sannidhi|social work)(\s+(block|bld))?$/i.test(clean)) return 'SB';
  if (/^(bba|management|management studies)(\s+(block|bld))?$/i.test(clean)) return 'BBA';
  if (/^(gb|gabriel|fr gabriel|general)(\s+(block|bld))?$/i.test(clean)) return 'GB';
  if (/^(bpe|physical education|st sebastian|sebastian|st bernard)(\s+(block|bld))?$/i.test(clean)) return 'BPE';

  return null;
}

/**
 * Checks if two block codes refer to the same physical campus block.
 * Handles official aliases: LF <-> HM (Little Flower / Hotel Management), BPE <-> GB (St. Sebastian / Gabriel Block).
 */
export function areBlockCodesMatching(codeA: string | undefined | null, codeB: string | undefined | null): boolean {
  if (!codeA || !codeB) return false;
  const a = codeA.toUpperCase().trim();
  const b = codeB.toUpperCase().trim();
  if (a === b) return true;
  if ((a === 'LF' || a === 'HM') && (b === 'LF' || b === 'HM')) return true;
  return false;
}

// ─────────────────────────────────────────────────────────────
// DAMERAU-LEVENSHTEIN DISTANCE (TYPO TOLERANCE)
// ─────────────────────────────────────────────────────────────

/**
 * Calculates Damerau-Levenshtein distance (insertions, deletions, substitutions, transpositions).
 */
export function damerauLevenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const lenA = a.length;
  const lenB = b.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= lenA; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= lenB; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );

      // Transposition
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + 1);
      }
    }
  }

  return matrix[lenA][lenB];
}

// ─────────────────────────────────────────────────────────────
// SEARCH HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────

export function isEntityMatchingCategory(ent: IndexedEntity, categoryFilter: SearchCategoryFilter): boolean {
  if (categoryFilter === 'ALL') return true;
  if (categoryFilter === 'ROOMS') {
    return (
      ent.type === 'ROOM' ||
      ent.type === 'CLASSROOM' ||
      ent.category === 'CLASSROOM' ||
      Boolean(ent.canonicalRoomCode) ||
      Boolean(ent.roomNumber)
    );
  }
  if (categoryFilter === 'FACULTY') {
    return ent.type === 'FACULTY' || (ent.type as string) === 'TEACHER' || ent.category === 'FACULTY';
  }
  if (categoryFilter === 'DEPARTMENTS') {
    return (
      ent.type === 'DEPARTMENT' ||
      ent.category === 'DEPARTMENT' ||
      ent.category === 'OFFICE'
    );
  }
  if (categoryFilter === 'BUILDINGS') {
    return (
      ent.type === 'BUILDING' ||
      ent.category === 'LANDMARK' ||
      ent.category === 'BUILDING'
    );
  }
  if (categoryFilter === 'LABS') {
    return (
      ent.type === 'LAB' ||
      ent.category === 'LAB' ||
      ent.normalizedName.includes('lab')
    );
  }
  if (categoryFilter === 'FACILITIES') {
    return (
      ent.type === 'FACILITY' ||
      ent.category === 'FACILITY' ||
      ent.category === 'FACILITIES'
    );
  }
  if (categoryFilter === 'ACADEMIC') {
    return (
      ent.type === 'CLASSROOM' ||
      ent.type === 'ROOM' ||
      ent.type === 'LAB' ||
      ent.type === 'DEPARTMENT' ||
      ent.type === 'FACULTY' ||
      (ent.type as string) === 'TEACHER' ||
      ent.category === 'CLASSROOM' ||
      ent.category === 'LAB' ||
      ent.category === 'DEPARTMENT'
    );
  }
  if (categoryFilter === 'PLACES') {
    return (
      ent.type === 'FACILITY' ||
      ent.type === 'BUILDING' ||
      ent.category === 'LANDMARK' ||
      ent.category === 'FACILITY' ||
      ent.category === 'FACILITIES' ||
      ent.category === 'CANTEEN'
    );
  }
  return false;
}

export function mapEntityToSearchResult(ent: IndexedEntity, score: number, customSubtitle?: string): SearchResult {
  return {
    id: ent.id,
    type: ent.type,
    title: ent.title,
    subtitle: customSubtitle || ent.subtitle,
    buildingName: ent.buildingName,
    buildingId: ent.buildingId,
    blockCode: ent.blockCode,
    floorName: ent.floorName,
    floorNumber: ent.floorNumber,
    roomNumber: ent.roomNumber,
    nodeId: ent.nodeId,
    tagId: ent.tagId,
    isLocationVerified: ent.isLocationVerified,
    verifiedStatus: ent.verifiedStatus as any,
    category: ent.category,
    score,
    // Faculty specific
    facultyId: ent.facultyId,
    designation: ent.designation,
    department: ent.departmentName,
    departmentName: ent.departmentName,
    departmentType: ent.departmentType,
    profileImageUrl: ent.profileImageUrl,
    profileLink: ent.profileLink,
    vidwanLink: ent.vidwanLink,
    sourceUrl: ent.sourceUrl,
    locationStatusNote: ent.locationStatusNote,
  };
}

export function groupSearchResults(matches: SearchResult[]) {
  return {
    rooms: matches.filter((m) => m.type === 'ROOM' || m.type === 'CLASSROOM'),
    faculty: matches.filter((m) => m.type === 'FACULTY'),
    departments: matches.filter((m) => m.type === 'DEPARTMENT'),
    buildings: matches.filter((m) => m.type === 'BUILDING'),
    labs: matches.filter((m) => m.type === 'LAB'),
    facilities: matches.filter((m) => m.type === 'FACILITY'),
    other: matches.filter(
      (m) =>
        m.type !== 'ROOM' &&
        m.type !== 'CLASSROOM' &&
        m.type !== 'FACULTY' &&
        m.type !== 'DEPARTMENT' &&
        m.type !== 'BUILDING' &&
        m.type !== 'LAB' &&
        m.type !== 'FACILITY'
    ),
  };
}

// ─────────────────────────────────────────────────────────────
// CAMPUS SEARCH ENGINE CLASS
// ─────────────────────────────────────────────────────────────

export class CampusSearchEngine {
  private static instance: CampusSearchEngine | null = null;

  private entities: IndexedEntity[] = [];
  private entityMap: Map<string, IndexedEntity> = new Map();

  // Fast Inverted Lookup Indexes
  private exactRoomCodeMap: Map<string, string[]> = new Map(); // e.g. "ab13" -> [entityIds]
  private pureRoomNumberMap: Map<string, string[]> = new Map(); // e.g. "13" -> [entityIds]
  private exactNameMap: Map<string, string[]> = new Map(); // e.g. "francy t l" -> [entityIds]
  private tokenInvertedIndex: Map<string, Set<string>> = new Map(); // e.g. "francy" -> Set(entityIds)
  private blockIndex: Map<string, string[]> = new Map(); // e.g. "ab", "mg", "sj" -> [entityIds]

  private isIndexed = false;

  private liveTeachers: any[] | null = null;
  private liveDepartments: any[] | null = null;
  private livePlaces: any[] | null = null;

  public static getInstance(): CampusSearchEngine {
    if (!CampusSearchEngine.instance) {
      CampusSearchEngine.instance = new CampusSearchEngine();
      CampusSearchEngine.instance.buildIndex();
    }
    return CampusSearchEngine.instance;
  }

  public setLiveData(data: { teachers?: any[]; departments?: any[]; places?: any[] }): void {
    let changed = false;
    if (Array.isArray(data.teachers) && data.teachers.length > 0) {
      this.liveTeachers = data.teachers;
      changed = true;
    }
    if (Array.isArray(data.departments) && data.departments.length > 0) {
      this.liveDepartments = data.departments;
      changed = true;
    }
    if (Array.isArray(data.places)) {
      this.livePlaces = data.places;
      changed = true;
    }
    if (changed) {
      this.buildIndex();
    }
  }

  public getLiveData(): { teachers: any[]; departments: any[]; places: any[] } {
    return {
      teachers:
        this.liveTeachers && this.liveTeachers.length > 0
          ? this.liveTeachers
          : (OFFICIAL_FACULTY_DATA as any[]),
      departments:
        this.liveDepartments && this.liveDepartments.length > 0
          ? this.liveDepartments
          : (OFFICIAL_DEPARTMENTS_DATA as any[]),
      places: this.livePlaces || [],
    };
  }

  /**
   * Rebuilds or refreshes the search index from canonical datasets + live runtime edits.
   */
  public buildIndex(): void {
    this.entities = [];
    this.entityMap.clear();
    this.exactRoomCodeMap.clear();
    this.pureRoomNumberMap.clear();
    this.exactNameMap.clear();
    this.tokenInvertedIndex.clear();
    this.blockIndex.clear();

    const seenIds = new Set<string>();
    const sessionTeachers = !this.liveTeachers ? getSessionTeachers() : null;
    const sessionDepartments = !this.liveDepartments ? getSessionDepartments() : null;

    const departmentsSource: any[] =
      this.liveDepartments && this.liveDepartments.length > 0
        ? this.liveDepartments
        : (sessionDepartments && sessionDepartments.length > 0
          ? sessionDepartments
          : (OFFICIAL_DEPARTMENTS_DATA as any[]));
    const facultySource: any[] =
      this.liveTeachers && this.liveTeachers.length > 0
        ? this.liveTeachers
        : (sessionTeachers && sessionTeachers.length > 0
          ? sessionTeachers
          : (OFFICIAL_FACULTY_DATA as any[]));
    const placesSource: any[] = this.livePlaces || [];

    // Compute active department names and obsolete (renamed) department names
    const activeDeptNamesNorm = new Set<string>();
    const deptByIdMap = new Map<string, any>();
    const deptByPlaceIdMap = new Map<string, any>();
    for (const d of departmentsSource) {
      if (d.id) deptByIdMap.set(d.id, d);
      if (d.placeId) deptByPlaceIdMap.set(d.placeId, d);
      if (d.name) activeDeptNamesNorm.add(normalizeQuery(d.name));
      if (d.category) {
        const normCat = normalizeQuery(d.category);
        activeDeptNamesNorm.add(normCat);
        activeDeptNamesNorm.add(normalizeQuery(`${d.category} department`));
        activeDeptNamesNorm.add(normalizeQuery(`department of ${d.category}`));
      }
    }

    const obsoleteDeptNamesNorm = new Set<string>();
    const renamedDeptByOldNorm = new Map<string, any>();
    for (const d of departmentsSource) {
      if (Array.isArray(d.previousNames)) {
        for (const prev of d.previousNames) {
          const normPrev = normalizeQuery(prev);
          const normPrevBase = normalizeQuery(
            String(prev)
              .replace(/\s+department(\s*\([^)]*\))?$/i, '')
              .replace(/^department\s+of\s+/i, '')
          );
          if (normPrev && !activeDeptNamesNorm.has(normPrev)) {
            obsoleteDeptNamesNorm.add(normPrev);
            renamedDeptByOldNorm.set(normPrev, d);
          }
          if (normPrevBase && !activeDeptNamesNorm.has(normPrevBase)) {
            obsoleteDeptNamesNorm.add(normPrevBase);
            obsoleteDeptNamesNorm.add(`${normPrevBase} department`);
            obsoleteDeptNamesNorm.add(`department of ${normPrevBase}`);
            renamedDeptByOldNorm.set(normPrevBase, d);
            renamedDeptByOldNorm.set(`${normPrevBase} department`, d);
            renamedDeptByOldNorm.set(`department of ${normPrevBase}`, d);
          }
        }
      }
    }

    const addEntity = (entity: IndexedEntity) => {
      // STRICT FILTER: Do not index any entity or tag that is not placed on the map
      if (!entity.nodeId || !CAMPUS_GRAPH_MAP.has(entity.nodeId)) return;
      if (seenIds.has(entity.id)) return;
      seenIds.add(entity.id);
      this.entities.push(entity);
      this.entityMap.set(entity.id, entity);

      // 1. Room Code Indexing
      if (entity.canonicalRoomCode) {
        const key = entity.canonicalRoomCode.toLowerCase();
        if (!this.exactRoomCodeMap.has(key)) this.exactRoomCodeMap.set(key, []);
        this.exactRoomCodeMap.get(key)!.push(entity.id);
      }
      if (entity.pureRoomDigits) {
        const key = entity.pureRoomDigits;
        if (!this.pureRoomNumberMap.has(key)) this.pureRoomNumberMap.set(key, []);
        this.pureRoomNumberMap.get(key)!.push(entity.id);
      }

      // 2. Exact Name & Alias Indexing
      const nameKey = entity.normalizedName;
      if (!this.exactNameMap.has(nameKey)) this.exactNameMap.set(nameKey, []);
      this.exactNameMap.get(nameKey)!.push(entity.id);

      for (const a of entity.normalizedAliases) {
        if (!this.exactNameMap.has(a)) this.exactNameMap.set(a, []);
        this.exactNameMap.get(a)!.push(entity.id);
      }

      // 3. Token Inverted Index
      const allTokens = new Set([
        ...entity.nameTokens,
        ...entity.keywords,
        ...entity.normalizedAliases.flatMap((a) => a.split(' ')),
      ]);
      for (const tok of allTokens) {
        if (tok.length < 1) continue;
        if (!this.tokenInvertedIndex.has(tok)) this.tokenInvertedIndex.set(tok, new Set());
        this.tokenInvertedIndex.get(tok)!.add(entity.id);
      }

      // 4. Block Index
      if (entity.blockCode) {
        const bKey = entity.blockCode.toLowerCase();
        if (!this.blockIndex.has(bKey)) this.blockIndex.set(bKey, []);
        this.blockIndex.get(bKey)!.push(entity.id);

        // Cross-alias interchangeable blocks (LF <-> HM)
        if (bKey === 'hm' || bKey === 'lf') {
          const altKey = bKey === 'hm' ? 'lf' : 'hm';
          if (!this.blockIndex.has(altKey)) this.blockIndex.set(altKey, []);
          if (!this.blockIndex.get(altKey)!.includes(entity.id)) {
            this.blockIndex.get(altKey)!.push(entity.id);
          }
        }
      }
    };

    // ─────────────────────────────────────────────────────────
    // 1. Index All 331 Custom Place Tags (User Placed Plaques)
    // ─────────────────────────────────────────────────────────
    const allCustomTags = getAllCustomPlaceTags();
    for (const [nodeId, tags] of Object.entries(allCustomTags)) {
      if (!CAMPUS_GRAPH_MAP.has(nodeId)) continue;
      const node = CAMPUS_GRAPH_MAP.get(nodeId);
      const nodeAreaCode = node?.area ? node.area.toUpperCase() : '';
      const tagBlock = CHRIST_COLLEGE_OFFICIAL_BLOCKS[nodeAreaCode] || detectBlockFromTag(node?.area || '');

      for (const tag of tags || []) {
        let title = (tag.label || tag.text || '').trim();
        if (!title) continue;

        let effectiveNodeId = nodeId;
        const rawNormTitle = normalizeQuery(title);

        // If this tag corresponds to a department that was renamed or moved, use the department's canonical name and node
        const matchedDeptByPlaceId = tag.id ? deptByPlaceIdMap.get(tag.id) : undefined;
        const matchedRenamedDept = renamedDeptByOldNorm.get(rawNormTitle);
        const linkedDept = matchedDeptByPlaceId || matchedRenamedDept;

        if (linkedDept) {
          if (linkedDept.previousNames && linkedDept.previousNames.length > 0 && linkedDept.name) {
            title = linkedDept.placeName || linkedDept.name;
          }
          if (linkedDept.nodeId && CAMPUS_GRAPH_MAP.has(linkedDept.nodeId)) {
            effectiveNodeId = linkedDept.nodeId;
          }
        } else if (obsoleteDeptNamesNorm.has(rawNormTitle)) {
          // Skip stale tag whose name belongs to a renamed department
          continue;
        }

        const normTitle = normalizeQuery(title);
        const normTokens = normTitle.split(' ').filter(Boolean);
        const detectedBlock = detectBlockFromTag(title) || tagBlock;
        const blockCode = detectedBlock?.shortCode || detectedBlock?.code || node?.area || '';

        // Check if tag has room code format (e.g. "AB 12", "AB 06", "SC 14", "MG 11")
        const roomMatch = extractRoomQuery(normTitle);
        const canonicalRoomCode = roomMatch
          ? roomMatch.normalizedCode
          : tag.roomId
          ? normalizeRoomCode(`${blockCode}${tag.roomId}`)
          : undefined;
        const pureRoomDigits = roomMatch
          ? roomMatch.roomDigits
          : tag.roomId
          ? parseInt(tag.roomId, 10).toString()
          : undefined;

        const bldName = detectedBlock
          ? detectedBlock.fullName
          : node?.area
          ? AREA_LABELS[node.area] || node.area
          : 'Campus Block';
        const flrNum = node?.floor ? (parseInt(node.floor, 10) || 0) : 0;
        const flrStr = flrNum === 0 ? 'Ground Floor' : `Floor ${flrNum}`;

        let type: IndexedEntity['type'] = 'PLACE';
        if (tag.category === 'CLASSROOM' || roomMatch) {
          type = 'CLASSROOM';
        } else if (tag.category === 'LAB' || normTitle.includes('lab')) {
          type = 'LAB';
        } else if (tag.category === 'OFFICE' || normTitle.includes('department') || normTitle.includes('office')) {
          type = 'DEPARTMENT';
        } else if (tag.category === 'RESTROOM' || tag.category === 'CANTEEN' || tag.category === 'FACILITY') {
          type = 'FACILITY';
        } else if (tag.category === 'LANDMARK') {
          type = 'BUILDING';
        }

        const isBlockLandmarkTag = Boolean(
          detectedBlock && (
            normTitle === `${detectedBlock.shortCode.toLowerCase()} block` ||
            normTitle === `${detectedBlock.code.toLowerCase()} block` ||
            normTitle === detectedBlock.name.toLowerCase() ||
            normTitle === detectedBlock.fullName.toLowerCase() ||
            detectedBlock.aliases.some((a) => normTitle === a.toLowerCase()) ||
            (type === 'BUILDING' && !roomMatch && !normTitle.includes('office') && !normTitle.includes('hall') && !normTitle.includes('lab'))
          )
        );
        if (isBlockLandmarkTag) {
          continue;
        }

        const aliases: string[] = [];
        if (canonicalRoomCode) {
          aliases.push(canonicalRoomCode.toUpperCase());
          if (roomMatch) {
            aliases.push(`${blockCode} ${roomMatch.roomDigits}`);
            aliases.push(`${blockCode}-${roomMatch.roomDigits}`);
          }
        }
        if (tag.description) aliases.push(tag.description);

        // General Honorific & Title variations (Saint / St / Father / Fr / Hall / Seminar Hall / Dept)
        if (normTitle.includes('saint') || normTitle.includes('st ') || normTitle.startsWith('st ')) {
          const stripped = normTitle.replace(/\b(saint|st)\s+/g, '').trim();
          if (stripped) {
            aliases.push(stripped);
            aliases.push(`st ${stripped}`);
            aliases.push(`saint ${stripped}`);
          }
        }
        if (normTitle.includes('father') || normTitle.includes('fr ') || normTitle.startsWith('fr ')) {
          const stripped = normTitle.replace(/\b(father|fr|rev)\s+/g, '').trim();
          if (stripped) {
            aliases.push(stripped);
            aliases.push(`fr ${stripped}`);
            aliases.push(`father ${stripped}`);
          }
        }
        if (normTitle.includes('hall')) {
          if (!normTitle.includes('seminar hall')) {
            aliases.push(normTitle.replace(/\bhall\b/g, 'seminar hall'));
          } else {
            aliases.push(normTitle.replace(/\bseminar\s+hall\b/g, 'hall'));
          }
        }
        if (normTitle.includes('department') || normTitle.includes('dept')) {
          const strippedDept = normTitle.replace(/\b(department\s+of|dept\s+of|department|dept)\s*/g, '').trim();
          if (strippedDept) {
            aliases.push(strippedDept);
            aliases.push(`${strippedDept} department`);
            aliases.push(`dept of ${strippedDept}`);
            aliases.push(`department of ${strippedDept}`);
          }
        }
        if (normTitle.includes('thekkan') || normTitle.includes('jose thekkan')) {
          aliases.push(
            'Fr. Jose Thekkan Seminar Hall',
            'Thekkan Hall',
            'AC Seminar Hall',
            'Thekkan A/C Seminar Hall',
            'Auditorium Seminar Hall',
            'Jose Thekkan Seminar Hall',
            'Seminar Hall'
          );
        }
        if (normTitle.includes('chavara') && (normTitle.includes('hall') || normTitle.includes('auditorium'))) {
          aliases.push(
            'Chavara Hall',
            'Saint Chavara Hall',
            'St. Chavara Hall',
            'St Chavara Hall',
            'Chavara Seminar Hall',
            'Saint Chavara Seminar Hall'
          );
        }

        if (normTitle.includes('museum')) {
          aliases.push('Museum', 'Natural History Museum', 'Campus Museum', 'History Museum', 'Natural Museum');
        }
        if (normTitle.includes('geology') || normTitle.includes('geoarchaeology')) {
          aliases.push('Geology Lab', 'Geology Department', 'Geo Lab', 'Geology', 'Geoarchaeology', 'Quaternary Research');
        }

        // Restroom & Toilet alias expansion (Gents/Boys, Ladies/Girls, Staff)
        if (tag.category === 'RESTROOM' || normTitle.includes('toilet') || normTitle.includes('washroom') || normTitle.includes('restroom')) {
          const isGents = normTitle.includes('gent') || normTitle.includes('boy') || normTitle.includes('men') || normTitle.includes('male');
          const isLadies = normTitle.includes('lady') || normTitle.includes('ladies') || normTitle.includes('girl') || normTitle.includes('women') || normTitle.includes('female');
          const isStaff = normTitle.includes('staff') || normTitle.includes('faculty') || normTitle.includes('teacher');

          if (isGents) {
            aliases.push(
              'Gents Toilet',
              'Boys Toilet',
              'Boys Washroom',
              'Gents Washroom',
              'Mens Toilet',
              'Male Toilet',
              'Mens Washroom',
              'Gents Restroom',
              'Boys Restroom',
              'Male Washroom',
              'Toilet',
              'Washroom',
              'Restroom'
            );
          }
          if (isLadies) {
            aliases.push(
              'Ladies Toilet',
              'Girls Toilet',
              'Girls Washroom',
              'Ladies Washroom',
              'Womens Toilet',
              'Female Toilet',
              'Womens Washroom',
              'Ladies Restroom',
              'Girls Restroom',
              'Female Washroom',
              'Toilet',
              'Washroom',
              'Restroom'
            );
          }
          if (isStaff) {
            aliases.push(
              'Staff Toilet',
              'Staff Washroom',
              'Staff Restroom',
              'Faculty Toilet',
              'Faculty Washroom',
              'Teachers Toilet',
              'Toilet',
              'Washroom',
              'Restroom'
            );
          }
          if (!isGents && !isLadies && !isStaff) {
            aliases.push('Toilet', 'Washroom', 'Restroom', 'Restrooms', 'Washrooms', 'Toilets');
          }
        }

        const filteredAliases = aliases.filter((a) => !obsoleteDeptNamesNorm.has(normalizeQuery(a)));

        addEntity({
          id: `tag_${tag.id}`,
          type,
          title,
          subtitle: `${bldName} • ${flrStr}${tag.roomId ? ` • Room ${tag.roomId}` : ''}`,
          canonicalName: title,
          normalizedName: normTitle,
          nameTokens: normTokens,
          cleanCompactName: normTitle.replace(/\s+/g, ''),
          roomNumber: tag.roomId || roomMatch?.roomDigits,
          canonicalRoomCode,
          pureRoomDigits,
          blockCode,
          buildingId: detectedBlock ? `bld_${detectedBlock.shortCode.toLowerCase()}` : 'bld_main',
          buildingName: bldName,
          floorNumber: flrNum,
          floorName: flrStr,
          nodeId: effectiveNodeId,
          tagId: tag.id,
          isLocationVerified: true,
          verifiedStatus: 'VERIFIED',
          aliases: filteredAliases,
          normalizedAliases: filteredAliases.map(normalizeQuery),
          keywords: [bldName.toLowerCase(), flrStr.toLowerCase(), (tag.category || '').toLowerCase()],
          category: tag.category || 'OTHER',
        });
      }
    }

    // ─────────────────────────────────────────────────────────
    // 1.5 Index Live Verified Places from Backend Store (placesSource)
    // ─────────────────────────────────────────────────────────
    for (const place of placesSource) {
      if (!place || place.status === 'DISABLED') continue;
      const pNodeId = (place.nodeId || place.panoramaId || '').trim();
      if (!pNodeId || !CAMPUS_GRAPH_MAP.has(pNodeId)) continue;
      const rawPlaceTitle = (place.displayName || place.name || '').trim();
      if (!rawPlaceTitle) continue;
      const normTitle = normalizeQuery(rawPlaceTitle);
      if (obsoleteDeptNamesNorm.has(normTitle)) continue;

      const node = CAMPUS_GRAPH_MAP.get(pNodeId);
      const nodeAreaCode = node?.area ? node.area.toUpperCase() : '';
      const tagBlock = CHRIST_COLLEGE_OFFICIAL_BLOCKS[nodeAreaCode] || detectBlockFromTag(node?.area || '');
      const detectedBlock = detectBlockFromTag(rawPlaceTitle) || tagBlock;
      const blockCode = detectedBlock?.shortCode || detectedBlock?.code || node?.area || '';
      const bldName = place.buildingName || (detectedBlock ? detectedBlock.fullName : 'Campus Block');
      const flrNum = typeof place.floorNumber === 'number' ? place.floorNumber : (node?.floor ? parseInt(node.floor, 10) || 0 : 0);
      const flrStr = place.floorName || (flrNum === 0 ? 'Ground Floor' : `Floor ${flrNum}`);

      const roomMatch = extractRoomQuery(normTitle);
      const canonicalRoomCode = roomMatch
        ? roomMatch.normalizedCode
        : place.roomNumber
        ? normalizeRoomCode(`${blockCode}${place.roomNumber}`)
        : undefined;
      const pureRoomDigits = roomMatch
        ? roomMatch.roomDigits
        : place.roomNumber
        ? parseInt(String(place.roomNumber), 10).toString()
        : undefined;

      let type: IndexedEntity['type'] = 'PLACE';
      const catUpper = String(place.category || '').toUpperCase();
      if (catUpper === 'CLASSROOM' || roomMatch) type = 'CLASSROOM';
      else if (catUpper === 'LAB' || normTitle.includes('lab')) type = 'LAB';
      else if (catUpper === 'DEPARTMENT' || catUpper === 'OFFICE' || normTitle.includes('department')) type = 'DEPARTMENT';
      else if (catUpper === 'RESTROOM' || catUpper === 'FACILITY' || catUpper === 'CANTEEN') type = 'FACILITY';

      const placeAliases = [
        ...(Array.isArray(place.aliases) ? place.aliases : []),
        ...(Array.isArray(place.searchAliases) ? place.searchAliases : []),
      ].filter((a: string) => Boolean(a) && !obsoleteDeptNamesNorm.has(normalizeQuery(a)));

      // Check if an entity already exists from Step 1 (`tag_${place.id}`)
      const existingTagEnt = this.entityMap.get(`tag_${place.id}`) || this.entityMap.get(place.id);
      if (existingTagEnt) {
        existingTagEnt.title = rawPlaceTitle;
        existingTagEnt.canonicalName = rawPlaceTitle;
        existingTagEnt.normalizedName = normTitle;
        existingTagEnt.nameTokens = normTitle.split(' ').filter(Boolean);
        existingTagEnt.cleanCompactName = normTitle.replace(/\s+/g, '');
        existingTagEnt.nodeId = pNodeId;
        for (const al of placeAliases) {
          if (!existingTagEnt.aliases.includes(al)) {
            existingTagEnt.aliases.push(al);
            const normAl = normalizeQuery(al);
            existingTagEnt.normalizedAliases.push(normAl);
            if (!this.exactNameMap.has(normAl)) this.exactNameMap.set(normAl, []);
            this.exactNameMap.get(normAl)!.push(existingTagEnt.id);
          }
        }
        continue;
      }

      addEntity({
        id: place.id.startsWith('tag_') ? place.id : `tag_${place.id}`,
        type,
        title: rawPlaceTitle,
        subtitle: `${bldName} • ${flrStr}${place.roomNumber ? ` • Room ${place.roomNumber}` : ''}`,
        canonicalName: rawPlaceTitle,
        normalizedName: normTitle,
        nameTokens: normTitle.split(' ').filter(Boolean),
        cleanCompactName: normTitle.replace(/\s+/g, ''),
        roomNumber: place.roomNumber || roomMatch?.roomDigits,
        canonicalRoomCode,
        pureRoomDigits,
        blockCode,
        buildingId: place.buildingId || (detectedBlock ? `bld_${detectedBlock.shortCode.toLowerCase()}` : 'bld_main'),
        buildingName: bldName,
        floorNumber: flrNum,
        floorName: flrStr,
        nodeId: pNodeId,
        tagId: place.id,
        isLocationVerified: true,
        verifiedStatus: 'VERIFIED',
        aliases: placeAliases,
        normalizedAliases: placeAliases.map(normalizeQuery),
        keywords: [
          bldName.toLowerCase(),
          flrStr.toLowerCase(),
          catUpper.toLowerCase(),
          ...(Array.isArray(place.keywords) ? place.keywords.map((k: string) => k.toLowerCase()) : []),
        ],
        category: catUpper || 'PLACE',
      });
    }

    // ─────────────────────────────────────────────────────────
    // 2. Academic Metadata Enrichment (No Synthetic Duplicates)
    // ─────────────────────────────────────────────────────────
    for (const cls of (VERIFIED_CLASSROOMS || []) as ClassroomRecord[]) {
      const roomNum = (cls.roomNumber || '').trim();
      if (!roomNum) continue;

      const normRoomCode = normalizeRoomCode(roomNum);
      const existingTagEntityIds = this.exactRoomCodeMap.get(normRoomCode);
      if (existingTagEntityIds && existingTagEntityIds.length > 0) {
        for (const entId of existingTagEntityIds) {
          const ent = this.entityMap.get(entId);
          if (ent) {
            if (cls.name && !ent.aliases.includes(cls.name) && !obsoleteDeptNamesNorm.has(normalizeQuery(cls.name))) {
              ent.aliases.push(cls.name);
              ent.normalizedAliases.push(normalizeQuery(cls.name));
            }
            if (
              cls.department &&
              !ent.keywords.includes(cls.department.toLowerCase()) &&
              !obsoleteDeptNamesNorm.has(normalizeQuery(cls.department))
            ) {
              ent.keywords.push(cls.department.toLowerCase());
            }
          }
        }
      }
    }

    // ─────────────────────────────────────────────────────────
    // 3. Index Authoritative Faculty (277 Records + Live Admin Edits)
    // ─────────────────────────────────────────────────────────
    for (const fac of facultySource) {
      const rawName = (fac.name || '').trim();
      if (!rawName) continue;

      const normName = normalizeQuery(rawName);
      const nameTokens = normName.split(' ').filter(Boolean);

      // Resolve authoritative department if assigned
      const linkedDept = fac.departmentId ? deptByIdMap.get(fac.departmentId) : undefined;
      const deptName = (
        linkedDept?.name ||
        fac.departmentName ||
        fac.department ||
        ''
      ).trim();
      const deptCategory = (
        linkedDept?.category ||
        fac.departmentCategory ||
        deptName.replace(/\s+Department(\s*\([^)]*\))?$/i, '').replace(/^Department\s+of\s+/i, '') ||
        ''
      ).trim();
      const resolvedNodeId = (
        fac.nodeId ||
        linkedDept?.nodeId ||
        fac.departmentPlaceNodeId ||
        ''
      ).trim();
      const resolvedPlaceId = linkedDept?.placeId || fac.departmentPlaceId;
      const resolvedPlaceName = linkedDept?.placeName || fac.departmentPlaceName || deptName;
      const resolvedBuildingName = linkedDept?.buildingName || fac.buildingName;
      const resolvedFloorName = linkedDept?.floorName || fac.floorName;
      const desig = (fac.designation || 'Faculty').trim();

      const aliases: string[] = [];
      const cleanName = rawName.replace(/^(prof\.|dr\.|fr\.|mr\.|ms\.|mrs\.|rev\.)\s+/i, '').trim();
      if (cleanName && cleanName !== rawName) {
        aliases.push(cleanName);
      }
      const initialsCompact = cleanName.replace(/\s*\.\s*/g, '').replace(/\s+/g, ' ');
      if (initialsCompact && !aliases.includes(initialsCompact)) {
        aliases.push(initialsCompact);
      }
      if (deptCategory) {
        aliases.push(`${cleanName} ${deptCategory}`);
        aliases.push(`${deptCategory} ${cleanName}`);
      }
      if (deptName.includes('BVoc')) {
        aliases.push(`${cleanName} BVoc`);
      }

      const filteredAliases = aliases.filter((a) => !obsoleteDeptNamesNorm.has(normalizeQuery(a)));

      const isLocVerified = Boolean(resolvedNodeId && CAMPUS_GRAPH_MAP.has(resolvedNodeId));
      const subtitle = isLocVerified
        ? `${desig} • ${deptName} (📍 ${resolvedPlaceName})`
        : `${desig} • ${deptName}`;

      let facBlockCode: string | undefined = undefined;
      const deptNode = resolvedNodeId;
      if (deptNode.startsWith('ab_')) facBlockCode = 'AB';
      else if (deptNode.startsWith('mg_')) facBlockCode = 'MG';
      else if (deptNode.startsWith('sm_')) facBlockCode = 'SM';
      else if (deptNode.startsWith('sj_')) facBlockCode = 'SJ';
      else if (deptNode.startsWith('sc_')) facBlockCode = 'SC';
      else if (deptNode.startsWith('mt_')) facBlockCode = 'MT';
      else if (deptNode.startsWith('hm_') || deptNode.startsWith('lf_')) facBlockCode = 'HM';
      else if (deptNode.startsWith('sb_')) facBlockCode = 'SB';
      else if (deptNode.startsWith('bba_')) facBlockCode = 'BBA';
      else if (deptNode.startsWith('gb_') || deptNode.startsWith('bpe_')) facBlockCode = 'GB';
      else if (resolvedBuildingName) {
        const bldLower = resolvedBuildingName.toLowerCase();
        if (bldLower.includes('admin')) facBlockCode = 'AB';
        else if (bldLower.includes('goretti') || bldLower.includes('mg')) facBlockCode = 'MG';
        else if (bldLower.includes('mary') || bldLower.includes('sm')) facBlockCode = 'SM';
        else if (bldLower.includes('joseph') || bldLower.includes('sj')) facBlockCode = 'SJ';
        else if (bldLower.includes('chavara') || bldLower.includes('sc') || bldLower.includes('south')) facBlockCode = 'SC';
        else if (bldLower.includes('teresa') || bldLower.includes('mt')) facBlockCode = 'MT';
        else if (bldLower.includes('hotel') || bldLower.includes('flower') || bldLower.includes('hm') || bldLower.includes('lf')) facBlockCode = 'HM';
        else if (bldLower.includes('sneha') || bldLower.includes('sb') || bldLower.includes('bernard')) facBlockCode = 'SB';
        else if (bldLower.includes('bba')) facBlockCode = 'BBA';
        else if (bldLower.includes('general') || bldLower.includes('gb') || bldLower.includes('bpe')) facBlockCode = 'GB';
      }

      const facultyKeywords = [
        deptName.toLowerCase(),
        desig.toLowerCase(),
        deptCategory.toLowerCase(),
      ].filter((kw) => Boolean(kw) && !obsoleteDeptNamesNorm.has(normalizeQuery(kw)));
      if (facBlockCode) {
        facultyKeywords.push(facBlockCode.toLowerCase());
        facultyKeywords.push(`${facBlockCode.toLowerCase()} block`);
      }
      if (resolvedBuildingName) {
        facultyKeywords.push(resolvedBuildingName.toLowerCase());
      }

      const canonicalFacultyId = fac.id ? (fac.id.startsWith('fac_') ? fac.id : `fac_${fac.id}`) : `fac_${Date.now()}`;

      addEntity({
        id: canonicalFacultyId,
        type: 'FACULTY',
        title: rawName,
        subtitle,
        canonicalName: rawName,
        normalizedName: normName,
        nameTokens,
        cleanCompactName: normName.replace(/\s+/g, ''),
        isLocationVerified: isLocVerified,
        verifiedStatus: fac.verifiedStatus || (isLocVerified ? 'VERIFIED' : 'UNVERIFIED'),
        nodeId: isLocVerified ? resolvedNodeId : undefined,
        tagId: isLocVerified ? resolvedPlaceId : undefined,
        facultyId: fac.id,
        honorific: fac.honorific,
        designation: desig,
        departmentName: deptName,
        departmentType: linkedDept?.departmentType || fac.departmentType,
        qualification: fac.qualification,
        officialEmail: fac.officialEmail || fac.email,
        officialPhone: fac.officialPhone || fac.phone,
        profileImageUrl: fac.profileImageUrl,
        profileLink: fac.profileLink || fac.profileUrl,
        vidwanLink: fac.vidwanLink,
        sourceUrl: fac.sourceUrl,
        locationStatusNote: isLocVerified
          ? undefined
          : 'Department location not yet mapped. Contact department office for directions.',
        buildingName: resolvedBuildingName || undefined,
        floorName: resolvedFloorName || undefined,
        blockCode: facBlockCode,
        aliases: filteredAliases,
        normalizedAliases: filteredAliases.map(normalizeQuery),
        keywords: facultyKeywords,
        category: 'FACULTY',
      });
    }

    // ─────────────────────────────────────────────────────────
    // 4. Index Authoritative Departments (38+ Records + Live Admin Edits)
    // ─────────────────────────────────────────────────────────
    for (const d of departmentsSource) {
      const dName = (d.name || '').trim();
      if (!dName) continue;

      const normName = normalizeQuery(dName);
      const nameTokens = normName.split(' ').filter(Boolean);
      const isLocVerified = Boolean(d.nodeId && CAMPUS_GRAPH_MAP.has(d.nodeId));

      const aliases: string[] = [];
      if (d.code) aliases.push(d.code);
      if (d.category) aliases.push(d.category);
      const shortName = dName.replace(/\bdepartment\b/i, '').trim();
      if (shortName && shortName !== dName) aliases.push(shortName);
      if (normName.includes('computer science')) aliases.push('CS', 'Comp Sci', 'CS Dept');
      if (normName.includes('chemistry')) aliases.push('Chem', 'Chem Dept');
      if (normName.includes('vocational studies') || normName.includes('bvoc')) aliases.push('BVoc', 'B.Voc', 'Vocational');
      if (normName.includes('mathematics')) aliases.push('Maths', 'Math', 'Mathematics');
      if (normName.includes('physics')) aliases.push('Physics', 'Phy');
      if (normName.includes('botany')) aliases.push('Botany', 'Bot');
      if (normName.includes('zoology')) aliases.push('Zoology', 'Zoo');
      if (normName.includes('commerce')) aliases.push('Commerce', 'BCom', 'MCom');
      if (normName.includes('hotel management') || normName.includes('catering')) {
        aliases.push('Hotel Management', 'HM', 'HM Dept', 'LF', 'LF Dept', 'Little Flower');
      }
      if (normName.includes('food technology')) {
        aliases.push('Food Tech', 'FT', 'Food Technology Dept');
      }
      if (normName.includes('french')) {
        aliases.push('French Dept');
      }

      const filteredDeptAliases = aliases.filter((a) => !obsoleteDeptNamesNorm.has(normalizeQuery(a)));

      let deptBlockCode: string | undefined = undefined;
      const deptNodeId = (d.nodeId || '').toLowerCase();
      if (deptNodeId.startsWith('ab_')) deptBlockCode = 'AB';
      else if (deptNodeId.startsWith('mg_')) deptBlockCode = 'MG';
      else if (deptNodeId.startsWith('sm_')) deptBlockCode = 'SM';
      else if (deptNodeId.startsWith('sj_')) deptBlockCode = 'SJ';
      else if (deptNodeId.startsWith('sc_')) deptBlockCode = 'SC';
      else if (deptNodeId.startsWith('mt_')) deptBlockCode = 'MT';
      else if (deptNodeId.startsWith('hm_') || deptNodeId.startsWith('lf_')) deptBlockCode = 'HM';
      else if (deptNodeId.startsWith('sb_')) deptBlockCode = 'SB';
      else if (deptNodeId.startsWith('bba_')) deptBlockCode = 'BBA';
      else if (deptNodeId.startsWith('gb_') || deptNodeId.startsWith('bpe_')) deptBlockCode = 'GB';
      else if (d.buildingName) {
        const bldLower = d.buildingName.toLowerCase();
        if (bldLower.includes('admin')) deptBlockCode = 'AB';
        else if (bldLower.includes('goretti') || bldLower.includes('mg')) deptBlockCode = 'MG';
        else if (bldLower.includes('mary') || bldLower.includes('sm')) deptBlockCode = 'SM';
        else if (bldLower.includes('joseph') || bldLower.includes('sj')) deptBlockCode = 'SJ';
        else if (bldLower.includes('chavara') || bldLower.includes('sc') || bldLower.includes('south')) deptBlockCode = 'SC';
        else if (bldLower.includes('teresa') || bldLower.includes('mt')) deptBlockCode = 'MT';
        else if (bldLower.includes('hotel') || bldLower.includes('flower') || bldLower.includes('hm') || bldLower.includes('lf')) deptBlockCode = 'HM';
        else if (bldLower.includes('sneha') || bldLower.includes('sb') || bldLower.includes('bernard')) deptBlockCode = 'SB';
        else if (bldLower.includes('bba')) deptBlockCode = 'BBA';
        else if (bldLower.includes('general') || bldLower.includes('gb') || bldLower.includes('bpe')) deptBlockCode = 'GB';
      }

      const deptKeywords = ['department', 'dept', (d.category || '').toLowerCase(), (d.departmentType || '').toLowerCase()].filter(
        (kw) => Boolean(kw) && !obsoleteDeptNamesNorm.has(normalizeQuery(kw))
      );
      if (deptBlockCode) {
        deptKeywords.push(deptBlockCode.toLowerCase());
        deptKeywords.push(`${deptBlockCode.toLowerCase()} block`);
        if (deptBlockCode === 'HM' || deptBlockCode === 'LF') {
          deptKeywords.push('lf', 'lf block', 'little flower', 'little flower block', 'hotel management', 'hotel management block');
          if (!filteredDeptAliases.includes('LF Block')) filteredDeptAliases.push('LF Block');
          if (!filteredDeptAliases.includes('Little Flower Block')) filteredDeptAliases.push('Little Flower Block');
          if (!filteredDeptAliases.includes('Hotel Management Block')) filteredDeptAliases.push('Hotel Management Block');
        } else if (deptBlockCode === 'GB' || deptBlockCode === 'BPE') {
          deptKeywords.push('bpe', 'bpe block', 'general block');
          if (!filteredDeptAliases.includes('BPE Block')) filteredDeptAliases.push('BPE Block');
          if (!filteredDeptAliases.includes('General Block')) filteredDeptAliases.push('General Block');
        }
      }
      if (d.buildingName) {
        deptKeywords.push(d.buildingName.toLowerCase());
      }

      // Always add canonical department entity (`dept_${d.id}`) and enrich any matching physical tag
      const existingDeptEntity = this.entities.find(
        (e) =>
          (e.type === 'DEPARTMENT' || e.category === 'DEPARTMENT') &&
          (e.normalizedName === normName || e.cleanCompactName === normName.replace(/\s+/g, '') || (d.placeId && e.tagId === d.placeId))
      );
      if (existingDeptEntity) {
        existingDeptEntity.title = dName;
        existingDeptEntity.canonicalName = dName;
        existingDeptEntity.normalizedName = normName;
        existingDeptEntity.nameTokens = nameTokens;
        existingDeptEntity.cleanCompactName = normName.replace(/\s+/g, '');
        if (isLocVerified && d.nodeId) {
          existingDeptEntity.nodeId = d.nodeId;
        }
        if (!this.exactNameMap.has(normName)) this.exactNameMap.set(normName, []);
        if (!this.exactNameMap.get(normName)!.includes(existingDeptEntity.id)) {
          this.exactNameMap.get(normName)!.push(existingDeptEntity.id);
        }
        for (const tok of nameTokens) {
          if (!this.tokenInvertedIndex.has(tok)) this.tokenInvertedIndex.set(tok, new Set());
          this.tokenInvertedIndex.get(tok)!.add(existingDeptEntity.id);
        }
        for (const a of filteredDeptAliases) {
          if (!existingDeptEntity.aliases.includes(a)) {
            existingDeptEntity.aliases.push(a);
            const normA = normalizeQuery(a);
            existingDeptEntity.normalizedAliases.push(normA);
            if (!this.exactNameMap.has(normA)) this.exactNameMap.set(normA, []);
            if (!this.exactNameMap.get(normA)!.includes(existingDeptEntity.id)) {
              this.exactNameMap.get(normA)!.push(existingDeptEntity.id);
            }
          }
        }
        for (const kw of deptKeywords) {
          if (!existingDeptEntity.keywords.includes(kw)) {
            existingDeptEntity.keywords.push(kw);
          }
        }
      }

      addEntity({
        id: d.id.startsWith('dept_') ? d.id : `dept_${d.id}`,
        type: 'DEPARTMENT',
        title: dName,
        subtitle: isLocVerified
          ? `${d.departmentType || 'Aided'} • 📍 ${d.placeName || dName} (${d.buildingName || 'Campus'})`
          : `${d.departmentType || 'Aided'} • Location not yet mapped`,
        canonicalName: dName,
        normalizedName: normName,
        nameTokens,
        cleanCompactName: normName.replace(/\s+/g, ''),
        nodeId: isLocVerified ? d.nodeId : undefined,
        tagId: isLocVerified ? d.placeId : undefined,
        isLocationVerified: isLocVerified,
        verifiedStatus: isLocVerified ? 'VERIFIED' : 'UNVERIFIED',
        buildingName: d.buildingName,
        floorName: d.floorName,
        blockCode: deptBlockCode,
        aliases: filteredDeptAliases,
        normalizedAliases: filteredDeptAliases.map(normalizeQuery),
        keywords: deptKeywords,
        category: 'DEPARTMENT',
      });
    }

    // ─────────────────────────────────────────────────────────
    // 5. Index Official Campus Blocks & Buildings (Unique Blocks)
    // ─────────────────────────────────────────────────────────
    const seenBlockFullNames = new Set<string>();
    for (const [code, block] of Object.entries(CHRIST_COLLEGE_OFFICIAL_BLOCKS)) {
      if (seenBlockFullNames.has(block.fullName)) continue;
      seenBlockFullNames.add(block.fullName);

      const normName = normalizeQuery(block.fullName);
      const nameTokens = normName.split(' ').filter(Boolean);

      // Dedicated entrance node mapping
      let entranceNodeId = 'outdoor_001';
      if (code === 'AB') entranceNodeId = 'ab_044';
      else if (code === 'SC') entranceNodeId = 'outdoor_203';
      else if (code === 'MG') entranceNodeId = 'outdoor_269';
      else if (code === 'SM') entranceNodeId = 'outdoor_240';
      else if (code === 'SJ') entranceNodeId = 'outdoor_191';
      else if (code === 'MT') entranceNodeId = 'outdoor_143';
      else if (code === 'GB') entranceNodeId = 'bba_364';
      else if (code === 'SB') entranceNodeId = 'sb_437';
      else if (code === 'BPE') entranceNodeId = 'outdoor_323';
      else if (code === 'HM' || code === 'LF') entranceNodeId = 'hm_465';
      else if (code === 'BBA') entranceNodeId = 'bba_371';

      const aliases = [
        code,
        block.shortCode,
        block.name,
        `${block.shortCode} Block`,
        `${code} Block`,
        ...block.aliases,
      ];

      addEntity({
        id: `bld_${code.toLowerCase()}`,
        type: 'BUILDING',
        title: block.fullName,
        subtitle: `Main Campus Academic Block • Entrance: Node ${entranceNodeId}`,
        canonicalName: block.fullName,
        normalizedName: normName,
        nameTokens,
        cleanCompactName: normName.replace(/\s+/g, ''),
        blockCode: code,
        buildingId: `bld_${code.toLowerCase()}`,
        buildingName: block.fullName,
        nodeId: entranceNodeId,
        isLocationVerified: true,
        verifiedStatus: 'VERIFIED',
        aliases,
        normalizedAliases: aliases.map(normalizeQuery),
        keywords: ['building', 'block', 'academic block', 'campus', code.toLowerCase()],
        category: 'BUILDING',
      });
    }

    // ─────────────────────────────────────────────────────────
    // 6. Enrich POIs, Libraries, Auditoriums & Facilities
    // ─────────────────────────────────────────────────────────
    for (const poi of CAMPUS_PLACES as CampusPlace[]) {
      const normName = normalizeQuery(poi.name);
      if (obsoleteDeptNamesNorm.has(normName)) continue;
      const aliases = [...(poi.aliases || [])].filter((a) => !obsoleteDeptNamesNorm.has(normalizeQuery(a)));
      if (normName.includes('library')) aliases.push('Library', 'Reading Room', 'Reference', 'Central Library');
      if (normName.includes('auditorium')) aliases.push('Auditorium', 'College Hall', 'Main Stage');
      if (normName.includes('canteen')) aliases.push('Canteen', 'Cafeteria', 'Mess', 'Food', 'College Canteen');

      const existingEntitiesOnNode = this.entities.filter(
        (ent) => ent.nodeId === poi.panoramaNodeId && ent.id.startsWith('tag_')
      );
      const existingEntityByName = this.entities.find(
        (ent) => ent.normalizedName === normName && ent.id.startsWith('tag_')
      );

      const targetEntity = existingEntityByName || (existingEntitiesOnNode.length > 0 ? existingEntitiesOnNode[0] : null);

      if (targetEntity) {
        for (const alias of aliases) {
          if (!targetEntity.aliases.includes(alias)) {
            targetEntity.aliases.push(alias);
            const normAlias = normalizeQuery(alias);
            targetEntity.normalizedAliases.push(normAlias);
            if (!this.exactNameMap.has(normAlias)) this.exactNameMap.set(normAlias, []);
            if (!this.exactNameMap.get(normAlias)!.includes(targetEntity.id)) {
              this.exactNameMap.get(normAlias)!.push(targetEntity.id);
            }
          }
        }
        for (const kw of [poi.category.toLowerCase(), poi.subCategory.toLowerCase(), (poi.notes || '').toLowerCase()]) {
          if (kw && !targetEntity.keywords.includes(kw) && !obsoleteDeptNamesNorm.has(normalizeQuery(kw))) {
            targetEntity.keywords.push(kw);
          }
        }
      }
    }

    this.isIndexed = true;
  }

  /**
   * Central canonical search function executing multi-tier scoring.
   */
  public search(rawQuery: string, options: SearchOptions = {}): SearchEngineResult {
    const startTime = performance.now();
    if (!this.isIndexed) this.buildIndex();

    const normalizedQuery = normalizeQuery(rawQuery);
    const queryBlockCode = detectBlockQuery(normalizedQuery);
    const defaultLimit = queryBlockCode && options.category && options.category !== 'ALL' ? 100 : 30;
    const limit = options.limit || defaultLimit;
    const categoryFilter = options.category || 'ALL';
    if (!normalizedQuery) {
      if (categoryFilter !== 'ALL') {
        const matchingEntities = this.entities.filter((ent) => isEntityMatchingCategory(ent, categoryFilter));

        // Deterministic sort: verified locations first, then alphabetical by canonicalName
        matchingEntities.sort((a, b) => {
          if (a.isLocationVerified !== b.isLocationVerified) {
            return a.isLocationVerified ? -1 : 1;
          }
          return a.canonicalName.localeCompare(b.canonicalName);
        });

        const matches: SearchResult[] = [];
        const seenKeys = new Set<string>();
        const seenBlocks = new Set<string>();

        for (const ent of matchingEntities) {
          // 1. Deduplicate by Block for buildings (only 1 result per campus block!)
          if (ent.type === 'BUILDING' || ent.category === 'BUILDING') {
            const rawCode = (ent.blockCode || ent.buildingId || ent.canonicalName)
              .toUpperCase()
              .replace(/^BLD_/, '');
            const blockKey = (rawCode === 'LF' || rawCode === 'HM')
              ? 'HM'
              : (rawCode === 'GB' || rawCode === 'BPE')
              ? 'GB'
              : rawCode;
            if (blockKey) {
              if (seenBlocks.has(blockKey)) continue;
              seenBlocks.add(blockKey);
            }
          }

          // 2. Deduplicate identical titles (e.g. identical department, facility, or room tags)
          const normTitleKey = normalizeQuery(ent.canonicalName || ent.title);
          const dedupeKey = ent.pureRoomDigits
            ? `${ent.type}___${ent.blockCode || ''}___${ent.pureRoomDigits}`
            : `${ent.type}___${normTitleKey}`;

          if (seenKeys.has(dedupeKey)) continue;
          seenKeys.add(dedupeKey);

          matches.push(mapEntityToSearchResult(ent, 1000));
          if (matches.length >= limit) break;
        }

        return {
          query: rawQuery,
          normalizedQuery: '',
          matches,
          bestMatch: matches[0] || null,
          didYouMean: null,
          grouped: groupSearchResults(matches),
        };
      }

      return {
        query: rawQuery,
        normalizedQuery: '',
        matches: [],
        bestMatch: null,
        didYouMean: null,
        grouped: { rooms: [], faculty: [], departments: [], buildings: [], labs: [], facilities: [], other: [] },
      };
    }

    const qTokens = normalizedQuery.split(' ').filter(Boolean);
    const compactQ = normalizedQuery.replace(/\s+/g, '');
    const roomQuery = extractRoomQuery(normalizedQuery);

    // Candidates map: entityId -> score
    const candidateScores = new Map<string, { score: number; matchType: string }>();

    // Helper to score an entity
    const recordScore = (id: string, score: number, matchType: string) => {
      const existing = candidateScores.get(id);
      if (!existing || score > existing.score) {
        candidateScores.set(id, { score, matchType });
      }
    };

    // ─────────────────────────────────────────────────────────
    // TIER 1: DEDICATED ROOM NUMBER / ROOM CODE MATCHING
    // (Score: 15,000 - Guaranteed to dominate blocks)
    // ─────────────────────────────────────────────────────────
    if (roomQuery) {
      // 1.1 Match exact normalized room code (e.g. "ab13", "sc482", "mg211", "sm153", "sj141")
      const exactCodeMatches = this.exactRoomCodeMap.get(roomQuery.normalizedCode);
      if (exactCodeMatches) {
        for (const id of exactCodeMatches) {
          recordScore(id, 15000, 'EXACT_ROOM_CODE');
        }
      }

      // 1.2 Pure number query (e.g. user typed "13" -> matches AB 13, MG 13, SM 13)
      if (roomQuery.pureNumberOnly) {
        const numberMatches = this.pureRoomNumberMap.get(roomQuery.roomDigits);
        if (numberMatches) {
          for (const id of numberMatches) {
            recordScore(id, 12000, 'EXACT_ROOM_NUMBER');
          }
        }
      } else {
        // If user typed "AB 13", boost entities in block "AB" with room "13"
        const blockEntities = this.blockIndex.get(roomQuery.blockPrefix);
        if (blockEntities) {
          for (const id of blockEntities) {
            const ent = this.entityMap.get(id);
            if (ent && ent.pureRoomDigits === roomQuery.roomDigits) {
              recordScore(id, 14500, 'BLOCK_ROOM_MATCH');
            }
          }
        }
      }
    }

    // ─────────────────────────────────────────────────────────
    // TIER 2: EXACT NAME & CONFIGURED ALIAS MATCHING
    // (Score: 10,000 - 8,000)
    // ─────────────────────────────────────────────────────────
    const exactNameMatches = this.exactNameMap.get(normalizedQuery);
    if (exactNameMatches) {
      for (const id of exactNameMatches) {
        const ent = this.entityMap.get(id);
        const score = ent?.type === 'FACULTY' ? 10000 : 9500;
        recordScore(id, score, 'EXACT_NAME');
      }
    }

    // Compact match (e.g. "francy tl" matches "francy t. l.", "bvoc" matches "vocational studies")
    const compactMatches = this.exactNameMap.get(compactQ);
    if (compactMatches) {
      for (const id of compactMatches) {
        recordScore(id, 9200, 'EXACT_COMPACT_NAME');
      }
    }

    // ─────────────────────────────────────────────────────────
    // TIER 2.5: DEDICATED BLOCK / BUILDING RECOGNITION
    // When user searches a block (e.g. "MG Block", "AB Block", "Admin Block", "Sneha Bhavan"):
    // 1. Boost the main building entity to 9,800
    // 2. Boost matching rooms, departments, labs, and places in that block to 7,500 - 8,500
    // 3. For 'ALL' search, avoid polluting results with dozens of generic faculty members
    // ─────────────────────────────────────────────────────────
    if (queryBlockCode) {
      for (const ent of this.entities) {
        // Main Building / Block entity
        if (
          (ent.type === 'BUILDING' || ent.category === 'BUILDING') &&
          areBlockCodesMatching(ent.blockCode, queryBlockCode)
        ) {
          recordScore(ent.id, 9800, 'EXACT_BLOCK_BUILDING');
        } else if (
          categoryFilter === 'ALL' &&
          ent.type !== 'FACULTY' &&
          (areBlockCodesMatching(ent.blockCode, queryBlockCode) ||
            (ent.buildingId && (
              ent.buildingId.toUpperCase() === `BLD_${queryBlockCode.toUpperCase()}` ||
              ((queryBlockCode === 'LF' || queryBlockCode === 'HM') && (ent.buildingId.toUpperCase() === 'BLD_HM' || ent.buildingId.toUpperCase() === 'BLD_LF'))
            )))
        ) {
          // Places, rooms, labs, and departments in this block
          const isDeptOrKeyPlace = ent.type === 'DEPARTMENT' || ent.category === 'DEPARTMENT' || ent.category === 'FACILITIES';
          const placeScore = isDeptOrKeyPlace ? 8400 : 7800;
          recordScore(ent.id, placeScore, 'BLOCK_PLACE_MATCH');
        }
      }
    }

    // ─────────────────────────────────────────────────────────
    // TIER 3: MULTI-TOKEN CANDIDATE SEARCH & FIELD WEIGHTING
    // ─────────────────────────────────────────────────────────
    // Find candidate entities that contain at least one query token
    const candidateEntityIds = new Set<string>();
    for (const tok of qTokens) {
      const matchingIds = this.tokenInvertedIndex.get(tok);
      if (matchingIds) {
        for (const id of matchingIds) candidateEntityIds.add(id);
      }
    }

    // Token prefix matching (1 letter or more)
    for (const [tok, idSet] of this.tokenInvertedIndex.entries()) {
      for (const qTok of qTokens) {
        if (qTok.length >= 1 && tok.startsWith(qTok)) {
          for (const id of idSet) candidateEntityIds.add(id);
        }
      }
    }

    // Comprehensive prefix and substring scan across all entities for partial words & letters
    for (const ent of this.entities) {
      if (
        ent.normalizedName.startsWith(normalizedQuery) ||
        ent.cleanCompactName.startsWith(compactQ) ||
        (ent.blockCode && ent.blockCode.toLowerCase().startsWith(normalizedQuery)) ||
        ent.normalizedAliases.some((a) => a.startsWith(normalizedQuery))
      ) {
        candidateEntityIds.add(ent.id);
      } else if (normalizedQuery.length >= 2) {
        if (
          ent.normalizedName.includes(normalizedQuery) ||
          ent.cleanCompactName.includes(compactQ) ||
          ent.normalizedAliases.some((a) => a.includes(normalizedQuery))
        ) {
          candidateEntityIds.add(ent.id);
        }
      }
    }

    for (const id of candidateEntityIds) {
      const ent = this.entityMap.get(id);
      if (!ent) continue;

      // In general ('ALL') search for block queries, exclude faculty whose names were not explicitly typed
      if (queryBlockCode && categoryFilter === 'ALL' && ent.type === 'FACULTY') {
        const hasNameMatch = qTokens.some((qt) =>
          ent.nameTokens.some((nt) => nt === qt || (qt.length >= 2 && nt.startsWith(qt)))
        );
        if (!hasNameMatch) continue;
      }

      let score = 0;
      let matchType = 'TOKEN_MATCH';

      // Check how many query tokens match entity name
      const matchingNameTokens = qTokens.filter((qt) =>
        ent.nameTokens.some((nt) => nt === qt || (qt.length >= 1 && nt.startsWith(qt)))
      ).length;

      const matchingKeywordTokens = qTokens.filter((qt) =>
        ent.keywords.some((kw) => kw.includes(qt))
      ).length;

      // All query tokens matched entity name
      if (matchingNameTokens === qTokens.length) {
        score = 7500;
        matchType = 'ALL_TOKENS_NAME';
      } else if (matchingNameTokens + matchingKeywordTokens >= qTokens.length) {
        if (ent.type === 'FACULTY' && matchingNameTokens === 0) {
          score = 0;
        } else {
          score = 6000;
          matchType = 'ALL_TOKENS_COMBINED';
        }
      } else if (matchingNameTokens > 0) {
        score = 3000 + (matchingNameTokens / qTokens.length) * 2000;
      }

      // Strong Prefix match on entity canonical name
      if (ent.normalizedName.startsWith(normalizedQuery)) {
        score = Math.max(score, 4500);
        matchType = 'PREFIX_MATCH';
      } else if (ent.cleanCompactName.startsWith(compactQ)) {
        score = Math.max(score, 4200);
        matchType = 'COMPACT_PREFIX_MATCH';
      }

      // Substring match on canonical name
      if (normalizedQuery.length >= 2) {
        if (ent.normalizedName.includes(normalizedQuery)) {
          score = Math.max(score, 4000);
          matchType = 'SUBSTRING_MATCH';
        } else if (ent.cleanCompactName.includes(compactQ)) {
          score = Math.max(score, 3900);
          matchType = 'COMPACT_SUBSTRING_MATCH';
        }
      }

      // Alias match
      if (ent.normalizedAliases.some((a) => a === normalizedQuery || a.startsWith(normalizedQuery))) {
        score = Math.max(score, 3800);
        matchType = 'ALIAS_MATCH';
      } else if (normalizedQuery.length >= 2 && ent.normalizedAliases.some((a) => a.includes(normalizedQuery))) {
        score = Math.max(score, 3700);
        matchType = 'ALIAS_SUBSTRING_MATCH';
      }

      if (score > 0) {
        recordScore(id, score, matchType);
      }
    }

    // ─────────────────────────────────────────────────────────
    // TIER 4: TYPO TOLERANCE (DAMERAU-LEVENSHTEIN FUZZY MATCH)
    // (Score: 1,200 - 1,800. Restricted: strictly disallowed on room codes)
    // ─────────────────────────────────────────────────────────
    let detectedDidYouMean: string | null = null;
    let bestFuzzyDistance = 99;

    // Only apply fuzzy if no high-confidence exact match was found, and query is long enough
    const highestCurrentScore = Math.max(0, ...Array.from(candidateScores.values()).map((v) => v.score));
    const shouldRunFuzzy = highestCurrentScore < 6000 && normalizedQuery.length >= 4 && !roomQuery;

    if (shouldRunFuzzy) {
      for (const ent of this.entities) {
        // Skip pure room number codes from aggressive autocorrect
        if (ent.canonicalRoomCode && ent.canonicalRoomCode.length <= 5) continue;

        // Check distance to entity name, individual name tokens, or primary alias
        const targets = [
          ent.normalizedName,
          ...(ent.nameTokens || []).filter((t) => t.length >= 4),
          ...ent.normalizedAliases.slice(0, 2),
        ];

        for (const target of targets) {
          if (target.length < 4) continue;
          const dist = damerauLevenshteinDistance(normalizedQuery, target);
          const maxAllowedDist = target.length <= 6 ? 1 : 2;

          if (dist <= maxAllowedDist) {
            const fuzzyScore = 1800 - dist * 300;
            recordScore(ent.id, fuzzyScore, 'FUZZY_TYPO');
            if (dist < bestFuzzyDistance) {
              bestFuzzyDistance = dist;
              detectedDidYouMean = ent.canonicalName;
            }
          }
        }
      }
    }

    // ─────────────────────────────────────────────────────────
    // TIER 5: CRITICAL SAFETY FILTERS & CONTEXTUAL BLOCK FILTERING
    // ─────────────────────────────────────────────────────────
    // If user explicitly searched a room code (e.g. "AB12", "AB 18", "12"):
    // ONLY entities that actually match this room number/code are allowed.
    // Never dump random rooms from the block just because the block matched!
    if (roomQuery) {
      for (const [id] of candidateScores.entries()) {
        const ent = this.entityMap.get(id);
        if (!ent) {
          candidateScores.delete(id);
          continue;
        }

        // 1. Never return the generic Building/Block when user searched a specific room
        if (ent.type === 'BUILDING') {
          candidateScores.delete(id);
          continue;
        }

        // 2. If user specified a block (e.g. "AB 12"), discard any entity not in that block
        if (!roomQuery.pureNumberOnly && ent.blockCode && !areBlockCodesMatching(ent.blockCode, roomQuery.blockPrefix)) {
          candidateScores.delete(id);
          continue;
        }

        // 3. Strict Room Number Matching:
        // If the entity has room digits or is a room/classroom/lab, its digits MUST match roomQuery.roomDigits
        if (ent.pureRoomDigits) {
          if (ent.pureRoomDigits !== roomQuery.roomDigits) {
            candidateScores.delete(id);
            continue;
          }
        } else if (ent.canonicalRoomCode) {
          if (ent.canonicalRoomCode !== roomQuery.normalizedCode) {
            candidateScores.delete(id);
            continue;
          }
        } else {
          // If entity doesn't have pureRoomDigits (e.g. a specific lab or faculty or office),
          // only keep if its title or tokens explicitly match the room number
          const matchesExplicitly =
            (ent.nameTokens && ent.nameTokens.includes(roomQuery.roomDigits)) ||
            ent.normalizedName.includes(roomQuery.normalizedCode) ||
            ent.normalizedName.includes(`${roomQuery.blockPrefix} ${roomQuery.roomDigits}`);
          if (!matchesExplicitly) {
            candidateScores.delete(id);
            continue;
          }
        }
      }
    }

    // Contextual Block Filtering:
    // If query matches a block (e.g. "AB Block") and categoryFilter is set (e.g. "FACULTY", "ROOMS", "LABS"),
    // populate candidates strictly belonging to that block and matching that category.
    if (queryBlockCode && categoryFilter !== 'ALL') {
      candidateScores.clear();
      for (const ent of this.entities) {
        if (!isEntityMatchingCategory(ent, categoryFilter)) continue;
        const matchesBlock =
          (ent.blockCode && areBlockCodesMatching(ent.blockCode, queryBlockCode)) ||
          (ent.buildingId && (
            ent.buildingId.toUpperCase() === `BLD_${queryBlockCode.toUpperCase()}` ||
            ((queryBlockCode === 'LF' || queryBlockCode === 'HM') && (ent.buildingId.toUpperCase() === 'BLD_HM' || ent.buildingId.toUpperCase() === 'BLD_LF'))
          ));

        if (matchesBlock) {
          const score = ent.isLocationVerified ? 10000 : 8500;
          recordScore(ent.id, score, 'BLOCK_CONTEXTUAL_MATCH');
        }
      }
    }

    // ─────────────────────────────────────────────────────────
    // TIER 3.5: NEAREST RESTROOM / TOILET PROXIMITY ENGINE
    // When searching for toilets/washrooms (e.g. "gents toilet", "boys toilet", "ladies toilet"),
    // calculate actual routing distance from user's current location so the nearest one is #1.
    // ─────────────────────────────────────────────────────────
    const isRestroomQuery =
      normalizedQuery.includes('toilet') ||
      normalizedQuery.includes('washroom') ||
      normalizedQuery.includes('restroom') ||
      normalizedQuery.includes('latrine') ||
      normalizedQuery.includes('urinal') ||
      normalizedQuery.includes('bathroom') ||
      normalizedQuery === 'wc' ||
      normalizedQuery === 'gent' ||
      normalizedQuery === 'gents' ||
      normalizedQuery === 'lady' ||
      normalizedQuery === 'ladies' ||
      normalizedQuery === 'boy' ||
      normalizedQuery === 'boys' ||
      normalizedQuery === 'girl' ||
      normalizedQuery === 'girls';

    const isGentsQuery =
      normalizedQuery.includes('gent') ||
      normalizedQuery.includes('boy') ||
      normalizedQuery.includes('men') ||
      normalizedQuery.includes('male');

    const isLadiesQuery =
      normalizedQuery.includes('lady') ||
      normalizedQuery.includes('ladies') ||
      normalizedQuery.includes('girl') ||
      normalizedQuery.includes('women') ||
      normalizedQuery.includes('female');

    const isStaffQuery =
      normalizedQuery.includes('staff') ||
      normalizedQuery.includes('faculty') ||
      normalizedQuery.includes('teacher');

    const restroomDistances = new Map<string, number>();

    if (isRestroomQuery) {
      const userStartNode = options.currentNodeId || 'outdoor_001';

      // Evaluate every restroom entity across campus
      for (const ent of this.entities) {
        const isRestroomEntity =
          ent.category === 'RESTROOM' ||
          ent.normalizedName.includes('toilet') ||
          ent.normalizedName.includes('washroom') ||
          ent.normalizedName.includes('restroom');

        if (!isRestroomEntity || !ent.nodeId) continue;

        const entNorm = ent.normalizedName;
        const isGentsEnt = entNorm.includes('gent') || entNorm.includes('boy') || entNorm.includes('men') || entNorm.includes('male');
        const isLadiesEnt = entNorm.includes('lady') || entNorm.includes('ladies') || entNorm.includes('girl') || entNorm.includes('women') || entNorm.includes('female');
        const isStaffEnt = entNorm.includes('staff') || entNorm.includes('faculty') || entNorm.includes('teacher');

        // Apply strict gender filter if user specifically asked for gents/boys or ladies/girls
        if (isGentsQuery && !isGentsEnt) continue;
        if (isLadiesQuery && !isLadiesEnt) continue;
        if (isStaffQuery && !isStaffEnt) continue;

        // Calculate actual walking path distance
        const route = findNavigationRoute(userStartNode, ent.nodeId);
        const dist = route ? (route.totalDistanceMeters || route.totalWalkingCost || 0) : 9999;
        restroomDistances.set(ent.id, dist);

        // Nearest toilet gets highest score (up to 35,000)
        const proximityScore = Math.max(1500, 35000 - Math.round(dist * 15));
        recordScore(ent.id, proximityScore, 'NEAREST_RESTROOM_PROXIMITY');
      }
    }

    // ─────────────────────────────────────────────────────────
    // DEDUPLICATION & CANONICAL RESULT MAPPING
    // ─────────────────────────────────────────────────────────
    const scoredList = Array.from(candidateScores.entries()).map(([id, val]) => ({
      entity: this.entityMap.get(id)!,
      score: val.score,
      matchType: val.matchType,
    }));

    // Filter by Category if specified
    const filteredList = scoredList.filter((item) => {
      return isEntityMatchingCategory(item.entity, categoryFilter);
    });

    // Deterministic Sorting & Tie-Breaking
    filteredList.sort((a, b) => {
      // 1. Primary: Score descending
      if (b.score !== a.score) return b.score - a.score;
      // 2. Verified locations prioritized
      if (b.entity.isLocationVerified !== a.entity.isLocationVerified) {
        return b.entity.isLocationVerified ? 1 : -1;
      }
      // 3. Length closeness to query
      const diffA = Math.abs(a.entity.normalizedName.length - normalizedQuery.length);
      const diffB = Math.abs(b.entity.normalizedName.length - normalizedQuery.length);
      if (diffA !== diffB) return diffA - diffB;
      // 4. Alphabetical tie-break
      return a.entity.canonicalName.localeCompare(b.entity.canonicalName);
    });

    // Map to canonical SearchResult items
    const matches: SearchResult[] = [];
    const seenKeys = new Set<string>();
    const seenBlocks = new Set<string>();

    for (const item of filteredList) {
      const ent = item.entity;

      // 1. Deduplicate multiple building / block landmarks for the same block
      if (ent.type === 'BUILDING' || ent.category === 'BUILDING') {
        const rawCode = (ent.blockCode || ent.buildingId || ent.canonicalName)
          .toUpperCase()
          .replace(/^BLD_/, '');
        const blockCodeKey = (rawCode === 'LF' || rawCode === 'HM')
          ? 'HM'
          : (rawCode === 'GB' || rawCode === 'BPE')
          ? 'GB'
          : rawCode;
        if (blockCodeKey) {
          if (seenBlocks.has(blockCodeKey)) continue;
          seenBlocks.add(blockCodeKey);
        }
      }

      // 2. Deduplicate rooms across types (e.g. "AB 43" tag vs room vs place)
      if (ent.pureRoomDigits && ent.blockCode) {
        const canonicalRoomKey = `room___${ent.blockCode.toUpperCase()}___${ent.pureRoomDigits}`;
        if (seenKeys.has(canonicalRoomKey)) continue;
        seenKeys.add(canonicalRoomKey);
      }

      // 3. Deduplicate identical titles within the same block/node
      const normTitleKey = normalizeQuery(ent.canonicalName || ent.title);
      const cleanTitleKey = normTitleKey.replace(/^(room|dept|department|lab)\s+/i, '').replace(/\s+/g, '');
      const blockOrNode = ent.blockCode || ent.nodeId || 'campus';
      const dedupeTitleKey = `title___${blockOrNode}___${cleanTitleKey}`;
      if (seenKeys.has(dedupeTitleKey)) continue;
      seenKeys.add(dedupeTitleKey);

      // 4. Deduplicate identical node + title
      if (ent.nodeId) {
        const dedupeNodeKey = `node___${ent.nodeId}___${cleanTitleKey}`;
        if (seenKeys.has(dedupeNodeKey)) continue;
        seenKeys.add(dedupeNodeKey);
      }

      let customSubtitle: string | undefined;
      if (isRestroomQuery && restroomDistances.has(ent.id)) {
        const dist = restroomDistances.get(ent.id)!;
        const distStr = dist >= 9999 ? '' : `${Math.round(dist)}m away`;
        if (matches.length === 0 && dist < 9999) {
          customSubtitle = `📍 Nearest ${ent.title} (${distStr}) • ${ent.buildingName || ''} • ${ent.floorName || ''}`;
        } else if (distStr) {
          customSubtitle = `${distStr} • ${ent.buildingName || ''} • ${ent.floorName || ''}`;
        }
      }

      matches.push(mapEntityToSearchResult(ent, item.score, customSubtitle));
      if (matches.length >= limit) break;
    }

    // Partition into Grouped Categories
    const grouped = groupSearchResults(matches);

    const bestMatch = matches.length > 0 && matches[0].score && matches[0].score >= 4000 ? matches[0] : null;
    const executionTimeMs = Math.round((performance.now() - startTime) * 100) / 100;

    const diagnostics: SearchDiagnostics | undefined = options.includeDiagnostics
      ? {
          rawQuery,
          normalizedQuery,
          roomCodeDetected: roomQuery ? roomQuery.normalizedCode : null,
          tokens: qTokens,
          totalIndexedEntities: this.entities.length,
          candidateCount: candidateScores.size,
          topScore: matches[0]?.score || 0,
          matchType: filteredList[0]?.matchType || 'NONE',
          executionTimeMs,
        }
      : undefined;

    return {
      query: rawQuery,
      normalizedQuery,
      matches,
      bestMatch,
      didYouMean: detectedDidYouMean,
      grouped,
      diagnostics,
    };
  }

  /**
   * Diagnostic helper function for development testing.
   */
  public getDiagnostics(rawQuery: string): SearchDiagnostics {
    const res = this.search(rawQuery, { includeDiagnostics: true });
    return res.diagnostics!;
  }
}

/**
 * Top-level canonical search function for the entire WayCampus application.
 */
export function searchCampus(query: string, options?: SearchOptions): SearchEngineResult {
  return CampusSearchEngine.getInstance().search(query, options);
}

/**
 * Rebuilds the search index.
 */
export function rebuildCampusSearchIndex(): void {
  CampusSearchEngine.getInstance().buildIndex();
}

/**
 * Updates live runtime faculty, department, and verified place records in the search engine
 * and immediately rebuilds the search index.
 */
export function setLiveCampusSearchData(data: {
  teachers?: any[];
  departments?: any[];
  places?: any[];
}): void {
  CampusSearchEngine.getInstance().setLiveData(data);
}

export function getLiveCampusSearchData(): {
  teachers: any[];
  departments: any[];
  places: any[];
} {
  return CampusSearchEngine.getInstance().getLiveData();
}

if (typeof window !== 'undefined') {
  window.addEventListener('campnav:tags_updated', () => {
    rebuildCampusSearchIndex();
  });
  window.addEventListener('campnav:faculty_updated', (ev: Event) => {
    const customEv = ev as CustomEvent;
    if (customEv.detail) {
      setLiveCampusSearchData(customEv.detail);
    } else {
      rebuildCampusSearchIndex();
    }
  });
}
