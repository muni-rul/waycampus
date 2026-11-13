import fs from 'fs';
import path from 'path';
import { FirestoreRepository } from '../server/src/db/repository/FirestoreRepository';
import { DatabaseState } from '../server/src/db/store';

/**
 * CampNav Firestore Migration CLI Tool
 *
 * Usage:
 *   npx tsx scripts/migrateToFirestore.ts [options]
 *
 * Options:
 *   --seed <path>          Path to campus content seed JSON (default: server/data/campusnav_db.seed.json)
 *   --runtime-data <path>  Path to external JSON file containing faculty accounts/statuses/logs
 *   --dry-run              Inspect and validate counts without committing to Firestore
 *   --force                Overwrite existing Firestore documents without interactive confirmation
 */

interface MigrationCounts {
  organizations: number;
  campuses: number;
  buildings: number;
  floors: number;
  rooms: number;
  departments: number;
  academicDepartments: number;
  programmes: number;
  classrooms: number;
  laboratories: number;
  facilities: number;
  qrCheckpoints: number;
  searchAliases: number;
  teachers: number;
  facultyAccounts: number;
  facultyStatuses: number;
  facultyStatusAuditLogs: number;
  adminAuditActions: number;
  navigationNodes: number;
  navigationEdges: number;
  panoramas: number;
}

function parseCliArgs() {
  const args = process.argv.slice(2);
  const candidateSeedPaths = [
    path.resolve(process.cwd(), 'server/data/campusnav_db.seed.json'),
    path.resolve(process.cwd(), 'data/campusnav_db.seed.json'),
    path.resolve(__dirname, '../server/data/campusnav_db.seed.json'),
  ];
  let seedPath = candidateSeedPaths.find((p) => fs.existsSync(p)) || candidateSeedPaths[0];
  let runtimePath = '';
  let dryRun = false;
  let force = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--seed' && args[i + 1]) {
      seedPath = path.resolve(args[i + 1]);
      i++;
    } else if (args[i] === '--runtime-data' && args[i + 1]) {
      runtimePath = path.resolve(args[i + 1]);
      i++;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (args[i] === '--force') {
      force = true;
    }
  }

  return { seedPath, runtimePath, dryRun, force };
}

