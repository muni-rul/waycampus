import React from 'react';
import {
  X,
  Building,
  QrCode,
  Compass,
  GraduationCap,
  Star,
  Volume2,
  VolumeX,
  ExternalLink,
  Info,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { useNavigation } from '../../context/NavigationContext';

interface MoreMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenDirectory: () => void;
}

export const MoreMenu: React.FC<MoreMenuProps> = ({
  isOpen,
  onClose,
  onOpenDirectory,
}) => {
  const {
    setIsQRScannerOpen,
    setIsWhereAmIOpen,
    isVoiceEnabled,
    toggleVoiceNavigation,
    setIsFacultyPortalOpen,
  } = useNavigation();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs select-none animate-fade-in">
      {/* Backdrop tap to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Slide-up Container */}
      <div className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden z-10 animate-slide-up max-h-[85vh] flex flex-col">
        {/* Grab bar for mobile */}
        <div className="w-12 h-1 bg-slate-300 rounded-full mx-auto mt-3 sm:hidden" />

        {/* Header */}
        <div className="px-5 pt-3 pb-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center p-0.5">
              <img src="/logo.png" alt="Christ College" className="w-full h-full object-contain" />
            </div>
            <div>
              <h2 className="text-sm font-black text-[#1e3a5f]">WayCampus More</h2>
              <p className="text-[10px] font-bold text-blue-600">Christ College (Autonomous)</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 active:scale-95 transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {/* Menu Items List */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5 no-scrollbar">
          {/* 1. Campus Directory */}
          <button
            onClick={() => {
              onClose();
              onOpenDirectory();
            }}
            className="w-full flex items-center justify-between p-3 rounded-2xl bg-slate-50 hover:bg-blue-50/80 border border-slate-200/80 text-left transition-all active:scale-98 group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                <Building size={20} />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-800 group-hover:text-blue-700">
                  Campus Directory
                </h3>
                <p className="text-[11px] text-slate-500">Explore all 12 college blocks & offices</p>
              </div>
            </div>
            <ChevronRight size={18} className="text-slate-400 group-hover:text-blue-600" />
          </button>

          {/* 2. QR Scanner */}
          <button
            onClick={() => {
              onClose();
              setIsQRScannerOpen(true);
            }}
            className="w-full flex items-center justify-between p-3 rounded-2xl bg-slate-50 hover:bg-blue-50/80 border border-slate-200/80 text-left transition-all active:scale-98 group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <QrCode size={20} />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-800 group-hover:text-emerald-700">
                  Scan Door QR Code
                </h3>
                <p className="text-[11px] text-slate-500">Scan room or building door plaques</p>
              </div>
            </div>
            <ChevronRight size={18} className="text-slate-400 group-hover:text-emerald-600" />
          </button>

          {/* 3. Where Am I? */}
          <button
            onClick={() => {
              onClose();
              setIsWhereAmIOpen(true);
            }}
            className="w-full flex items-center justify-between p-3 rounded-2xl bg-slate-50 hover:bg-amber-50/80 border border-slate-200/80 text-left transition-all active:scale-98 group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
                <Compass size={20} />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-800 group-hover:text-amber-700">
                  Where Am I?
                </h3>
                <p className="text-[11px] text-slate-500">Find current position & nearest places</p>
              </div>
            </div>
            <ChevronRight size={18} className="text-slate-400 group-hover:text-amber-600" />
          </button>

          {/* 4. Faculty Portal */}
          <button
            onClick={() => {
              onClose();
              setIsFacultyPortalOpen(true);
            }}
            className="w-full flex items-center justify-between p-3 rounded-2xl bg-slate-50 hover:bg-purple-50/80 border border-slate-200/80 text-left transition-all active:scale-98 group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center">
                <GraduationCap size={20} />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-800 group-hover:text-purple-700">
                  Faculty Portal
                </h3>
                <p className="text-[11px] text-slate-500">Faculty directory & teacher consultation status</p>
              </div>
            </div>
            <ChevronRight size={18} className="text-slate-400 group-hover:text-purple-600" />
          </button>

          {/* 5. Voice Guidance Toggle */}
          <button
            onClick={() => toggleVoiceNavigation()}
            className="w-full flex items-center justify-between p-3 rounded-2xl bg-slate-50 hover:bg-sky-50/80 border border-slate-200/80 text-left transition-all active:scale-98 group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center">
                {isVoiceEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-800 group-hover:text-sky-700">
                  Spoken Turn-by-Turn Audio
                </h3>
                <p className="text-[11px] text-slate-500">
                  {isVoiceEnabled ? 'Voice instructions enabled' : 'Voice instructions muted'}
                </p>
              </div>
            </div>
            <span
              className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full ${
                isVoiceEnabled ? 'bg-sky-500 text-white' : 'bg-slate-200 text-slate-600'
              }`}
            >
              {isVoiceEnabled ? 'ON' : 'OFF'}
            </span>
          </button>

          {/* 6. Official College Website Link */}
          <a
            href="https://christcollegeijk.edu.in"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-between p-3 rounded-2xl bg-slate-50 hover:bg-blue-50/80 border border-slate-200/80 text-left transition-all active:scale-98 group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
                <ExternalLink size={20} />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-800 group-hover:text-blue-700">
                  Christ College Official Website
                </h3>
                <p className="text-[11px] text-slate-500">christcollegeijk.edu.in</p>
              </div>
            </div>
            <ExternalLink size={16} className="text-slate-400 group-hover:text-blue-600" />
          </a>
        </div>

        {/* Footer info */}
        <div className="p-3 bg-slate-100/80 border-t border-slate-200/80 text-center">
          <p className="text-[10px] font-bold text-slate-600">
            WayCampus • Christ College (Autonomous), Irinjalakuda
          </p>
          <p className="text-[9px] text-slate-400 mt-0.5">
            Designed for students, faculty & campus visitors
          </p>
        </div>
      </div>
    </div>
  );
};
