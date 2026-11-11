import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import * as THREE from 'three';
import {
  Search,
  Plus,
  Save,
  Trash2,
  Edit3,
  Upload,
  RefreshCw,
  Tag,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  CheckCircle2,
  AlertCircle,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  X,
  Compass,
} from 'lucide-react';
import {
  CAMPUS_GRAPH,
  CAMPUS_GRAPH_MAP,
  AreaCode,
  CampusPanoramaNode,
  PanoramaConnection,
  ConnectionDirection,
  applyGraphOverrides,
  getAllCustomPlaceTags,
  setCustomPlaceTags,
} from '../../../data/campusGraph';
import { CustomPlaceTag } from '../../../../../shared/types';
import { ApiService } from '../../../services/api';
import { PanoramaResourceManager } from '../../../services/panoramaResourceManager';

interface PanoramasSectionProps {
  currentPanoramaId: string;
  onSelectPanorama: (id: string) => void;
  manualNumbers: Record<string, string>;
  onUpdateManualNumber: (nodeId: string, num: string) => void;
  onOpen3DViewer: (nodeId: string) => void;
}

const DIRECTION_OPTIONS: { value: ConnectionDirection; label: string; arrow: string }[] = [
  { value: 'straight', label: 'Straight', arrow: '→' },
  { value: 'slight-right', label: 'Slight Right', arrow: '↗' },
  { value: 'right', label: 'Right', arrow: '→' },
  { value: 'slight-left', label: 'Slight Left', arrow: '↖' },
  { value: 'left', label: 'Left', arrow: '←' },
  { value: 'u-turn', label: 'U-Turn', arrow: '↩' },
  { value: 'stairs-up', label: 'Stairs Up', arrow: '↑' },
  { value: 'stairs-down', label: 'Stairs Down', arrow: '↓' },
  { value: 'enter-building', label: 'Enter Building', arrow: '⇥' },
  { value: 'exit-building', label: 'Exit Building', arrow: '⇤' },
];

const AREA_OPTIONS: AreaCode[] = [
  'OUTDOOR',
  'AB',
  'SC',
  'MG',
  'SM',
  'SJ',
  'MT',
  'SB',
  'HM',
  'BBA',
  'GB',
];

const FLOOR_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Floor 0' },
  { value: 1, label: 'Floor 1' },
  { value: 2, label: 'Floor 2' },
  { value: 3, label: 'Floor 3' },
];

// Camera Constants: Calibrated against 4096x2048 campus panoramas where photographer head appears <= -29.7° pitch.
// Default FOV 56° (Max FOV 60°) & Min Pitch 4° (Default Pitch 5°) frames the horizon & ground arrows naturally
// while keeping the bottom viewport edge >= -26°, hiding the photographer's head 100%.
const DEFAULT_FOV = 56;
const MIN_FOV = 32;
const MAX_FOV = 60;
const DEFAULT_CAMERA_PITCH = 5;
const MIN_CAMERA_PITCH = 4;
const MAX_CAMERA_PITCH = 72;

function inferDirectionFromYaw(yawDeg: number, referenceYaw: number = 0): ConnectionDirection {
  const rel = (((yawDeg - referenceYaw) % 360) + 360) % 360;
  if (rel >= 335 || rel <= 25) return 'straight';
  if (rel > 25 && rel <= 65) return 'slight-right';
  if (rel > 65 && rel <= 135) return 'right';
  if (rel > 135 && rel < 225) return 'u-turn';
  if (rel >= 225 && rel < 295) return 'left';
  return 'slight-left';
}

function formatDirectionBadge(dir?: ConnectionDirection): { arrow: string; label: string } {
  const found = DIRECTION_OPTIONS.find((d) => d.value === dir);
  if (found) return { arrow: found.arrow, label: found.label };
  return { arrow: '→', label: 'Straight' };
}

function parseFloorNumber(floorStr: string | number | null | undefined): number {
  if (typeof floorStr === 'number') return floorStr;
  if (!floorStr) return 0;
  const s = String(floorStr).toLowerCase();
  if (s.includes('ground') || s === '0' || s.includes('floor 0')) return 0;
  if (s.includes('first') || s === '1' || s.includes('floor 1')) return 1;
  if (s.includes('second') || s === '2' || s.includes('floor 2')) return 2;
  if (s.includes('third') || s === '3' || s.includes('floor 3')) return 3;
  const m = s.match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

// 120 Hz Memoized Node Row Item
// Lightweight Micro-Thumbnail Cache & Idle Downsampler
// Prevents decoding 25+ full 4096x2048 (8.3 MP) JPEGs simultaneously in the sidebar & table
const microThumbCache = new Map<string, string>();
const microThumbInFlight = new Set<string>();
const microThumbSubscribers = new Map<string, Set<(url: string) => void>>();
const microThumbQueue: string[] = [];
let isMicroThumbWorkerRunning = false;
let is360ViewerBusy = false;

function processNextMicroThumb() {
  if (isMicroThumbWorkerRunning) return;
  if (is360ViewerBusy) {
    setTimeout(processNextMicroThumb, 120);
    return;
  }
  const nextSrc = microThumbQueue.shift();
  if (!nextSrc) return;

  isMicroThumbWorkerRunning = true;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';

  const finish = (dataUrl: string) => {
    microThumbCache.set(nextSrc, dataUrl);
    microThumbInFlight.delete(nextSrc);
    const subs = microThumbSubscribers.get(nextSrc);
    if (subs) {
      subs.forEach((cb) => cb(dataUrl));
      microThumbSubscribers.delete(nextSrc);
    }
    isMicroThumbWorkerRunning = false;
    setTimeout(processNextMicroThumb, 45);
  };

  img.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 96;
      canvas.height = 48;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, 96, 48);
        finish(canvas.toDataURL('image/jpeg', 0.68));
        return;
      }
    } catch {
      // Fallback if canvas taint occurs
    }
    finish(nextSrc);
  };

  img.onerror = () => {
    finish('/assets/campus_aerial_drone.jpg');
  };

  img.src = nextSrc;
}

function requestMicroThumb(src: string, cb: (url: string) => void): () => void {
  if (!src) return () => {};
  const cached = microThumbCache.get(src);
  if (cached) {
    cb(cached);
    return () => {};
  }
  let subs = microThumbSubscribers.get(src);
  if (!subs) {
    subs = new Set();
    microThumbSubscribers.set(src, subs);
  }
  subs.add(cb);

  if (!microThumbInFlight.has(src)) {
    microThumbInFlight.add(src);
    microThumbQueue.push(src);
    setTimeout(processNextMicroThumb, 60);
  }

  return () => {
    const currentSubs = microThumbSubscribers.get(src);
    if (currentSubs) {
      currentSubs.delete(cb);
      if (currentSubs.size === 0) {
        microThumbSubscribers.delete(src);
      }
    }
  };
}

const LazyMicroThumbnail = React.memo<{
  src: string;
  alt: string;
  badgeText?: string;
  className?: string;
}>(({ src, alt, badgeText, className = 'w-full h-full object-cover' }) => {
  const [thumbUrl, setThumbUrl] = useState<string | null>(() => microThumbCache.get(src) || null);

  useEffect(() => {
    const cached = microThumbCache.get(src);
    if (cached) {
      setThumbUrl(cached);
      return;
    }
    setThumbUrl(null);
    let cancelSub: (() => void) | null = null;
    // Wait 150ms before queuing so fast scrolling never decodes offscreen 4096x2048 images
    const timer = setTimeout(() => {
      cancelSub = requestMicroThumb(src, (resolvedUrl) => {
        setThumbUrl(resolvedUrl);
      });
    }, 150);

    return () => {
      clearTimeout(timer);
      if (cancelSub) cancelSub();
    };
  }, [src]);

  if (!thumbUrl) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center text-[9px] font-black text-blue-200 tracking-tight select-none">
        {badgeText ? `#${badgeText}` : '360°'}
      </div>
    );
  }

  return <img src={thumbUrl} alt={alt} className={className} />;
});
LazyMicroThumbnail.displayName = 'LazyMicroThumbnail';

