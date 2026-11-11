import {
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
  SearchResult,
  RouteResult,
  Instruction,
  VerificationStatus,
  CampusReport,
  CampusReportStatus,
  CampusReportPriority,
  CampusReportIssueType,
  PublicFacultyStatus,
  FacultyStatusType,
  FacultyAccount,
  FacultyStatusAuditLog,
  DataSnapshot,
  SearchAlias,
  AdminAuditAction,
  SystemValidationReport,
} from '../../../shared/types';
import { PanoramaNode } from '../../../shared/types';
import { logoutAdmin } from '../utils/security';

let customApiBaseUrl: string | null = null;

export function getApiBaseUrl(): string {
  if (customApiBaseUrl) return customApiBaseUrl;
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem('campnav_api_base_url');
    if (saved && saved.trim()) return saved.trim().replace(/\/+$/, '');
  }
  return '/api/v1';
}

const API_BASE_URL = '/api/v1';

export class ApiService {
  public static getBaseUrl(): string {
    return getApiBaseUrl();
  }

  public static setBaseUrl(url: string | null): void {
    const oldUrl = customApiBaseUrl;
    customApiBaseUrl = url ? url.trim().replace(/\/+$/, '') : null;
    if (typeof window !== 'undefined') {
      // Clear admin session token whenever target API changes
      if (oldUrl !== customApiBaseUrl && typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('campnav_admin_token');
      }
      if (typeof localStorage !== 'undefined') {
        if (customApiBaseUrl) {
          localStorage.setItem('campnav_api_base_url', customApiBaseUrl);
        } else {
          localStorage.removeItem('campnav_api_base_url');
        }
      }
    }
  }

  public static async checkHealth() {
    try {
      const res = await fetch(`${getApiBaseUrl()}/health`);
      return await res.json();
    } catch {
      return { status: 'offline' };
    }
  }

