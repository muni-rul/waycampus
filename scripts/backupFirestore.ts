import fs from 'fs';
import path from 'path';
import { FirestoreRepository } from '../server/src/db/repository/FirestoreRepository';

/**
 * CampNav Firestore Backup Script
 *
 * Downloads complete database snapshot from Cloud Firestore into an external backup directory.
 * Includes complete state (faculty accounts with bcrypt hashes, statuses, audit logs, graph overrides).
 *
 * Usage:
 *   npx tsx scripts/backupFirestore.ts --out <directory_path>
 */

function parseCliArgs() {
  const args = process.argv.slice(2);
  let outDir = '';

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--out' || args[i] === '-o') && args[i + 1]) {
      outDir = path.resolve(args[i + 1]);
      i++;
    } else if (!args[i].startsWith('-') && !outDir) {
      outDir = path.resolve(args[i]);
    }
  }

  return { outDir };
}

async function run() {
  const { outDir } = parseCliArgs();

  if (!outDir) {
    console.error('[Error] Target backup directory is required. Usage: npx tsx scripts/backupFirestore.ts --out <dir_path>');
    process.exit(1);
  }

  console.log('====================================================');
  console.log('       CAMPNAV FIRESTORE DATABASE BACKUP TOOL       ');
  console.log('====================================================');
  console.log(`[Config] Target Backup Directory: ${outDir}`);

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
    console.log(`[Output] Created directory: ${outDir}`);
  }

  console.log('[Firestore] Connecting to Cloud Firestore...');
  const repo = new FirestoreRepository();
  await repo.connect();

  const health = repo.getHealth();
  if (!health.connected) {
    console.error(`[Error] Firestore is not connected: ${health.error || 'unreachable'}`);
    process.exit(1);
  }

  console.log(`[Firestore] Connected to project: ${health.projectId || 'authoritative'}`);
  console.log('[Firestore] Downloading full database state...');

  const startTime = Date.now();
  const state = await repo.loadAll();
  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `campusnav_firestore_backup_${timestamp}.json`;
  const filePath = path.join(outDir, filename);

  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
  const fileSizeBytes = fs.statSync(filePath).size;
  const fileSizeMb = (fileSizeBytes / (1024 * 1024)).toFixed(2);

  console.log(`\n[Success] Backup written to: ${filePath} (${fileSizeMb} MB, completed in ${elapsedSec}s)`);
  console.log('[Backup Summary (Record Counts Only)]');
  console.log(`  - Buildings: ${state.buildings?.length || 0}`);
  console.log(`  - Classrooms: ${state.classrooms?.length || 0}`);
  console.log(`  - Laboratories: ${state.laboratories?.length || 0}`);
  console.log(`  - Teachers: ${state.teachers?.length || 0}`);
  console.log(`  - Faculty Accounts: ${state.facultyAccounts?.length || 0}`);
  console.log(`  - Faculty Statuses: ${Object.keys(state.facultyStatuses || {}).length}`);
  console.log(`  - Faculty Status Audit Logs: ${state.facultyStatusAuditLogs?.length || 0}`);
  console.log(`  - Admin Audit Actions: ${state.adminAuditActions?.length || 0}`);
  console.log(`  - Navigation Nodes: ${state.navigationNodes?.length || 0}`);
  console.log(`  - Navigation Edges: ${state.navigationEdges?.length || 0}`);
  console.log(`  - Panoramas: ${state.panoramas?.length || 0}`);
  console.log('====================================================\n');
}

run().catch((err) => {
  console.error('[Fatal Error]', err);
  process.exit(1);
});
