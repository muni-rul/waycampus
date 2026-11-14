import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import {
  Building,
  Floor,
  Room,
  Facility,
  Teacher,
  Department,
  NavigationNode,
  NavigationEdge,
  RouteResult,
  PanoramaNode,
  QRCheckpoint,
  SearchResult,
  CampusReport,
} from '../../../shared/types';
import { ApiService } from '../services/api';
import { LocationService } from '../services/locationService';
import {
  getAllGraphPanoramaNodes,
  findNavigationRoute,
  findMultipleNavigationRoutes,
  setCustomRouteOverrides,
  NavigationRoute,
  NavigationStep,
} from '../services/campusPathfinder';
import { CAMPUS_PLACES, CAMPUS_PLACES_MAP, searchCampusPlaces } from '../data/campusPlaces';
import { CAMPUS_GRAPH, CAMPUS_GRAPH_MAP, applyGraphOverrides, resetGraphToDefault, getAllCustomPlaceTags } from '../data/campusGraph';
import { GraphOverrideData } from '../../../shared/types';
import { voiceNavigation } from '../services/voiceNavigationService';
import { PanoramaResourceManager } from '../services/panoramaResourceManager';
import { isLocalhost } from '../utils/security';
import {
  getRestoredSessionState,
  saveSessionState,
  isValidPanoramaId,
  clearSessionState,
  SavedSessionState,
  SavedCameraState,
} from '../services/sessionPersistenceService';
import OFFICIAL_FACULTY_DATA from '../data/officialFaculty.json';
import OFFICIAL_DEPARTMENTS_DATA from '../data/officialDepartments.json';
import { mergeById } from '../../../shared/mergeData';
import {
  getSessionTeachers,
  setSessionTeachers,
  getSessionDepartments,
  setSessionDepartments,
  setSessionCampusInfo,
} from '../services/sessionDataCache';
import { setLiveCampusSearchData, getLiveCampusSearchData } from '../services/campusSearchService';

export type LightingTheme = 'DAY' | 'SUNSET' | 'NIGHT' | 'CAMPUS_NEON';
export type WayCampusTab = 'HOME' | '360_TOUR' | 'MORE';
export type AppViewMode =
  | 'HOME'
  | 'DESTINATION_CARD'
  | 'FLOOR_PLAN'
  | 'ADMIN'
  | 'DEBUG'
  | 'NAVIGATING'
  | 'STREET_VIEW_PREVIEW'
  | 'LIVE_CAMERA_AR';
export type VisualNavigationMode = 'STREET_VIEW' | 'FLOOR_PLAN' | 'LIVE_CAMERA_AR';

export interface LiveGPSState {
  latitude: number;
  longitude: number;
  lat: number;
  lng: number;
  x: number;
  y: number;
  z: number;
  accuracy: number;
  accuracyMeters: number;
  timestamp: number;
  nearestNodeId?: string;
  nearestBuildingName?: string;
}

export type NavigationStatus = 'IDLE' | 'ROUTE_READY' | 'NAVIGATING' | 'ARRIVED' | 'ERROR';

interface NavigationContextType {
  // Core Entities
  buildings: Building[];
  floors: Floor[];
  rooms: Room[];
  facilities: Facility[];
  teachers: Teacher[];
  departments: Department[];
  nodes: NavigationNode[];
  edges: NavigationEdge[];
  qrCheckpoints: QRCheckpoint[];
  panoramas: PanoramaNode[];
  isLoadingData: boolean;

  // Active Panorama (Street View)
  activePanorama: PanoramaNode | null;
  activePanoramaId: string;
  setActivePanoramaId: (id: string) => void;

  // Authoritative Navigation State Machine
  navigationStatus: NavigationStatus;
  activeNavigationRoute: NavigationRoute | null;
  availableRoutes: NavigationRoute[];
  selectedRouteIndex: number;
  selectRouteByIndex: (index: number) => void;
  currentRouteIndex: number;
  transitionLocked: boolean;
  setTransitionLocked: (locked: boolean) => void;
  visitedNodeIds: string[];
  navigationError: string | null;
  isDebugMode: boolean;
  toggleDebugMode: () => void;

  // Positioning & Legacy Navigation State
  userNodeId: string;
  userLocationLabel: string;
  selectedDestination: SearchResult | null;
  previewDestination: SearchResult | null;
  activeRoute: RouteResult | null;
  isNavigating: boolean;
  accessibleOnly: boolean;
  activeFloorNumber: number | 'ALL';
  selectedBuildingId: string | null;
  currentStepIndex: number;
  isSimulatingWalk: boolean;
  viewMode: AppViewMode;
  visualMode: VisualNavigationMode;

  // Modals & Tools
  isQRScannerOpen: boolean;
  setIsQRScannerOpen: (open: boolean) => void;
  isWhereAmIOpen: boolean;
  setIsWhereAmIOpen: (open: boolean) => void;
  scannedBlockId: string | null;
  setScannedBlockId: (id: string | null) => void;
  isReportModalOpen: boolean;
  setIsReportModalOpen: (open: boolean) => void;
  reportInitialContext: Partial<CampusReport> | undefined;
  openReportModal: (context?: Partial<CampusReport>) => void;
  closeReportModal: () => void;

  // Real-time GPS & Orientation
  liveGPS: LiveGPSState | null;
  isTrackingGPS: boolean;
  gpsStatusMessage: string | null;
  cameraHeading: number;
  lightingTheme: LightingTheme;

  // WayCampus Primary Navigation Tab & Menu
  activeTab: WayCampusTab;
  setActiveTab: (tab: WayCampusTab) => void;
  isMoreMenuOpen: boolean;
  setIsMoreMenuOpen: (open: boolean) => void;
  isFacultyPortalOpen: boolean;
  setIsFacultyPortalOpen: (open: boolean) => void;

  // Recents & Favorites
  recentSearches: SearchResult[];
  favorites: SearchResult[];

  // Authoritative Master Navigation Actions
  startNavigationRoute: (destination: SearchResult, startNodeId?: string) => Promise<boolean>;
  advanceNavigationStep: () => void;
  stepBackwardNavigation: () => void;
  exitNavigation: () => void;
  isVoiceEnabled: boolean;
  toggleVoiceNavigation: () => void;