  public static async search(
    query: string,
    userLocation?: { x: number; y: number; z: number; floorNumber?: number }
  ): Promise<SearchResult[]> {
    try {
      const res = await fetch(`${getApiBaseUrl()}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, userLocation }),
      });
      if (!res.ok) throw new Error('Search request failed');
      const data = await res.json();
      return data.results || [];
    } catch (err) {
      console.warn('Using offline search fallback', err);
      return [];
    }
  }

  public static async getRoute(
    fromNodeId: string,
    toNodeId: string,
    accessibleOnly: boolean = false,
    avoidClosed: boolean = true
  ): Promise<RouteResult | null> {
    try {
      const res = await fetch(`${getApiBaseUrl()}/navigation/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromNodeId, toNodeId, accessibleOnly, avoidClosed }),
      });
      if (!res.ok) throw new Error('Route request failed');
      return await res.json();
    } catch (err) {
      console.warn('Route calculation failed:', err);
      return null;
    }
  }

  public static async getCampuses(): Promise<Campus[]> {
    const res = await fetch(`${getApiBaseUrl()}/campuses`);
    return await res.json();
  }

  public static async getBuildings(): Promise<Building[]> {
    const res = await fetch(`${getApiBaseUrl()}/buildings`);
    return await res.json();
  }

  public static async getFloors(buildingId?: string): Promise<Floor[]> {
    const url = buildingId ? `${getApiBaseUrl()}/floors?buildingId=${buildingId}` : `${getApiBaseUrl()}/floors`;
    const res = await fetch(url);
    return await res.json();
  }

  public static async getRooms(buildingId?: string, floorId?: string): Promise<Room[]> {
    let url = `${getApiBaseUrl()}/rooms`;
    const params = new URLSearchParams();
    if (buildingId) params.append('buildingId', buildingId);
    if (floorId) params.append('floorId', floorId);
    if (params.toString()) url += `?${params.toString()}`;
    const res = await fetch(url);
    return await res.json();
  }

  public static async addRoom(room: Room): Promise<Room> {
    const res = await fetch(`${getApiBaseUrl()}/admin/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify(room),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to create room' }));
      throw new Error(err.error || 'Failed to create room');
    }
    return await res.json();
  }

  public static async updateRoom(id: string, updates: Partial<Room>): Promise<Room> {
    const res = await fetch(`${getApiBaseUrl()}/admin/rooms/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to update room' }));
      throw new Error(err.error || 'Failed to update room');
    }
    return await res.json();
  }

  public static async deleteRoom(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`${getApiBaseUrl()}/admin/rooms/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to delete room' }));
      throw new Error(err.error || 'Failed to delete room');
    }
    return await res.json();
  }

  public static async getDepartments(): Promise<Department[]> {
    const res = await fetch(`${getApiBaseUrl()}/departments`);
    return await res.json();
  }

  public static async getTeachers(): Promise<Teacher[]> {
    const res = await fetch(`${getApiBaseUrl()}/teachers`);
    return await res.json();
  }

  public static async getFacilities(): Promise<Facility[]> {
    const res = await fetch(`${getApiBaseUrl()}/facilities`);
    return await res.json();
  }

  public static async getNodes(): Promise<NavigationNode[]> {
    const res = await fetch(`${getApiBaseUrl()}/nodes`);
    return await res.json();
  }

  public static async getEdges(): Promise<NavigationEdge[]> {
    const res = await fetch(`${getApiBaseUrl()}/edges`);
    return await res.json();
  }

  public static async getQRCheckpoints(): Promise<QRCheckpoint[]> {
    const res = await fetch(`${getApiBaseUrl()}/qr`);
    return await res.json();
  }

  public static async resolveQR(code: string): Promise<QRCheckpoint> {
    const res = await fetch(`${getApiBaseUrl()}/qr/${encodeURIComponent(code)}`);
    if (!res.ok) throw new Error('QR not found');
    const data = await res.json();
    return data.checkpoint || data;
  }

  // --- Panorama Street View Endpoints ---
  public static async getPanoramas(buildingId?: string, floorNumber?: number): Promise<PanoramaNode[]> {
    const params = new URLSearchParams();
    if (buildingId) params.append('buildingId', buildingId);
    if (floorNumber !== undefined) params.append('floorNumber', floorNumber.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`${getApiBaseUrl()}/panoramas${query}`);
    return await res.json();
  }

  public static async getPanoramaById(id: string): Promise<PanoramaNode> {
    const res = await fetch(`${getApiBaseUrl()}/panoramas/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error('Panorama node not found');
    return await res.json();
  }

  public static async getPanoramaByNodeId(nodeId: string): Promise<PanoramaNode | null> {
    const res = await fetch(`${getApiBaseUrl()}/panoramas/node/${encodeURIComponent(nodeId)}`);
    if (!res.ok) return null;
    return await res.json();
  }

  public static async getRoutePanoramaSequence(
    pathNodeIds: string[],
    instructions: Instruction[] = []
  ): Promise<any[]> {
    const res = await fetch(`${getApiBaseUrl()}/panoramas/route-sequence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pathNodeIds, instructions }),
    });
    if (!res.ok) throw new Error('Failed to compute panorama sequence');
    return await res.json();
  }

  // --- Admin Endpoints & Authentication ---
  public static isRemoteTarget(): boolean {
    const currentBase = getApiBaseUrl();
    return currentBase.startsWith('http') && !currentBase.includes('localhost') && !currentBase.includes('127.0.0.1');
  }

  public static getAdminToken(): string | null {
    if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
      return sessionStorage.getItem('campnav_admin_token');
    }
    return null;
  }

  public static hasAdminToken(): boolean {
    const token = this.getAdminToken();
    return Boolean(token && token !== 'dev-localhost-unrestricted-bypass-token');
  }

  private static getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    // Admin auth token is stored strictly in sessionStorage only (never in localStorage)
    let token = this.getAdminToken();

    // Auto dev bypass fallback ONLY for local development when not pointed at a remote host
    if (!token && !this.isRemoteTarget()) {
      token = 'dev-localhost-unrestricted-bypass-token';
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  public static async adminLogin(credentials: string | { username?: string; password?: string; pin?: string }) {
    const payload = typeof credentials === 'string' ? { pin: credentials } : credentials;
    const res = await fetch(`${getApiBaseUrl()}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.status === 404) {
      throw new Error('Admin access is disabled on that server. Set ADMIN_PASSWORD and ADMIN_EMERGENCY_PIN on the server.');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Authentication failed' }));
      throw new Error(err.error || 'Access denied');
    }
    const data = await res.json();
    if (data.token && typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
      // Store in sessionStorage only
      sessionStorage.setItem('campnav_admin_token', data.token);
    }
    return data;
  }

  public static async getPersistenceStatus() {
    const res = await fetch(`${getApiBaseUrl()}/admin/persistence/status`, {
      headers: this.getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch persistence status' }));
      throw new Error(err.error || 'Failed to fetch persistence status');
    }
    return await res.json();
  }

  public static async getAdminUsers() {
    const res = await fetch(`${getApiBaseUrl()}/admin/users`, {
      headers: this.getAuthHeaders(),
    });
    return await res.json();
  }

  public static async createAdminUser(data: { username: string; password: string; name?: string; email?: string; role?: string }) {
    const res = await fetch(`${getApiBaseUrl()}/admin/users`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to create admin user' }));
      throw new Error(err.error || 'Failed to create user');
    }
    return await res.json();
  }

  public static async deleteAdminUser(id: string) {
    const res = await fetch(`${getApiBaseUrl()}/admin/users/${id}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to delete admin user' }));
      throw new Error(err.error || 'Failed to delete user');
    }
    return await res.json();
  }

  public static async verifyEntity(
    entityType: 'BUILDING' | 'ROOM' | 'TEACHER' | 'FACILITY' | 'DEPARTMENT',
    id: string,
    status: VerificationStatus,
    verifiedBy: string = 'Campus Admin'
  ) {
    const res = await fetch(`${getApiBaseUrl()}/admin/verify`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ entityType, id, status, verifiedBy }),
    });
    return await res.json();
  }

  public static async addTeacher(teacher: Teacher) {
    const res = await fetch(`${getApiBaseUrl()}/admin/teachers`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(teacher),
    });
    return await this.safeJsonParse(res);
  }

  public static async bulkUploadTeachers(teachers: Partial<Teacher>[]) {
    const res = await fetch(`${getApiBaseUrl()}/admin/teachers/bulk`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ teachers }),
    });
    return await this.safeJsonParse(res);
  }

  public static async updateTeacher(id: string, updates: Partial<Teacher>): Promise<Teacher> {
    const res = await fetch(`${getApiBaseUrl()}/admin/teachers/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(updates),
    });
    return await this.safeJsonParse(res);
  }

  public static async deleteTeacher(id: string) {
    const res = await fetch(`${getApiBaseUrl()}/admin/teachers/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });
    return await this.safeJsonParse(res);
  }

  public static async createDepartment(department: Partial<Department>): Promise<Department> {
    const res = await fetch(`${getApiBaseUrl()}/admin/departments`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(department),
    });
    return await this.safeJsonParse(res);
  }

  public static async updateDepartment(id: string, updates: Partial<Department>): Promise<Department> {
    const res = await fetch(`${getApiBaseUrl()}/admin/departments/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(updates),
    });
    return await this.safeJsonParse(res);
  }

  public static async assignDepartmentTag(
    deptId: string,
    tag: { tagId: string; tagName: string; nodeId: string; buildingName?: string; floorName?: string }
  ) {
    const res = await fetch(`${getApiBaseUrl()}/admin/departments/${encodeURIComponent(deptId)}/assign-tag`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(tag),
    });
    return await this.safeJsonParse(res);
  }

  public static async updateEdge(id: string, updates: Partial<NavigationEdge>) {
    const res = await fetch(`${getApiBaseUrl()}/admin/edges/${id}`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(updates),
    });
    return await res.json();
  }

  public static async updateNode(id: string, updates: Partial<NavigationNode>) {
    const res = await fetch(`${getApiBaseUrl()}/admin/nodes/${id}`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(updates),
    });
    return await res.json();
  }

  public static async addNode(node: NavigationNode) {
    const res = await fetch(`${getApiBaseUrl()}/admin/nodes`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(node),
    });
    return await res.json();
  }

  public static async addEdge(edge: NavigationEdge) {
    const res = await fetch(`${getApiBaseUrl()}/admin/edges`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(edge),
    });
    return await res.json();
  }

  public static async deleteNode(id: string) {
    const res = await fetch(`${getApiBaseUrl()}/admin/nodes/${id}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });
    return await res.json();
  }

  public static async resetDatabase() {
    const res = await fetch(`${getApiBaseUrl()}/admin/reset`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
    });
    return await res.json();
  }

  public static async getAnalytics() {
    const res = await fetch(`${getApiBaseUrl()}/admin/analytics`, {
      headers: this.getAuthHeaders(),
    });
    return await res.json();
  }

  public static async addPanorama(pano: PanoramaNode) {
    const res = await fetch(`${getApiBaseUrl()}/admin/panoramas`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(pano),
    });
    return await res.json();
  }

  public static async updatePanorama(id: string, updates: Partial<PanoramaNode>) {
    const res = await fetch(`${getApiBaseUrl()}/admin/panoramas/${id}`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(updates),
    });
    return await res.json();
  }

  public static async deletePanorama(id: string) {
    const res = await fetch(`${getApiBaseUrl()}/admin/panoramas/${id}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });
    return await res.json();
  }

  public static async getHealthAudit() {
    const res = await fetch(`${getApiBaseUrl()}/admin/health-audit`, {
      headers: this.getAuthHeaders(),
    });
    return await res.json();
  }

  // ─────────────────────────────────────────────────────────────
  // MASTER VERIFIED PLACE MAPPING CLIENT APIS (SAFE ROBUST CLIENT)
  // ─────────────────────────────────────────────────────────────
  private static async safeJsonParse(res: Response, fallback: any = null) {
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}: ${res.statusText || 'Endpoint unavailable'}`);
      }
      return fallback;
    }
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || data?.message || `Request failed with status ${res.status}`);
    }
    return data;
  }

  public static async getPlaces(filter?: {
    panoramaId?: string;
    nodeId?: string;
    buildingId?: string;
    floorNumber?: number;
    category?: string;
    status?: string;
    verifiedOnly?: boolean;
  }) {
    try {
      const params = new URLSearchParams();
      if (filter?.panoramaId) params.append('panoramaId', filter.panoramaId);
      if (filter?.nodeId) params.append('nodeId', filter.nodeId);
      if (filter?.buildingId) params.append('buildingId', filter.buildingId);
      if (filter?.floorNumber !== undefined) params.append('floorNumber', String(filter.floorNumber));
      if (filter?.category) params.append('category', filter.category);
      if (filter?.status) params.append('status', filter.status);
      if (filter?.verifiedOnly) params.append('verifiedOnly', 'true');

      const res = await fetch(`${getApiBaseUrl()}/places?${params.toString()}`);
      return await this.safeJsonParse(res, []);
    } catch (err) {
      console.warn('[ApiService.getPlaces] Failed:', err);
      return [];
    }
  }

  public static async getPlacesForPanorama(panoramaId: string) {
    try {
      const res = await fetch(`${getApiBaseUrl()}/places/panorama/${encodeURIComponent(panoramaId)}`);
      return await this.safeJsonParse(res, []);
    } catch (err) {
      console.warn('[ApiService.getPlacesForPanorama] Failed:', err);
      return [];
    }
  }

  public static async getPlaceById(id: string) {
    try {
      const res = await fetch(`${getApiBaseUrl()}/places/${encodeURIComponent(id)}`);
      return await this.safeJsonParse(res, null);
    } catch (err) {
      console.warn('[ApiService.getPlaceById] Failed:', err);
      return null;
    }
  }

  public static async addPlace(place: any, verifiedBy: string = 'Campus Mapper') {
    const res = await fetch(`${getApiBaseUrl()}/places`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify({ ...place, verifiedBy }),
    });
    return await this.safeJsonParse(res);
  }

  public static async createPlace(place: any, verifiedBy: string = 'Campus Mapper') {
    return await this.addPlace(place, verifiedBy);
  }

  public static async updatePlace(id: string, updates: any, reason: string = 'Location details updated', updatedBy: string = 'Campus Mapper') {
    const res = await fetch(`${getApiBaseUrl()}/places/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify({ updates, reason, updatedBy }),
    });
    return await this.safeJsonParse(res);
  }

  public static async deletePlace(id: string, reason: string = 'Location archived/deleted', deletedBy: string = 'Campus Mapper') {
    const res = await fetch(`${getApiBaseUrl()}/places/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify({ reason, deletedBy }),
    });
    return await this.safeJsonParse(res);
  }

  public static async checkDuplicatePlace(name: string, roomNumber?: string | null, buildingId?: string, floorId?: string, currentPlaceId?: string) {
    try {
      const res = await fetch(`${getApiBaseUrl()}/places/check-duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, roomNumber, buildingId, floorId, currentPlaceId }),
      });
      return await this.safeJsonParse(res, { hasDuplicate: false, matches: [] });
    } catch (err) {
      console.warn('[ApiService.checkDuplicatePlace] Failed:', err);
      return { hasDuplicate: false, matches: [] };
    }
  }

  public static async getPlaceAuditLogs(placeId?: string) {
    try {
      const params = placeId ? `?placeId=${encodeURIComponent(placeId)}` : '';
      const res = await fetch(`${getApiBaseUrl()}/places/audit/log${params}`);
      return await this.safeJsonParse(res, []);
    } catch (err) {
      console.warn('[ApiService.getPlaceAuditLogs] Failed:', err);
      return [];
    }
  }

  public static async parseNaturalPlaceInput(text: string) {
    const res = await fetch(`${getApiBaseUrl()}/places/parse-natural`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    return await this.safeJsonParse(res);
  }

  // ─────────────────────────────────────────────────────────────
  // PANORAMA ROUTE DEBUGGER & GRAPH REST CLIENT
  // ─────────────────────────────────────────────────────────────

  public static async getGraphOverrides() {
    // Purge legacy obsolete cache
    try {
      localStorage.removeItem('waycampus_graph_overrides_v1');
    } catch {}

    try {
      const res = await fetch(`${getApiBaseUrl()}/graph/overrides`);
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === 'object') {
          try {
            localStorage.setItem('waycampus_graph_overrides_v2', JSON.stringify(data));
          } catch {}
          return data;
        }
      }
    } catch (err) {
      console.warn('[ApiService.getGraphOverrides] Network unavailable, falling back to cache:', err);
    }

    // Offline fallback: check localStorage
    try {
      const cached = localStorage.getItem('waycampus_graph_overrides_v2');
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {}

    // Built-in baked default overrides fallback
    const {
      BAKED_CUSTOM_PLACE_TAGS,
      BAKED_MANUAL_NUMBERS,
      BAKED_CUSTOM_CONNECTIONS,
      BAKED_NODE_CAMERA_ANGLES,
    } = await import('../data/defaultGraphOverrides');

    return {
      nodeImageOverrides: {},
      customConnections: BAKED_CUSTOM_CONNECTIONS,
      nodeHeadingOverrides: {},
      verifiedStatusOverrides: {},
      manualNumbers: BAKED_MANUAL_NUMBERS,
      customPlaceTags: BAKED_CUSTOM_PLACE_TAGS,
      nodeCameraAngles: BAKED_NODE_CAMERA_ANGLES,
      lastSavedAt: new Date().toISOString(),
      savedBy: 'Baked Offline Dataset',
    };
  }

  public static async saveGraphOverrides(overrides: any, savedBy: string = 'Campus Mapper') {
    // 1. Immediately cache locally in browser storage so user work is always retained even on server failure
    try {
      localStorage.setItem('waycampus_graph_overrides_v2', JSON.stringify(overrides));
    } catch {}

    // 2. Persist to backend server API
    const res = await fetch(`${getApiBaseUrl()}/graph/overrides`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify({ overrides, savedBy }),
    });
    const parsed = await this.safeJsonParse(res);
    if (parsed?.overrides) {
      try {
        localStorage.setItem('waycampus_graph_overrides_v2', JSON.stringify(parsed.overrides));
      } catch {}
    }
    return parsed;
  }

  public static async uploadPanoramaImage(params: {
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
  }): Promise<{
    success: boolean;
    message: string;
    result: {
      nodeId: string;
      manualNumber: string;
      filename: string;
      storedFilename: string;
      imagePath: string;
      area: string;
      floor: number;
      mode: 'ADD_NEW' | 'REPLACE';
    };
    overrides: any;
  }> {
    const res = await fetch(`${getApiBaseUrl()}/admin/panoramas/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify(params),
    });
    const parsed = await this.safeJsonParse(res);
    if (parsed?.overrides) {
      try {
        localStorage.setItem('waycampus_graph_overrides_v2', JSON.stringify(parsed.overrides));
      } catch {}
    }
    return parsed;
  }

  public static async validateGraph(nodes: any[] = [], overrides?: any) {
    try {
      const res = await fetch(`${getApiBaseUrl()}/graph/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes, overrides }),
      });
      return await this.safeJsonParse(res);
    } catch (err) {
      console.warn('[ApiService.validateGraph] Failed:', err);
      return null;
    }
  }
  public static async calibratePanoramaHeading(id: string, northOffset: number, savedBy: string = 'Admin') {
    const res = await fetch(`${getApiBaseUrl()}/admin/panoramas/${id}/calibrate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify({ northOffset, savedBy }),
    });
    return await this.safeJsonParse(res);
  }

  public static async saveEdgeCost(fromNodeId: string, toNodeId: string, distance: number, walkingCost: number, savedBy: string = 'Admin') {
    const res = await fetch(`${getApiBaseUrl()}/admin/edges/cost`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify({ fromNodeId, toNodeId, distance, walkingCost, savedBy }),
    });
    return await this.safeJsonParse(res);
  }

  public static async replacePanoramaImage(id: string, imagePath: string, filename: string, savedBy: string = 'Admin') {
    const res = await fetch(`${getApiBaseUrl()}/admin/panoramas/${id}/image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify({ imagePath, filename, savedBy }),
    });
    return await this.safeJsonParse(res);
  }

  public static async getPublishStatus(): Promise<{
    isLocal: boolean;
    isRender: boolean;
    liveUrl: string;
    gitBranch: string;
    gitAvailable: boolean;
    uncommittedChanges: boolean;
    lastCommitHash: string;
    lastCommitMsg: string;
    lastSavedAt: string | null;
    savedBy: string | null;
    version?: number;
    contentHash?: string;
    lastPublishedVersion?: number;
    lastPublishedHash?: string;
    lastPublishedAt?: string | null;
    publishStatus?: 'DRAFT' | 'PUBLISHED' | 'OUT_OF_SYNC';
    validation?: {
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
    };
  }> {
    const res = await fetch(`${getApiBaseUrl()}/publish/status`, {
      headers: this.getAuthHeaders(),
    });
    return await this.safeJsonParse(res, {
      isLocal: true,
      isRender: false,
      liveUrl: 'https://campnav-b3om.onrender.com/',
      gitBranch: 'unknown',
      gitAvailable: false,
      uncommittedChanges: false,
      lastCommitHash: '',
      lastCommitMsg: '',
      lastSavedAt: null,
      savedBy: null,
    });
  }

  public static async validatePublishState(targetUrl?: string): Promise<{
    success: boolean;
    validation: any;
    remoteStatus?: any;
  }> {
    const res = await fetch(`${getApiBaseUrl()}/publish/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify({ targetUrl }),
    });
    return await this.safeJsonParse(res);
  }

  public static async syncPublishToTarget(params: {
    targetUrl?: string;
    targetAuthToken?: string;
    force?: boolean;
    confirmLiveProduction?: boolean;
    mode?: 'TARGET_API' | 'LOCAL_MARK_PUBLISHED';
  }): Promise<{
    success: boolean;
    mode?: string;
    targetUrl?: string;
    snapshotId?: string;
    verifiedRemoteHash?: string;
    remoteNodeCount?: number;
    validation?: any;
    conflict?: boolean;
    requiresConfirmation?: boolean;
    message?: string;
    error?: string;
  }> {
    const sessionToken = sessionStorage.getItem('campnav_admin_token');
    const isRemote = params.targetUrl && !params.targetUrl.includes('localhost') && !params.targetUrl.includes('127.0.0.1');
    if (isRemote && !params.targetAuthToken) {
      if (sessionToken && !sessionToken.includes('bypass')) {
        params.targetAuthToken = sessionToken;
      } else {
        throw new Error('Please authenticate as admin first via Faculty Credentials or Admin Login before publishing to a remote server.');
      }
    }

    const res = await fetch(`${getApiBaseUrl()}/publish/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify(params),
    });
    const data = await res.json().catch(() => ({ error: 'Publish sync failed' }));
    if (!res.ok) {
      const err: any = new Error(data?.error || data?.message || 'Publish synchronization failed');
      err.conflict = data?.conflict;
      err.requiresConfirmation = data?.requiresConfirmation;
      err.validation = data?.validation;
      throw err;
    }
    return data;
  }

  public static async deployToRender(deployHookUrl?: string): Promise<{
    success: boolean;
    gitSuccess?: boolean;
    commitHash?: string;
    hookTriggered?: boolean;
    message?: string;
    error?: string;
  }> {
    const res = await fetch(`${getApiBaseUrl()}/publish/deploy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify({ deployHookUrl }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Publish failed' }));
      throw new Error(err.error || 'Publish failed');
    }
    return await res.json();
  }

  public static getDatabaseExportUrl(): string {
    const token = sessionStorage.getItem('campnav_admin_token');
    return token ? `${getApiBaseUrl()}/publish/export-db?token=${encodeURIComponent(token)}` : `${getApiBaseUrl()}/publish/export-db`;
  }

  public static async importDatabase(payload: any): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${getApiBaseUrl()}/publish/import-db`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Database import failed' }));
      throw new Error(err.error || 'Database import failed');
    }
    return await res.json();
  }

  // ─────────────────────────────────────────────────────────────
  // BUG REPORTING & FEEDBACK CLIENT METHODS (DUAL-STORAGE RESILIENT)
  // ─────────────────────────────────────────────────────────────

  private static isSameReport(a: CampusReport, b: CampusReport): boolean {
    if (a.id === b.id) return true;
    const descA = (a.description || '').trim().toLowerCase();
    const descB = (b.description || '').trim().toLowerCase();
    if (!descA || descA !== descB) return false;
    const typeA = a.issueType || a.category;
    const typeB = b.issueType || b.category;
    if (typeA && typeB && typeA !== typeB) return false;
    const nodeA = a.currentNodeId || a.currentPanoramaId || '';
    const nodeB = b.currentNodeId || b.currentPanoramaId || '';
    if (nodeA && nodeB && nodeA !== nodeB) return false;
    return true;
  }

  private static getLocalReports(): CampusReport[] {
    try {
      const raw = localStorage.getItem('waycampus_submitted_reports');
      if (!raw) return [];
      const parsed: CampusReport[] = JSON.parse(raw);
      // Deduplicate on read
      const deduped: CampusReport[] = [];
      parsed.forEach((item) => {
        if (!deduped.some((existing) => this.isSameReport(existing, item))) {
          deduped.push(item);
        }
      });
      return deduped;
    } catch {
      return [];
    }
  }

  private static setLocalReports(reports: CampusReport[]) {
    try {
      const deduped: CampusReport[] = [];
      reports.forEach((item) => {
        const idx = deduped.findIndex((existing) => this.isSameReport(existing, item));
        if (idx === -1) {
          deduped.push(item);
        } else {
          // Keep newest updatedAt
          const existingTime = new Date(deduped[idx].updatedAt || deduped[idx].createdAt).getTime();
          const itemTime = new Date(item.updatedAt || item.createdAt).getTime();
          if (itemTime >= existingTime) {
            deduped[idx] = { ...deduped[idx], ...item };
          }
        }
      });
      localStorage.setItem('waycampus_submitted_reports', JSON.stringify(deduped));
    } catch {}
  }

  public static async submitCampusReport(report: Partial<CampusReport>): Promise<{
    success: boolean;
    message: string;
    report: { id: string; createdAt: string; status: CampusReportStatus; priority: CampusReportPriority; possibleDuplicateOf?: string };
  }> {
    const now = new Date().toISOString();
    let submittedReport: CampusReport | null = null;

    // 1. Submit to primary backend server API
    try {
      const res = await fetch(`${getApiBaseUrl()}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.report?.id) {
          submittedReport = {
            id: data.report.id,
            createdAt: data.report.createdAt || now,
            updatedAt: data.report.createdAt || now,
            issueType: report.issueType || 'OTHER',
            category: report.category || 'Other Issue',
            description: report.description || '',
            status: data.report.status || 'NEW',
            priority: data.report.priority || (report.priority as CampusReportPriority) || 'HIGH',
            reporterName: report.reporterName,
            reporterContact: report.reporterContact,
            reporterType: report.reporterType || 'student',
            currentPanoramaId: report.currentPanoramaId,
            currentNodeId: report.currentNodeId,
            currentBuildingId: report.currentBuildingId,
            currentFloorId: report.currentFloorId,
            currentPlaceId: report.currentPlaceId,
            currentTagId: report.currentTagId,
            selectedDestinationId: report.selectedDestinationId,
            blockName: report.blockName,
            device: report.device,
            browser: report.browser,
            screenSize: report.screenSize,
            appVersion: report.appVersion || '2.0.0',
            history: [{ timestamp: now, action: 'CREATED', newStatus: 'NEW', note: 'Initial user report submitted' }],
          };
        }
      }
    } catch (netErr) {
      console.warn('[ApiService.submitCampusReport] Local API unreachable, saving report locally:', netErr);
    }

    // 2. Fallback if server was completely unreachable
    if (!submittedReport) {
      const fallbackId = `WC-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
      submittedReport = {
        id: fallbackId,
        createdAt: now,
        updatedAt: now,
        issueType: report.issueType || 'OTHER',
        category: report.category || 'Other Issue',
        description: report.description || '',
        status: 'NEW',
        priority: (report.priority as CampusReportPriority) || 'HIGH',
        reporterName: report.reporterName,
        reporterContact: report.reporterContact,
        reporterType: report.reporterType || 'student',
        currentPanoramaId: report.currentPanoramaId,
        currentNodeId: report.currentNodeId,
        currentBuildingId: report.currentBuildingId,
        currentFloorId: report.currentFloorId,
        currentPlaceId: report.currentPlaceId,
        currentTagId: report.currentTagId,
        selectedDestinationId: report.selectedDestinationId,
        blockName: report.blockName,
        device: report.device || (typeof navigator !== 'undefined' && navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Desktop'),
        browser: typeof navigator !== 'undefined' ? navigator.userAgent : 'Web Browser',
        screenSize: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '1920x1080',
        appVersion: report.appVersion || '2.0.0',
        history: [{ timestamp: now, action: 'CREATED', newStatus: 'NEW', note: 'Initial user report submitted' }],
      };
    }

    // 3. Save single canonical report to localStorage
    const localList = this.getLocalReports();
    const existingIdx = localList.findIndex((r) => this.isSameReport(r, submittedReport!));
    if (existingIdx === -1) {
      localList.unshift(submittedReport);
    } else {
      localList[existingIdx] = submittedReport;
    }
    this.setLocalReports(localList);

    // 4. Notify open Control Center tabs ONCE
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('campnav_report_submitted', { detail: submittedReport }));
      try {
        if ('BroadcastChannel' in window) {
          const bc = new BroadcastChannel('campnav_reports_sync');
          bc.postMessage({ type: 'NEW_REPORT', report: submittedReport });
          bc.close();
        }
      } catch {}
    }

    return {
      success: true,
      message: 'Report submitted successfully.',
      report: {
        id: submittedReport.id,
        createdAt: submittedReport.createdAt,
        status: submittedReport.status,
        priority: submittedReport.priority,
      },
    };
  }

  public static async getAdminReports(params?: {
    status?: string;
    priority?: string;
    category?: string;
    search?: string;
    buildingId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ success: boolean; total: number; reports: CampusReport[] }> {
    let serverReports: CampusReport[] = [];

    // 1. Attempt to fetch from backend server (/api/v1/admin/reports)
    try {
      const query = new URLSearchParams();
      if (params?.status && params.status !== 'ALL') query.set('status', params.status);
      if (params?.priority && params.priority !== 'ALL') query.set('priority', params.priority);
      if (params?.category) query.set('category', params.category);
      if (params?.search) query.set('search', params.search);
      if (params?.buildingId) query.set('buildingId', params.buildingId);
      if (params?.limit) query.set('limit', String(params.limit));
      if (params?.offset) query.set('offset', String(params.offset));

      const queryStr = query.toString() ? `?${query.toString()}` : '';
      const url = `${getApiBaseUrl()}/admin/reports${queryStr}`;
      const res = await fetch(url, {
        headers: this.getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.reports)) {
          serverReports = data.reports;
        }
      }
    } catch (err) {
      console.warn('[ApiService.getAdminReports] Server offline/unreachable:', err);
    }

    // 2. Load locally preserved reports
    const localList = this.getLocalReports();

    // 4. Merge server and local reports with content-aware deduplication
    const mergedList: CampusReport[] = [];

    const addOrMerge = (incoming: CampusReport) => {
      const existingIdx = mergedList.findIndex((r) => this.isSameReport(r, incoming));
      if (existingIdx === -1) {
        mergedList.push(incoming);
      } else {
        const existing = mergedList[existingIdx];
        const incomingTime = new Date(incoming.updatedAt || incoming.createdAt).getTime();
        const existingTime = new Date(existing.updatedAt || existing.createdAt).getTime();
        const bestId = (incoming.id.startsWith('WC-') ? incoming.id : existing.id) || incoming.id;
        if (incomingTime >= existingTime) {
          mergedList[existingIdx] = { ...existing, ...incoming, id: bestId };
        } else {
          mergedList[existingIdx] = { ...incoming, ...existing, id: bestId };
        }
      }
    };

    serverReports.forEach((r) => addOrMerge(r));
    localList.forEach((r) => addOrMerge(r));

    // Save cleaned deduplicated list back to local storage
    this.setLocalReports(mergedList);

    let allReports = mergedList;

    // Apply client filters
    if (params?.status === 'ACTIVE') {
      allReports = allReports.filter((r) => r.status === 'NEW' || r.status === 'ACKNOWLEDGED' || r.status === 'IN_PROGRESS');
    } else if (params?.status && params.status !== 'ALL') {
      allReports = allReports.filter((r) => r.status === params.status);
    }
    if (params?.priority && params.priority !== 'ALL') {
      allReports = allReports.filter((r) => r.priority === params.priority);
    }
    if (params?.search) {
      const q = params.search.toLowerCase();
      allReports = allReports.filter(
        (r) =>
          r.description?.toLowerCase().includes(q) ||
          r.id?.toLowerCase().includes(q) ||
          r.reporterName?.toLowerCase().includes(q) ||
          r.category?.toLowerCase().includes(q)
      );
    }

    // Sort newest first
    allReports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      success: true,
      total: allReports.length,
      reports: allReports.slice(params?.offset || 0, (params?.offset || 0) + (params?.limit || 100)),
    };
  }

  public static async getAdminReportById(id: string): Promise<{ success: boolean; report: CampusReport }> {
    try {
      const res = await fetch(`${getApiBaseUrl()}/admin/reports/${id}`, {
        headers: this.getAuthHeaders(),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {}

    const localMatch = this.getLocalReports().find((r) => r.id === id);
    if (localMatch) {
      return { success: true, report: localMatch };
    }
    throw new Error('Report not found');
  }

  public static async updateAdminReport(
    id: string,
    updates: { status?: CampusReportStatus; priority?: CampusReportPriority; adminNotes?: string }
  ): Promise<{ success: boolean; message: string; report: CampusReport }> {
    // 1. Update local copy immediately
    const localList = this.getLocalReports();
    const target = localList.find((r) => r.id === id);
    if (target) {
      if (updates.status) target.status = updates.status;
      if (updates.priority) target.priority = updates.priority;
      if (updates.adminNotes !== undefined) target.adminNotes = updates.adminNotes;
      target.updatedAt = new Date().toISOString();
      if (updates.status === 'RESOLVED') {
        target.resolvedAt = new Date().toISOString();
        target.resolvedBy = 'admin';
      }
      this.setLocalReports(localList);
    }

    // 2. Send update to local server API
    try {
      await fetch(`${getApiBaseUrl()}/admin/reports/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders(),
        },
        body: JSON.stringify(updates),
      });
    } catch {}

    return {
      success: true,
      message: 'Report updated successfully',
      report: target || ({} as CampusReport),
    };
  }

  public static async deleteAdminReport(id: string): Promise<{ success: boolean; message: string }> {
    // 1. Delete from local store
    const localList = this.getLocalReports().filter((r) => r.id !== id);
    this.setLocalReports(localList);

    // 2. Send delete to relative server API
    try {
      await fetch(`${getApiBaseUrl()}/admin/reports/${id}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders(),
      });
    } catch {}

    return { success: true, message: 'Report deleted successfully' };
  }

  public static async clearAllAdminReports(): Promise<{ success: boolean; message: string }> {
    this.setLocalReports([]);
    try {
      await fetch(`${getApiBaseUrl()}/admin/reports`, {
        method: 'DELETE',
        headers: this.getAuthHeaders(),
      });
    } catch {}
    return { success: true, message: 'All reports cleared' };
  }

  // ─────────────────────────────────────────────────────────────
  // FACULTY AVAILABILITY & PRESENCE STATUS CLIENT APIS
  // ─────────────────────────────────────────────────────────────

  public static getFacultyAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const token = localStorage.getItem('waycampus_faculty_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  // Public (Students & Campus Users - Read-Only)
  public static async getFacultyStatuses(): Promise<Record<string, PublicFacultyStatus>> {
    try {
      const res = await fetch(`${getApiBaseUrl()}/faculty/statuses`);
      if (!res.ok) return {};
      const data = await res.json();
      return data.statuses || {};
    } catch (err) {
      console.warn('Failed to fetch faculty statuses:', err);
      return {};
    }
  }

  public static async getFacultyStatus(facultyId: string): Promise<PublicFacultyStatus | null> {
    try {
      const res = await fetch(`${getApiBaseUrl()}/faculty/${encodeURIComponent(facultyId)}/status`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.status || null;
    } catch {
      return null;
    }
  }

  public static async getVerifiedClassrooms(): Promise<Array<{
    id: string;
    roomNumber: string;
    name: string;
    building: string | null;
    floor: any;
    nodeId: string;
  }>> {
    try {
      const res = await fetch(`${getApiBaseUrl()}/faculty/verified-classrooms`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.classrooms || [];
    } catch {
      return [];
    }
  }

  // Faculty Self-Service (Requires Faculty Auth)
  public static async activateFacultyAccount(payload: {
    facultyId: string;
    email: string;
    password: string;
  }): Promise<{
    success: boolean;
    token: string;
    message: string;
    faculty: any;
  }> {
    const res = await fetch(`${getApiBaseUrl()}/faculty/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Activation failed' }));
      throw new Error(err.error || 'Failed to activate faculty account');
    }

    const data = await res.json();
    if (data.token) {
      localStorage.setItem('waycampus_faculty_token', data.token);
    }
    return data;
  }

  public static async facultyLogin(identifier: string, password: string): Promise<{
    success: boolean;
    token: string;
    mustChangePassword?: boolean;
    faculty: {
      accountId: string;
      facultyId: string;
      name: string;
      designation?: string;
      department?: string;
      email: string;
      departmentPlaceId?: string;
      departmentPlaceNodeId?: string;
    };
  }> {
    const res = await fetch(`${getApiBaseUrl()}/faculty/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Login failed' }));
      throw new Error(err.error || 'Authentication failed');
    }

    const data = await res.json();
    if (data.token) {
      localStorage.setItem('waycampus_faculty_token', data.token);
    }
    return data;
  }

  public static async getFacultyMe(): Promise<{
    success: boolean;
    faculty: Teacher;
    status: PublicFacultyStatus;
    account: { id: string; email: string; facultyCode: string; isActive: boolean; lastLoginAt?: string };
  }> {
    const res = await fetch(`${getApiBaseUrl()}/faculty/me`, {
      headers: this.getFacultyAuthHeaders(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to retrieve profile' }));
      throw new Error(err.error || 'Failed to retrieve profile');
    }

    return await res.json();
  }

  public static async updateFacultyStatus(data: {
    status: FacultyStatusType;
    locationPlaceId?: string;
    durationMinutes?: number;
  }): Promise<{ success: boolean; message: string; status: any; log: any }> {
    const res = await fetch(`${getApiBaseUrl()}/faculty/me/status`, {
      method: 'PATCH',
      headers: this.getFacultyAuthHeaders(),
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to update status' }));
      throw new Error(err.error || 'Failed to update status');
    }

    return await res.json();
  }

  public static async changeFacultyPassword(
    currentPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${getApiBaseUrl()}/faculty/me/change-password`, {
      method: 'POST',
      headers: this.getFacultyAuthHeaders(),
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to change password' }));
      throw new Error(err.error || 'Failed to change password');
    }

    return await res.json();
  }

  public static facultyLogout(): void {
    localStorage.removeItem('waycampus_faculty_token');
  }

  public static adminLogout(): void {
    if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('campnav_admin_token');
    }
    logoutAdmin();
  }

  // Admin Management & Audit (Requires Admin Auth)
  public static async getAdminFacultyAccounts(): Promise<{ success: boolean; accounts: any[] }> {
    const res = await fetch(`${getApiBaseUrl()}/admin/faculty/accounts`, {
      headers: this.getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch accounts' }));
      throw new Error(err.error || 'Failed to fetch accounts');
    }
    return await res.json();
  }

  public static async createAdminFacultyAccount(data: {
    facultyId: string;
    email: string;
    facultyCode?: string;
    password?: string;
  }): Promise<{ success: boolean; temporaryPassword?: string; account: any }> {
    const res = await fetch(`${getApiBaseUrl()}/admin/faculty/accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to create faculty account' }));
      throw new Error(err.error || 'Failed to create faculty account');
    }
    return await res.json();
  }

  public static async batchProvisionFacultyAccounts(
    facultyList: { facultyId: string; email?: string; password?: string }[]
  ): Promise<{
    success: boolean;
    message: string;
    created: {
      facultyId: string;
      name: string;
      designation: string;
      department: string;
      email: string;
      loginId: string;
      temporaryPassword?: string;
    }[];
    skipped: { facultyId: string; name?: string; reason: string }[];
  }> {
    const res = await fetch(`${getApiBaseUrl()}/admin/faculty/batch-provision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify({ facultyList }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to batch provision faculty accounts' }));
      throw new Error(err.error || 'Failed to batch provision faculty accounts');
    }
    return await res.json();
  }

  public static async toggleAdminFacultyAccountActive(
    accountId: string,
    isActive: boolean
  ): Promise<{ success: boolean; message: string; account: any }> {
    const res = await fetch(`${getApiBaseUrl()}/admin/faculty/accounts/${encodeURIComponent(accountId)}/toggle-active`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify({ isActive }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to toggle account' }));
      throw new Error(err.error || 'Failed to toggle account');
    }
    return await res.json();
  }

  public static async resetAdminFacultyAccountPassword(
    accountId: string,
    newPassword?: string
  ): Promise<{ success: boolean; temporaryPassword?: string; message: string }> {
    const res = await fetch(`${getApiBaseUrl()}/admin/faculty/accounts/${encodeURIComponent(accountId)}/reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify(newPassword ? { newPassword } : {}),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to reset password' }));
      throw new Error(err.error || 'Failed to reset password');
    }
    return await res.json();
  }

  public static async scanPublicFacultyEmails(): Promise<{
    success: boolean;
    scannedCount: number;
    suggestions: {
      facultyId: string;
      name: string;
      department: string;
      suggestedEmail: string;
      sourceUrl: string;
      isSuggestion: boolean;
    }[];
  }> {
    const res = await fetch(`${getApiBaseUrl()}/admin/faculty/scan-public-emails`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to scan public faculty pages' }));
      throw new Error(err.error || 'Failed to scan public faculty pages');
    }
    return await res.json();
  }

  public static async overrideAdminFacultyStatus(
    facultyId: string,
    data: {
      status: FacultyStatusType;
      locationPlaceId?: string;
      reason?: string;
      durationMinutes?: number;
    }
  ): Promise<{ success: boolean; message: string; status: any; log: any }> {
    const res = await fetch(`${getApiBaseUrl()}/admin/faculty/${encodeURIComponent(facultyId)}/override-status`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to override status' }));
      throw new Error(err.error || 'Failed to override status');
    }
    return await res.json();
  }

  public static async getAdminFacultyStatusLogs(facultyId?: string): Promise<{ success: boolean; logs: any[] }> {
    const url = facultyId
      ? `${getApiBaseUrl()}/admin/faculty/status-logs?facultyId=${encodeURIComponent(facultyId)}`
      : `${getApiBaseUrl()}/admin/faculty/status-logs`;
    const res = await fetch(url, {
      headers: this.getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch status logs' }));
      throw new Error(err.error || 'Failed to fetch status logs');
    }
    return await res.json();
  }

  // ─────────────────────────────────────────────────────────────
  // CONTROL CENTER — ADMIN OWNERSHIP, SNAPSHOTS, ALIASES & VALIDATION
  // ─────────────────────────────────────────────────────────────

  public static async transferAdminOwnership(
    targetUsername: string,
    transferEmergencyPin: boolean = false,
    notes?: string
  ): Promise<{ success: boolean; message: string; newOwner: string }> {
    const res = await fetch(`${getApiBaseUrl()}/admin/transfer-ownership`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ targetUsername, transferEmergencyPin, notes }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to transfer ownership' }));
      throw new Error(err.error || 'Failed to transfer ownership');
    }
    return await res.json();
  }

  public static async updateAdminUserCredentials(
    id: string,
    updates: { username?: string; name?: string; email?: string; role?: string; password?: string }
  ): Promise<{ success: boolean; user: any; message: string }> {
    const res = await fetch(`${getApiBaseUrl()}/admin/users/${id}/credentials`, {
      method: 'PATCH',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to update admin credentials' }));
      throw new Error(err.error || 'Failed to update admin credentials');
    }
    return await res.json();
  }

  public static async getSnapshots(): Promise<{ success: boolean; snapshots: DataSnapshot[] }> {
    const res = await fetch(`${getApiBaseUrl()}/admin/snapshots`, {
      headers: this.getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch snapshots' }));
      throw new Error(err.error || 'Failed to fetch snapshots');
    }
    return await res.json();
  }

  public static async createSnapshot(
    name: string,
    description?: string
  ): Promise<{ success: boolean; snapshot: DataSnapshot }> {
    const res = await fetch(`${getApiBaseUrl()}/admin/snapshots`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ name, description }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to create snapshot' }));
      throw new Error(err.error || 'Failed to create snapshot');
    }
    return await res.json();
  }

  public static async rollbackSnapshot(
    id: string
  ): Promise<{ success: boolean; message: string; restoredCounts?: any }> {
    const res = await fetch(`${getApiBaseUrl()}/admin/snapshots/${id}/rollback`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to rollback snapshot' }));
      throw new Error(err.error || 'Failed to rollback snapshot');
    }
    return await res.json();
  }

  public static async getSearchAliases(): Promise<{ success: boolean; aliases: SearchAlias[] }> {
    const res = await fetch(`${getApiBaseUrl()}/admin/search/aliases`, {
      headers: this.getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch search aliases' }));
      throw new Error(err.error || 'Failed to fetch search aliases');
    }
    return await res.json();
  }

  public static async createSearchAlias(alias: {
    alias: string;
    targetId: string;
    targetType: string;
    label?: string;
  }): Promise<{ success: boolean; alias: SearchAlias }> {
    const res = await fetch(`${getApiBaseUrl()}/admin/search/aliases`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(alias),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to create search alias' }));
      throw new Error(err.error || 'Failed to create search alias');
    }
    return await res.json();
  }

  public static async deleteSearchAlias(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${getApiBaseUrl()}/admin/search/aliases/${id}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to delete search alias' }));
      throw new Error(err.error || 'Failed to delete search alias');
    }
    return await res.json();
  }

  public static async getAdminAuditActions(limit: number = 100): Promise<{ success: boolean; actions: AdminAuditAction[] }> {
    const res = await fetch(`${getApiBaseUrl()}/admin/audit-actions?limit=${limit}`, {
      headers: this.getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch audit actions' }));
      throw new Error(err.error || 'Failed to fetch audit actions');
    }
    return await res.json();
  }

  public static async getSystemValidationReport(): Promise<{ success: boolean; report: SystemValidationReport }> {
    const res = await fetch(`${getApiBaseUrl()}/admin/system/validate`, {
      headers: this.getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to run system validation' }));
      throw new Error(err.error || 'Failed to run system validation');
    }
    return await res.json();
  }
}

