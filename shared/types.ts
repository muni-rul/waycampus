// Shared domain types for CampusNav Multi-Tenant 3D Navigation Platform

export type VerificationStatus = 'VERIFIED' | 'NEEDS_VERIFICATION' | 'NEEDS_REVIEW';

export type UserRole = 'SUPER_ADMIN' | 'COLLEGE_ADMIN' | 'MAP_MANAGER' | 'STAFF' | 'STUDENT';

export type FacilityType =
  | 'TOILET_MALE'
  | 'TOILET_FEMALE'
  | 'TOILET_UNISEX'
  | 'TOILET'
  | 'DRINKING_WATER'
  | 'WATER'
  | 'SICK_ROOM'
  | 'FIRST_AID'
  | 'CANTEEN'
  | 'LIBRARY'
  | 'LIFT'
  | 'STAIRCASE'
  | 'MAIN_GATE'
  | 'SECONDARY_GATE'
  | 'PARKING'
  | 'AUDITORIUM'
  | 'SPORTS_STADIUM'
  | 'ACCOUNTS_OFFICE'
  | 'EXAM_OFFICE'
  | 'PRINCIPAL_OFFICE'
  | 'ADMISSION_OFFICE'
  | 'SEMINAR_HALL'
  | 'PRAYER_ROOM'
  | 'ATM';

export type NodeType =
  | 'OUTDOOR_PATH'
  | 'ENTRANCE'
  | 'CORRIDOR'
  | 'HALLWAY'
  | 'DOOR'
  | 'STAIRS_LANDING'
  | 'STAIRS'
  | 'LIFT_DOOR'
  | 'LIFT'
  | 'RAMP';

export type EdgeType = 'WALK' | 'PATHWAY' | 'CORRIDOR' | 'STAIRS' | 'LIFT' | 'RAMP';

export type NodeStatus = 'OPEN' | 'ACTIVE' | 'CLOSED' | 'RESTRICTED';

export interface Coordinate3D {
  x: number;
  y: number;
  z: number;
}

export interface Organization {
  id: string;
  name: string;
  code?: string;
  shortName?: string;
  logoUrl?: string;
  website?: string;
  contactEmail?: string;
  contactPhone?: string;
  createdAt?: string;
}

export interface Campus {
  id: string;
  organizationId: string;
  name: string;
  code?: string;
  address?: string;
  location?: string;
  centerCoordinates?: { lat: number; lng: number };
  gpsCenter?: { latitude: number; longitude: number; lat?: number; lng?: number };
  bounds?: { minX?: number; maxX?: number; minZ?: number; maxZ?: number; north?: number; south?: number; east?: number; west?: number };
  createdAt?: string;
}

export interface Building {
  id: string;
  campusId: string;
  name: string;
  code: string;
  description: string;
  category: 'ACADEMIC' | 'ADMINISTRATIVE' | 'FACILITY' | 'SPORTS' | 'HOSTEL' | 'LIBRARY';
  center: Coordinate3D;
  size: { width: number; height: number; depth: number };
  color: string;
  roofColor?: string;
  roofType?: 'FLAT' | 'PITCHED' | 'PORTICO' | 'COLONIAL';
  totalFloors: number;
  entranceNodeIds: string[];
  verifiedStatus: VerificationStatus;
  lastVerifiedDate: string;
}

export interface Floor {
  id: string;
  buildingId: string;
  floorNumber: number; // 0 for Ground, 1 for 1st, 2 for 2nd, etc.
  name: string; // "Ground Floor", "First Floor", etc.
  elevation: number; // Y offset in 3D world (e.g. 0, 4.2, 8.2, 12.2)
  altitudeMeters?: number;
  height: number;
  floorPlanAssetUrl?: string;
  floorMapUrl?: string;
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
  verifiedStatus: VerificationStatus;
  lastVerifiedDate: string;
}

export interface Room {
  id: string;
  buildingId: string;
  floorId: string;
  floorNumber?: number;
  roomNumber: string; // "101", "204", "Lab 2"
  name: string; // "Computer Science Lab 1", "Room 204", "Divya Teacher Office"
  aliases?: string[]; // ["CS Lab 1", "Computer Lab", "Lab 1"]
  departmentId?: string;
  category: 'CLASSROOM' | 'LAB' | 'LABORATORY' | 'OFFICE' | 'ADMINISTRATIVE' | 'STAFF_ROOM' | 'FACULTY_CABIN' | 'TOILET' | 'STORE' | 'SEMINAR_HALL' | 'OTHER';
  center?: Coordinate3D;
  dimensions?: { width: number; depth: number };
  doorNodeId: string;
  navigationNodeId?: string;
  accessible?: boolean;
  isAccessible?: boolean;
  verifiedStatus: VerificationStatus;
  lastVerifiedDate: string;
  verifiedBy?: string;
  notes?: string;
}

