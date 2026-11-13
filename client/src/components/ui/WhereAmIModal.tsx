import React, { useMemo } from 'react';
import { Compass, MapPin, X, QrCode, CheckCircle2, Navigation2, Bug } from 'lucide-react';
import { PanoramaNode } from '../../../../shared/types';
import { useNavigation } from '../../context/NavigationContext';
import { CAMPUS_GRAPH_MAP, AREA_LABELS, getCustomPlaceTags } from '../../data/campusGraph';

export interface NearbyPlaceInfo {
  tagId: string;
  name: string;
  category?: string;
  graphDistance: number; // 0 = on current panorama, 1 = 1 graph hop, 2 = 2 graph hops
  targetNodeId: string;
  directionLabel?: 'ahead' | 'behind' | 'to your left' | 'to your right';
}

export interface WhereAmILocationResult {
  nodeId: string;
  buildingName: string;
  floorLabel: string;
  primaryPlace: NearbyPlaceInfo | null;
  otherNearbyPlaces: NearbyPlaceInfo[];
}

/**
 * Calculates human-readable relative direction based on the target angle and user's camera yaw.
 * Strictly avoids guessing: if angles are missing/invalid, returns undefined.
 */
export function calculateRelativeDirection(
  targetAngle?: number,
  cameraHeading?: number
): 'ahead' | 'behind' | 'to your left' | 'to your right' | undefined {
  if (
    targetAngle === undefined ||
    cameraHeading === undefined ||
    isNaN(targetAngle) ||
    isNaN(cameraHeading)
  ) {
    return undefined;
  }

  // Normalize relative difference between -180 and +180 degrees
  const diff = ((targetAngle - cameraHeading + 540) % 360) - 180;

  if (Math.abs(diff) <= 45) {
    return 'behind';
  } else if (diff > 45 && diff <= 135) {
    return 'to your left';
  } else if (diff < -45 && diff >= -135) {
    return 'to your right';
  } else {
    return 'ahead';
  }
}

/**
 * Resolves current mapped location and nearby tags from the campus navigation graph.
 * Does not use live GPS, photo indices, or arbitrary full-campus scans.
 */
