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

export class InMemoryRepository implements IDataRepository {
  private state: DatabaseState;
  private connected: boolean = false;
  private subscribers: RealtimeSubscriptionCallbacks[] = [];
  private lastSyncAt?: string;
  private campusInfo?: CampusInfoData;
  private campusEvents: CampusEventItem[] = [];

  constructor(initialState?: Partial<DatabaseState>) {
    this.state = {
      organizations: initialState?.organizations || [],
      campuses: initialState?.campuses || [],
      buildings: initialState?.buildings || [],
      floors: initialState?.floors || [],
      rooms: initialState?.rooms || [],
      departments: initialState?.departments || [],
      teachers: initialState?.teachers || [],
      facilities: initialState?.facilities || [],
      qrCheckpoints: initialState?.qrCheckpoints || [],
      navigationNodes: initialState?.navigationNodes || [],
      navigationEdges: initialState?.navigationEdges || [],
      panoramas: initialState?.panoramas || [],
      analytics: initialState?.analytics || [],
      classrooms: initialState?.classrooms || [],
      laboratories: initialState?.laboratories || [],
      programmes: initialState?.programmes || [],
      academicDepartments: initialState?.academicDepartments || [],
      places: initialState?.places || [],
      placeAuditLogs: initialState?.placeAuditLogs || [],
      graphOverrides: initialState?.graphOverrides,
      adminUsers: initialState?.adminUsers || [],
      reports: initialState?.reports || [],
      facultyAccounts: initialState?.facultyAccounts || [],
      facultyStatuses: initialState?.facultyStatuses || {},
      facultyStatusAuditLogs: initialState?.facultyStatusAuditLogs || [],
      searchAliases: initialState?.searchAliases || [],
      adminAuditActions: initialState?.adminAuditActions || [],
      snapshots: initialState?.snapshots || [],
    };
  }

  async connect(): Promise<void> {
    this.connected = true;
    this.lastSyncAt = new Date().toISOString();
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.subscribers = [];
  }

  getHealth(): RepositoryHealth {
    return {
      connected: this.connected,
      status: this.connected ? 'ok' : 'disconnected',
      provider: 'in-memory',
      projectId: 'in-memory-test',
      lastSyncAt: this.lastSyncAt,
      documentCounts: {
        facultyAccounts: this.state.facultyAccounts?.length || 0,
        teachers: this.state.teachers?.length || 0,
        facultyStatuses: Object.keys(this.state.facultyStatuses || {}).length,
        facultyStatusAuditLogs: this.state.facultyStatusAuditLogs?.length || 0,
        adminAuditActions: this.state.adminAuditActions?.length || 0,
      },
    };
  }

  async loadAll(): Promise<DatabaseState> {
    this.lastSyncAt = new Date().toISOString();
    return JSON.parse(JSON.stringify(this.state));
  }

  async saveAll(state: DatabaseState): Promise<void> {
    this.state = JSON.parse(JSON.stringify(state));
    this.lastSyncAt = new Date().toISOString();
  }

  subscribeRealtime(callbacks: RealtimeSubscriptionCallbacks): () => void {
    this.subscribers.push(callbacks);
    return () => {
      this.subscribers = this.subscribers.filter(s => s !== callbacks);
    };
  }

  private notifyAccountChange(account: FacultyAccount): void {
    for (const sub of this.subscribers) {
      try {
        sub.onFacultyAccountChange?.(account);
      } catch {
        // ignore subscriber errors
      }
    }
  }

  private notifyStatusChange(teacherId: string, status: FacultyStatusRecord): void {
    for (const sub of this.subscribers) {
      try {
        sub.onFacultyStatusChange?.(teacherId, status);
      } catch {
        // ignore subscriber errors
      }
    }
  }

  private notifyTeacherChange(teacher: Teacher): void {
    for (const sub of this.subscribers) {
      try {
        sub.onTeacherChange?.(teacher);
      } catch {
        // ignore subscriber errors
      }
    }
  }

  private notifyGraphOverridesChange(overrides: GraphOverrideData): void {
    for (const sub of this.subscribers) {
      try {
        sub.onGraphOverridesChange?.(overrides);
      } catch {
        // ignore subscriber errors
      }
    }
  }

  async getFacultyAccount(id: string): Promise<FacultyAccount | null> {
    const acc = this.state.facultyAccounts?.find(a => a.facultyId === id || a.id === id);
    return acc ? JSON.parse(JSON.stringify(acc)) : null;
  }

  async findFacultyAccountByEmail(email: string): Promise<FacultyAccount | null> {
    const normalized = email.trim().toLowerCase();
    const acc = this.state.facultyAccounts?.find(
      a => ((a.email || (a as any).officialEmail || '').trim().toLowerCase() === normalized)
    );
    return acc ? JSON.parse(JSON.stringify(acc)) : null;
  }

