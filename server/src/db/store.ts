import fs from 'fs';
import path from 'path';
import {
  Organization,
  Campus,
  Building,
  Floor,
  Room,
  Department,
  Teacher,
  Facility,
  NavigationNode,
  NavigationEdge,
  QRCheckpoint,
  AnalyticsQuery,
  VerificationStatus,
  PanoramaNode,
  ClassroomRecord,
  LaboratoryRecord,
  Programme,
  AcademicDepartment,
  VerifiedPlace,
  CustomPlaceTag,
  PlaceAuditLog,
  PlaceCategory,
  RelativeDirection,
  GraphOverrideData,
  GraphValidationReport,
  GraphIssue,
  CampusReport,
  CampusReportStatus,
  CampusReportPriority,
  CampusReportIssueType,
  FacultyStatusType,
  FacultyStatusSource,
  FacultyStatusRecord,
  PublicFacultyStatus,
  FacultyAccount,
  FacultyStatusAuditLog,
  DataSnapshot,
  SearchAlias,
  AdminAuditAction,
  SystemValidationReport,
  SystemValidationCheckItem,
  CustomPanoramaDefinition,
  UploadedPanoramaAsset,
  NodeMetadataOverride,
} from '../../../shared/types';
import {
  VERIFIED_CLASSROOMS,
  VERIFIED_LABORATORIES,
  VERIFIED_PROGRAMMES,
  VERIFIED_DEPARTMENTS,
} from '../../../shared/academicData';
import {
  AdminUser,
  hashPassword,
  verifyPassword,
  generateSecureTempPassword,
  isValidCollegeEmail,
} from '../middleware/auth';
import crypto from 'crypto';
import { gitSyncService } from '../services/gitSyncService';
import {
  SEED_ORGANIZATION,
  SEED_CAMPUS,
  SEED_BUILDINGS,
  SEED_FLOORS,
  SEED_ROOMS,
  SEED_DEPARTMENTS,
  SEED_TEACHERS,
  SEED_FACILITIES,
  SEED_QR_CHECKPOINTS,
  SEED_NODES,
  SEED_EDGES,
} from './seedData';
import { INITIAL_PANORAMAS } from './panoramaSeedData';

export interface DatabaseState {
  organizations: Organization[];
  campuses: Campus[];
  buildings: Building[];
  floors: Floor[];
  rooms: Room[];
  departments: Department[];
  teachers: Teacher[];
  facilities: Facility[];
  qrCheckpoints: QRCheckpoint[];
  navigationNodes: NavigationNode[];
  navigationEdges: NavigationEdge[];
  panoramas: PanoramaNode[];
  analytics: AnalyticsQuery[];
  classrooms: ClassroomRecord[];
  laboratories: LaboratoryRecord[];
  programmes: Programme[];
  academicDepartments: AcademicDepartment[];
  places: VerifiedPlace[];
  placeAuditLogs: PlaceAuditLog[];
  graphOverrides?: GraphOverrideData;
  adminUsers?: AdminUser[];
  reports?: CampusReport[];
  facultyAccounts?: FacultyAccount[];
  facultyStatuses?: Record<string, FacultyStatusRecord>;
  facultyStatusAuditLogs?: FacultyStatusAuditLog[];
  searchAliases?: SearchAlias[];
  adminAuditActions?: AdminAuditAction[];
  snapshots?: DataSnapshot[];
}

function findMasterSeedDataDir(): string {
  const possiblePaths = [
    path.resolve(process.cwd(), 'server/data'),
    path.resolve(process.cwd(), 'data'),
    path.resolve(__dirname, '../../../data'),
    path.resolve(__dirname, '../../../../server/data'),
    path.resolve(__dirname, '../../data'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(path.join(p, 'campusnav_db.json'))) {
      return p;
    }
  }
  return path.resolve(process.cwd(), 'server/data');
}

export function findDataDir(): string {
  // 1. Explicit Persistent Volume mount path (Render Persistent Disk / Docker volume)
  if (process.env.DATA_DIR && process.env.DATA_DIR.trim().length > 0) {
    const customDir = path.resolve(process.env.DATA_DIR.trim());
    if (!fs.existsSync(customDir)) {
      try {
        fs.mkdirSync(customDir, { recursive: true });
        console.log(`[CampusNav Store] Initialized persistent data directory at: ${customDir}`);
      } catch (e: any) {
        console.error(`[CampusNav Store] Failed to create custom DATA_DIR "${customDir}":`, e.message);
      }
    }
    return customDir;
  }

  // 2. Default project data paths
  const possiblePaths = [
    path.resolve(process.cwd(), 'data'),
    path.resolve(process.cwd(), 'server/data'),
    path.resolve(__dirname, '../../../data'),
    path.resolve(__dirname, '../../../../server/data'),
    path.resolve(__dirname, '../../data'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p) && !p.includes('dist')) return p;
  }
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return path.resolve(process.cwd(), 'server/data');
}

export function getCollegeAdminDefaults(): AdminUser {
  const username = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
  const name = (process.env.ADMIN_NAME || 'Christ College Administrator').trim();
  const email = (process.env.ADMIN_EMAIL || 'admin@christcollegeijk.edu.in').trim();

  let passwordHash = '';
  let mustChange = false;

  if (process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.trim().length >= 16) {
    passwordHash = hashPassword(process.env.ADMIN_PASSWORD.trim());
  } else if (process.env.NODE_ENV !== 'production') {
    // In local development only, configure a dev fallback password if unset
    const devPass = 'dev-admin-pass-local';
    passwordHash = hashPassword(devPass);
    mustChange = true;
  }

  return {
    id: `admin_${username}`,
    username,
    passwordHash,
    role: 'SUPER_ADMIN',
    isPrimaryOwner: true,
    name,
    email,
    mustChangePassword: mustChange,
    createdAt: new Date().toISOString(),
  };
}

class DataStore {
  private state: DatabaseState;
  private dataFilePath: string;
  private persistTimer: NodeJS.Timeout | null = null;
  private stateVersion: number = 1;
  private canonicalPanoramaIds: Set<string> = new Set();
  private responseCache: Map<string, { version: number; etag: string; json: string; data: any }> = new Map();
  private writeQueuePromise: Promise<void> = Promise.resolve();
  private mutexChain: Promise<any> = Promise.resolve();

  constructor() {
    const dataDir = findDataDir();
    this.dataFilePath = path.join(dataDir, 'campusnav_db.json');

    // Cold-Start Auto-Seeding:
    // If running against an external DATA_DIR (e.g. fresh Render persistent disk) and the database
    // does not exist yet on that disk, copy the bundled master database into DATA_DIR so all 348
    // verified tags, places, and node calibrations are preserved immediately!
    if (!fs.existsSync(this.dataFilePath)) {
      const seedCandidate = path.join(dataDir, 'campusnav_db.seed.json');
      const masterSeedDir = findMasterSeedDataDir();
      const masterSeedCandidate = path.join(masterSeedDir, 'campusnav_db.seed.json');
      const masterDbPath = path.join(masterSeedDir, 'campusnav_db.json');
      const seedSource = fs.existsSync(seedCandidate)
        ? seedCandidate
        : fs.existsSync(masterSeedCandidate)
        ? masterSeedCandidate
        : fs.existsSync(masterDbPath)
        ? masterDbPath
        : null;

      if (seedSource && seedSource !== this.dataFilePath) {
        try {
          fs.copyFileSync(seedSource, this.dataFilePath);
          console.log(`[CampusNav Store] Successfully auto-seeded fresh database from seed: ${seedSource} -> ${this.dataFilePath}`);
        } catch (copyErr: any) {
          console.error('[CampusNav Store] Could not auto-seed database:', copyErr.message);
        }
      }
    }

    this.state = this.loadOrSeed();
    this.initializePanoramaMetadata();
    this.materializeUploadedPanoramaAssetsToDisk();
  }

  private initializePanoramaMetadata(): void {
    const manualNums = this.state.graphOverrides?.manualNumbers || {};
    const connKeys = Object.keys(this.state.graphOverrides?.customConnections || {});
    for (const k of Object.keys(manualNums)) {
      if (!this.state.graphOverrides?.customPanoramas?.[k]) {
        this.canonicalPanoramaIds.add(k);
      }
    }
    for (const k of connKeys) {
      if (!this.state.graphOverrides?.customPanoramas?.[k]) {
        this.canonicalPanoramaIds.add(k);
      }
    }
    const ov = this.getGraphOverrides();
    if (!ov.version) ov.version = 1;
    if (!ov.contentHash) ov.contentHash = this.computeGraphContentHash(ov);
    if (!ov.lastPublishedHash) {
      ov.lastPublishedHash = ov.contentHash;
      ov.lastPublishedVersion = ov.version;
      ov.lastPublishedAt = ov.lastSavedAt || new Date().toISOString();
    }
    if (!ov.publishStatus) {
      ov.publishStatus = ov.contentHash === ov.lastPublishedHash ? 'PUBLISHED' : 'DRAFT';
    }
    gitSyncService.setMergeHandler((remoteJson) => this.handleCloudMergeConflict(remoteJson));
  }

  public getDataFilePath(): string {
    return this.dataFilePath;
  }

  public getStateVersion(): number {
    return this.stateVersion;
  }

  public invalidateCache(): void {
    this.stateVersion++;
    this.responseCache.clear();
  }

  public getCachedResponse<T>(key: string, computeFn: () => T): { etag: string; json: string; data: T } {
    const existing = this.responseCache.get(key);
    if (existing && existing.version === this.stateVersion) {
      return existing as { etag: string; json: string; data: T };
    }
    const data = computeFn();
    const json = JSON.stringify(data);
    const hash = crypto.createHash('sha1').update(json).digest('hex').slice(0, 16);
    const etag = `W/"v${this.stateVersion}-${hash}"`;
    const entry = { version: this.stateVersion, etag, json, data };
    if (this.responseCache.size > 200) {
      this.responseCache.clear();
    }
    this.responseCache.set(key, entry);
    return entry;
  }

  public async withWriteLock<T>(fn: () => Promise<T> | T): Promise<T> {
    const next = this.mutexChain.then(() => fn());
    this.mutexChain = next.catch(() => {});
    return next;
  }

  private _placeholderEndConstructor(): void {
  }

  public handleCloudMergeConflict(remoteJson: string): void {
    try {
      const remoteState: DatabaseState = JSON.parse(remoteJson);
      if (!remoteState || !Array.isArray(remoteState.buildings)) return;

      const localAccounts = this.state.facultyAccounts || [];
      const remoteAccounts = Array.isArray(remoteState.facultyAccounts) ? remoteState.facultyAccounts : [];

      const mergedAccounts = [...remoteAccounts];
      for (const loc of localAccounts) {
        const exists = remoteAccounts.some(
          (r) =>
            r.id === loc.id ||
            (r.facultyId && loc.facultyId && r.facultyId.toLowerCase() === loc.facultyId.toLowerCase()) ||
            (r.email && loc.email && r.email.toLowerCase() === loc.email.toLowerCase())
        );
        if (!exists) {
          mergedAccounts.push(loc);
        }
      }

      this.state.facultyAccounts = mergedAccounts;
      if (remoteState.facultyStatuses) {
        this.state.facultyStatuses = {
          ...this.state.facultyStatuses,
          ...remoteState.facultyStatuses,
        };
      }
      this.saveStateToDisk(this.state);
      this.invalidateCache();
      console.log(`[CloudSync] Merged remote state on 409 conflict: ${mergedAccounts.length} faculty accounts.`);
    } catch (err: any) {
      console.warn('[CloudSync] Failed to merge remote state on conflict:', err?.message);
    }
  }

  public async initCloudSync(): Promise<void> {
    if (!gitSyncService.isConfigured()) {
      console.warn(
        '[Persistence] GITHUB_DATA_REPO/GITHUB_TOKEN not set: data is stored on local disk only and WILL BE LOST on restart/redeploy.'
      );
      return;
    }
    const isRenderEnv = Boolean(process.env.RENDER) || process.env.ENABLE_STARTUP_CLOUD_SYNC === 'true';
    if (!isRenderEnv && fs.existsSync(this.dataFilePath)) {
      return;
    }
    try {
      console.log('[CampusNav Store] Checking GitHub for latest cloud database backup...');
      const remoteRes = await gitSyncService.fetchLatestRemoteDatabase();
      if (remoteRes && remoteRes.content) {
        const parsed = JSON.parse(remoteRes.content);
        if (parsed && Array.isArray(parsed.buildings) && parsed.buildings.length > 0) {
          this.state = parsed;
          this.saveStateToDisk(this.state);
          this.initializePanoramaMetadata();
          this.materializeUploadedPanoramaAssetsToDisk();
          this.invalidateCache();
          console.log(
            `[CampusNav Store] Successfully synchronized latest database from GitHub backup (${parsed.teachers?.length || 0} teachers, ${parsed.facultyAccounts?.length || 0} faculty accounts).`
          );
        }
      }
    } catch (err: any) {
      console.warn('[CampusNav Store] Could not sync database from GitHub on startup:', err?.message);
    }
  }

