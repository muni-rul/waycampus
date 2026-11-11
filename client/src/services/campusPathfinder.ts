/**
 * campusPathfinder.ts — Master Two-Layer Heading Dijkstra Route Engine
 * Christ College (Autonomous), Irinjalakuda
 */

import {
  CAMPUS_GRAPH,
  CAMPUS_GRAPH_MAP,
  AREA_LABELS,
  type AreaCode,
  type CampusPanoramaNode,
  type PanoramaConnection,
  type ConnectionDirection,
} from '../data/campusGraph';
import { PanoramaNode, PanoramaHotspot } from '../../../shared/types';
import { getPlacesForNode, CampusPlace } from '../data/campusPlaces';

export type NavigationActionType =
  | 'START'
  | 'FORWARD'
  | 'BACKWARD'
  | 'TURN_LEFT'
  | 'TURN_RIGHT'
  | 'STAIRS'
  | 'DOOR'
  | 'LIFT'
  | 'ARRIVE';

export interface NavigationStep {
  stepIndex: number;
  nodeId: string;
  fromNodeId: string;
  targetNodeId: string | null; // Exact next node in route (null on arrival)
  instruction: string;
  actionType: NavigationActionType;
  direction?: ConnectionDirection;
  worldBearing: number; // Compass-relative direction (0-360)
  initialViewerYaw: number; // Target photo orientation: (worldBearing - targetNorthOffset) % 360
  arrowScreenYaw: number; // Current photo arrow placement: (worldBearing - currentNorthOffset) % 360
  yaw: number; // Legacy alias for initialViewerYaw
  pitch: number;
  distanceMeters: number;
  walkingCost: number;
  floorNumber: number;
  buildingName: string;
  areaCode: AreaCode;
  isStaircase: boolean;
  isEntrance: boolean;
  image?: string;
  isDestination?: boolean;
}

export interface NavigationRoute {
  routeId: string;
  startNodeId: string;
  destinationNodeId: string;
  destinationTitle: string;
  pathNodeIds: string[];
  pathNodes: CampusPanoramaNode[];
  steps: NavigationStep[];
  totalSteps: number;
  totalDistanceMeters: number;
  totalWalkingCost: number;
  estimatedWalkTimeSeconds: number;
  estimatedDurationMinutes?: number;
  routeLabel?: string;
  routeDescription?: string;
  isShortest?: boolean;
  extraDistanceMeters?: number;
}

let globalCustomRouteOverrides: Record<string, string[]> = {};

export function setCustomRouteOverrides(overrides: Record<string, string[]>) {
  globalCustomRouteOverrides = { ...(overrides || {}) };
}

export function getCustomRouteOverrides(): Record<string, string[]> {
  return globalCustomRouteOverrides;
}

export function registerManualRoute(key: string, pathNodeIds: string[]) {
  globalCustomRouteOverrides[key] = [...pathNodeIds];
}

export const SC_BLOCK_CANONICAL_PATH = [
  'outdoor_001',
  'outdoor_002',
  'outdoor_005',
  'outdoor_008',
  'outdoor_009',
  'outdoor_012',
  'outdoor_013',
  'outdoor_014',
  'outdoor_015',
  'ab_044',
  'ab_046',
  'ab_059',
  'ab_061',
  'outdoor_199',
  'outdoor_200',
  'outdoor_201',
  'outdoor_203',
];

/**
 * Priority-Weighted Dijkstra Shortest-Path calculation across the verified campus navigation graph.
 * Uses walkingCost (distance + stairs penalty) as edge weight, with manual custom route override support.
 */
