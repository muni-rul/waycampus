import React, { useMemo, useState } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Compass,
  ArrowRight,
  Sparkles,
  HelpCircle,
  Filter,
  Eye,
  Download,
} from 'lucide-react';
import { CampusPanoramaNode, PanoramaConnection, ConnectionDirection } from '../../data/campusGraph';
import { analyzeConnectionDirection } from '../../services/directionAnalysisService';

export interface DirectionValidationDashboardProps {
  nodes: CampusPanoramaNode[];
  connectionsMap: Record<string, PanoramaConnection[]>;
  manualNumbers: Record<string, string>;
  onInspectConnection: (fromId: string, targetId: string) => void;
  onExportReport: () => void;
}

export const DirectionValidationDashboard: React.FC<DirectionValidationDashboardProps> = ({
  nodes,
  connectionsMap,
  manualNumbers,
  onInspectConnection,
  onExportReport,
}) => {
  const [selectedAreaFilter, setSelectedAreaFilter] = useState<string>('ALL');

  const nodeMap = useMemo(() => {
    const map = new Map<string, CampusPanoramaNode>();
    nodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [nodes]);

  // Compute full campus audit
  const audit = useMemo(() => {
    let total = 0;
    let verified = 0;
    let unverified = 0;
    let unknown = 0;
    const directionCounts: Record<string, number> = {};
    const conflicts: Array<{
      fromNodeId: string;
      targetId: string;
      fromNum: string;
      toNum: string;
      currentDir: ConnectionDirection;
      type: 'ARROW_CONFLICT' | 'FLOOR_CONFLICT' | 'AI_VERIFIED_CONFLICT' | 'UNKNOWN' | 'UNVERIFIED';
      reason: string;
      confidence?: number;
    }> = [];

    for (const [fromNodeId, conns] of Object.entries(connectionsMap)) {
      const fromNode = nodeMap.get(fromNodeId);
      if (!fromNode) continue;

      for (const conn of conns) {
        total++;
        const toNode = nodeMap.get(conn.targetId);
        const dir = conn.direction || 'straight';
        directionCounts[dir] = (directionCounts[dir] || 0) + 1;

        const isVer = conn.directionStatus === 'VERIFIED';
        if (isVer) verified++;
        else unverified++;

        if (conn.directionStatus === 'UNKNOWN' || dir === 'unknown') {
          unknown++;
          conflicts.push({
            fromNodeId,
            targetId: conn.targetId,
            fromNum: manualNumbers[fromNodeId] || fromNodeId,
            toNum: manualNumbers[conn.targetId] || conn.targetId,
            currentDir: dir,
            type: 'UNKNOWN',
            reason: conn.unknownReason || 'Physical path marked as unknown',
          });
        }

        // Run analysis to detect conflicts
        const analysis = analyzeConnectionDirection(fromNode, conn, toNode);
        if (analysis.conflicts.hasArrowConflict) {
          conflicts.push({
            fromNodeId,
            targetId: conn.targetId,
            fromNum: manualNumbers[fromNodeId] || fromNodeId,
            toNum: manualNumbers[conn.targetId] || conn.targetId,
            currentDir: dir,
            type: 'ARROW_CONFLICT',
            reason: analysis.conflicts.arrowConflictReason || 'Arrow heading conflicts with direction',
            confidence: analysis.confidence,
          });
        }
        if (analysis.conflicts.hasFloorConflict) {
          conflicts.push({
            fromNodeId,
            targetId: conn.targetId,
            fromNum: manualNumbers[fromNodeId] || fromNodeId,
            toNum: manualNumbers[conn.targetId] || conn.targetId,
            currentDir: dir,
            type: 'FLOOR_CONFLICT',
            reason: analysis.conflicts.floorConflictReason || 'Floor elevation conflicts with stairs',
            confidence: analysis.confidence,
          });
        }
        if (analysis.conflicts.hasAiVerifiedConflict) {
          conflicts.push({
            fromNodeId,
            targetId: conn.targetId,
            fromNum: manualNumbers[fromNodeId] || fromNodeId,
            toNum: manualNumbers[conn.targetId] || conn.targetId,
            currentDir: dir,
            type: 'AI_VERIFIED_CONFLICT',
            reason: analysis.conflicts.aiVerifiedConflictReason || 'AI suggestion contradicts verified direction',
            confidence: analysis.confidence,
          });
        }
      }
    }

    const verifiedPercent = total > 0 ? Math.round((verified / total) * 100) : 0;

    return {
      total,
      verified,
      unverified,
      unknown,
      verifiedPercent,
      directionCounts,
      conflicts,
    };
  }, [connectionsMap, nodeMap, manualNumbers]);

  return (
    <div className="flex-1 flex flex-col bg-slate-950 p-4 gap-4 overflow-y-auto font-sans">
      {/* Top Banner */}
      <div className="flex items-center justify-between bg-slate-900/80 border border-white/10 rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 shadow-lg">
            <ShieldCheck size={24} />
          </div>
          <div>
            <h2 className="text-base font-black text-white">Campus Direction Validation & Integrity Center</h2>
            <p className="text-xs text-slate-400">
              Audit direction verification coverage, arrow alignment, floor consistency, and conflicts
            </p>
          </div>
        </div>

        <button
          onClick={onExportReport}
          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-black flex items-center gap-2 border border-white/10 transition-all shadow-md"
        >
          <Download size={14} /> Export Audit Report
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Total Connections */}
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 space-y-1">
          <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 block">
            Total Connections
          </span>
          <span className="text-2xl font-black text-white font-mono">{audit.total}</span>
          <p className="text-[10px] text-slate-500 font-medium">Active navigation graph edges</p>
        </div>

        {/* Verified Coverage */}
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-emerald-500/30 space-y-1">
          <span className="text-[10px] uppercase font-black tracking-wider text-emerald-400 block">
            Verified Coverage
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-300 font-mono">{audit.verified}</span>
            <span className="text-xs font-bold text-emerald-400 font-mono">({audit.verifiedPercent}%)</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden mt-1">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all"
              style={{ width: `${audit.verifiedPercent}%` }}
            />
          </div>
        </div>

        {/* Unverified Queued */}
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-amber-500/30 space-y-1">
          <span className="text-[10px] uppercase font-black tracking-wider text-amber-400 block">
            Requires Verification
          </span>
          <span className="text-2xl font-black text-amber-300 font-mono">{audit.unverified}</span>
          <p className="text-[10px] text-slate-500 font-medium">Currently using default / unverified</p>
        </div>

        {/* Active Conflicts */}
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-rose-500/30 space-y-1">
          <span className="text-[10px] uppercase font-black tracking-wider text-rose-400 block">
            Detected Conflicts
          </span>
          <span className="text-2xl font-black text-rose-300 font-mono">{audit.conflicts.length}</span>
          <p className="text-[10px] text-slate-500 font-medium">Arrow, floor, or AI discrepancies</p>
        </div>
      </div>

      {/* Direction Distribution Breakdown */}
      <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black text-white uppercase tracking-wider">
            Direction Distribution Across Campus
          </h3>
          <span className="text-[10px] text-slate-400 font-bold">12 Canonical Categories</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {Object.entries(audit.directionCounts).map(([dir, count]) => (
            <div key={dir} className="p-3 rounded-xl bg-slate-950 border border-white/5 space-y-1">
              <span className="text-[10px] font-black uppercase text-slate-400 truncate block">
                {dir.replace('-', ' ')}
              </span>
              <div className="flex items-baseline justify-between">
                <span className="text-lg font-black text-white font-mono">{count}</span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {audit.total > 0 ? Math.round((count / audit.total) * 100) : 0}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Conflict Audit & Review Queue Table */}
      <div className="flex-1 flex flex-col p-4 rounded-2xl bg-slate-900/60 border border-white/10 space-y-3 min-h-[300px]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-400" />
            <h3 className="text-xs font-black text-white uppercase tracking-wider">
              Integrity & Conflict Queue ({audit.conflicts.length})
            </h3>
          </div>
          <span className="text-[10px] text-slate-400 font-semibold">
            Click any row to jump into 360° Inspection & Manual Verification
          </span>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {audit.conflicts.length === 0 ? (
            <div className="p-8 text-center text-xs text-emerald-400 font-bold flex flex-col items-center gap-2">
              <CheckCircle2 size={24} />
              <span>Zero conflicts detected! All analyzed connections are geometrically consistent.</span>
            </div>
          ) : (
            audit.conflicts.map((c, idx) => (
              <div
                key={`conflict_${c.fromNodeId}_${c.targetId}_${idx}`}
                onClick={() => onInspectConnection(c.fromNodeId, c.targetId)}
                className="p-3 rounded-xl bg-slate-950 border border-white/10 hover:border-sky-400 transition-all cursor-pointer flex items-center justify-between gap-3 group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center justify-center font-bold text-xs flex-shrink-0">
                    ⚠️
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-mono text-xs font-black">
                      <span className="text-amber-300">#{c.fromNum}</span>
                      <ArrowRight size={12} className="text-slate-500" />
                      <span className="text-emerald-400">#{c.toNum}</span>
                      <span className="text-[10px] text-slate-500 font-sans">
                        ({c.fromNodeId} ➔ {c.targetId})
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-0.5 leading-tight">{c.reason}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-slate-900 border border-white/10 text-slate-300 font-mono">
                    {c.currentDir}
                  </span>
                  <button className="px-3 py-1.5 rounded-lg bg-sky-600 group-hover:bg-sky-500 text-white font-black text-xs flex items-center gap-1 transition-all shadow">
                    <Eye size={12} /> Inspect in 360°
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
