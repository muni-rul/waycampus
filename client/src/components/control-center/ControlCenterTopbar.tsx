import React from 'react';
import {
  Search,
  X,
  Calendar,
} from 'lucide-react';

interface ControlCenterTopbarProps {
  currentUser?: { username: string; role: string; name?: string; isPrimaryOwner?: boolean } | null;
  unsavedCount?: number;
  onOpenCommandPalette: () => void;
  onOpenEvents?: () => void;
  onRunValidation?: () => void;
  onToggle3DViewport?: () => void;
  is3DViewportOpen?: boolean;
  onLogout?: () => void;
  onClose: () => void;
}

export const ControlCenterTopbar: React.FC<ControlCenterTopbarProps> = ({
  onOpenCommandPalette,
  onOpenEvents,
  onClose,
}) => {
  return (
    <header className="h-14 bg-white border-b border-slate-200/80 px-4 sm:px-6 flex items-center justify-between z-30 shrink-0 select-none">
      {/* 1. Left Brand & Control Center Title */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#1a56db] flex items-center justify-center text-white font-black text-xs shadow-xs">
            WC
          </div>
          <div className="flex items-center space-x-2">
            <span className="font-black text-sm tracking-tight text-slate-900">WayCampus</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-[#1a56db] font-extrabold uppercase tracking-wider">
              CONTROL CENTER
            </span>
          </div>
        </div>

        <div className="h-4 w-px bg-slate-200 hidden sm:block" />
      </div>

      {/* 2. Center Global Search Input (Command Palette Trigger) */}
      <div className="flex-1 max-w-lg mx-4">
        <button
          onClick={onOpenCommandPalette}
          className="w-full h-9 px-3.5 bg-slate-50 border border-slate-200/80 hover:border-blue-400 hover:bg-white rounded-xl text-left text-xs text-slate-400 flex items-center justify-between transition group shadow-2xs cursor-pointer"
        >
          <div className="flex items-center space-x-2">
            <Search className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 transition shrink-0" />
            <span className="truncate">Search rooms, blocks, tags, panoramas...</span>
          </div>
          <kbd className="px-1.5 py-0.5 text-[10px] font-bold font-mono bg-white border border-slate-200 text-slate-400 rounded shadow-2xs shrink-0">
            Ctrl K
          </kbd>
        </button>
      </div>

      {/* 3. Right Status & Close Controls Matching Reference Design */}
      <div className="flex items-center space-x-2.5">
        {/* Manage Events Button */}
        {onOpenEvents && (
          <button
            onClick={onOpenEvents}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#1a56db] text-xs font-bold transition shadow-2xs border border-blue-200 cursor-pointer active:scale-95"
            title="Add and manage campus events calendar"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Events Calendar</span>
          </button>
        )}

        {/* System Online Badge Matching Reference Image */}
        <div className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold shadow-2xs">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>System Online</span>
        </div>

        {/* Close / Return to Campus Map Button */}
        <button
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition cursor-pointer"
          title="Exit Control Center & Return to Campus Map"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