export function findNavigationRoute(
  startNodeId: string,
  destinationNodeId: string,
  destinationTitle: string = 'Destination',
  includeUnconfirmed: boolean = true,
  verifiedOnly: boolean = false,
  customPath?: string[]
): NavigationRoute | null {
  const start = CAMPUS_GRAPH_MAP.get(startNodeId);
  const target = CAMPUS_GRAPH_MAP.get(destinationNodeId);

  if (!start || !target) {
    console.warn(`[CampusNav PathFinder] Invalid nodes: start=${startNodeId}, target=${destinationNodeId}`);
    return null;
  }

  // Edge case: Already at destination
  if (startNodeId === destinationNodeId) {
    const singleStep: NavigationStep = {
      stepIndex: 0,
      nodeId: startNodeId,
      fromNodeId: startNodeId,
      targetNodeId: null,
      instruction: `Arrived at ${destinationTitle}`,
      actionType: 'ARRIVE',
      direction: 'straight',
      worldBearing: 0,
      initialViewerYaw: 0,
      arrowScreenYaw: 0,
      yaw: 0,
      pitch: -6,
      distanceMeters: 0,
      walkingCost: 0,
      floorNumber: parseInt(start.floor || '0', 10) || 0,
      buildingName: AREA_LABELS[start.area] || 'Campus',
      areaCode: start.area,
      isStaircase: false,
      isEntrance: false,
      isDestination: true,
      image: start.filename,
    };

    return {
      routeId: `route_${startNodeId}_${destinationNodeId}_${Date.now()}`,
      startNodeId,
      destinationNodeId,
      destinationTitle,
      pathNodeIds: [startNodeId],
      pathNodes: [start],
      steps: [singleStep],
      totalSteps: 0,
      totalDistanceMeters: 0,
      totalWalkingCost: 0,
      estimatedWalkTimeSeconds: 0,
    };
  }

  const isSCBlock = destinationNodeId === 'outdoor_203' || destinationNodeId === 'bld_sc';

  let scCanonicalExplicit: string[] | null = null;
  if (isSCBlock && SC_BLOCK_CANONICAL_PATH.includes(startNodeId)) {
    scCanonicalExplicit = SC_BLOCK_CANONICAL_PATH.slice(SC_BLOCK_CANONICAL_PATH.indexOf(startNodeId));
  }

  // Check if manual custom route override exists
  const manualRouteKey1 = `${startNodeId}__${destinationNodeId}`;
  const manualRouteKey2 = destinationNodeId;
  const explicitPath =
    (customPath && customPath.length > 0 ? customPath : null) ||
    scCanonicalExplicit ||
    globalCustomRouteOverrides[manualRouteKey1] ||
    globalCustomRouteOverrides[manualRouteKey2] ||
    (destinationNodeId === 'outdoor_030' || destinationNodeId === 'outdoor_026'
      ? globalCustomRouteOverrides[`${startNodeId}__outdoor_030`] ||
        globalCustomRouteOverrides[`${startNodeId}__outdoor_026`] ||
        globalCustomRouteOverrides['outdoor_030'] ||
        globalCustomRouteOverrides['outdoor_026']
      : null);

  let pathNodeIds: string[] = [];

  if (
    explicitPath &&
    Array.isArray(explicitPath) &&
    explicitPath.length > 0 &&
    explicitPath[0] === startNodeId
  ) {
    pathNodeIds = [...explicitPath];
  } else {
    // Dijkstra Shortest Path Search
    const distances = new Map<string, number>();
    const previous = new Map<string, string | null>();
    const visited = new Set<string>();

    CAMPUS_GRAPH_MAP.forEach((_, id) => {
      distances.set(id, Infinity);
      previous.set(id, null);
    });
    distances.set(startNodeId, 0);

    while (visited.size < CAMPUS_GRAPH_MAP.size) {
      let currentId: string | null = null;
      let shortestCost = Infinity;

      distances.forEach((cost, id) => {
        if (!visited.has(id) && cost < shortestCost) {
          shortestCost = cost;
          currentId = id;
        }
      });

      if (!currentId || shortestCost === Infinity) break;
      if (currentId === destinationNodeId) break;

      visited.add(currentId);
      const currentNode = CAMPUS_GRAPH_MAP.get(currentId);
      if (!currentNode) continue;

      for (const conn of currentNode.connections) {
        if (!includeUnconfirmed && conn.confirmed === false) continue;
        if (verifiedOnly && conn.verified === false) continue;

        const targetId = conn.targetId;
        if (!CAMPUS_GRAPH_MAP.has(targetId) || visited.has(targetId)) continue;

        const weight =
          conn.walkingCost && conn.walkingCost > 0
            ? conn.walkingCost
            : conn.distanceMeters && conn.distanceMeters > 0
            ? conn.distanceMeters
            : 12;

        const altCost = shortestCost + weight;

        if (altCost < (distances.get(targetId) ?? Infinity)) {
          distances.set(targetId, altCost);
          previous.set(targetId, currentId);
        }
      }
    }

    if ((distances.get(destinationNodeId) ?? Infinity) === Infinity) {
      console.warn(`[CampusNav PathFinder] No route found from ${startNodeId} to ${destinationNodeId}`);
      return null;
    }

    // Reconstruct path
    let curr: string | null = destinationNodeId;
    while (curr !== null) {
      pathNodeIds.unshift(curr);
      curr = previous.get(curr) || null;
    }
  }

  const pathNodes = pathNodeIds.map((id) => CAMPUS_GRAPH_MAP.get(id)!);
  const steps: NavigationStep[] = [];
  let cumulativeDistance = 0;
  let cumulativeCost = 0;

  for (let i = 0; i < pathNodes.length; i++) {
    const node = pathNodes[i];
    const nextNode = pathNodes[i + 1] || null;

    let actionType: NavigationActionType = 'FORWARD';
    let direction: ConnectionDirection | undefined = undefined;
    let instruction = 'Continue straight';
    let worldBearing = 0;
    let initialViewerYaw = 0;
    let arrowScreenYaw = 0;
    let isStaircase = false;
    let isEntrance = false;
    let stepDist = 0;
    let stepCost = 0;

    if (i === pathNodes.length - 1) {
      actionType = 'ARRIVE';
      instruction = `Arrived at ${destinationTitle}`;
      worldBearing = 0;
      initialViewerYaw = 0;
      arrowScreenYaw = 0;
    } else if (nextNode) {
      const conn = node.connections.find((c) => c.targetId === nextNode.id);
      stepDist = conn?.distanceMeters && conn.distanceMeters > 0 ? conn.distanceMeters : 12;
      stepCost = conn?.walkingCost && conn.walkingCost > 0 ? conn.walkingCost : stepDist;
      cumulativeDistance += stepDist;
      cumulativeCost += stepCost;

      worldBearing = conn?.worldBearing !== undefined ? conn.worldBearing : conn?.heading !== undefined ? conn.heading : 0;
      direction = conn?.direction;

      // Section 3: Two-layer heading model
      // 1. Initial camera yaw when landing in nextNode: (worldBearing - targetNorthOffset) % 360
      const targetNorthOffset = nextNode.northOffset ?? 0;
      initialViewerYaw = ((worldBearing - targetNorthOffset) % 360 + 360) % 360;

      // 2. Arrow screen yaw on current node: (worldBearing - currentNode.northOffset) % 360
      const currentNorthOffset = node.northOffset ?? 0;
      arrowScreenYaw = ((worldBearing - currentNorthOffset) % 360 + 360) % 360;

      switch (direction) {
        case 'left':
          actionType = 'TURN_LEFT';
          instruction = 'Turn left';
          break;
        case 'right':
          actionType = 'TURN_RIGHT';
          instruction = 'Turn right';
          break;
        case 'slight-left':
          actionType = 'TURN_LEFT';
          instruction = 'Turn slightly left';
          break;
        case 'slight-right':
          actionType = 'TURN_RIGHT';
          instruction = 'Turn slightly right';
          break;
        case 'stairs-up':
          actionType = 'STAIRS';
          instruction = 'Go upstairs';
          isStaircase = true;
          break;
        case 'stairs-down':
          actionType = 'STAIRS';
          instruction = 'Go downstairs';
          isStaircase = true;
          break;
        case 'ramp-up':
          actionType = 'FORWARD';
          instruction = 'Go up the ramp';
          break;
        case 'ramp-down':
          actionType = 'FORWARD';
          instruction = 'Go down the ramp';
          break;
        case 'enter-building':
          actionType = 'DOOR';
          instruction = 'Enter the building';
          isEntrance = true;
          break;
        case 'exit-building':
          actionType = 'DOOR';
          instruction = 'Exit the building';
          break;
        case 'u-turn':
          actionType = 'TURN_LEFT';
          instruction = 'Make a U-turn';
          break;
        case 'straight':
          actionType = 'FORWARD';
          instruction = 'Continue straight';
          break;
        default:
          actionType = 'FORWARD';
          instruction = 'Continue straight';
          break;
      }

      // If conn has a custom landmark instruction, use it only if not a raw node ID phrase
      if (conn?.instruction) {
        const raw = conn.instruction.trim();
        const isLegacyNode = /(?:continue|return|go)\s+to\s+\d+/i.test(raw) || /\b[a-z]{1,4}_?\d{1,4}\b/i.test(raw);
        if (!isLegacyNode && raw.length > 0) {
          instruction = raw;
        }
      }

      if (direction === 'stairs-up' || direction === 'stairs-down' || node.isFloorTransition || nextNode.isFloorTransition) {
        isStaircase = true;
        actionType = 'STAIRS';
      }

      if (direction === 'enter-building' || node.isBuildingEntrance || nextNode.isBuildingEntrance) {
        isEntrance = true;
        actionType = 'DOOR';
      }
    }

    steps.push({
      stepIndex: i,
      nodeId: node.id,
      fromNodeId: node.id,
      targetNodeId: nextNode ? nextNode.id : null,
      instruction,
      actionType,
      direction,
      worldBearing,
      initialViewerYaw,
      arrowScreenYaw,
      yaw: initialViewerYaw,
      pitch: -6,
      distanceMeters: stepDist,
      walkingCost: stepCost,
      floorNumber: parseInt(node.floor || '0', 10) || 0,
      buildingName: AREA_LABELS[node.area] || 'Campus',
      areaCode: node.area,
      isStaircase,
      isEntrance,
      isDestination: i === pathNodes.length - 1,
      image: node.filename,
    });
  }

  const estimatedWalkTimeSeconds = Math.round((cumulativeDistance / 1.2)); // 1.2 m/s avg walking speed

  return {
    routeId: `route_${startNodeId}_${destinationNodeId}_${Date.now()}`,
    startNodeId,
    destinationNodeId,
    destinationTitle,
    pathNodeIds,
    pathNodes,
    steps,
    totalSteps: steps.length - 1,
    totalDistanceMeters: cumulativeDistance,
    totalWalkingCost: cumulativeCost,
    estimatedWalkTimeSeconds,
    estimatedDurationMinutes: Math.max(1, Math.round(estimatedWalkTimeSeconds / 60)),
  };
}

