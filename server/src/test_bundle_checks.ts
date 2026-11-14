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

// Check for Control Center code exclusion
assert(!bundle.includes('WayCampusControlCenter'), 'Production bundle must not contain WayCampusControlCenter');
assert(!bundle.includes('ReportsSection'), 'Production bundle must not contain ReportsSection');
assert(!bundle.includes('ActivityLogSection'), 'Production bundle must not contain ActivityLogSection');
assert(!bundle.includes('FacultyCredentialsSection'), 'Production bundle must not contain FacultyCredentialsSection');
assert(!bundle.includes('Download Backup (JSON — Hashes Excluded)'), 'Production bundle must not contain Control Center backup actions');

// Check for old studio screen exclusion
assert(!bundle.includes('Manual Panorama Numbering & Arrow Studio'), 'Production bundle must not contain old studio title');
assert(!bundle.includes('Mapping Mode'), 'Production bundle must not contain Mapping Mode');
assert(!bundle.includes('Custom Route Builder'), 'Production bundle must not contain Custom Route Builder');
assert(!bundle.includes('Publish to Render'), 'Production bundle must not contain Publish to Render');
assert(!bundle.includes('PanoramaRouteDebugger'), 'Production bundle must not contain PanoramaRouteDebugger');
assert(!bundle.includes('DirectionValidationDashboard'), 'Production bundle must not contain DirectionValidationDashboard');
assert(!bundle.includes('AdminReportsDashboard'), 'Production bundle must not contain AdminReportsDashboard');
assert(!bundle.includes('FacultyPresenceAdminDashboard'), 'Production bundle must not contain FacultyPresenceAdminDashboard');

console.log('✓ Zero Control Center & old studio components found in production bundle');

console.log('✓ PRODUCTION BUNDLE CROSS-CHECK PASSED');
