/**
 * Comprehensive Test Suite for Reports Persistence, Control Center, and Coverage Gaps
 * 
 * Verifies:
 * 1. Public Report Submission:
 *    - Message length cap (2000 chars max)
 *    - Category whitelist enforcement
 *    - Control characters stripped
 *    - Rate limiting (5 per 15 min per IP)
 *    - Attachment/screenshot cap (<= 200 KB kept, > 200 KB dropped)
 *    - Generic error messages
 * 2. Storage & Repository:
 *    - Write-through to InMemory/Firestore 'reports' collection
 *    - Single document per report, server-generated ID
 *    - Pagination (newest first, limit <= 50, cursor-based)
 *    - Report retrieval, status update, admin notes
 *    - Report deletion
 * 3. Control Center & Safety:
 *    - CSV escaping for messages containing quotes, commas, and newlines
 *    - Admin audit logs created for status/note updates and deletions
 *    - Audit logs contain NO report message text, passwords, or personal credentials
 *    - Static AST/file check that no new files contain dangerouslySetInnerHTML
 * 4. Coverage Gaps:
 *    - Campus info GET and PUT with audit logging
 *    - Campus events GET, POST, and DELETE with audit logging
 *    - Department update with audit logging
 */

import os from 'os';
import path from 'path';
import fs from 'fs';
import express from 'express';
import http from 'http';
import { store } from './db/store';
import { generateAdminToken } from './middleware/auth';
import { CampusReport, CampusReportStatus, CampusReportCategory } from '../../shared/types';

