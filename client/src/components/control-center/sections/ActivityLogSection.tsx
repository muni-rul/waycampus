import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  Search,
  RefreshCw,
  Shield,
  User,
  Clock,
  Filter,
  FileText,
} from 'lucide-react';
import { ApiService } from '../../../services/api';
import { AdminAuditAction } from '../../../../../shared/types';

export const ActivityLogSection: React.FC = () => {
  const [actions, setActions] = useState<AdminAuditAction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntity, setSelectedEntity] = useState<string>('ALL');

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const res = await ApiService.getAdminAuditActions(100);
      if (res && res.actions) {
        // Sort newest first
        const sorted = [...res.actions].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        setActions(sorted);
      }
    } catch (err) {
      console.warn('Failed to fetch admin audit actions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const entityTypes = useMemo(() => {
    const set = new Set<string>();
    actions.forEach((a) => {
      if (a.entity) set.add(a.entity.toUpperCase());
    });
    return Array.from(set).sort();
  }, [actions]);

  const filteredActions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return actions.filter((item) => {
      if (selectedEntity !== 'ALL' && (item.entity || '').toUpperCase() !== selectedEntity) {
        return false;
      }
      if (!q) return true;
      return (
        (item.adminUsername || '').toLowerCase().includes(q) ||
        (item.action || '').toLowerCase().includes(q) ||
        (item.entity || '').toLowerCase().includes(q) ||
        (item.entityId || '').toLowerCase().includes(q) ||
        (item.ipAddress || '').toLowerCase().includes(q) ||
        (item.timestamp || '').toLowerCase().includes(q)
      );
    });
  }, [actions, searchQuery, selectedEntity]);

  const getActionBadgeColor = (action: string) => {
    const act = (action || '').toUpperCase();
    if (act.includes('DELETE') || act.includes('REMOVE')) return 'bg-rose-50 text-rose-700 border-rose-200';
    if (act.includes('CREATE') || act.includes('ADD') || act.includes('SAVE')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (act.includes('UPDATE') || act.includes('EDIT') || act.includes('STATUS')) return 'bg-blue-50 text-blue-700 border-blue-200';
    if (act.includes('RESET') || act.includes('PASSWORD')) return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 text-slate-800 animate-in fade-in duration-200">
      {/* Header */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Activity Log</h1>
            <p className="text-xs text-slate-500">
              Read-only immutable log of administrative actions across the platform
            </p>
          </div>
        </div>

        <button
          onClick={fetchLogs}
          disabled={isLoading}
          className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center space-x-2 cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search activity by admin, action, entity ID or IP..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:border-indigo-500 focus:bg-white transition"
          />
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={selectedEntity}
            onChange={(e) => setSelectedEntity(e.target.value)}
            className="w-full sm:w-48 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-hidden focus:border-indigo-500 transition"
          >
            <option value="ALL">All Entities</option>
            {entityTypes.map((et) => (
              <option key={et} value={et}>
                {et}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Log Table */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
        {isLoading && actions.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            <RefreshCw className="w-5 h-5 mx-auto mb-2 animate-spin text-indigo-500" />
            Loading audit activity...
          </div>
        ) : filteredActions.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            <Activity className="w-6 h-6 mx-auto mb-2 text-slate-300" />
            No activity log entries found matching criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Admin</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Entity</th>
                  <th className="py-3 px-4">Target ID</th>
                  <th className="py-3 px-4">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                {filteredActions.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-4 whitespace-nowrap text-slate-600">
                      <div className="flex items-center space-x-1.5 font-sans">
                        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{new Date(entry.timestamp).toLocaleString()}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-sans font-bold text-slate-800">
                      <div className="flex items-center space-x-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{entry.adminUsername || 'Admin'}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold border font-sans ${getActionBadgeColor(
                          entry.action
                        )}`}
                      >
                        {entry.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-sans text-slate-600 font-medium">
                      {entry.entity}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-slate-700 max-w-[200px] truncate" title={entry.entityId}>
                      {entry.entityId || '—'}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-slate-400 text-[10px]">
                      {entry.ipAddress || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
