import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Navigation,
  ArrowUpDown,
  Search,
  X,
  MapPin,
  Footprints,
  Building2,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Sparkles,
  User,
  GraduationCap,
  FlaskConical,
  BookOpen,
  CheckCircle2,
  Mic,
} from 'lucide-react';
import { SearchResult } from '../../../../shared/types';
import { CAMPUS_BLOCKS_INFO } from '../../data/campusBlocksData';
import { searchCampus } from '../../services/campusSearchService';
import { searchCampusPlaces } from '../../data/campusPlaces';
import { findMultipleNavigationRoutes } from '../../services/campusPathfinder';
import { VoiceSearchModal } from './VoiceSearchModal';

export interface TourNavigationBoxProps {
  isOpen: boolean;
  onToggleOpen?: (open: boolean) => void;
  currentPanoramaId: string;
  currentPanoramaName: string;
  userLocationNodeId?: string;
  userLocationName?: string;
  initialDestination?: {
    id: string;
    name: string;
    nodeId: string;
    buildingId?: string;
    buildingName?: string;
    floorNumber?: number;
  } | null;
  onStartNavigation: (destination: SearchResult, startNodeId?: string) => void;
}

export interface DestinationItem {
  id: string;
  name: string;
  subtitle: string;
  nodeId: string;
  buildingId?: string;
  buildingName?: string;
  floorNumber?: number;
  floorName?: string;
  category?: string;
  tagId?: string;
  type?: SearchResult['type'];
  blockCode?: string;
  roomNumber?: string;
  roomId?: string;
  isLocationVerified?: boolean;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  TEACHER: <User size={13} className="text-sky-500" />,
  FACULTY: <User size={13} className="text-sky-500" />,
  CLASSROOM: <GraduationCap size={13} className="text-blue-500" />,
  LAB: <FlaskConical size={13} className="text-purple-500" />,
  PROGRAMME: <BookOpen size={13} className="text-indigo-500" />,
  ROOM: <MapPin size={13} className="text-violet-500" />,
  DEPARTMENT: <Building2 size={13} className="text-amber-500" />,
  FACILITY: <MapPin size={13} className="text-emerald-500" />,
  BUILDING: <Building2 size={13} className="text-orange-500" />,
  PLACE: <MapPin size={13} className="text-emerald-500" />,
};

const TYPE_BADGES: Record<string, string> = {
  TEACHER: 'text-sky-700 bg-sky-50 border-sky-200',
  FACULTY: 'text-sky-700 bg-sky-50 border-sky-200',
  CLASSROOM: 'text-blue-700 bg-blue-50 border-blue-200',
  LAB: 'text-purple-700 bg-purple-50 border-purple-200',
  PROGRAMME: 'text-indigo-700 bg-indigo-50 border-indigo-200',
  ROOM: 'text-violet-700 bg-violet-50 border-violet-200',
  DEPARTMENT: 'text-amber-700 bg-amber-50 border-amber-200',
  FACILITY: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  BUILDING: 'text-orange-700 bg-orange-50 border-orange-200',
  PLACE: 'text-slate-700 bg-slate-100 border-slate-200',
};

/**
 * Universal campus destination resolver:
 * Matches any classroom (e.g. SC 12, AB 13, MG 211), canteen, department, lab, or building.
 */
