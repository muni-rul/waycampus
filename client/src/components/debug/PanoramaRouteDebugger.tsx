import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';
import {
  Navigation,
  Plus,
  Trash2,
  Save,
  RotateCw,
  Undo2,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Search,
  Eye,
  Layers,
  X,
  ArrowRight,
  ArrowUp,
  ArrowLeft,
  ArrowDown,
  Edit3,
  Move,
  GripVertical,
  Play,
  RotateCcw,
  Sparkles,
  Check,
  Image as ImageIcon,
  ArrowLeftRight,
  ListOrdered,
  Compass,
  Route,
  Footprints,
  MapPin,
  CircleDot,
  ChevronUp,
  ChevronDown,
  Tag,
  Palette,
  Crosshair,
  Camera,
  MousePointer,
  Globe,
  UploadCloud,
  Download,
  ExternalLink,
  RefreshCw,
  GitBranch,
  FileJson,
  Server,
  Lock,
  Unlock,
  KeyRound,
  ShieldCheck,
} from 'lucide-react';
import {
  CAMPUS_GRAPH,
  CAMPUS_GRAPH_MAP,
  AREA_LABELS,
  CHRIST_COLLEGE_OFFICIAL_BLOCKS,
  detectBlockFromTag,
  type CampusPanoramaNode,
  type PanoramaConnection,
  type ConnectionDirection,
  type ConnectionType,
  applyGraphOverrides,
  getNodeById,
  getNodeManualNumber,
  getCustomPlaceTags,
  getAllCustomPlaceTags,
  setCustomPlaceTags,
} from '../../data/campusGraph';
import { CAMPUS_PLACES } from '../../data/campusPlaces';
import { ApiService } from '../../services/api';
import { useNavigation } from '../../context/NavigationContext';
import {
  findNavigationRoute,
  setCustomRouteOverrides,
  getCustomRouteOverrides,
  NavigationRoute,
} from '../../services/campusPathfinder';
import { GraphOverrideData, CustomPlaceTag, PlaceTagCategory, CampusReport } from '../../../../shared/types';
import { createNadirBlurMesh, NadirBlurController } from '../panorama/NadirBlurMesh';
import { isLocalhost, isAdminAuthenticated as checkIsAdminAuthenticated } from '../../utils/security';
import { AdminReportsDashboard } from '../admin/AdminReportsDashboard';
import { FacultyPresenceAdminDashboard } from '../admin/FacultyPresenceAdminDashboard';
import { NavigationDirectionVerificationTab } from './NavigationDirectionVerificationTab';
import { DirectionValidationDashboard } from './DirectionValidationDashboard';
import { generateDirectionReportCsv } from '../../services/directionAnalysisService';
import { PanoramaResourceManager } from '../../services/panoramaResourceManager';

interface PanoramaRouteDebuggerProps {
  currentPanorama: any;
  onSelectPanorama: (nodeId: string) => void;
  onClose: () => void;
  cameraYaw: number;
  cameraPitch: number;
  onSetCameraOrientation?: (yaw: number, pitch?: number) => void;
}

