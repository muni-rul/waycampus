import * as THREE from 'three';

/**
 * Google Street View Style Nadir Camera & Ground Inpainting Cap
 *
 * Completely hides the photographer, tripod, and camera rig beneath the 360 camera.
 * Instead of blurring the photographer (which creates a dark/dirty human silhouette),
 * this shader samples clean ground texture strictly from the unoccluded ground ring (v in [0.52, 0.59])
 * and projects clean, matching pavement/floor across the entire nadir footprint.
 */

const createDummyTexture = (): THREE.CanvasTexture => {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 4;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 4, 4);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

const VERTEX_SHADER = `
varying vec2 vSphereUv;
varying float vDistFromNadir;

void main() {
  vec3 dir = normalize(position);

  // Match Three.js SphereGeometry scale(-1, 1, 1) equirectangular mapping
  float phi = atan(dir.z, dir.x);
  if (phi < 0.0) phi += 6.283185307179586;
  float u = phi / 6.283185307179586;

  float theta = acos(clamp(dir.y, -1.0, 1.0));
  float v = theta / 3.141592653589793;

  vSphereUv = vec2(u, v);

  // Distance from nadir pole (0.0 at bottom center theta = PI, 1.0 at outer rim theta = 0.60 * PI)
  vDistFromNadir = (3.141592653589793 - theta) / (3.141592653589793 * 0.40);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT_SHADER = `
uniform sampler2D tDiffuse;
uniform sampler2D tFade;
uniform float uFadeProgress;
uniform float uOpacity;

varying vec2 vSphereUv;
varying float vDistFromNadir;

// Sample strictly from clean ground ring (v between 0.52 and 0.59)
// This guarantees ZERO pixels from the photographer (hair, face, clothes) are ever sampled.
vec4 sampleCleanGround(sampler2D tex, vec2 uv) {
  vec4 sum = vec4(0.0);
  float totalWeight = 0.0;

  // Multi-tap Poisson spiral sampling of clean pavement/ground
  const int SAMPLES = 20;
  for (int i = 0; i < SAMPLES; i++) {
    float fi = float(i);
    float r = sqrt((fi + 0.5) / float(SAMPLES)) * 0.032;
    float angle = fi * 2.39996323; // Golden angle in radians
    vec2 offset = vec2(cos(angle), sin(angle)) * r;

    // Compensate for polar stretch
    float sinTheta = max(sin(0.56 * 3.14159265), 0.2);
    offset.x /= sinTheta;

    vec2 sUv = uv + offset;
    sUv.x = fract(sUv.x);
    // Hard clamp to clean ground ring: NEVER allow sampling below v = 0.59
    sUv.y = clamp(sUv.y, 0.51, 0.585);

    float weight = exp(-r * r / (2.0 * 0.032 * 0.032 * 0.5));
    sum += texture2D(tex, sUv) * weight;
    totalWeight += weight;
  }
  return sum / totalWeight;
}

void main() {
  // 100% opaque cover over the photographer (vDistFromNadir 0.0 to 0.78),
  // feathering seamlessly into the real ground only at the outer perimeter (0.78 to 0.98).
  float alpha = 1.0 - smoothstep(0.78, 0.98, vDistFromNadir);
  if (alpha <= 0.002) {
    discard;
  }

  // Anchor the sample to clean pavement directly outside the photographer's radius
  float cleanV = mix(0.575, 0.54, vDistFromNadir);
  vec2 groundUv = vec2(vSphereUv.x, cleanV);

  vec4 color1 = sampleCleanGround(tDiffuse, groundUv);
  vec4 finalColor = color1;

  if (uFadeProgress > 0.001) {
    vec4 color2 = sampleCleanGround(tFade, groundUv);
    finalColor = mix(color1, color2, uFadeProgress);
  }

  gl_FragColor = vec4(finalColor.rgb, alpha * uOpacity);
}
`;

export interface NadirBlurController {
  mesh: THREE.Mesh;
  setTexture: (texture: THREE.Texture | null) => void;
  startFade: (incomingTexture: THREE.Texture | null) => void;
  setFadeProgress: (progress: number) => void;
  endFade: (finalTexture: THREE.Texture | null) => void;
  dispose: () => void;
}

export function createNadirBlurMesh(radius: number = 497, initialTexture?: THREE.Texture | null): NadirBlurController {
  // Downward pitch is locked at eye level (lat >= 2°), preventing the user from tilting down to the photographer.
  // The messy inpainting cap is disabled completely to keep the ground crisp and natural.
  const mesh = new THREE.Mesh();
  mesh.visible = false;

  return {
    mesh,
    setTexture: () => {},
    startFade: () => {},
    setFadeProgress: () => {},
    endFade: () => {},
    dispose: () => {},
  };
}