export interface DepartmentCandidateTag {
  tagId: string;
  tagName: string;
  nodeId: string;
  buildingName?: string;
  floorName?: string;
}

export interface Department {
  id: string;
  campusId: string;
  name: string;
  code: string; // "CS", "COMMERCE", "PHYSICS"
  buildingId?: string;
  floorId?: string;
  headOfficeRoomId?: string;
  headOfDepartment?: string;
  description?: string;
  contactEmail?: string;
  contactPhone?: string;
  verifiedStatus?: VerificationStatus;
  lastVerifiedDate?: string;
  // Official Department Location Allocation Rule fields
  category?: string;
  departmentType?: 'AIDED' | 'UNAIDED' | 'SELF_FINANCING' | 'ADMINISTRATION';
  status?: 'VERIFIED' | 'AMBIGUOUS' | 'MISSING_TAG';
  placeId?: string | null;
  placeName?: string | null;
  nodeId?: string | null;
  buildingName?: string | null;
  floorName?: string | null;
  roomNumber?: string | null;
  roomId?: string | null;
  facultyCount?: number;
  candidates?: DepartmentCandidateTag[];
  previousNames?: string[];
}

export interface FacultyMember {
  id: string;
  name: string;
  fullName?: string;
  normalizedName?: string;
  designation: string;
  department?: string;
  departmentCategory?: string;
  departmentType?: 'AIDED' | 'UNAIDED' | 'SELF_FINANCING' | 'ADMINISTRATION';
  cabinRoomId?: string;
  isActive?: boolean;
  profileImageUrl?: string;
  originalPhotoUrl?: string;
  profileLink?: string;
  vidwanLink?: string;
  sourceUrl?: string;
  verified?: boolean;
  isLocationVerified?: boolean;
  lastUpdated?: string;
  // Future navigation expansion fields (unmapped until real college locations collected)
  buildingId?: string;
  buildingName?: string;
  floorId?: string;
  floorNumber?: number;
  floorName?: string;
  roomId?: string;
  roomNumber?: string;
  panoramaId?: string;
  navigationNodeId?: string;
  // Master Department Location Allocation Rule fields
  facultyId?: string;
  departmentPlaceId?: string | null;
  departmentPlaceName?: string | null;
  departmentPlaceNodeId?: string | null;
  departmentPlaceVerified?: boolean;
  locationStatus?: 'VERIFIED' | 'AMBIGUOUS' | 'MISSING_TAG';
  sourceName?: string;
  lastVerifiedAt?: string;
  qualification?: string | null;
  officialEmail?: string | null;
  officialPhone?: string | null;
  nodeId?: string | null;
  // Backwards compatibility fields
  honorific?: string;
  campusId?: string;
  departmentId?: string;
  departmentName?: string;
  email?: string;
  phone?: string;
  officeHours?: string;
  searchAliases?: string[];
  verifiedStatus?: VerificationStatus;
  lastVerifiedDate?: string;
}

export type Teacher = FacultyMember;

export interface Facility {
  id: string;
  campusId: string;
  buildingId?: string;
  floorId?: string;
  floorNumber?: number;
  name: string; // "Ladies Washroom", "Drinking Water Station"
  type: FacilityType;
  aliases: string[]; // ["Bathroom", "Toilet", "Restroom", "Washroom", "WC"]
  coordinates: Coordinate3D;
  doorNodeId?: string;
  navigationNodeId?: string;
  accessible?: boolean;
  isAccessible?: boolean;
  verifiedStatus: VerificationStatus;
  lastVerifiedDate: string;
}

export interface NavigationNode {
  id: string;
  campusId?: string;
  buildingId?: string;
  floorId?: string;
  floorNumber: number; // 0 for outdoor/ground
  x: number;
  y: number;
  z: number;
  nodeType?: NodeType;
  type?: NodeType; // alias for nodeType
  label?: string;
  accessible: boolean;
  status: NodeStatus;
  associatedEntityId?: string; // Room ID, Facility ID, Entrance ID
}

