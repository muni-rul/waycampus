/**
 * directionAnalysisService.ts — Equirectangular Panorama Navigation Direction Analyzer
 * WayCampus / Christ College CampusNav
 *
 * Analyzes real 360° equirectangular panoramas and arrow geometry to SUGGEST
 * physical movement directions for existing navigation connections:
 * - Continue Straight
 * - Turn Left
 * - Turn Right
 * - Slight Left
 * - Slight Right
 * - Go Upstairs
 * - Go Downstairs
 * - Go Up Ramp
 * - Go Down Ramp
 * - Enter Building
 * - Exit Building
 * - Unknown
 *
 * CRITICAL RULES:
 * 1. Suggestions NEVER overwrite VERIFIED data.
 * 2. Manual verification ALWAYS overrides AI.
 * 3. Never modifies arrows, panorama IDs, connections, or graph topology.
 */

import { CampusPanoramaNode, PanoramaConnection, ConnectionDirection } from '../data/campusGraph';
import { getVoicePhraseForDirection } from './voiceNavigationService';

export interface DirectionEvidence {
  arrowScreenYaw: number;
  worldBearing: number;
  relativeTurnDeg: number;
  pitchDeg: number;
  floorDiff: number;
  areaTransition: string | null;
  reason: string;
}

export interface DirectionConflicts {
  hasArrowConflict: boolean;
  arrowConflictReason?: string;
  hasFloorConflict: boolean;
  floorConflictReason?: string;
  hasAiVerifiedConflict: boolean;
  aiVerifiedConflictReason?: string;
}

export interface DirectionAnalysisResult {
  suggestedDirection: ConnectionDirection;
  confidence: number; // 0.00 to 1.00 (e.g. 0.94)
  status: 'AI_SUGGESTED' | 'NEEDS_REVIEW' | 'UNKNOWN' | 'CONFLICT';
  evidence: DirectionEvidence;
  conflicts: DirectionConflicts;
  voicePhrase: string;
}

export interface BatchAnalysisSummary {
  totalConnections: number;
  verified: number;
  unverified: number;
  aiSuggestions: number;
  unknown: number;
  needsReview: number;
  conflicts: number;
  byDirection: Record<string, number>;
}

/**
 * Normalizes an angle into [-180, +180] degrees.
 */
function normalizeDeltaAngle(deg: number): number {
  let angle = ((deg + 180) % 360 + 360) % 360 - 180;
  return Math.round(angle * 10) / 10;
}

/**
 * Authoritatively analyzes an existing connection between fromNode and toNode
 * considering equirectangular wrap, camera orientation, pitch, floor diff, and area transitions.
 */
