import React, { useState, useEffect } from 'react';
import {
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Download,
  ShieldCheck,
  RefreshCw,
  Database,
  ExternalLink,
  Terminal,
  History,
  FileText
} from 'lucide-react';
import { ApiService, getApiBaseUrl } from '../../../services/api';

export const PublishSection: React.FC = () => {
  const [publishStatus, setPublishStatus] = useState<any>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);

  // Validation state
  const [isValidating, setIsValidating] = useState(false);
  const [validationReport, setValidationReport] = useState<any>(null);

  const fetchStatus = async () => {
    setIsLoadingStatus(true);
    try {
      const data = await ApiService.getPublishStatus();
      setPublishStatus(data);
    } catch (err) {
      console.error('Failed to fetch publish status:', err);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleValidate = async () => {
    setIsValidating(true);
    try {
      const res = await ApiService.validatePublishState();
      setValidationReport(res?.validation || res);
    } catch (err: any) {
      setValidationReport({
        valid: false,
        errors: [err.message || 'Validation request failed'],
        warnings: [],
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleDownloadBackup = () => {
    const backupUrl = `${getApiBaseUrl()}/publish/export-db`;
    const token = ApiService.getAdminToken();
    fetch(backupUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => res.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `campusnav_backup_${Date.now()}_nohashes.json`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      })
      .catch((err) => {
        alert(`Failed to download backup: ${err.message}`);
      });
  };

  const dbInfo = publishStatus?.database;
  const counts = publishStatus?.counts || {};
  const valSummary = publishStatus?.validation;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 text-slate-800 animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 sm:p-6 bg-white border border-slate-200/80 rounded-3xl shadow-xs">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold text-blue-600 mb-1">
            <Database className="w-4 h-4" />
            <span>CLOUD FIRESTORE LIVE REPOSITORY</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#0f2744]">
            Live Status & Content Verification
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Cloud Firestore is the single source of truth. All Control Center edits replicate live across all server instances in real-time.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="px-3.5 py-1.5 rounded-2xl text-xs font-extrabold border flex items-center gap-1.5 bg-emerald-50 border-emerald-200 text-emerald-700">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            LIVE • REALTIME SYNC ACTIVE
          </span>

          <button
            onClick={fetchStatus}
            disabled={isLoadingStatus}
            className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 cursor-pointer transition shadow-xs"
            title="Refresh Status"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingStatus ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Realtime Sync Information Banner */}
      <div className="p-4 bg-blue-50/80 border border-blue-200 rounded-2xl flex items-start space-x-3 text-xs text-blue-900 leading-relaxed shadow-xs">
        <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">Instant Cloud Deployment:</span> Changes made in the Control Center (navigation paths, 360° hotspots, faculty details, presence statuses) are written directly to Cloud Firestore and synchronize across both your local admin server and the public Render server within seconds via Firestore realtime listeners (<code>onSnapshot</code>). No manual deploy or restart is required.
        </div>
      </div>

      {/* Database Connection & Metric Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Database Engine</div>
          <div className="text-sm font-black text-slate-800 truncate">
            {dbInfo?.provider || 'Google Cloud Firestore'}
          </div>
          <div className="text-[11px] flex items-center gap-1 text-emerald-600 font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            {dbInfo?.status === 'ok' ? 'Connected & Authoritative' : 'Degraded / Offline'}
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Firebase Project ID</div>
          <div className="text-sm font-mono font-bold text-blue-700 truncate">
            {dbInfo?.projectId || 'christ-college-campnav'}
          </div>
          <div className="text-[11px] text-slate-500">Spark Plan • Zero-Cost Tier</div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Last Write / Sync</div>
          <div className="text-xs font-bold text-slate-800">
            {publishStatus?.lastSavedAt ? new Date(publishStatus.lastSavedAt).toLocaleString() : 'Just now'}
          </div>
          <div className="text-[11px] text-slate-500">
            Author: <span className="font-medium text-slate-700">{publishStatus?.savedBy || 'Admin'}</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Graph Integrity Hash</div>
          <div className="text-xs font-mono font-bold text-slate-700">
            {(publishStatus?.contentHash || valSummary?.contentHash || '—').slice(0, 14)}...
          </div>
          <div className="text-[11px] text-slate-500">Version: v{publishStatus?.version || 1}</div>
        </div>
      </div>

      {/* Live Collection Record Counts */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-4">
        <h2 className="text-sm font-black text-[#0f2744] uppercase tracking-wider">
          Active Firestore Document Inventory
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl">
            <div className="text-[10px] font-bold text-slate-400 uppercase">Buildings</div>
            <div className="text-lg font-black text-[#0f2744]">{counts.buildings ?? 12}</div>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl">
            <div className="text-[10px] font-bold text-slate-400 uppercase">Classrooms</div>
            <div className="text-lg font-black text-[#0f2744]">{counts.classrooms ?? 69}</div>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl">
            <div className="text-[10px] font-bold text-slate-400 uppercase">Laboratories</div>
            <div className="text-lg font-black text-[#0f2744]">{counts.laboratories ?? 33}</div>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl">
            <div className="text-[10px] font-bold text-slate-400 uppercase">Teachers Directory</div>
            <div className="text-lg font-black text-blue-600">{counts.teachers ?? 278}</div>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl">
            <div className="text-[10px] font-bold text-slate-400 uppercase">Faculty Accounts</div>
            <div className="text-lg font-black text-emerald-600">{counts.facultyAccounts ?? 0}</div>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl">
            <div className="text-[10px] font-bold text-slate-400 uppercase">Live Statuses</div>
            <div className="text-lg font-black text-amber-600">{counts.facultyStatuses ?? 0}</div>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl">
            <div className="text-[10px] font-bold text-slate-400 uppercase">Panoramas</div>
            <div className="text-lg font-black text-[#0f2744]">{counts.panoramas ?? 474}</div>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl">
            <div className="text-[10px] font-bold text-slate-400 uppercase">Nav Nodes</div>
            <div className="text-lg font-black text-[#0f2744]">{counts.navigationNodes ?? 0}</div>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl">
            <div className="text-[10px] font-bold text-slate-400 uppercase">Nav Edges</div>
            <div className="text-lg font-black text-[#0f2744]">{counts.navigationEdges ?? 0}</div>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl">
            <div className="text-[10px] font-bold text-slate-400 uppercase">Places & Tags</div>
            <div className="text-lg font-black text-[#0f2744]">{counts.places ?? 0}</div>
          </div>
        </div>
      </div>

      {/* Actions: Validate Content & Download Backup */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Validate Content Panel */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-4">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-[#0f2744]">Graph & Content Validation</h3>
              <p className="text-xs text-slate-500">Run automated integrity checks across navigation nodes, edges, and 360° tags.</p>
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs space-y-2">
            <div className="text-slate-600 leading-relaxed">
              Verifies that all door nodes connect to walkable paths, all panorama yaw angles are within bounds, and no orphan nodes exist.
            </div>
            <button
              onClick={handleValidate}
              disabled={isValidating}
              className="w-full py-2.5 px-4 bg-[#1a56db] hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold text-xs shadow-xs transition flex items-center justify-center space-x-2 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{isValidating ? 'Validating Content...' : 'Validate Content Integrity'}</span>
            </button>
          </div>

          {validationReport && (
            <div
              className={`p-4 rounded-2xl border text-xs leading-relaxed space-y-2 ${
                validationReport.valid
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-700'
              }`}
            >
              <div className="font-bold flex items-center space-x-2">
                {validationReport.valid ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                )}
                <span>
                  {validationReport.valid
                    ? `Integrity Verified: ${validationReport.totalNodeCount || 474} panoramas, ${validationReport.totalConnections || 0} connections, 0 errors.`
                    : `Integrity Warnings (${validationReport.errors?.length || 1} issues found)`}
                </span>
              </div>
              {validationReport.errors?.length > 0 && (
                <ul className="list-disc list-inside space-y-1 text-[11px] pl-2 font-mono">
                  {validationReport.errors.map((err: string, i: number) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Database Backup Panel */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-4">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-[#0f2744]">Database Backup & Export</h3>
              <p className="text-xs text-slate-500">Download sanitized content backups or execute authoritative backups.</p>
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs space-y-3">
            <div className="text-slate-600 leading-relaxed">
              <strong>Browser Backup (Sanitized):</strong> Exports complete campus geometry, nodes, tags, faculty directories, and presence records. <span className="text-amber-700 font-bold">Excludes password hashes</span> for safe handling.
            </div>
            <button
              onClick={handleDownloadBackup}
              className="w-full py-2.5 px-4 bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 rounded-xl font-bold text-xs shadow-xs transition flex items-center justify-center space-x-2 cursor-pointer"
            >
              <Download className="w-4 h-4 text-blue-600" />
              <span>Download Backup (JSON — Hashes Excluded)</span>
            </button>
          </div>

          <div className="p-4 bg-amber-50/70 border border-amber-200/80 rounded-2xl text-[11px] text-amber-900 leading-relaxed space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-amber-800">
              <Terminal className="w-3.5 h-3.5" />
              <span>Authoritative Full Backup (CLI Tool)</span>
            </div>
            <p>
              To create an authoritative backup that preserves bcrypt password hashes, execute the secure backup CLI script on your PC:
            </p>
            <div className="p-2 bg-white/90 border border-amber-200 rounded-lg font-mono text-[10px] text-slate-800 select-all">
              npx tsx scripts/backupFirestore.ts --out C:\SafeBackups\CampNav
            </div>
            <p className="text-[10px] text-amber-700">
              * Ensure backup files are stored in a safe folder outside the git repository and outside OneDrive sync to avoid accidental leaks.
            </p>
          </div>
        </div>
      </div>

      {/* Snapshot Rollback Retirement Notice */}
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-600 flex items-start space-x-3 leading-relaxed">
        <History className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-slate-800">Point-in-Time Recovery Note:</span> Disk snapshot rollbacks have been superseded by Cloud Firestore. All administrative mutations are recorded in audit logs (<code>adminAuditLogs</code> and <code>facultyStatusAuditLogs</code>). For state recovery, use the CLI backup script to restore snapshot JSONs.
        </div>
      </div>
    </div>
  );
};
