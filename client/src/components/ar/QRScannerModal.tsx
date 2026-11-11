import React, { useState, useEffect, useRef } from 'react';
import {
  QrCode,
  X,
  CheckCircle2,
  AlertCircle,
  Camera,
  Building2,
  Loader2,
  RefreshCw,
  Zap,
  ExternalLink,
  Upload,
  ImageIcon,
} from 'lucide-react';
import jsQR from 'jsqr';
import { ApiService } from '../../services/api';
import { CAMPUS_BLOCKS_INFO } from '../../data/campusBlocksData';
import { searchCampusPlaces } from '../../data/campusPlaces';
import { QRCheckpoint } from '../../../../shared/types';

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLocationLocked: (nodeId: string, label: string, floorNumber: number, buildingId?: string) => void;
}

interface ResolvedLocalQR {
  nodeId: string;
  label: string;
  floorNumber: number;
  buildingId: string;
  buildingName: string;
}

/**
 * Verified mapping of official campus blocks and key checkpoints:
 * 1. AB BLOCK  -> 015 (outdoor_015)
 * 2. SC BLOCK  -> 203 (outdoor_203)
 * 3. MT BLOCK  -> 143 (outdoor_143)
 * 4. MG BLOCK  -> 269 (outdoor_269)
 * 5. SM BLOCK  -> 240 (outdoor_240)
 * 6. SJ BLOCK  -> 191 (outdoor_191)
 * 7. LF BLOCK  -> 237 (outdoor_237) [Hotel Management]
 * 8. GB BLOCK  -> 364 (bba_364)     [BBA & Management]
 * 9. BPE BLOCK -> 346 (gb_346)      [Physical Education]
 * 10. SB BLOCK -> 323 (outdoor_323)      [St. Sebastian Block]
 * 11. AUDITORIUM -> outdoor_028
 * 12. MAIN GATE  -> outdoor_001
 */
