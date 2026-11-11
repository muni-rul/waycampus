/**
 * generatePanoramaTiles.js
 * Multi-resolution Tile Pyramid Generator for WayCampus 360° Panoramas
 *
 * Slices 4K Equirectangular 360° Panorama Masters into:
 * - preview.jpg (1024x512 continuous baseline)
 * - LOD 0: 512x256 (1 tile)
 * - LOD 1: 1024x512 (2x1 grid of 512x512)
 * - LOD 2: 2048x1024 (4x2 grid of 512x512)
 * - LOD 3: 4096x2048 (8x4 grid of 512x512)
 * - manifest.json
 *
 * NEVER mutates or deletes original masters.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('../server/node_modules/sharp');

const ROOT_DIR = path.resolve(__dirname, '..');
const MASTERS_DIR = path.join(ROOT_DIR, 'client', 'public', 'assets', 'panoramas');
const OUTPUT_BASE_DIR = path.join(ROOT_DIR, 'client', 'public', 'panorama-tiles');
const GRAPH_FILE = path.join(ROOT_DIR, 'client', 'src', 'data', 'campusGraph.ts');

const TILE_SIZE = 512;
const JPEG_QUALITY = 82;

// Representative 3-panorama test subset
const TEST_SUBSET_IDS = ['outdoor_001', 'mg_259', 'sj_166'];

/**
 * Parses node metadata from campusGraph.ts
 */
