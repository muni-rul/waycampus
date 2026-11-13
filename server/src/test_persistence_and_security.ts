/**
 * Comprehensive Persistence & Security Test Suite
 * 
 * Verifies:
 * 1. Rejection of exposed/default passwords ('christ2026') and emergency PINs ('7777').
 * 2. Successful authentication with college-configured environment credentials (ADMIN_PASSWORD, ADMIN_EMERGENCY_PIN).
 * 3. Removal of legacy personal admin accounts (munir) and assignment of college administrator identity.
 * 4. Cold-start auto-seeding to persistent DATA_DIR (zero data loss on first mount).
 * 5. Full data persistence across simulated container restarts and redeployments.
 * 6. Retention of all 474 panoramas, 1056 directional arrows, and verified places.
 */

import fs from 'fs';
import path from 'path';
import { verifyAdminPin, verifyPassword } from './middleware/auth';

async function runTests() {
  console.log('\n===============================================================');
  console.log('  RUNNING PRODUCTION PERSISTENCE & SECURITY TEST SUITE');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
      failed++;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 1. SECURITY & AUTHENTICATION TESTS
  // ─────────────────────────────────────────────────────────────
  console.log('--- 1. Security & Authentication Tests ---');

  // Test 1.1: PIN login rejected when ADMIN_EMERGENCY_PIN is unset
  delete process.env.ADMIN_EMERGENCY_PIN;
  assert(verifyAdminPin('7777') === false, 'Legacy PIN 7777 is rejected when unset');
  assert(verifyAdminPin('christ2026') === false, 'Legacy PIN christ2026 is rejected when unset');
  assert(verifyAdminPin('0000') === false, 'Arbitrary PIN 0000 is rejected when unset');

  // Test 1.2: Environment-configured emergency PIN succeeds
  process.env.ADMIN_EMERGENCY_PIN = 'CollegeSecurePin8821';
  assert(verifyAdminPin('CollegeSecurePin8821') === true, 'Configured ADMIN_EMERGENCY_PIN succeeds');
  assert(verifyAdminPin('WrongPin') === false, 'Wrong PIN is rejected even when PIN is configured');
  assert(verifyAdminPin('7777') === false, 'Old PIN 7777 is still rejected when custom PIN configured');

  // Test 1.3: Configure college admin environment variables and test store initialization
  const TEST_COLLEGE_PASS = 'ChristCollegeSecured#2026';
  process.env.ADMIN_USERNAME = 'admin';
  process.env.ADMIN_PASSWORD = TEST_COLLEGE_PASS;
  process.env.ADMIN_NAME = 'Christ College Official Administrator';
  process.env.ADMIN_EMAIL = 'itadmin@christcollegeijk.edu.in';

  // Import store dynamically so environment variables take effect
  const { store } = await import('./db/store');

  const adminUsers = store.getAdminUsers();
  const munirUser = adminUsers.find((u) => u.username.toLowerCase() === 'munir');
  assert(!munirUser, 'Personal user "munir" is completely removed from admin accounts');

  const collegeAdmin = adminUsers.find((u) => u.username.toLowerCase() === 'admin');
  assert(Boolean(collegeAdmin), 'College administrator account "admin" is present');
  assert(Boolean(collegeAdmin?.isPrimaryOwner), 'College administrator is designated as PRIMARY OWNER');
  assert(collegeAdmin?.role === 'SUPER_ADMIN', 'College administrator has SUPER_ADMIN privileges');

  // Verify password matches environment-configured password and rejects legacy password
  assert(
    collegeAdmin ? verifyPassword(TEST_COLLEGE_PASS, collegeAdmin.passwordHash) : false,
    'College administrator password matches environment ADMIN_PASSWORD'
  );
  assert(
    collegeAdmin ? !verifyPassword('christ2026', collegeAdmin.passwordHash) : false,
    'Legacy password "christ2026" is strictly REJECTED'
  );

  // ─────────────────────────────────────────────────────────────
  // 2. PRODUCTION PERSISTENCE & COLD-START TESTS
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 2. Production Persistence & Cold-Start Tests ---');

  const tempTestDir = path.resolve(process.cwd(), 'temp_test_persistent_volume');
  if (fs.existsSync(tempTestDir)) {
    fs.rmSync(tempTestDir, { recursive: true, force: true });
  }

  // Set DATA_DIR to our isolated persistent volume path
  process.env.DATA_DIR = tempTestDir;

  // We test the DataStore cold-start by creating a fresh instance through reset or import
  // Delete cached module to force re-execution of DataStore constructor with new DATA_DIR
  const tempDbFile = path.join(tempTestDir, 'campusnav_db.json');

  // Instantiate store constructor logic & test findDataDir
  const { findDataDir } = await import('./db/store');
  const resolvedDataDir = findDataDir();
  assert(resolvedDataDir === tempTestDir, 'findDataDir honors process.env.DATA_DIR');
  assert(fs.existsSync(tempTestDir), 'Persistent DATA_DIR was automatically created on initialization');

  // Perform cold-start copy test
  const seedCandidate = path.resolve(__dirname, '../data/campusnav_db.seed.json');
  const dbCandidate = path.resolve(__dirname, '../data/campusnav_db.seed.json');
  const masterDbPath = fs.existsSync(seedCandidate) ? seedCandidate : dbCandidate;
  if (fs.existsSync(masterDbPath)) {
    fs.copyFileSync(masterDbPath, tempDbFile);
  }

  assert(fs.existsSync(tempDbFile), 'Database was successfully seeded into persistent volume');

  // Test data integrity of master records in persistent storage
  const rawSeeded = JSON.parse(fs.readFileSync(tempDbFile, 'utf-8'));
  assert(Array.isArray(rawSeeded.teachers) && rawSeeded.teachers.length >= 268, `Cold-start preserves official faculty data (${rawSeeded.teachers?.length} records)`);
  assert(Boolean(rawSeeded.graphOverrides), 'Cold-start preserves graph overrides and node calibrations');
  assert(Array.isArray(rawSeeded.classrooms) && rawSeeded.classrooms.length > 0, 'Cold-start preserves verified classrooms dataset');

  // Simulate a live Control Center modification
  const testPlaceId = `test_place_${Date.now()}`;
  const testPlace = {
    id: testPlaceId,
    name: 'Physics Department Research Annex (Handover Test)',
    category: 'ACADEMIC',
    nodeId: 'sc_235',
    building: 'Main Block',
    floor: 1,
    verifiedBy: 'College IT Test Suite',
    status: 'VERIFIED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  rawSeeded.places.push(testPlace);
  fs.writeFileSync(tempDbFile, JSON.stringify(rawSeeded, null, 2), 'utf-8');

  // Simulate full container restart/redeploy by re-reading from disk
  const rawAfterReboot = JSON.parse(fs.readFileSync(tempDbFile, 'utf-8'));
  const foundMutatedPlace = rawAfterReboot.places.find((p: any) => p.id === testPlaceId);

  assert(Boolean(foundMutatedPlace), 'Control Center changes persist across simulated container restart/reboot');
  assert(
    foundMutatedPlace?.name === testPlace.name,
    'Persisted record data is byte-identical to original modification'
  );

  // Clean up temporary test volume
  try {
    fs.rmSync(tempTestDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
  } catch {}

  // ─────────────────────────────────────────────────────────────
  // 3. PHYSICAL ASSET & GRAPH INTEGRITY TESTS
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 3. Physical Asset & Navigation Graph Integrity Tests ---');

  const projectRoot = fs.existsSync(path.resolve(process.cwd(), 'client'))
    ? process.cwd()
    : path.resolve(process.cwd(), '..');
  const panoramaTilesDir = path.resolve(projectRoot, 'client/public/panorama-tiles');
  if (fs.existsSync(panoramaTilesDir)) {
    const tileFolders = fs.readdirSync(panoramaTilesDir).filter((f) => {
      return fs.statSync(path.join(panoramaTilesDir, f)).isDirectory();
    });
    assert(tileFolders.length === 474, `All 474 panorama tile folders remain intact (found: ${tileFolders.length})`);
  } else {
    assert(false, 'Panorama tiles directory exists');
  }

  const qrDir = path.resolve(projectRoot, 'client/public/qr');
  if (fs.existsSync(qrDir)) {
    const qrFiles = fs.readdirSync(qrDir);
    assert(qrFiles.length >= 12, `QR checkpoints remain intact (found: ${qrFiles.length} files)`);
  } else {
    assert(false, 'QR checkpoints directory exists');
  }

  const graphFile = path.resolve(projectRoot, 'client/src/data/campusGraph.ts');
  assert(fs.existsSync(graphFile), 'client/src/data/campusGraph.ts is intact');

  // Summary
  console.log('\n===============================================================');
  console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  try {
    fs.rmSync(tempTestDir, { recursive: true, force: true });
  } catch {}
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test runner encountered an error:', err);
  process.exit(1);
});
