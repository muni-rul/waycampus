import os from 'os';
import path from 'path';
import fs from 'fs';

// ISOLATED TEST FIXTURE: ensure test mutations NEVER write to live database
const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'campnav-test-fac-'));
const repoRoot = path.resolve(__dirname, process.cwd().endsWith('server') ? '..' : '.');
const seedFile = path.join(repoRoot, 'server/data/campusnav_db.seed.json');
const dbFile = path.join(repoRoot, 'server/data/campusnav_db.json');
const sourceFile = fs.existsSync(seedFile) ? seedFile : dbFile;
if (fs.existsSync(sourceFile)) {
  fs.copyFileSync(sourceFile, path.join(testDataDir, 'campusnav_db.json'));
}
process.env.DATA_DIR = testDataDir;
process.env.ADMIN_EMERGENCY_PIN = 'TestEmergencyPin2026!';
process.env.ADMIN_PASSWORD = 'TestAdminPassword2026!';

import express from 'express';
import http from 'http';
import { apiRouter } from './routes/api';
import { store } from './db/store';

async function runTests() {
  console.log('=== STARTING FACULTY STATUS SYSTEM E2E TESTS ===\n');

  const app = express();
  app.use(express.json());
  app.use('/api/v1', apiRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;
  console.log(`Test server running on ${baseUrl}`);

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: any) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`, detail || '');
      failed++;
    }
  }

  try {
    // TEST 1: Public status query for existing teacher
    const teachers = store.getTeachers();
    const testTeacher = teachers.find((t) => t.id === 'fac_francy_unaided') || teachers[0];
    assert(!!testTeacher, 'Test fixture teacher found in dataset');

    const res1 = await fetch(`${baseUrl}/faculty/${testTeacher.id}/status`);
    const data1 = await res1.json();
    assert(res1.status === 200, 'Public faculty status endpoint returns 200 OK');
    assert(data1.success === true, 'Response contains success: true');
    assert(data1.status && data1.status.facultyId === testTeacher.id, 'Returns status record with matching facultyId');

    // TEST 2: Verified classrooms endpoint
    const res2 = await fetch(`${baseUrl}/faculty/verified-classrooms`);
    const data2 = await res2.json();
    assert(res2.status === 200, 'Verified classrooms endpoint returns 200 OK');
    assert(Array.isArray(data2.classrooms) && data2.classrooms.length > 0, 'Classrooms list is non-empty array');
    assert(data2.classrooms.some((c: any) => c.id === 'AB13'), 'Contains known classroom AB13');

    // TEST 3: Self-activation endpoint is disabled
    const res3 = await fetch(`${baseUrl}/faculty/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@christcollegeijk.edu.in' }),
    });
    assert(res3.status === 403, 'Faculty self-activation is strictly disabled (403 Forbidden)');

    // Dynamically provision a test account
    let facultyAccount = store.getFacultyAccountByFacultyId(testTeacher.id);
    if (!facultyAccount) {
      facultyAccount = store.createFacultyAccount({
        facultyId: testTeacher.id,
        email: testTeacher.officialEmail || 'test.faculty@christcollegeijk.edu.in',
        password: 'TemporaryTestPassword123!',
        mustChangePassword: true,
      });
    } else {
      facultyAccount = store.resetFacultyAccountPassword(
        facultyAccount.id,
        'TemporaryTestPassword123!',
        true
      );
    }

    // TEST 4: Faculty login with temporary password
    const res4 = await fetch(`${baseUrl}/faculty/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: facultyAccount!.email,
        password: 'TemporaryTestPassword123!',
      }),
    });
    const data4 = await res4.json();
    assert(res4.status === 200, 'Faculty login succeeds with valid credentials');
    assert(!!data4.token, 'Faculty login returns JWT authorization token');
    assert(data4.mustChangePassword === true, 'Initial login flags mustChangePassword: true');

    const tempToken = data4.token;

    // TEST 5: While mustChangePassword is true, calling status update must be rejected with 403
    const res5Blocked = await fetch(`${baseUrl}/faculty/me/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tempToken}`,
      },
      body: JSON.stringify({ status: 'AVAILABLE' }),
    });
    const data5Blocked = await res5Blocked.json();
    assert(
      res5Blocked.status === 403 && data5Blocked.error === 'PASSWORD_CHANGE_REQUIRED',
      'Server strictly blocks faculty status update while mustChangePassword is true (403 PASSWORD_CHANGE_REQUIRED)'
    );

    // TEST 6: Change password
    const res6 = await fetch(`${baseUrl}/faculty/me/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tempToken}`,
      },
      body: JSON.stringify({
        currentPassword: 'TemporaryTestPassword123!',
        newPassword: 'MyNewStrongPermanentPassword2026!',
      }),
    });
    const data6 = await res6.json();
    assert(res6.status === 200 && data6.success === true, 'Faculty successfully changes temporary password');

    // Login with new permanent password
    const res7 = await fetch(`${baseUrl}/faculty/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: facultyAccount!.email,
        password: 'MyNewStrongPermanentPassword2026!',
      }),
    });
    const data7 = await res7.json();
    assert(res7.status === 200 && !data7.mustChangePassword, 'Login with new password succeeds and mustChangePassword is false');
    const facultyToken = data7.token;

    // TEST 8: Authenticated faculty can view their profile
    const res8 = await fetch(`${baseUrl}/faculty/me`, {
      headers: { Authorization: `Bearer ${facultyToken}` },
    });
    const data8 = await res8.json();
    assert(res8.status === 200, 'GET /faculty/me returns 200 with valid token');
    assert(data8.faculty && data8.faculty.name === testTeacher.name, 'Profile matches authenticated teacher');

    // TEST 9: Update status to AVAILABLE
    const res9 = await fetch(`${baseUrl}/faculty/me/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${facultyToken}`,
      },
      body: JSON.stringify({
        status: 'AVAILABLE',
      }),
    });
    const data9 = await res9.json();
    assert(res9.status === 200, 'Faculty can update status to AVAILABLE');
    assert(data9.status.status === 'AVAILABLE', 'Status record reflects AVAILABLE');

    // TEST 10: Update status to IN_CLASS with valid classroom
    const res10 = await fetch(`${baseUrl}/faculty/me/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${facultyToken}`,
      },
      body: JSON.stringify({
        status: 'IN_CLASS',
        locationPlaceId: 'AB13',
        durationMinutes: 60,
      }),
    });
    const data10 = await res10.json();
    assert(res10.status === 200, 'Faculty can set status to IN_CLASS with classroom AB13');
    assert(data10.status.locationPlaceId === 'AB13', 'Location place ID saved correctly');

    // TEST 11: Invalid classroom reference is rejected
    const res11 = await fetch(`${baseUrl}/faculty/me/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${facultyToken}`,
      },
      body: JSON.stringify({
        status: 'IN_CLASS',
        durationMinutes: 45,
        locationPlaceId: 'NON_EXISTENT_ROOM_9999',
      }),
    });
    assert(res11.status === 400, 'Invalid classroom reference returns 400 Bad Request');

    // TEST 12: Admin login with configured emergency PIN
    const res12 = await fetch(`${baseUrl}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: 'TestEmergencyPin2026!' }),
    });
    const data12 = await res12.json();
    assert(res12.status === 200 && !!data12.token, 'Admin login succeeds with configured emergency PIN');
    const adminToken = data12.token;

    // TEST 13: Admin lists faculty accounts
    const res13 = await fetch(`${baseUrl}/admin/faculty/accounts`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data13 = await res13.json();
    assert(res13.status === 200 && Array.isArray(data13.accounts), 'Admin can list faculty accounts');
    assert(data13.accounts.every((a: any) => !a.passwordHash), 'Admin account list omits sensitive passwordHash');

    // TEST 14: Unauthenticated request with x-simulate-remote is rejected
    const res14 = await fetch(`${baseUrl}/faculty/me/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-simulate-remote': 'true',
      },
      body: JSON.stringify({ status: 'AVAILABLE' }),
    });
    assert(res14.status === 401, 'Unauthenticated request without token is rejected (401 Unauthorized)');

    console.log(`\n===============================================================`);
    console.log(`FACULTY STATUS TESTS COMPLETE: ${passed} passed, ${failed} failed`);
    console.log(`===============================================================\n`);

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    server.close();
    try {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch {}
  }
}

runTests().catch((err) => {
  console.error('Fatal error during test execution:', err);
  process.exit(1);
});