export interface NavigationEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  distance: number; // in meters
  edgeType: EdgeType;
  accessible: boolean;
  status: 'OPEN' | 'CLOSED';
}

export interface QRCheckpoint {
  id?: string;
  code: string; // "QR-MAIN-G-PORTICO"
  label: string; // "Main Block Ground Floor South Portico"
  buildingId?: string;
  floorId?: string;
  floorNumber: number;
  nodeId: string;
  description?: string;
}

export * from './academicData';

// ─────────────────────────────────────────────────────────────
// MASTER VERIFIED LOCATION MAPPING DATA MODELS
// ─────────────────────────────────────────────────────────────

export type PlaceCategory =
  | 'BUILDING'
  | 'DEPARTMENT'
  | 'CLASSROOM'
  | 'LAB'
  | 'LIBRARY'
  | 'RESTROOM'
  | 'OFFICE'
  | 'FACULTY_ROOM'
  | 'STAIRCASE'
  | 'LIFT'
  | 'ENTRANCE'
  | 'EXIT'
  | 'JUNCTION'
  | 'CORRIDOR'
  | 'LANDMARK'
  | 'OTHER';

export type PlaceSubcategory =
  | 'MALE'
  | 'FEMALE'
  | 'STAFF'
  | 'ACCESSIBLE'
  | 'GENERAL'
  | 'ENTRANCE'
  | 'EXIT'
  | 'LABORATORY'
  | 'THEORY_CLASSROOM'
  | 'DEPARTMENT_OFFICE'
  | 'ADMIN_OFFICE'
  | 'STAIRWAY'
  | 'ELEVATOR'
  | 'FOYER'
  | 'OTHER';

export type RelativeDirection =
  | 'FORWARD'
  | 'BACKWARD'
  | 'LEFT'
  | 'RIGHT'
  | 'FORWARD_LEFT'
  | 'FORWARD_RIGHT'
  | 'BACKWARD_LEFT'
  | 'BACKWARD_RIGHT'
  | 'JUNCTION'
  | 'STAIRCASE'
  | 'ENTRANCE'
  | 'EXIT'
  | 'CORRIDOR'
  | 'DOOR'
  | 'ROOM'
  | 'LANDMARK';

export type PlaceStatus = 'VERIFIED' | 'UNVERIFIED' | 'PENDING' | 'DISABLED';

export interface VerifiedPlace {
  id: string;
  name: string;
  displayName: string;
  category: PlaceCategory;
  subcategory?: PlaceSubcategory;
  departmentId?: string;
  departmentName?: string;
  buildingId: string;
  buildingName: string;
  floorId: string;
  floorName: string;
  floorNumber: number;
  roomNumber?: string | null;
  panoramaId: string;
  nodeId: string;
  yaw?: number;
  pitch?: number;
  relativeDirection: RelativeDirection;
  targetNodeId?: string;
  targetPanoramaId?: string;
  description?: string;
  verified: boolean;
  verificationSource?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  createdAt: string;
  updatedAt: string;
  status: PlaceStatus;
  searchAliases?: string[];
  aliases?: string[];
  keywords?: string[];
  MarkerPosition?: any;
  verificationNote?: string;
}

export interface PlaceAuditLog {
  id: string;
  placeId: string;
  placeName: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'VERIFY' | 'DISABLE';
  createdBy?: string;
  createdAt: string;
  previousValue?: Partial<VerifiedPlace> | null;
  newValue?: Partial<VerifiedPlace> | null;
  reason?: string;
}

export interface BuildingRecord {
  buildingId: string;
  buildingName: string;
  shortName: string;
  code: string;
  totalFloors: number;
  description?: string;
  entrancePanoramaId?: string;
  entranceNodeId?: string;
  verified: boolean;
}

export interface FloorRecord {
  floorId: string;
  buildingId: string;
  floorName: string;
  floorNumber: number;
  verified: boolean;
}

export interface JunctionDirectionMapping {
  nodeId: string;
  panoramaId: string;
  directions: {
    relativeDirection: RelativeDirection;
    targetDestinationName: string;
    targetNodeId: string;
    targetPanoramaId?: string;
    description?: string;
  }[];
  verified: boolean;
}