/**
 * Converts CAMPUS_GRAPH nodes into format expected by legacy components.
 */
export function getAllGraphPanoramaNodes(): PanoramaNode[] {
  return CAMPUS_GRAPH.map((node) => {
    const hotspots: PanoramaHotspot[] = node.connections.map((c) => {
      const targetNode = CAMPUS_GRAPH_MAP.get(c.targetId);
      const worldBearing = c.worldBearing ?? c.heading ?? 0;
      const currentNorthOffset = node.northOffset ?? 0;
      const arrowScreenYaw = ((worldBearing - currentNorthOffset) % 360 + 360) % 360;
      const arrivalYaw = c.targetYaw !== undefined ? c.targetYaw : c.initialViewerYaw;

      return {
        targetPanoId: c.targetId,
        targetLabel: targetNode ? targetNode.filename.replace(/_/g, ' ').replace('.jpg', '') : c.targetId,
        instruction: c.instruction || 'Continue path',
        yaw: arrowScreenYaw,
        targetYaw: arrivalYaw,
        pitch: (c as any).pitch !== undefined && (c as any).pitch !== -28 && (c as any).pitch !== -25
          ? (c as any).pitch
          : (c.direction === 'u-turn' || (c as any).type === 'backward' || (c.direction as string) === 'backward'
              ? -21
              : c.direction?.includes('stairs-down')
              ? -26
              : c.direction?.includes('stairs-up')
              ? -10
              : (c.direction?.includes('left') || c.direction?.includes('right'))
              ? -17
              : -15),
        distanceMeters: c.distanceMeters || 12,
        transitionType: c.type === 'transition' ? 'DOOR' : c.direction?.includes('stairs') ? 'STAIRS' : 'WALK',
        direction: c.direction || (c.type === 'backward' ? 'u-turn' : 'straight'),
      } as any;
    });

    return {
      id: node.id,
      campusId: 'campus_christ_irinjalakuda',
      buildingId: node.buildingId || (node.area === 'OUTDOOR' ? 'OUTDOOR' : `building_${node.area.toLowerCase()}`),
      buildingName: AREA_LABELS[node.area],
      floorId: node.floorId || `floor_${node.area.toLowerCase()}_${node.floor || '0'}`,
      floorNumber: parseInt(node.floor || '0', 10) || 0,
      name: node.filename.replace(/_/g, ' ').replace('.jpg', ''),
      description: `${AREA_LABELS[node.area]} • Floor ${node.floor || '0'}`,
      x: 0,
      y: 0,
      z: 0,
      heading: node.northOffset || 0,
      imageUrl: node.imagePath,
      thumbnailUrl: node.imagePath,
      captureDate: '2026-08-30',
      qualityScore: 98,
      verifiedStatus: 'VERIFIED',
      navigationNodeId: node.id,
      neighborPanoIds: node.connections.map((c) => c.targetId),
      hotspots,
      places: getPlacesForNode(node.id),
      defaultCameraYaw: (node as any).defaultCameraYaw,
    };
  });
}

