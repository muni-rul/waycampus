import React, { useState, useRef, useEffect } from 'react';
import {
  Building2,
  X,
  MapPin,
  Compass,
  ArrowRight,
  Layers,
  FlaskConical,
  Eye,
  PanelRightClose,
  PanelLeftClose,
  Phone,
  Mail,
  Clock,
  UserCheck,
  Award,
  Navigation,
  AlertCircle,
} from 'lucide-react';
import { useNavigation } from '../../context/NavigationContext';
import { CAMPUS_BLOCKS_INFO, BlockOfficer, getCampusBlockInfo } from '../../data/campusBlocksData';

interface ScannedBlockSidePanelProps {
  buildingId: string;
  onClose: () => void;
}

export const ScannedBlockSidePanel: React.FC<ScannedBlockSidePanelProps> = ({
  buildingId,
  onClose,
}) => {
  const {
    setActivePanoramaId,
    setActiveFloorNumber,
    setUserStartingPoint,
    startNavigationRoute,
    setVisualMode,
    setViewMode,
    openReportModal,
  } = useNavigation();

  // State for temporary visual feedback
  const [startSaved, setStartSaved] = useState(false);
  const startSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timer on unmount to prevent memory leak
  useEffect(() => {
    return () => {
      if (startSavedTimerRef.current) {
        clearTimeout(startSavedTimerRef.current);
      }
    };
  }, []);

  // Find block information dynamically populated with user entered tags
  const blockData = getCampusBlockInfo(buildingId);

  const [selectedFloorIndex, setSelectedFloorIndex] = useState(0);
  const [panelSide, setPanelSide] = useState<'right' | 'left'>('left');
  const [activeTab, setActiveTab] = useState<'floors' | 'officers' | 'info'>('floors');

  const currentFloor = blockData.floors[selectedFloorIndex] || blockData.floors[0] || {
    floorNumber: 0,
    name: 'Ground Floor',
    nodeId: blockData.entranceNodeId,
    description: '',
    rooms: [],
  };

  // 1. Teleport to Floor in 360°
  const handleTeleportToFloor = (floorNodeId: string, floorNumber: number, floorLabel?: string) => {
    setActivePanoramaId(floorNodeId);
    setActiveFloorNumber(floorNumber);
    setUserStartingPoint(floorNodeId, `${blockData.name} (${floorLabel || `Floor ${floorNumber}`})`);
    setVisualMode('STREET_VIEW');
    setViewMode('HOME');
  };

  // 2. Start 360 Visual Wayfinding Route to Room
  const handleNavigateToRoom = (roomNodeId?: string, roomName?: string, floorNum?: number) => {
    const targetNode = roomNodeId || currentFloor.nodeId || blockData.entranceNodeId;
    setVisualMode('STREET_VIEW');
    setViewMode('HOME');
    startNavigationRoute({
      id: roomName || 'Destination Room',
      type: 'ROOM',
      title: roomName || 'Destination Room',
      subtitle: `${blockData.name} • Floor ${floorNum ?? currentFloor.floorNumber}`,
      buildingId: blockData.code,
      buildingName: blockData.name,
      floorNumber: floorNum ?? currentFloor.floorNumber,
      coordinates: { x: 0, y: 0, z: 0 },
      nodeId: targetNode,
    });
  };

  // 3. Navigate to Officer's Chamber
  const handleNavigateToOfficer = (officer: BlockOfficer) => {
    const targetNode = officer.nodeId || blockData.entranceNodeId;
    setVisualMode('STREET_VIEW');
    setViewMode('HOME');
    startNavigationRoute({
      id: officer.name,
      type: 'FACULTY',
      title: officer.name,
      subtitle: `${officer.role} • ${officer.room || blockData.name}`,
      buildingId: blockData.code,
      buildingName: blockData.name,
      floorNumber: officer.floorNumber ?? 1,
      coordinates: { x: 0, y: 0, z: 0 },
      nodeId: targetNode,
    });
  };

  // 4. Enter Block in Full 360° & Close Drawer
  const handleEnter360 = () => {
    setActivePanoramaId(blockData.entranceNodeId);
    setActiveFloorNumber(0);
    setUserStartingPoint(blockData.entranceNodeId, blockData.name);
    setVisualMode('STREET_VIEW');
    setViewMode('HOME');
    onClose();
  };

  // 5. Set Starting Point with visual feedback
  const handleSetStart = () => {
    setUserStartingPoint(blockData.entranceNodeId, blockData.name);
    setActivePanoramaId(blockData.entranceNodeId);
    setStartSaved(true);
    if (startSavedTimerRef.current) {
      clearTimeout(startSavedTimerRef.current);
    }
    startSavedTimerRef.current = setTimeout(() => {
      setStartSaved(false);
      startSavedTimerRef.current = null;
    }, 2500);
  };

  return (
    <aside
      aria-label="Scanned Block Details"
      className={`fixed inset-x-2 bottom-2 max-h-[44dvh] sm:max-h-[82dvh] sm:top-14 sm:bottom-14 sm:inset-x-auto ${
        panelSide === 'right' ? 'sm:right-4 sm:left-auto' : 'sm:left-4 sm:right-auto'
      } w-auto sm:w-[380px] z-50 bg-white/98 backdrop-blur-2xl border border-slate-200 rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-slide-up transition-all duration-300 pointer-events-auto pb-safe text-slate-800`}
    >
      {/* ──────────────────────────────────────
          1. COMPACT HEADER BAR
      ────────────────────────────────────── */}
      <div className="p-2 sm:p-3 pb-1.5 border-b border-slate-100 flex-shrink-0 relative">
        <div className="flex items-center justify-between gap-2">
          {/* Icon & Title */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-100 text-[#2563eb] flex items-center justify-center flex-shrink-0 shadow-xs">
              <Building2 size={14} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h2 className="text-xs sm:text-sm font-bold text-[#1e3a5f] truncate leading-tight">
                  {blockData.name}
                </h2>
                <span className="px-1 py-0.2 rounded text-[8px] font-black bg-blue-50 text-[#2563eb] border border-blue-200 flex-shrink-0">
                  {blockData.code}
                </span>
              </div>
              <p className="text-[9px] sm:text-[10px] text-slate-500 truncate leading-tight">
                {blockData.category}
              </p>
            </div>
          </div>

          {/* Controls: Report, Dock Switch & Close (X) */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Report Problem with this Block */}
            <button
              onClick={() => openReportModal({ blockId: blockData.code, blockName: blockData.name, issueType: 'WRONG_BLOCK' })}
              className="text-slate-400 hover:text-rose-600 p-1 rounded-full bg-slate-100 hover:bg-rose-50 transition-colors"
              title="Report issue with this block"
              aria-label="Report issue"
            >
              <AlertCircle size={14} />
            </button>

            {/* Desktop Dock Switcher (Left / Right) */}
            <button
              onClick={() => setPanelSide((prev) => (prev === 'left' ? 'right' : 'left'))}
              className="hidden sm:flex text-slate-400 hover:text-slate-700 p-1 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors"
              title={panelSide === 'left' ? 'Dock to Right' : 'Dock to Left'}
            >
              {panelSide === 'left' ? <PanelLeftClose size={14} /> : <PanelRightClose size={14} />}
            </button>

            {/* Close Button (X) */}
            <button
              onClick={onClose}
              aria-label="Close Block Details Panel"
              className="text-slate-400 hover:text-slate-700 p-1 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors active:scale-95"
              title="Close panel"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────
          2. INTERACTIVE SUB-TABS
      ────────────────────────────────────── */}
      <div className="px-2 py-0.5 bg-slate-50 border-b border-slate-200 flex items-center gap-1 flex-shrink-0">
        <button
          onClick={() => setActiveTab('floors')}
          className={`flex-1 py-1 px-1.5 rounded-md text-[10px] font-bold flex items-center justify-center gap-1 transition-all ${
            activeTab === 'floors'
              ? 'bg-[#2563eb] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <Layers size={10} />
          <span>Floors & Rooms</span>
        </button>

        {blockData.officers && (
          <button
            onClick={() => setActiveTab('officers')}
            className={`flex-1 py-1 px-1.5 rounded-md text-[10px] font-bold flex items-center justify-center gap-1 transition-all ${
              activeTab === 'officers'
                ? 'bg-[#2563eb] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <UserCheck size={10} />
            <span>Officers</span>
          </button>
        )}

        <button
          onClick={() => setActiveTab('info')}
          className={`flex-1 py-1 px-1.5 rounded-md text-[10px] font-bold flex items-center justify-center gap-1 transition-all ${
            activeTab === 'info'
              ? 'bg-[#2563eb] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <Phone size={10} />
          <span>Contacts & Info</span>
        </button>
      </div>

      {/* ──────────────────────────────────────
          3. TAB 1: FLOORS & ROOMS
      ────────────────────────────────────── */}
      {activeTab === 'floors' && (
        <>
          {/* Floor Selection Horizontal Pills with auto 360 teleport */}
          <div className="px-2 py-1 bg-slate-50/60 border-b border-slate-100 flex items-center gap-1 overflow-x-auto no-scrollbar flex-shrink-0">
            {blockData.floors.map((floor, idx) => (
              <button
                key={floor.floorNumber}
                onClick={() => {
                  setSelectedFloorIndex(idx);
                  handleTeleportToFloor(floor.nodeId, floor.floorNumber, floor.name);
                }}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold whitespace-nowrap transition-all ${
                  selectedFloorIndex === idx
                    ? 'bg-[#2563eb] text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200/80'
                }`}
              >
                <Layers size={10} />
                <span>{floor.name.split('(')[0].trim()}</span>
              </button>
            ))}
          </div>

          {/* Scrollable Floor Rooms Content */}
          <div className="flex-1 overflow-y-auto overscroll-contain p-2 space-y-1.5 min-h-0">
            {/* Active Floor Banner with Teleport */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 flex items-center justify-between gap-1.5 shadow-xs">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold text-slate-800 truncate">{currentFloor.name}</p>
                <p className="text-[10px] text-slate-500 truncate">{currentFloor.description}</p>
              </div>

              <button
                onClick={() => handleTeleportToFloor(currentFloor.nodeId, currentFloor.floorNumber, currentFloor.name)}
                className="py-1 px-2.5 rounded-lg bg-[#2563eb] hover:bg-blue-700 text-white font-extrabold text-[10px] flex items-center gap-1 shadow-xs flex-shrink-0 active:scale-95 transition-all whitespace-nowrap"
                title="View in 360"
              >
                <Eye size={11} />
                <span>View 360°</span>
              </button>
            </div>

            {/* Verified Departments on this floor */}
            {currentFloor.departments && currentFloor.departments.length > 0 && (
              <div className="bg-slate-50 rounded-xl p-2 border border-slate-200 space-y-1">
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <Building2 size={10} className="text-[#2563eb]" /> Departments
                </p>
                <div className="flex flex-wrap gap-1">
                  {currentFloor.departments.map((dept, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-md bg-blue-50 text-[#2563eb] border border-blue-200 text-[10px] font-semibold">
                      {dept}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Rooms List with Working Guide Me Button */}
            {currentFloor.rooms && currentFloor.rooms.length > 0 && (
              <div className="divide-y divide-slate-100 bg-slate-50/50 rounded-xl border border-slate-200 overflow-hidden">
                {currentFloor.rooms.map((room) => (
                  <div
                    key={room.id}
                    className="p-2 flex items-center justify-between gap-1.5 hover:bg-blue-50/40 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-bold text-[#2563eb] bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200 flex-shrink-0">
                          {room.number}
                        </span>
                        <p className="text-xs font-bold text-slate-800 truncate">{room.name}</p>
                      </div>
                      {room.inCharge && (
                        <p className="text-[10px] text-emerald-600 font-medium truncate pl-0.5 mt-0.5">
                          👤 {room.inCharge}
                        </p>
                      )}
                    </div>

                    <button
                      onClick={() => handleNavigateToRoom(room.nodeId, room.name, currentFloor.floorNumber)}
                      className="px-2.5 py-1 rounded-lg bg-[#2563eb] hover:bg-blue-700 text-white font-bold text-[10px] flex items-center gap-1 shadow-xs transition-all active:scale-95 flex-shrink-0"
                      title={`Guide me to ${room.name}`}
                    >
                      <Navigation size={10} />
                      <span>Guide Me</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ──────────────────────────────────────
          4. TAB 2: OFFICERS & LEADERSHIP
      ────────────────────────────────────── */}
      {activeTab === 'officers' && blockData.officers && (
        <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-1.5 min-h-0">
          <div className="divide-y divide-white/5 bg-slate-950/50 rounded-xl border border-white/5 overflow-hidden">
            {blockData.officers.map((officer, idx) => (
              <div key={idx} className="p-2.5 hover:bg-white/5 transition-colors">
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-[8px] font-black uppercase tracking-wider text-sky-400 bg-sky-500/10 px-1.5 py-0.2 rounded border border-sky-500/20 truncate max-w-[170px]">
                    {officer.role}
                  </span>
                  {officer.phone && (
                    <a
                      href={`tel:${officer.phone.replace(/\s+/g, '')}`}
                      className="text-[9px] text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30 transition-colors flex-shrink-0"
                      title="Direct Phone Call"
                    >
                      <Phone size={8} />
                      <span>{officer.phone}</span>
                    </a>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h4 className="text-[11px] font-bold text-white truncate">{officer.name}</h4>
                    {officer.room && <p className="text-[9px] text-slate-400 truncate">{officer.room}</p>}
                  </div>

                  {/* Officer Actions: Guide Me & View 360 */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleNavigateToOfficer(officer)}
                      className="px-2 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-extrabold text-[9px] flex items-center gap-1 shadow-sm transition-all active:scale-95"
                      title={`Start 360 walk to ${officer.name}`}
                    >
                      <Navigation size={9} />
                      <span>Guide</span>
                    </button>
                    {officer.nodeId && (
                      <button
                        onClick={() => handleTeleportToFloor(officer.nodeId!, officer.floorNumber ?? 1, officer.room)}
                        className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                        title="Teleport to Chamber in 360"
                      >
                        <Eye size={11} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────
          5. TAB 3: CONTACTS & INFO
      ────────────────────────────────────── */}
      {activeTab === 'info' && (
        <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-2 min-h-0 text-xs text-slate-300">
          {/* About Block */}
          <div className="bg-slate-950/50 border border-white/5 rounded-xl p-2.5">
            <p className="text-[10px] font-bold text-sky-400 uppercase tracking-wider mb-1">About Block</p>
            <p className="text-[11px] text-slate-300 leading-relaxed">{blockData.description}</p>
          </div>

          {/* Official Contacts with Working tel: and mailto: links */}
          {blockData.contactInfo && (
            <div className="bg-slate-950/50 border border-white/5 rounded-xl p-2.5 space-y-2 text-[10px]">
              <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-1">
                Official Contacts (Tap to Call / Email)
              </p>

              <a
                href={`tel:${blockData.contactInfo.phone.replace(/\s+/g, '')}`}
                className="flex items-center justify-between p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-200 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <Phone size={11} className="text-emerald-400 flex-shrink-0" />
                  <span>College Office: <strong>{blockData.contactInfo.phone}</strong></span>
                </div>
                <span className="text-[9px] text-emerald-400 font-bold">Call 📞</span>
              </a>

              {blockData.contactInfo.principalPhone && (
                <a
                  href={`tel:${blockData.contactInfo.principalPhone.replace(/\s+/g, '')}`}
                  className="flex items-center justify-between p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <Phone size={11} className="text-emerald-400 flex-shrink-0" />
                    <span>Principal's Office: <strong>{blockData.contactInfo.principalPhone}</strong></span>
                  </div>
                  <span className="text-[9px] text-emerald-400 font-bold">Call 📞</span>
                </a>
              )}

              <a
                href={`mailto:${blockData.contactInfo.email}`}
                className="flex items-center justify-between p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-200 transition-colors"
              >
                <div className="flex items-center gap-1.5 truncate mr-2">
                  <Mail size={11} className="text-sky-400 flex-shrink-0" />
                  <span className="truncate">{blockData.contactInfo.email}</span>
                </div>
                <span className="text-[9px] text-sky-400 font-bold flex-shrink-0">Email ✉️</span>
              </a>

              <div className="flex items-center gap-1.5 text-slate-400 pt-1 border-t border-white/5">
                <Clock size={10} className="text-amber-400 flex-shrink-0" />
                <span className="truncate">{blockData.contactInfo.hours}</span>
              </div>
            </div>
          )}

          {/* Services */}
          {blockData.servicesOffered && (
            <div className="bg-slate-950/50 border border-white/5 rounded-xl p-2.5">
              <p className="text-[10px] font-bold text-sky-400 uppercase tracking-wider mb-1">Services Offered</p>
              <ul className="text-[10px] text-slate-300 space-y-1 list-disc list-inside">
                {blockData.servicesOffered.map((srv, i) => (
                  <li key={i}>{srv}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ──────────────────────────────────────
          6. FOOTER ACTION BAR
      ────────────────────────────────────── */}
      <div className="p-2 border-t border-slate-100 bg-slate-50 flex items-center gap-2 flex-shrink-0">
        <button
          onClick={handleEnter360}
          className="flex-1 h-9 py-1 rounded-xl bg-[#2563eb] hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/20 active:scale-95 transition-all truncate"
          title="Teleport to entrance and view full 360 scene"
        >
          <Compass size={14} />
          <span>Enter in 360°</span>
        </button>

        <button
          onClick={handleSetStart}
          className={`h-9 py-1 px-3.5 rounded-xl font-bold text-xs flex items-center gap-1 transition-all flex-shrink-0 active:scale-95 shadow-xs ${
            startSaved
              ? 'bg-emerald-600 text-white ring-2 ring-emerald-400/40'
              : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
          }`}
          title="Set current position to this block"
        >
          <MapPin size={12} className={startSaved ? 'text-white' : 'text-amber-500'} />
          <span>{startSaved ? '✓ Start Set!' : 'Set Start'}</span>
        </button>
      </div>
    </aside>
  );
};