  async saveFacultyAccount(account: FacultyAccount): Promise<void> {
    if (!this.state.facultyAccounts) {
      this.state.facultyAccounts = [];
    }
    const facultyId = account.facultyId || account.id;
    const email = (account.email || (account as any).officialEmail || '').trim().toLowerCase();

    // Check unique email enforcement
    if (email) {
      const existing = this.state.facultyAccounts.find(
        a => ((a.email || (a as any).officialEmail || '').trim().toLowerCase() === email)
      );
      if (existing && (existing.facultyId || existing.id) !== facultyId) {
        throw new Error(`Email is already assigned to faculty ${existing.facultyId || existing.id}`);
      }
    }

    const idx = this.state.facultyAccounts.findIndex(a => (a.facultyId || a.id) === facultyId);
    const sanitizedAccount: FacultyAccount = {
      id: account.id || `fa_${facultyId}`,
      facultyId,
      email: email,
      facultyCode: account.facultyCode || facultyId,
      passwordHash: account.passwordHash,
      role: 'FACULTY',
      isActive: account.isActive !== undefined ? account.isActive : true,
      mustChangePassword: account.mustChangePassword ?? true,
      createdAt: account.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastLoginAt: account.lastLoginAt,
    };

    if (idx >= 0) {
      this.state.facultyAccounts[idx] = sanitizedAccount;
    } else {
      this.state.facultyAccounts.push(sanitizedAccount);
    }
    this.lastSyncAt = new Date().toISOString();
    this.notifyAccountChange(sanitizedAccount);
  }

  async saveFacultyAccounts(accounts: FacultyAccount[]): Promise<void> {
    for (const acc of accounts) {
      await this.saveFacultyAccount(acc);
    }
  }

  async deleteFacultyAccount(id: string): Promise<void> {
    if (this.state.facultyAccounts) {
      this.state.facultyAccounts = this.state.facultyAccounts.filter(a => a.id !== id && a.facultyId !== id);
    }
    for (const sub of this.subscribers) {
      try {
        sub.onFacultyAccountDelete?.(id);
      } catch {
        // ignore
      }
    }
  }

  async saveFacultyStatus(teacherId: string, status: FacultyStatusRecord): Promise<void> {
    if (!this.state.facultyStatuses) {
      this.state.facultyStatuses = {};
    }
    this.state.facultyStatuses[teacherId] = JSON.parse(JSON.stringify(status));
    this.lastSyncAt = new Date().toISOString();
    this.notifyStatusChange(teacherId, status);
  }

  async addFacultyStatusAuditLog(log: FacultyStatusAuditLog): Promise<void> {
    if (!this.state.facultyStatusAuditLogs) {
      this.state.facultyStatusAuditLogs = [];
    }
    this.state.facultyStatusAuditLogs.unshift(JSON.parse(JSON.stringify(log)));
    if (this.state.facultyStatusAuditLogs.length > 2000) {
      this.state.facultyStatusAuditLogs = this.state.facultyStatusAuditLogs.slice(0, 2000);
    }
    this.lastSyncAt = new Date().toISOString();
  }

  async saveTeacher(teacher: Teacher): Promise<void> {
    if (!this.state.teachers) {
      this.state.teachers = [];
    }
    const idx = this.state.teachers.findIndex(t => t.id === teacher.id);
    if (idx >= 0) {
      this.state.teachers[idx] = JSON.parse(JSON.stringify(teacher));
    } else {
      this.state.teachers.push(JSON.parse(JSON.stringify(teacher)));
    }
    this.lastSyncAt = new Date().toISOString();
    this.notifyTeacherChange(teacher);
  }

  async saveTeachers(teachers: Teacher[]): Promise<void> {
    for (const t of teachers) {
      await this.saveTeacher(t);
    }
  }

  async saveGraphOverrides(overrides: GraphOverrideData): Promise<void> {
    this.state.graphOverrides = JSON.parse(JSON.stringify(overrides));
    this.lastSyncAt = new Date().toISOString();
    this.notifyGraphOverridesChange(overrides);
  }

  async saveSearchAliases(aliases: SearchAlias[]): Promise<void> {
    this.state.searchAliases = JSON.parse(JSON.stringify(aliases));
    this.lastSyncAt = new Date().toISOString();
  }

  async saveCampusReport(report: CampusReport): Promise<void> {
    if (!this.state.reports) {
      this.state.reports = [];
    }
    const idx = this.state.reports.findIndex((r) => r.id === report.id);
    if (idx >= 0) {
      this.state.reports[idx] = JSON.parse(JSON.stringify(report));
    } else {
      this.state.reports.unshift(JSON.parse(JSON.stringify(report)));
    }
    this.lastSyncAt = new Date().toISOString();
  }