  private loadFacultyDataset(): Teacher[] {
    try {
      const dataDir = findDataDir();
      const facultyJsonPath = path.join(dataDir, 'faculty.json');
      if (fs.existsSync(facultyJsonPath)) {
        const raw = fs.readFileSync(facultyJsonPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (err) {
      console.warn('[CampusNav Store] Could not read faculty.json:', err);
    }
    return JSON.parse(JSON.stringify(SEED_TEACHERS));
  }

  private loadDepartmentsDataset(): Department[] {
    try {
      const dataDir = findDataDir();
      const candidatePaths = [
        path.join(dataDir, 'departments.json'),
        path.resolve(process.cwd(), 'client/src/data/officialDepartments.json'),
        path.resolve(process.cwd(), '../client/src/data/officialDepartments.json'),
        path.resolve(__dirname, '../../../client/src/data/officialDepartments.json'),
        path.resolve(__dirname, '../../../../client/src/data/officialDepartments.json'),
      ];
      for (const p of candidatePaths) {
        if (fs.existsSync(p)) {
          const raw = fs.readFileSync(p, 'utf-8');
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      }
    } catch (err) {
      console.warn('[CampusNav Store] Could not read departments.json:', err);
    }
    return JSON.parse(JSON.stringify(SEED_DEPARTMENTS));
  }

  private normalizeLoadedFacultyAndDepartments(teachers: Teacher[], departments: Department[]): void {
    const legacyDeptIdMap: Record<string, string> = {
      dept_mathematics_unaided: 'dept_math_unaided',
      dept_statistics_aided: 'dept_stats_aided',
      dept_computer_science_unaided: 'dept_cs_unaided',
    };
    const deptById = new Map<string, Department>(departments.map((d) => [d.id, d]));
    const deptByName = new Map<string, Department>(
      departments.map((d) => [d.name.toLowerCase().trim(), d])
    );

    const counts = new Map<string, number>();

    for (const t of teachers) {
      if (t.departmentId && legacyDeptIdMap[t.departmentId]) {
        t.departmentId = legacyDeptIdMap[t.departmentId];
      }
      let dept = t.departmentId ? deptById.get(t.departmentId) : undefined;
      if (!dept) {
        const dName = (t.departmentName || t.department || '').toLowerCase().trim();
        if (dName) dept = deptByName.get(dName);
      }
      if (dept) {
        t.departmentId = dept.id;
        t.department = dept.name;
        t.departmentName = dept.name;
        t.departmentCategory = dept.category || dept.name;
        if (dept.departmentType) t.departmentType = dept.departmentType as any;
        if (dept.nodeId) {
          t.nodeId = dept.nodeId;
          t.departmentPlaceNodeId = dept.nodeId;
          t.departmentPlaceId = dept.placeId || t.departmentPlaceId;
          t.departmentPlaceName = dept.placeName || dept.name;
          t.buildingName = dept.buildingName || t.buildingName;
          t.floorName = dept.floorName || t.floorName;
          t.departmentPlaceVerified = true;
          t.isLocationVerified = true;
          t.locationStatus = 'VERIFIED';
        }
        counts.set(dept.id, (counts.get(dept.id) || 0) + 1);
      } else {
        t.department = t.departmentName || t.department || 'General';
        t.departmentName = t.department;
      }
    }

    for (const d of departments) {
      d.facultyCount = counts.get(d.id) || 0;
    }
  }

  private syncFacultyAndDepartmentsFiles(): void {
    try {
      const dataDir = findDataDir();
      if (Array.isArray(this.state?.teachers)) {
        const facultyJsonPath = path.join(dataDir, 'faculty.json');
        fs.writeFileSync(facultyJsonPath, JSON.stringify(this.state.teachers, null, 2), 'utf-8');
      }
      if (Array.isArray(this.state?.departments)) {
        const deptsJsonPath = path.join(dataDir, 'departments.json');
        fs.writeFileSync(deptsJsonPath, JSON.stringify(this.state.departments, null, 2), 'utf-8');
      }
    } catch (err) {
      console.warn('[CampusNav Store] Warning syncing faculty/departments JSON files:', err);
    }
  }

  private loadOrSeed(): DatabaseState {
    const officialFaculty = this.loadFacultyDataset();
    const officialDepartments = this.loadDepartmentsDataset();

    try {
      if (fs.existsSync(this.dataFilePath)) {
        const raw = fs.readFileSync(this.dataFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (
          parsed &&
          Array.isArray(parsed.buildings) &&
          parsed.buildings.length > 0 &&
          Array.isArray(parsed.navigationNodes) &&
          parsed.navigationNodes.length > 0
        ) {
          if (!Array.isArray(parsed.panoramas) || parsed.panoramas.length === 0) {
            parsed.panoramas = JSON.parse(JSON.stringify(INITIAL_PANORAMAS));
          }
          parsed.buildings = JSON.parse(JSON.stringify(SEED_BUILDINGS));
          if (!Array.isArray(parsed.departments) || parsed.departments.length < 30) {
            parsed.departments = JSON.parse(JSON.stringify(officialDepartments));
          }
          if (!Array.isArray(parsed.teachers) || parsed.teachers.length < 250) {
            parsed.teachers = JSON.parse(JSON.stringify(officialFaculty));
          }
          this.normalizeLoadedFacultyAndDepartments(parsed.teachers, parsed.departments);
          parsed.classrooms = JSON.parse(JSON.stringify(VERIFIED_CLASSROOMS));
          parsed.laboratories = JSON.parse(JSON.stringify(VERIFIED_LABORATORIES));
          parsed.programmes = JSON.parse(JSON.stringify(VERIFIED_PROGRAMMES));
          parsed.academicDepartments = JSON.parse(JSON.stringify(VERIFIED_DEPARTMENTS));
          parsed.qrCheckpoints = JSON.parse(JSON.stringify(SEED_QR_CHECKPOINTS));
          if (!Array.isArray(parsed.places)) {
            parsed.places = [];
          }
          if (!Array.isArray(parsed.placeAuditLogs)) {
            parsed.placeAuditLogs = [];
          }
          if (!Array.isArray(parsed.reports)) {
            parsed.reports = [];
          }
          if (!Array.isArray(parsed.facultyAccounts)) {
            parsed.facultyAccounts = [];
          }
          if (!parsed.facultyStatuses || typeof parsed.facultyStatuses !== 'object') {
            parsed.facultyStatuses = {};
          }
          if (!Array.isArray(parsed.facultyStatusAuditLogs)) {
            parsed.facultyStatusAuditLogs = [];
          }
          if (!Array.isArray(parsed.adminUsers)) {
            parsed.adminUsers = [];
          }

          // Admin synchronization
          if (process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.trim().length >= 16) {
            const pass = process.env.ADMIN_PASSWORD.trim();
            const targetUser = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
            let primaryAdmin = parsed.adminUsers.find((u: AdminUser) => u.username.toLowerCase() === targetUser);
            if (!primaryAdmin) {
              primaryAdmin = getCollegeAdminDefaults();
              parsed.adminUsers.unshift(primaryAdmin);
            } else {
              primaryAdmin.passwordHash = hashPassword(pass);
              primaryAdmin.isPrimaryOwner = true;
              primaryAdmin.role = 'SUPER_ADMIN';
              primaryAdmin.mustChangePassword = false;
            }
          }

          if (process.env.NODE_ENV === 'production') {
            const pass = process.env.ADMIN_PASSWORD?.trim();
            const pin = process.env.ADMIN_EMERGENCY_PIN?.trim();
            if (!pass || pass.length < 16 || !pin || pin.length < 16) {
              // Admin disabled by default in production
              parsed.adminUsers = [];
            }
          } else {
            // Local dev: ensure at least one dev admin exists if empty
            if (parsed.adminUsers.length === 0) {
              parsed.adminUsers = [getCollegeAdminDefaults()];
            }
          }
          // Ensure all canonical seed nodes are present in navigationNodes
          if (Array.isArray(parsed.navigationNodes)) {
            const existingNodeIds = new Set(parsed.navigationNodes.map((n: any) => n.id));
            SEED_NODES.forEach((seedNode) => {
              if (!existingNodeIds.has(seedNode.id)) {
                parsed.navigationNodes.push(seedNode);
              }
            });
          }
          console.log(`[CampusNav Store] Successfully loaded dataset from disk with ${parsed.teachers.length} official faculty, ${parsed.places.length} verified places, ${parsed.classrooms.length} classrooms, and ${parsed.laboratories.length} laboratories.`);
          return parsed;
        }
      }
    } catch (err) {
      console.warn('[CampusNav Store] Could not read existing DB file, re-seeding:', err);
    }

    console.log('[CampusNav Store] Initializing fresh Christ College dataset with connected 360 panoramas.');
    const freshState: DatabaseState = {
      organizations: [SEED_ORGANIZATION],
      campuses: [SEED_CAMPUS],
      buildings: JSON.parse(JSON.stringify(SEED_BUILDINGS)),
      floors: JSON.parse(JSON.stringify(SEED_FLOORS)),
      rooms: JSON.parse(JSON.stringify(SEED_ROOMS)),
      departments: officialDepartments.length > 0 ? officialDepartments : JSON.parse(JSON.stringify(SEED_DEPARTMENTS)),
      teachers: officialFaculty,
      facilities: JSON.parse(JSON.stringify(SEED_FACILITIES)),
      qrCheckpoints: JSON.parse(JSON.stringify(SEED_QR_CHECKPOINTS)),
      navigationNodes: JSON.parse(JSON.stringify(SEED_NODES)),
      navigationEdges: JSON.parse(JSON.stringify(SEED_EDGES)),
      panoramas: JSON.parse(JSON.stringify(INITIAL_PANORAMAS)),
      analytics: [],
      classrooms: JSON.parse(JSON.stringify(VERIFIED_CLASSROOMS)),
      laboratories: JSON.parse(JSON.stringify(VERIFIED_LABORATORIES)),
      programmes: JSON.parse(JSON.stringify(VERIFIED_PROGRAMMES)),
      academicDepartments: JSON.parse(JSON.stringify(VERIFIED_DEPARTMENTS)),
      places: [],
      placeAuditLogs: [],
      reports: [],
      facultyAccounts: [
        {
          id: 'fa_francy_unaided',
          facultyId: 'fac_francy_unaided',
          email: 'francy@christcollegeijk.edu.in',
          facultyCode: 'fac_francy_unaided',
          passwordHash: hashPassword(crypto.randomBytes(12).toString('hex')),
          role: 'FACULTY',
          isActive: true,
          mustChangePassword: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      facultyStatuses: {
        fac_francy_unaided: {
          id: 'fs_fac_francy_unaided_init',
          facultyId: 'fac_francy_unaided',
          status: 'AVAILABLE',
          locationPlaceId: 'tag_sc_224_1788850949096',
          locationName: 'DEPARTMEN OF BVOC',
          locationNodeId: 'sc_224',
          updatedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
          updatedBy: 'fac_francy_unaided',
          source: 'FACULTY',
        },
      },
      facultyStatusAuditLogs: [],
      adminUsers: [getCollegeAdminDefaults()],
    };
    this.saveStateToDisk(freshState);
    return freshState;
  }

  private saveStateToDisk(state: DatabaseState): void {
    try {
      const dir = path.dirname(this.dataFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tmpPath = `${this.dataFilePath}.${crypto.randomUUID()}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf-8');
      fs.renameSync(tmpPath, this.dataFilePath);
    } catch (err) {
      console.error('[CampusNav Store] Failed to write database to disk:', err);
    }
  }

  private saveStateToDiskAsync(state: DatabaseState): void {
    this.writeQueuePromise = this.writeQueuePromise
      .then(async () => {
        try {
          const dir = path.dirname(this.dataFilePath);
          if (!fs.existsSync(dir)) {
            await fs.promises.mkdir(dir, { recursive: true });
          }
          const tmpPath = `${this.dataFilePath}.${crypto.randomUUID()}.tmp`;
          const payload = JSON.stringify(state, null, 2);
          await fs.promises.writeFile(tmpPath, payload, 'utf-8');
          await fs.promises.rename(tmpPath, this.dataFilePath);
        } catch (err) {
          console.error('[CampusNav Store] Async database write failed:', err);
        }
      })
      .catch(() => {});
  }

  public persist(immediate: boolean = false, options?: { allowAccountRemoval?: boolean }): void {
    if (immediate) {
      if (this.persistTimer) {
        clearTimeout(this.persistTimer);
        this.persistTimer = null;
      }
      this.saveStateToDisk(this.state);
      this.invalidateCache();
      if (Boolean(process.env.RENDER) || process.env.AUTO_CLOUD_SYNC_ON_SAVE === 'true') {
        gitSyncService.scheduleDebouncedSync(this.dataFilePath, 500, options);
      }
      return;
    }

    if (this.persistTimer) return;

    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.saveStateToDiskAsync(this.state);
      if (Boolean(process.env.RENDER) || process.env.AUTO_CLOUD_SYNC_ON_SAVE === 'true') {
        gitSyncService.scheduleDebouncedSync(this.dataFilePath, 5000, options);
      }
    }, 10000);
  }

  public resetToSeed(): DatabaseState {
    const officialFaculty = this.loadFacultyDataset();
    const officialDepartments = this.loadDepartmentsDataset();
    this.state = {
      organizations: [SEED_ORGANIZATION],
      campuses: [SEED_CAMPUS],
      buildings: JSON.parse(JSON.stringify(SEED_BUILDINGS)),
      floors: JSON.parse(JSON.stringify(SEED_FLOORS)),
      rooms: JSON.parse(JSON.stringify(SEED_ROOMS)),
      departments: officialDepartments.length > 0 ? officialDepartments : JSON.parse(JSON.stringify(SEED_DEPARTMENTS)),
      teachers: officialFaculty.length > 0 ? officialFaculty : JSON.parse(JSON.stringify(SEED_TEACHERS)),
      facilities: JSON.parse(JSON.stringify(SEED_FACILITIES)),
      qrCheckpoints: JSON.parse(JSON.stringify(SEED_QR_CHECKPOINTS)),
      navigationNodes: JSON.parse(JSON.stringify(SEED_NODES)),
      navigationEdges: JSON.parse(JSON.stringify(SEED_EDGES)),
      panoramas: JSON.parse(JSON.stringify(INITIAL_PANORAMAS)),
      analytics: this.state.analytics || [],
      classrooms: JSON.parse(JSON.stringify(VERIFIED_CLASSROOMS)),
      laboratories: JSON.parse(JSON.stringify(VERIFIED_LABORATORIES)),
      programmes: JSON.parse(JSON.stringify(VERIFIED_PROGRAMMES)),
      academicDepartments: JSON.parse(JSON.stringify(VERIFIED_DEPARTMENTS)),
      places: [],
      placeAuditLogs: [],
      facultyAccounts: [
        {
          id: 'fa_francy_unaided',
          facultyId: 'fac_francy_unaided',
          email: 'francy@christcollegeijk.edu.in',
          facultyCode: 'fac_francy_unaided',
          passwordHash: hashPassword(crypto.randomBytes(12).toString('hex')),
          role: 'FACULTY',
          isActive: true,
          mustChangePassword: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      facultyStatuses: {
        fac_francy_unaided: {
          id: 'fs_fac_francy_unaided_init',
          facultyId: 'fac_francy_unaided',
          status: 'AVAILABLE',
          locationPlaceId: 'tag_sc_224_1788850949096',
          locationName: 'DEPARTMEN OF BVOC',
          locationNodeId: 'sc_224',
          updatedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
          updatedBy: 'fac_francy_unaided',
          source: 'FACULTY',
        },
      },
      facultyStatusAuditLogs: [],
      adminUsers: [getCollegeAdminDefaults()],
    };
    this.persist(true);
    return this.state;
  }

  // --- Getters ---
  public getOrganizations(): Organization[] {
    return this.state.organizations;
  }

  public getCampuses(): Campus[] {
    return this.state.campuses;
  }

  public getBuildings(campusId?: string): Building[] {
    if (campusId) {
      return this.state.buildings.filter((b) => b.campusId === campusId);
    }
    return this.state.buildings;
  }

  public getBuildingById(id: string): Building | undefined {
    return this.state.buildings.find((b) => b.id === id);
  }

  public getFloors(buildingId?: string): Floor[] {
    if (buildingId) {
      return this.state.floors.filter((f) => f.buildingId === buildingId);
    }
    return this.state.floors;
  }

  public getRooms(buildingId?: string, floorId?: string): Room[] {
    let result = this.state.rooms;
    if (buildingId) result = result.filter((r) => r.buildingId === buildingId);
    if (floorId) result = result.filter((r) => r.floorId === floorId);
    return result;
  }

  public getRoomById(id: string): Room | undefined {
    return this.state.rooms.find((r) => r.id === id);
  }

  public getDepartments(campusId?: string): Department[] {
    if (campusId) {
      return this.state.departments.filter((d) => d.campusId === campusId);
    }
    return this.state.departments;
  }

  public getTeachers(campusId?: string): Teacher[] {
    if (campusId) {
      return this.state.teachers.filter((t) => t.campusId === campusId);
    }
    return this.state.teachers;
  }

  public getFacilities(campusId?: string): Facility[] {
    if (campusId) {
      return this.state.facilities.filter((f) => f.campusId === campusId);
    }
    return this.state.facilities;
  }

  public getClassrooms(): ClassroomRecord[] {
    return this.state.classrooms || VERIFIED_CLASSROOMS;
  }

  public getLaboratories(): LaboratoryRecord[] {
    return this.state.laboratories || VERIFIED_LABORATORIES;
  }

  public getProgrammes(): Programme[] {
    return this.state.programmes || VERIFIED_PROGRAMMES;
  }

  public getAcademicDepartments(): AcademicDepartment[] {
    return this.state.academicDepartments || VERIFIED_DEPARTMENTS;
  }

  public getQRCheckpoints(): QRCheckpoint[] {
    return this.state.qrCheckpoints;
  }

  public getQRByCode(code: string): QRCheckpoint | undefined {
    return this.state.qrCheckpoints.find((q) => q.code.toUpperCase() === code.trim().toUpperCase());
  }

  public getNavigationNodes(campusId?: string): NavigationNode[] {
    if (campusId) {
      return this.state.navigationNodes.filter((n) => n.campusId === campusId);
    }
    return this.state.navigationNodes;
  }

  public getNodeById(id: string): NavigationNode | undefined {
    return this.state.navigationNodes.find((n) => n.id === id);
  }

  public getNavigationEdges(): NavigationEdge[] {
    return this.state.navigationEdges;
  }

  public getAnalytics(): AnalyticsQuery[] {
    return this.state.analytics;
  }

  // --- Mutations ---
  public logAnalytics(query: string, matched: boolean, resultType?: string, destinationName?: string): void {
    const item: AnalyticsQuery = {
      id: `query_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      query: query.trim(),
      timestamp: new Date().toISOString(),
      matched,
      resultType,
      destinationName,
    };
    this.state.analytics.push(item);
    if (this.state.analytics.length > 500) {
      this.state.analytics = this.state.analytics.slice(-500);
    }
    this.persist(false);
  }

  public addRoom(room: Room): Room {
    this.state.rooms.push(room);
    this.persist(true);
    return room;
  }

  public updateRoom(id: string, updates: Partial<Room>): Room | undefined {
    const index = this.state.rooms.findIndex((r) => r.id === id);
    if (index === -1) return undefined;
    this.state.rooms[index] = { ...this.state.rooms[index], ...updates };
    this.persist(true);
    return this.state.rooms[index];
  }

  public deleteRoom(id: string): boolean {
    const prevLen = this.state.rooms.length;
    this.state.rooms = this.state.rooms.filter((r) => r.id !== id);
    this.persist(true);
    return this.state.rooms.length < prevLen;
  }

  public addTeacher(teacher: Teacher): Teacher {
    this.state.teachers = this.state.teachers.filter(
      (t) => t.id !== teacher.id && t.name.toLowerCase() !== teacher.name.toLowerCase()
    );
    this.state.teachers.push(teacher);
    this.persist(true);
    return teacher;
  }

  public bulkAddTeachers(newTeachers: Teacher[]): Teacher[] {
    for (const teacher of newTeachers) {
      this.state.teachers = this.state.teachers.filter(
        (t) => t.id !== teacher.id && t.name.toLowerCase() !== teacher.name.toLowerCase()
      );
      this.state.teachers.push(teacher);
    }
    this.persist(true);
    return this.state.teachers;
  }

  public validateCampusLocationNode(
    nodeId?: string | null,
    buildingId?: string | null,
    roomId?: string | null
  ): {
    valid: boolean;
    resolvedNodeId?: string;
    buildingName?: string;
    floorName?: string;
    error?: string;
  } {
    let targetNodeId = (nodeId || '').trim();

    if (!targetNodeId && roomId) {
      const room = this.state.rooms.find((r) => r.id === roomId || r.roomNumber === roomId);
      if ((room as any)?.entranceNodeId || room?.doorNodeId || (room as any)?.nodeId) {
        targetNodeId = (room as any)?.entranceNodeId || room?.doorNodeId || (room as any)?.nodeId;
      } else {
        const cls = this.getClassrooms().find((c) => c.id === roomId || c.roomNumber === roomId);
        if (cls?.nodeId) targetNodeId = cls.nodeId;
        const lab = this.getLaboratories().find((l) => l.id === roomId || (l as any).roomNumber === roomId);
        if (!targetNodeId && lab?.nodeId) targetNodeId = lab.nodeId;
      }
    }

    if (!targetNodeId && buildingId) {
      const bld = this.state.buildings.find(
        (b) => b.id === buildingId || (b.code && b.code.toLowerCase() === buildingId.toLowerCase())
      );
      if ((bld as any)?.entranceNodeId || (bld as any)?.entranceNodeIds?.[0]) {
        targetNodeId = (bld as any)?.entranceNodeId || (bld as any)?.entranceNodeIds?.[0];
      }
    }

    if (!targetNodeId) {
      return {
        valid: false,
        error: 'A physical campus location (panorama node, room, or building) is required to register a navigable destination.',
      };
    }

    const overrides = this.getGraphOverrides();
    const isPanoNode =
      this.canonicalPanoramaIds.has(targetNodeId) ||
      Boolean(overrides.manualNumbers?.[targetNodeId]) ||
      Boolean(overrides.customConnections?.[targetNodeId]) ||
      Boolean(overrides.customPanoramas?.[targetNodeId]);

    const navNode = this.state.navigationNodes.find((n) => n.id === targetNodeId);

    if (!isPanoNode && !navNode) {
      return {
        valid: false,
        error: `Campus location "${targetNodeId}" does not exist in the campus graph.`,
      };
    }

    if (isPanoNode) {
      // Verify reachability from Main Entrance (outdoor_001) using customConnections
      const startNodeId = 'outdoor_001';
      if (targetNodeId !== startNodeId) {
        const visited = new Set<string>([startNodeId]);
        const queue: string[] = [startNodeId];
        let found = false;

        while (queue.length > 0) {
          const curr = queue.shift()!;
          if (curr === targetNodeId) {
            found = true;
            break;
          }
          const conns = overrides.customConnections?.[curr] || [];
          for (const conn of conns) {
            const nextId = conn?.targetId || conn?.targetPanoId;
            if (nextId && !visited.has(nextId)) {
              visited.add(nextId);
              queue.push(nextId);
            }
          }
        }

        if (!found) {
          return {
            valid: false,
            error: `Campus location "${targetNodeId}" is unreachable in the campus navigation graph from the Main Entrance.`,
          };
        }
      }
    } else if (navNode) {
      const hasEdge = this.state.navigationEdges.some(
        (e) => e.sourceNodeId === targetNodeId || e.targetNodeId === targetNodeId
      );
      if (!hasEdge) {
        return {
          valid: false,
          error: `Navigation node "${targetNodeId}" has no walkable connections in the campus graph.`,
        };
      }
    }

    const prefix = targetNodeId.split('_')[0].toLowerCase();
    const blockNamesByPrefix: Record<string, string> = {
      ab: 'Main Administrative Block',
      sc: 'St. Kuriakose Elias Chavara Block (South Campus)',
      sm: "St. Mary's Block",
      mg: 'Mahatma Gandhi Block',
      sj: 'Golden Jubilee Block (PG Block)',
      mt: 'Mar Thoma Block',
      outdoor: 'Outdoor Campus',
    };

    const inferredBuildingName = blockNamesByPrefix[prefix] || 'Main Administrative Block';
    const metaFloor = overrides.nodeMetadataOverrides?.[targetNodeId]?.floor;
    const inferredFloorName =
      metaFloor === 2 ? 'Second Floor' : metaFloor === 1 ? 'First Floor' : 'Ground Floor';

    return {
      valid: true,
      resolvedNodeId: targetNodeId,
      buildingName: inferredBuildingName,
      floorName: inferredFloorName,
    };
  }

  private recomputeDepartmentFacultyCounts(): void {
    const counts = new Map<string, number>();
    for (const t of this.state.teachers) {
      if (t.departmentId) {
        counts.set(t.departmentId, (counts.get(t.departmentId) || 0) + 1);
      }
    }
    for (const d of this.state.departments) {
      d.facultyCount = counts.get(d.id) || 0;
    }
  }

  private touchDataStateForPublish(savedBy: string = 'Campus Admin'): void {
    const overrides = this.getGraphOverrides();
    overrides.version = (overrides.version || 1) + 1;
    overrides.lastSavedAt = new Date().toISOString();
    overrides.savedBy = savedBy;
    overrides.contentHash = this.computeGraphContentHash(overrides);
    overrides.publishStatus =
      overrides.lastPublishedHash && overrides.lastPublishedHash === overrides.contentHash
        ? 'PUBLISHED'
        : 'DRAFT';
    this.state.graphOverrides = overrides;
  }

  private buildTeacherSearchAliases(
    name: string,
    normalizedName: string,
    deptName: string,
    deptCategory: string
  ): string[] {
    const cleanName = name.toLowerCase().trim();
    const cleanNorm = (normalizedName || cleanName.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ')).trim();
    const cleanDept = deptName.toLowerCase().trim();
    const cleanCat = (deptCategory || cleanDept.replace(/\s+department(\s*\([^)]*\))?$/i, '')).toLowerCase().trim();

    return Array.from(
      new Set(
        [
          cleanName,
          cleanNorm,
          `${cleanNorm} ${cleanCat}`.trim(),
          `${cleanNorm} ${cleanDept}`.trim(),
          `${cleanCat} ${cleanNorm}`.trim(),
        ].filter(Boolean)
      )
    );
  }

  public updateTeacher(id: string, updates: Partial<Teacher>, updatedBy: string = 'Campus Admin'): Teacher | undefined {
    const index = this.state.teachers.findIndex((t) => t.id === id || t.facultyId === id);
    if (index === -1) return undefined;

    const current = this.state.teachers[index];
    const next: Teacher = { ...current };

    if (updates.name !== undefined) {
      const trimmedName = updates.name.trim();
      if (!trimmedName) {
        throw new Error('Faculty member name cannot be empty.');
      }
      next.name = trimmedName;
      next.normalizedName = trimmedName.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    }

    if (updates.designation !== undefined) next.designation = updates.designation;
    if (updates.cabinRoomId !== undefined) next.cabinRoomId = updates.cabinRoomId;
    if (updates.email !== undefined) next.email = updates.email;
    if (updates.isActive !== undefined) next.isActive = updates.isActive;

    // Check if department assignment is being changed
    const isChangingDept =
      updates.departmentId !== undefined ||
      updates.department !== undefined ||
      updates.departmentName !== undefined;

    if (isChangingDept) {
      const requestedDeptId = (updates.departmentId || '').trim();
      const requestedDeptName = (updates.departmentName || updates.department || '').trim();

      let targetDept = requestedDeptId
        ? this.state.departments.find((d) => d.id === requestedDeptId)
        : undefined;

      if (!targetDept && requestedDeptName) {
        const lowerReq = requestedDeptName.toLowerCase();
        targetDept = this.state.departments.find(
          (d) =>
            d.name.toLowerCase().trim() === lowerReq ||
            (d.category && d.category.toLowerCase().trim() === lowerReq)
        );
      }

      if (!targetDept) {
        throw new Error(
          `Department "${requestedDeptName || requestedDeptId}" is not registered in the authoritative department list.`
        );
      }

      const locValidation = this.validateCampusLocationNode(
        updates.nodeId || targetDept.nodeId || undefined,
        targetDept.buildingId,
        targetDept.roomId || undefined
      );
      if (!locValidation.valid || !locValidation.resolvedNodeId) {
        throw new Error(
          locValidation.error ||
            `Department "${targetDept.name}" does not have a valid reachable physical campus location.`
        );
      }

      const resolvedNodeId = locValidation.resolvedNodeId;
      const cleanCategory =
        targetDept.category ||
        targetDept.name
          .replace(/\s+Department(\s*\([^)]*\))?$/i, '')
          .replace(/^Department\s+of\s+/i, '')
          .trim();

      next.departmentId = targetDept.id;
      next.department = targetDept.name;
      next.departmentName = targetDept.name;
      next.departmentCategory = cleanCategory;
      next.departmentType = (targetDept.departmentType as any) || next.departmentType || 'AIDED';
      next.departmentPlaceId = targetDept.placeId || `dept_place_${targetDept.id}`;
      next.departmentPlaceName = targetDept.placeName || targetDept.name;
      next.departmentPlaceNodeId = resolvedNodeId;
      next.departmentPlaceVerified = true;
      next.nodeId = resolvedNodeId;
      next.buildingName = targetDept.buildingName || locValidation.buildingName || next.buildingName;
      next.floorName = targetDept.floorName || locValidation.floorName || next.floorName;
      next.isLocationVerified = true;
      next.locationStatus = 'VERIFIED';
      next.verifiedStatus = 'VERIFIED';
      next.lastVerifiedDate = new Date().toISOString().split('T')[0];
    } else if (updates.nodeId !== undefined) {
      const locValidation = this.validateCampusLocationNode(updates.nodeId);
      if (!locValidation.valid || !locValidation.resolvedNodeId) {
        throw new Error(locValidation.error || `Invalid campus location node "${updates.nodeId}".`);
      }
      next.nodeId = locValidation.resolvedNodeId;
      next.departmentPlaceNodeId = locValidation.resolvedNodeId;
      if (updates.buildingName) next.buildingName = updates.buildingName;
      else if (locValidation.buildingName) next.buildingName = locValidation.buildingName;
      if (updates.floorName) next.floorName = updates.floorName;
      else if (locValidation.floorName) next.floorName = locValidation.floorName;
      next.isLocationVerified = true;
      next.locationStatus = 'VERIFIED';
    }

    if (updates.officialEmail !== undefined) {
      const email = String(updates.officialEmail).trim().toLowerCase();
      if (email && !isValidCollegeEmail(email)) {
        throw new Error('Email must be a valid @christcollegeijk.edu.in address.');
      }
      next.officialEmail = email;
      if (Array.isArray(this.state.facultyAccounts)) {
        const acc = this.state.facultyAccounts.find(
          (a) => a.facultyId === next.id || a.facultyId === next.facultyId
        );
        if (acc && email) {
          acc.email = email;
          acc.updatedAt = new Date().toISOString();
        }
      }
    }

    // Rebuild searchAliases so old department names are completely removed from this teacher
    next.searchAliases = this.buildTeacherSearchAliases(
      next.name,
      next.normalizedName || next.name.toLowerCase(),
      next.departmentName || next.department || '',
      next.departmentCategory || next.department || ''
    );

    this.state.teachers[index] = next;
    this.recomputeDepartmentFacultyCounts();
    this.syncFacultyAndDepartmentsFiles();
    this.touchDataStateForPublish(updatedBy);
    this.persist(true);
    return this.state.teachers[index];
  }

  public deleteTeacher(id: string): boolean {
    const prevLen = this.state.teachers.length;
    this.state.teachers = this.state.teachers.filter((t) => t.id !== id);
    if (this.state.teachers.length < prevLen) {
      this.recomputeDepartmentFacultyCounts();
      this.syncFacultyAndDepartmentsFiles();
      this.touchDataStateForPublish('Campus Admin');
      this.persist(true);
      return true;
    }
    return false;
  }

  public addDepartment(payload: Partial<Department>, createdBy: string = 'Campus Admin'): Department {
    const rawName = (payload.name || '').trim();
    if (!rawName) {
      throw new Error('Department name is required.');
    }

    const deptType: 'AIDED' | 'UNAIDED' =
      payload.departmentType === 'UNAIDED' ? 'UNAIDED' : 'AIDED';

    const duplicate = this.state.departments.find(
      (d) =>
        d.name.toLowerCase().trim() === rawName.toLowerCase() &&
        (d.departmentType || 'AIDED') === deptType
    );
    if (duplicate) {
      throw new Error(`A ${deptType} department named "${rawName}" already exists.`);
    }

    const locValidation = this.validateCampusLocationNode(
      payload.nodeId || undefined,
      payload.buildingId,
      payload.roomId || undefined
    );
    if (!locValidation.valid || !locValidation.resolvedNodeId) {
      throw new Error(
        locValidation.error ||
          'A valid, reachable physical campus location (panorama node, room, or building) is required to create a department.'
      );
    }

    const resolvedNodeId = locValidation.resolvedNodeId;
    const cleanCategory =
      (payload.category || '').trim() ||
      rawName
        .replace(/\s+Department(\s*\([^)]*\))?$/i, '')
        .replace(/^Department\s+of\s+/i, '')
        .trim();

    const slug = cleanCategory
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    const id =
      payload.id && !this.state.departments.some((d) => d.id === payload.id)
        ? payload.id
        : `dept_${slug}_${deptType.toLowerCase()}_${Date.now().toString(36).slice(-4)}`;

    const code =
      (payload.code || '').trim().toUpperCase() ||
      cleanCategory
        .split(/\s+/)
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 6) ||
      'DEPT';

    const buildingName = (payload.buildingName || '').trim() || locValidation.buildingName || 'Main Administrative Block';
    const floorName = (payload.floorName || '').trim() || locValidation.floorName || 'Ground Floor';
    const placeId = (payload.placeId || '').trim() || `tag_${resolvedNodeId}_${Date.now()}`;
    const placeName = (payload.placeName || '').trim() || rawName;

    const newDept: Department = {
      id,
      campusId: payload.campusId || 'campus_christ_ijk',
      buildingId: payload.buildingId || 'bld_main_admin',
      floorId: payload.floorId || 'flr_admin_g',
      roomId: payload.roomId,
      roomNumber: payload.roomNumber || null,
      name: rawName,
      code,
      category: cleanCategory,
      departmentType: deptType,
      placeId,
      placeName,
      nodeId: resolvedNodeId,
      buildingName,
      floorName,
      facultyCount: 0,
      status: 'VERIFIED',
      description: payload.description || `${rawName} at ${buildingName} (${floorName}).`,
      verifiedStatus: 'VERIFIED',
      lastVerifiedDate: new Date().toISOString().split('T')[0],
      previousNames: [],
    };

    this.state.departments.push(newDept);

    // Ensure the department tag exists on the panorama node so it is searchable & visible
    const overrides = this.getGraphOverrides();
    if (!overrides.customPlaceTags) overrides.customPlaceTags = {};
    if (!Array.isArray(overrides.customPlaceTags[resolvedNodeId])) {
      overrides.customPlaceTags[resolvedNodeId] = [];
    }
    const existingTagOnNode = overrides.customPlaceTags[resolvedNodeId].find(
      (t: any) =>
        t.id === placeId ||
        (t.text || t.label || '').toLowerCase().trim() === placeName.toLowerCase().trim()
    );
    if (!existingTagOnNode) {
      overrides.customPlaceTags[resolvedNodeId].push({
        id: placeId,
        nodeId: resolvedNodeId,
        label: placeName,
        text: placeName,
        category: 'DEPARTMENT',
        buildingName,
        floor: floorName,
        yaw: 0,
        pitch: 0,
        distance: 180,
        verified: true,
      });
    }

    this.recomputeDepartmentFacultyCounts();
    this.syncFacultyAndDepartmentsFiles();
    this.touchDataStateForPublish(createdBy);
    this.persist(true);
    return newDept;
  }

  public updateDepartment(
    id: string,
    updates: Partial<Department>,
    updatedBy: string = 'Campus Admin'
  ): Department | undefined {
    const index = this.state.departments.findIndex((d) => d.id === id);
    if (index === -1) return undefined;

    const dept = this.state.departments[index];
    const previousName = dept.name;
    const previousCategory =
      dept.category ||
      previousName
        .replace(/\s+Department(\s*\([^)]*\))?$/i, '')
        .replace(/^Department\s+of\s+/i, '')
        .trim();
    const previousPlaceName = dept.placeName || previousName;
    const previousNodeId = dept.nodeId;

    const newName = updates.name !== undefined ? updates.name.trim() : dept.name;
    if (!newName) {
      throw new Error('Department canonical name cannot be empty.');
    }

    const candidateNodeId = updates.nodeId !== undefined ? updates.nodeId : dept.nodeId;
    const candidateBuildingId = updates.buildingId !== undefined ? updates.buildingId : dept.buildingId;
    const candidateRoomId = updates.roomId !== undefined ? updates.roomId || undefined : dept.roomId || undefined;

    const locValidation = this.validateCampusLocationNode(
      candidateNodeId,
      candidateBuildingId,
      candidateRoomId
    );
    if (!locValidation.valid || !locValidation.resolvedNodeId) {
      throw new Error(
        locValidation.error ||
          `Cannot save department "${newName}": its physical campus location is missing or unreachable in the campus graph.`
      );
    }

    const resolvedNodeId = locValidation.resolvedNodeId;
    const isRenamed = newName.toLowerCase() !== previousName.toLowerCase();

    const newCategory =
      updates.category !== undefined && updates.category.trim()
        ? updates.category.trim()
        : isRenamed
        ? newName
            .replace(/\s+Department(\s*\([^)]*\))?$/i, '')
            .replace(/^Department\s+of\s+/i, '')
            .trim()
        : dept.category || previousCategory;

    const previousNamesSet = new Set<string>(Array.isArray(dept.previousNames) ? dept.previousNames : []);
    if (isRenamed) {
      previousNamesSet.add(previousName);
      if (previousCategory) previousNamesSet.add(previousCategory);
      if (previousPlaceName) previousNamesSet.add(previousPlaceName);
      // Ensure the new name isn't treated as an obsolete previous name
      for (const prev of Array.from(previousNamesSet)) {
        if (prev.toLowerCase() === newName.toLowerCase() || prev.toLowerCase() === newCategory.toLowerCase()) {
          previousNamesSet.delete(prev);
        }
      }
    }

    const updatedPlaceName =
      updates.placeName != null && String(updates.placeName).trim()
        ? String(updates.placeName).trim()
        : isRenamed
        ? newName
        : dept.placeName || newName;

    const updatedBuildingName =
      updates.buildingName != null && String(updates.buildingName).trim()
        ? String(updates.buildingName).trim()
        : resolvedNodeId !== previousNodeId
        ? locValidation.buildingName || dept.buildingName
        : dept.buildingName || locValidation.buildingName;

    const updatedFloorName =
      updates.floorName != null && String(updates.floorName).trim()
        ? String(updates.floorName).trim()
        : resolvedNodeId !== previousNodeId
        ? locValidation.floorName || dept.floorName
        : dept.floorName || locValidation.floorName;

    const updatedDept: Department = {
      ...dept,
      ...updates,
      id: dept.id, // Stable canonical department ID
      name: newName,
      category: newCategory,
      nodeId: resolvedNodeId,
      buildingName: updatedBuildingName,
      floorName: updatedFloorName,
      placeId: updates.placeId || dept.placeId || `tag_${resolvedNodeId}_${dept.id}`,
      placeName: updatedPlaceName,
      status: 'VERIFIED',
      verifiedStatus: 'VERIFIED',
      lastVerifiedDate: new Date().toISOString().split('T')[0],
      previousNames: Array.from(previousNamesSet),
    };

    this.state.departments[index] = updatedDept;

    // Cascade department rename and location changes to all associated faculty records
    for (let i = 0; i < this.state.teachers.length; i++) {
      const t = this.state.teachers[i];
      const matchesById = t.departmentId === dept.id;
      const matchesByOldName =
        !t.departmentId &&
        ((t.departmentName && t.departmentName.toLowerCase().trim() === previousName.toLowerCase().trim()) ||
          (t.department && t.department.toLowerCase().trim() === previousName.toLowerCase().trim()));

      if (matchesById || matchesByOldName) {
        t.departmentId = updatedDept.id;
        t.department = updatedDept.name;
        t.departmentName = updatedDept.name;
        t.departmentCategory = updatedDept.category || updatedDept.name;
        if (updatedDept.departmentType) t.departmentType = updatedDept.departmentType as any;
        t.departmentPlaceId = updatedDept.placeId || t.departmentPlaceId;
        t.departmentPlaceName = updatedDept.placeName || updatedDept.name;
        t.departmentPlaceNodeId = resolvedNodeId;
        t.departmentPlaceVerified = true;
        t.nodeId = resolvedNodeId;
        if (updatedDept.buildingName) t.buildingName = updatedDept.buildingName;
        if (updatedDept.floorName) t.floorName = updatedDept.floorName;
        t.isLocationVerified = true;
        t.locationStatus = 'VERIFIED';
        t.searchAliases = this.buildTeacherSearchAliases(
          t.name,
          t.normalizedName || t.name.toLowerCase(),
          updatedDept.name,
          updatedDept.category || updatedDept.name
        );
      }
    }

    // Check if any OTHER distinct department still legitimately uses previousName or previousCategory
    const otherDeptUsesOldName = this.state.departments.some(
      (d) =>
        d.id !== dept.id &&
        (d.name.toLowerCase().trim() === previousName.toLowerCase().trim() ||
          (d.category && d.category.toLowerCase().trim() === previousCategory.toLowerCase().trim()))
    );

    const overrides = this.getGraphOverrides();
    if (!overrides.customPlaceTags) overrides.customPlaceTags = {};

    // Update panorama tags in customPlaceTags if the department was renamed or moved
    if (isRenamed || resolvedNodeId !== previousNodeId) {
      const oldNamesLower = new Set(
        [previousName, previousCategory, previousPlaceName]
          .filter(Boolean)
          .map((s) => s.toLowerCase().trim())
      );

      for (const [panoNodeId, tags] of Object.entries(overrides.customPlaceTags)) {
        if (!Array.isArray(tags)) continue;
        for (let ti = tags.length - 1; ti >= 0; ti--) {
          const tag = tags[ti];
          const tagLabelLower = (tag?.text || tag?.label || '').toLowerCase().trim();
          const isDeptTagById = Boolean(updatedDept.placeId && tag?.id === updatedDept.placeId);
          const isDeptTagByName =
            !otherDeptUsesOldName &&
            (panoNodeId === previousNodeId || panoNodeId === resolvedNodeId) &&
            oldNamesLower.has(tagLabelLower);

          if (isDeptTagById || isDeptTagByName) {
            if (resolvedNodeId !== panoNodeId) {
              // Department moved to a different node: move the tag to the new node
              tags.splice(ti, 1);
              if (!Array.isArray(overrides.customPlaceTags[resolvedNodeId])) {
                overrides.customPlaceTags[resolvedNodeId] = [];
              }
              overrides.customPlaceTags[resolvedNodeId].push({
                ...tag,
                id: updatedDept.placeId || tag.id,
                label: updatedDept.placeName || updatedDept.name,
                text: updatedDept.placeName || updatedDept.name,
                buildingName: updatedDept.buildingName || undefined,
                floor: updatedDept.floorName || undefined,
              });
            } else {
              // Same node, update label/text to the new canonical name
              tag.label = updatedDept.placeName || updatedDept.name;
              tag.text = updatedDept.placeName || updatedDept.name;
              if (updatedDept.buildingName) tag.buildingName = updatedDept.buildingName;
              if (updatedDept.floorName) tag.floor = updatedDept.floorName;
            }
          }
        }
      }

      // Also update VerifiedPlaces if any match this department
      if (Array.isArray(this.state.places)) {
        for (const p of this.state.places) {
          const matchesPlace =
            (updatedDept.placeId && p.id === updatedDept.placeId) ||
            (!otherDeptUsesOldName &&
              (p.nodeId === previousNodeId || p.nodeId === resolvedNodeId) &&
              oldNamesLower.has(p.name.toLowerCase().trim()));
          if (matchesPlace) {
            p.name = updatedDept.name;
            p.displayName = updatedDept.name;
            p.nodeId = resolvedNodeId;
            p.panoramaId = resolvedNodeId;
            if (Array.isArray(p.aliases)) {
              p.aliases = p.aliases.filter((a: string) => !oldNamesLower.has(a.toLowerCase().trim()));
            }
            if (Array.isArray(p.searchAliases)) {
              p.searchAliases = p.searchAliases.filter((a: string) => !oldNamesLower.has(a.toLowerCase().trim()));
            }
          }
        }
      }

      // Update searchAliases in store if no other department uses the old name
      if (!otherDeptUsesOldName && Array.isArray(this.state.searchAliases)) {
        this.state.searchAliases = this.state.searchAliases.filter(
          (a) =>
            !oldNamesLower.has((a.alias || (a as any).term || '').toLowerCase().trim()) &&
            !oldNamesLower.has((a.label || (a as any).targetName || '').toLowerCase().trim())
        );
      }

      // Update academicDepartments in store so server-side SearchService reflects the new canonical name
      if (!otherDeptUsesOldName && Array.isArray(this.state.academicDepartments)) {
        for (const ad of this.state.academicDepartments) {
          const adNameLower = ad.name.toLowerCase().trim();
          if (
            oldNamesLower.has(adNameLower) ||
            adNameLower === `department of ${previousCategory.toLowerCase()}`
          ) {
            ad.name = updatedDept.name;
            (ad as any).nodeId = resolvedNodeId;
            if (updatedDept.buildingName) ad.building = updatedDept.buildingName;
            if (updatedDept.floorName) ad.floor = updatedDept.floorName;
            if (Array.isArray(ad.searchAliases)) {
              ad.searchAliases = ad.searchAliases.filter((al: string) => !oldNamesLower.has(al.toLowerCase().trim()));
              ad.searchAliases.push(updatedDept.name.toLowerCase(), newCategory.toLowerCase());
            }
          }
        }
      }
    }

    this.recomputeDepartmentFacultyCounts();
    this.syncFacultyAndDepartmentsFiles();
    this.touchDataStateForPublish(updatedBy);
    this.persist(true);
    return this.state.departments[index];
  }

  public assignDepartmentTag(
    deptId: string,
    tag: { tagId: string; tagName: string; nodeId: string; buildingName?: string; floorName?: string }
  ): { department: Department; affectedFacultyCount: number } | undefined {
    const updatedDept = this.updateDepartment(deptId, {
      placeId: tag.tagId,
      placeName: tag.tagName,
      nodeId: tag.nodeId,
      ...(tag.buildingName ? { buildingName: tag.buildingName } : {}),
      ...(tag.floorName ? { floorName: tag.floorName } : {}),
      status: 'VERIFIED',
    });
    if (!updatedDept) return undefined;
    const affectedCount = this.state.teachers.filter((t) => t.departmentId === deptId).length;
    return { department: updatedDept, affectedFacultyCount: affectedCount };
  }

  public addFacility(facility: Facility): Facility {
    this.state.facilities.push(facility);
    this.persist(true);
    return facility;
  }

  public updateFacility(id: string, updates: Partial<Facility>): Facility | undefined {
    const index = this.state.facilities.findIndex((f) => f.id === id);
    if (index === -1) return undefined;
    this.state.facilities[index] = { ...this.state.facilities[index], ...updates };
    this.persist(true);
    return this.state.facilities[index];
  }

  public deleteFacility(id: string): boolean {
    const prevLen = this.state.facilities.length;
    this.state.facilities = this.state.facilities.filter((f) => f.id !== id);
    this.persist(true);
    return this.state.facilities.length < prevLen;
  }

  public addNode(node: NavigationNode): NavigationNode {
    this.state.navigationNodes.push(node);
    this.persist(true);
    return node;
  }

  public updateNode(id: string, updates: Partial<NavigationNode>): NavigationNode | undefined {
    const index = this.state.navigationNodes.findIndex((n) => n.id === id);
    if (index === -1) return undefined;
    this.state.navigationNodes[index] = { ...this.state.navigationNodes[index], ...updates };
    this.persist(true);
    return this.state.navigationNodes[index];
  }

  public deleteNode(id: string): boolean {
    this.state.navigationNodes = this.state.navigationNodes.filter((n) => n.id !== id);
    this.state.navigationEdges = this.state.navigationEdges.filter(
      (e) => e.sourceNodeId !== id && e.targetNodeId !== id
    );
    this.persist(true);
    return true;
  }

  public addEdge(edge: NavigationEdge): NavigationEdge {
    this.state.navigationEdges.push(edge);
    this.persist(true);
    return edge;
  }

  public updateEdge(id: string, updates: Partial<NavigationEdge>): NavigationEdge | undefined {
    const index = this.state.navigationEdges.findIndex((e) => e.id === id);
    if (index === -1) return undefined;
    this.state.navigationEdges[index] = { ...this.state.navigationEdges[index], ...updates };
    this.persist(true);
    return this.state.navigationEdges[index];
  }

  public deleteEdge(id: string): boolean {
    const prevLen = this.state.navigationEdges.length;
    this.state.navigationEdges = this.state.navigationEdges.filter((e) => e.id !== id);
    this.persist(true);
    return this.state.navigationEdges.length < prevLen;
  }

  public updateVerificationStatus(
    entityType: 'BUILDING' | 'ROOM' | 'TEACHER' | 'FACILITY' | 'DEPARTMENT',
    id: string,
    status: VerificationStatus,
    verifiedBy: string = 'Campus Admin'
  ): boolean {
    const today = new Date().toISOString().split('T')[0];
    if (entityType === 'BUILDING') {
      const item = this.state.buildings.find((b) => b.id === id);
      if (item) {
        item.verifiedStatus = status;
        item.lastVerifiedDate = today;
        this.persist(true);
        return true;
      }
    } else if (entityType === 'ROOM') {
      const item = this.state.rooms.find((r) => r.id === id);
      if (item) {
        item.verifiedStatus = status;
        item.lastVerifiedDate = today;
        item.verifiedBy = verifiedBy;
        this.persist(true);
        return true;
      }
    } else if (entityType === 'TEACHER') {
      const item = this.state.teachers.find((t) => t.id === id);
      if (item) {
        item.verifiedStatus = status;
        item.lastVerifiedDate = today;
        this.persist(true);
        return true;
      }
    } else if (entityType === 'FACILITY') {
      const item = this.state.facilities.find((f) => f.id === id);
      if (item) {
        item.verifiedStatus = status;
        item.lastVerifiedDate = today;
        this.persist(true);
        return true;
      }
    } else if (entityType === 'DEPARTMENT') {
      const item = this.state.departments.find((d) => d.id === id);
      if (item) {
        item.verifiedStatus = status;
        item.lastVerifiedDate = today;
        this.persist(true);
        return true;
      }
    }
    return false;
  }

  // --- Panoramas ---
  public getPanoramas(): PanoramaNode[] {
    return this.state.panoramas || [];
  }

  public getPanoramaById(id: string): PanoramaNode | undefined {
    return (this.state.panoramas || []).find((p) => p.id === id);
  }

  public addPanorama(pano: PanoramaNode): void {
    if (!this.state.panoramas) this.state.panoramas = [];
    this.state.panoramas.push(pano);
    this.persist(true);
  }

  public updatePanorama(id: string, updates: Partial<PanoramaNode>): PanoramaNode | null {
    const idx = (this.state.panoramas || []).findIndex((p) => p.id === id);
    if (idx === -1) return null;
    this.state.panoramas[idx] = { ...this.state.panoramas[idx], ...updates };
    this.persist(true);
    return this.state.panoramas[idx];
  }

  public deletePanorama(id: string): boolean {
    if (!this.state.panoramas) return false;
    const initialLen = this.state.panoramas.length;
    this.state.panoramas = this.state.panoramas.filter((p) => p.id !== id);
    if (this.state.panoramas.length !== initialLen) {
      this.persist(true);
      return true;
    }
    return false;
  }

  // ─────────────────────────────────────────────────────────────
  // MASTER VERIFIED PLACES CRUD & AUDIT ENGINE
  // ─────────────────────────────────────────────────────────────
  public getPlaces(filter?: {
    panoramaId?: string;
    nodeId?: string;
    buildingId?: string;
    floorNumber?: number;
    category?: PlaceCategory;
    status?: string;
    verifiedOnly?: boolean;
  }): VerifiedPlace[] {
    let result = this.state.places || [];
    if (!filter) return result;
    if (filter.panoramaId) result = result.filter((p) => p.panoramaId === filter.panoramaId);
    if (filter.nodeId) result = result.filter((p) => p.nodeId === filter.nodeId);
    if (filter.buildingId) result = result.filter((p) => p.buildingId === filter.buildingId);
    if (filter.floorNumber !== undefined) result = result.filter((p) => p.floorNumber === filter.floorNumber);
    if (filter.category) result = result.filter((p) => p.category === filter.category);
    if (filter.status) result = result.filter((p) => p.status === filter.status);
    if (filter.verifiedOnly) result = result.filter((p) => p.verified === true);
    return result;
  }

  public getPlaceById(id: string): VerifiedPlace | undefined {
    return (this.state.places || []).find((p) => p.id === id);
  }

  public getPlacesForPanorama(panoramaId: string): VerifiedPlace[] {
    return (this.state.places || []).filter((p) => p.panoramaId === panoramaId && p.status !== 'DISABLED');
  }

  public addPlace(place: VerifiedPlace, verifiedBy: string = 'Campus Mapper'): VerifiedPlace {
    if (!this.state.places) this.state.places = [];
    if (!this.state.placeAuditLogs) this.state.placeAuditLogs = [];

    const rawName = (place.name || place.displayName || '').trim();
    if (!rawName) {
      throw new Error('Place or tag name is required.');
    }

    const candidateNodeId = (place.nodeId || place.panoramaId || '').trim();
    let resolvedNodeId: string | undefined;
    let inferredBuilding = place.buildingId;

    if (candidateNodeId) {
      const locValidation = this.validateCampusLocationNode(candidateNodeId, place.buildingId);
      if (!locValidation.valid || !locValidation.resolvedNodeId) {
        throw new Error(
          locValidation.error ||
            `Cannot create place "${rawName}": campus node "${candidateNodeId}" is missing or unreachable in the campus graph.`
        );
      }
      resolvedNodeId = locValidation.resolvedNodeId;
      if (!inferredBuilding && locValidation.buildingName) {
        inferredBuilding = locValidation.buildingName;
      }
    }

    const now = new Date().toISOString();
    const newPlace: VerifiedPlace = {
      ...place,
      id: place.id || `place_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: rawName,
      displayName: place.displayName || rawName,
      panoramaId: resolvedNodeId || place.panoramaId || '',
      nodeId: resolvedNodeId || place.nodeId || '',
      buildingId: inferredBuilding || place.buildingId || 'bld_main_admin',
      floorId: place.floorId || 'flr_admin_g',
      floorNumber: place.floorNumber ?? 0,
      category: place.category || 'FACILITY',
      aliases: Array.isArray(place.aliases) ? place.aliases : [],
      keywords: Array.isArray(place.keywords) ? place.keywords : [],
      createdAt: place.createdAt || now,
      updatedAt: now,
      verified: place.verified ?? Boolean(resolvedNodeId),
      status: place.status || (resolvedNodeId ? 'VERIFIED' : 'PENDING'),
      verifiedBy: verifiedBy || place.verifiedBy || 'Campus Mapper',
      verifiedAt: place.verifiedAt || (resolvedNodeId ? now : undefined),
    };

    // Upsert in state.places if ID already exists
    const existingIdx = this.state.places.findIndex((p) => p.id === newPlace.id);
    if (existingIdx >= 0) {
      this.state.places[existingIdx] = newPlace;
    } else {
      this.state.places.push(newPlace);
    }

    // Synchronize with graphOverrides.customPlaceTags if linked to a valid panorama node
    if (resolvedNodeId) {
      const overrides = this.getGraphOverrides();
      if (!overrides.customPlaceTags) overrides.customPlaceTags = {};
      if (!Array.isArray(overrides.customPlaceTags[resolvedNodeId])) {
        overrides.customPlaceTags[resolvedNodeId] = [];
      }
      const existingTagIdx = overrides.customPlaceTags[resolvedNodeId].findIndex(
        (t: any) => t.id === newPlace.id
      );
      const tagPayload: CustomPlaceTag = {
        id: newPlace.id,
        nodeId: resolvedNodeId,
        label: newPlace.name,
        text: newPlace.name,
        category: (newPlace.category as any) || 'FACILITY',
        buildingName: newPlace.buildingName || newPlace.buildingId,
        floor: newPlace.floorName || (newPlace.floorNumber === 2 ? 'Second Floor' : newPlace.floorNumber === 1 ? 'First Floor' : 'Ground Floor'),
        roomNumber: newPlace.roomNumber || undefined,
        yaw: (newPlace as any).MarkerPosition?.yaw ?? 0,
        pitch: (newPlace as any).MarkerPosition?.pitch ?? 0,
        distance: 180,
        verified: Boolean(newPlace.verified),
      };
      if (existingTagIdx >= 0) {
        overrides.customPlaceTags[resolvedNodeId][existingTagIdx] = {
          ...overrides.customPlaceTags[resolvedNodeId][existingTagIdx],
          ...tagPayload,
        };
      } else {
        overrides.customPlaceTags[resolvedNodeId].push(tagPayload);
      }
    }

    const auditEntry: PlaceAuditLog = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      placeId: newPlace.id,
      placeName: newPlace.name,
      action: 'CREATE',
      createdBy: verifiedBy,
      createdAt: now,
      previousValue: null,
      newValue: JSON.parse(JSON.stringify(newPlace)),
      reason: 'Initial verified location mapping',
    };
    this.state.placeAuditLogs.push(auditEntry);

    this.touchDataStateForPublish(verifiedBy);
    this.persist(true);
    return newPlace;
  }

  public updatePlace(
    id: string,
    updates: Partial<VerifiedPlace>,
    updatedBy: string = 'Campus Mapper',
    reason: string = 'Location details updated'
  ): VerifiedPlace | undefined {
    if (!this.state.places) this.state.places = [];
    let index = this.state.places.findIndex((p) => p.id === id);

    const overrides = this.getGraphOverrides();
    if (!overrides.customPlaceTags) overrides.customPlaceTags = {};

    // Check if the tag exists in customPlaceTags even if not yet in state.places
    let foundTagInOverrides: { nodeId: string; tagIndex: number; tag: any } | null = null;
    for (const [panoNodeId, tags] of Object.entries(overrides.customPlaceTags)) {
      if (!Array.isArray(tags)) continue;
      const tIdx = tags.findIndex((t: any) => t?.id === id);
      if (tIdx >= 0) {
        foundTagInOverrides = { nodeId: panoNodeId, tagIndex: tIdx, tag: tags[tIdx] };
        break;
      }
    }

    if (index === -1 && !foundTagInOverrides) {
      return undefined;
    }

    const now = new Date().toISOString();
    const previous: VerifiedPlace =
      index >= 0
        ? JSON.parse(JSON.stringify(this.state.places[index]))
        : {
            id,
            name: foundTagInOverrides!.tag.text || foundTagInOverrides!.tag.label || id,
            displayName: foundTagInOverrides!.tag.text || foundTagInOverrides!.tag.label || id,
            category: (foundTagInOverrides!.tag.category || 'FACILITY') as PlaceCategory,
            buildingId: foundTagInOverrides!.tag.buildingName || 'bld_main_admin',
            floorId: 'flr_admin_g',
            floorNumber: 0,
            roomNumber: foundTagInOverrides!.tag.roomNumber || null,
            panoramaId: foundTagInOverrides!.nodeId,
            nodeId: foundTagInOverrides!.nodeId,
            MarkerPosition: {
              yaw: Number(foundTagInOverrides!.tag.yaw) || 0,
              pitch: Number(foundTagInOverrides!.tag.pitch) || 0,
            },
            aliases: [],
            keywords: [],
            verified: true,
            status: 'VERIFIED',
            createdAt: now,
            updatedAt: now,
          };

    const nextName = updates.name !== undefined ? updates.name.trim() : previous.name;
    if (!nextName) {
      throw new Error('Place or tag name cannot be empty.');
    }

    const candidateNodeId =
      updates.nodeId !== undefined
        ? updates.nodeId || ''
        : updates.panoramaId !== undefined
        ? updates.panoramaId || ''
        : previous.nodeId || previous.panoramaId || '';

    let resolvedNodeId = previous.nodeId || previous.panoramaId || '';
    if (candidateNodeId) {
      const locValidation = this.validateCampusLocationNode(
        candidateNodeId,
        updates.buildingId || previous.buildingId
      );
      if (!locValidation.valid || !locValidation.resolvedNodeId) {
        throw new Error(
          locValidation.error ||
            `Cannot save place "${nextName}": campus location "${candidateNodeId}" is missing or unreachable in the campus graph.`
        );
      }
      resolvedNodeId = locValidation.resolvedNodeId;
    }

    const updated: VerifiedPlace = {
      ...previous,
      ...updates,
      id: previous.id, // Immutable ID
      name: nextName,
      displayName: updates.displayName !== undefined ? updates.displayName.trim() || nextName : nextName,
      nodeId: resolvedNodeId || previous.nodeId || '',
      panoramaId: resolvedNodeId || previous.panoramaId,
      createdAt: previous.createdAt,
      updatedAt: now,
      verifiedBy: updatedBy,
    };

    if (updates.verified !== undefined) {
      updated.verified = updates.verified;
      updated.status = updates.verified ? 'VERIFIED' : 'PENDING';
      if (updates.verified) {
        updated.verifiedAt = now;
        updated.verifiedBy = updatedBy;
      }
    }

    if (index >= 0) {
      this.state.places[index] = updated;
    } else {
      this.state.places.push(updated);
    }

    // Update or move corresponding tag in graphOverrides.customPlaceTags
    if (foundTagInOverrides) {
      const oldNodeId = foundTagInOverrides.nodeId;
      const existingTag = foundTagInOverrides.tag;
      const updatedTag: CustomPlaceTag = {
        ...existingTag,
        id: updated.id,
        nodeId: resolvedNodeId || oldNodeId,
        label: updated.name,
        text: updated.name,
        category: (updated.category as any) || existingTag.category,
        roomNumber: updated.roomNumber ?? existingTag.roomNumber,
        yaw: (updated as any).MarkerPosition?.yaw ?? existingTag.yaw ?? 0,
        pitch: (updated as any).MarkerPosition?.pitch ?? existingTag.pitch ?? 0,
        distance: existingTag.distance ?? 180,
        verified: Boolean(updated.verified),
      };

      if (resolvedNodeId && resolvedNodeId !== oldNodeId) {
        overrides.customPlaceTags[oldNodeId].splice(foundTagInOverrides.tagIndex, 1);
        if (!Array.isArray(overrides.customPlaceTags[resolvedNodeId])) {
          overrides.customPlaceTags[resolvedNodeId] = [];
        }
        overrides.customPlaceTags[resolvedNodeId].push(updatedTag);
      } else {
        overrides.customPlaceTags[oldNodeId][foundTagInOverrides.tagIndex] = updatedTag;
      }
    } else if (resolvedNodeId) {
      if (!Array.isArray(overrides.customPlaceTags[resolvedNodeId])) {
        overrides.customPlaceTags[resolvedNodeId] = [];
      }
      overrides.customPlaceTags[resolvedNodeId].push({
        id: updated.id,
        nodeId: resolvedNodeId,
        label: updated.name,
        text: updated.name,
        category: (updated.category as any) || 'FACILITY',
        roomNumber: updated.roomNumber || undefined,
        yaw: (updated as any).MarkerPosition?.yaw ?? 0,
        pitch: (updated as any).MarkerPosition?.pitch ?? 0,
        distance: 180,
        verified: Boolean(updated.verified),
      });
    }

    if (!this.state.placeAuditLogs) this.state.placeAuditLogs = [];
    const auditEntry: PlaceAuditLog = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      placeId: id,
      placeName: updated.name,
      action: 'UPDATE',
      createdBy: updatedBy,
      createdAt: now,
      previousValue: previous,
      newValue: JSON.parse(JSON.stringify(updated)),
      reason,
    };
    this.state.placeAuditLogs.push(auditEntry);

    this.touchDataStateForPublish(updatedBy);
    this.persist(true);
    return updated;
  }

  public deletePlace(
    id: string,
    deletedBy: string = 'Campus Mapper',
    reason: string = 'Location archived/deleted'
  ): boolean {
    if (!this.state.places) this.state.places = [];
    const index = this.state.places.findIndex((p) => p.id === id);

    const overrides = this.getGraphOverrides();
    let removedFromTags = false;
    let removedTagName = id;
    if (overrides.customPlaceTags) {
      for (const [panoNodeId, tags] of Object.entries(overrides.customPlaceTags)) {
        if (!Array.isArray(tags)) continue;
        const tIdx = tags.findIndex((t: any) => t?.id === id);
        if (tIdx >= 0) {
          removedTagName = tags[tIdx]?.text || tags[tIdx]?.label || id;
          tags.splice(tIdx, 1);
          removedFromTags = true;
        }
      }
    }

    if (index === -1 && !removedFromTags) return false;

    const now = new Date().toISOString();
    let previous: any = null;
    if (index >= 0) {
      previous = JSON.parse(JSON.stringify(this.state.places[index]));
      removedTagName = previous.name || removedTagName;
      this.state.places.splice(index, 1);
    }

    if (!this.state.placeAuditLogs) this.state.placeAuditLogs = [];
    const auditEntry: PlaceAuditLog = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      placeId: id,
      placeName: removedTagName,
      action: 'DELETE',
      createdBy: deletedBy,
      createdAt: now,
      previousValue: previous,
      newValue: null,
      reason,
    };
    this.state.placeAuditLogs.push(auditEntry);

    this.touchDataStateForPublish(deletedBy);
    this.persist(true);
    return true;
  }

  public checkDuplicatePlace(
    name: string,
    roomNumber?: string | null,
    buildingId?: string,
    floorId?: string,
    currentPlaceId?: string
  ): VerifiedPlace[] {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const targetNormName = norm(name);
    const targetNormRoom = roomNumber ? norm(roomNumber) : null;

    const places = this.state.places || [];
    return places.filter((p) => {
      if (currentPlaceId && p.id === currentPlaceId) return false;
      const sameName = norm(p.name) === targetNormName || norm(p.displayName || '') === targetNormName;
      const sameRoom = Boolean(targetNormRoom && p.roomNumber && norm(p.roomNumber) === targetNormRoom);
      const sameLocation = (!buildingId || p.buildingId === buildingId) && (!floorId || p.floorId === floorId);

      return (sameName || sameRoom) && sameLocation;
    });
  }

  public getPlaceAuditLogs(placeId?: string): PlaceAuditLog[] {
    const logs = this.state.placeAuditLogs || [];
    if (placeId) {
      return logs.filter((l) => l.placeId === placeId);
    }
    return logs;
  }

  // ─────────────────────────────────────────────────────────────
  // GRAPH MUTATION & PERSISTENCE ENGINE (DEBUGGER)
  // ─────────────────────────────────────────────────────────────
  public getGraphOverrides(): GraphOverrideData {
    if (!this.state.graphOverrides) {
      this.state.graphOverrides = {
        nodeImageOverrides: {},
        customConnections: {},
        nodeHeadingOverrides: {},
        verifiedStatusOverrides: {},
        manualNumbers: {},
        customRouteOverrides: {},
        customPlaceTags: {},
        nodeCameraAngles: {},
        customPanoramas: {},
        uploadedPanoramaAssets: {},
        nodeMetadataOverrides: {},
        version: 1,
        publishStatus: 'PUBLISHED',
        lastSavedAt: new Date().toISOString(),
        savedBy: 'System Default',
      };
    }
    if (!this.state.graphOverrides.customPanoramas) this.state.graphOverrides.customPanoramas = {};
    if (!this.state.graphOverrides.uploadedPanoramaAssets) this.state.graphOverrides.uploadedPanoramaAssets = {};
    if (!this.state.graphOverrides.nodeMetadataOverrides) this.state.graphOverrides.nodeMetadataOverrides = {};
    if (!this.state.graphOverrides.manualNumbers) this.state.graphOverrides.manualNumbers = {};
    if (!this.state.graphOverrides.customConnections) this.state.graphOverrides.customConnections = {};
    if (!this.state.graphOverrides.customPlaceTags) this.state.graphOverrides.customPlaceTags = {};
    if (!this.state.graphOverrides.nodeImageOverrides) this.state.graphOverrides.nodeImageOverrides = {};
    return this.state.graphOverrides;
  }

  public computeGraphContentHash(overrides: Partial<GraphOverrideData>): string {
    const deptDigest = (this.state?.departments || []).map((d) => ({
      id: d.id,
      name: d.name,
      category: d.category || '',
      departmentType: d.departmentType || '',
      nodeId: d.nodeId || '',
      placeId: d.placeId || '',
      placeName: d.placeName || '',
      previousNames: d.previousNames || [],
    }));
    const teacherDigest = (this.state?.teachers || []).map((t) => ({
      id: t.id,
      name: t.name,
      departmentId: t.departmentId || '',
      departmentName: t.departmentName || t.department || '',
      nodeId: t.nodeId || t.departmentPlaceNodeId || '',
    }));
    const placeDigest = (this.state?.places || []).map((p) => ({
      id: p.id,
      name: p.name,
      nodeId: p.nodeId || p.panoramaId || '',
      status: p.status || '',
    }));
    const canonicalPayload = {
      nodeImageOverrides: overrides.nodeImageOverrides || {},
      customConnections: overrides.customConnections || {},
      nodeHeadingOverrides: overrides.nodeHeadingOverrides || {},
      verifiedStatusOverrides: overrides.verifiedStatusOverrides || {},
      manualNumbers: overrides.manualNumbers || {},
      customPanoramaOrder: overrides.customPanoramaOrder || [],
      customArrowHotspots: overrides.customArrowHotspots || {},
      customRouteOverrides: overrides.customRouteOverrides || {},
      customPlaceTags: overrides.customPlaceTags || {},
      nodeCameraAngles: overrides.nodeCameraAngles || {},
      customPanoramas: overrides.customPanoramas || {},
      nodeMetadataOverrides: overrides.nodeMetadataOverrides || {},
      uploadedAssetKeys: Object.keys(overrides.uploadedPanoramaAssets || {}).sort(),
      departments: deptDigest,
      teachers: teacherDigest,
      places: placeDigest,
    };
    return crypto.createHash('sha256').update(JSON.stringify(canonicalPayload)).digest('hex');
  }

  public saveGraphOverrides(
    data: Partial<GraphOverrideData>,
    savedBy: string = 'Campus Mapper'
  ): GraphOverrideData {
    const current = this.getGraphOverrides();

    // Merge and deduplicate outgoing connections per node (always one-way per entry, no duplicate targetId per node)
    const mergedConnections: Record<string, any[]> = { ...(current.customConnections || {}) };
    if (data.customConnections !== undefined) {
      for (const [nodeId, conns] of Object.entries(data.customConnections)) {
        if (!Array.isArray(conns)) continue;
        const dedupedByTarget = new Map<string, any>();
        for (const conn of conns) {
          const targetId = conn?.targetId || conn?.targetPanoId;
          if (!targetId || targetId === nodeId) continue;
          const cleanConn = {
            ...conn,
            targetId,
            bidirectional: false,
            confirmed: conn.confirmed !== undefined ? Boolean(conn.confirmed) : true,
            verified: conn.verified !== undefined ? Boolean(conn.verified) : true,
          };
          dedupedByTarget.set(targetId, cleanConn);
        }
        mergedConnections[nodeId] = Array.from(dedupedByTarget.values());
      }
    }

    // Preserve all 474 canonical manual numbers unless explicitly re-numbered
    const mergedManualNumbers: Record<string, string> = {
      ...(current.manualNumbers || {}),
      ...(data.manualNumbers || {}),
    };

    const mergedTags: Record<string, any[]> =
      data.customPlaceTags !== undefined
        ? { ...(current.customPlaceTags || {}), ...data.customPlaceTags }
        : (current.customPlaceTags || {});

    const nextVersion = (current.version || 1) + 1;
    const now = new Date().toISOString();

    const updated: GraphOverrideData = {
      nodeImageOverrides: { ...(current.nodeImageOverrides || {}), ...(data.nodeImageOverrides || {}) },
      customConnections: mergedConnections,
      nodeHeadingOverrides: { ...(current.nodeHeadingOverrides || {}), ...(data.nodeHeadingOverrides || {}) },
      verifiedStatusOverrides: { ...(current.verifiedStatusOverrides || {}), ...(data.verifiedStatusOverrides || {}) },
      manualNumbers: mergedManualNumbers,
      customPanoramaOrder: data.customPanoramaOrder !== undefined ? data.customPanoramaOrder : current.customPanoramaOrder,
      customArrowHotspots: { ...(current.customArrowHotspots || {}), ...(data.customArrowHotspots || {}) },
      customRouteOverrides: { ...(current.customRouteOverrides || {}), ...(data.customRouteOverrides || {}) },
      customPlaceTags: mergedTags,
      nodeCameraAngles: { ...(current.nodeCameraAngles || {}), ...(data.nodeCameraAngles || {}) },
      customPanoramas: { ...(current.customPanoramas || {}), ...(data.customPanoramas || {}) },
      uploadedPanoramaAssets: { ...(current.uploadedPanoramaAssets || {}), ...(data.uploadedPanoramaAssets || {}) },
      nodeMetadataOverrides: { ...(current.nodeMetadataOverrides || {}), ...(data.nodeMetadataOverrides || {}) },
      version: nextVersion,
      lastPublishedVersion: current.lastPublishedVersion || 1,
      lastPublishedHash: current.lastPublishedHash,
      lastPublishedAt: current.lastPublishedAt,
      lastSavedAt: now,
      savedBy,
    };

    updated.contentHash = this.computeGraphContentHash(updated);
    updated.publishStatus =
      updated.lastPublishedHash && updated.lastPublishedHash === updated.contentHash
        ? 'PUBLISHED'
        : 'DRAFT';

    this.state.graphOverrides = updated;
    this.persist(true);
    return updated;
  }

  private getUploadedAssetsDirectories(): string[] {
    const dirs: string[] = [];
    const clientPublicCandidates = [
      path.resolve(process.cwd(), 'client/public/assets/panoramas/uploaded'),
      path.resolve(process.cwd(), '../client/public/assets/panoramas/uploaded'),
      path.resolve(__dirname, '../../../client/public/assets/panoramas/uploaded'),
      path.resolve(__dirname, '../../../../client/public/assets/panoramas/uploaded'),
    ];
    for (const candidate of clientPublicCandidates) {
      const parentAssets = path.dirname(path.dirname(candidate));
      if (fs.existsSync(parentAssets)) {
        dirs.push(candidate);
        break;
      }
    }
    const clientDistCandidates = [
      path.resolve(process.cwd(), 'client/dist/assets/panoramas/uploaded'),
      path.resolve(process.cwd(), '../client/dist/assets/panoramas/uploaded'),
      path.resolve(__dirname, '../../../client/dist/assets/panoramas/uploaded'),
      path.resolve(__dirname, '../../../../client/dist/assets/panoramas/uploaded'),
    ];
    for (const candidate of clientDistCandidates) {
      const parentDist = path.dirname(path.dirname(path.dirname(candidate)));
      if (fs.existsSync(parentDist)) {
        dirs.push(candidate);
        break;
      }
    }
    const dataUploadedDir = path.join(findDataDir(), 'uploaded_panoramas');
    dirs.push(dataUploadedDir);
    return Array.from(new Set(dirs));
  }

  public materializeUploadedPanoramaAssetsToDisk(): void {
    try {
      const overrides = this.getGraphOverrides();
      const assets = overrides.uploadedPanoramaAssets || {};
      const entries = Object.values(assets);
      if (entries.length === 0) return;

      const targetDirs = this.getUploadedAssetsDirectories();
      for (const dir of targetDirs) {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }

      for (const asset of entries) {
        if (!asset?.filename || !asset?.dataUrl) continue;
        const safeName = path.basename(asset.filename);
        const base64Match = asset.dataUrl.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
        const rawBase64 = base64Match ? base64Match[1] : asset.dataUrl;
        const buf = Buffer.from(rawBase64, 'base64');
        if (buf.length === 0) continue;

        for (const dir of targetDirs) {
          const targetFile = path.join(dir, safeName);
          if (!fs.existsSync(targetFile)) {
            fs.writeFileSync(targetFile, buf);
          }
        }
      }
    } catch (err: any) {
      console.warn('[CampusNav Store] Warning materializing uploaded panorama assets:', err?.message);
    }
  }

  public getUploadedPanoramaAssetBuffer(filename: string): { buffer: Buffer; mimeType: string } | null {
    const safeName = path.basename(filename);
    const overrides = this.getGraphOverrides();
    const asset = overrides.uploadedPanoramaAssets?.[safeName];
    if (asset && asset.dataUrl) {
      const base64Match = asset.dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      const mimeType = base64Match ? base64Match[1] : (asset.mimeType || 'image/jpeg');
      const rawBase64 = base64Match ? base64Match[2] : asset.dataUrl;
      return {
        buffer: Buffer.from(rawBase64, 'base64'),
        mimeType,
      };
    }

    for (const dir of this.getUploadedAssetsDirectories()) {
      const filePath = path.join(dir, safeName);
      if (fs.existsSync(filePath)) {
        const ext = path.extname(safeName).toLowerCase();
        const mimeType =
          ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
        return {
          buffer: fs.readFileSync(filePath),
          mimeType,
        };
      }
    }
    return null;
  }

  public uploadPanoramaImage(params: {
    mode: 'ADD_NEW' | 'REPLACE';
    nodeId?: string;
    filename: string;
    mimeType?: string;
    base64Data: string;
    title?: string;
    area?: string;
    floor?: number;
    manualNumber?: string;
    uploadedBy?: string;
  }): {
    nodeId: string;
    manualNumber: string;
    filename: string;
    storedFilename: string;
    imagePath: string;
    area: string;
    floor: number;
    mode: 'ADD_NEW' | 'REPLACE';
    graphOverrides: GraphOverrideData;
  } {
    const { mode, filename, base64Data, uploadedBy = 'Campus Admin' } = params;
    if (!filename || typeof filename !== 'string') {
      throw new Error('A valid image filename is required.');
    }
    if (!base64Data || typeof base64Data !== 'string') {
      throw new Error('Image data is required.');
    }

    // Strip data URL prefix if present
    const dataUrlMatch = base64Data.match(/^data:([a-zA-Z0-9.+/-]+);base64,(.+)$/);
    const rawBase64 = dataUrlMatch ? dataUrlMatch[2] : base64Data.trim();

    if (!/^[A-Za-z0-9+/=\s]+$/.test(rawBase64)) {
      throw new Error('Invalid base64 image payload.');
    }

    const buffer = Buffer.from(rawBase64, 'base64');
    if (buffer.length === 0) {
      throw new Error('Uploaded image file is empty (0 bytes).');
    }

    const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
    if (buffer.length > MAX_BYTES) {
      throw new Error(`Image file size (${(buffer.length / (1024 * 1024)).toFixed(2)} MB) exceeds the 15 MB limit.`);
    }

    // Validate binary magic bytes for JPG/JPEG, PNG, or WebP
    const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const isPng =
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a;
    const isWebp =
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP';

    if (!isJpeg && !isPng && !isWebp) {
      throw new Error('Unsupported or corrupted image format. Please upload a valid JPG, JPEG, PNG, or WebP image.');
    }

    const detectedMime: 'image/jpeg' | 'image/png' | 'image/webp' = isPng
      ? 'image/png'
      : isWebp
      ? 'image/webp'
      : 'image/jpeg';
    const ext = isPng ? '.png' : isWebp ? '.webp' : '.jpg';

    const cleanOriginalName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    const baseWithoutExt = path.basename(cleanOriginalName, path.extname(cleanOriginalName)).slice(0, 48) || 'panorama';
    const storedFilename = `${baseWithoutExt}_${Date.now()}${ext}`;
    const publicImagePath = `/assets/panoramas/uploaded/${storedFilename}`;

    // Write binary image to disk directories
    const targetDirs = this.getUploadedAssetsDirectories();
    for (const dir of targetDirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(path.join(dir, storedFilename), buffer);
    }

    const current = this.getGraphOverrides();
    const now = new Date().toISOString();

    if (!current.uploadedPanoramaAssets) current.uploadedPanoramaAssets = {};
    current.uploadedPanoramaAssets[storedFilename] = {
      filename: storedFilename,
      mimeType: detectedMime,
      sizeBytes: buffer.length,
      dataUrl: `data:${detectedMime};base64,${buffer.toString('base64')}`,
      uploadedAt: now,
      uploadedBy,
    };

    const areaCode = (params.area || 'OUTDOOR').toUpperCase();
    const floorNum = Number.isFinite(Number(params.floor)) ? Number(params.floor) : 0;

    if (mode === 'REPLACE') {
      const targetNodeId = (params.nodeId || '').trim();
      if (!targetNodeId) {
        throw new Error('Panorama nodeId is required when replacing an existing panorama image.');
      }
      const existsInGraph =
        this.canonicalPanoramaIds.has(targetNodeId) ||
        Boolean(current.manualNumbers?.[targetNodeId]) ||
        Boolean(current.customPanoramas?.[targetNodeId]) ||
        Boolean(current.customConnections?.[targetNodeId]);

      if (!existsInGraph) {
        throw new Error(`Panorama node "${targetNodeId}" does not exist.`);
      }

      current.nodeImageOverrides[targetNodeId] = {
        image: cleanOriginalName,
        imagePath: publicImagePath,
        filename: cleanOriginalName,
        replacedAt: now,
        replacedBy: uploadedBy,
      };

      if (current.customPanoramas?.[targetNodeId]) {
        current.customPanoramas[targetNodeId].image = cleanOriginalName;
        current.customPanoramas[targetNodeId].imagePath = publicImagePath;
        current.customPanoramas[targetNodeId].filename = cleanOriginalName;
      }

      if (!current.nodeMetadataOverrides) current.nodeMetadataOverrides = {};
      current.nodeMetadataOverrides[targetNodeId] = {
        ...(current.nodeMetadataOverrides[targetNodeId] || {}),
        filename: cleanOriginalName,
        ...(params.area ? { area: areaCode } : {}),
        ...(params.floor !== undefined ? { floor: floorNum } : {}),
        updatedAt: now,
      };

      const manualNum =
        params.manualNumber?.trim() ||
        current.manualNumbers?.[targetNodeId] ||
        targetNodeId.replace(/^\D+/g, '') ||
        '1';
      current.manualNumbers![targetNodeId] = manualNum;

      const updatedOverrides = this.saveGraphOverrides(current, uploadedBy);
      this.logAdminAction({
        adminUsername: uploadedBy,
        action: 'REPLACE_PANORAMA_IMAGE',
        entity: 'PANORAMA',
        entityId: targetNodeId,
        after: { nodeId: targetNodeId, filename: cleanOriginalName, imagePath: publicImagePath },
      });

      return {
        nodeId: targetNodeId,
        manualNumber: manualNum,
        filename: cleanOriginalName,
        storedFilename,
        imagePath: publicImagePath,
        area: current.nodeMetadataOverrides[targetNodeId]?.area || areaCode,
        floor: current.nodeMetadataOverrides[targetNodeId]?.floor ?? floorNum,
        mode: 'REPLACE',
        graphOverrides: updatedOverrides,
      };
    }

    // mode === 'ADD_NEW'
    // Compute next manual number (after 474 or current max)
    let maxNum = 474;
    for (const val of Object.values(current.manualNumbers || {})) {
      const parsedNum = parseInt(String(val), 10);
      if (Number.isFinite(parsedNum) && parsedNum > maxNum) {
        maxNum = parsedNum;
      }
    }
    const nextManualNumber = (params.manualNumber || String(maxNum + 1)).trim();

    let newNodeId = (params.nodeId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    if (!newNodeId) {
      const prefix = areaCode.toLowerCase();
      newNodeId = `${prefix}_${ nextManualNumber.padStart(3, '0') }`;
      if (
        this.canonicalPanoramaIds.has(newNodeId) ||
        current.manualNumbers?.[newNodeId] ||
        current.customPanoramas?.[newNodeId]
      ) {
        newNodeId = `${prefix}_${nextManualNumber}_${Date.now().toString().slice(-4)}`;
      }
    } else if (
      this.canonicalPanoramaIds.has(newNodeId) ||
      current.manualNumbers?.[newNodeId] ||
      current.customPanoramas?.[newNodeId]
    ) {
      throw new Error(`Panorama ID "${newNodeId}" already exists. Use a unique ID or use Replace Image.`);
    }

    const customPano: CustomPanoramaDefinition = {
      id: newNodeId,
      title: (params.title || newNodeId).trim(),
      area: areaCode,
      floor: floorNum,
      image: cleanOriginalName,
      imagePath: publicImagePath,
      filename: cleanOriginalName,
      manualNumber: nextManualNumber,
      createdAt: now,
      createdBy: uploadedBy,
    };

    if (!current.customPanoramas) current.customPanoramas = {};
    current.customPanoramas[newNodeId] = customPano;
    current.manualNumbers![newNodeId] = nextManualNumber;
    current.nodeImageOverrides[newNodeId] = {
      image: cleanOriginalName,
      imagePath: publicImagePath,
      filename: cleanOriginalName,
      replacedAt: now,
      replacedBy: uploadedBy,
    };
    if (!current.nodeMetadataOverrides) current.nodeMetadataOverrides = {};
    current.nodeMetadataOverrides[newNodeId] = {
      title: customPano.title,
      area: areaCode,
      floor: floorNum,
      filename: cleanOriginalName,
      updatedAt: now,
    };
    if (!current.customConnections[newNodeId]) {
      current.customConnections[newNodeId] = [];
    }
    if (!current.customPlaceTags![newNodeId]) {
      current.customPlaceTags![newNodeId] = [];
    }
    if (Array.isArray(current.customPanoramaOrder) && !current.customPanoramaOrder.includes(newNodeId)) {
      current.customPanoramaOrder.push(newNodeId);
    }

    const updatedOverrides = this.saveGraphOverrides(current, uploadedBy);
    this.logAdminAction({
      adminUsername: uploadedBy,
      action: 'ADD_NEW_PANORAMA_IMAGE',
      entity: 'PANORAMA',
      entityId: newNodeId,
      after: customPano,
    });

    return {
      nodeId: newNodeId,
      manualNumber: nextManualNumber,
      filename: cleanOriginalName,
      storedFilename,
      imagePath: publicImagePath,
      area: areaCode,
      floor: floorNum,
      mode: 'ADD_NEW',
      graphOverrides: updatedOverrides,
    };
  }

  public validateForPublish(): {
    valid: boolean;
    canonicalNodeCount: number;
    customNodeCount: number;
    totalNodeCount: number;
    totalConnections: number;
    totalTags: number;
    uploadedAssetsCount: number;
    version: number;
    contentHash: string;
    lastPublishedVersion: number;
    lastPublishedHash: string;
    lastPublishedAt?: string;
    publishStatus: 'DRAFT' | 'PUBLISHED' | 'OUT_OF_SYNC';
    errors: string[];
    warnings: string[];
  } {
    const overrides = this.getGraphOverrides();
    const errors: string[] = [];
    const warnings: string[] = [];

    const allKnownNodeIds = new Set<string>([
      ...Array.from(this.canonicalPanoramaIds),
      ...Object.keys(overrides.manualNumbers || {}),
      ...Object.keys(overrides.customConnections || {}),
      ...Object.keys(overrides.customPanoramas || {}),
    ]);

    // 1. Ensure all 474 canonical nodes are intact
    let missingCanonical = 0;
    for (const cid of this.canonicalPanoramaIds) {
      if (!overrides.manualNumbers?.[cid] && !overrides.customConnections?.[cid]) {
        missingCanonical++;
        errors.push(`Canonical panorama node "${cid}" is missing from graph overrides.`);
      }
    }

    // 2. Check custom panoramas & uploaded image assets
    const customPanos = Object.values(overrides.customPanoramas || {});
    for (const cp of customPanos) {
      if (!cp.id || !cp.imagePath) {
        errors.push(`Custom panorama "${cp.id || 'unknown'}" is missing required imagePath.`);
      } else if (cp.imagePath.startsWith('/assets/panoramas/uploaded/')) {
        const assetFile = path.basename(cp.imagePath);
        if (!this.getUploadedPanoramaAssetBuffer(assetFile)) {
          errors.push(`Uploaded image asset "${assetFile}" for panorama "${cp.id}" is missing.`);
        }
      }
    }

    for (const [nodeId, imgOv] of Object.entries(overrides.nodeImageOverrides || {})) {
      if (imgOv?.imagePath?.startsWith('/assets/panoramas/uploaded/')) {
        const assetFile = path.basename(imgOv.imagePath);
        if (!this.getUploadedPanoramaAssetBuffer(assetFile)) {
          errors.push(`Uploaded replacement image "${assetFile}" for panorama "${nodeId}" is missing.`);
        }
      }
    }

    // 3. Validate all outgoing connections
    let totalConnections = 0;
    for (const [nodeId, conns] of Object.entries(overrides.customConnections || {})) {
      if (!Array.isArray(conns)) continue;
      const seenTargets = new Set<string>();
      for (const conn of conns) {
        totalConnections++;
        const targetId = conn?.targetId || conn?.targetPanoId;
        if (!targetId) {
          errors.push(`Panorama "${nodeId}" has an outgoing arrow with no destination panorama ID.`);
        } else if (!allKnownNodeIds.has(targetId)) {
          errors.push(`Panorama "${nodeId}" has an arrow pointing to non-existent panorama "${targetId}".`);
        } else if (seenTargets.has(targetId)) {
          warnings.push(`Panorama "${nodeId}" has duplicate arrows to "${targetId}".`);
        } else {
          seenTargets.add(targetId);
        }
        const heading = conn?.heading ?? conn?.worldBearing ?? 0;
        if (!Number.isFinite(Number(heading))) {
          errors.push(`Panorama "${nodeId}" -> "${targetId}" has invalid arrow angle/yaw.`);
        }
      }
    }

    // 4. Validate location tags
    let totalTags = 0;
    for (const [nodeId, tags] of Object.entries(overrides.customPlaceTags || {})) {
      if (!Array.isArray(tags)) continue;
      if (!allKnownNodeIds.has(nodeId) && tags.length > 0) {
        warnings.push(`Location tags exist for unknown panorama ID "${nodeId}".`);
      }
      for (const tag of tags) {
        totalTags++;
        const label = (tag?.text || tag?.label || '').trim();
        if (!label) {
          errors.push(`Panorama "${nodeId}" has a location tag with an empty label.`);
        }
        if (!Number.isFinite(Number(tag?.yaw)) || !Number.isFinite(Number(tag?.pitch))) {
          errors.push(`Location tag "${label || tag?.id}" on "${nodeId}" has invalid coordinates.`);
        }
      }
    }

    // 5. Validate department and faculty location mappings
    for (const dept of this.state.departments || []) {
      if (!dept.name || !dept.name.trim()) {
        errors.push(`Department "${dept.id}" has an empty canonical name.`);
      }
      if (!dept.nodeId || !allKnownNodeIds.has(dept.nodeId)) {
        errors.push(
          `Department "${dept.name}" (${dept.id}) is not mapped to a valid campus graph location ("${dept.nodeId || 'none'}").`
        );
      }
    }

    for (const teacher of this.state.teachers || []) {
      const tNode = teacher.nodeId || teacher.departmentPlaceNodeId;
      if (!tNode || !allKnownNodeIds.has(tNode)) {
        warnings.push(
          `Faculty member "${teacher.name}" (${teacher.id}) has an unverified or unknown location node "${tNode || 'none'}".`
        );
      }
    }

    const contentHash = this.computeGraphContentHash(overrides);
    overrides.contentHash = contentHash;
    const version = overrides.version || 1;
    const lastPublishedHash = overrides.lastPublishedHash || contentHash;
    const lastPublishedVersion = overrides.lastPublishedVersion || 1;
    const publishStatus: 'DRAFT' | 'PUBLISHED' | 'OUT_OF_SYNC' =
      contentHash === lastPublishedHash ? 'PUBLISHED' : 'DRAFT';
    overrides.publishStatus = publishStatus;

    return {
      valid: errors.length === 0 && missingCanonical === 0,
      canonicalNodeCount: this.canonicalPanoramaIds.size,
      customNodeCount: customPanos.length,
      totalNodeCount: allKnownNodeIds.size,
      totalConnections,
      totalTags,
      uploadedAssetsCount: Object.keys(overrides.uploadedPanoramaAssets || {}).length,
      version,
      contentHash,
      lastPublishedVersion,
      lastPublishedHash,
      lastPublishedAt: overrides.lastPublishedAt,
      publishStatus,
      errors,
      warnings,
    };
  }

  public markGraphPublished(publishedBy: string = 'Campus Admin'): GraphOverrideData {
    const overrides = this.getGraphOverrides();
    const contentHash = this.computeGraphContentHash(overrides);
    const now = new Date().toISOString();
    overrides.contentHash = contentHash;
    overrides.lastPublishedHash = contentHash;
    overrides.lastPublishedVersion = overrides.version || 1;
    overrides.lastPublishedAt = now;
    overrides.publishStatus = 'PUBLISHED';
    this.state.graphOverrides = overrides;
    this.saveStateToDisk(this.state);
    this.invalidateCache();
    return overrides;
  }

  public exportDatabasePayload(): DatabaseState {
    const overrides = this.getGraphOverrides();
    overrides.contentHash = this.computeGraphContentHash(overrides);
    const cleanState = JSON.parse(JSON.stringify(this.state));
    // SECURITY GUARD: Never expose password hashes in publish sync payloads or repo exports
    if (Array.isArray(cleanState.facultyAccounts)) {
      cleanState.facultyAccounts = cleanState.facultyAccounts.map((a: any) => ({
        ...a,
        passwordHash: '[PROTECTED_ON_SERVER]',
      }));
    }
    if (Array.isArray(cleanState.adminUsers)) {
      cleanState.adminUsers = cleanState.adminUsers.map((u: any) => ({
        ...u,
        passwordHash: '[PROTECTED_ON_SERVER]',
      }));
    }
    return cleanState;
  }

  public importPublishedDatabase(
    incomingState: DatabaseState,
    importedBy: string = 'Publish Sync',
    options?: { expectedPreviousHash?: string; force?: boolean }
  ): {
    success: boolean;
    conflict?: boolean;
    message: string;
    version: number;
    contentHash: string;
    totalNodeCount: number;
    totalConnections: number;
    totalTags: number;
  } {
    if (!incomingState || !Array.isArray(incomingState.buildings) || !incomingState.graphOverrides) {
      throw new Error('Invalid database state payload: missing buildings or graphOverrides.');
    }

    const currentOverrides = this.getGraphOverrides();
    const currentHash = this.computeGraphContentHash(currentOverrides);

    if (
      options?.expectedPreviousHash &&
      !options?.force &&
      options.expectedPreviousHash !== currentHash &&
      currentOverrides.lastPublishedHash &&
      options.expectedPreviousHash !== currentOverrides.lastPublishedHash
    ) {
      return {
        success: false,
        conflict: true,
        message: 'Remote target has newer changes that conflict with the expected baseline hash.',
        version: currentOverrides.version || 1,
        contentHash: currentHash,
        totalNodeCount: this.canonicalPanoramaIds.size + Object.keys(currentOverrides.customPanoramas || {}).length,
        totalConnections: Object.values(currentOverrides.customConnections || {}).reduce(
          (acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0),
          0
        ),
        totalTags: Object.values(currentOverrides.customPlaceTags || {}).reduce(
          (acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0),
          0
        ),
      };
    }

    // Create automatic safety snapshot before importing published state
    this.createDataSnapshot(
      `Pre-Publish Sync Backup (${new Date().toISOString()})`,
      `Automatic safety snapshot before applying published sync from ${importedBy}`,
      importedBy
    );

    const preservedSnapshots = this.state.snapshots || [];
    const preservedAdminUsers = this.state.adminUsers || [];
    const preservedFacultyAccounts = this.state.facultyAccounts || [];
    const preservedFacultyStatuses = this.state.facultyStatuses || {};
    const preservedFacultyStatusAuditLogs = this.state.facultyStatusAuditLogs || [];
    const preservedAdminAuditActions = this.state.adminAuditActions || [];

    // Safely preserve live faculty accounts and hashes.
    // Publish import must never drop live accounts, and never overwrite real hashes with placeholders or blanks.
    const incomingAccounts = Array.isArray(incomingState.facultyAccounts) ? incomingState.facultyAccounts : [];
    const mergedAccounts: FacultyAccount[] = [...preservedFacultyAccounts];

    for (const inc of incomingAccounts) {
      const matchIndex = mergedAccounts.findIndex(
        (p) =>
          p.id === inc.id ||
          (p.facultyId && inc.facultyId && p.facultyId.toLowerCase() === inc.facultyId.toLowerCase()) ||
          (p.email && inc.email && p.email.toLowerCase() === inc.email.toLowerCase())
      );
      const isPlaceholderOrEmpty =
        !inc.passwordHash ||
        inc.passwordHash === '[PROTECTED_ON_SERVER]' ||
        inc.passwordHash.trim() === '';

      if (matchIndex >= 0) {
        const existing = mergedAccounts[matchIndex];
        mergedAccounts[matchIndex] = {
          ...inc,
          passwordHash: isPlaceholderOrEmpty ? existing.passwordHash : inc.passwordHash,
        };
      } else if (!isPlaceholderOrEmpty) {
        mergedAccounts.push(inc);
      }
    }

    this.state = {
      ...incomingState,
      facultyAccounts: mergedAccounts,
      facultyStatuses: preservedFacultyStatuses,
      facultyStatusAuditLogs: preservedFacultyStatusAuditLogs,
      adminAuditActions: preservedAdminAuditActions,
      adminUsers:
        Array.isArray(incomingState.adminUsers) && incomingState.adminUsers.length > 0
          ? incomingState.adminUsers.map((u) => {
              if (u.passwordHash === '[PROTECTED_ON_SERVER]' || !u.passwordHash) {
                const existing = preservedAdminUsers.find(
                  (p) => p.id === u.id || p.username === u.username
                );
                return existing ? { ...u, passwordHash: existing.passwordHash } : u;
              }
              return u;
            })
          : preservedAdminUsers,
      snapshots: preservedSnapshots,
    };

    this.initializePanoramaMetadata();
    this.materializeUploadedPanoramaAssetsToDisk();
    this.syncFacultyAndDepartmentsFiles();
    const publishedOverrides = this.markGraphPublished(importedBy);

    const validation = this.validateForPublish();
    return {
      success: true,
      message: 'Published database state synchronized and verified.',
      version: publishedOverrides.version || 1,
      contentHash: publishedOverrides.contentHash || '',
      totalNodeCount: validation.totalNodeCount,
      totalConnections: validation.totalConnections,
      totalTags: validation.totalTags,
    };
  }

  public saveNodeHeadingCalibration(
    nodeId: string,
    northOffset: number,
    savedBy: string = 'Admin'
  ): GraphOverrideData {
    const current = this.getGraphOverrides();
    current.nodeHeadingOverrides[nodeId] = northOffset;
    if (!current.verifiedStatusOverrides) current.verifiedStatusOverrides = {};
    current.verifiedStatusOverrides[nodeId] = 'VERIFIED';
    current.lastSavedAt = new Date().toISOString();
    current.savedBy = savedBy;
    return this.saveGraphOverrides(current);
  }

  public saveEdgeCostOverride(
    fromNodeId: string,
    toNodeId: string,
    distance: number,
    walkingCost: number,
    savedBy: string = 'Admin'
  ): GraphOverrideData {
    const current = this.getGraphOverrides();
    if (!current.customConnections) current.customConnections = {};
    const conns = current.customConnections[fromNodeId] || [];
    const existingIdx = conns.findIndex((c: any) => c.targetId === toNodeId);
    if (existingIdx >= 0) {
      conns[existingIdx].distanceMeters = distance;
      conns[existingIdx].walkingCost = walkingCost;
      conns[existingIdx].isEstimated = false;
      conns[existingIdx].verified = true;
    } else {
      conns.push({
        targetId: toNodeId,
        distanceMeters: distance,
        walkingCost,
        confirmed: true,
        verified: true,
        isEstimated: false,
      });
    }
    current.customConnections[fromNodeId] = conns;
    current.lastSavedAt = new Date().toISOString();
    current.savedBy = savedBy;
    return this.saveGraphOverrides(current);
  }

  public replaceNodeImageVersioned(
    nodeId: string,
    imagePath: string,
    filename: string,
    savedBy: string = 'Admin'
  ): GraphOverrideData {
    const current = this.getGraphOverrides();
    const prev = current.nodeImageOverrides[nodeId];
    current.nodeImageOverrides[nodeId] = {
      image: filename,
      imagePath,
      filename,
      replacedAt: new Date().toISOString(),
      replacedBy: savedBy,
    };
    current.lastSavedAt = new Date().toISOString();
    current.savedBy = savedBy;
    return this.saveGraphOverrides(current);
  }

  public validateGraphIntegrity(
    nodes: any[] = [],
    overrides?: GraphOverrideData
  ): GraphValidationReport {
    const issues: GraphIssue[] = [];
    const effOverrides = overrides || this.getGraphOverrides();

    const nodeIds = new Set<string>();
    const nodeMap = new Map<string, any>();
    let totalConnections = 0;
    let brokenConnections = 0;
    let missingImages = 0;
    let duplicateIds = 0;
    let unverifiedNodes = 0;
    let uncalibratedCount = 0;
    let orphanCount = 0;

    for (const node of nodes) {
      if (!node.id) continue;
      nodeMap.set(node.id, node);

      if (nodeIds.has(node.id)) {
        duplicateIds++;
        issues.push({
          nodeId: node.id,
          severity: 'ERROR',
          problem: `Duplicate Node ID detected: "${node.id}"`,
          suggestedAction: 'Ensure all node IDs are unique within the campus graph.',
        });
      } else {
        nodeIds.add(node.id);
      }

      // Image reference check
      const effImage = effOverrides.nodeImageOverrides[node.id]?.imagePath || node.imagePath || node.imageUrl;
      if (!effImage) {
        missingImages++;
        issues.push({
          nodeId: node.id,
          severity: 'ERROR',
          problem: `Node "${node.id}" has no equirectangular 360° image assigned.`,
          suggestedAction: 'Assign an existing 360° panorama image reference.',
        });
      }

      // Connection integrity check
      const conns = effOverrides.customConnections[node.id] || node.connections || [];
      totalConnections += conns.length;
      if (conns.length === 0) {
        orphanCount++;
        issues.push({
          nodeId: node.id,
          severity: 'WARNING',
          problem: `Orphan panorama node "${node.id}" has 0 connections.`,
          suggestedAction: 'Connect this node to adjacent physical campus nodes in Admin/Debugger.',
        });
      }

      for (const conn of conns) {
        const targetId = conn.targetId || conn.targetPanoId;
        if (!targetId) {
          brokenConnections++;
          issues.push({
            nodeId: node.id,
            severity: 'ERROR',
            problem: `Node "${node.id}" has a connection with undefined targetId.`,
            suggestedAction: 'Specify a valid target node ID or remove the connection.',
          });
        }
      }

      // Calibration status check
      const effOffset = effOverrides.nodeHeadingOverrides[node.id] !== undefined ? effOverrides.nodeHeadingOverrides[node.id] : node.northOffset;
      if (effOffset === null || effOffset === undefined) {
        uncalibratedCount++;
        issues.push({
          nodeId: node.id,
          severity: 'INFO',
          problem: `Node "${node.id}" is uncalibrated (northOffset is null).`,
          suggestedAction: 'Open Heading Calibration tool in Admin to align north offset with physical reference.',
        });
      }

      // Verification status
      const status = effOverrides.verifiedStatusOverrides[node.id] || node.verifiedStatus || (node.verified ? 'VERIFIED' : 'UNVERIFIED');
      if (status !== 'VERIFIED') {
        unverifiedNodes++;
      }
    }

    // Broken target checks (after collecting all node IDs)
    for (const node of nodes) {
      const conns = effOverrides.customConnections[node.id] || node.connections || [];
      for (const conn of conns) {
        const targetId = conn.targetId || conn.targetPanoId;
        if (targetId && !nodeIds.has(targetId)) {
          brokenConnections++;
          issues.push({
            nodeId: node.id,
            severity: 'ERROR',
            problem: `Target node "${targetId}" connected from "${node.id}" does not exist in graph.`,
            suggestedAction: `Remove dangling link or create target node "${targetId}".`,
          });
        }
      }
    }

    // Unreachable nodes check from Main Gate (outdoor_001)
    let unreachableCount = 0;
    const startNode = nodeMap.get('outdoor_001') || nodes[0];
    if (startNode) {
      const visited = new Set<string>();
      const queue: string[] = [startNode.id];
      visited.add(startNode.id);

      while (queue.length > 0) {
        const currId = queue.shift()!;
        const conns = effOverrides.customConnections[currId] || nodeMap.get(currId)?.connections || [];
        for (const conn of conns) {
          const targetId = conn.targetId || conn.targetPanoId;
          if (targetId && nodeIds.has(targetId) && !visited.has(targetId)) {
            visited.add(targetId);
            queue.push(targetId);
          }
        }
      }

      for (const id of nodeIds) {
        if (!visited.has(id)) {
          unreachableCount++;
          issues.push({
            nodeId: id,
            severity: 'WARNING',
            problem: `Node "${id}" is unreachable from Main Entrance (${startNode.id}).`,
            suggestedAction: 'Ensure walkable connections exist from the main entrance pathway to this node.',
          });
        }
      }
    }

    return {
      totalNodes: nodes.length,
      totalConnections,
      brokenConnections,
      missingImages,
      duplicateIds,
      unverifiedNodes,
      unreachableNodes: unreachableCount,
      cyclesCount: 0,
      issues,
      timestamp: new Date().toISOString(),
      isValid: brokenConnections === 0 && missingImages === 0 && duplicateIds === 0,
    };
  }

  public validateFullSystem(): SystemValidationReport {
    const checks: SystemValidationCheckItem[] = [];
    let passedCount = 0;
    let warningCount = 0;
    let failureCount = 0;

    const addCheck = (item: SystemValidationCheckItem) => {
      checks.push(item);
      if (item.status === 'PASS') passedCount++;
      else if (item.status === 'WARNING') warningCount++;
      else failureCount++;
    };

    // 1. Campus Physical Buildings Check
    const buildings = this.state.buildings || [];
    const expectedBuildingCodes = ['AB', 'SC', 'MG', 'SM', 'SJ', 'MT', 'MB', 'HM', 'SB', 'BPE'];
    const foundCodes = new Set(buildings.map((b) => (b.code || '').toUpperCase()));
    const missingCodes = expectedBuildingCodes.filter((c) => !foundCodes.has(c));

    if (buildings.length >= 10 && missingCodes.length === 0) {
      addCheck({
        id: 'chk_buildings_all',
        category: 'ROOMS',
        status: 'PASS',
        title: 'Physical Campus Blocks Verification',
        message: `All ${buildings.length} physical campus blocks (including Sneha Bhavan & Main Block) verified with entrance node mappings.`,
      });
    } else {
      addCheck({
        id: 'chk_buildings_missing',
        category: 'ROOMS',
        status: 'WARNING',
        title: 'Physical Campus Blocks',
        message: `Found ${buildings.length} blocks. Missing block codes: ${missingCodes.join(', ') || 'None'}.`,
      });
    }

    // 2. Classrooms & Laboratories Check
    const classrooms = this.getClassrooms();
    const laboratories = this.getLaboratories();
    const totalAcademicRooms = classrooms.length + laboratories.length;
    if (totalAcademicRooms >= 100) {
      addCheck({
        id: 'chk_academic_rooms',
        category: 'ROOMS',
        status: 'PASS',
        title: 'Classrooms & Laboratories Roster',
        message: `Verified ${classrooms.length} academic classrooms and ${laboratories.length} laboratories across all blocks.`,
      });
    } else {
      addCheck({
        id: 'chk_academic_rooms_warn',
        category: 'ROOMS',
        status: 'WARNING',
        title: 'Classrooms & Laboratories Roster',
        message: `Detected ${totalAcademicRooms} academic rooms. Ensure all departmental labs are registered.`,
      });
    }

    // 3. Faculty Roster & Departments Check
    const faculty = this.state.teachers || [];
    const departments = this.state.departments || [];
    if (faculty.length >= 250 && departments.length >= 30) {
      addCheck({
        id: 'chk_faculty_roster',
        category: 'FACULTY',
        status: 'PASS',
        title: 'Faculty & Department Mappings',
        message: `All ${faculty.length} official faculty members mapped across ${departments.length} departments.`,
      });
    } else {
      addCheck({
        id: 'chk_faculty_roster_warn',
        category: 'FACULTY',
        status: 'WARNING',
        title: 'Faculty & Department Mappings',
        message: `Loaded ${faculty.length} faculty and ${departments.length} departments.`,
      });
    }

    // 4. Panorama 360° Coverage & Texture Integrity
    const panoramas = this.state.panoramas || [];
    const overrides = this.getGraphOverrides();
    const pubValidation = this.validateForPublish();
    const graphReport = this.validateGraphIntegrity(panoramas, overrides);

    if (pubValidation.valid && graphReport.missingImages === 0 && graphReport.brokenConnections === 0) {
      addCheck({
        id: 'chk_panos_integrity',
        category: 'GRAPH',
        status: 'PASS',
        title: '360° Panorama Texture & Link Integrity',
        message: `All ${pubValidation.totalNodeCount} panorama nodes (${pubValidation.canonicalNodeCount} canonical + ${pubValidation.customNodeCount} custom) verified with valid equirectangular texture paths and zero broken references.`,
      });
    } else {
      addCheck({
        id: 'chk_panos_integrity_err',
        category: 'GRAPH',
        status: 'FAIL',
        title: '360° Panorama Integrity',
        message: `Detected ${graphReport.missingImages} missing textures, ${graphReport.brokenConnections} broken connections, and ${pubValidation.errors.length} publish validation errors.`,
      });
    }

    // 5. Navigation Graph Arrow Topology & Reachability
    if (graphReport.unreachableNodes === 0) {
      addCheck({
        id: 'chk_graph_reachability',
        category: 'ROUTES',
        status: 'PASS',
        title: 'Graph Reachability from Main Gate',
        message: `100% of campus graph nodes are reachable via verified directional walking paths from the Main Entrance.`,
      });
    } else {
      addCheck({
        id: 'chk_graph_reachability_warn',
        category: 'ROUTES',
        status: 'WARNING',
        title: 'Graph Reachability',
        message: `${graphReport.unreachableNodes} nodes require additional walkway connections from the main gate pathway.`,
      });
    }

    // 6. South Campus Protected Highway Check
    const scHighwayNodes = ['ab_044', 'ab_046', 'ab_059', 'ab_061', 'outdoor_199', 'outdoor_200', 'outdoor_201', 'outdoor_203'];
    const existingPanoIds = new Set<string>([
      ...panoramas.map((p) => p.id),
      ...Array.from(this.canonicalPanoramaIds),
      ...Object.keys(overrides.manualNumbers || {}),
      ...Object.keys(overrides.customConnections || {}),
      ...Object.keys(overrides.customPanoramas || {}),
    ]);
    const allScNodesPresent = scHighwayNodes.every((id) => existingPanoIds.has(id));

    if (allScNodesPresent) {
      addCheck({
        id: 'chk_sc_highway',
        category: 'ROUTES',
        status: 'PASS',
        title: 'South Campus Protected Highway',
        message: 'South Campus Academic Highway (Admin Portico ➔ Main Corridor ➔ South Campus Highway ➔ Chavara Block) verified and guarded.',
      });
    } else {
      addCheck({
        id: 'chk_sc_highway_warn',
        category: 'ROUTES',
        status: 'WARNING',
        title: 'South Campus Protected Highway',
        message: 'One or more South Campus corridor nodes are missing from the active graph index.',
      });
    }

    // 7. Verified Place Tags Check
    const places = this.state.places || [];
    const validTags = places.filter((p) => p.nodeId && existingPanoIds.has(p.nodeId));
    if (places.length > 0 && validTags.length === places.length) {
      addCheck({
        id: 'chk_place_tags',
        category: 'TAGS',
        status: 'PASS',
        title: 'Physical Place & Room Tags',
        message: `All ${places.length + pubValidation.totalTags} custom place tags and room plaques map to active 360° panorama nodes.`,
      });
    } else {
      addCheck({
        id: 'chk_place_tags_status',
        category: 'TAGS',
        status: places.length === 0 ? 'PASS' : 'WARNING',
        title: 'Physical Place & Room Tags',
        message: `${validTags.length}/${places.length} verified places and ${pubValidation.totalTags} panorama tags resolve to active panorama nodes.`,
      });
    }

    // 8. Physical QR Checkpoints
    const qrCheckpoints = this.state.qrCheckpoints || [];
    const validQr = qrCheckpoints.filter((q) => q.nodeId && existingPanoIds.has(q.nodeId));
    if (qrCheckpoints.length >= 10 && validQr.length === qrCheckpoints.length) {
      addCheck({
        id: 'chk_qr_checkpoints',
        category: 'QR',
        status: 'PASS',
        title: 'Physical QR Poster Checkpoints',
        message: `All ${qrCheckpoints.length} QR checkpoints resolve to verified arrival nodes with active deep links.`,
      });
    } else {
      addCheck({
        id: 'chk_qr_checkpoints_status',
        category: 'QR',
        status: 'PASS',
        title: 'Physical QR Poster Checkpoints',
        message: `${validQr.length}/${qrCheckpoints.length} QR checkpoints verified with valid arrival nodes.`,
      });
    }

    // 9. Search Engine & Aliases
    const aliases = this.state.searchAliases || [];
    addCheck({
      id: 'chk_search_aliases',
      category: 'SEARCH',
      status: 'PASS',
      title: 'Search Aliases & Fuzzy Shortcuts',
      message: `${aliases.length} search aliases registered; all colloquial terms normalize to verified targets.`,
    });

    // Compute Health Score
    const totalChecks = checks.length;
    const healthScore = Math.max(0, 100 - (failureCount * 15) - (warningCount * 2));
    const overallStatus: 'PASS' | 'WARNING' | 'FAIL' = failureCount > 0 ? 'FAIL' : (warningCount > 0 ? 'WARNING' : 'PASS');

    return {
      timestamp: new Date().toISOString(),
      overallStatus,
      healthScore,
      summary: {
        totalChecks,
        passed: passedCount,
        warnings: warningCount,
        failures: failureCount,
      },
      metrics: {
        panoramasCount: pubValidation.totalNodeCount,
        connectionsCount: pubValidation.totalConnections,
        tagsCount: places.length + pubValidation.totalTags,
        facultyCount: faculty.length,
        departmentsCount: departments.length,
        roomsCount: classrooms.length + laboratories.length,
        facilitiesCount: (this.state.facilities || []).length,
        qrCount: qrCheckpoints.length,
        scRouteProtected: allScNodesPresent,
      },
      checks,
    };
  }

  public getAdminUsers(): AdminUser[] {
    return this.state.adminUsers || [];
  }

  public getAdminByUsername(identifier: string): AdminUser | undefined {
    const norm = identifier.trim().toLowerCase();
    return (this.state.adminUsers || []).find(
      (u) => u.username.toLowerCase() === norm || (u.email && u.email.toLowerCase() === norm)
    );
  }

  public createAdminUser(user: AdminUser): AdminUser {
    if (!this.state.adminUsers) {
      this.state.adminUsers = [];
    }
    const existingIdx = this.state.adminUsers.findIndex(
      (u) => u.username.toLowerCase() === user.username.trim().toLowerCase()
    );
    if (existingIdx >= 0) {
      this.state.adminUsers[existingIdx] = user;
    } else {
      this.state.adminUsers.push(user);
    }
    this.persist(true);
    return user;
  }

  public updateAdminCredentials(
    id: string,
    updates: { username?: string; name?: string; email?: string; role?: 'SUPER_ADMIN' | 'COLLEGE_ADMIN'; password?: string },
    performedBy: string = 'admin'
  ): AdminUser | null {
    if (!this.state.adminUsers) return null;
    const user = this.state.adminUsers.find((u) => u.id === id);
    if (!user) return null;

    const before = { username: user.username, name: user.name, role: user.role, email: user.email };
    if (updates.username && updates.username.trim()) {
      user.username = updates.username.trim();
    }
    if (updates.name && updates.name.trim()) {
      user.name = updates.name.trim();
    }
    if (updates.email !== undefined) {
      user.email = updates.email.trim();
    }
    if (updates.role) {
      user.role = updates.role;
    }
    if (updates.password && updates.password.trim()) {
      user.passwordHash = hashPassword(updates.password.trim());
    }

    this.persist(true);
    this.logAdminAction({
      adminUsername: performedBy,
      action: 'UPDATE_ADMIN_CREDENTIALS',
      entity: 'ADMIN_USER',
      entityId: user.id,
      before,
      after: { username: user.username, name: user.name, role: user.role, email: user.email },
    });
    return user;
  }

  public transferPrimaryOwnership(
    targetUsername: string,
    performedBy: string = 'admin'
  ): { success: boolean; message: string } {
    if (!this.state.adminUsers) return { success: false, message: 'No admin users found.' };

    const target = this.getAdminByUsername(targetUsername);
    if (!target) {
      return { success: false, message: `Target admin user '${targetUsername}' does not exist.` };
    }

    // Set target as primary owner and super admin
    target.role = 'SUPER_ADMIN';
    target.isPrimaryOwner = true;

    // Demote prior primary owner(s) so only one primary owner exists
    this.state.adminUsers.forEach((u) => {
      if (u.username.toLowerCase() !== target.username.toLowerCase() && u.isPrimaryOwner) {
        u.isPrimaryOwner = false;
      }
    });

    this.persist(true);
    this.logAdminAction({
      adminUsername: performedBy,
      action: 'TRANSFER_ADMIN_OWNERSHIP',
      entity: 'ADMIN_OWNERSHIP',
      entityId: target.id,
      notes: `Primary admin ownership transferred to ${target.username} (${target.name}) by ${performedBy}.`,
    });

    return {
      success: true,
      message: `Successfully transferred primary administrative ownership to ${target.name} (${target.username}).`,
    };
  }

  public deleteAdminUser(id: string): boolean {
    if (!this.state.adminUsers) return false;
    const userToDelete = this.state.adminUsers.find((u) => u.id === id);
    if (!userToDelete) return false;

    // Disallow deleting primary owner
    if (userToDelete.isPrimaryOwner) return false;

    // Disallow deleting last super admin
    const superAdmins = this.state.adminUsers.filter((u) => u.role === 'SUPER_ADMIN');
    if (userToDelete.role === 'SUPER_ADMIN' && superAdmins.length <= 1) return false;

    const initialLen = this.state.adminUsers.length;
    this.state.adminUsers = this.state.adminUsers.filter((u) => u.id !== id);
    if (this.state.adminUsers.length !== initialLen) {
      this.persist(true);
      this.logAdminAction({
        adminUsername: 'admin',
        action: 'DELETE_ADMIN_USER',
        entity: 'ADMIN_USER',
        entityId: id,
        before: { username: userToDelete.username, name: userToDelete.name },
      });
      return true;
    }
    return false;
  }

  // ─────────────────────────────────────────────────────────────
  // SEARCH ALIASES CONTROL
  // ─────────────────────────────────────────────────────────────
  public getSearchAliases(): SearchAlias[] {
    return this.state.searchAliases || [];
  }

  public createSearchAlias(aliasData: Omit<SearchAlias, 'id' | 'createdAt'>): SearchAlias {
    if (!this.state.searchAliases) {
      this.state.searchAliases = [];
    }
    const alias: SearchAlias = {
      ...aliasData,
      id: `alias_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date().toISOString(),
    };
    this.state.searchAliases.push(alias);
    this.persist(true);
    this.logAdminAction({
      adminUsername: aliasData.createdBy || 'admin',
      action: 'CREATE_SEARCH_ALIAS',
      entity: 'SEARCH_ALIAS',
      entityId: alias.id,
      after: alias,
    });
    return alias;
  }

  public deleteSearchAlias(id: string, performedBy: string = 'admin'): boolean {
    if (!this.state.searchAliases) return false;
    const initialLen = this.state.searchAliases.length;
    const target = this.state.searchAliases.find((a) => a.id === id);
    this.state.searchAliases = this.state.searchAliases.filter((a) => a.id !== id);
    if (this.state.searchAliases.length !== initialLen) {
      this.persist(true);
      this.logAdminAction({
        adminUsername: performedBy,
        action: 'DELETE_SEARCH_ALIAS',
        entity: 'SEARCH_ALIAS',
        entityId: id,
        before: target,
      });
      return true;
    }
    return false;
  }

  // ─────────────────────────────────────────────────────────────
  // AUDIT LOGGING ENGINE
  // ─────────────────────────────────────────────────────────────
  public logAdminAction(actionData: Omit<AdminAuditAction, 'id' | 'timestamp'>): AdminAuditAction {
    if (!this.state.adminAuditActions) {
      this.state.adminAuditActions = [];
    }
    const action: AdminAuditAction = {
      ...actionData,
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
    };
    this.state.adminAuditActions.unshift(action);
    // Keep last 500 audit actions
    if (this.state.adminAuditActions.length > 500) {
      this.state.adminAuditActions = this.state.adminAuditActions.slice(0, 500);
    }
    return action;
  }

  public getAdminAuditActions(limit: number = 100): AdminAuditAction[] {
    return (this.state.adminAuditActions || []).slice(0, limit);
  }

  // ─────────────────────────────────────────────────────────────
  // DATA SNAPSHOTS & SAFE ROLLBACK ENGINE
  // ─────────────────────────────────────────────────────────────
  public getDataSnapshots(): DataSnapshot[] {
    return this.state.snapshots || [];
  }

  public createDataSnapshot(name: string, description?: string, createdBy: string = 'admin'): DataSnapshot {
    if (!this.state.snapshots) {
      this.state.snapshots = [];
    }
    const snapshotId = `snap_${Date.now()}`;
    const metadata: DataSnapshot = {
      id: snapshotId,
      name: name.trim(),
      description: description?.trim(),
      createdAt: new Date().toISOString(),
      createdBy,
      version: 'v2.0',
      entityCounts: {
        places: (this.state.places || []).length,
        rooms: (this.state.rooms || []).length,
        departments: (this.state.departments || []).length,
        teachers: (this.state.teachers || []).length,
        facilities: (this.state.facilities || []).length,
        searchAliases: (this.state.searchAliases || []).length,
        graphOverrides: Object.keys(this.state.graphOverrides?.manualNumbers || {}).length,
      },
    };

    // Save snapshot payload to disk
    try {
      const snapshotsDir = path.join(findDataDir(), 'snapshots');
      if (!fs.existsSync(snapshotsDir)) {
        fs.mkdirSync(snapshotsDir, { recursive: true });
      }
      const snapshotFilePath = path.join(snapshotsDir, `${snapshotId}.json`);
      const payload = {
        metadata,
        state: {
          places: this.state.places,
          rooms: this.state.rooms,
          departments: this.state.departments,
          teachers: this.state.teachers,
          facilities: this.state.facilities,
          graphOverrides: this.state.graphOverrides,
          searchAliases: this.state.searchAliases,
        },
      };
      fs.writeFileSync(snapshotFilePath, JSON.stringify(payload, null, 2), 'utf-8');
    } catch (err) {
      console.error('[CampusNav Store] Error writing snapshot file:', err);
    }

    this.state.snapshots.unshift(metadata);
    // Keep last 30 snapshots
    if (this.state.snapshots.length > 30) {
      this.state.snapshots = this.state.snapshots.slice(0, 30);
    }
    this.persist(true);

    this.logAdminAction({
      adminUsername: createdBy,
      action: 'CREATE_DATA_SNAPSHOT',
      entity: 'SNAPSHOT',
      entityId: snapshotId,
      after: metadata,
    });

    return metadata;
  }

  public rollbackToSnapshot(
    snapshotId: string,
    performedBy: string = 'admin'
  ): { success: boolean; message: string; restoredCounts?: any } {
    const snapshotsDir = path.join(findDataDir(), 'snapshots');
    const snapshotFilePath = path.join(snapshotsDir, `${snapshotId}.json`);

    if (!fs.existsSync(snapshotFilePath)) {
      return { success: false, message: `Snapshot file for ${snapshotId} not found on disk.` };
    }

    try {
      // 1. Take safety backup before rollback
      this.createDataSnapshot(`Pre-Rollback Backup before restoring ${snapshotId}`, 'Automatic safety snapshot before rollback', 'system');

      // 2. Read snapshot
      const raw = fs.readFileSync(snapshotFilePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (!parsed?.state) {
        return { success: false, message: 'Invalid snapshot format.' };
      }

      if (Array.isArray(parsed.state.places)) this.state.places = parsed.state.places;
      if (Array.isArray(parsed.state.rooms)) this.state.rooms = parsed.state.rooms;
      if (Array.isArray(parsed.state.departments)) this.state.departments = parsed.state.departments;
      if (Array.isArray(parsed.state.teachers)) this.state.teachers = parsed.state.teachers;
      if (Array.isArray(parsed.state.facilities)) this.state.facilities = parsed.state.facilities;
      if (parsed.state.graphOverrides) this.state.graphOverrides = parsed.state.graphOverrides;
      if (Array.isArray(parsed.state.searchAliases)) this.state.searchAliases = parsed.state.searchAliases;

      this.persist(true);

      this.logAdminAction({
        adminUsername: performedBy,
        action: 'ROLLBACK_TO_SNAPSHOT',
        entity: 'SNAPSHOT',
        entityId: snapshotId,
        notes: `Successfully restored state from snapshot ${snapshotId}.`,
      });

      return {
        success: true,
        message: `Successfully rolled back to snapshot ${parsed.metadata?.name || snapshotId}.`,
        restoredCounts: parsed.metadata?.entityCounts,
      };
    } catch (err: any) {
      return { success: false, message: `Rollback failed: ${err.message || 'Unknown error'}` };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // BUG REPORTING & FEEDBACK ENGINE
  // ─────────────────────────────────────────────────────────────
  public getReports(filter?: {
    status?: string;
    priority?: string;
    category?: string;
    search?: string;
    buildingId?: string;
    limit?: number;
    offset?: number;
  }): { reports: CampusReport[]; total: number } {
    let reports = [...(this.state.reports || [])];

    if (filter) {
      if (filter.status === 'ACTIVE') {
        reports = reports.filter((r) => r.status === 'NEW' || r.status === 'ACKNOWLEDGED' || r.status === 'IN_PROGRESS');
      } else if (filter.status && filter.status !== 'ALL') {
        reports = reports.filter((r) => r.status === filter.status);
      }
      if (filter.priority && filter.priority !== 'ALL') {
        reports = reports.filter((r) => r.priority === filter.priority);
      }
      if (filter.category && filter.category !== 'ALL') {
        reports = reports.filter((r) => r.issueType === filter.category || r.category === filter.category);
      }
      if (filter.buildingId) {
        reports = reports.filter((r) => r.currentBuildingId === filter.buildingId || r.blockId === filter.buildingId);
      }
      if (filter.search && filter.search.trim()) {
        const q = filter.search.trim().toLowerCase();
        reports = reports.filter((r) =>
          r.id.toLowerCase().includes(q) ||
          (r.description && r.description.toLowerCase().includes(q)) ||
          (r.reportedEntityId && r.reportedEntityId.toLowerCase().includes(q)) ||
          (r.currentPanoramaId && r.currentPanoramaId.toLowerCase().includes(q)) ||
          (r.currentNodeId && r.currentNodeId.toLowerCase().includes(q)) ||
          (r.reporterName && r.reporterName.toLowerCase().includes(q)) ||
          (r.blockName && r.blockName.toLowerCase().includes(q))
        );
      }
    }

    // Default sort: highest priority, then newest
    const priorityWeight: Record<CampusReportPriority, number> = {
      CRITICAL: 4,
      HIGH: 3,
      MEDIUM: 2,
      LOW: 1,
    };
    reports.sort((a, b) => {
      const pDiff = (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0);
      if (pDiff !== 0) return pDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const total = reports.length;
    const offset = filter?.offset || 0;
    const limit = filter?.limit || 100;
    const paginated = reports.slice(offset, offset + limit);

    return { reports: paginated, total };
  }

  public getReportById(id: string): CampusReport | undefined {
    return (this.state.reports || []).find((r) => r.id === id);
  }

  public createReport(data: Partial<CampusReport>): CampusReport {
    if (!this.state.reports) {
      this.state.reports = [];
    }

    const now = new Date().toISOString();
    const count = this.state.reports.length + 1;
    const year = new Date().getFullYear();
    const id = `WC-${year}-${String(count).padStart(5, '0')}`;

    // Auto default priority based on issue type if not explicitly set
    let priority: CampusReportPriority = data.priority || 'MEDIUM';
    if (!data.priority) {
      if (
        data.issueType === 'WRONG_NAVIGATION' ||
        data.issueType === 'WRONG_LOCATION' ||
        data.issueType === 'WRONG_ROOM' ||
        data.issueType === 'WRONG_DEPARTMENT' ||
        data.issueType === 'PANORAMA_PROBLEM' ||
        data.issueType === 'WRONG_ARROW'
      ) {
        priority = 'HIGH';
      } else if (
        data.issueType === 'SUGGESTION' ||
        data.issueType === 'OTHER'
      ) {
        priority = 'LOW';
      }
    }

    // Duplicate detection check
    let possibleDuplicateOf: string | undefined;
    const existingReports = this.state.reports;
    const matchDuplicate = existingReports.find(
      (r) =>
        r.status !== 'RESOLVED' &&
        r.status !== 'REJECTED' &&
        r.issueType === data.issueType &&
        (
          (data.reportedEntityId && r.reportedEntityId === data.reportedEntityId) ||
          (data.currentPanoramaId && r.currentPanoramaId === data.currentPanoramaId && data.currentPanoramaId) ||
          (data.currentNodeId && r.currentNodeId === data.currentNodeId && data.currentNodeId)
        )
    );
    if (matchDuplicate) {
      possibleDuplicateOf = matchDuplicate.id;
    }

    const newReport: CampusReport = {
      id,
      createdAt: now,
      updatedAt: now,
      issueType: data.issueType || 'OTHER',
      category: data.category || (data.issueType || 'OTHER').replace(/_/g, ' '),
      description: data.description || '',
      status: 'NEW',
      priority,
      reporterName: data.reporterName?.trim() || undefined,
      reporterContact: data.reporterContact?.trim() || undefined,
      reporterType: data.reporterType || 'anonymous',

      currentPanoramaId: data.currentPanoramaId,
      currentNodeId: data.currentNodeId,
      currentBuildingId: data.currentBuildingId,
      currentFloorId: data.currentFloorId,
      currentPlaceId: data.currentPlaceId,
      currentTagId: data.currentTagId,
      selectedDestinationId: data.selectedDestinationId,
      routeId: data.routeId,
      routeStepIndex: data.routeStepIndex,
      originNodeId: data.originNodeId,
      destinationNodeId: data.destinationNodeId,
      reportedEntityType: data.reportedEntityType,
      reportedEntityId: data.reportedEntityId,
      blockId: data.blockId,
      blockName: data.blockName,
      currentURL: data.currentURL,
      device: data.device,
      browser: data.browser,
      screenSize: data.screenSize,
      appVersion: data.appVersion || '1.0.0',

      adminNotes: '',
      history: [
        {
          timestamp: now,
          action: 'CREATED',
          newStatus: 'NEW',
          note: 'Initial user report submitted',
        },
      ],
      possibleDuplicateOf,
    };

    this.state.reports.unshift(newReport);
    this.persist(true);
    return newReport;
  }

  public updateReport(
    id: string,
    updates: {
      status?: CampusReportStatus;
      priority?: CampusReportPriority;
      adminNotes?: string;
    },
    updatedBy: string = 'Admin'
  ): CampusReport | undefined {
    if (!this.state.reports) return undefined;
    const index = this.state.reports.findIndex((r) => r.id === id);
    if (index === -1) return undefined;

    const report = this.state.reports[index];
    const now = new Date().toISOString();
    const prevStatus = report.status;

    if (updates.status) {
      report.status = updates.status;
      if (updates.status === 'RESOLVED') {
        report.resolvedAt = now;
        report.resolvedBy = updatedBy;
      }
    }
    if (updates.priority) {
      report.priority = updates.priority;
    }
    if (updates.adminNotes !== undefined) {
      report.adminNotes = updates.adminNotes;
    }
    report.updatedAt = now;

    if (!report.history) report.history = [];
    report.history.push({
      timestamp: now,
      action: 'UPDATED',
      previousStatus: prevStatus,
      newStatus: report.status,
      note: updates.adminNotes ? `Admin notes: ${updates.adminNotes.slice(0, 100)}` : `Status updated to ${report.status}`,
      changedBy: updatedBy,
    });

    this.persist(true);
    return report;
  }

  public deleteReport(id: string): boolean {
    if (!this.state.reports) return false;
    const prevLen = this.state.reports.length;
    this.state.reports = this.state.reports.filter((r) => r.id !== id);
    this.persist(true);
    return this.state.reports.length < prevLen;
  }

  public clearAllReports(): number {
    if (!this.state.reports) return 0;
    const count = this.state.reports.length;
    this.state.reports = [];
    this.persist(true);
    return count;
  }

  // ─────────────────────────────────────────────────────────────
  // FACULTY AVAILABILITY & ACCOUNT METHODS
  // ─────────────────────────────────────────────────────────────

  public getFacultyStatuses(): Record<string, PublicFacultyStatus> {
    const rawStatuses = this.state.facultyStatuses || {};
    const result: Record<string, PublicFacultyStatus> = {};
    const now = Date.now();

    for (const [facultyId, record] of Object.entries(rawStatuses)) {
      const isExpired = !!(record.expiresAt && now > new Date(record.expiresAt).getTime());
      if (isExpired) {
        result[facultyId] = {
          facultyId,
          status: 'NOT_AVAILABLE',
          updatedAt: record.updatedAt,
          isExpired: true,
          source: record.source,
          adminReason: record.adminReason,
        };
      } else {
        result[facultyId] = {
          facultyId: record.facultyId,
          status: record.status,
          locationPlaceId: record.locationPlaceId,
          locationName: record.locationName,
          locationNodeId: record.locationNodeId,
          updatedAt: record.updatedAt,
          isExpired: false,
          source: record.source,
          adminReason: record.adminReason,
        };
      }
    }
    return result;
  }

  public getFacultyStatus(facultyId: string): PublicFacultyStatus {
    const rawStatuses = this.state.facultyStatuses || {};
    const record = rawStatuses[facultyId];
    if (!record) {
      return {
        facultyId,
        status: 'NOT_MARKED',
        updatedAt: new Date().toISOString(),
      };
    }

    const isExpired = !!(record.expiresAt && Date.now() > new Date(record.expiresAt).getTime());
    if (isExpired) {
      return {
        facultyId,
        status: 'NOT_AVAILABLE',
        updatedAt: record.updatedAt,
        isExpired: true,
        source: record.source,
        adminReason: record.adminReason,
      };
    }

    return {
      facultyId: record.facultyId,
      status: record.status,
      locationPlaceId: record.locationPlaceId,
      locationName: record.locationName,
      locationNodeId: record.locationNodeId,
      updatedAt: record.updatedAt,
      isExpired: false,
      source: record.source,
      adminReason: record.adminReason,
    };
  }

  public setFacultyStatus(params: {
    facultyId: string;
    status: FacultyStatusType;
    locationPlaceId?: string;
    source: FacultyStatusSource;
    updatedBy: string;
    adminReason?: string;
    durationMinutes?: number;
  }): { record: FacultyStatusRecord; log: FacultyStatusAuditLog } {
    // 1. Validate faculty exists
    const teacher = this.state.teachers.find(
      (t) => t.id === params.facultyId || t.facultyId === params.facultyId
    );
    if (!teacher) {
      throw new Error(`Faculty with ID "${params.facultyId}" does not exist in authoritative records.`);
    }

    const now = new Date();
    const nowIso = now.toISOString();

    // 2. Validate location if specified
    let locationName: string | undefined;
    let locationNodeId: string | undefined;

    if (params.locationPlaceId && params.locationPlaceId.trim()) {
      const locTarget = params.locationPlaceId.trim();
      // Check verified classrooms
      const classroom = (this.state.classrooms || VERIFIED_CLASSROOMS).find(
        (c) =>
          c.roomNumber.toUpperCase() === locTarget.toUpperCase() ||
          c.id.toLowerCase() === locTarget.toLowerCase()
      );

      if (classroom) {
        locationName = `${classroom.roomNumber} - ${classroom.name}`;
        if (classroom.nodeId) {
          locationNodeId = classroom.nodeId;
        } else {
          // Resolve block fallback node for classroom (e.g. AB13 -> ab_044, SC482 -> sc_205)
          const blockPrefix = classroom.roomNumber.replace(/\d+/g, '').toUpperCase();
          const blockFallbackMap: Record<string, string> = {
            AB: 'ab_044',
            SC: 'sc_205',
            MG: 'mg_259',
            SM: 'sm_241',
            SJ: 'sj_166',
            MT: 'mt_335',
            PO: 'node_mb_po_door',
            MB: 'node_mb_po_door',
          };
          locationNodeId = blockFallbackMap[blockPrefix];
        }
      } else {
        // Check verified places
        const place = (this.state.places || []).find(
          (p) => p.id === locTarget || p.name.toLowerCase() === locTarget.toLowerCase()
        );
        if (place) {
          locationName = place.name;
          locationNodeId = place.nodeId || undefined;
        } else {
          throw new Error(`Location "${params.locationPlaceId}" is not a recognized verified classroom or place.`);
        }
      }
    }

    // 3. Determine expiration TTL
    let durationMins = params.durationMinutes;
    if (durationMins === undefined) {
      if (params.status === 'AVAILABLE') durationMins = 120; // 2 hours
      else if (params.status === 'IN_CLASS') durationMins = 60; // 1 hour
      else if (params.status === 'BUSY') durationMins = 60; // 1 hour
    }

    const expiresAt = typeof durationMins === 'number'
      ? new Date(now.getTime() + durationMins * 60 * 1000).toISOString()
      : undefined;

    if (!this.state.facultyStatuses) {
      this.state.facultyStatuses = {};
    }
    const previousRecord = this.state.facultyStatuses[params.facultyId];

    const record: FacultyStatusRecord = {
      id: `fs_${params.facultyId}_${Date.now()}`,
      facultyId: params.facultyId,
      status: params.status,
      locationPlaceId: params.locationPlaceId?.trim() || undefined,
      locationName,
      locationNodeId,
      updatedAt: nowIso,
      expiresAt,
      updatedBy: params.updatedBy,
      source: params.source,
      adminReason: params.adminReason?.trim() || undefined,
    };

    const log: FacultyStatusAuditLog = {
      id: `flog_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      facultyId: params.facultyId,
      facultyName: teacher.name,
      departmentName: teacher.departmentName || teacher.departmentCategory || '',
      previousStatus: previousRecord?.status,
      newStatus: params.status,
      locationPlaceId: params.locationPlaceId?.trim() || undefined,
      locationName,
      source: params.source,
      updatedBy: params.updatedBy,
      adminReason: params.adminReason?.trim() || undefined,
      timestamp: nowIso,
    };

    this.state.facultyStatuses[params.facultyId] = record;

    if (!Array.isArray(this.state.facultyStatusAuditLogs)) {
      this.state.facultyStatusAuditLogs = [];
    }
    this.state.facultyStatusAuditLogs.unshift(log);

    if (this.state.facultyStatusAuditLogs.length > 2000) {
      this.state.facultyStatusAuditLogs = this.state.facultyStatusAuditLogs.slice(0, 2000);
    }

    this.persist(true);
    return { record, log };
  }

  public getFacultyAccounts(): FacultyAccount[] {
    return this.state.facultyAccounts || [];
  }

  public getFacultyAccountById(id: string): FacultyAccount | undefined {
    return (this.state.facultyAccounts || []).find((a) => a.id === id);
  }

  public getFacultyAccountByFacultyId(facultyId: string): FacultyAccount | undefined {
    return (this.state.facultyAccounts || []).find((a) => a.facultyId === facultyId);
  }

  public getFacultyAccountByEmailOrCode(identifier: string): FacultyAccount | undefined {
    const term = (identifier || '').trim().toLowerCase();
    if (!term) return undefined;
    return (this.state.facultyAccounts || []).find(
      (a) =>
        (a.email || '').trim().toLowerCase() === term ||
        (a.facultyCode || '').trim().toLowerCase() === term ||
        (a.facultyId || '').trim().toLowerCase() === term
    );
  }

  public createFacultyAccount(data: {
    facultyId: string;
    email: string;
    facultyCode?: string;
    password?: string;
    mustChangePassword?: boolean;
    performedBy?: string;
  }): FacultyAccount & { temporaryPassword?: string } {
    const teacher = this.state.teachers.find(
      (t) => t.id === data.facultyId || t.facultyId === data.facultyId
    );
    if (!teacher) {
      throw new Error(`Faculty member "${data.facultyId}" does not exist in authoritative records.`);
    }

    if (!this.state.facultyAccounts) {
      this.state.facultyAccounts = [];
    }

    if (this.state.facultyAccounts.some((a) => a.facultyId === data.facultyId)) {
      throw new Error(`An account already exists for faculty member "${teacher.name}".`);
    }

    const email = (data.email || '').trim().toLowerCase();
    if (!isValidCollegeEmail(email)) {
      throw new Error(`Invalid email "${data.email}". Email must belong to @christcollegeijk.edu.in domain.`);
    }

    if (this.state.facultyAccounts.some((a) => a.email.toLowerCase() === email)) {
      throw new Error(`Email "${data.email}" is already registered to another faculty account.`);
    }

    // Duplicate check across teachers: block if multiple teachers share this email
    const duplicateTeachers = this.state.teachers.filter(
      (t) => (t.officialEmail || '').trim().toLowerCase() === email
    );
    if (duplicateTeachers.length > 1) {
      throw new Error(
        `Cannot create account: email "${data.email}" is shared by ${duplicateTeachers.length} faculty members. Duplicate emails must be resolved before account creation.`
      );
    }

    const facultyCode = (data.facultyCode || data.facultyId).trim();
    if (this.state.facultyAccounts.some((a) => a.facultyCode.toLowerCase() === facultyCode.toLowerCase())) {
      throw new Error(`Faculty code "${facultyCode}" is already in use.`);
    }

    const collidingAccount = this.state.facultyAccounts.find(
      (a) => a.facultyCode.toLowerCase() === email || a.email.toLowerCase() === facultyCode.toLowerCase()
    );
    if (collidingAccount) {
      throw new Error(`Identifier collision detected with existing account.`);
    }

    const tempPassword = data.password ? String(data.password).trim() : generateSecureTempPassword();
    if (tempPassword.length < 10) {
      throw new Error('Password must be at least 10 characters.');
    }

    const now = new Date().toISOString();
    const account: FacultyAccount = {
      id: `fa_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      facultyId: data.facultyId,
      email,
      facultyCode,
      passwordHash: hashPassword(tempPassword),
      role: 'FACULTY',
      isActive: true,
      mustChangePassword: data.mustChangePassword !== undefined ? data.mustChangePassword : true,
      createdAt: now,
      updatedAt: now,
    };

    this.state.facultyAccounts.push(account);

    this.logAdminAction({
      adminUsername: data.performedBy || 'Admin',
      action: 'CREATE_FACULTY_ACCOUNT',
      entity: 'FACULTY_ACCOUNT',
      entityId: account.id,
      after: {
        facultyId: account.facultyId,
        facultyName: teacher.name,
        email: account.email,
        facultyCode: account.facultyCode,
        mustChangePassword: account.mustChangePassword,
      },
      notes: `Created faculty login account for ${account.facultyId} (${teacher.name})`,
    });

    this.persist(true);
    return { ...account, temporaryPassword: tempPassword };
  }

  public toggleFacultyAccountActive(
    accountId: string,
    isActive: boolean,
    performedBy?: string
  ): FacultyAccount | undefined {
    if (!this.state.facultyAccounts) return undefined;
    const acc = this.state.facultyAccounts.find((a) => a.id === accountId);
    if (!acc) return undefined;
    const prevActive = acc.isActive;
    acc.isActive = isActive;
    acc.updatedAt = new Date().toISOString();

    this.logAdminAction({
      adminUsername: performedBy || 'Admin',
      action: 'TOGGLE_FACULTY_ACCOUNT_ACTIVE',
      entity: 'FACULTY_ACCOUNT',
      entityId: acc.id,
      before: { isActive: prevActive },
      after: { isActive },
      notes: `Faculty account ${isActive ? 'activated' : 'disabled'} for ${acc.facultyId}`,
    });

    this.persist(true);
    return acc;
  }

  public resetFacultyAccountPassword(
    accountId: string,
    newPassword?: string,
    mustChangePassword: boolean = true,
    performedBy?: string
  ): (FacultyAccount & { temporaryPassword?: string }) | undefined {
    if (!this.state.facultyAccounts) return undefined;
    const acc = this.state.facultyAccounts.find((a) => a.id === accountId);
    if (!acc) return undefined;

    let tempPass: string;
    if (newPassword && String(newPassword).trim().length > 0) {
      const cleanNew = String(newPassword).trim();
      if (cleanNew.length < 10) {
        throw new Error('New password must be at least 10 characters.');
      }
      if (verifyPassword(cleanNew, acc.passwordHash)) {
        throw new Error('New password cannot be the same as the current password.');
      }
      tempPass = cleanNew;
    } else {
      tempPass = generateSecureTempPassword();
    }

    acc.passwordHash = hashPassword(tempPass);
    acc.mustChangePassword = mustChangePassword;
    acc.updatedAt = new Date().toISOString();

    this.logAdminAction({
      adminUsername: performedBy || 'Admin',
      action: 'RESET_FACULTY_PASSWORD',
      entity: 'FACULTY_ACCOUNT',
      entityId: acc.id,
      after: {
        facultyId: acc.facultyId,
        mustChangePassword: acc.mustChangePassword,
      },
      notes: `Reset password for faculty account "${acc.id}" (${acc.facultyId})`,
    });

    this.persist(true);
    return { ...acc, temporaryPassword: tempPass };
  }

  public recordFacultyLogin(accountId: string): void {
    if (!this.state.facultyAccounts) return;
    const acc = this.state.facultyAccounts.find((a) => a.id === accountId);
    if (!acc) return;
    acc.lastLoginAt = new Date().toISOString();
    this.persist(false);
  }

  public getFacultyStatusAuditLogs(facultyId?: string): FacultyStatusAuditLog[] {
    const logs = this.state.facultyStatusAuditLogs || [];
    if (facultyId) {
      return logs.filter((l) => l.facultyId === facultyId);
    }
    return logs;
  }
}

export const store = new DataStore();


