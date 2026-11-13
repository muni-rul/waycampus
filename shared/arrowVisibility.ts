export interface ArrowVisibilityParams {
  isRouteActive: boolean;
  spot: {
    targetPanoId?: string;
    yaw: number;
  };
  authoritativeNextNodeId?: string | null;
  nextRouteHotspotYaw?: number;
  currentStepYaw?: number;
}

/**
 * Pure visibility rule for 360 viewer navigation arrows / hotspots.
 * - Normal explore mode (or no route active / route ended / cancelled): render NO arrows (returns false).
 * - Route active: render ONLY arrow(s) that lead along the route to the next node.
 */
export function shouldRenderNavigationArrow(params: ArrowVisibilityParams): boolean {
  if (!params.isRouteActive) {
    return false;
  }
  const { spot, authoritativeNextNodeId, nextRouteHotspotYaw, currentStepYaw } = params;
  if (!spot || !spot.targetPanoId) {
    return false;
  }

  if (authoritativeNextNodeId) {
    return spot.targetPanoId.toLowerCase() === authoritativeNextNodeId.toLowerCase();
  }

  if (nextRouteHotspotYaw !== undefined && Math.abs(spot.yaw - nextRouteHotspotYaw) < 25) {
    return true;
  }

  if (currentStepYaw !== undefined && Math.abs(spot.yaw - currentStepYaw) < 25) {
    return true;
  }

  return false;
}
