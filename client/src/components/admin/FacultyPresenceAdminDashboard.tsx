import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users, UserCheck, KeyRound, Shield, Search, Filter, RefreshCw,
  CheckCircle2, AlertCircle, Clock, MapPin, Plus, Lock, Edit3, X,
  Check, Loader2, Sparkles, AlertTriangle
} from 'lucide-react';
import { ApiService } from '../../services/api';
import { FacultyStatusType, PublicFacultyStatus, Teacher, FacultyStatusAuditLog } from '../../../../shared/types';
import { useNavigation } from '../../context/NavigationContext';

const STATUS_CONFIG: Record<
  FacultyStatusType,
  { label: string; dotColor: string; badgeStyle: string }
> = {
  AVAILABLE: {
    label: 'Available',
    dotColor: 'bg-emerald-400',
    badgeStyle: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  },
  IN_CLASS: {
    label: 'In Class',
    dotColor: 'bg-blue-400',
    badgeStyle: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  },
  BUSY: {
    label: 'Busy',
    dotColor: 'bg-amber-400',
    badgeStyle: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  },
  NOT_AVAILABLE: {
    label: 'Not Available',
    dotColor: 'bg-slate-400',
    badgeStyle: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
  },
  ON_LEAVE: {
    label: 'On Leave',
    dotColor: 'bg-rose-400',
    badgeStyle: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
  },
  NOT_MARKED: {
    label: 'Not Marked',
    dotColor: 'bg-slate-500',
    badgeStyle: 'bg-slate-800/80 text-slate-400 border-slate-700/80',
  },
};

