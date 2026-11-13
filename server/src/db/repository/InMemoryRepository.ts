import {
  IDataRepository,
  RepositoryHealth,
  RealtimeSubscriptionCallbacks,
} from './IDataRepository';
import { DatabaseState } from '../store';
import {
  Teacher,
  GraphOverrideData,
  CampusReport,
  FacultyAccount,
  FacultyStatusRecord,
  FacultyStatusAuditLog,
  SearchAlias,
  AdminAuditAction,
} from '../../../../shared/types';
import { AdminUser } from '../../middleware/auth';

export class InMemoryRepository implements IDataRepository {
  private state: DatabaseState;
  private connected: boolean = false;
  private subscribers: RealtimeSubscriptionCallbacks[] = [];
  private lastSyncAt?: string;

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
    this.state.reports.push(JSON.parse(JSON.stringify(report)));
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