export interface SearchResult {
  id: string;
  type: 'ROOM' | 'TEACHER' | 'FACULTY' | 'DEPARTMENT' | 'FACILITY' | 'BUILDING' | 'CLASSROOM' | 'LAB' | 'PROGRAMME' | 'PLACE';
  title: string;
  subtitle: string;
  designation?: string;
  department?: string;
  departmentType?: string;
  profileImageUrl?: string;
  profileLink?: string;
  vidwanLink?: string;
  sourceUrl?: string;
  facultyId?: string;
  blockCode?: string;
  isLocationVerified?: boolean;
  locationStatusNote?: string;
  buildingId?: string;
  buildingName?: string;
  floorId?: string;
  floorNumber?: number;
  floorName?: string;
  roomId?: string;
  roomNumber?: string;
  departmentId?: string;
  departmentName?: string;
  coordinates?: Coordinate3D;
  nodeId?: string;
  tagId?: string;
  verifiedStatus?: VerificationStatus;
  lastVerifiedDate?: string;
  distanceMeters?: number;
  category?: string;
  accessible?: boolean;
  score?: number;
}

export interface Instruction {
  stepNumber: number;
  text: string;
  icon: 'straight' | 'left' | 'right' | 'slight-left' | 'slight-right' | 'stairs-up' | 'stairs-down' | 'lift' | 'enter-building' | 'exit-building' | 'arrive';
  distanceMeters: number;
  floorNumber: number;
  floorName?: string;
  buildingName?: string;
  destinationReached?: boolean;
}

export interface RouteResult {
  pathNodes: NavigationNode[];
  totalDistanceMeters: number;
  estimatedTimeSeconds: number;
  instructions: Instruction[];
  floorTransitions: { fromFloor: number; toFloor: number; via: 'STAIRS' | 'LIFT' | 'RAMP'; atNodeId: string }[];
  isAccessible: boolean;
  hasTemporaryClosuresBypassed: boolean;
}

export interface UserSession {
  token: string;
  user: {
    id: string;
    username: string;
    role: UserRole;
    organizationId: string;
  };
}

export interface AnalyticsQuery {
  id: string;
  query: string;
  timestamp: string;
  matched: boolean;
  resultType?: string;
  destinationName?: string;
}

export interface PanoramaHotspot {
  targetPanoId: string;
  targetLabel: string;
  instruction?: string; // e.g. "Continue forward", "Turn left", "Take stairs to Floor 1"
  yaw: number; // horizontal angle in degrees (0 = forward/North, 90 = East, 180 = South, 270 = West)
  pitch: number; // vertical angle in degrees (-90 to +90)
  distanceMeters: number;
  transitionType: 'WALK' | 'STAIRS' | 'LIFT' | 'DOOR' | 'RAMP';
  direction?: string;
  targetYaw?: number;
  initialViewerYaw?: number;
}

export type PanoramaConnection = PanoramaHotspot;

export interface NavigationRouteStep {
  stepIndex: number;
  panoId: string;
  panoName: string;
  instruction: string;
  distanceMeters: number;
  targetYaw?: number;
  isDestination?: boolean;
}

export interface NavigationRoute {
  id: string;
  name: string;
  originPanoId: string;
  destinationPanoId: string;
  currentStepIndex: number;
  steps: NavigationRouteStep[];
  totalDistanceMeters: number;
  isCompleted?: boolean;
}

export interface PanoramaNode {
  id: string; // e.g. 'PANO_MB_GF_PORTICO'
  campusId: string;
  buildingId: string;
  buildingName?: string;
  floorId: string;
  floorNumber: number; // 0 for Ground, 1 for 1st, 2 for 2nd, 3 for 3rd
  name: string; // "Main Block Ground Portico Entrance"
  description?: string;
  x: number; // 2D floor plan X coordinate
  y: number; // elevation / altitude
  z: number; // 2D floor plan Z coordinate
  heading: number; // Orientation of center of equirectangular panorama (0-360)
  imageUrl: string;
  thumbnailUrl: string;
  captureDate: string;
  captureDevice?: string;
  qualityScore: number; // 0-100
  verifiedStatus: VerificationStatus;
  navigationNodeId: string; // associated navigation graph node ID
  neighborPanoIds: string[];
  hotspots: PanoramaHotspot[];
  associatedRoomId?: string;
  associatedFacilityId?: string;
  isEndOfRoute?: boolean;
  places?: any[];
  defaultCameraYaw?: number;
}

