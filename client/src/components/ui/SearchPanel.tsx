import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Search, X, MapPin, User, BookOpen, Building2,
  CheckCircle2, ArrowRight, Navigation2, ExternalLink,
  Info, Compass, GraduationCap, FlaskConical, Sparkles, QrCode, Mic
} from 'lucide-react';
import { SearchResult, PublicFacultyStatus, FacultyStatusType } from '../../../../shared/types';
import { useNavigation } from '../../context/NavigationContext';
import { searchCampus, SearchCategoryFilter, SearchEngineResult } from '../../services/campusSearchService';
import { ApiService } from '../../services/api';
import { CAMPUS_BLOCKS_INFO } from '../../data/campusBlocksData';
import { VoiceSearchModal } from './VoiceSearchModal';

const FACULTY_STATUS_CONFIG: Record<
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

function formatRelativeTime(isoString?: string): string {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  if (diff < 0) return 'Just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins === 1) return '1 min ago';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours === 1) return '1h ago';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1d ago' : `${days}d ago`;
}

const QUICK_FILTERS = [
  { label: 'AB Block', query: 'AB Block', blockCode: 'AB', icon: '🏛️' },
  { label: 'MG Block', query: 'MG Block', blockCode: 'MG', icon: '🏛️' },
  { label: 'SJ Block', query: 'SJ Block', blockCode: 'SJ', icon: '🔬' },
  { label: 'SM Block', query: 'SM Block', blockCode: 'SM', icon: '💼' },
  { label: 'SC Block', query: 'SC Block', blockCode: 'SC', icon: '🎓' },
  { label: 'MT Block', query: 'MT Block', blockCode: 'MT', icon: '🏢' },
  { label: 'LF Block', query: 'LF Block', blockCode: 'HM', icon: '🏨' },
  { label: 'BBA Block', query: 'BBA Block', blockCode: 'BBA', icon: '🏢' },
  { label: 'Sneha Bhavan', query: 'Sneha Bhavan Block', blockCode: 'SB', icon: '🏫' },
  { label: 'Library', query: 'LIBRARY', icon: '📚' },
];

const TYPE_ICONS: Record<string, React.ReactNode> = {
  TEACHER: <User size={16} className="text-sky-400" />,
  FACULTY: <User size={16} className="text-sky-400" />,
  CLASSROOM: <GraduationCap size={16} className="text-blue-400" />,
  LAB: <FlaskConical size={16} className="text-purple-400" />,
  PROGRAMME: <BookOpen size={16} className="text-indigo-400" />,
  ROOM: <MapPin size={16} className="text-violet-400" />,
  DEPARTMENT: <Building2 size={16} className="text-amber-400" />,
  FACILITY: <MapPin size={16} className="text-emerald-400" />,
  BUILDING: <Building2 size={16} className="text-orange-400" />,
};

const TYPE_BADGES: Record<string, string> = {
  TEACHER: 'text-sky-400 bg-sky-400/10 border-sky-400/25',
  FACULTY: 'text-sky-400 bg-sky-400/10 border-sky-400/25',
  CLASSROOM: 'text-blue-400 bg-blue-400/10 border-blue-400/25',
  LAB: 'text-purple-400 bg-purple-400/10 border-purple-400/25',
  PROGRAMME: 'text-indigo-400 bg-indigo-400/10 border-indigo-400/25',
  ROOM: 'text-violet-400 bg-violet-400/10 border-violet-400/25',
  DEPARTMENT: 'text-amber-400 bg-amber-400/10 border-amber-400/25',
  FACILITY: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/25',
  BUILDING: 'text-orange-400 bg-orange-400/10 border-orange-400/25',
};

export interface SearchPanelProps {
  initialCategory?: SearchCategoryFilter;
  onClose?: () => void;
  isOpen?: boolean;
}

