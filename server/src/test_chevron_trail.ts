import assert from 'assert';
// @ts-ignore
import * as THREE from '../../client/node_modules/three';
import { computeChevronTrail, computeChevronTransform } from '../../shared/chevronTrail';

console.log('=== RUNNING CHEVRON TRAIL & ORIENTATION TESTS ===');

// 1. CHEVRON CONSTANTS ASSERTION
{
  const expectedDistances = [130, 165, 200, 235];
  const expectedPitches = [-22, -18, -15, -12];
  const expectedScales = [1.0, 0.88, 0.76, 0.64];
  const expectedOpacities = [0.95, 0.78, 0.60, 0.42];

  const trail = computeChevronTrail({ yaw: 0, reducedMotion: true });
  assert.strictEqual(trail.length, 4, 'Must have exactly 4 chevrons');

  for (let i = 0; i < 4; i++) {
    assert.strictEqual(trail[i].distance, expectedDistances[i], `Chevron ${i} distance must be ${expectedDistances[i]}`);
    assert.strictEqual(trail[i].pitch, expectedPitches[i], `Chevron ${i} pitch must be ${expectedPitches[i]}`);
    assert(Math.abs(trail[i].scale - expectedScales[i]) < 1e-4, `Chevron ${i} scale must be ${expectedScales[i]}`);
    assert(Math.abs(trail[i].opacity - expectedOpacities[i]) < 1e-4, `Chevron ${i} opacity must be ${expectedOpacities[i]}`);
  }
  console.log('✓ Restored constants verified: distances [130, 165, 200, 235], pitches [-22, -18, -15, -12], scales [1.0, 0.88, 0.76, 0.64], opacities [0.95, 0.78, 0.60, 0.42]');
}

// 2. CHEVRON ORIENTATION & GROUND DIRECTION (28° ground tilt)
{
  const testYaws = [0, 90, 180, 270, 33.7, 142.1, 215.8, 305.4, 359.2];
  const localApexAxis = new THREE.Vector3(0, 1, 0); // Local apex of PlaneGeometry (+Y in local space)

  for (const yaw of testYaws) {
    const transform = computeChevronTransform(yaw, 28);
    const rotMatrix = new THREE.Matrix4().fromArray(transform.elements);

    // Apply transform to chevron local apex axis using Three.js Vector3 / Matrix4
    const worldApex = localApexAxis.clone().applyMatrix4(rotMatrix);

    // Ground direction: projected onto the horizontal X-Z plane and normalized
    const groundDir = new THREE.Vector3(worldApex.x, 0, worldApex.z).normalize();

    // Expected route direction: (sin(yaw), 0, cos(yaw))
    const radYaw = THREE.MathUtils.degToRad(yaw);
    const routeDir = new THREE.Vector3(Math.sin(radYaw), 0, Math.cos(radYaw)).normalize();

    const dot = groundDir.dot(routeDir);
    console.log(`Yaw ${yaw}°: groundDir.dot(routeDir) = ${dot.toFixed(6)}`);
    assert(
      dot > 0.99,
      `Ground direction must equal route direction (dot > 0.99). Got dot=${dot} for yaw=${yaw}`
    );

    // Front face normal (zAxis) must point upward towards the camera (y > 0)
    assert(
      transform.zAxis.y > 0,
      `Chevron front face normal must point upward towards camera (zAxis.y > 0). Got ${transform.zAxis.y}`
    );
  }
  console.log('✓ All chevron orientations point along route direction (dot > 0.99) at 28° tilt');
}

// 3. MONOTONIC PROGRESSIONS & REDUCED MOTION DETERMINISM
{
  const trailStatic = computeChevronTrail({ yaw: 90, reducedMotion: true });

  // Monotonic distance progression
  for (let i = 0; i < trailStatic.length - 1; i++) {
    assert(
      trailStatic[i].distance < trailStatic[i + 1].distance,
      `Distance must increase with index (${trailStatic[i].distance} < ${trailStatic[i + 1].distance})`
    );
  }

  // Monotonic scale progression
  for (let i = 0; i < trailStatic.length - 1; i++) {
    assert(
      trailStatic[i].scale > trailStatic[i + 1].scale,
      `Scale must decrease with distance (${trailStatic[i].scale} > ${trailStatic[i + 1].scale})`
    );
  }

  // Monotonic base opacity fade
  for (let i = 0; i < trailStatic.length - 1; i++) {
    assert(
      trailStatic[i].opacity > trailStatic[i + 1].opacity,
      `Opacity must fade with distance (${trailStatic[i].opacity} > ${trailStatic[i + 1].opacity})`
    );
  }

  // Reduced motion determinism
  const t1 = computeChevronTrail({ yaw: 0, timeSeconds: 0, reducedMotion: true });
  const t2 = computeChevronTrail({ yaw: 0, timeSeconds: 0.6, reducedMotion: true });
  const t3 = computeChevronTrail({ yaw: 0, timeSeconds: 1.2, reducedMotion: true });
  for (let i = 0; i < 4; i++) {
    assert.strictEqual(t1[i].opacity, t2[i].opacity);
    assert.strictEqual(t2[i].opacity, t3[i].opacity);
  }

  // Soft forward ripple over 1.2s cycle
  const anim0 = computeChevronTrail({ yaw: 0, timeSeconds: 0.0, reducedMotion: false });
  const anim1 = computeChevronTrail({ yaw: 0, timeSeconds: 0.3, reducedMotion: false });
  const animVaries = anim0.some((el, i) => Math.abs(el.opacity - anim1[i].opacity) > 0.001);
  assert(animVaries, 'Opacities must softly ripple over time when reducedMotion is false');

  console.log('✓ Monotonic progressions and 1.2s ripple cycle verified');
}

console.log('✓ ALL CHEVRON TRAIL TESTS PASSED');