export interface PanoramaEdge {
  id: string;
  fromPanoId: string;
  toPanoId: string;
  distanceMeters: number;
  headingDeg: number;
  walkable: boolean;
  accessible: boolean;
  transitionType: 'WALK' | 'STAIRS' | 'LIFT' | 'RAMP' | 'DOOR';
}

export interface PositionEstimate {
  campusId: string;
  buildingId?: string;
  floorId?: string;
  floorNumber: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  confidence: number; // 0.0 - 1.0
  source: 'GPS' | 'QR_CHECKPOINT' | 'PANORAMA_NODE' | 'VISUAL_LOCALIZATION' | 'MANUAL';
  currentPanoId?: string;
  timestamp: string;
}

// ─────────────────────────────────────────────────────────────
// PANORAMA ROUTE DEBUGGER & GRAPH MUTATION TYPES
// ─────────────────────────────────────────────────────────────

export interface NodeImageOverride {
  image: string;
  imagePath: string;
  filename: string;
  replacedAt?: string;
  replacedBy?: string;
}

export type PlaceTagCategory =
  | 'CLASSROOM'
  | 'LAB'
  | 'OFFICE'
  | 'FACILITY'
  | 'RESTROOM'
  | 'CANTEEN'
  | 'LANDMARK'
  | 'DEPARTMENT'
  | 'LIBRARY'
  | 'SEMINAR_HALL'
  | 'GATE_ENTRANCE'
  | 'OTHER'
  | string;

export interface CustomPlaceTag {
  id: string;
  text: string;
  label?: string;
  yaw: number;
  pitch: number;
  distance: number;
  color?: string;
  category?: PlaceTagCategory;
  description?: string;
  roomId?: string;
  roomNumber?: string;
  nodeId?: string;
  buildingName?: string;
  floor?: string;
  verified?: boolean;
  visibleFromDistance?: boolean;
}

export interface CustomPanoramaDefinition {
  id: string;
  title: string;
  area: string;
  floor: number;
  image: string;
  imagePath: string;
  filename: string;
  manualNumber?: string;
  createdAt: string;
  createdBy: string;
}

export interface UploadedPanoramaAsset {
  filename: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  sizeBytes: number;
  dataUrl: string;
  uploadedAt: string;
  uploadedBy: string;
}

export interface NodeMetadataOverride {
  title?: string;
  area?: string;
  floor?: number;
  filename?: string;
  updatedAt?: string;
}

export interface GraphOverrideData {
  nodeImageOverrides: Record<string, NodeImageOverride>;
  customConnections: Record<string, any[]>;
  nodeHeadingOverrides: Record<string, number>;
  verifiedStatusOverrides: Record<string, string>;
  manualNumbers?: Record<string, string>;
  customPanoramaOrder?: string[];
  customArrowHotspots?: Record<string, any[]>;
  customRouteOverrides?: Record<string, string[]>;
  customPlaceTags?: Record<string, CustomPlaceTag[]>;
  nodeCameraAngles?: Record<string, number>;
  customPanoramas?: Record<string, CustomPanoramaDefinition>;
  uploadedPanoramaAssets?: Record<string, UploadedPanoramaAsset>;
  nodeMetadataOverrides?: Record<string, NodeMetadataOverride>;
  version?: number;
  contentHash?: string;
  lastPublishedVersion?: number;
  lastPublishedHash?: string;
  lastPublishedAt?: string;
  publishStatus?: 'DRAFT' | 'PUBLISHED' | 'OUT_OF_SYNC';
  lastSavedAt: string;
  savedBy: string;
}

export interface GraphIssue {
  nodeId: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  problem: string;
  suggestedAction: string;
}

export interface GraphValidationReport {
  totalNodes: number;
  totalConnections: number;
  brokenConnections: number;
  missingImages: number;
  duplicateIds: number;
  unverifiedNodes: number;
  unreachableNodes: number;
  cyclesCount: number;
  issues: GraphIssue[];
  timestamp: string;
  isValid: boolean;
}

// ─────────────────────────────────────────────────────────────
// AUTHORITATIVE TWO-LAYER HEADING & ROUTE EXECUTION DATA MODELS
// ─────────────────────────────────────────────────────────────

export type CalibrationStatus = 'calibrated' | 'uncalibrated';