interface NodeRowProps {
  node: CampusPanoramaNode;
  manualNumber: string;
  arrowCount: number;
  imagePath: string;
  filename: string;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

const PanoramaNodeRow = React.memo<NodeRowProps>(
  ({ node, manualNumber, arrowCount, imagePath, filename, isSelected, onSelect }) => {
    return (
      <div
        onClick={() => onSelect(node.id)}
        className={`flex items-center gap-3 px-3 py-2.5 border-b border-slate-100 cursor-pointer transition-colors duration-75 ${
          isSelected
            ? 'bg-[#ebf3ff] border-l-4 border-l-[#1a56db]'
            : 'bg-white hover:bg-slate-50/90 border-l-4 border-l-transparent'
        }`}
        style={{ height: 68 }}
      >
        <div className="w-14 h-10 rounded-lg overflow-hidden bg-slate-100 border border-slate-200/80 shrink-0 relative">
          <LazyMicroThumbnail
            src={imagePath}
            alt={node.id}
            badgeText={manualNumber}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs font-extrabold text-slate-900 truncate">{node.id}</span>
              <span className="px-1.5 py-0.5 text-[10px] font-black rounded-md bg-blue-100 text-[#1a56db] shrink-0">
                #{manualNumber}
              </span>
            </div>
            <span className="text-[11px] font-semibold text-slate-500 shrink-0">
              {arrowCount} {arrowCount === 1 ? 'arrow' : 'arrows'}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 truncate mt-0.5 font-mono">{filename}</div>
        </div>
      </div>
    );
  }
);
PanoramaNodeRow.displayName = 'PanoramaNodeRow';

export const PanoramasSection: React.FC<PanoramasSectionProps> = ({
  currentPanoramaId,
  onSelectPanorama,
  manualNumbers: propManualNumbers,
  onUpdateManualNumber,
}) => {
  // Selected node state (default to outdoor_001 or currentPanoramaId)
  const [selectedNodeId, setSelectedNodeId] = useState<string>(
    currentPanoramaId && CAMPUS_GRAPH_MAP.has(currentPanoramaId) ? currentPanoramaId : 'outdoor_001'
  );
  const [searchQuery, setSearchQuery] = useState('');

  // Full Graph Overrides State
  const [manualNumbers, setManualNumbers] = useState<Record<string, string>>(() => ({
    ...propManualNumbers,
  }));
  const [connectionsMap, setConnectionsMap] = useState<Record<string, PanoramaConnection[]>>(() => {
    const init: Record<string, PanoramaConnection[]> = {};
    CAMPUS_GRAPH.forEach((n) => {
      init[n.id] = [...(n.connections || [])];
    });
    return init;
  });
  const [tagsMap, setTagsMap] = useState<Record<string, CustomPlaceTag[]>>(() => ({
    ...getAllCustomPlaceTags(),
  }));
  const [nodeImageOverrides, setNodeImageOverrides] = useState<Record<string, any>>({});
  const [nodeMetadataOverrides, setNodeMetadataOverrides] = useState<Record<string, any>>({});
  const [customPanoramas, setCustomPanoramas] = useState<Record<string, any>>({});
  const [graphVersion, setGraphVersion] = useState<number>(1);

  // Save & Feedback States
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveBanner, setSaveBanner] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  // 360° Viewer & Interaction States
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFullscreenDrawerOpen, setIsFullscreenDrawerOpen] = useState(false);
  const [interactionMode, setInteractionMode] = useState<'DEFAULT' | 'ADD_ARROW' | 'ADD_TAG'>('DEFAULT');
  const [isTextureLoading, setIsTextureLoading] = useState(false);
  const [imageProjectionMeta, setImageProjectionMeta] = useState<{
    width: number;
    height: number;
    aspectRatio: number;
    isEquirectangular: boolean;
  } | null>(null);

  // Modals for Adding/Editing Arrows, Tags, and Uploading Images
  const [arrowModal, setArrowModal] = useState<{
    isOpen: boolean;
    mode: 'ADD' | 'EDIT';
    originalTargetId?: string;
    targetId: string;
    direction: ConnectionDirection;
    label: string;
    heading: number;
    pitch: number;
  } | null>(null);
  const [arrowDestSearch, setArrowDestSearch] = useState('');

  const [tagModal, setTagModal] = useState<{
    isOpen: boolean;
    mode: 'ADD' | 'EDIT';
    tagId?: string;
    text: string;
    yaw: number;
    pitch: number;
  } | null>(null);

  const [uploadModal, setUploadModal] = useState<{
    isOpen: boolean;
    mode: 'ADD_NEW' | 'REPLACE';
    file: File | null;
    previewUrl: string | null;
    nodeId: string;
    manualNumber: string;
    filename: string;
    area: AreaCode;
    floor: number;
    isUploading: boolean;
    error: string | null;
  } | null>(null);

  const replaceFileInputRef = useRef<HTMLInputElement>(null);
  const addFileInputRef = useRef<HTMLInputElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const webglMountRef = useRef<HTMLDivElement>(null);

  // Three.js 360° Spherical Renderer Refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sphereMeshRef = useRef<THREE.Mesh | null>(null);
  const textureCacheRef = useRef<Map<string, THREE.Texture>>(new Map());

  // 360° Camera Orientation Refs (Spherical Lon/Lat & FOV)
  const lonRef = useRef<number>(0);
  const latRef = useRef<number>(DEFAULT_CAMERA_PITCH);
  const targetLonRef = useRef<number>(0);
  const targetLatRef = useRef<number>(DEFAULT_CAMERA_PITCH);
  const fovRef = useRef<number>(DEFAULT_FOV);
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(100);

  // Direct DOM Refs for 120 Hz 3D-to-2D Projected Markers (Zero React re-render overhead during 360° pan)
  const arrowDomRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const tagDomRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const currentConnectionsRef = useRef<PanoramaConnection[]>([]);
  const currentTagsRef = useRef<CustomPlaceTag[]>([]);
  const needsRenderRef = useRef<boolean>(true);

  // Pointer & Dragging Refs (Camera Pan vs Marker Drag)
  const isPanningCameraRef = useRef<boolean>(false);
  const panStartXRef = useRef<number>(0);
  const panStartYRef = useRef<number>(0);
  const panStartLonRef = useRef<number>(0);
  const panStartLatRef = useRef<number>(MIN_CAMERA_PITCH);
  const panMovedRef = useRef<boolean>(false);

  const dragStateRef = useRef<{
    type: 'ARROW' | 'TAG';
    id: string;
    startX: number;
    startY: number;
    hasMoved: boolean;
    rafId: number | null;
    latestYaw?: number;
    latestPitch?: number;
  } | null>(null);

  // Virtualized Left List Scroll State
  const listScrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const scrollRafRef = useRef<number | null>(null);

  // Escape key & Native Fullscreen sync
  const toggleFullscreen = useCallback((forceState?: boolean) => {
    setIsFullscreen((prev) => {
      const next = typeof forceState === 'boolean' ? forceState : !prev;
      if (!next && document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (arrowModal?.isOpen) {
          setArrowModal(null);
        } else if (tagModal?.isOpen) {
          setTagModal(null);
        } else if (uploadModal?.isOpen && !uploadModal.isUploading) {
          setUploadModal(null);
        } else if (interactionMode !== 'DEFAULT') {
          setInteractionMode('DEFAULT');
        } else if (isFullscreen) {
          toggleFullscreen(false);
        }
      }
    };
    const onFullscreenChange = () => {
      if (!document.fullscreenElement && isFullscreen) {
        // Keep CSS fullscreen unless user explicitly pressed Escape or Exit Fullscreen
      }
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, [isFullscreen, interactionMode, arrowModal?.isOpen, tagModal?.isOpen, uploadModal?.isOpen, uploadModal?.isUploading, toggleFullscreen]);

  // Load authoritative overrides from server on mount
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const ov = await ApiService.getGraphOverrides();
        if (!mounted || !ov) return;
        applyGraphOverrides(ov);

        if (ov.manualNumbers) setManualNumbers(ov.manualNumbers);
        if (ov.customConnections) {
          const mergedConns: Record<string, PanoramaConnection[]> = {};
          CAMPUS_GRAPH.forEach((n) => {
            mergedConns[n.id] = ov.customConnections[n.id] || n.connections || [];
          });
          Object.entries(ov.customConnections).forEach(([k, v]) => {
            if (Array.isArray(v)) mergedConns[k] = v;
          });
          setConnectionsMap(mergedConns);
        }
        if (ov.customPlaceTags) {
          setTagsMap({ ...getAllCustomPlaceTags(), ...ov.customPlaceTags });
        }
        if (ov.nodeImageOverrides) setNodeImageOverrides(ov.nodeImageOverrides);
        if (ov.nodeMetadataOverrides) setNodeMetadataOverrides(ov.nodeMetadataOverrides);
        if (ov.customPanoramas) setCustomPanoramas(ov.customPanoramas);
        if (ov.lastSavedAt) setLastSavedAt(ov.lastSavedAt);
        setGraphVersion((v) => v + 1);
      } catch (err) {
        console.warn('[PanoramasSection] Could not load graph overrides:', err);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  // Sync prop manual numbers if updated externally
  useEffect(() => {
    if (propManualNumbers && Object.keys(propManualNumbers).length > 0) {
      setManualNumbers((prev) => ({ ...propManualNumbers, ...prev }));
    }
  }, [propManualNumbers]);

  // All Panorama Nodes (474 canonical + any custom uploaded panoramas), sorted by manual number
  const allNodes = useMemo(() => {
    const list = [...CAMPUS_GRAPH];
    list.sort((a, b) => {
      const numA = parseInt(manualNumbers[a.id] || a.manualNumber || '99999', 10);
      const numB = parseInt(manualNumbers[b.id] || b.manualNumber || '99999', 10);
      if (numA !== numB) return numA - numB;
      return a.id.localeCompare(b.id);
    });
    return list;
  }, [manualNumbers, customPanoramas, graphVersion]);

  // Filtered nodes for the left sidebar search
  const filteredNodes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allNodes;
    const cleanNumQ = q.replace(/^#/, '');
    return allNodes.filter((node) => {
      const mNum = String(manualNumbers[node.id] || node.manualNumber || '').toLowerCase();
      const fname = String(
        nodeImageOverrides[node.id]?.filename ||
          nodeMetadataOverrides[node.id]?.filename ||
          node.filename ||
          ''
      ).toLowerCase();
      return (
        node.id.toLowerCase().includes(q) ||
        mNum === cleanNumQ ||
        mNum.includes(cleanNumQ) ||
        fname.includes(q)
      );
    });
  }, [allNodes, searchQuery, manualNumbers, nodeImageOverrides, nodeMetadataOverrides]);

  // Currently selected node & effective properties
  const selectedNode = useMemo(() => {
    return CAMPUS_GRAPH_MAP.get(selectedNodeId) || allNodes[0];
  }, [selectedNodeId, allNodes, graphVersion]);

  const selectedManualNumber = useMemo(() => {
    if (!selectedNode) return '1';
    return manualNumbers[selectedNode.id] || selectedNode.manualNumber || '1';
  }, [selectedNode, manualNumbers]);

  const selectedImagePath = useMemo(() => {
    if (!selectedNode) return '';
    return (
      nodeImageOverrides[selectedNode.id]?.imagePath ||
      customPanoramas[selectedNode.id]?.imagePath ||
      selectedNode.imagePath
    );
  }, [selectedNode, nodeImageOverrides, customPanoramas]);

  const selectedFilename = useMemo(() => {
    if (!selectedNode) return '';
    return (
      nodeMetadataOverrides[selectedNode.id]?.filename ||
      nodeImageOverrides[selectedNode.id]?.filename ||
      customPanoramas[selectedNode.id]?.filename ||
      selectedNode.filename ||
      ''
    );
  }, [selectedNode, nodeMetadataOverrides, nodeImageOverrides, customPanoramas]);

  const selectedArea = useMemo<AreaCode>(() => {
    if (!selectedNode) return 'OUTDOOR';
    return (
      (nodeMetadataOverrides[selectedNode.id]?.area as AreaCode) ||
      (customPanoramas[selectedNode.id]?.area as AreaCode) ||
      selectedNode.area ||
      'OUTDOOR'
    );
  }, [selectedNode, nodeMetadataOverrides, customPanoramas]);

  const selectedFloor = useMemo<number>(() => {
    if (!selectedNode) return 0;
    if (nodeMetadataOverrides[selectedNode.id]?.floor !== undefined) {
      return Number(nodeMetadataOverrides[selectedNode.id].floor);
    }
    if (customPanoramas[selectedNode.id]?.floor !== undefined) {
      return Number(customPanoramas[selectedNode.id].floor);
    }
    return parseFloorNumber(selectedNode.floor);
  }, [selectedNode, nodeMetadataOverrides, customPanoramas]);

  const currentConnections = useMemo<PanoramaConnection[]>(() => {
    if (!selectedNode) return [];
    return connectionsMap[selectedNode.id] || [];
  }, [selectedNode, connectionsMap]);

  const currentTags = useMemo<CustomPlaceTag[]>(() => {
    if (!selectedNode) return [];
    return tagsMap[selectedNode.id] || [];
  }, [selectedNode, tagsMap]);

  // Keep refs in sync for the 120 Hz requestAnimationFrame loop
  useEffect(() => {
    currentConnectionsRef.current = currentConnections;
    needsRenderRef.current = true;
  }, [currentConnections]);

  useEffect(() => {
    currentTagsRef.current = currentTags;
    needsRenderRef.current = true;
  }, [currentTags]);

  // ─────────────────────────────────────────────────────────────
  // 1. INITIALIZE 360° THREE.JS SPHERICAL VIEWER & ON-DEMAND 120 Hz PROJECTION LOOP
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const mount = webglMountRef.current;
    const container = canvasContainerRef.current;
    if (!mount || !container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 460;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(DEFAULT_FOV, width / height, 1, 1100);
    camera.position.set(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    rendererRef.current = renderer;

    mount.replaceChildren(renderer.domElement);

    // Inverted 360° Equirectangular Sphere (48x32 segments is visually identical to 64x48 at half the vertex cost)
    const geometry = new THREE.SphereGeometry(500, 48, 32);
    geometry.scale(-1, 1, 1);

    const material = new THREE.MeshBasicMaterial({
      color: 0x0f172a,
      side: THREE.DoubleSide,
    });
    const sphereMesh = new THREE.Mesh(geometry, material);
    sphereMesh.rotation.y = 0;
    scene.add(sphereMesh);
    sphereMeshRef.current = sphereMesh;
    needsRenderRef.current = true;

    const camLookTarget = new THREE.Vector3();
    const camForward = new THREE.Vector3();
    const worldPoint = new THREE.Vector3();
    const pointDir = new THREE.Vector3();

    let animFrameId: number;

    const animate = () => {
      animFrameId = requestAnimationFrame(animate);
      const cam = cameraRef.current;
      const rend = rendererRef.current;
      const scn = sceneRef.current;
      const cont = canvasContainerRef.current;
      if (!cam || !rend || !scn || !cont) return;

      const lonDiff = Math.abs(lonRef.current - targetLonRef.current);
      const latDiff = Math.abs(latRef.current - targetLatRef.current);
      const fovDiff = Math.abs(cam.fov - fovRef.current);
      const isMoving =
        isPanningCameraRef.current ||
        Boolean(dragStateRef.current) ||
        lonDiff > 0.01 ||
        latDiff > 0.01 ||
        fovDiff > 0.02;

      // On-demand rendering: 0% GPU/CPU usage when camera & markers are stationary
      if (!isMoving && !needsRenderRef.current) {
        return;
      }
      needsRenderRef.current = false;

      // Direct 1:1 tracking while actively dragging for zero cursor lag; smooth glide when clicking a row
      if (isPanningCameraRef.current) {
        lonRef.current = targetLonRef.current;
        latRef.current = targetLatRef.current;
      } else {
        lonRef.current =
          lonDiff < 0.01
            ? targetLonRef.current
            : THREE.MathUtils.lerp(lonRef.current, targetLonRef.current, 0.28);
        latRef.current =
          latDiff < 0.01
            ? targetLatRef.current
            : THREE.MathUtils.lerp(latRef.current, targetLatRef.current, 0.28);
      }

      // Strictly clamp vertical pitch to [4°, 72°] so photographer head at bottom (< -28°) is NEVER visible
      latRef.current = Math.max(MIN_CAMERA_PITCH, Math.min(MAX_CAMERA_PITCH, latRef.current));
      targetLatRef.current = Math.max(MIN_CAMERA_PITCH, Math.min(MAX_CAMERA_PITCH, targetLatRef.current));

      if (fovDiff > 0.02) {
        cam.fov =
          fovDiff < 0.1 ? fovRef.current : THREE.MathUtils.lerp(cam.fov, fovRef.current, 0.4);
        cam.updateProjectionMatrix();
      }

      const radLat = THREE.MathUtils.degToRad(latRef.current);
      const radLon = THREE.MathUtils.degToRad(lonRef.current);

      camLookTarget.set(
        500 * Math.cos(radLat) * Math.sin(radLon),
        500 * Math.sin(radLat),
        500 * Math.cos(radLat) * Math.cos(radLon)
      );
      cam.lookAt(camLookTarget);
      cam.updateMatrixWorld();

      rend.render(scn, cam);

      // Project 3D Arrows & Location Tags onto the 2D Overlay
      const cw = cont.clientWidth;
      const ch = cont.clientHeight;
      if (cw <= 0 || ch <= 0) return;

      camForward.copy(camLookTarget).normalize();

      // 1. Project Outgoing Navigation Arrows
      const conns = currentConnectionsRef.current;
      for (let i = 0; i < conns.length; i++) {
        const conn = conns[i];
        const key = `${conn.targetId}_${i}`;
        const el = arrowDomRefs.current.get(key);
        if (!el) continue;

        const yaw = Number(conn.heading ?? conn.worldBearing ?? 0);
        const rawPitch = Number(conn.pitch ?? -13);
        // Display-only visual compatibility layer: keeps ground arrows comfortably in the lower-middle road area (-14° to +25°) without rewriting saved data
        const pitch = Math.max(-14, Math.min(25, rawPitch < -14 ? -13 : rawPitch));

        const rYaw = THREE.MathUtils.degToRad(yaw);
        const rPitch = THREE.MathUtils.degToRad(pitch);

        worldPoint.set(
          400 * Math.cos(rPitch) * Math.sin(rYaw),
          400 * Math.sin(rPitch),
          400 * Math.cos(rPitch) * Math.cos(rYaw)
        );
        pointDir.copy(worldPoint).normalize();

        const dot = camForward.dot(pointDir);
        if (dot <= 0.15) {
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
          continue;
        }

        worldPoint.project(cam);
        if (worldPoint.z < -1 || worldPoint.z > 1) {
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
          continue;
        }
        const sx = (worldPoint.x * 0.5 + 0.5) * cw;
        const sy = (-worldPoint.y * 0.5 + 0.5) * ch;

        if (sx < -80 || sx > cw + 80 || sy < -80 || sy > ch + 80) {
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
        } else {
          el.style.opacity = '1';
          el.style.pointerEvents = 'auto';
          el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -50%)`;
        }
      }

      // 2. Project Location Tags
      const tags = currentTagsRef.current;
      for (let i = 0; i < tags.length; i++) {
        const tag = tags[i];
        const el = tagDomRefs.current.get(tag.id);
        if (!el) continue;

        const yaw = Number(tag.yaw ?? 0);
        const pitch = Math.max(-17, Math.min(65, Number(tag.pitch ?? 8)));

        const rYaw = THREE.MathUtils.degToRad(yaw);
        const rPitch = THREE.MathUtils.degToRad(pitch);

        worldPoint.set(
          400 * Math.cos(rPitch) * Math.sin(rYaw),
          400 * Math.sin(rPitch),
          400 * Math.cos(rPitch) * Math.cos(rYaw)
        );
        pointDir.copy(worldPoint).normalize();

        const dot = camForward.dot(pointDir);
        if (dot <= 0.15) {
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
          continue;
        }

        worldPoint.project(cam);
        if (worldPoint.z < -1 || worldPoint.z > 1) {
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
          continue;
        }
        const sx = (worldPoint.x * 0.5 + 0.5) * cw;
        const sy = (-worldPoint.y * 0.5 + 0.5) * ch;

        if (sx < -120 || sx > cw + 120 || sy < -60 || sy > ch + 60) {
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
        } else {
          el.style.opacity = '1';
          el.style.pointerEvents = 'auto';
          el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -50%)`;
        }
      }
    };

    animate();

    // ResizeObserver handles window resize AND Fullscreen toggle instantaneously
    const updateSize = () => {
      if (!canvasContainerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = canvasContainerRef.current.clientWidth || window.innerWidth;
      const h = canvasContainerRef.current.clientHeight || window.innerHeight;
      if (w > 0 && h > 0) {
        cameraRef.current.aspect = w / h;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(w, h);
        needsRenderRef.current = true;
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      updateSize();
    });
    resizeObserver.observe(container);
    window.addEventListener('resize', updateSize);

    return () => {
      cancelAnimationFrame(animFrameId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateSize);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      sphereMeshRef.current = null;
    };
  }, []);

  // Re-trigger resize when Fullscreen toggles
  useEffect(() => {
    const timer = requestAnimationFrame(() => {
      if (!canvasContainerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = canvasContainerRef.current.clientWidth || window.innerWidth;
      const h = canvasContainerRef.current.clientHeight || window.innerHeight;
      if (w > 0 && h > 0) {
        cameraRef.current.aspect = w / h;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(w, h);
        needsRenderRef.current = true;
      }
    });
    return () => cancelAnimationFrame(timer);
  }, [isFullscreen]);

  // ─────────────────────────────────────────────────────────────
  // 2. LOAD 360° TEXTURE WHEN SELECTED PANORAMA OR IMAGE CHANGES
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const mesh = sphereMeshRef.current;
    if (!mesh || !selectedImagePath || !selectedNode) return;

    let active = true;

    // Face the primary forward connection (or 0°) when switching panoramas
    const nodeConns = connectionsMap[selectedNode.id] || selectedNode.connections || [];
    const primaryConn =
      nodeConns.find((c) => c.direction === 'straight' || c.type === 'forward') || nodeConns[0];
    const initialYaw = primaryConn
      ? Number(primaryConn.heading ?? primaryConn.worldBearing ?? 0)
      : Number((selectedNode as any).defaultCameraYaw ?? 0);

    lonRef.current = initialYaw;
    targetLonRef.current = initialYaw;
    latRef.current = DEFAULT_CAMERA_PITCH;
    targetLatRef.current = DEFAULT_CAMERA_PITCH;
    needsRenderRef.current = true;

    const applyTexture = (tex: THREE.Texture) => {
      if (!active || !sphereMeshRef.current) return;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = Math.min(rendererRef.current?.capabilities.getMaxAnisotropy() || 8, 8);

      const imgEl = tex.image as HTMLImageElement | undefined;
      const w = Number(imgEl?.naturalWidth || imgEl?.width || 4096);
      const h = Number(imgEl?.naturalHeight || imgEl?.height || 2048);
      const ratio = h > 0 ? Number((w / h).toFixed(2)) : 2;
      const isEquirectangular = ratio >= 1.75 && ratio <= 2.25;
      setImageProjectionMeta({
        width: w,
        height: h,
        aspectRatio: ratio,
        isEquirectangular,
      });

      const mat = sphereMeshRef.current.material as THREE.MeshBasicMaterial;
      mat.color.setHex(0xffffff);
      mat.map = tex;
      mat.needsUpdate = true;
      needsRenderRef.current = true;
      is360ViewerBusy = false;
      setIsTextureLoading(false);
    };

    // 1. Check local full-resolution 4096x2048 texture cache
    if (textureCacheRef.current.has(selectedImagePath)) {
      applyTexture(textureCacheRef.current.get(selectedImagePath)!);
      return;
    }

    is360ViewerBusy = true;
    setIsTextureLoading(true);
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = 'anonymous';

    let safeUrl = selectedImagePath;
    try {
      safeUrl = encodeURI(decodeURI(selectedImagePath));
    } catch {
      safeUrl = selectedImagePath;
    }

    const cacheAndApply = (tex: THREE.Texture) => {
      if (textureCacheRef.current.size >= 14) {
        const oldestKey = textureCacheRef.current.keys().next().value;
        if (oldestKey) {
          const oldTex = textureCacheRef.current.get(oldestKey);
          textureCacheRef.current.delete(oldestKey);
          oldTex?.dispose();
        }
      }
      textureCacheRef.current.set(selectedImagePath, tex);
      applyTexture(tex);
    };

    loader.load(
      safeUrl,
      cacheAndApply,
      undefined,
      () => {
        loader.load(
          selectedImagePath,
          cacheAndApply,
          undefined,
          () => {
            is360ViewerBusy = false;
            if (active) setIsTextureLoading(false);
          }
        );
      }
    );

    return () => {
      active = false;
      is360ViewerBusy = false;
    };
  }, [selectedNode?.id, selectedImagePath]);

  const handleSelectNode = useCallback((id: string) => {
    setSelectedNodeId(id);
    setInteractionMode('DEFAULT');
    fovRef.current = DEFAULT_FOV;
    setZoomPercent(100);
    needsRenderRef.current = true;
  }, []);

  // Aim 360° camera smoothly at a specific (yaw, pitch)
  const aimCameraAt = useCallback((yawDeg: number, pitchDeg: number = DEFAULT_CAMERA_PITCH) => {
    const curLon = lonRef.current;
    const diff = ((((yawDeg - (curLon % 360)) + 540) % 360) - 180);
    targetLonRef.current = curLon + diff;
    targetLatRef.current = Math.max(MIN_CAMERA_PITCH, Math.min(MAX_CAMERA_PITCH, pitchDeg));
    needsRenderRef.current = true;
  }, []);

  // Zoom Helpers (Maps zoomPercent 95%..200% to FOV 60°..32°)
  const applyZoomPercent = useCallback((nextZoom: number) => {
    const clampedZoom = Math.max(95, Math.min(200, nextZoom));
    setZoomPercent(clampedZoom);
    const nextFov = Math.max(MIN_FOV, Math.min(MAX_FOV, Math.round(DEFAULT_FOV * (100 / clampedZoom))));
    fovRef.current = nextFov;
    needsRenderRef.current = true;
  }, []);

  const handleCanvasWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      const deltaZoom = e.deltaY < 0 ? 15 : -15;
      applyZoomPercent(zoomPercent + deltaZoom);
    },
    [zoomPercent, applyZoomPercent]
  );

  // Touch Pinch-to-Zoom Support for Mobile/Tablet/Touch Laptops
  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchStartDistRef.current = Math.hypot(dx, dy);
        pinchStartZoomRef.current = zoomPercent;
      }
    },
    [zoomPercent]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 2 && pinchStartDistRef.current && pinchStartDistRef.current > 10) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const scale = dist / pinchStartDistRef.current;
        applyZoomPercent(Math.round(pinchStartZoomRef.current * scale));
      }
    },
    [applyZoomPercent]
  );

  const handleTouchEnd = useCallback(() => {
    pinchStartDistRef.current = null;
  }, []);

  // ─────────────────────────────────────────────────────────────
  // PERSISTENT LOCAL SAVE WORKFLOW
  // ─────────────────────────────────────────────────────────────
  const persistAllChanges = useCallback(
    async (overridesPatch?: Partial<{
      manualNumbers: Record<string, string>;
      customConnections: Record<string, PanoramaConnection[]>;
      customPlaceTags: Record<string, CustomPlaceTag[]>;
      nodeImageOverrides: Record<string, any>;
      nodeMetadataOverrides: Record<string, any>;
      customPanoramas: Record<string, any>;
    }>) => {
      setIsSaving(true);
      setSaveBanner(null);

      const nextManualNumbers = overridesPatch?.manualNumbers ?? manualNumbers;
      const nextConnections = overridesPatch?.customConnections ?? connectionsMap;
      const nextTags = overridesPatch?.customPlaceTags ?? tagsMap;
      const nextImages = overridesPatch?.nodeImageOverrides ?? nodeImageOverrides;
      const nextMeta = overridesPatch?.nodeMetadataOverrides ?? nodeMetadataOverrides;
      const nextCustomPanos = overridesPatch?.customPanoramas ?? customPanoramas;

      const payload = {
        manualNumbers: nextManualNumbers,
        customConnections: nextConnections,
        customPlaceTags: nextTags,
        nodeImageOverrides: nextImages,
        nodeMetadataOverrides: nextMeta,
        customPanoramas: nextCustomPanos,
      };

      // Update live client graph immediately
      applyGraphOverrides(payload);
      setCustomPlaceTags(nextTags);

      try {
        const res = await ApiService.saveGraphOverrides(payload, 'Campus Admin');
        const savedTime = res?.overrides?.lastSavedAt || new Date().toISOString();
        setLastSavedAt(savedTime);
        setIsDirty(false);
        setSaveBanner({
          type: 'success',
          text: 'Changes saved to local development database. Ready to publish when verified.',
        });
      } catch (err: any) {
        setSaveBanner({
          type: 'error',
          text: `Save failed: ${err?.message || 'Server error'}. Your edits are retained in the editor—please retry Save.`,
        });
      } finally {
        setIsSaving(false);
      }
    },
    [
      manualNumbers,
      connectionsMap,
      tagsMap,
      nodeImageOverrides,
      nodeMetadataOverrides,
      customPanoramas,
    ]
  );

  // ─────────────────────────────────────────────────────────────
  // METADATA EDIT HANDLERS (Manual Number, Filename, Area, Floor)
  // ─────────────────────────────────────────────────────────────
  const handleManualNumberChange = (val: string) => {
    if (!selectedNode) return;
    const updated = { ...manualNumbers, [selectedNode.id]: val };
    setManualNumbers(updated);
    onUpdateManualNumber(selectedNode.id, val);
    setIsDirty(true);
  };

  const handleFilenameChange = (val: string) => {
    if (!selectedNode) return;
    const updatedMeta = {
      ...nodeMetadataOverrides,
      [selectedNode.id]: {
        ...(nodeMetadataOverrides[selectedNode.id] || {}),
        filename: val,
        updatedAt: new Date().toISOString(),
      },
    };
    setNodeMetadataOverrides(updatedMeta);
    if (nodeImageOverrides[selectedNode.id]) {
      setNodeImageOverrides({
        ...nodeImageOverrides,
        [selectedNode.id]: {
          ...nodeImageOverrides[selectedNode.id],
          filename: val,
          image: val,
        },
      });
    }
    setIsDirty(true);
  };

  const handleAreaChange = (newArea: AreaCode) => {
    if (!selectedNode) return;
    const updatedMeta = {
      ...nodeMetadataOverrides,
      [selectedNode.id]: {
        ...(nodeMetadataOverrides[selectedNode.id] || {}),
        area: newArea,
        updatedAt: new Date().toISOString(),
      },
    };
    setNodeMetadataOverrides(updatedMeta);
    setIsDirty(true);
  };

  const handleFloorChange = (newFloor: number) => {
    if (!selectedNode) return;
    const updatedMeta = {
      ...nodeMetadataOverrides,
      [selectedNode.id]: {
        ...(nodeMetadataOverrides[selectedNode.id] || {}),
        floor: newFloor,
        updatedAt: new Date().toISOString(),
      },
    };
    setNodeMetadataOverrides(updatedMeta);
    setIsDirty(true);
  };

  // ─────────────────────────────────────────────────────────────
  // IMAGE UPLOAD & REPLACEMENT (+ Add Image / Replace Image)
  // ─────────────────────────────────────────────────────────────
  const handleFileChosen = (file: File | undefined, mode: 'ADD_NEW' | 'REPLACE') => {
    if (!file) return;

    const allowedExtensions = /\.(jpg|jpeg|png|webp)$/i;
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

    if (!allowedExtensions.test(file.name) && !allowedMimes.includes(file.type)) {
      setSaveBanner({
        type: 'error',
        text: `Invalid file type "${file.name}". Only JPG, JPEG, PNG, and WebP panorama images are allowed.`,
      });
      return;
    }

    if (file.size === 0) {
      setSaveBanner({
        type: 'error',
        text: `Selected file "${file.name}" is empty (0 bytes).`,
      });
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setSaveBanner({
        type: 'error',
        text: `File "${file.name}" (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds the 15 MB limit.`,
      });
      return;
    }

    let maxNum = 474;
    Object.values(manualNumbers).forEach((v) => {
      const n = parseInt(String(v), 10);
      if (Number.isFinite(n) && n > maxNum) maxNum = n;
    });
    const nextNumStr = String(maxNum + 1);
    const defaultNewId = `${selectedArea.toLowerCase()}_${nextNumStr.padStart(3, '0')}`;

    const previewUrl = URL.createObjectURL(file);
    setUploadModal({
      isOpen: true,
      mode,
      file,
      previewUrl,
      nodeId: mode === 'REPLACE' ? selectedNode.id : defaultNewId,
      manualNumber: mode === 'REPLACE' ? selectedManualNumber : nextNumStr,
      filename: file.name,
      area: selectedArea,
      floor: selectedFloor,
      isUploading: false,
      error: null,
    });
  };

  const confirmImageUpload = async () => {
    if (!uploadModal || !uploadModal.file) return;
    setUploadModal((prev) => (prev ? { ...prev, isUploading: true, error: null } : null));

    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read selected file from disk.'));
        reader.readAsDataURL(uploadModal.file!);
      });

      const response = await ApiService.uploadPanoramaImage({
        mode: uploadModal.mode,
        nodeId: uploadModal.nodeId.trim(),
        filename: uploadModal.filename.trim() || uploadModal.file.name,
        mimeType: uploadModal.file.type,
        base64Data,
        title: uploadModal.nodeId.trim(),
        area: uploadModal.area,
        floor: uploadModal.floor,
        manualNumber: uploadModal.manualNumber.trim(),
      });

      if (response?.overrides) {
        const ov = response.overrides;
        applyGraphOverrides(ov);
        if (ov.manualNumbers) setManualNumbers(ov.manualNumbers);
        if (ov.nodeImageOverrides) setNodeImageOverrides(ov.nodeImageOverrides);
        if (ov.nodeMetadataOverrides) setNodeMetadataOverrides(ov.nodeMetadataOverrides);
        if (ov.customPanoramas) setCustomPanoramas(ov.customPanoramas);
        if (ov.customConnections) setConnectionsMap((prev) => ({ ...prev, ...ov.customConnections }));
        if (ov.customPlaceTags) setTagsMap((prev) => ({ ...prev, ...ov.customPlaceTags }));
        if (ov.lastSavedAt) setLastSavedAt(ov.lastSavedAt);
        setGraphVersion((v) => v + 1);
      }

      const targetId = response?.result?.nodeId || uploadModal.nodeId.trim();
      setSelectedNodeId(targetId);
      onSelectPanorama(targetId);
      setIsDirty(false);
      setSaveBanner({
        type: 'success',
        text: response?.message || 'Panorama image uploaded and saved.',
      });

      if (uploadModal.previewUrl) URL.revokeObjectURL(uploadModal.previewUrl);
      setUploadModal(null);
    } catch (err: any) {
      setUploadModal((prev) =>
        prev
          ? {
              ...prev,
              isUploading: false,
              error: err?.message || 'Failed to upload image.',
            }
          : null
      );
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 360° RAYCAST COORDINATE MATH & 120 Hz POINTER / DRAG HANDLERS
  // ─────────────────────────────────────────────────────────────
  const clientPointToYawPitch = useCallback(
    (clientX: number, clientY: number): { yaw: number; pitch: number } | null => {
      const container = canvasContainerRef.current;
      const camera = cameraRef.current;
      if (!container || !camera) return null;

      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;

      const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
      const dir = raycaster.ray.direction.clone().normalize();

      const pitchRad = Math.asin(Math.max(-1, Math.min(1, dir.y)));
      const pitchDeg = Math.round(THREE.MathUtils.radToDeg(pitchRad));

      const yawRad = Math.atan2(dir.x, dir.z);
      let yawDeg = Math.round(THREE.MathUtils.radToDeg(yawRad));
      yawDeg = ((yawDeg % 360) + 360) % 360;

      return {
        yaw: yawDeg,
        pitch: Math.max(-20, Math.min(65, pitchDeg)),
      };
    },
    []
  );

  // Start 360° Camera Rotation Pan
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current) return;
    isPanningCameraRef.current = true;
    is360ViewerBusy = true;
    panStartXRef.current = e.clientX;
    panStartYRef.current = e.clientY;
    panStartLonRef.current = targetLonRef.current;
    panStartLatRef.current = targetLatRef.current;
    panMovedRef.current = false;
    needsRenderRef.current = true;
  };

  // Move 360° Camera OR Drag Selected Arrow / Tag in 3D Space (Zero React re-renders during drag)
  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (drag) {
      const dx = Math.abs(e.clientX - drag.startX);
      const dy = Math.abs(e.clientY - drag.startY);
      if (dx > 4 || dy > 4) {
        drag.hasMoved = true;
      }
      if (!drag.hasMoved) return;

      const coords = clientPointToYawPitch(e.clientX, e.clientY);
      if (!coords || !selectedNode) return;

      if (drag.type === 'ARROW') {
        const clampedArrowPitch = Math.max(-20, Math.min(25, coords.pitch));
        drag.latestYaw = coords.yaw;
        drag.latestPitch = clampedArrowPitch;
        currentConnectionsRef.current = currentConnectionsRef.current.map((c) =>
          c.targetId === drag.id
            ? {
                ...c,
                heading: coords.yaw,
                worldBearing: coords.yaw,
                pitch: clampedArrowPitch,
                direction: inferDirectionFromYaw(coords.yaw, lonRef.current),
              }
            : c
        );
        needsRenderRef.current = true;
      } else if (drag.type === 'TAG') {
        drag.latestYaw = coords.yaw;
        drag.latestPitch = coords.pitch;
        currentTagsRef.current = currentTagsRef.current.map((t) =>
          t.id === drag.id ? { ...t, yaw: coords.yaw, pitch: coords.pitch } : t
        );
        needsRenderRef.current = true;
      }
      return;
    }

    if (!isPanningCameraRef.current) return;
    const deltaX = e.clientX - panStartXRef.current;
    const deltaY = e.clientY - panStartYRef.current;

    if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
      panMovedRef.current = true;
    }

    // Agile 360° horizontal rotation & clamped vertical pitch (never showing photographer head)
    const fovScale = (fovRef.current || DEFAULT_FOV) / DEFAULT_FOV;
    targetLonRef.current = panStartLonRef.current - deltaX * 0.28 * fovScale;
    targetLatRef.current = Math.max(
      MIN_CAMERA_PITCH,
      Math.min(MAX_CAMERA_PITCH, panStartLatRef.current + deltaY * 0.25 * fovScale)
    );
    needsRenderRef.current = true;
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const wasPanning = isPanningCameraRef.current;
    const moved = panMovedRef.current;
    isPanningCameraRef.current = false;
    is360ViewerBusy = false;

    if (!wasPanning || moved || dragStateRef.current) return;

    // Stationary click when in ADD_TAG or ADD_ARROW mode places item at exact clicked 3D raycast point
    const coords = clientPointToYawPitch(e.clientX, e.clientY);
    if (!coords) return;

    if (interactionMode === 'ADD_TAG') {
      setTagModal({
        isOpen: true,
        mode: 'ADD',
        text: '',
        yaw: coords.yaw,
        pitch: coords.pitch,
      });
      setInteractionMode('DEFAULT');
      return;
    }

    if (interactionMode === 'ADD_ARROW') {
      const defaultTarget =
        allNodes.find((n) => n.id !== selectedNode?.id)?.id || 'outdoor_001';
      setArrowDestSearch('');
      setArrowModal({
        isOpen: true,
        mode: 'ADD',
        targetId: defaultTarget,
        direction: inferDirectionFromYaw(coords.yaw, lonRef.current),
        label: '',
        heading: coords.yaw,
        pitch: Math.max(-20, Math.min(15, coords.pitch)),
      });
      setInteractionMode('DEFAULT');
    }
  };

  // Double-click anywhere on the 360° canvas quickly opens Add Arrow at that 3D spot
  const handleCanvasDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragStateRef.current) return;
    const coords = clientPointToYawPitch(e.clientX, e.clientY);
    if (!coords) return;
    const defaultTarget =
      allNodes.find((n) => n.id !== selectedNode?.id)?.id || 'outdoor_001';
    setArrowDestSearch('');
    setArrowModal({
      isOpen: true,
      mode: 'ADD',
      targetId: defaultTarget,
      direction: inferDirectionFromYaw(coords.yaw, lonRef.current),
      label: '',
      heading: coords.yaw,
      pitch: Math.max(-20, Math.min(15, coords.pitch)),
    });
  };

  const startMarkerDrag = (
    e: React.PointerEvent,
    type: 'ARROW' | 'TAG',
    id: string
  ) => {
    e.stopPropagation();
    isPanningCameraRef.current = false;
    is360ViewerBusy = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStateRef.current = {
      type,
      id,
      startX: e.clientX,
      startY: e.clientY,
      hasMoved: false,
      rafId: null,
    };
  };

  const endMarkerDrag = (
    e: React.PointerEvent,
    onClickIfStationary: () => void
  ) => {
    e.stopPropagation();
    is360ViewerBusy = false;
    const drag = dragStateRef.current;
    if (drag?.rafId) {
      cancelAnimationFrame(drag.rafId);
    }
    const moved = Boolean(drag?.hasMoved);
    dragStateRef.current = null;
    if (!moved) {
      onClickIfStationary();
    } else if (drag && selectedNode && drag.latestYaw !== undefined && drag.latestPitch !== undefined) {
      const finalYaw = drag.latestYaw;
      const finalPitch = drag.latestPitch;
      if (drag.type === 'ARROW') {
        setConnectionsMap((prev) => ({
          ...prev,
          [selectedNode.id]: currentConnectionsRef.current,
        }));
        setIsDirty(true);
      } else if (drag.type === 'TAG') {
        setTagsMap((prev) => ({
          ...prev,
          [selectedNode.id]: (prev[selectedNode.id] || []).map((t) =>
            t.id === drag.id ? { ...t, yaw: finalYaw, pitch: finalPitch } : t
          ),
        }));
        setIsDirty(true);
      }
      needsRenderRef.current = true;
    }
  };

  // Open Add Arrow Modal at current 360° camera facing yaw
  const openAddArrowAtCurrentView = () => {
    const currentYaw = Math.round(((lonRef.current % 360) + 360) % 360);
    const defaultTarget =
      allNodes.find((n) => n.id !== selectedNode?.id)?.id || 'outdoor_001';
    setArrowDestSearch('');
    setArrowModal({
      isOpen: true,
      mode: 'ADD',
      targetId: defaultTarget,
      direction: 'straight',
      label: '',
      heading: currentYaw,
      pitch: -15,
    });
  };

  // Open Add Tag Modal at current 360° camera facing yaw/pitch
  const openAddTagAtCurrentView = () => {
    const currentYaw = Math.round(((lonRef.current % 360) + 360) % 360);
    const currentPitch = Math.round(Math.max(0, Math.min(35, latRef.current)));
    setTagModal({
      isOpen: true,
      mode: 'ADD',
      text: '',
      yaw: currentYaw,
      pitch: currentPitch,
    });
  };

  // ─────────────────────────────────────────────────────────────
  // ONE-WAY CONNECTION CRUD HANDLERS (NEVER AUTO-REVERSE)
  // ─────────────────────────────────────────────────────────────
  const handleSaveArrowModal = () => {
    if (!arrowModal || !selectedNode) return;
    const targetId = arrowModal.targetId.trim();
    if (!targetId) return;
    if (targetId === selectedNode.id) {
      setSaveBanner({
        type: 'error',
        text: 'A panorama cannot connect to itself. Please choose a different destination panorama.',
      });
      return;
    }

    const list = [...(connectionsMap[selectedNode.id] || [])];
    const newConn: PanoramaConnection = {
      id: `conn_${selectedNode.id}_${targetId}_${Date.now()}`,
      targetId,
      type: 'forward',
      direction: arrowModal.direction,
      heading: arrowModal.heading,
      worldBearing: arrowModal.heading,
      pitch: Math.max(-20, Math.min(25, arrowModal.pitch)),
      instruction: arrowModal.label.trim() || undefined,
      distanceMeters: 12,
      walkingCost: 12,
      confirmed: true,
      verified: true,
      bidirectional: false, // STRICT ONE-WAY CONNECTION ONLY
    };

    let nextList: PanoramaConnection[];
    if (arrowModal.mode === 'EDIT' && arrowModal.originalTargetId) {
      nextList = list
        .filter((c) => c.targetId !== targetId || c.targetId === arrowModal.originalTargetId)
        .map((c) => (c.targetId === arrowModal.originalTargetId ? newConn : c));
    } else {
      const existingIdx = list.findIndex((c) => c.targetId === targetId);
      if (existingIdx >= 0) {
        nextList = list.map((c, idx) => (idx === existingIdx ? newConn : c));
      } else {
        nextList = [...list, newConn];
      }
    }

    // Strict One-Way Rule: ONLY update connectionsMap[selectedNode.id], NEVER connectionsMap[targetId]
    const updatedConnectionsMap = {
      ...connectionsMap,
      [selectedNode.id]: nextList,
    };
    setConnectionsMap(updatedConnectionsMap);
    setIsDirty(true);
    aimCameraAt(arrowModal.heading);
    setArrowModal(null);
  };

  const handleDeleteArrow = (targetId: string) => {
    if (!selectedNode) return;
    const nextList = (connectionsMap[selectedNode.id] || []).filter(
      (c) => c.targetId !== targetId
    );
    const updatedConnectionsMap = {
      ...connectionsMap,
      [selectedNode.id]: nextList,
    };
    setConnectionsMap(updatedConnectionsMap);
    setIsDirty(true);
  };

  const handleInlineConnectionLabelChange = (targetId: string, newLabel: string) => {
    if (!selectedNode) return;
    const nextList = (connectionsMap[selectedNode.id] || []).map((c) =>
      c.targetId === targetId ? { ...c, instruction: newLabel } : c
    );
    setConnectionsMap({
      ...connectionsMap,
      [selectedNode.id]: nextList,
    });
    setIsDirty(true);
  };

  // ─────────────────────────────────────────────────────────────
  // LOCATION TAG CRUD HANDLERS
  // ─────────────────────────────────────────────────────────────
  const handleSaveTagModal = () => {
    if (!tagModal || !selectedNode) return;
    const text = tagModal.text.trim();
    if (!text) return;

    const list = [...(tagsMap[selectedNode.id] || [])];
    let nextList: CustomPlaceTag[];

    if (tagModal.mode === 'EDIT' && tagModal.tagId) {
      nextList = list.map((t) =>
        t.id === tagModal.tagId
          ? { ...t, text, label: text, yaw: tagModal.yaw, pitch: tagModal.pitch }
          : t
      );
    } else {
      const newTag: CustomPlaceTag = {
        id: `tag_${selectedNode.id}_${Date.now()}`,
        text,
        label: text,
        yaw: tagModal.yaw,
        pitch: tagModal.pitch,
        distance: 10,
        category: 'LANDMARK',
      };
      nextList = [...list, newTag];
    }

    const updatedTagsMap = {
      ...tagsMap,
      [selectedNode.id]: nextList,
    };
    setTagsMap(updatedTagsMap);
    setIsDirty(true);
    aimCameraAt(tagModal.yaw, Math.max(MIN_CAMERA_PITCH, tagModal.pitch));
    setTagModal(null);
  };

  const handleDeleteTag = (tagId: string) => {
    if (!selectedNode) return;
    const nextList = (tagsMap[selectedNode.id] || []).filter((t) => t.id !== tagId);
    setTagsMap({
      ...tagsMap,
      [selectedNode.id]: nextList,
    });
    setIsDirty(true);
  };

  // Quick Prev / Next Panorama Navigation (for Fullscreen 360° Editing)
  const selectedNodeIndex = useMemo(
    () => allNodes.findIndex((n) => n.id === selectedNode?.id),
    [allNodes, selectedNode?.id]
  );

  const handleSelectPrevNode = () => {
    if (selectedNodeIndex > 0) {
      handleSelectNode(allNodes[selectedNodeIndex - 1].id);
    }
  };

  const handleSelectNextNode = () => {
    if (selectedNodeIndex >= 0 && selectedNodeIndex < allNodes.length - 1) {
      handleSelectNode(allNodes[selectedNodeIndex + 1].id);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 120 Hz VIRTUALIZED NODE LIST CALCULATIONS
  // ─────────────────────────────────────────────────────────────
  const ITEM_HEIGHT = 68;
  const VIEWPORT_HEIGHT = 680;
  const OVERSCAN = 3;

  const handleListScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const top = e.currentTarget.scrollTop;
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      setScrollTop(top);
    });
  }, []);

  const { virtualItems, totalListHeight } = useMemo(() => {
    const total = filteredNodes.length;
    const totalHeight = total * ITEM_HEIGHT;
    const startIdx = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
    const endIdx = Math.min(
      total - 1,
      Math.ceil((scrollTop + VIEWPORT_HEIGHT) / ITEM_HEIGHT) + OVERSCAN
    );
    const items: { node: CampusPanoramaNode; index: number; top: number }[] = [];
    for (let i = startIdx; i <= endIdx; i++) {
      if (filteredNodes[i]) {
        items.push({
          node: filteredNodes[i],
          index: i,
          top: i * ITEM_HEIGHT,
        });
      }
    }
    return { virtualItems: items, totalListHeight: totalHeight };
  }, [filteredNodes, scrollTop]);

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto space-y-5 text-slate-800 select-none">
      {/* Hidden File Inputs for Replace Image & + Add Image */}
      <input
        ref={replaceFileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          handleFileChosen(f, 'REPLACE');
        }}
      />
      <input
        ref={addFileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          handleFileChosen(f, 'ADD_NEW');
        }}
      />

      {/* 1. TOP HEADER CARD (Matches Screenshot 1) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl px-6 py-4 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#1a56db]">
            360° PANORAMA EDITOR
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5">
            Edit Connections
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage panorama images, labels and navigation arrows for campus directions.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-center">
          {/* Save State Indicator */}
          <div
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border ${
              isDirty
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}
          >
            {isDirty ? (
              <>
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>Unsaved local changes</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>All changes saved</span>
              </>
            )}
          </div>

          <button
            onClick={() => persistAllChanges()}
            disabled={isSaving}
            className="px-4 py-2 rounded-xl bg-[#1a56db] hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold shadow-xs flex items-center gap-2 transition cursor-pointer"
          >
            {isSaving ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
          </button>
        </div>
      </div>

      {/* Save / Error Banner Notification */}
      {saveBanner && (
        <div
          className={`px-4 py-3 rounded-xl border text-xs font-semibold flex items-center justify-between ${
            saveBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : saveBanner.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {saveBanner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{saveBanner.text}</span>
          </div>
          <button
            onClick={() => setSaveBanner(null)}
            className="p-1 hover:bg-black/5 rounded-lg cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. MAIN TWO-COLUMN WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN: Panorama Nodes (474) */}
        <div className="lg:col-span-3 bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-extrabold text-slate-900">
                Panorama Nodes ({allNodes.length})
              </h2>
              {searchQuery && (
                <span className="text-[11px] font-bold text-[#1a56db]">
                  {filteredNodes.length} found
                </span>
              )}
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setScrollTop(0);
                  if (listScrollRef.current) listScrollRef.current.scrollTop = 0;
                }}
                placeholder="Search by ID, number or filename..."
                className="w-full pl-8 pr-7 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#1a56db] focus:bg-white transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* 120 Hz Virtualized Node List */}
          <div
            ref={listScrollRef}
            onScroll={handleListScroll}
            className="overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 relative"
            style={{ height: VIEWPORT_HEIGHT }}
          >
            {filteredNodes.length === 0 ? (
              <div className="py-12 px-4 text-center text-xs text-slate-400">
                No panoramas match &ldquo;{searchQuery}&rdquo;
              </div>
            ) : (
              <div style={{ height: totalListHeight, position: 'relative' }}>
                {virtualItems.map(({ node, top }) => {
                  const mNum = manualNumbers[node.id] || node.manualNumber || '1';
                  const aCount = (connectionsMap[node.id] || []).length;
                  const imgPath =
                    nodeImageOverrides[node.id]?.imagePath ||
                    customPanoramas[node.id]?.imagePath ||
                    node.imagePath;
                  const fname =
                    nodeMetadataOverrides[node.id]?.filename ||
                    nodeImageOverrides[node.id]?.filename ||
                    customPanoramas[node.id]?.filename ||
                    node.filename ||
                    '';
                  return (
                    <div
                      key={node.id}
                      style={{
                        position: 'absolute',
                        top,
                        left: 0,
                        right: 0,
                        height: ITEM_HEIGHT,
                      }}
                    >
                      <PanoramaNodeRow
                        node={node}
                        manualNumber={mNum}
                        arrowCount={aCount}
                        imagePath={imgPath}
                        filename={fname}
                        isSelected={selectedNode?.id === node.id}
                        onSelect={handleSelectNode}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Selected Panorama Workspace + Outgoing Connections */}
        <div className="lg:col-span-9 space-y-5">
          {/* TOP CARD: Selected Panorama 360° Canvas + Panorama Details Panel */}
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
            {/* Workspace Top Action Bar */}
            <div className="px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-semibold text-slate-400">Selected Panorama</span>
                <span className="px-2 py-0.5 text-xs font-black rounded-md bg-blue-100 text-[#1a56db]">
                  #{selectedManualNumber}
                </span>
                <span className="text-sm font-black text-slate-900">{selectedNode?.id}</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => replaceFileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                  <span>Replace Image</span>
                </button>

                <button
                  onClick={() => addFileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50/70 hover:bg-blue-100/80 text-[#1a56db] text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>+ Add Image</span>
                </button>

                <button
                  onClick={openAddTagAtCurrentView}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                    interactionMode === 'ADD_TAG'
                      ? 'bg-[#1a56db] text-white border-[#1a56db]'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <Tag className="w-3.5 h-3.5 text-[#1a56db]" />
                  <span>+ Add Tag</span>
                </button>

                <button
                  onClick={openAddArrowAtCurrentView}
                  className="px-3.5 py-1.5 rounded-xl bg-[#1a56db] hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Add Arrow</span>
                </button>

                <button
                  onClick={() => persistAllChanges()}
                  disabled={isSaving}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save</span>
                </button>
              </div>
            </div>

            {/* Split Workspace: Center Interactive 360° Sphere Canvas (8 cols) + Right Panorama Details (4 cols) */}
            <div className="grid grid-cols-1 xl:grid-cols-12">
              {/* Interactive 360° Spherical Panorama Canvas (Inline + Fullscreen) */}
              <div
                ref={canvasContainerRef}
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
                onDoubleClick={handleCanvasDoubleClick}
                onWheel={handleCanvasWheel}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                style={
                  isFullscreen
                    ? {
                        position: 'fixed',
                        inset: 0,
                        width: '100vw',
                        height: '100vh',
                        zIndex: 90,
                        touchAction: 'none',
                      }
                    : { touchAction: 'none' }
                }
                className={`xl:col-span-8 bg-slate-950 overflow-hidden select-none touch-none ${
                  interactionMode !== 'DEFAULT'
                    ? 'cursor-crosshair'
                    : 'cursor-grab active:cursor-grabbing'
                } ${
                  isFullscreen
                    ? 'fixed inset-0 z-[90] h-screen w-screen'
                    : 'relative h-[430px] sm:h-[470px]'
                }`}
              >
                {/* Three.js 360° WebGL Sphere Mount */}
                <div
                  ref={webglMountRef}
                  className={`absolute inset-0 w-full h-full pointer-events-none ${
                    imageProjectionMeta && !imageProjectionMeta.isEquirectangular ? 'opacity-0' : 'opacity-100'
                  }`}
                />

                {/* Non-Equirectangular 2D Photograph Fallback (Prevents stretching regular photos into a false 360° sphere) */}
                {imageProjectionMeta && !imageProjectionMeta.isEquirectangular && (
                  <div className="absolute inset-0 z-10 bg-slate-950 flex flex-col items-center justify-center p-4 pointer-events-none">
                    <img
                      src={selectedImagePath}
                      alt={selectedNode?.id || 'Panorama Fallback'}
                      className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                    />
                    <div className="absolute top-3 left-3 px-3 py-1.5 rounded-xl bg-amber-500/95 text-slate-950 text-[11px] font-extrabold shadow-lg flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        Standard 2D Image ({imageProjectionMeta.width}×{imageProjectionMeta.height}, {imageProjectionMeta.aspectRatio}:1) — Shown in 2D Fallback without spherical stretching
                      </span>
                    </div>
                  </div>
                )}

                {/* Subtle Loading Indicator when switching panoramas */}
                {isTextureLoading && (
                  <div className="absolute top-3 left-3 z-30 px-3 py-1 rounded-full bg-slate-900/80 backdrop-blur-xs text-white text-[11px] font-bold flex items-center gap-1.5 border border-white/15 pointer-events-none">
                    <RefreshCw className="w-3 h-3 animate-spin text-blue-400" />
                    <span>Loading 360° View...</span>
                  </div>
                )}

                {/* Fullscreen Top Editing Toolbar (Visible in Fullscreen 360° Rotate & Edit Mode) */}
                {isFullscreen && (
                  <div
                    onPointerDown={(e) => e.stopPropagation()}
                    className="absolute top-4 left-4 right-4 z-40 flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-xl"
                  >
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleSelectPrevNode}
                        disabled={selectedNodeIndex <= 0}
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40 text-slate-700 cursor-pointer"
                        title="Previous Panorama"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>

                      <div className="flex items-center gap-2 px-2">
                        <span className="px-2 py-0.5 text-xs font-black rounded-md bg-blue-100 text-[#1a56db]">
                          #{selectedManualNumber}
                        </span>
                        <span className="text-sm font-black text-slate-900">
                          {selectedNode?.id}
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
                          ({selectedFilename})
                        </span>
                        <span
                          className={`ml-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                            isDirty
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          {isDirty ? 'Unsaved edits' : 'Saved'}
                        </span>
                      </div>

                      <button
                        onClick={handleSelectNextNode}
                        disabled={selectedNodeIndex >= allNodes.length - 1}
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40 text-slate-700 cursor-pointer"
                        title="Next Panorama"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => replaceFileInputRef.current?.click()}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                        <span>Replace Image</span>
                      </button>

                      <button
                        onClick={() => addFileInputRef.current?.click()}
                        className="px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-[#1a56db] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>+ Add Image</span>
                      </button>

                      <button
                        onClick={openAddTagAtCurrentView}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Tag className="w-3.5 h-3.5 text-[#1a56db]" />
                        <span>+ Add Tag</span>
                      </button>

                      <button
                        onClick={openAddArrowAtCurrentView}
                        className="px-3.5 py-1.5 rounded-xl bg-[#1a56db] hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ Add Arrow</span>
                      </button>

                      <button
                        onClick={() => setIsFullscreenDrawerOpen((d) => !d)}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                          isFullscreenDrawerOpen
                            ? 'bg-blue-50 border-blue-300 text-[#1a56db]'
                            : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                        }`}
                        title="Inspect & Edit Markers in Fullscreen"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-[#1a56db]" />
                        <span>Markers ({currentConnections.length + currentTags.length})</span>
                      </button>

                      <button
                        onClick={() => persistAllChanges()}
                        disabled={isSaving}
                        className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>{isSaving ? 'Saving...' : 'Save'}</span>
                      </button>

                      <button
                        onClick={() => toggleFullscreen(false)}
                        className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Minimize2 className="w-3.5 h-3.5" />
                        <span>Exit Fullscreen</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Fullscreen Compact Markers & Connections Inspector Drawer */}
                {isFullscreen && isFullscreenDrawerOpen && (
                  <div
                    onPointerDown={(e) => e.stopPropagation()}
                    className="absolute top-20 right-4 bottom-16 w-80 z-40 rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-2xl flex flex-col overflow-hidden"
                  >
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                      <span className="text-xs font-extrabold text-slate-900">
                        Fullscreen Marker Inspector
                      </span>
                      <button
                        onClick={() => setIsFullscreenDrawerOpen(false)}
                        className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs">
                      {/* Location Tags Section */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            Location Tags ({currentTags.length})
                          </span>
                          <button
                            onClick={openAddTagAtCurrentView}
                            className="text-[11px] font-bold text-[#1a56db] hover:underline cursor-pointer"
                          >
                            + Add Tag
                          </button>
                        </div>
                        {currentTags.length === 0 ? (
                          <div className="text-[11px] text-slate-400 py-1">No tags on this panorama.</div>
                        ) : (
                          <div className="space-y-1.5">
                            {currentTags.map((tag) => {
                              const labelText = tag.text || tag.label || 'Tag';
                              return (
                                <div
                                  key={tag.id}
                                  className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80"
                                >
                                  <button
                                    onClick={() =>
                                      aimCameraAt(
                                        Number(tag.yaw) || 180,
                                        Math.max(MIN_CAMERA_PITCH, Number(tag.pitch) || DEFAULT_CAMERA_PITCH)
                                      )
                                    }
                                    className="font-bold text-slate-800 hover:text-[#1a56db] truncate text-left cursor-pointer"
                                  >
                                    {labelText}
                                  </button>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      onClick={() => {
                                        aimCameraAt(
                                          Number(tag.yaw) || 180,
                                          Math.max(MIN_CAMERA_PITCH, Number(tag.pitch) || DEFAULT_CAMERA_PITCH)
                                        );
                                        setTagModal({
                                          isOpen: true,
                                          mode: 'EDIT',
                                          tagId: tag.id,
                                          text: labelText,
                                          yaw: Number(tag.yaw) || 180,
                                          pitch: Number(tag.pitch) || 0,
                                        });
                                      }}
                                      className="p-1 rounded-md hover:bg-blue-50 text-[#1a56db] cursor-pointer"
                                      title="Edit Tag"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteTag(tag.id)}
                                      className="p-1 rounded-md hover:bg-rose-50 text-rose-600 cursor-pointer"
                                      title="Remove Tag"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Outgoing Arrows Section */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            Outgoing Arrows ({currentConnections.length})
                          </span>
                          <button
                            onClick={openAddArrowAtCurrentView}
                            className="text-[11px] font-bold text-[#1a56db] hover:underline cursor-pointer"
                          >
                            + Add Arrow
                          </button>
                        </div>
                        {currentConnections.length === 0 ? (
                          <div className="text-[11px] text-slate-400 py-1">No outgoing arrows.</div>
                        ) : (
                          <div className="space-y-1.5">
                            {currentConnections.map((conn, idx) => {
                              const yaw = Number(conn.heading ?? conn.worldBearing ?? 180);
                              const destNum =
                                manualNumbers[conn.targetId] ||
                                CAMPUS_GRAPH_MAP.get(conn.targetId)?.manualNumber ||
                                conn.targetId;
                              return (
                                <div
                                  key={`${conn.targetId}_${idx}`}
                                  className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-slate-50 border border-slate-200/80"
                                >
                                  <button
                                    onClick={() => aimCameraAt(yaw)}
                                    className="min-w-0 text-left cursor-pointer"
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <span className="px-1.5 py-0.5 text-[10px] font-black rounded-md bg-blue-100 text-[#1a56db]">
                                        #{destNum}
                                      </span>
                                      <span className="font-extrabold text-slate-900 truncate">
                                        {conn.targetId}
                                      </span>
                                    </div>
                                    <div className="text-[10px] text-slate-500 truncate mt-0.5">
                                      {conn.instruction || `Continue to ${destNum}`} ({Math.round(yaw)}°)
                                    </div>
                                  </button>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      onClick={() => {
                                        aimCameraAt(yaw);
                                        setArrowDestSearch('');
                                        setArrowModal({
                                          isOpen: true,
                                          mode: 'EDIT',
                                          originalTargetId: conn.targetId,
                                          targetId: conn.targetId,
                                          direction:
                                            conn.direction || inferDirectionFromYaw(yaw, lonRef.current),
                                          label: conn.instruction || '',
                                          heading: yaw,
                                          pitch: Number(conn.pitch ?? -15),
                                        });
                                      }}
                                      className="p-1 rounded-md hover:bg-blue-50 text-[#1a56db] cursor-pointer"
                                      title="Edit Arrow"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteArrow(conn.targetId)}
                                      className="p-1 rounded-md hover:bg-rose-50 text-rose-600 cursor-pointer"
                                      title="Delete Arrow"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* 3D-Projected Location Tags Overlay (Updated at 120 Hz via requestAnimationFrame) */}
                {currentTags.map((tag) => {
                  const labelText = tag.text || tag.label || 'Tag';
                  return (
                    <div
                      key={tag.id}
                      ref={(el) => {
                        if (el) tagDomRefs.current.set(tag.id, el);
                        else tagDomRefs.current.delete(tag.id);
                      }}
                      onPointerDown={(e) => startMarkerDrag(e, 'TAG', tag.id)}
                      onPointerUp={(e) =>
                        endMarkerDrag(e, () => {
                          setTagModal({
                            isOpen: true,
                            mode: 'EDIT',
                            tagId: tag.id,
                            text: labelText,
                            yaw: Number(tag.yaw) || 180,
                            pitch: Number(tag.pitch) || 0,
                          });
                        })
                      }
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        opacity: 0,
                        willChange: 'transform, opacity',
                      }}
                      className="z-20 group cursor-grab active:cursor-grabbing select-none"
                      title="Drag to move tag in 360° • Click to edit"
                    >
                      <div className="px-3.5 py-1.5 rounded-full bg-white/95 border-2 border-[#1a56db] text-slate-900 text-xs font-extrabold shadow-lg flex items-center gap-1.5 whitespace-nowrap group-hover:scale-105 transition-transform">
                        <span className="w-2 h-2 rounded-full bg-[#1a56db]" />
                        <span>{labelText}</span>
                      </div>
                    </div>
                  );
                })}

                {/* 3D-Projected Ground Navigation Arrows Overlay (Updated at 120 Hz via requestAnimationFrame) */}
                {currentConnections.map((conn, idx) => {
                  const key = `${conn.targetId}_${idx}`;
                  const yaw = Number(conn.heading ?? conn.worldBearing ?? 180);
                  const pitch = Number(conn.pitch ?? -15);
                  const destManualNum =
                    manualNumbers[conn.targetId] ||
                    CAMPUS_GRAPH_MAP.get(conn.targetId)?.manualNumber ||
                    conn.targetId;
                  const defaultLabel =
                    conn.instruction ||
                    (conn.direction === 'u-turn'
                      ? `Return to ${destManualNum}`
                      : `Continue to ${destManualNum}`);

                  return (
                    <div
                      key={key}
                      ref={(el) => {
                        if (el) arrowDomRefs.current.set(key, el);
                        else arrowDomRefs.current.delete(key);
                      }}
                      onPointerDown={(e) => startMarkerDrag(e, 'ARROW', conn.targetId)}
                      onPointerUp={(e) =>
                        endMarkerDrag(e, () => {
                          setArrowDestSearch('');
                          setArrowModal({
                            isOpen: true,
                            mode: 'EDIT',
                            originalTargetId: conn.targetId,
                            targetId: conn.targetId,
                            direction: conn.direction || inferDirectionFromYaw(yaw, lonRef.current),
                            label: conn.instruction || '',
                            heading: yaw,
                            pitch: Math.max(-20, Math.min(25, pitch)),
                          });
                        })
                      }
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        opacity: 0,
                        willChange: 'transform, opacity',
                      }}
                      className="z-20 flex flex-col items-center group cursor-grab active:cursor-grabbing select-none"
                      title={`Arrow to ${conn.targetId} (#${destManualNum}) • Drag to move in 360° • Click to edit`}
                    >
                      {/* Destination Number Badge Above Arrow */}
                      <div className="mb-1 px-2.5 py-0.5 rounded-md bg-slate-900/90 border border-white/30 text-white text-[11px] font-black shadow-md whitespace-nowrap">
                        #{destManualNum}
                      </div>

                      {/* Glowing Blue Circular Chevron Marker (Matches Screenshot 1) */}
                      <div className="w-11 h-11 rounded-full bg-[#1a56db] border-2 border-white shadow-[0_0_20px_rgba(37,99,235,0.9)] flex items-center justify-center text-white group-hover:scale-110 transition-transform">
                        <ChevronUp className="w-6 h-6 stroke-[3]" />
                      </div>

                      {/* Bottom Label Pill */}
                      <div className="mt-1 px-2.5 py-0.5 rounded-md bg-slate-900/85 text-white text-[10px] font-bold shadow-md whitespace-nowrap">
                        {defaultLabel}
                      </div>
                    </div>
                  );
                })}

                {/* Bottom-Left Instruction Pill (Matches Screenshot 1) */}
                <div className="absolute bottom-3 left-3 z-30 pointer-events-none max-w-md">
                  <div className="px-3.5 py-1.5 rounded-xl bg-slate-900/80 backdrop-blur-xs text-white text-[11px] font-medium border border-white/15 shadow-lg">
                    Drag to rotate 360°. Double-click or use + Add Arrow / + Add Tag to place items. Drag items to move, click to edit.
                  </div>
                </div>

                {/* Bottom-Right Zoom & Fullscreen Controls (Matches Screenshot 1) */}
                <div
                  onPointerDown={(e) => e.stopPropagation()}
                  className="absolute bottom-3 right-3 z-30 flex items-center gap-2"
                >
                  <div className="flex items-center bg-slate-900/85 backdrop-blur-xs text-white rounded-xl border border-white/15 overflow-hidden shadow-lg text-xs font-bold">
                    <button
                      onClick={() => applyZoomPercent(zoomPercent - 20)}
                      className="px-2.5 py-1.5 hover:bg-white/10 transition cursor-pointer"
                      title="Zoom Out"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => applyZoomPercent(100)}
                      className="px-2.5 py-1.5 border-x border-white/15 hover:bg-white/10 transition cursor-pointer"
                      title="Reset 360° Zoom"
                    >
                      {zoomPercent}%
                    </button>
                    <button
                      onClick={() => applyZoomPercent(zoomPercent + 20)}
                      className="px-2.5 py-1.5 hover:bg-white/10 transition cursor-pointer"
                      title="Zoom In"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <button
                    onClick={() => toggleFullscreen()}
                    className="px-3 py-1.5 rounded-xl bg-slate-900/85 backdrop-blur-xs hover:bg-slate-900 text-white border border-white/15 shadow-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    {isFullscreen ? (
                      <>
                        <Minimize2 className="w-3.5 h-3.5" />
                        <span>Exit Fullscreen</span>
                      </>
                    ) : (
                      <>
                        <Maximize2 className="w-3.5 h-3.5" />
                        <span>Fullscreen</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Right Sub-Panel: Panorama Details (Matches Screenshot 1) */}
              <div className="xl:col-span-4 p-5 border-t xl:border-t-0 xl:border-l border-slate-100 bg-white flex flex-col justify-between space-y-4">
                <div className="space-y-3.5">
                  <h3 className="text-sm font-extrabold text-slate-900">Panorama Details</h3>

                  {/* Panorama ID */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">
                      Panorama ID
                    </label>
                    <input
                      type="text"
                      value={selectedNode?.id || ''}
                      readOnly
                      className="w-full px-3 py-2 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none"
                    />
                  </div>

                  {/* Manual Number */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">
                      Manual Number
                    </label>
                    <input
                      type="text"
                      value={selectedManualNumber}
                      onChange={(e) => handleManualNumberChange(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-bold bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-[#1a56db]"
                    />
                  </div>

                  {/* Filename */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">
                      Filename
                    </label>
                    <input
                      type="text"
                      value={selectedFilename}
                      onChange={(e) => handleFilenameChange(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:border-[#1a56db]"
                    />
                  </div>

                  {/* Campus Area & Floor Level (2-column row) */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">
                        Campus Area
                      </label>
                      <select
                        value={selectedArea}
                        onChange={(e) => handleAreaChange(e.target.value as AreaCode)}
                        className="w-full px-2.5 py-2 text-xs font-bold bg-white border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-[#1a56db]"
                      >
                        {AREA_OPTIONS.map((code) => (
                          <option key={code} value={code}>
                            {code}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">
                        Floor Level
                      </label>
                      <select
                        value={selectedFloor}
                        onChange={(e) => handleFloorChange(Number(e.target.value))}
                        className="w-full px-2.5 py-2 text-xs font-bold bg-white border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-[#1a56db]"
                      >
                        {FLOOR_OPTIONS.map((fl) => (
                          <option key={fl.value} value={fl.value}>
                            {fl.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Tags Section */}
                  <div className="pt-1">
                    <label className="block text-[11px] font-bold text-slate-500 mb-2">
                      Tags ({currentTags.length})
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      {currentTags.map((tag) => {
                        const labelText = tag.text || tag.label || 'Tag';
                        return (
                          <span
                            key={tag.id}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-[#1a56db] text-xs font-bold"
                          >
                            <button
                              onClick={() => {
                                aimCameraAt(
                                  Number(tag.yaw) || 180,
                                  Math.max(MIN_CAMERA_PITCH, Number(tag.pitch) || MIN_CAMERA_PITCH)
                                );
                                setTagModal({
                                  isOpen: true,
                                  mode: 'EDIT',
                                  tagId: tag.id,
                                  text: labelText,
                                  yaw: Number(tag.yaw) || 180,
                                  pitch: Number(tag.pitch) || 0,
                                });
                              }}
                              className="hover:underline cursor-pointer"
                            >
                              {labelText}
                            </button>
                            <button
                              onClick={() => handleDeleteTag(tag.id)}
                              className="text-blue-400 hover:text-rose-600 transition cursor-pointer"
                              title="Remove Tag"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        );
                      })}

                      <button
                        onClick={openAddTagAtCurrentView}
                        className="px-2.5 py-1 rounded-lg border border-dashed border-slate-300 hover:border-[#1a56db] text-slate-600 hover:text-[#1a56db] text-xs font-bold transition cursor-pointer"
                      >
                        + Add Tag
                      </button>
                    </div>
                  </div>
                </div>

                {/* Bottom Save Button in Panorama Details */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                  <div className="text-[11px] text-slate-400 truncate">
                    {lastSavedAt
                      ? `Last saved ${new Date(lastSavedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}`
                      : 'Local draft'}
                  </div>
                  <button
                    onClick={() => persistAllChanges()}
                    disabled={isSaving}
                    className="px-5 py-2 rounded-xl bg-[#1a56db] hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSaving ? 'Saving...' : 'Save'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* BOTTOM CARD: Outgoing Connections Table (Matches Screenshot 1) */}
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  Outgoing Connections ({currentConnections.length})
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Arrows from this panorama to other locations
                </p>
              </div>

              <button
                onClick={openAddArrowAtCurrentView}
                className="px-3.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#1a56db] text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add Arrow</span>
              </button>
            </div>

            {currentConnections.length === 0 ? (
              <div className="py-10 px-6 text-center text-xs text-slate-400">
                No outgoing navigation arrows for this panorama yet. Click <strong>+ Add Arrow</strong> or double-click directly on the 360° panorama to create a one-way connection.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 bg-slate-50/50">
                      <th className="py-2.5 px-5 w-12">#</th>
                      <th className="py-2.5 px-4">Direction / Position</th>
                      <th className="py-2.5 px-4">Destination Panorama</th>
                      <th className="py-2.5 px-4">Label (Optional)</th>
                      <th className="py-2.5 px-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {currentConnections.map((conn, idx) => {
                      const destNode = CAMPUS_GRAPH_MAP.get(conn.targetId);
                      const destManualNum =
                        manualNumbers[conn.targetId] || destNode?.manualNumber || conn.targetId;
                      const destImgPath =
                        nodeImageOverrides[conn.targetId]?.imagePath ||
                        customPanoramas[conn.targetId]?.imagePath ||
                        destNode?.imagePath ||
                        '/assets/campus_aerial_drone.jpg';
                      const yaw = Number(conn.heading ?? conn.worldBearing ?? 180);
                      const dirBadge = formatDirectionBadge(
                        conn.direction || inferDirectionFromYaw(yaw)
                      );

                      return (
                        <tr
                          key={`${conn.targetId}_${idx}`}
                          onClick={() => aimCameraAt(yaw)}
                          className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                          title="Click to rotate 360° view toward this arrow"
                        >
                          <td className="py-3 px-5 font-bold text-slate-500">{idx + 1}</td>

                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-8 rounded-md overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                                <LazyMicroThumbnail
                                  src={destImgPath}
                                  alt={conn.targetId}
                                  badgeText={String(destManualNum)}
                                />
                              </div>
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-bold text-xs">
                                <span className="text-[#1a56db] font-black">{dirBadge.arrow}</span>
                                <span>{dirBadge.label}</span>
                              </span>
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectNode(conn.targetId);
                                }}
                                className="font-extrabold text-slate-900 hover:text-[#1a56db] transition cursor-pointer"
                                title={`Jump to ${conn.targetId}`}
                              >
                                {conn.targetId}
                              </button>
                              <span className="px-1.5 py-0.5 text-[10px] font-black rounded-md bg-blue-100 text-[#1a56db]">
                                #{destManualNum}
                              </span>
                            </div>
                          </td>

                          <td
                            className="py-3 px-4"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="text"
                              value={conn.instruction || ''}
                              onChange={(e) =>
                                handleInlineConnectionLabelChange(conn.targetId, e.target.value)
                              }
                              placeholder={`Continue to ${destManualNum}`}
                              className="w-full max-w-xs px-2.5 py-1.5 text-xs bg-slate-50 hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-[#1a56db] rounded-lg text-slate-700 focus:outline-none transition"
                            />
                          </td>

                          <td
                            className="py-3 px-5 text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                onClick={() => {
                                  aimCameraAt(yaw);
                                  setArrowDestSearch('');
                                  setArrowModal({
                                    isOpen: true,
                                    mode: 'EDIT',
                                    originalTargetId: conn.targetId,
                                    targetId: conn.targetId,
                                    direction:
                                      conn.direction || inferDirectionFromYaw(yaw),
                                    label: conn.instruction || '',
                                    heading: yaw,
                                    pitch: Number(conn.pitch ?? -15),
                                  });
                                }}
                                className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#1a56db] transition cursor-pointer"
                                title="Edit Connection"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() => handleDeleteArrow(conn.targetId)}
                                className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 transition cursor-pointer"
                                title="Delete Connection"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          MODAL 1: ADD / EDIT ONE-WAY NAVIGATION ARROW
      ───────────────────────────────────────────────────────────── */}
      {arrowModal?.isOpen && (
        <div
          className="fixed inset-0 z-[110] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setArrowModal(null)}
        >
          <div
            className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  {arrowModal.mode === 'ADD' ? 'Add Outgoing Arrow' : 'Edit Outgoing Arrow'}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Creates a one-way connection from <strong>{selectedNode?.id}</strong> (#
                  {selectedManualNumber}).
                </p>
              </div>
              <button
                onClick={() => setArrowModal(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Destination Panorama Search & Select */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Destination Panorama
                </label>
                <input
                  type="text"
                  value={arrowDestSearch}
                  onChange={(e) => setArrowDestSearch(e.target.value)}
                  placeholder="Filter destination by ID or #number..."
                  className="w-full px-3 py-1.5 mb-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#1a56db]"
                />
                <select
                  value={arrowModal.targetId}
                  onChange={(e) => setArrowModal({ ...arrowModal, targetId: e.target.value })}
                  className="w-full px-3 py-2 text-xs font-bold bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-[#1a56db]"
                >
                  {allNodes
                    .filter((n) => {
                      if (n.id === selectedNode?.id) return false;
                      if (!arrowDestSearch.trim()) return true;
                      const q = arrowDestSearch.trim().toLowerCase().replace(/^#/, '');
                      const mNum = String(manualNumbers[n.id] || n.manualNumber || '').toLowerCase();
                      return (
                        n.id.toLowerCase().includes(q) ||
                        mNum.includes(q) ||
                        (n.filename || '').toLowerCase().includes(q)
                      );
                    })
                    .map((n) => {
                      const mNum = manualNumbers[n.id] || n.manualNumber || '1';
                      return (
                        <option key={n.id} value={n.id}>
                          #{mNum} — {n.id} ({n.area})
                        </option>
                      );
                    })}
                </select>
              </div>

              {/* Direction / Position */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Direction / Position
                </label>
                <select
                  value={arrowModal.direction}
                  onChange={(e) =>
                    setArrowModal({
                      ...arrowModal,
                      direction: e.target.value as ConnectionDirection,
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-bold bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-[#1a56db]"
                >
                  {DIRECTION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.arrow} {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Quick Align with Current 360° Camera View */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <span className="text-slate-600 font-semibold">
                  360° Placement Angle: <strong className="text-slate-900">{Math.round(arrowModal.heading)}°</strong>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const currentYaw = Math.round(((lonRef.current % 360) + 360) % 360);
                    setArrowModal({
                      ...arrowModal,
                      heading: currentYaw,
                    });
                  }}
                  className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#1a56db] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>Use Current 360° View</span>
                </button>
              </div>

              {/* Label (Optional) */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Label (Optional)
                </label>
                <input
                  type="text"
                  value={arrowModal.label}
                  onChange={(e) => setArrowModal({ ...arrowModal, label: e.target.value })}
                  placeholder="e.g. Continue to 2, Main Road, Guard Room"
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-[#1a56db]"
                />
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              {arrowModal.mode === 'EDIT' && arrowModal.originalTargetId ? (
                <button
                  onClick={() => {
                    handleDeleteArrow(arrowModal.originalTargetId!);
                    setArrowModal(null);
                  }}
                  className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Arrow</span>
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setArrowModal(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveArrowModal}
                  className="px-4 py-2 rounded-xl bg-[#1a56db] hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
                >
                  {arrowModal.mode === 'ADD' ? 'Add Arrow' : 'Update Arrow'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 2: ADD / EDIT LOCATION TAG
      ───────────────────────────────────────────────────────────── */}
      {tagModal?.isOpen && (
        <div
          className="fixed inset-0 z-[110] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setTagModal(null)}
        >
          <div
            className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900">
                {tagModal.mode === 'ADD' ? 'Add Location Tag' : 'Edit Location Tag'}
              </h3>
              <button
                onClick={() => setTagModal(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Tag Label
                </label>
                <input
                  type="text"
                  autoFocus
                  value={tagModal.text}
                  onChange={(e) => setTagModal({ ...tagModal, text: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveTagModal();
                  }}
                  placeholder="e.g. Boys Parking, Principal Office, Room 108"
                  className="w-full px-3 py-2 text-xs font-bold bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-[#1a56db]"
                />
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <span className="text-slate-600 font-semibold">
                  360° Position: <strong className="text-slate-900">{Math.round(tagModal.yaw)}°</strong>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const currentYaw = Math.round(((lonRef.current % 360) + 360) % 360);
                    const currentPitch = Math.round(Math.max(0, Math.min(35, latRef.current)));
                    setTagModal({
                      ...tagModal,
                      yaw: currentYaw,
                      pitch: currentPitch,
                    });
                  }}
                  className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#1a56db] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>Use Current 360° View</span>
                </button>
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              {tagModal.mode === 'EDIT' && tagModal.tagId ? (
                <button
                  onClick={() => {
                    handleDeleteTag(tagModal.tagId!);
                    setTagModal(null);
                  }}
                  className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTagModal(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveTagModal}
                  className="px-4 py-2 rounded-xl bg-[#1a56db] hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
                >
                  {tagModal.mode === 'ADD' ? 'Add Tag' : 'Save Tag'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 3: UPLOAD NEW OR REPLACE PANORAMA IMAGE
      ───────────────────────────────────────────────────────────── */}
      {uploadModal?.isOpen && (
        <div
          className="fixed inset-0 z-[110] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => {
            if (!uploadModal.isUploading) {
              if (uploadModal.previewUrl) URL.revokeObjectURL(uploadModal.previewUrl);
              setUploadModal(null);
            }
          }}
        >
          <div
            className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  {uploadModal.mode === 'ADD_NEW'
                    ? 'Add New Panorama Image'
                    : `Replace Panorama Image (${uploadModal.nodeId})`}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Supported formats: JPG, JPEG, PNG, WebP (up to 15 MB)
                </p>
              </div>
              <button
                onClick={() => {
                  if (!uploadModal.isUploading) {
                    if (uploadModal.previewUrl) URL.revokeObjectURL(uploadModal.previewUrl);
                    setUploadModal(null);
                  }
                }}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {uploadModal.previewUrl && (
                <div className="w-full h-44 rounded-xl overflow-hidden bg-slate-900 border border-slate-200 relative">
                  <img
                    src={uploadModal.previewUrl}
                    alt="Upload Preview"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              {uploadModal.error && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{uploadModal.error}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Panorama ID
                  </label>
                  <input
                    type="text"
                    value={uploadModal.nodeId}
                    readOnly={uploadModal.mode === 'REPLACE'}
                    onChange={(e) => setUploadModal({ ...uploadModal, nodeId: e.target.value })}
                    className={`w-full px-3 py-2 text-xs font-bold border border-slate-200 rounded-xl ${
                      uploadModal.mode === 'REPLACE'
                        ? 'bg-slate-50 text-slate-600'
                        : 'bg-white text-slate-900 focus:border-[#1a56db]'
                    } focus:outline-none`}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Manual Number
                  </label>
                  <input
                    type="text"
                    value={uploadModal.manualNumber}
                    onChange={(e) =>
                      setUploadModal({ ...uploadModal, manualNumber: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs font-bold bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-[#1a56db]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Filename
                </label>
                <input
                  type="text"
                  value={uploadModal.filename}
                  onChange={(e) => setUploadModal({ ...uploadModal, filename: e.target.value })}
                  className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-[#1a56db]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Campus Area
                  </label>
                  <select
                    value={uploadModal.area}
                    onChange={(e) =>
                      setUploadModal({ ...uploadModal, area: e.target.value as AreaCode })
                    }
                    className="w-full px-3 py-2 text-xs font-bold bg-white border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-[#1a56db]"
                  >
                    {AREA_OPTIONS.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Floor Level
                  </label>
                  <select
                    value={uploadModal.floor}
                    onChange={(e) =>
                      setUploadModal({ ...uploadModal, floor: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 text-xs font-bold bg-white border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-[#1a56db]"
                  >
                    {FLOOR_OPTIONS.map((fl) => (
                      <option key={fl.value} value={fl.value}>
                        {fl.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                disabled={uploadModal.isUploading}
                onClick={() => {
                  if (uploadModal.previewUrl) URL.revokeObjectURL(uploadModal.previewUrl);
                  setUploadModal(null);
                }}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={uploadModal.isUploading}
                onClick={confirmImageUpload}
                className="px-5 py-2 rounded-xl bg-[#1a56db] hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-2 cursor-pointer"
              >
                {uploadModal.isUploading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Uploading & Saving...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" />
                    <span>
                      {uploadModal.mode === 'ADD_NEW' ? 'Upload & Add Panorama' : 'Replace Image'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
