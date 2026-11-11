import {
  NavigationNode,
  NavigationEdge,
  RouteResult,
  Instruction,
  Coordinate3D,
} from '../../../shared/types';
import { store } from '../db/store';

interface PriorityQueueItem {
  nodeId: string;
  priority: number;
}

class SimplePriorityQueue {
  private items: PriorityQueueItem[] = [];

  enqueue(nodeId: string, priority: number) {
    this.items.push({ nodeId, priority });
    this.items.sort((a, b) => a.priority - b.priority);
  }

  dequeue(): string | undefined {
    return this.items.shift()?.nodeId;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }
}

export class NavigationService {
  private static cacheVersion = -1;
  private static routeCache = new Map<string, RouteResult | null>();

  private static euclideanDistance(a: Coordinate3D, b: Coordinate3D): number {
    const dx = a.x - b.x;
    const dy = (a.y - b.y) * 1.5; // Slightly weight vertical distance
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  public static findRoute(
    fromNodeId: string,
    toNodeId: string,
    options: { accessibleOnly?: boolean; avoidClosed?: boolean } = {}
  ): RouteResult | null {
    const accessibleOnly = options.accessibleOnly ?? false;
    const avoidClosed = options.avoidClosed ?? true;

    const currentVersion = store.getStateVersion();
    if (this.cacheVersion !== currentVersion) {
      this.routeCache.clear();
      this.cacheVersion = currentVersion;
    }

    const cacheKey = `${fromNodeId}->${toNodeId}|${accessibleOnly}|${avoidClosed}`;
    if (this.routeCache.has(cacheKey)) {
      return this.routeCache.get(cacheKey)!;
    }

    const allNodes = store.getNavigationNodes();
    const allEdges = store.getNavigationEdges();
    const buildings = store.getBuildings();

    const nodeMap = new Map<string, NavigationNode>();
    for (const node of allNodes) {
      nodeMap.set(node.id, node);
    }

    const startNode = nodeMap.get(fromNodeId);
    const endNode = nodeMap.get(toNodeId);

    if (!startNode || !endNode) {
      // Fallback to 474-node 360° Panorama Campus Graph if either endpoint is a panorama node ID
      const panoRoute = this.findPanoramaGraphRoute(fromNodeId, toNodeId, {
        accessibleOnly,
        avoidClosed,
      });
      if (panoRoute) {
        if (this.routeCache.size > 500) {
          this.routeCache.clear();
        }
        this.routeCache.set(cacheKey, panoRoute);
        return panoRoute;
      }
      console.warn(`[NavigationService] Node not found. from: ${fromNodeId}, to: ${toNodeId}`);
      return null;
    }

    // Build Adjacency Graph
    const adj = new Map<string, { targetId: string; edge: NavigationEdge; weight: number }[]>();
    for (const node of allNodes) {
      adj.set(node.id, []);
    }

    for (const edge of allEdges) {
      if (avoidClosed && edge.status === 'CLOSED') continue;
      if (accessibleOnly && (!edge.accessible || edge.edgeType === 'STAIRS')) continue;

      const srcNode = nodeMap.get(edge.sourceNodeId);
      const tgtNode = nodeMap.get(edge.targetNodeId);

      if (!srcNode || !tgtNode) continue;
      if (avoidClosed && (srcNode.status === 'CLOSED' || tgtNode.status === 'CLOSED')) continue;
      if (accessibleOnly && (!srcNode.accessible || !tgtNode.accessible)) continue;

      let weight = edge.distance;
      if (edge.edgeType === 'LIFT') {
        weight = accessibleOnly ? 2 : edge.distance + 15;
      } else if (edge.edgeType === 'STAIRS') {
        weight = accessibleOnly ? 999999 : edge.distance;
      }

      adj.get(edge.sourceNodeId)?.push({ targetId: edge.targetNodeId, edge, weight });
      // Bi-directional edge
      adj.get(edge.targetNodeId)?.push({ targetId: edge.sourceNodeId, edge, weight });
    }

    // A* Pathfinding
    const openSet = new SimplePriorityQueue();
    const cameFrom = new Map<string, { prevNodeId: string; edge: NavigationEdge }>();
    const gScore = new Map<string, number>();
    const fScore = new Map<string, number>();
    const closedSet = new Set<string>();

    for (const node of allNodes) {
      gScore.set(node.id, Infinity);
      fScore.set(node.id, Infinity);
    }

    gScore.set(fromNodeId, 0);
    fScore.set(fromNodeId, this.euclideanDistance(startNode, endNode));
    openSet.enqueue(fromNodeId, fScore.get(fromNodeId)!);

    let destinationReached = false;

    while (!openSet.isEmpty()) {
      const currentId = openSet.dequeue()!;
      if (currentId === toNodeId) {
        destinationReached = true;
        break;
      }

      if (closedSet.has(currentId)) continue;
      closedSet.add(currentId);

      const neighbors = adj.get(currentId) || [];
      const currentG = gScore.get(currentId) ?? Infinity;
      const currentNode = nodeMap.get(currentId)!;

      for (const neighbor of neighbors) {
        if (closedSet.has(neighbor.targetId)) continue;
        const neighborNode = nodeMap.get(neighbor.targetId);
        if (!neighborNode) continue;

        const tentativeG = currentG + neighbor.weight;
        if (tentativeG < (gScore.get(neighbor.targetId) ?? Infinity)) {
          cameFrom.set(neighbor.targetId, { prevNodeId: currentId, edge: neighbor.edge });
          gScore.set(neighbor.targetId, tentativeG);
          const h = this.euclideanDistance(neighborNode, endNode);
          const f = tentativeG + h;
          fScore.set(neighbor.targetId, f);
          openSet.enqueue(neighbor.targetId, f);
        }
      }
    }

    if (!destinationReached) {
      return null;
    }

    // Reconstruct path
    const pathNodes: NavigationNode[] = [];
    let curr: string | undefined = toNodeId;
    while (curr) {
      const n = nodeMap.get(curr);
      if (n) pathNodes.unshift(n);
      const prev = cameFrom.get(curr);
      curr = prev?.prevNodeId;
    }

    // Compute total distance & floor transitions
    let totalDistanceMeters = 0;
    const floorTransitions: { fromFloor: number; toFloor: number; via: 'STAIRS' | 'LIFT' | 'RAMP'; atNodeId: string }[] = [];

    for (let i = 0; i < pathNodes.length - 1; i++) {
      const n1 = pathNodes[i];
      const n2 = pathNodes[i + 1];
      const stepDist = Math.round(this.euclideanDistance(n1, n2));
      totalDistanceMeters += stepDist;

      if (n1.floorNumber !== n2.floorNumber) {
        const prevEdge = cameFrom.get(n2.id)?.edge;
        const viaType = prevEdge?.edgeType === 'LIFT' ? 'LIFT' : prevEdge?.edgeType === 'RAMP' ? 'RAMP' : 'STAIRS';
        floorTransitions.push({
          fromFloor: n1.floorNumber,
          toFloor: n2.floorNumber,
          via: viaType,
          atNodeId: n1.id,
        });
      }
    }

    // Synthesize human instructions
    const instructions = this.generateInstructions(pathNodes, buildings);

    // Walking speed: 1.2 m/s (~72 m/min) + 15s per floor change
    const estimatedTimeSeconds = Math.round(totalDistanceMeters / 1.2) + floorTransitions.length * 15;

    const result: RouteResult = {
      pathNodes,
      totalDistanceMeters,
      estimatedTimeSeconds,
      instructions,
      floorTransitions,
      isAccessible: accessibleOnly,
      hasTemporaryClosuresBypassed: false,
    };
    if (this.routeCache.size > 500) {
      this.routeCache.clear();
    }
    this.routeCache.set(cacheKey, result);
    return result;
  }

  private static generateInstructions(
    path: NavigationNode[],
    buildings: { id: string; name: string }[]
  ): Instruction[] {
    if (path.length === 0) return [];
    if (path.length === 1) {
      return [
        {
          stepNumber: 1,
          text: `You are at ${path[0].label || 'destination'}.`,
          icon: 'arrive',
          distanceMeters: 0,
          floorNumber: path[0].floorNumber,
          destinationReached: true,
        },
      ];
    }

    const instructions: Instruction[] = [];
    let stepNum = 1;

    // Step 1: Start
    const startNode = path[0];
    instructions.push({
      stepNumber: stepNum++,
      text: `Start at ${startNode.label || 'your starting location'}.`,
      icon: 'straight',
      distanceMeters: 0,
      floorNumber: startNode.floorNumber,
      buildingName: startNode.buildingId ? buildings.find((b) => b.id === startNode.buildingId)?.name : undefined,
    });

    let currentSegDist = 0;
    let currentBuildingId = startNode.buildingId;
    let currentFloor = startNode.floorNumber;

    for (let i = 0; i < path.length - 1; i++) {
      const p1 = path[i];
      const p2 = path[i + 1];
      const dist = Math.round(this.euclideanDistance(p1, p2));
      currentSegDist += dist;

      // 1. Check Floor Change (Stairs / Lift)
      if (p1.floorNumber !== p2.floorNumber) {
        const isUp = p2.floorNumber > p1.floorNumber;
        const targetFloorName = p2.floorNumber === 0 ? 'Ground Floor' : p2.floorNumber === 1 ? 'First Floor' : p2.floorNumber === 2 ? 'Second Floor' : `${p2.floorNumber}th Floor`;
        const isLift = p1.nodeType === 'LIFT_DOOR' || p2.nodeType === 'LIFT_DOOR';

        instructions.push({
          stepNumber: stepNum++,
          text: isLift
            ? `Take the elevator (Lift) to ${targetFloorName}.`
            : `Take the staircase ${isUp ? 'up' : 'down'} to ${targetFloorName}.`,
          icon: isLift ? 'lift' : isUp ? 'stairs-up' : 'stairs-down',
          distanceMeters: dist,
          floorNumber: p2.floorNumber,
          floorName: targetFloorName,
          buildingName: p2.buildingId ? buildings.find((b) => b.id === p2.buildingId)?.name : undefined,
        });
        currentFloor = p2.floorNumber;
        currentSegDist = 0;
        continue;
      }

      // 2. Check Building Transition
      if (p1.buildingId !== p2.buildingId) {
        if (!p1.buildingId && p2.buildingId) {
          const bldName = buildings.find((b) => b.id === p2.buildingId)?.name || 'Building';
          instructions.push({
            stepNumber: stepNum++,
            text: `Enter ${bldName} through ${p2.label || 'the main entrance'}.`,
            icon: 'enter-building',
            distanceMeters: dist,
            floorNumber: p2.floorNumber,
            buildingName: bldName,
          });
          currentBuildingId = p2.buildingId;
          currentSegDist = 0;
          continue;
        } else if (p1.buildingId && !p2.buildingId) {
          instructions.push({
            stepNumber: stepNum++,
            text: `Exit building onto outdoor campus walkway.`,
            icon: 'exit-building',
            distanceMeters: dist,
            floorNumber: 0,
          });
          currentBuildingId = undefined;
          currentSegDist = 0;
          continue;
        }
      }

      // 3. Check Turn Angle (if we have 3 nodes in sequence on same floor)
      if (i > 0 && i < path.length - 1) {
        const p0 = path[i - 1];
        if (p0.floorNumber === p1.floorNumber && p1.floorNumber === p2.floorNumber) {
          const v1x = p1.x - p0.x;
          const v1z = p1.z - p0.z;
          const v2x = p2.x - p1.x;
          const v2z = p2.z - p1.z;

          const angle1 = Math.atan2(v1z, v1x);
          const angle2 = Math.atan2(v2z, v2x);
          let diff = angle2 - angle1;
          while (diff < -Math.PI) diff += 2 * Math.PI;
          while (diff > Math.PI) diff -= 2 * Math.PI;

          const deg = (diff * 180) / Math.PI;

          if (Math.abs(deg) > 40) {
            const isRight = deg > 0;
            const turnText = Math.abs(deg) > 70 ? (isRight ? 'Turn right' : 'Turn left') : (isRight ? 'Bear slight right' : 'Bear slight left');
            const corridorContext = p1.label ? ` at ${p1.label}` : '';

            instructions.push({
              stepNumber: stepNum++,
              text: `${turnText}${corridorContext} and continue for ${currentSegDist} metres.`,
              icon: isRight ? 'right' : 'left',
              distanceMeters: currentSegDist,
              floorNumber: p1.floorNumber,
              buildingName: p1.buildingId ? buildings.find((b) => b.id === p1.buildingId)?.name : undefined,
            });
            currentSegDist = 0;
          }
        }
      }
    }

    // Final Arrival Step
    const endNode = path[path.length - 1];
    const finalBuilding = endNode.buildingId ? buildings.find((b) => b.id === endNode.buildingId)?.name : 'Campus';
    const floorLabel = endNode.floorNumber === 0 ? 'Ground Floor' : endNode.floorNumber === 1 ? '1st Floor' : endNode.floorNumber === 2 ? '2nd Floor' : `${endNode.floorNumber}th Floor`;

    instructions.push({
      stepNumber: stepNum++,
      text: `Arrive at ${endNode.label || 'your destination'} (${finalBuilding}, ${floorLabel}).`,
      icon: 'arrive',
      distanceMeters: currentSegDist,
      floorNumber: endNode.floorNumber,
      floorName: floorLabel,
      buildingName: finalBuilding,
      destinationReached: true,
    });

    return instructions;
  }

  private static findPanoramaGraphRoute(
    rawFromId: string,
    rawToId: string,
    options: { accessibleOnly?: boolean; avoidClosed?: boolean } = {}
  ): RouteResult | null {
    const legacyToPanoMap: Record<string, string> = {
      node_main_gate: 'outdoor_001',
      node_main_entrance: 'ab_044',
      node_admin_g_foyer: 'ab_046',
      node_chavara_entrance: 'sc_205',
      node_mg_entrance: 'mg_259',
      node_sm_entrance: 'sm_241',
      node_sj_entrance: 'sj_166',
      node_mt_entrance: 'mt_335',
    };

    const fromId = legacyToPanoMap[rawFromId] || rawFromId;
    const toId = legacyToPanoMap[rawToId] || rawToId;

    const overrides = store.getGraphOverrides();
    const customConnections = overrides.customConnections || {};
    const manualNumbers = overrides.manualNumbers || {};
    const customPanoramas = overrides.customPanoramas || {};
    const nodeMeta = overrides.nodeMetadataOverrides || {};

    const knownNodeIds = new Set<string>([
      ...Object.keys(customConnections),
      ...Object.keys(manualNumbers),
      ...Object.keys(customPanoramas),
    ]);

    if (!knownNodeIds.has(fromId) || !knownNodeIds.has(toId)) {
      return null;
    }

    // Dijkstra shortest path across directional panorama connections
    const openSet = new SimplePriorityQueue();
    const gScore = new Map<string, number>();
    const cameFrom = new Map<string, { prevId: string; dist: number }>();
    const closedSet = new Set<string>();

    for (const id of knownNodeIds) {
      gScore.set(id, Infinity);
    }

    gScore.set(fromId, 0);
    openSet.enqueue(fromId, 0);

    let reached = false;
    while (!openSet.isEmpty()) {
      const current = openSet.dequeue()!;
      if (current === toId) {
        reached = true;
        break;
      }
      if (closedSet.has(current)) continue;
      closedSet.add(current);

      const currentG = gScore.get(current) ?? Infinity;
      const conns = customConnections[current] || [];
      for (const conn of conns) {
        const targetId = conn?.targetId || conn?.targetPanoId;
        if (!targetId || !knownNodeIds.has(targetId) || closedSet.has(targetId)) continue;
        const stepCost =
          typeof conn.walkingCost === 'number' && conn.walkingCost > 0
            ? conn.walkingCost
            : typeof conn.distanceMeters === 'number' && conn.distanceMeters > 0
            ? conn.distanceMeters
            : 5;
        const stepDist =
          typeof conn.distanceMeters === 'number' && conn.distanceMeters > 0
            ? conn.distanceMeters
            : 5;

        const tentativeG = currentG + stepCost;
        if (tentativeG < (gScore.get(targetId) ?? Infinity)) {
          gScore.set(targetId, tentativeG);
          cameFrom.set(targetId, { prevId: current, dist: stepDist });
          openSet.enqueue(targetId, tentativeG);
        }
      }
    }

    if (!reached) {
      return null;
    }

    // Reconstruct sequence of panorama node IDs
    const seqIds: string[] = [];
    let curr: string | undefined = toId;
    let totalDistanceMeters = 0;
    while (curr) {
      seqIds.unshift(curr);
      const step = cameFrom.get(curr);
      if (step) {
        totalDistanceMeters += step.dist;
      }
      curr = step?.prevId;
    }

    const toNavNode = (id: string, idx: number): NavigationNode => {
      const prefix = id.split('_')[0].toLowerCase();
      const meta = nodeMeta[id] || customPanoramas[id] || {};
      const floorNumber = typeof meta.floor === 'number' ? meta.floor : 0;
      const tagsOnNode = overrides.customPlaceTags?.[id] || [];
      const firstTagLabel = tagsOnNode[0]?.text || tagsOnNode[0]?.label;
      const label = meta.title || firstTagLabel || id.toUpperCase();
      return {
        id,
        campusId: 'campus_christ_ijk',
        buildingId: prefix === 'outdoor' ? undefined : `bld_${prefix}`,
        floorNumber,
        x: idx * 5,
        y: floorNumber * 4,
        z: 0,
        nodeType: prefix === 'outdoor' ? 'OUTDOOR_PATH' : 'CORRIDOR',
        label,
        accessible: true,
        status: 'ACTIVE',
      };
    };

    const pathNodes = seqIds.map((id, idx) => toNavNode(id, idx));
    const floorTransitions: { fromFloor: number; toFloor: number; via: 'STAIRS' | 'LIFT' | 'RAMP'; atNodeId: string }[] = [];
    for (let i = 0; i < pathNodes.length - 1; i++) {
      if (pathNodes[i].floorNumber !== pathNodes[i + 1].floorNumber) {
        floorTransitions.push({
          fromFloor: pathNodes[i].floorNumber,
          toFloor: pathNodes[i + 1].floorNumber,
          via: 'STAIRS',
          atNodeId: pathNodes[i].id,
        });
      }
    }

    const instructions: Instruction[] = pathNodes.map((n, idx) => ({
      stepNumber: idx + 1,
      text:
        idx === 0
          ? `Start at ${n.label || n.id}.`
          : idx === pathNodes.length - 1
          ? `Arrive at ${n.label || n.id}.`
          : `Proceed to ${n.label || n.id}.`,
      icon: idx === pathNodes.length - 1 ? 'arrive' : 'straight',
      distanceMeters: idx === 0 ? 0 : 5,
      floorNumber: n.floorNumber,
      destinationReached: idx === pathNodes.length - 1,
    }));

    return {
      pathNodes,
      totalDistanceMeters: Math.round(totalDistanceMeters),
      estimatedTimeSeconds: Math.max(10, Math.round(totalDistanceMeters / 1.2) + floorTransitions.length * 15),
      instructions,
      floorTransitions,
      isAccessible: options.accessibleOnly ?? false,
      hasTemporaryClosuresBypassed: false,
    };
  }
}
