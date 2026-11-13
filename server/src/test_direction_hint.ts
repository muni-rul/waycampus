import assert from 'assert';
// @ts-ignore
import * as THREE from '../../client/node_modules/three';
import {
  computeAngleDifference,
  computeCameraSpaceDirection,
  getDirectionHint,
  getDirectionHintWithHysteresis,
} from '../../shared/directionHint';
import { computeChevronTrail } from '../../shared/chevronTrail';

console.log('=== RUNNING DIRECTION HINT & CAMERA SPACE TESTS ===');

// Helper to create viewer's Three.js camera given viewYaw
function createViewerCamera(viewYaw: number, viewPitch: number = 0, fov: number = 62, aspect: number = 16 / 9): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(fov, aspect, 1, 1100);
  camera.position.set(0, 0, 0);
  const radLon = THREE.MathUtils.degToRad(viewYaw);
  const radLat = THREE.MathUtils.degToRad(viewPitch);
  camera.lookAt(
    500 * Math.cos(radLat) * Math.sin(radLon),
    500 * Math.sin(radLat),
    500 * Math.cos(radLat) * Math.cos(radLon)
  );
  camera.updateMatrixWorld();
  return camera;
}

// 1. CHIP SIDE ASSERTION ON MANDATORY YAW PAIRS (Item 3)
// "Verification: a test using the viewer's real conventions asserts the side for yaw pairs
// including wrap-around cases (for example view 10, target 300; view 350, target 40;
// view 90, target 10; view 90, target 200)"
{
  const mandatoryPairs = [
    { view: 10, target: 300, expectedSide: 'right', expectedAction: 'TURN_RIGHT' },
    { view: 350, target: 40, expectedSide: 'left', expectedAction: 'TURN_LEFT', wasShowing: true },
    { view: 90, target: 10, expectedSide: 'right', expectedAction: 'TURN_RIGHT' },
    { view: 90, target: 200, expectedSide: 'left', expectedAction: 'TURN_AROUND' },
  ];

  for (const { view, target, expectedSide, expectedAction, wasShowing } of mandatoryPairs) {
    // 1. Calculate with shared pure function
    const hint = getDirectionHintWithHysteresis(view, target, wasShowing ?? false, 50, 35);

    // 2. Calculate directly with Three.js camera
    const camera = createViewerCamera(view);
    const radT = THREE.MathUtils.degToRad(target);
    const targetWorld = new THREE.Vector3(Math.sin(radT), 0, Math.cos(radT)).normalize();
    const targetCam = targetWorld.clone().applyMatrix4(camera.matrixWorldInverse);
    const threeSide = targetCam.x >= 0 ? 'right' : 'left';

    console.log(
      `Pair (view ${view}°, target ${target}°): hint.side=${hint.side}, hint.action=${hint.action}, cameraSpaceX=${targetCam.x.toFixed(3)}`
    );

    assert.strictEqual(
      hint.side,
      expectedSide,
      `Expected side '${expectedSide}' for pair (view ${view}, target ${target}), got '${hint.side}'`
    );

    assert.strictEqual(
      hint.action,
      expectedAction,
      `Expected action '${expectedAction}' for pair (view ${view}, target ${target}), got '${hint.action}'`
    );

    assert.strictEqual(
      hint.side,
      threeSide,
      `Hint side must match Three.js camera space x sign side for pair (view ${view}, target ${target})`
    );
  }
  console.log('✓ Item 3: All mandatory yaw pairs correctly resolve side and action');
}