  // Generic Actions
  setViewMode: (mode: AppViewMode) => void;
  setVisualMode: (mode: VisualNavigationMode) => void;
  setUserStartingPoint: (nodeId: string, label: string) => void;
  selectDestinationForPreview: (destination: SearchResult) => Promise<void>;
  startVirtualWalk: (destination: SearchResult) => Promise<void>;
  startLiveWalk: (destination: SearchResult) => Promise<void>;
  startNavigation: (destination: SearchResult) => Promise<void>;
  stopNavigation: () => void;
  setAccessibleOnly: (accessible: boolean) => void;
  setActiveFloorNumber: (floor: number | 'ALL') => void;
  setSelectedBuildingId: (bldId: string | null) => void;
  setCurrentStepIndex: (idx: number) => void;
  toggleSimulateWalk: () => void;
  handleQRScan: (code: string) => Promise<boolean>;
  toggleFavorite: (item: SearchResult) => void;
  isFavorite: (id: string) => boolean;
  requestLiveGPSLocation: () => Promise<boolean>;
  toggleGPSTracking: () => void;
  setCameraHeading: (heading: number) => void;
  setLightingTheme: (theme: LightingTheme) => void;
  refreshData: () => Promise<void>;
  commitCurrentPanorama: (nodeId: string, cameraState?: SavedCameraState) => void;
  persistedSessionInfo?: SavedSessionState | null;
}

