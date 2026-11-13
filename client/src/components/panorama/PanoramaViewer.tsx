import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import {
  Compass,
  Navigation,
  ArrowUpRight,
  Smartphone,
  Layers,
  X,
  Crosshair,
  Loader2,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  MapPin,
  Clock,
  Footprints,
  Info,
  CornerUpRight,
  CornerUpLeft,
  ArrowUp,
  ArrowDown,
  Bug,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  Volume2,
  VolumeX,
  ArrowRight,
  Plus,
  Minus,
  RefreshCw,
} from 'lucide-react';
import { PanoramaNode, PanoramaHotspot, VerifiedPlace, CustomPlaceTag, SearchResult, PublicFacultyStatus } from '../../../../shared/types';
import { shouldRenderNavigationArrow } from '../../../../shared/arrowVisibility';
export { shouldRenderNavigationArrow };
import { getDirectionHintWithHysteresis, DirectionHint } from '../../../../shared/directionHint';
import { resolveArrivalDetails } from '../../../../shared/arrivalDetails';
import { formatRemainingSteps } from '../../../../shared/stepWording';
import { computeChevronTrail, computeChevronTransform } from '../../../../shared/chevronTrail';
import { PanoramaTextureGenerator } from '../../services/panoramaTextureGenerator';
import { useNavigation } from '../../context/NavigationContext';
import { CAMPUS_ZONES } from '../../services/campusPathfinder';
import { CAMPUS_BUILDING_FLOORS, CampusPlace, getPlacesForNode } from '../../data/campusPlaces';
import { AreaCode, CAMPUS_GRAPH_MAP, getCustomPlaceTags } from '../../data/campusGraph';
import { CampusLocationMappingStudio } from '../mapping/CampusLocationMappingStudio';
import { ApiService } from '../../services/api';
import { ShareRouteButton } from '../ui/ShareRouteButton';
import { PanoramaResourceManager } from '../../services/panoramaResourceManager';
import { PanoramaTileLoader, PanoramaTileManifest } from '../../services/panoramaTileLoader';
import { createNadirBlurMesh, NadirBlurController } from './NadirBlurMesh';
import { resolveVoiceDirection } from '../../services/voiceNavigationService';
import { getRestoredCameraState, updatePersistedCameraState } from '../../services/sessionPersistenceService';

export const FRESHERS_QUICK_TARGETS = [
  {
    id: 'place_cs_lab_1',
    title: 'Computer Science Lab 1 & 2',
    subtitle: 'Mahatma Gandhi Block • 1st Floor (Room 108)',
    category: 'PRACTICAL LAB',
    icon: '💻',
    color: 'from-sky-500 to-blue-600',
    nodeId: 'mg_271',
    hint: 'First-year CS & BCA practical programming classes',
  },
  {
    id: 'place_principal',
    title: "Principal's Office",
    subtitle: 'Admin Block • 1st Floor (Middle Foyer)',
    category: 'ADMINISTRATION',
    icon: '🏛️',
    color: 'from-amber-500 to-orange-600',
    nodeId: 'ab_063',
    hint: "Principal's Executive Chamber & Office",
  },
  {
    id: 'place_canteen',
    title: "Students' Canteen & Cafeteria",
    subtitle: 'Campus Grounds • West Avenue',
    category: 'FOOD & BREAK',
    icon: '🍽️',
    color: 'from-rose-500 to-pink-600',
    nodeId: 'outdoor_012',
    hint: 'Student dining hall, meals, tea & fresh juices',
  },
  {
    id: 'place_faculty_canteen',
    title: "Faculty & Teachers' Canteen",
    subtitle: 'Campus Grounds • West Avenue',
    category: 'FOOD & BREAK',
    icon: '☕',
    color: 'from-amber-600 to-yellow-600',
    nodeId: 'outdoor_013',
    hint: 'Designated dining facility for teaching faculty & staff',
  },
  {
    id: 'place_restrooms',
    title: 'Washrooms & Purified Drinking Water',
    subtitle: 'Mahatma Gandhi Block • Ground & 1st Floors',
    category: 'FACILITIES',
    icon: '🚻',
    color: 'from-indigo-500 to-purple-600',
    nodeId: 'mg_260',
    hint: 'Clean restrooms and cold UV drinking water stations',
  },
  {
    id: 'place_science_labs',
    title: 'Science Laboratories (Botany & Zoology)',
    subtitle: 'St. Joseph Science Block • Ground Floor',
    category: 'SCIENCE LABS',
    icon: '🔬',
    color: 'from-violet-500 to-purple-700',
    nodeId: 'sj_166',
    hint: 'Botany herbarium, biotechnology & natural history museum',
  },
  {
    id: 'place_sports',
    title: 'Sports Grounds & Main Auditorium',
    subtitle: 'Campus Grounds • North Arena',
    category: 'CAMPUS LIFE',
    icon: '⚽',
    color: 'from-green-500 to-emerald-700',
    nodeId: 'outdoor_020',
    hint: 'Athletics ground, basketball court & cultural stage',
  },
];

function computeArrivalFacing(fromNodeId: string, targetNodeId: string, clickedHeading?: number): number {
  const fromNode = CAMPUS_GRAPH_MAP.get(fromNodeId);
  const outgoingConn = fromNode?.connections?.find((c) => c.targetId === targetNodeId);
  const explicitOutgoingYaw = outgoingConn?.targetYaw ?? outgoingConn?.initialViewerYaw;
  if (explicitOutgoingYaw !== undefined && typeof explicitOutgoingYaw === 'number') {
    return explicitOutgoingYaw;
  }

  const targetNode = CAMPUS_GRAPH_MAP.get(targetNodeId);
  if (!targetNode) return clickedHeading ?? 0;

  // 1. Check if target node has a defaultCameraYaw set
  const defaultAngle = (targetNode as any).defaultCameraYaw;
  if (defaultAngle !== undefined && typeof defaultAngle === 'number') {
    return defaultAngle;
  }

  const targetConns = targetNode.connections || [];

  // 2. Look for return connection from targetNode back to fromNodeId
  const returnConn = targetConns.find((c) => c.targetId === fromNodeId);
  if (returnConn) {
    const returnHeading = returnConn.worldBearing ?? returnConn.heading ?? 0;
    // Continuing forward past this point is 180° opposite from the return path
    const straightAhead = (returnHeading + 180) % 360;

    // Check if targetNode has a continuing connection along the road (not back to fromNodeId)
    const continuing = targetConns.filter((c) => c.targetId !== fromNodeId);
    if (continuing.length > 0) {
      let bestConn = continuing[0];
      let minDiff = 360;
      for (const conn of continuing) {
        const h = conn.worldBearing ?? conn.heading ?? 0;
        const diff = Math.abs(((h - straightAhead + 540) % 360) - 180);
        if (diff < minDiff) {
          minDiff = diff;
          bestConn = conn;
        }
      }
      // If the best continuing connection is within 75 degrees of straight forward, align with it!
      if (minDiff <= 75) {
        return bestConn.worldBearing ?? bestConn.heading ?? straightAhead;
      }
    }
    return straightAhead;
  }

  // 3. If no return connection exists, use clicked arrow's heading
  if (clickedHeading !== undefined) {
    return clickedHeading;
  }

  // 4. Fallback to targetNode's first forward connection
  const forwardConn = targetConns.find(
    (c) => c.direction === 'straight' || c.type === 'forward'
  ) || targetConns[0];
  if (forwardConn) {
    return forwardConn.worldBearing ?? forwardConn.heading ?? 0;
  }
  return 0;
}

export interface ResolvedDestinationTag {
  tagId: string;
  tagName: string;
  yaw: number;
  pitch: number;
  distance: number;
}

/**
 * Resolves the destination place tag in the final arrival panorama.
 * Uses exact verified tag data (yaw, pitch) without creating or guessing tags.
 */
export function resolveDestinationTag(
  destination: SearchResult | null,
  destinationTitle: string | undefined,
  panoId: string,
  localTags: CustomPlaceTag[],
  verifiedPlaces: VerifiedPlace[] = []
): ResolvedDestinationTag | null {
  if (!destination && !destinationTitle) return null;

  const normalize = (val: string) => val.toLowerCase().replace(/[^a-z0-9]/g, '');

  const targets: string[] = [];
  if (destination?.roomNumber) targets.push(normalize(destination.roomNumber));
  if (destination?.title) targets.push(normalize(destination.title));
  if (destinationTitle) targets.push(normalize(destinationTitle));
  if (destination?.subtitle) targets.push(normalize(destination.subtitle));
  if (destination?.id) targets.push(normalize(destination.id));

  const validTargets = targets.filter((t) => t.length > 0);
  if (validTargets.length === 0) return null;

  // Pass 1: Exact ID match on CustomPlaceTag
  if (destination?.id) {
    const exactId = localTags.find(
      (t) => t.id.toLowerCase() === destination.id.toLowerCase() || (destination as any).tagId === t.id
    );
    if (exactId) {
      return {
        tagId: exactId.id,
        tagName: exactId.text,
        yaw: exactId.yaw,
        pitch: exactId.pitch,
        distance: exactId.distance || 180,
      };
    }
  }

  // Pass 2: Exact normalized name match (e.g. "AB 13" vs "AB13")
  for (const target of validTargets) {
    const exactNameMatch = localTags.find((t) => normalize(t.text) === target);
    if (exactNameMatch) {
      return {
        tagId: exactNameMatch.id,
        tagName: exactNameMatch.text,
        yaw: exactNameMatch.yaw,
        pitch: exactNameMatch.pitch,
        distance: exactNameMatch.distance || 180,
      };
    }
  }

  // Pass 3: Room number prefix / substring match (e.g. "AB 13" vs "13")
  for (const target of validTargets) {
    const tagMatch = localTags.find((t) => {
      const nText = normalize(t.text);
      return nText.includes(target) || target.includes(nText);
    });
    if (tagMatch) {
      return {
        tagId: tagMatch.id,
        tagName: tagMatch.text,
        yaw: tagMatch.yaw,
        pitch: tagMatch.pitch,
        distance: tagMatch.distance || 180,
      };
    }
  }

  // Pass 4: Verified places from database
  for (const vp of verifiedPlaces) {
    const vpNorm = normalize(vp.name || '');
    if (destination?.id && vp.id.toLowerCase() === destination.id.toLowerCase()) {
      return {
        tagId: vp.id,
        tagName: vp.name,
        yaw: vp.yaw || 0,
        pitch: vp.pitch || 0,
        distance: 180,
      };
    }
    for (const target of validTargets) {
      if (vpNorm === target || vpNorm.includes(target) || target.includes(vpNorm)) {
        return {
          tagId: vp.id,
          tagName: vp.name,
          yaw: vp.yaw || 0,
          pitch: vp.pitch || 0,
          distance: 180,
        };
      }
    }
  }

  return null;
}

interface PanoramaViewerProps {
  panorama: PanoramaNode;
  onSelectPanorama: (panoId: string) => void;
  nextRouteHotspotYaw?: number;
  isNavigating?: boolean;
  destinationLabel?: string;
  onToggleMiniMap?: () => void;
  showMiniMap?: boolean;
  onExitNavigation?: () => void;
  onOpenBugReport?: () => void;
  hideTopControls?: boolean;
}