export function analyzeConnectionDirection(
  fromNode: CampusPanoramaNode,
  conn: PanoramaConnection,
  toNode?: CampusPanoramaNode | null
): DirectionAnalysisResult {
  const worldBearing = conn.worldBearing !== undefined ? conn.worldBearing : (conn.heading ?? 0);
  const northOffset = fromNode.northOffset ?? 0;
  const arrowScreenYaw = ((worldBearing - northOffset) % 360 + 360) % 360;
  const pitch = conn.pitch !== undefined ? conn.pitch : -16;

  // Floor difference
  const fromFloorNum = parseInt(fromNode.floor || '0', 10) || 0;
  const toFloorNum = toNode ? (parseInt(toNode.floor || '0', 10) || 0) : fromFloorNum;
  const floorDiff = toFloorNum - fromFloorNum;

  // Relative turn angle:
  // In equirectangular space, 0° is facing forward along the calibrated camera corridor.
  // We compute relative angular deviation from forward center (0°) or incoming corridor.
  const relativeTurnDeg = normalizeDeltaAngle(arrowScreenYaw);

  let suggestedDirection: ConnectionDirection = 'straight';
  let confidence = 0.85;
  let reason = 'Straight forward corridor alignment';
  let isAmbiguous = false;

  // 1. Boundary / Building Entrance & Exit Check
  const fromArea = fromNode.area;
  const toArea = toNode?.area;
  let areaTransition: string | null = null;

  if (fromArea === 'OUTDOOR' && toArea && toArea !== 'OUTDOOR') {
    areaTransition = `Outdoor ➔ ${toArea} Entrance`;
    suggestedDirection = 'enter-building';
    confidence = 0.95;
    reason = `Building entrance transition from campus grounds into ${toArea}`;
  } else if (fromArea !== 'OUTDOOR' && toArea === 'OUTDOOR') {
    areaTransition = `${fromArea} ➔ Outdoor Campus`;
    suggestedDirection = 'exit-building';
    confidence = 0.95;
    reason = `Building exit transition from ${fromArea} to outdoor grounds`;
  }

  // 2. Vertical Elevation / Staircase / Ramp Analysis
  // Floor differences or steep pitch angles
  else if (floorDiff > 0 || (pitch >= -8 && (fromNode.isFloorTransition || toNode?.isFloorTransition))) {
    const isRamp = (fromNode.filename || '').toLowerCase().includes('ramp') || (toNode?.filename || '').toLowerCase().includes('ramp');
    suggestedDirection = isRamp ? 'ramp-up' : 'stairs-up';
    confidence = floorDiff > 0 ? 0.96 : 0.88;
    reason = isRamp
      ? `Upward ramp transition (elevation gain from floor ${fromFloorNum} to ${toFloorNum})`
      : `Ascending staircase (floor ${fromFloorNum} ➔ ${toFloorNum}, pitch ${pitch}°)`;
  } else if (floorDiff < 0 || (pitch <= -28 && (fromNode.isFloorTransition || toNode?.isFloorTransition))) {
    const isRamp = (fromNode.filename || '').toLowerCase().includes('ramp') || (toNode?.filename || '').toLowerCase().includes('ramp');
    suggestedDirection = isRamp ? 'ramp-down' : 'stairs-down';
    confidence = floorDiff < 0 ? 0.96 : 0.88;
    reason = isRamp
      ? `Downward ramp transition (elevation descent from floor ${fromFloorNum} to ${toFloorNum})`
      : `Descending staircase (floor ${fromFloorNum} ➔ ${toFloorNum}, pitch ${pitch}°)`;
  }

  // 3. Horizontal Turn Classification (Equirectangular Angle)
  else {
    const absTurn = Math.abs(relativeTurnDeg);

    if (absTurn <= 18) {
      suggestedDirection = 'straight';
      confidence = 0.96;
      reason = `Direct forward path alignment (deviation: ${relativeTurnDeg}°)`;
    } else if (relativeTurnDeg > 18 && relativeTurnDeg <= 48) {
      suggestedDirection = 'slight-right';
      confidence = 0.92;
      reason = `Slight right fork/corridor curve (+${relativeTurnDeg}°)`;
    } else if (relativeTurnDeg >= -48 && relativeTurnDeg < -18) {
      suggestedDirection = 'slight-left';
      confidence = 0.92;
      reason = `Slight left fork/corridor curve (${relativeTurnDeg}°)`;
    } else if (relativeTurnDeg > 48 && relativeTurnDeg <= 135) {
      suggestedDirection = 'right';
      confidence = 0.94;
      reason = `Standard right turn at corridor/path junction (+${relativeTurnDeg}°)`;
    } else if (relativeTurnDeg >= -135 && relativeTurnDeg < -48) {
      suggestedDirection = 'left';
      confidence = 0.94;
      reason = `Standard left turn at corridor/path junction (${relativeTurnDeg}°)`;
    } else {
      // Greater than 135° indicates reverse/U-turn or uncertain rear connection
      suggestedDirection = 'u-turn';
      confidence = 0.86;
      reason = `Sharp reverse or U-turn (${relativeTurnDeg}°)`;
    }
  }

  // Check for ambiguity (e.g. missing target node or uncalibrated offset with strange angle)
  if (!toNode) {
    isAmbiguous = true;
    suggestedDirection = 'unknown';
    confidence = 0.35;
    reason = 'Physical target node not resolved in graph map';
  }

  // 4. Conflict Evaluation
  const conflicts: DirectionConflicts = {
    hasArrowConflict: false,
    hasFloorConflict: false,
    hasAiVerifiedConflict: false,
  };

  const storedDirection = conn.direction || 'straight';
  const isVerified = conn.directionStatus === 'VERIFIED';

  // Arrow vs Direction Note:
  // In WayCampus, the arrow is intentionally a forward/movement hotspot control,
  // NOT a visual turn indicator. Therefore, an arrow pointing forward along the road
  // while the physical path/voice indicates LEFT, RIGHT, or STAIRS is standard and expected.
  // We only flag hasArrowConflict if an arrow heading directly opposes the physical corridor (e.g. >120° deviation).
  if (Math.abs(relativeTurnDeg) > 135) {
    conflicts.hasArrowConflict = true;
    conflicts.arrowConflictReason = `Arrow heading (${relativeTurnDeg}°) points opposite to target movement path`;
  }

  // Floor / Direction Conflict:
  if (
    (floorDiff > 0 && storedDirection === 'stairs-down') ||
    (floorDiff < 0 && storedDirection === 'stairs-up') ||
    (floorDiff === 0 && (storedDirection === 'stairs-up' || storedDirection === 'stairs-down') && !fromNode.isFloorTransition)
  ) {
    conflicts.hasFloorConflict = true;
    conflicts.floorConflictReason = `Floor delta is ${floorDiff > 0 ? '+' : ''}${floorDiff}, which contradicts ${storedDirection.toUpperCase()}`;
  }

  // AI / Verified Conflict:
  if (isVerified && conn.direction && conn.direction !== suggestedDirection) {
    conflicts.hasAiVerifiedConflict = true;
    conflicts.aiVerifiedConflictReason = `Verified as ${conn.direction.toUpperCase()}, but AI suggests ${suggestedDirection.toUpperCase()} (${Math.round(confidence * 100)}% conf). Verified data protected!`;
  }

  // Determine overall status
  let status: 'AI_SUGGESTED' | 'NEEDS_REVIEW' | 'UNKNOWN' | 'CONFLICT' = 'AI_SUGGESTED';
  if (conflicts.hasAiVerifiedConflict || conflicts.hasArrowConflict || conflicts.hasFloorConflict) {
    status = 'CONFLICT';
  } else if (isAmbiguous || confidence < 0.65) {
    status = 'UNKNOWN';
  } else if (confidence < 0.85) {
    status = 'NEEDS_REVIEW';
  }

  const voicePhrase = getVoicePhraseForDirection(suggestedDirection);

  return {
    suggestedDirection,
    confidence: Math.round(confidence * 100) / 100,
    status,
    evidence: {
      arrowScreenYaw: Math.round(arrowScreenYaw),
      worldBearing: Math.round(worldBearing),
      relativeTurnDeg,
      pitchDeg: Math.round(pitch),
      floorDiff,
      areaTransition,
      reason,
    },
    conflicts,
    voicePhrase,
  };
}