function resolveTargetNodeId(destination: SearchResult): string {
  // 0. Live dynamic faculty / department resolution
  const isFaculty = destination.type === 'FACULTY' || destination.type === 'TEACHER' || (destination as any).category === 'FACULTY';
  const isDept = destination.type === 'DEPARTMENT' || (destination as any).category === 'DEPARTMENT';
  if (isFaculty || isDept) {
    const live = getLiveCampusSearchData();
    if (isFaculty) {
      const matchTeacher = live.teachers?.find(
        (t) =>
          (destination.id && (t.id === destination.id || t.id.toLowerCase() === destination.id.toLowerCase())) ||
          (destination.title && t.name.toLowerCase() === destination.title.toLowerCase())
      );
      if (matchTeacher) {
        if (matchTeacher.nodeId && CAMPUS_GRAPH_MAP.has(matchTeacher.nodeId)) {
          return matchTeacher.nodeId;
        }
        if (matchTeacher.departmentPlaceNodeId && CAMPUS_GRAPH_MAP.has(matchTeacher.departmentPlaceNodeId)) {
          return matchTeacher.departmentPlaceNodeId;
        }
        const deptKey = (matchTeacher.departmentId || matchTeacher.department || matchTeacher.departmentName || '').toLowerCase().trim();
        if (deptKey) {
          const dept = live.departments?.find(
            (d) =>
              (matchTeacher.departmentId && d.id === matchTeacher.departmentId) ||
              d.name.toLowerCase() === deptKey ||
              d.code.toLowerCase() === deptKey ||
              (d.previousNames && d.previousNames.some((pn: string) => pn.toLowerCase() === deptKey))
          );
          if (dept?.nodeId && CAMPUS_GRAPH_MAP.has(dept.nodeId)) {
            return dept.nodeId;
          }
        }
      }
    } else if (isDept) {
      const q = (destination.title || destination.id || '').toLowerCase().trim();
      const matchDept = live.departments?.find(
        (d) =>
          (destination.id && (d.id === destination.id || d.id.toLowerCase() === destination.id.toLowerCase())) ||
          d.name.toLowerCase() === q ||
          d.code.toLowerCase() === q ||
          (d.previousNames && d.previousNames.some((pn: string) => pn.toLowerCase() === q))
      );
      if (matchDept?.nodeId && CAMPUS_GRAPH_MAP.has(matchDept.nodeId)) {
        return matchDept.nodeId;
      }
    }
  }

  // 1. Direct valid panorama node ID on the destination
  let targetNodeId = destination.nodeId || (destination as any).panoramaNodeId;
  if (targetNodeId && CAMPUS_GRAPH_MAP.has(targetNodeId)) {
    return targetNodeId;
  }

  const query = (destination.title || destination.id || destination.buildingName || '').toLowerCase().trim();
  const cleanRoomCode = query.replace(/^room\s+/i, '').replace(/\s+/g, '');
  const allCustomTags = getAllCustomPlaceTags();

  // 2. Check custom place tags (exact physical room plaques in 360 view)
  for (const [nid, tags] of Object.entries(allCustomTags)) {
    const match = tags?.find((t) => {
      const tText = (t.text || t.label || '').toLowerCase().trim();
      const tClean = tText.replace(/^room\s+/i, '').replace(/\s+/g, '');
      return (
        (destination.tagId && t.id === destination.tagId) ||
        (destination.id && (destination.id === t.id || destination.id === `tag_${t.id}` || destination.id.endsWith(t.id))) ||
        tText === query ||
        tClean === cleanRoomCode
      );
    });
    if (match && CAMPUS_GRAPH_MAP.has(nid)) {
      return nid;
    }
  }

  // 3. Check official campus places
  const place =
    CAMPUS_PLACES_MAP.get(destination.id) ||
    CAMPUS_PLACES.find(
      (p) =>
        p.id.toLowerCase() === destination.id.toLowerCase() ||
        p.name.toLowerCase() === query ||
        (p.aliases && p.aliases.some((a) => a.toLowerCase() === query || query === a.toLowerCase()))
    ) ||
    searchCampusPlaces(destination.title || destination.id)[0];
  if (place && CAMPUS_GRAPH_MAP.has(place.panoramaNodeId)) {
    return place.panoramaNodeId;
  }

  // 4. Check explicit building / block entrances ONLY if destination is a building entity
  const isBuilding =
    destination.type === 'BUILDING' ||
    destination.category === 'BUILDING' ||
    destination.id.startsWith('bld_') ||
    destination.buildingId?.startsWith('bld_');

  if (isBuilding) {
    const bldCode = (destination.blockCode || destination.buildingId || destination.id || '')
      .toUpperCase()
      .replace(/^BLD_/, '');

    if (bldCode === 'AB' || query === 'ab' || query === 'administrative block') return 'ab_044';
    if (bldCode === 'SC' || query === 'sc' || query === 'st chavara block' || query === 'sc block') return 'outdoor_203';
    if (bldCode === 'MG' || query === 'mg' || query === 'mahatma gandhi block' || query === 'mg block') return 'outdoor_269';
    if (bldCode === 'SM' || query === 'sm' || query === 'st mary block' || query === 'sm block') return 'outdoor_240';
    if (bldCode === 'SJ' || query === 'sj' || query === 'st joseph block' || query === 'sj block') return 'outdoor_191';
    if (bldCode === 'MT' || query === 'mt' || query === 'mother teresa block' || query === 'mt block') return 'outdoor_143';
    if (bldCode === 'GB' || query === 'gb' || query === 'st gabriel block' || query === 'gb block') return 'bba_364';
    if (bldCode === 'SB' || query === 'sb' || query === 'sneha bhavan' || query === 'sneha bavan' || query === 'sb block') return 'sb_437';
    if (bldCode === 'BPE' || query === 'bpe' || query === 'st sebastian block' || query === 'bpe block') return 'outdoor_323';
    if (bldCode === 'HM' || bldCode === 'LF' || query === 'hm' || query === 'hotel management') return 'hm_465';
    if (bldCode === 'BBA' || query === 'bba') return 'bba_371';
  }

  if (CAMPUS_GRAPH_MAP.has(destination.id)) {
    return destination.id;
  }

  return 'outdoor_001';
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export const NavigationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>(() => {
    const session = getSessionTeachers();
    if (session && session.length > 0) return session;
    return OFFICIAL_FACULTY_DATA as unknown as Teacher[];
  });
  const [departments, setDepartments] = useState<Department[]>(() => {
    const session = getSessionDepartments();
    if (session && session.length > 0) return session;
    return OFFICIAL_DEPARTMENTS_DATA as unknown as Department[];
  });
  const [nodes, setNodes] = useState<NavigationNode[]>([]);
  const [edges, setEdges] = useState<NavigationEdge[]>([]);
  const [qrCheckpoints, setQrCheckpoints] = useState<QRCheckpoint[]>([]);
  const [panoramas, setPanoramas] = useState<PanoramaNode[]>(() => getAllGraphPanoramaNodes());
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);

  // Initial Restored Session State (Synchronous check to prevent entrance flash)
  const initialSession = getRestoredSessionState();

  // Active Panorama Node (Defaults to outdoor_001 - Main Campus Gate if no valid saved state)
  const [activePanoramaId, setActivePanoramaId] = useState<string>(() => {
    if (initialSession?.currentPanoramaId && isValidPanoramaId(initialSession.currentPanoramaId)) {
      return initialSession.currentPanoramaId;
    }
    return 'outdoor_001';
  });

  // Master Navigation Engine State Machine
  const [navigationStatus, setNavigationStatus] = useState<NavigationStatus>(() => {
    if (initialSession?.isNavigating && initialSession.activeNavigationRoute) {
      return initialSession.navigationStatus || 'NAVIGATING';
    }
    return 'IDLE';
  });
  const [activeNavigationRoute, setActiveNavigationRoute] = useState<NavigationRoute | null>(() => {
    if (initialSession?.activeNavigationRoute) {
      const fresh = findNavigationRoute(
        initialSession.activeNavigationRoute.startNodeId,
        initialSession.activeNavigationRoute.destinationNodeId,
        initialSession.activeNavigationRoute.destinationTitle
      );
      if (fresh) return fresh;
    }
    return initialSession?.activeNavigationRoute || null;
  });
  const [availableRoutes, setAvailableRoutes] = useState<NavigationRoute[]>(() => {
    if (initialSession?.activeNavigationRoute) {
      const fresh = findNavigationRoute(
        initialSession.activeNavigationRoute.startNodeId,
        initialSession.activeNavigationRoute.destinationNodeId,
        initialSession.activeNavigationRoute.destinationTitle
      );
      if (fresh) return [fresh];
    }
    return initialSession?.activeNavigationRoute ? [initialSession.activeNavigationRoute] : [];
  });
  const [selectedRouteIndex, setSelectedRouteIndex] = useState<number>(0);
  const [currentRouteIndex, setCurrentRouteIndex] = useState<number>(() => {
    if (initialSession?.activeNavigationRoute && initialSession?.currentPanoramaId) {
      const fresh = findNavigationRoute(
        initialSession.activeNavigationRoute.startNodeId,
        initialSession.activeNavigationRoute.destinationNodeId,
        initialSession.activeNavigationRoute.destinationTitle
      );
      if (fresh) {
        const idx = fresh.pathNodeIds.indexOf(initialSession.currentPanoramaId);
        if (idx !== -1) return idx;
      }
    }
    return initialSession?.currentRouteIndex || 0;
  });
  const [transitionLocked, setTransitionLocked] = useState<boolean>(false);
  const [visitedNodeIds, setVisitedNodeIds] = useState<string[]>(() => {
    return initialSession?.visitedNodeIds || (initialSession?.currentPanoramaId ? [initialSession.currentPanoramaId] : []);
  });
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const [isDebugMode, setIsDebugMode] = useState<boolean>(() => {
    return isLocalhost() && window.location.search.includes('debug=true');
  });

  const selectRouteByIndex = useCallback((index: number) => {
    setAvailableRoutes((current) => {
      const chosenRoute = current[index];
      if (chosenRoute) {
        setSelectedRouteIndex(index);
        setActiveNavigationRoute(chosenRoute);
        setCurrentRouteIndex(0);
        if (chosenRoute.pathNodeIds.length > 0) {
          setActivePanoramaId(chosenRoute.pathNodeIds[0]);
        }
      }
      return current;
    });
  }, []);

  // User starting point (defaults to Main Entrance Gate)
  const [userNodeId, setUserNodeId] = useState<string>(() => {
    return initialSession?.userNodeId || initialSession?.currentPanoramaId || 'outdoor_001';
  });
  const [userLocationLabel, setUserLocationLabel] = useState<string>(() => {
    return initialSession?.userLocationLabel || 'Main Campus Entrance Gate';
  });

  // Navigation & View Modes
  const [selectedDestination, setSelectedDestination] = useState<SearchResult | null>(() => {
    return initialSession?.selectedDestination || null;
  });
  const [previewDestination, setPreviewDestination] = useState<SearchResult | null>(null);
  const [activeRoute, setActiveRoute] = useState<RouteResult | null>(null);
  const [isNavigating, setIsNavigating] = useState<boolean>(() => {
    return Boolean(initialSession?.isNavigating && initialSession.activeNavigationRoute);
  });
  const [accessibleOnly, setAccessibleOnly] = useState<boolean>(false);
  const [activeFloorNumber, setActiveFloorNumber] = useState<number | 'ALL'>(() => {
    if (initialSession?.activeFloorNumber !== undefined) return initialSession.activeFloorNumber;
    if (initialSession?.currentPanoramaId) {
      const node = CAMPUS_GRAPH_MAP.get(initialSession.currentPanoramaId);
      if (node?.floor !== undefined) return Number(node.floor) || 0;
    }
    return 0;
  });
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(() => {
    if (initialSession?.selectedBuildingId !== undefined) return initialSession.selectedBuildingId;
    if (initialSession?.currentPanoramaId) {
      const node = CAMPUS_GRAPH_MAP.get(initialSession.currentPanoramaId);
      if (node?.area) return node.area;
    }
    return 'OUTDOOR';
  });
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [isSimulatingWalk, setIsSimulatingWalk] = useState<boolean>(false);
  const [viewMode, setViewModeState] = useState<AppViewMode>('HOME');
  const setViewMode = useCallback((mode: AppViewMode) => {
    setViewModeState(mode);
  }, []);
  const [visualMode, setVisualMode] = useState<VisualNavigationMode>('STREET_VIEW');

  // WayCampus Navigation Tabs & Menus
  const [activeTab, setActiveTabState] = useState<WayCampusTab>('HOME');
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState<boolean>(false);
  const [isFacultyPortalOpen, setIsFacultyPortalOpen] = useState<boolean>(false);

  const setActiveTab = useCallback((tab: WayCampusTab) => {
    if (tab === 'MORE') {
      setIsMoreMenuOpen(true);
      return;
    }
    const resolvedTab = (tab as string) === 'MAP' ? '360_TOUR' : tab;
    setActiveTabState(resolvedTab as WayCampusTab);
    if (resolvedTab === '360_TOUR') {
      setViewModeState('HOME');
      setVisualMode('STREET_VIEW');
    }
  }, []);

  // Modals
  const [isQRScannerOpen, setIsQRScannerOpen] = useState<boolean>(false);
  const [isWhereAmIOpen, setIsWhereAmIOpen] = useState<boolean>(false);
  const [scannedBlockId, setScannedBlockId] = useState<string | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [reportInitialContext, setReportInitialContext] = useState<Partial<CampusReport> | undefined>(undefined);

  const openReportModal = useCallback((context?: Partial<CampusReport>) => {
    setReportInitialContext(context);
    setIsReportModalOpen(true);
  }, []);

  const closeReportModal = useCallback(() => {
    setIsReportModalOpen(false);
    setReportInitialContext(undefined);
  }, []);

  // Real-time GPS & Orientation
  const [liveGPS, setLiveGPS] = useState<LiveGPSState | null>(null);
  const [isTrackingGPS, setIsTrackingGPS] = useState<boolean>(false);
  const [gpsStatusMessage, setGpsStatusMessage] = useState<string | null>(null);
  const [cameraHeading, setCameraHeading] = useState<number>(() => {
    return initialSession?.cameraState?.yaw || 0;
  });
  const [lightingTheme, setLightingTheme] = useState<LightingTheme>('DAY');
  const [isVoiceEnabled, setIsVoiceEnabled] = useState<boolean>(() => voiceNavigation.isEnabled());

  const toggleVoiceNavigation = useCallback(() => {
    setIsVoiceEnabled((prev) => {
      const next = !prev;
      voiceNavigation.setEnabled(next);
      return next;
    });
  }, []);

  // Helper to filter out ghost / unknown / fabricated tags from search history
  const isCleanSearchResult = (item: any): boolean => {
    if (!item || !item.id || !item.title) return false;
    const t = (item.title || '').toLowerCase();
    const sub = (item.subtitle || '').toLowerCase();
    const badWords = [
      'sound engineering',
      'palm avenue',
      'historic fountain',
      'convention hall',
      'snack bar',
      'staff refreshments',
      'vehicle checkpoint',
      'visitor passes',
      'amphitheater',
      'central lawn',
      'main stage auditorium',
      'student cafeteria',
      'two-wheeler parking',
      'four-wheeler parking',
      'open air stage',
      'cultural venue',
    ];
    if (badWords.some((w) => t.includes(w) || sub.includes(w))) {
      return false;
    }
    return true;
  };

  // Recents & Favorites (strictly sanitized to remove ghost / unknown tags)
  const [recentSearches, setRecentSearches] = useState<SearchResult[]>(() => {
    try {
      const saved = localStorage.getItem('campnav_recent');
      if (!saved) return [];
      const parsed: SearchResult[] = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed.filter(isCleanSearchResult).slice(0, 10) : [];
    } catch {
      return [];
    }
  });

  const [favorites, setFavorites] = useState<SearchResult[]>(() => {
    try {
      const saved = localStorage.getItem('campnav_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const toggleDebugMode = useCallback(() => {
    if (!isLocalhost()) return;
    setIsDebugMode((prev) => !prev);
  }, []);

  const refreshData = async () => {
    try {
      setIsLoadingData(true);
      const [blds, flrs, rms, facs, tchs, depts, nds, edgs, qrs, panos, plcs, graphOverrides, serverCampusInfo] = await Promise.all([
        ApiService.getBuildings().catch(() => []),
        ApiService.getFloors().catch(() => []),
        ApiService.getRooms().catch(() => []),
        ApiService.getFacilities().catch(() => []),
        ApiService.getTeachers().catch(() => []),
        ApiService.getDepartments().catch(() => []),
        ApiService.getNodes().catch(() => []),
        ApiService.getEdges().catch(() => []),
        ApiService.getQRCheckpoints().catch(() => []),
        ApiService.getPanoramas().catch(() => []),
        ApiService.getPlaces().catch(() => []),
        ApiService.getGraphOverrides().catch(() => null),
        ApiService.getCampusInfo().catch(() => null),
      ]);

      if (graphOverrides) {
        applyGraphOverrides(graphOverrides);
        if (graphOverrides.customRouteOverrides) {
          setCustomRouteOverrides(graphOverrides.customRouteOverrides);
        }
      }

      const graphPanos = getAllGraphPanoramaNodes();
      const graphPanoIds = new Set(graphPanos.map((p) => p.id));
      const mergedPanos: PanoramaNode[] = [...graphPanos];
      for (const p of panos || []) {
        if (graphPanoIds.has(p.id)) {
          const idx = mergedPanos.findIndex((mp) => mp.id === p.id);
          if (idx >= 0) {
            mergedPanos[idx] = { ...mergedPanos[idx], ...p };
          }
        }
      }

      const bundledTeachers = OFFICIAL_FACULTY_DATA as unknown as Teacher[];
      const bundledDepartments = OFFICIAL_DEPARTMENTS_DATA as unknown as Department[];

      const finalTeachers = mergeById(
        bundledTeachers,
        Array.isArray(tchs) && tchs.length > 0 ? (tchs as Teacher[]) : null
      );
      const finalDepartments = mergeById(
        bundledDepartments,
        Array.isArray(depts) && depts.length > 0 ? (depts as Department[]) : null
      );
      const finalPlaces = Array.isArray(plcs) ? plcs : [];

      setSessionTeachers(finalTeachers);
      setSessionDepartments(finalDepartments);
      if (serverCampusInfo) {
        setSessionCampusInfo(serverCampusInfo);
      }

      setLiveCampusSearchData({
        teachers: finalTeachers,
        departments: finalDepartments,
        places: finalPlaces,
      });

      if (Array.isArray(blds) && blds.length > 0) setBuildings(blds);
      if (Array.isArray(flrs) && flrs.length > 0) setFloors(flrs);
      if (Array.isArray(rms) && rms.length > 0) setRooms(rms);
      if (Array.isArray(facs) && facs.length > 0) setFacilities(facs);
      setTeachers(finalTeachers);
      setDepartments(finalDepartments);
      if (Array.isArray(nds) && nds.length > 0) setNodes(nds);
      if (Array.isArray(edgs) && edgs.length > 0) setEdges(edgs);
      if (Array.isArray(qrs) && qrs.length > 0) setQrCheckpoints(qrs);
      setPanoramas(mergedPanos);

      if (mergedPanos.length > 0 && !activePanoramaId) {
        setActivePanoramaId(mergedPanos[0].id);
      }
    } catch (err) {
      console.warn('Fallback applied while loading live campus data:', err);
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  // Compute active panorama object from activePanoramaId
  const activePanorama = panoramas.find((p) => p.id === activePanoramaId) || panoramas[0] || null;

  // Save recents & favorites
  useEffect(() => {
    try {
      const clean = recentSearches.filter(isCleanSearchResult).slice(0, 10);
      localStorage.setItem('campnav_recent', JSON.stringify(clean));
    } catch {}
  }, [recentSearches]);

  useEffect(() => {
    try {
      localStorage.setItem('campnav_favorites', JSON.stringify(favorites));
    } catch {}
  }, [favorites]);

  // Synchronize currentRouteIndex with activePanoramaId whenever navigating
  useEffect(() => {
    if (activeNavigationRoute && isNavigating && activePanoramaId) {
      const idx = activeNavigationRoute.pathNodeIds.indexOf(activePanoramaId);
      if (idx !== -1 && idx !== currentRouteIndex) {
        setCurrentRouteIndex(idx);
        if (idx === activeNavigationRoute.pathNodeIds.length - 1) {
          setNavigationStatus('ARRIVED');
          const isFaculty = selectedDestination?.type === 'FACULTY' || selectedDestination?.type === 'TEACHER';
          const deptName = selectedDestination?.department || (selectedDestination as any)?.departmentName;
          const arrivalTitle = isFaculty && deptName ? deptName : activeNavigationRoute.destinationTitle;
          voiceNavigation.announceArrival(arrivalTitle, activeNavigationRoute.routeId, { isFaculty, departmentName: deptName });
        }
      }
    }
  }, [activePanoramaId, activeNavigationRoute, isNavigating, currentRouteIndex, selectedDestination]);

  // ─────────────────────────────────────────────────────────────
  // MASTER NAVIGATION ENGINE: Start Authoritative Route
  // ─────────────────────────────────────────────────────────────
  const startNavigationRoute = useCallback(
    async (destination: SearchResult, customStartNodeId?: string, chosenRoute?: NavigationRoute): Promise<boolean> => {
      // 1. Resolve route: use chosenRoute, or currently selected availableRoute, or compute fresh
      let route = chosenRoute || (
        availableRoutes[selectedRouteIndex] &&
        availableRoutes[selectedRouteIndex].destinationTitle === destination.title
          ? availableRoutes[selectedRouteIndex]
          : null
      );

      const isFaculty = destination.type === 'FACULTY' || destination.type === 'TEACHER';
      const deptName = destination.department || (destination as any).departmentName;
      const targetArrivalTitle = isFaculty && deptName ? deptName : destination.title;

      if (!route) {
        const targetNodeId = resolveTargetNodeId(destination);
        const startNode = customStartNodeId || activePanoramaId || userNodeId || 'outdoor_001';
        const routes = findMultipleNavigationRoutes(startNode, targetNodeId, targetArrivalTitle, 3);
        setAvailableRoutes(routes);
        setSelectedRouteIndex(0);
        route = routes[0] || null;
      }

      if (!route || route.steps.length === 0) {
        setNavigationStatus('ERROR');
        setNavigationError('No navigation route available for this destination.');
        return false;
      }

      // 4. Update authoritative state
      setActiveNavigationRoute(route);
      setCurrentRouteIndex(0);
      setVisitedNodeIds([route.pathNodeIds[0]]);
      setSelectedDestination(destination);
      setPreviewDestination(null);
      setNavigationError(null);
      setTransitionLocked(false);

      if (route.totalSteps === 0) {
        setNavigationStatus('ARRIVED');
        voiceNavigation.announceArrival(targetArrivalTitle, route.routeId, { isFaculty, departmentName: deptName });
      } else {
        setNavigationStatus('NAVIGATING');
        if (route.steps[0]) {
          voiceNavigation.speakStep(route.steps[0], targetArrivalTitle, route.routeId, { isFaculty, departmentName: deptName });
        }
      }

      setIsNavigating(true);
      setViewMode('HOME');
      setVisualMode('STREET_VIEW');

      // Move to initial panorama
      setActivePanoramaId(route.pathNodeIds[0]);

      // Update floor
      const firstStep = route.steps[0];
      if (firstStep) {
        setActiveFloorNumber(firstStep.floorNumber);
        setSelectedBuildingId(firstStep.areaCode);
      }

      // Proactively prefetch full route progression (current + next 2 steps)
      PanoramaResourceManager.preloadRoute(route.pathNodeIds, 0);

      // Persist active navigation session
      saveSessionState({
        currentPanoramaId: route.pathNodeIds[0],
        currentNodeId: route.pathNodeIds[0],
        activeFloorNumber: firstStep ? firstStep.floorNumber : 0,
        selectedBuildingId: firstStep ? firstStep.areaCode : 'OUTDOOR',
        isNavigating: true,
        navigationStatus: route.totalSteps === 0 ? 'ARRIVED' : 'NAVIGATING',
        activeNavigationRoute: route,
        currentRouteIndex: 0,
        selectedDestination: destination,
        visitedNodeIds: [route.pathNodeIds[0]],
      });

      setRecentSearches((prev) => [destination, ...prev.filter((i) => i.id !== destination.id)].slice(0, 10));
      return true;
    },
    [activePanoramaId, availableRoutes, selectedRouteIndex, userNodeId]
  );

  // ─────────────────────────────────────────────────────────────
  // MASTER NAVIGATION ENGINE: Advance Step (Next ➔)
  // ─────────────────────────────────────────────────────────────
  const advanceNavigationStep = useCallback(() => {
    if (transitionLocked) return;
    if (!activeNavigationRoute || navigationStatus !== 'NAVIGATING') return;

    const isFaculty = selectedDestination?.type === 'FACULTY' || selectedDestination?.type === 'TEACHER';
    const deptName = selectedDestination?.department || (selectedDestination as any)?.departmentName;
    const arrivalTitle = isFaculty && deptName ? deptName : activeNavigationRoute.destinationTitle;

    const nextIndex = currentRouteIndex + 1;
    if (nextIndex >= activeNavigationRoute.pathNodeIds.length) {
      setNavigationStatus('ARRIVED');
      voiceNavigation.announceArrival(arrivalTitle, activeNavigationRoute.routeId, { isFaculty, departmentName: deptName });
      saveSessionState({
        currentPanoramaId: activePanoramaId,
        navigationStatus: 'ARRIVED',
        currentRouteIndex: activeNavigationRoute.pathNodeIds.length - 1,
      });
      return;
    }

    const nextNodeId = activeNavigationRoute.pathNodeIds[nextIndex];

    // REQUIREMENT 1: NEVER SHOW A BROKEN NEXT PANORAMA
    // Guard: next node must be verified ready before transitioning state
    if (!PanoramaResourceManager.isPanoramaReady(nextNodeId)) {
      PanoramaResourceManager.preloadPanorama(nextNodeId, undefined, true);
      return;
    }

    setTransitionLocked(true);
    setCurrentRouteIndex(nextIndex);
    setActivePanoramaId(nextNodeId);
    setVisitedNodeIds((prev) => [...prev, nextNodeId]);

    // Preload further along the route
    PanoramaResourceManager.preloadRoute(activeNavigationRoute.pathNodeIds, nextIndex);

    const step = activeNavigationRoute.steps[nextIndex];
    if (step) {
      setActiveFloorNumber(step.floorNumber);
      setSelectedBuildingId(step.areaCode);
    }

    saveSessionState({
      currentPanoramaId: nextNodeId,
      currentNodeId: nextNodeId,
      activeFloorNumber: step ? step.floorNumber : activeFloorNumber,
      selectedBuildingId: step ? step.areaCode : selectedBuildingId,
      isNavigating: true,
      navigationStatus: nextIndex === activeNavigationRoute.pathNodeIds.length - 1 ? 'ARRIVED' : 'NAVIGATING',
      activeNavigationRoute: activeNavigationRoute,
      currentRouteIndex: nextIndex,
      selectedDestination: selectedDestination,
      visitedNodeIds: [...visitedNodeIds, nextNodeId],
    });

    if (nextIndex === activeNavigationRoute.pathNodeIds.length - 1) {
      setNavigationStatus('ARRIVED');
      voiceNavigation.announceArrival(arrivalTitle, activeNavigationRoute.routeId, { isFaculty, departmentName: deptName });
    } else if (step) {
      voiceNavigation.speakStep(step, arrivalTitle, activeNavigationRoute.routeId, { isFaculty, departmentName: deptName });
    }
  }, [activeNavigationRoute, currentRouteIndex, navigationStatus, transitionLocked, selectedDestination, activeFloorNumber, selectedBuildingId, visitedNodeIds, activePanoramaId]);

  // ─────────────────────────────────────────────────────────────
  // MASTER NAVIGATION ENGINE: Step Backward (❮ Previous)
  // ─────────────────────────────────────────────────────────────
  const stepBackwardNavigation = useCallback(() => {
    if (transitionLocked) return;
    if (!activeNavigationRoute || currentRouteIndex <= 0) return;

    const prevIndex = currentRouteIndex - 1;
    const prevNodeId = activeNavigationRoute.pathNodeIds[prevIndex];
    setTransitionLocked(true);
    setCurrentRouteIndex(prevIndex);
    setActivePanoramaId(prevNodeId);
    setNavigationStatus('NAVIGATING');

    const isFaculty = selectedDestination?.type === 'FACULTY' || selectedDestination?.type === 'TEACHER';
    const deptName = selectedDestination?.department || (selectedDestination as any)?.departmentName;
    const arrivalTitle = isFaculty && deptName ? deptName : activeNavigationRoute.destinationTitle;

    const step = activeNavigationRoute.steps[prevIndex];
    if (step) {
      setActiveFloorNumber(step.floorNumber);
      setSelectedBuildingId(step.areaCode);
      voiceNavigation.speakStep(step, arrivalTitle, activeNavigationRoute.routeId, { isFaculty, departmentName: deptName });
    }

    saveSessionState({
      currentPanoramaId: prevNodeId,
      currentNodeId: prevNodeId,
      activeFloorNumber: step ? step.floorNumber : activeFloorNumber,
      selectedBuildingId: step ? step.areaCode : selectedBuildingId,
      isNavigating: true,
      navigationStatus: 'NAVIGATING',
      activeNavigationRoute: activeNavigationRoute,
      currentRouteIndex: prevIndex,
      selectedDestination: selectedDestination,
    });
  }, [activeNavigationRoute, currentRouteIndex, transitionLocked, selectedDestination, activeFloorNumber, selectedBuildingId]);

  // ─────────────────────────────────────────────────────────────
  // MASTER NAVIGATION ENGINE: Exit Navigation
  // ─────────────────────────────────────────────────────────────
  const exitNavigation = useCallback(() => {
    voiceNavigation.reset();
    setNavigationStatus('IDLE');
    setActiveNavigationRoute(null);
    setAvailableRoutes([]);
    setSelectedRouteIndex(0);
    setSelectedDestination(null);
    setPreviewDestination(null);
    setCurrentRouteIndex(0);
    setVisitedNodeIds([]);
    setNavigationError(null);
    setTransitionLocked(false);
    setIsNavigating(false);
    setViewMode('HOME');
    setVisualMode('STREET_VIEW');

    // Persist current location as direct exploration mode (clearing route)
    saveSessionState({
      currentPanoramaId: activePanoramaId,
      currentNodeId: activePanoramaId,
      isNavigating: false,
      navigationStatus: 'IDLE',
      activeNavigationRoute: null,
      selectedDestination: null,
      currentRouteIndex: 0,
      visitedNodeIds: [activePanoramaId],
    });
  }, [activePanoramaId]);

  // Master Session State Commitment (Called when panorama is confirmed loaded & displayed)
  const commitCurrentPanorama = useCallback(
    (nodeId: string, camState?: SavedCameraState) => {
      if (!isValidPanoramaId(nodeId)) return;
      const node = CAMPUS_GRAPH_MAP.get(nodeId);
      const floorNum = node?.floor !== undefined ? Number(node.floor) || 0 : activeFloorNumber;
      const bldId = node?.area || selectedBuildingId;

      saveSessionState({
        currentPanoramaId: nodeId,
        currentNodeId: nodeId,
        activeFloorNumber: floorNum,
        selectedBuildingId: bldId,
        userNodeId: userNodeId,
        userLocationLabel: userLocationLabel,
        isNavigating: isNavigating && Boolean(activeNavigationRoute),
        navigationStatus: navigationStatus,
        activeNavigationRoute: activeNavigationRoute,
        currentRouteIndex: currentRouteIndex,
        selectedDestination: selectedDestination,
        visitedNodeIds: visitedNodeIds.includes(nodeId) ? visitedNodeIds : [...visitedNodeIds, nodeId],
        cameraState: camState,
      });
    },
    [
      activeFloorNumber,
      selectedBuildingId,
      userNodeId,
      userLocationLabel,
      isNavigating,
      activeNavigationRoute,
      navigationStatus,
      currentRouteIndex,
      selectedDestination,
      visitedNodeIds,
    ]
  );

  // Preload restored route steps on mount if session was actively navigating
  useEffect(() => {
    if (initialSession?.activeNavigationRoute?.pathNodeIds) {
      PanoramaResourceManager.preloadRoute(
        initialSession.activeNavigationRoute.pathNodeIds,
        initialSession.currentRouteIndex || 0
      );
    }
  }, []);

  // 1. Select Destination from Search (Opens Destination Preview Card)
  const selectDestinationForPreview = async (destination: SearchResult) => {
    setPreviewDestination(destination);
    setSelectedBuildingId(destination.buildingId || 'bld_main');
    if (destination.floorNumber !== undefined) {
      setActiveFloorNumber(destination.floorNumber);
    }
    // Compute all possible ways (shortest + alternative routes) for user selection
    const targetNodeId = resolveTargetNodeId(destination);
    const startNode = activePanoramaId || userNodeId || 'outdoor_001';
    const routes = findMultipleNavigationRoutes(startNode, targetNodeId, destination.title, 3);
    setAvailableRoutes(routes);
    setSelectedRouteIndex(0);
    if (routes.length > 0) {
      setActiveNavigationRoute(routes[0]);
    }
    setViewMode('DESTINATION_CARD');
  };

  // 2. Start Navigation Wrappers (All delegate to startNavigationRoute)
  const startVirtualWalk = async (destination: SearchResult) => {
    await startNavigationRoute(destination);
  };

  const startLiveWalk = async (destination: SearchResult) => {
    await startNavigationRoute(destination);
  };

  const startNavigation = async (destination: SearchResult) => {
    await startNavigationRoute(destination);
  };

  const stopNavigation = () => {
    exitNavigation();
  };

  const handleAccessibleToggle = async (val: boolean) => {
    setAccessibleOnly(val);
  };

  const setUserStartingPoint = (nodeId: string, label: string) => {
    setUserNodeId(nodeId);
    setUserLocationLabel(label);

    // Unconditionally set active panorama ID to teleport the 360 viewer directly
    setActivePanoramaId(nodeId);

    const matchPano =
      panoramas.find((p) => p.id === nodeId || p.navigationNodeId === nodeId) ||
      CAMPUS_GRAPH_MAP.get(nodeId);

    if (matchPano) {
      const flr =
        typeof (matchPano as any).floorNumber === 'number'
          ? (matchPano as any).floorNumber
          : typeof (matchPano as any).floor === 'string'
          ? parseInt((matchPano as any).floor, 10) || 0
          : 0;
      setActiveFloorNumber(flr);

      const bldId = (matchPano as any).buildingId || (matchPano as any).area || 'OUTDOOR';
      setSelectedBuildingId(bldId);
    }

    if (isNavigating && selectedDestination) {
      startNavigationRoute(selectedDestination, nodeId);
    }
  };

  const handleQRScan = async (code: string): Promise<boolean> => {
    try {
      const rawRes = await ApiService.resolveQR(code);
      const checkpoint = (rawRes as any).checkpoint || rawRes;
      if (checkpoint && checkpoint.nodeId) {
        setUserStartingPoint(checkpoint.nodeId, checkpoint.label);
        if (checkpoint.floorNumber !== undefined) {
          setActiveFloorNumber(checkpoint.floorNumber);
        }
        const bldId =
          checkpoint.buildingId ||
          (code.toUpperCase().includes('AB') ? 'bld_ab' :
           code.toUpperCase().includes('MG') ? 'bld_main' :
           code.toUpperCase().includes('SM') ? 'bld_sm' :
           code.toUpperCase().includes('SJ') ? 'bld_sj' :
           code.toUpperCase().includes('SC') ? 'bld_sc' :
           code.toUpperCase().includes('HM') ? 'bld_hm' :
           code.toUpperCase().includes('MT') ? 'bld_mt' :
           code.toUpperCase().includes('SB') ? 'bld_sb' : 'bld_ab');

        setSelectedBuildingId(bldId);
        setScannedBlockId(bldId);
        return true;
      }
      return false;
    } catch (err) {
      console.error('QR resolution error:', err);
      return false;
    }
  };

  const toggleFavorite = (item: SearchResult) => {
    setFavorites((prev) => {
      const exists = prev.some((f) => f.id === item.id);
      if (exists) return prev.filter((f) => f.id !== item.id);
      return [...prev, item];
    });
  };

  const isFavorite = (id: string) => favorites.some((f) => f.id === id);

  // Live GPS Tracking with Proximity Node Matching
  const requestLiveGPSLocation = async (): Promise<boolean> => {
    try {
      setGpsStatusMessage('Acquiring high-accuracy campus GPS…');
      const pos = await LocationService.getCurrentGPSPosition();
      const coords = { lat: pos.latitude, lng: pos.longitude };
      const accuracy = pos.accuracy;

      const nearestPano = panoramas.find((p) => p.id === 'outdoor_001') || panoramas[0];

      setLiveGPS({
        latitude: coords.lat,
        longitude: coords.lng,
        lat: coords.lat,
        lng: coords.lng,
        x: 0,
        y: 0,
        z: 0,
        accuracy,
        accuracyMeters: Math.round(accuracy),
        timestamp: Date.now(),
        nearestNodeId: nearestPano ? nearestPano.id : undefined,
        nearestBuildingName: nearestPano?.buildingName,
      });

      if (nearestPano) {
        setActivePanoramaId(nearestPano.id);
        setActiveFloorNumber(nearestPano.floorNumber);
        setUserLocationLabel(`GPS: Near ${nearestPano.buildingName}`);
        setGpsStatusMessage(`Position locked (±${Math.round(accuracy)}m)`);
      } else {
        setGpsStatusMessage(`GPS Active (±${Math.round(accuracy)}m)`);
      }

      setTimeout(() => setGpsStatusMessage(null), 3500);
      return true;
    } catch (err: any) {
      setGpsStatusMessage('GPS unavailable. Please verify location permissions.');
      setTimeout(() => setGpsStatusMessage(null), 4000);
      return false;
    }
  };

  const toggleGPSTracking = () => {
    setIsTrackingGPS((prev) => !prev);
  };

  const toggleSimulateWalk = () => {
    setIsSimulatingWalk((prev) => !prev);
  };

  return (
    <NavigationContext.Provider
      value={{
        buildings,
        floors,
        rooms,
        facilities,
        teachers,
        departments,
        nodes,
        edges,
        qrCheckpoints,
        panoramas,
        isLoadingData,
        activePanorama,
        activePanoramaId,
        setActivePanoramaId,
        navigationStatus,
        activeNavigationRoute,
        availableRoutes,
        selectedRouteIndex,
        selectRouteByIndex,
        currentRouteIndex,
        transitionLocked,
        setTransitionLocked,
        visitedNodeIds,
        navigationError,
        isDebugMode,
        toggleDebugMode,
        startNavigationRoute,
        advanceNavigationStep,
        stepBackwardNavigation,
        exitNavigation,
        isVoiceEnabled,
        toggleVoiceNavigation,
        userNodeId,
        userLocationLabel,
        selectedDestination,
        previewDestination,
        activeRoute,
        isNavigating,
        accessibleOnly,
        activeFloorNumber,
        selectedBuildingId,
        currentStepIndex,
        isSimulatingWalk,
        viewMode,
        visualMode,
        isQRScannerOpen,
        setIsQRScannerOpen,
        isWhereAmIOpen,
        setIsWhereAmIOpen,
        scannedBlockId,
        setScannedBlockId,
        isReportModalOpen,
        setIsReportModalOpen,
        reportInitialContext,
        openReportModal,
        closeReportModal,
        liveGPS,
        isTrackingGPS,
        gpsStatusMessage,
        cameraHeading,
        lightingTheme,
        recentSearches,
        favorites,
        activeTab,
        setActiveTab,
        isMoreMenuOpen,
        setIsMoreMenuOpen,
        isFacultyPortalOpen,
        setIsFacultyPortalOpen,
        setViewMode,
        setVisualMode,
        setUserStartingPoint,
        selectDestinationForPreview,
        startVirtualWalk,
        startLiveWalk,
        startNavigation,
        stopNavigation,
        setAccessibleOnly,
        setActiveFloorNumber,
        setSelectedBuildingId,
        setCurrentStepIndex,
        toggleSimulateWalk,
        handleQRScan,
        toggleFavorite,
        isFavorite,
        requestLiveGPSLocation,
        toggleGPSTracking,
        setCameraHeading,
        setLightingTheme,
        refreshData,
        commitCurrentPanorama,
        persistedSessionInfo: initialSession,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
};

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
};
