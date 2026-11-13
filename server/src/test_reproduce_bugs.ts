import assert from 'assert';
// @ts-ignore
import * as THREE from '../../client/node_modules/three';
import { computeChevronTrail, computeChevronTransform } from '../../shared/chevronTrail';
import { getDirectionHintWithHysteresis } from '../../shared/directionHint';

console.log('=== RUNNING BUG REPRODUCTION & FIX VERIFICATION ===');

// Bug 1: Chevron orientation fix (apex points along route)
console.log('\n--- Bug 1: Chevron orientation (apex along route, 28° tilt) ---');
{
  const spotYaw = 0;
  const radYaw = THREE.MathUtils.degToRad(spotYaw);

  // New Fixed Transform (28° ground tilt)
  const fixedTransform = computeChevronTransform(spotYaw, 28);
  const newRotMatrix = new THREE.Matrix4().fromArray(fixedTransform.elements);

  const trail = computeChevronTrail({ yaw: 0 });
  const chevron0 = trail[0];
  const radP = THREE.MathUtils.degToRad(chevron0.pitch);
  const chevron0Pos = new THREE.Vector3(0, chevron0.distance * Math.sin(radP), chevron0.distance * Math.cos(radP));

  // Assert apex ground direction matches route direction
  const localApex = new THREE.Vector3(0, 1, 0);
  const worldApex = localApex.clone().applyMatrix4(newRotMatrix);
  const groundDir = new THREE.Vector3(worldApex.x, 0, worldApex.z).normalize();
  const routeDir = new THREE.Vector3(Math.sin(radYaw), 0, Math.cos(radYaw)).normalize();
  const dot = groundDir.dot(routeDir);
  console.log(`Apex ground direction dot product with route direction: ${dot.toFixed(6)}`);
  assert(dot > 0.99, 'Apex ground direction must equal route direction (dot > 0.99)');
  assert(fixedTransform.zAxis.y > 0, 'Front face normal must point upward towards camera');
  console.log('✓ Chevron apex points along route away from camera with upward front normal');
}

console.log('\n--- Bug 3: Direction chip side calculation ---');
{
  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 1, 1100);
  camera.position.set(0, 0, 0);
  const radLon = THREE.MathUtils.degToRad(350);
  camera.lookAt(500 * Math.sin(radLon), 0, 500 * Math.cos(radLon));
  camera.updateMatrixWorld();

  const targetRad = THREE.MathUtils.degToRad(40);
  const targetWorld = new THREE.Vector3(Math.sin(targetRad), 0, Math.cos(targetRad)).normalize();
  const targetScreen = targetWorld.clone().project(camera);
  console.log(`Target screen X for (view 350, target 40): ${targetScreen.x.toFixed(4)} (negative = left)`);

  const hint = getDirectionHintWithHysteresis(350, 40, true, 50, 35);
  console.log(`Direction hint action: ${hint.action}, side: ${hint.side}`);

  assert.strictEqual(
    hint.side,
    targetScreen.x > 0 ? 'right' : 'left',
    `Direction chip says ${hint.side} matching target screen side ${targetScreen.x > 0 ? 'right' : 'left'}`
  );
  assert.strictEqual(hint.side, 'left');
}

console.log('\n✓ ALL REPRODUCING TESTS PASS WITH CURRENT FIXES!');