export type ConnectionDirection =
  | 'straight'
  | 'left'
  | 'right'
  | 'slight-left'
  | 'slight-right'
  | 'u-turn'
  | 'stairs-up'
  | 'stairs-down'
  | 'ramp-up'
  | 'ramp-down'
  | 'enter-building'
  | 'exit-building'
  | 'unknown';

export interface AuthoritativePanoramaNode {
  id: string;
  imageUrl: string;
  imagePath?: string;
  filename?: string;
  buildingId: string | null;
  floorId: string | null;
  position: { x: number; y: number } | null;
  northOffset: number | null; // REQUIRED — calibration offset between internal yaw 0 and world bearing 0. Default null.
  calibrationStatus: CalibrationStatus;
  verifiedStatus?: VerificationStatus;
}

export interface AuthoritativeConnection {
  id: string;
  fromNode: string;
  toNode: string;
  worldBearingAtoB: number; // degrees 0-360
  direction: ConnectionDirection;
  distance: number;
  walkingCost: number; // distance + stairs/floor penalties used as Dijkstra edge weight
  bidirectional: boolean;
  verified: boolean;
  isEstimated?: boolean;
}

export interface AuthoritativeRouteStep {
  stepIndex: number;
  fromNode: string;
  toNode: string;
  instruction: string;
  direction: ConnectionDirection;
  worldBearing: number;
  initialViewerYaw: number; // Precomputed: (worldBearing - targetNorthOffset) % 360
  distance: number;
  walkingCost: number;
  image: string;
  imagePath?: string;
  isDestination?: boolean;
}

export interface AuthoritativeRoute {
  destinationId: string;
  destinationTitle: string;
  routeNodes: string[]; // [ A, B, C, D ]
  routeSteps: AuthoritativeRouteStep[]; // [ A->B, B->C, C->D ]
  totalDistance: number;
  totalWalkingCost: number;
  estimatedWalkTimeSeconds: number;
}

// ─────────────────────────────────────────────────────────────
// CAMPUS BUG REPORTING & FEEDBACK SYSTEM
// ─────────────────────────────────────────────────────────────

export type CampusReportIssueType =
  | 'WRONG_LOCATION'
  | 'WRONG_DEPARTMENT'
  | 'WRONG_ROOM'
  | 'WRONG_BLOCK'
  | 'WRONG_NAVIGATION'
  | 'WRONG_ARROW'
  | 'MISSING_PLACE'
  | 'INCORRECT_TAG'
  | 'FACULTY_INFO'
  | 'PANORAMA_PROBLEM'
  | 'SEARCH_PROBLEM'
  | 'TECHNICAL_PROBLEM'
  | 'SUGGESTION'
  | 'OTHER';

export type CampusReportStatus =
  | 'NEW'
  | 'ACKNOWLEDGED'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'REJECTED'
  | 'DUPLICATE';

export type CampusReportPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface CampusReportHistoryEntry {
  timestamp: string;
  action: string;
  previousStatus?: CampusReportStatus;
  newStatus?: CampusReportStatus;
  note?: string;
  changedBy?: string;
}

export interface CampusReport {
  id: string;
  createdAt: string;
  updatedAt: string;
  issueType: CampusReportIssueType;
  category: string;
  description: string;
  message?: string;
  status: CampusReportStatus;
  priority: CampusReportPriority;
  reporterName?: string;
  reporterContact?: string;
  reporterType?: 'student' | 'faculty' | 'admin' | 'anonymous';

  // Automatic Technical Context
  nodeId?: string;
  page?: string;
  screenshot?: string;
  attachment?: string;
  currentPanoramaId?: string;
  currentNodeId?: string;
  currentBuildingId?: string;
  currentFloorId?: string | number;
  currentPlaceId?: string;
  currentTagId?: string;
  selectedDestinationId?: string;
  routeId?: string;
  routeStepIndex?: number;
  originNodeId?: string;
  destinationNodeId?: string;
  reportedEntityType?: string;
  reportedEntityId?: string;
  blockId?: string;
  blockName?: string;
  currentURL?: string;
  device?: string;
  browser?: string;
  screenSize?: string;
  appVersion?: string;

  // Admin Management & Resolution
  adminNotes?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  history?: CampusReportHistoryEntry[];
  possibleDuplicateOf?: string;
}

// ─────────────────────────────────────────────────────────────
// FACULTY AVAILABILITY / PRESENCE STATUS SYSTEM
// ─────────────────────────────────────────────────────────────

