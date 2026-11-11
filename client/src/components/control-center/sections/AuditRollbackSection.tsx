import React, { useState, useEffect } from 'react';
import {
  History,
  Crown,
  Shield,
  UploadCloud,
  RotateCcw,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Lock,
  KeyRound,
  UserCheck,
  UserPlus,
  Calendar,
  Layers,
  Sparkles
} from 'lucide-react';
import { ApiService } from '../../../services/api';
import { DataSnapshot, AdminAuditAction } from '../../../../../shared/types';

interface AuditRollbackSectionProps {
  currentUser: { username: string; role: string; name?: string; isPrimaryOwner?: boolean } | null;
  onRefreshData?: () => void;
}

export const AuditRollbackSection: React.FC<AuditRollbackSectionProps> = ({
  currentUser,
  onRefreshData,
}) => {
  const [activeTab, setActiveTab] = useState<'OWNERSHIP' | 'SNAPSHOTS' | 'AUDIT_LOG'>('OWNERSHIP');

  // Admin Users State
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  // New Admin Form
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'SUPER_ADMIN' | 'COLLEGE_ADMIN'>('COLLEGE_ADMIN');
  const [userActionMsg, setUserActionMsg] = useState<string | null>(null);

  // Ownership Transfer Modal
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState<string>('');
  const [transferNotes, setTransferNotes] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);

  // Snapshots State
  const [snapshots, setSnapshots] = useState<DataSnapshot[]>([]);
  const [newSnapshotName, setNewSnapshotName] = useState('');
  const [newSnapshotDesc, setNewSnapshotDesc] = useState('');
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const [snapshotMsg, setSnapshotMsg] = useState<string | null>(null);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AdminAuditAction[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // Fetch data
  const loadAdminUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const res = await ApiService.getAdminUsers();
      if (res.success && res.users) {
        setAdminUsers(res.users);
      }
    } catch (err) {
      console.warn('Failed to load admin users:', err);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const loadSnapshots = async () => {
    try {
      const res = await ApiService.getSnapshots();
      if (res.success && res.snapshots) {
        setSnapshots(res.snapshots);
      }
    } catch (err) {
      console.warn('Failed to load snapshots:', err);
    }
  };

  const loadAuditLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const res = await ApiService.getAdminAuditActions(100);
      if (res.success && res.actions) {
        setAuditLogs(res.actions);
      }
    } catch (err) {
      console.warn('Failed to load audit logs:', err);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    loadAdminUsers();
    loadSnapshots();
    loadAuditLogs();
  }, []);

  const handleCreateAdminUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername || !newPassword) return;

    try {
      const res = await ApiService.createAdminUser({
        username: newUsername,
        password: newPassword,
        name: newName || undefined,
        email: newEmail || undefined,
        role: newRole,
      });

      if (res.success) {
        setUserActionMsg(`Admin account "${newUsername}" created successfully.`);
        setNewUsername('');
        setNewPassword('');
        setNewName('');
        setNewEmail('');
        loadAdminUsers();
        setTimeout(() => setUserActionMsg(null), 4000);
      }
    } catch (err: any) {
      alert(`Failed to create administrator account: ${err.message}`);
    }
  };

  const handleExecuteOwnershipTransfer = async () => {
    if (!transferTarget) return;
    const ok = window.confirm(
      `CRITICAL ACTION: Transfer primary super-admin ownership to "${transferTarget}"? You will delegate primary control to the college authorities.`
    );
    if (!ok) return;

    setIsTransferring(true);
    try {
      const res = await ApiService.transferAdminOwnership(transferTarget, false, transferNotes);
      if (res.success) {
        setUserActionMsg(res.message);
        setIsTransferModalOpen(false);
        loadAdminUsers();
        loadAuditLogs();
        setTimeout(() => setUserActionMsg(null), 6000);
      }
    } catch (err: any) {
      alert(`Ownership transfer failed: ${err.message}`);
    } finally {
      setIsTransferring(false);
    }
  };

  const handleCreateSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSnapshotName.trim()) return;
    setIsCreatingSnapshot(true);
    try {
      const res = await ApiService.createSnapshot(newSnapshotName.trim(), newSnapshotDesc.trim());
      if (res.success) {
        setSnapshotMsg(`Point-in-time snapshot "${newSnapshotName}" created.`);
        setNewSnapshotName('');
        setNewSnapshotDesc('');
        loadSnapshots();
        setTimeout(() => setSnapshotMsg(null), 4000);
      }
    } catch (err: any) {
      setSnapshotMsg(`Error: ${err.message}`);
    } finally {
      setIsCreatingSnapshot(false);
    }
  };

  const handleRollback = async (snapshotId: string) => {
    const ok = window.confirm(
      `Are you sure you want to rollback the campus state to snapshot ${snapshotId}? An automatic safety backup will be taken before restoring.`
    );
    if (!ok) return;

    try {
      const res = await ApiService.rollbackSnapshot(snapshotId);
      if (res.success) {
        alert(res.message);
        loadSnapshots();
        loadAuditLogs();
        if (onRefreshData) onRefreshData();
      }
    } catch (err: any) {
      alert(`Rollback failed: ${err.message}`);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 text-slate-800 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 sm:p-6 bg-white border border-slate-200/80 rounded-3xl shadow-xs">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold text-blue-600 mb-1">
            <History className="w-4 h-4" />
            <span>AUDIT, SNAPSHOTS & OWNERSHIP PLANE</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-[#0f2744]">
            Audit Trail, Snapshots & College Handover
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Safeguard system integrity with point-in-time snapshots, rollbacks, and authorized college admin handovers.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex p-1 bg-slate-100 border border-slate-200 rounded-2xl shrink-0">
          <button
            onClick={() => setActiveTab('OWNERSHIP')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'OWNERSHIP' ? 'bg-white text-[#1a56db] shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Crown className="w-3.5 h-3.5" />
            <span>Ownership</span>
          </button>
          <button
            onClick={() => setActiveTab('SNAPSHOTS')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'SNAPSHOTS' ? 'bg-white text-[#1a56db] shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Snapshots ({snapshots.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('AUDIT_LOG')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'AUDIT_LOG' ? 'bg-white text-[#1a56db] shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Audit Log</span>
          </button>
        </div>
      </div>

      {userActionMsg && (
        <div className="p-3.5 bg-blue-50 border border-blue-200 text-blue-800 text-xs rounded-2xl flex items-center space-x-2 font-medium">
          <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
          <span>{userActionMsg}</span>
        </div>
      )}

      {/* 1. ADMIN OWNERSHIP & COLLEGE HANDOVER TAB */}
      {activeTab === 'OWNERSHIP' && (
        <div className="space-y-6">
          {/* Handover Notice Card */}
          <div className="p-6 bg-gradient-to-r from-amber-50/80 via-white to-amber-50/50 border border-amber-200 rounded-3xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
            <div className="space-y-1">
              <div className="flex items-center space-x-2 text-amber-800 text-xs font-bold uppercase tracking-wider">
                <Crown className="w-4 h-4 text-amber-600" />
                <span>Primary Admin Handover & Ownership Transfer</span>
              </div>
              <h3 className="text-base font-black text-slate-900">
                Transfer Project Ownership to Christ College (Autonomous)
              </h3>
              <p className="text-xs text-slate-600 max-w-2xl">
                When you are ready to hand over the WayCampus platform to the college administration, you can create a college administrator account and transfer primary super-admin ownership here.
              </p>
            </div>

            <button
              onClick={() => {
                if (adminUsers.length > 0) setTransferTarget(adminUsers[0].username);
                setIsTransferModalOpen(true);
              }}
              className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 font-bold rounded-xl text-xs transition shadow-xs flex items-center space-x-2 shrink-0 cursor-pointer"
            >
              <Crown className="w-4 h-4" />
              <span>Transfer Primary Ownership</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Admin Users Directory */}
            <div className="lg:col-span-7 bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs font-bold text-slate-700">
                <span>Active Administrator Accounts ({adminUsers.length})</span>
                <span className="text-[10px] text-slate-400">Role & Ownership</span>
              </div>

              <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                {adminUsers.map((user) => (
                  <div key={user.id} className="p-4 flex items-center justify-between text-xs hover:bg-blue-50/40 transition">
                    <div className="space-y-0.5">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-slate-900 text-sm">{user.name || user.username}</span>
                        <span className="font-mono text-slate-400 text-[11px]">(@{user.username})</span>
                        {user.isPrimaryOwner && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold flex items-center space-x-1">
                            <Crown className="w-2.5 h-2.5 text-amber-600" />
                            <span>PRIMARY OWNER</span>
                          </span>
                        )}
                      </div>
                      {user.email && <div className="text-slate-500 text-[11px]">{user.email}</div>}
                    </div>

                    <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
                      {user.role}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Create College Admin Form */}
            <div className="lg:col-span-5 bg-white border border-slate-200/80 rounded-2xl p-5 space-y-4 shadow-xs">
              <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
                <UserPlus className="w-4 h-4 text-blue-600" />
                <h4 className="text-sm font-bold text-slate-900">Create College Admin Account</h4>
              </div>

              <form onSubmit={handleCreateAdminUser} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Username</label>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="e.g. principal, bursar, iqac_admin"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Full Name & Title</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Dr. Fr. Jolly Andrews (Principal)"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Official College Email</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="e.g. principal@christcollegeijk.edu.in"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Temporary Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Set secure initial password"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Privilege Level</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                  >
                    <option value="SUPER_ADMIN">SUPER_ADMIN (Full Governance & Publishing)</option>
                    <option value="COLLEGE_ADMIN">COLLEGE_ADMIN (Content & Faculty Maintenance)</option>
                  </select>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-[#1a56db] hover:bg-blue-600 text-white font-bold rounded-xl text-xs transition shadow-xs flex items-center justify-center space-x-1.5 pt-2 cursor-pointer"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Register Administrator</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 2. DATA SNAPSHOTS TAB */}
      {activeTab === 'SNAPSHOTS' && (
        <div className="space-y-6">
          {snapshotMsg && (
            <div className="p-3.5 bg-blue-50 border border-blue-200 text-blue-800 text-xs rounded-2xl flex items-center space-x-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
              <span>{snapshotMsg}</span>
            </div>
          )}

          {/* Create Snapshot Card */}
          <div className="p-5 bg-white border border-slate-200/80 rounded-2xl space-y-3 shadow-xs">
            <h4 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
              <Plus className="w-4 h-4 text-blue-600" />
              <span>Create Point-in-Time Data Snapshot</span>
            </h4>
            <form onSubmit={handleCreateSnapshot} className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={newSnapshotName}
                onChange={(e) => setNewSnapshotName(e.target.value)}
                placeholder="Snapshot Name (e.g. Pre-Exam Navigation State, Batch 2 Verified)..."
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                required
              />
              <input
                type="text"
                value={newSnapshotDesc}
                onChange={(e) => setNewSnapshotDesc(e.target.value)}
                placeholder="Description / Notes (optional)"
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
              />
              <button
                type="submit"
                disabled={isCreatingSnapshot}
                className="px-4 py-2 bg-[#1a56db] hover:bg-blue-600 text-white font-bold rounded-xl text-xs transition shadow-xs shrink-0 cursor-pointer"
              >
                {isCreatingSnapshot ? 'Saving...' : 'Take Snapshot'}
              </button>
            </form>
          </div>

          {/* Snapshots List */}
          <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs font-bold text-slate-700">
              <span>Saved Snapshots ({snapshots.length})</span>
              <span className="text-[10px] text-slate-400">Actions</span>
            </div>

            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {snapshots.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No snapshots created yet. Snapshots record the state of rooms, tags, faculty, and overrides.
                </div>
              ) : (
                snapshots.map((snap) => (
                  <div key={snap.id} className="p-4 flex items-center justify-between text-xs hover:bg-blue-50/40 transition">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-slate-900 text-sm">{snap.name}</span>
                        <span className="font-mono text-blue-700 text-[11px] font-bold">({snap.id})</span>
                      </div>
                      {snap.description && <p className="text-[11px] text-slate-500">{snap.description}</p>}
                      <div className="flex items-center space-x-3 text-[10px] text-slate-400 font-medium">
                        <span>Created: {new Date(snap.createdAt).toLocaleString()}</span>
                        <span>By: {snap.createdBy}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleRollback(snap.id)}
                      className="px-3.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Rollback</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. IMMUTABLE AUDIT LOG TAB */}
      {activeTab === 'AUDIT_LOG' && (
        <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs space-y-0">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs font-bold text-slate-700">
            <span>Administrative Actions Audit Trail</span>
            <span className="text-[10px] text-slate-500 font-mono">Last 100 Recorded Events</span>
          </div>

          <div className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto">
            {auditLogs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No administrative actions recorded yet.
              </div>
            ) : (
              auditLogs.map((log) => (
                <div key={log.id} className="p-3.5 flex items-start justify-between text-xs hover:bg-blue-50/40 transition">
                  <div className="space-y-0.5">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-blue-700 font-mono">{log.action}</span>
                      <span className="text-slate-400">•</span>
                      <span className="text-slate-800 font-bold">{log.entity}</span>
                    </div>
                    {log.notes && <p className="text-[11px] text-slate-500">{log.notes}</p>}
                    <div className="text-[10px] text-slate-400">
                      By: <strong className="text-slate-700">{log.adminUsername}</strong> • {new Date(log.timestamp).toLocaleString()}
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-mono border border-slate-200">
                    {log.id}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* OWNERSHIP TRANSFER CONFIRMATION MODAL */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full max-w-lg p-6 bg-white border border-amber-300 rounded-3xl shadow-2xl text-slate-800 space-y-4">
            <div className="flex items-center space-x-3 border-b border-slate-100 pb-3">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-amber-700">
                <Crown className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">Transfer Primary Administrative Ownership</h3>
                <p className="text-xs text-slate-500">Official College Handover Protocol</p>
              </div>
            </div>

            <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-2 text-xs">
              <p className="text-amber-800 font-bold">
                You are about to transfer Primary Super-Admin Ownership to a designated college official.
              </p>
              <ul className="list-disc pl-4 text-slate-600 space-y-1 text-[11px]">
                <li>The designated user will become the verified primary system owner.</li>
                <li>All governance, publishing, and admin delegation authority will transfer.</li>
                <li>This handover event will be permanently recorded in the immutable audit trail.</li>
              </ul>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Select New Primary Owner</label>
                <select
                  value={transferTarget}
                  onChange={(e) => setTransferTarget(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                >
                  {adminUsers.map((u) => (
                    <option key={u.id} value={u.username}>
                      {u.name || u.username} (@{u.username}) — {u.role}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Handover Notes / Memo</label>
                <textarea
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                  placeholder="e.g. Official handover of WayCampus platform to Christ College Computer Science Department & Principal Office."
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setIsTransferModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteOwnershipTransfer}
                disabled={isTransferring}
                className="px-4 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition shadow-xs disabled:opacity-50 flex items-center space-x-1.5 cursor-pointer"
              >
                <Crown className="w-4 h-4" />
                <span>{isTransferring ? 'Transferring...' : 'Execute Ownership Handover'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
