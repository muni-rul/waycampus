import { SearchResult } from '../../../shared/types';
import { store } from '../db/store';

export class SearchService {
  private static cacheVersion = -1;
  private static searchCache = new Map<string, SearchResult[]>();

  private static normalize(str: string): string {
    return str
      .toLowerCase()
      .replace(/['’.]/g, '')
      .replace(/[-_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private static isWordBoundaryMatch(target: string, query: string): boolean {
    if (!target || !query) return false;
    if (target === query) return true;
    const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    try {
      return new RegExp(`(^|\\b)${escaped}(\\b|$)`, 'i').test(target);
    } catch {
      return target.includes(query);
    }
  }

  private static readonly DEPARTMENT_ACRONYMS: Record<string, string[]> = {
    'computer science': ['cs', 'cs department', 'department of cs', 'dept of cs'],
    'economics': ['econ', 'eco', 'econ department', 'economics department'],
    'mathematics': ['math', 'maths', 'math department', 'maths department'],
    'physics': ['phy', 'phys', 'physics department'],
    'statistics': ['stat', 'stats', 'statistics department'],
    'chemistry': ['chem', 'chemistry department'],
    'botany': ['bot', 'botany department'],
    'zoology': ['zoo', 'zoology department'],
    'commerce': ['bcom', 'mcom', 'commerce department'],
    'management studies': ['bba', 'bba department', 'management studies department'],
    'vocational studies': ['bvoc', 'bvoc department'],
    'physical education': ['bpe', 'phy edu', 'physical education department'],
    'english': ['eng', 'english department'],
    'malayalam': ['mal', 'malayalam department'],
    'hindi': ['hin', 'hindi department'],
    'history': ['hist', 'history department'],
    'psychology': ['psych', 'psychology department'],
    'food technology': ['ft', 'food tech', 'food tech department'],
    'hotel management': ['hm', 'hmc', 'hotel mgmt'],
    'social work': ['bsw', 'social work department'],
    'geology': ['geol', 'geology department'],
  };

  public static search(
    queryStr: string,
    userLocation?: { x: number; y: number; z: number; floorNumber?: number }
  ): SearchResult[] {
    const rawQuery = queryStr.trim();
    if (!rawQuery) return [];

    const normQuery = this.normalize(rawQuery);
    const currentVersion = store.getStateVersion();
    if (this.cacheVersion !== currentVersion) {
      this.searchCache.clear();
      this.cacheVersion = currentVersion;
    }

    const locKey = userLocation
      ? `${Math.round(userLocation.x)},${Math.round(userLocation.y)},${Math.round(userLocation.z)},${userLocation.floorNumber ?? 0}`
      : 'default';
    const cacheKey = `${normQuery}|${locKey}`;
    const cached = this.searchCache.get(cacheKey);
    if (cached) {
      store.logAnalytics(
        rawQuery,
        cached.length > 0,
        cached[0]?.type,
        cached[0]?.title
      );
      return cached;
    }
    const qTokens = normQuery.split(' ').filter(Boolean);
    const numberTokens = qTokens.filter((t) => /^\d+$/.test(t));
    const isPureNumberQuery = qTokens.length > 0 && qTokens.every((t) => /^\d+$/.test(t));
    const results: SearchResult[] = [];
    const buildings = store.getBuildings();
    const floors = store.getFloors();
    const rooms = store.getRooms();
    const teachers = store.getTeachers();
    const departments = store.getDepartments();
    const facilities = store.getFacilities();



    // 1. Check for "Nearest X" query (e.g. "nearest toilet", "closest water", "where is nearest washroom")
    const nearestMatch = normQuery.match(/(?:where is\s+)?(?:the\s+)?(?:find\s+)?(?:nearest|closest)\s+(?:to\s+me\s+)?(.+)/i);
    if (nearestMatch && nearestMatch[1]) {
      const targetEntity = nearestMatch[1].replace(/\bto me\b/g, '').trim();
      const facilityResults = this.findNearestFacility(targetEntity, userLocation);
      if (facilityResults.length > 0) {
        store.logAnalytics(rawQuery, true, 'NEAREST_FACILITY', facilityResults[0].title);
        return facilityResults;
      }
    }

    // 2. Search Faculty / Teachers (Official Christ College Dataset)
    for (const teacher of teachers) {
      if (isPureNumberQuery || numberTokens.length > 0) continue;
      let score = 0;
      const fullName = (teacher.fullName || teacher.name || '').trim();
      const normName = this.normalize(fullName);
      const normDept = this.normalize(teacher.department || teacher.departmentName || '');
      const normDesignation = this.normalize(teacher.designation || '');
      const normCategory = this.normalize(teacher.departmentCategory || '');

      const allAliases = (teacher.searchAliases || []).map((a) => this.normalize(a));

      // Exact match on name, department, or aliases
      if (normName === normQuery || normDept === normQuery || allAliases.includes(normQuery)) {
        score = 100;
      } else if (allAliases.some((a) => a === normQuery)) {
        score = 95;
      } else if (normQuery.length >= 3 && this.isWordBoundaryMatch(normName, normQuery)) {
        // Name contains query with word boundary
        score = Math.max(score, 90);
      } else if (normQuery.length >= 3 && (this.isWordBoundaryMatch(normDept, normQuery) || this.isWordBoundaryMatch(normCategory, normQuery))) {
        // Department query with word boundary
        score = Math.max(score, 85);
      } else if (normQuery.length >= 3 && this.isWordBoundaryMatch(normDesignation, normQuery)) {
        // Designation query with word boundary
        score = Math.max(score, 75);
      } else {
        // Token matching with honorifics handling (prevents single-letter initials like 'S' matching 'sir')
        const HONORIFICS = new Set(['teacher', 'sir', 'madam', 'prof', 'professor', 'dr', 'mr', 'ms', 'mrs', 'miss']);
        const rawQTokens = normQuery.split(' ').filter(Boolean);
        const contentTokens = rawQTokens.filter((t) => !HONORIFICS.has(t) && t.length >= 2);
        const tokensToMatch = contentTokens.length > 0 ? contentTokens : rawQTokens.filter((t) => t.length >= 2);
        const nameTokens = normName.split(' ').filter((t) => !HONORIFICS.has(t));

        const matchCount = tokensToMatch.filter((qt) =>
          nameTokens.some((nt) => {
            if (nt === qt) return true;
            if (nt.length >= 4 && qt.length >= 4) {
              return nt.startsWith(qt) || qt.startsWith(nt);
            }
            return false;
          })
        ).length;

        if (matchCount > 0 && matchCount === tokensToMatch.length) {
          score = Math.max(score, 88 + matchCount * 4); // Full query match on teacher name
        }
      }

      if (score > 0) {
        const resolvedTeacherNode = teacher.nodeId || teacher.departmentPlaceNodeId;
        const isLocVerified = Boolean(
          resolvedTeacherNode ||
            teacher.isLocationVerified ||
            teacher.departmentPlaceVerified ||
            teacher.locationStatus === 'VERIFIED' ||
            (teacher.verifiedStatus === 'VERIFIED' && teacher.roomId)
        );
        const building = teacher.buildingId ? buildings.find((b) => b.id === teacher.buildingId) : undefined;
        const floor = teacher.floorId ? floors.find((f) => f.id === teacher.floorId) : undefined;
        const room = teacher.roomId ? rooms.find((r) => r.id === teacher.roomId) : undefined;
        const currentDeptName = teacher.departmentName || teacher.department;

        results.push({
          id: teacher.id,
          type: 'TEACHER',
          title: fullName,
          subtitle: `${teacher.designation} • ${currentDeptName}`,
          designation: teacher.designation,
          department: currentDeptName,
          departmentType: teacher.departmentType,
          profileImageUrl: teacher.profileImageUrl,
          profileLink: teacher.profileLink,
          vidwanLink: teacher.vidwanLink,
          sourceUrl: teacher.sourceUrl || 'https://christcollegeijk.edu.in/facpr',
          isLocationVerified: isLocVerified,
          locationStatusNote: isLocVerified ? undefined : 'Location will be available after campus mapping.',
          buildingId: isLocVerified ? teacher.buildingId : undefined,
          buildingName: isLocVerified ? (teacher.buildingName || building?.name) : undefined,
          floorId: isLocVerified ? teacher.floorId : undefined,
          floorNumber: isLocVerified ? (floor?.floorNumber ?? teacher.floorNumber ?? 0) : undefined,
          floorName: isLocVerified ? (teacher.floorName || floor?.name) : undefined,
          roomId: isLocVerified ? teacher.roomId : undefined,
          roomNumber: isLocVerified ? (room?.roomNumber || teacher.roomNumber) : undefined,
          departmentId: teacher.departmentId,
          departmentName: currentDeptName,
          coordinates: isLocVerified ? (room?.center || building?.center || { x: 0, y: 0, z: 0 }) : undefined,
          nodeId: isLocVerified
            ? resolvedTeacherNode || room?.doorNodeId || room?.navigationNodeId || building?.entranceNodeIds[0] || 'outdoor_001'
            : undefined,
          verifiedStatus: teacher.verifiedStatus || 'VERIFIED',
          lastVerifiedDate: teacher.lastUpdated || teacher.lastVerifiedDate || '2026-08-27',
          score,
        });
      }
    }

    // Build set of obsolete department names that were renamed and are no longer used by any active department
    const activeDeptNamesNorm = new Set<string>();
    for (const d of departments) {
      if (d.name) activeDeptNamesNorm.add(this.normalize(d.name));
      if (d.category) {
        activeDeptNamesNorm.add(this.normalize(d.category));
        activeDeptNamesNorm.add(this.normalize(`${d.category} department`));
        activeDeptNamesNorm.add(this.normalize(`department of ${d.category}`));
      }
    }
    const obsoleteDeptNamesNorm = new Set<string>();
    for (const d of departments) {
      if (Array.isArray(d.previousNames)) {
        for (const prev of d.previousNames) {
          const normPrev = this.normalize(prev);
          const normPrevBase = this.normalize(
            prev.replace(/\s+department(\s*\([^)]*\))?$/i, '').replace(/^department\s+of\s+/i, '')
          );
          if (normPrev && !activeDeptNamesNorm.has(normPrev)) {
            obsoleteDeptNamesNorm.add(normPrev);
          }
          if (normPrevBase && !activeDeptNamesNorm.has(normPrevBase)) {
            obsoleteDeptNamesNorm.add(normPrevBase);
            obsoleteDeptNamesNorm.add(`${normPrevBase} department`);
            obsoleteDeptNamesNorm.add(`department of ${normPrevBase}`);
          }
        }
      }
    }

    // 2.4 Search Authoritative Departments (store.getDepartments())
    if (!isPureNumberQuery) {
      for (const dept of departments) {
        if (!dept.name) continue;
        let score = 0;
        const normName = this.normalize(dept.name);
        const normCat = dept.category ? this.normalize(dept.category) : '';
        const normCode = dept.code ? this.normalize(dept.code) : '';
        const normCodePrefix = dept.code ? this.normalize(dept.code.replace(/_(aided|unaided|self_financing)$/i, '')) : '';
        const normPlace = dept.placeName ? this.normalize(dept.placeName) : '';

        // Collect extra acronym aliases for known departments
        const catKey = Object.keys(SearchService.DEPARTMENT_ACRONYMS).find(
          (k) => normCat.includes(k) || normName.includes(k)
        );
        const acronymAliases = catKey ? SearchService.DEPARTMENT_ACRONYMS[catKey] : [];

        const allAliases = [
          normName,
          normCat,
          normCode,
          normCodePrefix,
          normPlace,
          normCat ? `department of ${normCat}` : '',
          normCat ? `${normCat} department` : '',
          ...acronymAliases,
        ].filter(Boolean);

        if (
          normName === normQuery ||
          normCat === normQuery ||
          (normCode && normCode === normQuery) ||
          (normCodePrefix && normCodePrefix === normQuery) ||
          allAliases.includes(normQuery)
        ) {
          score = 108;
        } else if (
          normQuery.length >= 2 &&
          (this.isWordBoundaryMatch(normName, normQuery) || (normCat && this.isWordBoundaryMatch(normCat, normQuery)))
        ) {
          score = 96;
        } else if (
          allAliases.some((a) => this.isWordBoundaryMatch(a, normQuery) || (normQuery.length >= 3 && this.isWordBoundaryMatch(normQuery, a)))
        ) {
          score = 88;
        }

        if (score > 0) {
          const streamBadge =
            dept.departmentType === 'UNAIDED' ? 'Self-Financing / Unaided' : 'Aided';
          const isLocVerified = Boolean(dept.nodeId && (dept as any).status !== 'UNMAPPED');
          results.push({
            id: dept.id,
            type: 'DEPARTMENT',
            title: dept.name,
            subtitle: `${streamBadge} • ${dept.buildingName || 'Campus'}${dept.floorName ? ' • ' + dept.floorName : ''}`,
            department: dept.name,
            departmentName: dept.name,
            departmentId: dept.id,
            departmentType: dept.departmentType,
            buildingId: dept.buildingId,
            buildingName: dept.buildingName || undefined,
            floorId: dept.floorId,
            floorName: dept.floorName || undefined,
            nodeId: dept.nodeId || undefined,
            isLocationVerified: isLocVerified,
            locationStatusNote: isLocVerified ? undefined : 'Location unmapped',
            verifiedStatus: isLocVerified ? 'VERIFIED' : 'NEEDS_VERIFICATION',
            lastVerifiedDate: dept.lastVerifiedDate || '2026-08-30',
            score,
          });
        }
      }
    }

    // 2.5 Search Master Verified Places & Custom Panorama Tags (Highest Priority Hierarchy)
    const verifiedPlaces = store.getPlaces();
    for (const place of verifiedPlaces) {
      if (place.status === 'DISABLED') continue;
      let score = 0;
      const normName = this.normalize(place.name);
      if (obsoleteDeptNamesNorm.has(normName)) continue;
      const normDisplay = this.normalize(place.displayName || '');
      const normRoom = place.roomNumber ? this.normalize(place.roomNumber) : '';
      const normBld = this.normalize(place.buildingName || '');
      const allAliases = [
        normName,
        normDisplay,
        normRoom,
        `${normBld} ${normName}`,
        ...((place as any).aliases || place.searchAliases || []).map((a: string) => this.normalize(a)),
      ].filter((a) => Boolean(a) && !obsoleteDeptNamesNorm.has(a));

      if (normName === normQuery || (normRoom && normRoom === normQuery)) {
        score = 110; // Top priority for verified physical places
      } else if (normQuery.length >= 2 && (this.isWordBoundaryMatch(normName, normQuery) || (normRoom && this.isWordBoundaryMatch(normRoom, normQuery)))) {
        score = 98;
      } else if (allAliases.some((a) => this.isWordBoundaryMatch(a, normQuery) || (normQuery.length >= 3 && this.isWordBoundaryMatch(normQuery, a)))) {
        score = 88;
      }

      if (score > 0) {
        results.push({
          id: place.id,
          type: place.category === 'CLASSROOM' ? 'CLASSROOM' :
                place.category === 'LAB' ? 'LAB' :
                place.category === 'DEPARTMENT' ? 'DEPARTMENT' :
                place.category === 'RESTROOM' ? 'FACILITY' : 'PLACE',
          title: place.displayName || place.name,
          subtitle: `${place.buildingName || place.buildingId || 'Campus'}${place.floorName ? ' • ' + place.floorName : ''}${place.roomNumber ? ' • Room ' + place.roomNumber : ''}`,
          buildingId: place.buildingId,
          buildingName: place.buildingName,
          floorId: place.floorId,
          floorNumber: place.floorNumber,
          floorName: place.floorName,
          roomNumber: place.roomNumber || undefined,
          nodeId: place.nodeId || place.panoramaId || undefined,
          isLocationVerified: Boolean(place.nodeId || place.panoramaId),
          locationStatusNote: place.nodeId || place.panoramaId ? undefined : 'Physical mapping pending',
          verifiedStatus: place.verified ? 'VERIFIED' : 'NEEDS_VERIFICATION',
          lastVerifiedDate: place.verifiedAt ? place.verifiedAt.split('T')[0] : '2026-08-30',
          category: place.category,
          score,
        });
      }
    }

    // 2.6 Search Panorama Custom Place Tags (graphOverrides.customPlaceTags)
    const customPlaceTags = store.getGraphOverrides().customPlaceTags || {};
    for (const [panoNodeId, tags] of Object.entries(customPlaceTags)) {
      if (!Array.isArray(tags)) continue;
      for (const tag of tags) {
        const tagLabel = (tag?.text || tag?.label || '').trim();
        if (!tagLabel) continue;
        const normTag = this.normalize(tagLabel);
        if (obsoleteDeptNamesNorm.has(normTag)) continue;

        let score = 0;
        if (normTag === normQuery) {
          score = 106;
        } else if (normQuery.length >= 2 && this.isWordBoundaryMatch(normTag, normQuery)) {
          score = 94;
        } else if (normQuery.length >= 3 && this.isWordBoundaryMatch(normQuery, normTag)) {
          score = 84;
        }

        if (score > 0) {
          results.push({
            id: tag.id || `tag_${panoNodeId}_${normTag.replace(/\s+/g, '_')}`,
            type: 'PLACE',
            title: tagLabel,
            subtitle: `${(tag as any).buildingName || 'Campus Panorama Tag'}${(tag as any).floor ? ' • ' + (tag as any).floor : ''} • Node: ${panoNodeId}`,
            buildingName: (tag as any).buildingName,
            floorName: (tag as any).floor,
            roomNumber: (tag as any).roomNumber || undefined,
            nodeId: panoNodeId,
            isLocationVerified: true,
            verifiedStatus: 'VERIFIED',
            lastVerifiedDate: '2026-08-30',
            category: tag.category || 'TAG',
            score,
          });
        }
      }
    }

    // 3. Search Verified Classrooms
    const classrooms = store.getClassrooms();
    for (const cls of classrooms) {
      let score = 0;
      const normRoomNum = this.normalize(cls.roomNumber);
      if (numberTokens.length > 0 && !numberTokens.every((num) => normRoomNum.includes(num))) {
        continue;
      }
      const normName = this.normalize(cls.name);
      const normDept = this.normalize(cls.department);
      const normYear = this.normalize(cls.year);
      const allAliases = [
        normRoomNum,
        normName,
        `${normDept} ${normRoomNum}`,
        `${normDept} ${normYear}`,
        `${cls.level.toLowerCase()} ${normDept}`,
        ...(cls.searchAliases || []).map((a) => this.normalize(a)),
      ];

      const cleanRoom = normRoomNum.replace(/\s+/g, '');
      const cleanQ = normQuery.replace(/\s+/g, '');

      if (cleanRoom === cleanQ || normRoomNum === normQuery || normName === normQuery) {
        score = 150;
      } else if (normQuery.length >= 2 && (normRoomNum.includes(normQuery) || normName.includes(normQuery))) {
        score = 92;
      } else if (normQuery.length >= 3 && allAliases.some((a) => a.includes(normQuery) || normQuery.includes(a))) {
        score = 80;
      } else {
        const qTokens = normQuery.split(' ').filter((t) => t.length >= 2);
        const matchCount = qTokens.filter((qt) => allAliases.some((a) => a.includes(qt))).length;
        if (matchCount > 0) {
          score = 50 + matchCount * 12;
        }
      }

      if (score > 0) {
        results.push({
          id: cls.id,
          type: 'CLASSROOM',
          title: cls.name,
          subtitle: `Room ${cls.roomNumber} • ${cls.department}`,
          roomNumber: cls.roomNumber,
          department: cls.department,
          departmentName: cls.department,
          isLocationVerified: cls.locationVerified,
          locationStatusNote: cls.locationVerified ? undefined : `Physical 360° mapping scheduled for Room ${cls.roomNumber}`,
          buildingId: cls.building || undefined,
          buildingName: cls.building || undefined,
          floorNumber: cls.floor !== null && cls.floor !== undefined ? Number(cls.floor) : undefined,
          verifiedStatus: 'VERIFIED',
          lastVerifiedDate: '2026-08-30',
          score,
        });
      }
    }

    // 4. Search Verified Laboratories
    const laboratories = store.getLaboratories();
    for (const lab of laboratories) {
      let score = 0;
      const normName = this.normalize(lab.name);
      if (numberTokens.length > 0 && !numberTokens.every((num) => normName.includes(num))) {
        continue;
      }
      const normDept = this.normalize(lab.department);
      const allAliases = [
        normName,
        `${normDept} lab`,
        `${normDept} laboratory`,
        ...(lab.searchAliases || []).map((a) => this.normalize(a)),
      ];

      if (normName === normQuery) {
        score = 100;
      } else if (normQuery.length >= 3 && (normName.includes(normQuery) || normQuery.includes(normName))) {
        score = 90;
      } else if (allAliases.some((a) => a.includes(normQuery) || normQuery.includes(a))) {
        score = 82;
      } else {
        const qTokens = normQuery.split(' ').filter((t) => t.length >= 2);
        const matchCount = qTokens.filter((qt) => allAliases.some((a) => a.includes(qt))).length;
        if (matchCount > 0) {
          score = 50 + matchCount * 12;
        }
      }

      if (score > 0) {
        results.push({
          id: lab.id,
          type: 'LAB',
          title: lab.name,
          subtitle: `${lab.department} Department • Laboratory`,
          department: lab.department,
          departmentName: lab.department,
          isLocationVerified: lab.locationVerified,
          locationStatusNote: lab.locationVerified ? undefined : 'Physical 360° mapping scheduled for laboratory',
          buildingId: lab.building || undefined,
          buildingName: lab.building || undefined,
          floorNumber: lab.floor !== null && lab.floor !== undefined ? Number(lab.floor) : undefined,
          verifiedStatus: 'VERIFIED',
          lastVerifiedDate: '2026-08-30',
          score,
        });
      }
    }

    // 5. Search Verified Programmes (e.g. BCA, B.Sc. CS, M.Sc. CS, Maths, Stats)
    if (!isPureNumberQuery) {
      const programmes = store.getProgrammes();
      for (const prog of programmes) {
        let score = 0;
        const normName = this.normalize(prog.name);
        const normCode = prog.code ? this.normalize(prog.code) : '';
        const normDept = this.normalize(prog.departmentName);
        if (obsoleteDeptNamesNorm.has(normDept)) continue;
        const compNorms = (prog.complementarySubjects || []).map((c) => this.normalize(c));
        const allAliases = [
          normName,
          normCode,
          normDept,
          ...compNorms,
          ...(prog.searchAliases || []).map((a) => this.normalize(a)),
        ].filter((a) => !obsoleteDeptNamesNorm.has(a));

        if (normCode === normQuery || normName === normQuery) {
          score = 100;
        } else if (normQuery.length >= 2 && (normName.includes(normQuery) || normCode.includes(normQuery))) {
          score = 92;
        } else if (allAliases.some((a) => a.includes(normQuery) || normQuery.includes(a))) {
          score = 80;
        }

        if (score > 0) {
          results.push({
            id: prog.id,
            type: 'PROGRAMME',
            title: prog.name,
            subtitle: `${prog.level} Degree Programme • ${prog.departmentName}${prog.departmentCategory === 'SELF_FINANCING' ? ' (Self-Financing)' : prog.departmentCategory === 'AIDED' ? ' (Aided)' : ''}`,
            department: prog.departmentName,
            departmentName: prog.departmentName,
            isLocationVerified: false,
            locationStatusNote: 'Academic programme destination',
            verifiedStatus: 'VERIFIED',
            lastVerifiedDate: '2026-08-30',
            score,
          });
        }
      }
    }

    // 6. Search Academic Departments
    if (!isPureNumberQuery) {
      const academicDepts = store.getAcademicDepartments();
      for (const dept of academicDepts) {
        let score = 0;
        const normName = this.normalize(dept.name);
        if (obsoleteDeptNamesNorm.has(normName)) continue;
        const normCode = this.normalize(dept.code);

        const catKey = Object.keys(SearchService.DEPARTMENT_ACRONYMS).find(
          (k) => normName.includes(k)
        );
        const acronymAliases = catKey ? SearchService.DEPARTMENT_ACRONYMS[catKey] : [];

        const allAliases = [
          normName,
          normCode,
          `department of ${normName}`,
          `${normName} department`,
          ...acronymAliases,
          ...(dept.searchAliases || []).map((a) => this.normalize(a)),
        ].filter((a) => !obsoleteDeptNamesNorm.has(a));

        if (normName === normQuery || normCode === normQuery || allAliases.includes(normQuery)) {
          score = 98;
        } else if (normQuery.length >= 2 && (this.isWordBoundaryMatch(normName, normQuery) || normCode === normQuery)) {
          score = 88;
        } else if (allAliases.some((a) => this.isWordBoundaryMatch(a, normQuery) || (normQuery.length >= 3 && this.isWordBoundaryMatch(normQuery, a)))) {
          score = 78;
        }

        if (score > 0) {
          const streamLabel = dept.category === 'AIDED' ? 'Aided' : dept.category === 'SELF_FINANCING' ? 'Self-Financing' : 'Aided & Self-Financing';
          results.push({
            id: dept.id,
            type: 'DEPARTMENT',
            title: `Department of ${dept.name}`,
            subtitle: `${streamLabel} • ${dept.programmes.length} Programmes • Code: ${dept.code}`,
            department: dept.name,
            departmentName: dept.name,
            isLocationVerified: dept.locationVerified,
            locationStatusNote: dept.locationVerified ? undefined : 'Physical location will be updated after 360° mapping',
            buildingId: dept.building || undefined,
            buildingName: dept.building || undefined,
            floorNumber: dept.floor !== null && dept.floor !== undefined ? Number(dept.floor) : undefined,
            verifiedStatus: 'VERIFIED',
            lastVerifiedDate: '2026-08-30',
            score,
          });
        }
      }
    }

    // 7. Search Rooms & Verified Campus POIs
    for (const room of rooms) {
      let score = 0;
      const normRoomNum = this.normalize(room.roomNumber);
      if (numberTokens.length > 0 && !numberTokens.every((num) => normRoomNum.includes(num))) {
        continue;
      }
      const normName = this.normalize(room.name);
      const allAliases = [normRoomNum, normName, ...(room.aliases || []).map((a) => this.normalize(a))];

      for (const alias of allAliases) {
        if (alias === normQuery) {
          score = 95;
          break;
        } else if (normQuery.length >= 3 && (this.isWordBoundaryMatch(alias, normQuery) || this.isWordBoundaryMatch(normQuery, alias))) {
          score = Math.max(score, 78);
        } else {
          const qTokens = normQuery.split(' ').filter((t) => t.length >= 2);
          const aTokens = alias.split(' ');
          const matchCount = qTokens.filter((qt) => aTokens.some((at) => at.includes(qt) || qt.includes(at))).length;
          if (matchCount > 0) {
            score = Math.max(score, 45 + matchCount * 10);
          }
        }
      }

      if (score > 0) {
        const building = buildings.find((b) => b.id === room.buildingId);
        const floor = floors.find((f) => f.id === room.floorId);
        const dept = departments.find((d) => d.id === room.departmentId);

        results.push({
          id: room.id,
          type: 'ROOM',
          title: room.name,
          subtitle: `${building?.name || 'Building'} • ${floor?.name || 'Floor ' + (room.floorNumber ?? 0)} • Room ${room.roomNumber}`,
          buildingId: room.buildingId,
          buildingName: building?.name,
          floorId: room.floorId,
          floorNumber: room.floorNumber ?? floor?.floorNumber ?? 0,
          floorName: floor?.name,
          roomId: room.id,
          roomNumber: room.roomNumber,
          departmentId: room.departmentId,
          departmentName: dept?.name,
          coordinates: room.center || building?.center || { x: 0, y: 0, z: 0 },
          nodeId: room.doorNodeId || room.navigationNodeId || building?.entranceNodeIds[0] || 'outdoor_001',
          verifiedStatus: room.verifiedStatus,
          lastVerifiedDate: room.lastVerifiedDate,
          category: room.category,
          accessible: room.accessible ?? room.isAccessible ?? true,
          isLocationVerified: true,
          score,
        });
      }
    }

    // 8. Search Facilities (Toilets, Drinking Water, Canteen, Sick Room, etc.)
    for (const fac of facilities) {
      if (isPureNumberQuery || numberTokens.length > 0) continue;
      let score = 0;
      const normName = this.normalize(fac.name);
      const allAliases = [normName, ...(fac.aliases || []).map((a) => this.normalize(a))];

      for (const alias of allAliases) {
        if (alias === normQuery) {
          score = 96;
          break;
        } else if (normQuery.length >= 3 && (this.isWordBoundaryMatch(alias, normQuery) || this.isWordBoundaryMatch(normQuery, alias))) {
          score = Math.max(score, 80);
        } else {
          const qTokens = normQuery.split(' ').filter((t) => t.length >= 2);
          const aTokens = alias.split(' ');
          const matchCount = qTokens.filter((qt) => aTokens.some((at) => at.includes(qt) || qt.includes(at))).length;
          if (matchCount > 0) {
            score = Math.max(score, 50 + matchCount * 10);
          }
        }
      }

      if (score > 0) {
        const building = fac.buildingId ? buildings.find((b) => b.id === fac.buildingId) : undefined;
        const floor = fac.floorId ? floors.find((f) => f.id === fac.floorId) : undefined;

        results.push({
          id: fac.id,
          type: 'FACILITY',
          title: fac.name,
          subtitle: building ? `${building.name} • ${floor?.name || 'Floor ' + (fac.floorNumber ?? 0)}` : 'Campus Landmark',
          buildingId: fac.buildingId,
          buildingName: building?.name,
          floorId: fac.floorId,
          floorNumber: fac.floorNumber ?? 0,
          floorName: floor?.name,
          coordinates: fac.coordinates,
          nodeId: fac.navigationNodeId || fac.doorNodeId || building?.entranceNodeIds[0] || 'outdoor_001',
          verifiedStatus: fac.verifiedStatus,
          lastVerifiedDate: fac.lastVerifiedDate,
          category: fac.type,
          accessible: fac.accessible ?? fac.isAccessible ?? true,
          isLocationVerified: true,
          score,
        });
      }
    }

    // 9. Search Buildings
    for (const bld of buildings) {
      if (isPureNumberQuery || numberTokens.length > 0) continue;
      let score = 0;
      const normName = this.normalize(bld.name);
      const normCode = this.normalize(bld.code);

      if (normCode === normQuery || normName === normQuery) {
        score = 120; // Top priority for exact building name / code queries (e.g. "AB", "MG", "SC")
      } else if (normName.startsWith(normQuery)) {
        score = 95;
      } else if (normQuery.length >= 3 && (normName.includes(normQuery) || normQuery.includes(normName))) {
        score = 78;
      }

      if (score > 0) {
        results.push({
          id: bld.id,
          type: 'BUILDING',
          title: bld.name,
          subtitle: `${bld.totalFloors} Floors • ${bld.category} • Code: ${bld.code}`,
          buildingId: bld.id,
          buildingName: bld.name,
          floorNumber: 0,
          coordinates: bld.center,
          nodeId: bld.entranceNodeIds[0] || 'outdoor_001',
          verifiedStatus: bld.verifiedStatus,
          lastVerifiedDate: bld.lastVerifiedDate,
          isLocationVerified: true,
          score,
        });
      }
    }

    // Sort results by relevance score descending
    results.sort((a, b) => (b.score || 0) - (a.score || 0));

    // Deduplicate and trim
    const seen = new Set<string>();
    const uniqueResults = results.filter((item) => {
      const key = `${item.type}_${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const isRoomPattern = /^[a-z]{1,4}\s*\d{1,4}[a-z]?$/i.test(normQuery) || /^\d{1,4}[a-z]?$/i.test(normQuery);
    const cleanQ = normQuery.replace(/\s+/g, '');
    const exactRoomHits = uniqueResults.filter((r) => {
      const cleanTitle = (r.title || '').toLowerCase().replace(/['’.]/g, '').replace(/[\-_]+/g, '').replace(/\s+/g, '');
      const cleanRoom = (r.roomNumber || '').toLowerCase().replace(/['’.]/g, '').replace(/[\-_]+/g, '').replace(/\s+/g, '');
      return cleanTitle === cleanQ || cleanRoom === cleanQ;
    });
    const candidateResults = (isRoomPattern && exactRoomHits.length > 0) ? exactRoomHits : uniqueResults;

    const finalResults = candidateResults.slice(0, 15);
    if (this.searchCache.size > 500) {
      this.searchCache.clear();
    }
    this.searchCache.set(cacheKey, finalResults);
    store.logAnalytics(
      rawQuery,
      finalResults.length > 0,
      finalResults[0]?.type,
      finalResults[0]?.title
    );

    return finalResults;
  }

  public static findNearestFacility(
    categoryKey: string,
    userLocation?: { x: number; y: number; z: number; floorNumber?: number }
  ): SearchResult[] {
    const facilities = store.getFacilities();
    const buildings = store.getBuildings();
    const floors = store.getFloors();
    const normKey = this.normalize(categoryKey);

    const matchedFacilities = facilities.filter((f) => {
      const allAliases = [f.name, f.type, ...(f.aliases || [])].map((a) => this.normalize(a));
      return allAliases.some((a) => a.includes(normKey) || normKey.includes(a));
    });

    if (matchedFacilities.length === 0) {
      return [];
    }

    const userX = userLocation?.x ?? 0;
    const userY = userLocation?.y ?? 0;
    const userZ = userLocation?.z ?? -160; // Default near Main Gate

    // Compute Euclidian 3D distance
    const scored = matchedFacilities.map((fac) => {
      const dx = fac.coordinates.x - userX;
      const dy = (fac.coordinates.y - userY) * 3; // Weight floor difference
      const dz = fac.coordinates.z - userZ;
      const distance = Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz));

      const bld = fac.buildingId ? buildings.find((b) => b.id === fac.buildingId) : undefined;
      const flr = fac.floorId ? floors.find((f) => f.id === fac.floorId) : undefined;

      const result: SearchResult = {
        id: fac.id,
        type: 'FACILITY',
        title: `Nearest ${fac.name}`,
        subtitle: `${distance}m away • ${bld?.name || 'Campus Grounds'} • ${flr?.name || 'Floor ' + (fac.floorNumber ?? 0)}`,
        buildingId: fac.buildingId,
        buildingName: bld?.name,
        floorId: fac.floorId,
        floorNumber: fac.floorNumber ?? 0,
        floorName: flr?.name,
        coordinates: fac.coordinates,
        nodeId: fac.navigationNodeId || fac.doorNodeId || 'node_main_gate',
        verifiedStatus: fac.verifiedStatus,
        lastVerifiedDate: fac.lastVerifiedDate,
        distanceMeters: distance,
        accessible: fac.accessible ?? fac.isAccessible ?? true,
        score: 1000 - distance,
      };
      return result;
    });

    scored.sort((a, b) => (a.distanceMeters || 0) - (b.distanceMeters || 0));
    return scored;
  }
}