export type FacultyStatusType =
  | 'AVAILABLE'
  | 'IN_CLASS'
  | 'BUSY'
  | 'NOT_AVAILABLE'
  | 'ON_LEAVE'
  | 'NOT_MARKED';

export type FacultyStatusSource = 'FACULTY' | 'ADMIN';

export interface FacultyStatusRecord {
  id: string;
  facultyId: string;
  status: FacultyStatusType;
  locationPlaceId?: string;
  locationName?: string;
  locationNodeId?: string;
  updatedAt: string;
  expiresAt?: string;
  updatedBy: string;
  source: FacultyStatusSource;
  adminReason?: string;
}

export interface PublicFacultyStatus {
  facultyId: string;
  status: FacultyStatusType;
  locationPlaceId?: string;
  locationName?: string;
  locationNodeId?: string;
  updatedAt: string;
  isExpired?: boolean;
  source?: FacultyStatusSource;
  adminReason?: string;
}

export interface FacultyAccount {
  id: string;
  facultyId: string;
  email: string;
  facultyCode: string;
  passwordHash: string;
  role: 'FACULTY';
  isActive: boolean;
  mustChangePassword?: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FacultyStatusAuditLog {
  id: string;
  facultyId: string;
  facultyName: string;
  departmentName: string;
  previousStatus?: FacultyStatusType;
  newStatus: FacultyStatusType;
  locationPlaceId?: string;
  locationName?: string;
  source: FacultyStatusSource;
  updatedBy: string;
  adminReason?: string;
  timestamp: string;
}

// ─────────────────────────────────────────────────────────────
// CONTROL CENTER DATA SNAPSHOTS, ALIASES & AUDIT TYPES
// ─────────────────────────────────────────────────────────────

export interface DataSnapshot {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  createdBy: string;
  version: string;
  entityCounts: {
    places: number;
    rooms: number;
    departments: number;
    teachers: number;
    facilities: number;
    searchAliases: number;
    graphOverrides: number;
  };
}

export interface SearchAlias {
  id: string;
  alias: string;
  targetId: string;
  targetType: 'BUILDING' | 'ROOM' | 'DEPARTMENT' | 'TEACHER' | 'FACILITY' | 'PLACE';
  label: string;
  createdAt: string;
  createdBy?: string;
}

export interface AdminAuditAction {
  id: string;
  adminUsername: string;
  adminName?: string;
  action: string;
  entity: string;
  entityId?: string;
  before?: any;
  after?: any;
  timestamp: string;
  ipAddress?: string;
  notes?: string;
}

export interface SystemValidationCheckItem {
  id: string;
  category: 'GRAPH' | 'TAGS' | 'ROOMS' | 'FACULTY' | 'DEPARTMENTS' | 'SEARCH' | 'QR' | 'ASSETS' | 'VOICE' | 'ROUTES';
  status: 'PASS' | 'WARNING' | 'FAIL';
  title: string;
  message: string;
  recordId?: string;
  recordLabel?: string;
}

export interface SystemValidationReport {
  timestamp: string;
  overallStatus: 'PASS' | 'WARNING' | 'FAIL';
  healthScore: number;
  summary: {
    totalChecks: number;
    passed: number;
    warnings: number;
    failures: number;
  };
  metrics: {
    panoramasCount: number;
    connectionsCount: number;
    tagsCount: number;
    facultyCount: number;
    departmentsCount: number;
    roomsCount: number;
    facilitiesCount: number;
    qrCount: number;
    scRouteProtected: boolean;
  };
  checks: SystemValidationCheckItem[];
}

export interface CampusInfoData {
  name: string;
  collegeName?: string;
  address: string;
  location?: string;
  phone: string;
  mobile?: string;
  email: string;
  website?: string;
  virtualTourUrl?: string;
}

export interface CampusEventItem {
  id: string;
  title: string;
  description: string;
  date: string; // YYYY-MM-DD
  time: string; // e.g. "Full Day" or "10:00 AM - 01:00 PM"
  venue?: string;
  venueNodeId?: string;
  location?: string;
  category?: 'Academic' | 'Holiday' | 'Exam' | 'Sports' | 'Cultural' | 'Seminar' | 'General' | 'Leave';
  isOfficialHoliday?: boolean;
  addedByAdmin?: boolean;
}


