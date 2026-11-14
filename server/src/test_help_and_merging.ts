/**
 * Test Suite for:
 * 1. HelpSection Environment Variables Verification
 * 2. Report Rate Limit Spoofing Resistance
 * 3. Pure Data Merge Functions in shared/
 */

import fs from 'fs';
import path from 'path';
import express from 'express';
import http from 'http';
import { apiRouter } from './routes/api';
import { mergeById, mergeCampusInfo } from '../../shared/mergeData';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: any) {
  if (condition) {
    console.log(`✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${testName}`);
    if (detail !== undefined) console.error('  Detail:', detail);
    failed++;
    throw new Error(`Assertion failed: ${testName}`);
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('=== ITEM 1, 2 & 3: HELP WORDING, RATE LIMIT & MERGE TESTS ===');
  console.log('================================================================\n');

  // ============================================================================
  // ITEM 1: HELP GUIDE ENVIRONMENT VARIABLES
  // ============================================================================
  console.log('--- Item 1: HelpSection Environment Variables Audit ---');
  const helpSectionPath = path.resolve(__dirname, '../../client/src/components/control-center/sections/HelpSection.tsx');
  const envExamplePath = path.resolve(__dirname, '../../.env.example');

  assert(fs.existsSync(helpSectionPath), 'HelpSection.tsx exists');
  assert(fs.existsSync(envExamplePath), '.env.example exists');

  const helpContent = fs.readFileSync(helpSectionPath, 'utf-8');
  const envExampleContent = fs.readFileSync(envExamplePath, 'utf-8');

  // Load server source files to verify occurrences
  const serverSrcDir = path.resolve(__dirname);
  const serverFiles = fs.readdirSync(serverSrcDir, { recursive: true }) as string[];
  let allServerContent = '';
  for (const f of serverFiles) {
    const fullPath = path.join(serverSrcDir, f);
    if (fs.statSync(fullPath).isFile() && (f.endsWith('.ts') || f.endsWith('.js'))) {
      allServerContent += fs.readFileSync(fullPath, 'utf-8') + '\n';
    }
  }

  // Regex pattern matching environment variable identifiers (uppercase words with underscores, at least 4 chars)
  const envVarCandidates = helpContent.match(/\b[A-Z][A-Z0-9_]{3,}\b/g) || [];
  // Filter known non-env uppercase tokens like UI labels or formats
  const nonEnvTokens = new Set([
    'GUIDES', 'NORTH', 'FORWARD', 'RIGHT', 'UNKNOWN', 'VERIFIED',
    'JPEG', 'CATEGORY', 'JSON', 'NEVER', 'ROOM', 'OPEN'
  ]);
  const detectedEnvVars = [...new Set(envVarCandidates.filter(token => !nonEnvTokens.has(token) && token.includes('_')))];

  console.log(`[HelpSection Env Audit] Identified environment variables:`, detectedEnvVars);
  assert(detectedEnvVars.length > 0, 'Found environment variables in HelpSection');
  assert(!detectedEnvVars.includes('ADMIN_DISABLED'), 'HelpSection does NOT contain false ADMIN_DISABLED');
  assert(!detectedEnvVars.includes('ADMIN_TOKEN'), 'HelpSection does NOT contain non-existent ADMIN_TOKEN');

  for (const envVar of detectedEnvVars) {
    const existsInEnvExample = envExampleContent.includes(envVar);
    const existsInServerCode = allServerContent.includes(envVar);
    assert(
      existsInEnvExample || existsInServerCode,
      `Environment variable "${envVar}" exists in .env.example or server code`
    );
  }

  // Verify specific wording in HelpSection
  assert(
    helpContent.includes('admin stays disabled on Render as long as ADMIN_PASSWORD and ADMIN_EMERGENCY_PIN are NOT set') ||
    helpContent.includes('Admin stays disabled on Render as long as ADMIN_PASSWORD and ADMIN_EMERGENCY_PIN are NOT set'),
    'HelpSection contains exact required text regarding Render admin security'
  );

  // ============================================================================
  // ITEM 2: REPORT RATE LIMIT SPOOFING RESISTANCE
  // ============================================================================
  console.log('\n--- Item 2: Report Rate Limiter Spoofing Resistance ---');

  const app = express();
  // Express trusted reverse proxy configuration (1 hop, Render/Cloudflare/Nginx)
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));
  app.use('/api/v1', apiRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  try {
    // The attacker's real connection IP as seen by the reverse proxy is 198.51.100.77.
    // The attacker tries to bypass rate limiting by spoofing different X-Forwarded-For client headers:
    // "1.1.1.1, 198.51.100.77", "2.2.2.2, 198.51.100.77", "3.3.3.3, 198.51.100.77", etc.
    // Express with app.set('trust proxy', 1) parses the trusted client IP as 198.51.100.77.
    // Any naive reading of x-forwarded-for (split(',')[0]) would see 1.1.1.1, 2.2.2.2 and allow 100+ requests.
    // With trusted req.ip, the server rate-limits after 5 requests from this same connection.

    const clientTrueIp = '198.51.100.77';
    let blockedCount = 0;
    let acceptedCount = 0;

    for (let i = 1; i <= 8; i++) {
      const spoofedClientIp = `10.99.${i}.${i}`;
      // In reverse proxy setup, client's spoofed header is appended with true client IP:
      const forwardedHeader = `${spoofedClientIp}, ${clientTrueIp}`;

      const res = await fetch(`${baseUrl}/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': forwardedHeader,
        },
        body: JSON.stringify({
          category: 'OTHER',
          message: `Spoofed test report attempt ${i}`,
        }),
      });

      if (res.status === 201) {
        acceptedCount++;
      } else if (res.status === 429) {
        blockedCount++;
      }
    }

    assert(acceptedCount === 5, `First 5 requests accepted within quota (accepted: ${acceptedCount})`);
    assert(blockedCount === 3, `Requests 6, 7, and 8 blocked with HTTP 429 despite spoofed headers (blocked: ${blockedCount})`);
    console.log(`[Rate Limit Audit] Spoofed requests: 5 accepted, 3 rejected with 429. Attack successfully mitigated.`);
  } finally {
    server.close();
  }

  // ============================================================================
  // ITEM 3: PURE MERGE FUNCTION VERIFICATION
  // ============================================================================
  console.log('\n--- Item 3: Pure Merge Function Tests (shared/mergeData.ts) ---');

  interface TestEntity {
    id: string;
    name: string;
    department?: string;
    email?: string;
    cabinRoom?: string;
  }

  const bundledData: TestEntity[] = [
    { id: 't_001', name: 'Dr. Alice Smith', department: 'Physics', email: 'alice@christcollegeijk.edu.in', cabinRoom: 'PH-101' },
    { id: 't_002', name: 'Dr. Bob Jones', department: 'Chemistry', email: 'bob@christcollegeijk.edu.in', cabinRoom: 'CH-202' },
    { id: 't_003', name: 'Dr. Charlie Brown', department: 'Mathematics', email: 'charlie@christcollegeijk.edu.in', cabinRoom: 'MA-303' },
  ];

  // 1. Server wins on conflict
  const serverUpdates: Partial<TestEntity>[] = [
    { id: 't_001', department: 'Applied Physics', cabinRoom: 'PH-105' }, // edited dept and cabin
  ];
  const merged1 = mergeById(bundledData, serverUpdates as TestEntity[]);
  const t1 = merged1.find((t) => t.id === 't_001');
  assert(t1?.department === 'Applied Physics', 'Server wins on department change');
  assert(t1?.cabinRoom === 'PH-105', 'Server wins on cabin room change');
  assert(t1?.name === 'Dr. Alice Smith', 'Unchanged server field keeps bundled name');

  // 2. Missing fields fall back to bundled
  assert(t1?.email === 'alice@christcollegeijk.edu.in', 'Missing email in server update falls back to bundled value');

  // 3. Unknown IDs are added
  const serverWithNew: Partial<TestEntity>[] = [
    { id: 't_999', name: 'Dr. New Faculty', department: 'Computer Science', email: 'new@christcollegeijk.edu.in', cabinRoom: 'CS-001' },
  ];
  const merged3 = mergeById(bundledData, serverWithNew as TestEntity[]);
  assert(merged3.length === 4, 'Unknown IDs from server are added to dataset (total: 4)');
  const tNew = merged3.find((t) => t.id === 't_999');
  assert(tNew?.name === 'Dr. New Faculty', 'Added new faculty entity contains correct fields');

  // 4. Server being unreachable returns bundled data unchanged
  const mergedUnreachableNull = mergeById(bundledData, null);
  assert(mergedUnreachableNull.length === 3, 'Null server response returns bundled data length');
  assert(JSON.stringify(mergedUnreachableNull) === JSON.stringify(bundledData), 'Null server response returns bundled data unchanged');

  const mergedUnreachableUndefined = mergeById(bundledData, undefined);
  assert(JSON.stringify(mergedUnreachableUndefined) === JSON.stringify(bundledData), 'Undefined server response returns bundled data unchanged');

  const mergedUnreachableEmpty = mergeById(bundledData, []);
  assert(JSON.stringify(mergedUnreachableEmpty) === JSON.stringify(bundledData), 'Empty server response returns bundled data unchanged');

  // 5. Purity check (neither bundledData nor serverUpdates mutated)
  assert(bundledData[0].department === 'Physics', 'Bundled data array was not mutated');
  assert(bundledData.length === 3, 'Bundled data length preserved');

  // 6. Campus Info Merge
  const bundledCampus = {
    name: 'Christ College (Autonomous)',
    address: 'Irinjalakuda, Thrissur, Kerala',
    phone: '0480 2825258',
    email: 'office@christcollegeijk.edu.in',
  };
  const serverCampus = {
    phone: '0480 2820000', // updated phone
  };
  const mergedCampus = mergeCampusInfo(bundledCampus, serverCampus);
  assert(mergedCampus.phone === '0480 2820000', 'Server campus phone override applied');
  assert(mergedCampus.name === 'Christ College (Autonomous)', 'Bundled campus name preserved');
  assert(mergedCampus.email === 'office@christcollegeijk.edu.in', 'Bundled campus email preserved');

  const mergedCampusUnreachable = mergeCampusInfo(bundledCampus, null);
  assert(JSON.stringify(mergedCampusUnreachable) === JSON.stringify(bundledCampus), 'Unreachable server leaves campus info unchanged');

  console.log('\n================================================================');
  console.log(`=== ALL TESTS PASSED: ${passed} PASSED, ${failed} FAILED ===`);
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
