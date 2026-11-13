import assert from 'assert';
import { formatRemainingSteps } from '../../shared/stepWording';

console.log('=== RUNNING STEP WORDING TESTS ===');

// 1. Multiple steps left
assert.strictEqual(formatRemainingSteps(10), '10 steps left');
assert.strictEqual(formatRemainingSteps(5), '5 steps left');
assert.strictEqual(formatRemainingSteps(2), '2 steps left');

// 2. Exactly 1 step left
assert.strictEqual(formatRemainingSteps(1), '1 step left');

// 3. 0 steps left (current step is the final approach)
assert.strictEqual(formatRemainingSteps(0), 'Last step');

// 4. Arriving / negative / isArrived flag
assert.strictEqual(formatRemainingSteps(0, true), 'Arriving');
assert.strictEqual(formatRemainingSteps(1, true), 'Arriving');
assert.strictEqual(formatRemainingSteps(-1), 'Arriving');

console.log('✓ ALL STEP WORDING TESTS PASSED');