export function resolveCampusDestination(rawQuery: string, currentPanoId?: string): DestinationItem {
  const cleanQ = (rawQuery || '').trim();
  const lowerQ = cleanQ.toLowerCase();

  // 1. Search via master searchCampus engine (1400+ verified campus entities, exact room tags, faculty, etc.)
  try {
    const searchRes = searchCampus(cleanQ, { limit: 5, currentNodeId: currentPanoId || 'outdoor_001' });
    if (searchRes.matches && searchRes.matches.length > 0) {
      const top = searchRes.matches[0];
      return {
        id: top.id,
        name: top.title,
        subtitle: top.subtitle || top.buildingName || 'Campus Location',
        nodeId: top.nodeId || 'outdoor_001',
        buildingId: top.buildingId,
        buildingName: top.buildingName,
        floorNumber: top.floorNumber || 0,
        floorName: top.floorName,
        category: top.type,
        tagId: top.tagId,
        type: top.type,
        blockCode: top.blockCode,
        roomNumber: top.roomNumber,
        roomId: top.roomId,
        isLocationVerified: top.isLocationVerified,
      };
    }
  } catch {
    // Ignore search errors
  }

  // 2. Check exact match in CAMPUS_BLOCKS_INFO
  for (const [k, b] of Object.entries(CAMPUS_BLOCKS_INFO)) {
    if (
      b.name.toLowerCase() === lowerQ ||
      b.code.toLowerCase() === lowerQ ||
      lowerQ === `${b.code.toLowerCase()} block` ||
      lowerQ.includes(b.name.toLowerCase())
    ) {
      return {
        id: k,
        name: b.name,
        subtitle: `${b.code} Block • Entrance`,
        nodeId: b.entranceNodeId,
        buildingId: k,
        buildingName: b.name,
        floorNumber: 0,
        category: 'Building',
      };
    }
  }

  // 3. Fallback search in CAMPUS_PLACES
  try {
    const places = searchCampusPlaces(cleanQ);
    if (places && places.length > 0) {
      const p = places[0];
      return {
        id: p.id,
        name: p.name,
        subtitle: `${p.buildingName} • ${p.floor || 'Ground Floor'}`,
        nodeId: p.panoramaNodeId,
        buildingId: p.building,
        buildingName: p.buildingName,
        floorNumber: p.floorNumber,
        category: p.category,
      };
    }
  } catch {
    // Ignore search errors
  }

  // 5. Keyword fallbacks
  if (lowerQ.includes('canteen') || lowerQ.includes('cafe') || lowerQ.includes('mess') || lowerQ.includes('food')) {
    return {
      id: 'place_canteen',
      name: 'College Canteen',
      subtitle: 'Cafeteria & Refreshments',
      nodeId: 'outdoor_012',
      buildingId: 'bld_ab',
      buildingName: 'College Canteen',
      floorNumber: 0,
      category: 'Canteen',
    };
  }
  if (lowerQ.includes('lib') || lowerQ.includes('read') || lowerQ.includes('book')) {
    return {
      id: 'place_library',
      name: 'Central Library',
      subtitle: 'Digital Repository & Reading Halls',
      nodeId: 'outdoor_201',
      buildingId: 'bld_ab',
      buildingName: 'Administrative Block',
      floorNumber: 0,
      category: 'Library',
    };
  }
  if (lowerQ.includes('chapel') || lowerQ.includes('church') || lowerQ.includes('pray')) {
    return {
      id: 'place_chapel',
      name: 'College Chapel',
      subtitle: 'Sacred Sanctuary & Prayer Hall',
      nodeId: 'outdoor_001',
      buildingId: 'bld_gate',
      buildingName: 'Chapel',
      floorNumber: 0,
      category: 'Sanctuary',
    };
  }
  if (lowerQ.includes('gabriel') || lowerQ.includes('gb block') || lowerQ === 'gb') {
    return {
      id: 'place_gabriel',
      name: 'Fr. Gabriel Indoor Stadium (GB Block)',
      subtitle: 'Indoor Sports Arena & GB Landmark Entrance',
      nodeId: 'bba_364',
      buildingId: 'bld_gabriel',
      buildingName: 'Fr. Gabriel Indoor Stadium',
      floorNumber: 0,
      category: 'Sports',
    };
  }
  if (lowerQ.includes('stadium') || lowerQ.includes('indoor')) {
    return {
      id: 'place_stadium',
      name: 'Fr. Gabriel Indoor Stadium (GB Block)',
      subtitle: 'Indoor Sports Arena & Badminton Courts',
      nodeId: 'bba_364',
      buildingId: 'bld_gabriel',
      buildingName: 'Fr. Gabriel Indoor Stadium',
      floorNumber: 0,
      category: 'Sports',
    };
  }
  if (lowerQ.includes('seminar') || lowerQ.includes('thekkan')) {
    return {
      id: 'place_seminar_hall',
      name: 'Fr. Jose Thekkan A/c Seminar Hall',
      subtitle: 'Air-Conditioned Presentation Hall',
      nodeId: 'outdoor_028',
      buildingId: 'bld_aud',
      buildingName: 'Fr. Jose Thekkan Seminar Hall',
      floorNumber: 0,
      category: 'Facility',
    };
  }
  if (lowerQ.includes('aud')) {
    return {
      id: 'place_auditorium',
      name: 'Main Auditorium',
      subtitle: 'Grand Convention & Cultural Hall',
      nodeId: 'outdoor_028',
      buildingId: 'bld_aud',
      buildingName: 'Auditorium',
      floorNumber: 0,
      category: 'Facility',
    };
  }
  if (lowerQ.includes('gate') || lowerQ.includes('entr') || lowerQ.includes('sec')) {
    return {
      id: 'place_gate',
      name: 'Main Entrance Gate',
      subtitle: 'Campus Checkpoint on Christ College Road',
      nodeId: 'outdoor_001',
      buildingId: 'bld_gate',
      buildingName: 'Main Gate',
      floorNumber: 0,
      category: 'Entrance',
    };
  }

  // Default: Return as valid campus place
  return {
    id: `dest_${cleanQ.replace(/\s+/g, '_')}`,
    name: cleanQ,
    subtitle: 'Christ College Campus Location',
    nodeId: 'outdoor_001',
    buildingName: 'Christ College',
    category: 'Place',
  };
}

