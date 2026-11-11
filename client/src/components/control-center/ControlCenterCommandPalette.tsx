import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  Camera,
  MapPin,
  Building2,
  UploadCloud,
  LayoutDashboard,
  X,
  ArrowRight,
  Layers,
  Calendar,
  Users,
  KeyRound,
} from 'lucide-react';
import { ControlCenterSectionId } from './ControlCenterSidebar';
import { CAMPUS_GRAPH } from '../../data/campusGraph';
import { getAllCombinedPlaceTags } from './data/campusEntities';

interface CommandPaletteItem {
  id: string;
  title: string;
  subtitle?: string;
  category: string;
  icon: React.ComponentType<{ className?: string }>;
  section: ControlCenterSectionId;
  metadata?: any;
}

interface ControlCenterCommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (section: ControlCenterSectionId, metadata?: any) => void;
  panoramasCount?: number;
  placesCount?: number;
  facultyCount?: number;
}

export const ControlCenterCommandPalette: React.FC<ControlCenterCommandPaletteProps> = ({
  isOpen,
  onClose,
  onNavigate,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const defaultCommands: CommandPaletteItem[] = [
    { id: 'sec_overview', title: 'Dashboard', subtitle: 'View campus statistics, metrics & quick access', category: 'Dashboard', icon: LayoutDashboard, section: 'overview' },
    { id: 'sec_campus', title: 'Rooms, Classes & Blocks', subtitle: 'Manage buildings, classrooms, labs and departments', category: 'Campus Data', icon: Building2, section: 'campus' },
    { id: 'sec_tags', title: 'Tags & Places', subtitle: 'Manage physical waypoints and 3D street view tags', category: 'Campus Data', icon: MapPin, section: 'tags' },
    { id: 'sec_faculty', title: 'Faculty Details', subtitle: 'Manage 277 faculty members, departments, and physical campus destinations', category: 'Campus Data', icon: Users, section: 'faculty' },
    { id: 'sec_credentials', title: 'Faculty Credentials', subtitle: 'Manage faculty login accounts, verified college emails, and temporary passwords', category: 'Campus Data', icon: KeyRound, section: 'credentials' },
    { id: 'sec_panoramas', title: 'Edit Connections', subtitle: 'Manage 360° panorama images, location tags and navigation arrows', category: 'Campus Data', icon: Camera, section: 'panoramas' },
    { id: 'cmd_events', title: 'Campus Events & Calendar', subtitle: 'Schedule, add, edit and manage upcoming campus events', category: 'Events', icon: Calendar, section: 'overview', metadata: { openEvents: true } },
    { id: 'sec_publish', title: 'Publish', subtitle: 'Deploy validated updates to production & database backup', category: 'Publish', icon: UploadCloud, section: 'publish' },
  ];

  // Dynamic real entity search results (rooms, tags, panoramas)
  const entityResults: CommandPaletteItem[] = React.useMemo(() => {
    if (!query.trim() || query.length < 2) return [];
    const q = query.toLowerCase().trim();
    const results: CommandPaletteItem[] = [];

    // Search tags & places
    const tags = getAllCombinedPlaceTags();
    for (const t of tags) {
      if (
        t.name?.toLowerCase().includes(q) ||
        t.roomNumber?.toLowerCase().includes(q) ||
        t.buildingName?.toLowerCase().includes(q) ||
        t.nodeId?.toLowerCase().includes(q)
      ) {
        results.push({
          id: `tag_${t.id}`,
          title: t.name,
          subtitle: `${t.buildingName || ''} • Room ${t.roomNumber || ''} • Node #${t.nodeId}`,
          category: 'Tags & Places',
          icon: MapPin,
          section: 'tags',
          metadata: { tagId: t.id },
        });
        if (results.length >= 15) break;
      }
    }

    // Search panoramas
    for (const p of CAMPUS_GRAPH) {
      if (p.id.toLowerCase().includes(q) || p.area?.toLowerCase().includes(q)) {
        results.push({
          id: `pano_${p.id}`,
          title: `Panorama #${p.id}`,
          subtitle: `${p.area} Block • Floor ${p.floor ?? 0} • Heading ${(p as any).heading ?? 0}°`,
          category: 'Panoramas',
          icon: Camera,
          section: 'panoramas',
          metadata: { panoId: p.id },
        });
        if (results.length >= 25) break;
      }
    }

    return results;
  }, [query]);

  const allFiltered = query.trim()
    ? [
        ...defaultCommands.filter(
          (cmd) =>
            cmd.title.toLowerCase().includes(query.toLowerCase()) ||
            cmd.category.toLowerCase().includes(query.toLowerCase())
        ),
        ...entityResults,
      ]
    : defaultCommands;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, allFiltered.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + allFiltered.length) % Math.max(1, allFiltered.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = allFiltered[selectedIndex];
      if (selected) {
        onNavigate(selected.section, selected.metadata);
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center px-4 py-3.5 border-b border-slate-100 bg-slate-50">
          <Search className="w-4 h-4 text-slate-400 mr-2.5 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search rooms, blocks, tags, panoramas..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent text-xs text-slate-900 placeholder-slate-400 focus:outline-none"
          />
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {allFiltered.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">No matching campus entities found.</div>
          ) : (
            allFiltered.map((cmd, idx) => {
              const Icon = cmd.icon;
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={cmd.id}
                  onClick={() => {
                    onNavigate(cmd.section, cmd.metadata);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left text-xs transition cursor-pointer ${
                    isSelected ? 'bg-blue-50 text-[#1a56db]' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-blue-100 text-[#1a56db]' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold truncate">{cmd.title}</div>
                      {cmd.subtitle && (
                        <div className="text-[10px] text-slate-400 truncate">{cmd.subtitle}</div>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-400 font-semibold uppercase px-2 py-0.5 bg-slate-100 rounded-md shrink-0 ml-2">
                    {cmd.category}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