const DESIGNATED_BLOCK_MAPPINGS: Record<string, ResolvedLocalQR> = {
  // 1. AB BLOCK -> outdoor_015
  'ab': { nodeId: 'outdoor_015', label: 'Administrative Block (AB)', floorNumber: 0, buildingId: 'bld_ab', buildingName: 'Administrative Block (Main Wing)' },
  'qr-ab': { nodeId: 'outdoor_015', label: 'Administrative Block (AB)', floorNumber: 0, buildingId: 'bld_ab', buildingName: 'Administrative Block (Main Wing)' },
  '015': { nodeId: 'outdoor_015', label: 'Administrative Block (AB)', floorNumber: 0, buildingId: 'bld_ab', buildingName: 'Administrative Block (Main Wing)' },
  '15': { nodeId: 'outdoor_015', label: 'Administrative Block (AB)', floorNumber: 0, buildingId: 'bld_ab', buildingName: 'Administrative Block (Main Wing)' },
  'outdoor_015': { nodeId: 'outdoor_015', label: 'Administrative Block (AB)', floorNumber: 0, buildingId: 'bld_ab', buildingName: 'Administrative Block (Main Wing)' },

  // 2. SC BLOCK -> outdoor_203
  'sc': { nodeId: 'outdoor_203', label: 'St. Chavara Research Block (SC)', floorNumber: 0, buildingId: 'bld_sc', buildingName: 'St. Chavara PG & Research Block' },
  'qr-sc': { nodeId: 'outdoor_203', label: 'St. Chavara Research Block (SC)', floorNumber: 0, buildingId: 'bld_sc', buildingName: 'St. Chavara PG & Research Block' },
  '203': { nodeId: 'outdoor_203', label: 'St. Chavara Research Block (SC)', floorNumber: 0, buildingId: 'bld_sc', buildingName: 'St. Chavara PG & Research Block' },
  'outdoor_203': { nodeId: 'outdoor_203', label: 'St. Chavara Research Block (SC)', floorNumber: 0, buildingId: 'bld_sc', buildingName: 'St. Chavara PG & Research Block' },

  // 3. MT BLOCK -> outdoor_143
  'mt': { nodeId: 'outdoor_143', label: 'Mother Teresa Block (MT)', floorNumber: 0, buildingId: 'bld_mt', buildingName: 'Mother Teresa Social Science Block' },
  'qr-mt': { nodeId: 'outdoor_143', label: 'Mother Teresa Block (MT)', floorNumber: 0, buildingId: 'bld_mt', buildingName: 'Mother Teresa Social Science Block' },
  '143': { nodeId: 'outdoor_143', label: 'Mother Teresa Block (MT)', floorNumber: 0, buildingId: 'bld_mt', buildingName: 'Mother Teresa Social Science Block' },
  'outdoor_143': { nodeId: 'outdoor_143', label: 'Mother Teresa Block (MT)', floorNumber: 0, buildingId: 'bld_mt', buildingName: 'Mother Teresa Social Science Block' },

  // 4. MG BLOCK -> outdoor_269
  'mg': { nodeId: 'outdoor_269', label: 'Mahatma Gandhi Block (MG)', floorNumber: 0, buildingId: 'bld_main', buildingName: 'Mahatma Gandhi Block (Heritage)' },
  'qr-mg': { nodeId: 'outdoor_269', label: 'Mahatma Gandhi Block (MG)', floorNumber: 0, buildingId: 'bld_main', buildingName: 'Mahatma Gandhi Block (Heritage)' },
  'main': { nodeId: 'outdoor_269', label: 'Mahatma Gandhi Block (MG)', floorNumber: 0, buildingId: 'bld_main', buildingName: 'Mahatma Gandhi Block (Heritage)' },
  'qr-main': { nodeId: 'outdoor_269', label: 'Mahatma Gandhi Block (MG)', floorNumber: 0, buildingId: 'bld_main', buildingName: 'Mahatma Gandhi Block (Heritage)' },
  '269': { nodeId: 'outdoor_269', label: 'Mahatma Gandhi Block (MG)', floorNumber: 0, buildingId: 'bld_main', buildingName: 'Mahatma Gandhi Block (Heritage)' },
  'outdoor_269': { nodeId: 'outdoor_269', label: 'Mahatma Gandhi Block (MG)', floorNumber: 0, buildingId: 'bld_main', buildingName: 'Mahatma Gandhi Block (Heritage)' },

  // 5. SM BLOCK -> outdoor_240
  'sm': { nodeId: 'outdoor_240', label: "St. Mary's Commerce Block (SM)", floorNumber: 0, buildingId: 'bld_sm', buildingName: "St. Mary's Commerce Block" },
  'qr-sm': { nodeId: 'outdoor_240', label: "St. Mary's Commerce Block (SM)", floorNumber: 0, buildingId: 'bld_sm', buildingName: "St. Mary's Commerce Block" },
  '240': { nodeId: 'outdoor_240', label: "St. Mary's Commerce Block (SM)", floorNumber: 0, buildingId: 'bld_sm', buildingName: "St. Mary's Commerce Block" },
  'outdoor_240': { nodeId: 'outdoor_240', label: "St. Mary's Commerce Block (SM)", floorNumber: 0, buildingId: 'bld_sm', buildingName: "St. Mary's Commerce Block" },

  // 6. SJ BLOCK -> outdoor_191
  'sj': { nodeId: 'outdoor_191', label: 'St. Joseph Life Sciences Block (SJ)', floorNumber: 0, buildingId: 'bld_sj', buildingName: 'St. Joseph Life Sciences Block' },
  'qr-sj': { nodeId: 'outdoor_191', label: 'St. Joseph Life Sciences Block (SJ)', floorNumber: 0, buildingId: 'bld_sj', buildingName: 'St. Joseph Life Sciences Block' },
  '191': { nodeId: 'outdoor_191', label: 'St. Joseph Life Sciences Block (SJ)', floorNumber: 0, buildingId: 'bld_sj', buildingName: 'St. Joseph Life Sciences Block' },
  'outdoor_191': { nodeId: 'outdoor_191', label: 'St. Joseph Life Sciences Block (SJ)', floorNumber: 0, buildingId: 'bld_sj', buildingName: 'St. Joseph Life Sciences Block' },

  // 7. LF BLOCK (Hotel Management) -> outdoor_237
  'lf': { nodeId: 'outdoor_237', label: 'LF Block Hotel Management (LF)', floorNumber: 0, buildingId: 'bld_hm', buildingName: 'LF Block (Hotel Management)' },
  'qr-lf': { nodeId: 'outdoor_237', label: 'LF Block Hotel Management (LF)', floorNumber: 0, buildingId: 'bld_hm', buildingName: 'LF Block (Hotel Management)' },
  'hm': { nodeId: 'outdoor_237', label: 'LF Block Hotel Management (LF)', floorNumber: 0, buildingId: 'bld_hm', buildingName: 'LF Block (Hotel Management)' },
  'qr-hm': { nodeId: 'outdoor_237', label: 'LF Block Hotel Management (LF)', floorNumber: 0, buildingId: 'bld_hm', buildingName: 'LF Block (Hotel Management)' },
  '237': { nodeId: 'outdoor_237', label: 'LF Block Hotel Management (LF)', floorNumber: 0, buildingId: 'bld_hm', buildingName: 'LF Block (Hotel Management)' },
  'outdoor_237': { nodeId: 'outdoor_237', label: 'LF Block Hotel Management (LF)', floorNumber: 0, buildingId: 'bld_hm', buildingName: 'LF Block (Hotel Management)' },

  // 8. BBA BLOCK -> bba_364
  'bba': { nodeId: 'bba_364', label: 'BBA Block (BBA)', floorNumber: 0, buildingId: 'bld_bba', buildingName: 'BBA Block (Management Studies)' },
  'qr-bba': { nodeId: 'bba_364', label: 'BBA Block (BBA)', floorNumber: 0, buildingId: 'bld_bba', buildingName: 'BBA Block (Management Studies)' },
  '364': { nodeId: 'bba_364', label: 'BBA Block (BBA)', floorNumber: 0, buildingId: 'bld_bba', buildingName: 'BBA Block (Management Studies)' },
  'bba_364': { nodeId: 'bba_364', label: 'BBA Block (BBA)', floorNumber: 0, buildingId: 'bld_bba', buildingName: 'BBA Block (Management Studies)' },

  // 9. SNEHA BHAVAN BLOCK (SB BLOCK) -> sb_437 (Node 437)
  'sb': { nodeId: 'sb_437', label: 'Sneha Bhavan Block (SB Block)', floorNumber: 0, buildingId: 'bld_sb', buildingName: 'Sneha Bhavan Block (SB Block)' },
  'qr-sb': { nodeId: 'sb_437', label: 'Sneha Bhavan Block (SB Block)', floorNumber: 0, buildingId: 'bld_sb', buildingName: 'Sneha Bhavan Block (SB Block)' },
  'sneha': { nodeId: 'sb_437', label: 'Sneha Bhavan Block (SB Block)', floorNumber: 0, buildingId: 'bld_sb', buildingName: 'Sneha Bhavan Block (SB Block)' },
  'snehabhavan': { nodeId: 'sb_437', label: 'Sneha Bhavan Block (SB Block)', floorNumber: 0, buildingId: 'bld_sb', buildingName: 'Sneha Bhavan Block (SB Block)' },
  '437': { nodeId: 'sb_437', label: 'Sneha Bhavan Block (SB Block)', floorNumber: 0, buildingId: 'bld_sb', buildingName: 'Sneha Bhavan Block (SB Block)' },
  'sb_437': { nodeId: 'sb_437', label: 'Sneha Bhavan Block (SB Block)', floorNumber: 0, buildingId: 'bld_sb', buildingName: 'Sneha Bhavan Block (SB Block)' },

  // 10. ST. SEBASTIAN BLOCK (BPE / GB) -> outdoor_323 (Node 323)
  'gb': { nodeId: 'outdoor_323', label: 'St. Sebastian Block (BPE Block)', floorNumber: 0, buildingId: 'bld_bpe', buildingName: 'St. Sebastian Block (BPE Block)' },
  'qr-gb': { nodeId: 'outdoor_323', label: 'St. Sebastian Block (BPE Block)', floorNumber: 0, buildingId: 'bld_bpe', buildingName: 'St. Sebastian Block (BPE Block)' },
  'bpe': { nodeId: 'outdoor_323', label: 'St. Sebastian Block (BPE Block)', floorNumber: 0, buildingId: 'bld_bpe', buildingName: 'St. Sebastian Block (BPE Block)' },
  'qr-bpe': { nodeId: 'outdoor_323', label: 'St. Sebastian Block (BPE Block)', floorNumber: 0, buildingId: 'bld_bpe', buildingName: 'St. Sebastian Block (BPE Block)' },
  '323': { nodeId: 'outdoor_323', label: 'St. Sebastian Block (BPE Block)', floorNumber: 0, buildingId: 'bld_bpe', buildingName: 'St. Sebastian Block (BPE Block)' },
  'outdoor_323': { nodeId: 'outdoor_323', label: 'St. Sebastian Block (BPE Block)', floorNumber: 0, buildingId: 'bld_bpe', buildingName: 'St. Sebastian Block (BPE Block)' },

  // 11. AUDITORIUM -> outdoor_028
  'aud': { nodeId: 'outdoor_028', label: 'Christ College Main Auditorium (AUD)', floorNumber: 0, buildingId: 'bld_aud', buildingName: 'Christ College Main Auditorium' },
  'qr-aud': { nodeId: 'outdoor_028', label: 'Christ College Main Auditorium (AUD)', floorNumber: 0, buildingId: 'bld_aud', buildingName: 'Christ College Main Auditorium' },
  'auditorium': { nodeId: 'outdoor_028', label: 'Christ College Main Auditorium (AUD)', floorNumber: 0, buildingId: 'bld_aud', buildingName: 'Christ College Main Auditorium' },
  'outdoor_028': { nodeId: 'outdoor_028', label: 'Christ College Main Auditorium (AUD)', floorNumber: 0, buildingId: 'bld_aud', buildingName: 'Christ College Main Auditorium' },

  // 12. MAIN GATE -> outdoor_001
  'gate': { nodeId: 'outdoor_001', label: 'Main Entrance Gate (GATE)', floorNumber: 0, buildingId: 'bld_gate', buildingName: 'Main Entrance Gate & Security Checkpoint' },
  'qr-gate': { nodeId: 'outdoor_001', label: 'Main Entrance Gate (GATE)', floorNumber: 0, buildingId: 'bld_gate', buildingName: 'Main Entrance Gate & Security Checkpoint' },
  'gate1': { nodeId: 'outdoor_001', label: 'Main Entrance Gate (GATE)', floorNumber: 0, buildingId: 'bld_gate', buildingName: 'Main Entrance Gate & Security Checkpoint' },
  'qr-gate1': { nodeId: 'outdoor_001', label: 'Main Entrance Gate (GATE)', floorNumber: 0, buildingId: 'bld_gate', buildingName: 'Main Entrance Gate & Security Checkpoint' },
  'outdoor_001': { nodeId: 'outdoor_001', label: 'Main Entrance Gate (GATE)', floorNumber: 0, buildingId: 'bld_gate', buildingName: 'Main Entrance Gate & Security Checkpoint' },
  '001': { nodeId: 'outdoor_001', label: 'Main Entrance Gate (GATE)', floorNumber: 0, buildingId: 'bld_gate', buildingName: 'Main Entrance Gate & Security Checkpoint' },
};

