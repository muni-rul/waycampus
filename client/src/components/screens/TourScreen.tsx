import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Compass,
  Maximize2,
  Minimize2,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  RotateCw,
  Info,
  Search,
  X,
  MapPin,
  Eye,
  EyeOff,
  Navigation,
  Bug,
} from 'lucide-react';
import { useNavigation } from '../../context/NavigationContext';
import { PanoramaViewer } from '../panorama/PanoramaViewer';
import { CAMPUS_BLOCKS_INFO } from '../../data/campusBlocksData';
import { TourNavigationBox, DestinationItem } from '../ui/TourNavigationBox';
import { getAllCustomPlaceTags } from '../../data/campusGraph';
import { getNearestLocationDescriptor } from '../../services/locationNameResolver';

interface TourScreenProps {
  onBackToHome: () => void;
  onOpenBuildingInfo: (buildingId: string) => void;
}

interface TourLandmark {
  id: string;
  name: string;
  shortCode: string;
  category: 'ACADEMIC' | 'ADMIN' | 'FACILITY' | 'ENTRANCE';
  blockId: string;
  image: string;
  description: string;
}

const ALL_CAMPUS_LANDMARKS: TourLandmark[] = [
  {
    id: 'outdoor_001',
    name: 'Main Entrance & Security Gate',
    shortCode: 'GATE',
    category: 'ENTRANCE',
    blockId: 'bld_gate',
    image: '/assets/panoramas/01_OUTDOOR/IMG_20181004_020929_00_001.jpg',
    description: 'Primary campus entrance gate, visitor checkpoint and information kiosk on Christ College Road.',
  },
  {
    id: 'ab_044',
    name: 'Administrative Block (Main Wing)',
    shortCode: 'AB',
    category: 'ADMIN',
    blockId: 'bld_ab',
    image: '/assets/panoramas/06_AB/IMG_20181004_023233_00_044_ycvqZd.jpg',
    description: "Central administrative headquarters, Principal's Chamber, Accounts, Controller of Exams, Department of Physics, Mathematics & Statistics.",
  },
  {
    id: 'outdoor_269',
    name: 'Mahatma Gandhi Block (MG Block)',
    shortCode: 'MG',
    category: 'ACADEMIC',
    blockId: 'bld_main',
    image: '/assets/panoramas/01_OUTDOOR/IMG_20181004_052229_00_269_PZjOqZ.jpg',
    description: 'Heritage academic wing housing Postgraduate Commerce, English, Malayalam, Psychology and Natural History Museum.',
  },
  {
    id: 'outdoor_191',
    name: "St. Joseph's Science Block",
    shortCode: 'SJ',
    category: 'ACADEMIC',
    blockId: 'bld_sj',
    image: '/assets/panoramas/01_OUTDOOR/IMG_20181004_032941_00_191_QktxcN.jpg',
    description: 'Department of Zoology, History, Placement & HRD Cell, Entomotaxonomy, and advanced life science research labs.',
  },
  {
    id: 'outdoor_240',
    name: "St. Mary's Commerce Block",
    shortCode: 'SM',
    category: 'ACADEMIC',
    blockId: 'bld_sm',
    image: '/assets/panoramas/01_OUTDOOR/IMG_20181004_051218_00_240_avOlUY.jpg',
    description: 'Department of Botany, B.Com and M.Com lecture halls, Commerce Research Lab, and botanical herbarium.',
  },
  {
    id: 'outdoor_203',
    name: 'St. Chavara Block (South Campus)',
    shortCode: 'SC',
    category: 'ACADEMIC',
    blockId: 'bld_sc',
    image: '/assets/panoramas/01_OUTDOOR/IMG_20181004_033539_00_203_eAHPoC.jpg',
    description: 'Technological centre housing Computer Science Labs, BCA, Department of B.Voc, Computational Physics and Server Room.',
  },
  {
    id: 'outdoor_143',
    name: 'Mother Teresa Block (MT Block)',
    shortCode: 'MT',
    category: 'ACADEMIC',
    blockId: 'bld_mt',
    image: '/assets/panoramas/01_OUTDOOR/IMG_20181004_031126_00_143_lGKrRa.jpg',
    description: 'Comprehensive science complex housing Department of Chemistry, Geology & Environmental Science, and Academic Deans.',
  },
  {
    id: 'bba_371',
    name: 'BBA Block (Management Studies)',
    shortCode: 'BBA',
    category: 'ACADEMIC',
    blockId: 'bld_bba',
    image: '/assets/panoramas/BBA/IMG_20181004_062014_00_371_uBSeDg.jpg',
    description: 'Department of Management Studies (BBA), Economics (Self-Financing), and double main arts degree programs.',
  },
  {
    id: 'hm_465',
    name: 'Little Flower Block (Hotel Management)',
    shortCode: 'LF',
    category: 'ACADEMIC',
    blockId: 'bld_hm',
    image: '/assets/panoramas/Hotel Management/IMG_20181004_072413_00_465_Kgqeju.jpg',
    description: 'Hospitality training centre housing Food Technology laboratories, French department, and professional commercial kitchens.',
  },
  {
    id: 'sb_437',
    name: 'Sneha Bhavan Block (SB Block)',
    shortCode: 'SB',
    category: 'ACADEMIC',
    blockId: 'bld_sb',
    image: '/assets/panoramas/01_OUTDOOR/IMG_20181004_054521_00_323_RDJGZt.jpg',
    description: 'Sneha Bhavan Block housing Department of Social Work (BSW/MSW), Christ Innovation Centre and extension classrooms.',
  },
  {
    id: 'outdoor_323',
    name: 'St. Sebastian Block (BPE Block)',
    shortCode: 'BPE',
    category: 'ACADEMIC',
    blockId: 'bld_bpe',
    image: '/assets/panoramas/01_OUTDOOR/IMG_20181004_054521_00_323_RDJGZt.jpg',
    description: 'St. Sebastian Block entrance connecting academic classrooms, physical education wings, and sports complex.',
  },
  {
    id: 'outdoor_201',
    name: 'Central Library & Archives',
    shortCode: 'LIB',
    category: 'FACILITY',
    blockId: '',
    image: '/assets/panoramas/01_OUTDOOR/IMG_20181004_033516_00_201_kbEwLt.jpg',
    description: 'College central library, reference section, digital learning repository and research archives.',
  },
];