export interface CampusZoneInfo {
  area: AreaCode;
  name: string;
  firstNodeId: string;
  icon: string;
  description: string;
  nodeCount: number;
  totalPanos: number;
}

export const CAMPUS_ZONES: CampusZoneInfo[] = [
  { area: 'OUTDOOR', name: 'Outdoor Grounds', firstNodeId: 'outdoor_001', icon: '🌳', description: 'Central avenues, sports courts, auditoriums & gates', nodeCount: 146, totalPanos: 146 },
  { area: 'MG', name: 'Mahatma Gandhi Block', firstNodeId: 'outdoor_269', icon: '🏛️', description: 'Heritage building, computer science labs & offices', nodeCount: 44, totalPanos: 44 },
  { area: 'SM', name: "St. Mary's Block", firstNodeId: 'outdoor_240', icon: '🏢', description: 'Commerce department & smart classrooms', nodeCount: 17, totalPanos: 17 },
  { area: 'SJ', name: 'St. Joseph Block', firstNodeId: 'outdoor_191', icon: '🔬', description: 'Science laboratories & research centers', nodeCount: 24, totalPanos: 24 },
  { area: 'SC', name: 'St. Chavara Block', firstNodeId: 'outdoor_203', icon: '🎓', description: 'Post-graduate departments & lecture halls', nodeCount: 31, totalPanos: 31 },
  { area: 'AB', name: 'Administrative Block', firstNodeId: 'ab_044', icon: '🏛️', description: "Principal office, council hall & fee counters", nodeCount: 50, totalPanos: 50 },
  { area: 'HM', name: 'Hotel Management', firstNodeId: 'hm_465', icon: '🍽️', description: 'Culinary arts, training kitchens & bakery labs', nodeCount: 10, totalPanos: 10 },
  { area: 'SB', name: 'Sneha Bhavan Block (SB Block)', firstNodeId: 'sb_437', icon: '🏫', description: 'Sneha Bhavan Block housing MSW, BSW, library & classrooms', nodeCount: 36, totalPanos: 36 },
  { area: 'BBA', name: 'BBA Block', firstNodeId: 'bba_364', icon: '📊', description: 'Management studies, seminar halls & classrooms', nodeCount: 55, totalPanos: 55 },
  { area: 'GB', name: 'Fr. Gabriel Indoor Stadium (GB Block)', firstNodeId: 'bba_364', icon: '🏃', description: 'Fr. Gabriel Indoor Stadium & sports complex', nodeCount: 25, totalPanos: 25 },
];