  async queryCampusReports(options?: ReportQueryOptions): Promise<ReportQueryResult> {
    let reports = [...(this.state.reports || [])];

    if (options?.status && options.status !== 'ALL') {
      reports = reports.filter((r) => r.status === options.status);
    }
    if (options?.category && options.category !== 'ALL') {
      reports = reports.filter((r) => r.category === options.category || r.issueType === options.category);
    }
    if (options?.startDate) {
      reports = reports.filter((r) => r.createdAt >= options.startDate!);
    }
    if (options?.endDate) {
      reports = reports.filter((r) => r.createdAt <= options.endDate!);
    }
    if (options?.search && options.search.trim()) {
      const q = options.search.toLowerCase().trim();
      reports = reports.filter(
        (r) =>
          (r.message && r.message.toLowerCase().includes(q)) ||
          (r.description && r.description.toLowerCase().includes(q)) ||
          (r.reporterName && r.reporterName.toLowerCase().includes(q)) ||
          (r.reporterContact && r.reporterContact.toLowerCase().includes(q)) ||
          (r.currentNodeId && r.currentNodeId.toLowerCase().includes(q)) ||
          (r.category && r.category.toLowerCase().includes(q))
      );
    }

    // Newest first
    reports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = reports.length;
    let startIndex = 0;
    if (options?.cursor) {
      const cursorIndex = reports.findIndex((r) => r.id === options.cursor);
      if (cursorIndex >= 0) {
        startIndex = cursorIndex + 1;
      }
    }

    const limit = Math.min(options?.limit || 50, 50);
    const paginated = reports.slice(startIndex, startIndex + limit);
    const nextCursor =
      startIndex + limit < reports.length && paginated.length > 0
        ? paginated[paginated.length - 1].id
        : undefined;

    return {
      reports: paginated,
      total,
      nextCursor,
    };
  }

  async getCampusReportById(id: string): Promise<CampusReport | null> {
    const report = (this.state.reports || []).find((r) => r.id === id);
    return report ? JSON.parse(JSON.stringify(report)) : null;
  }

  async updateCampusReport(id: string, updates: Partial<CampusReport>): Promise<CampusReport | null> {
    if (!this.state.reports) return null;
    const idx = this.state.reports.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    const updated = {
      ...this.state.reports[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.state.reports[idx] = updated;
    this.lastSyncAt = new Date().toISOString();
    return JSON.parse(JSON.stringify(updated));
  }

  async deleteCampusReport(id: string): Promise<boolean> {
    if (!this.state.reports) return false;
    const prevLen = this.state.reports.length;
    this.state.reports = this.state.reports.filter((r) => r.id !== id);
    this.lastSyncAt = new Date().toISOString();
    return this.state.reports.length < prevLen;
  }

  async saveCampusInfo(info: CampusInfoData): Promise<void> {
    this.campusInfo = JSON.parse(JSON.stringify(info));
    this.lastSyncAt = new Date().toISOString();
  }

  async getCampusInfo(): Promise<CampusInfoData | null> {
    return this.campusInfo ? JSON.parse(JSON.stringify(this.campusInfo)) : null;
  }

  async saveCampusEvent(event: CampusEventItem): Promise<void> {
    const idx = this.campusEvents.findIndex((e) => e.id === event.id);
    if (idx >= 0) {
      this.campusEvents[idx] = JSON.parse(JSON.stringify(event));
    } else {
      this.campusEvents.push(JSON.parse(JSON.stringify(event)));
    }
    this.lastSyncAt = new Date().toISOString();
  }

  async deleteCampusEvent(id: string): Promise<void> {
    this.campusEvents = this.campusEvents.filter((e) => e.id !== id);
    this.lastSyncAt = new Date().toISOString();
  }

  async getCampusEvents(): Promise<CampusEventItem[]> {
    return JSON.parse(JSON.stringify(this.campusEvents));
  }

  async saveDepartment(dept: Department): Promise<void> {
    if (!this.state.departments) this.state.departments = [];
    const idx = this.state.departments.findIndex((d) => d.id === dept.id);
    if (idx >= 0) {
      this.state.departments[idx] = JSON.parse(JSON.stringify(dept));
    } else {
      this.state.departments.push(JSON.parse(JSON.stringify(dept)));
    }
    this.lastSyncAt = new Date().toISOString();
  }

  async saveAdminUser(user: AdminUser): Promise<void> {
    if (!this.state.adminUsers) {
      this.state.adminUsers = [];
    }
    const idx = this.state.adminUsers.findIndex(u => u.username === user.username);
    if (idx >= 0) {
      this.state.adminUsers[idx] = JSON.parse(JSON.stringify(user));
    } else {
      this.state.adminUsers.push(JSON.parse(JSON.stringify(user)));
    }
    this.lastSyncAt = new Date().toISOString();
  }

  async addAdminAuditAction(action: AdminAuditAction): Promise<void> {
    if (!this.state.adminAuditActions) {
      this.state.adminAuditActions = [];
    }
    this.state.adminAuditActions.unshift(JSON.parse(JSON.stringify(action)));
    if (this.state.adminAuditActions.length > 2000) {
      this.state.adminAuditActions = this.state.adminAuditActions.slice(0, 2000);
    }
    this.lastSyncAt = new Date().toISOString();
  }
}