export const PanoramaViewer: React.FC<PanoramaViewerProps> = ({
  panorama,
  onSelectPanorama,
  nextRouteHotspotYaw,
  isNavigating = false,
  destinationLabel,
  onToggleMiniMap,
  showMiniMap = true,
  onExitNavigation,
  onOpenBugReport,
  hideTopControls = false,
}) => {
  const {
    requestLiveGPSLocation,
    liveGPS,
    gpsStatusMessage,
    activeFloorNumber,
    setActiveFloorNumber,
    navigationStatus,
    activeNavigationRoute,
    currentRouteIndex,
    transitionLocked,
    setTransitionLocked,
    advanceNavigationStep,
    stepBackwardNavigation,
    exitNavigation,
    visitedNodeIds,
    navigationError,
    isDebugMode,
    toggleDebugMode,
    startNavigation,
    setViewMode,
    isVoiceEnabled,
    toggleVoiceNavigation,
    selectedDestination,
    setCameraHeading,
    commitCurrentPanorama,
    setActiveTab,
    openReportModal,
    startNavigationRoute,
  } = useNavigation();

  // Navigation UI & Route Expansion State
  const [isStepListExpanded, setIsStepListExpanded] = useState<boolean>(false);
  const [directionHint, setDirectionHint] = useState<DirectionHint | null>(null);
  const lastHintComputeTimeRef = useRef<number>(0);
  const [facultyArrivalStatus, setFacultyArrivalStatus] = useState<PublicFacultyStatus | null>(null);

  const [isLocatingGPS, setIsLocatingGPS] = useState(false);
  const [showZonePicker, setShowZonePicker] = useState(false);
  const [showFreshersGuide, setShowFreshersGuide] = useState(false);
  const [selectedPlaceInfo, setSelectedPlaceInfo] = useState<CampusPlace | null>(null);
  const [isMappingStudioOpen, setIsMappingStudioOpen] = useState(false);
  const [verifiedPlacesAtPano, setVerifiedPlacesAtPano] = useState<VerifiedPlace[]>([]);

  // Load dynamically verified places anchored to this panorama
  const loadVerifiedPlaces = useCallback(async () => {
    try {
      const places = await ApiService.getPlacesForPanorama(panorama.id);
      if (Array.isArray(places)) {
        setVerifiedPlacesAtPano(places.filter((p: VerifiedPlace) => p.verified && p.status !== 'DISABLED'));
      }
    } catch {
      setVerifiedPlacesAtPano([]);
    }
  }, [panorama.id]);

  useEffect(() => {
    loadVerifiedPlaces();
  }, [loadVerifiedPlaces]);

  // Page Visibility tracking to pause animations when tab is hidden
  useEffect(() => {
    const handleVisibility = () => {
      isDocumentVisibleRef.current = !document.hidden;
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const [tagsUpdateCounter, setTagsUpdateCounter] = useState(0);
  useEffect(() => {
    const handleTagsUpdated = () => setTagsUpdateCounter((c) => c + 1);
    window.addEventListener('campnav:tags_updated', handleTagsUpdated);
    return () => window.removeEventListener('campnav:tags_updated', handleTagsUpdated);
  }, []);

  // ─────────────────────────────────────────────────────────────
  // "Next Panorama Ready" Architecture State & Subscriptions
  // ─────────────────────────────────────────────────────────────
  const [, setReadyPanoIds] = useState<Set<string>>(new Set());
  const [isCurrentPanoReady, setIsCurrentPanoReady] = useState<boolean>(() =>
    PanoramaResourceManager.isPanoramaReady(panorama.id)
  );
  const [unreadyNotice, setUnreadyNotice] = useState<string | null>(null);
  const unreadyNoticeTimeoutRef = useRef<any>(null);
  const applyReadyTextureRef = useRef<((tex: THREE.Texture) => void) | null>(null);

  // Proactively preload current panorama, outgoing hotspots, and upcoming route steps
  useEffect(() => {
    setIsCurrentPanoReady(PanoramaResourceManager.isPanoramaReady(panorama.id));
    PanoramaResourceManager.preloadPanorama(panorama.id, panorama.imageUrl, true);

    (panorama.hotspots || []).forEach((h) => {
      if (h.targetPanoId) {
        PanoramaResourceManager.preloadPanorama(h.targetPanoId);
      }
    });

    if (activeNavigationRoute?.pathNodeIds) {
      PanoramaResourceManager.preloadRoute(activeNavigationRoute.pathNodeIds, currentRouteIndex);
    }
  }, [panorama.id, panorama.imageUrl, panorama.hotspots, activeNavigationRoute, currentRouteIndex]);

  // Reactive subscription to global readiness state from PanoramaResourceManager
  useEffect(() => {
    const unsubscribe = PanoramaResourceManager.subscribeAll((state, panoId) => {
      if (panoId === panorama.id && state === 'READY') {
        setIsCurrentPanoReady(true);
        // If sphere is currently untextured or showing blank screen, apply ready texture immediately
        const baseMesh = sphereMeshRef.current;
        if (baseMesh && !(baseMesh.material as THREE.MeshBasicMaterial).map) {
          const cachedTex = PanoramaResourceManager.getCachedTexture(panoId);
          if (cachedTex && applyReadyTextureRef.current) {
            applyReadyTextureRef.current(cachedTex);
            setUnreadyNotice(null);
          }
        }
      }
      setReadyPanoIds((prev) => {
        const next = new Set(prev);
        if (state === 'READY') next.add(panoId);
        else if (state === 'FAILED') next.delete(panoId);
        return next;
      });
    });
    return unsubscribe;
  }, [panorama.id]);

  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const sphereMeshRef = useRef<THREE.Mesh | null>(null);
  const fadeSphereMeshRef = useRef<THREE.Mesh | null>(null);
  const textureCacheRef = useRef<Map<string, THREE.Texture>>(new Map());
  const chevronTextureCacheRef = useRef<Map<string, THREE.Texture>>(new Map());
  const sharedChevronTextureRef = useRef<THREE.CanvasTexture | null>(null);
  const activeChevronTrailMeshesRef = useRef<THREE.Mesh[]>([]);
  const isDocumentVisibleRef = useRef<boolean>(typeof document !== 'undefined' ? !document.hidden : true);
  const wasShowingHintRef = useRef<boolean>(false);
  const prefersReducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );
  const waypointsGroupRef = useRef<THREE.Group | null>(null);
  const placesGroupRef = useRef<THREE.Group | null>(null);
  const tilesGroupRef = useRef<THREE.Group | null>(null);
  const activeManifestRef = useRef<PanoramaTileManifest | null>(null);
  const nadirBlurRef = useRef<NadirBlurController | null>(null);
  const [currentLODLevel, setCurrentLODLevel] = useState<number>(0);
  const [visibleTileCount, setVisibleTileCount] = useState<number>(0);
  const lastVisibleCountRef = useRef<number>(0);

  // Current active step in deterministic route
  const isRouteActive = Boolean(
    (activeNavigationRoute && navigationStatus === 'NAVIGATING') ||
    (isNavigating && activeNavigationRoute)
  );
  const currentStep = activeNavigationRoute?.steps[currentRouteIndex] || null;
  const isArrived =
    navigationStatus === 'ARRIVED' ||
    (Boolean(activeNavigationRoute) &&
      currentRouteIndex >= (activeNavigationRoute?.steps.length || 1) - 1 &&
      activeNavigationRoute?.steps.length !== 0);

  // Authoritative target angle towards the next navigation waypoint
  const targetNextPathYaw = useMemo(() => {
    if (!isRouteActive || isArrived) return null;
    let authoritativeNextNodeId: string | null = null;
    if (activeNavigationRoute?.pathNodeIds) {
      const pIdx = activeNavigationRoute.pathNodeIds.indexOf(panorama.id);
      if (pIdx !== -1 && pIdx + 1 < activeNavigationRoute.pathNodeIds.length) {
        authoritativeNextNodeId = activeNavigationRoute.pathNodeIds[pIdx + 1];
      }
    }
    if (!authoritativeNextNodeId && currentStep?.targetNodeId) {
      authoritativeNextNodeId = currentStep.targetNodeId;
    }
    if (authoritativeNextNodeId) {
      const matchingSpot = (panorama.hotspots || []).find(
        (h) => h.targetPanoId && h.targetPanoId.toLowerCase() === authoritativeNextNodeId!.toLowerCase()
      );
      if (matchingSpot) return matchingSpot.yaw;
    }
    if (nextRouteHotspotYaw !== undefined) return nextRouteHotspotYaw;
    if (currentStep?.arrowScreenYaw !== undefined) return currentStep.arrowScreenYaw;
    if (currentStep?.yaw !== undefined) return currentStep.yaw;
    return null;
  }, [isRouteActive, isArrived, activeNavigationRoute, panorama.id, panorama.hotspots, currentStep, nextRouteHotspotYaw]);

  // Destination Arrival Details & Live Faculty Status
  const arrivalDetails = useMemo(() => {
    return resolveArrivalDetails({
      isArrived,
      destinationTitle: activeNavigationRoute?.destinationTitle || destinationLabel,
      selectedDestination,
      currentPanorama: panorama,
    });
  }, [isArrived, activeNavigationRoute, destinationLabel, selectedDestination, panorama]);

  useEffect(() => {
    if (!isArrived || !arrivalDetails.isTeacher || !arrivalDetails.teacherId) {
      setFacultyArrivalStatus(null);
      return;
    }
    let isCancelled = false;
    ApiService.getFacultyStatus(arrivalDetails.teacherId).then((st) => {
      if (!isCancelled && st) {
        setFacultyArrivalStatus(st);
      }
    });
    return () => {
      isCancelled = true;
    };
  }, [isArrived, arrivalDetails.isTeacher, arrivalDetails.teacherId]);

  // Orientation & Look Angles (Spherical Coordinates)
  const restoredCameraState = useMemo(() => getRestoredCameraState(), []);
  const isInitialRestoreRef = useRef<boolean>(Boolean(restoredCameraState));

  const lonRef = useRef<number>(restoredCameraState?.yaw ?? panorama.heading ?? 0);
  const latRef = useRef<number>(Math.max(11, restoredCameraState?.pitch ?? 12));
  const targetLonRef = useRef<number>(restoredCameraState?.yaw ?? panorama.heading ?? 0);
  const targetLatRef = useRef<number>(Math.max(11, restoredCameraState?.pitch ?? 12));
  const [currentHeading, setCurrentHeading] = useState<number>(restoredCameraState?.yaw ?? panorama.heading ?? 0);
  const lastHeadingStateRef = useRef<number>(restoredCameraState?.yaw ?? panorama.heading ?? 0);
  const lastHeadingUpdateTimeRef = useRef<number>(0);
  const lastCameraPersistTimeRef = useRef<number>(0);

  // Pointer / Touch State
  const isUserInteractingRef = useRef<boolean>(false);
  const onPointerDownPointerXRef = useRef<number>(0);
  const onPointerDownPointerYRef = useRef<number>(0);
  const onPointerDownLonRef = useRef<number>(0);
  const onPointerDownLatRef = useRef<number>(0);
  const lastVisitedNodeIdRef = useRef<string | null>(null);
  const preferredArrivalYawRef = useRef<number | null>(null);
  const hasAlignedToDestinationRef = useRef<string | null>(null);
  const [destinationDebugInfo, setDestinationDebugInfo] = useState<{
    selectedDestination: string;
    destinationPanorama: string;
    tagYaw: number;
    tagPitch: number;
    arrivalCameraYaw: number;
  } | null>(null);

  // Reset destination alignment state whenever active route or selected destination changes
  useEffect(() => {
    hasAlignedToDestinationRef.current = null;
    setDestinationDebugInfo(null);
  }, [selectedDestination, destinationLabel, activeNavigationRoute]);

  // ─────────────────────────────────────────────────────────────
  // DESTINATION ARRIVAL & SELECTION CAMERA ALIGNMENT
  // Automatically rotates camera to face the exact destination tag upon arrival or direct selection
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!panorama || !panorama.id) return;

    // Check if this panorama is the target destination
    const isFinalDestination = Boolean(
      (activeNavigationRoute && activeNavigationRoute.pathNodeIds[activeNavigationRoute.pathNodeIds.length - 1] === panorama.id) ||
      navigationStatus === 'ARRIVED' ||
      isArrived ||
      (!isNavigating && (selectedDestination || destinationLabel)) ||
      (selectedDestination?.nodeId && selectedDestination.nodeId === panorama.id)
    );
    if (!isFinalDestination) return;

    const arrivalKey = `${activeNavigationRoute?.routeId || 'preview'}_${selectedDestination?.id || selectedDestination?.roomNumber || destinationLabel || activeNavigationRoute?.destinationTitle || 'dest'}_${panorama.id}`;
    if (hasAlignedToDestinationRef.current === arrivalKey) return;
    hasAlignedToDestinationRef.current = arrivalKey;

    const nodeTags = getCustomPlaceTags(panorama.id);
    const resolvedTag = resolveDestinationTag(
      selectedDestination,
      destinationLabel || activeNavigationRoute?.destinationTitle,
      panorama.id,
      nodeTags,
      verifiedPlacesAtPano
    );

    if (resolvedTag) {
      const destYaw = resolvedTag.yaw;
      const destPitch = Math.max(-45, Math.min(45, resolvedTag.pitch !== undefined ? resolvedTag.pitch : 2));

      // Calculate shortest rotational delta so camera turns smoothly without 360° spin
      const currentLon = lonRef.current;
      const angleDiff = ((((destYaw - (currentLon % 360)) + 540) % 360) - 180);
      const finalLon = currentLon + angleDiff;

      // Smoothly rotate camera to face physical destination tag
      const timer = setTimeout(() => {
        targetLonRef.current = finalLon;
        targetLatRef.current = destPitch;
      }, 150);

      setDestinationDebugInfo({
        selectedDestination: selectedDestination?.roomNumber || selectedDestination?.title || destinationLabel || activeNavigationRoute?.destinationTitle || resolvedTag.tagName,
        destinationPanorama: panorama.id,
        tagYaw: resolvedTag.yaw,
        tagPitch: resolvedTag.pitch,
        arrivalCameraYaw: Math.round(((finalLon % 360) + 360) % 360),
      });

      return () => clearTimeout(timer);
    } else {
      if (isDebugMode) {
        console.log(`Destination tag orientation unavailable.`);
      }
      setDestinationDebugInfo(null);
    }
  }, [
    isArrived,
    navigationStatus,
    isNavigating,
    activeNavigationRoute,
    selectedDestination,
    destinationLabel,
    panorama.id,
    verifiedPlacesAtPano,
    isDebugMode,
  ]);

  // Google Street View Double-Tap Road Navigation State
  const lastTapTimeRef = useRef<number>(0);
  const lastTapCoordsRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [activeRipple, setActiveRipple] = useState<{ x: number; y: number; id: number } | null>(null);

  // Multi-touch Pinch-to-Zoom State
  const isPinchingRef = useRef<boolean>(false);
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartFovRef = useRef<number>(75);

  // Device Orientation (Gyroscope)
  const [isGyroActive, setIsGyroActive] = useState<boolean>(false);
  const [, setHasGyroPermission] = useState<boolean>(false);
  const gyroAlphaRef = useRef<number>(0);
  const gyroBetaRef = useRef<number>(0);
  const gyroGammaRef = useRef<number>(0);

  // Hovered Items
  const [hoveredHotspot, setHoveredHotspot] = useState<PanoramaHotspot | null>(null);
  const [hoveredPlace, setHoveredPlace] = useState<CampusPlace | null>(null);
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);

  // Current Building Floor Meta
  const currentAreaCode = (panorama.buildingId || 'OUTDOOR').toUpperCase() as AreaCode;
  const buildingFloorMeta = CAMPUS_BUILDING_FLOORS[currentAreaCode] || CAMPUS_BUILDING_FLOORS.OUTDOOR;

  // Places located in current panorama
  const currentPlaces: CampusPlace[] = useMemo(() => {
    return (panorama.places as CampusPlace[]) || getPlacesForNode(panorama.id);
  }, [panorama.id, panorama.places]);

  // ─────────────────────────────────────────────────────────────
  // Helper: Texture Ingestion with GPU limit validation
  // ─────────────────────────────────────────────────────────────
  const loadEquirectangularTexture = useCallback(
    (url: string, onLoaded: (tex: THREE.Texture) => void, onFailed: () => void) => {
      if (!url) {
        onFailed();
        return;
      }

      // 1. Properly resolve URL without prepending '/' to data: or blob: URLs
      let cleanUrl = url;
      const isSpecialUrl = url.startsWith('data:') || url.startsWith('blob:');

      const isNative = typeof window !== 'undefined' && (
        Boolean((window as any).Capacitor?.isNativePlatform?.()) ||
        window.location.protocol === 'capacitor:' ||
        (window.location.hostname === 'localhost' && window.location.port === '')
      );

      if (!isSpecialUrl) {
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          const path = url.startsWith('/') ? url : '/' + url;
          cleanUrl = isNative ? `https://campnav-b3om.onrender.com${encodeURI(path)}` : path;
        } else {
          cleanUrl = encodeURI(url);
        }
      }

      // Check GPU texture cache for 0ms instant loading
      if (textureCacheRef.current.has(cleanUrl)) {
        const cached = textureCacheRef.current.get(cleanUrl)!;
        textureCacheRef.current.delete(cleanUrl);
        textureCacheRef.current.set(cleanUrl, cached);
        onLoaded(cached);
        return;
      }

      const MAX_TEXTURE_CACHE = 15;

      const cacheAndReturn = (texture: THREE.Texture) => {
        while (textureCacheRef.current.size >= MAX_TEXTURE_CACHE) {
          const oldestKey = textureCacheRef.current.keys().next().value;
          if (oldestKey) {
            const oldTex = textureCacheRef.current.get(oldestKey);
            if (oldTex) oldTex.dispose();
            textureCacheRef.current.delete(oldestKey);
          } else {
            break;
          }
        }
        textureCacheRef.current.set(cleanUrl, texture);
        onLoaded(texture);
      };

      const loadFromUrl = (targetUrl: string) => {
        const loader = new THREE.TextureLoader();
        if (!isSpecialUrl) {
          loader.crossOrigin = 'anonymous';
        }
        loader.load(
          targetUrl,
          (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.minFilter = THREE.LinearMipmapLinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.generateMipmaps = true;
            texture.anisotropy = Math.min(rendererRef.current?.capabilities.getMaxAnisotropy() || 16, 16);
            cacheAndReturn(texture);
          },
          undefined,
          () => {
            // If primary URL failed and it wasn't already trying the cloud URL, try the cloud URL
            if (!isSpecialUrl && !targetUrl.includes('campnav-b3om.onrender.com') && isNative) {
              const path = url.startsWith('http') ? new URL(url).pathname : (url.startsWith('/') ? url : '/' + url);
              loadFromUrl(`https://campnav-b3om.onrender.com${encodeURI(path)}`);
              return;
            }

            // Fallback Canvas Texture Generator
            const img = new Image();
            if (!isSpecialUrl) {
              img.crossOrigin = 'anonymous';
            }
            img.onload = () => {
              try {
                const maxTexSize = rendererRef.current?.capabilities.maxTextureSize || 4096;
                let source: HTMLCanvasElement | HTMLImageElement = img;

                if (img.width > maxTexSize || img.height > maxTexSize) {
                  const scale = Math.min(maxTexSize / img.width, maxTexSize / img.height);
                  const canvas = document.createElement('canvas');
                  canvas.width = Math.floor(img.width * scale);
                  canvas.height = Math.floor(img.height * scale);
                  const ctx = canvas.getContext('2d');
                  if (ctx) {
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    source = canvas;
                  }
                }

                const texture = new THREE.CanvasTexture(source as HTMLCanvasElement);
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.minFilter = THREE.LinearMipmapLinearFilter;
                texture.magFilter = THREE.LinearFilter;
                texture.generateMipmaps = true;
                cacheAndReturn(texture);
              } catch (e) {
                console.error('[CampusNav] Fallback texture generation error:', e);
                onFailed();
              }
            };
            img.onerror = () => {
              onFailed();
            };
            img.src = targetUrl;
          }
        );
      };

      // Check CacheStorage first for 0ms offline availability
      if (typeof window !== 'undefined' && 'caches' in window && !isSpecialUrl) {
        const rawKey = url.startsWith('http') ? new URL(url).pathname : (url.startsWith('/') ? url : '/' + url);
        let decodedKey = rawKey;
        try { decodedKey = decodeURI(rawKey); } catch {}

        caches.match(rawKey).then((cachedResponse) => {
          if (cachedResponse && cachedResponse.ok) {
            cachedResponse.blob().then((blob) => {
              const blobUrl = URL.createObjectURL(blob);
              loadFromUrl(blobUrl);
            }).catch(() => loadFromUrl(cleanUrl));
          } else if (decodedKey !== rawKey) {
            caches.match(decodedKey).then((decResponse) => {
              if (decResponse && decResponse.ok) {
                decResponse.blob().then((blob) => {
                  const blobUrl = URL.createObjectURL(blob);
                  loadFromUrl(blobUrl);
                }).catch(() => loadFromUrl(cleanUrl));
              } else {
                loadFromUrl(cleanUrl);
              }
            }).catch(() => loadFromUrl(cleanUrl));
          } else {
            loadFromUrl(cleanUrl);
          }
        }).catch(() => loadFromUrl(cleanUrl));
      } else {
        loadFromUrl(cleanUrl);
      }
    },
    []
  );

  // ─────────────────────────────────────────────────────────────
  // Helper: Clean Label Resolver (Strictly respects manual user direction)
  // ─────────────────────────────────────────────────────────────
  const getCleanHotspotLabel = (spot: PanoramaHotspot) => {
    const dir = (spot.direction || '').toLowerCase();
    const isBackward = dir === 'u-turn' || dir === 'backward' || dir === 'back';
    const isTurnLeft = dir === 'left' || dir === 'slight-left';
    const isTurnRight = dir === 'right' || dir === 'slight-right';

    let text = spot.instruction || '';
    if (text.includes(' to 0') || text.endsWith(' 0') || text === 'Continue path' || !text) {
      if (spot.transitionType === 'STAIRS') return 'Take Stairs';
      if (spot.transitionType === 'DOOR') return 'Enter Building';
      if (isBackward) return 'Step Back';
      if (isTurnLeft) return 'Turn Left';
      if (isTurnRight) return 'Turn Right';
      return 'Walk Ahead';
    }
    return text;
  };

  // ─────────────────────────────────────────────────────────────
  // Helper 1: Reusable Flat Ground Chevron Texture
  // White fill with a thin vibrant blue edge for clean visibility across all road/corridor surfaces
  // ─────────────────────────────────────────────────────────────
  const getSharedChevronTexture = (): THREE.CanvasTexture => {
    if (sharedChevronTextureRef.current) {
      return sharedChevronTextureRef.current;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 512, 256);

      // Draw clean forward-pointing chevron
      // Apex at top center (256, 32), legs extending to (64, 210) and (448, 210)
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // 1. Thin crisp white outline (about 5.5% of texture width)
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 28;
      ctx.beginPath();
      ctx.moveTo(76, 210);
      ctx.lineTo(256, 46);
      ctx.lineTo(436, 210);
      ctx.stroke();

      // 2. Solid, stronger blue fill (#1E88FF)
      ctx.strokeStyle = '#1E88FF';
      ctx.lineWidth = 22;
      ctx.beginPath();
      ctx.moveTo(76, 210);
      ctx.lineTo(256, 46);
      ctx.lineTo(436, 210);
      ctx.stroke();

      ctx.restore();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    sharedChevronTextureRef.current = texture;
    return texture;
  };

  // ─────────────────────────────────────────────────────────────
  // Helper 1B: Floating Distance Capsule Badge above Chevron
  // ─────────────────────────────────────────────────────────────
  const createDistanceBadgeSprite = (distanceMeters: number): THREE.Sprite => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Sprite();

    const cx = 128;
    const cy = 48;
    const w = 150;
    const h = 54;
    const r = 27;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;

    ctx.beginPath();
    ctx.moveTo(cx - w / 2 + r, cy - h / 2);
    ctx.lineTo(cx + w / 2 - r, cy - h / 2);
    ctx.arcTo(cx + w / 2, cy - h / 2, cx + w / 2, cy + h / 2, r);
    ctx.lineTo(cx + w / 2, cy + h / 2 - r);
    ctx.arcTo(cx + w / 2, cy + h / 2 - r, cx + w / 2, cy + h / 2, r);
    ctx.lineTo(cx - w / 2 + r, cy + h / 2);
    ctx.arcTo(cx - w / 2, cy + h / 2, cx - w / 2, cy + h / 2 - r, r);
    ctx.lineTo(cx - w / 2, cy - h / 2 + r);
    ctx.arcTo(cx - w / 2, cy - h / 2, cx - w / 2 + r, cy - h / 2, r);
    ctx.closePath();

    ctx.fillStyle = 'rgba(19, 35, 56, 0.95)';
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${distanceMeters || 10} m`, cx, cy);
    ctx.restore();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      opacity: 1.0,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(38, 14, 1);
    return sprite;
  };

  // ─────────────────────────────────────────────────────────────
  // Helper 2: Google Maps 3D Floating Place / POI Marker
  // ─────────────────────────────────────────────────────────────
  const createPlaceMarkerSprite = (place: CampusPlace): THREE.Sprite | null => {
    const canvas = document.createElement('canvas');
    canvas.width = 460;
    canvas.height = 130;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const isAcademics = place.category === 'ACADEMICS';
    const isFacilities = place.category === 'FACILITIES';
    const isServices = place.category === 'SERVICES';

    // 1. Container Pill
    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.beginPath();
    ctx.roundRect(8, 8, 444, 114, 24);
    ctx.fill();

    // 2. Category Accent Border
    const accentColor = isAcademics
      ? '#38bdf8'
      : isFacilities
      ? '#10b981'
      : isServices
      ? '#f59e0b'
      : '#a855f7';
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // Top subtle neon glow line
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(35, 10);
    ctx.lineTo(425, 10);
    ctx.stroke();

    // 3. Place Icon Disc
    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.arc(58, 65, 30, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(place.icon || '📍', 58, 65);

    // 4. Place Title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 23px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const cleanTitle = place.name.length > 22 ? place.name.substring(0, 20) + '…' : place.name;
    ctx.fillText(cleanTitle, 105, 58);

    // 5. Room & Floor Subtitle
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 17px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    let subtitle = place.floor || 'Campus Landmark';
    if (place.roomNumber) {
      subtitle = `Room ${place.roomNumber} • ${place.floor}`;
    } else if (!place.verified) {
      subtitle = 'Location unverified';
    }
    ctx.fillText(subtitle, 105, 92);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(58, 16.5, 1);
    return sprite;
  };

  const getCategoryColor = (category?: string, defaultColor = '#38bdf8'): string => {
    switch (category) {
      case 'CLASSROOM': return '#3b82f6';
      case 'LAB': return '#a855f7';
      case 'OFFICE': return '#f59e0b';
      case 'RESTROOM': return '#06b6d4';
      case 'CANTEEN': return '#f43f5e';
      case 'LANDMARK': return '#10b981';
      case 'FACILITY': return '#eab308';
      default: return defaultColor;
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Helper 2B: Clean Minimalist Text Tag (Local & Distant Billboard)
  // ─────────────────────────────────────────────────────────────
  const createCleanTextTagSprite = (
    text: string,
    accentColor = '#38bdf8',
    isDistant = false,
    _category?: string
  ): THREE.Sprite | null => {
    const trimmed = (text || '').trim();
    if (!trimmed) return null;

    const displayText = isDistant ? `📍 ${trimmed} • Ahead` : trimmed;
    const charCount = displayText.length;

    // Pick crisp font size based on text length to keep layout balanced
    const fontSize = isDistant
      ? charCount > 35 ? 30 : 34
      : charCount > 35 ? 32 : charCount > 24 ? 36 : 42;

    const fontStyle = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`;

    // Measure exact text width using an offscreen canvas
    const measureCanvas = document.createElement('canvas');
    const measureCtx = measureCanvas.getContext('2d');
    if (!measureCtx) return null;
    measureCtx.font = fontStyle;
    const measuredWidth = measureCtx.measureText(displayText).width;

    // High resolution canvas with dynamic width so long names NEVER get cut off
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
      // Distant corridor preview billboard pill
      ctx.fillStyle = 'rgba(8, 14, 28, 0.94)';
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillH, pillRadius);
      ctx.fill();

      // Dashed boundary showing it's a distant corridor destination
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 4;
      ctx.setLineDash([12, 6]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Top subtle highlight bar
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(pillX + 40, pillY + 4);
      ctx.lineTo(pillX + pillW - 40, pillY + 4);
      ctx.stroke();

      // Clean text with 📍 and Ahead (full text, no cutoffs)
      ctx.fillStyle = '#ffffff';
      ctx.font = fontStyle;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(displayText, canvasWidth / 2, canvasHeight / 2);
    } else {
      // Dark sleek backdrop plaque pill
      ctx.fillStyle = 'rgba(10, 15, 30, 0.95)';
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillH, pillRadius);
      ctx.fill();

      // Vibrant border with subtle glow
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 5;
      ctx.stroke();

      // Top bright highlight bar
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(pillX + 40, pillY + 4);
      ctx.lineTo(pillX + pillW - 40, pillY + 4);
      ctx.stroke();

      // Clean, crisp typography
      ctx.fillStyle = '#ffffff';
      ctx.font = fontStyle;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(displayText, canvasWidth / 2, canvasHeight / 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(spriteMat);

    // Dynamic 3D scale: larger base height (26 for local, 20 for distant)
    // and dynamic width proportional to text length!
    const baseHeight = isDistant ? 20 : 26;
    const aspect = canvasWidth / canvasHeight;
    const spriteWidth = baseHeight * aspect;

    sprite.scale.set(spriteWidth, baseHeight, 1);
    return sprite;
  };

  // ─────────────────────────────────────────────────────────────
  // Helper 3: Clean Map-Style Dynamic Verified Place Marker
  // ─────────────────────────────────────────────────────────────
  const createVerifiedPlaceMarkerSprite = (place: VerifiedPlace): THREE.Sprite | null => {
    const canvas = document.createElement('canvas');
    canvas.width = 460;
    canvas.height = 130;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const isRestroom = place.category === 'RESTROOM';
    const isLab = place.category === 'LAB';
    const isClassroom = place.category === 'CLASSROOM';
    const isDept = place.category === 'DEPARTMENT';
    const isStairs = place.category === 'STAIRCASE';

    const accentColor = isRestroom
      ? '#38bdf8'
      : isLab
      ? '#a855f7'
      : isClassroom
      ? '#3b82f6'
      : isDept
      ? '#f59e0b'
      : isStairs
      ? '#f97316'
      : '#10b981';

    // 1. Container Pill
    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.beginPath();
    ctx.roundRect(8, 8, 444, 114, 24);
    ctx.fill();

    // 2. Category Accent Border
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // Top subtle neon glow line
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(35, 10);
    ctx.lineTo(425, 10);
    ctx.stroke();

    // 3. Icon Disc
    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.arc(58, 65, 30, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const icon = isRestroom ? '🚻' : isLab ? '🔬' : isClassroom ? '🏫' : isDept ? '🏛️' : isStairs ? '🪜' : '📍';
    ctx.fillText(icon, 58, 65);

    // 4. Place Title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 23px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const cleanTitle = place.name.length > 22 ? place.name.substring(0, 20) + '…' : place.name;
    ctx.fillText(cleanTitle, 105, 58);

    // 5. Floor Subtitle
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 17px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    let subtitle = `${place.buildingName} • ${place.floorName}`;
    if (place.roomNumber) {
      subtitle = `Room ${place.roomNumber} • ${place.floorName}`;
    }
    ctx.fillText(subtitle, 105, 92);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(58, 16.5, 1);
    return sprite;
  };

  // ─────────────────────────────────────────────────────────────
  // 1. Initialize Three.js WebGL Scene (Single Mount)
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth || window.innerWidth;
    const height = containerRef.current.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const initialClampedFov = Math.max(34, Math.min(66, restoredCameraState?.fov || 62));
    const camera = new THREE.PerspectiveCamera(initialClampedFov, width / height, 1, 1100);
    camera.position.set(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    rendererRef.current = renderer;

    containerRef.current.replaceChildren(renderer.domElement);

    // Inverted 360 Photo Sphere (Base Layer)
    const geometry = new THREE.SphereGeometry(500, 60, 40);
    geometry.scale(-1, 1, 1);

    let initialTexture: THREE.Texture | null = PanoramaResourceManager.getCachedTexture(panorama.id);
    if (!initialTexture) {
      // Neutral dark sphere texture (no cartoon procedural 2D building)
      const darkCanvas = document.createElement('canvas');
      darkCanvas.width = 64;
      darkCanvas.height = 32;
      const ctx = darkCanvas.getContext('2d');
      if (ctx) {
        const grad = ctx.createLinearGradient(0, 0, 0, 32);
        grad.addColorStop(0, '#020617');
        grad.addColorStop(0.5, '#090d16');
        grad.addColorStop(1, '#020617');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 64, 32);
      }
      initialTexture = new THREE.CanvasTexture(darkCanvas);
      initialTexture.colorSpace = THREE.SRGBColorSpace;
    }

    const initialMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      map: initialTexture,
    });
    const sphereMesh = new THREE.Mesh(geometry, initialMaterial);
    sphereMesh.rotation.y = 0;
    scene.add(sphereMesh);
    sphereMeshRef.current = sphereMesh;

    // Inverted 360 Photo Sphere (Cross-Fade Incoming Transition Layer)
    const fadeGeometry = new THREE.SphereGeometry(498, 60, 40);
    fadeGeometry.scale(-1, 1, 1);
    const fadeMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
    });
    const fadeSphereMesh = new THREE.Mesh(fadeGeometry, fadeMaterial);
    fadeSphereMesh.rotation.y = 0;
    fadeSphereMesh.visible = false;
    scene.add(fadeSphereMesh);
    fadeSphereMeshRef.current = fadeSphereMesh;

    // Waypoints Group (Directional Indicators)
    const waypointsGroup = new THREE.Group();
    scene.add(waypointsGroup);
    waypointsGroupRef.current = waypointsGroup;

    // Places Group (Floating Place/POI Labels)
    const placesGroup = new THREE.Group();
    scene.add(placesGroup);
    placesGroupRef.current = placesGroup;

    // High-Resolution Tiled LOD Patches Group (radius 499.2 inside base sphere)
    const tilesGroup = new THREE.Group();
    scene.add(tilesGroup);
    tilesGroupRef.current = tilesGroup;

    const TILE_RADIUS = 499.2;
    const LOD3_COLS = 8;
    const LOD3_ROWS = 4;
    const dPhi = (2 * Math.PI) / LOD3_COLS;
    const dTheta = Math.PI / LOD3_ROWS;

    // Pre-create 32 curved sphere mesh patches for LOD 3
    for (let r = 0; r < LOD3_ROWS; r++) {
      for (let c = 0; c < LOD3_COLS; c++) {
        const phiStart = c * dPhi;
        const phiLength = dPhi;
        const thetaStart = r * dTheta;
        const thetaLength = dTheta;

        const patchGeo = new THREE.SphereGeometry(
          TILE_RADIUS,
          8,
          8,
          phiStart,
          phiLength,
          thetaStart,
          thetaLength
        );
        patchGeo.scale(-1, 1, 1);

        const patchMat = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        });

        const patchMesh = new THREE.Mesh(patchGeo, patchMat);
        patchMesh.visible = false;
        patchMesh.userData = { row: r, col: c, loadedKey: null };
        tilesGroup.add(patchMesh);
      }
    }

    // Downward scroll is locked at eye-level (min lat 2 deg) so photographer is never visible,
    // completely eliminating the messy/smudgy nadir blur on the ground.
    nadirBlurRef.current = null;

    // Animation Loop (Fluid 60FPS Camera Easing + Viewport-Aware Tile Streaming)
    let animationFrameId: number;
    let lastTileUpdate = 0;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      if (cameraRef.current && rendererRef.current && sceneRef.current) {
        if (isUserInteractingRef.current) {
          latRef.current = THREE.MathUtils.lerp(latRef.current, targetLatRef.current, 0.45);
          lonRef.current = THREE.MathUtils.lerp(lonRef.current, targetLonRef.current, 0.45);
        } else {
          latRef.current = THREE.MathUtils.lerp(latRef.current, targetLatRef.current, 0.18);
          lonRef.current = THREE.MathUtils.lerp(lonRef.current, targetLonRef.current, 0.18);
        }
        latRef.current = Math.max(11, Math.min(72, latRef.current));

        const radLat = THREE.MathUtils.degToRad(latRef.current);
        const radLon = THREE.MathUtils.degToRad(lonRef.current);

        const targetX = 500 * Math.cos(radLat) * Math.sin(radLon);
        const targetY = 500 * Math.sin(radLat);
        const targetZ = 500 * Math.cos(radLat) * Math.cos(radLon);

        cameraRef.current.lookAt(targetX, targetY, targetZ);
        rendererRef.current.render(sceneRef.current, cameraRef.current);

        const headingNorm = Math.round(((lonRef.current % 360) + 360) % 360);
        if (Math.abs(headingNorm - lastHeadingStateRef.current) >= 1) {
          lastHeadingStateRef.current = headingNorm;
          const nowHeadingTime = performance.now();
          if (nowHeadingTime - lastHeadingUpdateTimeRef.current > 100) {
            lastHeadingUpdateTimeRef.current = nowHeadingTime;
            setCurrentHeading(headingNorm);
          }
        }

        // Ripple animation for active route chevron trail (soft forward ripple ~1.2s cycle, static if reduced motion)
        if (
          isRouteActive &&
          !isArrived &&
          activeChevronTrailMeshesRef.current.length > 0 &&
          !prefersReducedMotion &&
          isDocumentVisibleRef.current &&
          targetNextPathYaw !== null
        ) {
          const nowSec = performance.now() / 1000;
          const trailElements = computeChevronTrail({
            yaw: targetNextPathYaw,
            timeSeconds: nowSec,
            reducedMotion: false,
          });
          trailElements.forEach((elem, idx) => {
            const mesh = activeChevronTrailMeshesRef.current[idx];
            if (mesh && mesh.material) {
              (mesh.material as THREE.MeshBasicMaterial).opacity = elem.opacity;
            }
          });
        }

        // Throttled Direction Hint Computation with Hysteresis (at most 10 times per second, avoids per-frame React updates)
        if (targetNextPathYaw !== null && !isArrived && isRouteActive) {
          const nowHintTime = performance.now();
          if (nowHintTime - lastHintComputeTimeRef.current >= 100) {
            lastHintComputeTimeRef.current = nowHintTime;
            const hint = getDirectionHintWithHysteresis(
              headingNorm,
              targetNextPathYaw,
              wasShowingHintRef.current,
              50,
              35
            );
            wasShowingHintRef.current = hint.action !== 'ON_TRACK';
            setDirectionHint((prev) => {
              if (prev?.action === hint.action && prev?.side === hint.side) return prev;
              return hint;
            });
          }
        } else if (directionHint !== null) {
          wasShowingHintRef.current = false;
          setDirectionHint(null);
        }

        // Throttled camera orientation persistence during active user pan
        if (isUserInteractingRef.current) {
          const nowTime = performance.now();
          if (nowTime - lastCameraPersistTimeRef.current > 350) {
            lastCameraPersistTimeRef.current = nowTime;
            updatePersistedCameraState(lonRef.current, latRef.current, cameraRef.current?.fov);
          }
        }

        // Viewport-aware multi-resolution tile prioritization
        const now = performance.now();
        if (now - lastTileUpdate > 120) {
          lastTileUpdate = now;
          const manifest = activeManifestRef.current;
          if (manifest && tilesGroupRef.current && cameraRef.current) {
            const currentPitch = latRef.current;
            const fov = cameraRef.current.fov;
            const aspect = cameraRef.current.aspect || 1.6;

            const visibleCoords = PanoramaTileLoader.getVisibleTileCoords(
              manifest,
              3,
              headingNorm,
              currentPitch,
              fov,
              aspect
            );

            if (lastVisibleCountRef.current !== visibleCoords.length) {
              lastVisibleCountRef.current = visibleCoords.length;
              setVisibleTileCount(visibleCoords.length);
            }

            const visibleKeySet = new Set(visibleCoords.map((c) => `${c.row}_${c.col}`));

            // 1. Cull off-frustum unloaded patches to conserve GPU fill rate, but KEEP already-loaded high-res tiles visible
            tilesGroupRef.current.children.forEach((child) => {
              const mesh = child as THREE.Mesh;
              const r = mesh.userData?.row;
              const c = mesh.userData?.col;
              if (!visibleKeySet.has(`${r}_${c}`) && !mesh.userData?.loadedKey) {
                mesh.visible = false;
              }
            });

            // 2. Stream visible high-resolution tiles in priority order
            visibleCoords.forEach((coord) => {
              const patchMesh = tilesGroupRef.current?.children.find(
                (m) => (m as any).userData?.row === coord.row && (m as any).userData?.col === coord.col
              ) as THREE.Mesh | undefined;

              if (!patchMesh) return;

              const tileKey = `${manifest.panoramaId}_l3_${coord.row}_${coord.col}`;
              if (patchMesh.userData.loadedKey === tileKey && patchMesh.material) {
                patchMesh.visible = true;
                (patchMesh.material as THREE.MeshBasicMaterial).opacity = 1.0;
                return;
              }

              PanoramaTileLoader.loadTileTexture(manifest.panoramaId, 3, coord.row, coord.col).then(
                (texture) => {
                  if (!texture) return;
                  if (activeManifestRef.current?.panoramaId !== manifest.panoramaId) return;

                  const mat = patchMesh.material as THREE.MeshBasicMaterial;
                  mat.map = texture;
                  mat.color.setHex(0xffffff);
                  mat.opacity = 1.0;
                  mat.needsUpdate = true;
                  patchMesh.userData.loadedKey = tileKey;
                  patchMesh.visible = true;
                }
              );
            });
          }
        }
      }
    };
    animate();

    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // ── Multi-Touch Pinch-to-Zoom Gesture for Android / Mobile & Wheel for Desktop ──
    const container = containerRef.current;
    let initialTouchDist = 0;
    let initialFov = 62;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        isPinchingRef.current = true;
        isUserInteractingRef.current = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        initialTouchDist = Math.hypot(dx, dy);
        initialFov = cameraRef.current?.fov || 62;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && initialTouchDist > 0 && cameraRef.current) {
        if (e.cancelable) e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const currentDist = Math.hypot(dx, dy);
        if (currentDist > 0) {
          const pinchRatio = initialTouchDist / currentDist;
          const newFov = Math.max(34, Math.min(66, initialFov * pinchRatio));
          cameraRef.current.fov = newFov;
          cameraRef.current.updateProjectionMatrix();
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        initialTouchDist = 0;
        setTimeout(() => {
          isPinchingRef.current = false;
        }, 120);
        updatePersistedCameraState(targetLonRef.current, targetLatRef.current, cameraRef.current?.fov);
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (!cameraRef.current) return;
      e.preventDefault();
      const zoomDelta = e.deltaY * 0.04;
      const currentFov = cameraRef.current.fov;
      const targetFov = Math.max(34, Math.min(66, currentFov + zoomDelta));
      cameraRef.current.fov = targetFov;
      cameraRef.current.updateProjectionMatrix();
      updatePersistedCameraState(targetLonRef.current, targetLatRef.current, targetFov);
    };

    if (container) {
      container.addEventListener('touchstart', handleTouchStart, { passive: true });
      container.addEventListener('touchmove', handleTouchMove, { passive: false });
      container.addEventListener('touchend', handleTouchEnd, { passive: true });
      container.addEventListener('touchcancel', handleTouchEnd, { passive: true });
      container.addEventListener('wheel', handleWheel, { passive: false });
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      if (container) {
        container.removeEventListener('touchstart', handleTouchStart);
        container.removeEventListener('touchmove', handleTouchMove);
        container.removeEventListener('touchend', handleTouchEnd);
        container.removeEventListener('touchcancel', handleTouchEnd);
        container.removeEventListener('wheel', handleWheel);
      }
      if (rendererRef.current?.domElement && containerRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
      }
      nadirBlurRef.current?.dispose();
      nadirBlurRef.current = null;
      activeChevronTrailMeshesRef.current.forEach((mesh) => {
        mesh.geometry.dispose();
        if (mesh.material) {
          (mesh.material as THREE.Material).dispose();
        }
      });
      activeChevronTrailMeshesRef.current = [];
      sharedChevronTextureRef.current?.dispose();
      sharedChevronTextureRef.current = null;
      rendererRef.current?.dispose();
    };
  }, []);

  // ─────────────────────────────────────────────────────────────
  // 2. Texture Loading on Panorama Change (Smooth Ingestion + Lock Reset)
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sphereMeshRef.current) return;

    setIsTransitioning(true);

    let isMounted = true;

    // Reset tile meshes for new panorama node
    if (tilesGroupRef.current) {
      tilesGroupRef.current.children.forEach((c) => {
        c.visible = false;
        (c as any).userData.loadedKey = null;
      });
    }

    const applyReadyTexture = (tex: THREE.Texture) => {
      // Store ref so subscription callback can use it if sphere is blank
      applyReadyTextureRef.current = applyReadyTexture;
      // Two-layer heading model: calculate target camera orientation
      let targetHeading = panorama.heading || 0;

      // Check if this panorama has a physical tag matching the selected destination
      const nodeTags = getCustomPlaceTags(panorama.id);
      const destTag = resolveDestinationTag(
        selectedDestination,
        destinationLabel || activeNavigationRoute?.destinationTitle,
        panorama.id,
        nodeTags,
        verifiedPlacesAtPano
      );

      const isFinalDestination = Boolean(
        destTag && (
          (activeNavigationRoute && activeNavigationRoute.pathNodeIds[activeNavigationRoute.pathNodeIds.length - 1] === panorama.id) ||
          navigationStatus === 'ARRIVED' ||
          isArrived ||
          (!isNavigating && (selectedDestination || destinationLabel)) ||
          (selectedDestination?.nodeId && selectedDestination.nodeId === panorama.id)
        )
      );

      if (isInitialRestoreRef.current && restoredCameraState) {
        targetHeading = restoredCameraState.yaw;
        targetLatRef.current = restoredCameraState.pitch;
        isInitialRestoreRef.current = false;
      } else if (isFinalDestination && destTag) {
        // Direct arrival or destination jump: Face directly at the physical tag on the wall!
        targetHeading = destTag.yaw;
        targetLatRef.current = Math.max(-45, Math.min(45, destTag.pitch !== undefined ? destTag.pitch : 2));
      } else if (preferredArrivalYawRef.current !== null) {
        targetHeading = preferredArrivalYawRef.current;
        preferredArrivalYawRef.current = null;
      } else if (isRouteActive && currentStep) {
        if (currentStep.initialViewerYaw !== undefined) {
          targetHeading = currentStep.initialViewerYaw;
        } else if (currentStep.yaw !== undefined) {
          targetHeading = currentStep.yaw;
        }
      } else if (nextRouteHotspotYaw !== undefined) {
        targetHeading = nextRouteHotspotYaw;
      } else {
        // Check custom arrow arrival yaw or photo default angle
        const defaultAngle = (panorama as any).defaultCameraYaw ?? (CAMPUS_GRAPH_MAP.get(panorama.id) as any)?.defaultCameraYaw;
        const previousId = lastVisitedNodeIdRef.current;
        if (previousId) {
          const prevNode = CAMPUS_GRAPH_MAP.get(previousId);
          const incomingConn = prevNode?.connections?.find((c) => c.targetId === panorama.id);
          const explicitYaw = incomingConn?.targetYaw ?? incomingConn?.initialViewerYaw;
          if (explicitYaw !== undefined) {
            targetHeading = explicitYaw;
          } else if (defaultAngle !== undefined) {
            targetHeading = defaultAngle;
          } else {
            targetHeading = computeArrivalFacing(previousId, panorama.id);
          }
        } else if (defaultAngle !== undefined) {
          targetHeading = defaultAngle;
        } else if (nodeTags && nodeTags.length > 0) {
          // Immediately face the primary verified physical tag so the user sees it front and center
          targetHeading = nodeTags[0].yaw;
          targetLatRef.current = Math.max(-45, Math.min(45, nodeTags[0].pitch !== undefined ? nodeTags[0].pitch : 2));
        } else {
          const spots = panorama.hotspots || [];
          const forwardSpot =
            spots.find(
              (h) =>
                h.direction === 'straight' ||
                h.direction === 'slight-left' ||
                h.direction === 'slight-right' ||
                (h as any).type === 'forward'
            ) || spots[0];

          if (forwardSpot) {
            targetHeading = forwardSpot.yaw;
          }
        }
      }

      // Two-layer orientation: Calculate shortest rotational path so camera doesn't spin 360 degrees
      const startLon = lonRef.current;
      const startLat = latRef.current;
      const angleDiff = ((((targetHeading - (startLon % 360)) + 540) % 360) - 180);
      const destLon = startLon + angleDiff;

      targetLonRef.current = targetHeading;
      if (!isFinalDestination && !restoredCameraState) {
        targetLatRef.current = 12;
      }

      const baseMesh = sphereMeshRef.current;
      const fadeMesh = fadeSphereMeshRef.current;

      // Immediate swap for first initial load, or fast crossfade for subsequent navigation steps
      if (!fadeMesh || !baseMesh || !(baseMesh.material as THREE.MeshBasicMaterial).map) {
        if (baseMesh) {
          const mat = baseMesh.material as THREE.MeshBasicMaterial;
          mat.color.setHex(0xffffff);
          mat.map = tex;
          mat.needsUpdate = true;
        }
        nadirBlurRef.current?.setTexture(tex);
        lonRef.current = targetHeading;
        targetLonRef.current = targetHeading;
        latRef.current = 12;
        targetLatRef.current = 12;
        setIsTransitioning(false);
        setTransitionLocked(false);
        commitCurrentPanorama(panorama.id, {
          yaw: targetHeading,
          pitch: targetLatRef.current,
          fov: cameraRef.current?.fov || 62,
        });
      } else {
        // IMMEDIATELY snap camera to arrival yaw — NO rotation animation
        lonRef.current = targetHeading;
        targetLonRef.current = targetHeading;
        latRef.current = 12;
        targetLatRef.current = 12;

        // Fast opacity-only crossfade (no camera rotation, no FOV pulse)
        const fMat = fadeMesh.material as THREE.MeshBasicMaterial;
        fMat.color.setHex(0xffffff);
        fMat.map = tex;
        fMat.transparent = true;
        fMat.opacity = 0;
        fMat.needsUpdate = true;
        fadeMesh.visible = true;
        nadirBlurRef.current?.startFade(tex);

        const prefersReducedMotion = typeof window !== 'undefined' &&
          window.matchMedia &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const duration = prefersReducedMotion ? 0 : 200; // <= 250ms cross-fade during active route, 0ms if reduced motion

        if (duration === 0) {
          if (baseMesh) {
            const bMat = baseMesh.material as THREE.MeshBasicMaterial;
            bMat.color.setHex(0xffffff);
            bMat.map = tex;
            bMat.needsUpdate = true;
          }
          if (fadeMesh) {
            fadeMesh.visible = false;
            (fadeMesh.material as THREE.MeshBasicMaterial).opacity = 0;
          }
          nadirBlurRef.current?.setTexture(tex);
          setIsTransitioning(false);
          setTransitionLocked(false);
          commitCurrentPanorama(panorama.id, {
            yaw: targetHeading,
            pitch: targetLatRef.current,
            fov: cameraRef.current?.fov || 72,
          });
        } else {
          const startTime = performance.now();
          const animateFade = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1.0);
            // Simple ease-out quad for fast fade-in
            const ease = 1 - (1 - progress) * (1 - progress);

            if (fadeMesh) {
              (fadeMesh.material as THREE.MeshBasicMaterial).opacity = ease;
            }
            nadirBlurRef.current?.setFadeProgress(ease);

            if (progress < 1.0) {
              requestAnimationFrame(animateFade);
            } else {
              // Finalize: swap texture to base sphere
              if (baseMesh) {
                const bMat = baseMesh.material as THREE.MeshBasicMaterial;
                bMat.color.setHex(0xffffff);
                bMat.map = tex;
                bMat.needsUpdate = true;
              }
              if (fadeMesh) {
                fadeMesh.visible = false;
                (fadeMesh.material as THREE.MeshBasicMaterial).opacity = 0;
              }
              nadirBlurRef.current?.endFade(tex);
              setIsTransitioning(false);
              setTransitionLocked(false);
              commitCurrentPanorama(panorama.id, {
                yaw: targetHeading,
                pitch: targetLatRef.current,
                fov: cameraRef.current?.fov || 72,
              });
            }
          };

          requestAnimationFrame(animateFade);
        }
      }
    };

    // Safety timeout: If texture loading gets permanently stuck, auto-unlock after 5 seconds
    const safetyTimeout = setTimeout(() => {
      setIsTransitioning(false);
      setTransitionLocked(false);
    }, 5000);

    // Use the actual image path from the graph (e.g. /assets/panoramas/01_OUTDOOR/IMG_..._001.jpg)
    // NOT the fabricated /assets/panoramas/${panorama.id}.jpg which doesn't exist on disk.
    const correctImagePath = panorama.imageUrl || '';

    let active = true;

    async function initLoad() {
      // 1. Check if multi-resolution tile pyramid exists
      const manifest = await PanoramaTileLoader.fetchManifest(panorama.id);
      if (!active || !isMounted) return;

      activeManifestRef.current = manifest;
      setCurrentLODLevel(manifest ? 3 : 0);

      // 2. Base texture: load the full high-resolution panorama image directly.
      // This guarantees the base sphere is ALWAYS 100% sharp from edge to edge (4096x2048),
      // completely eliminating any blurry patches, tile seams, or culling gaps.
      const primaryUrl = correctImagePath || (manifest ? PanoramaTileLoader.getPreviewUrl(panorama.id) : '');
      const fallbackUrl = manifest ? PanoramaTileLoader.getPreviewUrl(panorama.id) : correctImagePath;

      const cachedTex = PanoramaResourceManager.getCachedTexture(panorama.id);
      if (cachedTex) {
        clearTimeout(safetyTimeout);
        applyReadyTexture(cachedTex);
        return;
      }

      loadEquirectangularTexture(
        primaryUrl,
        (tex) => {
          if (!active || !isMounted) return;
          clearTimeout(safetyTimeout);
          applyReadyTexture(tex);
        },
        () => {
          if (!active || !isMounted) return;
          // Primary failed; try fallback (actual image path if different from primary)
          if (fallbackUrl && fallbackUrl !== primaryUrl) {
            loadEquirectangularTexture(
              fallbackUrl,
              (tex) => {
                if (!active || !isMounted) return;
                clearTimeout(safetyTimeout);
                applyReadyTexture(tex);
              },
              () => {
                if (!active || !isMounted) return;
                // Both direct loads failed — wait for PanoramaResourceManager (uses correct path)
                waitForResourceManager();
              }
            );
          } else {
            // No distinct fallback — wait for PanoramaResourceManager
            waitForResourceManager();
          }
        }
      );
    }

    // Final safety net: PanoramaResourceManager.preloadPanorama() runs in parallel
    // with the correct imageUrl. Subscribe and apply its result when ready.
    function waitForResourceManager() {
      if (!active || !isMounted) return;
      // Check if ResourceManager already finished while we were loading
      const readyTex = PanoramaResourceManager.getCachedTexture(panorama.id);
      if (readyTex) {
        clearTimeout(safetyTimeout);
        applyReadyTexture(readyTex);
        return;
      }
      // Subscribe and wait for it
      setUnreadyNotice('Loading panoramic view…');
      const unsub = PanoramaResourceManager.subscribe(panorama.id, (state) => {
        if (!active || !isMounted) { unsub(); return; }
        if (state === 'READY') {
          unsub();
          const tex = PanoramaResourceManager.getCachedTexture(panorama.id);
          if (tex) {
            clearTimeout(safetyTimeout);
            applyReadyTexture(tex);
            setUnreadyNotice(null);
          }
        } else if (state === 'FAILED') {
          unsub();
          clearTimeout(safetyTimeout);
          setIsTransitioning(false);
          setTransitionLocked(false);
          setUnreadyNotice('Network slow. Retrying panoramic view…');
          setTimeout(() => setUnreadyNotice(null), 3000);
          // Retry one more time after a brief pause
          setTimeout(() => {
            if (!active || !isMounted) return;
            PanoramaResourceManager.preloadPanorama(panorama.id, correctImagePath, true);
          }, 1500);
        }
      });
    }

    initLoad();

    return () => {
      active = false;
      isMounted = false;
      clearTimeout(safetyTimeout);
    };
  }, [
    panorama.id,
    panorama.imageUrl,
  ]);

  // ─────────────────────────────────────────────────────────────
  // 2B. Proactive Multi-Node Preloading (Preload all outgoing neighbors & route steps)
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const targetsToPreload = new Set<string>();

    // 1. Outgoing graph connections for current node
    const fromNode = CAMPUS_GRAPH_MAP.get(panorama.id);
    if (fromNode?.connections) {
      fromNode.connections.forEach((c) => {
        if (c.targetId) targetsToPreload.add(c.targetId);
      });
    }

    // 2. Hotspots
    if (Array.isArray(panorama.hotspots)) {
      panorama.hotspots.forEach((h) => {
        if (h.targetPanoId) targetsToPreload.add(h.targetPanoId);
      });
    }

    // 3. Active navigation upcoming route steps
    if (activeNavigationRoute?.pathNodeIds && currentRouteIndex >= 0) {
      const next1 = activeNavigationRoute.pathNodeIds[currentRouteIndex + 1];
      const next2 = activeNavigationRoute.pathNodeIds[currentRouteIndex + 2];
      if (next1) targetsToPreload.add(next1);
      if (next2) targetsToPreload.add(next2);
    }

    // Preload each target in parallel (cache-only, no duplicate Image objects)
    targetsToPreload.forEach((targetId) => {
      const targetNode = CAMPUS_GRAPH_MAP.get(targetId);
      if (targetNode?.imagePath) {
        const clean = targetNode.imagePath.startsWith('/') ? targetNode.imagePath : '/' + targetNode.imagePath;
        if (!textureCacheRef.current.has(clean)) {
          loadEquirectangularTexture(clean, () => {}, () => {});
        }
      }
    });
  }, [panorama.id, activeNavigationRoute, currentRouteIndex, loadEquirectangularTexture]);

  // ─────────────────────────────────────────────────────────────
  // 3. Build Google Maps Directional Waypoints & Place Labels
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sceneRef.current || !waypointsGroupRef.current || !placesGroupRef.current) return;

    // Exact next target node ID from the authoritative route (prioritizing current panorama's position in route)
    let authoritativeNextNodeId: string | null = null;
    if (activeNavigationRoute && activeNavigationRoute.pathNodeIds) {
      const pIdx = activeNavigationRoute.pathNodeIds.indexOf(panorama.id);
      if (pIdx !== -1 && pIdx + 1 < activeNavigationRoute.pathNodeIds.length) {
        authoritativeNextNodeId = activeNavigationRoute.pathNodeIds[pIdx + 1];
      }
    }
    if (!authoritativeNextNodeId && currentStep?.targetNodeId) {
      authoritativeNextNodeId = currentStep.targetNodeId;
    }

    // If arriving at final destination of route, focus camera on destination POI
    if (isRouteActive && isArrived) {
      const matchedPlace = currentPlaces.find(
        (p) =>
          destinationLabel &&
          (p.name.toLowerCase().includes(destinationLabel.toLowerCase()) ||
            destinationLabel.toLowerCase().includes(p.name.toLowerCase()))
      );
      if (matchedPlace) {
        const destYaw = matchedPlace.position3D.yaw;
        lonRef.current = destYaw;
        targetLonRef.current = destYaw;
      }
    }

    // Clear previous waypoints (dispose geometries, materials and textures)
    if (activeChevronTrailMeshesRef.current.length > 0) {
      activeChevronTrailMeshesRef.current.forEach((mesh) => {
        mesh.geometry.dispose();
        if (mesh.material) {
          (mesh.material as THREE.Material).dispose();
        }
      });
      activeChevronTrailMeshesRef.current = [];
    }

    const wpGroup = waypointsGroupRef.current;
    while (wpGroup.children.length > 0) {
      const child = wpGroup.children[0] as any;
      if (child.geometry) {
        child.geometry.dispose();
      }
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m: THREE.Material) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
      wpGroup.remove(child);
    }

    // Clear previous place markers (dispose materials and textures)
    const plGroup = placesGroupRef.current;
    while (plGroup.children.length > 0) {
      const child = plGroup.children[0] as THREE.Sprite;
      if (child.material) {
        const mat = child.material as THREE.SpriteMaterial;
        if (mat.map) mat.map.dispose();
        mat.dispose();
      }
      plGroup.remove(child);
    }

    // ─────────────────────────────────────────────────────────
    // A. 3D Ground-Projected Route Chevron Trail (4 Meshes along route direction)
    // ─────────────────────────────────────────────────────────
    (panorama.hotspots || []).forEach((spot) => {
      const isVisible = shouldRenderNavigationArrow({
        isRouteActive,
        spot,
        authoritativeNextNodeId,
        nextRouteHotspotYaw,
        currentStepYaw: currentStep?.yaw,
      });

      if (!isVisible) {
        return;
      }

      const isPrimaryNextStep = true;
      const isTargetReady = PanoramaResourceManager.isPanoramaReady(spot.targetPanoId);

      const trailElements = computeChevronTrail({
        yaw: spot.yaw,
        count: 4,
        timeSeconds: performance.now() / 1000,
        reducedMotion: prefersReducedMotion,
      });

      const sharedTexture = getSharedChevronTexture();
      const radYaw = THREE.MathUtils.degToRad(spot.yaw);

      // Ground orientation basis from shared single source of truth (apex points along route, front face upward, 28° ground tilt)
      const chevronTransform = computeChevronTransform(spot.yaw, 28);
      const rotMatrix = new THREE.Matrix4().fromArray(chevronTransform.elements);

      // Restored previous clean dimensions
      const baseWidth = 34;
      const baseHeight = 17;

      const trailMeshes: THREE.Mesh[] = [];

      trailElements.forEach((elem) => {
        const radPitch = THREE.MathUtils.degToRad(elem.pitch);
        const x = elem.distance * Math.cos(radPitch) * Math.sin(radYaw);
        const y = elem.distance * Math.sin(radPitch);
        const z = elem.distance * Math.cos(radPitch) * Math.cos(radYaw);

        const geo = new THREE.PlaneGeometry(baseWidth * elem.scale, baseHeight * elem.scale);
        const mat = new THREE.MeshBasicMaterial({
          map: sharedTexture,
          transparent: true,
          opacity: elem.opacity,
          depthTest: false,
          side: THREE.DoubleSide,
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, z);
        mesh.setRotationFromMatrix(rotMatrix);
        mesh.userData = {
          hotspot: spot,
          isWaypoint: true,
          isPrimaryNextStep,
          isTargetReady,
          trailIndex: elem.index,
        };
        wpGroup.add(mesh);
        trailMeshes.push(mesh);
      });

      activeChevronTrailMeshesRef.current = trailMeshes;

      // Large invisible tap target plane covering the entire trail so clicking advances the route
      const tapGeo = new THREE.PlaneGeometry(45, 140);
      const tapMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
      const tapMesh = new THREE.Mesh(tapGeo, tapMat);
      const tapPitch = THREE.MathUtils.degToRad(-17);
      const tapX = 180 * Math.cos(tapPitch) * Math.sin(radYaw);
      const tapY = 180 * Math.sin(tapPitch);
      const tapZ = 180 * Math.cos(tapPitch) * Math.cos(radYaw);
      tapMesh.position.set(tapX, tapY, tapZ);
      tapMesh.setRotationFromMatrix(rotMatrix);
      tapMesh.userData = {
        hotspot: spot,
        isWaypoint: true,
        isPrimaryNextStep,
        isTargetReady,
        isTapTarget: true,
      };
      wpGroup.add(tapMesh);
    });

    // ─────────────────────────────────────────────────────────
    // B. 3D Floating Place & Landmark Labels (Google Maps POIs)
    // ─────────────────────────────────────────────────────────
    const nodeTags = getCustomPlaceTags(panorama.id);
    const localTagTexts = new Set<string>();

    // 1. Render Local Room & Place Tags (Anchored at exact yaw, pitch, distance)
    if (nodeTags && nodeTags.length > 0) {
      nodeTags.forEach((tag) => {
        localTagTexts.add(tag.text.toLowerCase());
        const tagColor = tag.color || getCategoryColor(tag.category);
        const tagSprite = createCleanTextTagSprite(tag.text, tagColor, false, tag.category);
        if (tagSprite) {
          const yawDeg = tag.yaw ?? 0;
          const pitchDeg = tag.pitch ?? 0;
          const dist = tag.distance ?? 180;

          const radYaw = THREE.MathUtils.degToRad(yawDeg);
          const radPitch = THREE.MathUtils.degToRad(pitchDeg);

          const x = dist * Math.cos(radPitch) * Math.sin(radYaw);
          const y = dist * Math.sin(radPitch);
          const z = dist * Math.cos(radPitch) * Math.cos(radYaw);

          tagSprite.position.set(x, y, z);
          tagSprite.userData = {
            isCustomTag: true,
            tag,
          };
          plGroup.add(tagSprite);
        }
      });
    }

    // 2. Distant Corridor Visibility: Render floating badges for tags at connected neighbor nodes ahead
    (panorama.hotspots || []).forEach((spot) => {
      const neighborNodeId = spot.targetPanoId;
      if (!neighborNodeId) return;

      const neighborTags = getCustomPlaceTags(neighborNodeId);
      if (neighborTags && neighborTags.length > 0) {
        let tagStackIdx = 0;
        neighborTags.forEach((ntag) => {
          // Strictly only render distant floating badge if explicitly marked as visibleFromDistance === true
          // This prevents classroom/office/lab tags from randomly hovering over corridors
          if (ntag.visibleFromDistance !== true) return;
          if (localTagTexts.has(ntag.text.toLowerCase())) return;

          const distantColor = ntag.color || getCategoryColor(ntag.category);
          const distantSprite = createCleanTextTagSprite(
            ntag.text,
            distantColor,
            true,
            ntag.category
          );

          if (distantSprite) {
            // Position along connecting corridor chevron (spot.yaw), hovering gracefully above arrow
            const yawDeg = spot.yaw;
            const basePitch = Math.max(-2, spot.pitch + 14);
            const pitchDeg = basePitch + tagStackIdx * 6.5;
            const dist = 260; // Further down the corridor

            const radYaw = THREE.MathUtils.degToRad(yawDeg);
            const radPitch = THREE.MathUtils.degToRad(pitchDeg);

            const x = dist * Math.cos(radPitch) * Math.sin(radYaw);
            const y = dist * Math.sin(radPitch);
            const z = dist * Math.cos(radPitch) * Math.cos(radYaw);

            distantSprite.position.set(x, y, z);
            distantSprite.userData = {
              isDistantTag: true,
              tag: ntag,
              hotspot: spot,
            };
            plGroup.add(distantSprite);
            tagStackIdx++;
          }
        });
      }
    });
  }, [
    currentPlaces,
    currentStep,
    destinationLabel,
    isArrived,
    isRouteActive,
    nextRouteHotspotYaw,
    panorama.heading,
    panorama.hotspots,
    panorama.id,
    tagsUpdateCounter,
    verifiedPlacesAtPano,
  ]);

  // ─────────────────────────────────────────────────────────────
  // 4. Pointer Interaction & Raycasting
  // ─────────────────────────────────────────────────────────────
  const onPointerDown = (event: React.PointerEvent) => {
    if (isPinchingRef.current) return;
    isUserInteractingRef.current = true;
    onPointerDownPointerXRef.current = event.clientX;
    onPointerDownPointerYRef.current = event.clientY;
    onPointerDownLonRef.current = targetLonRef.current;
    onPointerDownLatRef.current = targetLatRef.current;
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (isPinchingRef.current) return;
    if (isUserInteractingRef.current) {
      const deltaX = event.clientX - onPointerDownPointerXRef.current;
      const deltaY = event.clientY - onPointerDownPointerYRef.current;
      // Google Street View rotation sensitivity: fast, agile 1:1 tracking
      targetLonRef.current = onPointerDownLonRef.current + deltaX * 0.38;
      // Natural vertical pitch: dragging down tilts up, dragging up tilts down, clamped to 11..72 so photographer head is never visible
      targetLatRef.current = Math.max(11, Math.min(72, onPointerDownLatRef.current + deltaY * 0.35));
    }

    if (!containerRef.current || !cameraRef.current || !waypointsGroupRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.params.Sprite = { threshold: 35 };
    raycaster.setFromCamera(mouse, cameraRef.current);

    const interactiveObjects = [
      ...(waypointsGroupRef.current?.children || []),
      ...(placesGroupRef.current?.children || []),
    ];
    const intersects = raycaster.intersectObjects(interactiveObjects, true);

    if (intersects.length > 0) {
      const obj = intersects[0].object;
      if (obj.userData?.isWaypoint) {
        setHoveredHotspot(obj.userData.hotspot);
        setHoveredPlace(null);
      } else if (obj.userData?.isDistantTag) {
        setHoveredHotspot(obj.userData.hotspot);
        setHoveredPlace(null);
      } else if (obj.userData?.isPlace) {
        setHoveredPlace(obj.userData.place);
        setHoveredHotspot(null);
      }
    } else {
      setHoveredHotspot(null);
      setHoveredPlace(null);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Google Street View Camera Push / Smooth Forward Transition
  // ─────────────────────────────────────────────────────────────
  const handleNavigateWithPushAnimation = (targetPanoId: string, arrivalYaw?: number) => {
    if (transitionLocked) return;
    setIsTransitioning(true);
    setTransitionLocked(true);
    const fromPanoId = panorama.id;
    lastVisitedNodeIdRef.current = fromPanoId;

    let targetFacing = arrivalYaw;
    if (targetFacing === undefined) {
      targetFacing = computeArrivalFacing(fromPanoId, targetPanoId);
    }

    preferredArrivalYawRef.current = targetFacing;

    // Maintain balanced camera FOV on arrow navigation
    if (cameraRef.current) {
      cameraRef.current.fov = Math.max(35, Math.min(76, cameraRef.current.fov || 72));
      cameraRef.current.updateProjectionMatrix();
    }

    onSelectPanorama(targetPanoId);
  };

  const onPointerUp = (event: React.PointerEvent) => {
    if (isPinchingRef.current) {
      isUserInteractingRef.current = false;
      return;
    }
    const deltaX = Math.abs(event.clientX - onPointerDownPointerXRef.current);
    const deltaY = Math.abs(event.clientY - onPointerDownPointerYRef.current);
    isUserInteractingRef.current = false;
    updatePersistedCameraState(targetLonRef.current, targetLatRef.current, cameraRef.current?.fov);
    const headingNorm = Math.round(((targetLonRef.current % 360) + 360) % 360);
    setCameraHeading(headingNorm);

    // Only trigger click or double-tap if finger/pointer didn't drag/pan
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
    const tapThreshold = isMobile ? 16 : 10;

    if (deltaX >= tapThreshold || deltaY >= tapThreshold) {
      // User was panning or rotating the sphere. Reset tap timer.
      lastTapTimeRef.current = 0;
      return;
    }

    if (!containerRef.current || !cameraRef.current || transitionLocked) return;

    const rect = containerRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.params.Sprite = { threshold: 38 }; // Generous touch target for arrows
    raycaster.setFromCamera(mouse, cameraRef.current);

    const interactiveObjects = [
      ...(waypointsGroupRef.current?.children || []),
      ...(placesGroupRef.current?.children || []),
    ];
    const intersects = raycaster.intersectObjects(interactiveObjects, true);

    // ─────────────────────────────────────────────────────────────
    // CASE 1: SINGLE TAP ON INTERACTIVE HOTSPOT SPRITE OR PLACE POI
    // Responds immediately with zero delay
    // ─────────────────────────────────────────────────────────────
    if (intersects.length > 0) {
      lastTapTimeRef.current = 0; // Reset double-tap sequence on explicit sprite click
      const obj = intersects[0].object;

      if (obj.userData?.isWaypoint) {
        const spot = obj.userData.hotspot as PanoramaHotspot;
        const targetId = spot.targetPanoId;

        // REQUIREMENT 1: NEVER SHOW A BROKEN NEXT PANORAMA
        if (!PanoramaResourceManager.isPanoramaReady(targetId)) {
          PanoramaResourceManager.preloadPanorama(targetId, undefined, true);
          setUnreadyNotice('Preparing next view… please wait');
          if (unreadyNoticeTimeoutRef.current) clearTimeout(unreadyNoticeTimeoutRef.current);
          unreadyNoticeTimeoutRef.current = setTimeout(() => setUnreadyNotice(null), 2000);
          return;
        }

        const explicitFacing = (spot as any).targetYaw ?? (spot as any).initialViewerYaw;
        const targetFacing = explicitFacing !== undefined
          ? explicitFacing
          : computeArrivalFacing(panorama.id, spot.targetPanoId, spot.yaw);
        preferredArrivalYawRef.current = targetFacing;

        if (isRouteActive && obj.userData.isPrimaryNextStep) {
          advanceNavigationStep();
        } else {
          handleNavigateWithPushAnimation(spot.targetPanoId, targetFacing);
        }
        return;
      } else if (obj.userData?.isDistantTag) {
        const spot = obj.userData.hotspot as PanoramaHotspot;
        if (spot) {
          const targetId = spot.targetPanoId;
          if (!PanoramaResourceManager.isPanoramaReady(targetId)) {
            PanoramaResourceManager.preloadPanorama(targetId, undefined, true);
            setUnreadyNotice('Preparing next view… please wait');
            if (unreadyNoticeTimeoutRef.current) clearTimeout(unreadyNoticeTimeoutRef.current);
            unreadyNoticeTimeoutRef.current = setTimeout(() => setUnreadyNotice(null), 2000);
            return;
          }
          const explicitFacing = (spot as any).targetYaw ?? (spot as any).initialViewerYaw;
          const targetFacing = explicitFacing !== undefined
            ? explicitFacing
            : computeArrivalFacing(panorama.id, spot.targetPanoId, spot.yaw);
          preferredArrivalYawRef.current = targetFacing;
          handleNavigateWithPushAnimation(spot.targetPanoId, targetFacing);
        }
        return;
      } else if (obj.userData?.isPlace) {
        setSelectedPlaceInfo(obj.userData.place as CampusPlace);
        return;
      }
    }

    // ─────────────────────────────────────────────────────────────
    // CASE 2: STREET VIEW-STYLE DOUBLE-TAP ON ROAD / CORRIDOR
    // ─────────────────────────────────────────────────────────────
    const now = performance.now();
    const timeSinceLastTap = now - lastTapTimeRef.current;
    const distFromLastTap = Math.hypot(
      event.clientX - lastTapCoordsRef.current.x,
      event.clientY - lastTapCoordsRef.current.y
    );

    const isDoubleTap = timeSinceLastTap > 40 && timeSinceLastTap < 380 && distFromLastTap < 45;

    if (!isDoubleTap) {
      // First tap: register timestamp & coordinates, waiting for potential 2nd tap
      lastTapTimeRef.current = now;
      lastTapCoordsRef.current = { x: event.clientX, y: event.clientY };
      return;
    }

    // Verified double-tap: reset timer so subsequent tap won't double-trigger
    lastTapTimeRef.current = 0;

    // 1. Raycast into 3D world space to obtain exact spherical angles (yaw & pitch)
    const rayDir = raycaster.ray.direction.clone().normalize();
    const rayLat = Math.asin(Math.max(-1, Math.min(1, rayDir.y))) * (180 / Math.PI);
    const rayLon = ((Math.atan2(rayDir.x, rayDir.z) * (180 / Math.PI)) % 360 + 360) % 360;

    // 2. Validate Ground Pitch: Must be in road / corridor ground area
    // rayLat < -60: straight down at nadir/shoes (invalid)
    // rayLat > 15: looking up at sky, ceiling, or upper trees (invalid)
    if (rayLat < -60 || rayLat > 15) {
      // A DOUBLE-TAP ON AN INVALID AREA -> no navigation
      return;
    }

    // 3. Directional Activation: Match against verified connections
    const hotspots = (panorama.hotspots || []).filter((h) => Boolean(h.targetPanoId));
    if (hotspots.length === 0) return;

    let bestSpot: PanoramaHotspot | null = null;
    let minDiffYaw = Infinity;
    const MAX_ANGULAR_TOLERANCE = 38; // 38-degree activation cone for paths

    for (const spot of hotspots) {
      const diffYaw = Math.abs(((rayLon - spot.yaw + 540) % 360) - 180);
      if (diffYaw <= MAX_ANGULAR_TOLERANCE && diffYaw < minDiffYaw) {
        minDiffYaw = diffYaw;
        bestSpot = spot;
      }
    }

    // If no verified path exists in this direction (e.g. wall, empty space, bushes)
    if (!bestSpot) {
      // A DOUBLE-TAP ON AN INVALID AREA -> no navigation
      return;
    }

    // 4. SLOW INTERNET: Strict "Next Panorama Ready" check
    const targetId = bestSpot.targetPanoId;
    if (!PanoramaResourceManager.isPanoramaReady(targetId)) {
      PanoramaResourceManager.preloadPanorama(targetId, undefined, true);
      setUnreadyNotice('Preparing next view… please wait');
      if (unreadyNoticeTimeoutRef.current) clearTimeout(unreadyNoticeTimeoutRef.current);
      unreadyNoticeTimeoutRef.current = setTimeout(() => setUnreadyNotice(null), 2000);
      return;
    }

    // 5. Google Street View ground pulse ripple animation
    setActiveRipple({ x: event.clientX, y: event.clientY, id: Date.now() });
    setTimeout(() => setActiveRipple(null), 450);

    // 6. Smooth forward transition facing the travel direction
    const authoritativeNextNodeId = isRouteActive && currentStep?.targetNodeId ? currentStep.targetNodeId : null;
    const isPrimaryNextStep = Boolean(
      (authoritativeNextNodeId && targetId.toLowerCase() === authoritativeNextNodeId.toLowerCase()) ||
      (nextRouteHotspotYaw !== undefined && Math.abs(bestSpot.yaw - nextRouteHotspotYaw) < 25)
    );

    const explicitFacing = (bestSpot as any).targetYaw ?? (bestSpot as any).initialViewerYaw;
    const targetFacing = explicitFacing !== undefined
      ? explicitFacing
      : computeArrivalFacing(panorama.id, targetId, bestSpot.yaw);

    preferredArrivalYawRef.current = targetFacing;

    if (isRouteActive && isPrimaryNextStep) {
      advanceNavigationStep();
    } else {
      handleNavigateWithPushAnimation(targetId, targetFacing);
    }
  };

  const onWheel = (event: React.WheelEvent) => {
    if (!cameraRef.current) return;
    cameraRef.current.fov = Math.max(34, Math.min(66, cameraRef.current.fov + event.deltaY * 0.05));
    cameraRef.current.updateProjectionMatrix();
    updatePersistedCameraState(targetLonRef.current, targetLatRef.current, cameraRef.current.fov);
  };

  const handleZoomIn = () => {
    if (!cameraRef.current) return;
    cameraRef.current.fov = Math.max(34, cameraRef.current.fov - 8);
    cameraRef.current.updateProjectionMatrix();
    updatePersistedCameraState(targetLonRef.current, targetLatRef.current, cameraRef.current.fov);
  };

  const handleZoomOut = () => {
    if (!cameraRef.current) return;
    cameraRef.current.fov = Math.min(66, cameraRef.current.fov + 8);
    cameraRef.current.updateProjectionMatrix();
    updatePersistedCameraState(targetLonRef.current, targetLatRef.current, cameraRef.current.fov);
  };

  // ─────────────────────────────────────────────────────────────
  // Keyboard Controls: Arrow Keys / WASD rotate/tilt, +/- zoom, Space walk
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement as HTMLElement)?.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag)) return;

      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          targetLonRef.current -= 6;
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          targetLonRef.current += 6;
          break;
        case 'ArrowUp':
        case 'w':
        case 'W':
          targetLatRef.current = Math.min(72, targetLatRef.current + 5);
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          targetLatRef.current = Math.max(11, targetLatRef.current - 5);
          break;
        case '+':
        case '=':
          handleZoomIn();
          break;
        case '-':
        case '_':
          handleZoomOut();
          break;
        case 'Enter':
        case ' ':
          if (!transitionLocked) {
            if (isRouteActive) {
              advanceNavigationStep();
            } else {
              const forwardSpot = (panorama.hotspots || []).find(
                (h) => h.direction === 'straight' || (h as any).type === 'forward'
              ) || panorama.hotspots[0];
              if (forwardSpot && PanoramaResourceManager.isPanoramaReady(forwardSpot.targetPanoId)) {
                const explicitFacing = (forwardSpot as any).targetYaw ?? (forwardSpot as any).initialViewerYaw;
                const targetFacing = explicitFacing !== undefined
                  ? explicitFacing
                  : computeArrivalFacing(panorama.id, forwardSpot.targetPanoId, forwardSpot.yaw);
                handleNavigateWithPushAnimation(forwardSpot.targetPanoId, targetFacing);
              }
            }
          }
          break;
        case 'Escape':
          if (selectedPlaceInfo) setSelectedPlaceInfo(null);
          else if (showZonePicker) setShowZonePicker(false);
          else if (showFreshersGuide) setShowFreshersGuide(false);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    advanceNavigationStep,
    isRouteActive,
    panorama.hotspots,
    panorama.id,
    selectedPlaceInfo,
    showFreshersGuide,
    showZonePicker,
    transitionLocked,
  ]);

  // ─────────────────────────────────────────────────────────────
  // 5. Gyroscope Sensor Support
  // ─────────────────────────────────────────────────────────────
  const toggleGyroscope = async () => {
    if (isGyroActive) {
      setIsGyroActive(false);
      window.removeEventListener('deviceorientation', handleDeviceOrientation);
      return;
    }

    if (typeof (DeviceOrientationEvent as any)?.requestPermission === 'function') {
      try {
        const response = await (DeviceOrientationEvent as any).requestPermission();
        if (response === 'granted') {
          setHasGyroPermission(true);
          setIsGyroActive(true);
          window.addEventListener('deviceorientation', handleDeviceOrientation);
        }
      } catch (e) {
        console.warn('Gyroscope permission denied:', e);
      }
    } else {
      setHasGyroPermission(true);
      setIsGyroActive(true);
      window.addEventListener('deviceorientation', handleDeviceOrientation);
    }
  };

  const handleDeviceOrientation = useCallback((event: DeviceOrientationEvent) => {
    if (event.alpha !== null && event.beta !== null && event.gamma !== null) {
      gyroAlphaRef.current = event.alpha;
      gyroBetaRef.current = event.beta;
      gyroGammaRef.current = event.gamma;

      targetLonRef.current = 360 - event.alpha;
      targetLatRef.current = Math.max(2, Math.min(75, (event.beta - 90) * 0.8));
    }
  }, []);

  const resetCompassToNorth = () => {
    targetLonRef.current = 0;
    targetLatRef.current = 2;
  };

  const handleLiveGPSClick = async () => {
    setIsLocatingGPS(true);
    await requestLiveGPSLocation();
    setIsLocatingGPS(false);
  };

  // Primary hotspot fallback for non-route exploration
  const primarySpot = panorama.hotspots[0];
  const isJunction = panorama.hotspots.length > 1;

  return (
    <div className="relative w-full h-full bg-slate-950 select-none overflow-hidden touch-none font-sans">
      {/* 360 WebGL Viewport */}
      <div
        ref={containerRef}
        className="w-full h-full cursor-grab active:cursor-grabbing touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
      />

      {/* Google Street View Double-Tap Ground Ripple Effect */}
      {activeRipple && (
        <div
          key={activeRipple.id}
          className="pointer-events-none fixed z-30 -translate-x-1/2 -translate-y-1/2"
          style={{ left: activeRipple.x, top: activeRipple.y }}
        >
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-white/90 bg-white/20 shadow-[0_0_24px_rgba(255,255,255,0.85)] animate-ping" />
        </div>
      )}

      {/* Smooth Crossfade Screen */}
      <div
        className={`absolute inset-0 bg-slate-950 pointer-events-none transition-opacity duration-300 opacity-0`}
      />

      {/* Floating Viewport Zoom Controls (+ / -) - Hidden during active route */}
      {(!isRouteActive || isArrived) && (
        <div className="absolute right-3.5 sm:right-5 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-2 pointer-events-auto select-none">
          <button
            onClick={handleZoomIn}
            className="w-10 h-10 rounded-full bg-white/95 hover:bg-white text-slate-800 shadow-xl border border-slate-200/90 backdrop-blur-md flex items-center justify-center transition-all active:scale-90 cursor-pointer group"
            title="Zoom In"
            aria-label="Zoom In"
          >
            <Plus size={18} className="stroke-[2.5] text-slate-700 group-hover:text-blue-600 transition-colors" />
          </button>
          <button
            onClick={handleZoomOut}
            className="w-10 h-10 rounded-full bg-white/95 hover:bg-white text-slate-800 shadow-xl border border-slate-200/90 backdrop-blur-md flex items-center justify-center transition-all active:scale-90 cursor-pointer group"
            title="Zoom Out (Wider View)"
            aria-label="Zoom Out"
          >
            <Minus size={18} className="stroke-[2.5] text-slate-700 group-hover:text-blue-600 transition-colors" />
          </button>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────
          WAYCAMPUS NAVIGATION TOP BAR & DESTINATION HUD (MATCHING REFERENCE)
      ───────────────────────────────────────────────────────── */}
      {isNavigating && isRouteActive && currentStep && !isArrived ? (
        /* Immersive Route Mode: Minimal Top Next-Step Card + Round Exit (X) Button (Matching user mockup) */
        <div className="absolute top-0 left-0 right-0 z-30 pointer-events-none pt-safe p-3 sm:p-4">
          <div className="flex items-start justify-between gap-3 max-w-lg mx-auto">
            {/* 1. Next-Step Card (Top, Safe-Area Aware, Compact <= 64px, Tap expands full step list) */}
            <div
              role="button"
              tabIndex={0}
              aria-label="Toggle full step list"
              onClick={() => setIsStepListExpanded((prev) => !prev)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setIsStepListExpanded((prev) => !prev);
                }
              }}
              className="pointer-events-auto bg-white/95 backdrop-blur-md rounded-2xl shadow-lg border border-slate-200/80 px-3.5 py-2 flex-1 min-w-0 transition-all active:scale-[0.99] cursor-pointer flex flex-col justify-between max-h-[64px]"
            >
              <div className="flex items-center gap-3 min-w-0">
                {/* Round Turn Icon Circle */}
                <div className="w-9 h-9 rounded-full bg-blue-50 border border-blue-200/70 text-[#007dfc] flex items-center justify-center shrink-0">
                  {currentStep.actionType === 'TURN_LEFT' ? (
                    <CornerUpLeft size={18} className="stroke-[2.5]" />
                  ) : currentStep.actionType === 'TURN_RIGHT' ? (
                    <CornerUpRight size={18} className="stroke-[2.5]" />
                  ) : currentStep.actionType === 'BACKWARD' ? (
                    <ArrowDown size={18} className="stroke-[2.5]" />
                  ) : currentStep.actionType === 'STAIRS' ? (
                    <span className="text-base">🪜</span>
                  ) : currentStep.actionType === 'LIFT' ? (
                    <span className="text-base">🛗</span>
                  ) : currentStep.actionType === 'ARRIVE' ? (
                    <CheckCircle2 size={18} className="stroke-[2.5] text-emerald-600" />
                  ) : (
                    <ArrowUp size={18} className="stroke-[2.5]" />
                  )}
                </div>

                {/* Instruction & Distance / Steps Left */}
                <div className="min-w-0 flex-1 text-left">
                  <p className="text-base font-semibold text-slate-900 truncate leading-snug" aria-live="polite">
                    {currentStep.instruction || 'Continue straight'}
                  </p>
                  <p className="text-xs font-normal text-slate-600 truncate leading-tight mt-0.5">
                    {currentStep.distanceMeters ? `${currentStep.distanceMeters} m · ` : ''}
                    {formatRemainingSteps(
                      Math.max(0, (activeNavigationRoute?.steps?.length || 1) - currentRouteIndex - 1),
                      isArrived
                    )}
                  </p>
                </div>
              </div>

              {/* Thin Progress Line */}
              <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden mt-1">
                <div
                  className="h-full bg-[#007dfc] rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(5, Math.round(((currentRouteIndex + 1) / (activeNavigationRoute?.steps?.length || 1)) * 100))
                    )}%`,
                  }}
                />
              </div>
            </div>

            {/* Top Right: Small round exit (X) button (44px target) inside safe area */}
            <div className="flex items-center gap-2 shrink-0 pointer-events-auto">
              {import.meta.env.DEV && (
                <button
                  onClick={() => {
                    if (onOpenBugReport) onOpenBugReport();
                    else {
                      openReportModal({
                        currentPanoramaId: panorama.id,
                        currentNodeId: panorama.id,
                        description: `Navigation issue at Step ${currentRouteIndex + 1} (Node: ${panorama.id})`,
                      });
                    }
                  }}
                  className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-white/95 backdrop-blur-md shadow-md border border-slate-200/80 flex items-center justify-center text-[#007dfc] hover:bg-slate-50 active:scale-95 transition-all cursor-pointer"
                  title="Report Navigation Issue (Dev Only)"
                  aria-label="Report Navigation Issue"
                >
                  <Bug size={18} className="stroke-[2.2]" />
                </button>
              )}

              <button
                onClick={() => {
                  if (onExitNavigation) onExitNavigation();
                  else exitNavigation();
                }}
                className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-white/95 backdrop-blur-md shadow-md border border-slate-200/80 flex items-center justify-center text-slate-700 hover:text-slate-900 hover:bg-slate-50 active:scale-95 transition-all cursor-pointer"
                title="Exit Navigation"
                aria-label="Exit Navigation"
              >
                <X size={20} className="stroke-[2.5]" />
              </button>
            </div>
          </div>

          {/* Expanded Step List */}
          {isStepListExpanded && activeNavigationRoute?.steps && (
            <div className="pt-2 pointer-events-auto max-w-lg mx-auto animate-slide-up">
              <div
                onWheel={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
                className="bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200 p-3 max-h-60 overflow-y-auto overflow-x-hidden touch-pan-y overscroll-contain space-y-2 text-left"
              >
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                  <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                    Full Route Steps ({activeNavigationRoute.steps.length})
                  </span>
                  <button
                    onClick={() => setIsStepListExpanded(false)}
                    className="p-1 rounded-lg hover:bg-slate-100 text-slate-500"
                    aria-label="Close Step List"
                  >
                    <X size={14} />
                  </button>
                </div>
                {activeNavigationRoute.steps.map((st, idx) => {
                  const isCurrent = idx === currentRouteIndex;
                  const isPast = idx < currentRouteIndex;
                  return (
                    <div
                      key={idx}
                      className={`flex items-start gap-2.5 p-2 rounded-xl text-xs transition-colors ${
                        isCurrent
                          ? 'bg-blue-50/80 border border-blue-200 font-bold text-blue-900'
                          : isPast
                          ? 'text-slate-400 opacity-60'
                          : 'text-slate-700'
                      }`}
                    >
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 bg-slate-100 text-slate-600">
                        {isPast ? '✓' : idx + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate leading-tight">{st.instruction || `Step ${idx + 1}`}</p>
                        {st.distanceMeters ? (
                          <span className="text-[10px] font-medium text-slate-400">{st.distanceMeters} m</span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : isNavigating ? (
        /* Regular navigation header bar when not actively on a step (or arrived / exiting) */
        <div className="absolute top-0 left-0 right-0 z-30 pointer-events-auto animate-fade-in pt-safe">
          <div className="bg-white/95 backdrop-blur-md border-b border-slate-100/90 px-3.5 sm:px-5 py-2 sm:py-2.5 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
              <img
                src="/christ_college_official_logo.png"
                alt="Christ College (Autonomous) Irinjalakuda"
                className="w-9 h-9 sm:w-10 sm:h-10 object-contain drop-shadow-xs shrink-0"
              />
              <div className="flex flex-col text-left min-w-0 leading-tight">
                <span className="text-[10px] sm:text-[11px] font-black tracking-wider text-[#0f2744] uppercase truncate">
                  Christ College
                </span>
                <span className="text-[8px] sm:text-[9px] font-bold text-slate-500 uppercase tracking-wider truncate">
                  (Autonomous) Irinjalakuda
                </span>
              </div>
            </div>

            <div className="flex flex-col items-center text-center px-1">
              <h1 className="text-base sm:text-lg font-black tracking-tight leading-none">
                <span className="text-[#0f2744]">Way</span>
                <span className="text-[#007dfc]">Campus</span>
              </h1>
              <span className="text-[9px] sm:text-[10px] font-semibold text-slate-500 tracking-wide mt-0.5">
                Indoor Navigation
              </span>
            </div>

            <button
              onClick={() => {
                if (onExitNavigation) onExitNavigation();
                else exitNavigation();
              }}
              className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-white shadow-md border border-slate-200/80 flex items-center justify-center text-slate-700 hover:text-slate-900 hover:bg-slate-50 active:scale-95 transition-all shrink-0 cursor-pointer"
              title="Close Navigation"
              aria-label="Close Navigation"
            >
              <X size={20} className="stroke-[2.5]" />
            </button>
          </div>

          {/* Sub-Header Destination Pill */}
          <div className="px-3 sm:px-4 pt-2.5 flex items-start justify-between gap-2.5 pointer-events-none">
            <div
              onClick={() => {
                if (onExitNavigation) onExitNavigation();
                else exitNavigation();
              }}
              className="pointer-events-auto bg-white/95 backdrop-blur-md rounded-2xl shadow-lg border border-slate-200/80 px-3 py-2 flex items-center gap-2.5 max-w-[240px] sm:max-w-xs transition-all active:scale-[0.98] cursor-pointer min-h-[44px]"
              title="Exit Route"
            >
              <ChevronLeft size={18} className="text-[#007dfc] shrink-0 stroke-[2.5]" />
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#007dfc] shrink-0">
                <Building2 size={18} />
              </div>
              <div className="min-w-0 text-left">
                <span className="text-[9px] font-black tracking-wider text-[#007dfc] uppercase block leading-none">
                  EXIT ROUTE
                </span>
                <p className="text-xs sm:text-sm font-black text-slate-900 truncate leading-tight mt-0.5">
                  {activeNavigationRoute?.destinationTitle || selectedDestination?.title || destinationLabel || 'Destination'}
                </p>
              </div>
            </div>

            {import.meta.env.DEV && (
              <div className="pointer-events-auto flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    if (onOpenBugReport) onOpenBugReport();
                    else {
                      openReportModal({
                        currentPanoramaId: panorama.id,
                        currentNodeId: panorama.id,
                        description: `Navigation issue (Node: ${panorama.id})`,
                      });
                    }
                  }}
                  className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-white shadow-lg border border-slate-200/80 flex items-center justify-center text-[#007dfc] hover:bg-blue-50 active:scale-95 transition-all cursor-pointer"
                  title="Report Navigation Issue (Dev Only)"
                  aria-label="Report Navigation Issue"
                >
                  <Bug size={18} className="stroke-[2.2]" />
                </button>
              </div>
            )}
          </div>
        </div>
      ) : !hideTopControls && (
        <div className="absolute top-2.5 left-2.5 right-2.5 sm:left-4 sm:right-4 z-20 flex items-center justify-between pointer-events-none">
          {isDebugMode ? (
            <div className="bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl px-2.5 sm:px-3.5 py-1.5 sm:py-2 shadow-2xl pointer-events-auto flex items-center gap-2 max-w-[calc(100%-120px)] sm:max-w-none">
              <span className="flex h-2 w-2 relative flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <div className="min-w-0">
                <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">
                  {panorama.buildingName || 'Campus Corridor'}
                </p>
                <p className="text-[11px] sm:text-xs font-bold text-white truncate max-w-[180px] sm:max-w-xs">
                  {panorama.name}
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl px-2.5 sm:px-3.5 py-1.5 sm:py-2 shadow-2xl pointer-events-auto flex items-center gap-2 max-w-[calc(100%-120px)] sm:max-w-none">
              <div className="w-2 h-2 rounded-full bg-sky-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">
                  {panorama.buildingName || 'Campus Corridor'}
                </p>
                <p className="text-[11px] sm:text-xs font-bold text-white truncate max-w-[180px] sm:max-w-xs">
                  {panorama.name}
                </p>
              </div>
            </div>
          )}

          {/* Right: Quick Action Dock (Compass, Reset, Gyro, GPS) */}
          <div className="flex items-center gap-1 sm:gap-1.5 pointer-events-auto flex-shrink-0">
            {/* North Reset Compass */}
            <button
              onClick={resetCompassToNorth}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-slate-900/90 backdrop-blur-xl border border-white/10 text-slate-200 hover:text-white flex items-center justify-center shadow-lg transition-transform active:scale-95"
              title="Reset North"
            >
              <Compass
                size={15}
                className="text-sky-400 transition-transform duration-200"
                style={{ transform: `rotate(${currentHeading}deg)` }}
              />
            </button>

            {/* Device Gyro Look */}
            <button
              onClick={toggleGyroscope}
              className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl backdrop-blur-xl border flex items-center justify-center shadow-lg transition-transform active:scale-95 ${
                isGyroActive
                  ? 'bg-sky-500 border-sky-400 text-white'
                  : 'bg-slate-900/90 border-white/10 text-slate-300 hover:text-white'
              }`}
              title="Device Gyro Look"
            >
              <Smartphone size={15} className={isGyroActive ? 'animate-bounce' : ''} />
            </button>

            {/* GPS Live Locate */}
            <button
              onClick={handleLiveGPSClick}
              disabled={isLocatingGPS}
              className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl backdrop-blur-xl border flex items-center justify-center shadow-lg transition-transform active:scale-95 ${
                liveGPS ? 'bg-sky-600 border-sky-400 text-white' : 'bg-slate-900/90 border-white/10 text-slate-300'
              }`}
              title="Live GPS Location"
            >
              {isLocatingGPS ? (
                <Loader2 size={15} className="animate-spin text-sky-300" />
              ) : (
                <Crosshair size={15} className={liveGPS ? 'text-white' : 'text-sky-400'} />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Live GPS Feedback Pill */}
      {gpsStatusMessage && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 bg-slate-900/95 text-sky-300 text-[11px] sm:text-xs font-semibold px-3 sm:px-4 py-1.5 rounded-full border border-sky-500/40 shadow-2xl backdrop-blur-md flex items-center gap-2 animate-pulse pointer-events-none whitespace-nowrap max-w-[90vw] truncate">
          <Crosshair size={12} className="text-sky-400 animate-spin flex-shrink-0" style={{ animationDuration: '4s' }} />
          <span className="truncate">{gpsStatusMessage}</span>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────
          SECTION 19: NAVIGATION DEBUG PANEL (Development Only)
      ───────────────────────────────────────────────────────── */}
      {import.meta.env.DEV && isDebugMode && (
        <div
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          className="absolute top-16 right-2.5 sm:right-4 z-40 bg-slate-950/95 border border-amber-500/40 rounded-2xl p-3 shadow-2xl backdrop-blur-xl text-left max-w-[280px] sm:max-w-xs w-full pointer-events-auto text-[10px] sm:text-[11px] font-mono text-slate-200 max-h-[75dvh] overflow-y-auto overflow-x-hidden touch-pan-y overscroll-contain"
        >
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
            <span className="font-bold text-amber-400 flex items-center gap-1.5">
              <Bug size={13} /> Nav Debugger
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] font-bold ${
                transitionLocked ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/20 text-emerald-300'
              }`}
            >
              {transitionLocked ? 'LOCKED 🔒' : 'READY 🟢'}
            </span>
          </div>

          <div className="space-y-1">
            <div>
              <span className="text-slate-400">Current Node: </span>
              <span className="text-sky-300 font-bold">{panorama.id.toUpperCase()}</span>
            </div>
            <div>
              <span className="text-slate-400">Yaw / Pitch: </span>
              <span className="text-sky-300 font-bold">{currentHeading}° / {Math.round(latRef.current)}°</span>
            </div>
            <div>
              <span className="text-slate-400">Pano Ready: </span>
              <span className={isCurrentPanoReady ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                {isCurrentPanoReady ? 'READY (100%)' : 'PREPARING…'}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Tile LOD: </span>
              <span className={currentLODLevel > 0 ? 'text-cyan-300 font-bold' : 'text-slate-300 font-bold'}>
                {currentLODLevel > 0 ? `LOD ${currentLODLevel} (Tiled 4K)` : 'Fallback Single JPG'}
              </span>
            </div>
            {currentLODLevel > 0 && (
              <div>
                <span className="text-slate-400">Visible Tiles: </span>
                <span className="text-emerald-400 font-bold">
                  {visibleTileCount} / 32
                </span>
              </div>
            )}
            <div>
              <span className="text-slate-400">Dest Node: </span>
              <span className="text-amber-300 font-bold">
                {activeNavigationRoute?.destinationNodeId.toUpperCase() || 'NONE'}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Status: </span>
              <span className="text-white font-bold">{navigationStatus}</span>
            </div>
            <div>
              <span className="text-slate-400">Step: </span>
              <span className="text-white font-bold">
                {activeNavigationRoute ? `${currentRouteIndex + 1} / ${activeNavigationRoute.steps.length}` : '0 / 0'}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Prev Node: </span>
              <span className="text-slate-300 font-bold">
                {currentRouteIndex > 0 && activeNavigationRoute
                  ? activeNavigationRoute.pathNodeIds[currentRouteIndex - 1].toUpperCase()
                  : 'NONE'}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Next Node: </span>
              <span className="text-emerald-400 font-bold">
                {currentStep?.targetNodeId ? currentStep.targetNodeId.toUpperCase() : 'ARRIVED'}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Navigation Direction: </span>
              <span className="text-emerald-300 font-bold">
                {resolveVoiceDirection(currentStep, activeNavigationRoute?.destinationTitle).direction}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Voice Phrase: </span>
              {(() => {
                const res = resolveVoiceDirection(currentStep, activeNavigationRoute?.destinationTitle);
                return (
                  <span className={res.isVerified ? 'text-white font-bold' : 'text-amber-400 font-bold'}>
                    {res.isVerified ? `"${res.phrase}"` : res.debugNotice || 'Direction requires manual verification.'}
                  </span>
                );
              })()}
            </div>
            <div>
              <span className="text-slate-400">Instruction: </span>
              <span className="text-white font-bold">{currentStep?.instruction || 'None'}</span>
            </div>
            <div>
              <span className="text-slate-400">Connected Paths: </span>
              <span className="text-slate-300 text-[9px] block">
                {(panorama.hotspots || []).map((h) => `${h.targetPanoId}(${Math.round(h.yaw)}°)`).join(', ') || 'None'}
              </span>
            </div>
            <div className="pt-1.5 border-t border-white/10">
              <span className="text-slate-400">Route Path:</span>
              <p className="text-[9px] text-slate-300 truncate mt-0.5 font-sans">
                {activeNavigationRoute?.pathNodeIds.join(' → ') || 'No active route'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────
          DIRECTION HINT CHIP (SCREEN EDGE, COMPACT, HYSTERESIS: >50° to show, <35° to hide)
      ───────────────────────────────────────────────────────── */}
      {isRouteActive && !isArrived && directionHint && directionHint.action !== 'ON_TRACK' && (
        <div
          className={`fixed z-30 top-1/2 -translate-y-1/2 pointer-events-none transition-all duration-200 animate-fade-in ${
            directionHint.side === 'left' ? 'left-3 sm:left-4' : 'right-3 sm:right-4'
          }`}
          role="status"
          aria-live="polite"
        >
          <div className="bg-slate-900/85 text-white backdrop-blur-md border border-white/20 rounded-full px-3 py-1.5 shadow-xl flex items-center gap-1.5 text-xs font-semibold pointer-events-auto">
            {directionHint.side === 'left' && <CornerUpLeft size={14} className="text-[#007dfc] stroke-[2.5]" />}
            <span>{directionHint.label}</span>
            {directionHint.side === 'right' && <CornerUpRight size={14} className="text-[#007dfc] stroke-[2.5]" />}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────
          WAYCAMPUS BOTTOM GUIDANCE CARD (MATCHING REFERENCE)
      ───────────────────────────────────────────────────────── */}
      <div className="absolute bottom-0 left-0 right-0 z-30 pb-safe pointer-events-auto">
        {/* Navigation Error Message */}
        {navigationError && (
          <div className="mb-2 max-w-md mx-auto px-3.5 py-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-full flex items-center gap-2 shadow-md">
            <AlertTriangle size={14} className="text-red-500 shrink-0" />
            <span className="truncate">{navigationError}</span>
          </div>
        )}

        {/* 4. Destination Arrival Card */}
        {isArrived ? (
          <div className="rounded-t-[32px] sm:rounded-3xl bg-white p-4 sm:p-5 shadow-2xl border-t border-slate-100 max-w-lg mx-auto w-full flex flex-col gap-3.5 animate-scale-up text-left">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl font-black shrink-0 border border-emerald-200">
                ✓
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 block leading-none">
                  You've arrived
                </span>
                <h3 className="text-base sm:text-lg font-black text-slate-900 truncate mt-1">
                  {arrivalDetails.placeName}
                </h3>
                <p className="text-xs text-slate-500 truncate mt-0.5">
                  {arrivalDetails.buildingName} • {arrivalDetails.floorLabel}
                </p>

                {/* Faculty Live Presence Status Badge */}
                {arrivalDetails.isTeacher && facultyArrivalStatus && (
                  <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border bg-slate-50 border-slate-200 text-slate-700">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        facultyArrivalStatus.status === 'AVAILABLE'
                          ? 'bg-emerald-500'
                          : facultyArrivalStatus.status === 'IN_CLASS'
                          ? 'bg-blue-500'
                          : facultyArrivalStatus.status === 'BUSY'
                          ? 'bg-amber-500'
                          : facultyArrivalStatus.status === 'ON_LEAVE'
                          ? 'bg-rose-500'
                          : 'bg-slate-400'
                      }`}
                    />
                    <span>
                      {facultyArrivalStatus.status === 'AVAILABLE'
                        ? 'Available in Cabin'
                        : facultyArrivalStatus.status === 'IN_CLASS'
                        ? 'Currently In Class'
                        : facultyArrivalStatus.status === 'BUSY'
                        ? 'Busy / Meeting'
                        : facultyArrivalStatus.status === 'ON_LEAVE'
                        ? 'On Leave'
                        : 'Status Not Marked'}
                    </span>
                    {facultyArrivalStatus.locationName && (
                      <span className="text-slate-400 font-normal">
                        ({facultyArrivalStatus.locationName})
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Actions: Done and Show route again */}
            <div className="flex items-center justify-end gap-2.5 pt-1 border-t border-slate-100">
              <button
                onClick={() => {
                  if (selectedDestination) {
                    startNavigationRoute(selectedDestination, activeNavigationRoute?.startNodeId);
                  } else if (activeNavigationRoute) {
                    const fallbackDest: SearchResult = {
                      id: activeNavigationRoute.destinationNodeId,
                      title: activeNavigationRoute.destinationTitle || 'Destination',
                      subtitle: (activeNavigationRoute as any).destinationBuildingName || panorama.buildingName || 'Campus Location',
                      type: 'ROOM',
                      buildingName: (activeNavigationRoute as any).destinationBuildingName || panorama.buildingName,
                      nodeId: activeNavigationRoute.destinationNodeId,
                      floorNumber: typeof activeFloorNumber === 'number' ? activeFloorNumber : 0,
                    };
                    startNavigationRoute(fallbackDest, activeNavigationRoute.startNodeId);
                  }
                }}
                className="min-h-[44px] px-4 py-2.5 rounded-full border border-slate-200 text-slate-700 hover:bg-slate-50 active:bg-slate-100 text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <RotateCcw size={15} />
                <span>Show route again</span>
              </button>
              <button
                onClick={() => {
                  if (onExitNavigation) onExitNavigation();
                  else exitNavigation();
                }}
                className="min-h-[44px] px-6 py-2.5 rounded-full bg-[#007dfc] hover:bg-blue-600 active:bg-blue-700 text-white font-black text-xs sm:text-sm shadow-md active:scale-95 transition-all cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        ) : isRouteActive && currentStep ? (
          /* One large pill-shaped Walk button at bottom center (Matching user mockup) */
          <div className="flex justify-center pb-6 sm:pb-8">
            <button
              onClick={advanceNavigationStep}
              disabled={transitionLocked}
              className="min-h-[44px] min-w-[130px] px-8 py-3 rounded-full bg-[#e8f2fe] hover:bg-[#d8e8fc] active:bg-[#c8deea] border border-[#007dfc] text-slate-900 font-semibold text-base shadow-sm active:scale-95 disabled:opacity-60 transition-all cursor-pointer flex items-center justify-center gap-2"
              aria-label="Walk to next step"
            >
              {transitionLocked ? (
                <>
                  <Loader2 size={18} className="animate-spin text-[#007dfc]" />
                  <span>Walking…</span>
                </>
              ) : (
                <span>Walk</span>
              )}
            </button>
          </div>
        ) : null}
      </div>

      {/* ─────────────────────────────────────────────────────────
          SELECTED PLACE DETAILS MODAL
      ───────────────────────────────────────────────────────── */}
      {selectedPlaceInfo && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in pointer-events-auto pb-safe"
          onClick={() => setSelectedPlaceInfo(null)}
        >
          <div
            className="bg-slate-900/95 border border-white/15 rounded-3xl p-4 sm:p-5 max-w-md w-full shadow-2xl animate-scale-up max-h-[85dvh] overflow-y-auto overflow-x-hidden touch-pan-y overscroll-contain"
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-2xl bg-sky-500/20 text-sky-400 flex items-center justify-center text-2xl flex-shrink-0">
                  {selectedPlaceInfo.icon}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-black uppercase tracking-wider text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/25">
                      {selectedPlaceInfo.category}
                    </span>
                    {selectedPlaceInfo.verified && (
                      <span className="text-[9px] font-semibold text-emerald-400 flex items-center gap-0.5">
                        <CheckCircle2 size={10} /> Verified
                      </span>
                    )}
                  </div>
                  <h3 className="text-white font-black text-lg mt-1 leading-tight">{selectedPlaceInfo.name}</h3>
                  <p className="text-slate-400 text-xs font-medium mt-0.5">
                    {selectedPlaceInfo.buildingName} • {selectedPlaceInfo.floor}
                    {selectedPlaceInfo.roomNumber ? ` • Room ${selectedPlaceInfo.roomNumber}` : ''}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedPlaceInfo(null)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center flex-shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            {selectedPlaceInfo.notes && (
              <p className="text-slate-300 text-xs my-3.5 p-3 rounded-2xl bg-slate-950/60 border border-white/5">
                {selectedPlaceInfo.notes}
              </p>
            )}

            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={() => {
                  onSelectPanorama(selectedPlaceInfo.panoramaNodeId);
                  setSelectedPlaceInfo(null);
                }}
                className="flex-1 py-3 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-black text-xs rounded-2xl flex items-center justify-center gap-1.5 shadow-lg shadow-sky-500/25 transition-transform active:scale-95"
              >
                <Navigation size={15} />
                <span>Navigate Here</span>
              </button>
              <button
                onClick={() => setSelectedPlaceInfo(null)}
                className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-2xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────
          CAMPUS ZONE EXPLORER MODAL (135 Real Panoramas)
      ───────────────────────────────────────────────────────── */}
      {showZonePicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in pointer-events-auto"
          onClick={() => setShowZonePicker(false)}
        >
          <div
            className="bg-slate-900/95 border border-white/15 rounded-3xl p-5 max-w-lg w-full shadow-2xl animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <Building2 size={18} />
                </div>
                <div>
                  <h3 className="text-white font-bold text-base">Campus 360° Zone Explorer</h3>
                  <p className="text-slate-400 text-xs">Jump to any of the 6 campus capture zones (135 panoramas)</p>
                </div>
              </div>
              <button
                onClick={() => setShowZonePicker(false)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>

            <div
              onWheel={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
              className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 my-4 max-h-[60vh] overflow-y-auto overflow-x-hidden touch-pan-y overscroll-contain pr-1"
            >
              {CAMPUS_ZONES.map((zone) => (
                <button
                  key={zone.area}
                  onClick={() => {
                    onSelectPanorama(zone.firstNodeId);
                    setShowZonePicker(false);
                  }}
                  className="flex items-start gap-3 p-3 rounded-2xl bg-slate-800/80 hover:bg-sky-600/20 border border-white/10 hover:border-sky-500/50 transition-all text-left group"
                >
                  <span className="text-2xl">{zone.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-white font-bold text-xs truncate group-hover:text-sky-300">{zone.name}</p>
                      <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                        {zone.totalPanos} Panos
                      </span>
                    </div>
                    <p className="text-slate-400 text-[10px] mt-0.5 line-clamp-2">{zone.description}</p>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex justify-end pt-2 border-t border-white/5">
              <button
                onClick={() => setShowZonePicker(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────
          FIRST-YEAR FRESHERS QUICK WAYFINDER MODAL
      ───────────────────────────────────────────────────────── */}
      {showFreshersGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in pointer-events-auto"
          onClick={() => setShowFreshersGuide(false)}
        >
          <div
            className="bg-slate-900/95 border border-sky-500/30 rounded-3xl p-5 sm:p-6 max-w-lg w-full shadow-2xl animate-scale-up relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Ambient Glow */}
            <div className="absolute -top-16 -right-16 w-36 h-36 bg-sky-500/20 rounded-full blur-3xl pointer-events-none" />

            <div className="flex items-start justify-between pb-3.5 border-b border-white/10 relative">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white flex items-center justify-center text-xl shadow-lg shadow-sky-500/30">
                  🎓
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-white font-black text-base">Freshers Campus Wayfinder</h3>
                    <span className="bg-sky-500/20 text-sky-300 text-[9px] font-black px-2 py-0.5 rounded-full border border-sky-500/30">
                      1st Year Helper
                    </span>
                  </div>
                  <p className="text-slate-400 text-xs mt-0.5">
                    Tap any location for step-by-step 360° walking guidance
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowFreshersGuide(false)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Quick Destinations Grid */}
            <div
              onWheel={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
              className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 my-4 max-h-[60vh] overflow-y-auto overflow-x-hidden touch-pan-y overscroll-contain pr-1"
            >
              {FRESHERS_QUICK_TARGETS.map((target) => (
                <button
                  key={target.id}
                  onClick={() => {
                    startNavigation({
                      id: target.id,
                      type: 'ROOM',
                      title: target.title,
                      subtitle: target.subtitle,
                      nodeId: target.nodeId,
                      buildingName: target.subtitle.split('•')[0].trim(),
                      floorNumber: 0,
                    });
                    setShowFreshersGuide(false);
                  }}
                  className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 hover:border-sky-400/50 transition-all text-left group shadow-lg active:scale-98"
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-xl flex-shrink-0 group-hover:scale-110 transition-transform">
                    {target.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-white font-bold text-xs truncate group-hover:text-sky-300">
                        {target.title}
                      </p>
                      <ArrowUpRight size={13} className="text-sky-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                    </div>
                    <p className="text-[10px] text-slate-400 font-medium truncate mt-0.5">
                      {target.subtitle}
                    </p>
                    <p className="text-[9px] text-sky-400/80 font-medium line-clamp-1 mt-1">
                      {target.hint}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-white/10 text-xs">
              <span className="text-[11px] text-slate-400">Lost on campus? Follow the blue route arrows.</span>
              <button
                onClick={() => setShowFreshersGuide(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────
          DESTINATION ALIGNMENT DEBUG OVERLAY (DEVELOPMENT ONLY)
      ───────────────────────────────────────────────────────── */}
      {import.meta.env.DEV && isDebugMode && destinationDebugInfo && isArrived && (
        <div className="fixed top-24 left-4 z-50 bg-slate-900/95 border border-amber-500/50 rounded-2xl p-3.5 text-xs text-slate-200 shadow-2xl backdrop-blur-md font-mono pointer-events-none max-w-xs animate-fade-in">
          <div className="font-bold text-amber-400 mb-1.5 flex items-center gap-1.5 border-b border-amber-500/30 pb-1">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            DESTINATION ALIGNMENT
          </div>
          <div className="space-y-0.5">
            <div>Selected destination: <span className="text-white font-semibold">{destinationDebugInfo.selectedDestination}</span></div>
            <div>Destination panorama: <span className="text-amber-300">{destinationDebugInfo.destinationPanorama}</span></div>
            <div>Tag yaw: <span className="text-cyan-300">{destinationDebugInfo.tagYaw}°</span></div>
            <div>Tag pitch: <span className="text-cyan-300">{destinationDebugInfo.tagPitch}°</span></div>
            <div>Arrival camera yaw: <span className="text-emerald-400">{destinationDebugInfo.arrivalCameraYaw}°</span></div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────
          CAMPUS LOCATION MAPPING STUDIO (MANUAL VERIFICATION)
      ───────────────────────────────────────────────────────── */}
      <CampusLocationMappingStudio
        currentPanorama={panorama}
        currentYaw={currentHeading}
        currentPitch={latRef.current}
        isOpen={isMappingStudioOpen}
        onClose={() => setIsMappingStudioOpen(false)}
        onPlaceSaved={loadVerifiedPlaces}
      />

      {/* ─────────────────────────────────────────────────────────
          UNREADY NAVIGATION NOTIFICATION TOAST
      ───────────────────────────────────────────────────────── */}
      {unreadyNotice && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full bg-slate-900/95 border border-amber-400/50 text-amber-300 text-xs font-semibold shadow-2xl backdrop-blur-md flex items-center gap-2 animate-fade-in pointer-events-none">
          <Loader2 size={13} className="animate-spin text-amber-400" />
          <span>{unreadyNotice}</span>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────
          OFFICIAL CHRIST COLLEGE AERIAL PHOTO SPLASH SCREEN
          (Consistent branded loading screen across the entire app)
      ───────────────────────────────────────────────────────── */}
      {!isCurrentPanoReady && (
        <div
          className="absolute inset-0 z-40 flex flex-col justify-between items-center text-center px-6 py-10 select-none pointer-events-none animate-fade-in transition-opacity duration-300"
          style={{
            backgroundImage: `linear-gradient(to bottom, rgba(15, 23, 42, 0.72) 0%, rgba(15, 23, 42, 0.18) 32%, rgba(15, 23, 42, 0.18) 68%, rgba(15, 23, 42, 0.88) 100%), url('/assets/campus_aerial_drone.jpg')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {/* Top Section: Official College Branding */}
          <div className="pt-8 sm:pt-10 flex flex-col items-center animate-fade-in">
            <div className="w-18 h-18 sm:w-22 sm:h-22 p-1 bg-white/95 backdrop-blur-md rounded-full shadow-2xl shadow-black/50 border-2 border-white mb-2.5 flex items-center justify-center overflow-hidden ring-4 ring-blue-500/30">
              <img
                src="/christ_college_official_logo.png"
                alt="Christ College Crest"
                className="w-full h-full object-contain rounded-full"
              />
            </div>
            <h1 className="text-base sm:text-lg font-black tracking-wider text-white uppercase leading-tight max-w-xs drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)]">
              Christ College
            </h1>
            <p className="text-[11px] sm:text-xs font-bold tracking-widest text-sky-300 uppercase mt-0.5 drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)]">
              (Autonomous) Irinjalakuda
            </p>
            <p className="text-base sm:text-lg font-serif italic text-white/95 mt-2.5 font-semibold drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)]">
              A Smarter Campus, A Brighter You
            </p>
          </div>

          {/* Bottom Section: WayCampus Branding & Progress */}
          <div className="w-full max-w-xs flex flex-col items-center pb-8 animate-slide-up">
            <div className="mb-4">
              <h2 className="text-3xl sm:text-4xl tracking-tight text-white drop-shadow-md">
                <span className="font-extrabold text-white">Way</span>
                <span className="font-light text-sky-300">Campus</span>
              </h2>
              <p className="text-xs sm:text-sm font-medium tracking-widest text-slate-200 uppercase mt-1 drop-shadow">
                Navigate · Explore · Belong
              </p>
            </div>

            {/* Glowing animated progress bar */}
            <div className="w-full bg-white/20 backdrop-blur-sm rounded-full h-2.5 overflow-hidden p-0.5 shadow-inner">
              <div className="bg-gradient-to-r from-sky-400 to-blue-600 h-full rounded-full animate-pulse w-4/5" />
            </div>
            <div className="flex justify-between items-center w-full mt-2 text-[11px] text-slate-300 font-medium px-1">
              <span>Loading 360° Virtual Tour...</span>
              <span className="animate-pulse">Preparing view</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