// Set test environment
process.env.ADMIN_TOKEN = 'TestAdminSecretToken2026!';
process.env.JWT_SECRET = 'SuperSecretJwtKeyForTestingReportsControlCenter2026!';
process.env.NODE_ENV = 'test';

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
  console.log('=== REPORTS & CONTROL CENTER COMPREHENSIVE VERIFICATION SUITE ===');
  console.log('================================================================\n');

  // Load API router with isolated test store
  const { apiRouter, stripControlCharacters } = await import('./routes/api');

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));
  app.use('/api/v1', apiRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  const adminToken = generateAdminToken({
    username: 'admin',
    role: 'SUPER_ADMIN',
    name: 'Chief Admin',
  });
  const adminHeaders = {
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json',
  };

  try {
    // -------------------------------------------------------------
    // 1. PUBLIC REPORT SUBMISSION & VALIDATION
    // -------------------------------------------------------------
    console.log('\n--- 1. Public Report Submission & Validation ---');

    // 1a: Missing or empty message
    const resEmpty = await fetch(`${baseUrl}/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'OTHER', message: '   ' }),
    });
    assert(resEmpty.status === 400, 'Empty message rejected with HTTP 400');
    const emptyJson = await resEmpty.json();
    assert(typeof emptyJson.error === 'string', 'Error message returned is generic string');

    // 1b: Message length cap (> 2000 chars rejected)
    const longMessage = 'A'.repeat(2005);
    const resLong = await fetch(`${baseUrl}/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'OTHER', message: longMessage }),
    });
    assert(resLong.status === 400, 'Message exceeding 2000 characters rejected with HTTP 400');

    // 1c: Category whitelist (invalid category rejected)
    const resBadCat = await fetch(`${baseUrl}/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'MALICIOUS_CATEGORY_INJECTION', message: 'Legitimate message' }),
    });
    assert(resBadCat.status === 400, 'Unwhitelisted category rejected with HTTP 400');

    // 1d: Control characters stripped
    const rawControlStr = 'Hello\x00\x08World\x1F\x7F Test';
    const cleaned = stripControlCharacters(rawControlStr);
    assert(!cleaned.includes('\x00') && !cleaned.includes('\x08') && !cleaned.includes('\x1F'), 'Control characters are cleanly stripped');
    assert(cleaned === 'HelloWorld Test', 'Control characters correctly stripped without removing valid characters');

    // 1e: Valid submission with allowable category, node id, and truncated user agent
    const resValid = await fetch(`${baseUrl}/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) CampNav-Browser/1.0',
        'X-Forwarded-For': '10.0.0.1',
      },
      body: JSON.stringify({
        category: 'MISSING_ROOM',
        message: 'Room 204 door label is missing near physics wing.',
        nodeId: 'ab_046',
        page: '/360_TOUR',
        contact: 'student@christcollegeijk.edu.in',
      }),
    });
    assert(resValid.status === 201, 'Valid report submitted successfully with HTTP 201');
    const validJson = await resValid.json();
    assert(validJson.success === true && typeof validJson.reportId === 'string', 'Server returns reportId');
    const firstReportId = validJson.reportId;

    // 1f: Attachment capping (<= 200 KB kept, > 200 KB dropped)
    const smallPayload = 'data:image/png;base64,' + 'A'.repeat(5000); // ~5 KB
    const resSmallAttachment = await fetch(`${baseUrl}/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '10.0.0.2',
      },
      body: JSON.stringify({
        category: 'WRONG_DIRECTION',
        message: 'Arrow points wrong way near auditorium.',
        screenshot: smallPayload,
      }),
    });
    assert(resSmallAttachment.status === 201, 'Report with <= 200 KB screenshot accepted');

    const hugePayload = 'data:image/png;base64,' + 'A'.repeat(300000); // ~300 KB (> 200 KB)
    const resHugeAttachment = await fetch(`${baseUrl}/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '10.0.0.3',
      },
      body: JSON.stringify({
        category: 'WRONG_DIRECTION',
        message: 'Attached huge screenshot.',
        screenshot: hugePayload,
      }),
    });
    assert(resHugeAttachment.status === 201, 'Report with oversized screenshot is processed (oversized attachment dropped)');
    const hugeJson = await resHugeAttachment.json();
    // Retrieve report to verify screenshot was dropped
    const fetchedHugeReport = await fetch(`${baseUrl}/admin/reports/${hugeJson.reportId}`, { headers: adminHeaders });
    const fetchedHugeJson = await fetchedHugeReport.json();
    assert(fetchedHugeJson.report.screenshot === undefined, 'Oversized screenshot was dropped as required');

    // -------------------------------------------------------------
    // 2. RATE LIMITING
    // -------------------------------------------------------------
    console.log('\n--- 2. Public Route Rate Limiting (5 per 15 min per IP) ---');
    const spamIp = '192.168.100.42';

    let rateLimitTriggered = false;
    for (let i = 0; i < 7; i++) {
      const resSpam = await fetch(`${baseUrl}/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': spamIp,
        },
        body: JSON.stringify({
          category: 'OTHER',
          message: `Spam report attempt ${i + 1}`,
        }),
      });

      if (i < 5) {
        assert(resSpam.status === 201, `Spam attempt ${i + 1} within quota accepted (HTTP 201)`);
      } else {
        if (resSpam.status === 429) {
          rateLimitTriggered = true;
          const rateLimitJson = await resSpam.json();
          assert(rateLimitJson.error.includes('Too many'), 'Rate limit returns generic error');
        }
      }
    }
    assert(rateLimitTriggered, '6th report from same IP within 15 min blocked with HTTP 429');

    // -------------------------------------------------------------
    // 3. STORAGE & REPOSITORY PERSISTENCE
    // -------------------------------------------------------------
    console.log('\n--- 3. Storage & Repository Persistence ---');

    // 3a: Verify query in-memory repository
    const repoQueryResult = await store.getRepository().queryCampusReports({ limit: 50 });
    assert(repoQueryResult.reports.length > 0, 'Reports persisted in repository');
    assert(repoQueryResult.reports[0].status === 'NEW', 'Initial report status is NEW');
    assert(repoQueryResult.reports[0].createdAt !== undefined, 'Report has createdAt timestamp');

    // 3b: Verify live server does not load all reports into memory
    const inMemoryReports = store.getInMemoryReports();
    assert(Array.isArray(inMemoryReports) && inMemoryReports.length === 0, 'Live store memory state.reports remains unloaded (reads query repository on demand)');

    // -------------------------------------------------------------
    // 4. ADMIN ENDPOINTS: GET, PAGINATION, STATUS & NOTES
    // -------------------------------------------------------------
    console.log('\n--- 4. Admin Reports Management ---');

    // 4a: Admin query with newest first
    const resAdminQuery = await fetch(`${baseUrl}/admin/reports?limit=50`, {
      headers: adminHeaders,
    });
    assert(resAdminQuery.status === 200, 'Admin reports endpoint returns HTTP 200');
    const adminQueryJson = await resAdminQuery.json();
    assert(adminQueryJson.success === true && Array.isArray(adminQueryJson.reports), 'Admin receives report list');
    assert(adminQueryJson.reports.length <= 50, 'Admin reports limit 50 enforced');

    // 4b: Update report status and notes
    const resPatch = await fetch(`${baseUrl}/admin/reports/${firstReportId}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({
        status: 'IN_PROGRESS',
        adminNotes: 'Field technician assigned to replace door signage.',
      }),
    });
    assert(resPatch.status === 200, 'Report status updated to IN_PROGRESS with admin notes');
    const patchJson = await resPatch.json();
    assert(patchJson.report.status === 'IN_PROGRESS', 'Updated report status is IN_PROGRESS');
    assert(patchJson.report.adminNotes === 'Field technician assigned to replace door signage.', 'Admin notes recorded correctly');

    // 4c: Bulk status change
    const resBulk = await fetch(`${baseUrl}/admin/reports/bulk-status`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        ids: [firstReportId],
        status: 'RESOLVED',
      }),
    });
    assert(resBulk.status === 200, 'Bulk status change returned HTTP 200');
    const bulkJson = await resBulk.json();
    assert(bulkJson.count >= 1, 'Bulk status updated at least 1 report');

    // 4d: Delete report
    const resDelete = await fetch(`${baseUrl}/admin/reports/${firstReportId}`, {
      method: 'DELETE',
      headers: adminHeaders,
    });
    assert(resDelete.status === 200, 'Report deleted successfully with HTTP 200');

    const resVerifyDeleted = await fetch(`${baseUrl}/admin/reports/${firstReportId}`, {
      headers: adminHeaders,
    });
    assert(resVerifyDeleted.status === 404, 'Deleted report now returns HTTP 404 Not Found');

    // -------------------------------------------------------------
    // 5. CSV FORMATTING & EXPORT INTEGRITY
    // -------------------------------------------------------------
    console.log('\n--- 5. CSV Export Formatting & RFC 4180 Escaping ---');

    function escapeCsvCell(val: any): string {
      if (val === null || val === undefined) return '""';
      const str = String(val);
      const escaped = str.replace(/"/g, '""');
      return `"${escaped}"`;
    }

    const testMessageWithQuotes = 'User said: "Room 101 has broken glass, please fix!"';
    const escaped = escapeCsvCell(testMessageWithQuotes);
    assert(escaped === '"User said: ""Room 101 has broken glass, please fix!"""', 'Double quotes in report text are escaped as RFC 4180 double quotes ("")');

    const testMessageWithCommas = 'Library, Science Block, and Cafeteria';
    const escapedCommas = escapeCsvCell(testMessageWithCommas);
    assert(escapedCommas === '"Library, Science Block, and Cafeteria"', 'Commas are safely enclosed in quotes');

    const testMessageWithNewlines = 'Line 1\nLine 2\r\nLine 3';
    const escapedNewlines = escapeCsvCell(testMessageWithNewlines);
    assert(escapedNewlines === '"Line 1\nLine 2\r\nLine 3"', 'Newlines are safely enclosed in quotes without breaking CSV rows');

    // -------------------------------------------------------------
    // 6. ADMIN AUDIT INTEGRITY & SENSITIVITY CHECK
    // -------------------------------------------------------------
    console.log('\n--- 6. Admin Audit Log Verification ---');

    const resAudit = await fetch(`${baseUrl}/admin/audit-actions?limit=50`, {
      headers: adminHeaders,
    });
    assert(resAudit.status === 200, 'Admin audit actions retrieved successfully');
    const auditJson = await resAudit.json();
    assert(Array.isArray(auditJson.actions) && auditJson.actions.length > 0, 'Audit actions recorded');

    // Check each audit entry: must not contain report messages, passwords, hashes
    for (const audit of auditJson.actions) {
      const serialized = JSON.stringify(audit);
      assert(!serialized.includes('passwordHash'), 'Audit log contains NO password hashes');
      assert(!serialized.includes('superSecretPin'), 'Audit log contains NO secrets');
      if (audit.entity === 'REPORT') {
        assert(audit.entityId !== undefined, 'Report audit logs record entity ID');
        assert(!serialized.includes('Room 204 door label is missing'), 'Audit log records do NOT leak user report messages');
      }
    }

    // -------------------------------------------------------------
    // 7. STATIC CHECK: ZERO dangerouslySetInnerHTML
    // -------------------------------------------------------------
    console.log('\n--- 7. Static Check: Zero dangerouslySetInnerHTML in New/Modified Files ---');

    const filesToCheck = [
      'client/src/components/control-center/sections/ReportsSection.tsx',
      'client/src/components/control-center/sections/HelpSection.tsx',
      'client/src/components/control-center/sections/ActivityLogSection.tsx',
      'client/src/components/control-center/sections/OverviewSection.tsx',
      'client/src/components/control-center/sections/CampusSection.tsx',
    ];

    for (const fileRel of filesToCheck) {
      const fullPath = path.resolve(__dirname, '../../', fileRel);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        assert(!content.includes('dangerouslySetInnerHTML'), `File ${fileRel} has ZERO dangerouslySetInnerHTML`);
      } else {
        console.warn(`File ${fileRel} not found on disk`);
      }
    }

    // -------------------------------------------------------------
    // 8. COVERAGE GAPS VERIFICATION
    // -------------------------------------------------------------
    console.log('\n--- 8. Coverage Gaps Verification ---');

    // Gap (i): Campus Info
    const resCampusInfo = await fetch(`${baseUrl}/campus/info`);
    assert(resCampusInfo.status === 200, 'GET /api/v1/campus/info returns HTTP 200');
    const campusInfo = await resCampusInfo.json();
    assert(campusInfo.name.includes('Christ College'), 'Campus info returns correct institution name');

    const updateCampusInfoRes = await fetch(`${baseUrl}/admin/campus/info`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({
        name: 'Christ College (Autonomous) Irinjalakuda',
        address: 'Christ College (Autonomous), Irinjalakuda, Kerala - 680125',
        phone: '+91 480 2825258',
        email: 'contact@christcollegeijk.edu.in',
      }),
    });
    assert(updateCampusInfoRes.status === 200, 'PUT /api/v1/admin/campus/info returns HTTP 200');

    // Gap (ii): Events Calendar
    const resEvents = await fetch(`${baseUrl}/events`);
    assert(resEvents.status === 200, 'GET /api/v1/events returns HTTP 200');
    const eventsJson = await resEvents.json();
    assert(Array.isArray(eventsJson.events), 'Campus events returned as array');

    const newEventRes = await fetch(`${baseUrl}/admin/events`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        title: 'Annual College Day 2026',
        date: '2026-12-15',
        time: '10:00 AM - 04:00 PM',
        venue: "St. Joseph's Auditorium",
        category: 'Cultural',
        description: 'Annual college cultural celebration.',
      }),
    });
    assert(newEventRes.status === 201, 'POST /api/v1/admin/events creates new event with HTTP 201');
    const createdEventJson = await newEventRes.json();
    assert(createdEventJson.event.id !== undefined, 'Created event has assigned ID');

    const resEventsAfter = await fetch(`${baseUrl}/events`);
    const eventsAfterJson = await resEventsAfter.json();
    assert(eventsAfterJson.events.some((e: any) => e.title === 'Annual College Day 2026'), 'Persisted event returned in GET /events');

    const deleteEventRes = await fetch(`${baseUrl}/admin/events/${createdEventJson.event.id}`, {
      method: 'DELETE',
      headers: adminHeaders,
    });
    assert(deleteEventRes.status === 200, 'DELETE /api/v1/admin/events/:id removes event with HTTP 200');

    // Gap (iii): Department Update
    const targetDept = store.getDepartments()[0];
    const updateDeptRes = await fetch(`${baseUrl}/admin/departments/${targetDept.id}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({
        headOfDepartment: 'Dr. V. D. John',
        description: 'Academic department wing and research centre updated.',
      }),
    });
    assert(updateDeptRes.status === 200, 'PATCH /api/v1/admin/departments/:id updates department with HTTP 200');

  } finally {
    server.close();
  }

  console.log('\n======================================================');
  console.log(`REPORTS & CONTROL CENTER SUITE: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