export const PanoramaRouteDebugger: React.FC<PanoramaRouteDebuggerProps> = ({
  currentPanorama,
  onSelectPanorama,
  onClose,
}) => {
  const { setActivePanoramaId, setActiveFloorNumber, refreshData } = useNavigation();

  const [selectedNodeId, setSelectedNodeId] = useState<string>(currentPanorama?.id || 'outdoor_001');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeAreaFilter, setActiveAreaFilter] = useState<string>('ALL');

  // Working Draft State (Synchronously initialized for 0ms instant loading)
  const [manualNumbers, setManualNumbers] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    CAMPUS_GRAPH.forEach((n) => {
      const fileNumMatch = n.filename.match(/^0*(\d+)/);
      const derivedNum = fileNumMatch ? fileNumMatch[1] : String(parseInt(n.id.replace(/\D/g, ''), 10) || 0);
      init[n.id] = n.manualNumber || derivedNum;
    });
    try {
      const cached = localStorage.getItem('waycampus_graph_overrides_v2');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.manualNumbers) Object.assign(init, parsed.manualNumbers);
      }
    } catch {}
    return init;
  });

  const [connectionsMap, setConnectionsMap] = useState<Record<string, PanoramaConnection[]>>(() => {
    const init: Record<string, PanoramaConnection[]> = {};
    CAMPUS_GRAPH.forEach((n) => {
      init[n.id] = [...n.connections];
    });
    try {
      const cached = localStorage.getItem('waycampus_graph_overrides_v2');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.customConnections) Object.assign(init, parsed.customConnections);
      }
    } catch {}
    return init;
  });

  const [imageOverrides, setImageOverrides] = useState<Record<string, { image: string; imagePath: string; filename: string }>>({});
  const [panoramaOrder, setPanoramaOrder] = useState<string[]>(() => CAMPUS_GRAPH.map((n) => n.id));
  const [nodeCameraAngles, setNodeCameraAngles] = useState<Record<string, number>>({});
  const [arrivalCalibration, setArrivalCalibration] = useState<{ fromNodeId: string; targetNodeId: string } | null>(null);
  const [displayLimit, setDisplayLimit] = useState<number>(35);

  useEffect(() => {
    setDisplayLimit(35);
  }, [searchQuery, activeAreaFilter]);

  // Debugger Tab Modes: PANORAMAS | DIRECTIONS | VALIDATION
  const [activeDebuggerTab, setActiveDebuggerTab] = useState<'PANORAMAS' | 'DIRECTIONS' | 'VALIDATION'>('PANORAMAS');
  const [isFacultyPresenceOpen, setIsFacultyPresenceOpen] = useState<boolean>(false);

  const unverifiedDirectionsCount = useMemo(() => {
    let count = 0;
    Object.values(connectionsMap).forEach((conns) => {
      conns.forEach((c) => {
        if (c.directionStatus !== 'VERIFIED') count++;
      });
    });
    return count;
  }, [connectionsMap]);

  const handleUpdateConnectionDirection = (
    fromNodeId: string,
    targetId: string,
    direction: ConnectionDirection,
    status: 'VERIFIED' | 'UNKNOWN',
    reason?: string
  ) => {
    pushUndo();
    const currentList = connectionsMap[fromNodeId] || [];
    const nextList = currentList.map((c) => {
      if (c.targetId === targetId) {
        return {
          ...c,
          direction,
          directionStatus: status,
          directionVerifiedAt: new Date().toISOString(),
          directionVerifiedBy: 'admin',
          previousVerifiedDirection: c.directionStatus === 'VERIFIED' ? c.direction : c.previousVerifiedDirection,
          unknownReason: reason,
        };
      }
      return c;
    });

    setConnectionsMap({
      ...connectionsMap,
      [fromNodeId]: nextList,
    });

    const node = CAMPUS_GRAPH_MAP.get(fromNodeId);
    if (node) {
      const conn = node.connections.find((c) => c.targetId === targetId);
      if (conn) {
        conn.direction = direction;
        conn.directionStatus = status;
        conn.directionVerifiedAt = new Date().toISOString();
        conn.directionVerifiedBy = 'admin';
      }
    }

    setStatusBanner({
      type: 'success',
      text: `✓ Verified #${manualNumbers[fromNodeId] || fromNodeId} ➔ #${manualNumbers[targetId] || targetId} as ${direction.toUpperCase()}`,
    });
    setTimeout(() => setStatusBanner(null), 3000);
  };

  const handleBatchApplyAnalyses = (updatedMap: Record<string, PanoramaConnection[]>) => {
    pushUndo();
    setConnectionsMap(updatedMap);
    setStatusBanner({
      type: 'success',
      text: '✓ AI Direction analysis completed across all unverified connections!',
    });
    setTimeout(() => setStatusBanner(null), 4000);
  };

  // Saved Database Snapshot for Diff Review
  const [savedDraft, setSavedDraft] = useState<{
    manualNumbers: Record<string, string>;
    connectionsMap: Record<string, PanoramaConnection[]>;
    imageOverrides: Record<string, any>;
    panoramaOrder: string[];
    placeTagsMap: Record<string, CustomPlaceTag[]>;
    nodeCameraAngles: Record<string, number>;
  }>({
    manualNumbers: {},
    connectionsMap: {},
    imageOverrides: {},
    panoramaOrder: [],
    placeTagsMap: {},
    nodeCameraAngles: {},
  });

  // Undo History Stack
  const [undoStack, setUndoStack] = useState<any[]>([]);

  // 360 Viewer Canvas References
  const containerRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sphereMeshRef = useRef<THREE.Mesh | null>(null);
  const arrowsGroupRef = useRef<THREE.Group | null>(null);
  const nadirBlurRef = useRef<NadirBlurController | null>(null);

  const isUserInteractingRef = useRef<boolean>(false);
  const onPointerDownPointerXRef = useRef<number>(0);
  const onPointerDownPointerYRef = useRef<number>(0);
  const onPointerDownLonRef = useRef<number>(0);
  const onPointerDownLatRef = useRef<number>(0);
  const lonRef = useRef<number>(0);
  const latRef = useRef<number>(10);
  const compassYawTextRef = useRef<HTMLElement | null>(null);
  const compassYawTextRef2 = useRef<HTMLElement | null>(null);
  const lastStateSyncTimeRef = useRef<number>(0);
  const [liveYaw, setLiveYaw] = useState<number>(0);
  const [livePitch, setLivePitch] = useState<number>(10);
  const getCurrentYaw = () => Math.round(((lonRef.current % 360) + 360) % 360);
  const getCurrentPitch = () => Math.round(latRef.current);

  // Selected Arrow State
  const [selectedArrowIndex, setSelectedArrowIndex] = useState<number | null>(null);

  // Double-Click Drag & Reposition Mode
  const [isMovingArrow, setIsMovingArrow] = useState<boolean>(false);
  const [movingArrowIndex, setMovingArrowIndex] = useState<number | null>(null);
  const [originalArrowBackup, setOriginalArrowBackup] = useState<PanoramaConnection | null>(null);

  // Add Connection / Arrow Modal
  const [isAddArrowOpen, setIsAddArrowOpen] = useState<boolean>(false);
  const [newTargetId, setNewTargetId] = useState<string>('');
  const [newDirection, setNewDirection] = useState<ConnectionDirection>('straight');
  const [newYaw, setNewYaw] = useState<number>(0);
  const [newPitch, setNewPitch] = useState<number>(-15);
  const [isBidirectional, setIsBidirectional] = useState<boolean>(true);
  const [targetSearchQuery, setTargetSearchQuery] = useState<string>('');

  // Replace Image Modal
  const [isReplaceImageOpen, setIsReplaceImageOpen] = useState<boolean>(false);
  const [replaceSearchQuery, setReplaceSearchQuery] = useState<string>('');

  // Swap Images Modal
  const [isSwapImagesOpen, setIsSwapImagesOpen] = useState<boolean>(false);
  const [swapTargetNodeId, setSwapTargetNodeId] = useState<string>('');

  // Route Simulator Modal
  const [isRouteTesterOpen, setIsRouteTesterOpen] = useState<boolean>(false);
  const [testStartNodeId, setTestStartNodeId] = useState<string>('outdoor_001');
  const [testDestNodeId, setTestDestNodeId] = useState<string>('outdoor_002');
  const [simulatedRoute, setSimulatedRoute] = useState<NavigationRoute | null>(null);
  const [simStepIndex, setSimStepIndex] = useState<number>(0);

  // Custom Manual Route Path Builder State
  const [isPathBuilderOpen, setIsPathBuilderOpen] = useState<boolean>(false);
  const [builderStartId, setBuilderStartId] = useState<string>('outdoor_001');
  const [builderTargetId, setBuilderTargetId] = useState<string>('outdoor_012');
  const [customPathNodes, setCustomPathNodes] = useState<string[]>([]);
  const [isLiveRecording, setIsLiveRecording] = useState<boolean>(false);
  const [routeOverrides, setRouteOverrides] = useState<Record<string, string[]>>({});
  const [selectedPlaceKey, setSelectedPlaceKey] = useState<string>('');

  // Custom 3D Place & Building Tags State
  const [placeTagsMap, setPlaceTagsMap] = useState<Record<string, CustomPlaceTag[]>>({});
  const [selectedTagIndex, setSelectedTagIndex] = useState<number | null>(null);
  const [isMovingTag, setIsMovingTag] = useState<boolean>(false);
  const [movingTagIndex, setMovingTagIndex] = useState<number | null>(null);
  const [originalTagBackup, setOriginalTagBackup] = useState<CustomPlaceTag | null>(null);
  const [isAddTagOpen, setIsAddTagOpen] = useState<boolean>(false);
  const [newTagText, setNewTagText] = useState<string>('');
  const [newTagColor, setNewTagColor] = useState<string>('#38bdf8');
  const [newTagCategory, setNewTagCategory] = useState<PlaceTagCategory>('CLASSROOM');
  const [newTagVisibleFromDistance, setNewTagVisibleFromDistance] = useState<boolean>(true);
  const [newTagDistance, setNewTagDistance] = useState<number>(180);
  const tagsGroupRef = useRef<THREE.Group | null>(null);

  // Drag & Drop State
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);

  // Save Modal & Status
  const [showSaveReview, setShowSaveReview] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Publish & Render Live Deploy Modal State
  const [isPublishModalOpen, setIsPublishModalOpen] = useState<boolean>(false);
  const [publishStatus, setPublishStatus] = useState<{
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
  } | null>(null);
  const [isDeploying, setIsDeploying] = useState<boolean>(false);
  const [deployResult, setDeployResult] = useState<{
    success: boolean;
    message: string;
    commitHash?: string;
  } | null>(null);
  const [deployHookUrl, setDeployHookUrl] = useState<string>(() => {
    return localStorage.getItem('campnav_render_deploy_hook') || '';
  });
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(() => {
    return checkIsAdminAuthenticated();
  });
  const [adminPinInput, setAdminPinInput] = useState('');
  const [adminAuthError, setAdminAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // User Bug Reports & Feedback State (Embedded directly in Debugger)
  const [isReportsModalOpen, setIsReportsModalOpen] = useState<boolean>(false);
  const [reportFilterNodeId, setReportFilterNodeId] = useState<string | null>(null);
  const [allReports, setAllReports] = useState<CampusReport[]>([]);

  const refreshReports = async () => {
    try {
      const res = await ApiService.getAdminReports({ limit: 500 });
      if (res?.reports) {
        setAllReports(res.reports);
      }
    } catch (err) {
      console.warn('Failed to fetch reports in debugger:', err);
    }
  };

  const unreadReportsCount = useMemo(() => {
    return allReports.filter((r) => r.status === 'NEW' || r.status === 'IN_PROGRESS' || r.status === 'ACKNOWLEDGED').length;
  }, [allReports]);

  const reportsByNodeId = useMemo(() => {
    const map: Record<string, CampusReport[]> = {};
    allReports.forEach((r) => {
      const key = r.currentPanoramaId || r.currentNodeId;
      if (key) {
        if (!map[key]) map[key] = [];
        map[key].push(r);
      }
    });
    return map;
  }, [allReports]);

  const currentReportsForNode = useMemo(() => {
    return reportsByNodeId[selectedNodeId] || [];
  }, [reportsByNodeId, selectedNodeId]);

  const refreshPublishStatus = async () => {
    try {
      const status = await ApiService.getPublishStatus();
      setPublishStatus(status);
      if (checkIsAdminAuthenticated()) {
        setIsAdminAuthenticated(true);
      }
    } catch (err) {
      console.warn('Failed to load publish status:', err);
    }
  };

  const handleModalAdminLogin = async (overridePin?: string) => {
    const pin = (overridePin || adminPinInput).trim();
    if (!pin) {
      setAdminAuthError('Please enter the admin PIN or password');
      return;
    }
    setIsAuthenticating(true);
    setAdminAuthError(null);
    try {
      const res = await ApiService.adminLogin(pin);
      if (res?.token) {
        sessionStorage.setItem('campnav_admin_auth', 'true');
        sessionStorage.setItem('campnav_admin_token', res.token);
        if (res.user) {
          sessionStorage.setItem('campnav_admin_user', JSON.stringify(res.user));
        }
        setIsAdminAuthenticated(true);
        setAdminAuthError(null);
        setDeployResult(null);
        await refreshPublishStatus();
      }
    } catch (err: any) {
      setAdminAuthError(err.message || 'Authentication failed. Please check credentials.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Load Overrides from Server on Mount
  useEffect(() => {
    const loadState = async () => {
      try {
        const overrides = await ApiService.getGraphOverrides();
        const initNumbers: Record<string, string> = {};
        const initConns: Record<string, PanoramaConnection[]> = {};
        const initImages: Record<string, any> = overrides?.nodeImageOverrides || {};
        const initRoutes: Record<string, string[]> = overrides?.customRouteOverrides || {};
        const initTags: Record<string, CustomPlaceTag[]> = overrides?.customPlaceTags || getAllCustomPlaceTags();
        const initAngles: Record<string, number> = overrides?.nodeCameraAngles || {};

        CAMPUS_GRAPH.forEach((n) => {
          const fileNumMatch = n.filename.match(/^0*(\d+)/);
          const derivedNum = fileNumMatch ? fileNumMatch[1] : String(parseInt(n.id.replace(/\D/g, ''), 10) || 0);
          const overrideNum = overrides?.manualNumbers?.[n.id];
          initNumbers[n.id] = (overrideNum && overrideNum !== '0') ? overrideNum : n.manualNumber || derivedNum;
          initConns[n.id] = overrides?.customConnections?.[n.id]
            ? JSON.parse(JSON.stringify(overrides.customConnections[n.id]))
            : JSON.parse(JSON.stringify(n.connections));
        });

        const order = overrides?.customPanoramaOrder && Array.isArray(overrides.customPanoramaOrder)
          ? overrides.customPanoramaOrder
          : CAMPUS_GRAPH.map((n) => n.id);

        setManualNumbers(initNumbers);
        setConnectionsMap(initConns);
        setImageOverrides(initImages);
        setPanoramaOrder(order);
        setRouteOverrides(initRoutes);
        setCustomRouteOverrides(initRoutes);
        setPlaceTagsMap(initTags);
        setCustomPlaceTags(initTags);
        setNodeCameraAngles(initAngles);

        setSavedDraft({
          manualNumbers: JSON.parse(JSON.stringify(initNumbers)),
          connectionsMap: JSON.parse(JSON.stringify(initConns)),
          imageOverrides: JSON.parse(JSON.stringify(initImages)),
          panoramaOrder: [...order],
          placeTagsMap: JSON.parse(JSON.stringify(initTags)),
          nodeCameraAngles: JSON.parse(JSON.stringify(initAngles)),
        });
        setTimeout(() => refreshReports(), 300);
      } catch (err) {
        console.warn('Failed to load overrides:', err);
      }
    };
    loadState();
  }, []);

  const handleInitPathBuilder = (startId: string, destId: string) => {
    setBuilderStartId(startId);
    setBuilderTargetId(destId);
    const key1 = `${startId}__${destId}`;
    const key2 = destId;
    const existing = routeOverrides[key1] || routeOverrides[key2];
    if (existing && Array.isArray(existing) && existing.length > 0) {
      setCustomPathNodes([...existing]);
    } else {
      const autoRoute = findNavigationRoute(startId, destId, 'Custom Path Builder', true, false, undefined);
      if (autoRoute && autoRoute.pathNodeIds.length > 0) {
        setCustomPathNodes([...autoRoute.pathNodeIds]);
      } else {
        setCustomPathNodes([startId, destId]);
      }
    }
  };

  const handleSaveCustomRoute = async () => {
    if (customPathNodes.length < 2) {
      alert('A navigation route must have at least a start node and a destination node.');
      return;
    }
    const routeKey = `${builderStartId}__${builderTargetId}`;
    const updatedRoutes = {
      ...routeOverrides,
      [routeKey]: [...customPathNodes],
    };
    if (selectedPlaceKey) {
      updatedRoutes[selectedPlaceKey] = [...customPathNodes];
    }
    setRouteOverrides(updatedRoutes);
    setCustomRouteOverrides(updatedRoutes);

    setIsSaving(true);
    try {
      const overrides: GraphOverrideData = {
        nodeImageOverrides: imageOverrides,
        customConnections: connectionsMap,
        nodeHeadingOverrides: {},
        verifiedStatusOverrides: {},
        manualNumbers,
        customPanoramaOrder: panoramaOrder,
        customRouteOverrides: updatedRoutes,
        lastSavedAt: new Date().toISOString(),
        savedBy: 'Manual Route Path Builder',
      };

      await ApiService.saveGraphOverrides(overrides, 'Manual Route Path Builder');
      applyGraphOverrides(overrides);
      setStatusBanner({
        type: 'success',
        text: `✓ Custom route successfully saved for #${manualNumbers[builderStartId] || builderStartId} ➔ #${manualNumbers[builderTargetId] || builderTargetId} (${customPathNodes.length} nodes)!`,
      });
      setTimeout(() => setStatusBanner(null), 4000);
      refreshData();
    } catch (err: any) {
      setStatusBanner({ type: 'error', text: `Save route failed: ${err.message}` });
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetCustomRoute = async () => {
    const routeKey = `${builderStartId}__${builderTargetId}`;
    const updatedRoutes = { ...routeOverrides };
    delete updatedRoutes[routeKey];
    if (selectedPlaceKey) {
      delete updatedRoutes[selectedPlaceKey];
    }
    setRouteOverrides(updatedRoutes);
    setCustomRouteOverrides(updatedRoutes);

    const autoRoute = findNavigationRoute(builderStartId, builderTargetId, 'Reset Target', true, false, undefined);
    if (autoRoute) {
      setCustomPathNodes([...autoRoute.pathNodeIds]);
    }

    try {
      const overrides: GraphOverrideData = {
        nodeImageOverrides: imageOverrides,
        customConnections: connectionsMap,
        nodeHeadingOverrides: {},
        verifiedStatusOverrides: {},
        manualNumbers,
        customPanoramaOrder: panoramaOrder,
        customRouteOverrides: updatedRoutes,
        lastSavedAt: new Date().toISOString(),
        savedBy: 'Manual Route Path Builder',
      };
      await ApiService.saveGraphOverrides(overrides, 'Manual Route Path Builder');
      setStatusBanner({ type: 'success', text: '✓ Route reset to auto Dijkstra calculation.' });
      setTimeout(() => setStatusBanner(null), 3000);
    } catch (err: any) {
      console.warn('Failed to reset route override on server:', err);
    }
  };

  const currentNode = CAMPUS_GRAPH_MAP.get(selectedNodeId) || CAMPUS_GRAPH[0];
  const currentImagePath = imageOverrides[selectedNodeId]?.imagePath || currentNode?.imagePath;
  const currentConnections = connectionsMap[selectedNodeId] || currentNode?.connections || [];
  const currentManualNumber = manualNumbers[selectedNodeId] || selectedNodeId;
  const currentPlaceTags = placeTagsMap[selectedNodeId] || [];
  const selectedTag =
    selectedTagIndex !== null && currentPlaceTags && currentPlaceTags[selectedTagIndex]
      ? currentPlaceTags[selectedTagIndex]
      : null;

  // Automatically reset selections when active node changes or index is out-of-bounds
  useEffect(() => {
    setSelectedTagIndex(null);
    setSelectedArrowIndex(null);
    setIsMovingTag(false);
    setIsMovingArrow(false);
  }, [selectedNodeId]);

  useEffect(() => {
    if (selectedTagIndex !== null && (!currentPlaceTags || !currentPlaceTags[selectedTagIndex])) {
      setSelectedTagIndex(null);
      setIsMovingTag(false);
    }
  }, [currentPlaceTags, selectedTagIndex]);

  useEffect(() => {
    if (selectedArrowIndex !== null && (!currentConnections || !currentConnections[selectedArrowIndex])) {
      setSelectedArrowIndex(null);
      setIsMovingArrow(false);
    }
  }, [currentConnections, selectedArrowIndex]);

  // Check unsaved changes (memoized to prevent expensive stringification on every render)
  const hasChanges = useMemo(() => {
    return (
      JSON.stringify(manualNumbers) !== JSON.stringify(savedDraft.manualNumbers) ||
      JSON.stringify(connectionsMap) !== JSON.stringify(savedDraft.connectionsMap) ||
      JSON.stringify(imageOverrides) !== JSON.stringify(savedDraft.imageOverrides) ||
      JSON.stringify(panoramaOrder) !== JSON.stringify(savedDraft.panoramaOrder) ||
      JSON.stringify(placeTagsMap) !== JSON.stringify((savedDraft as any).placeTagsMap) ||
      JSON.stringify(nodeCameraAngles) !== JSON.stringify(savedDraft.nodeCameraAngles)
    );
  }, [manualNumbers, connectionsMap, imageOverrides, panoramaOrder, placeTagsMap, nodeCameraAngles, savedDraft]);

  // Exact diff calculation between current draft and saved state (Shows only changes just made)
  const pendingDiff = useMemo(() => {
    const diffs: Array<{
      nodeId: string;
      nodeNumber: string;
      type: 'MANUAL_NUMBER' | 'CONNECTIONS' | 'TAGS' | 'CAMERA' | 'IMAGE';
      label: string;
      details: string[];
    }> = [];

    const allNodeIds = new Set([
      ...Object.keys(connectionsMap),
      ...Object.keys(savedDraft.connectionsMap || {}),
      ...Object.keys(manualNumbers),
      ...Object.keys(savedDraft.manualNumbers || {}),
      ...Object.keys(placeTagsMap),
      ...Object.keys((savedDraft as any).placeTagsMap || {}),
      ...Object.keys(nodeCameraAngles),
      ...Object.keys(savedDraft.nodeCameraAngles || {}),
      ...Object.keys(imageOverrides),
      ...Object.keys(savedDraft.imageOverrides || {}),
    ]);

    for (const nodeId of allNodeIds) {
      const manualNum = manualNumbers[nodeId] || nodeId;
      const prevManualNum = savedDraft.manualNumbers?.[nodeId];

      // 1. Manual number change
      if (manualNumbers[nodeId] !== undefined && prevManualNum !== undefined && manualNumbers[nodeId] !== prevManualNum) {
        diffs.push({
          nodeId,
          nodeNumber: manualNum,
          type: 'MANUAL_NUMBER',
          label: `Manual Number changed: #${prevManualNum} ➔ #${manualNumbers[nodeId]}`,
          details: [`Node ID: ${nodeId}`],
        });
      }

      // 2. Connections change
      const currentConns = connectionsMap[nodeId] || [];
      const prevConns = savedDraft.connectionsMap?.[nodeId] || [];
      if (JSON.stringify(currentConns) !== JSON.stringify(prevConns)) {
        const details: string[] = [];
        currentConns.forEach((c) => {
          const targetNum = manualNumbers[c.targetId] || c.targetId;
          const wasInPrev = prevConns.find((pc) => pc.targetId === c.targetId);
          if (!wasInPrev) {
            details.push(`+ Added arrow ➔ #${targetNum} (${c.direction})`);
          } else if (JSON.stringify(wasInPrev) !== JSON.stringify(c)) {
            details.push(`~ Modified arrow ➔ #${targetNum} (${c.direction})`);
          }
        });
        prevConns.forEach((pc) => {
          const targetNum = manualNumbers[pc.targetId] || pc.targetId;
          const stillInCurr = currentConns.find((c) => c.targetId === pc.targetId);
          if (!stillInCurr) {
            details.push(`- Removed arrow ➔ #${targetNum}`);
          }
        });
        if (details.length > 0) {
          diffs.push({
            nodeId,
            nodeNumber: manualNum,
            type: 'CONNECTIONS',
            label: `Arrows updated on Node #${manualNum} (${details.length} change${details.length === 1 ? '' : 's'})`,
            details,
          });
        }
      }

      // 3. Tags change
      const currentTags = placeTagsMap[nodeId] || [];
      const prevTags = (savedDraft as any).placeTagsMap?.[nodeId] || [];
      if (JSON.stringify(currentTags) !== JSON.stringify(prevTags)) {
        const details: string[] = [];
        currentTags.forEach((t) => {
          const wasInPrev = prevTags.find((pt: any) => pt.id === t.id);
          if (!wasInPrev) {
            details.push(`+ Added tag: "${t.text}" (${t.category})`);
          } else if (JSON.stringify(wasInPrev) !== JSON.stringify(t)) {
            details.push(`~ Updated tag: "${t.text}" (${t.category})`);
          }
        });
        prevTags.forEach((pt: any) => {
          const stillInCurr = currentTags.find((t) => t.id === pt.id);
          if (!stillInCurr) {
            details.push(`- Deleted tag: "${pt.text}"`);
          }
        });
        if (details.length > 0) {
          diffs.push({
            nodeId,
            nodeNumber: manualNum,
            type: 'TAGS',
            label: `Tags modified on Node #${manualNum}`,
            details,
          });
        }
      }

      // 4. Camera angle change
      const currentAngle = nodeCameraAngles[nodeId];
      const prevAngle = savedDraft.nodeCameraAngles?.[nodeId];
      if (currentAngle !== undefined && currentAngle !== prevAngle) {
        diffs.push({
          nodeId,
          nodeNumber: manualNum,
          type: 'CAMERA',
          label: `Heading calibrated on Node #${manualNum}: ${currentAngle}°`,
          details: [`Previous: ${prevAngle ?? 'default'}°`],
        });
      }

      // 5. Image overrides change
      const currentImg = imageOverrides[nodeId];
      const prevImg = savedDraft.imageOverrides?.[nodeId];
      if (JSON.stringify(currentImg) !== JSON.stringify(prevImg)) {
        diffs.push({
          nodeId,
          nodeNumber: manualNum,
          type: 'IMAGE',
          label: `Photo updated on Node #${manualNum}`,
          details: [currentImg?.filename || 'custom image'],
        });
      }
    }

    return diffs;
  }, [manualNumbers, connectionsMap, imageOverrides, placeTagsMap, nodeCameraAngles, savedDraft]);

  // Push Undo State
  const pushUndo = () => {
    setUndoStack((prev) => [
      ...prev,
      {
        manualNumbers: JSON.parse(JSON.stringify(manualNumbers)),
        connectionsMap: JSON.parse(JSON.stringify(connectionsMap)),
        imageOverrides: JSON.parse(JSON.stringify(imageOverrides)),
        panoramaOrder: [...panoramaOrder],
        placeTagsMap: JSON.parse(JSON.stringify(placeTagsMap)),
        nodeCameraAngles: JSON.parse(JSON.stringify(nodeCameraAngles)),
      },
    ]);
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, prev.length - 1));
    setManualNumbers(last.manualNumbers);
    setConnectionsMap(last.connectionsMap);
    setImageOverrides(last.imageOverrides);
    setPanoramaOrder(last.panoramaOrder);
    if ((last as any).placeTagsMap) setPlaceTagsMap((last as any).placeTagsMap);
    if ((last as any).nodeCameraAngles) setNodeCameraAngles((last as any).nodeCameraAngles);
    setSelectedArrowIndex(null);
    setSelectedTagIndex(null);
  };



  // 360 Viewer Setup - Reusable canvas across node selections
  useEffect(() => {
    if (!mountRef.current) return;

    const width = mountRef.current.clientWidth || containerRef.current?.clientWidth || 600;
    const height = mountRef.current.clientHeight || containerRef.current?.clientHeight || 450;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(72, width / height, 1, 1100);
    camera.position.set(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    rendererRef.current = renderer;

    mountRef.current.replaceChildren(renderer.domElement);

    const geometry = new THREE.SphereGeometry(500, 48, 32);
    geometry.scale(-1, 1, 1);

    const material = new THREE.MeshBasicMaterial({ color: 0x0a0f1d, side: THREE.DoubleSide });
    const sphereMesh = new THREE.Mesh(geometry, material);
    sphereMesh.rotation.y = 0;
    scene.add(sphereMesh);
    sphereMeshRef.current = sphereMesh;

    const arrowsGroup = new THREE.Group();
    scene.add(arrowsGroup);
    arrowsGroupRef.current = arrowsGroup;

    const tagsGroup = new THREE.Group();
    scene.add(tagsGroup);
    tagsGroupRef.current = tagsGroup;

    // Google Street View Style Nadir Camera & Tripod Blur (covers photographer & tripod below camera)
    const nadirBlur = createNadirBlurMesh(497, (sphereMesh.material as THREE.MeshBasicMaterial)?.map || null);
    scene.add(nadirBlur.mesh);
    nadirBlurRef.current = nadirBlur;

    // Load initial texture if image path exists
    if (currentImagePath) {
      const cached = PanoramaResourceManager.getCachedTexture(selectedNodeId);
      if (cached) {
        sphereMesh.material = new THREE.MeshBasicMaterial({ map: cached, side: THREE.DoubleSide });
        nadirBlurRef.current?.setTexture(cached);
      } else {
        const loader = new THREE.TextureLoader();
        let safeUrl = currentImagePath;
        try {
          safeUrl = encodeURI(decodeURI(currentImagePath));
        } catch {
          safeUrl = currentImagePath;
        }
        const onTex = (tex: THREE.Texture) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy() || 16, 16);
          sphereMesh.material = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
          nadirBlurRef.current?.setTexture(tex);
        };
        loader.load(safeUrl, onTex, undefined, () => loader.load(currentImagePath, onTex));
      }
    }

    let animId: number;
    let lastRenderYaw = -999;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (cameraRef.current && rendererRef.current && sceneRef.current) {
        latRef.current = Math.max(10, Math.min(72, latRef.current));
        const radLat = THREE.MathUtils.degToRad(latRef.current);
        const radLon = THREE.MathUtils.degToRad(lonRef.current);

        const x = 500 * Math.cos(radLat) * Math.sin(radLon);
        const y = 500 * Math.sin(radLat);
        const z = 500 * Math.cos(radLat) * Math.cos(radLon);

        cameraRef.current.lookAt(x, y, z);
        rendererRef.current.render(sceneRef.current, cameraRef.current);

        const curYaw = Math.round(((lonRef.current % 360) + 360) % 360);

        // Direct DOM update for pure 60-90+ FPS display without React re-render thrashing
        if (curYaw !== lastRenderYaw) {
          lastRenderYaw = curYaw;
          if (compassYawTextRef.current) {
            compassYawTextRef.current.textContent = `${curYaw}°`;
          }
          if (compassYawTextRef2.current) {
            compassYawTextRef2.current.textContent = `${curYaw}°`;
          }
        }
      }
    };
    animate();

    const handleResize = () => {
      if (!mountRef.current || !cameraRef.current || !rendererRef.current) return;
      const w = mountRef.current.clientWidth || 600;
      const h = mountRef.current.clientHeight || 450;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      if (rendererRef.current?.domElement && mountRef.current?.contains(rendererRef.current.domElement)) {
        mountRef.current.removeChild(rendererRef.current.domElement);
      }
      nadirBlurRef.current?.dispose();
      nadirBlurRef.current = null;
      geometry.dispose();
      material.dispose();
      rendererRef.current?.dispose();
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      sphereMeshRef.current = null;
    };
  }, [activeDebuggerTab]);

  // Fast Texture Switch & Preload on Node Change (re-uses existing WebGL context seamlessly)
  useEffect(() => {
    if (!sphereMeshRef.current || !currentImagePath) return;

    let isCurrent = true;

    // 1. Instant 0ms cached texture swap
    const cached = PanoramaResourceManager.getCachedTexture(selectedNodeId);
    if (cached) {
      const mat = sphereMeshRef.current.material as THREE.MeshBasicMaterial;
      mat.map = cached;
      mat.needsUpdate = true;
      nadirBlurRef.current?.setTexture(cached);

      // Preload connected adjacent nodes in background
      const conns = connectionsMap[selectedNodeId] || [];
      conns.forEach((c) => {
        PanoramaResourceManager.preloadPanorama(c.targetId, undefined, false);
      });
      return;
    }

    // 2. Load texture if not yet in cache
    let safeUrl = currentImagePath;
    try {
      safeUrl = encodeURI(decodeURI(currentImagePath));
    } catch {
      safeUrl = currentImagePath;
    }

    const loader = new THREE.TextureLoader();
    const applyLoadedTex = (tex: THREE.Texture) => {
      if (!isCurrent || !sphereMeshRef.current) return;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = Math.min(rendererRef.current?.capabilities.getMaxAnisotropy() || 16, 16);

      const mat = sphereMeshRef.current.material as THREE.MeshBasicMaterial;
      mat.map = tex;
      mat.needsUpdate = true;
      nadirBlurRef.current?.setTexture(tex);

      // Preload adjacent connections
      const conns = connectionsMap[selectedNodeId] || [];
      conns.forEach((c) => {
        PanoramaResourceManager.preloadPanorama(c.targetId, undefined, false);
      });
    };

    loader.load(
      safeUrl,
      applyLoadedTex,
      undefined,
      () => {
        loader.load(currentImagePath, applyLoadedTex);
      }
    );

    return () => {
      isCurrent = false;
    };
  }, [selectedNodeId, currentImagePath]);

  // Render 3D Arrows in Scene
  useEffect(() => {
    if (!arrowsGroupRef.current) return;
    const group = arrowsGroupRef.current;
    while (group.children.length > 0) {
      const child = group.children[0] as THREE.Sprite;
      group.remove(child);
      if (child.material) {
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
      }
    }

    currentConnections.forEach((conn, index) => {
      const isSelected = selectedArrowIndex === index;
      const targetLabel = manualNumbers[conn.targetId] || conn.targetId;

      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, 512, 512);

        const cx = 256;
        const cy = 256;

        // ─── Beautiful Round Disc Navigation Arrow ───

        // 1. Soft ground shadow beneath the disc
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(cx, cy + 18, 145, 60, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.filter = 'blur(16px)';
        ctx.fill();
        ctx.filter = 'none';
        ctx.restore();

        // 2. Outer neon glow ring
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(cx, cy, 130, 56, 0, 0, Math.PI * 2);
        ctx.fillStyle = isSelected
          ? 'rgba(0, 255, 200, 0.65)'
          : 'rgba(56, 189, 248, 0.4)';
        ctx.filter = isSelected ? 'blur(20px)' : 'blur(12px)';
        ctx.fill();
        ctx.filter = 'none';
        ctx.restore();

        // 3. Main disc body — gradient filled oval (perspective-squished circle)
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(cx, cy, 115, 50, 0, 0, Math.PI * 2);

        const discGrad = ctx.createRadialGradient(cx, cy - 8, 10, cx, cy, 115);
        if (isSelected) {
          discGrad.addColorStop(0, '#00ffc8');   // Neon Turquoise center
          discGrad.addColorStop(0.4, '#059669'); // Emerald
          discGrad.addColorStop(0.8, '#064e3b'); // Dark Teal
          discGrad.addColorStop(1, '#022c22');   // Deep Forest edge
        } else {
          discGrad.addColorStop(0, '#1e90ff');   // Dodger Blue center
          discGrad.addColorStop(0.4, '#0f2744'); // Deep Navy
          discGrad.addColorStop(0.8, '#0a1626'); // Midnight
          discGrad.addColorStop(1, '#040912');   // Near-Black edge
        }
        ctx.fillStyle = discGrad;
        ctx.fill();

        // 4. Crisp outer ring stroke
        ctx.strokeStyle = isSelected ? '#ffffff' : '#38bdf8';
        ctx.lineWidth = isSelected ? 5.5 : 3.5;
        ctx.shadowColor = isSelected ? '#00ffc8' : '#38bdf8';
        ctx.shadowBlur = isSelected ? 20 : 8;
        ctx.stroke();
        ctx.restore();

        // 5. Inner subtle ring for depth
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(cx, cy, 98, 42, 0, 0, Math.PI * 2);
        ctx.strokeStyle = isSelected ? 'rgba(255, 255, 255, 0.3)' : 'rgba(56, 189, 248, 0.15)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();

        // 6. Beautiful forward chevron arrow inside the disc
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(1.0, 0.44); // Match disc perspective

        ctx.strokeStyle = '#ffffff';
        ctx.shadowColor = isSelected ? '#00ffc8' : '#38bdf8';
        ctx.shadowBlur = isSelected ? 12 : 8;
        ctx.lineWidth = 6.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        ctx.moveTo(-36, 14);
        ctx.lineTo(0, -32);
        ctx.lineTo(36, 14);
        ctx.stroke();

        ctx.restore();

        // 7. Target Number Badge: Sleek frosted pill floating neatly above the disc
        ctx.save();
        ctx.fillStyle = isSelected ? 'rgba(6, 44, 38, 0.95)' : 'rgba(10, 15, 26, 0.95)';
        ctx.beginPath();
        ctx.roundRect(148, 16, 216, 52, 16);
        ctx.fill();
        ctx.strokeStyle = isSelected ? '#00ffc8' : '#38bdf8';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.fillStyle = isSelected ? '#a7f3d0' : '#e0f2fe';
        ctx.font = 'bold 24px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`➔ #${targetLabel}`, 256, 42);
        ctx.restore();
      }

      const texture = new THREE.CanvasTexture(canvas);
      const spriteMaterial = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
      });
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.scale.set(78, 54, 1);

      const yaw = conn.worldBearing ?? conn.heading ?? 0;
      const dir = (conn.direction || '').toLowerCase();
      const isBackward = dir === 'u-turn' || dir === 'backward' || dir === 'back';
      const isTurn = dir === 'left' || dir === 'slight-left' || dir === 'right' || dir === 'slight-right';

      const rawPitch = (conn as any).pitch;
      const pitch = (rawPitch !== undefined && rawPitch !== -28 && rawPitch !== -25)
        ? rawPitch
        : isBackward ? -21 : isTurn ? -17 : -15;

      const dist = (conn as any).distance !== undefined
        ? (conn as any).distance
        : isBackward ? 175 : isTurn ? 195 : 225;

      const radYaw = THREE.MathUtils.degToRad(yaw);
      const radPitch = THREE.MathUtils.degToRad(pitch);

      const x = dist * Math.cos(radPitch) * Math.sin(radYaw);
      const y = dist * Math.sin(radPitch);
      const z = dist * Math.cos(radPitch) * Math.cos(radYaw);

      sprite.position.set(x, y, z);
      sprite.userData = { index };
      group.add(sprite);
    });
  }, [currentConnections, selectedArrowIndex, manualNumbers]);

  // ── Render 3D Custom Place & Building Tags ──
  useEffect(() => {
    if (!tagsGroupRef.current) return;
    const group = tagsGroupRef.current;
    while (group.children.length > 0) {
      const child = group.children[0] as THREE.Sprite;
      group.remove(child);
      if (child.material) {
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
      }
    }

    const createDebuggerTagSprite = (
      text: string,
      accentColor = '#38bdf8',
      isSelected = false,
      isThisMoving = false,
      isDistant = false
    ): THREE.Sprite | null => {
      const trimmed = (text || '').trim();
      if (!trimmed) return null;

      const displayText = isDistant ? `📍 ${trimmed} • Ahead` : trimmed;
      const charCount = displayText.length;

      const fontSize = isDistant
        ? charCount > 35 ? 30 : 34
        : charCount > 35 ? 32 : charCount > 24 ? 36 : 42;

      const fontStyle = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;

      const measureCanvas = document.createElement('canvas');
      const measureCtx = measureCanvas.getContext('2d');
      if (!measureCtx) return null;
      measureCtx.font = fontStyle;
      const measuredWidth = measureCtx.measureText(displayText).width;

      const horizontalPadding = isDistant ? 80 : 90;
      const canvasWidth = Math.max(540, Math.ceil(measuredWidth + horizontalPadding));
      const canvasHeight = 160;

      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      const pillX = 12;
      const pillY = 14;
      const pillW = canvasWidth - 24;
      const pillH = canvasHeight - 28;
      const pillRadius = 30;

      if (isDistant) {
        ctx.fillStyle = 'rgba(8, 14, 28, 0.94)';
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW, pillH, pillRadius);
        ctx.fill();

        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 4;
        ctx.setLineDash([12, 6]);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(pillX + 40, pillY + 4);
        ctx.lineTo(pillX + pillW - 40, pillY + 4);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = fontStyle;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(displayText, canvasWidth / 2, canvasHeight / 2);
      } else {
        ctx.fillStyle = isThisMoving
          ? 'rgba(245, 158, 11, 0.96)'
          : isSelected
          ? 'rgba(15, 23, 42, 0.98)'
          : 'rgba(10, 15, 30, 0.95)';
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW, pillH, pillRadius);
        ctx.fill();

        const borderColor = isThisMoving ? '#ffffff' : isSelected ? '#38bdf8' : accentColor;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = isSelected || isThisMoving ? 6 : 5;
        ctx.stroke();

        ctx.strokeStyle = isThisMoving ? '#ffffff' : 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(pillX + 40, pillY + 4);
        ctx.lineTo(pillX + pillW - 40, pillY + 4);
        ctx.stroke();

        ctx.fillStyle = isThisMoving ? '#020617' : '#ffffff';
        ctx.font = fontStyle;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(displayText, canvasWidth / 2, canvasHeight / 2);
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      const spriteMaterial = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
      });
      const sprite = new THREE.Sprite(spriteMaterial);

      const baseHeight = isDistant ? 20 : 26;
      const aspect = canvasWidth / canvasHeight;
      const spriteWidth = baseHeight * aspect;

      sprite.scale.set(spriteWidth, baseHeight, 1);
      return sprite;
    };

    const currentTags = placeTagsMap[selectedNodeId] || [];
    currentTags.forEach((tag, idx) => {
      const isSelected = selectedTagIndex === idx;
      const isThisMoving = isMovingTag && movingTagIndex === idx;
      const sprite = createDebuggerTagSprite(
        tag.text,
        tag.color || '#38bdf8',
        isSelected,
        isThisMoving,
        false
      );
      if (!sprite) return;

      const yaw = tag.yaw ?? 0;
      const pitch = tag.pitch ?? 0;
      const dist = tag.distance ?? 180;

      const radYaw = THREE.MathUtils.degToRad(yaw);
      const radPitch = THREE.MathUtils.degToRad(pitch);

      const x = dist * Math.cos(radPitch) * Math.sin(radYaw);
      const y = dist * Math.sin(radPitch);
      const z = dist * Math.cos(radPitch) * Math.cos(radYaw);

      sprite.position.set(x, y, z);
      sprite.userData = { isTag: true, tagIndex: idx };
      group.add(sprite);
    });

    // Distant Corridor Tags Preview from connected neighbor nodes
    const outgoing = connectionsMap[selectedNodeId] || [];
    const localTexts = new Set(currentTags.map((t) => t.text.toLowerCase()));
    outgoing.forEach((arrow) => {
      const targetTags = placeTagsMap[arrow.targetId] || [];
      let stackIdx = 0;
      targetTags.forEach((ttag) => {
        if (ttag.visibleFromDistance === false) return;
        if (localTexts.has(ttag.text.toLowerCase())) return;

        const sprite = createDebuggerTagSprite(
          ttag.text,
          ttag.color || '#38bdf8',
          false,
          false,
          true
        );
        if (!sprite) return;

        const yaw = arrow.worldBearing ?? arrow.heading ?? 0;
        const pitch = Math.max(-2, (arrow.pitch || -16) + 14) + stackIdx * 6.5;
        const dist = 260;

        const radYaw = THREE.MathUtils.degToRad(yaw);
        const radPitch = THREE.MathUtils.degToRad(pitch);
        sprite.position.set(
          dist * Math.cos(radPitch) * Math.sin(radYaw),
          dist * Math.sin(radPitch),
          dist * Math.cos(radPitch) * Math.cos(radYaw)
        );
        sprite.userData = { isDistantTag: true, targetNodeId: arrow.targetId, tag: ttag };
        group.add(sprite);
        stackIdx++;
      });
    });
  }, [placeTagsMap, selectedNodeId, selectedTagIndex, isMovingTag, movingTagIndex, connectionsMap]);

  // Double-Click on 3D Arrow or Tag to enter Reposition Mode
  const handleDoubleClick = (e: React.MouseEvent) => {
    if (!containerRef.current || !cameraRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), cameraRef.current);

    // 1. Check Tags first
    if (tagsGroupRef.current) {
      const tagHits = raycaster.intersectObjects(tagsGroupRef.current.children, true);
      if (tagHits.length > 0) {
        const hitSprite = tagHits[0].object as THREE.Sprite;
        if (hitSprite.userData && typeof hitSprite.userData.tagIndex === 'number') {
          handleStartMovingTag(hitSprite.userData.tagIndex);
          return;
        } else if (hitSprite.userData?.isDistantTag && hitSprite.userData.targetNodeId) {
          setSelectedNodeId(hitSprite.userData.targetNodeId);
          setSelectedTagIndex(null);
          setSelectedArrowIndex(null);
          return;
        }
      }
    }

    // 2. Check Arrows
    if (arrowsGroupRef.current) {
      const arrowHits = raycaster.intersectObjects(arrowsGroupRef.current.children, true);
      if (arrowHits.length > 0) {
        const hitSprite = arrowHits[0].object as THREE.Sprite;
        if (hitSprite.userData && typeof hitSprite.userData.index === 'number') {
          handleStartMovingArrow(hitSprite.userData.index);
          return;
        }
      }
    }
  };

  const handleStartMovingArrow = (idx: number) => {
    const targetConn = currentConnections[idx];
    if (!targetConn) return;
    pushUndo();
    setSelectedArrowIndex(idx);
    setSelectedTagIndex(null);
    setOriginalArrowBackup(JSON.parse(JSON.stringify(targetConn)));
    setIsMovingArrow(true);
    setMovingArrowIndex(idx);
    setStatusBanner({
      type: 'success',
      text: `🎯 Reposition Mode Active! Move your cursor to the desired position on the road/floor and Click to Place arrow #${manualNumbers[targetConn.targetId] || targetConn.targetId}.`,
    });
  };

  const handleCancelMovingArrow = () => {
    if (movingArrowIndex !== null && originalArrowBackup) {
      const updated = [...currentConnections];
      updated[movingArrowIndex] = originalArrowBackup;
      setConnectionsMap((prev) => ({ ...prev, [selectedNodeId]: updated }));
    }
    setIsMovingArrow(false);
    setMovingArrowIndex(null);
    setOriginalArrowBackup(null);
    setStatusBanner(null);
  };

  const handleStartMovingTag = (idx: number) => {
    const currentTags = placeTagsMap[selectedNodeId] || [];
    const targetTag = currentTags[idx];
    if (!targetTag) return;
    pushUndo();
    setSelectedTagIndex(idx);
    setSelectedArrowIndex(null);
    setOriginalTagBackup(JSON.parse(JSON.stringify(targetTag)));
    setIsMovingTag(true);
    setMovingTagIndex(idx);
    setStatusBanner({
      type: 'success',
      text: `🎯 Reposition Tag Active! Move your cursor to any spot on the building/wall/screen, then Click to Place "${targetTag.text}".`,
    });
  };

  const handleCancelMovingTag = () => {
    if (movingTagIndex !== null && originalTagBackup) {
      const currentTags = [...(placeTagsMap[selectedNodeId] || [])];
      currentTags[movingTagIndex] = originalTagBackup;
      setPlaceTagsMap((prev) => ({ ...prev, [selectedNodeId]: currentTags }));
    }
    setIsMovingTag(false);
    setMovingTagIndex(null);
    setOriginalTagBackup(null);
    setStatusBanner(null);
  };

  // Rotate Arrow
  const handleRotateArrow = (deltaDegrees: number) => {
    if (selectedArrowIndex === null) return;
    pushUndo();
    const updated = [...currentConnections];
    const cur = updated[selectedArrowIndex];
    if (cur) {
      let newBearing = ((cur.worldBearing ?? cur.heading ?? 0) + deltaDegrees) % 360;
      if (newBearing < 0) newBearing += 360;
      updated[selectedArrowIndex] = { ...cur, heading: newBearing, worldBearing: newBearing };
      setConnectionsMap((prev) => ({ ...prev, [selectedNodeId]: updated }));
      lonRef.current = newBearing;
    }
  };

  // Nudge / Move Arrow in 3D (Yaw & Pitch)
  const handleNudgeArrow = (deltaYaw: number, deltaPitch: number) => {
    if (selectedArrowIndex === null) return;
    pushUndo();
    const updated = [...currentConnections];
    const cur = updated[selectedArrowIndex];
    if (cur) {
      let newYaw = ((cur.worldBearing ?? cur.heading ?? 0) + deltaYaw) % 360;
      if (newYaw < 0) newYaw += 360;
      const defaultPitch = cur.direction === 'u-turn' || (cur as any).type === 'backward' || (cur.direction as string) === 'backward' ? -36 : -25;
      let newPitch = Math.max(-75, Math.min(45, ((cur as any).pitch ?? defaultPitch) + deltaPitch));
      updated[selectedArrowIndex] = { ...cur, heading: newYaw, worldBearing: newYaw, pitch: newPitch } as any;
      setConnectionsMap((prev) => ({ ...prev, [selectedNodeId]: updated }));
    }
  };

  // Set Arrow Pitch / Elevation directly with exact degrees
  const handleSetArrowPitch = (newPitch: number) => {
    if (selectedArrowIndex === null) return;
    pushUndo();
    const updated = [...currentConnections];
    const cur = updated[selectedArrowIndex];
    if (cur) {
      const clampedPitch = Math.max(-75, Math.min(45, Math.round(newPitch)));
      updated[selectedArrowIndex] = { ...cur, pitch: clampedPitch } as any;
      setConnectionsMap((prev) => ({ ...prev, [selectedNodeId]: updated }));
      setStatusBanner({
        type: 'success',
        text: `✓ Arrow pitch set to ${clampedPitch}°!`,
      });
      setTimeout(() => setStatusBanner(null), 2500);
    }
  };

  const handlePointArrowAtCurrentView = () => {
    if (selectedArrowIndex === null) return;
    pushUndo();
    const updated = [...currentConnections];
    const cur = updated[selectedArrowIndex];
    if (cur) {
      const liveAngle = getCurrentYaw();
      updated[selectedArrowIndex] = { ...cur, heading: liveAngle, worldBearing: liveAngle };
      setConnectionsMap((prev) => ({ ...prev, [selectedNodeId]: updated }));
      setStatusBanner({ type: 'success', text: `✓ Arrow aimed at current view (${liveAngle}°)!` });
      setTimeout(() => setStatusBanner(null), 3000);
    }
  };

  // Auto-save place tags to database and sync in-memory graph
  const autoSavePlaceTags = async (updatedTagsMap: Record<string, CustomPlaceTag[]>) => {
    setPlaceTagsMap(updatedTagsMap);
    setCustomPlaceTags(updatedTagsMap);
    try {
      const overrides: GraphOverrideData = {
        nodeImageOverrides: imageOverrides,
        customConnections: connectionsMap,
        nodeHeadingOverrides: {},
        verifiedStatusOverrides: {},
        manualNumbers,
        customPanoramaOrder: panoramaOrder,
        customRouteOverrides: routeOverrides,
        customPlaceTags: updatedTagsMap,
        nodeCameraAngles,
        lastSavedAt: new Date().toISOString(),
        savedBy: 'Place Label Studio',
      };
      await ApiService.saveGraphOverrides(overrides, 'Place Label Studio');
      applyGraphOverrides(overrides);
      refreshData();
      window.dispatchEvent(new CustomEvent('campnav:tags_updated'));
    } catch (e) {
      console.warn('Auto-save place tags failed:', e);
    }
  };

  // Nudge / Move Tag in 3D (Yaw, Pitch, Distance)
  const handleNudgeTag = (deltaYaw: number, deltaPitch: number, deltaDist: number = 0) => {
    if (selectedTagIndex === null) return;
    pushUndo();
    const currentTags = [...(placeTagsMap[selectedNodeId] || [])];
    const cur = currentTags[selectedTagIndex];
    if (cur) {
      let newYaw = ((cur.yaw ?? 0) + deltaYaw) % 360;
      if (newYaw < 0) newYaw += 360;
      let newPitch = Math.max(-80, Math.min(80, (cur.pitch ?? 0) + deltaPitch));
      let newDist = Math.max(50, Math.min(450, (cur.distance ?? 180) + deltaDist));
      currentTags[selectedTagIndex] = {
        ...cur,
        yaw: newYaw,
        pitch: newPitch,
        distance: newDist,
      };
      const nextMap = { ...placeTagsMap, [selectedNodeId]: currentTags };
      autoSavePlaceTags(nextMap);
    }
  };

  const handlePointTagAtCurrentView = () => {
    if (selectedTagIndex === null) return;
    pushUndo();
    const currentTags = [...(placeTagsMap[selectedNodeId] || [])];
    const cur = currentTags[selectedTagIndex];
    if (cur) {
      const curYaw = getCurrentYaw();
      const curPitch = getCurrentPitch();
      currentTags[selectedTagIndex] = {
        ...cur,
        yaw: curYaw,
        pitch: curPitch,
      };
      const nextMap = { ...placeTagsMap, [selectedNodeId]: currentTags };
      autoSavePlaceTags(nextMap);
      setStatusBanner({ type: 'success', text: `✓ Tag "${cur.text}" placed at center of current view (${curYaw}°, ${curPitch}°)!` });
      setTimeout(() => setStatusBanner(null), 3000);
    }
  };

  const handleUpdateTagText = (index: number, newText: string) => {
    pushUndo();
    const currentTags = [...(placeTagsMap[selectedNodeId] || [])];
    if (currentTags[index]) {
      currentTags[index] = { ...currentTags[index], text: newText };
      const nextMap = { ...placeTagsMap, [selectedNodeId]: currentTags };
      autoSavePlaceTags(nextMap);
    }
  };

  const handleUpdateTagColor = (index: number, newColor: string) => {
    pushUndo();
    const currentTags = [...(placeTagsMap[selectedNodeId] || [])];
    if (currentTags[index]) {
      currentTags[index] = { ...currentTags[index], color: newColor };
      const nextMap = { ...placeTagsMap, [selectedNodeId]: currentTags };
      autoSavePlaceTags(nextMap);
    }
  };

  const handleUpdateTagCategory = (index: number, newCat: PlaceTagCategory) => {
    pushUndo();
    const currentTags = [...(placeTagsMap[selectedNodeId] || [])];
    if (currentTags[index]) {
      currentTags[index] = { ...currentTags[index], category: newCat };
      const nextMap = { ...placeTagsMap, [selectedNodeId]: currentTags };
      autoSavePlaceTags(nextMap);
    }
  };

  const handleUpdateTagVisibleFromDistance = (index: number, visible: boolean) => {
    pushUndo();
    const currentTags = [...(placeTagsMap[selectedNodeId] || [])];
    if (currentTags[index]) {
      currentTags[index] = { ...currentTags[index], visibleFromDistance: visible };
      const nextMap = { ...placeTagsMap, [selectedNodeId]: currentTags };
      autoSavePlaceTags(nextMap);
    }
  };

  const handleDeleteTag = (index: number) => {
    pushUndo();
    const currentTags = [...(placeTagsMap[selectedNodeId] || [])];
    const updated = currentTags.filter((_, i) => i !== index);
    const nextMap = { ...placeTagsMap, [selectedNodeId]: updated };
    autoSavePlaceTags(nextMap);
    setSelectedTagIndex(null);
    setStatusBanner({ type: 'success', text: '✓ Tag deleted.' });
    setTimeout(() => setStatusBanner(null), 3000);
  };

  const handleAddTagSubmit = () => {
    if (!newTagText.trim()) {
      alert('Please enter a title or text for the tag.');
      return;
    }
    pushUndo();
    const newTag: CustomPlaceTag = {
      id: `tag_${selectedNodeId}_${Date.now()}`,
      text: newTagText.trim(),
      yaw: getCurrentYaw(),
      pitch: getCurrentPitch(),
      distance: newTagDistance || 180,
      color: newTagColor || '#38bdf8',
      category: newTagCategory,
      visibleFromDistance: newTagVisibleFromDistance,
    };
    const currentTags = placeTagsMap[selectedNodeId] || [];
    const nextMap = {
      ...placeTagsMap,
      [selectedNodeId]: [...currentTags, newTag],
    };
    autoSavePlaceTags(nextMap);
    setIsAddTagOpen(false);
    setNewTagText('');
    setSelectedTagIndex(currentTags.length);
    setSelectedArrowIndex(null);
    setStatusBanner({
      type: 'success',
      text: `✓ Tag "${newTag.text}" added and saved! Drag or nudge it into place.`,
    });
    setTimeout(() => setStatusBanner(null), 3500);
  };

  // Pointer Handling for 360 Viewer with Raycast Click Selection and Repositioning
  const handlePointerDown = (e: React.PointerEvent) => {
    if (isMovingTag && movingTagIndex !== null) {
      const currentTags = placeTagsMap[selectedNodeId] || [];
      const placedTag = currentTags[movingTagIndex];
      const finalYaw = placedTag?.yaw ?? liveYaw;
      const finalPitch = placedTag?.pitch ?? 0;
      setIsMovingTag(false);
      setMovingTagIndex(null);
      setOriginalTagBackup(null);
      autoSavePlaceTags(placeTagsMap);
      setStatusBanner({
        type: 'success',
        text: `✓ Tag "${placedTag?.text}" saved at Yaw: ${finalYaw}°, Pitch: ${finalPitch}°!`,
      });
      setTimeout(() => setStatusBanner(null), 3500);
      return;
    }

    if (isMovingArrow && movingArrowIndex !== null) {
      // Click drops the arrow in place!
      const placedConn = currentConnections[movingArrowIndex];
      const finalYaw = placedConn?.worldBearing ?? placedConn?.heading ?? liveYaw;
      const finalPitch = (placedConn as any)?.pitch ?? -28;
      setIsMovingArrow(false);
      setMovingArrowIndex(null);
      setOriginalArrowBackup(null);
      setStatusBanner({
        type: 'success',
        text: `✓ Arrow repositioned to Heading: ${finalYaw}°, Pitch: ${finalPitch}°!`,
      });
      setTimeout(() => setStatusBanner(null), 3500);
      return;
    }

    isUserInteractingRef.current = true;
    onPointerDownPointerXRef.current = e.clientX;
    onPointerDownPointerYRef.current = e.clientY;
    onPointerDownLonRef.current = lonRef.current;
    onPointerDownLatRef.current = latRef.current;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isMovingTag && movingTagIndex !== null && containerRef.current && cameraRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), cameraRef.current);
      const dir = raycaster.ray.direction.clone().normalize();

      const pitchRad = Math.asin(Math.max(-1, Math.min(1, dir.y)));
      const pitchDeg = Math.round(THREE.MathUtils.radToDeg(pitchRad));

      let yawRad = Math.atan2(dir.x, dir.z);
      let yawDeg = Math.round(THREE.MathUtils.radToDeg(yawRad));
      yawDeg = ((yawDeg % 360) + 360) % 360;

      const currentTags = [...(placeTagsMap[selectedNodeId] || [])];
      if (currentTags[movingTagIndex]) {
        currentTags[movingTagIndex] = {
          ...currentTags[movingTagIndex],
          yaw: yawDeg,
          pitch: pitchDeg,
        };
        setPlaceTagsMap((prev) => ({
          ...prev,
          [selectedNodeId]: currentTags,
        }));
      }
      return;
    }

    if (isMovingArrow && movingArrowIndex !== null && containerRef.current && cameraRef.current) {
      // Live calculate exact yaw and pitch under mouse cursor
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), cameraRef.current);
      const dir = raycaster.ray.direction.clone().normalize();

      const pitchRad = Math.asin(Math.max(-1, Math.min(1, dir.y)));
      const pitchDeg = Math.round(THREE.MathUtils.radToDeg(pitchRad));

      let yawRad = Math.atan2(dir.x, dir.z);
      let yawDeg = Math.round(THREE.MathUtils.radToDeg(yawRad));
      yawDeg = ((yawDeg % 360) + 360) % 360;

      const updated = [...currentConnections];
      if (updated[movingArrowIndex]) {
        updated[movingArrowIndex] = {
          ...updated[movingArrowIndex],
          heading: yawDeg,
          worldBearing: yawDeg,
          pitch: pitchDeg,
        } as any;
        setConnectionsMap((prev) => ({
          ...prev,
          [selectedNodeId]: updated,
        }));
      }
      return;
    }

    if (!isUserInteractingRef.current) return;
    lonRef.current = (onPointerDownPointerXRef.current - e.clientX) * 0.2 + onPointerDownLonRef.current;
    latRef.current = Math.max(10, Math.min(72, (e.clientY - onPointerDownPointerYRef.current) * 0.2 + onPointerDownLatRef.current));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isUserInteractingRef.current = false;
    const curYaw = Math.round(((lonRef.current % 360) + 360) % 360);
    const curPitch = Math.round(latRef.current);
    setLiveYaw(curYaw);
    setLivePitch(curPitch);

    if (isMovingArrow || isMovingTag) return;

    const deltaX = Math.abs(e.clientX - onPointerDownPointerXRef.current);
    const deltaY = Math.abs(e.clientY - onPointerDownPointerYRef.current);

    // If it was a quick click rather than a drag, raycast against 3D tags and arrows
    if (deltaX < 6 && deltaY < 6 && containerRef.current && cameraRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), cameraRef.current);

      // Check Tags first
      if (tagsGroupRef.current) {
        const tagHits = raycaster.intersectObjects(tagsGroupRef.current.children, true);
        if (tagHits.length > 0) {
          const hitSprite = tagHits[0].object as THREE.Sprite;
          if (hitSprite.userData && typeof hitSprite.userData.tagIndex === 'number') {
            setSelectedTagIndex(hitSprite.userData.tagIndex);
            setSelectedArrowIndex(null);
            return;
          }
        }
      }

      // Check Arrows
      if (arrowsGroupRef.current) {
        const intersects = raycaster.intersectObjects(arrowsGroupRef.current.children, true);
        if (intersects.length > 0) {
          const hitSprite = intersects[0].object as THREE.Sprite;
          if (hitSprite.userData && typeof hitSprite.userData.index === 'number') {
            const arrowIdx = hitSprite.userData.index;
            // If already selected, navigate directly into it facing forward along arrow direction!
            if (selectedArrowIndex === arrowIdx) {
              const arrow = currentConnections[arrowIdx];
              if (arrow && arrow.targetId) {
                const fromId = selectedNodeId;
                const toId = arrow.targetId;
                let nextFacing = arrow.targetYaw ?? arrow.initialViewerYaw;
                if (nextFacing === undefined) {
                  nextFacing = computeDebuggerArrivalFacing(fromId, toId, arrow.heading ?? liveYaw);
                }
                lonRef.current = nextFacing;
                latRef.current = 0;
                setLiveYaw(Math.round(nextFacing));
                setLivePitch(0);
                setSelectedNodeId(toId);
                setSelectedArrowIndex(null);
                setArrivalCalibration({ fromNodeId: fromId, targetNodeId: toId });
                return;
              }
            }
            setSelectedArrowIndex(arrowIdx);
            setSelectedTagIndex(null);
            return;
          }
        }
      }
    }
  };

  // Assign Manual Route Number
  const handleManualNumberChange = (nodeId: string, value: string) => {
    pushUndo();
    setManualNumbers((prev) => ({ ...prev, [nodeId]: value }));
  };

  // Add Arrow / Connection
  const handleAddArrowSubmit = () => {
    if (!newTargetId) {
      alert('Please select a destination panorama.');
      return;
    }

    pushUndo();

    const targetNode = CAMPUS_GRAPH_MAP.get(newTargetId);
    const newConn: PanoramaConnection = {
      id: `conn_${selectedNodeId}_${newTargetId}_${Date.now()}`,
      targetId: newTargetId,
      direction: newDirection,
      type: newDirection === 'u-turn' ? 'backward' : 'forward',
      heading: newYaw,
      worldBearing: newYaw,
      distanceMeters: 12,
      walkingCost: 12,
      confirmed: true,
      verified: true,
      isEstimated: false,
      instruction: `Continue to ${manualNumbers[newTargetId] || targetNode?.filename || newTargetId}`,
    } as any;

    const currentList = connectionsMap[selectedNodeId] || [];
    const updatedMap = {
      ...connectionsMap,
      [selectedNodeId]: [...currentList.filter((c) => c.targetId !== newTargetId), newConn],
    };

    // If Bidirectional, add reciprocal connection
    if (isBidirectional) {
      const returnYaw = (newYaw + 180) % 360;
      const reciprocalConn: PanoramaConnection = {
        id: `conn_${newTargetId}_${selectedNodeId}_${Date.now()}`,
        targetId: selectedNodeId,
        direction: newDirection === 'straight' ? 'straight' : newDirection === 'left' ? 'right' : 'left',
        type: 'backward',
        heading: returnYaw,
        worldBearing: returnYaw,
        distanceMeters: 12,
        walkingCost: 12,
        confirmed: true,
        verified: true,
        isEstimated: false,
        instruction: `Return to ${currentManualNumber}`,
      } as any;

      const targetList = connectionsMap[newTargetId] || [];
      updatedMap[newTargetId] = [...targetList.filter((c) => c.targetId !== selectedNodeId), reciprocalConn];
    }

    setConnectionsMap(updatedMap);
    setIsAddArrowOpen(false);
    setNewTargetId('');
  };

  // Compute forward facing direction when transitioning to target node
  const computeDebuggerArrivalFacing = (fromId: string, toId: string, fallbackYaw: number): number => {
    // 1. Check if outgoing connection has explicit targetYaw
    const fromConns = connectionsMap[fromId] || [];
    const outgoing = fromConns.find((c) => c.targetId === toId);
    if (outgoing && outgoing.targetYaw !== undefined) {
      return outgoing.targetYaw;
    }
    // 2. Check if destination photo has a default angle set
    if (nodeCameraAngles[toId] !== undefined) {
      return nodeCameraAngles[toId];
    }
    // 3. Fallback to reverse arrow calculation
    const targetConns = connectionsMap[toId] || [];
    const retConn = targetConns.find((c) => c.targetId === fromId);
    if (retConn) {
      const straightAhead = ((retConn.heading ?? 0) + 180) % 360;
      const continuing = targetConns.filter((c) => c.targetId !== fromId);
      if (continuing.length > 0) {
        let best = continuing[0];
        let minDiff = 360;
        for (const c of continuing) {
          const h = c.heading ?? 0;
          const diff = Math.abs(((h - straightAhead + 540) % 360) - 180);
          if (diff < minDiff) {
            minDiff = diff;
            best = c;
          }
        }
        if (minDiff <= 75) return best.heading ?? straightAhead;
      }
      return straightAhead;
    }
    return fallbackYaw;
  };

  // Lock arrival angle for an arrow (from fromId -> toId) using current mouse camera view
  const handleLockArrivalAngle = async (fromId: string, toId: string, yaw: number) => {
    pushUndo();
    const roundedYaw = Math.round(((yaw % 360) + 360) % 360);
    const fromList = connectionsMap[fromId] || [];
    const updated = fromList.map((c) => {
      if (c.targetId === toId) {
        return {
          ...c,
          targetYaw: roundedYaw,
          initialViewerYaw: roundedYaw,
        };
      }
      return c;
    });
    const nextConnsMap = {
      ...connectionsMap,
      [fromId]: updated,
    };
    setConnectionsMap(nextConnsMap);

    // 1. Immediately update in-memory graph
    const node = CAMPUS_GRAPH_MAP.get(fromId);
    if (node) {
      node.connections = updated;
    }

    // 2. Persist to server in background and sync NavigationContext
    try {
      const overrides: GraphOverrideData = {
        nodeImageOverrides: imageOverrides,
        customConnections: nextConnsMap,
        nodeHeadingOverrides: {},
        verifiedStatusOverrides: {},
        manualNumbers,
        customPanoramaOrder: panoramaOrder,
        customRouteOverrides: routeOverrides,
        customPlaceTags: placeTagsMap,
        nodeCameraAngles,
        lastSavedAt: new Date().toISOString(),
        savedBy: 'Camera Angle Studio',
      };
      await ApiService.saveGraphOverrides(overrides, 'Camera Angle Studio');
      applyGraphOverrides(overrides);
      refreshData();
    } catch (e) {
      console.warn('Auto-save arrow arrival angle failed:', e);
    }

    setStatusBanner({
      type: 'success',
      text: `✓ Arrow #${manualNumbers[fromId] || fromId} ➔ #${manualNumbers[toId] || toId} arrival camera facing locked at ${roundedYaw}° (Active on site)!`,
    });
    setTimeout(() => setStatusBanner(null), 4000);
  };

  // Set default entry camera angle for a photo
  const handleSetPhotoDefaultAngle = async (nodeId: string, yaw: number) => {
    pushUndo();
    const roundedYaw = Math.round(((yaw % 360) + 360) % 360);
    const nextAngles = {
      ...nodeCameraAngles,
      [nodeId]: roundedYaw,
    };
    setNodeCameraAngles(nextAngles);

    // 1. Immediately update in-memory graph
    const node = CAMPUS_GRAPH_MAP.get(nodeId);
    if (node) {
      (node as any).defaultCameraYaw = roundedYaw;
    }

    // 2. Persist to server in background and sync NavigationContext
    try {
      const overrides: GraphOverrideData = {
        nodeImageOverrides: imageOverrides,
        customConnections: connectionsMap,
        nodeHeadingOverrides: {},
        verifiedStatusOverrides: {},
        manualNumbers,
        customPanoramaOrder: panoramaOrder,
        customRouteOverrides: routeOverrides,
        customPlaceTags: placeTagsMap,
        nodeCameraAngles: nextAngles,
        lastSavedAt: new Date().toISOString(),
        savedBy: 'Camera Angle Studio',
      };
      await ApiService.saveGraphOverrides(overrides, 'Camera Angle Studio');
      applyGraphOverrides(overrides);
      refreshData();
    } catch (e) {
      console.warn('Auto-save photo default angle failed:', e);
    }

    setStatusBanner({
      type: 'success',
      text: `✓ Photo #${manualNumbers[nodeId] || nodeId} default camera angle set to ${roundedYaw}° (Active on site)!`,
    });
    setTimeout(() => setStatusBanner(null), 4000);
  };

  // Reset default entry camera angle for a photo to auto
  const handleResetPhotoDefaultAngle = async (nodeId: string) => {
    pushUndo();
    const nextAngles = { ...nodeCameraAngles };
    delete nextAngles[nodeId];
    setNodeCameraAngles(nextAngles);

    const node = CAMPUS_GRAPH_MAP.get(nodeId);
    if (node) {
      delete (node as any).defaultCameraYaw;
    }

    try {
      const overrides: GraphOverrideData = {
        nodeImageOverrides: imageOverrides,
        customConnections: connectionsMap,
        nodeHeadingOverrides: {},
        verifiedStatusOverrides: {},
        manualNumbers,
        customPanoramaOrder: panoramaOrder,
        customRouteOverrides: routeOverrides,
        customPlaceTags: placeTagsMap,
        nodeCameraAngles: nextAngles,
        lastSavedAt: new Date().toISOString(),
        savedBy: 'Camera Angle Studio',
      };
      await ApiService.saveGraphOverrides(overrides, 'Camera Angle Studio');
      applyGraphOverrides(overrides);
      refreshData();
    } catch (e) {
      console.warn('Auto-save reset photo angle failed:', e);
    }

    setStatusBanner({
      type: 'success',
      text: `✓ Reset photo #${manualNumbers[nodeId] || nodeId} camera angle to auto (Active on site).`,
    });
    setTimeout(() => setStatusBanner(null), 3000);
  };

  // Test transition from fromId to toId facing arrivalYaw
  const handleTestArrivalPreview = (fromId: string, toId: string, arrivalYaw: number) => {
    setSelectedNodeId(fromId);
    setStatusBanner({
      type: 'success',
      text: `Testing transition: Jumping from #${manualNumbers[fromId] || fromId} ➔ #${manualNumbers[toId] || toId}...`,
    });
    setTimeout(() => {
      lonRef.current = arrivalYaw;
      latRef.current = 0;
      setLiveYaw(Math.round(arrivalYaw));
      setLivePitch(0);
      setSelectedNodeId(toId);
      setArrivalCalibration({ fromNodeId: fromId, targetNodeId: toId });
      setStatusBanner({
        type: 'success',
        text: `✓ Arrived at #${manualNumbers[toId] || toId} facing ${Math.round(arrivalYaw)}°!`,
      });
      setTimeout(() => setStatusBanner(null), 3000);
    }, 400);
  };

  // Quick Connect to Next Panorama (#N -> #N+1) along current camera facing
  const handleQuickConnectNext = () => {
    const currentIndex = orderedNodes.findIndex((n) => n.id === selectedNodeId);
    if (currentIndex === -1 || currentIndex >= orderedNodes.length - 1) {
      alert('This is the last panorama in the list.');
      return;
    }
    const nextNode = orderedNodes[currentIndex + 1];
    pushUndo();

    const forwardYaw = getCurrentYaw();
    const returnYaw = (forwardYaw + 180) % 360;

    const newConn: PanoramaConnection = {
      id: `conn_${selectedNodeId}_${nextNode.id}_${Date.now()}`,
      targetId: nextNode.id,
      direction: 'straight',
      type: 'forward',
      heading: forwardYaw,
      worldBearing: forwardYaw,
      distanceMeters: 12,
      walkingCost: 12,
      confirmed: true,
      verified: true,
      isEstimated: false,
      instruction: `Continue to ${manualNumbers[nextNode.id] || nextNode.filename || nextNode.id}`,
    } as any;

    const reciprocalConn: PanoramaConnection = {
      id: `conn_${nextNode.id}_${selectedNodeId}_${Date.now()}`,
      targetId: selectedNodeId,
      direction: 'straight',
      type: 'backward',
      heading: returnYaw,
      worldBearing: returnYaw,
      distanceMeters: 12,
      walkingCost: 12,
      confirmed: true,
      verified: true,
      isEstimated: false,
      instruction: `Return to ${currentManualNumber}`,
    } as any;

    const currentList = connectionsMap[selectedNodeId] || [];
    const targetList = connectionsMap[nextNode.id] || [];

    setConnectionsMap((prev) => ({
      ...prev,
      [selectedNodeId]: [...currentList.filter((c) => c.targetId !== nextNode.id), newConn],
      [nextNode.id]: [...targetList.filter((c) => c.targetId !== selectedNodeId), reciprocalConn],
    }));

    setStatusBanner({
      type: 'success',
      text: `✓ Connected #${currentManualNumber} ➔ #${manualNumbers[nextNode.id] || nextNode.id} at ${forwardYaw}°! Stepping forward...`,
    });
    setTimeout(() => setStatusBanner(null), 3000);

    // Auto-advance camera to next node facing straight ahead along the path!
    const forwardFacing = computeDebuggerArrivalFacing(selectedNodeId, nextNode.id, forwardYaw);
    lonRef.current = forwardFacing;
    latRef.current = 0;
    setLiveYaw(Math.round(forwardFacing));
    setLivePitch(0);
    setSelectedNodeId(nextNode.id);
  };



  // Replace Image
  const handleConfirmImageReplacement = (targetFilename: string, targetPath: string) => {
    pushUndo();
    setImageOverrides((prev) => ({
      ...prev,
      [selectedNodeId]: {
        image: targetFilename,
        imagePath: targetPath,
        filename: targetFilename,
      },
    }));
    setIsReplaceImageOpen(false);
  };

  // Swap Images
  const handleConfirmImageSwap = () => {
    if (!swapTargetNodeId || swapTargetNodeId === selectedNodeId) return;
    pushUndo();

    const nodeA = CAMPUS_GRAPH_MAP.get(selectedNodeId);
    const nodeB = CAMPUS_GRAPH_MAP.get(swapTargetNodeId);

    const imgA = imageOverrides[selectedNodeId] || {
      image: nodeA?.image || '',
      imagePath: nodeA?.imagePath || '',
      filename: nodeA?.filename || '',
    };
    const imgB = imageOverrides[swapTargetNodeId] || {
      image: nodeB?.image || '',
      imagePath: nodeB?.imagePath || '',
      filename: nodeB?.filename || '',
    };

    setImageOverrides((prev) => ({
      ...prev,
      [selectedNodeId]: imgB,
      [swapTargetNodeId]: imgA,
    }));

    setIsSwapImagesOpen(false);
    setSwapTargetNodeId('');
  };

  // Save to Production Database
  const handleSaveToDatabase = async () => {
    setIsSaving(true);
    try {
      const overrides: GraphOverrideData = {
        nodeImageOverrides: imageOverrides,
        customConnections: connectionsMap,
        nodeHeadingOverrides: {},
        verifiedStatusOverrides: {},
        manualNumbers,
        customPanoramaOrder: panoramaOrder,
        customRouteOverrides: routeOverrides,
        customPlaceTags: placeTagsMap,
        nodeCameraAngles,
        lastSavedAt: new Date().toISOString(),
        savedBy: 'Manual Route Mapper',
      };

      await ApiService.saveGraphOverrides(overrides, 'Manual Route Mapper');
      applyGraphOverrides(overrides);
      setCustomPlaceTags(placeTagsMap);
      window.dispatchEvent(new CustomEvent('campnav:tags_updated'));

      setSavedDraft({
        manualNumbers: JSON.parse(JSON.stringify(manualNumbers)),
        connectionsMap: JSON.parse(JSON.stringify(connectionsMap)),
        imageOverrides: JSON.parse(JSON.stringify(imageOverrides)),
        panoramaOrder: [...panoramaOrder],
        placeTagsMap: JSON.parse(JSON.stringify(placeTagsMap)),
        nodeCameraAngles: JSON.parse(JSON.stringify(nodeCameraAngles)),
      });

      setUndoStack([]);
      setShowSaveReview(false);
      setStatusBanner({ type: 'success', text: '✓ Manual numbering, connections, camera angles, custom routes, and place tags successfully saved!' });
      setTimeout(() => setStatusBanner(null), 4000);
      refreshData();
    } catch (err: any) {
      setStatusBanner({ type: 'error', text: `Save failed: ${err.message}` });
    } finally {
      setIsSaving(false);
    }
  };

  // 1-Click Publish to Render Live Deployment
  const handlePublishToRender = async () => {
    setIsDeploying(true);
    setDeployResult(null);
    try {
      // 0. Ensure Admin authentication is active
      if (!sessionStorage.getItem('campnav_admin_token')) {
        const pinToUse = adminPinInput.trim();
        try {
          const auth = await ApiService.adminLogin(pinToUse);
          if (auth?.token) {
            sessionStorage.setItem('campnav_admin_auth', 'true');
            sessionStorage.setItem('campnav_admin_token', auth.token);
            if (auth.user) {
              sessionStorage.setItem('campnav_admin_user', JSON.stringify(auth.user));
            }
            setIsAdminAuthenticated(true);
          }
        } catch {
          // If auto-login fails, let the request proceed so standard error handling displays the message
        }
      }

      // 1. Ensure current in-memory edits are saved to DB first
      const currentOverrides: GraphOverrideData = {
        nodeImageOverrides: imageOverrides,
        customConnections: connectionsMap,
        nodeHeadingOverrides: {},
        verifiedStatusOverrides: {},
        manualNumbers,
        customPanoramaOrder: panoramaOrder,
        customRouteOverrides: routeOverrides,
        customPlaceTags: placeTagsMap,
        nodeCameraAngles,
        lastSavedAt: new Date().toISOString(),
        savedBy: 'Manual Route Mapper',
      };
      await ApiService.saveGraphOverrides(currentOverrides, 'Manual Route Mapper');
      applyGraphOverrides(currentOverrides);
      setCustomPlaceTags(placeTagsMap);

      setSavedDraft({
        manualNumbers: JSON.parse(JSON.stringify(manualNumbers)),
        connectionsMap: JSON.parse(JSON.stringify(connectionsMap)),
        imageOverrides: JSON.parse(JSON.stringify(imageOverrides)),
        panoramaOrder: [...panoramaOrder],
        placeTagsMap: JSON.parse(JSON.stringify(placeTagsMap)),
        nodeCameraAngles: JSON.parse(JSON.stringify(nodeCameraAngles)),
      });

      // 2. Trigger deploy endpoint
      const result = await ApiService.deployToRender(deployHookUrl || undefined);
      setDeployResult({
        success: true,
        message: result.message || 'Successfully deployed to Render!',
        commitHash: result.commitHash,
      });
      setStatusBanner({
        type: 'success',
        text: '🚀 Changes pushed to GitHub! Render is deploying to campnav-b3om.onrender.com (live in ~1-2 min).',
      });
      refreshPublishStatus();
      refreshData();
    } catch (err: any) {
      setDeployResult({
        success: false,
        message: err.message || 'Failed to deploy to Render',
      });
    } finally {
      setIsDeploying(false);
    }
  };

  // Export Database JSON Backup
  const handleExportDatabase = () => {
    window.open(ApiService.getDatabaseExportUrl(), '_blank');
  };

  // Import Database JSON Backup
  const handleImportDatabase = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setImportStatus('Reading backup file...');
      const text = await file.text();
      const json = JSON.parse(text);
      await ApiService.importDatabase(json);
      setImportStatus('✓ Database imported successfully! Reloading...');
      setTimeout(() => {
        window.location.reload();
      }, 1200);
    } catch (err: any) {
      setImportStatus(`Import failed: ${err.message}`);
    }
  };

  // Filtered Panoramas List
  const orderedNodes = useMemo(() => {
    const nodeMap = new Map(CAMPUS_GRAPH.map((n) => [n.id, n]));
    const result: CampusPanoramaNode[] = [];
    panoramaOrder.forEach((id) => {
      const n = nodeMap.get(id);
      if (n) {
        result.push(n);
        nodeMap.delete(id);
      }
    });
    nodeMap.forEach((n) => result.push(n));
    return result;
  }, [panoramaOrder]);

  const filteredNodes = useMemo(() => {
    return orderedNodes.filter((n) => {
      if (activeAreaFilter !== 'ALL' && n.area !== activeAreaFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const num = (manualNumbers[n.id] || '').toLowerCase();
        const tags = placeTagsMap[n.id] || [];
        const tagMatch = tags.some(
          (t) =>
            t.text.toLowerCase().includes(q) ||
            (t.roomId && t.roomId.toLowerCase().includes(q)) ||
            (t.description && t.description.toLowerCase().includes(q))
        );
        return n.id.toLowerCase().includes(q) || n.filename.toLowerCase().includes(q) || num.includes(q) || tagMatch;
      }
      return true;
    });
  }, [orderedNodes, activeAreaFilter, searchQuery, manualNumbers, placeTagsMap]);

  const selectedArrow =
    selectedArrowIndex !== null && currentConnections && currentConnections[selectedArrowIndex]
      ? currentConnections[selectedArrowIndex]
      : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0b1329] text-slate-100 overflow-hidden select-none font-sans">
      {/* ── Top Header Toolbar ── */}
      <div className="px-4 py-2.5 bg-[#0f172a]/95 border-b border-slate-800 flex items-center justify-between flex-shrink-0 backdrop-blur-xl gap-2 overflow-x-auto no-scrollbar shadow-xs">
        <div className="flex items-center gap-3 min-w-0 flex-shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-sky-500 to-indigo-600 text-white shadow-md shadow-blue-500/25 flex items-center justify-center flex-shrink-0">
            <Navigation size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xs sm:text-sm font-black text-white tracking-tight truncate">
                {activeDebuggerTab === 'DIRECTIONS'
                  ? 'Navigation Direction Verification Studio'
                  : activeDebuggerTab === 'VALIDATION'
                  ? 'Direction Validation & Integrity Dashboard'
                  : 'Manual Panorama Numbering & Arrow Studio'}
              </h1>
              <span className={`text-[9px] sm:text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border flex-shrink-0 shadow-xs ${
                activeDebuggerTab === 'DIRECTIONS'
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : activeDebuggerTab === 'VALIDATION'
                  ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                  : 'bg-blue-500/15 text-blue-300 border-blue-500/30'
              }`}>
                {activeDebuggerTab === 'DIRECTIONS'
                  ? 'Voice Direction'
                  : activeDebuggerTab === 'VALIDATION'
                  ? 'Audit Mode'
                  : 'Mapping Mode'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 truncate hidden md:block font-medium mt-0.5">
              {activeDebuggerTab === 'DIRECTIONS'
                ? 'Review AI suggestions, inspect 360° road/stairs, and verify natural human directions.'
                : activeDebuggerTab === 'VALIDATION'
                ? 'Comprehensive campus-wide direction integrity, arrow alignment, and conflict audit.'
                : 'Assign numbers and manually place arrows. Direct precision mapping.'}
            </p>
          </div>
        </div>

        {/* Section Mode Switcher Tabs */}
        <div className="flex items-center bg-slate-900/90 border border-slate-800 p-1 rounded-2xl gap-1 flex-shrink-0 shadow-inner">
          <button
            onClick={() => setActiveDebuggerTab('PANORAMAS')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeDebuggerTab === 'PANORAMAS'
                ? 'bg-gradient-to-r from-blue-600 to-sky-600 text-white shadow-md shadow-blue-500/20'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <span>🗺️ Panoramas</span>
          </button>
          <button
            onClick={() => setActiveDebuggerTab('DIRECTIONS')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeDebuggerTab === 'DIRECTIONS'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-500/20'
                : 'text-slate-400 hover:text-emerald-300 hover:bg-white/5'
            }`}
          >
            <span>🧭 Directions</span>
            {unverifiedDirectionsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-emerald-950 text-emerald-300 font-extrabold border border-emerald-500/40">
                {unverifiedDirectionsCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveDebuggerTab('VALIDATION')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeDebuggerTab === 'VALIDATION'
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/20'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <span>🛡️ Validation</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsFacultyPresenceOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-750 text-slate-200 hover:text-white text-xs font-bold transition-all flex items-center gap-1.5 border border-slate-700/80 shadow-xs active:scale-95"
            title="Manage Faculty Accounts, Presence, and Status Sync"
          >
            <ShieldCheck size={13} className="text-blue-400" />
            <span>Faculty Presence</span>
          </button>

          <button
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
              undoStack.length > 0
                ? 'bg-slate-800/90 hover:bg-slate-750 text-slate-200 border-slate-700/80 shadow-xs active:scale-95'
                : 'bg-slate-900/60 text-slate-600 border-slate-800/40 cursor-not-allowed'
            }`}
          >
            <Undo2 size={13} />
            Undo ({undoStack.length})
          </button>

          <button
            onClick={() => {
              setIsPathBuilderOpen(true);
              handleInitPathBuilder(builderStartId, builderTargetId);
            }}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 border border-violet-400/30 shadow-md shadow-indigo-500/20 hover:scale-[1.02] active:scale-95"
            title="Design and customize exact step-by-step navigation paths for any destination"
          >
            <Compass size={13} />
            Custom Route Builder
          </button>

          <button
            onClick={() => setIsRouteTesterOpen(true)}
            className="px-3.5 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-750 text-sky-400 hover:text-sky-300 text-xs font-bold transition-all flex items-center gap-1.5 border border-slate-700/80 shadow-xs hover:scale-[1.02] active:scale-95"
          >
            <Play size={13} />
            Test Route
          </button>

          <button
            onClick={() => {
              setReportFilterNodeId(null);
              setIsReportsModalOpen(true);
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border shadow-xs ${
              unreadReportsCount > 0
                ? 'bg-rose-950/80 hover:bg-rose-900 text-rose-300 border-rose-500/50 shadow-rose-950/30 animate-pulse'
                : 'bg-slate-800/90 hover:bg-slate-750 text-slate-200 border-slate-700/80'
            }`}
            title="Inspect user bug reports, wrong navigation, and missing place feedback"
          >
            <AlertCircle size={13} className={unreadReportsCount > 0 ? 'text-rose-400' : 'text-slate-400'} />
            <span>Reports</span>
            {unreadReportsCount > 0 ? (
              <span className="px-1.5 py-0.2 text-[10px] font-black rounded-full bg-rose-500 text-white animate-pulse">
                {unreadReportsCount}
              </span>
            ) : (
              allReports.length > 0 && (
                <span className="text-[10px] text-slate-500">({allReports.length})</span>
              )
            )}
          </button>

          <button
            onClick={() => setShowSaveReview(true)}
            disabled={!hasChanges || isSaving}
            className={`px-4 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-md ${
              hasChanges
                ? 'bg-gradient-to-r from-blue-600 to-sky-500 hover:from-blue-500 hover:to-sky-400 text-white shadow-blue-500/25 hover:scale-[1.02] active:scale-95'
                : 'bg-slate-900 text-slate-600 border border-slate-800/50 cursor-not-allowed'
            }`}
          >
            <Save size={13} />
            {hasChanges ? 'Save Changes' : 'Saved'}
          </button>

          <button
            onClick={() => {
              setIsPublishModalOpen(true);
              refreshPublishStatus();
            }}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black transition-all flex items-center gap-1.5 shadow-md shadow-emerald-600/25 border border-emerald-400/30 hover:scale-[1.02] active:scale-95"
            title="Publish updates directly to Render live website (campnav-b3om.onrender.com)"
          >
            <Globe size={13} className="text-emerald-200" />
            Publish to Render
            {publishStatus?.uncommittedChanges && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse ml-0.5" title="Unpublished changes pending" />
            )}
          </button>

          <button
            onClick={() => {
              refreshData();
              onClose();
            }}
            className="p-2 rounded-xl bg-slate-800/90 hover:bg-slate-750 text-slate-400 hover:text-white border border-slate-700/80 transition-all ml-1 active:scale-95"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {statusBanner && (
        <div
          className={`px-4 py-2 text-xs font-bold flex items-center gap-2 ${
            statusBanner.type === 'success' ? 'bg-emerald-950 text-emerald-300' : 'bg-red-950 text-red-300'
          }`}
        >
          {statusBanner.type === 'success' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
          <span>{statusBanner.text}</span>
        </div>
      )}

      {/* ── Main Workspace ── */}
      {activeDebuggerTab === 'VALIDATION' ? (
        <DirectionValidationDashboard
          nodes={orderedNodes}
          connectionsMap={connectionsMap}
          manualNumbers={manualNumbers}
          onInspectConnection={(fromId, targetId) => {
            setSelectedNodeId(fromId);
            setActiveDebuggerTab('DIRECTIONS');
          }}
          onExportReport={() => {
            const csv = generateDirectionReportCsv(orderedNodes, connectionsMap, manualNumbers);
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `campnav-direction-audit-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        />
      ) : activeDebuggerTab === 'DIRECTIONS' ? (
        <NavigationDirectionVerificationTab
          nodes={orderedNodes}
          connectionsMap={connectionsMap}
          selectedNodeId={selectedNodeId}
          onSelectNode={(nodeId) => setSelectedNodeId(nodeId)}
          onUpdateConnectionDirection={handleUpdateConnectionDirection}
          onBatchApplyAnalyses={handleBatchApplyAnalyses}
          manualNumbers={manualNumbers}
          onAimCamera={(yaw, pitch) => {
            lonRef.current = yaw;
            latRef.current = pitch ?? 0;
            setLiveYaw(Math.round(yaw));
            setLivePitch(Math.round(pitch ?? 0));
          }}
          onTestConnection={(fromId, toId, arrivalYaw) => {
            handleTestArrivalPreview(fromId, toId, arrivalYaw ?? 0);
          }}
          onOpenRouteTester={(startId, targetId) => {
            setBuilderStartId(startId);
            setBuilderTargetId(targetId);
            setIsRouteTesterOpen(true);
          }}
          onClose={() => setActiveDebuggerTab('PANORAMAS')}
        >
          {/* ── Real 360° Panorama Viewer Canvas Slot ── */}
          <div className="flex-1 flex flex-col bg-slate-900/60 border border-white/10 rounded-2xl p-3 gap-3 min-h-0 relative">
            <div
              ref={containerRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onDoubleClick={handleDoubleClick}
              className="flex-1 rounded-xl overflow-hidden relative border min-h-[300px] transition-all cursor-grab active:cursor-grabbing border-white/10"
            >
              <div ref={mountRef} className="absolute inset-0 w-full h-full pointer-events-none" />
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-8 h-8 border border-sky-400/40 rounded-full flex items-center justify-center">
                  <div className="w-1 h-1 bg-sky-400 rounded-full"></div>
                </div>
              </div>
              <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-auto z-20">
                <div className="px-3 py-1.5 rounded-full bg-slate-950/85 backdrop-blur-md border border-white/10 text-xs font-mono text-sky-300">
                  Compass Yaw: <strong ref={compassYawTextRef}>{liveYaw}°</strong>
                </div>
              </div>
            </div>
          </div>
        </NavigationDirectionVerificationTab>
      ) : (
        <div className="flex-1 flex gap-3 p-3 min-h-0 overflow-hidden">
          {/* ── LEFT PANEL: Panorama List & Numbering Table ── */}
          <div className="w-80 flex flex-col bg-slate-900/80 backdrop-blur-md border border-slate-800/90 rounded-2xl p-3 gap-2.5 overflow-hidden flex-shrink-0 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-slate-200 tracking-wide">Panorama Nodes ({filteredNodes.length})</span>
              <span className="text-[10px] text-slate-400 font-medium">Edit # directly</span>
            </div>

            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Filter by #, ID, or file..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950/90 border border-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 transition outline-none"
              />
            </div>

            <div
              className="flex-1 overflow-y-auto flex flex-col gap-1.5 pr-1"
              onScroll={(e) => {
                const target = e.currentTarget;
                if (target.scrollTop + target.clientHeight >= target.scrollHeight - 150) {
                  setDisplayLimit((prev) => Math.min(prev + 40, filteredNodes.length));
                }
              }}
            >
              {filteredNodes.slice(0, displayLimit).map((n, idx) => {
                const isSelected = n.id === selectedNodeId;
                const manualNum = manualNumbers[n.id] || `${idx + 1}`;
                const conns = connectionsMap[n.id] || [];
                const img = imageOverrides[n.id]?.imagePath || n.imagePath;

                return (
                  <div
                    key={n.id}
                    onClick={() => {
                      setSelectedNodeId(n.id);
                      setSelectedArrowIndex(null);
                    }}
                    className={`p-2.5 rounded-xl border text-xs transition-all cursor-pointer flex flex-col gap-2 ${
                      isSelected
                        ? 'bg-gradient-to-r from-blue-950/70 to-indigo-950/50 border-blue-500 shadow-md shadow-blue-500/15'
                        : 'bg-slate-950/60 hover:bg-slate-900/80 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        {/* Editable Manual Number Box */}
                        <input
                          type="text"
                          value={manualNum}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => handleManualNumberChange(n.id, e.target.value)}
                          className="w-12 text-center bg-slate-900 border border-blue-500/40 rounded-lg py-0.5 text-xs font-black text-amber-300 focus:border-amber-400 outline-none shadow-xs"
                          title="Edit manual route number (e.g. 1, 1.1, 2)"
                        />
                        <span className="font-mono text-[10px] text-slate-400 truncate">{n.id}</span>
                      </div>

                      <div className="flex items-center gap-1">
                        {(reportsByNodeId[n.id] || []).length > 0 && (
                          <span
                            className="text-[9px] px-1.5 py-0.5 rounded bg-rose-950/90 border border-rose-500/50 text-rose-300 font-extrabold flex items-center gap-0.5"
                            title={`${(reportsByNodeId[n.id] || []).length} user report(s) on this panorama node`}
                          >
                            ⚠️ {(reportsByNodeId[n.id] || []).length}
                          </span>
                        )}
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30 font-bold">
                          {conns.length} arrows
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <img
                        src={img}
                        alt={n.filename}
                        loading="lazy"
                        decoding="async"
                        className="w-12 h-8 object-cover rounded-lg bg-slate-900 border border-slate-800 shadow-xs"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-slate-300 truncate font-semibold">{n.filename}</p>
                        <div className="flex items-center gap-1 mt-0.5 overflow-x-auto scrollbar-none">
                          {conns.length === 0 ? (
                            <span className="text-[9px] text-slate-600 italic">No connections</span>
                          ) : (
                            conns.map((c) => (
                              <span key={c.targetId} className="text-[9px] font-mono px-1.5 py-0.5 rounded-md bg-slate-900 text-emerald-400 border border-emerald-500/25 font-bold">
                                ➔{manualNumbers[c.targetId] || c.targetId}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {filteredNodes.length > displayLimit && (
                <button
                  onClick={() => setDisplayLimit((prev) => Math.min(prev + 50, filteredNodes.length))}
                  className="py-2 text-[10px] text-blue-400 hover:text-blue-300 font-bold text-center bg-slate-950/80 hover:bg-slate-900 rounded-xl border border-slate-800 my-1 transition shadow-xs"
                >
                  Load more nodes ({filteredNodes.length - displayLimit} remaining)...
                </button>
              )}
            </div>
          </div>

        {/* ── CENTER: Real 360° Panorama Viewer & Arrow Controls ── */}
        <div className="flex-1 flex flex-col bg-slate-900/80 backdrop-blur-md border border-slate-800/90 rounded-2xl p-3 gap-3 min-h-0 shadow-sm">
          {/* Active Node Info Banner */}
          <div className="flex items-center justify-between bg-slate-900/95 backdrop-blur-md border border-slate-800/90 rounded-2xl px-4 py-2.5 flex-shrink-0 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400 font-semibold">Manual Route Number:</span>
                <input
                  type="text"
                  value={currentManualNumber}
                  onChange={(e) => handleManualNumberChange(selectedNodeId, e.target.value)}
                  className="w-16 text-center bg-slate-950 border border-amber-500/50 rounded-xl py-1 text-sm font-black text-amber-300 outline-none focus:border-amber-400 shadow-xs"
                />
              </div>

              <div className="text-xs flex items-center gap-2">
                <span className="font-mono text-blue-400 font-bold text-xs bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 rounded-lg">{currentNode.id}</span>
                <span className="text-slate-300 font-medium">{currentNode.filename}</span>

                {currentReportsForNode.length > 0 && (
                  <button
                    onClick={() => {
                      setReportFilterNodeId(selectedNodeId);
                      setIsReportsModalOpen(true);
                    }}
                    className="px-2.5 py-0.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/50 text-[11px] font-black flex items-center gap-1.5 transition-all animate-pulse ml-2"
                    title="Click to inspect user reports filed on this panorama"
                  >
                    <AlertCircle size={12} className="text-rose-400" />
                    <span>{currentReportsForNode.length} {currentReportsForNode.length === 1 ? 'Report' : 'Reports'}</span>
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsReplaceImageOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-750 text-xs font-bold text-slate-200 border border-slate-700/80 shadow-xs transition hover:scale-[1.02] active:scale-95 flex items-center gap-1.5"
                title="Change the photo file for this node"
              >
                <ImageIcon size={13} />
                Replace Image
              </button>

              <button
                onClick={() => setIsSwapImagesOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-750 text-xs font-bold text-slate-200 border border-slate-700/80 shadow-xs transition hover:scale-[1.02] active:scale-95 flex items-center gap-1.5"
                title="Swap photos with another node"
              >
                <ArrowLeftRight size={13} />
                Swap Images
              </button>

              <button
                onClick={() => {
                  setNewTagText('');
                  setNewTagColor('#38bdf8');
                  setIsAddTagOpen(true);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black shadow-md shadow-emerald-500/20 border border-emerald-400/30 transition hover:scale-[1.02] active:scale-95 flex items-center gap-1.5"
                title="Add a 3D Place/Building Tag to this panorama"
              >
                <Tag size={13} />
                + Add Tag
              </button>

              <button
                onClick={() => {
                  setNewYaw(getCurrentYaw());
                  setIsAddArrowOpen(true);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 hover:from-blue-500 hover:to-sky-400 text-white text-xs font-black shadow-md shadow-blue-500/25 border border-blue-400/30 transition hover:scale-[1.02] active:scale-95 flex items-center gap-1.5"
                title="Add custom arrow with specific direction and target"
              >
                <Plus size={14} />
                + Add Arrow
              </button>

              <button
                onClick={handleQuickConnectNext}
                className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs font-black shadow-md shadow-indigo-500/20 border border-indigo-400/30 transition hover:scale-[1.02] active:scale-95 flex items-center gap-1.5"
                title="Aim camera along the road and click: automatically links to next photo and moves forward!"
              >
                <ArrowRight size={14} />
                Quick Connect Next ➔
              </button>
            </div>
          </div>

          {/* 360 Canvas Viewport */}
          <div
            ref={containerRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onDoubleClick={handleDoubleClick}
            className={`flex-1 rounded-2xl overflow-hidden relative border min-h-[300px] transition-all shadow-inner ${
              isMovingArrow
                ? 'cursor-crosshair border-blue-400 ring-4 ring-blue-500/30'
                : isMovingTag
                ? 'cursor-crosshair border-emerald-400 ring-4 ring-emerald-500/30'
                : 'cursor-grab active:cursor-grabbing border-slate-800/80'
            }`}
          >
            {/* Dedicated Three.js canvas mount container */}
            <div ref={mountRef} className="absolute inset-0 w-full h-full pointer-events-none" />

            {/* Moving Tag Live Overlay Banner */}
            {isMovingTag && movingTagIndex !== null && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-amber-500 text-slate-950 px-5 py-2.5 rounded-2xl shadow-2xl animate-pulse font-black text-xs sm:text-sm border-2 border-white pointer-events-auto">
                <Move size={18} />
                <span>Move cursor to place tag on building • Click anywhere to Lock Place</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCancelMovingTag();
                  }}
                  className="px-2.5 py-1 rounded-xl bg-slate-950 text-white text-xs hover:bg-slate-800 ml-2"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Moving Arrow Live Overlay Banner */}
            {isMovingArrow && movingArrowIndex !== null && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-sky-500 text-slate-950 px-5 py-2.5 rounded-2xl shadow-2xl animate-pulse font-black text-xs sm:text-sm border-2 border-white pointer-events-auto">
                <Move size={18} />
                <span>Move cursor to position arrow on road • Click anywhere to Place</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCancelMovingArrow();
                  }}
                  className="px-2.5 py-1 rounded-xl bg-slate-950 text-white text-xs hover:bg-slate-800 ml-2"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* On-Screen Tag Quick Edit Gizmo Toolbar */}
            {selectedTag && selectedTagIndex !== null && !isMovingTag && (
              <div
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2 bg-slate-950/95 backdrop-blur-xl border border-emerald-500/50 shadow-2xl rounded-2xl p-3 max-w-2xl w-[94%] pointer-events-auto animate-scale-up"
              >
                {/* Header */}
                <div className="w-full flex items-center justify-between border-b border-white/10 pb-1.5 px-1 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="p-1 rounded-lg bg-emerald-500/20 text-emerald-400 flex-shrink-0">
                      <Tag size={14} />
                    </span>
                    <span className="text-xs font-black text-white truncate max-w-[180px] sm:max-w-xs md:max-w-sm" title={selectedTag?.text || ''}>
                      Editing Tag: "{selectedTag?.text || ''}"
                    </span>
                    {(() => {
                      const detected = detectBlockFromTag(selectedTag?.text || '');
                      if (detected) {
                        return (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-bold flex-shrink-0 flex items-center gap-1" title={detected.fullName}>
                            <span>{detected.icon}</span>
                            <span>{detected.fullName}</span>
                          </span>
                        );
                      }
                      return null;
                    })()}
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold flex-shrink-0">
                      Yaw: {selectedTag?.yaw ?? 0}° • Pitch: {selectedTag?.pitch ?? 0}° • Dist: {selectedTag?.distance || 180}u
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedTagIndex(null)}
                    className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 flex-shrink-0"
                    title="Close tag editor"
                  >
                    <X size={15} />
                  </button>
                </div>

                {/* Controls */}
                <div className="w-full grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
                  {/* Tag Text & Color */}
                  <div className="flex flex-col gap-1.5 bg-slate-900/80 p-2 rounded-xl border border-white/5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Text & Color</span>
                    <input
                      type="text"
                      value={selectedTag?.text || ''}
                      onChange={(e) => handleUpdateTagText(selectedTagIndex, e.target.value)}
                      className="w-full bg-slate-950 border border-emerald-500/40 rounded-lg px-2 py-1 text-xs text-white font-bold outline-none focus:border-emerald-400"
                    />
                    <div className="flex items-center gap-1 pt-1">
                      {['#38bdf8', '#10b981', '#f59e0b', '#a855f7', '#f43f5e', '#ffffff'].map((c) => (
                        <button
                          key={c}
                          onClick={() => handleUpdateTagColor(selectedTagIndex, c)}
                          style={{ backgroundColor: c }}
                          className={`w-5 h-5 rounded-full border transition-all ${
                            (selectedTag?.color || '#38bdf8') === c ? 'ring-2 ring-white scale-110' : 'border-black/40'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Drag & Move */}
                  <div className="flex flex-col gap-1 bg-slate-900/80 p-2 rounded-xl border border-white/5 justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                      <Move size={11} className="text-amber-400" /> Interactive Move
                    </span>
                    <button
                      onClick={() => handleStartMovingTag(selectedTagIndex)}
                      className="w-full py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-md flex items-center justify-center gap-1.5"
                    >
                      <Crosshair size={13} />
                      Drag on Building
                    </button>
                    <button
                      onClick={handlePointTagAtCurrentView}
                      className="w-full py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-black text-[10px] flex items-center justify-center gap-1"
                    >
                      Aim at Current View
                    </button>
                  </div>

                  {/* 4-Way Nudge */}
                  <div className="flex flex-col gap-1 bg-slate-900/80 p-2 rounded-xl border border-white/5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Nudge (Yaw / Pitch)</span>
                    <div className="grid grid-cols-2 gap-1">
                      <button
                        onClick={() => handleNudgeTag(-5, 0)}
                        className="py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[10px]"
                      >
                        ⬅️ Left
                      </button>
                      <button
                        onClick={() => handleNudgeTag(5, 0)}
                        className="py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[10px]"
                      >
                        ➡️ Right
                      </button>
                      <button
                        onClick={() => handleNudgeTag(0, 4)}
                        className="py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[10px]"
                      >
                        ⬆️ Up
                      </button>
                      <button
                        onClick={() => handleNudgeTag(0, -4)}
                        className="py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[10px]"
                      >
                        ⬇️ Down
                      </button>
                    </div>
                  </div>

                  {/* Depth & Delete */}
                  <div className="flex flex-col gap-1 bg-slate-900/80 p-2 rounded-xl border border-white/5 justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Depth & Delete</span>
                    <div className="grid grid-cols-2 gap-1">
                      <button
                        onClick={() => handleNudgeTag(0, 0, -20)}
                        className="py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[10px]"
                      >
                        🔍 Closer
                      </button>
                      <button
                        onClick={() => handleNudgeTag(0, 0, 20)}
                        className="py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[10px]"
                      >
                        🔭 Further
                      </button>
                    </div>
                    <button
                      onClick={() => handleDeleteTag(selectedTagIndex)}
                      className="w-full py-1 rounded-lg bg-red-600/30 hover:bg-red-600 text-red-300 hover:text-white font-bold text-[10px] flex items-center justify-center gap-1 transition-colors border border-red-500/30"
                    >
                      <Trash2 size={12} /> Delete Tag
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* On-Screen Arrow Quick Edit Gizmo Toolbar */}
            {selectedArrow && selectedArrowIndex !== null && !isMovingArrow && (
              <div
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2 bg-slate-950/95 backdrop-blur-xl border border-sky-500/50 shadow-2xl rounded-2xl p-3 max-w-xl w-[94%] pointer-events-auto animate-scale-up"
              >
                {/* Bar Header */}
                <div className="w-full flex items-center justify-between border-b border-white/10 pb-1.5 px-1">
                  <div className="flex items-center gap-2">
                    <span className="p-1 rounded-lg bg-sky-500/20 text-sky-400">
                      <Edit3 size={14} />
                    </span>
                    <span className="text-xs font-black text-white">
                      Editing Arrow ➔ #{manualNumbers[selectedArrow?.targetId] || selectedArrow?.targetId || ''}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-bold">
                      Heading: {selectedArrow?.worldBearing ?? selectedArrow?.heading ?? 0}° • Pitch: {(selectedArrow as any)?.pitch ?? -28}°
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedArrowIndex(null)}
                    className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10"
                    title="Close editor"
                  >
                    <X size={15} />
                  </button>
                </div>

                {/* Control Rows */}
                <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  {/* Column 1: Rotate Arrow (Yaw / Direction) */}
                  <div className="flex flex-col gap-1.5 bg-slate-900/80 p-2.5 rounded-xl border border-white/5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                        <RotateCw size={11} className="text-sky-400" /> Heading / Direction
                      </span>
                      <span className="text-[10px] font-mono font-black text-sky-300">
                        {selectedArrow?.worldBearing ?? selectedArrow?.heading ?? 0}°
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      <button
                        onClick={() => handleRotateArrow(-15)}
                        className="py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 font-black text-[11px]"
                        title="Rotate Left 15 degrees"
                      >
                        ↺ -15°
                      </button>
                      <button
                        onClick={() => handleRotateArrow(15)}
                        className="py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 font-black text-[11px]"
                        title="Rotate Right 15 degrees"
                      >
                        ↻ +15°
                      </button>
                      <button
                        onClick={handlePointArrowAtCurrentView}
                        className="py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-black text-[10px]"
                        title="Aim arrow directly at your current camera view"
                      >
                        🎯 Aim Here
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      <button
                        onClick={() => handleNudgeArrow(-5, 0)}
                        className="py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[10px]"
                        title="Nudge Left 5°"
                      >
                        ⬅️ Nudge Left
                      </button>
                      <button
                        onClick={() => handleNudgeArrow(5, 0)}
                        className="py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[10px]"
                        title="Nudge Right 5°"
                      >
                        ➡️ Nudge Right
                      </button>
                    </div>
                  </div>

                  {/* Column 2: Elevation & Pitch Degree Control (Move Up / Down with degrees) */}
                  <div className="flex flex-col gap-1.5 bg-slate-900/80 p-2.5 rounded-xl border border-emerald-500/30">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-emerald-400 uppercase flex items-center gap-1">
                        <ArrowUp size={12} /> Arrow Pitch / Elevation
                      </span>
                      <span className="text-[11px] font-mono font-black text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded-md border border-emerald-500/40">
                        {((selectedArrow as any)?.pitch !== undefined
                          ? (selectedArrow as any).pitch
                          : (selectedArrow?.direction === 'u-turn' || (selectedArrow as any)?.type === 'backward' || (selectedArrow?.direction as string) === 'backward' ? -36 : -25))}°
                      </span>
                    </div>

                    {/* Precise Degree Steppers */}
                    <div className="grid grid-cols-4 gap-1">
                      <button
                        onClick={() => handleNudgeArrow(0, -5)}
                        className="py-1 rounded-lg bg-slate-800 hover:bg-emerald-950 text-emerald-300 hover:text-white font-black text-[10px] border border-emerald-500/20"
                        title="Tilt Down 5 degrees"
                      >
                        ⬇️ -5°
                      </button>
                      <button
                        onClick={() => handleNudgeArrow(0, -1)}
                        className="py-1 rounded-lg bg-slate-800 hover:bg-emerald-950 text-emerald-300 hover:text-white font-black text-[10px] border border-emerald-500/20"
                        title="Tilt Down 1 degree"
                      >
                        ⬇️ -1°
                      </button>
                      <button
                        onClick={() => handleNudgeArrow(0, 1)}
                        className="py-1 rounded-lg bg-slate-800 hover:bg-emerald-950 text-emerald-300 hover:text-white font-black text-[10px] border border-emerald-500/20"
                        title="Tilt Up 1 degree"
                      >
                        ⬆️ +1°
                      </button>
                      <button
                        onClick={() => handleNudgeArrow(0, 5)}
                        className="py-1 rounded-lg bg-slate-800 hover:bg-emerald-950 text-emerald-300 hover:text-white font-black text-[10px] border border-emerald-500/20"
                        title="Tilt Up 5 degrees"
                      >
                        ⬆️ +5°
                      </button>
                    </div>

                    {/* Quick Pitch Presets */}
                    <div className="grid grid-cols-3 gap-1 pt-0.5">
                      <button
                        onClick={() => handleSetArrowPitch(-38)}
                        className="py-0.5 px-1 rounded-md bg-slate-800/90 hover:bg-amber-600/40 text-amber-300 text-[9px] font-bold border border-amber-500/30 truncate"
                        title="Stairs Down (-38°)"
                      >
                        Stairs Down (-38°)
                      </button>
                      <button
                        onClick={() => handleSetArrowPitch(-25)}
                        className="py-0.5 px-1 rounded-md bg-slate-800/90 hover:bg-sky-600/40 text-sky-300 text-[9px] font-bold border border-sky-500/30 truncate"
                        title="Floor Normal (-25°)"
                      >
                        Floor (-25°)
                      </button>
                      <button
                        onClick={() => handleSetArrowPitch(-10)}
                        className="py-0.5 px-1 rounded-md bg-slate-800/90 hover:bg-violet-600/40 text-violet-300 text-[9px] font-bold border border-violet-500/30 truncate"
                        title="Stairs Up / High (-10°)"
                      >
                        Upstairs (-10°)
                      </button>
                    </div>

                    {/* Smooth Pitch Range Slider */}
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <span className="text-[9px] text-slate-500 font-mono">-60°</span>
                      <input
                        type="range"
                        min="-60"
                        max="20"
                        step="1"
                        value={
                          (selectedArrow as any)?.pitch !== undefined
                            ? (selectedArrow as any).pitch
                            : (selectedArrow?.direction === 'u-turn' || (selectedArrow as any)?.type === 'backward' || (selectedArrow?.direction as string) === 'backward' ? -36 : -25)
                        }
                        onChange={(e) => handleSetArrowPitch(parseInt(e.target.value, 10))}
                        className="w-full accent-emerald-400 h-1 bg-slate-950 rounded-lg cursor-pointer"
                        title="Drag to smoothly change arrow tilt / elevation degree"
                      />
                      <span className="text-[9px] text-slate-500 font-mono">+20°</span>
                    </div>
                  </div>

                  {/* Column 3: Reposition & Camera Angle Actions */}
                  <div className="flex flex-col gap-1.5 bg-slate-900/80 p-2.5 rounded-xl border border-white/5 justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                      <Sparkles size={11} className="text-amber-400" /> Actions & Positioning
                    </span>
                    <div className="grid grid-cols-1 gap-1.5">
                      <button
                        onClick={() => handleStartMovingArrow(selectedArrowIndex)}
                        className="py-1.5 px-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-lg"
                        title="Drag and reposition arrow directly on the 360 photo"
                      >
                        <Move size={13} /> Interactive Drag & Drop
                      </button>
                      <button
                        onClick={() => {
                          const conn = currentConnections && selectedArrowIndex !== null ? currentConnections[selectedArrowIndex] : null;
                          if (!conn) return;
                          const targetId = conn.targetId;
                          const targetFacing = conn.targetYaw ?? computeDebuggerArrivalFacing(selectedNodeId, targetId, conn.heading ?? liveYaw);
                          lonRef.current = targetFacing;
                          latRef.current = 0;
                          setLiveYaw(Math.round(targetFacing));
                          setLivePitch(0);
                          setSelectedNodeId(targetId);
                          setSelectedArrowIndex(null);
                          setArrivalCalibration({ fromNodeId: selectedNodeId, targetNodeId: targetId });
                        }}
                        className="py-1.5 px-2 rounded-lg bg-gradient-to-r from-cyan-500 to-sky-500 hover:from-cyan-400 hover:to-sky-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-lg"
                        title="Aim arrival camera angle in destination photo"
                      >
                        <Camera size={13} /> Calibrate Arrival Facing
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Arrival Camera Calibration Floating Bar */}
            {arrivalCalibration && arrivalCalibration.targetNodeId === selectedNodeId && (
              <div className="absolute top-14 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 border-2 border-sky-400 backdrop-blur-xl rounded-2xl px-4 py-3 shadow-2xl flex flex-col sm:flex-row items-center gap-3 animate-slide-up max-w-[95vw] pointer-events-auto">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400 shadow-inner">
                    <Compass size={22} className="animate-spin-slow" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-white uppercase tracking-wider">Camera Angle Studio</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-400/40">
                        Arrival from #{manualNumbers[arrivalCalibration.fromNodeId] || arrivalCalibration.fromNodeId}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      Rotate mouse to aim view • Current: <strong className="text-cyan-300 font-mono text-xs">{liveYaw}°</strong>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  <button
                    onClick={() => handleLockArrivalAngle(arrivalCalibration.fromNodeId, selectedNodeId, liveYaw)}
                    className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-400 hover:from-sky-400 hover:to-cyan-300 text-slate-950 text-xs font-black flex items-center gap-1.5 shadow-lg shadow-sky-500/30 transition-all hover:scale-[1.02]"
                    title="Lock current camera view as the arrival angle for this incoming arrow"
                  >
                    <Check size={14} strokeWidth={3} />
                    Set Arrow Arrival View ({liveYaw}°)
                  </button>

                  <button
                    onClick={() => handleSetPhotoDefaultAngle(selectedNodeId, liveYaw)}
                    className="px-3 py-2 rounded-xl bg-emerald-600/90 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg transition-all"
                    title="Set current camera view as this photo's default facing angle"
                  >
                    <Camera size={13} />
                    Set Photo #{currentManualNumber} Default ({liveYaw}°)
                  </button>

                  <button
                    onClick={() => handleTestArrivalPreview(arrivalCalibration.fromNodeId, selectedNodeId, liveYaw)}
                    className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 text-xs font-bold flex items-center gap-1 border border-sky-400/30 shadow"
                    title="Test this transition from the source node"
                  >
                    <Play size={12} fill="currentColor" />
                    Test
                  </button>

                  <button
                    onClick={() => setArrivalCalibration(null)}
                    className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
                    title="Dismiss"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            )}

            {/* Center Reticle */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-8 h-8 border border-sky-400/40 rounded-full flex items-center justify-center">
                <div className="w-1 h-1 bg-sky-400 rounded-full"></div>
              </div>
            </div>

            {/* Viewer Top Toolbar: Compass Yaw + Photo Default Angle */}
            <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-auto z-20">
              <div className="px-3.5 py-1.5 rounded-full bg-slate-950/80 backdrop-blur-xl border border-slate-750 text-xs font-mono text-sky-400 shadow-md">
                Compass Yaw: <strong ref={compassYawTextRef2}>{liveYaw}°</strong>
              </div>

              {/* Photo Default Camera Angle Controller */}
              <div className="flex items-center gap-1.5 bg-slate-950/80 backdrop-blur-xl border border-slate-750 rounded-full px-3.5 py-1 text-xs shadow-md">
                <Camera size={13} className="text-emerald-400" />
                <span className="text-slate-300 font-bold">Photo #{currentManualNumber} Angle:</span>
                <span className="font-mono text-emerald-300 font-bold">
                  {nodeCameraAngles[selectedNodeId] !== undefined ? `${nodeCameraAngles[selectedNodeId]}°` : 'Auto'}
                </span>
                <button
                  onClick={() => handleSetPhotoDefaultAngle(selectedNodeId, liveYaw)}
                  className="ml-1.5 px-3 py-0.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-[10px] transition-all shadow hover:scale-105 active:scale-95"
                  title="Set current camera view angle as this photo's default entry angle"
                >
                  Set to View ({liveYaw}°)
                </button>
                {nodeCameraAngles[selectedNodeId] !== undefined && (
                  <button
                    onClick={() => handleResetPhotoDefaultAngle(selectedNodeId)}
                    className="p-0.5 text-slate-400 hover:text-white"
                    title="Reset photo default angle to auto"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>

            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-slate-950/80 backdrop-blur-xl border border-slate-750/80 text-xs font-medium text-slate-300 shadow-xl pointer-events-none">
              Click any arrow to navigate • Use mouse to aim camera and click "Set Arrival View"
            </div>
          </div>

          {/* Placed Tags List Chips */}
          <div className="flex items-center gap-2 overflow-x-auto p-1.5 flex-shrink-0 bg-slate-900/80 backdrop-blur-md border border-slate-800/80 rounded-2xl px-3 shadow-xs">
            <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
              <Tag size={12} /> Tags ({currentPlaceTags.length}):
            </span>
            {currentPlaceTags.length === 0 ? (
              <span className="text-xs text-slate-500 italic">No custom tags on this node yet</span>
            ) : (
              currentPlaceTags.map((tag, idx) => {
                const isSel = selectedTagIndex === idx;
                const isThisMoving = isMovingTag && movingTagIndex === idx;
                return (
                  <div
                    key={tag.id || idx}
                    onClick={() => {
                      setSelectedTagIndex(idx);
                      setSelectedArrowIndex(null);
                      lonRef.current = tag.yaw ?? 0;
                      latRef.current = tag.pitch ?? 0;
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleStartMovingTag(idx);
                    }}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer shadow-xs ${
                      isThisMoving
                        ? 'bg-amber-500 text-slate-950 ring-2 ring-white shadow-lg animate-pulse'
                        : isSel
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md'
                        : 'bg-slate-950 hover:bg-slate-850 text-emerald-300 border border-emerald-500/30 hover:border-emerald-400'
                    }`}
                    title="Click to select & aim • Double-click to drag"
                  >
                    <Tag size={11} />
                    <span>{tag.text}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartMovingTag(idx);
                      }}
                      className={`p-0.5 rounded transition-colors ml-0.5 ${
                        isSel ? 'hover:bg-emerald-600 text-slate-950' : 'hover:bg-emerald-500/20 text-emerald-400'
                      }`}
                      title="Move tag"
                    >
                      <Move size={11} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteTag(idx);
                      }}
                      className={`p-0.5 rounded transition-colors ${
                        isSel ? 'hover:bg-red-600 text-slate-950 hover:text-white' : 'hover:bg-red-500/20 text-red-400'
                      }`}
                      title="Delete tag"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                );
              })
            )}

            <button
              onClick={() => {
                setNewTagText('');
                setNewTagColor('#38bdf8');
                setIsAddTagOpen(true);
              }}
              className="px-3 py-1 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-1 ml-auto shadow-xs transition hover:scale-105 active:scale-95"
            >
              <Plus size={11} /> Add Tag
            </button>
          </div>

          {/* Placed Arrows List Chips */}
          <div className="flex items-center gap-2 overflow-x-auto p-1.5 flex-shrink-0 bg-slate-900/80 backdrop-blur-md border border-slate-800/80 rounded-2xl px-3 shadow-xs">
            <span className="text-xs font-bold text-slate-400">Placed Arrows ({currentConnections.length}):</span>
            {currentConnections.length === 0 ? (
              <span className="text-xs text-slate-500 italic">No arrows placed on this node yet</span>
            ) : (
              currentConnections.map((conn, idx) => {
                const isSel = selectedArrowIndex === idx;
                const isThisMoving = isMovingArrow && movingArrowIndex === idx;
                const targetLabel = manualNumbers[conn.targetId] || conn.targetId;
                return (
                  <div
                    key={conn.targetId}
                    onClick={() => {
                      setSelectedArrowIndex(idx);
                      setSelectedTagIndex(null);
                      const targetYaw = conn.worldBearing ?? conn.heading ?? 0;
                      lonRef.current = targetYaw;
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleStartMovingArrow(idx);
                    }}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer shadow-xs ${
                      isThisMoving
                        ? 'bg-amber-500 text-slate-950 ring-2 ring-white shadow-lg animate-pulse'
                        : isSel
                        ? 'bg-gradient-to-r from-blue-600 to-sky-500 text-white shadow-md shadow-blue-500/25 border-blue-400'
                        : 'bg-slate-950 hover:bg-slate-850 text-slate-200 border border-slate-750 hover:border-blue-500/50'
                    }`}
                    title="Click to Edit (Rotate & Move) • Double-click to drag"
                  >
                    <Navigation size={12} className="rotate-45" />
                    <span>➔ #{targetLabel}</span>
                    <span className="text-[10px] opacity-75 font-mono">({conn.direction})</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartMovingArrow(idx);
                      }}
                      className={`p-1 rounded-lg transition-colors ml-1 ${
                        isSel ? 'hover:bg-blue-600 text-white' : 'hover:bg-blue-500/20 text-blue-400'
                      }`}
                      title="Move / Reposition this arrow"
                    >
                      <Move size={12} />
                    </button>

                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL: Tag Inspector ── */}
        {selectedTag !== null && selectedTagIndex !== null && (
          <div className="w-80 flex flex-col bg-slate-900/90 border border-emerald-500/50 rounded-2xl p-4 gap-3 overflow-hidden flex-shrink-0 animate-slide-up">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex items-center gap-1.5">
                <Tag size={15} className="text-emerald-400" />
                <h3 className="text-xs font-black text-white">Edit Place Tag</h3>
              </div>
              <button onClick={() => setSelectedTagIndex(null)} className="text-slate-400 hover:text-white">
                <X size={15} />
              </button>
            </div>

            <div className="space-y-3 text-xs flex-1 overflow-y-auto">
              {/* Tag Text */}
              <div className="p-2.5 rounded-xl bg-slate-950 border border-white/10 space-y-1.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Tag Name / Title</span>
                <input
                  type="text"
                  value={selectedTag.text}
                  onChange={(e) => handleUpdateTagText(selectedTagIndex, e.target.value)}
                  className="w-full bg-slate-900 border border-emerald-500/50 rounded-lg px-2.5 py-1.5 text-xs text-white font-bold outline-none focus:border-emerald-400"
                />
              </div>

              {/* Tag Color */}
              <div className="p-2.5 rounded-xl bg-slate-950 border border-white/10 space-y-1.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Border Accent Color</span>
                <div className="grid grid-cols-6 gap-1">
                  {['#38bdf8', '#10b981', '#f59e0b', '#a855f7', '#f43f5e', '#ffffff'].map((c) => (
                    <button
                      key={c}
                      onClick={() => handleUpdateTagColor(selectedTagIndex, c)}
                      style={{ backgroundColor: c }}
                      className={`h-7 rounded-lg border transition-all ${
                        (selectedTag.color || '#38bdf8') === c ? 'ring-2 ring-white scale-105' : 'border-black/40'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Category */}
              <div className="p-2.5 rounded-xl bg-slate-950 border border-white/10 space-y-1.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Category</span>
                <select
                  value={selectedTag.category || 'CLASSROOM'}
                  onChange={(e) => handleUpdateTagCategory(selectedTagIndex, e.target.value as PlaceTagCategory)}
                  className="w-full bg-slate-900 border border-emerald-500/50 rounded-lg px-2 py-1.5 text-xs text-white font-bold outline-none"
                >
                  <option value="CLASSROOM">🎓 Classroom</option>
                  <option value="LAB">🔬 Laboratory</option>
                  <option value="OFFICE">🏛️ Office / Staff</option>
                  <option value="FACILITY">📍 Facility / Service</option>
                  <option value="RESTROOM">🚻 Restroom / Washroom</option>
                  <option value="CANTEEN">🍽️ Canteen / Cafeteria</option>
                  <option value="LANDMARK">⭐ Landmark / Gate</option>
                  <option value="OTHER">📌 Other</option>
                </select>
              </div>

              {/* Distant Corridor Visibility Toggle */}
              <div className="p-2.5 rounded-xl bg-slate-950 border border-white/10 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-white block">Distant Corridor Pin</span>
                  <span className="text-[9px] text-slate-400">Visible from far down hallway</span>
                </div>
                <input
                  type="checkbox"
                  checked={selectedTag.visibleFromDistance !== false}
                  onChange={(e) => handleUpdateTagVisibleFromDistance(selectedTagIndex, e.target.checked)}
                  className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                />
              </div>

              {/* Reposition Mode Button */}
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-emerald-300 flex items-center gap-1.5">
                    <Move size={14} /> Interactive Move
                  </span>
                  <span className="text-[10px] text-slate-400">Aim & Click</span>
                </div>
                <button
                  onClick={() => {
                    if (isMovingTag) handleCancelMovingTag();
                    else handleStartMovingTag(selectedTagIndex);
                  }}
                  className={`w-full py-2 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
                    isMovingTag
                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg animate-pulse'
                      : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg'
                  }`}
                >
                  <Crosshair size={14} />
                  {isMovingTag ? 'Click to Place (or Cancel)' : 'Drag on Building'}
                </button>
                <button
                  onClick={handlePointTagAtCurrentView}
                  className="w-full py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 font-bold text-xs"
                >
                  🎯 Aim at Center of Current View
                </button>
              </div>

              {/* 4-Way Directional Nudge D-Pad */}
              <div className="p-2.5 rounded-xl bg-slate-950 border border-white/10 space-y-2">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Nudge Tag (Yaw & Pitch)</span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => handleNudgeTag(-5, 0)}
                    className="py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 font-bold flex items-center justify-center gap-1 text-xs border border-white/5"
                  >
                    ⬅️ Nudge Left
                  </button>
                  <button
                    onClick={() => handleNudgeTag(5, 0)}
                    className="py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 font-bold flex items-center justify-center gap-1 text-xs border border-white/5"
                  >
                    ➡️ Nudge Right
                  </button>
                  <button
                    onClick={() => handleNudgeTag(0, 4)}
                    className="py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 font-bold flex items-center justify-center gap-1 text-xs border border-white/5"
                  >
                    ⬆️ Higher (Up)
                  </button>
                  <button
                    onClick={() => handleNudgeTag(0, -4)}
                    className="py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 font-bold flex items-center justify-center gap-1 text-xs border border-white/5"
                  >
                    ⬇️ Lower (Down)
                  </button>
                </div>
              </div>

              {/* Distance / Depth Controls */}
              <div className="p-2.5 rounded-xl bg-slate-950 border border-white/10 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Depth / Distance:</span>
                  <span className="font-mono font-bold text-emerald-400">{selectedTag.distance || 180} units</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => handleNudgeTag(0, 0, -20)}
                    className="py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 font-bold text-xs"
                  >
                    🔍 Closer (-20)
                  </button>
                  <button
                    onClick={() => handleNudgeTag(0, 0, 20)}
                    className="py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 font-bold text-xs"
                  >
                    🔭 Further (+20)
                  </button>
                </div>
              </div>

              {/* Delete Tag */}
              <button
                onClick={() => handleDeleteTag(selectedTagIndex)}
                className="w-full py-2 rounded-xl bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white font-bold text-xs transition-colors border border-red-500/30 flex items-center justify-center gap-1.5"
              >
                <Trash2 size={13} />
                Delete Tag
              </button>
            </div>
          </div>
        )}

      </div>
      )}

      {/* ── MODAL: + Add Arrow ── */}
      {isAddArrowOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-sky-500/40 rounded-3xl p-6 max-w-lg w-full shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400">
                  <Plus size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">Add Connection & Arrow</h3>
                  <p className="text-[11px] text-slate-400">From Node #{currentManualNumber} ({selectedNodeId})</p>
                </div>
              </div>
              <button onClick={() => setIsAddArrowOpen(false)} className="text-slate-400 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  1. Target Destination Node
                </label>
                <input
                  type="text"
                  placeholder="Search by manual # or filename..."
                  value={targetSearchQuery}
                  onChange={(e) => setTargetSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white mb-2"
                />

                <div className="max-h-44 overflow-y-auto border border-white/10 rounded-xl p-1 bg-slate-950 flex flex-col gap-1">
                  {CAMPUS_GRAPH.filter((n) => n.id !== selectedNodeId)
                    .filter((n) => {
                      if (!targetSearchQuery) return true;
                      const q = targetSearchQuery.toLowerCase();
                      const num = (manualNumbers[n.id] || '').toLowerCase();
                      return n.id.toLowerCase().includes(q) || n.filename.toLowerCase().includes(q) || num.includes(q);
                    })
                    .map((n) => (
                      <button
                        key={n.id}
                        onClick={() => setNewTargetId(n.id)}
                        className={`p-2 rounded-lg text-left text-xs transition-all flex items-center justify-between ${
                          newTargetId === n.id ? 'bg-sky-600 text-white font-bold' : 'hover:bg-slate-900 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-amber-300">#{manualNumbers[n.id] || n.id}</span>
                          <span className="text-slate-400 truncate max-w-[200px]">{n.filename}</span>
                        </div>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 font-bold uppercase">{n.area}</span>
                      </button>
                    ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">2. Direction</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {([
                    { dir: 'straight', label: 'Straight' },
                    { dir: 'left', label: 'Left' },
                    { dir: 'right', label: 'Right' },
                    { dir: 'u-turn', label: 'Back' },
                  ] as const).map(({ dir, label }) => (
                    <button
                      key={dir}
                      onClick={() => setNewDirection(dir)}
                      className={`py-2 rounded-xl text-xs font-bold transition-all ${
                        newDirection === dir ? 'bg-sky-500 text-slate-950' : 'bg-slate-950 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isBidirectional}
                    onChange={(e) => setIsBidirectional(e.target.checked)}
                    className="accent-sky-500 rounded"
                  />
                  <span>Create Return Connection (Bidirectional ↔)</span>
                </label>

                <span className="text-slate-400 text-xs">Heading: <strong className="text-sky-400 font-mono">{newYaw}°</strong></span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <button onClick={() => setIsAddArrowOpen(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold">
                Cancel
              </button>
              <button
                onClick={handleAddArrowSubmit}
                disabled={!newTargetId}
                className={`px-5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-lg ${
                  newTargetId ? 'bg-sky-500 hover:bg-sky-400 text-slate-950' : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
              >
                <Plus size={14} />
                Place Arrow
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Replace Image ── */}
      {isReplaceImageOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-sky-500/40 rounded-3xl p-6 max-w-xl w-full shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400">
                  <ImageIcon size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">Replace Photo for Node #{currentManualNumber}</h3>
                  <p className="text-[11px] text-slate-400">Select any real 360° image to assign to this node</p>
                </div>
              </div>
              <button onClick={() => setIsReplaceImageOpen(false)} className="text-slate-400 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <input
              type="text"
              placeholder="Search available panorama photos..."
              value={replaceSearchQuery}
              onChange={(e) => setReplaceSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
            />

            <div className="max-h-72 overflow-y-auto grid grid-cols-2 gap-2 p-1">
              {CAMPUS_GRAPH.filter((n) => {
                if (!replaceSearchQuery) return true;
                const q = replaceSearchQuery.toLowerCase();
                return n.filename.toLowerCase().includes(q) || n.id.toLowerCase().includes(q);
              }).map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleConfirmImageReplacement(n.filename, n.imagePath)}
                  className="p-2 rounded-xl bg-slate-950 border border-white/10 hover:border-sky-500 cursor-pointer flex flex-col gap-1 group"
                >
                  <img src={n.imagePath} alt={n.filename} className="w-full h-20 object-cover rounded-lg group-hover:scale-102 transition-transform" />
                  <span className="text-[10px] text-slate-300 font-semibold truncate">{n.filename}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2 border-t border-white/10">
              <button onClick={() => setIsReplaceImageOpen(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Swap Images ── */}
      {isSwapImagesOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-sky-500/40 rounded-3xl p-6 max-w-md w-full shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-black text-white">Swap Photos with Another Node</h3>
              <button onClick={() => setIsSwapImagesOpen(false)} className="text-slate-400 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-400">
                Swap the photo of <strong>Node #{currentManualNumber} ({selectedNodeId})</strong> with:
              </p>

              <select
                value={swapTargetNodeId}
                onChange={(e) => setSwapTargetNodeId(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
              >
                <option value="">-- Select Target Node --</option>
                {CAMPUS_GRAPH.filter((n) => n.id !== selectedNodeId).map((n) => (
                  <option key={n.id} value={n.id}>
                    Node #{manualNumbers[n.id] || n.id} ({n.filename})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <button onClick={() => setIsSwapImagesOpen(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold">
                Cancel
              </button>
              <button
                onClick={handleConfirmImageSwap}
                disabled={!swapTargetNodeId}
                className="px-5 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-black rounded-xl text-xs"
              >
                Confirm Swap
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Save Review Diff (Shows ONLY Changes Just Made) ── */}
      {showSaveReview && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-sky-500/40 rounded-3xl p-6 max-w-lg w-full shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400">
                  <Save size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">Review Pending Changes</h3>
                  <p className="text-[11px] text-slate-400">
                    {pendingDiff.length === 0
                      ? 'No pending changes detected'
                      : `Showing ${pendingDiff.length} change${pendingDiff.length === 1 ? '' : 's'} you just made`}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowSaveReview(false)} className="text-slate-400 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <div className="bg-slate-950 rounded-2xl p-3.5 border border-white/10 max-h-64 overflow-y-auto space-y-2.5 text-xs">
              {pendingDiff.length === 0 ? (
                <div className="py-8 text-center text-slate-400 space-y-2">
                  <CheckCircle2 size={24} className="text-emerald-400 mx-auto" />
                  <p className="font-semibold text-slate-300">All data is already saved & up to date!</p>
                  <p className="text-[10px] text-slate-500">No unsaved changes detected in this editing session.</p>
                </div>
              ) : (
                pendingDiff.map((diff, idx) => (
                  <div key={`${diff.nodeId}_${diff.type}_${idx}`} className="p-2.5 rounded-xl bg-slate-900 border border-white/10 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-amber-300">Node #{diff.nodeNumber}</span>
                        <span className="text-slate-500 text-[10px]">({diff.nodeId})</span>
                      </div>
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${
                        diff.type === 'TAGS'
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                          : diff.type === 'CONNECTIONS'
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          : diff.type === 'MANUAL_NUMBER'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      }`}>
                        {diff.type.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="text-[11px] font-bold text-slate-200">
                      {diff.label}
                    </div>
                    {diff.details.length > 0 && (
                      <div className="pl-2 space-y-0.5 text-[10px] text-slate-400 font-mono">
                        {diff.details.map((d, dIdx) => (
                          <div key={dIdx} className="leading-tight">{d}</div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/10">
              <button
                onClick={() => {
                  setShowSaveReview(false);
                  setIsPublishModalOpen(true);
                  refreshPublishStatus();
                }}
                className="px-3 py-2 bg-emerald-950/70 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
                title="Save & directly open Publish to Render modal"
              >
                <Globe size={13} />
                Publish to Render
              </button>
              <div className="flex gap-2">
                <button onClick={() => setShowSaveReview(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold">
                  Cancel
                </button>
                <button
                  onClick={handleSaveToDatabase}
                  disabled={isSaving || pendingDiff.length === 0}
                  className={`px-5 py-2 font-black rounded-xl text-xs flex items-center gap-1.5 shadow-lg transition-all ${
                    isSaving || pendingDiff.length === 0
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      : 'bg-sky-500 hover:bg-sky-400 text-slate-950 cursor-pointer active:scale-95'
                  }`}
                >
                  <Save size={14} />
                  {isSaving ? 'Saving to Database...' : 'Confirm & Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Route Simulator ── */}
      {isRouteTesterOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-sky-500/40 rounded-3xl p-6 max-w-lg w-full shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-black text-white">Route Walk Simulator</h3>
              <button onClick={() => setIsRouteTesterOpen(false)} className="text-slate-400 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Start Origin Node</label>
                <select
                  value={testStartNodeId}
                  onChange={(e) => setTestStartNodeId(e.target.value)}
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white"
                >
                  {CAMPUS_GRAPH.map((n) => (
                    <option key={n.id} value={n.id}>
                      #{manualNumbers[n.id] || n.id} • {n.filename}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Destination Node</label>
                <select
                  value={testDestNodeId}
                  onChange={(e) => setTestDestNodeId(e.target.value)}
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-white"
                >
                  {CAMPUS_GRAPH.map((n) => (
                    <option key={n.id} value={n.id}>
                      #{manualNumbers[n.id] || n.id} • {n.filename}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={() => {
                const r = findNavigationRoute(testStartNodeId, testDestNodeId, 'Simulator Target');
                setSimulatedRoute(r);
                setSimStepIndex(0);
              }}
              className="w-full py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-black rounded-xl text-xs"
            >
              Compute Walking Path
            </button>

            {simulatedRoute && (
              <div className="bg-slate-950 border border-white/10 rounded-xl p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between text-sky-400 font-bold">
                  <span>Path: {simulatedRoute.pathNodeIds.map((id) => `#${manualNumbers[id] || id}`).join(' ➔ ')}</span>
                  <span>{simulatedRoute.totalDistanceMeters}m</span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-white/10">
                  <button
                    onClick={() => {
                      if (simStepIndex > 0) {
                        const newIdx = simStepIndex - 1;
                        setSimStepIndex(newIdx);
                        setSelectedNodeId(simulatedRoute.pathNodeIds[newIdx]);
                      }
                    }}
                    disabled={simStepIndex <= 0}
                    className="px-3 py-1 bg-slate-800 text-white rounded-lg text-xs font-bold disabled:opacity-50"
                  >
                    ❮ Prev Step
                  </button>

                  <span className="text-slate-300 font-bold">
                    Step {simStepIndex + 1} / {simulatedRoute.pathNodeIds.length}
                  </span>

                  <button
                    onClick={() => {
                      if (simStepIndex < simulatedRoute.pathNodeIds.length - 1) {
                        const newIdx = simStepIndex + 1;
                        setSimStepIndex(newIdx);
                        setSelectedNodeId(simulatedRoute.pathNodeIds[newIdx]);
                      }
                    }}
                    disabled={simStepIndex >= simulatedRoute.pathNodeIds.length - 1}
                    className="px-3 py-1 bg-sky-600 text-white rounded-lg text-xs font-bold disabled:opacity-50"
                  >
                    Next Step ❯
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL: Custom Route Path Builder ── */}
      {isPathBuilderOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-indigo-500/40 rounded-3xl p-6 max-w-2xl w-full shadow-2xl flex flex-col gap-4 max-h-[92vh] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  <Compass size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    Custom Route Path Builder
                    {routeOverrides[`${builderStartId}__${builderTargetId}`] && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                        Custom Path Active
                      </span>
                    )}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Manually define exact step-by-step navigation path sequences between any two locations
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsPathBuilderOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Origin & Destination Selectors */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-shrink-0 bg-slate-950/60 p-3 rounded-2xl border border-white/5">
              <div>
                <label className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block mb-1.5 flex items-center gap-1">
                  <CircleDot size={12} className="text-emerald-400" />
                  1. Starting Origin Node
                </label>
                <select
                  value={builderStartId}
                  onChange={(e) => {
                    const newStart = e.target.value;
                    setBuilderStartId(newStart);
                    handleInitPathBuilder(newStart, builderTargetId);
                  }}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                >
                  {CAMPUS_GRAPH.map((n) => (
                    <option key={n.id} value={n.id}>
                      #{manualNumbers[n.id] || n.id} • {n.filename} ({AREA_LABELS[n.area]})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block mb-1.5 flex items-center gap-1">
                  <MapPin size={12} className="text-rose-400" />
                  2. Destination Target
                </label>
                <select
                  value={builderTargetId}
                  onChange={(e) => {
                    const newTarget = e.target.value;
                    setBuilderTargetId(newTarget);
                    handleInitPathBuilder(builderStartId, newTarget);
                  }}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                >
                  <optgroup label="⭐ Verified Campus Places">
                    {CAMPUS_PLACES.map((p) => (
                      <option key={p.id} value={p.panoramaNodeId}>
                        {p.icon || '📍'} {p.name} (#{manualNumbers[p.panoramaNodeId] || p.panoramaNodeId})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="🌐 All Panorama Nodes">
                    {CAMPUS_GRAPH.map((n) => (
                      <option key={n.id} value={n.id}>
                        #{manualNumbers[n.id] || n.id} • {n.filename}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </div>

            {/* Route Stats & Mode Bar */}
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-indigo-950/40 border border-indigo-500/20 text-xs flex-shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-slate-300 font-bold">
                  Steps: <strong className="text-white">{customPathNodes.length}</strong>
                </span>
                <span className="text-slate-400">•</span>
                <span className="text-slate-300 font-bold">
                  Distance: <strong className="text-white">{customPathNodes.length > 1 ? (customPathNodes.length - 1) * 12 : 0}m</strong>
                </span>
                <span className="text-slate-400">•</span>
                <span className="text-slate-300 font-bold">
                  Est. Time: <strong className="text-white">~{Math.round((customPathNodes.length * 12) / 1.2)}s</strong>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsLiveRecording(!isLiveRecording)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 ${
                    isLiveRecording
                      ? 'bg-rose-500 text-white animate-pulse shadow-md shadow-rose-500/30'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                  title="Click arrows in the 3D viewer behind this modal to live-record your walking route"
                >
                  <Footprints size={12} />
                  {isLiveRecording ? '🔴 Recording Walk...' : 'Record Walk in 3D'}
                </button>

                <button
                  onClick={() => {
                    const autoRoute = findNavigationRoute(builderStartId, builderTargetId, 'Baseline', true, false, undefined);
                    if (autoRoute && autoRoute.pathNodeIds.length > 0) {
                      setCustomPathNodes([...autoRoute.pathNodeIds]);
                      setStatusBanner({ type: 'success', text: '✓ Re-calculated Dijkstra shortest-path baseline.' });
                      setTimeout(() => setStatusBanner(null), 3000);
                    }
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 text-[11px] font-bold flex items-center gap-1"
                  title="Generate Dijkstra shortest path as a template to edit"
                >
                  <Sparkles size={12} />
                  Auto-Fill Baseline
                </button>
              </div>
            </div>

            {/* Step-by-Step Path Sequence List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[160px] max-h-[360px]">
              {customPathNodes.map((nodeId, idx) => {
                const node = CAMPUS_GRAPH_MAP.get(nodeId);
                const isStart = idx === 0;
                const isEnd = idx === customPathNodes.length - 1;
                const nextNodeId = customPathNodes[idx + 1];
                const connToNext = node?.connections.find((c) => c.targetId === nextNodeId);

                // Adjacent candidates to append next
                const connectedTargets = node?.connections || [];

                return (
                  <div
                    key={`${nodeId}_${idx}`}
                    className={`p-3 rounded-2xl border transition-all flex flex-col gap-2 ${
                      isStart
                        ? 'bg-emerald-950/20 border-emerald-500/40'
                        : isEnd
                        ? 'bg-rose-950/20 border-rose-500/40'
                        : 'bg-slate-950/60 border-white/10 hover:border-indigo-500/30'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-7 h-7 rounded-xl flex items-center justify-center font-mono font-black text-xs shadow-md ${
                            isStart
                              ? 'bg-emerald-500 text-slate-950'
                              : isEnd
                              ? 'bg-rose-500 text-white'
                              : 'bg-indigo-600 text-white'
                          }`}
                        >
                          {idx + 1}
                        </div>

                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-amber-300 text-xs">
                              #{manualNumbers[nodeId] || nodeId}
                            </span>
                            <span className="text-white text-xs font-semibold">{node?.filename || nodeId}</span>
                            {isStart && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                                START
                              </span>
                            )}
                            {isEnd && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30">
                                DESTINATION
                              </span>
                            )}
                          </div>
                          {connToNext && (
                            <span className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                              <ArrowRight size={10} className="text-indigo-400" />
                              <span>{connToNext.instruction || `Turn ${connToNext.direction}`}</span>
                              <span className="font-mono text-slate-500">({connToNext.direction})</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setSelectedNodeId(nodeId);
                          }}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold flex items-center gap-1"
                          title="View this panorama in 3D scene"
                        >
                          <Eye size={12} />
                        </button>

                        <button
                          onClick={() => {
                            if (idx > 0) {
                              const updated = [...customPathNodes];
                              const temp = updated[idx - 1];
                              updated[idx - 1] = updated[idx];
                              updated[idx] = temp;
                              setCustomPathNodes(updated);
                            }
                          }}
                          disabled={idx <= 0}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move Earlier in Route"
                        >
                          <ChevronUp size={13} />
                        </button>

                        <button
                          onClick={() => {
                            if (idx < customPathNodes.length - 1) {
                              const updated = [...customPathNodes];
                              const temp = updated[idx + 1];
                              updated[idx + 1] = updated[idx];
                              updated[idx] = temp;
                              setCustomPathNodes(updated);
                            }
                          }}
                          disabled={idx >= customPathNodes.length - 1}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move Later in Route"
                        >
                          <ChevronDown size={13} />
                        </button>

                        <button
                          onClick={() => {
                            if (customPathNodes.length <= 2) {
                              alert('Routes require at least 2 nodes.');
                              return;
                            }
                            setCustomPathNodes(customPathNodes.filter((_, i) => i !== idx));
                          }}
                          disabled={customPathNodes.length <= 2}
                          className="p-1.5 rounded-lg bg-red-950/60 hover:bg-red-900/60 text-red-300 border border-red-500/20 disabled:opacity-30"
                          title="Remove Step from Route"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Fast Connected Next Step Suggester */}
                    {!isEnd && (
                      <div className="pl-10 flex items-center gap-1.5 flex-wrap pt-1 border-t border-white/5 text-[10px]">
                        <span className="text-slate-500 font-semibold">Available arrows from this node:</span>
                        {connectedTargets.map((c) => {
                          const isAlreadyNext = nextNodeId === c.targetId;
                          return (
                            <button
                              key={c.targetId}
                              onClick={() => {
                                const updated = [...customPathNodes];
                                updated.splice(idx + 1, 0, c.targetId);
                                setCustomPathNodes(updated);
                              }}
                              className={`px-2 py-0.5 rounded-md font-mono flex items-center gap-1 transition-all ${
                                isAlreadyNext
                                  ? 'bg-indigo-500/30 text-indigo-200 border border-indigo-400/40 font-bold'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10'
                              }`}
                              title={`Insert #${manualNumbers[c.targetId] || c.targetId} as next step`}
                            >
                              <Plus size={10} />
                              ➔ #{manualNumbers[c.targetId] || c.targetId} ({c.direction})
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Quick Append Node Selector */}
            <div className="flex items-center gap-2 pt-2 border-t border-white/10 flex-shrink-0">
              <span className="text-xs text-slate-400 font-bold whitespace-nowrap">➕ Insert Node:</span>
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    setCustomPathNodes([...customPathNodes, e.target.value]);
                    e.target.value = '';
                  }
                }}
                defaultValue=""
                className="bg-slate-950 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white flex-1"
              >
                <option value="" disabled>
                  Select a panorama node to append to end of route...
                </option>
                {CAMPUS_GRAPH.map((n) => (
                  <option key={n.id} value={n.id}>
                    #{manualNumbers[n.id] || n.id} • {n.filename} ({AREA_LABELS[n.area]})
                  </option>
                ))}
              </select>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-between pt-3 border-t border-white/10 flex-shrink-0">
              <button
                onClick={handleResetCustomRoute}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold transition-all flex items-center gap-1.5 border border-amber-500/20"
                title="Remove custom path override and use auto shortest-path"
              >
                <RotateCcw size={13} />
                Reset Route to Auto
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const r = findNavigationRoute(
                      builderStartId,
                      builderTargetId,
                      'Test Walk',
                      true,
                      false,
                      customPathNodes
                    );
                    setSimulatedRoute(r);
                    setSimStepIndex(0);
                    setIsRouteTesterOpen(true);
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-sky-300 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-sky-500/20"
                >
                  <Play size={13} />
                  Test Walk Route
                </button>

                <button
                  onClick={handleSaveCustomRoute}
                  disabled={isSaving}
                  className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-black rounded-xl text-xs flex items-center gap-1.5 shadow-xl shadow-indigo-500/25"
                >
                  <Save size={14} />
                  {isSaving ? 'Saving Route...' : 'Save Custom Route Path'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Add Custom 3D Place & Building Tag ── */}
      {isAddTagOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-emerald-500/40 rounded-3xl p-6 max-w-md w-full shadow-2xl flex flex-col gap-4">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <Tag size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">Add 3D Place / Building Tag</h3>
                  <p className="text-[11px] text-slate-400">
                    Place a floating 3D text tag on any building or landmark in this panorama
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddTagOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <div className="space-y-3 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold text-slate-300">
                    Tag Text / Room Name:
                  </label>
                  <span className="text-[10px] text-slate-400 font-medium">Quick Christ College Block:</span>
                </div>

                {/* Quick Block Short Code Chips */}
                <div className="flex items-center gap-1.5 mb-2 overflow-x-auto pb-1">
                  {Object.values(CHRIST_COLLEGE_OFFICIAL_BLOCKS).map((b) => (
                    <button
                      key={b.shortCode}
                      type="button"
                      onClick={() => {
                        const existing = newTagText.trim();
                        // If already starts with a 2-letter block code, replace it cleanly
                        const replaced = existing.replace(/^([A-Za-z]{2})[\s\-:_]*/, '');
                        setNewTagText(`${b.shortCode} ${replaced}`.trim());
                      }}
                      className="px-2 py-1 rounded-lg text-[10px] font-black bg-slate-900 border border-sky-500/30 text-sky-300 hover:bg-sky-500 hover:text-slate-950 transition-all flex items-center gap-1 shadow-sm active:scale-95"
                      title={b.fullName}
                    >
                      <span>{b.icon}</span>
                      <span>{b.shortCode}</span>
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  placeholder="e.g. AB 101, SJ 204, MT Seminar Hall, MG CS Lab"
                  value={newTagText}
                  onChange={(e) => setNewTagText(e.target.value)}
                  className="w-full bg-slate-950 border border-emerald-500/40 rounded-xl px-3 py-2 text-sm text-white font-bold outline-none focus:border-emerald-400"
                  autoFocus
                />

                {/* Live Block Detection Badge */}
                {(() => {
                  const detected = detectBlockFromTag(newTagText);
                  if (detected) {
                    return (
                      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-emerald-300 font-bold bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 rounded-lg">
                        <span>{detected.icon}</span>
                        <span>Official Block: {detected.fullName}</span>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1.5">
                  Place Category:
                </label>
                <div className="grid grid-cols-4 gap-1.5 mb-2">
                  {([
                    { cat: 'CLASSROOM', label: '🎓 Class', color: '#3b82f6' },
                    { cat: 'LAB', label: '🔬 Lab', color: '#a855f7' },
                    { cat: 'OFFICE', label: '🏛️ Office', color: '#f59e0b' },
                    { cat: 'FACILITY', label: '📍 Facility', color: '#10b981' },
                    { cat: 'RESTROOM', label: '🚻 Restroom', color: '#38bdf8' },
                    { cat: 'CANTEEN', label: '🍽️ Canteen', color: '#10b981' },
                    { cat: 'LANDMARK', label: '⭐ Landmark', color: '#f43f5e' },
                    { cat: 'OTHER', label: '📌 Other', color: '#ffffff' },
                  ] as const).map((c) => (
                    <button
                      key={c.cat}
                      type="button"
                      onClick={() => {
                        setNewTagCategory(c.cat);
                        setNewTagColor(c.color);
                      }}
                      className={`py-1 px-1.5 rounded-lg border text-[10px] font-bold transition-all text-center ${
                        newTagCategory === c.cat
                          ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400'
                          : 'border-white/10 bg-slate-950 text-slate-400 hover:text-white'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Distant Corridor Visibility Toggle */}
              <div className="p-2.5 rounded-xl bg-slate-950 border border-white/10 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-white block">Distant Corridor Pin</span>
                  <span className="text-[9px] text-slate-400">Visible from far down the hallway</span>
                </div>
                <input
                  type="checkbox"
                  checked={newTagVisibleFromDistance}
                  onChange={(e) => setNewTagVisibleFromDistance(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1.5">
                  Border Accent Color:
                </label>
                <div className="flex items-center gap-2">
                  {[
                    { hex: '#38bdf8', label: 'Sky' },
                    { hex: '#10b981', label: 'Emerald' },
                    { hex: '#f59e0b', label: 'Amber' },
                    { hex: '#a855f7', label: 'Purple' },
                    { hex: '#f43f5e', label: 'Rose' },
                    { hex: '#ffffff', label: 'White' },
                  ].map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setNewTagColor(c.hex)}
                      className={`flex-1 py-1.5 rounded-xl border text-[10px] font-bold flex flex-col items-center gap-1 transition-all ${
                        newTagColor === c.hex
                          ? 'border-white bg-slate-800 ring-2 ring-white/50'
                          : 'border-white/10 bg-slate-950 hover:bg-slate-800'
                      }`}
                    >
                      <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: c.hex }} />
                      <span className="text-slate-300">{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-white/5 space-y-1">
                <span className="text-[10px] text-slate-400 block font-semibold">
                  Initial Placement: Current Camera View (Yaw: {liveYaw}°, Pitch: {livePitch}°)
                </span>
                <p className="text-[10px] text-slate-500">
                  After creating the tag, you can freely drag it anywhere on the screen or use the nudge buttons to put it in the perfect position!
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
              <button
                onClick={() => setIsAddTagOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleAddTagSubmit}
                className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-lg flex items-center gap-1.5"
              >
                <Plus size={14} />
                Create & Place Tag
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Publish & Deploy to Render Live Website ── */}
      {isPublishModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-emerald-500/40 rounded-3xl p-6 max-w-xl w-full shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <Globe size={22} />
                </div>
                <div>
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    Publish to Render Live Website
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      LIVE
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Sync debug changes, push to GitHub & trigger automatic Render deployment
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsPublishModalOpen(false);
                  setDeployResult(null);
                }}
                className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
              >
                <X size={17} />
              </button>
            </div>

            {/* Live Website Info Banner */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-950 to-emerald-950/40 border border-emerald-500/30 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-black tracking-wider text-emerald-400 block mb-0.5">
                  Official Live Website
                </span>
                <a
                  href="https://campnav-b3om.onrender.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-black text-white hover:text-emerald-300 transition-all flex items-center gap-1.5"
                >
                  campnav-b3om.onrender.com
                  <ExternalLink size={13} className="text-emerald-400" />
                </a>
              </div>
              <a
                href="https://campnav-b3om.onrender.com/"
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-500/25"
              >
                Open Live Site
              </a>
            </div>

            {/* Environment & Git Status */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-3 rounded-xl bg-slate-950 border border-white/10 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                  <Server size={11} /> Environment
                </span>
                <div className="font-bold text-white flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${publishStatus?.isLocal ? 'bg-sky-400' : 'bg-emerald-400'}`} />
                  {publishStatus?.isLocal ? 'Local Development PC' : 'Render Cloud Production'}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-white/10 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                  <GitBranch size={11} /> GitHub Branch
                </span>
                <div className="font-mono font-bold text-amber-300">
                  {publishStatus?.gitBranch || 'main'}
                </div>
              </div>
            </div>

            {/* How It Works Diagram */}
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-white/5 space-y-2">
              <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider">
                How Live Publishing Works
              </span>
              <div className="grid grid-cols-4 gap-1 text-[11px] text-center">
                <div className="p-2 rounded-lg bg-slate-900 border border-white/5">
                  <div className="font-bold text-sky-400 mb-0.5">1. Debug Edits</div>
                  <div className="text-[10px] text-slate-400">Arrows & numbers</div>
                </div>
                <div className="p-2 rounded-lg bg-slate-900 border border-white/5">
                  <div className="font-bold text-indigo-400 mb-0.5">2. Database</div>
                  <div className="text-[10px] text-slate-400">campusnav_db.json</div>
                </div>
                <div className="p-2 rounded-lg bg-slate-900 border border-white/5">
                  <div className="font-bold text-amber-400 mb-0.5">3. Git Push</div>
                  <div className="text-[10px] text-slate-400">To origin main</div>
                </div>
                <div className="p-2 rounded-lg bg-slate-900 border border-white/5">
                  <div className="font-bold text-emerald-400 mb-0.5">4. Render</div>
                  <div className="text-[10px] text-slate-400">Auto deploys in 1m</div>
                </div>
              </div>
            </div>

            {/* Deployment Result Alert */}
            {deployResult && (
              <div
                className={`p-3.5 rounded-2xl border text-xs flex items-start gap-2.5 ${
                  deployResult.success
                    ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
                    : 'bg-red-950/60 border-red-500/40 text-red-200'
                }`}
              >
                {deployResult.success ? (
                  <CheckCircle2 size={18} className="text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1">
                  <div className="font-bold">{deployResult.message}</div>
                  {deployResult.commitHash && (
                    <div className="font-mono text-[11px] text-emerald-400">
                      Commit: {deployResult.commitHash} (branch: main)
                    </div>
                  )}
                  {deployResult.success && (
                    <p className="text-[11px] text-slate-300">
                      Render will finish building in ~60-90 seconds. You can refresh{' '}
                      <a
                        href="https://campnav-b3om.onrender.com/"
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-300 underline font-bold"
                      >
                        campnav-b3om.onrender.com
                      </a>{' '}
                      to see the new updates.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Admin Authorization Status & Quick Unlock */}
            {!isAdminAuthenticated ? (
              <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-500/40 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-amber-400">
                    <Lock size={15} />
                    <span className="text-xs font-black uppercase tracking-wider">
                      Admin Authorization Required
                    </span>
                  </div>
                  <span className="text-[10px] text-amber-300/80 font-mono">Protected Action</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Publishing to the live college website is protected to prevent unauthorized changes. Enter your Admin PIN to unlock deployment:
                </p>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <KeyRound size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="password"
                      placeholder="Enter Admin PIN"
                      value={adminPinInput}
                      onChange={(e) => setAdminPinInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleModalAdminLogin();
                      }}
                      className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-950 border border-white/10 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleModalAdminLogin()}
                    disabled={isAuthenticating}
                    className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isAuthenticating ? <RefreshCw size={13} className="animate-spin" /> : <Unlock size={13} />}
                    Unlock
                  </button>
                  
                </div>
                {adminAuthError && (
                  <div className="text-[11px] text-red-400 font-bold flex items-center gap-1">
                    <AlertTriangle size={12} />
                    {adminAuthError}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-emerald-300 font-bold">
                  <ShieldCheck size={16} className="text-emerald-400" />
                  <span>Admin Session Active (Full Deploy Access)</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Super Admin
                </span>
              </div>
            )}

            {/* Primary Action Button */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-950/60 to-slate-950 border border-emerald-500/30 flex flex-col gap-2">
              <button
                onClick={handlePublishToRender}
                disabled={isDeploying}
                className={`w-full py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 shadow-xl transition-all ${
                  isDeploying
                    ? 'bg-slate-800 text-slate-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-emerald-500/30 active:scale-[0.99]'
                }`}
              >
                {isDeploying ? (
                  <>
                    <RefreshCw size={16} className="animate-spin text-emerald-400" />
                    Committing & Pushing to GitHub Main...
                  </>
                ) : (
                  <>
                    <UploadCloud size={16} />
                    🚀 1-Click Publish to Live Website
                  </>
                )}
              </button>
              <p className="text-[11px] text-center text-slate-400">
                Saves current arrows & numbers to database, commits to GitHub, and triggers Render deploy.
              </p>
            </div>

            {/* Backup & Tools Section */}
            <div className="pt-2 border-t border-white/10 space-y-2">
              <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider block">
                Database Backup & Direct Export
              </span>
              <div className="flex gap-2">
                <button
                  onClick={handleExportDatabase}
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all flex items-center justify-center gap-1.5 border border-white/10"
                  title="Download a backup copy of campusnav_db.json"
                >
                  <Download size={13} className="text-sky-400" />
                  Export Database JSON
                </button>

                <label className="flex-1 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all flex items-center justify-center gap-1.5 border border-white/10 cursor-pointer">
                  <FileJson size={13} className="text-amber-400" />
                  Import Backup
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportDatabase}
                    className="hidden"
                  />
                </label>
              </div>
              {importStatus && (
                <div className="text-[11px] font-bold text-amber-300 text-center">
                  {importStatus}
                </div>
              )}
            </div>

            {/* Optional Render Deploy Hook Accordion */}
            <div className="p-3 rounded-xl bg-slate-950 border border-white/5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-300">
                  Optional: Render Deploy Hook URL
                </span>
                <span className="text-[10px] text-slate-500">Instant webhook ping</span>
              </div>
              <input
                type="text"
                placeholder="https://api.render.com/deploy/srv-..."
                value={deployHookUrl}
                onChange={(e) => {
                  setDeployHookUrl(e.target.value);
                  localStorage.setItem('campnav_render_deploy_hook', e.target.value);
                }}
                className="w-full px-3 py-1.5 bg-slate-900 border border-white/10 rounded-lg text-white font-mono text-[11px] focus:outline-none focus:border-emerald-500"
              />
              <p className="text-[10px] text-slate-500">
                Found in Render Dashboard → CampNav Service → Settings → Deploy Hook.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: User Bug Reports & Feedback Center ── */}
      {isReportsModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6">
          <div className="bg-slate-900 border border-white/15 rounded-3xl p-4 sm:p-6 max-w-6xl w-full shadow-2xl flex flex-col h-[90vh] overflow-hidden">
            <div className="flex-1 overflow-y-auto pr-1">
              <AdminReportsDashboard
                initialNodeFilter={reportFilterNodeId}
                onClose={() => setIsReportsModalOpen(false)}
                onSelectPanorama={(panoId) => {
                  setSelectedNodeId(panoId);
                  onSelectPanorama(panoId);
                  setIsReportsModalOpen(false);
                }}
                onReportsUpdated={refreshReports}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Faculty Presence & Availability Control ── */}
      {isFacultyPresenceOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6">
          <div className="bg-slate-900 border border-white/15 rounded-3xl p-4 sm:p-6 max-w-6xl w-full shadow-2xl flex flex-col h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 flex-shrink-0">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <ShieldCheck size={16} className="text-sky-400" />
                <span>Faculty Presence & Accounts Studio</span>
              </h3>
              <button
                onClick={() => setIsFacultyPresenceOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center"
              >
                <X size={15} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto pr-1 pt-3">
              <FacultyPresenceAdminDashboard />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