export function convertGraphNodeToPanoramaNode(node: CampusPanoramaNode): PanoramaNode {
  const hotspots: PanoramaHotspot[] = node.connections.map((c) => {
    const targetNode = CAMPUS_GRAPH_MAP.get(c.targetId);
    const worldBearing = c.worldBearing ?? c.heading ?? 0;
    const currentNorthOffset = node.northOffset ?? 0;
    const arrowScreenYaw = ((worldBearing - currentNorthOffset) % 360 + 360) % 360;
    const arrivalYaw = c.targetYaw !== undefined ? c.targetYaw : c.initialViewerYaw;

    return {
      targetPanoId: c.targetId,
      targetLabel: targetNode ? targetNode.filename.replace(/_/g, ' ').replace('.jpg', '') : c.targetId,
      instruction: c.instruction || 'Continue path',
      yaw: arrowScreenYaw,
      targetYaw: arrivalYaw,
      pitch: c.pitch !== undefined && c.pitch !== -28 && c.pitch !== -25
        ? c.pitch
        : (c.direction === 'u-turn' || (c as any).type === 'backward' || (c.direction as string) === 'backward'
            ? -21
            : c.direction?.includes('stairs-down')
            ? -26
            : c.direction?.includes('stairs-up')
            ? -10
            : (c.direction?.includes('left') || c.direction?.includes('right'))
            ? -17
            : -15),
      direction: c.direction,
      distanceMeters: c.distanceMeters || 12,
      transitionType: c.type === 'transition' ? 'DOOR' : c.direction?.includes('stairs') ? 'STAIRS' : 'WALK',
    };
  });

  return {
    id: node.id,
    campusId: 'campus_christ_irinjalakuda',
    buildingId: node.buildingId || (node.area === 'OUTDOOR' ? 'OUTDOOR' : `building_${node.area.toLowerCase()}`),
    buildingName: AREA_LABELS[node.area],
    floorId: node.floorId || `floor_${node.area.toLowerCase()}_${node.floor || '0'}`,
    floorNumber: parseInt(node.floor || '0', 10) || 0,
    name: node.filename.replace(/_/g, ' ').replace('.jpg', ''),
    description: `${AREA_LABELS[node.area]} • Floor ${node.floor || '0'}`,
    x: 0,
    y: 0,
    z: 0,
    heading: node.northOffset || 0,
    imageUrl: node.imagePath,
    thumbnailUrl: node.imagePath,
    captureDate: '2026-08-30',
    qualityScore: 98,
    verifiedStatus: 'VERIFIED',
    navigationNodeId: node.id,
    neighborPanoIds: node.connections.map((c) => c.targetId),
    hotspots,
    places: getPlacesForNode(node.id),
    defaultCameraYaw: (node as any).defaultCameraYaw,
  };
}