const EXPLORE_NEARBY_LANDMARKS = ALL_CAMPUS_LANDMARKS.slice(0, 7);

export const TourScreen: React.FC<TourScreenProps> = ({
  onBackToHome,
  onOpenBuildingInfo,
}) => {
  const {
    activePanorama,
    setActivePanoramaId,
    panoramas,
    setActiveFloorNumber,
    isNavigating,
    selectedDestination,
    previewDestination,
    cameraHeading,
    stopNavigation,
    startNavigationRoute,
    userNodeId,
    userLocationLabel,
    setActiveTab,
    openReportModal,
  } = useNavigation();

  const [showHintBadge, setShowHintBadge] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isSheetCollapsed, setIsSheetCollapsed] = useState<boolean>(true);
  const [showOverlayHUD, setShowOverlayHUD] = useState<boolean>(true);
  const [isSeeAllOpen, setIsSeeAllOpen] = useState<boolean>(false);
  const [isNavBoxOpen, setIsNavBoxOpen] = useState<boolean>(false);
  const [navBoxDestination, setNavBoxDestination] = useState<DestinationItem | null>(null);
  const [seeAllSearch, setSeeAllSearch] = useState<string>('');

  const currentPanoDescriptor = useMemo(() => {
    return getNearestLocationDescriptor(activePanorama?.id);
  }, [activePanorama?.id]);

  // Dynamically resolve real user-placed tags for each landmark strictly from debug panel data
  const getLandmarkTags = useMemo(() => {
    const allTagsMap = getAllCustomPlaceTags();
    const prefixMap: Record<string, string> = {
      ab: 'ab_',
      main: 'mg_',
      mg: 'mg_',
      sj: 'sj_',
      sm: 'sm_',
      sc: 'sc_',
      mt: 'mt_',
      bba: 'bba_',
      hm: 'hm_',
      sb: 'sb_',
      bpe: 'gb_',
      gb: 'gb_',
    };

    return (lm: TourLandmark): string[] => {
      // 1. Facilities, Entrances & Non-academic landmarks:
      // Facilities show NO extra sub-tag badges underneath.
      if (lm.category !== 'ACADEMIC' && lm.category !== 'ADMIN') {
        return [];
      }

      // 2. For Academic & Admin blocks, strictly include only real departments & labs placed by the user
      const blockCode = lm.blockId ? lm.blockId.replace('bld_', '').toLowerCase() : '';
      const prefix = prefixMap[blockCode];
      if (!prefix) return [];

      const result: string[] = [];
      const directTags = (allTagsMap[lm.id] || []).map((t) => (t.text || '').trim()).filter(Boolean);
      directTags.forEach((t) => {
        if (!result.includes(t)) result.push(t);
      });

      for (const [nodeId, tagList] of Object.entries(allTagsMap)) {
        if (nodeId.startsWith(prefix)) {
          for (const t of tagList || []) {
            const text = (t.text || '').trim();
            if (text && !result.includes(text)) {
              // Real departments, offices, research centers, and laboratories placed by the user
              if (/department|lab|office|centre|center|hall|academy|research|director|dean|counseling|iqac/i.test(text)) {
                result.push(text);
              }
            }
          }
        }
      }
      return result;
    };
  }, []);

  const filteredLandmarks = useMemo(() => {
    return ALL_CAMPUS_LANDMARKS.filter((item) => {
      const q = seeAllSearch.trim().toLowerCase();
      const tags = getLandmarkTags(item);
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.shortCode.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        tags.some((d) => d.toLowerCase().includes(q));
      return matchesSearch;
    });
  }, [seeAllSearch, getLandmarkTags]);

  useEffect(() => {
    const timer = setTimeout(() => setShowHintBadge(false), 4500);
    return () => clearTimeout(timer);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Determine active building info
  const matchedBlockKey = Object.keys(CAMPUS_BLOCKS_INFO).find((k) => {
    const b = CAMPUS_BLOCKS_INFO[k];
    return (
      b.entranceNodeId === activePanorama?.id ||
      activePanorama?.id.startsWith(b.code.toLowerCase()) ||
      activePanorama?.buildingId?.toLowerCase().includes(b.code.toLowerCase())
    );
  }) || 'bld_gate';

  const currentBlock = CAMPUS_BLOCKS_INFO[matchedBlockKey] || CAMPUS_BLOCKS_INFO['bld_gate'];

  return (
    <div className="flex-1 w-full h-full relative overflow-hidden bg-slate-950 select-none">
      {/* Underlying 360 Panorama Viewer */}
      {activePanorama && (
        <PanoramaViewer
          panorama={activePanorama}
          onSelectPanorama={(panoId) => {
            setActivePanoramaId(panoId);
            const p = panoramas.find((item) => item.id === panoId);
            if (p) setActiveFloorNumber(p.floorNumber);
          }}
          isNavigating={isNavigating}
          destinationLabel={selectedDestination?.title || previewDestination?.title}
          onExitNavigation={stopNavigation}
          onOpenBugReport={() => {
            openReportModal({
              currentPanoramaId: activePanorama.id,
              currentNodeId: activePanorama.id,
              description: `Navigation issue reported from TourScreen (Node: ${activePanorama.id})`,
            });
          }}
          hideTopControls={true}
        />
      )}

      {/* Top Header Overlay matching Reference Image 1 */}
      {!isNavigating && showOverlayHUD && (
        <div className="absolute top-0 left-0 right-0 z-30 pt-safe pb-4 px-4 bg-gradient-to-b from-slate-950/80 via-slate-950/40 to-transparent pointer-events-none">
          <div className="flex items-center justify-between pointer-events-auto">
            {/* Back Button */}
            <button
              onClick={onBackToHome}
              className="w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center text-white active:scale-95 transition-all shadow-md cursor-pointer"
              title="Back to Home"
            >
              <ArrowLeft size={20} />
            </button>

            {/* College Crest & WayCampus Title */}
            <div className="flex flex-col items-center text-center">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full overflow-hidden bg-white p-0.5 shadow-sm ring-1 ring-white/40 flex items-center justify-center">
                  <img src="/christ_college_official_logo.png" alt="Christ College" className="w-full h-full object-contain rounded-full" />
                </div>
                <h1 className="text-base sm:text-lg font-black tracking-tight text-white drop-shadow">
                  <span>Way</span>
                  <span className="font-light text-sky-300">Campus</span>
                </h1>
              </div>
              <p className="text-[10px] sm:text-[11px] font-medium tracking-wide text-sky-200/90 drop-shadow">
                360° Virtual Tour
              </p>
              <p className="text-[9px] text-slate-300/80 tracking-widest uppercase hidden sm:block">
                Explore · Experience · Belong
              </p>
            </div>

            {/* Right Header Group: Report Bug & Compass Rose */}
            <div className="flex items-center gap-2 pointer-events-auto">

              {/* Report Bug Button on side of Compass */}
              <button
                onClick={() => {
                  openReportModal({
                    currentPanoramaId: activePanorama?.id,
                    currentNodeId: activePanorama?.id,
                    blockId: matchedBlockKey,
                    blockName: currentBlock?.name,
                    description: `Issue observed at ${currentBlock?.name || 'campus'} (Panorama: ${activePanorama?.id || 'unknown'})`,
                  });
                }}
                className="w-10 h-10 rounded-full bg-black/40 hover:bg-rose-600/90 backdrop-blur-md border border-white/20 hover:border-rose-400 flex items-center justify-center text-rose-200 hover:text-white transition-all active:scale-95 shadow-md group cursor-pointer"
                title="Report issue at this location"
                aria-label="Report Bug"
              >
                <Bug size={18} className="group-hover:scale-110 transition-transform" />
              </button>

              {/* Compass Rose */}
              <div className="w-10 h-10 rounded-full bg-white/90 backdrop-blur-md shadow-lg border border-white/60 flex items-center justify-center text-slate-800">
                <div className="relative w-6 h-6 flex items-center justify-center">
                  <span className="absolute -top-1 text-[7px] font-black text-rose-600">N</span>
                  <Compass
                    size={16}
                    className="text-blue-600"
                    style={{ transform: `rotate(${-cameraHeading}deg)`, transition: 'transform 0.15s ease-out' }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Small Box Menu: 360 Walking Directions & Route Planner */}
      {!isNavigating && isNavBoxOpen && (
        <TourNavigationBox
          isOpen={isNavBoxOpen}
          onToggleOpen={setIsNavBoxOpen}
          currentPanoramaId={activePanorama?.id || 'outdoor_001'}
          currentPanoramaName={currentPanoDescriptor.title}
          userLocationNodeId={activePanorama?.id || 'outdoor_001'}
          userLocationName={currentPanoDescriptor.title}
          initialDestination={navBoxDestination}
          onStartNavigation={(dest, startNode) => {
            startNavigationRoute(dest, startNode);
            setIsNavBoxOpen(false);
          }}
        />
      )}

      {/* Mini Toggle Pill (visible when box is closed) */}
      {!isNavigating && !isNavBoxOpen && (
        <button
          type="button"
          onClick={() => setIsNavBoxOpen(true)}
          className="absolute top-20 left-3.5 z-20 pointer-events-auto flex items-center gap-2 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-full px-3.5 py-1.5 shadow-lg hover:border-blue-400 active:scale-95 transition-all group"
        >
          <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center group-hover:scale-110 transition-transform shadow-xs">
            <Navigation size={11} />
          </div>
          <span className="text-xs font-black text-[#1e3a5f]">Navigate (360°)</span>
        </button>
      )}

      {/* 360 Drag To Look Around Badge matching template */}
      {showHintBadge && !isNavigating && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none animate-fade-in">
          <div className="flex flex-col items-center gap-1.5 px-4 py-3 bg-black/60 backdrop-blur-md rounded-2xl border border-white/20 shadow-2xl text-white">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-sky-300 animate-pulse">
              <RotateCw size={20} />
            </div>
            <span className="text-xs font-bold tracking-wide">360° Drag to look around</span>
          </div>
        </div>
      )}

      {/* Floating Action Controls bottom-right: Immersive View Toggle & Fullscreen */}
      {!isNavigating && (
        <div
          className={`absolute right-4 z-20 flex flex-col gap-2 transition-all duration-300 ${
            !showOverlayHUD
              ? 'bottom-6'
              : isSheetCollapsed
              ? 'bottom-16 sm:bottom-18'
              : 'bottom-56 sm:bottom-48'
          }`}
        >
          {/* Toggle All Overlays (Pure Immersive 360 Mode) */}
          <button
            onClick={() => setShowOverlayHUD(!showOverlayHUD)}
            className="w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur-md border border-white/20 text-white flex items-center justify-center shadow-lg active:scale-95 transition-all cursor-pointer"
            title={showOverlayHUD ? 'Hide overlays (Immersive 360 view)' : 'Show overlays'}
          >
            {showOverlayHUD ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur-md border border-white/20 text-white flex items-center justify-center shadow-lg active:scale-95 transition-all cursor-pointer"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        </div>
      )}

      {/* Bottom Sheet Overlay with Collapse / Minimize toggle so 360° view is not blocked */}
      {!isNavigating && showOverlayHUD && (
        <div className="absolute bottom-3 sm:bottom-4 left-0 right-0 z-20 pointer-events-auto px-3 sm:px-4 pb-safe transition-all duration-300">
          {isSheetCollapsed ? (
            /* Minimized Sleek Floating Pill - Unobstructed 360° panoramic view */
            <div
              onClick={() => setIsSheetCollapsed(false)}
              className="bg-white/95 backdrop-blur-xl rounded-full border border-white/60 shadow-xl px-3.5 py-2 max-w-md mx-auto flex items-center justify-between cursor-pointer hover:bg-white transition-all active:scale-98 group animate-fade-in"
              title="Click to expand building details and nearby landmarks"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                  <MapPin size={13} />
                </div>
                <p className="text-xs font-bold text-[#1e3a5f] truncate">
                  {currentBlock.name || activePanorama?.buildingName || 'Main Campus'}
                </p>
                <span className="text-[10px] text-blue-600 font-bold ml-1 shrink-0 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100/60 hidden xs:inline-block">
                  Tap to expand
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setNavBoxDestination({
                      id: matchedBlockKey,
                      name: currentBlock.name,
                      subtitle: `${currentBlock.code} Block • Entrance`,
                      nodeId: currentBlock.entranceNodeId,
                      buildingId: matchedBlockKey,
                      buildingName: currentBlock.name,
                      floorNumber: 0,
                    });
                    setIsNavBoxOpen(true);
                  }}
                  className="flex items-center gap-1 px-3 py-1 bg-[#2563eb] hover:bg-blue-700 text-white rounded-full text-xs font-bold shadow-xs active:scale-95 transition-all"
                >
                  <Navigation size={11} />
                  <span>Navigate</span>
                </button>

                <div className="w-6 h-6 rounded-full bg-slate-100 group-hover:bg-blue-50 group-hover:text-blue-600 text-slate-500 flex items-center justify-center transition-colors">
                  <ChevronUp size={14} />
                </div>
              </div>
            </div>
          ) : (
            /* Expanded Bottom Sheet with quick collapse button */
            <div className="bg-white/95 backdrop-blur-xl rounded-t-3xl border-t border-white/40 shadow-2xl px-4 pt-2 pb-3 sm:pb-4 max-w-lg mx-auto animate-slide-up">
              {/* Grab handle & Collapse Button */}
              <button
                type="button"
                onClick={() => setIsSheetCollapsed(true)}
                className="w-full flex items-center justify-center gap-1 py-1 mb-1 text-slate-400 hover:text-blue-600 transition-colors cursor-pointer group"
                title="Scroll down / hide sheet to see full 360° panorama"
              >
                <div className="w-10 h-1 bg-slate-300 rounded-full group-hover:bg-blue-400 transition-colors" />
                <ChevronDown size={14} className="text-slate-400 group-hover:text-blue-600 transition-colors ml-1" />
              </button>

              {/* Location Title & Action Buttons */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-base sm:text-lg font-black text-[#1e3a5f] truncate leading-snug">
                    {currentBlock.name || activePanorama?.buildingName || 'Main Campus'}
                  </h2>
                  <p className="text-[11px] font-semibold text-blue-600 truncate">
                    Christ College (Autonomous), Irinjalakuda
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2 leading-tight">
                    {currentBlock.description ||
                      'The grand entrance to a legacy of learning, values and a brighter tomorrow.'}
                  </p>
                </div>

                {/* Action Buttons: Navigate (Primary) & View Info */}
                <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setNavBoxDestination({
                        id: matchedBlockKey,
                        name: currentBlock.name,
                        subtitle: `${currentBlock.code} Block • Entrance`,
                        nodeId: currentBlock.entranceNodeId,
                        buildingId: matchedBlockKey,
                        buildingName: currentBlock.name,
                        floorNumber: 0,
                      });
                      setIsNavBoxOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#2563eb] hover:bg-blue-700 text-white rounded-full text-xs font-bold shadow-md shadow-blue-500/25 active:scale-95 transition-all"
                  >
                    <Navigation size={13} />
                    <span>Navigate</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenBuildingInfo(matchedBlockKey)}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full text-xs font-bold active:scale-95 transition-all"
                    title="View building details"
                  >
                    <Info size={13} className="text-blue-600" />
                    <span>Info</span>
                  </button>
                </div>
              </div>

              {/* Explore Nearby Carousel matching template */}
              <div className="mt-3 pt-2.5 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-black text-[#1e3a5f]">Explore Nearby</span>
                  <button
                    type="button"
                    onClick={() => setIsSeeAllOpen(true)}
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-700 active:underline cursor-pointer flex items-center gap-0.5"
                  >
                    <span>See All</span>
                    <ChevronRight size={13} />
                  </button>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 overscroll-x-contain touch-pan-x">
                  {EXPLORE_NEARBY_LANDMARKS.map((item) => {
                    const isActive = activePanorama?.id === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActivePanoramaId(item.id)}
                        className={`flex-shrink-0 w-24 sm:w-28 rounded-xl overflow-hidden border transition-all active:scale-95 text-left group ${
                          isActive
                            ? 'border-blue-600 ring-2 ring-blue-500/40 shadow-sm'
                            : 'border-slate-200 hover:border-blue-300'
                        }`}
                      >
                        <div className="h-14 bg-slate-200 overflow-hidden relative">
                          <img
                            src={item.image}
                            alt={item.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          />
                        </div>
                        <div className="p-1.5 bg-white">
                          <p className="text-[10px] font-bold text-slate-800 truncate">{item.name}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* "See All" Landmark Explorer Modal */}
      {isSeeAllOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
          <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200 animate-slide-up">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div>
                <h3 className="text-base font-black text-[#1e3a5f] flex items-center gap-1.5">
                  <MapPin size={18} className="text-blue-600" />
                  <span>All Campus Landmarks (360°)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tap any landmark to teleport and look around in 360°
                </p>
              </div>
              <button
                onClick={() => setIsSeeAllOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-200/80 hover:bg-slate-300 flex items-center justify-center text-slate-600 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Search and Category Filter */}
            <div className="p-3 border-b border-slate-100 bg-white space-y-2">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={seeAllSearch}
                  onChange={(e) => setSeeAllSearch(e.target.value)}
                  placeholder="Search landmark, block or facility..."
                  className="w-full pl-9 pr-8 py-2 bg-slate-100/80 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                />
                {seeAllSearch && (
                  <button
                    onClick={() => setSeeAllSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>


            </div>

            {/* Landmarks List */}
            <div
              onWheel={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
              className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-2.5 divide-y divide-slate-100 touch-pan-y"
            >
              {filteredLandmarks.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <p className="text-sm font-medium">No landmarks found matching "{seeAllSearch}"</p>
                </div>
              ) : (
                filteredLandmarks.map((lm) => {
                  const isCurrent = activePanorama?.id === lm.id;
                  const landmarkTags = getLandmarkTags(lm);
                  return (
                    <div
                      key={lm.id}
                      className="pt-2.5 first:pt-0 flex items-start justify-between gap-3 group"
                    >
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-200 flex-shrink-0 relative border border-slate-200 shadow-xs mt-0.5">
                          <img
                            src={lm.image}
                            alt={lm.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                          <span className="absolute bottom-1 right-1 px-1 rounded bg-black/70 text-[9px] font-bold text-white">
                            {lm.shortCode}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">
                              {lm.name}
                            </h4>
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-blue-50 text-blue-600 border border-blue-100">
                              {lm.category}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                            {lm.description}
                          </p>
                          {/* Real User-Placed Tag Badges */}
                          {landmarkTags.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1 mt-1.5">
                              {landmarkTags.slice(0, 3).map((d) => (
                                <span
                                  key={d}
                                  className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[9px] font-semibold"
                                >
                                  {d}
                                </span>
                              ))}
                              {landmarkTags.length > 3 && (
                                <span className="text-[9px] text-blue-600 font-bold">
                                  +{landmarkTags.length - 3} more
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5 flex-shrink-0 mt-0.5">
                        <button
                          onClick={() => {
                            setActivePanoramaId(lm.id);
                            const p = panoramas.find((item) => item.id === lm.id);
                            if (p) setActiveFloorNumber(p.floorNumber);
                            setIsSeeAllOpen(false);
                          }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs ${
                            isCurrent
                              ? 'bg-emerald-600 text-white shadow-emerald-500/20'
                              : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20 active:scale-95'
                          }`}
                        >
                          <Eye size={13} />
                          <span>{isCurrent ? 'Viewing' : 'Enter 360°'}</span>
                        </button>
                        <button
                          onClick={() => {
                            setIsSeeAllOpen(false);
                            setNavBoxDestination({
                              id: lm.blockId || lm.id,
                              name: lm.name,
                              subtitle: lm.blockId ? `${lm.shortCode} Block • Entrance` : `${lm.shortCode} • Location`,
                              nodeId: lm.id,
                              buildingId: lm.blockId,
                              buildingName: lm.name,
                              floorNumber: 0,
                            });
                            setIsNavBoxOpen(true);
                          }}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors active:scale-95"
                          title="Navigate here"
                        >
                          <Navigation size={12} />
                          <span>Navigate</span>
                        </button>
                        {lm.blockId && onOpenBuildingInfo && (
                          <button
                            onClick={() => {
                              setIsSeeAllOpen(false);
                              onOpenBuildingInfo(lm.blockId);
                            }}
                            className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors active:scale-95"
                            title="View official block info"
                          >
                            Details
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
