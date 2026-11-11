import React, { useState, useMemo, useEffect } from 'react';
import {
  Compass,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  HelpCircle,
  Sparkles,
  Volume2,
  Search,
  Filter,
  ArrowRight,
  ChevronRight,
  Download,
  Play,
  RotateCcw,
  Check,
  X,
  Layers,
  ShieldCheck,
  Eye,
  Info,
} from 'lucide-react';
import { CampusPanoramaNode, PanoramaConnection, ConnectionDirection } from '../../data/campusGraph';
import {
  analyzeConnectionDirection,
  analyzeAllUnverifiedConnections,
  generateDirectionReportCsv,
  generateDirectionReportJson,
  DirectionAnalysisResult,
  BatchAnalysisSummary,
} from '../../services/directionAnalysisService';
import { voiceNavigation, getVoicePhraseForDirection } from '../../services/voiceNavigationService';

export interface NavigationDirectionVerificationTabProps {
  nodes: CampusPanoramaNode[];
  connectionsMap: Record<string, PanoramaConnection[]>;
  selectedNodeId: string;
  onSelectNode: (nodeId: string) => void;
  onUpdateConnectionDirection: (
    fromNodeId: string,
    targetId: string,
    direction: ConnectionDirection,
    status: 'VERIFIED' | 'UNKNOWN',
    reason?: string
  ) => void;
  onBatchApplyAnalyses: (updatedMap: Record<string, PanoramaConnection[]>) => void;
  manualNumbers: Record<string, string>;
  onAimCamera?: (yaw: number, pitch?: number) => void;
  onTestConnection?: (fromId: string, toId: string, arrivalYaw?: number) => void;
  onOpenRouteTester?: (startId: string, targetId: string) => void;
  onClose?: () => void;
  children?: React.ReactNode;
}

type DirectionFilter =
  | 'REQUIRES_ATTENTION'
  | 'ALL'
  | 'UNVERIFIED'
  | 'AI_SUGGESTED'
  | 'NEEDS_REVIEW'
  | 'VERIFIED'
  | 'CONFLICT'
  | 'UNKNOWN';

interface ConnectionItem {
  fromNodeId: string;
  targetId: string;
  conn: PanoramaConnection;
  fromNode: CampusPanoramaNode;
  toNode?: CampusPanoramaNode;
}

const SUPPORTED_DIRECTIONS: Array<{
  dir: ConnectionDirection;
  label: string;
  icon: string;
  color: string;
  phrase: string;
}> = [
  { dir: 'straight', label: 'Continue Straight', icon: '⬆️', color: 'hover:border-emerald-400 text-emerald-300', phrase: 'Continue straight.' },
  { dir: 'left', label: 'Turn Left', icon: '⬅️', color: 'hover:border-sky-400 text-sky-300', phrase: 'Turn left.' },
  { dir: 'right', label: 'Turn Right', icon: '➡️', color: 'hover:border-sky-400 text-sky-300', phrase: 'Turn right.' },
  { dir: 'slight-left', label: 'Slight Left', icon: '↖️', color: 'hover:border-teal-400 text-teal-300', phrase: 'Turn slightly left.' },
  { dir: 'slight-right', label: 'Slight Right', icon: '↗️', color: 'hover:border-teal-400 text-teal-300', phrase: 'Turn slightly right.' },
  { dir: 'stairs-up', label: 'Go Upstairs', icon: '🪜⬆️', color: 'hover:border-amber-400 text-amber-300', phrase: 'Go upstairs.' },
  { dir: 'stairs-down', label: 'Go Downstairs', icon: '🪜⬇️', color: 'hover:border-amber-400 text-amber-300', phrase: 'Go downstairs.' },
  { dir: 'ramp-up', label: 'Go Up Ramp', icon: '♿⬆️', color: 'hover:border-indigo-400 text-indigo-300', phrase: 'Go up the ramp.' },
  { dir: 'ramp-down', label: 'Go Down Ramp', icon: '♿⬇️', color: 'hover:border-indigo-400 text-indigo-300', phrase: 'Go down the ramp.' },
  { dir: 'enter-building', label: 'Enter Building', icon: '🚪➔', color: 'hover:border-purple-400 text-purple-300', phrase: 'Enter the building.' },
  { dir: 'exit-building', label: 'Exit Building', icon: '🚪⬅️', color: 'hover:border-purple-400 text-purple-300', phrase: 'Exit the building.' },
  { dir: 'u-turn', label: 'Turn Back', icon: '🔄', color: 'hover:border-rose-400 text-rose-300', phrase: 'Turn back.' },
  { dir: 'unknown', label: 'Unknown (Silent)', icon: '❓', color: 'hover:border-slate-400 text-slate-400', phrase: '(Silent)' },
];

