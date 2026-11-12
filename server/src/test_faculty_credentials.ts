import os from 'os';
import path from 'path';
import fs from 'fs';
import express from 'express';
import http from 'http';

// ISOLATED TEST FIXTURE: ensure test mutations NEVER touch live database
const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'campnav-test-cred-'));
const repoRoot = path.resolve(__dirname, '..');
const seedFile = path.join(repoRoot, 'data/campusnav_db.seed.json');
const dbFile = path.join(repoRoot, 'data/campusnav_db.json');
const sourceFile = fs.existsSync(seedFile) ? seedFile : dbFile;
if (fs.existsSync(sourceFile)) {
  fs.copyFileSync(sourceFile, path.join(testDataDir, 'campusnav_db.json'));
}
process.env.DATA_DIR = testDataDir;
process.env.ADMIN_EMERGENCY_PIN = 'TestEmergencyPin2026!';
process.env.ADMIN_PASSWORD = 'TestAdminPassword2026!';

async function runTests() {
  console.log('=== STARTING FACULTY CREDENTIALS TEST SUITE ===\n');

  // Dynamic import ensures process.env.DATA_DIR is active during module initialization
  const { apiRouter, isSafeChristCollegeUrl } = await import('./routes/api');
  const { store } = await import('./db/store');
  const { gitSyncService } = await import('./services/gitSyncService');
  const {
    generateSecureTempPassword,
    isValidCollegeEmail,
    generateAdminToken,
    hashPassword,
  } = await import('./middleware/auth');

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
      console.log(`✓ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`✗ FAIL: ${testName}`, detail || '');
      failed++;
    }
  }

  // Hard timeout watchdog (60 seconds max)
  const watchdog = setTimeout(() => {
    console.error('✗ WATCHDOG TIMEOUT: Test suite exceeded maximum allowed time.');
    server.close();
    try {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch {}
    process.exit(1);
  }, 60000);

  const adminToken = generateAdminToken('admin', 'SUPER_ADMIN', 'Administrator', true);
  const adminHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${adminToken}`,
  };

  try {
    // -------------------------------------------------------------
    // TEST 1: Password Generator Strength, Length & Charset
    // -------------------------------------------------------------
    console.log('\n--- 1. Testing Password Generator Strength & Charset ---');
    const ambiguousChars = ['0', 'O', '1', 'l', 'I', 'o'];
    let allValid = true;
    let mixedCaseAndDigits = true;

    for (let i = 0; i < 500; i++) {
      const p = generateSecureTempPassword();
      if (p.length !== 14) allValid = false;
      for (const ch of ambiguousChars) {
        if (p.includes(ch)) allValid = false;
      }
      const hasUpper = /[A-Z]/.test(p);
      const hasLower = /[a-z]/.test(p);
      const hasDigit = /[0-9]/.test(p);
      if (!hasUpper || !hasLower || !hasDigit) mixedCaseAndDigits = false;
    }

    assert(allValid, 'Temp password is 14 chars and contains NO ambiguous characters across 500 trials');
    assert(mixedCaseAndDigits, 'Temp password guarantees mixed case (uppercase + lowercase) and digits');

    // -------------------------------------------------------------
    // TEST 2: Uniqueness across 277 Generations
    // -------------------------------------------------------------
    console.log('\n--- 2. Testing Password Uniqueness across 277 Generations ---');
    const generations = new Set<string>();
    for (let i = 0; i < 277; i++) {
      generations.add(generateSecureTempPassword());
    }
    assert(generations.size === 277, `All 277 generated temporary passwords are completely unique (Count: ${generations.size})`);

    // -------------------------------------------------------------
    // TEST 3: Email Domain & Format Validation
    // -------------------------------------------------------------
    console.log('\n--- 3. Testing Email Validation ---');
    assert(isValidCollegeEmail('faculty@christcollegeijk.edu.in'), 'Accepts valid college email');
    assert(!isValidCollegeEmail('faculty@gmail.com'), 'Rejects non-college email domain');
    assert(!isValidCollegeEmail('invalid-format'), 'Rejects invalid email format');
    assert(!isValidCollegeEmail(''), 'Rejects empty email');
    assert(!isValidCollegeEmail(null), 'Rejects null email');

    // -------------------------------------------------------------
    // TEST 4: Single Faculty Account Creation
    // -------------------------------------------------------------
    console.log('\n--- 4. Testing Single Account Creation ---');
    const teachers = store.getTeachers();
    const testTeacher1 = teachers[0];
    const testTeacher2 = teachers[1];
    const testEmail1 = `teacher1.test@christcollegeijk.edu.in`;

    const createRes = await fetch(`${baseUrl}/admin/faculty/accounts`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        facultyId: testTeacher1.id,
        email: testEmail1,
      }),
    });

    const createData = await createRes.json();
    assert(createRes.status === 201 && createData.success === true, 'Successfully created faculty account via admin API');
    assert(Boolean(createData.temporaryPassword && createData.temporaryPassword.length === 14), 'Response contains 14-char temporary password');
    assert(createData.account?.mustChangePassword === true, 'Created account has mustChangePassword === true');
    assert(!createData.account?.passwordHash, 'Account response does NOT leak passwordHash');

    const tempPassword1 = createData.temporaryPassword;

    // -------------------------------------------------------------
    // TEST 5: Duplicate Account & Email Rejection
    // -------------------------------------------------------------
    console.log('\n--- 5. Testing Duplicate Account & Email Rejection ---');
    const duplicateCreateRes = await fetch(`${baseUrl}/admin/faculty/accounts`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        facultyId: testTeacher1.id,
        email: `another.${testTeacher1.id}@christcollegeijk.edu.in`,
      }),
    });
    assert(duplicateCreateRes.status === 400, 'Rejects creating a second account for same faculty ID');

    const duplicateEmailRes = await fetch(`${baseUrl}/admin/faculty/accounts`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        facultyId: testTeacher2.id,
        email: testEmail1, // already used by testTeacher1
      }),
    });
    assert(duplicateEmailRes.status === 400, 'Rejects creating account with an email already used by another account');

    // -------------------------------------------------------------
    // TEST 6: Bulk Account Provisioning
    // -------------------------------------------------------------
    console.log('\n--- 6. Testing Bulk Account Provisioning ---');
    const testTeacher3 = teachers[2];
    const testTeacher4 = teachers[3];
    const testEmail3 = `teacher3.test@christcollegeijk.edu.in`;
    const testEmail4 = `teacher4.test@christcollegeijk.edu.in`;

    const bulkRes = await fetch(`${baseUrl}/admin/faculty/batch-provision`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        facultyList: [
          { facultyId: testTeacher3.id, email: testEmail3 },
          { facultyId: testTeacher4.id, email: testEmail4 },
          { facultyId: testTeacher1.id, email: `dup.${testTeacher1.id}@christcollegeijk.edu.in` }, // already has account
          { facultyId: 'non_existent_id', email: 'fake@christcollegeijk.edu.in' },
        ],
      }),
    });

    const bulkData = await bulkRes.json();
    assert(bulkRes.status === 200 && bulkData.success === true, 'Bulk provision endpoint succeeds');
    assert(bulkData.created?.length === 2, `Provisioned exactly 2 eligible accounts (Got: ${bulkData.created?.length})`);
    assert(bulkData.skipped?.length === 2, `Identified exactly 2 skipped accounts with reasons (Got: ${bulkData.skipped?.length})`);
    assert(Boolean(bulkData.created[0]?.temporaryPassword && bulkData.created[0].temporaryPassword.length === 14), 'Bulk response includes temporary passwords for newly created accounts');

    // -------------------------------------------------------------
    // TEST 7: Reset Password Sets mustChangePassword
    // -------------------------------------------------------------
    console.log('\n--- 7. Testing Reset Password Sets mustChangePassword ---');
    const createdAcc1 = store.getFacultyAccountByFacultyId(testTeacher1.id)!;

    const resetRes = await fetch(`${baseUrl}/admin/faculty/accounts/${createdAcc1.id}/reset-password`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({}),
    });

    const resetData = await resetRes.json();
    assert(resetRes.status === 200 && resetData.success === true, 'Reset password endpoint succeeds');
    assert(Boolean(resetData.temporaryPassword && resetData.temporaryPassword.length === 14), 'Reset response returns new 14-char temporary password');

    const updatedAcc1 = store.getFacultyAccountById(createdAcc1.id)!;
    assert(updatedAcc1.mustChangePassword === true, 'Account mustChangePassword is true after password reset');

    const newTempPassword1 = resetData.temporaryPassword;

    // -------------------------------------------------------------
    // TEST 8: Disable Blocks Login & Enable Restores Login
    // -------------------------------------------------------------
    console.log('\n--- 8. Testing Disable Blocks Login & Enable Restores ---');
    // Disable account
    const disableRes = await fetch(`${baseUrl}/admin/faculty/accounts/${createdAcc1.id}/toggle-active`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ isActive: false }),
    });
    assert(disableRes.status === 200, 'Admin can toggle account active status to false');

    // Attempt login while disabled
    const disabledLoginRes = await fetch(`${baseUrl}/faculty/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: testEmail1,
        password: newTempPassword1,
      }),
    });
    assert(disabledLoginRes.status === 403, 'Disabled account login is blocked with HTTP 403');

    // Re-enable account
    const enableRes = await fetch(`${baseUrl}/admin/faculty/accounts/${createdAcc1.id}/toggle-active`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ isActive: true }),
    });
    assert(enableRes.status === 200, 'Admin can re-enable account');

    // -------------------------------------------------------------
    // TEST 9: Login with Temp Password & Forced Password Change
    // -------------------------------------------------------------
    console.log('\n--- 9. Testing Login & Forced Password Change Enforcement ---');
    const loginRes = await fetch(`${baseUrl}/faculty/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: testEmail1,
        password: newTempPassword1,
      }),
    });

    const loginData = await loginRes.json();
    assert(loginRes.status === 200 && loginData.success === true, 'Faculty logs in successfully with temporary password');
    assert(loginData.mustChangePassword === true, 'Login response confirms mustChangePassword is true');
    const facultyToken = loginData.token;

    // Attempt to access status endpoint before changing password (should be blocked with 403 PASSWORD_CHANGE_REQUIRED)
    const statusBeforeChangeRes = await fetch(`${baseUrl}/faculty/me/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${facultyToken}`,
      },
      body: JSON.stringify({ status: 'AVAILABLE' }),
    });
    const statusBeforeData = await statusBeforeChangeRes.json();
    assert(
      statusBeforeChangeRes.status === 403 && statusBeforeData.error === 'PASSWORD_CHANGE_REQUIRED',
      'Access to faculty resources is blocked with 403 PASSWORD_CHANGE_REQUIRED before changing password'
    );

    // -------------------------------------------------------------
    // TEST 10: New Password Length Rule & Same-Password Rejection
    // -------------------------------------------------------------
    console.log('\n--- 10. Testing Password Length Rule (>= 10 chars) ---');
    // Try password < 10 chars
    const shortPassRes = await fetch(`${baseUrl}/faculty/me/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${facultyToken}`,
      },
      body: JSON.stringify({
        currentPassword: newTempPassword1,
        newPassword: 'short99', // 7 chars
      }),
    });
    assert(shortPassRes.status === 400, 'Rejects new password shorter than 10 characters');

    // Try password identical to current temp password
    const samePassRes = await fetch(`${baseUrl}/faculty/me/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${facultyToken}`,
      },
      body: JSON.stringify({
        currentPassword: newTempPassword1,
        newPassword: newTempPassword1,
      }),
    });
    assert(samePassRes.status === 400, 'Rejects new password equal to current temporary password');

    // Change password with valid >= 10 character password
    const validNewPassword = 'MySecretCollegePass2026!';
    const changePassRes = await fetch(`${baseUrl}/faculty/me/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${facultyToken}`,
      },
      body: JSON.stringify({
        currentPassword: newTempPassword1,
        newPassword: validNewPassword,
      }),
    });
    assert(changePassRes.status === 200, 'Successfully changes password with valid >= 10 character password');

    const accAfterChange = store.getFacultyAccountById(createdAcc1.id)!;
    assert(accAfterChange.mustChangePassword === false, 'Account mustChangePassword is now false');

    // Now faculty resource access is permitted
    const statusAfterChangeRes = await fetch(`${baseUrl}/faculty/me/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${facultyToken}`,
      },
      body: JSON.stringify({ status: 'AVAILABLE' }),
    });
    assert(statusAfterChangeRes.status === 200, 'Faculty resources are accessible after changing password');

    // -------------------------------------------------------------
    // TEST 11: Security Verification — No Plaintext Password in Database or Logs
    // -------------------------------------------------------------
    console.log('\n--- 11. Security Audit: No Plaintext Passwords in DB or Audit Logs ---');
    store.persist(true);
    const dbRaw = fs.readFileSync(path.join(testDataDir, 'campusnav_db.json'), 'utf-8');

    assert(!dbRaw.includes(tempPassword1), 'First temporary password does NOT appear in persisted campusnav_db.json');
    assert(!dbRaw.includes(newTempPassword1), 'Second temporary password does NOT appear in persisted campusnav_db.json');
    assert(!dbRaw.includes(validNewPassword), 'User-chosen password does NOT appear in persisted campusnav_db.json');

    const parsedDb = JSON.parse(dbRaw);
    let allHashesBcrypt = true;
    (parsedDb.facultyAccounts || []).forEach((acc: any) => {
      if (!acc.passwordHash || !acc.passwordHash.startsWith('$2')) {
        allHashesBcrypt = false;
      }
    });
    assert(allHashesBcrypt, 'All faculty accounts in database store only bcrypt hashes');

    // Check audit logs
    let auditLogLeakedPassword = false;
    (parsedDb.adminAuditActions || []).forEach((log: any) => {
      const logStr = JSON.stringify(log);
      if (
        logStr.includes(tempPassword1) ||
        logStr.includes(newTempPassword1) ||
        logStr.includes(validNewPassword)
      ) {
        auditLogLeakedPassword = true;
      }
    });
    assert(!auditLogLeakedPassword, 'Audit logs contain NO plaintext passwords');

    // Check publish export sanitization
    const exportedDb = store.exportDatabasePayload();
    let exportContainsRawHash = false;
    (exportedDb.facultyAccounts || []).forEach((acc: any) => {
      if (acc.passwordHash !== '[PROTECTED_ON_SERVER]') {
        exportContainsRawHash = true;
      }
    });
    assert(!exportContainsRawHash, 'Publish exportDatabasePayload redacts passwordHash to [PROTECTED_ON_SERVER]');

    // -------------------------------------------------------------
    // TEST 12: Scan Endpoint SSRF Defense & URL Validation
    // -------------------------------------------------------------
    console.log('\n--- 12. Public Web Scan Security & SSRF Protection ---');
    assert(isSafeChristCollegeUrl('https://christcollegeijk.edu.in/faculty/details'), 'Allows https://christcollegeijk.edu.in/*');
    assert(isSafeChristCollegeUrl('https://cs.christcollegeijk.edu.in/profile'), 'Allows https://*.christcollegeijk.edu.in/* subdomain');
    assert(!isSafeChristCollegeUrl('http://christcollegeijk.edu.in/faculty'), 'Rejects non-HTTPS http:// URL');
    assert(!isSafeChristCollegeUrl('https://christcollegeijk.edu.in.evil.com/faculty'), 'Rejects spoofed suffix domain');
    assert(!isSafeChristCollegeUrl('https://evil.com/christcollegeijk.edu.in'), 'Rejects external attacker domain');
    assert(!isSafeChristCollegeUrl('https://127.0.0.1:8080/admin'), 'Rejects loopback IP address (SSRF)');
    assert(!isSafeChristCollegeUrl('https://169.254.169.254/latest/meta-data'), 'Rejects cloud metadata IP (SSRF)');
    assert(!isSafeChristCollegeUrl('https://localhost:3000'), 'Rejects localhost (SSRF)');

    // -------------------------------------------------------------
    // TEST 13: Persistence Status Endpoint
    // -------------------------------------------------------------
    console.log('\n--- 13. Persistence Status Endpoint ---');
    const invalidTokenStatusRes = await fetch(`${baseUrl}/admin/persistence/status`, {
      headers: {
        'x-simulate-remote': 'true',
        Authorization: 'Bearer invalid-token-12345',
      },
    });
    assert(invalidTokenStatusRes.status === 401, 'Request with invalid token to /admin/persistence/status is rejected with 401');

    const authStatusRes = await fetch(`${baseUrl}/admin/persistence/status`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(authStatusRes.status === 200, 'Authenticated request to /admin/persistence/status succeeds with 200');
    const authStatusJson = (await authStatusRes.json()) as any;
    assert(authStatusJson.success === true, 'Persistence status response has success: true');
    assert('configured' in authStatusJson.status, 'Persistence status reports configuration status');
    assert('lastSyncMessage' in authStatusJson.status, 'Persistence status reports status message');

    // -------------------------------------------------------------
    // TEST 14: Target Server Admin Login & 404 Disable Enforcement
    // -------------------------------------------------------------
    console.log('\n--- 14. Target Admin Login & 404 Disable Enforcement ---');
    // Login with Emergency PIN
    const pinLoginRes = await fetch(`${baseUrl}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: 'TestEmergencyPin2026!' }),
    });
    assert(pinLoginRes.status === 200, 'Admin login with valid Emergency PIN returns 200');
    const pinLoginJson = (await pinLoginRes.json()) as any;
    assert(Boolean(pinLoginJson.token), 'Admin login returns a valid JWT token');

    // Login with incorrect PIN
    const wrongPinRes = await fetch(`${baseUrl}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: 'WrongPin9999!' }),
    });
    assert(wrongPinRes.status === 401, 'Admin login with wrong PIN returns 401 Unauthorized');

    // -------------------------------------------------------------
    // TEST 15: No Pattern/Name Email Generation & Counts Integrity
    // -------------------------------------------------------------
    console.log('\n--- 15. No Pattern/Name Email Generation & Counts Audit ---');
    const allFaculty = store.getTeachers();
    const verifiedOfficialCount = allFaculty.filter((t) => t.officialEmail && t.officialEmail.trim()).length;
    const missingEmailCount = allFaculty.filter((t) => !t.officialEmail || !t.officialEmail.trim()).length;

    assert(verifiedOfficialCount === 81, `Verified official emails count in official data is exactly 81 (Got: ${verifiedOfficialCount})`);
    assert(missingEmailCount === 196 || missingEmailCount === 197, `Missing emails count reflects unverified records (Got: ${missingEmailCount})`);

    // Verify /admin/teachers/bulk does NOT fabricate an email from name if none supplied
    const bulkAddRes = await fetch(`${baseUrl}/admin/teachers/bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        teachers: [
          {
            name: 'Test NoEmail Faculty',
            designation: 'Assistant Professor',
          },
        ],
      }),
    });
    assert(bulkAddRes.status === 201, 'Bulk add teacher without email returns 201');
    const bulkAddJson = (await bulkAddRes.json()) as any;
    const createdTeacher = (bulkAddJson.teachers || [])[0];
    assert(!createdTeacher?.email || createdTeacher?.email === '', 'Added teacher without email has EMPTY email (never derived from name)');
    assert(!createdTeacher?.officialEmail, 'Added teacher without email has NO officialEmail');
    assert(createdTeacher?.verifiedStatus === 'UNVERIFIED', 'Added teacher without email is marked UNVERIFIED');

    // =========================================================================
    // PART B: FAIL-SAFE SYNC, PERSISTENCE & SAFE PUBLISH TESTS (a - f)
    // =========================================================================
    const originalFetch = globalThis.fetch;

    // -------------------------------------------------------------------------
    // TEST (a): Small file (< 1 MB) with inline base64 content
    // -------------------------------------------------------------------------
    process.env.GITHUB_TOKEN = 'mock-fine-grained-token-test';
    process.env.GITHUB_DATA_REPO = 'muni-rul/waycampus-data';
    process.env.GITHUB_REPO = 'muni-rul/waycampus';
    process.env.ENABLE_STARTUP_CLOUD_SYNC = 'true';

    const smallAccounts = [
      {
        id: 'fa_small_1',
        facultyId: 'fac_small_1',
        email: 'small.prof1@christcollegeijk.edu.in',
        facultyCode: 'SP01',
        passwordHash: hashPassword('SmallSecretPass123!'),
        mustChangePassword: false,
        isActive: true,
        createdAt: new Date().toISOString(),
      },
    ];

    const smallState = {
      ...store.exportDatabasePayload(),
      facultyAccounts: smallAccounts,
    };
    const smallJsonStr = JSON.stringify(smallState);
    const smallB64 = Buffer.from(smallJsonStr).toString('base64');

    globalThis.fetch = async (input: any, init?: any) => {
      const urlStr = String(input);
      if (urlStr.includes('api.github.com/repos/muni-rul/waycampus-data/contents')) {
        return new Response(
          JSON.stringify({
            sha: 'sha-small-inline-111',
            size: Buffer.byteLength(smallJsonStr),
            encoding: 'base64',
            content: smallB64,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(input, init);
    };

    await store.initCloudSync();
    assert(store.getFacultyAccounts().some((a) => a.id === 'fa_small_1'), 'TEST (a): Small file inline base64 restores faculty accounts');
    assert(gitSyncService.getLastKnownRemoteSha() === 'sha-small-inline-111', 'TEST (a): Records SHA from small file');
    assert(gitSyncService.getLastKnownRemoteAccountCount() === 1, 'TEST (a): Records account count (1) from small file');
    assert(!gitSyncService.isSyncPaused(), 'TEST (a): Sync is active after successful small file restore');

    // -------------------------------------------------------------------------
    // TEST (b): Large file (> 1 MB, encoding 'none', empty content) via Git Blobs & Raw Fallback
    // -------------------------------------------------------------------------
    const largeAccounts = [
      {
        id: 'fa_large_1',
        facultyId: 'fac_large_1',
        email: 'large.prof1@christcollegeijk.edu.in',
        facultyCode: 'LP01',
        passwordHash: hashPassword('LargeSecretPass123!'),
        mustChangePassword: false,
        isActive: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'fa_large_2',
        facultyId: 'fac_large_2',
        email: 'large.prof2@christcollegeijk.edu.in',
        facultyCode: 'LP02',
        passwordHash: hashPassword('LargeSecretPass456!'),
        mustChangePassword: true,
        isActive: true,
        createdAt: new Date().toISOString(),
      },
    ];

    const largeState = {
      ...store.exportDatabasePayload(),
      facultyAccounts: largeAccounts,
    };
    const largeJsonStr = JSON.stringify(largeState);
    const largeB64 = Buffer.from(largeJsonStr).toString('base64');
    let blobApiInvoked = false;

    // Subtest (b.1): Primary Git Blobs API
    globalThis.fetch = async (input: any, init?: any) => {
      const urlStr = String(input);
      if (urlStr.includes('api.github.com/repos/muni-rul/waycampus-data/contents')) {
        // Contents API returns metadata with empty content and encoding 'none'
        return new Response(
          JSON.stringify({
            name: 'campusnav_db.json',
            path: 'server/data/campusnav_db.json',
            sha: 'sha-large-blob-222',
            size: 1950000,
            encoding: 'none',
            content: '',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.includes('api.github.com/repos/muni-rul/waycampus-data/git/blobs/sha-large-blob-222')) {
        blobApiInvoked = true;
        return new Response(
          JSON.stringify({
            sha: 'sha-large-blob-222',
            size: 1950000,
            encoding: 'base64',
            content: largeB64,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(input, init);
    };

    const fetchLargeRes = await gitSyncService.fetchLatestRemoteDatabase();
    assert(blobApiInvoked, 'TEST (b): Git Blobs API was invoked for large file with encoding none');
    assert(Boolean(fetchLargeRes.content), 'TEST (b): Large file content successfully returned from Blobs API');
    assert(gitSyncService.getLastKnownRemoteSha() === 'sha-large-blob-222', 'TEST (b): Remote SHA set from large file blob');
    assert(gitSyncService.getLastKnownRemoteAccountCount() === 2, 'TEST (b): Account count set to 2 from large file');
    assert(!gitSyncService.isSyncPaused(), 'TEST (b): Sync not paused after successful large file fetch');

    // Subtest (b.2): Fallback to Raw Contents endpoint if Blobs API fails
    let rawFallbackInvoked = false;
    globalThis.fetch = async (input: any, init?: any) => {
      const urlStr = String(input);
      const headers = (init?.headers || {}) as any;
      const acceptHeader = headers['Accept'] || headers['accept'] || '';

      if (urlStr.includes('api.github.com/repos/muni-rul/waycampus-data/contents')) {
        if (acceptHeader.includes('raw')) {
          rawFallbackInvoked = true;
          return new Response(largeJsonStr, { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(
          JSON.stringify({
            sha: 'sha-large-raw-333',
            size: 1950000,
            encoding: 'none',
            content: '',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.includes('api.github.com/repos/muni-rul/waycampus-data/git/blobs')) {
        return new Response('Blob not found', { status: 404 });
      }
      return originalFetch(input, init);
    };

    const fetchRawFallbackRes = await gitSyncService.fetchLatestRemoteDatabase();
    assert(rawFallbackInvoked, 'TEST (b): Raw contents API fallback was invoked when Blobs API failed');
    assert(Boolean(fetchRawFallbackRes.content), 'TEST (b): Large file content successfully returned via raw fallback');
    assert(gitSyncService.getLastKnownRemoteSha() === 'sha-large-raw-333', 'TEST (b): Remote SHA set from raw fallback');

    // -------------------------------------------------------------------------
    // TEST (c): Size 0 or invalid JSON pauses sync and pushes nothing
    // -------------------------------------------------------------------------
    // Subtest c.1: Size 0
    gitSyncService.setSyncPaused(false);
    globalThis.fetch = async (input: any, init?: any) => {
      const urlStr = String(input);
      if (urlStr.includes('api.github.com/repos/muni-rul/waycampus-data/contents')) {
        return new Response(
          JSON.stringify({
            sha: 'sha-zero-file',
            size: 0,
            encoding: 'none',
            content: '',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(input, init);
    };

    const zeroRes = await gitSyncService.fetchLatestRemoteDatabase();
    assert(zeroRes.content === null, 'TEST (c): Size 0 file returns null content');
    assert(gitSyncService.isSyncPaused(), 'TEST (c): Size 0 file pauses sync');

    let attemptedPutOnZero = false;
    globalThis.fetch = async (input: any, init?: any) => {
      if (init?.method === 'PUT') attemptedPutOnZero = true;
      return originalFetch(input, init);
    };
    const pushOnZeroRes = await gitSyncService.syncFile(store.getDataFilePath());
    assert(pushOnZeroRes.success === false, 'TEST (c): syncFile blocked when sync paused due to size 0');
    assert(!attemptedPutOnZero, 'TEST (c): No PUT dispatched when sync paused due to size 0');

    // Subtest c.2: Invalid JSON
    gitSyncService.setSyncPaused(false);
    globalThis.fetch = async (input: any, init?: any) => {
      const urlStr = String(input);
      if (urlStr.includes('api.github.com/repos/muni-rul/waycampus-data/contents')) {
        return new Response(
          JSON.stringify({
            sha: 'sha-corrupt-json',
            size: 150,
            encoding: 'base64',
            content: Buffer.from('NOT_VALID_JSON{{{').toString('base64'),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(input, init);
    };

    const corruptRes = await gitSyncService.fetchLatestRemoteDatabase();
    assert(corruptRes.content === null, 'TEST (c): Invalid JSON returns null content');
    assert(gitSyncService.isSyncPaused(), 'TEST (c): Invalid JSON pauses sync');

    let attemptedPutOnCorrupt = false;
    globalThis.fetch = async (input: any, init?: any) => {
      if (init?.method === 'PUT') attemptedPutOnCorrupt = true;
      return originalFetch(input, init);
    };
    const pushOnCorruptRes = await gitSyncService.syncFile(store.getDataFilePath());
    assert(pushOnCorruptRes.success === false, 'TEST (c): syncFile blocked when sync paused due to invalid JSON');
    assert(!attemptedPutOnCorrupt, 'TEST (c): No PUT dispatched when sync paused due to invalid JSON');

    // -------------------------------------------------------------------------
    // TEST (d): 409 Conflict retry works with a large remote file
    // -------------------------------------------------------------------------
    gitSyncService.setSyncPaused(false);
    const localCount = store.getFacultyAccounts().length;
    gitSyncService.setLastKnownRemoteState('stale-sha-pre-409', localCount);

    const concurrentLargeState = {
      ...store.exportDatabasePayload(),
      facultyAccounts: [
        ...largeAccounts,
        {
          id: 'fa_concurrent_large_3',
          facultyId: 'fac_concurrent_large_3',
          email: 'concurrent.large@christcollegeijk.edu.in',
          facultyCode: 'CLP03',
          passwordHash: hashPassword('ConcurrentLargePass123!'),
          mustChangePassword: false,
          isActive: true,
          createdAt: new Date().toISOString(),
        },
      ],
    };
    const concurrentLargeJsonStr = JSON.stringify(concurrentLargeState);
    const concurrentLargeB64 = Buffer.from(concurrentLargeJsonStr).toString('base64');

    let putCountLarge = 0;
    let blobFetchOn409 = false;

    globalThis.fetch = async (input: any, init?: any) => {
      const urlStr = String(input);
      if (urlStr.includes('api.github.com/repos/muni-rul/waycampus-data/contents')) {
        if (init?.method === 'PUT') {
          putCountLarge++;
          if (putCountLarge === 1) {
            // First attempt with stale SHA returns 409 Conflict
            return new Response(JSON.stringify({ message: 'Sha did not match' }), {
              status: 409,
              headers: { 'Content-Type': 'application/json' },
            });
          } else {
            // Retry attempt with updated SHA from large file merge
            const bodyObj = JSON.parse(init.body);
            assert(bodyObj.sha === 'fresh-large-sha-444', 'TEST (d): Retry PUT uses fresh SHA from large remote file');
            return new Response(
              JSON.stringify({ commit: { sha: 'final-large-sha-555' }, content: { sha: 'final-large-sha-555' } }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
        } else if (!init?.method || init?.method === 'GET') {
          // Contents metadata for large file
          return new Response(
            JSON.stringify({
              sha: 'fresh-large-sha-444',
              size: 1950000,
              encoding: 'none',
              content: '',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }
      if (urlStr.includes('api.github.com/repos/muni-rul/waycampus-data/git/blobs/fresh-large-sha-444')) {
        blobFetchOn409 = true;
        return new Response(
          JSON.stringify({
            sha: 'fresh-large-sha-444',
            size: 1950000,
            encoding: 'base64',
            content: concurrentLargeB64,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(input, init);
    };

    const retry409LargeRes = await gitSyncService.syncFile(store.getDataFilePath());
    assert(retry409LargeRes.success === true, 'TEST (d): syncFile succeeds on retry after 409 with large remote file');
    assert(blobFetchOn409, 'TEST (d): Large remote file blob fetched during 409 conflict handling');
    assert(putCountLarge === 2, 'TEST (d): Exactly 2 PUT requests executed');
    assert(gitSyncService.getLastKnownRemoteSha() === 'final-large-sha-555', 'TEST (d): Final SHA updated to retry result');
    assert(
      store.getFacultyAccounts().some((a) => a.id === 'fa_concurrent_large_3'),
      'TEST (d): Merged account from large remote file is present in store'
    );

    // -------------------------------------------------------------------------
    // TEST (e_large): Generated database file > 1.5 MB with several faculty accounts
    // -------------------------------------------------------------------------
    gitSyncService.setSyncPaused(false);
    const multiAccounts = [
      {
        id: 'fa_big_1',
        facultyId: 'fac_big_1',
        email: 'big.prof1@christcollegeijk.edu.in',
        facultyCode: 'BP01',
        passwordHash: hashPassword('BigPass1234567!'),
        mustChangePassword: false,
        isActive: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'fa_big_2',
        facultyId: 'fac_big_2',
        email: 'big.prof2@christcollegeijk.edu.in',
        facultyCode: 'BP02',
        passwordHash: hashPassword('BigPass2345678!'),
        mustChangePassword: false,
        isActive: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'fa_big_3',
        facultyId: 'fac_big_3',
        email: 'big.prof3@christcollegeijk.edu.in',
        facultyCode: 'BP03',
        passwordHash: hashPassword('BigPass3456789!'),
        mustChangePassword: false,
        isActive: true,
        createdAt: new Date().toISOString(),
      },
    ];

    // Pad database state to exceed 1.5 MB (e.g. ~1.65 MB)
    const paddingBlock = 'A'.repeat(50000);
    const paddedSnapshots = Array.from({ length: 32 }, (_, i) => ({
      id: `snap_pad_${i}`,
      name: `Snapshot Padding ${i}`,
      description: paddingBlock,
      createdAt: new Date().toISOString(),
      createdBy: 'SystemPad',
    }));

    const bigDatabaseState = {
      ...store.exportDatabasePayload(),
      facultyAccounts: multiAccounts,
      snapshots: paddedSnapshots,
    };
    const bigJsonStr = JSON.stringify(bigDatabaseState);
    const bigSizeBytes = Buffer.byteLength(bigJsonStr);
    assert(bigSizeBytes > 1.5 * 1024 * 1024, `TEST (e_large): Test database is > 1.5 MB (actual: ${(bigSizeBytes / (1024 * 1024)).toFixed(2)} MB)`);

    const bigB64 = Buffer.from(bigJsonStr).toString('base64');
    let bigBlobCalled = false;

    globalThis.fetch = async (input: any, init?: any) => {
      const urlStr = String(input);
      if (urlStr.includes('api.github.com/repos/muni-rul/waycampus-data/contents')) {
        return new Response(
          JSON.stringify({
            sha: 'sha-big-15mb-666',
            size: bigSizeBytes,
            encoding: 'none',
            content: '',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.includes('api.github.com/repos/muni-rul/waycampus-data/git/blobs/sha-big-15mb-666')) {
        bigBlobCalled = true;
        return new Response(
          JSON.stringify({
            sha: 'sha-big-15mb-666',
            size: bigSizeBytes,
            encoding: 'base64',
            content: bigB64,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(input, init);
    };

    const bigFetchRes = await gitSyncService.fetchLatestRemoteDatabase();
    assert(bigBlobCalled, 'TEST (e_large): Big file (>1.5MB) blob endpoint was invoked');
    assert(Boolean(bigFetchRes.content), 'TEST (e_large): Content returned for >1.5MB file');
    const parsedBig = JSON.parse(bigFetchRes.content!);
    assert(Array.isArray(parsedBig.facultyAccounts) && parsedBig.facultyAccounts.length === 3, 'TEST (e_large): Restored all 3 faculty accounts from >1.5MB file');
    assert(gitSyncService.getLastKnownRemoteAccountCount() === 3, 'TEST (e_large): Account count is 3');
    assert(gitSyncService.getLastKnownRemoteSha() === 'sha-big-15mb-666', 'TEST (e_large): Remote SHA recorded for >1.5MB file');

    // -------------------------------------------------------------------------
    // TEST (f_guard): Local state with fewer accounts is blocked from pushing
    // -------------------------------------------------------------------------
    gitSyncService.setSyncPaused(false);
    gitSyncService.setLastKnownRemoteState('sha-protect-999', 50); // Remote known to have 50 accounts

    let pushAttemptedUnderProtection = false;
    globalThis.fetch = async (input: any, init?: any) => {
      const urlStr = String(input);
      if (init?.method === 'PUT' || urlStr.includes('api.github.com')) {
        pushAttemptedUnderProtection = true;
        return new Response('{}', { status: 200 });
      }
      return originalFetch(input, init);
    };

    const reducedSyncRes = await gitSyncService.syncFile(store.getDataFilePath());
    assert(reducedSyncRes.success === false, 'TEST (f_guard): Cloud sync blocked when local has fewer accounts than remote');
    assert(!pushAttemptedUnderProtection, 'TEST (f_guard): No PUT sent when local accounts < remote accounts');
    assert(
      reducedSyncRes.message.includes('fewer faculty accounts'),
      'TEST (f_guard): Rejection message explicitly notes account protection'
    );

    // -------------------------------------------------------------------------
    // TEST (e): Publish import preserves live faculty accounts, hashes, and statuses
    // -------------------------------------------------------------------------
    const teacherId = store.getTeachers()[0]?.id || 't1';
    store.setFacultyStatus({
      facultyId: teacherId,
      status: 'BUSY',
      source: 'FACULTY',
      updatedBy: 'Self',
    });

    const liveAccountsBefore = store.getFacultyAccounts();
    assert(liveAccountsBefore.length >= 2, 'TEST (e): Live accounts exist before publish import');
    const sampleAccountBefore = liveAccountsBefore[0];
    const originalHash = sampleAccountBefore.passwordHash;
    assert(originalHash.startsWith('$2'), 'TEST (e): Sample account has real bcrypt hash');

    const publishPayload: any = {
      ...store.exportDatabasePayload(),
      facultyAccounts: [
        {
          ...sampleAccountBefore,
          passwordHash: '[PROTECTED_ON_SERVER]', // placeholder from client export
        },
        {
          id: 'fa_bogus_placeholder',
          facultyId: 'fac_bogus',
          email: 'bogus@christcollegeijk.edu.in',
          passwordHash: '[PROTECTED_ON_SERVER]', // bogus account with placeholder hash
        },
      ],
      facultyStatuses: {}, // Empty statuses in export
      facultyStatusAuditLogs: [],
    };

    store.importPublishedDatabase(publishPayload, 'Publish Unit Test', { force: true });

    const liveAccountsAfter = store.getFacultyAccounts();
    assert(
      liveAccountsAfter.length >= liveAccountsBefore.length,
      'TEST (e): Live accounts were NOT dropped by publish import'
    );
    const sampleAccountAfter = store.getFacultyAccountById(sampleAccountBefore.id);
    assert(
      sampleAccountAfter?.passwordHash === originalHash,
      'TEST (e): Live password hash was preserved (not overwritten by [PROTECTED_ON_SERVER])'
    );
    assert(
      !store.getFacultyAccountById('fa_bogus_placeholder'),
      'TEST (e): Bogus account with placeholder hash was not added'
    );

    const statusAfter = store.getFacultyStatus(teacherId);
    assert(
      statusAfter?.status === 'BUSY',
      'TEST (e): Live faculty presence status preserved across publish import'
    );

    // -------------------------------------------------------------------------
    // TEST (f): Login lookup matches with different case and trailing spaces
    // -------------------------------------------------------------------------
    globalThis.fetch = originalFetch; // restore real fetch for internal test server calls

    const targetAccount = store.getFacultyAccounts()[0];
    assert(Boolean(targetAccount), 'TEST (f): Target account exists for lookup test');

    const byEmailUpper = store.getFacultyAccountByEmailOrCode(`  ${targetAccount.email.toUpperCase()}  `);
    assert(byEmailUpper?.id === targetAccount.id, 'TEST (f): Lookup matches uppercase email with whitespace');

    const byCodeUpper = store.getFacultyAccountByEmailOrCode(`  ${targetAccount.facultyCode.toUpperCase()}  `);
    assert(byCodeUpper?.id === targetAccount.id, 'TEST (f): Lookup matches uppercase facultyCode with whitespace');

    const byIdUpper = store.getFacultyAccountByEmailOrCode(`  ${targetAccount.facultyId.toUpperCase()}  `);
    assert(byIdUpper?.id === targetAccount.id, 'TEST (f): Lookup matches uppercase facultyId with whitespace');

    const resetResult = store.resetFacultyAccountPassword(targetAccount.id, 'CaseSpaceTestPass123!');
    assert(Boolean(resetResult), 'TEST (f): Password reset to known value for HTTP login test');

    const caseLoginRes = await fetch(`${baseUrl}/faculty/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: `   ${targetAccount.email.toUpperCase()}   `,
        password: 'CaseSpaceTestPass123!',
      }),
    });
    assert(caseLoginRes.status === 200, 'TEST (f): HTTP /faculty/login succeeds with uppercase and padded identifier');
    const caseLoginJson = (await caseLoginRes.json()) as any;
    assert(caseLoginJson.success === true && Boolean(caseLoginJson.token), 'TEST (f): Valid JWT token returned for case/space test');

    console.log(`\n========================================`);
    console.log(`FACULTY CREDENTIALS TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log(`========================================\n`);

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error('Test execution error:', err);
    process.exit(1);
  } finally {
    clearTimeout(watchdog);
    server.close();
    try {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch {}
  }
}

runTests();