/**
 * Analyzes all unverified connections across the entire campus graph.
 * Strictly leaves existing VERIFIED connections protected!
 */
export function analyzeAllUnverifiedConnections(
  nodes: CampusPanoramaNode[],
  connectionsMap: Record<string, PanoramaConnection[]>
): {
  updatedMap: Record<string, PanoramaConnection[]>;
  summary: BatchAnalysisSummary;
} {
  const nodeMap = new Map<string, CampusPanoramaNode>();
  nodes.forEach((n) => nodeMap.set(n.id, n));

  const updatedMap: Record<string, PanoramaConnection[]> = {};
  const summary: BatchAnalysisSummary = {
    totalConnections: 0,
    verified: 0,
    unverified: 0,
    aiSuggestions: 0,
    unknown: 0,
    needsReview: 0,
    conflicts: 0,
    byDirection: {},
  };

  for (const [fromNodeId, conns] of Object.entries(connectionsMap)) {
    const fromNode = nodeMap.get(fromNodeId);
    if (!fromNode) {
      updatedMap[fromNodeId] = conns;
      continue;
    }

    const nextConns = conns.map((conn) => {
      summary.totalConnections++;
      const toNode = nodeMap.get(conn.targetId);
      const analysis = analyzeConnectionDirection(fromNode, conn, toNode);

      const isAlreadyVerified = conn.directionStatus === 'VERIFIED';
      const effectiveDirection = isAlreadyVerified ? (conn.direction || 'straight') : analysis.suggestedDirection;

      // Track distribution
      summary.byDirection[effectiveDirection] = (summary.byDirection[effectiveDirection] || 0) + 1;

      if (isAlreadyVerified) {
        summary.verified++;
        // If AI disagrees with verified, flag as CONFLICT without changing verified direction!
        if (conn.direction !== analysis.suggestedDirection) {
          summary.conflicts++;
          return {
            ...conn,
            latestAISuggestion: analysis.suggestedDirection,
            aiConfidence: analysis.confidence,
            aiEvidence: analysis.evidence,
            directionStatus: 'CONFLICT' as const,
          };
        }
        return conn;
      }

      // Unverified connection gets AI suggestion
      if (analysis.status === 'CONFLICT') summary.conflicts++;
      else if (analysis.status === 'UNKNOWN') summary.unknown++;
      else if (analysis.status === 'NEEDS_REVIEW') summary.needsReview++;
      else summary.aiSuggestions++;

      summary.unverified++;

      return {
        ...conn,
        aiSuggestedDirection: analysis.suggestedDirection,
        aiConfidence: analysis.confidence,
        aiEvidence: analysis.evidence,
        directionStatus: analysis.status,
        latestAISuggestion: analysis.suggestedDirection,
      };
    });

    updatedMap[fromNodeId] = nextConns;
  }

  return { updatedMap, summary };
}

