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
  const {
    generateSecureTempPassword,
    isValidCollegeEmail,
    generateAdminToken,
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

  // Hard timeout watchdog (15 seconds max)
  const watchdog = setTimeout(() => {
    console.error('✗ WATCHDOG TIMEOUT: Test suite exceeded maximum allowed time.');
    server.close();
    try {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch {}
    process.exit(1);
  }, 15000);

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