export function resolveWhereAmILocation(
  currentNodeId: string,
  cameraHeading: number = 0
): WhereAmILocationResult {
  const node = CAMPUS_GRAPH_MAP.get(currentNodeId);

  // 1. Resolve Building Context
  let buildingName = 'Campus Grounds';
  if (node?.area && AREA_LABELS[node.area]) {
    buildingName = AREA_LABELS[node.area];
  } else if (node?.area) {
    buildingName = `${node.area} Block`;
  }

  // 2. Resolve Floor Context
  let floorLabel = 'Ground Floor';
  if (node?.area === 'OUTDOOR') {
    floorLabel = 'Campus Grounds';
  } else if (node?.floor !== undefined && node?.floor !== null) {
    const fStr = String(node.floor).trim();
    if (fStr === '0') floorLabel = 'Ground Floor';
    else if (fStr === '1') floorLabel = '1st Floor';
    else if (fStr === '2') floorLabel = '2nd Floor';
    else if (fStr === '3') floorLabel = '3rd Floor';
    else floorLabel = `Floor ${fStr}`;
  }

  // 3. Discover nearby verified tags
  const foundPlaces: NearbyPlaceInfo[] = [];
  const seenTagIds = new Set<string>();

  // PRIORITY 1: Tags directly attached to the current panorama
  const directTags = getCustomPlaceTags(currentNodeId);
  for (const tag of directTags) {
    if (!tag.text || seenTagIds.has(tag.id)) continue;
    seenTagIds.add(tag.id);
    const dir = calculateRelativeDirection(tag.yaw, cameraHeading);
    foundPlaces.push({
      tagId: tag.id,
      name: tag.text,
      category: tag.category,
      graphDistance: 0,
      targetNodeId: currentNodeId,
      directionLabel: dir,
    });
  }

  // PRIORITY 2: Directly connected panoramas (1 graph edge)
  if (foundPlaces.length === 0 && node?.connections) {
    for (const conn of node.connections) {
      if (!conn.targetId) continue;
      const neighborTags = getCustomPlaceTags(conn.targetId);
      for (const tag of neighborTags) {
        if (!tag.text || seenTagIds.has(tag.id)) continue;
        seenTagIds.add(tag.id);
        const heading = conn.heading ?? (conn as any).worldBearing;
        const dir = calculateRelativeDirection(heading, cameraHeading);
        foundPlaces.push({
          tagId: tag.id,
          name: tag.text,
          category: tag.category,
          graphDistance: 1,
          targetNodeId: conn.targetId,
          directionLabel: dir,
        });
      }
    }
  }

  // PRIORITY 3: Connected panoramas within 2 graph edges
  if (foundPlaces.length === 0 && node?.connections) {
    const visitedNodes = new Set<string>([currentNodeId]);
    for (const conn of node.connections) {
      visitedNodes.add(conn.targetId);
    }

    for (const conn1 of node.connections) {
      const neighbor = CAMPUS_GRAPH_MAP.get(conn1.targetId);
      if (!neighbor?.connections) continue;

      for (const conn2 of neighbor.connections) {
        if (!conn2.targetId || visitedNodes.has(conn2.targetId)) continue;
        visitedNodes.add(conn2.targetId);

        const hop2Tags = getCustomPlaceTags(conn2.targetId);
        for (const tag of hop2Tags) {
          if (!tag.text || seenTagIds.has(tag.id)) continue;
          seenTagIds.add(tag.id);
          const heading = conn1.heading ?? (conn1 as any).worldBearing;
          const dir = calculateRelativeDirection(heading, cameraHeading);
          foundPlaces.push({
            tagId: tag.id,
            name: tag.text,
            category: tag.category,
            graphDistance: 2,
            targetNodeId: conn2.targetId,
            directionLabel: dir,
          });
        }
      }
    }
  }

  const primaryPlace = foundPlaces.length > 0 ? foundPlaces[0] : null;
  const otherNearbyPlaces = foundPlaces.slice(1, 4);

  return {
    nodeId: currentNodeId,
    buildingName,
    floorLabel,
    primaryPlace,
    otherNearbyPlaces,
  };
}

interface WhereAmIModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPanorama: PanoramaNode;
  onOpenQRScanner: () => void;
  onOpenSearch?: () => void;
}