export function summarizePathLandmarks(pathNodeIds: string[]): string {
  const areas: string[] = [];
  pathNodeIds.forEach((id) => {
    if (id.startsWith('outdoor_')) {
      const num = parseInt(id.replace('outdoor_', ''), 10);
      if (num >= 153 && num <= 162) areas.push('Canteen Pathway');
      else if (num >= 9 && num <= 15) areas.push('West Avenue');
      else if (num >= 5 && num <= 8) areas.push('Central Quadrangle');
      else if (num >= 196 && num <= 205) areas.push('East Walkway');
      else if (num >= 21 && num <= 24) areas.push('Garden Path');
      else areas.push('Main Campus Walkway');
    } else {
      const prefix = id.split('_')[0].toUpperCase();
      if ((AREA_LABELS as any)[prefix]) areas.push((AREA_LABELS as any)[prefix]);
    }
  });

  const deduped: string[] = [];
  areas.forEach((a) => {
    if (deduped[deduped.length - 1] !== a) deduped.push(a);
  });

  if (deduped.length <= 1) return deduped[0] || 'Direct Walkway';
  if (deduped.length === 2) return `Via ${deduped[0]} → ${deduped[1]}`;
  return `Via ${deduped.slice(0, 3).join(' → ')}`;
}

/**
 * Priority-Weighted Multi-Route calculation across the campus navigation graph.
 * Returns the Shortest Way first, followed by up to 2 distinct legitimate alternative routes.
 */
