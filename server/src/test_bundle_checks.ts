import assert from 'assert';
import fs from 'fs';
import path from 'path';

console.log('=== RUNNING PRODUCTION BUNDLE CROSS-CHECK ===');

const distDir = path.resolve(__dirname, '../../client/dist');
const assetsDir = path.join(distDir, 'assets');

// 1. Source maps: verify zero .map files
const allFiles = fs.readdirSync(assetsDir);
const mapFiles = allFiles.filter(f => f.endsWith('.map'));
console.log('Source map files found:', mapFiles.length);
assert.strictEqual(mapFiles.length, 0, 'Production bundle must not contain source maps (.map files)');

// 2. Read the JS bundle
const jsFile = allFiles.find(f => f.endsWith('.js'));
assert(jsFile, 'Must find production JS bundle');
const bundlePath = path.join(assetsDir, jsFile);
const bundle = fs.readFileSync(bundlePath, 'utf8');

// Check for Firebase client SDK
const hasFirebaseSdk = bundle.includes('initializeApp') && bundle.includes('getFirestore');
console.log('Has Firebase client SDK:', hasFirebaseSdk);
assert(!hasFirebaseSdk, 'Production bundle must not contain Firebase client SDK');

// Check for debug button / sections
assert(!bundle.includes('DESTINATION ALIGNMENT DEBUG OVERLAY'), 'Must not contain destination debug overlay');

console.log('✓ PRODUCTION BUNDLE CROSS-CHECK PASSED');
