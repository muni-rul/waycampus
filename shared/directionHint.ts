export interface DirectionHint {
  action: 'TURN_LEFT' | 'TURN_RIGHT' | 'TURN_AROUND' | 'ON_TRACK';
  label: string;
  side: 'left' | 'right' | null;
  angleDiff: number;
  cameraSpaceX: number;
}

/**
 * Computes the angular difference and camera-space coordinates of the target direction
 * relative to the current camera view.
 *
 * In Three.js world coordinates:
 * - Camera at (0, 0, 0) looks along horizontal angle viewYaw: lookTarget = (sin(viewYaw), 0, cos(viewYaw))
 * - Target world-space direction: targetDir = (sin(targetYaw), 0, cos(targetYaw))
 *
 * Camera space conventions in Three.js (right-handed):
 * - Camera looks down -Z
 * - +X is to the right
 * - -X is to the left
 * - +Z is behind the camera
 *
 * Transformation to camera space:
 * - cameraSpaceX = sin(radViewYaw - radTargetYaw)
 * - cameraSpaceZ = -cos(radTargetYaw - radViewYaw)
 *
 * When cameraSpaceX > 0, target is to the camera's RIGHT.
 * When cameraSpaceX < 0, target is to the camera's LEFT.
 * When cameraSpaceZ > 0, target is BEHIND the camera.
 */
export function computeCameraSpaceDirection(currentYaw: number, targetYaw: number): {
  cameraSpaceX: number;
  cameraSpaceZ: number;
  angleDeg: number;
} {
  const radView = (currentYaw * Math.PI) / 180;
  const radTarget = (targetYaw * Math.PI) / 180;

  const cameraSpaceX = Math.sin(radView - radTarget);
  const cameraSpaceZ = -Math.cos(radTarget - radView);

  let diff = (targetYaw - currentYaw) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  const angleDeg = Math.abs(diff);

  return { cameraSpaceX, cameraSpaceZ, angleDeg };
}

/**
 * Computes the normalized angular difference between the current view yaw and the target path direction.
 * Kept for backwards compatibility.
 */
export function computeAngleDifference(currentYaw: number, targetYaw: number): number {
  if (isNaN(currentYaw) || isNaN(targetYaw)) return 0;
  let diff = (targetYaw - currentYaw) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff === 0 ? 0 : diff;
}

/**
 * Pure direction hint function with hysteresis from a single source of truth:
 * - Camera space x sign determines chip side (x > 0 -> 'right', x < 0 -> 'left').
 * - Target behind camera (cameraSpaceZ > 0) -> "Turn around".
 * - If currently showing a hint (wasShowingHint === true), keep showing until angle difference drops within 35 degrees (hide threshold).
 * - If not currently showing a hint (wasShowingHint === false), only show when angle difference exceeds 50 degrees (show threshold).
 *
 * @param currentYaw The current viewing angle in degrees.
 * @param targetYaw The angle facing the path to the next node in degrees.
 * @param wasShowingHint Prior state for hysteresis.
 * @param showThreshold Degrees to trigger showing hint (default 50).
 * @param hideThreshold Degrees to trigger hiding hint (default 35).
 */
export function getDirectionHintWithHysteresis(
  currentYaw: number,
  targetYaw: number,
  wasShowingHint: boolean = false,
  showThreshold: number = 50,
  hideThreshold: number = 35
): DirectionHint {
  const { cameraSpaceX, cameraSpaceZ, angleDeg } = computeCameraSpaceDirection(currentYaw, targetYaw);

  const shouldBeVisible = wasShowingHint
    ? angleDeg > hideThreshold
    : angleDeg > showThreshold;

  if (!shouldBeVisible) {
    return {
      action: 'ON_TRACK',
      label: 'On track',
      side: null,
      angleDiff: angleDeg,
      cameraSpaceX,
    };
  }

  const side: 'left' | 'right' = cameraSpaceX >= 0 ? 'right' : 'left';

  // Target behind the camera (cameraSpaceZ > 0 corresponds to angle > 90°)
  if (cameraSpaceZ > 0) {
    return {
      action: 'TURN_AROUND',
      label: 'Turn around',
      side,
      angleDiff: angleDeg,
      cameraSpaceX,
    };
  }

  if (side === 'right') {
    return {
      action: 'TURN_RIGHT',
      label: 'Turn right',
      side: 'right',
      angleDiff: angleDeg,
      cameraSpaceX,
    };
  }

  return {
    action: 'TURN_LEFT',
    label: 'Turn left',
    side: 'left',
    angleDiff: angleDeg,
    cameraSpaceX,
  };
}

/** Legacy wrapper maintaining backwards compatibility with threshold parameter */
export function getDirectionHint(
  currentYaw: number,
  targetYaw: number,
  threshold: number = 45
): DirectionHint {
  return getDirectionHintWithHysteresis(currentYaw, targetYaw, false, threshold, threshold);
}
