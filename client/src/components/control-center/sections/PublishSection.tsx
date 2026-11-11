import React, { useState, useEffect } from 'react';
import {
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Download,
  Upload,
  GitBranch,
  ShieldCheck,
  RotateCcw,
  ExternalLink,
  Play,
  Database,
  RefreshCw,
  HardDrive
} from 'lucide-react';
import { ApiService } from '../../../services/api';

export const PublishSection: React.FC = () => {
  const [publishStatus, setPublishStatus] = useState<any>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);

  // Pre-publish validation state
  const [isValidating, setIsValidating] = useState(false);
  const [validationReport, setValidationReport] = useState<any>(null);

  // Sync / Deploy states
  const [targetUrl, setTargetUrl] = useState<string>('https://campnav-b3om.onrender.com');
  const [forceOverwrite, setForceOverwrite] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<{
    success: boolean;
    message?: string;
    error?: string;
    verifiedRemoteHash?: string;
    remoteNodeCount?: number;
    validation?: any;
  } | null>(null);

  // Database import/export states
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  const fetchStatus = async () => {
    setIsLoadingStatus(true);
    try {
      const data = await ApiService.getPublishStatus();
      setPublishStatus(data);
      if (data?.liveUrl && targetUrl === 'https://campnav-b3om.onrender.com') {
        setTargetUrl(data.liveUrl.replace(/\/+$/, ''));
      }
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
      const res = await ApiService.validatePublishState(targetUrl);
      setValidationReport(res?.validation || res);
    } catch (err: any) {
      setValidationReport({
        valid: false,
        errors: [err.message || 'Validation request failed'],
        warnings: []
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleSyncToTarget = async () => {
    if (!confirm(`Publish validated local data to ${targetUrl}? This will validate all 474+ panoramas, create an automatic backup snapshot, push changes atomically, and verify the remote state.`)) {
      return;
    }

    setIsSyncing(true);
    setDeployResult(null);
    try {
      const res = await ApiService.syncPublishToTarget({
        targetUrl,
        force: forceOverwrite,
        confirmLiveProduction: true,
        mode: 'TARGET_API'
      });
      setDeployResult(res);
      await fetchStatus();
    } catch (err: any) {
      setDeployResult({ success: false, error: err.message || 'Publish synchronization failed.' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeploy = async () => {
    if (!confirm('Trigger Render redeploy via build hook? (Code changes are pulled from the GitHub repository, and database state is restored from the private data repository).')) return;

    setIsDeploying(true);
    setDeployResult(null);
    try {
      const res = await ApiService.deployToRender();
      setDeployResult(res);
      await fetchStatus();
    } catch (err: any) {
      setDeployResult({ success: false, error: err.message });
    } finally {
      setIsDeploying(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (!confirm('Are you sure you want to import this database snapshot? An automatic backup snapshot will be created before importing.')) {
          return;
        }

        setIsImporting(true);
        const res = await ApiService.importDatabase(json);
        setImportMessage(`Database imported successfully: ${res.message}`);
        await fetchStatus();
        setTimeout(() => setImportMessage(null), 5000);
      } catch (err: any) {
        alert(`Failed to import JSON: ${err.message}`);
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsText(file);
  };

  const isPublished = publishStatus?.publishStatus === 'PUBLISHED';
  const valSummary = publishStatus?.validation;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 text-slate-800 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 sm:p-6 bg-white border border-slate-200/80 rounded-3xl shadow-xs">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold text-blue-600 mb-1">
            <UploadCloud className="w-4 h-4" />
            <span>DEPLOYMENT & RECOVERY PLANE</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#0f2744]">
            Publish, Deploy & Backup Management
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Local edits stay safely in draft mode until you explicitly validate and publish to the public website.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`px-3 py-1.5 rounded-2xl text-xs font-extrabold border flex items-center gap-1.5 ${
              isPublished
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-amber-50 border-amber-200 text-amber-700'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isPublished ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {isPublished ? 'SYNCED WITH PUBLISHED' : 'LOCAL DRAFT — UNPUBLISHED EDITS'}
          </span>

          <div className="flex items-center space-x-2 text-xs bg-slate-100 border border-slate-200 px-3.5 py-1.5 rounded-2xl">
            <GitBranch className="w-4 h-4 text-blue-600" />
            <span className="text-slate-600 font-bold">Branch:</span>
            <span className="text-blue-700 font-mono font-bold">
              {publishStatus?.gitBranch || 'main'}
            </span>
          </div>

          <button
            onClick={fetchStatus}
            disabled={isLoadingStatus}
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 cursor-pointer"
            title="Refresh Status"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingStatus ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Status Summary Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Graph Version</div>
          <div className="text-lg font-black text-[#0f2744] mt-0.5">
            v{publishStatus?.version ?? valSummary?.version ?? 1}
          </div>
          <div className="text-[11px] text-slate-500 font-mono truncate">
            Hash: {(publishStatus?.contentHash || valSummary?.contentHash || '—').slice(0, 12)}
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Panorama Nodes</div>
          <div className="text-lg font-black text-[#1a56db] mt-0.5">
            {valSummary?.totalNodeCount ?? 474}
          </div>
          <div className="text-[11px] text-slate-500">
            {valSummary?.canonicalNodeCount ?? 474} base + {valSummary?.customNodeCount ?? 0} uploaded
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Arrow Connections</div>
          <div className="text-lg font-black text-[#0f2744] mt-0.5">
            {valSummary?.totalConnections ?? '—'}
          </div>
          <div className="text-[11px] text-slate-500">One-way calibrated links</div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Location Tags</div>
          <div className="text-lg font-black text-[#0f2744] mt-0.5">
            {valSummary?.totalTags ?? '—'}
          </div>
          <div className="text-[11px] text-slate-500">Searchable 360° pins</div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs col-span-2 sm:col-span-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Uploaded Images</div>
          <div className="text-lg font-black text-[#0f2744] mt-0.5">
            {valSummary?.uploadedAssetsCount ?? 0}
          </div>
          <div className="text-[11px] text-slate-500">DB + Disk persistent</div>
        </div>
      </div>

      {deployResult && (
        <div
          className={`p-4 rounded-2xl border text-xs flex flex-col gap-1.5 font-medium ${
            deployResult.success
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-700'
          }`}
        >
          <div className="flex items-center space-x-2">
            {deployResult.success ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span className="font-bold">{deployResult.message || deployResult.error}</span>
          </div>
          {deployResult.verifiedRemoteHash && (
            <div className="pl-7 text-[11px] text-emerald-700 font-mono">
              Verified Remote Hash: {deployResult.verifiedRemoteHash.slice(0, 12)} • Panoramas: {deployResult.remoteNodeCount ?? deployResult.validation?.totalNodeCount} • Connections: {deployResult.validation?.totalConnections}
            </div>
          )}
        </div>
      )}

      {importMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 flex items-center space-x-2 font-medium">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{importMessage}</span>
        </div>
      )}

      {/* Grid: Publish Website & Backup Management */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Live Publish Synchronization Card */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="font-black text-[#0f2744] text-sm flex items-center space-x-2">
              <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#1a56db] flex items-center justify-center">
                <UploadCloud className="w-4 h-4" />
              </div>
              <span>Publish Website Synchronization</span>
            </div>
            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 font-bold uppercase">
              Verified Sync
            </span>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            Validates all 474+ panorama nodes, location tags, one-way connections, and uploaded images, checks for remote conflicts, pushes atomically, and verifies remote integrity before reporting success.
          </p>

          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500 font-medium shrink-0">Target Website URL:</span>
              <input
                type="text"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                className="w-full max-w-[260px] px-2.5 py-1 rounded-lg bg-white border border-slate-200 font-mono text-[11px] text-blue-700 font-bold focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Public Website Link:</span>
              <a
                href={publishStatus?.liveUrl || 'https://campnav-b3om.onrender.com/'}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-blue-700 hover:text-blue-800 font-bold flex items-center space-x-1"
              >
                <span>campnav-b3om.onrender.com</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Last Published Hash:</span>
              <span className="font-mono text-slate-700 font-bold">
                {(publishStatus?.lastPublishedHash || valSummary?.lastPublishedHash || '').slice(0, 12) || 'Not published yet'}
              </span>
            </div>

            <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={forceOverwrite}
                onChange={(e) => setForceOverwrite(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-[11px] text-slate-600 font-medium">
                Force overwrite if remote server has diverged
              </span>
            </label>
          </div>

          {validationReport && (
            <div
              className={`p-3 rounded-xl border text-xs ${
                validationReport.valid
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-700'
              }`}
            >
              <div className="font-bold flex items-center gap-1.5">
                {validationReport.valid ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                )}
                <span>
                  {validationReport.valid
                    ? `Validation Passed: ${validationReport.totalNodeCount} panoramas, ${validationReport.totalConnections} connections, 0 errors.`
                    : `Validation Failed (${validationReport.errors?.length || 1} errors)`}
                </span>
              </div>
              {validationReport.errors?.length > 0 && (
                <ul className="mt-1 list-disc list-inside text-[11px]">
                  {validationReport.errors.slice(0, 5).map((err: string, idx: number) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              onClick={handleValidate}
              disabled={isValidating}
              className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition flex items-center justify-center space-x-2 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <span>{isValidating ? 'Validating...' : 'Validate Before Publish'}</span>
            </button>

            <button
              onClick={handleSyncToTarget}
              disabled={isSyncing}
              className="py-2.5 px-4 bg-[#1a56db] hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold text-xs shadow-xs transition flex items-center justify-center space-x-2 cursor-pointer"
            >
              {isSyncing ? (
                <>
                  <RotateCcw className="w-4 h-4 animate-spin" />
                  <span>Syncing & Verifying...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  <span>Publish Website (API Sync)</span>
                </>
              )}
            </button>
          </div>

          <button
            onClick={handleDeploy}
            disabled={isDeploying}
            className="w-full py-2.5 bg-white hover:bg-slate-50 border border-slate-200 disabled:opacity-50 text-slate-700 rounded-xl font-bold text-xs transition flex items-center justify-center space-x-2 cursor-pointer"
          >
            <GitBranch className="w-4 h-4 text-slate-500" />
            <span>
              {isDeploying ? 'Triggering Deploy...' : 'Trigger Render Redeploy (Deploy Hook)'}
            </span>
          </button>
        </div>

        {/* Database Export / Import Backup Card */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="font-black text-[#0f2744] text-sm flex items-center space-x-2">
              <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#1a56db] flex items-center justify-center">
                <Database className="w-4 h-4" />
              </div>
              <span>Database Snapshot & Disaster Recovery</span>
            </div>
            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold uppercase">
              JSON Snapshot
            </span>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            Download a portable, self-contained JSON snapshot containing all 474+ panoramas, uploaded image assets, manual numbers, one-way connections, location tags, and faculty records.
          </p>

          <div className="space-y-3 pt-1">
            <a
              href={ApiService.getDatabaseExportUrl()}
              download="waycampus-full-database.json"
              className="w-full py-2.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl text-xs font-bold text-blue-700 transition flex items-center justify-center space-x-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Download Full Database Backup (JSON)</span>
            </a>

            <div className="relative">
              <input
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                id="database-import-file"
                className="hidden"
              />
              <label
                htmlFor="database-import-file"
                className="w-full py-2.5 bg-slate-50 hover:bg-slate-100 border border-dashed border-slate-300 rounded-xl text-xs font-bold text-slate-700 transition flex items-center justify-center space-x-2 cursor-pointer"
              >
                <Upload className="w-4 h-4 text-slate-500" />
                <span>{isImporting ? 'Importing JSON...' : 'Import JSON Database File'}</span>
              </label>
            </div>
          </div>

          <div className="p-3.5 bg-blue-50/70 border border-blue-200/70 rounded-2xl text-[11px] text-slate-600 leading-relaxed space-y-1">
            <div className="flex items-center gap-1.5 text-blue-700 font-bold">
              <HardDrive className="w-3.5 h-3.5" />
              <span>Zero-Cost (₹0 / $0) Persistent Storage Architecture</span>
            </div>
            <p>
              All panorama connections, manual numbers, location tags, and uploaded panorama images are stored in <code className="font-mono text-blue-800">campusnav_db.json</code> (including embedded <code className="font-mono text-blue-800">uploadedPanoramaAssets</code> binary fallback) and re-materialized automatically on server startup, ensuring persistence across Render free-tier sleep/restarts without paid external storage.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