/**
 * Robust Local QR Parser:
 * Resolves QR payloads locally in 0ms without requiring network requests.
 * Supports: full URLs, query parameters, short codes, spot numbers, and node IDs.
 */
function resolveLocalQRCode(rawInput: string): ResolvedLocalQR | null {
  if (!rawInput) return null;
  let text = rawInput.trim();

  // 1. Try URL extraction (?qr=, ?block=, ?bld=, ?to=, ?dest=, ?pano=, ?node=)
  try {
    if (text.startsWith('http://') || text.startsWith('https://') || text.includes('?') || text.includes('/')) {
      const dummyBase = 'https://campnav-b3om.onrender.com';
      const url = new URL(text.startsWith('http') ? text : `${dummyBase}/${text.replace(/^\//, '')}`);

      const qrParam = url.searchParams.get('qr') || url.searchParams.get('block') || url.searchParams.get('bld');
      if (qrParam) {
        text = qrParam;
      } else {
        const destParam =
          url.searchParams.get('dest') ||
          url.searchParams.get('to') ||
          url.searchParams.get('node') ||
          url.searchParams.get('pano');
        if (destParam) {
          text = destParam;
        }
      }
    }
  } catch {}

  // 2. Try JSON extraction
  try {
    if (text.startsWith('{') && text.endsWith('}')) {
      const obj = JSON.parse(text);
      text = obj.qr || obj.code || obj.block || obj.nodeId || text;
    }
  } catch {}

  // Clean and normalize
  const clean = text.trim().toLowerCase().replace(/^["']|["']$/g, '');

  // 3. PRIORITY: Check User Designated Blocks Map (AB: 015, SC: 203, MT: 143, MG: 269, SM: 240, SJ: 191, LF: 237, GB: 364)
  if (DESIGNATED_BLOCK_MAPPINGS[clean]) {
    return DESIGNATED_BLOCK_MAPPINGS[clean];
  }

  // 4. Check CAMPUS_BLOCKS_INFO directly
  const block = CAMPUS_BLOCKS_INFO[clean];
  if (block) {
    return {
      nodeId: block.entranceNodeId,
      label: `${block.name} (Entrance)`,
      floorNumber: 0,
      buildingId: block.code.toLowerCase(),
      buildingName: block.name,
    };
  }

  // 5. Strip "qr-" or "qr_" prefix and retry
  const stripped = clean.replace(/^qr[-_]/, '');
  if (DESIGNATED_BLOCK_MAPPINGS[stripped]) {
    return DESIGNATED_BLOCK_MAPPINGS[stripped];
  }
  const blockStripped = CAMPUS_BLOCKS_INFO[stripped];
  if (blockStripped) {
    return {
      nodeId: blockStripped.entranceNodeId,
      label: `${blockStripped.name} (Entrance)`,
      floorNumber: 0,
      buildingId: blockStripped.code.toLowerCase(),
      buildingName: blockStripped.name,
    };
  }

  // 6. Check Room / Facility search (e.g. "SM-153", "MG-107", "Room 101")
  const roomMatches = searchCampusPlaces(clean);
  if (roomMatches && roomMatches.length > 0) {
    const rm = roomMatches[0];
    return {
      nodeId: rm.panoramaNodeId,
      label: `${rm.name} (${rm.buildingName})`,
      floorNumber: rm.floorNumber || 0,
      buildingId: `bld_${rm.building.toLowerCase()}`,
      buildingName: rm.buildingName,
    };
  }

  // 7. Direct Panorama Node ID (e.g. "outdoor_030", "mg_011")
  if (clean.includes('_') && /^[a-z0-9]+_[0-9]+$/i.test(clean)) {
    return {
      nodeId: clean,
      label: `Campus Checkpoint (${clean})`,
      floorNumber: 0,
      buildingId: 'bld_main',
      buildingName: 'Campus',
    };
  }

  return null;
}

export const QRScannerModal: React.FC<QRScannerModalProps> = ({
  isOpen,
  onClose,
  onLocationLocked,
}) => {
  const [isResolving, setIsResolving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resolvedCheckpoint, setResolvedCheckpoint] = useState<QRCheckpoint | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [torchOn, setTorchOn] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const isScanningRef = useRef<boolean>(false);
  const isDecodingRef = useRef<boolean>(false);
  const isResolvingRef = useRef<boolean>(false);
  const isStartingCameraRef = useRef<boolean>(false);
  const barcodeDetectorRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Initialize native BarcodeDetector if supported by the browser
  useEffect(() => {
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        barcodeDetectorRef.current = new (window as any).BarcodeDetector({
          formats: ['qr_code'],
        });
      } catch {
        barcodeDetectorRef.current = null;
      }
    }
  }, []);

  // Toggle Flashlight / Torch
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      const next = !torchOn;
      await (track as any).applyConstraints({
        advanced: [{ torch: next }],
      });
      setTorchOn(next);
    } catch (err) {
      console.warn('Torch constraint not supported or failed:', err);
    }
  };

  // Switch between Rear (environment) and Front (user) cameras
  const toggleFacingMode = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
  };

  // Start / Stop camera when modal visibility or facing mode changes
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    startCamera();

    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode]);

  const stopCamera = () => {
    isScanningRef.current = false;
    isDecodingRef.current = false;
    isResolvingRef.current = false;
    isStartingCameraRef.current = false;
    setIsResolving(false);
    setIsStartingCamera(false);

    if (scanTimerRef.current) {
      clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      streamRef.current = null;
    }

    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
        videoRef.current.onloadedmetadata = null;
        videoRef.current.oncanplay = null;
        videoRef.current.onplaying = null;
      } catch {}
    }

    setCameraActive(false);
    setTorchOn(false);
  };

  const startCamera = async () => {
    if (isStartingCameraRef.current) return;
    isStartingCameraRef.current = true;
    setIsStartingCamera(true);
    setErrorMsg(null);
    setResolvedCheckpoint(null);
    setIsResolving(false);
    isResolvingRef.current = false;

    // Clean up any stale media tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try { track.stop(); } catch {}
      });
      streamRef.current = null;
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API not available. Ensure you are on HTTPS or localhost.');
      }

      let stream: MediaStream | null = null;

      // 1. Try requested facingMode with ideal 720p constraints
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch {
        // 2. Fallback to basic facingMode constraint
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: facingMode },
            audio: false,
          });
        } catch {
          // 3. Fallback to generic video
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }
      }

      if (!stream) {
        throw new Error('Failed to obtain video stream.');
      }

      streamRef.current = stream;

      // Detect hardware torch support
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const capabilities = (videoTrack as any).getCapabilities?.() || {};
        setHasTorch(Boolean(capabilities.torch));
      }

      // Connect stream to video element
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');

        let readyTriggered = false;
        const triggerScanLoop = () => {
          if (readyTriggered) return;
          readyTriggered = true;
          isStartingCameraRef.current = false;
          setIsStartingCamera(false);
          setCameraActive(true);
          isScanningRef.current = true;
          isDecodingRef.current = false;
          scheduleNextScan(100);
        };

        // Attempt playback immediately
        try {
          const playPromise = video.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                if (video.videoWidth > 0 && video.readyState >= 2) {
                  triggerScanLoop();
                }
              })
              .catch((e) => {
                console.warn('Initial video.play() pending gesture or events:', e);
              });
          }
        } catch (playErr) {
          console.warn('Direct video.play() exception:', playErr);
        }

        // Multi-event listener to avoid deadlock
        video.onloadedmetadata = () => triggerScanLoop();
        video.oncanplay = () => triggerScanLoop();
        video.onplaying = () => triggerScanLoop();

        // Safety fallback timer if browser suppressed events
        setTimeout(() => {
          if (!readyTriggered && streamRef.current && videoRef.current) {
            triggerScanLoop();
          }
        }, 700);
      }
    } catch (err: any) {
      console.warn('Camera stream activation error:', err);
      isStartingCameraRef.current = false;
      setIsStartingCamera(false);
      setCameraActive(false);
      setErrorMsg(
        err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
          ? 'Camera permission denied. Please allow camera access in your browser settings.'
          : 'Could not access mobile camera. You can select your block below to test instantly.'
      );
    }
  };

  // Resilient, sequenced scan scheduler (eliminates CPU runaway and RAF race conditions)
  const scheduleNextScan = (delayMs = 80) => {
    if (!isScanningRef.current) return;
    if (scanTimerRef.current) {
      clearTimeout(scanTimerRef.current);
    }
    scanTimerRef.current = window.setTimeout(runScanCycle, delayMs);
  };

  // High-performance continuous frame decoding loop
  const runScanCycle = async () => {
    if (!isScanningRef.current) return;

    const video = videoRef.current;
    if (video && video.readyState >= 2 && video.videoWidth > 0 && !isDecodingRef.current) {
      isDecodingRef.current = true;

      try {
        let detectedText: string | null = null;

        // ── Engine 1: Native Hardware-Accelerated BarcodeDetector (if available) ──
        if (barcodeDetectorRef.current) {
          try {
            const barcodes = await barcodeDetectorRef.current.detect(video);
            if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
              detectedText = barcodes[0].rawValue;
            }
          } catch {
            // Fallback to jsQR below
          }
        }

        // ── Engine 2: Downscaled, Inversion-Resistant jsQR (Universal Fallback) ──
        if (!detectedText) {
          if (!canvasRef.current) {
            canvasRef.current = document.createElement('canvas');
          }
          const canvas = canvasRef.current;

          // Downscale to max 640px to keep decode time <5ms and prevent CPU lag
          const maxDim = 640;
          const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
          const targetW = Math.max(1, Math.round(video.videoWidth * scale));
          const targetH = Math.max(1, Math.round(video.videoHeight * scale));

          if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
            ctxRef.current = null;
          }

          if (!ctxRef.current) {
            ctxRef.current = canvas.getContext('2d', { willReadFrequently: true });
          }
          const ctx = ctxRef.current;

          if (ctx) {
            ctx.drawImage(video, 0, 0, targetW, targetH);
            const imageData = ctx.getImageData(0, 0, targetW, targetH);
            const qrCode = jsQR(imageData.data, targetW, targetH, {
              inversionAttempts: 'attemptBoth', // Scans inverted, shadowed, and reflective codes
            });

            if (qrCode && qrCode.data) {
              detectedText = qrCode.data;
            }
          }
        }

        if (detectedText) {
          isScanningRef.current = false;
          if (scanTimerRef.current) {
            clearTimeout(scanTimerRef.current);
            scanTimerRef.current = null;
          }
          handleResolveCode(detectedText);
          return;
        }
      } catch (err) {
        console.warn('Frame processing exception:', err);
      } finally {
        isDecodingRef.current = false;
      }
    }

    if (isScanningRef.current) {
      scheduleNextScan(80);
    }
  };

  const handleResolveCode = async (rawCode: string) => {
    if (isResolvingRef.current) return;
    isResolvingRef.current = true;
    setIsResolving(true);
    setErrorMsg(null);

    // 1. Try instantaneous local resolution (AB, SC, MT, MG, SM, SJ, LF, GB)
    const localResult = resolveLocalQRCode(rawCode);

    if (localResult) {
      // Haptic pulse feedback on mobile
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate([40, 50, 40]);
        } catch {}
      }

      setResolvedCheckpoint({
        id: localResult.buildingId,
        code: rawCode.toUpperCase(),
        label: localResult.label,
        buildingId: localResult.buildingId,
        floorNumber: localResult.floorNumber,
        nodeId: localResult.nodeId,
      });

      stopCamera();

      setTimeout(() => {
        onLocationLocked(
          localResult.nodeId,
          localResult.label,
          localResult.floorNumber,
          localResult.buildingId
        );
        onClose();
        setIsResolving(false);
        isResolvingRef.current = false;
      }, 350);
      return;
    }

    // 2. Secondary Backend API Fallback
    const cleanCode = rawCode.trim().toUpperCase();
    try {
      const rawRes = await ApiService.resolveQR(cleanCode);
      const checkpoint = (rawRes as any).checkpoint || rawRes;
      setResolvedCheckpoint(checkpoint);
      stopCamera();

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate([40, 50, 40]);
        } catch {}
      }

      setTimeout(() => {
        onLocationLocked(
          checkpoint.nodeId || 'outdoor_015',
          checkpoint.label || 'Campus Entrance',
          checkpoint.floorNumber ?? 0,
          checkpoint.buildingId || 'bld_ab'
        );
        onClose();
        setIsResolving(false);
        isResolvingRef.current = false;
      }, 350);
    } catch {
      setErrorMsg(`Unrecognized code "${rawCode.slice(0, 28)}". Point camera at an official block entrance plaque.`);
      setIsResolving(false);
      isResolvingRef.current = false;
      // Automatically resume scanning after a short pause
      setTimeout(() => {
        if (isOpen && videoRef.current) {
          setErrorMsg(null);
          isScanningRef.current = true;
          scheduleNextScan(100);
        }
      }, 2000);
    }
  };

  // Process uploaded image file through BarcodeDetector or jsQR
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsResolving(true);
    setErrorMsg(null);

    try {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = async () => {
        URL.revokeObjectURL(objectUrl);
        const canvas = document.createElement('canvas');
        const maxDim = 1000;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        if (!ctx) {
          setErrorMsg('Could not process image for QR scanning.');
          setIsResolving(false);
          return;
        }

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        let decoded: string | null = null;

        // 1. Try native BarcodeDetector
        if (barcodeDetectorRef.current) {
          try {
            const detected = await barcodeDetectorRef.current.detect(canvas);
            if (detected && detected.length > 0 && detected[0].rawValue) {
              decoded = detected[0].rawValue;
            }
          } catch {}
        }

        // 2. Universal jsQR fallback
        if (!decoded) {
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const qr = jsQR(imgData.data, canvas.width, canvas.height, {
            inversionAttempts: 'attemptBoth',
          });
          if (qr && qr.data) {
            decoded = qr.data;
          }
        }

        if (decoded) {
          handleResolveCode(decoded);
        } else {
          setErrorMsg('No QR code found in selected photo. Please choose a clear picture of the plaque.');
          setIsResolving(false);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        setErrorMsg('Failed to load image file.');
        setIsResolving(false);
      };

      img.src = objectUrl;
    } catch (err: any) {
      setErrorMsg('Error reading image: ' + (err.message || 'unknown error'));
      setIsResolving(false);
    }

    if (e.target) e.target.value = '';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in pointer-events-auto">
      <div className="relative w-full max-w-sm bg-white border border-slate-200/90 rounded-3xl p-4 sm:p-5 shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden text-slate-800">
        {/* Ambient Glow */}
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Top Control Icons */}
        <div className="absolute top-3.5 right-3.5 flex items-center gap-1.5 z-30">
          {/* Torch Toggle */}
          {hasTorch && (
            <button
              onClick={toggleTorch}
              className={`p-2 rounded-full transition-all ${
                torchOn
                  ? 'bg-amber-400 text-slate-950 shadow-md ring-2 ring-amber-300'
                  : 'text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200'
              }`}
              title={torchOn ? 'Turn Flashlight Off' : 'Turn Flashlight On (for dark corridors)'}
            >
              <Zap size={17} className={torchOn ? 'fill-current' : ''} />
            </button>
          )}

          {/* Lens Switcher (Rear / Front) */}
          <button
            onClick={toggleFacingMode}
            className="text-slate-500 hover:text-slate-800 p-2 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors"
            title={`Switch to ${facingMode === 'environment' ? 'Front' : 'Rear'} Camera`}
          >
            <RefreshCw size={17} />
          </button>

          {/* Close Modal */}
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-800 p-2 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-3 pr-20 flex-shrink-0">
          <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 text-[#2563eb] flex items-center justify-center shadow-xs flex-shrink-0">
            <QrCode size={22} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-black text-[#1e3a5f] leading-tight">Live Campus QR Scanner</h3>
            <p className="text-xs text-slate-500 mt-0.5 truncate">Point camera at block entrance plaque</p>
          </div>
        </div>

        {/* Live Camera Viewfinder Screen */}
        <div className="relative w-full h-52 sm:h-56 bg-slate-950 rounded-2xl border-2 border-blue-500/30 flex items-center justify-center overflow-hidden mb-3 flex-shrink-0 shadow-inner">
          {/* Live Video Element */}
          <video
            ref={videoRef}
            playsInline
            autoPlay
            muted
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
              cameraActive ? 'opacity-100' : 'opacity-0'
            }`}
          />

          {/* Real-time Scanning Laser Animation */}
          {cameraActive && (
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-blue-400 to-transparent animate-pulse shadow-lg shadow-blue-400 z-20 pointer-events-none" />
          )}

          {/* Central Target Scanner Reticle */}
          {cameraActive && (
            <div className="w-36 h-36 border-2 border-blue-400/80 rounded-2xl relative flex items-center justify-center z-20 pointer-events-none shadow-2xl shadow-blue-500/20">
              <div className="absolute -top-1.5 -left-1.5 w-5 h-5 border-t-3 border-l-3 border-white rounded-tl" />
              <div className="absolute -top-1.5 -right-1.5 w-5 h-5 border-t-3 border-r-3 border-white rounded-tr" />
              <div className="absolute -bottom-1.5 -left-1.5 w-5 h-5 border-b-3 border-l-3 border-white rounded-bl" />
              <div className="absolute -bottom-1.5 -right-1.5 w-5 h-5 border-b-3 border-r-3 border-white rounded-br" />
              <span className="text-[10px] font-black text-white bg-black/60 px-2 py-0.5 rounded-full uppercase tracking-wider backdrop-blur-sm">
                Scanning
              </span>
            </div>
          )}

          {/* Loading or Permission Feedback */}
          {!cameraActive && (
            <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center text-center p-4 z-10">
              {isStartingCamera ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 size={32} className="text-blue-400 animate-spin" />
                  <p className="text-xs text-slate-200 font-bold">Starting Hardware Scanner...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Camera size={28} className="text-slate-500" />
                  <p className="text-xs text-slate-400 max-w-[200px]">
                    {errorMsg || 'Camera inactive. Tap any block below to enter in 360°'}
                  </p>
                  <button
                    onClick={startCamera}
                    className="mt-1 px-4 py-1.5 bg-[#2563eb] hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 transition-colors"
                  >
                    <RefreshCw size={13} />
                    <span>Try Camera Again</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Gallery / Photo Upload Scanner Option */}
        <div className="flex items-center gap-2 mb-2 flex-shrink-0">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isResolving}
            className="w-full py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 border border-slate-200 transition-colors shadow-xs active:scale-95 disabled:opacity-50"
            title="Scan a photo or screenshot containing a QR code from your gallery"
          >
            <Upload size={13} className="text-blue-600" />
            <span>Scan from Photo / Gallery</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageFileChange}
            className="hidden"
          />
        </div>

        {/* Success Lock Notification */}
        {resolvedCheckpoint && (
          <div className="mb-3 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2.5 animate-fade-in flex-shrink-0 shadow-sm">
            <CheckCircle2 size={20} className="text-emerald-600 flex-shrink-0 animate-bounce" />
            <div className="min-w-0">
              <p className="font-black text-emerald-950">✓ Location Locked & Verified</p>
              <p className="text-[11px] text-emerald-700 truncate mt-0.5">
                {resolvedCheckpoint.label} • Teleporting...
              </p>
            </div>
          </div>
        )}

        {/* Error Feedback */}
        {errorMsg && (
          <div className="mb-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 flex-shrink-0">
            <AlertCircle size={15} className="text-rose-600 flex-shrink-0" />
            <p className="truncate">{errorMsg}</p>
          </div>
        )}

        {/* One-Tap Block Selector (Official Campus Blocks & Key Checkpoints) */}
        <div className="flex-1 overflow-y-auto overscroll-contain mb-2 pr-1 space-y-1.5 min-h-0">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
            <Building2 size={11} className="text-blue-600" /> Or Tap Any Campus Block to Teleport
          </p>

          <div className="grid grid-cols-1 gap-1">
            {[
              { code: 'QR-AB', name: 'Administrative Block (AB)', icon: '🏛️', tag: 'Spot 015 • Principal & Central Office' },
              { code: 'QR-SC', name: 'St. Chavara Research Block (SC)', icon: '🧪', tag: 'Spot 203 • PG Studies & Research' },
              { code: 'QR-MT', name: 'Mother Teresa Block (MT)', icon: '🏢', tag: 'Spot 143 • Economics, English, Psychology' },
              { code: 'QR-MG', name: 'Mahatma Gandhi Block (MG)', icon: '🏛️', tag: 'Spot 269 • CS, Physics, Mathematics' },
              { code: 'QR-SM', name: "St. Mary's Commerce Block (SM)", icon: '💼', tag: 'Spot 240 • Commerce, BBA, M.Com' },
              { code: 'QR-SJ', name: 'St. Joseph Life Sciences Block (SJ)', icon: '🔬', tag: 'Spot 191 • Zoology & Botany Labs' },
              { code: 'QR-LF', name: 'LF Block Hotel Management (LF)', icon: '🍽️', tag: 'Spot 237 • Culinary Arts & Hospitality' },
              { code: 'QR-BBA', name: 'BBA & Management Studies (BBA)', icon: '📊', tag: 'Spot 364 • Incubation & Management' },
              { code: 'QR-SB', name: 'St. Sebastian Block (SB Block)', icon: '🏫', tag: 'Spot 323 • Entrance & Complex' },
              { code: 'QR-AUD', name: 'Christ College Auditorium (AUD)', icon: '🎭', tag: 'Spot 028 • Convocation & Arts' },
              { code: 'QR-GATE', name: 'Main Entrance Gate (GATE)', icon: '🚪', tag: 'Spot 001 • Reception & Security' },
            ].map((block) => (
              <button
                key={block.code}
                onClick={() => handleResolveCode(block.code)}
                disabled={isResolving}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 hover:bg-blue-50/80 text-left text-xs font-semibold text-slate-800 flex items-center justify-between transition-all border border-slate-200/80 hover:border-blue-300 group active:scale-[0.99] shadow-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base flex-shrink-0">{block.icon}</span>
                  <div className="min-w-0">
                    <p className="truncate text-[#1e3a5f] group-hover:text-blue-600 font-bold text-xs">{block.name}</p>
                    <p className="text-[10px] text-slate-500 truncate">{block.tag}</p>
                  </div>
                </div>
                <span className="text-[9px] font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200/80 font-bold flex-shrink-0">
                  {block.code}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Printable Plaques Link */}
        <div className="pt-2 border-t border-slate-100 flex-shrink-0">
          <a
            href="/qr-codes.html"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-2.5 px-3 rounded-xl bg-blue-50 hover:bg-blue-100/80 border border-blue-200 text-[#2563eb] text-xs font-bold flex items-center justify-center gap-2 transition-colors"
          >
            <span>🖨️ View & Print Official Block QR Plaques</span>
            <ExternalLink size={13} />
          </a>
        </div>
      </div>
    </div>
  );
};