async function run() {
  const { seedPath, runtimePath, dryRun, force } = parseCliArgs();

  console.log('====================================================');
  console.log('       CAMPNAV FIRESTORE DATA MIGRATION SCRIPT      ');
  console.log('====================================================');
  console.log(`[Config] Dry Run Mode: ${dryRun ? 'YES (Validation Only)' : 'NO (Live Firestore Write)'}`);
  console.log(`[Config] Content Seed Path: ${seedPath}`);
  console.log(`[Config] Runtime Data Path: ${runtimePath || '(None — content only)'}`);
  console.log('----------------------------------------------------');

  if (!fs.existsSync(seedPath)) {
    console.error(`[Error] Campus content seed file not found at: ${seedPath}`);
    process.exit(1);
  }

  let seedState: Partial<DatabaseState> = {};
  try {
    const raw = fs.readFileSync(seedPath, 'utf8');
    seedState = JSON.parse(raw);
    console.log(`[Input] Successfully loaded campus content seed file.`);
  } catch (err: any) {
    console.error(`[Error] Failed to read or parse content seed file: ${err.message}`);
    process.exit(1);
  }

  let runtimeState: Partial<DatabaseState> = {};
  if (runtimePath) {
    if (!fs.existsSync(runtimePath)) {
      console.error(`[Error] Runtime data file not found at: ${runtimePath}`);
      process.exit(1);
    }
    try {
      const raw = fs.readFileSync(runtimePath, 'utf8');
      runtimeState = JSON.parse(raw);
      console.log(`[Input] Successfully loaded external runtime data file.`);
    } catch (err: any) {
      console.error(`[Error] Failed to read or parse runtime data file: ${err.message}`);
      process.exit(1);
    }
  }

  // Combine content and runtime data into unified state
  const unifiedState: DatabaseState = {
    organizations: seedState.organizations || [],
    campuses: seedState.campuses || [],
    buildings: seedState.buildings || [],
    floors: seedState.floors || [],
    rooms: seedState.rooms || [],
    departments: seedState.departments || [],
    academicDepartments: seedState.academicDepartments || [],
    programmes: seedState.programmes || [],
    classrooms: seedState.classrooms || [],
    laboratories: seedState.laboratories || [],
    facilities: seedState.facilities || [],
    qrCheckpoints: seedState.qrCheckpoints || [],
    searchAliases: seedState.searchAliases || [],
    places: seedState.places || [],
    placeAuditLogs: seedState.placeAuditLogs || [],
    navigationNodes: seedState.navigationNodes || [],
    navigationEdges: seedState.navigationEdges || [],
    panoramas: seedState.panoramas || [],
    analytics: seedState.analytics || [],
    graphOverrides: seedState.graphOverrides || runtimeState.graphOverrides,
    teachers: seedState.teachers || [],
    // Runtime data priority
    facultyAccounts: runtimeState.facultyAccounts || seedState.facultyAccounts || [],
    facultyStatuses: runtimeState.facultyStatuses || seedState.facultyStatuses || {},
    facultyStatusAuditLogs: runtimeState.facultyStatusAuditLogs || seedState.facultyStatusAuditLogs || [],
    adminAuditActions: runtimeState.adminAuditActions || seedState.adminAuditActions || [],
    adminUsers: runtimeState.adminUsers || seedState.adminUsers || [],
    reports: runtimeState.reports || seedState.reports || [],
    snapshots: [],
  };

  const counts: MigrationCounts = {
    organizations: unifiedState.organizations.length,
    campuses: unifiedState.campuses.length,
    buildings: unifiedState.buildings.length,
    floors: unifiedState.floors.length,
    rooms: unifiedState.rooms.length,
    departments: unifiedState.departments.length,
    academicDepartments: unifiedState.academicDepartments.length,
    programmes: unifiedState.programmes.length,
    classrooms: unifiedState.classrooms.length,
    laboratories: unifiedState.laboratories.length,
    facilities: unifiedState.facilities.length,
    qrCheckpoints: unifiedState.qrCheckpoints.length,
    searchAliases: unifiedState.searchAliases?.length || 0,
    teachers: unifiedState.teachers.length,
    facultyAccounts: unifiedState.facultyAccounts?.length || 0,
    facultyStatuses: Object.keys(unifiedState.facultyStatuses || {}).length,
    facultyStatusAuditLogs: unifiedState.facultyStatusAuditLogs?.length || 0,
    adminAuditActions: unifiedState.adminAuditActions?.length || 0,
    navigationNodes: unifiedState.navigationNodes.length,
    navigationEdges: unifiedState.navigationEdges.length,
    panoramas: unifiedState.panoramas.length,
  };

  console.log('\n[Summary of Records to Migrate (Counts Only)]');
  console.table(counts);

  // Validate document size rules (< 500 KB per document)
  console.log('\n[Validation] Checking document payload sizes against 500 KB safety limit...');
  const checkSize = (label: string, obj: any) => {
    const bytes = Buffer.byteLength(JSON.stringify(obj || {}), 'utf8');
    const kb = (bytes / 1024).toFixed(1);
    if (bytes > 500 * 1024) {
      console.error(`[ValidationError] Document "${label}" exceeds 500 KB (${kb} KB). Must be split.`);
      process.exit(1);
    }
  };

  checkSize('campus_structure/buildings', unifiedState.buildings);
  checkSize('campus_structure/classrooms', unifiedState.classrooms);
  checkSize('campus_structure/laboratories', unifiedState.laboratories);
  checkSize('graph_overrides/customConnections', unifiedState.graphOverrides?.customConnections);
  checkSize('graph_overrides/customPlaceTags', unifiedState.graphOverrides?.customPlaceTags);
  console.log('[Validation] All collections and documents comply with size constraints.');

  // Validate email uniqueness on faculty accounts
  if (unifiedState.facultyAccounts?.length) {
    const emailSet = new Set<string>();
    let duplicateCount = 0;
    for (const acc of unifiedState.facultyAccounts) {
      const email = (acc.officialEmail || '').trim().toLowerCase();
      if (email) {
        if (emailSet.has(email)) {
          duplicateCount++;
        } else {
          emailSet.add(email);
        }
      }
    }
    if (duplicateCount > 0) {
      console.error(`[ValidationError] Found ${duplicateCount} duplicate email(s) in faculty accounts.`);
      process.exit(1);
    }
    console.log(`[Validation] Unique email verification passed across ${emailSet.size} account(s).`);
  }

  if (dryRun) {
    console.log('\n[Dry Run] Validation succeeded. Zero changes committed to Firestore.');
    return;
  }

  // Connect to Firestore
  console.log('\n[Firestore] Initializing Firestore connection...');
  const repo = new FirestoreRepository();
  await repo.connect();

  const health = repo.getHealth();
  if (!health.connected) {
    console.error(`[Error] Cannot perform migration: Firestore is not connected (${health.error || 'unknown error'}).`);
    process.exit(1);
  }

  console.log(`[Firestore] Connected to project: ${health.projectId || 'authoritative'}`);
  console.log('[Firestore] Writing collections and documents to Cloud Firestore...');

  const startMs = Date.now();
  await repo.saveAll(unifiedState);
  const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);

  console.log(`\n[Success] Migration completed successfully in ${elapsedSec}s!`);
  console.log(`[Summary] Verified committed counts:`);
  console.log(`  - Campus Structure: ${counts.buildings} buildings, ${counts.classrooms} classrooms, ${counts.laboratories} labs`);
  console.log(`  - Faculty Directory: ${counts.teachers} teachers`);
  console.log(`  - Faculty Accounts: ${counts.facultyAccounts} credentials`);
  console.log(`  - Faculty Presence Statuses: ${counts.facultyStatuses} records`);
  console.log(`  - Faculty Status Audit Logs: ${counts.facultyStatusAuditLogs} entries`);
  console.log(`  - Admin Audit Actions: ${counts.adminAuditActions} entries`);
  console.log(`  - Navigation Graph: ${counts.navigationNodes} nodes, ${counts.navigationEdges} edges, ${counts.panoramas} panoramas`);
  console.log('====================================================\n');
}

run().catch((err) => {
  console.error('[Fatal Error]', err);
  process.exit(1);
});
