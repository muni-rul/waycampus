import React from 'react';
import {
  LayoutDashboard,
  Building2,
  Camera,
  Compass,
  MapPin,
  Search,
  QrCode,
  Users,
  Flag,
  CheckCircle2,
  Image,
  Cpu,
  UploadCloud,
  History,
  Settings,
  ChevronLeft,
  ChevronRight,
  Shield,
  Layers,
  Crown
} from 'lucide-react';

export type ControlCenterSectionId =
  | 'overview'
  | 'campus'
  | 'tags'
  | 'faculty'
  | 'panoramas'
  | 'publish';

interface ControlCenterSidebarProps {
  activeSection: ControlCenterSectionId;
  onSelectSection: (section: ControlCenterSectionId) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  badges?: Partial<Record<ControlCenterSectionId, number | string>>;
}

interface NavItem {
  id: ControlCenterSectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group: 'DASHBOARD' | 'CAMPUS DATA' | 'PUBLISH';
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Dashboard', icon: LayoutDashboard, group: 'DASHBOARD' },
  { id: 'campus', label: 'Rooms, Classes & Blocks', icon: Building2, group: 'CAMPUS DATA' },
  { id: 'tags', label: 'Tags & Places', icon: MapPin, group: 'CAMPUS DATA' },
  { id: 'faculty', label: 'Faculty Details', icon: Users, group: 'CAMPUS DATA' },
  { id: 'panoramas', label: 'Edit Connections', icon: Camera, group: 'CAMPUS DATA' },
  { id: 'publish', label: 'Publish', icon: UploadCloud, group: 'PUBLISH' },
];

export const ControlCenterSidebar: React.FC<ControlCenterSidebarProps> = ({
  activeSection,
  onSelectSection,
  isCollapsed,
  onToggleCollapse,
  badges = {},
}) => {
  return (
    <aside
      className={`relative h-full bg-white border-r border-slate-200/80 flex flex-col transition-all duration-200 z-20 select-none shadow-xs ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* College Crest & Title in Sidebar Header */}
      {!isCollapsed ? (
        <div className="p-3.5 border-b border-slate-100 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-white p-0.5 border border-slate-200 shadow-xs flex items-center justify-center flex-shrink-0 overflow-hidden ring-2 ring-blue-500/20">
            <img
              src="/christ_college_official_logo.png"
              alt="Christ College"
              className="w-full h-full object-contain rounded-full"
            />
          </div>
          <div className="min-w-0">
            <h2 className="text-[11px] font-black tracking-wider text-[#1e3a5f] uppercase leading-tight">
              Christ College
            </h2>
            <p className="text-[9px] font-bold text-[#2563eb] tracking-wider uppercase leading-tight">
              (Autonomous) Irinjalakuda
            </p>
          </div>
        </div>
      ) : (
        <div className="p-3 border-b border-slate-100 flex justify-center">
          <div className="w-8 h-8 rounded-full bg-white p-0.5 border border-slate-200 shadow-xs flex items-center justify-center overflow-hidden">
            <img
              src="/christ_college_official_logo.png"
              alt="Christ College"
              className="w-full h-full object-contain rounded-full"
            />
          </div>
        </div>
      )}

      {/* Navigation Groups */}
      <div className="flex-1 overflow-y-auto py-2.5 px-2.5 space-y-1 scrollbar-thin scrollbar-thumb-slate-200">
        {NAV_ITEMS.map((item, idx) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          const badge = badges[item.id];

          // Check if section divider is needed
          const prevItem = NAV_ITEMS[idx - 1];
          const showDivider = !prevItem || prevItem.group !== item.group;

          return (
            <React.Fragment key={item.id}>
              {showDivider && !isCollapsed && (
                <div className="pt-3 pb-1 px-3 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                  {item.group.replace('_', ' ')}
                </div>
              )}
              {showDivider && isCollapsed && (
                <div className="pt-2 pb-1 border-t border-slate-200 mx-2" />
              )}

              <button
                onClick={() => onSelectSection(item.id)}
                title={isCollapsed ? item.label : undefined}
                className={`w-full flex items-center rounded-xl transition group text-xs font-semibold ${
                  isCollapsed ? 'justify-center p-2.5' : 'px-3 py-2 space-x-2.5'
                } ${
                  isActive
                    ? 'bg-[#e8f1fc] text-[#1a56db] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 transition ${
                    isActive ? 'text-[#1a56db]' : 'text-slate-400 group-hover:text-slate-600'
                  }`}
                />
                {!isCollapsed && (
                  <span className="truncate flex-1 text-left">{item.label}</span>
                )}
                {!isCollapsed && !isActive && (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 transition shrink-0" />
                )}
                {!isCollapsed && badge !== undefined && (
                  <span
                    className={`px-1.5 py-0.5 text-[10px] font-black rounded-full ${
                      badge === 'OK'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : badge === 'PROTECTED'
                        ? 'bg-blue-100 text-[#1a56db] text-[9px] tracking-wider'
                        : typeof badge === 'number' && badge > 0
                        ? 'bg-rose-50 text-rose-600 border border-rose-200'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {badge}
                  </span>
                )}
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* Signature Handwriting Quote & Footer */}
      {!isCollapsed && (
        <div className="px-4 pt-2 pb-1 border-t border-slate-100">
          <p className="font-serif italic text-[#1a56db] text-xs font-bold tracking-wide">
            A Smarter Campus<br />A Brighter You
          </p>
        </div>
      )}

      {/* Collapse Toggle Footer */}
      <div className="p-2 border-t border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50">
        {!isCollapsed && (
          <div className="px-2 text-[11px] text-slate-500 font-semibold font-mono">
            WayCampus v2.0
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 rounded-xl transition mx-auto"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
};