// 2. SINGLE SOURCE OF TRUTH: CHIP SIDE EQUALS CHEVRON TRAIL SCREEN SIDE (Item 3)
// "and a test that the chip side equals the screen side where the chevron trail is rendered."
{
  const testScenarios = [
    { view: 0, target: 60 },
    { view: 0, target: 300 },
    { view: 45, target: 120 },
    { view: 180, target: 120 },
    { view: 270, target: 200 },
    { view: 350, target: 50 },
    { view: 15, target: 330, wasShowing: true },
    { view: 20, target: 290 },
  ];

  for (const { view, target, wasShowing } of testScenarios) {
    const camera = createViewerCamera(view, 0, 62, 16 / 9);

    // Chevron trail is placed along target direction in world space
    const trail = computeChevronTrail({ yaw: target });
    const radP = THREE.MathUtils.degToRad(trail[0].pitch);
    const radT = THREE.MathUtils.degToRad(target);
    const chevronWorldPos = new THREE.Vector3(
      trail[0].distance * Math.cos(radP) * Math.sin(radT),
      trail[0].distance * Math.sin(radP),
      trail[0].distance * Math.cos(radP) * Math.cos(radT)
    );

    // Chevron projected screen position (NDC X: < 0 is screen left, > 0 is screen right)
    const chevronScreenPos = chevronWorldPos.clone().project(camera);
    const chevronScreenSide: 'left' | 'right' = chevronScreenPos.x >= 0 ? 'right' : 'left';

    // Direction hint computation
    const hint = getDirectionHintWithHysteresis(view, target, wasShowing ?? false, 50, 35);

    console.log(
      `Scenario (view ${view}°, target ${target}°): hint.side=${hint.side}, chevronScreenSide=${chevronScreenSide}, screenX=${chevronScreenPos.x.toFixed(3)}`
    );

    assert.strictEqual(
      hint.side,
      chevronScreenSide,
      `Direction chip side (${hint.side}) must equal chevron trail screen side (${chevronScreenSide})`
    );
  }
  console.log('✓ Item 3: Chip side strictly equals rendered chevron trail screen side');
}

// 3. HYSTERESIS BOUNDARIES (50° show, 35° hide)
{
  // When previously not showing hint:
  // At 40 deg (>35 but <=50) -> ON_TRACK
  const h1 = getDirectionHintWithHysteresis(0, 40, false, 50, 35);
  assert.strictEqual(h1.action, 'ON_TRACK');
  assert.strictEqual(h1.side, null);

  // At 50 deg -> ON_TRACK (threshold boundary)
  const h2 = getDirectionHintWithHysteresis(0, 50, false, 50, 35);
  assert.strictEqual(h2.action, 'ON_TRACK');

  // At 51 deg -> triggers hint! (target 51 is screen left in Three.js coordinates: sin(0 - 51) < 0)
  const h3 = getDirectionHintWithHysteresis(0, 51, false, 50, 35);
  assert.strictEqual(h3.action, 'TURN_LEFT');
  assert.strictEqual(h3.side, 'left');

  // When previously showing hint:
  // At 45 deg (<=50 but >35) -> stays showing (prevents flicker!)
  const h4 = getDirectionHintWithHysteresis(0, 45, true, 50, 35);
  assert.strictEqual(h4.action, 'TURN_LEFT');
  assert.strictEqual(h4.side, 'left');

  // At 35 deg -> hides (hide boundary)
  const h5 = getDirectionHintWithHysteresis(0, 35, true, 50, 35);
  assert.strictEqual(h5.action, 'ON_TRACK');

  // At 20 deg -> stays hidden
  const h6 = getDirectionHintWithHysteresis(0, 20, true, 50, 35);
  assert.strictEqual(h6.action, 'ON_TRACK');

  console.log('✓ Item 3: 50° / 35° hysteresis boundaries verified');
}

// 4. BEHIND CAMERA DETECTION -> TURN_AROUND
{
  // Target directly behind (180 deg)
  const hBehind = getDirectionHintWithHysteresis(0, 180, false, 50, 35);
  assert.strictEqual(hBehind.action, 'TURN_AROUND');
  assert.strictEqual(hBehind.label, 'Turn around');

  // Target 150 deg away (cameraSpaceZ > 0)
  const hBehind2 = getDirectionHintWithHysteresis(0, 150, false, 50, 35);
  assert.strictEqual(hBehind2.action, 'TURN_AROUND');
  assert.strictEqual(hBehind2.label, 'Turn around');

  console.log('✓ Item 3: Target behind camera resolves to TURN_AROUND');
}

console.log('✓ ALL DIRECTION HINT & CAMERA SPACE TESTS PASSED');