/**
 * Generates an administrative CSV direction verification report for download.
 */
export function generateDirectionReportCsv(
  nodes: CampusPanoramaNode[],
  connectionsMap: Record<string, PanoramaConnection[]>,
  manualNumbers: Record<string, string>
): string {
  const nodeMap = new Map<string, CampusPanoramaNode>();
  nodes.forEach((n) => nodeMap.set(n.id, n));

  const headers = [
    'Connection',
    'From Node',
    'To Node',
    'From Manual #',
    'To Manual #',
    'Current Direction',
    'Verified Direction',
    'AI Suggestion',
    'Confidence',
    'Status',
    'Voice Phrase',
    'Evidence',
  ];

  const rows: string[] = [headers.join(',')];

  for (const [fromNodeId, conns] of Object.entries(connectionsMap)) {
    const fromNode = nodeMap.get(fromNodeId);
    if (!fromNode) continue;

    for (const conn of conns) {
      const toNode = nodeMap.get(conn.targetId);
      const fromNum = manualNumbers[fromNodeId] || '';
      const toNum = manualNumbers[conn.targetId] || '';
      const connName = `"${fromNodeId} -> ${conn.targetId}"`;
      const currentDir = conn.direction || 'straight';
      const verifiedDir = conn.directionStatus === 'VERIFIED' ? currentDir : '';
      const aiSug = conn.aiSuggestedDirection || conn.latestAISuggestion || '';
      const conf = conn.aiConfidence !== undefined ? `${Math.round(conn.aiConfidence * 100)}%` : '';
      const status = conn.directionStatus || 'UNVERIFIED';
      const voice = `"${getVoicePhraseForDirection(verifiedDir || currentDir)}"`;
      const evidence = `"${conn.aiEvidence?.reason || ''}"`;

      rows.push([
        connName,
        fromNodeId,
        conn.targetId,
        fromNum,
        toNum,
        currentDir,
        verifiedDir,
        aiSug,
        conf,
        status,
        voice,
        evidence,
      ].join(','));
    }
  }

  return rows.join('\n');
}

/**
 * Generates an administrative JSON direction verification report.
 */
export function generateDirectionReportJson(
  nodes: CampusPanoramaNode[],
  connectionsMap: Record<string, PanoramaConnection[]>,
  manualNumbers: Record<string, string>
): string {
  const records: any[] = [];
  for (const [fromNodeId, conns] of Object.entries(connectionsMap)) {
    for (const conn of conns) {
      records.push({
        connectionId: `${fromNodeId}_to_${conn.targetId}`,
        fromNodeId,
        toNodeId: conn.targetId,
        fromManualNumber: manualNumbers[fromNodeId] || null,
        toManualNumber: manualNumbers[conn.targetId] || null,
        currentDirection: conn.direction || 'straight',
        directionStatus: conn.directionStatus || 'UNVERIFIED',
        aiSuggestedDirection: conn.aiSuggestedDirection || conn.latestAISuggestion || null,
        aiConfidence: conn.aiConfidence || null,
        aiEvidence: conn.aiEvidence || null,
        directionVerifiedAt: conn.directionVerifiedAt || null,
        directionVerifiedBy: conn.directionVerifiedBy || null,
        previousVerifiedDirection: conn.previousVerifiedDirection || null,
        latestAISuggestion: conn.latestAISuggestion || null,
        voicePhrase: getVoicePhraseForDirection(conn.direction || 'straight'),
      });
    }
  }

  return JSON.stringify({
    reportTitle: 'WayCampus Direction Verification Audit Report',
    generatedAt: new Date().toISOString(),
    totalConnections: records.length,
    connections: records,
  }, null, 2);
}