export const WhereAmIModal: React.FC<WhereAmIModalProps> = ({
  isOpen,
  onClose,
  currentPanorama,
  onOpenQRScanner,
}) => {
  const { cameraHeading, isDebugMode, persistedSessionInfo } = useNavigation();

  // Resolve mapped location reactively whenever current panorama or camera heading changes
  const locationResult = useMemo(() => {
    if (!isOpen || !currentPanorama?.id) return null;
    return resolveWhereAmILocation(currentPanorama.id, cameraHeading);
  }, [isOpen, currentPanorama?.id, cameraHeading]);

  if (!isOpen || !locationResult) return null;

  const { buildingName, floorLabel, primaryPlace, otherNearbyPlaces } = locationResult;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-6 shadow-2xl max-w-sm sm:max-w-md w-full relative max-h-[90dvh] overflow-y-auto overflow-x-hidden overscroll-contain text-slate-800 touch-pan-y"
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Close Where Am I"
          className="absolute top-3.5 right-3.5 sm:top-4 sm:right-4 text-slate-400 hover:text-slate-700 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-all border border-slate-200 active:scale-95 z-10"
          title="Close"
        >
          <X size={16} />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-blue-50 text-[#2563eb] flex items-center justify-center border border-blue-100">
            <Compass size={22} className="text-[#2563eb]" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[#1e3a5f]">Where Am I?</h3>
            <p className="text-[11px] text-slate-500">Current mapped WayCampus location</p>
          </div>
        </div>

        {/* Current Location Identification Card */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 mb-4 shadow-xs">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-2">
            <CheckCircle2 size={12} />
            <span>Position Identified</span>
          </div>

          {/* Current Building & Floor */}
          <div className="space-y-0.5">
            <h4 className="text-base sm:text-lg font-extrabold text-[#1e3a5f] tracking-tight">
              {buildingName}
            </h4>
            <p className="text-xs font-semibold text-[#2563eb] flex items-center gap-1">
              <MapPin size={12} className="shrink-0" />
              <span>{floorLabel}</span>
            </p>
          </div>

          {/* Nearby Tagged Place Section */}
          <div className="mt-3 pt-3 border-t border-slate-200/80">
            {primaryPlace ? (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  {primaryPlace.graphDistance === 0 ? 'Current Area Tag' : 'Nearby Mapped Place'}
                </p>
                <div className="p-2.5 rounded-xl bg-white border border-blue-200/80 flex items-center gap-2 shadow-xs">
                  <Navigation2 size={15} className="text-amber-500 shrink-0 transform rotate-45" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-bold text-slate-800 truncate">
                      {primaryPlace.graphDistance === 0
                        ? `You are near ${primaryPlace.name}`
                        : `Near ${primaryPlace.name}`}
                      {primaryPlace.directionLabel && (
                        <span className="text-amber-600 font-semibold text-[11px] ml-1">
                          — {primaryPlace.directionLabel}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Nearby Mapped Place
                </p>
                <p className="text-xs text-slate-400 italic">
                  No nearby tagged place found.
                </p>
              </div>
            )}

            {/* Multiple Nearby Places List */}
            {otherNearbyPlaces.length > 0 && (
              <div className="mt-2.5 pt-2 border-t border-slate-200/60">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Also Nearby:
                </p>
                <ul className="space-y-1">
                  {otherNearbyPlaces.map((p) => (
                    <li key={p.tagId} className="text-xs text-slate-600 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                        <span className="font-medium text-slate-800 truncate">{p.name}</span>
                      </div>
                      {p.directionLabel && (
                        <span className="text-[10px] text-slate-500 shrink-0 ml-2 font-mono">
                          {p.directionLabel}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Admin / Developer Debug Readout (Strictly only visible in debug mode) */}
          {isDebugMode && (
            <div className="mt-3 pt-2.5 border-t border-amber-300 text-[10px] font-mono text-amber-800 space-y-0.5">
              <div className="flex items-center gap-1 text-amber-700 font-bold mb-1">
                <Bug size={11} />
                <span>Debug Calibration Info</span>
              </div>
              <div>Node ID: {locationResult.nodeId}</div>
              <div>Camera Heading: {Math.round(cameraHeading)}°</div>
              {primaryPlace && (
                <div>
                  Tag Dist: {primaryPlace.graphDistance} hop(s) • Target: {primaryPlace.targetNodeId}
                </div>
              )}
              {persistedSessionInfo && (
                <div className="pt-1 mt-1 border-t border-amber-200 text-[9px] text-amber-700 space-y-0.5">
                  <div>Persisted panorama: {persistedSessionInfo.currentPanoramaId}</div>
                  <div>Persisted node: {persistedSessionInfo.currentNodeId}</div>
                  {persistedSessionInfo.isNavigating && (
                    <>
                      <div>Route step: {persistedSessionInfo.currentRouteIndex}</div>
                      <div>Destination: {persistedSessionInfo.selectedDestination?.title || 'Active Route'}</div>
                    </>
                  )}
                  <div>Restore status: {persistedSessionInfo.restoreStatus || 'RESTORED'}</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Door QR Plaque Scanning Option */}
        <div className="pt-1">
          <button
            onClick={() => {
              onClose();
              onOpenQRScanner();
            }}
            className="w-full py-3 px-4 rounded-2xl bg-[#2563eb] hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-between shadow-md shadow-blue-500/20 transition-all active:scale-98"
          >
            <div className="flex items-center gap-2">
              <QrCode size={17} className="text-white" />
              <span>Scan Nearest Door Plaque</span>
            </div>
            <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-lg font-semibold">
              Instant Checkpoint
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