function formatTime(isoString?: string): string {
  if (!isoString) return 'Never';
  const d = new Date(isoString);
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const FacultyPresenceAdminDashboard: React.FC = () => {
  const { teachers } = useNavigation();

  const [activeSubTab, setActiveSubTab] = useState<'MONITOR' | 'ACCOUNTS' | 'AUDIT'>('MONITOR');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Monitor State
  const [statuses, setStatuses] = useState<Record<string, PublicFacultyStatus>>({});
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Override Modal State
  const [overrideTarget, setOverrideTarget] = useState<Teacher | null>(null);
  const [overrideStatus, setOverrideStatus] = useState<FacultyStatusType>('NOT_AVAILABLE');
  const [overrideLocation, setOverrideLocation] = useState<string>('');
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [overrideDuration, setOverrideDuration] = useState<number>(120);
  const [isSubmittingOverride, setIsSubmittingOverride] = useState(false);

  // Accounts State
  const [accounts, setAccounts] = useState<any[]>([]);
  const [showCreateAccountModal, setShowCreateAccountModal] = useState(false);
  const [selectedFacultyIdForAccount, setSelectedFacultyIdForAccount] = useState<string>('');
  const [accountEmail, setAccountEmail] = useState<string>('');
  const [accountCode, setAccountCode] = useState<string>('');
  const [accountPassword, setAccountPassword] = useState<string>('');
  const [isSubmittingAccount, setIsSubmittingAccount] = useState(false);

  // Reset Password Modal State
  const [resetAccountTarget, setResetAccountTarget] = useState<any | null>(null);
  const [newResetPassword, setNewResetPassword] = useState<string>('');
  const [isSubmittingReset, setIsSubmittingReset] = useState(false);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<FacultyStatusAuditLog[]>([]);

  // Classrooms
  const [classrooms, setClassrooms] = useState<any[]>([]);

  // Public Status Diagnostic State
  const [diagnosticResult, setDiagnosticResult] = useState<{
    checkedCount: number;
    syncedCount: number;
    mismatchCount: number;
    timestamp: string;
  } | null>(null);
  const [isRunningDiagnostic, setIsRunningDiagnostic] = useState(false);

  const runPublicStatusDiagnostic = async () => {
    setIsRunningDiagnostic(true);
    try {
      const freshStatuses = await ApiService.getFacultyStatuses();
      let synced = 0;
      let mismatch = 0;
      for (const t of teachers) {
        const dbStatus = freshStatuses[t.id];
        if (dbStatus && dbStatus.status) {
          synced++;
        } else {
          mismatch++;
        }
      }
      setDiagnosticResult({
        checkedCount: teachers.length,
        syncedCount: synced,
        mismatchCount: mismatch,
        timestamp: new Date().toLocaleTimeString(),
      });
      setSuccessMsg(`Diagnostic complete: ${synced} faculty statuses synced with search index.`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(`Diagnostic failed: ${err.message}`);
    } finally {
      setIsRunningDiagnostic(false);
    }
  };

  const loadAllData = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const [statusRes, accountsRes, logsRes, classRes] = await Promise.all([
        ApiService.getFacultyStatuses(),
        ApiService.getAdminFacultyAccounts().catch(() => ({ accounts: [] })),
        ApiService.getAdminFacultyStatusLogs().catch(() => ({ logs: [] })),
        ApiService.getVerifiedClassrooms().catch(() => []),
      ]);

      setStatuses(statusRes || {});
      setAccounts(accountsRes?.accounts || []);
      setAuditLogs(logsRes?.logs || []);
      setClassrooms(classRes || []);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to load faculty presence data.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Filtered Faculty for Monitor
  const filteredFaculty = useMemo(() => {
    let list = teachers;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.departmentName && t.departmentName.toLowerCase().includes(q)) ||
          (t.departmentCategory && t.departmentCategory.toLowerCase().includes(q))
      );
    }

    if (statusFilter !== 'ALL') {
      list = list.filter((t) => {
        const cur = statuses[t.id]?.status || 'NOT_AVAILABLE';
        return cur === statusFilter;
      });
    }

    return list;
  }, [teachers, searchQuery, statusFilter, statuses]);

  // Handle Admin Override Submit
  const handleOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideTarget) return;

    setIsSubmittingOverride(true);
    setErrorMsg(null);

    try {
      await ApiService.overrideAdminFacultyStatus(overrideTarget.id, {
        status: overrideStatus,
        locationPlaceId: overrideStatus === 'IN_CLASS' ? overrideLocation : undefined,
        reason: overrideReason.trim() || 'Admin Override',
        durationMinutes: overrideDuration,
      });

      setSuccessMsg(`Status for "${overrideTarget.name}" successfully overridden.`);
      setOverrideTarget(null);
      setOverrideReason('');
      setOverrideLocation('');
      await loadAllData();
      window.dispatchEvent(new CustomEvent('campnav:faculty_status_updated'));
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to override status.');
    } finally {
      setIsSubmittingOverride(false);
    }
  };

  // Handle Create Account Submit
  const handleCreateAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFacultyIdForAccount || !accountEmail || !accountPassword) {
      setErrorMsg('Please provide faculty selection, email, and password.');
      return;
    }

    setIsSubmittingAccount(true);
    setErrorMsg(null);

    try {
      await ApiService.createAdminFacultyAccount({
        facultyId: selectedFacultyIdForAccount,
        email: accountEmail.trim(),
        facultyCode: accountCode.trim() || undefined,
        password: accountPassword,
      });

      setSuccessMsg('Faculty account created successfully!');
      setShowCreateAccountModal(false);
      setSelectedFacultyIdForAccount('');
      setAccountEmail('');
      setAccountCode('');
      setAccountPassword('');
      await loadAllData();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to create faculty account.');
    } finally {
      setIsSubmittingAccount(false);
    }
  };

  // Handle Toggle Active
  const handleToggleAccountActive = async (account: any) => {
    const nextState = !account.isActive;
    try {
      await ApiService.toggleAdminFacultyAccountActive(account.id, nextState);
      await loadAllData();
      setSuccessMsg(`Account for "${account.facultyName}" ${nextState ? 'enabled' : 'disabled'}.`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to update account.');
    }
  };

  // Handle Reset Password Submit
  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetAccountTarget || newResetPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    setIsSubmittingReset(true);
    try {
      await ApiService.resetAdminFacultyAccountPassword(resetAccountTarget.id, newResetPassword);
      setSuccessMsg(`Password for "${resetAccountTarget.facultyName}" reset successfully.`);
      setResetAccountTarget(null);
      setNewResetPassword('');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to reset password.');
    } finally {
      setIsSubmittingReset(false);
    }
  };

  return (
    <div className="space-y-4 text-slate-100">
      {/* Dashboard Sub-Tabs Header */}
      <div className="p-4 bg-slate-900/80 rounded-2xl border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-white font-black text-base flex items-center gap-2">
            <UserCheck size={18} className="text-sky-400" />
            Faculty Presence & Availability Control
          </h2>
          <p className="text-slate-400 text-xs mt-0.5">
            Monitor real-time faculty availability, manage faculty login accounts, and audit state transitions.
          </p>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-white/10">
          <button
            onClick={() => setActiveSubTab('MONITOR')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeSubTab === 'MONITOR' ? 'bg-sky-500 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            Presence Monitor
          </button>
          <button
            onClick={() => setActiveSubTab('ACCOUNTS')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeSubTab === 'ACCOUNTS' ? 'bg-sky-500 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            Faculty Accounts ({accounts.length})
          </button>
          <button
            onClick={() => setActiveSubTab('AUDIT')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeSubTab === 'AUDIT' ? 'bg-sky-500 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            Audit Trail ({auditLogs.length})
          </button>
        </div>
      </div>

      {/* Global Alerts */}
      {successMsg && (
        <div className="p-3 bg-emerald-950/60 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center gap-2 animate-fade-in">
          <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-rose-950/60 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2 animate-fade-in">
          <AlertCircle size={16} className="text-rose-400 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          1. PRESENCE MONITOR & OVERRIDE SUB-TAB
      ───────────────────────────────────────────────────────────── */}
      {activeSubTab === 'MONITOR' && (
        <div className="space-y-3">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row items-center gap-2.5">
            <div className="relative flex-1 w-full">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search faculty by name or department..."
                className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto scrollbar-none">
              {['ALL', 'AVAILABLE', 'IN_CLASS', 'BUSY', 'NOT_AVAILABLE', 'ON_LEAVE'].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all border ${
                    statusFilter === st
                      ? 'bg-sky-500 text-white border-sky-400 shadow-md'
                      : 'bg-slate-900 text-slate-400 border-white/10 hover:text-white'
                  }`}
                >
                  {st === 'ALL' ? 'All' : STATUS_CONFIG[st as FacultyStatusType]?.label || st}
                </button>
              ))}

              <button
                onClick={runPublicStatusDiagnostic}
                disabled={isRunningDiagnostic}
                className="px-3 py-1.5 rounded-xl bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300 font-bold text-[11px] transition-colors flex items-center gap-1.5 flex-shrink-0"
                title="Check synchronization between Database status and Public Search Engine"
              >
                <Sparkles size={12} className={isRunningDiagnostic ? 'animate-spin text-emerald-400' : 'text-emerald-400'} />
                <span>{isRunningDiagnostic ? 'Checking...' : 'Check Public Status'}</span>
              </button>

              <button
                onClick={loadAllData}
                disabled={isLoading}
                className="p-2 rounded-xl bg-slate-900 border border-white/10 hover:bg-slate-800 text-slate-300 transition-colors flex-shrink-0"
                title="Refresh Monitor"
              >
                <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Diagnostic Result Banner */}
          {diagnosticResult && (
            <div className="p-3 bg-slate-900/90 border border-emerald-500/30 rounded-xl flex items-center justify-between text-xs animate-fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-400" />
                <span className="font-semibold text-slate-200">Public Status Integrity:</span>
                <span className="text-emerald-400 font-bold font-mono">{diagnosticResult.syncedCount} / {diagnosticResult.checkedCount} Active</span>
                <span className="text-slate-400 text-[10px]">({diagnosticResult.timestamp})</span>
              </div>
              <button
                onClick={() => setDiagnosticResult(null)}
                className="text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>
          )}

          {/* Table */}
          <div className="bg-slate-900/90 border border-white/10 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950/80 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-white/10">
                    <th className="p-3">Faculty Member</th>
                    <th className="p-3">Department</th>
                    <th className="p-3">Current Status</th>
                    <th className="p-3">Last Declared Location</th>
                    <th className="p-3">Updated At</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-medium">
                  {filteredFaculty.slice(0, 100).map((teacher) => {
                    const st = statuses[teacher.id] || { status: 'NOT_AVAILABLE', updatedAt: '' };
                    const cfg = STATUS_CONFIG[st.status] || STATUS_CONFIG.NOT_AVAILABLE;
                    return (
                      <tr key={teacher.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            {teacher.profileImageUrl ? (
                              <img
                                src={teacher.profileImageUrl}
                                alt={teacher.name}
                                className="w-7 h-7 rounded-lg object-cover flex-shrink-0"
                              />
                            ) : (
                              <div className="w-7 h-7 rounded-lg bg-slate-800 text-slate-400 flex items-center justify-center text-xs font-bold flex-shrink-0">
                                {teacher.name.charAt(0)}
                              </div>
                            )}
                            <div>
                              <p className="text-white font-bold">{teacher.name}</p>
                              <p className="text-[10px] text-slate-400">{teacher.designation}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-slate-300 text-[11px]">
                          {teacher.departmentName || teacher.departmentCategory || 'Christ College'}
                        </td>
                        <td className="p-3">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${cfg.badgeStyle}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotColor}`} />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="p-3 text-slate-300 text-[11px]">
                          {st.locationName ? (
                            <span className="text-sky-300 font-semibold">{st.locationName}</span>
                          ) : (
                            <span className="text-slate-500">Department Office</span>
                          )}
                        </td>
                        <td className="p-3 text-slate-400 text-[10px] font-mono">
                          {formatTime(st.updatedAt)}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => {
                              setOverrideTarget(teacher);
                              setOverrideStatus(st.status);
                              setOverrideLocation(st.locationPlaceId || '');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 text-[11px] font-bold transition-colors"
                          >
                            Override
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredFaculty.length === 0 && (
              <div className="py-12 text-center text-slate-500 text-xs">
                No faculty members match your filter criteria.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          2. FACULTY ACCOUNTS SUB-TAB
      ───────────────────────────────────────────────────────────── */}
      {activeSubTab === 'ACCOUNTS' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Manage secure authentication accounts linked to verified faculty records.
            </p>
            <button
              onClick={() => setShowCreateAccountModal(true)}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-sky-500/25"
            >
              <Plus size={14} />
              <span>Create Faculty Account</span>
            </button>
          </div>

          <div className="bg-slate-900/90 border border-white/10 rounded-2xl overflow-hidden shadow-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/80 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-white/10">
                  <th className="p-3">Faculty Member</th>
                  <th className="p-3">Official Email / ID</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Last Login</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-medium">
                {accounts.map((acc) => (
                  <tr key={acc.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-3">
                      <p className="text-white font-bold">{acc.facultyName}</p>
                      <p className="text-[10px] text-slate-400">{acc.departmentName}</p>
                    </td>
                    <td className="p-3">
                      <p className="text-slate-200 font-mono text-[11px]">{acc.email}</p>
                      <p className="text-[10px] text-slate-500">ID: {acc.facultyCode}</p>
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          acc.isActive
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                        }`}
                      >
                        {acc.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="p-3 text-slate-400 text-[10px] font-mono">
                      {formatTime(acc.lastLoginAt)}
                    </td>
                    <td className="p-3 text-right space-x-1.5">
                      <button
                        onClick={() => handleToggleAccountActive(acc)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                          acc.isActive
                            ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/30'
                            : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                        }`}
                      >
                        {acc.isActive ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        onClick={() => setResetAccountTarget(acc)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10 text-[10px] font-bold transition-colors"
                      >
                        Reset Password
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {accounts.length === 0 && (
              <div className="py-12 text-center text-slate-500 text-xs">
                No faculty accounts configured. Click "Create Faculty Account" to link one.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          3. AUDIT TRAIL SUB-TAB
      ───────────────────────────────────────────────────────────── */}
      {activeSubTab === 'AUDIT' && (
        <div className="bg-slate-900/90 border border-white/10 rounded-2xl overflow-hidden shadow-xl">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/80 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-white/10">
                <th className="p-3">Faculty Member</th>
                <th className="p-3">Transition</th>
                <th className="p-3">Source & Author</th>
                <th className="p-3">Location / Note</th>
                <th className="p-3">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-medium">
              {auditLogs.slice(0, 100).map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="p-3">
                    <p className="text-white font-bold">{log.facultyName}</p>
                    <p className="text-[10px] text-slate-400">{log.departmentName}</p>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-500 line-through text-[10px]">
                        {log.previousStatus || 'INIT'}
                      </span>
                      <span className="text-slate-400">→</span>
                      <span className="text-white font-bold">{log.newStatus}</span>
                    </div>
                  </td>
                  <td className="p-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                        log.source === 'ADMIN'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          : 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                      }`}
                    >
                      {log.source} ({log.updatedBy})
                    </span>
                  </td>
                  <td className="p-3 text-slate-300 text-[11px]">
                    {log.locationName || log.adminReason || '—'}
                  </td>
                  <td className="p-3 text-slate-400 text-[10px] font-mono">
                    {formatTime(log.timestamp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {auditLogs.length === 0 && (
            <div className="py-12 text-center text-slate-500 text-xs">
              No status changes recorded yet in the audit trail.
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL: ADMIN STATUS OVERRIDE
      ───────────────────────────────────────────────────────────── */}
      {overrideTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-white/15 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-white font-extrabold text-sm">Override Availability Status</h3>
                <p className="text-slate-400 text-xs">{overrideTarget.name}</p>
              </div>
              <button
                onClick={() => setOverrideTarget(null)}
                className="w-7 h-7 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center"
              >
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handleOverrideSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Authorized Status
                </label>
                <select
                  value={overrideStatus}
                  onChange={(e) => setOverrideStatus(e.target.value as FacultyStatusType)}
                  className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-white text-xs focus:outline-none focus:border-sky-500"
                >
                  <option value="AVAILABLE">Available</option>
                  <option value="IN_CLASS">In Class</option>
                  <option value="BUSY">Busy</option>
                  <option value="NOT_AVAILABLE">Not Available</option>
                  <option value="ON_LEAVE">On Leave</option>
                </select>
              </div>

              {overrideStatus === 'IN_CLASS' && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Verified Classroom
                  </label>
                  <select
                    value={overrideLocation}
                    onChange={(e) => setOverrideLocation(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-white text-xs focus:outline-none focus:border-sky-500"
                  >
                    <option value="">No specific room</option>
                    {classrooms.map((c) => (
                      <option key={c.id} value={c.roomNumber}>
                        {c.roomNumber} - {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Administrative Reason / Note
                </label>
                <input
                  type="text"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="e.g. Leave approved by Principal / Examination Duty"
                  className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-white text-xs focus:outline-none focus:border-sky-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Duration (Minutes)
                </label>
                <input
                  type="number"
                  value={overrideDuration}
                  onChange={(e) => setOverrideDuration(Number(e.target.value))}
                  min={10}
                  max={720}
                  className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-white text-xs focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setOverrideTarget(null)}
                  className="px-3 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingOverride}
                  className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-white rounded-xl text-xs font-bold shadow-md shadow-sky-500/25 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSubmittingOverride && <Loader2 size={13} className="animate-spin" />}
                  <span>Save Override</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL: CREATE FACULTY ACCOUNT
      ───────────────────────────────────────────────────────────── */}
      {showCreateAccountModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-white/15 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-white font-extrabold text-sm">Create Faculty Account</h3>
                <p className="text-slate-400 text-xs">Link an existing faculty record with login credentials</p>
              </div>
              <button
                onClick={() => setShowCreateAccountModal(false)}
                className="w-7 h-7 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center"
              >
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handleCreateAccountSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Select Faculty Record
                </label>
                <select
                  value={selectedFacultyIdForAccount}
                  onChange={(e) => {
                    setSelectedFacultyIdForAccount(e.target.value);
                    const sel = teachers.find((t) => t.id === e.target.value);
                    if (sel) {
                      const clean = sel.name.toLowerCase().replace(/[^a-z]/g, '');
                      setAccountCode(sel.id);
                      setAccountEmail(`${clean}@christcollegeijk.edu.in`);
                    }
                  }}
                  className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-white text-xs focus:outline-none focus:border-sky-500"
                  required
                >
                  <option value="">-- Choose verified faculty member --</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.departmentName || t.departmentCategory || 'Christ College'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Official Email
                </label>
                <input
                  type="email"
                  value={accountEmail}
                  onChange={(e) => setAccountEmail(e.target.value)}
                  placeholder="faculty@christcollegeijk.edu.in"
                  className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-white text-xs focus:outline-none focus:border-sky-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Faculty Code / ID
                </label>
                <input
                  type="text"
                  value={accountCode}
                  onChange={(e) => setAccountCode(e.target.value)}
                  placeholder="Unique ID code"
                  className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-white text-xs focus:outline-none focus:border-sky-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Initial Password
                </label>
                <input
                  type="password"
                  value={accountPassword}
                  onChange={(e) => setAccountPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-white text-xs focus:outline-none focus:border-sky-500"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowCreateAccountModal(false)}
                  className="px-3 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAccount}
                  className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-white rounded-xl text-xs font-bold shadow-md shadow-sky-500/25 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSubmittingAccount && <Loader2 size={13} className="animate-spin" />}
                  <span>Create Account</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL: RESET PASSWORD
      ───────────────────────────────────────────────────────────── */}
      {resetAccountTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-white/15 rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-white font-extrabold text-sm">Reset Password</h3>
                <p className="text-slate-400 text-xs">{resetAccountTarget.facultyName}</p>
              </div>
              <button
                onClick={() => setResetAccountTarget(null)}
                className="w-7 h-7 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center"
              >
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handleResetPasswordSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  New Temporary Password
                </label>
                <input
                  type="password"
                  value={newResetPassword}
                  onChange={(e) => setNewResetPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-white text-xs focus:outline-none focus:border-sky-500"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setResetAccountTarget(null)}
                  className="px-3 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReset}
                  className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-white rounded-xl text-xs font-bold shadow-md shadow-sky-500/25 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSubmittingReset && <Loader2 size={13} className="animate-spin" />}
                  <span>Update Password</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
