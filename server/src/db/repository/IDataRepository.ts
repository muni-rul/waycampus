import {
  Organization,
  Campus,
  Building,
  Floor,
  Room,
  Department,
  Teacher,
  Facility,
  QRCheckpoint,
  NavigationNode,
  NavigationEdge,
  PanoramaNode,
  ClassroomRecord,
  LaboratoryRecord,
  Programme,
  AcademicDepartment,
  VerifiedPlace,
  PlaceAuditLog,
  GraphOverrideData,
  CampusReport,
  FacultyAccount,
  FacultyStatusRecord,
  FacultyStatusAuditLog,
  SearchAlias,
  AdminAuditAction,
  DataSnapshot,
} from '../../../../shared/types';
import { AdminUser } from '../../middleware/auth';
import { DatabaseState } from '../store';

export interface RepositoryHealth {
  connected: boolean;
  status: 'ok' | 'degraded' | 'disconnected';
  provider: 'firestore' | 'in-memory';
  projectId?: string;
  error?: string;
  lastSyncAt?: string;
  documentCounts?: Record<string, number>;
}

export interface RealtimeSubscriptionCallbacks {
  onFacultyAccountChange?: (account: FacultyAccount) => void;
  onFacultyAccountDelete?: (facultyId: string) => void;
  onFacultyStatusChange?: (teacherId: string, status: FacultyStatusRecord) => void;
  onGraphOverridesChange?: (overrides: GraphOverrideData) => void;
  onCampusContentChange?: (content: Partial<DatabaseState>) => void;
  onTeacherChange?: (teacher: Teacher) => void;
}

export interface IDataRepository {
  /**
   * Connect to the underlying storage provider (with retries and backoff).
   */
  connect(): Promise<void>;

  /**
   * Disconnect cleanly.
   */
  disconnect(): Promise<void>;

  /**
   * Return health and connectivity status.
   */
  getHealth(): RepositoryHealth;

  /**
   * Load entire database state into memory at cold boot.
   */
  loadAll(): Promise<DatabaseState>;

  /**
   * Save entire database state (used for migration or bulk initialize).
   */
  saveAll(state: DatabaseState): Promise<void>;

  /**
   * Subscribe to realtime remote updates (e.g. Firestore onSnapshot).
   * Returns an unsubscribe function.
   */
  subscribeRealtime(callbacks: RealtimeSubscriptionCallbacks): () => void;

  // Granular Faculty Account operations
  getFacultyAccount(id: string): Promise<FacultyAccount | null>;
  findFacultyAccountByEmail(email: string): Promise<FacultyAccount | null>;
  saveFacultyAccount(account: FacultyAccount): Promise<void>;
  saveFacultyAccounts(accounts: FacultyAccount[]): Promise<void>;
  deleteFacultyAccount(id: string): Promise<void>;

  // Granular Faculty Status operations
  saveFacultyStatus(teacherId: string, status: FacultyStatusRecord): Promise<void>;
  addFacultyStatusAuditLog(log: FacultyStatusAuditLog): Promise<void>;

  // Granular Content & Graph operations
  saveTeacher(teacher: Teacher): Promise<void>;
  saveTeachers(teachers: Teacher[]): Promise<void>;
  saveGraphOverrides(overrides: GraphOverrideData): Promise<void>;
  saveSearchAliases(aliases: SearchAlias[]): Promise<void>;
  saveCampusReport(report: CampusReport): Promise<void>;

  // Granular Admin operations
  saveAdminUser(user: AdminUser): Promise<void>;
  addAdminAuditAction(action: AdminAuditAction): Promise<void>;
}