export const SearchPanel: React.FC<SearchPanelProps> = ({
  initialCategory,
  onClose,
  isOpen = false,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isFocused, setIsFocused] = useState(isOpen);
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const [isVoiceSearchOpen, setIsVoiceSearchOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<any>(null);
  const [tagsVersion, setTagsVersion] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setIsFocused(true);
      inputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (initialCategory) {
      setActiveCategory(initialCategory);
      setIsFocused(true);
    }
  }, [initialCategory]);

  useEffect(() => {
    const onTagsUpdated = () => setTagsVersion((v) => v + 1);
    window.addEventListener('campnav:tags_updated', onTagsUpdated);
    return () => window.removeEventListener('campnav:tags_updated', onTagsUpdated);
  }, []);

  // Outside click / tap listener to auto-dismiss search overlay and filters
  useEffect(() => {
    const handlePointerDownOutside = (event: MouseEvent | TouchEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsFocused(false);
        onClose?.();
      }
    };
    document.addEventListener('mousedown', handlePointerDownOutside);
    document.addEventListener('touchstart', handlePointerDownOutside);
    return () => {
      document.removeEventListener('mousedown', handlePointerDownOutside);
      document.removeEventListener('touchstart', handlePointerDownOutside);
    };
  }, [onClose]);

  // Keyboard Escape listener to dismiss search dropdown
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFocused(false);
        inputRef.current?.blur();
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const [facultyStatuses, setFacultyStatuses] = useState<Record<string, PublicFacultyStatus>>({});

  const loadStatuses = useCallback(async () => {
    try {
      const data = await ApiService.getFacultyStatuses();
      if (data) setFacultyStatuses(data);
    } catch {
      // quiet fallback
    }
  }, []);

  useEffect(() => {
    loadStatuses();
    const interval = setInterval(loadStatuses, 20000);
    const onStatusUpdated = () => loadStatuses();
    window.addEventListener('campnav:faculty_status_updated', onStatusUpdated);
    return () => {
      clearInterval(interval);
      window.removeEventListener('campnav:faculty_status_updated', onStatusUpdated);
    };
  }, [loadStatuses]);

  // Resilient status lookup handling all variations of faculty ID prefixes
  const getFacultyStatus = useCallback((r: SearchResult | null | undefined): PublicFacultyStatus | undefined => {
    if (!r) return undefined;
    const candidates = [
      r.facultyId,
      r.id,
      r.id.startsWith('fac_') ? r.id.substring(4) : `fac_${r.id}`,
      r.facultyId ? (r.facultyId.startsWith('fac_') ? r.facultyId.substring(4) : `fac_${r.facultyId}`) : undefined,
    ].filter(Boolean) as string[];

    for (const key of candidates) {
      if (facultyStatuses[key]) return facultyStatuses[key];
    }
    return undefined;
  }, [facultyStatuses]);

  const {
    selectDestinationForPreview,
    startNavigation,
    setViewMode,
    viewMode,
    userLocationLabel,
    setIsQRScannerOpen,
    setScannedBlockId,
    setActivePanoramaId,
    setActiveTab,
    activePanorama,
    userNodeId,
  } = useNavigation();

  const [activeCategory, setActiveCategory] = useState<SearchCategoryFilter>('ALL');
  const [didYouMean, setDidYouMean] = useState<string | null>(null);

  // Canonical campus search engine integration
  const performSearch = useCallback(
    (rawQuery: string, category: SearchCategoryFilter = 'ALL'): SearchResult[] => {
      if (!rawQuery.trim() && category === 'ALL') {
        setDidYouMean(null);
        return [];
      }
      const currentLoc = activePanorama?.id || userNodeId || 'outdoor_001';
      const searchRes: SearchEngineResult = searchCampus(rawQuery, {
        category,
        limit: 30,
        currentNodeId: currentLoc,
      });
      setDidYouMean(searchRes.didYouMean);
      return searchRes.matches;
    },
    [activePanorama?.id, userNodeId]
  );

  // Live debounced search
  useEffect(() => {
    if (!query.trim() && activeCategory === 'ALL') {
      setResults([]);
      setDidYouMean(null);
      return;
    }

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    setIsSearching(true);

    searchTimeoutRef.current = setTimeout(() => {
      try {
        const searchResults = performSearch(query, activeCategory);
        setResults(searchResults);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 100);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [query, activeCategory, performSearch, tagsVersion]);

  const handleSelectResult = useCallback(
    (result: SearchResult) => {
      setSelectedResult(result);
      setIsFocused(false);
      selectDestinationForPreview(result);

      // Resolve accurate 360 panorama node ID
      const facStatus = getFacultyStatus(result);
      const targetNodeId =
        (facStatus?.status === 'IN_CLASS' && facStatus.locationNodeId)
          ? facStatus.locationNodeId
          : result.nodeId ||
            (result.buildingId && (CAMPUS_BLOCKS_INFO as any)[result.buildingId]?.entranceNodeId) ||
            'outdoor_001';

      if (targetNodeId) {
        setActivePanoramaId(targetNodeId);
      }
      setActiveTab('360_TOUR');
      onClose?.();
    },
    [selectDestinationForPreview, getFacultyStatus, setActivePanoramaId, setActiveTab, onClose]
  );

  const handleQuickFilter = useCallback(
    async (q: string, blockCode?: string) => {
      setQuery(q);
      setIsSearching(true);
      setIsFocused(true);
      if (blockCode) {
        setScannedBlockId(`bld_${blockCode.toLowerCase()}`);
      }
      try {
        const searchResults = await performSearch(q);
        setResults(searchResults);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [performSearch, setScannedBlockId]
  );

  const handleNavigate = useCallback(
    async (result: SearchResult) => {
      if (!result.isLocationVerified && !result.roomId && result.type === 'TEACHER') {
        return; // Location unmapped
      }
      await startNavigation(result);
      setSelectedResult(null);
      setQuery('');
      setIsFocused(false);
    },
    [startNavigation]
  );

  const clearSearch = useCallback(() => {
    setQuery('');
    setResults([]);
    setActiveCategory('ALL');
    setSelectedResult(null);
    setIsFocused(false);
    inputRef.current?.blur();
    onClose?.();
  }, [onClose]);

  const closeDropdown = useCallback(() => {
    setIsFocused(false);
    inputRef.current?.blur();
    onClose?.();
  }, [onClose]);

  return (
    <div ref={searchContainerRef} className="flex flex-col w-full relative">
      {/* ──────────────────────────────────────
          1. DOMINANT MINIMALIST SEARCH BAR
      ────────────────────────────────────── */}
      <div className="relative z-50">
        <div
          className={`flex items-center rounded-2xl px-3.5 py-2.5 sm:px-4 sm:py-3 gap-2.5 transition-all duration-200 shadow-lg border ${
            isFocused
              ? 'bg-white border-blue-500 ring-2 ring-blue-500/20'
              : 'bg-white border-slate-200/90 hover:border-slate-300'
          }`}
        >
          <Search size={18} className={isFocused ? 'text-[#2563eb] flex-shrink-0' : 'text-slate-400 flex-shrink-0'} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              setIsFocused(true);
              loadStatuses();
            }}
            placeholder="Search buildings, rooms, faculty..."
            className="flex-1 bg-transparent text-slate-800 placeholder-slate-400 text-xs sm:text-sm font-medium focus:outline-none"
          />

          {isSearching && (
            <div className="w-3.5 h-3.5 rounded-full border-2 border-[#2563eb] border-t-transparent animate-spin flex-shrink-0" />
          )}

          {/* Voice Search Button */}
          <button
            onClick={() => setIsVoiceSearchOpen(true)}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-[#2563eb] flex items-center justify-center transition-all flex-shrink-0 border border-slate-200 active:scale-95 group"
            title="Search by voice"
            aria-label="Search by voice"
          >
            <Mic size={14} className="group-hover:scale-110 transition-transform text-[#2563eb]" />
          </button>

          {isOpen || isFocused || query ? (
            <button
              onClick={clearSearch}
              className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 flex items-center justify-center transition-colors flex-shrink-0 border border-slate-200 active:scale-95"
              title="Close search"
              aria-label="Close search"
            >
              <X size={14} />
            </button>
          ) : (
            <button
              onClick={() => setIsQRScannerOpen(true)}
              className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#2563eb] flex items-center justify-center transition-colors flex-shrink-0 border border-blue-200"
              title="Scan QR Marker"
            >
              <QrCode size={14} />
            </button>
          )}
        </div>

        {/* Quick Find Category Chips (When not searching) */}
        {!isFocused && !selectedResult && results.length === 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto py-1.5 sm:py-2 no-scrollbar px-0.5 overscroll-x-contain touch-pan-x">
            {QUICK_FILTERS.map((f) => (
              <button
                key={f.label}
                onClick={() => handleQuickFilter(f.query, (f as any).blockCode)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200/90 shadow-xs whitespace-nowrap transition-all active:scale-95 flex-shrink-0"
              >
                <span className="flex-shrink-0">{f.icon}</span>
                <span className="whitespace-nowrap">{f.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ──────────────────────────────────────
          2. LIVE SEARCH AUTOCOMPLETE DROPDOWN
      ────────────────────────────────────── */}
      {isFocused && (
        <div
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          className="absolute top-full left-0 right-0 mt-2 z-40 bg-white/98 backdrop-blur-2xl rounded-2xl border border-slate-200 shadow-2xl animate-slide-up max-h-[50dvh] sm:max-h-[400px] overflow-y-auto overflow-x-hidden touch-pan-y overscroll-contain"
        >
          {/* Category Filter Pills & Prominent Close (X) Button */}
          <div className="sticky top-0 z-10 px-3 pt-2.5 pb-2 border-b border-slate-100 flex items-center justify-between gap-2 bg-slate-50/95 backdrop-blur-md">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar overscroll-x-contain flex-1 min-w-0 touch-pan-x">
              {(
                [
                  { id: 'ALL', label: 'All' },
                  { id: 'ACADEMIC', label: 'Academic' },
                  { id: 'ROOMS', label: 'Rooms' },
                  { id: 'FACULTY', label: 'Faculty' },
                  { id: 'BUILDINGS', label: 'Buildings' },
                  { id: 'LABS', label: 'Labs' },
                  { id: 'FACILITIES', label: 'Facilities' },
                ] as { id: SearchCategoryFilter; label: string }[]
              ).map((cat) => {
                const isSelected = activeCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => {
                      if (isSelected && cat.id !== 'ALL') {
                        setActiveCategory('ALL');
                      } else {
                        setActiveCategory(cat.id);
                      }
                      setIsFocused(true);
                    }}
                    className={`flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition-all active:scale-95 flex items-center gap-1 ${
                      isSelected
                        ? 'bg-[#2563eb] text-white shadow-xs'
                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80'
                    }`}
                  >
                    <span>{cat.label}</span>
                    {isSelected && cat.id !== 'ALL' && (
                      <span className="text-[9px] bg-blue-700/80 rounded-full px-1 text-white ml-0.5">✕</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Prominent Close X Button */}
            <button
              onClick={closeDropdown}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-600 border border-slate-200 transition-all flex-shrink-0 active:scale-95"
            >
              <X size={13} />
              <span>Close</span>
            </button>
          </div>

          {/* Did You Mean Suggestion Banner */}
          {didYouMean && didYouMean.toLowerCase() !== query.toLowerCase().trim() && (
            <div className="px-4 py-2 bg-sky-950/40 border-b border-sky-500/20 flex items-center justify-between text-xs">
              <span className="text-slate-400">
                Did you mean:{' '}
                <button
                  onClick={() => setQuery(didYouMean)}
                  className="text-sky-400 font-bold hover:underline ml-1"
                >
                  "{didYouMean}"
                </button>
              </span>
            </div>
          )}

          {results.length > 0 ? (
            <div className="py-2">
              <div className="px-4 py-1 text-[10px] uppercase font-bold tracking-wider text-slate-500">
                {activeCategory !== 'ALL' && !query.trim()
                  ? `${activeCategory} (${results.length})`
                  : `Matching Results (${results.length})`}
              </div>
              {results.map((r) => {
                const isTeacher = r.type === 'TEACHER' || r.type === 'FACULTY';
                return (
                  <button
                    key={`${r.type}-${r.id}`}
                    onClick={() => handleSelectResult(r)}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors text-left group border-b border-slate-100 last:border-0"
                  >
                    {/* Thumbnail / Avatar */}
                    {isTeacher && r.profileImageUrl ? (
                      <img
                        src={r.profileImageUrl}
                        alt={r.title}
                        loading="lazy"
                        className="w-10 h-10 rounded-xl object-cover object-top border border-slate-200 flex-shrink-0 group-hover:border-blue-400 transition-colors"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-100 transition-colors">
                        {TYPE_ICONS[r.type] || <User size={16} className="text-[#2563eb]" />}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-slate-800 font-bold text-sm line-clamp-2 break-words group-hover:text-[#2563eb] transition-colors">
                          {r.title}
                        </p>
                        <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border flex-shrink-0 ${TYPE_BADGES[r.type]}`}>
                          {r.type === 'TEACHER' ? 'FACULTY' : r.type}
                        </span>
                        {isTeacher && (() => {
                          const fStatus = getFacultyStatus(r);
                          if (!fStatus) return null;
                          return (
                            <span
                              className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full border flex-shrink-0 ${
                                FACULTY_STATUS_CONFIG[fStatus.status]?.badgeStyle ||
                                'bg-slate-100 text-slate-600 border-slate-300'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  FACULTY_STATUS_CONFIG[fStatus.status]?.dotColor || 'bg-slate-400'
                                }`}
                              />
                              {FACULTY_STATUS_CONFIG[fStatus.status]?.label || fStatus.status}
                            </span>
                          );
                        })()}
                      </div>
                      <p className="text-slate-500 text-xs line-clamp-2 break-words mt-0.5 font-medium">{r.subtitle}</p>
                    </div>

                    <ArrowRight size={15} className="text-slate-400 group-hover:text-[#2563eb] transform group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          ) : query.trim() ? (
            <div className="px-4 py-8 text-center">
              <p className="text-slate-600 text-sm font-medium">
                {activeCategory !== 'ALL'
                  ? `No ${activeCategory.toLowerCase()} found for "${query}"`
                  : `No results matching "${query}"`}
              </p>
              <p className="text-slate-400 text-xs mt-1">
                {activeCategory !== 'ALL' ? (
                  <button
                    onClick={() => setActiveCategory('ALL')}
                    className="text-[#2563eb] hover:underline font-semibold"
                  >
                    Clear filter to see all results for "{query}"
                  </button>
                ) : (
                  'Try searching by faculty name, department, or classroom number'
                )}
              </p>
            </div>
          ) : activeCategory !== 'ALL' ? (
            <div className="px-4 py-8 text-center">
              <p className="text-slate-500 text-sm">No {activeCategory.toLowerCase()} found</p>
            </div>
          ) : (
            <div className="p-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Popular Searches</p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_FILTERS.map((f) => (
                  <button
                    key={f.label}
                    onClick={() => handleQuickFilter(f.query)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-[#2563eb] text-xs font-medium border border-slate-200 transition-colors"
                  >
                    <span>{f.icon}</span>
                    <span>{f.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ──────────────────────────────────────
          3. FULL RESULT CARD (FACULTY & ROOMS)
      ────────────────────────────────────── */}
      {selectedResult && viewMode !== 'DESTINATION_CARD' && (
        <div
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          className="mt-2 z-30 bg-slate-900/95 backdrop-blur-2xl rounded-2xl p-3 sm:p-4 border border-white/15 shadow-2xl animate-scale-up max-h-[50dvh] overflow-y-auto overflow-x-hidden touch-pan-y overscroll-contain"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-2.5">
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              {/* Profile Image / Icon */}
              {selectedResult.profileImageUrl ? (
                <img
                  src={selectedResult.profileImageUrl}
                  alt={selectedResult.title}
                  loading="lazy"
                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl object-cover object-top border-2 border-sky-500/40 shadow-md flex-shrink-0"
                />
              ) : (
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center flex-shrink-0 text-sky-400">
                  {TYPE_ICONS[selectedResult.type]}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-[8px] sm:text-[9px] font-bold px-1.5 py-0.2 rounded-full border ${TYPE_BADGES[selectedResult.type]}`}>
                    {selectedResult.type === 'TEACHER' ? 'OFFICIAL FACULTY' : selectedResult.type}
                  </span>
                  {selectedResult.departmentType && (
                    <span className="text-[8px] sm:text-[9px] font-bold text-slate-300 bg-slate-800 px-1.5 py-0.2 rounded-full border border-white/10">
                      {selectedResult.departmentType}
                    </span>
                  )}
                  {/* Faculty Presence Status Badge */}
                  {(selectedResult.type === 'TEACHER' || selectedResult.type === 'FACULTY') && (() => {
                    const selStatus = getFacultyStatus(selectedResult);
                    if (!selStatus) return null;
                    return (
                      <span
                        className={`inline-flex items-center gap-1 text-[8px] sm:text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                          FACULTY_STATUS_CONFIG[selStatus.status]?.badgeStyle ||
                          'bg-slate-500/10 text-slate-400 border-slate-500/30'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                            FACULTY_STATUS_CONFIG[selStatus.status]?.dotColor || 'bg-slate-400'
                          }`}
                        />
                        {FACULTY_STATUS_CONFIG[selStatus.status]?.label || selStatus.status}
                      </span>
                    );
                  })()}
                  {selectedResult.verifiedStatus === 'VERIFIED' && (
                    <span className="flex items-center gap-0.5 text-[8px] sm:text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded-full border border-emerald-500/20">
                      <CheckCircle2 size={9} /> Verified
                    </span>
                  )}
                </div>
                <h3 className="text-white font-black text-sm sm:text-base mt-0.5 tracking-tight leading-snug break-words">{selectedResult.title}</h3>
                <p className="text-slate-300 text-[11px] sm:text-xs font-medium mt-0.5 line-clamp-2 break-words">{selectedResult.subtitle}</p>
                {/* Faculty Last Updated Timestamp */}
                {(selectedResult.type === 'TEACHER' || selectedResult.type === 'FACULTY') && (() => {
                  const selStatus = getFacultyStatus(selectedResult);
                  if (!selStatus?.updatedAt) return null;
                  return (
                    <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1 font-mono">
                      <span>🕒</span>
                      <span>Updated {formatRelativeTime(selStatus.updatedAt)}</span>
                      {selStatus.source === 'ADMIN' && (
                        <span className="text-amber-400/90 font-sans text-[9px]">(Admin verified)</span>
                      )}
                    </p>
                  );
                })()}
              </div>
            </div>

            <button
              onClick={() => setSelectedResult(null)}
              className="w-7 h-7 rounded-full bg-slate-800 hover:bg-rose-500/25 text-slate-400 hover:text-rose-300 flex items-center justify-center flex-shrink-0 transition-colors border border-white/10 active:scale-95"
              title="Close destination card"
              aria-label="Close destination details"
            >
              <X size={14} />
            </button>
          </div>

          {/* Special Location Banner for Faculty In Class */}
          {(selectedResult.type === 'TEACHER' || selectedResult.type === 'FACULTY') && (() => {
            const selStatus = getFacultyStatus(selectedResult);
            if (selStatus?.status === 'IN_CLASS' && selStatus.locationName) {
              return (
                <div className="my-2 bg-blue-950/50 p-2.5 rounded-xl border border-blue-500/30 flex items-start gap-2">
                  <MapPin size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[11px] font-bold text-blue-200">
                      Currently in Class: {selStatus.locationName}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Declared classroom location • Direct 360° walking path available
                    </p>
                  </div>
                </div>
              );
            }
            return null;
          })()}

          {/* Location / Mapping Status Notice */}
          {!selectedResult.isLocationVerified ? (
            <div className="my-2 bg-slate-950/70 p-2.5 rounded-xl border border-sky-500/20 flex items-start gap-2">
              <Info size={14} className="text-sky-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-bold text-slate-200">
                  {selectedResult.roomNumber
                    ? `Classroom Plaque: Room ${selectedResult.roomNumber}`
                    : 'Campus Academic Record'}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                  {selectedResult.locationStatusNote ||
                    (selectedResult.roomNumber
                      ? `Physical 360° mapping scheduled for Room ${selectedResult.roomNumber}.`
                      : 'Physical location will be linked during upcoming 360° campus photo session.')}
                </p>
              </div>
            </div>
          ) : (
            /* Verified Room / Department Location Details Grid */
            <div className="grid grid-cols-2 gap-1.5 my-2 bg-slate-950/60 p-2.5 rounded-xl border border-white/5 text-left">
              {selectedResult.buildingName && (
                <div>
                  <p className="text-[8px] text-slate-500 font-bold uppercase tracking-wider">
                    {selectedResult.type === 'TEACHER' ? 'Department Building' : 'Building'}
                  </p>
                  <p className="text-slate-200 text-[11px] font-bold truncate mt-0.5">
                    {selectedResult.buildingName}
                  </p>
                </div>
              )}
              {(selectedResult.floorName || selectedResult.floorNumber !== undefined) && (
                <div>
                  <p className="text-[8px] text-slate-500 font-bold uppercase tracking-wider">
                    {selectedResult.type === 'TEACHER' ? 'Department Floor' : 'Floor & Room'}
                  </p>
                  <p className="text-slate-200 text-[11px] font-bold truncate mt-0.5">
                    {selectedResult.floorName || `Floor ${selectedResult.floorNumber}`} {selectedResult.roomNumber ? `• Rm ${selectedResult.roomNumber}` : ''}
                  </p>
                </div>
              )}
              <div>
                <p className="text-[8px] text-slate-500 font-bold uppercase tracking-wider">Starting From</p>
                <p className="text-amber-400 text-[11px] font-bold truncate mt-0.5">
                  {userLocationLabel}
                </p>
              </div>
              <div>
                <p className="text-[8px] text-slate-500 font-bold uppercase tracking-wider">Status</p>
                <p className="text-emerald-400 text-[11px] font-bold truncate mt-0.5">
                  360° Street View Active
                </p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2 mt-2.5 flex-wrap sm:flex-nowrap">
            {/* View Official Profile Button */}
            {(selectedResult.profileLink || selectedResult.vidwanLink || selectedResult.sourceUrl) && (
              <a
                href={selectedResult.profileLink || selectedResult.vidwanLink || selectedResult.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-2 sm:py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs flex items-center justify-center gap-1.5 border border-white/10 transition-colors shadow-md"
              >
                <span>Official Profile</span>
                <ExternalLink size={12} className="text-slate-400" />
              </a>
            )}

            {/* In-Class Navigation Button (If In Class with verified classroom) */}
            {(selectedResult.type === 'TEACHER' || selectedResult.type === 'FACULTY') && (() => {
              const selStatus = getFacultyStatus(selectedResult);
              if (selStatus?.status === 'IN_CLASS' && selStatus.locationNodeId) {
                return (
                  <button
                    onClick={() => {
                      const classDest: SearchResult = {
                        id: `class_${selStatus.locationPlaceId || 'room'}`,
                        title: selStatus.locationName || 'Classroom',
                        subtitle: `Class with ${selectedResult.title}`,
                        type: 'ROOM',
                        nodeId: selStatus.locationNodeId,
                        isLocationVerified: true,
                        verifiedStatus: 'VERIFIED',
                        buildingName: selectedResult.buildingName,
                      };
                      handleNavigate(classDest);
                    }}
                    className="flex-1 py-2 sm:py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white font-extrabold text-xs shadow-md shadow-blue-500/25 flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]"
                  >
                    <Navigation2 size={13} className="fill-white" />
                    <span>Navigate to Class</span>
                  </button>
                );
              }
              return null;
            })()}

            {/* Department / Destination Navigation Button */}
            {selectedResult.isLocationVerified && selectedResult.nodeId ? (
              <button
                onClick={() => handleNavigate(selectedResult)}
                className={`flex-1 py-2 sm:py-2.5 rounded-xl font-extrabold text-xs shadow-md flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] ${
                  (selectedResult.type === 'TEACHER' || selectedResult.type === 'FACULTY') &&
                  getFacultyStatus(selectedResult)?.status === 'IN_CLASS' &&
                  getFacultyStatus(selectedResult)?.locationNodeId
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-white/10'
                    : 'bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white shadow-sky-500/25'
                }`}
              >
                <Navigation2 size={13} className={
                  (selectedResult.type === 'TEACHER' || selectedResult.type === 'FACULTY') &&
                  facultyStatuses[selectedResult.id]?.status === 'IN_CLASS' &&
                  facultyStatuses[selectedResult.id]?.locationNodeId
                    ? 'text-sky-400'
                    : 'fill-white'
                } />
                <span>{selectedResult.type === 'TEACHER' ? 'Navigate to Dept' : 'Navigate (360° Walk)'}</span>
              </button>
            ) : !(
              (selectedResult.type === 'TEACHER' || selectedResult.type === 'FACULTY') &&
              facultyStatuses[selectedResult.id]?.status === 'IN_CLASS' &&
              facultyStatuses[selectedResult.id]?.locationNodeId
            ) ? (
              <div className="flex-1 py-2 sm:py-2.5 rounded-xl bg-slate-800/50 text-slate-400 font-semibold text-xs flex items-center justify-center gap-1.5 border border-white/5">
                <span>360° Mapping Pending</span>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Voice Search Modal Dialog */}
      <VoiceSearchModal
        isOpen={isVoiceSearchOpen}
        onClose={() => setIsVoiceSearchOpen(false)}
        onTranscript={(spokenQuery) => {
          setQuery(spokenQuery);
          setIsFocused(true);
        }}
        contextHint="Christ College Voice Search • Search any building, room, faculty or facility"
      />
    </div>
  );
};
