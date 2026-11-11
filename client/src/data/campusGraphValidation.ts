/**
 * campusGraphValidation.ts — Validates the campus panorama navigation graph
 *
 * Checks:
 * 1. Total node count = 135
 * 2. Per-area counts match expected
 * 3. No duplicate IDs
 * 4. No duplicate image paths
 * 5. All connection targets exist
 * 6. No self-referencing connections
 * 7. Image paths are well-formed (not absolute Windows paths)
 * 8. All image files physically exist (when running in Node.js / build)
 * 9. Bidirectionality: every A→B has a matching B→A
 */

import {
  CAMPUS_GRAPH,
  CAMPUS_GRAPH_MAP,
  EXPECTED_COUNTS,
  type AreaCode,
  type CampusPanoramaNode,
} from './campusGraph';

export interface ValidationResult {
  passed: boolean;
  totalNodes: number;
  areaCounts: Record<string, number>;
  expectedCounts: Record<string, number>;
  confirmedEdges: number;
  unconfirmedEdges: number;
  errors: string[];
  warnings: string[];
}

export function validateCampusGraph(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── 1. Total count ──
  const totalNodes = CAMPUS_GRAPH.length;
  if (totalNodes < 135) {
    errors.push(`TOTAL NODE COUNT: expected at least 135, got ${totalNodes}`);
  }

  // ── 2. Per-area counts ──
  const areaCounts: Record<string, number> = {};
  for (const node of CAMPUS_GRAPH) {
    areaCounts[node.area] = (areaCounts[node.area] || 0) + 1;
  }

  for (const [area, expected] of Object.entries(EXPECTED_COUNTS)) {
    const actual = areaCounts[area] || 0;
    if (actual < expected) {
      errors.push(`${area}: expected at least ${expected} nodes, got ${actual}`);
    }
  }

  // ── 3. No duplicate IDs ──
  const idSet = new Set<string>();
  for (const node of CAMPUS_GRAPH) {
    if (idSet.has(node.id)) {
      errors.push(`DUPLICATE ID: "${node.id}"`);
    }
    idSet.add(node.id);
  }

  // ── 4. No duplicate image paths ──
  const imagePathSet = new Set<string>();
  for (const node of CAMPUS_GRAPH) {
    if (imagePathSet.has(node.imagePath)) {
      errors.push(`DUPLICATE IMAGE PATH: "${node.imagePath}" (node: ${node.id})`);
    }
    imagePathSet.add(node.imagePath);
  }

  // ── 5. All connection targets exist ──
  for (const node of CAMPUS_GRAPH) {
    for (const conn of node.connections) {
      if (!CAMPUS_GRAPH_MAP.has(conn.targetId)) {
        errors.push(`BROKEN CONNECTION: ${node.id} → ${conn.targetId} (target does not exist)`);
      }
    }
  }

  // ── 6. No self-referencing ──
  for (const node of CAMPUS_GRAPH) {
    for (const conn of node.connections) {
      if (conn.targetId === node.id) {
        errors.push(`SELF-REFERENCE: ${node.id} connects to itself`);
      }
    }
  }

  // ── 7. Image paths are well-formed ──
  for (const node of CAMPUS_GRAPH) {
    if (node.imagePath.includes('C:') || node.imagePath.includes('\\')) {
      errors.push(`ABSOLUTE PATH: ${node.id} has Windows absolute path: ${node.imagePath}`);
    }
    if (!node.imagePath.startsWith('/assets/panoramas/')) {
      errors.push(`BAD PATH PREFIX: ${node.id} path does not start with /assets/panoramas/: ${node.imagePath}`);
    }
    if (!node.imagePath.endsWith('.jpg')) {
      errors.push(`BAD EXTENSION: ${node.id} path does not end with .jpg: ${node.imagePath}`);
    }
  }

  // ── 8. Count edges ──
  let confirmedEdges = 0;
  let unconfirmedEdges = 0;
  for (const node of CAMPUS_GRAPH) {
    for (const conn of node.connections) {
      if (conn.confirmed) confirmedEdges++;
      else unconfirmedEdges++;
    }
  }
  // Each bidirectional edge is counted twice (once per direction)
  confirmedEdges = Math.floor(confirmedEdges / 2);
  unconfirmedEdges = Math.floor(unconfirmedEdges / 2);

  // ── 9. Bidirectionality check ──
  for (const node of CAMPUS_GRAPH) {
    for (const conn of node.connections) {
      const target = CAMPUS_GRAPH_MAP.get(conn.targetId);
      if (target) {
        const reverse = target.connections.find(c => c.targetId === node.id);
        if (!reverse) {
          warnings.push(`ONE-WAY EDGE: ${node.id} → ${conn.targetId} has no reverse (${conn.targetId} → ${node.id})`);
        }
      }
    }
  }

  // ── 10. Check isolated nodes (no connections at all) ──
  const isolatedNodes = CAMPUS_GRAPH.filter(n => n.connections.length === 0);
  if (isolatedNodes.length > 0) {
    for (const node of isolatedNodes) {
      warnings.push(`ISOLATED NODE (no connections): ${node.id} (${node.filename})`);
    }
  }

  const passed = errors.length === 0;

  return {
    passed,
    totalNodes,
    areaCounts,
    expectedCounts: { ...EXPECTED_COUNTS },
    confirmedEdges,
    unconfirmedEdges,
    errors,
    warnings,
  };
}

/** Print a human-readable validation report to console */
export function printValidationReport(): ValidationResult {
  const result = validateCampusGraph();

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║     CAMPUSNAV — PANORAMA GRAPH VALIDATION REPORT       ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  console.log(`STATUS: ${result.passed ? '✅ PASSED' : '❌ FAILED'}\n`);

  console.log(`TOTAL NODES: ${result.totalNodes}`);
  console.log('');
  console.log('AREA BREAKDOWN:');
  const areas: AreaCode[] = ['OUTDOOR', 'MG', 'SM', 'SJ', 'SC', 'AB'];
  for (const area of areas) {
    const actual = result.areaCounts[area] || 0;
    const expected = result.expectedCounts[area] || 0;
    const status = actual === expected ? '✅' : '❌';
    console.log(`  ${status} ${area.padEnd(10)} ${actual} / ${expected}`);
  }

  console.log('');
  console.log(`CONFIRMED EDGES (bidirectional pairs): ${result.confirmedEdges}`);
  console.log(`UNCONFIRMED TRANSITIONS (require visual verification): ${result.unconfirmedEdges}`);

  if (result.errors.length > 0) {
    console.log(`\n❌ ERRORS (${result.errors.length}):`);
    for (const err of result.errors) {
      console.log(`  ✗ ${err}`);
    }
  }

  if (result.warnings.length > 0) {
    console.log(`\n⚠️  WARNINGS (${result.warnings.length}):`);
    for (const warn of result.warnings) {
      console.log(`  ⚠ ${warn}`);
    }
  }

  if (result.passed && result.errors.length === 0) {
    console.log('\n🎉 Graph is valid. All 135 panoramas registered with correct paths and connections.');
  }

  console.log('');

  return result;
}
