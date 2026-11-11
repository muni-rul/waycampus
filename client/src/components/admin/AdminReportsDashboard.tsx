import React, { useState, useEffect, useMemo } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Filter,
  Search,
  RefreshCw,
  Eye,
  ExternalLink,
  ChevronRight,
  User,
  MapPin,
  Compass,
  Building2,
  Layers,
  Tag,
  AlertTriangle,
  XCircle,
  X,
  Check,
  Save,
  Trash2,
  MessageSquare,
  Navigation,
  Monitor,
  Phone,
  Copy,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { ApiService } from '../../services/api';
import { useNavigation } from '../../context/NavigationContext';
import {
  CampusReport,
  CampusReportStatus,
  CampusReportPriority,
  CampusReportIssueType,
} from '../../../../shared/types';

export interface AdminReportsDashboardProps {
  onSelectPanorama?: (nodeId: string) => void;
  onClose?: () => void;
  initialNodeFilter?: string | null;
  onReportsUpdated?: () => void;
}

export const AdminReportsDashboard: React.FC<AdminReportsDashboardProps> = ({
  onSelectPanorama,
  onClose,
  initialNodeFilter,
  onReportsUpdated,
}) => {
  const { setActivePanoramaId, setActiveFloorNumber, setViewMode, startNavigationRoute } = useNavigation();

  const [reports, setReports] = useState<CampusReport[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters
  const [statusTab, setStatusTab] = useState<'ALL' | CampusReportStatus>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | CampusReportPriority>('ALL');
  const [searchTerm, setSearchTerm] = useState(initialNodeFilter || '');

  useEffect(() => {
    if (initialNodeFilter !== undefined) {
      setSearchTerm(initialNodeFilter || '');
    }
  }, [initialNodeFilter]);

  // Selected Report for Detail Drawer/Modal
  const [selectedReport, setSelectedReport] = useState<CampusReport | null>(null);
  const [adminNoteInput, setAdminNoteInput] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [updateSuccessMsg, setUpdateSuccessMsg] = useState<string | null>(null);

  // Fetch reports from server
  const loadReports = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await ApiService.getAdminReports({
        status: statusTab !== 'ALL' ? statusTab : undefined,
        priority: priorityFilter !== 'ALL' ? priorityFilter : undefined,
        search: searchTerm.trim() || undefined,
        limit: 200,
      });
      setReports(res.reports || []);
      setTotalCount(res.total || (res.reports ? res.reports.length : 0));

      // Refresh selected report if open
      if (selectedReport) {
        const updated = res.reports.find((r) => r.id === selectedReport.id);
        if (updated) {
          setSelectedReport(updated);
          setAdminNoteInput(updated.adminNotes || '');
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to fetch reports from server.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, [statusTab, priorityFilter]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      loadReports();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Statistics
  const stats = useMemo(() => {
    const total = reports.length;
    const newCount = reports.filter((r) => r.status === 'NEW').length;
    const inProgressCount = reports.filter((r) => r.status === 'IN_PROGRESS' || r.status === 'ACKNOWLEDGED').length;
    const resolvedCount = reports.filter((r) => r.status === 'RESOLVED').length;
    const highOrCritical = reports.filter((r) => r.priority === 'HIGH' || r.priority === 'CRITICAL').length;
    return { total, newCount, inProgressCount, resolvedCount, highOrCritical };
  }, [reports]);

  // Handle Status / Priority / Notes Update
  const handleUpdateReport = async (
    updates: { status?: CampusReportStatus; priority?: CampusReportPriority; adminNotes?: string }
  ) => {
    if (!selectedReport) return;
    setIsUpdatingStatus(true);
    setUpdateSuccessMsg(null);
    try {
      const res = await ApiService.updateAdminReport(selectedReport.id, updates);
      setSelectedReport(res.report);
      setAdminNoteInput(res.report.adminNotes || '');
      setUpdateSuccessMsg('✓ Report updated successfully.');

      // Update in reports list
      setReports((prev) => prev.map((r) => (r.id === res.report.id ? res.report : r)));
      if (onReportsUpdated) {
        onReportsUpdated();
      }
    } catch (err: any) {
      alert(`Update failed: ${err.message || err}`);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Jump to 360 Panorama in Navigation Viewer or Debugger
  const handleJumpToPanorama = (panoId?: string) => {
    if (!panoId) return;
    if (onSelectPanorama) {
      onSelectPanorama(panoId);
      if (onClose) onClose();
    } else {
      setActivePanoramaId(panoId);
      setViewMode('HOME');
    }
  };

  // Delete Individual Report
  const handleDeleteReport = async (reportId: string) => {
    if (!window.confirm(`Are you sure you want to delete report ${reportId}?`)) return;
    try {
      await ApiService.deleteAdminReport(reportId);
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      if (selectedReport?.id === reportId) {
        setSelectedReport(null);
      }
      if (onReportsUpdated) onReportsUpdated();
    } catch (err: any) {
      alert(`Failed to delete report: ${err.message || err}`);
    }
  };

  // Clear All Reports (Useful for clearing sample / test reports)
  const handleClearAllReports = async () => {
    if (!window.confirm('Are you sure you want to clear all reports? This will remove sample/test reports so only real incoming user reports appear.')) return;
    try {
      await ApiService.clearAllAdminReports();
      setReports([]);
      setSelectedReport(null);
      if (onReportsUpdated) onReportsUpdated();
    } catch (err: any) {
      alert(`Failed to clear reports: ${err.message || err}`);
    }
  };

  const getPriorityBadge = (p: CampusReportPriority) => {
    switch (p) {
      case 'CRITICAL':
        return <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[9px] font-black">CRITICAL</span>;
      case 'HIGH':
        return <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-black">HIGH</span>;
      case 'MEDIUM':
        return <span className="px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 border border-sky-500/30 text-[9px] font-black">MEDIUM</span>;
      default:
        return <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-slate-700 text-[9px] font-black">LOW</span>;
    }
  };

  const getStatusBadge = (s: CampusReportStatus) => {
    switch (s) {
      case 'NEW':
        return <span className="px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[9px] font-bold">NEW</span>;
      case 'ACKNOWLEDGED':
        return <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[9px] font-bold">ACKNOWLEDGED</span>;
      case 'IN_PROGRESS':
        return <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-bold">IN PROGRESS</span>;
      case 'RESOLVED':
        return <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[9px] font-bold">RESOLVED</span>;
      case 'REJECTED':
        return <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[9px] font-bold">REJECTED</span>;
      case 'DUPLICATE':
        return <span className="px-2 py-0.5 rounded-md bg-slate-700 text-slate-300 border border-slate-600 text-[9px] font-bold">DUPLICATE</span>;
      default:
        return <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 text-[9px]">{s}</span>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner & Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/80 border border-white/10 rounded-2xl p-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center">
              <AlertCircle size={18} />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white leading-tight">
                User Bug Reports & Feedback Center
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Investigate student and faculty reported issues, verify 360° positions, and manage correction workflows.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadReports()}
            disabled={isLoading}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>

          {reports.length > 0 && (
            <button
              onClick={handleClearAllReports}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-950/80 text-slate-400 hover:text-rose-300 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-transparent hover:border-rose-500/40"
              title="Delete all test / sample reports"
            >
              <Trash2 size={13} className="text-rose-400" />
              <span>Clear Test Reports</span>
            </button>
          )}

          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              title="Close Reports Center"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-3 bg-slate-900/60 border border-white/10 rounded-xl">
          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Total Reports</p>
          <p className="text-lg sm:text-xl font-black text-white mt-0.5">{totalCount}</p>
        </div>
        <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
          <p className="text-[10px] text-blue-400 font-medium uppercase tracking-wider">New (Unchecked)</p>
          <p className="text-lg sm:text-xl font-black text-blue-300 mt-0.5">{stats.newCount}</p>
        </div>
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
          <p className="text-[10px] text-amber-400 font-medium uppercase tracking-wider">High / Critical</p>
          <p className="text-lg sm:text-xl font-black text-amber-300 mt-0.5">{stats.highOrCritical}</p>
        </div>
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
          <p className="text-[10px] text-emerald-400 font-medium uppercase tracking-wider">Resolved</p>
          <p className="text-lg sm:text-xl font-black text-emerald-300 mt-0.5">{stats.resolvedCount}</p>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="space-y-2">
        {/* Status Filter Tabs */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {(['ALL', 'NEW', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusTab(tab)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                statusTab === tab
                  ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20'
                  : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-white/5'
              }`}
            >
              {tab.replace('_', ' ')}
            </button>
          ))}
        </div>

        {/* Search Bar & Priority Filter */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search reports by ID, description, room, block, or panorama node..."
              className="w-full bg-slate-900/90 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <Filter size={12} /> Priority:
            </span>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as any)}
              className="bg-slate-900/90 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
            >
              <option value="ALL">All Priorities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Content: Reports Split View (Table/List + Detail Panel) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Reports List (Col 7 on large screen) */}
        <div className={`space-y-2 ${selectedReport ? 'lg:col-span-6' : 'lg:col-span-12'}`}>
          {errorMessage && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs rounded-xl">
              {errorMessage}
            </div>
          )}

          {reports.length === 0 && !isLoading && (
            <div className="p-8 text-center bg-slate-900/40 border border-white/5 rounded-2xl text-slate-500 text-xs">
              No reports matching the selected filters.
            </div>
          )}

          {reports.map((report) => {
            const isSelected = selectedReport?.id === report.id;
            return (
              <div
                key={report.id}
                onClick={() => {
                  setSelectedReport(report);
                  setAdminNoteInput(report.adminNotes || '');
                  setUpdateSuccessMsg(null);
                }}
                className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-slate-800/90 border-sky-500/50 shadow-lg shadow-sky-500/10'
                    : 'bg-slate-900/70 border-white/5 hover:bg-slate-800/50 hover:border-white/10'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-xs text-sky-400">{report.id}</span>
                    {getStatusBadge(report.status)}
                    {getPriorityBadge(report.priority)}
                    {report.possibleDuplicateOf && (
                      <span className="px-1.5 py-0.2 rounded text-[8px] bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        Likely Duplicate of {report.possibleDuplicateOf}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 whitespace-nowrap">
                    {new Date(report.createdAt).toLocaleDateString()} {new Date(report.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <p className="text-xs font-bold text-slate-200 line-clamp-1">{report.category}</p>
                <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5 leading-relaxed">
                  {report.description}
                </p>

                {/* Location Tags Preview */}
                <div className="mt-2 flex items-center gap-2 flex-wrap text-[10px] text-slate-400">
                  {report.currentPanoramaId && (
                    <span className="bg-slate-950 px-2 py-0.5 rounded-md border border-white/5 font-mono">
                      📷 {report.currentPanoramaId}
                    </span>
                  )}
                  {report.currentBuildingId && (
                    <span className="bg-slate-950 px-2 py-0.5 rounded-md border border-white/5 font-mono">
                      🏢 {report.currentBuildingId}
                    </span>
                  )}
                  {report.reportedEntityId && (
                    <span className="bg-slate-950 px-2 py-0.5 rounded-md border border-white/5">
                      📍 {report.reportedEntityId}
                    </span>
                  )}
                  {report.reporterName && (
                    <span className="text-slate-500">
                      by {report.reporterName}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Report Detail Inspector Drawer (Col 6 on large screen) */}
        {selectedReport && (
          <div className="lg:col-span-6 bg-slate-900/95 border border-white/15 rounded-3xl p-4 sm:p-5 shadow-2xl space-y-4 sticky top-4">
            {/* Detail Header */}
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-white/10">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black text-white">{selectedReport.id}</h3>
                  {getStatusBadge(selectedReport.status)}
                  {getPriorityBadge(selectedReport.priority)}
                </div>
                <p className="text-xs font-semibold text-sky-400 mt-0.5">{selectedReport.category}</p>
              </div>

              <button
                onClick={() => setSelectedReport(null)}
                className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-white/10"
              >
                <XCircle size={18} />
              </button>
            </div>

            {/* Description Card */}
            <div className="p-3 bg-slate-950/80 rounded-2xl border border-white/10 space-y-1">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">User Description</p>
              <p className="text-xs text-slate-100 whitespace-pre-wrap leading-relaxed">
                {selectedReport.description}
              </p>
            </div>

            {/* Reporter Information */}
            <div className="p-3 bg-slate-950/50 rounded-2xl border border-white/5 text-xs space-y-1">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Reporter Details</p>
              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                <div>
                  <span className="text-slate-500">Name:</span>{' '}
                  <span className="text-slate-200">{selectedReport.reporterName || 'Anonymous'}</span>
                </div>
                <div>
                  <span className="text-slate-500">Contact:</span>{' '}
                  <span className="text-slate-200">{selectedReport.reporterContact || 'None provided'}</span>
                </div>
                <div>
                  <span className="text-slate-500">Type:</span>{' '}
                  <span className="text-slate-200 capitalize">{selectedReport.reporterType || 'student'}</span>
                </div>
                <div>
                  <span className="text-slate-500">Submitted:</span>{' '}
                  <span className="text-slate-200">{new Date(selectedReport.createdAt).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Technical Context */}
            <div className="p-3 bg-slate-950/50 rounded-2xl border border-white/5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Attached Campus Context</p>
                {selectedReport.currentPanoramaId && (
                  <button
                    onClick={() => handleJumpToPanorama(selectedReport.currentPanoramaId)}
                    className="px-2 py-0.5 rounded-lg bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 text-[10px] font-bold flex items-center gap-1"
                  >
                    <Eye size={11} /> Open in 360°
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                <div>
                  <span className="text-slate-500">Panorama:</span>{' '}
                  <span className="font-mono text-slate-200">{selectedReport.currentPanoramaId || 'None'}</span>
                </div>
                <div>
                  <span className="text-slate-500">Node ID:</span>{' '}
                  <span className="font-mono text-slate-200">{selectedReport.currentNodeId || 'None'}</span>
                </div>
                <div>
                  <span className="text-slate-500">Block / Building:</span>{' '}
                  <span className="text-slate-200">{selectedReport.blockName || selectedReport.currentBuildingId || 'None'}</span>
                </div>
                <div>
                  <span className="text-slate-500">Floor:</span>{' '}
                  <span className="text-slate-200">{selectedReport.currentFloorId !== undefined ? `Floor ${selectedReport.currentFloorId}` : 'None'}</span>
                </div>
                {selectedReport.reportedEntityId && (
                  <div className="col-span-2">
                    <span className="text-slate-500">Entity:</span>{' '}
                    <span className="text-slate-200 font-semibold">{selectedReport.reportedEntityId} ({selectedReport.reportedEntityType || 'Location'})</span>
                  </div>
                )}
                {selectedReport.originNodeId && selectedReport.destinationNodeId && (
                  <div className="col-span-2">
                    <span className="text-slate-500">Route Trajectory:</span>{' '}
                    <span className="font-mono text-slate-200">{selectedReport.originNodeId} → {selectedReport.destinationNodeId}</span>
                  </div>
                )}
                <div className="col-span-2 pt-1 border-t border-white/5 text-[10px] text-slate-500">
                  <span>Device: {selectedReport.device || 'Unknown'} • Browser: {selectedReport.browser?.slice(0, 40) || 'Unknown'}</span>
                </div>
              </div>
            </div>

            {/* Admin Actions */}
            <div className="space-y-2 pt-2 border-t border-white/10">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Change Status</p>
              <div className="flex gap-1.5 flex-wrap">
                <button
                  onClick={() => handleUpdateReport({ status: 'ACKNOWLEDGED' })}
                  disabled={isUpdatingStatus}
                  className="px-2.5 py-1 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 text-xs font-semibold transition-colors"
                >
                  Acknowledge
                </button>
                <button
                  onClick={() => handleUpdateReport({ status: 'IN_PROGRESS' })}
                  disabled={isUpdatingStatus}
                  className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold transition-colors"
                >
                  In Progress
                </button>
                <button
                  onClick={() => handleUpdateReport({ status: 'RESOLVED' })}
                  disabled={isUpdatingStatus}
                  className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-semibold transition-colors"
                >
                  Resolve
                </button>
                <button
                  onClick={() => handleUpdateReport({ status: 'REJECTED' })}
                  disabled={isUpdatingStatus}
                  className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-semibold transition-colors"
                >
                  Reject
                </button>
                <button
                  onClick={() => handleUpdateReport({ status: 'DUPLICATE' })}
                  disabled={isUpdatingStatus}
                  className="px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-semibold transition-colors"
                >
                  Mark Duplicate
                </button>
              </div>

              {/* Priority Selector */}
              <div className="pt-2">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Update Priority</p>
                <select
                  value={selectedReport.priority}
                  onChange={(e) => handleUpdateReport({ priority: e.target.value as CampusReportPriority })}
                  disabled={isUpdatingStatus}
                  className="bg-slate-950 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500 w-full"
                >
                  <option value="CRITICAL">CRITICAL</option>
                  <option value="HIGH">HIGH</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="LOW">LOW</option>
                </select>
              </div>

              {/* Admin Notes */}
              <div className="pt-2">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Admin Investigation Notes</p>
                <textarea
                  rows={2}
                  value={adminNoteInput}
                  onChange={(e) => setAdminNoteInput(e.target.value)}
                  placeholder="Add notes e.g., 'Checked panorama ab_068, corrected tag rotation, arrow updated in studio'..."
                  className="w-full bg-slate-950 border border-white/10 rounded-xl p-2.5 text-slate-200 placeholder-slate-500 text-xs focus:outline-none focus:border-sky-500 resize-none"
                />
                <div className="flex items-center justify-between mt-1.5">
                  {updateSuccessMsg && <span className="text-emerald-400 text-xs font-medium">{updateSuccessMsg}</span>}
                  <button
                    onClick={() => handleUpdateReport({ adminNotes: adminNoteInput })}
                    disabled={isUpdatingStatus}
                    className="ml-auto px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs flex items-center gap-1.5 transition-colors"
                  >
                    <Save size={12} />
                    <span>Save Notes</span>
                  </button>
                </div>
              </div>

              {/* Resolution History */}
              {selectedReport.history && selectedReport.history.length > 0 && (
                <div className="pt-2">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Status Audit History</p>
                  <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                    {selectedReport.history.map((h, i) => (
                      <div key={i} className="text-[10px] bg-slate-950/60 p-2 rounded-lg border border-white/5 flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-slate-300">{h.action}</span>
                          {h.newStatus && <span className="text-sky-400 ml-1">→ {h.newStatus}</span>}
                          {h.note && <p className="text-slate-500 text-[9px] mt-0.5">{h.note}</p>}
                        </div>
                        <span className="text-slate-500 text-[9px]">
                          {new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Delete Individual Report */}
              <div className="pt-3 border-t border-white/10 flex justify-end">
                <button
                  onClick={() => handleDeleteReport(selectedReport.id)}
                  className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 size={13} />
                  <span>Delete Report</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
