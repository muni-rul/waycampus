import {
  IDataRepository,
  RepositoryHealth,
  RealtimeSubscriptionCallbacks,
  ReportQueryOptions,
  ReportQueryResult,
} from './IDataRepository';
import { DatabaseState } from '../store';
import {
  Teacher,
  Department,
  GraphOverrideData,
  CampusReport,
  FacultyAccount,
  FacultyStatusRecord,
  FacultyStatusAuditLog,
  SearchAlias,
  AdminAuditAction,
  CampusInfoData,
  CampusEventItem,
} from '../../../../shared/types';
import { AdminUser } from '../../middleware/auth';
import crypto from 'crypto';

/**
 * Cloud Firestore implementation of IDataRepository.
 * Uses Firebase Admin SDK as the single source of truth.
 */
export class FirestoreRepository implements IDataRepository {
  private db: any = null;
  private app: any = null;
  private connected: boolean = false;
  private projectId: string = '';
  private lastSyncAt?: string;
  private lastError?: string;
  private unsubscribeList: Array<() => void> = [];

  constructor() {}

  /**
   * Helper to normalize and hash an email for uniqueness index document ID.
   */
  private getEmailDocId(email: string): string {
    const normalized = email.trim().toLowerCase();
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Initialize and connect to Firestore with retry and exponential backoff.
   * Retries for ~60s if unreachable.
   */
  async connect(): Promise<void> {
    const admin = await this.loadFirebaseAdmin();
    if (!admin) {
      this.lastError = 'firebase-admin package is not installed';
      if (process.env.NODE_ENV === 'production') {
        console.error(`[Firestore] FATAL: ${this.lastError}. Production boot aborted.`);
        process.exit(1);
      }
      return;
    }

    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const googleAppCreds = process.env.GOOGLE_APPLICATION_CREDENTIALS;

    let certConfig: any = null;
    let projId = process.env.FIREBASE_PROJECT_ID || '';

    if (serviceAccountJson) {
      try {
        let parsed: any;
        if (serviceAccountJson.trim().startsWith('{')) {
          parsed = JSON.parse(serviceAccountJson);
        } else {
          // Path to JSON file
          const fs = await import('fs');
          const content = fs.readFileSync(serviceAccountJson.trim(), 'utf8');
          parsed = JSON.parse(content);
        }
        certConfig = admin.credential.cert(parsed);
        if (parsed.project_id) {
          projId = parsed.project_id;
        }
      } catch (err: any) {
        this.lastError = `Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON: ${err.message}`;
        console.error(`[Firestore] ${this.lastError}`);
      }
    } else if (googleAppCreds) {
      try {
        let parsed: any;
        if (googleAppCreds.trim().startsWith('{')) {
          parsed = JSON.parse(googleAppCreds.trim());
        } else {
          const fs = await import('fs');
          const content = fs.readFileSync(googleAppCreds.trim(), 'utf8');
          parsed = JSON.parse(content);
        }
        certConfig = admin.credential.cert(parsed);
        if (parsed.project_id) {
          projId = parsed.project_id;
        }
      } catch (err: any) {
        this.lastError = `Failed to read GOOGLE_APPLICATION_CREDENTIALS: ${err.message}`;
        console.error(`[Firestore] ${this.lastError}`);
      }
    }

    if (!certConfig) {
      // Attempt applicationDefault credentials if available
      try {
        certConfig = admin.credential.applicationDefault();
      } catch (e: any) {
        this.lastError = 'No valid Firebase credentials found (checked FIREBASE_SERVICE_ACCOUNT_JSON and GOOGLE_APPLICATION_CREDENTIALS)';
      }
    }

    if (!certConfig) {
      if (process.env.NODE_ENV === 'production') {
        console.error(`[Firestore] FATAL: ${this.lastError}. Production requires valid Firebase credentials. Exiting.`);
        process.exit(1);
      } else {
        console.warn(`[Firestore] Warning: ${this.lastError}. Running in degraded offline mode.`);
        return;
      }
    }

    // Initialize Firebase Admin App
    try {
      if (!admin.apps.length) {
        this.app = admin.initializeApp({
          credential: certConfig,
          projectId: projId || undefined,
        });
      } else {
        this.app = admin.apps[0];
      }
      this.db = admin.firestore(this.app);
      // Disable undefined property errors
      this.db.settings({ ignoreUndefinedProperties: true });
      this.projectId = projId || this.app.options.projectId || 'firebase-project';
    } catch (initErr: any) {
      this.lastError = `Failed to initialize Firebase Admin SDK: ${initErr.message}`;
      if (process.env.NODE_ENV === 'production') {
        console.error(`[Firestore] FATAL: ${this.lastError}. Exiting.`);
        process.exit(1);
      }
      return;
    }

    // Retry connection / ping with backoff for up to ~60 seconds
    const maxDurationMs = 60000;
    const startTime = Date.now();
    let attempt = 0;
    let delayMs = 1000;

    while (Date.now() - startTime < maxDurationMs) {
      attempt++;
      try {
        // Quick read ping to check connectivity
        await this.db.collection('campus_structure').doc('metadata').get();
        this.connected = true;
        this.lastSyncAt = new Date().toISOString();
        this.lastError = undefined;
        console.log(`[Firestore] Successfully connected to project '${this.projectId}' on attempt ${attempt}.`);
        return;
      } catch (err: any) {
        this.lastError = `Firestore connection attempt ${attempt} failed: ${err.message}`;
        console.warn(`[Firestore] ${this.lastError}. Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        delayMs = Math.min(delayMs * 1.5, 10000);
      }
    }

    // Exhausted retries
    this.connected = false;
    if (process.env.NODE_ENV === 'production') {
      console.error(`[Firestore] FATAL: Could not establish Firestore connection within 60s timeout. Exiting.`);
      process.exit(1);
    } else {
      console.warn(`[Firestore] Firestore unreachable after ${attempt} attempts. Server will run in degraded mode.`);
    }
  }

  private async loadFirebaseAdmin(): Promise<any> {
    try {
      return await import('firebase-admin');
    } catch {
      try {
        const path = await import('path');
        const candidatePaths = [
          path.resolve(__dirname, '../../../../node_modules/firebase-admin'),
          path.resolve(process.cwd(), 'server/node_modules/firebase-admin'),
          path.resolve(process.cwd(), 'node_modules/firebase-admin'),
        ];
        for (const cp of candidatePaths) {
          try {
            return await import(cp);
          } catch {}
        }
        return null;
      } catch {
        return null;
      }
    }
  }

  async disconnect(): Promise<void> {
    for (const unsub of this.unsubscribeList) {
      try {
        unsub();
      } catch {
        // ignore
      }
    }
    this.unsubscribeList = [];
    this.connected = false;
  }

  getHealth(): RepositoryHealth {
    return {
      connected: this.connected,
      status: this.connected ? 'ok' : this.lastError ? 'degraded' : 'disconnected',
      provider: 'firestore',
      projectId: this.projectId || undefined,
      error: this.lastError,
      lastSyncAt: this.lastSyncAt,
    };
  }

  /**
   * Loads all collections and documents from Firestore into memory.
   */
  async loadAll(): Promise<DatabaseState> {
    if (!this.db) {
      throw new Error('Firestore is not initialized.');
    }

    const state: DatabaseState = {
      organizations: [],
      campuses: [],
      buildings: [],
      floors: [],
      rooms: [],
      departments: [],
      teachers: [],
      facilities: [],
      qrCheckpoints: [],
      navigationNodes: [],
      navigationEdges: [],
      panoramas: [],
      analytics: [],
      classrooms: [],
      laboratories: [],
      programmes: [],
      academicDepartments: [],
      places: [],
      placeAuditLogs: [],
      graphOverrides: undefined,
      adminUsers: [],
      reports: [],
      facultyAccounts: [],
      facultyStatuses: {},
      facultyStatusAuditLogs: [],
      searchAliases: [],
      adminAuditActions: [],
      snapshots: [],
    };

    try {
      // 1. Campus Structure & Academic Documents
      const [
        orgsDoc,
        campusesDoc,
        buildingsDoc,
        floorsDoc,
        roomsDoc,
        deptsDoc,
        acadDeptsDoc,
        programmesDoc,
        classroomsDoc,
        labsDoc,
        facilitiesDoc,
        qrDoc,
        searchDoc,
      ] = await Promise.all([
        this.db.collection('campus_structure').doc('organizations').get(),
        this.db.collection('campus_structure').doc('campuses').get(),
        this.db.collection('campus_structure').doc('buildings').get(),
        this.db.collection('campus_structure').doc('floors').get(),
        this.db.collection('campus_structure').doc('rooms').get(),
        this.db.collection('campus_structure').doc('departments').get(),
        this.db.collection('academic_catalog').doc('departments').get(),
        this.db.collection('academic_catalog').doc('programmes').get(),
        this.db.collection('academic_catalog').doc('classrooms').get(),
        this.db.collection('academic_catalog').doc('laboratories').get(),
        this.db.collection('campus_structure').doc('facilities').get(),
        this.db.collection('campus_structure').doc('qr_checkpoints').get(),
        this.db.collection('settings').doc('search_aliases').get(),
      ]);

      if (orgsDoc.exists) state.organizations = orgsDoc.data()?.items || [];
      if (campusesDoc.exists) state.campuses = campusesDoc.data()?.items || [];
      if (buildingsDoc.exists) state.buildings = buildingsDoc.data()?.items || [];
      if (floorsDoc.exists) state.floors = floorsDoc.data()?.items || [];
      if (roomsDoc.exists) state.rooms = roomsDoc.data()?.items || [];
      if (deptsDoc.exists) state.departments = deptsDoc.data()?.items || [];
      if (acadDeptsDoc.exists) state.academicDepartments = acadDeptsDoc.data()?.items || [];
      if (programmesDoc.exists) state.programmes = programmesDoc.data()?.items || [];
      if (classroomsDoc.exists) state.classrooms = classroomsDoc.data()?.items || [];
      if (labsDoc.exists) state.laboratories = labsDoc.data()?.items || [];
      if (facilitiesDoc.exists) state.facilities = facilitiesDoc.data()?.items || [];
      if (qrDoc.exists) state.qrCheckpoints = qrDoc.data()?.items || [];
      if (searchDoc.exists) state.searchAliases = searchDoc.data()?.items || [];

      // 2. Teachers Collection
      const teachersSnap = await this.db.collection('teachers').get();
      state.teachers = teachersSnap.docs.map((d: any) => d.data() as Teacher);

      // 3. Faculty Accounts Collection
      const accountsSnap = await this.db.collection('facultyAccounts').get();
      state.facultyAccounts = accountsSnap.docs.map((d: any) => d.data() as FacultyAccount);

      // 4. Faculty Statuses Collection
      const statusesSnap = await this.db.collection('facultyStatuses').get();
      state.facultyStatuses = {};
      statusesSnap.docs.forEach((d: any) => {
        state.facultyStatuses![d.id] = d.data() as FacultyStatusRecord;
      });

      // 5. Audit Logs (Status & Admin)
      const [statusLogsSnap, adminLogsSnap] = await Promise.all([
        this.db.collection('facultyStatusAuditLogs').orderBy('timestamp', 'desc').limit(2000).get(),
        this.db.collection('adminAuditLogs').orderBy('timestamp', 'desc').limit(2000).get(),
      ]);
      state.facultyStatusAuditLogs = statusLogsSnap.docs.map((d: any) => d.data() as FacultyStatusAuditLog);
      state.adminAuditActions = adminLogsSnap.docs.map((d: any) => d.data() as AdminAuditAction);

      // 6. Navigation & Panoramas
      const [nodesSnap, edgesSnap, panoramasSnap] = await Promise.all([
        this.db.collection('nav_nodes').get(),
        this.db.collection('nav_edges').get(),
        this.db.collection('panoramas').get(),
      ]);
      state.navigationNodes = nodesSnap.docs.map((d: any) => d.data());
      state.navigationEdges = edgesSnap.docs.map((d: any) => d.data());
      state.panoramas = panoramasSnap.docs.map((d: any) => d.data());

      // 7. Graph Overrides Documents
      const [
        metaOverride,
        connOverride,
        tagsOverride,
        numbersOverride,
        headingsOverride,
        verifiedOverride,
        customPanoOverride,
      ] = await Promise.all([
        this.db.collection('graph_overrides').doc('metadata').get(),
        this.db.collection('graph_overrides').doc('customConnections').get(),
        this.db.collection('graph_overrides').doc('customPlaceTags').get(),
        this.db.collection('graph_overrides').doc('manualNumbers').get(),
        this.db.collection('graph_overrides').doc('nodeHeadingOverrides').get(),
        this.db.collection('graph_overrides').doc('verifiedStatusOverrides').get(),
        this.db.collection('graph_overrides').doc('customPanoramas').get(),
      ]);

      if (metaOverride.exists || connOverride.exists || tagsOverride.exists) {
        state.graphOverrides = {
          nodeImageOverrides: {},
          customConnections: connOverride.data()?.connections || {},
          nodeHeadingOverrides: headingsOverride.data()?.headings || {},
          verifiedStatusOverrides: verifiedOverride.data()?.verifiedStatuses || {},
          manualNumbers: numbersOverride.data()?.manualNumbers || {},
          customPlaceTags: tagsOverride.data()?.placeTags || {},
          customPanoramas: customPanoOverride.data()?.customPanoramas || {},
          version: metaOverride.data()?.version || 1,
          publishStatus: metaOverride.data()?.publishStatus || 'PUBLISHED',
          lastSavedAt: metaOverride.data()?.lastSavedAt || new Date().toISOString(),
          savedBy: metaOverride.data()?.savedBy || 'system',
        };
      }

      // 8. Admin Users
      const adminUsersSnap = await this.db.collection('adminUsers').get();
      state.adminUsers = adminUsersSnap.docs.map((d: any) => d.data() as AdminUser);

      // 9. Campus Reports: Live server does NOT load reports into memory; admin routes query directly
      state.reports = [];

      this.lastSyncAt = new Date().toISOString();
      return state;
    } catch (err: any) {
      this.lastError = `loadAll failed: ${err.message}`;
      throw err;
    }
  }

  /**
   * Save complete database state (used by migration script).
   */
  async saveAll(state: DatabaseState): Promise<void> {
    if (!this.db) throw new Error('Firestore is not initialized.');

    // Write campus structure documents
    const batch = this.db.batch();

    batch.set(this.db.collection('campus_structure').doc('metadata'), {
      updatedAt: new Date().toISOString(),
      version: 1,
    });
    batch.set(this.db.collection('campus_structure').doc('organizations'), { items: state.organizations || [] });
    batch.set(this.db.collection('campus_structure').doc('campuses'), { items: state.campuses || [] });
    batch.set(this.db.collection('campus_structure').doc('buildings'), { items: state.buildings || [] });
    batch.set(this.db.collection('campus_structure').doc('floors'), { items: state.floors || [] });
    batch.set(this.db.collection('campus_structure').doc('rooms'), { items: state.rooms || [] });
    batch.set(this.db.collection('campus_structure').doc('departments'), { items: state.departments || [] });
    batch.set(this.db.collection('campus_structure').doc('facilities'), { items: state.facilities || [] });
    batch.set(this.db.collection('campus_structure').doc('qr_checkpoints'), { items: state.qrCheckpoints || [] });

    batch.set(this.db.collection('academic_catalog').doc('departments'), { items: state.academicDepartments || [] });
    batch.set(this.db.collection('academic_catalog').doc('programmes'), { items: state.programmes || [] });
    batch.set(this.db.collection('academic_catalog').doc('classrooms'), { items: state.classrooms || [] });
    batch.set(this.db.collection('academic_catalog').doc('laboratories'), { items: state.laboratories || [] });

    batch.set(this.db.collection('settings').doc('search_aliases'), { items: state.searchAliases || [] });

    await batch.commit();

    // Write teachers
    if (state.teachers?.length) {
      await this.saveTeachers(state.teachers);
    }

    // Write faculty accounts
    if (state.facultyAccounts?.length) {
      await this.saveFacultyAccounts(state.facultyAccounts);
    }

    // Write faculty statuses
    if (state.facultyStatuses) {
      for (const [id, rec] of Object.entries(state.facultyStatuses)) {
        await this.saveFacultyStatus(id, rec);
      }
    }

    // Write status audit logs
    if (state.facultyStatusAuditLogs?.length) {
      for (const log of state.facultyStatusAuditLogs) {
        await this.addFacultyStatusAuditLog(log);
      }
    }

    // Write admin audit actions
    if (state.adminAuditActions?.length) {
      for (const act of state.adminAuditActions) {
        await this.addAdminAuditAction(act);
      }
    }

    // Write graph overrides
    if (state.graphOverrides) {
      await this.saveGraphOverrides(state.graphOverrides);
    }

    // Write navigation nodes, edges, panoramas
    if (state.navigationNodes?.length) {
      const nodeChunks = this.chunkArray(state.navigationNodes, 400);
      for (const chunk of nodeChunks) {
        const b = this.db.batch();
        for (const n of chunk) {
          b.set(this.db.collection('nav_nodes').doc(n.id), n);
        }
        await b.commit();
      }
    }

    if (state.navigationEdges?.length) {
      const edgeChunks = this.chunkArray(state.navigationEdges, 400);
      for (const chunk of edgeChunks) {
        const b = this.db.batch();
        for (const e of chunk) {
          b.set(this.db.collection('nav_edges').doc(e.id), e);
        }
        await b.commit();
      }
    }

    if (state.panoramas?.length) {
      const panoChunks = this.chunkArray(state.panoramas, 400);
      for (const chunk of panoChunks) {
        const b = this.db.batch();
        for (const p of chunk) {
          b.set(this.db.collection('panoramas').doc(p.id), p);
        }
        await b.commit();
      }
    }

    this.lastSyncAt = new Date().toISOString();
  }

  private chunkArray<T>(arr: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      result.push(arr.slice(i, i + size));
    }
    return result;
  }

  /**
   * Subscribe to realtime Firestore changes using onSnapshot.
   */
  subscribeRealtime(callbacks: RealtimeSubscriptionCallbacks): () => void {
    if (!this.db) {
      return () => {};
    }

    const unsubs: Array<() => void> = [];

    // Realtime listener for faculty accounts
    try {
      const unsubAccounts = this.db.collection('facultyAccounts').onSnapshot(
        (snapshot: any) => {
          snapshot.docChanges().forEach((change: any) => {
            if (change.type === 'added' || change.type === 'modified') {
              callbacks.onFacultyAccountChange?.(change.doc.data() as FacultyAccount);
            } else if (change.type === 'removed') {
              callbacks.onFacultyAccountDelete?.(change.doc.id);
            }
          });
        },
        (err: any) => {
          console.warn(`[Firestore] Faculty accounts realtime listener error: ${err.message}`);
        }
      );
      unsubs.push(unsubAccounts);
    } catch (e: any) {
      console.warn(`[Firestore] Failed to attach accounts snapshot: ${e.message}`);
    }

    // Realtime listener for faculty statuses
    try {
      const unsubStatuses = this.db.collection('facultyStatuses').onSnapshot(
        (snapshot: any) => {
          snapshot.docChanges().forEach((change: any) => {
            if (change.type === 'added' || change.type === 'modified') {
              callbacks.onFacultyStatusChange?.(change.doc.id, change.doc.data() as FacultyStatusRecord);
            }
          });
        },
        (err: any) => {
          console.warn(`[Firestore] Faculty statuses realtime listener error: ${err.message}`);
        }
      );
      unsubs.push(unsubStatuses);
    } catch (e: any) {
      console.warn(`[Firestore] Failed to attach statuses snapshot: ${e.message}`);
    }

    // Realtime listener for teachers
    try {
      const unsubTeachers = this.db.collection('teachers').onSnapshot(
        (snapshot: any) => {
          snapshot.docChanges().forEach((change: any) => {
            if (change.type === 'added' || change.type === 'modified') {
              callbacks.onTeacherChange?.(change.doc.data() as Teacher);
            }
          });
        },
        (err: any) => {
          console.warn(`[Firestore] Teachers realtime listener error: ${err.message}`);
        }
      );
      unsubs.push(unsubTeachers);
    } catch (e: any) {
      console.warn(`[Firestore] Failed to attach teachers snapshot: ${e.message}`);
    }

    const compositeUnsubscribe = () => {
      unsubs.forEach(fn => {
        try {
          fn();
        } catch {
          // ignore
        }
      });
    };

    this.unsubscribeList.push(compositeUnsubscribe);
    return compositeUnsubscribe;
  }

  async getFacultyAccount(id: string): Promise<FacultyAccount | null> {
    if (!this.db) return null;
    let snap = await this.db.collection('facultyAccounts').doc(id).get();
    if (!snap.exists) {
      const query = await this.db.collection('facultyAccounts').where('id', '==', id).limit(1).get();
      if (!query.empty) {
        snap = query.docs[0];
      }
    }
    return snap.exists ? (snap.data() as FacultyAccount) : null;
  }

  async findFacultyAccountByEmail(email: string): Promise<FacultyAccount | null> {
    if (!this.db) return null;
    const emailKey = this.getEmailDocId(email);
    const lookupSnap = await this.db.collection('facultyEmailLookups').doc(emailKey).get();
    if (!lookupSnap.exists) {
      return null;
    }
    const facultyId = lookupSnap.data()?.facultyId;
    if (!facultyId) return null;
    return this.getFacultyAccount(facultyId);
  }

  async saveFacultyAccount(account: FacultyAccount): Promise<void> {
    if (!this.db) throw new Error('Firestore is not initialized.');

    const facultyId = account.facultyId || account.id;
    const email = (account.email || (account as any).officialEmail || '').trim().toLowerCase();
    const emailKey = this.getEmailDocId(email);

    // Enforce email uniqueness transactionally
    await this.db.runTransaction(async (transaction: any) => {
      const emailLookupRef = this.db.collection('facultyEmailLookups').doc(emailKey);
      const emailLookupDoc = await transaction.get(emailLookupRef);

      if (emailLookupDoc.exists) {
        const existingFacultyId = emailLookupDoc.data()?.facultyId;
        if (existingFacultyId && existingFacultyId !== facultyId) {
          throw new Error(`Email is already assigned to faculty ${existingFacultyId}`);
        }
      }

      // Check if existing account has a previous email to clean up lookup
      const accountRef = this.db.collection('facultyAccounts').doc(facultyId);
      const existingAccountDoc = await transaction.get(accountRef);
      if (existingAccountDoc.exists) {
        const oldEmail = (existingAccountDoc.data()?.email || existingAccountDoc.data()?.officialEmail || '').trim().toLowerCase();
        if (oldEmail && oldEmail !== email) {
          const oldEmailKey = this.getEmailDocId(oldEmail);
          transaction.delete(this.db.collection('facultyEmailLookups').doc(oldEmailKey));
        }
      }

      // Set new lookup and account
      if (email) {
        transaction.set(emailLookupRef, {
          email,
          facultyId: facultyId,
          updatedAt: new Date().toISOString(),
        });
      }

      transaction.set(accountRef, {
        id: account.id || `fa_${facultyId}`,
        facultyId: facultyId,
        email: email,
        facultyCode: account.facultyCode || facultyId,
        passwordHash: account.passwordHash,
        role: 'FACULTY',
        isActive: account.isActive !== undefined ? account.isActive : true,
        mustChangePassword: account.mustChangePassword ?? true,
        createdAt: account.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastLoginAt: account.lastLoginAt || null,
      });
    });

    this.lastSyncAt = new Date().toISOString();
  }

  async saveFacultyAccounts(accounts: FacultyAccount[]): Promise<void> {
    for (const acc of accounts) {
      await this.saveFacultyAccount(acc);
    }
  }

  async deleteFacultyAccount(id: string): Promise<void> {
    if (!this.db) throw new Error('Firestore is not initialized.');
    await this.db.runTransaction(async (transaction: any) => {
      let accountRef = this.db.collection('facultyAccounts').doc(id);
      let snap = await transaction.get(accountRef);
      if (!snap.exists) {
        const q = await this.db.collection('facultyAccounts').where('id', '==', id).limit(1).get();
        if (!q.empty) {
          accountRef = q.docs[0].ref;
          snap = q.docs[0];
        }
      }
      if (snap.exists) {
        const email = (snap.data()?.email || snap.data()?.officialEmail || '').trim().toLowerCase();
        if (email) {
          const emailKey = this.getEmailDocId(email);
          transaction.delete(this.db.collection('facultyEmailLookups').doc(emailKey));
        }
        transaction.delete(accountRef);
      }
    });
    this.lastSyncAt = new Date().toISOString();
  }

  async saveFacultyStatus(teacherId: string, status: FacultyStatusRecord): Promise<void> {
    if (!this.db) throw new Error('Firestore is not initialized.');
    await this.db.collection('facultyStatuses').doc(teacherId).set({
      ...status,
      updatedAt: status.updatedAt || new Date().toISOString(),
    });
    this.lastSyncAt = new Date().toISOString();
  }

  async addFacultyStatusAuditLog(log: FacultyStatusAuditLog): Promise<void> {
    if (!this.db) throw new Error('Firestore is not initialized.');
    await this.db.collection('facultyStatusAuditLogs').doc(log.id).set(log);
    this.lastSyncAt = new Date().toISOString();
  }

  async saveTeacher(teacher: Teacher): Promise<void> {
    if (!this.db) throw new Error('Firestore is not initialized.');
    await this.db.collection('teachers').doc(teacher.id).set(teacher);
    this.lastSyncAt = new Date().toISOString();
  }

  async saveTeachers(teachers: Teacher[]): Promise<void> {
    if (!this.db) throw new Error('Firestore is not initialized.');
    const chunks = this.chunkArray(teachers, 400);
    for (const chunk of chunks) {
      const batch = this.db.batch();
      for (const t of chunk) {
        batch.set(this.db.collection('teachers').doc(t.id), t);
      }
      await batch.commit();
    }
    this.lastSyncAt = new Date().toISOString();
  }

  async saveGraphOverrides(overrides: GraphOverrideData): Promise<void> {
    if (!this.db) throw new Error('Firestore is not initialized.');
    const batch = this.db.batch();

    batch.set(this.db.collection('graph_overrides').doc('metadata'), {
      version: overrides.version || 1,
      publishStatus: overrides.publishStatus || 'PUBLISHED',
      lastSavedAt: overrides.lastSavedAt || new Date().toISOString(),
      savedBy: overrides.savedBy || 'admin',
    });

    if (overrides.customConnections) {
      batch.set(this.db.collection('graph_overrides').doc('customConnections'), {
        connections: overrides.customConnections,
      });
    }

    if (overrides.customPlaceTags) {
      batch.set(this.db.collection('graph_overrides').doc('customPlaceTags'), {
        placeTags: overrides.customPlaceTags,
      });
    }

    if (overrides.manualNumbers) {
      batch.set(this.db.collection('graph_overrides').doc('manualNumbers'), {
        manualNumbers: overrides.manualNumbers,
      });
    }

    if (overrides.nodeHeadingOverrides) {
      batch.set(this.db.collection('graph_overrides').doc('nodeHeadingOverrides'), {
        headings: overrides.nodeHeadingOverrides,
      });
    }

    if (overrides.verifiedStatusOverrides) {
      batch.set(this.db.collection('graph_overrides').doc('verifiedStatusOverrides'), {
        verifiedStatuses: overrides.verifiedStatusOverrides,
      });
    }

    if (overrides.customPanoramas) {
      batch.set(this.db.collection('graph_overrides').doc('customPanoramas'), {
        customPanoramas: overrides.customPanoramas,
      });
    }

    await batch.commit();
    this.lastSyncAt = new Date().toISOString();
  }

  async saveSearchAliases(aliases: SearchAlias[]): Promise<void> {
    if (!this.db) throw new Error('Firestore is not initialized.');
    await this.db.collection('settings').doc('search_aliases').set({ items: aliases });
    this.lastSyncAt = new Date().toISOString();
  }

  async saveCampusReport(report: CampusReport): Promise<void> {
    if (!this.db) throw new Error('Firestore is not initialized.');
    await this.db.collection('reports').doc(report.id).set(report);
    this.lastSyncAt = new Date().toISOString();
  }

  async queryCampusReports(options?: ReportQueryOptions): Promise<ReportQueryResult> {
    if (!this.db) throw new Error('Firestore is not initialized.');
    let query: any = this.db.collection('reports');

    if (options?.status && options.status !== 'ALL') {
      query = query.where('status', '==', options.status);
    }
    if (options?.category && options.category !== 'ALL') {
      query = query.where('category', '==', options.category);
    }

    query = query.orderBy('createdAt', 'desc');

    if (options?.cursor) {
      const cursorDoc = await this.db.collection('reports').doc(options.cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const limit = Math.min(options?.limit || 50, 50);
    query = query.limit(limit);

    const snapshot = await query.get();
    let reports: CampusReport[] = snapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data(),
    }));

    if (options?.search && options.search.trim()) {
      const q = options.search.toLowerCase().trim();
      reports = reports.filter((r) =>
        (r.message && r.message.toLowerCase().includes(q)) ||
        (r.description && r.description.toLowerCase().includes(q)) ||
        (r.reporterName && r.reporterName.toLowerCase().includes(q)) ||
        (r.reporterContact && r.reporterContact.toLowerCase().includes(q)) ||
        (r.currentNodeId && r.currentNodeId.toLowerCase().includes(q)) ||
        (r.category && r.category.toLowerCase().includes(q))
      );
    }

    const nextCursor = snapshot.docs.length === limit ? snapshot.docs[snapshot.docs.length - 1].id : undefined;
    return {
      reports,
      total: reports.length,
      nextCursor,
    };
  }

  async getCampusReportById(id: string): Promise<CampusReport | null> {
    if (!this.db) throw new Error('Firestore is not initialized.');
    const doc = await this.db.collection('reports').doc(id).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() } as CampusReport;
  }

  async updateCampusReport(id: string, updates: Partial<CampusReport>): Promise<CampusReport | null> {
    if (!this.db) throw new Error('Firestore is not initialized.');
    const docRef = this.db.collection('reports').doc(id);
    await docRef.set({ ...updates, updatedAt: new Date().toISOString() }, { merge: true });
    this.lastSyncAt = new Date().toISOString();
    return this.getCampusReportById(id);
  }

  async deleteCampusReport(id: string): Promise<boolean> {
    if (!this.db) throw new Error('Firestore is not initialized.');
    await this.db.collection('reports').doc(id).delete();
    this.lastSyncAt = new Date().toISOString();
    return true;
  }

  async saveCampusInfo(info: CampusInfoData): Promise<void> {
    if (!this.db) throw new Error('Firestore is not initialized.');
    await this.db.collection('settings').doc('campus_info').set(info);
    this.lastSyncAt = new Date().toISOString();
  }

  async getCampusInfo(): Promise<CampusInfoData | null> {
    if (!this.db) return null;
    const doc = await this.db.collection('settings').doc('campus_info').get();
    if (!doc.exists) return null;
    return doc.data() as CampusInfoData;
  }

  async saveCampusEvent(event: CampusEventItem): Promise<void> {
    if (!this.db) throw new Error('Firestore is not initialized.');
    await this.db.collection('events').doc(event.id).set(event);
    this.lastSyncAt = new Date().toISOString();
  }

  async deleteCampusEvent(id: string): Promise<void> {
    if (!this.db) throw new Error('Firestore is not initialized.');
    await this.db.collection('events').doc(id).delete();
    this.lastSyncAt = new Date().toISOString();
  }

  async getCampusEvents(): Promise<CampusEventItem[]> {
    if (!this.db) return [];
    const snap = await this.db.collection('events').orderBy('date', 'asc').get();
    return snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as CampusEventItem));
  }

  async saveDepartment(dept: Department): Promise<void> {
    if (!this.db) throw new Error('Firestore is not initialized.');
    await this.db.collection('departments').doc(dept.id).set(dept);
    this.lastSyncAt = new Date().toISOString();
  }

  async saveAdminUser(user: AdminUser): Promise<void> {
    if (!this.db) throw new Error('Firestore is not initialized.');
    await this.db.collection('adminUsers').doc(user.username).set(user);
    this.lastSyncAt = new Date().toISOString();
  }

  async addAdminAuditAction(action: AdminAuditAction): Promise<void> {
    if (!this.db) throw new Error('Firestore is not initialized.');
    await this.db.collection('adminAuditLogs').doc(action.id).set(action);
    this.lastSyncAt = new Date().toISOString();
  }
}