const NavigationDirectionVerificationTabComponent: React.FC<NavigationDirectionVerificationTabProps> = ({
  nodes,
  connectionsMap,
  selectedNodeId,
  onSelectNode,
  onUpdateConnectionDirection,
  onBatchApplyAnalyses,
  manualNumbers,
  onAimCamera,
  onTestConnection,
  onOpenRouteTester,
  children,
}) => {
  const [filter, setFilter] = useState<DirectionFilter>('REQUIRES_ATTENTION');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [activeAnalysis, setActiveAnalysis] = useState<DirectionAnalysisResult | null>(null);
  const [isAnalyzingSingle, setIsAnalyzingSingle] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [batchSummary, setBatchSummary] = useState<BatchAnalysisSummary | null>(null);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [visibleLimit, setVisibleLimit] = useState<number>(60);

  // Reset pagination limit on filter or search query change for ultra-fast response
  useEffect(() => {
    setVisibleLimit(60);
  }, [filter, searchQuery]);

  // Map nodes by ID for fast lookup
  const nodeMap = useMemo(() => {
    const map = new Map<string, CampusPanoramaNode>();
    nodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [nodes]);

  // Flatten all connections
  const allConnectionItems = useMemo<ConnectionItem[]>(() => {
    const list: ConnectionItem[] = [];
    for (const [fromNodeId, conns] of Object.entries(connectionsMap)) {
      const fromNode = nodeMap.get(fromNodeId);
      if (!fromNode) continue;
      for (const conn of conns) {
        const toNode = nodeMap.get(conn.targetId);
        list.push({
          fromNodeId,
          targetId: conn.targetId,
          conn,
          fromNode,
          toNode,
        });
      }
    }
    return list;
  }, [connectionsMap, nodeMap]);

  // Summary Metrics
  const metrics = useMemo(() => {
    let verified = 0;
    let unverified = 0;
    let conflicts = 0;
    let unknown = 0;
    let needsReview = 0;
    let aiSuggested = 0;

    allConnectionItems.forEach(({ conn }) => {
      const status = conn.directionStatus || 'UNVERIFIED';
      if (status === 'VERIFIED') verified++;
      else if (status === 'CONFLICT') conflicts++;
      else if (status === 'UNKNOWN') unknown++;
      else if (status === 'NEEDS_REVIEW') needsReview++;
      else if (status === 'AI_SUGGESTED') aiSuggested++;
      else unverified++;
    });

    return {
      total: allConnectionItems.length,
      verified,
      unverified,
      conflicts,
      unknown,
      needsReview,
      aiSuggested,
      requiresAttention: unverified + conflicts + unknown + needsReview,
    };
  }, [allConnectionItems]);

  // Filtered connections
  const filteredConnections = useMemo(() => {
    return allConnectionItems.filter((item) => {
      const status = item.conn.directionStatus || 'UNVERIFIED';

      // Status tab filter
      if (filter === 'REQUIRES_ATTENTION') {
        if (status === 'VERIFIED') return false;
      } else if (filter === 'VERIFIED') {
        if (status !== 'VERIFIED') return false;
      } else if (filter === 'UNVERIFIED') {
        if (status !== 'UNVERIFIED') return false;
      } else if (filter === 'CONFLICT') {
        if (status !== 'CONFLICT') return false;
      } else if (filter === 'UNKNOWN') {
        if (status !== 'UNKNOWN') return false;
      } else if (filter === 'NEEDS_REVIEW') {
        if (status !== 'NEEDS_REVIEW') return false;
      } else if (filter === 'AI_SUGGESTED') {
        if (status !== 'AI_SUGGESTED') return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const fromNum = (manualNumbers[item.fromNodeId] || '').toLowerCase();
        const toNum = (manualNumbers[item.targetId] || '').toLowerCase();
        const dir = (item.conn.direction || '').toLowerCase();
        const fromFile = (item.fromNode.filename || '').toLowerCase();
        const toFile = (item.toNode?.filename || '').toLowerCase();

        return (
          item.fromNodeId.toLowerCase().includes(q) ||
          item.targetId.toLowerCase().includes(q) ||
          fromNum.includes(q) ||
          toNum.includes(q) ||
          dir.includes(q) ||
          fromFile.includes(q) ||
          toFile.includes(q)
        );
      }

      return true;
    });
  }, [allConnectionItems, filter, searchQuery, manualNumbers]);

  // Selected Connection Item
  const activeConnection = useMemo(() => {
    if (!selectedTargetId) {
      // Default to first connection of current panorama if available
      const nodeConns = connectionsMap[selectedNodeId] || [];
      if (nodeConns.length > 0) {
        const first = nodeConns[0];
        const fromNode = nodeMap.get(selectedNodeId);
        if (fromNode) {
          return {
            fromNodeId: selectedNodeId,
            targetId: first.targetId,
            conn: first,
            fromNode,
            toNode: nodeMap.get(first.targetId),
          };
        }
      }
      return null;
    }

    return allConnectionItems.find(
      (c) => c.fromNodeId === selectedNodeId && c.targetId === selectedTargetId
    ) || null;
  }, [allConnectionItems, connectionsMap, nodeMap, selectedNodeId, selectedTargetId]);

  // Handle selecting a connection to inspect
  const handleSelectConnection = (fromId: string, targetId: string) => {
    if (fromId !== selectedNodeId) {
      onSelectNode(fromId);
    }
    setSelectedTargetId(targetId);

    const fromNode = nodeMap.get(fromId);
    const conns = connectionsMap[fromId] || [];
    const conn = conns.find((c) => c.targetId === targetId);
    const toNode = nodeMap.get(targetId);

    if (fromNode && conn) {
      // Auto-run analysis suggestion for current connection
      const analysis = analyzeConnectionDirection(fromNode, conn, toNode);
      setActiveAnalysis(analysis);

      // Aim camera in 360 viewer towards the target arrow
      const targetYaw = conn.worldBearing !== undefined ? conn.worldBearing : (conn.heading ?? 0);
      const pitch = conn.pitch !== undefined ? conn.pitch : -16;
      if (onAimCamera) {
        onAimCamera(targetYaw, pitch);
      }
    } else {
      setActiveAnalysis(null);
    }
  };

  // Run AI Direction Analysis on current connection
  const handleAnalyzeActive = () => {
    if (!activeConnection) return;
    setIsAnalyzingSingle(true);
    setTimeout(() => {
      const res = analyzeConnectionDirection(
        activeConnection.fromNode,
        activeConnection.conn,
        activeConnection.toNode
      );
      setActiveAnalysis(res);
      setIsAnalyzingSingle(false);
    }, 200);
  };

  // Verify and Authoritatively Save Direction for Connection
  const handleVerifyDirection = (dir: ConnectionDirection) => {
    if (!activeConnection) return;
    const isUnknown = dir === 'unknown';
    const reason = isUnknown ? 'Manually flagged as unknown physical direction' : undefined;

    onUpdateConnectionDirection(
      activeConnection.fromNodeId,
      activeConnection.targetId,
      dir,
      isUnknown ? 'UNKNOWN' : 'VERIFIED',
      reason
    );

    // Speak audio confirmation via voice preview
    const phrase = getVoicePhraseForDirection(dir);
    if (phrase) {
      voiceNavigation.speak(phrase);
      setVoiceNotice(`🔊 Spoke: "${phrase}"`);
      setTimeout(() => setVoiceNotice(null), 3000);
    }

    // Re-evaluate analysis to update conflicts
    const updatedConn: PanoramaConnection = {
      ...activeConnection.conn,
      direction: dir,
      directionStatus: isUnknown ? 'UNKNOWN' : 'VERIFIED',
    };
    const freshAnalysis = analyzeConnectionDirection(
      activeConnection.fromNode,
      updatedConn,
      activeConnection.toNode
    );
    setActiveAnalysis(freshAnalysis);
  };

  // Test Voice Guidance for current direction
  const handleTestVoice = (dirToTest?: string) => {
    const dir = dirToTest || activeConnection?.conn.direction || activeAnalysis?.suggestedDirection || 'straight';
    const phrase = getVoicePhraseForDirection(dir);
    if (phrase) {
      voiceNavigation.cancel();
      voiceNavigation.speak(phrase);
      setVoiceNotice(`🔊 Tested: "${phrase}"`);
      setTimeout(() => setVoiceNotice(null), 3500);
    } else {
      setVoiceNotice('ℹ️ Direction is marked Unknown: speech is silent (no false directional claim).');
      setTimeout(() => setVoiceNotice(null), 3500);
    }
  };

  // Run Bulk Analysis on All Unverified Connections
  const handleRunBulkAnalysis = () => {
    const { updatedMap, summary } = analyzeAllUnverifiedConnections(nodes, connectionsMap);
    setBatchSummary(summary);
    onBatchApplyAnalyses(updatedMap);
  };

  // Export Direction Report
  const handleExportReportCsv = () => {
    const csv = generateDirectionReportCsv(nodes, connectionsMap, manualNumbers);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `waycampus_direction_report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportReportJson = () => {
    const json = generateDirectionReportJson(nodes, connectionsMap, manualNumbers);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `waycampus_direction_report_${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 flex gap-3 p-3 min-h-0 overflow-hidden bg-slate-950 text-slate-100 font-sans">
      {/* ─────────────────────────────────────────────────────────────
          LEFT PANEL: Connection List & Filtering
      ───────────────────────────────────────────────────────────── */}
      <div className="w-80 sm:w-96 flex flex-col bg-slate-900/70 border border-white/10 rounded-2xl p-3 gap-2 overflow-hidden flex-shrink-0">
        {/* Header & Metrics */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Compass size={16} className="text-sky-400" />
            <span className="text-xs font-black text-white uppercase tracking-wider">
              Connections ({metrics.total})
            </span>
          </div>
          <span className="text-[10px] font-mono text-emerald-400 font-bold">
            {metrics.verified} / {metrics.total} Verified
          </span>
        </div>

        {/* Quick Summary Pill Row */}
        <div className="grid grid-cols-3 gap-1 text-[10px] font-bold text-center">
          <div className="p-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
            ✓ {metrics.verified} Verified
          </div>
          <div className="p-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300">
            ⚠️ {metrics.requiresAttention} Review
          </div>
          <div className="p-1 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300">
            ⚡ {metrics.conflicts} Conflict
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[11px] font-bold scrollbar-none">
          <button
            onClick={() => setFilter('REQUIRES_ATTENTION')}
            className={`px-2 py-0.5 rounded-lg whitespace-nowrap transition-all flex items-center gap-1 ${
              filter === 'REQUIRES_ATTENTION'
                ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                : 'bg-slate-800 text-amber-300 hover:bg-slate-700'
            }`}
            title="Most important admin queue: unverified, conflict, unknown, low confidence"
          >
            <span>🚨 Requires Attention</span>
            <span className="px-1 rounded bg-black/20 text-[9px]">{metrics.requiresAttention}</span>
          </button>
          <button
            onClick={() => setFilter('ALL')}
            className={`px-2 py-0.5 rounded-lg whitespace-nowrap transition-all ${
              filter === 'ALL' ? 'bg-sky-500 text-slate-950 font-black' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            All ({metrics.total})
          </button>
          <button
            onClick={() => setFilter('VERIFIED')}
            className={`px-2 py-0.5 rounded-lg whitespace-nowrap transition-all ${
              filter === 'VERIFIED' ? 'bg-emerald-500 text-slate-950 font-black' : 'bg-slate-800 text-emerald-300 hover:bg-slate-700'
            }`}
          >
            Verified ({metrics.verified})
          </button>
          <button
            onClick={() => setFilter('CONFLICT')}
            className={`px-2 py-0.5 rounded-lg whitespace-nowrap transition-all ${
              filter === 'CONFLICT' ? 'bg-rose-500 text-white font-black' : 'bg-slate-800 text-rose-300 hover:bg-slate-700'
            }`}
          >
            Conflicts ({metrics.conflicts})
          </button>
          <button
            onClick={() => setFilter('UNVERIFIED')}
            className={`px-2 py-0.5 rounded-lg whitespace-nowrap transition-all ${
              filter === 'UNVERIFIED' ? 'bg-slate-700 text-white font-black' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            Unverified ({metrics.unverified})
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search from, target #, direction..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-medium"
          />
        </div>

        {/* Bulk Action Buttons */}
        <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-white/10">
          <button
            onClick={handleRunBulkAnalysis}
            className="px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white text-[11px] font-black flex items-center justify-center gap-1.5 shadow-md shadow-sky-600/20"
            title="Batch analyzes all unverified connections with equirectangular geometry rules"
          >
            <Sparkles size={13} />
            Analyze All Unverified
          </button>

          <button
            onClick={() => setIsBulkModalOpen(true)}
            className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-black flex items-center justify-center gap-1.5 border border-white/10"
            title="Open rapid card-by-card manual review interface"
          >
            <CheckCircle2 size={13} className="text-emerald-400" />
            Bulk Review Mode
          </button>
        </div>

        {/* Connection Cards List */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 pr-1 min-h-0 mt-1">
          {filteredConnections.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 italic">
              No connections match the current filter.
            </div>
          ) : (
            <>
              {filteredConnections.slice(0, visibleLimit).map((item) => {
                const isSelected =
                  item.fromNodeId === selectedNodeId && item.targetId === (selectedTargetId || activeConnection?.targetId);
                const status = item.conn.directionStatus || 'UNVERIFIED';
                const fromNum = manualNumbers[item.fromNodeId] || item.fromNodeId;
                const toNum = manualNumbers[item.targetId] || item.targetId;
                const dir = item.conn.direction || 'straight';
                const aiDir = item.conn.aiSuggestedDirection || item.conn.latestAISuggestion;
                const conf = item.conn.aiConfidence;

                return (
                  <div
                    key={`${item.fromNodeId}_${item.targetId}`}
                    onClick={() => handleSelectConnection(item.fromNodeId, item.targetId)}
                    style={{ contentVisibility: 'auto', containIntrinsicSize: '72px' }}
                    className={`p-2.5 rounded-xl border text-xs transition-all cursor-pointer flex flex-col gap-1.5 ${
                      isSelected
                        ? 'bg-sky-950/70 border-sky-400 ring-2 ring-sky-500/20 shadow-lg'
                        : status === 'CONFLICT'
                        ? 'bg-rose-950/40 border-rose-500/40 hover:border-rose-400'
                        : status === 'VERIFIED'
                        ? 'bg-slate-950/80 border-emerald-500/30 hover:border-emerald-400'
                        : 'bg-slate-950/60 border-white/5 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-mono text-xs">
                        <span className="font-black text-amber-300">#{fromNum}</span>
                        <ArrowRight size={12} className="text-slate-500" />
                        <span className="font-black text-emerald-400">#{toNum}</span>
                        <span className="text-[10px] text-slate-500 font-sans truncate max-w-[80px]">
                          ({item.fromNodeId}➔{item.targetId})
                        </span>
                      </div>

                      {/* Status Badge */}
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                          status === 'VERIFIED'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : status === 'CONFLICT'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                            : status === 'UNKNOWN'
                            ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                            : status === 'AI_SUGGESTED'
                            ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {status === 'CONFLICT' ? '⚠️ CONFLICT' : status}
                      </span>
                    </div>

                    {/* Direction & AI Suggestion Line */}
                    <div className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5 font-bold">
                        <span className="text-slate-400">Stored:</span>
                        <span className="text-white uppercase font-mono">{dir}</span>
                      </div>

                      {aiDir && (
                        <div className="flex items-center gap-1 text-[10px] font-bold text-sky-300">
                          <Sparkles size={10} />
                          <span>AI: {aiDir.toUpperCase()}</span>
                          {conf && <span>({Math.round(conf * 100)}%)</span>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {filteredConnections.length > visibleLimit && (
                <button
                  onClick={() => setVisibleLimit((prev) => prev + 60)}
                  className="py-2.5 px-3 my-1 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-sky-500/30 text-sky-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95"
                >
                  <span>Load More ({filteredConnections.length - visibleLimit} remaining)</span>
                </button>
              )}
            </>
          )}
        </div>

        {/* Export Reports Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-white/10 text-[11px]">
          <span className="text-slate-400 font-bold">Export Report:</span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleExportReportCsv}
              className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold flex items-center gap-1 border border-white/10"
              title="Download full CSV report"
            >
              <Download size={11} /> CSV
            </button>
            <button
              onClick={handleExportReportJson}
              className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold flex items-center gap-1 border border-white/10"
              title="Download full JSON report"
            >
              <Download size={11} /> JSON
            </button>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          CENTER: Real 360° Panorama Viewer Canvas Slot + Target Indicator HUD
      ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 relative">
        {children}

        {/* Floating Target Direction HUD Overlay over the 360 viewer */}
        {activeConnection && (
          <div className="absolute top-4 left-4 right-4 z-20 pointer-events-none flex items-center justify-between">
            <div className="bg-slate-950/85 backdrop-blur-xl border border-sky-500/40 rounded-2xl px-4 py-2 shadow-2xl flex items-center gap-3 pointer-events-auto">
              <div className="w-8 h-8 rounded-xl bg-sky-500/20 border border-sky-500/40 text-sky-300 flex items-center justify-center font-black text-xs">
                🎯
              </div>
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-black tracking-wider text-sky-400 block">
                  Target Direction in 360° View
                </span>
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-white">
                  <span className="text-amber-300">#{manualNumbers[activeConnection.fromNodeId] || activeConnection.fromNodeId}</span>
                  <span className="text-slate-400">➔</span>
                  <span className="text-emerald-400">#{manualNumbers[activeConnection.targetId] || activeConnection.targetId}</span>
                  <span className="text-slate-400 text-[10px] font-sans">
                    (Target Yaw: {Math.round(activeConnection.conn.worldBearing ?? activeConnection.conn.heading ?? 0)}°)
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pointer-events-auto">
              <button
                onClick={() => {
                  if (onTestConnection) {
                    onTestConnection(
                      activeConnection.fromNodeId,
                      activeConnection.targetId,
                      activeConnection.conn.worldBearing ?? activeConnection.conn.heading ?? 0
                    );
                  }
                }}
                className="px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-xl shadow-sky-500/20 active:scale-95 transition-transform"
              >
                <Play size={13} />
                Test Connection Step
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          RIGHT PANEL: Detailed Direction Verification Panel
      ───────────────────────────────────────────────────────────── */}
      <div className="w-80 sm:w-96 flex flex-col bg-slate-900/80 border border-white/10 rounded-2xl p-3 gap-3 overflow-y-auto flex-shrink-0">
        {activeConnection ? (
          <>
            {/* Connection Title Header */}
            <div className="p-3 rounded-xl bg-slate-950 border border-white/10 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-black text-sky-400 tracking-wider">
                  Connection Inspection
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                    activeConnection.conn.directionStatus === 'VERIFIED'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : activeConnection.conn.directionStatus === 'CONFLICT'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}
                >
                  {activeConnection.conn.directionStatus || 'UNVERIFIED'}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs font-mono font-bold">
                <div>
                  <span className="text-slate-400 block text-[10px] font-sans">Current Pano</span>
                  <span className="text-amber-300 font-black">
                    #{manualNumbers[activeConnection.fromNodeId] || activeConnection.fromNodeId}
                  </span>
                  <span className="text-[10px] text-slate-500 block font-sans truncate max-w-[120px]">
                    {activeConnection.fromNode.filename}
                  </span>
                </div>

                <ArrowRight size={16} className="text-sky-400 flex-shrink-0" />

                <div className="text-right">
                  <span className="text-slate-400 block text-[10px] font-sans">Target Pano</span>
                  <span className="text-emerald-400 font-black">
                    #{manualNumbers[activeConnection.targetId] || activeConnection.targetId}
                  </span>
                  <span className="text-[10px] text-slate-500 block font-sans truncate max-w-[120px]">
                    {activeConnection.toNode?.filename || activeConnection.targetId}
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Current Direction:</span>
                <span className="text-white font-black uppercase font-mono">
                  {activeConnection.conn.direction || 'straight'}
                </span>
              </div>
            </div>

            {/* Conflict Warnings (if any) */}
            {activeAnalysis?.conflicts.hasAiVerifiedConflict && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-2 animate-pulse">
                <AlertCircle size={16} className="text-rose-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-black block uppercase text-[10px] text-rose-300">
                    Conflict: AI Disagrees with Verified Direction
                  </span>
                  <p className="text-[11px] leading-relaxed mt-0.5">
                    {activeAnalysis.conflicts.aiVerifiedConflictReason}
                  </p>
                </div>
              </div>
            )}

            {activeAnalysis?.conflicts.hasArrowConflict && (
              <div className="p-3 rounded-xl bg-amber-950/60 border border-amber-500/40 text-amber-200 text-xs flex items-start gap-2">
                <AlertTriangle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-black block uppercase text-[10px] text-amber-300">
                    Arrow / Direction Conflict
                  </span>
                  <p className="text-[11px] leading-relaxed mt-0.5">
                    {activeAnalysis.conflicts.arrowConflictReason}
                  </p>
                </div>
              </div>
            )}

            {activeAnalysis?.conflicts.hasFloorConflict && (
              <div className="p-3 rounded-xl bg-amber-950/60 border border-amber-500/40 text-amber-200 text-xs flex items-start gap-2">
                <AlertTriangle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-black block uppercase text-[10px] text-amber-300">
                    Floor / Direction Conflict
                  </span>
                  <p className="text-[11px] leading-relaxed mt-0.5">
                    {activeAnalysis.conflicts.floorConflictReason}
                  </p>
                </div>
              </div>
            )}

            {/* Minimal One-Click Direction Selection & Save Grid */}
            <div className="p-3 rounded-xl bg-slate-950 border border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider block">
                  Select Direction (1-Click Save)
                </span>
                {activeAnalysis?.suggestedDirection && (
                  <button
                    onClick={() => handleVerifyDirection(activeAnalysis.suggestedDirection)}
                    className="px-2 py-0.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 font-black text-[10px] flex items-center gap-1 border border-sky-500/30 transition-all"
                    title={`AI suggests: ${activeAnalysis.suggestedDirection}`}
                  >
                    <Sparkles size={10} /> Suggest: {activeAnalysis.suggestedDirection.toUpperCase()}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {SUPPORTED_DIRECTIONS.map(({ dir, label, icon, color, phrase }) => {
                  const isCurrent = (activeConnection.conn.direction || 'straight') === dir;
                  const isVerified = activeConnection.conn.directionStatus === 'VERIFIED';
                  return (
                    <button
                      key={dir}
                      onClick={() => handleVerifyDirection(dir)}
                      className={`p-2 rounded-xl border text-xs font-bold transition-all text-left flex items-center gap-1.5 ${
                        isCurrent && isVerified
                          ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200 ring-1 ring-emerald-400 shadow-md'
                          : isCurrent
                          ? 'bg-slate-800 border-white/20 text-white'
                          : `bg-slate-900/80 border-white/5 ${color}`
                      }`}
                    >
                      <span className="text-sm">{icon}</span>
                      <div className="min-w-0 flex-1">
                        <span className="text-[11px] leading-tight block truncate">{label}</span>
                        <span className="text-[9px] text-slate-400 block font-normal truncate">"{phrase}"</span>
                      </div>
                      {isCurrent && isVerified && <Check size={12} className="text-emerald-400 flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Voice Preview & Instant Audio Feedback */}
            <div className="p-3 rounded-xl bg-slate-950 border border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Volume2 size={13} className="text-sky-400" />
                  <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider">
                    Voice Guidance Preview
                  </span>
                </div>
                <button
                  onClick={() => handleTestVoice()}
                  className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-black text-[10px] flex items-center gap-1 shadow transition-all active:scale-95"
                >
                  <Volume2 size={11} /> Speak Direction
                </button>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900 border border-white/5 text-xs">
                <span className="text-[10px] text-slate-400 block mb-0.5">Spoken Direction Phrase:</span>
                <p className="font-bold text-white text-xs italic">
                  "{getVoicePhraseForDirection(activeConnection.conn.direction || 'straight') || '(Silent — Unknown)'}"
                </p>
                {voiceNotice && (
                  <p className="text-[10px] text-emerald-400 font-mono mt-1 font-bold animate-pulse">
                    {voiceNotice}
                  </p>
                )}
              </div>
            </div>

            {/* Test Navigation Step Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  if (onTestConnection) {
                    onTestConnection(
                      activeConnection.fromNodeId,
                      activeConnection.targetId,
                      activeConnection.conn.worldBearing ?? activeConnection.conn.heading ?? 0
                    );
                  }
                }}
                className="py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 font-black text-xs flex items-center justify-center gap-1.5 border border-sky-500/30"
              >
                <Play size={12} />
                Test This Connection
              </button>

              <button
                onClick={() => {
                  if (onOpenRouteTester) {
                    onOpenRouteTester(activeConnection.fromNodeId, activeConnection.targetId);
                  }
                }}
                className="py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/20"
              >
                <Compass size={12} />
                Test Entire Route
              </button>
            </div>
          </>
        ) : (
          <div className="p-12 text-center text-xs text-slate-500 italic">
            Select a connection on the left to review and verify direction metadata.
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          MODAL: Bulk Manual Review Interface (Fast Review Cards)
      ───────────────────────────────────────────────────────────── */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/15 rounded-3xl p-6 max-w-2xl w-full shadow-2xl flex flex-col gap-4 max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={20} className="text-emerald-400" />
                <div>
                  <h3 className="text-base font-black text-white">Bulk Manual Direction Review</h3>
                  <p className="text-xs text-slate-400">
                    Fast one-click verification of unverified and suggested connections
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsBulkModalOpen(false)}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X size={17} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[300px]">
              {allConnectionItems
                .filter((c) => c.conn.directionStatus !== 'VERIFIED')
                .slice(0, 50)
                .map((item) => {
                  const fromNum = manualNumbers[item.fromNodeId] || item.fromNodeId;
                  const toNum = manualNumbers[item.targetId] || item.targetId;
                  const aiDir = item.conn.aiSuggestedDirection || item.conn.latestAISuggestion || 'straight';
                  const conf = item.conn.aiConfidence || 0.9;

                  return (
                    <div
                      key={`bulk_${item.fromNodeId}_${item.targetId}`}
                      className="p-3 rounded-2xl bg-slate-950/70 border border-white/10 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-mono text-xs font-black">
                          <span className="text-amber-300">#{fromNum}</span>
                          <ArrowRight size={12} className="text-slate-500" />
                          <span className="text-emerald-400">#{toNum}</span>
                          <span className="text-[10px] text-slate-400 font-sans truncate">
                            ({item.fromNode.filename})
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-sky-300 font-bold mt-0.5">
                          <Sparkles size={11} />
                          <span>AI Suggestion: {aiDir.toUpperCase()}</span>
                          <span className="text-slate-500">({Math.round(conf * 100)}%)</span>
                        </div>
                      </div>

                      {/* Fast Choice Buttons */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => {
                            onUpdateConnectionDirection(item.fromNodeId, item.targetId, 'straight', 'VERIFIED');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white font-bold text-xs transition-colors"
                        >
                          Straight
                        </button>
                        <button
                          onClick={() => {
                            onUpdateConnectionDirection(item.fromNodeId, item.targetId, 'left', 'VERIFIED');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-sky-600 text-slate-200 hover:text-white font-bold text-xs transition-colors"
                        >
                          Left
                        </button>
                        <button
                          onClick={() => {
                            onUpdateConnectionDirection(item.fromNodeId, item.targetId, 'right', 'VERIFIED');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-sky-600 text-slate-200 hover:text-white font-bold text-xs transition-colors"
                        >
                          Right
                        </button>
                        <button
                          onClick={() => {
                            onUpdateConnectionDirection(item.fromNodeId, item.targetId, 'unknown', 'UNKNOWN');
                          }}
                          className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 font-bold text-xs"
                        >
                          Unknown
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="flex items-center justify-between border-t border-white/10 pt-3">
              <span className="text-xs text-slate-400">Showing first 50 unverified items</span>
              <button
                onClick={() => setIsBulkModalOpen(false)}
                className="px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs"
              >
                Done Reviewing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const NavigationDirectionVerificationTab = React.memo(NavigationDirectionVerificationTabComponent);
