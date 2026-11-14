import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Flag,
  Search,
  Filter,
  RefreshCw,
  Download,
  Trash2,
  ExternalLink,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  Eye,
  Check,
  Save,
  MapPin,
  Calendar,
  User,
  Phone,
  MessageSquare,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { ApiService } from '../../../services/api';
import {
  CampusReport,
  CampusReportStatus,
  CampusReportPriority,
  CampusReportIssueType,
} from '../../../../../shared/types';

interface ReportsSectionProps {
  onSelectPanorama?: (nodeId: string) => void;
  onReportsCountChange?: (newCount: number) => void;
}

const STATUS_OPTIONS: { value: CampusReportStatus; label: string; color: string }[] = [
  { value: 'NEW', label: 'New', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'ACKNOWLEDGED', label: 'Acknowledged', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { value: 'IN_PROGRESS', label: 'In Progress', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'RESOLVED', label: 'Resolved', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'REJECTED', label: 'Rejected', color: 'bg-rose-50 text-rose-700 border-rose-200' },
];

const CATEGORY_FILTER_OPTIONS = [
  'ALL',
  'WRONG_LOCATION',
  'WRONG_DEPARTMENT',
  'WRONG_ROOM',
  'WRONG_BLOCK',
  'WRONG_NAVIGATION',
  'WRONG_ARROW',
  'MISSING_PLACE',
  'INCORRECT_TAG',
  'FACULTY_INFO',
  'PANORAMA_PROBLEM',
  'SEARCH_PROBLEM',
  'TECHNICAL_PROBLEM',
  'SUGGESTION',
  'OTHER',
];

export const ReportsSection: React.FC<ReportsSectionProps> = ({
  onSelectPanorama,
  onReportsCountChange,
}) => {
  const [reports, setReports] = useState<CampusReport[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | CampusReportStatus>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Selected report for Detail Drawer
  const [selectedReport, setSelectedReport] = useState<CampusReport | null>(null);
  const [adminNoteInput, setAdminNoteInput] = useState<string>('');
  const [isSavingNote, setIsSavingNote] = useState<boolean>(false);

  // Bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatusTarget, setBulkStatusTarget] = useState<CampusReportStatus | ''>('');
  const [isBulkConfirmOpen, setIsBulkConfirmOpen] = useState<boolean>(false);
  const [isBulkSubmitting, setIsBulkSubmitting] = useState<boolean>(false);

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState<CampusReport | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Fetch reports from server
  const loadReports = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await ApiService.getAdminReports({
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        category: categoryFilter !== 'ALL' ? categoryFilter : undefined,
        search: searchQuery.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        limit: 50,
      });

      const loaded = res.reports || [];
      setReports(loaded);
      setTotalCount(res.total || loaded.length);

      const newCount = loaded.filter((r) => r.status === 'NEW').length;
      if (onReportsCountChange) {
        onReportsCountChange(newCount);
      }

      // If drawer is open, keep selected report updated
      if (selectedReport) {
        const found = loaded.find((r) => r.id === selectedReport.id);
        if (found) {
          setSelectedReport(found);
          setAdminNoteInput(found.adminNotes || '');
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load reports from server.');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, categoryFilter, searchQuery, startDate, endDate, selectedReport, onReportsCountChange]);

  useEffect(() => {
    loadReports();
  }, [statusFilter, categoryFilter, startDate, endDate]);

  // Compute status counts from loaded reports
  const statusCounts = useMemo(() => {
    const counts = {
      TOTAL: reports.length,
      NEW: 0,
      IN_PROGRESS: 0,
      RESOLVED: 0,
      REJECTED: 0,
    };
    for (const r of reports) {
      if (r.status === 'NEW') counts.NEW++;
      else if (r.status === 'IN_PROGRESS' || r.status === 'ACKNOWLEDGED') counts.IN_PROGRESS++;
      else if (r.status === 'RESOLVED') counts.RESOLVED++;
      else if (r.status === 'REJECTED') counts.REJECTED++;
    }
    return counts;
  }, [reports]);

  // Client-side search filtering
  const filteredReports = useMemo(() => {
    if (!searchQuery.trim()) return reports;
    const q = searchQuery.toLowerCase().trim();
    return reports.filter((r) => {
      const msg = (r.message || r.description || '').toLowerCase();
      const cat = (r.category || '').toLowerCase();
      const id = (r.id || '').toLowerCase();
      const rep = (r.reporterName || '').toLowerCase();
      const contact = (r.reporterContact || '').toLowerCase();
      const node = (r.nodeId || r.currentNodeId || r.currentPanoramaId || '').toLowerCase();
      return (
        msg.includes(q) ||
        cat.includes(q) ||
        id.includes(q) ||
        rep.includes(q) ||
        contact.includes(q) ||
        node.includes(q)
      );
    });
  }, [reports, searchQuery]);

  // Handle single status change
  const handleStatusChange = async (reportId: string, newStatus: CampusReportStatus) => {
    try {
      await ApiService.updateAdminReport(reportId, { status: newStatus });
      setSuccessBanner(`Updated status of report ${reportId} to ${newStatus}.`);
      setTimeout(() => setSuccessBanner(null), 3000);
      loadReports();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update report status.');
    }
  };

  // Handle saving internal note
  const handleSaveNote = async () => {
    if (!selectedReport) return;
    setIsSavingNote(true);
    try {
      await ApiService.updateAdminReport(selectedReport.id, {
        adminNotes: adminNoteInput.trim(),
      });
      setSuccessBanner('Internal admin note saved successfully.');
      setTimeout(() => setSuccessBanner(null), 3000);
      loadReports();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save admin note.');
    } finally {
      setIsSavingNote(false);
    }
  };

  // Handle single delete
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await ApiService.deleteAdminReport(deleteTarget.id);
      if (selectedReport?.id === deleteTarget.id) {
        setSelectedReport(null);
      }
      setSuccessBanner(`Report ${deleteTarget.id} deleted permanently.`);
      setTimeout(() => setSuccessBanner(null), 3000);
      setDeleteTarget(null);
      loadReports();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete report.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Bulk actions toggle
  const toggleSelectReport = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredReports.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredReports.map((r) => r.id)));
    }
  };

  // Handle bulk status change
  const handleExecuteBulkStatus = async () => {
    if (selectedIds.size === 0 || !bulkStatusTarget) return;
    setIsBulkSubmitting(true);
    try {
      const ids = Array.from(selectedIds);
      await ApiService.bulkUpdateAdminReports(ids, bulkStatusTarget);
      setSuccessBanner(`Successfully updated status to ${bulkStatusTarget} for ${ids.length} reports.`);
      setTimeout(() => setSuccessBanner(null), 3000);
      setSelectedIds(new Set());
      setBulkStatusTarget('');
      setIsBulkConfirmOpen(false);
      loadReports();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to execute bulk status update.');
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  // Export CSV in browser (properly escaped)
  const handleExportCsv = () => {
    const listToExport = filteredReports.length > 0 ? filteredReports : reports;
    if (listToExport.length === 0) {
      alert('No reports to export.');
      return;
    }

    const headers = [
      'Report ID',
      'Created At',
      'Status',
      'Priority',
      'Category',
      'Message',
      'Node ID',
      'Page URL',
      'Reporter Name',
      'Reporter Contact',
      'Admin Notes',
    ];

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '""';
      const clean = String(val).replace(/"/g, '""');
      return `"${clean}"`;
    };

    const rows = listToExport.map((r) => [
      escapeCsv(r.id),
      escapeCsv(r.createdAt),
      escapeCsv(r.status),
      escapeCsv(r.priority),
      escapeCsv(r.category || r.issueType),
      escapeCsv(r.message || r.description),
      escapeCsv(r.nodeId || r.currentNodeId || r.currentPanoramaId || ''),
      escapeCsv(r.page || r.currentURL || ''),
      escapeCsv(r.reporterName || 'Anonymous'),
      escapeCsv(r.reporterContact || ''),
      escapeCsv(r.adminNotes || ''),
    ]);

    const csvContent = [headers.map((h) => `"${h}"`).join(','), ...rows.map((row) => row.join(','))].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `campus_reports_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getStatusChipClass = (status: string) => {
    switch (status) {
      case 'NEW':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'ACKNOWLEDGED':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'IN_PROGRESS':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'RESOLVED':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'REJECTED':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 select-none animate-in fade-in duration-200">
      {/* 1. Header with Title & Action Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Reports & User Feedback
            </h1>
            <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-blue-100 text-blue-800">
              {totalCount} total
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Review reported campus errors, misaligned 360° arrows, and student suggestions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadReports}
            disabled={isLoading}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="px-3.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* 2. Success and Error Banners */}
      {successBanner && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{successBanner}</span>
          </div>
          <button onClick={() => setSuccessBanner(null)} className="text-emerald-600 hover:text-emerald-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-600 hover:text-rose-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 3. Status Metric KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div
          onClick={() => setStatusFilter('ALL')}
          className={`p-4 rounded-2xl border transition cursor-pointer ${
            statusFilter === 'ALL'
              ? 'bg-blue-50/50 border-blue-400 shadow-xs'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-xs font-bold text-slate-500">All Reports</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{statusCounts.TOTAL}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Total in view</div>
        </div>

        <div
          onClick={() => setStatusFilter('NEW')}
          className={`p-4 rounded-2xl border transition cursor-pointer ${
            statusFilter === 'NEW'
              ? 'bg-blue-50/50 border-blue-400 shadow-xs'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-700">New / Unread</span>
            {statusCounts.NEW > 0 && (
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
            )}
          </div>
          <div className="text-2xl font-black text-blue-700 mt-1">{statusCounts.NEW}</div>
          <div className="text-[11px] text-blue-600/70 mt-0.5">Requires triage</div>
        </div>

        <div
          onClick={() => setStatusFilter('IN_PROGRESS')}
          className={`p-4 rounded-2xl border transition cursor-pointer ${
            statusFilter === 'IN_PROGRESS'
              ? 'bg-amber-50/50 border-amber-400 shadow-xs'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-xs font-bold text-amber-700">In Progress</div>
          <div className="text-2xl font-black text-amber-700 mt-1">{statusCounts.IN_PROGRESS}</div>
          <div className="text-[11px] text-amber-600/70 mt-0.5">Under investigation</div>
        </div>

        <div
          onClick={() => setStatusFilter('RESOLVED')}
          className={`p-4 rounded-2xl border transition cursor-pointer ${
            statusFilter === 'RESOLVED'
              ? 'bg-emerald-50/50 border-emerald-400 shadow-xs'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-xs font-bold text-emerald-700">Resolved</div>
          <div className="text-2xl font-black text-emerald-700 mt-1">{statusCounts.RESOLVED}</div>
          <div className="text-[11px] text-emerald-600/70 mt-0.5">Closed issues</div>
        </div>
      </div>

      {/* 4. Filter Toolbar & Search */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search reports by message, reporter, category, or location node..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Category Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">Category:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-medium focus:outline-none focus:border-blue-500"
            >
              {CATEGORY_FILTER_OPTIONS.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === 'ALL' ? 'All Categories' : cat.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range */}
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700"
              title="From date"
            />
            <span>to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700"
              title="To date"
            />
            {(startDate || endDate) && (
              <button
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                }}
                className="text-xs text-blue-600 hover:underline px-1"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* 5. Bulk Actions Bar (Shown when 1+ selected) */}
        {selectedIds.size > 0 && (
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-blue-50/40 p-2.5 rounded-xl">
            <div className="flex items-center gap-2 text-xs font-bold text-blue-900">
              <span className="px-2 py-0.5 rounded-md bg-blue-200 text-blue-900">
                {selectedIds.size} selected
              </span>
              <span>Bulk Actions:</span>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={bulkStatusTarget}
                onChange={(e) => setBulkStatusTarget(e.target.value as CampusReportStatus)}
                className="px-2.5 py-1.5 bg-white border border-blue-200 rounded-xl text-xs text-slate-800 font-semibold focus:outline-none"
              >
                <option value="">Choose new status...</option>
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <button
                disabled={!bulkStatusTarget}
                onClick={() => setIsBulkConfirmOpen(true)}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
              >
                Apply to Selected
              </button>

              <button
                onClick={() => setSelectedIds(new Set())}
                className="px-2.5 py-1.5 text-xs text-slate-600 hover:text-slate-900"
              >
                Clear Selection
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 6. Reports Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-500 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="p-3 w-8 text-center">
                  <input
                    type="checkbox"
                    checked={filteredReports.length > 0 && selectedIds.size === filteredReports.length}
                    onChange={handleSelectAll}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
                <th className="p-3">Status</th>
                <th className="p-3">Category</th>
                <th className="p-3">Message</th>
                <th className="p-3">Location / Node</th>
                <th className="p-3">Reporter</th>
                <th className="p-3">Date</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredReports.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    <Flag className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-bold text-slate-600 text-sm">No reports found</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      No feedback submissions match the selected filters.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredReports.map((report) => {
                  const isChecked = selectedIds.has(report.id);
                  const isSelected = selectedReport?.id === report.id;
                  const messageText = report.message || report.description || '';
                  const locationNode = report.nodeId || report.currentNodeId || report.currentPanoramaId || 'General';

                  return (
                    <tr
                      key={report.id}
                      onClick={() => {
                        setSelectedReport(report);
                        setAdminNoteInput(report.adminNotes || '');
                      }}
                      className={`hover:bg-slate-50/80 transition cursor-pointer ${
                        isSelected ? 'bg-blue-50/40' : ''
                      }`}
                    >
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectReport(report.id)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>

                      <td className="p-3">
                        <span
                          className={`inline-block px-2 py-0.5 text-[10px] font-black rounded-full border ${getStatusChipClass(
                            report.status
                          )}`}
                        >
                          {report.status}
                        </span>
                      </td>

                      <td className="p-3 font-semibold text-slate-800">
                        {report.category || (report.issueType ? report.issueType.replace(/_/g, ' ') : 'Other')}
                      </td>

                      <td className="p-3 max-w-xs sm:max-w-md truncate font-medium text-slate-600">
                        {messageText}
                      </td>

                      <td className="p-3">
                        <span className="font-mono text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">
                          {locationNode}
                        </span>
                      </td>

                      <td className="p-3 text-slate-500 text-[11px]">
                        {report.reporterName || report.reporterContact || 'Anonymous'}
                      </td>

                      <td className="p-3 text-slate-400 text-[11px] whitespace-nowrap">
                        {new Date(report.createdAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>

                      <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => {
                              setSelectedReport(report);
                              setAdminNoteInput(report.adminNotes || '');
                            }}
                            className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                            title="View details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => setDeleteTarget(report)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="Delete report"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 7. Detail Drawer (Modal / Sidebar overlay) */}
      {selectedReport && (
        <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[480px] bg-white border-l border-slate-200 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
          {/* Drawer Header */}
          <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-slate-400">{selectedReport.id}</span>
                <span
                  className={`px-2 py-0.5 text-[10px] font-black rounded-full border ${getStatusChipClass(
                    selectedReport.status
                  )}`}
                >
                  {selectedReport.status}
                </span>
              </div>
              <h2 className="text-sm font-black text-slate-900 mt-1">
                {selectedReport.category || (selectedReport.issueType ? selectedReport.issueType.replace(/_/g, ' ') : 'Campus Feedback')}
              </h2>
            </div>

            <button
              onClick={() => setSelectedReport(null)}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Drawer Content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
            {/* Full Message Section */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black tracking-wider text-slate-400 uppercase">
                Submitted Message
              </label>
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
                {selectedReport.message || selectedReport.description || 'No text provided.'}
              </div>
            </div>

            {/* Location & Viewer Button */}
            <div className="p-3.5 bg-blue-50/50 border border-blue-100 rounded-2xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-blue-600" />
                  Recorded Location Node
                </span>
                <span className="font-mono text-xs font-bold text-blue-800">
                  {selectedReport.nodeId || selectedReport.currentNodeId || selectedReport.currentPanoramaId || 'N/A'}
                </span>
              </div>

              {(selectedReport.nodeId || selectedReport.currentNodeId || selectedReport.currentPanoramaId) && (
                <button
                  type="button"
                  onClick={() => {
                    const targetNode = selectedReport.nodeId || selectedReport.currentNodeId || selectedReport.currentPanoramaId;
                    if (targetNode && onSelectPanorama) {
                      onSelectPanorama(targetNode);
                    }
                  }}
                  className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Open this location in 360° Viewer</span>
                </button>
              )}
            </div>

            {/* Technical Context & Reporter Metadata */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Reporter</span>
                <span className="font-semibold text-slate-800 block truncate">
                  {selectedReport.reporterName || 'Anonymous'}
                </span>
                {selectedReport.reporterContact && (
                  <span className="text-slate-500 block truncate">{selectedReport.reporterContact}</span>
                )}
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Timestamp</span>
                <span className="font-semibold text-slate-800 block text-[11px]">
                  {new Date(selectedReport.createdAt).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Status Change Dropdown */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black tracking-wider text-slate-400 uppercase">
                Update Status
              </label>
              <div className="grid grid-cols-3 gap-2">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleStatusChange(selectedReport.id, opt.value)}
                    className={`py-1.5 px-2 text-xs font-bold rounded-xl border transition cursor-pointer ${
                      selectedReport.status === opt.value
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Internal Admin Note */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-black tracking-wider text-slate-400 uppercase">
                  Internal Admin Note
                </label>
                <span className="text-[10px] text-slate-400">Visible only to admins</span>
              </div>
              <textarea
                rows={3}
                value={adminNoteInput}
                onChange={(e) => setAdminNoteInput(e.target.value)}
                placeholder="Add notes on actions taken, physical room re-verifications, or follow-ups..."
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white transition"
              />
              <button
                type="button"
                onClick={handleSaveNote}
                disabled={isSavingNote}
                className="w-full py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSavingNote ? 'Saving Note...' : 'Save Note'}</span>
              </button>
            </div>

            {/* Delete Report Button */}
            <div className="pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteTarget(selectedReport)}
                className="w-full py-2 border border-rose-200 bg-rose-50/40 hover:bg-rose-50 text-rose-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Report</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-black text-slate-900">Delete Report?</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Are you sure you want to permanently delete report <strong className="font-mono text-slate-800">{deleteTarget.id}</strong>?
                This action cannot be undone.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>{isDeleting ? 'Deleting...' : 'Confirm Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. Bulk Status Confirmation Modal */}
      {isBulkConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
              <Flag className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-black text-slate-900">Confirm Bulk Status Update</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Are you sure you want to change the status of <strong className="text-slate-900">{selectedIds.size} selected reports</strong> to{' '}
                <strong className="text-blue-700">{bulkStatusTarget}</strong>?
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsBulkConfirmOpen(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteBulkStatus}
                disabled={isBulkSubmitting}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isBulkSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>{isBulkSubmitting ? 'Updating...' : 'Confirm Status Change'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
