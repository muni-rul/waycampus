export interface ChevronTrailElement {
  index: number;
  // Spatial offset relative to camera base position (0 is closest, 3 is furthest forward)
  distance: number;
  pitch: number;
  scale: number;
  opacity: number;
}

export interface ChevronTrailParams {
  yaw: number;
  count?: number; // Defaults to 4
  timeSeconds?: number;
  reducedMotion?: boolean;
}

export interface ChevronTransform {
  xAxis: { x: number; y: number; z: number };
  yAxis: { x: number; y: number; z: number };
  zAxis: { x: number; y: number; z: number };
  elements: number[];
}

/**
 * Pure function computing the 3D ground orientation transform for a chevron plane.
 *
 * Requirements:
 * - Local apex axis (0, 1, 0) transforms such that its horizontal ground projection
 *   matches the route forward vector (sin(yaw), 0, cos(yaw)) with dot product > 0.99.
 * - Front face normal (zAxis) points upward towards the camera (y > 0) so the front face
 *   is rendered rather than back face.
 * - yAxis tilts 28° up towards camera eye level for clean perspective viewing.
 */
export function computeChevronTransform(yawDeg: number, tiltDeg: number = 28): ChevronTransform {
  const radYaw = (yawDeg * Math.PI) / 180;
  const tiltRad = (tiltDeg * Math.PI) / 180;

  // Route ground direction
  const fX = Math.sin(radYaw);
  const fZ = Math.cos(radYaw);

  // Plane right vector: xAxis = forward x up(0, 1, 0) = (-cos(radYaw), 0, sin(radYaw))
  const xX = -fZ;
  const xY = 0;
  const xZ = fX;

  // yAxis: tilted forward vector (apex points along yAxis)
  const cosT = Math.cos(tiltRad);
  const sinT = Math.sin(tiltRad);
  const yX = fX * cosT;
  const yY = sinT;
  const yZ = fZ * cosT;

  // zAxis: tilted normal (xAxis x yAxis)
  const zX = -fX * sinT;
  const zY = cosT;
  const zZ = -fZ * sinT;

  // Three.js 4x4 matrix elements in column-major order
  const elements = [
    xX, xY, xZ, 0,
    yX, yY, yZ, 0,
    zX, zY, zZ, 0,
    0, 0, 0, 1
  ];

  return {
    xAxis: { x: xX, y: xY, z: xZ },
    yAxis: { x: yX, y: yY, z: yZ },
    zAxis: { x: zX, y: zY, z: zZ },
    elements
  };
}

/**
 * Pure function computing layout and animation properties for the 4-chevron ground trail.
 *
 * Restored properties:
 * - Exactly 4 chevrons along the travel vector.
 * - Base distances: [130, 165, 200, 235]
 * - Base pitches: [-22, -18, -15, -12]
 * - Base scales: [1.0, 0.88, 0.76, 0.64]
 * - Base opacities: [0.95, 0.78, 0.60, 0.42]
 * - Soft forward ripple (cycle: 1.2 s) when reducedMotion is false.
 * - Deterministic static opacities when reducedMotion is true.
 */
export function computeChevronTrail(params: ChevronTrailParams): ChevronTrailElement[] {
  const count = params.count ?? 4;
  const reducedMotion = Boolean(params.reducedMotion);
  const time = params.timeSeconds ?? 0;
  const cycle = 1.2; // 1.2s wave period

  const elements: ChevronTrailElement[] = [];

  const baseDistances = [130, 165, 200, 235];
  const basePitches = [-22, -18, -15, -12];
  const baseScales = [1.0, 0.88, 0.76, 0.64];
  const baseOpacities = [0.95, 0.78, 0.60, 0.42];

  for (let i = 0; i < count; i++) {
    const dist = baseDistances[i] ?? (130 + i * 35);
    const pitch = basePitches[i] ?? (-22 + i * 3.3);
    const scale = baseScales[i] ?? Math.max(0.3, 1.0 - i * 0.12);
    let opacity = baseOpacities[i] ?? Math.max(0.1, 0.95 - i * 0.18);

    if (!reducedMotion && cycle > 0) {
      // Soft forward ripple: wave traveling outward from chevron 0 to chevron 3
      const phase = ((time % cycle) / cycle) * 2 * Math.PI;
      const ripple = Math.sin(phase - i * 0.75);
      // Modulate opacity softly (+- 0.15), keeping within [0.15, 1.0]
      opacity = Math.max(0.15, Math.min(1.0, opacity + ripple * 0.15));
    }

    elements.push({
      index: i,
      distance: dist,
      pitch,
      scale,
      opacity,
    });
  }

  return elements;
}
