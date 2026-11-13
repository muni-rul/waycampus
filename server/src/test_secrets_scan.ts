import fs from 'fs';
import path from 'path';

console.log('=== RUNNING SECRETS & LEGACY STRINGS SCAN ===');

const patterns = [
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
  /\"private_key\":\s*\"-----BEGIN/,
  /ghp_[A-Za-z0-9_]{30,}/,
  /github_pat_[A-Za-z0-9_]{30,}/,
  /service_account/
];

const ignoredDirs = new Set(['.git', 'node_modules', 'dist', '.gemini']);

const flaggedFiles: string[] = [];

function scanDir(dir: string) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(fullPath);
    } else if (entry.isFile()) {
      if (entry.name.endsWith('.png') || entry.name.endsWith('.jpg') || entry.name.endsWith('.ico')) continue;
      // Skip example/template/doc files that legitimately mention patterns
      if (entry.name.includes('.example') || entry.name.includes('template') || entry.name.endsWith('.md')) {
        continue;
      }
      // Skip test files testing security rules or scanning
      if (entry.name.startsWith('test_')) {
        continue;
      }
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const pattern of patterns) {
        if (pattern.test(content)) {
          flaggedFiles.push(fullPath);
          break;
        }
      }
    }
  }
}

scanDir('.');
console.log('Flagged files count:', flaggedFiles.length);
if (flaggedFiles.length > 0) {
  console.log('Files:', flaggedFiles);
} else {
  console.log('✓ PASS: No secrets or service_account found in source files');
}