function parseGraphNodes() {
  const content = fs.readFileSync(GRAPH_FILE, 'utf8');
  const regex = /makeNode\(\s*['"]([^'"]+)['"],\s*['"]([^'"]+)['"],\s*['"]([^'"]+)['"],\s*['"]([^'"]+)['"]/g;
  let match;
  const nodes = [];
  while ((match = regex.exec(content)) !== null) {
    nodes.push({
      id: match[1],
      filename: match[2],
      folder: match[3],
      area: match[4],
    });
  }
  return nodes;
}

/**
 * Finds the absolute filesystem path for a master panorama image
 */
function findMasterImagePath(folder, filename) {
  // 1. Direct path in declared folder
  const primaryPath = path.join(MASTERS_DIR, folder, filename);
  if (fs.existsSync(primaryPath)) return primaryPath;

  // 2. Search across all area folders in case file was placed in another folder
  if (fs.existsSync(MASTERS_DIR)) {
    const subdirs = fs.readdirSync(MASTERS_DIR);
    for (const sub of subdirs) {
      const candidate = path.join(MASTERS_DIR, sub, filename);
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  return null;
}

/**
 * Generates the multi-resolution tile pyramid for a single panorama node
 */
async function generateTilesForNode(node, force = false) {
  const startTime = Date.now();
  const nodeOutputDir = path.join(OUTPUT_BASE_DIR, node.id);
  const manifestPath = path.join(nodeOutputDir, 'manifest.json');

  if (fs.existsSync(manifestPath) && !force) {
    console.log(`[SKIP] Tiles already exist for ${node.id}: ${manifestPath}`);
    return { success: true, skipped: true, nodeId: node.id };
  }

  const masterPath = findMasterImagePath(node.folder, node.filename);
  if (!masterPath) {
    console.error(`[ERROR] Master image not found for node ${node.id} (${node.folder}/${node.filename})`);
    return { success: false, error: 'MASTER_NOT_FOUND', nodeId: node.id };
  }

  // Ensure output directories exist
  fs.mkdirSync(nodeOutputDir, { recursive: true });
  fs.mkdirSync(path.join(nodeOutputDir, 'lod-0'), { recursive: true });
  fs.mkdirSync(path.join(nodeOutputDir, 'lod-1'), { recursive: true });
  fs.mkdirSync(path.join(nodeOutputDir, 'lod-2'), { recursive: true });
  fs.mkdirSync(path.join(nodeOutputDir, 'lod-3'), { recursive: true });

  const metadata = await sharp(masterPath).metadata();
  const srcWidth = metadata.width || 4096;
  const srcHeight = metadata.height || 2048;

  // ── 1. Generate preview.jpg (1024x512, continuous baseline) ──
  await sharp(masterPath)
    .resize(1024, 512, { fit: 'fill' })
    .jpeg({ quality: 78, mozjpeg: true })
    .toFile(path.join(nodeOutputDir, 'preview.jpg'));

  // ── 2. Generate LOD 0 (512x256, single tile) ──
  await sharp(masterPath)
    .resize(512, 256, { fit: 'fill' })
    .jpeg({ quality: 75, mozjpeg: true })
    .toFile(path.join(nodeOutputDir, 'lod-0', 'tile_0_0.jpg'));

  // ── 3. Generate LOD 1 (1024x512, 2 cols x 1 row) ──
  const lod1Buffer = await sharp(masterPath)
    .resize(1024, 512, { fit: 'fill' })
    .toBuffer();

  for (let c = 0; c < 2; c++) {
    await sharp(lod1Buffer)
      .extract({ left: c * TILE_SIZE, top: 0, width: TILE_SIZE, height: TILE_SIZE })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toFile(path.join(nodeOutputDir, 'lod-1', `tile_0_${c}.jpg`));
  }

  // ── 4. Generate LOD 2 (2048x1024, 4 cols x 2 rows) ──
  const lod2Buffer = await sharp(masterPath)
    .resize(2048, 1024, { fit: 'fill' })
    .toBuffer();

  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 4; c++) {
      await sharp(lod2Buffer)
        .extract({ left: c * TILE_SIZE, top: r * TILE_SIZE, width: TILE_SIZE, height: TILE_SIZE })
        .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
        .toFile(path.join(nodeOutputDir, 'lod-2', `tile_${r}_${c}.jpg`));
    }
  }

  // ── 5. Generate LOD 3 (4096x2048, 8 cols x 4 rows) ──
  // Resize to exactly 4096x2048 buffer if original differs
  let lod3Buffer;
  if (srcWidth === 4096 && srcHeight === 2048) {
    lod3Buffer = fs.readFileSync(masterPath);
  } else {
    lod3Buffer = await sharp(masterPath)
      .resize(4096, 2048, { fit: 'fill' })
      .toBuffer();
  }

  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 8; c++) {
      await sharp(lod3Buffer)
        .extract({ left: c * TILE_SIZE, top: r * TILE_SIZE, width: TILE_SIZE, height: TILE_SIZE })
        .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
        .toFile(path.join(nodeOutputDir, 'lod-3', `tile_${r}_${c}.jpg`));
    }
  }

  // ── 6. Write manifest.json ──
  const manifest = {
    panoramaId: node.id,
    sourceFilename: node.filename,
    version: '1.0',
    projection: 'equirectangular',
    tileSize: TILE_SIZE,
    sourceWidth: srcWidth,
    sourceHeight: srcHeight,
    preview: 'preview.jpg',
    levels: [
      {
        level: 0,
        width: 512,
        height: 256,
        columns: 1,
        rows: 1,
        tilePattern: 'lod-0/tile_0_0.jpg',
      },
      {
        level: 1,
        width: 1024,
        height: 512,
        columns: 2,
        rows: 1,
        tilePattern: 'lod-1/tile_{r}_{c}.jpg',
      },
      {
        level: 2,
        width: 2048,
        height: 1024,
        columns: 4,
        rows: 2,
        tilePattern: 'lod-2/tile_{r}_{c}.jpg',
      },
      {
        level: 3,
        width: 4096,
        height: 2048,
        columns: 8,
        rows: 4,
        tilePattern: 'lod-3/tile_{r}_{c}.jpg',
      },
    ],
    generatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[DONE] ${node.id} generated (43 tiles + preview) in ${durationSec}s -> ${nodeOutputDir}`);
  return { success: true, nodeId: node.id, durationSec };
}

/**
 * Main CLI handler
 */
async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');

  console.log('=== WayCampus 360° Panorama Tile Generator ===');
  const allNodes = parseGraphNodes();
  console.log(`Loaded ${allNodes.length} graph nodes from campusGraph.ts`);

  let targetNodes = [];

  const nodeArgIdx = args.indexOf('--node');
  if (nodeArgIdx !== -1 && args[nodeArgIdx + 1]) {
    const targetId = args[nodeArgIdx + 1];
    const found = allNodes.find((n) => n.id.toLowerCase() === targetId.toLowerCase());
    if (!found) {
      console.error(`Node ID "${targetId}" not found in campusGraph.ts`);
      process.exit(1);
    }
    targetNodes = [found];
  } else if (args.includes('--test-subset')) {
    console.log(`Selecting 3 representative test panoramas: ${TEST_SUBSET_IDS.join(', ')}`);
    targetNodes = allNodes.filter((n) => TEST_SUBSET_IDS.includes(n.id));
  } else if (args.includes('--all')) {
    targetNodes = allNodes;
  } else {
    console.log('Usage:');
    console.log('  node scripts/generatePanoramaTiles.js --test-subset');
    console.log('  node scripts/generatePanoramaTiles.js --node <nodeId>');
    console.log('  node scripts/generatePanoramaTiles.js --all');
    console.log('  Add --force to regenerate existing tiles.');
    process.exit(0);
  }

  const concurrencyArgIdx = args.indexOf('--concurrency');
  const concurrency = concurrencyArgIdx !== -1 && parseInt(args[concurrencyArgIdx + 1], 10)
    ? Math.max(1, Math.min(8, parseInt(args[concurrencyArgIdx + 1], 10)))
    : 4;

  console.log(`Processing ${targetNodes.length} panorama(s) with concurrency ${concurrency}...`);
  const overallStart = Date.now();
  let successCount = 0;
  let failCount = 0;

  let currentIndex = 0;
  async function worker() {
    while (currentIndex < targetNodes.length) {
      const idx = currentIndex++;
      const node = targetNodes[idx];
      console.log(`[${idx + 1}/${targetNodes.length}] Generating tiles for ${node.id}...`);
      try {
        const res = await generateTilesForNode(node, force);
        if (res.success) successCount++;
        else failCount++;
      } catch (err) {
        console.error(`Failed to process node ${node.id}:`, err);
        failCount++;
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, targetNodes.length) }, () => worker());
  await Promise.all(workers);

  const totalTime = ((Date.now() - overallStart) / 1000).toFixed(1);
  console.log('==============================================');
  console.log(`Finished: ${successCount} succeeded, ${failCount} failed in ${totalTime}s`);
  console.log('==============================================');
}

main().catch((err) => {
  console.error('Fatal error in tile generator:', err);
  process.exit(1);
});