export const TourNavigationBox: React.FC<TourNavigationBoxProps> = ({
  isOpen,
  onToggleOpen,
  currentPanoramaId,
  currentPanoramaName,
  userLocationNodeId,
  userLocationName,
  initialDestination,
  onStartNavigation,
}) => {
  // Start location: Defaults to current standing 360 point
  const defaultStartNode = userLocationNodeId || currentPanoramaId || 'outdoor_001';
  const defaultStartName = userLocationName || currentPanoramaName || 'Main Entrance Gate';

  const [startDisplayName, setStartDisplayName] = useState<string>(defaultStartName);
  const [startNodeId, setStartNodeId] = useState<string>(defaultStartNode);
  const [startInputText, setStartInputText] = useState<string>('');
  const [isEditingStart, setIsEditingStart] = useState<boolean>(false);
  const [isStartFocused, setIsStartFocused] = useState<boolean>(false);
  const [isManualStartSelected, setIsManualStartSelected] = useState<boolean>(false);

  // Synchronize start location as user walks/moves to new photos in 360 tour
  useEffect(() => {
    if (!isManualStartSelected && (userLocationNodeId || currentPanoramaId)) {
      const activeNode = userLocationNodeId || currentPanoramaId;
      const activeName = userLocationName || currentPanoramaName;
      if (activeNode) setStartNodeId(activeNode);
      if (activeName) setStartDisplayName(activeName);
    }
  }, [currentPanoramaId, currentPanoramaName, userLocationNodeId, userLocationName, isManualStartSelected]);

  // Destination state
  const [destInputText, setDestInputText] = useState<string>('');
  const [resolvedDest, setResolvedDest] = useState<DestinationItem | null>(null);
  const [isDestFocused, setIsDestFocused] = useState<boolean>(false);
  const [isVoiceSearchOpen, setIsVoiceSearchOpen] = useState<boolean>(false);

  // Box collapsed/expanded state
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  // Auto-fill when initialDestination changes (e.g. user clicked "Navigate" on AB Block)
  useEffect(() => {
    if (initialDestination) {
      setResolvedDest({
        id: initialDestination.id,
        name: initialDestination.name,
        subtitle: initialDestination.buildingName || 'Destination Block',
        nodeId: initialDestination.nodeId,
        buildingId: initialDestination.buildingId,
        buildingName: initialDestination.buildingName,
        floorNumber: initialDestination.floorNumber || 0,
      });
      setDestInputText(initialDestination.name);
      setIsExpanded(true);
    }
  }, [initialDestination]);

  // Destination search suggestions
  const destSuggestions = useMemo(() => {
    const q = destInputText.trim();
    if (!q) return [];

    const suggestions: DestinationItem[] = [];
    const seenIds = new Set<string>();

    const addSuggestion = (item: DestinationItem) => {
      const dedupeKey = `${item.id}_${item.nodeId}_${item.name.toLowerCase()}`;
      if (seenIds.has(dedupeKey)) {
        return false;
      }
      seenIds.add(dedupeKey);
      suggestions.push(item);
      return true;
    };

    // 1. Master campus search engine (authoritative 1400+ entities, tags, rooms, faculty, departments, blocks)
    try {
      const searchRes = searchCampus(q, { limit: 12, currentNodeId: currentPanoramaId || 'outdoor_001' });
      for (const m of searchRes.matches) {
        addSuggestion({
          id: m.id,
          name: m.title,
          subtitle: m.subtitle || m.buildingName || 'Campus Location',
          nodeId: m.nodeId || 'outdoor_001',
          buildingId: m.buildingId,
          buildingName: m.buildingName,
          floorNumber: m.floorNumber || 0,
          floorName: m.floorName,
          category: m.type,
          tagId: m.tagId,
          type: m.type,
          blockCode: m.blockCode,
          roomNumber: m.roomNumber,
          roomId: m.roomId,
          isLocationVerified: m.isLocationVerified,
        });
      }
    } catch {}

    // 2. Fallback only if no suggestions found from master search engine
    if (suggestions.length === 0) {
      const parsed = resolveCampusDestination(q, currentPanoramaId || 'outdoor_001');
      if (parsed) {
        addSuggestion(parsed);
      }
    }

    return suggestions.slice(0, 8);
  }, [destInputText, currentPanoramaId]);

  // Start location search suggestions (Exact same search engine as destination)
  const startSuggestions = useMemo(() => {
    const q = startInputText.trim();
    const suggestions: DestinationItem[] = [];
    const seenIds = new Set<string>();

    const addSuggestion = (item: DestinationItem) => {
      const dedupeKey = `${item.id}_${item.nodeId}_${item.name.toLowerCase()}`;
      if (seenIds.has(dedupeKey)) {
        return false;
      }
      seenIds.add(dedupeKey);
      suggestions.push(item);
      return true;
    };

    // Always offer option to reset to current 360 location
    if (currentPanoramaId) {
      addSuggestion({
        id: 'current_360_spot',
        name: `📍 Current 360 Spot (${currentPanoramaName || 'Standing Point'})`,
        subtitle: 'Reset to where you are standing right now',
        nodeId: currentPanoramaId,
        category: 'Current Spot',
        type: 'PLACE',
        isLocationVerified: true,
      });
    }

    if (!q) return suggestions;

    // 1. Master campus search engine (1400+ verified campus entities)
    try {
      const searchRes = searchCampus(q, { limit: 12, currentNodeId: currentPanoramaId || 'outdoor_001' });
      for (const m of searchRes.matches) {
        addSuggestion({
          id: m.id,
          name: m.title,
          subtitle: m.subtitle || m.buildingName || 'Campus Location',
          nodeId: m.nodeId || 'outdoor_001',
          buildingId: m.buildingId,
          buildingName: m.buildingName,
          floorNumber: m.floorNumber || 0,
          floorName: m.floorName,
          category: m.type,
          tagId: m.tagId,
          type: m.type,
          blockCode: m.blockCode,
          roomNumber: m.roomNumber,
          roomId: m.roomId,
          isLocationVerified: m.isLocationVerified,
        });
      }
    } catch {}

    // 2. Fallback only if no suggestions found from master search engine
    if (suggestions.length === 0 || (currentPanoramaId && suggestions.length === 1)) {
      const parsed = resolveCampusDestination(q, currentPanoramaId || 'outdoor_001');
      if (parsed) {
        addSuggestion(parsed);
      }
    }

    return suggestions.slice(0, 8);
  }, [startInputText, currentPanoramaId, currentPanoramaName]);

  // Calculate route preview
  const routePreview = useMemo(() => {
    const targetNode = resolvedDest?.nodeId;
    if (!startNodeId || !targetNode) return null;
    try {
      const routes = findMultipleNavigationRoutes(
        startNodeId,
        targetNode,
        resolvedDest?.name || 'Destination',
        1
      );
      if (routes && routes.length > 0) {
        return routes[0];
      }
    } catch {
      // Ignore
    }
    return null;
  }, [startNodeId, resolvedDest]);

  // Handle Swap Start ⇄ Destination
  const handleSwap = () => {
    if (!resolvedDest) return;
    const oldStartNodeId = startNodeId;
    const oldStartName = startDisplayName;

    setStartNodeId(resolvedDest.nodeId);
    setStartDisplayName(resolvedDest.name);
    setIsEditingStart(false);

    setResolvedDest({
      id: `swapped_${oldStartNodeId}`,
      name: oldStartName,
      subtitle: 'Starting Location',
      nodeId: oldStartNodeId,
      type: 'PLACE',
    });
    setDestInputText(oldStartName);
  };

  // Launch Navigation
  const handleStartWalk = () => {
    let target = resolvedDest;
    if (!target && destInputText.trim()) {
      const searchRes = searchCampus(destInputText.trim(), { limit: 1, currentNodeId: startNodeId || currentPanoramaId || 'outdoor_001' });
      if (searchRes.matches && searchRes.matches.length > 0) {
        const top = searchRes.matches[0];
        target = {
          id: top.id,
          name: top.title,
          subtitle: top.subtitle || top.buildingName || 'Campus Location',
          nodeId: top.nodeId || 'outdoor_001',
          buildingId: top.buildingId,
          buildingName: top.buildingName,
          floorNumber: top.floorNumber || 0,
          floorName: top.floorName,
          category: top.type,
          tagId: top.tagId,
          type: top.type,
          blockCode: top.blockCode,
          roomNumber: top.roomNumber,
          roomId: top.roomId,
          isLocationVerified: top.isLocationVerified,
        };
      } else {
        target = resolveCampusDestination(destInputText.trim(), startNodeId || currentPanoramaId || 'outdoor_001');
      }
    }
    if (!target) return;

    const destResult: SearchResult = {
      id: target.id,
      type: target.type || (target.category as any) || 'PLACE',
      title: target.name,
      subtitle: target.subtitle,
      buildingId: target.buildingId || 'bld_main',
      buildingName: target.buildingName || target.name,
      floorNumber: target.floorNumber || 0,
      floorName: target.floorName,
      nodeId: target.nodeId,
      tagId: target.tagId,
      blockCode: target.blockCode,
      roomNumber: target.roomNumber,
      roomId: target.roomId,
      isLocationVerified: target.isLocationVerified,
    };

    onStartNavigation(destResult, startNodeId);
  };

  if (!isOpen) return null;

  return (
    <div className="absolute top-16 left-3 right-3 sm:left-4 sm:right-auto sm:w-96 z-30 pointer-events-auto transition-all duration-200">
      {/* Sleek Floating Box */}
      <div className="bg-white/95 backdrop-blur-xl border border-slate-200/90 rounded-3xl shadow-2xl overflow-visible ring-1 ring-black/5">
        {/* Box Header Strip */}
        <div className="px-3.5 py-2.5 bg-slate-50/90 border-b border-slate-100 flex items-center justify-between rounded-t-3xl">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Navigation size={13} />
            </div>
            <span className="text-xs font-black text-[#1e3a5f] tracking-tight">
              360° Campus Navigation
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-7 h-7 rounded-full hover:bg-slate-200/80 text-slate-500 flex items-center justify-center transition-colors"
              title={isExpanded ? 'Collapse Menu' : 'Expand Menu'}
            >
              {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
            {onToggleOpen && (
              <button
                type="button"
                onClick={() => onToggleOpen(false)}
                className="w-7 h-7 rounded-full hover:bg-slate-200/80 text-slate-500 flex items-center justify-center transition-colors"
                title="Close"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Box Body */}
        {isExpanded && (
          <div className="p-3 space-y-2.5">
            {/* Start and Destination Container */}
            <div className="bg-slate-100/80 border border-slate-200/80 rounded-2xl p-2.5 relative shadow-inner">
              {/* Swap Button */}
              <button
                type="button"
                onClick={handleSwap}
                disabled={!resolvedDest && !destInputText}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white border border-slate-200 shadow-sm text-blue-600 hover:bg-blue-50 active:scale-95 flex items-center justify-center transition-all disabled:opacity-40 disabled:pointer-events-none"
                title="Swap Start & Destination"
              >
                <ArrowUpDown size={12} />
              </button>

              {/* Start Location Row */}
              <div className="pr-8">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-200 flex-shrink-0" />
                  <span className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider">
                    From
                  </span>
                </div>

                {isEditingStart ? (
                  <div className="relative">
                    <input
                      type="text"
                      value={startInputText}
                      onFocus={() => setIsStartFocused(true)}
                      onChange={(e) => setStartInputText(e.target.value)}
                      placeholder="Search room (e.g. AB 12), block, canteen..."
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setIsStartFocused(false);
                          if (startInputText.trim()) {
                            const resolved = resolveCampusDestination(startInputText.trim());
                            setStartDisplayName(resolved.name);
                            setStartNodeId(resolved.nodeId);
                            setIsManualStartSelected(true);
                            setIsEditingStart(false);
                            setStartInputText('');
                          }
                        }
                      }}
                      className="w-full text-[11px] font-bold text-slate-900 bg-white border border-emerald-500 rounded-lg px-2.5 py-1.5 outline-none shadow-2xs placeholder:text-slate-400 pr-12"
                    />

                    <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      {startInputText && (
                        <button
                          type="button"
                          onClick={() => setStartInputText('')}
                          className="text-slate-400 hover:text-slate-600 p-0.5"
                          title="Clear text"
                        >
                          <X size={12} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingStart(false);
                          setIsStartFocused(false);
                          setStartInputText('');
                        }}
                        className="text-[10px] font-bold text-slate-400 hover:text-slate-700 px-1"
                        title="Cancel"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Suggestions Dropdown */}
                    {isStartFocused && startSuggestions.length > 0 && (
                      <div
                        onWheel={(e) => e.stopPropagation()}
                        onTouchMove={(e) => e.stopPropagation()}
                        className="absolute top-full left-0 right-0 z-40 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-56 overflow-y-auto overflow-x-hidden touch-pan-y overscroll-contain divide-y divide-slate-100 pointer-events-auto"
                      >
                        {startSuggestions.map((item) => {
                          const itemType = item.type || item.category || 'PLACE';
                          const icon = TYPE_ICONS[itemType] || <MapPin size={13} className="text-slate-400" />;
                          const badgeCls = TYPE_BADGES[itemType] || 'text-slate-700 bg-slate-100 border-slate-200';
                          return (
                            <div
                              key={item.id}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setStartDisplayName(item.name);
                                setStartNodeId(item.nodeId);
                                setIsManualStartSelected(item.id !== 'current_360_spot');
                                setIsEditingStart(false);
                                setIsStartFocused(false);
                                setStartInputText('');
                              }}
                              className="p-2.5 hover:bg-emerald-50/70 cursor-pointer text-left transition-colors flex items-center gap-2"
                            >
                              <div className="w-6 h-6 rounded-lg bg-slate-100 border border-slate-200/80 flex items-center justify-center flex-shrink-0">
                                {icon}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-[11px] font-bold text-[#1e3a5f] truncate leading-tight">
                                    {item.name}
                                  </p>
                                  {item.isLocationVerified !== false && (
                                    <CheckCircle2 size={10} className="text-emerald-500 flex-shrink-0" />
                                  )}
                                </div>
                                <p className="text-[9px] text-slate-500 truncate leading-tight mt-0.5">
                                  {item.subtitle}
                                </p>
                              </div>
                              <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded-md border ml-1 flex-shrink-0 ${badgeCls}`}>
                                {itemType}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    onClick={() => {
                      setIsEditingStart(true);
                      setIsStartFocused(true);
                    }}
                    className="flex items-center justify-between bg-white border border-slate-200/90 rounded-lg px-2.5 py-1.5 cursor-pointer hover:border-emerald-400 transition-colors shadow-2xs group"
                  >
                    <span className="text-[11px] font-bold text-slate-800 truncate">
                      {startDisplayName}
                    </span>
                    <span className="text-[9px] font-semibold text-emerald-600 group-hover:underline flex-shrink-0 ml-1">
                      Change
                    </span>
                  </div>
                )}
              </div>

              <div className="w-full h-px bg-slate-200/80 my-2" />

              {/* Destination Location Row */}
              <div className="pr-8">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-2 h-2 rounded-full bg-rose-500 ring-2 ring-rose-200 flex-shrink-0" />
                  <span className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider">
                    To
                  </span>
                </div>

                  <div className="relative">
                    <input
                      type="text"
                      value={destInputText}
                      onFocus={() => setIsDestFocused(true)}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDestInputText(val);
                        if (val.trim()) {
                          setResolvedDest(resolveCampusDestination(val));
                        } else {
                          setResolvedDest(null);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setIsDestFocused(false);
                          if (destInputText.trim()) {
                            setResolvedDest(resolveCampusDestination(destInputText.trim()));
                          }
                        }
                      }}
                      placeholder="Search class (e.g. SC 12), dept, canteen..."
                      className="w-full text-[11px] font-bold text-slate-900 bg-white border border-slate-200/90 focus:border-blue-500 rounded-lg pl-2.5 pr-14 py-1.5 outline-none shadow-2xs placeholder:text-slate-400"
                    />

                    <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      {destInputText && (
                        <button
                          type="button"
                          onClick={() => {
                            setDestInputText('');
                            setResolvedDest(null);
                          }}
                          className="text-slate-400 hover:text-slate-600 p-0.5"
                          title="Clear text"
                        >
                          <X size={12} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsVoiceSearchOpen(true)}
                        className="w-5 h-5 rounded-full bg-blue-50 hover:bg-blue-100 text-[#2563eb] flex items-center justify-center transition-colors active:scale-95"
                        title="Voice search destination"
                      >
                        <Mic size={11} />
                      </button>
                    </div>

                  {/* Suggestions Dropdown */}
                  {isDestFocused && destSuggestions.length > 0 && (
                    <div
                      onWheel={(e) => e.stopPropagation()}
                      onTouchMove={(e) => e.stopPropagation()}
                      className="absolute top-full left-0 right-0 z-40 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-56 overflow-y-auto overflow-x-hidden touch-pan-y overscroll-contain divide-y divide-slate-100 pointer-events-auto"
                    >
                      {destSuggestions.map((item) => {
                        const itemType = item.type || item.category || 'PLACE';
                        const icon = TYPE_ICONS[itemType] || <MapPin size={13} className="text-slate-400" />;
                        const badgeCls = TYPE_BADGES[itemType] || 'text-slate-700 bg-slate-100 border-slate-200';
                        return (
                          <div
                            key={item.id}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setResolvedDest(item);
                              setDestInputText(item.name);
                              setIsDestFocused(false);
                            }}
                            className="p-2.5 hover:bg-blue-50/70 cursor-pointer text-left transition-colors flex items-center gap-2"
                          >
                            <div className="w-6 h-6 rounded-lg bg-slate-100 border border-slate-200/80 flex items-center justify-center flex-shrink-0">
                              {icon}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <p className="text-[11px] font-bold text-[#1e3a5f] truncate leading-tight">
                                  {item.name}
                                </p>
                                {item.isLocationVerified !== false && (
                                  <CheckCircle2 size={10} className="text-emerald-500 flex-shrink-0" />
                                )}
                              </div>
                              <p className="text-[9px] text-slate-500 truncate leading-tight mt-0.5">
                                {item.subtitle}
                              </p>
                            </div>
                            <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded-md border ml-1 flex-shrink-0 ${badgeCls}`}>
                              {itemType}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Route Preview Strip */}
            {routePreview && resolvedDest && (
              <div className="flex items-center justify-between px-2.5 py-1.5 bg-blue-50/80 border border-blue-200/70 rounded-xl text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Footprints size={14} className="text-blue-600 flex-shrink-0" />
                  <span className="text-[11px] font-extrabold text-[#1e3a5f] truncate">
                    {routePreview.totalDistanceMeters}m walk • ~{Math.max(1, Math.round(routePreview.totalDistanceMeters / 70))} min
                  </span>
                </div>
                <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-md">
                  Direct Path
                </span>
              </div>
            )}

            {/* CTA Button */}
            <button
              type="button"
              onClick={handleStartWalk}
              disabled={!destInputText.trim() && !resolvedDest}
              className={`w-full py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md ${
                destInputText.trim() || resolvedDest
                  ? 'bg-[#2563eb] hover:bg-blue-700 text-white shadow-blue-500/25 active:scale-98 cursor-pointer'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Navigation size={14} />
              <span>
                {resolvedDest
                  ? `Navigate to ${resolvedDest.name}`
                  : destInputText.trim()
                  ? `Navigate to ${destInputText.trim()}`
                  : 'Enter Destination'}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Voice Search Modal */}
      <VoiceSearchModal
        isOpen={isVoiceSearchOpen}
        onClose={() => setIsVoiceSearchOpen(false)}
        onTranscript={(spokenQuery) => {
          setDestInputText(spokenQuery);
          setResolvedDest(resolveCampusDestination(spokenQuery));
          setIsDestFocused(true);
        }}
        contextHint="Say your destination (e.g. Sneha Bhavan, MG Block, Library, Chemistry Lab)"
      />
    </div>
  );
};
