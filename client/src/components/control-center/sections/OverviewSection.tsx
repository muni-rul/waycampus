import React from 'react';
import {
  Camera,
  Compass,
  MapPin,
  Building2,
  Layers,
  UploadCloud,
  ChevronRight,
  Link2,
  Image as ImageIcon,
  Calendar,
} from 'lucide-react';
import { ControlCenterSectionId } from '../ControlCenterSidebar';

interface OverviewSectionProps {
  stats: {
    panoramas: number;
    connections: number;
    tags: number;
    faculty: number;
    departments: number;
    rooms: number;
    unverifiedDirections?: number;
    pendingReports?: number;
    draftsCount?: number;
  };
  onNavigate: (section: ControlCenterSectionId) => void;
  onOpenEvents?: () => void;
  onRunValidation?: () => void;
}

export const OverviewSection: React.FC<OverviewSectionProps> = ({
  stats,
  onNavigate,
  onOpenEvents,
}) => {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 text-slate-800 animate-in fade-in duration-200 select-none">
      {/* 1. Hero Banner Matching Approved Reference Design */}
      <div className="relative rounded-3xl overflow-hidden shadow-sm bg-gradient-to-r from-[#175cd3] via-[#1d64db] to-[#1554c0] text-white min-h-[220px] flex items-center">
        {/* Right Building Silhouette & Photo Overlay */}
        <div className="absolute right-0 top-0 bottom-0 w-full sm:w-1/2 lg:w-5/12 overflow-hidden pointer-events-none">
          <img
            src="/assets/campus_aerial_drone.jpg"
            alt="Christ College Campus"
            className="w-full h-full object-cover object-center opacity-40 mix-blend-screen scale-105"
          />
          {/* Smooth radial gradient fade to blend photo with blue background */}
          <div className="absolute inset-0 bg-gradient-to-l from-transparent via-[#175cd3]/70 to-[#175cd3]" />
          {/* Subtle decorative curved shape */}
          <div className="absolute -right-16 -bottom-16 w-80 h-80 rounded-full bg-blue-400/20 blur-2xl" />
        </div>

        {/* Hero Text Content */}
        <div className="relative z-10 p-6 sm:p-8 lg:p-10 max-w-2xl space-y-2">
          <p className="text-xs font-semibold text-blue-100/90 tracking-wide">
            WayCampus Control Center
          </p>

          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white leading-tight">
            Christ College (Autonomous)<br />
            Irinjalakuda
          </h1>

          <p className="text-sm font-serif italic text-blue-100/90 pt-0.5">
            &ldquo;A Smarter Campus, A Brighter Tomorrow&rdquo;
          </p>

          <p className="text-xs sm:text-sm text-blue-100/80 pt-1 leading-relaxed max-w-xl">
            Manage campus navigation data, panoramas, tags and places for a seamless WayCampus experience.
          </p>
        </div>
      </div>

      {/* 2. Four Metric KPI Cards Matching Reference Image */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Panoramas */}
        <div
          onClick={() => onNavigate('panoramas')}
          className="bg-white border border-slate-200/80 hover:border-blue-400 rounded-2xl p-5 shadow-xs transition-all duration-200 hover:shadow-md cursor-pointer group flex items-center space-x-4"
        >
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#1a56db] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-500">Panoramas</div>
            <div className="text-2xl font-black text-slate-900 tracking-tight leading-tight">
              {stats.panoramas}
            </div>
            <div className="text-[11px] text-slate-400 font-medium">Total Panoramas</div>
          </div>
        </div>

        {/* Metric 2: Connections */}
        <div
          onClick={() => onNavigate('panoramas')}
          className="bg-white border border-slate-200/80 hover:border-emerald-400 rounded-2xl p-5 shadow-xs transition-all duration-200 hover:shadow-md cursor-pointer group flex items-center space-x-4"
        >
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <Link2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-500">Connections</div>
            <div className="text-2xl font-black text-slate-900 tracking-tight leading-tight">
              {stats.connections}
            </div>
            <div className="text-[11px] text-slate-400 font-medium">Navigation Links</div>
          </div>
        </div>

        {/* Metric 3: Tags & Places */}
        <div
          onClick={() => onNavigate('tags')}
          className="bg-white border border-slate-200/80 hover:border-purple-400 rounded-2xl p-5 shadow-xs transition-all duration-200 hover:shadow-md cursor-pointer group flex items-center space-x-4"
        >
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <MapPin className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-500">Tags & Places</div>
            <div className="text-2xl font-black text-slate-900 tracking-tight leading-tight">
              {stats.tags}
            </div>
            <div className="text-[11px] text-slate-400 font-medium">Tags in System</div>
          </div>
        </div>

        {/* Metric 4: Rooms & Classes */}
        <div
          onClick={() => onNavigate('campus')}
          className="bg-white border border-slate-200/80 hover:border-amber-400 rounded-2xl p-5 shadow-xs transition-all duration-200 hover:shadow-md cursor-pointer group flex items-center space-x-4"
        >
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-500">Rooms & Classes</div>
            <div className="text-2xl font-black text-slate-900 tracking-tight leading-tight">
              {stats.rooms}
            </div>
            <div className="text-[11px] text-slate-400 font-medium">Registered Rooms</div>
          </div>
        </div>
      </div>

      {/* 3. Quick Access Section Matching Reference Design */}
      <div className="space-y-3 pt-2">
        <div>
          <h2 className="text-base font-black text-slate-900 tracking-tight">Quick Access</h2>
          <p className="text-xs text-slate-500">Manage key campus data</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Quick Access Card 1: Rooms, Classes & Blocks */}
          <div
            onClick={() => onNavigate('campus')}
            className="p-4 bg-white border border-slate-200/80 hover:border-blue-400 rounded-2xl shadow-xs transition-all duration-200 hover:shadow-md cursor-pointer group flex items-center justify-between"
          >
            <div className="flex items-center space-x-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#1a56db] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Building2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 group-hover:text-blue-700 truncate">
                  Rooms, Classes & Blocks
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  View and manage buildings, rooms and classes
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
          </div>

          {/* Quick Access Card 2: Tags & Places */}
          <div
            onClick={() => onNavigate('tags')}
            className="p-4 bg-white border border-slate-200/80 hover:border-emerald-400 rounded-2xl shadow-xs transition-all duration-200 hover:shadow-md cursor-pointer group flex items-center justify-between"
          >
            <div className="flex items-center space-x-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <MapPin className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 group-hover:text-emerald-700 truncate">
                  Tags & Places
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  Manage campus tags and important places
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
          </div>

          {/* Quick Access Card 3: Panoramas & Headings */}
          <div
            onClick={() => onNavigate('panoramas')}
            className="p-4 bg-white border border-slate-200/80 hover:border-purple-400 rounded-2xl shadow-xs transition-all duration-200 hover:shadow-md cursor-pointer group flex items-center justify-between"
          >
            <div className="flex items-center space-x-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <ImageIcon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 group-hover:text-purple-700 truncate">
                  Edit Connections
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  View and manage panoramas and headings
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-purple-600 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
          </div>

          {/* Quick Access Card 4: Events & Calendar */}
          <div
            onClick={onOpenEvents}
            className="p-4 bg-white border border-slate-200/80 hover:border-amber-400 rounded-2xl shadow-xs transition-all duration-200 hover:shadow-md cursor-pointer group flex items-center justify-between"
          >
            <div className="flex items-center space-x-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Calendar className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 group-hover:text-amber-700 truncate">
                  Events & Calendar
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  Schedule, add and manage campus events
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-amber-600 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
          </div>
        </div>
      </div>

      {/* 4. Publish Section Matching Reference Design */}
      <div className="space-y-3 pt-2">
        <div>
          <h2 className="text-base font-black text-slate-900 tracking-tight">Publish</h2>
          <p className="text-xs text-slate-500">Update and publish changes to the live system</p>
        </div>

        <div
          onClick={() => onNavigate('publish')}
          className="p-4 bg-white border border-slate-200/80 hover:border-rose-400 rounded-2xl shadow-xs transition-all duration-200 hover:shadow-md cursor-pointer group flex items-center justify-between"
        >
          <div className="flex items-center space-x-3.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 group-hover:text-rose-700 truncate">
                Publish Changes
              </div>
              <div className="text-[11px] text-slate-500 truncate">
                Validate and publish updates to WayCampus
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-rose-600 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
        </div>
      </div>
    </div>
  );
};
