import { PanoramaNode, Instruction } from '../../../shared/types';
import { store } from '../db/store';

export interface RoutePanoramaStep {
  stepIndex: number;
  panorama: PanoramaNode;
  instruction: Instruction;
  nextHotspotYaw?: number;
  isStaircaseTransition: boolean;
  isLiftTransition: boolean;
}

export class PanoramaService {
  public static getAll(): PanoramaNode[] {
    return store.getPanoramas();
  }

  public static getById(id: string): PanoramaNode | undefined {
    return store.getPanoramaById(id);
  }

  public static getByNodeId(nodeId: string): PanoramaNode | undefined {
    const panos = store.getPanoramas();
    return panos.find((p) => p.navigationNodeId === nodeId);
  }

  public static getByFloor(floorNumber: number, buildingId?: string): PanoramaNode[] {
    const panos = store.getPanoramas();
    return panos.filter((p) => {
      if (buildingId && p.buildingId !== buildingId) return false;
      return p.floorNumber === floorNumber;
    });
  }

  public static getNeighbors(panoId: string): PanoramaNode[] {
    const pano = this.getById(panoId);
    if (!pano) return [];
    const all = store.getPanoramas();
    const neighborMap = new Set(pano.neighborPanoIds);
    return all.filter((p) => neighborMap.has(p.id));
  }

  /**
   * Transforms a sequential path of navigation node IDs into a connected panorama sequence
   * with exact hotspot viewing yaw angles and transition flags for Street View preview.
   */
  public static mapRouteToPanoramaSequence(
    pathNodeIds: string[],
    instructions: Instruction[] = []
  ): RoutePanoramaStep[] {
    const allPanos = store.getPanoramas();
    const nodeToPano = new Map<string, PanoramaNode>();
    for (const p of allPanos) {
      nodeToPano.set(p.navigationNodeId, p);
    }

    const steps: RoutePanoramaStep[] = [];
    const seenPanoIds = new Set<string>();

    for (let i = 0; i < pathNodeIds.length; i++) {
      const nodeId = pathNodeIds[i];
      const pano = nodeToPano.get(nodeId);
      if (!pano) continue;

      // Avoid immediate duplicate panorama steps in straight node chains
      if (seenPanoIds.has(pano.id) && steps.length > 0 && steps[steps.length - 1].panorama.id === pano.id) {
        continue;
      }
      seenPanoIds.add(pano.id);

      const matchingInstruction = instructions[Math.min(i, instructions.length - 1)] || {
        stepNumber: steps.length + 1,
        text: `Continue through ${pano.name}`,
        icon: 'straight',
        distanceMeters: 10,
        floorNumber: pano.floorNumber,
      };

      steps.push({
        stepIndex: steps.length,
        panorama: pano,
        instruction: matchingInstruction,
        isStaircaseTransition: matchingInstruction.icon === 'stairs-up' || matchingInstruction.icon === 'stairs-down',
        isLiftTransition: matchingInstruction.icon === 'lift',
      });
    }

    // Compute viewing yaw angle towards next step's panorama
    for (let i = 0; i < steps.length - 1; i++) {
      const current = steps[i].panorama;
      const next = steps[i + 1].panorama;
      const hotspot = current.hotspots.find((h) => h.targetPanoId === next.id);
      if (hotspot) {
        steps[i].nextHotspotYaw = hotspot.yaw;
      } else {
        // Fallback bearing computation
        const dx = next.x - current.x;
        const dz = next.z - current.z;
        const rad = Math.atan2(dx, dz);
        let deg = (rad * 180) / Math.PI;
        if (deg < 0) deg += 360;
        steps[i].nextHotspotYaw = Math.round(deg);
      }
    }

    return steps;
  }
}
