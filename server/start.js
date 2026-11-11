const fs = require('fs');
const path = require('path');

const possibleEntryPoints = [
  path.join(__dirname, 'dist/server/src/index.js'),
  path.join(__dirname, 'dist/index.js'),
];

let launched = false;
for (const entry of possibleEntryPoints) {
  if (fs.existsSync(entry)) {
    console.log(`[CampusNav Boot] Starting production server from: ${entry}`);
    require(entry);
    launched = true;
    break;
  }
}

if (!launched) {
  console.log('[CampusNav Boot] Compiled dist not found, falling back to TypeScript tsx...');
  require('tsx/cjs');
  require(path.join(__dirname, 'src/index.ts'));
}