export function findMultipleNavigationRoutes(
  startNodeId: string,
  destinationNodeId: string,
  destinationTitle: string = 'Destination',
  maxRoutes: number = 3
): NavigationRoute[] {
  const routes: NavigationRoute[] = [];

  // 1. Calculate Primary (Shortest) Route
  const shortest = findNavigationRoute(startNodeId, destinationNodeId, destinationTitle);
  if (!shortest || shortest.pathNodeIds.length === 0) return [];

  shortest.routeId = 'route_shortest';
  shortest.routeLabel = 'Shortest Way';
  shortest.isShortest = true;
  shortest.extraDistanceMeters = 0;
  shortest.routeDescription = summarizePathLandmarks(shortest.pathNodeIds);
  routes.push(shortest);

  // If already at destination or very short path, no meaningful alternative routes exist
  if (startNodeId === destinationNodeId || shortest.pathNodeIds.length <= 2) {
    return routes;
  }

  // Edge penalties map: "fromNode->toNode" -> multiplier
  const edgePenalties = new Map<string, number>();

  for (let k = 1; k < maxRoutes; k++) {
    // Penalize all edges from already discovered routes
    for (const r of routes) {
      for (let i = 0; i < r.pathNodeIds.length - 1; i++) {
        const from = r.pathNodeIds[i];
        const to = r.pathNodeIds[i + 1];
        const edgeKey = `${from}->${to}`;
        edgePenalties.set(edgeKey, (edgePenalties.get(edgeKey) || 1) * 2.5);
      }
    }

    // Run Dijkstra with edge penalties
    const distances = new Map<string, number>();
    const previous = new Map<string, string | null>();
    const visited = new Set<string>();

    CAMPUS_GRAPH_MAP.forEach((_, id) => {
      distances.set(id, Infinity);
      previous.set(id, null);
    });
    distances.set(startNodeId, 0);

    while (visited.size < CAMPUS_GRAPH_MAP.size) {
      let currentId: string | null = null;
      let shortestCost = Infinity;

      distances.forEach((cost, id) => {
        if (!visited.has(id) && cost < shortestCost) {
          shortestCost = cost;
          currentId = id;
        }
      });

      if (!currentId || shortestCost === Infinity) break;
      if (currentId === destinationNodeId) break;

      visited.add(currentId);
      const currentNode = CAMPUS_GRAPH_MAP.get(currentId);
      if (!currentNode) continue;

      for (const conn of currentNode.connections) {
        const targetId = conn.targetId;
        if (!CAMPUS_GRAPH_MAP.has(targetId) || visited.has(targetId)) continue;

        const baseWeight =
          conn.walkingCost && conn.walkingCost > 0
            ? conn.walkingCost
            : conn.distanceMeters && conn.distanceMeters > 0
            ? conn.distanceMeters
            : 12;

        const penalty = edgePenalties.get(`${currentId}->${targetId}`) || 1;
        const weight = baseWeight * penalty;

        const altCost = shortestCost + weight;
        if (altCost < (distances.get(targetId) ?? Infinity)) {
          distances.set(targetId, altCost);
          previous.set(targetId, currentId);
        }
      }
    }

    if ((distances.get(destinationNodeId) ?? Infinity) === Infinity) break;

    // Reconstruct alternative path
    const altPath: string[] = [];
    let curr: string | null = destinationNodeId;
    while (curr !== null) {
      altPath.unshift(curr);
      curr = previous.get(curr) || null;
    }

    if (altPath.length === 0 || altPath[0] !== startNodeId) break;

    // Check uniqueness (not identical to any existing route)
    const isDuplicate = routes.some((r) => r.pathNodeIds.join(',') === altPath.join(','));
    if (isDuplicate) break;

    // Check that path has meaningful difference (overlap < 95%)
    const overlapCount = altPath.filter((n) => shortest.pathNodeIds.includes(n)).length;
    const similarity = overlapCount / Math.max(altPath.length, shortest.pathNodeIds.length);
    if (similarity >= 0.95 && altPath.length === shortest.pathNodeIds.length) {
      continue;
    }

    // Build the full NavigationRoute object for this alternative path
    const altRoute = findNavigationRoute(startNodeId, destinationNodeId, destinationTitle, true, false, altPath);
    if (!altRoute) break;

    const extraDist = Math.max(0, altRoute.totalDistanceMeters - shortest.totalDistanceMeters);
    altRoute.routeId = `route_alt_${k}`;
    altRoute.routeLabel = `Alternative Way ${k}`;
    altRoute.isShortest = false;
    altRoute.extraDistanceMeters = extraDist;
    altRoute.routeDescription = summarizePathLandmarks(altPath);

    routes.push(altRoute);
  }

  return routes;
}


