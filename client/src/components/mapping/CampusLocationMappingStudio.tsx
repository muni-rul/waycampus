import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  MapPin, CheckCircle2, AlertTriangle, X, Plus, Edit3, Trash2,
  Compass, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, CornerUpLeft,
  CornerUpRight, History, Sparkles, Building2, Layers, Check,
  ShieldCheck, HelpCircle, Save, Info, RefreshCw, Send
} from 'lucide-react';
import {
  PanoramaNode, VerifiedPlace, PlaceCategory, PlaceSubcategory,
  RelativeDirection, PlaceAuditLog
} from '../../../../shared/types';
import { ApiService } from '../../services/api';

interface CampusLocationMappingStudioProps {
  currentPanorama: PanoramaNode;
  currentYaw: number;
  currentPitch: number;
  isOpen: boolean;
  onClose: () => void;
  onPlaceSaved?: () => void;
}

const CATEGORY_OPTIONS: { label: string; value: PlaceCategory; icon: string }[] = [
  { label: 'Restroom / Toilet', value: 'RESTROOM', icon: '🚻' },
  { label: 'Classroom', value: 'CLASSROOM', icon: '🏫' },
  { label: 'Practical Lab', value: 'LAB', icon: '🔬' },
  { label: 'Department Office', value: 'DEPARTMENT', icon: '🏛️' },
  { label: 'Library', value: 'LIBRARY', icon: '📚' },
  { label: 'Administrative Office', value: 'OFFICE', icon: '💼' },
  { label: 'Faculty Room / Cabin', value: 'FACULTY_ROOM', icon: '👨‍🏫' },
  { label: 'Staircase', value: 'STAIRCASE', icon: '🪜' },
  { label: 'Lift / Elevator', value: 'LIFT', icon: '🛗' },
  { label: 'Entrance Gate / Door', value: 'ENTRANCE', icon: '🚪' },
  { label: 'Exit', value: 'EXIT', icon: '🏃' },
  { label: 'Corridor Junction', value: 'JUNCTION', icon: '🔀' },
  { label: 'Corridor / Hallway', value: 'CORRIDOR', icon: '🚶' },
  { label: 'Campus Landmark', value: 'LANDMARK', icon: '📍' },
  { label: 'Other Location', value: 'OTHER', icon: '📌' },
];

const DIRECTION_OPTIONS: { label: string; value: RelativeDirection; icon: React.ReactNode }[] = [
  { label: 'Ahead / Straight', value: 'FORWARD', icon: <ArrowUp size={16} /> },
  { label: 'Right Side', value: 'RIGHT', icon: <ArrowRight size={16} /> },
  { label: 'Left Side', value: 'LEFT', icon: <ArrowLeft size={16} /> },
  { label: 'Behind / Back', value: 'BACKWARD', icon: <ArrowDown size={16} /> },
  { label: 'Slight Right', value: 'FORWARD_RIGHT', icon: <CornerUpRight size={16} /> },
  { label: 'Slight Left', value: 'FORWARD_LEFT', icon: <CornerUpLeft size={16} /> },
  { label: 'Staircase', value: 'STAIRCASE', icon: <span className="text-xs">🪜</span> },
  { label: 'Junction', value: 'JUNCTION', icon: <span className="text-xs">🔀</span> },
];

const QUICK_PHRASES = [
  "On the right is the girls' toilet",
  "Straight ahead is the boys' toilet",
  "Straight ahead is the CS lab",
  "Left side is Room MG 204",
  "Straight ahead is the staircase",
  "Behind us is the main entrance",
  "At this junction, right goes to CS Department",
  "Straight ahead is the Central Library",
];

export const CampusLocationMappingStudio: React.FC<CampusLocationMappingStudioProps> = ({
  currentPanorama,
  currentYaw,
  currentPitch,
  isOpen,
  onClose,
  onPlaceSaved,
}) => {
  const [activeTab, setActiveTab] = useState<'create' | 'natural' | 'panorama_places' | 'audit'>('create');
  const [mappedPlaces, setMappedPlaces] = useState<VerifiedPlace[]>([]);
  const [auditLogs, setAuditLogs] = useState<PlaceAuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

  // Form State
  const [placeName, setPlaceName] = useState('');
  const [category, setCategory] = useState<PlaceCategory>('RESTROOM');
  const [subcategory, setSubcategory] = useState<PlaceSubcategory>('FEMALE');
  const [relativeDirection, setRelativeDirection] = useState<RelativeDirection>('RIGHT');
  const [buildingId, setBuildingId] = useState(currentPanorama.buildingId || 'bld_mg');
  const [buildingName, setBuildingName] = useState(currentPanorama.buildingName || 'Mahatma Gandhi Block');
  const [floorNumber, setFloorNumber] = useState<number>(currentPanorama.floorNumber ?? 0);
  const [roomNumber, setRoomNumber] = useState('');
  const [description, setDescription] = useState('');
  const [editingPlaceId, setEditingPlaceId] = useState<string | null>(null);

  // Natural language phrase input state
  const [naturalPhrase, setNaturalPhrase] = useState('');
  const [isParsingNatural, setIsParsingNatural] = useState(false);

  // Confirmation preview state before writing to DB
  const [pendingConfirmationPlace, setPendingConfirmationPlace] = useState<Partial<VerifiedPlace> | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<VerifiedPlace | null>(null);

  // Load places anchored to the current panorama
  const loadPanoramaPlaces = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await ApiService.getPlacesForPanorama(currentPanorama.id);
      if (Array.isArray(res)) {
        setMappedPlaces(res);
      }
    } catch (err) {
      console.warn('Could not load panorama places:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentPanorama.id]);

  // Load Audit logs
  const loadAuditLogs = useCallback(async () => {
    try {
      const logs = await ApiService.getPlaceAuditLogs();
      if (Array.isArray(logs)) {
        setAuditLogs(logs.reverse());
      }
    } catch (err) {
      console.warn('Could not load audit logs:', err);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadPanoramaPlaces();
      loadAuditLogs();
      setBuildingId(currentPanorama.buildingId || 'bld_mg');
      setBuildingName(currentPanorama.buildingName || 'Mahatma Gandhi Block');
      setFloorNumber(currentPanorama.floorNumber ?? 0);
    }
  }, [isOpen, currentPanorama, loadPanoramaPlaces, loadAuditLogs]);

  // Reset form
  const resetForm = () => {
    setPlaceName('');
    setCategory('RESTROOM');
    setSubcategory('FEMALE');
    setRelativeDirection('RIGHT');
    setRoomNumber('');
    setDescription('');
    setEditingPlaceId(null);
    setDuplicateWarning(null);
    setPendingConfirmationPlace(null);
    setStatusMessage(null);
  };

  // Populate form for editing
  const handleStartEdit = (place: VerifiedPlace) => {
    setEditingPlaceId(place.id);
    setPlaceName(place.name);
    setCategory(place.category);
    setSubcategory(place.subcategory || 'GENERAL');
    setRelativeDirection(place.relativeDirection);
    setBuildingId(place.buildingId);
    setBuildingName(place.buildingName);
    setFloorNumber(place.floorNumber);
    setRoomNumber(place.roomNumber || '');
    setDescription(place.description || '');
    setActiveTab('create');
  };

  // Handle Natural Phrase Parse
  const handleParseNatural = async (phraseToParse?: string) => {
    const text = phraseToParse || naturalPhrase;
    if (!text.trim()) return;

    setIsParsingNatural(true);
    setStatusMessage(null);
    try {
      const parsed = await ApiService.parseNaturalPlaceInput(text);
      if (parsed) {
        const floorName = floorNumber === 0 ? 'Ground Floor' : `Floor ${floorNumber}`;
        const proposed: Partial<VerifiedPlace> = {
          name: parsed.proposedName,
          displayName: parsed.proposedName,
          category: parsed.category,
          subcategory: parsed.subcategory,
          relativeDirection: parsed.relativeDirection,
          buildingId,
          buildingName,
          floorId: `flr_${buildingId}_${floorNumber}`,
          floorName,
          floorNumber,
          roomNumber: parsed.roomNumber,
          panoramaId: currentPanorama.id,
          nodeId: currentPanorama.navigationNodeId || currentPanorama.id,
          yaw: (currentYaw + (parsed.yawOffset || 0) + 360) % 360,
          pitch: currentPitch,
          verified: true,
          status: 'VERIFIED',
          verificationNote: parsed.isAmbiguous ? parsed.clarificationPrompt : undefined,
        };

        // Open Confirmation Preview
        setPendingConfirmationPlace(proposed);
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to parse natural description.' });
    } finally {
      setIsParsingNatural(false);
    }
  };

  // Trigger structured form validation and confirmation modal
  const handlePrepareStructuredSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!placeName.trim()) {
      setStatusMessage({ type: 'error', text: 'Please enter a place name.' });
      return;
    }

    const floorName = floorNumber === 0 ? 'Ground Floor' : `Floor ${floorNumber}`;
    const floorId = `flr_${buildingId}_${floorNumber}`;

    // Check duplicates before confirmation
    try {
      const dupRes = await ApiService.checkDuplicatePlace(
        placeName.trim(),
        roomNumber || null,
        buildingId,
        floorId,
        editingPlaceId || undefined
      );

      if (dupRes?.hasDuplicate && dupRes.matches?.length > 0) {
        setDuplicateWarning(dupRes.matches[0]);
      } else {
        setDuplicateWarning(null);
      }
    } catch {}

    let dirYawOffset = 0;
    if (relativeDirection === 'RIGHT') dirYawOffset = 270; // 90° to the Right
    else if (relativeDirection === 'LEFT') dirYawOffset = 90; // 90° to the Left
    else if (relativeDirection === 'FORWARD_RIGHT') dirYawOffset = 315; // 45° to the Right
    else if (relativeDirection === 'FORWARD_LEFT') dirYawOffset = 45; // 45° to the Left
    else if (relativeDirection === 'BACKWARD') dirYawOffset = 180;
    else if (relativeDirection === 'FORWARD') dirYawOffset = 0;

    const calculatedYaw = (currentYaw + dirYawOffset + 360) % 360;

    const prepared: Partial<VerifiedPlace> = {
      id: editingPlaceId || undefined,
      name: placeName.trim(),
      displayName: placeName.trim(),
      category,
      subcategory,
      relativeDirection,
      buildingId,
      buildingName,
      floorId,
      floorName,
      floorNumber,
      roomNumber: roomNumber.trim() || null,
      panoramaId: currentPanorama.id,
      nodeId: currentPanorama.navigationNodeId || currentPanorama.id,
      yaw: calculatedYaw,
      pitch: currentPitch,
      description: description.trim() || undefined,
      verified: true,
      status: 'VERIFIED',
    };

    setPendingConfirmationPlace(prepared);
  };

  // Confirm and Commit to Backend Database
  const handleConfirmAndSave = async () => {
    if (!pendingConfirmationPlace) return;

    setIsLoading(true);
    try {
      if (editingPlaceId) {
        // Update existing record
        await ApiService.updatePlace(
          editingPlaceId,
          pendingConfirmationPlace,
          'Location updated via Campus Mapping Studio',
          'Campus Mapper'
        );
        setStatusMessage({ type: 'success', text: `✓ Updated "${pendingConfirmationPlace.name}" successfully.` });
      } else {
        // Create new record
        await ApiService.addPlace(pendingConfirmationPlace, 'Campus Mapper');
        setStatusMessage({ type: 'success', text: `✓ Verified and anchored "${pendingConfirmationPlace.name}" to panorama.` });
      }

      resetForm();
      await loadPanoramaPlaces();
      await loadAuditLogs();
      if (onPlaceSaved) onPlaceSaved();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to save place record.' });
    } finally {
      setIsLoading(false);
      setPendingConfirmationPlace(null);
    }
  };

  // Delete Place Handler
  const handleDeletePlace = async (placeId: string, placeName: string) => {
    if (!confirm(`Are you sure you want to delete/archive "${placeName}"?`)) return;

    try {
      await ApiService.deletePlace(placeId, 'Removed via Mapping Studio', 'Campus Mapper');
      setStatusMessage({ type: 'success', text: `✓ Place "${placeName}" removed from active map.` });
      await loadPanoramaPlaces();
      await loadAuditLogs();
      if (onPlaceSaved) onPlaceSaved();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to delete place.' });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-xl flex justify-end animate-fade-in">
      <div className="w-full max-w-xl h-full bg-slate-900 border-l border-white/15 shadow-2xl flex flex-col overflow-hidden">
        {/* ─────────────────────────────────────────────────────────────
            1. HEADER WITH SPATIAL ANCHOR BADGE
        ───────────────────────────────────────────────────────────── */}
        <div className="p-5 bg-slate-950/80 border-b border-white/10 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-ping" />
              <h2 className="text-white font-black text-base tracking-tight flex items-center gap-1.5">
                <ShieldCheck size={18} className="text-sky-400" />
                Campus Location Mapping Studio
              </h2>
            </div>
            <p className="text-slate-400 text-xs mt-1">
              Manually verify & anchor physical places to the current 360° panorama.
            </p>

            {/* Spatial Anchor Pill */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-500/10 border border-sky-500/25 text-[11px] font-bold text-sky-300">
                <Compass size={12} />
                <span>Pano: {currentPanorama.id}</span>
              </div>
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/25 text-[11px] font-bold text-indigo-300">
                <MapPin size={12} />
                <span>Node: {currentPanorama.navigationNodeId || currentPanorama.id}</span>
              </div>
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/25 text-[11px] font-bold text-amber-300">
                <span>Yaw: {Math.round(currentYaw)}°</span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            2. WORKFLOW TABS
        ───────────────────────────────────────────────────────────── */}
        <div className="flex items-center border-b border-white/10 px-5 bg-slate-900/50">
          <button
            onClick={() => setActiveTab('create')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'create'
                ? 'border-sky-400 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Plus size={14} />
            <span>Structured Creator</span>
          </button>
          <button
            onClick={() => setActiveTab('natural')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'natural'
                ? 'border-sky-400 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles size={14} />
            <span>Natural Phrase</span>
          </button>
          <button
            onClick={() => setActiveTab('panorama_places')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'panorama_places'
                ? 'border-sky-400 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <MapPin size={14} />
            <span>Anchored Places ({mappedPlaces.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'audit'
                ? 'border-sky-400 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <History size={14} />
            <span>Audit Log</span>
          </button>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            3. STATUS NOTIFICATIONS
        ───────────────────────────────────────────────────────────── */}
        {statusMessage && (
          <div
            className={`mx-5 mt-4 p-3 rounded-xl text-xs font-bold flex items-center justify-between gap-2 border ${
              statusMessage.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : statusMessage.type === 'warning'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            <span>{statusMessage.text}</span>
            <button onClick={() => setStatusMessage(null)}>
              <X size={13} />
            </button>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────
            4. TAB CONTENT PANELS
        ───────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* ── TAB 1: STRUCTURED CREATOR ── */}
          {activeTab === 'create' && (
            <form onSubmit={handlePrepareStructuredSave} className="space-y-4">
              {editingPlaceId && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-300">Editing Existing Place Record</span>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="text-[11px] text-slate-400 hover:text-white underline"
                  >
                    Cancel Edit
                  </button>
                </div>
              )}

              {/* Place Name */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Place / Destination Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Girls' Toilet, CS Lab, Room MG 204, Staircase"
                  value={placeName}
                  onChange={(e) => setPlaceName(e.target.value)}
                  className="w-full bg-slate-950/80 border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 font-medium focus:outline-none focus:border-sky-500"
                />
              </div>

              {/* Category & Subcategory */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Category *
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as PlaceCategory)}
                    className="w-full bg-slate-950/80 border border-white/15 rounded-xl px-3 py-2.5 text-xs text-slate-200 font-semibold focus:outline-none focus:border-sky-500"
                  >
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.icon} {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Subcategory (Optional)
                  </label>
                  <select
                    value={subcategory}
                    onChange={(e) => setSubcategory(e.target.value as PlaceSubcategory)}
                    className="w-full bg-slate-950/80 border border-white/15 rounded-xl px-3 py-2.5 text-xs text-slate-200 font-semibold focus:outline-none focus:border-sky-500"
                  >
                    <option value="GENERAL">General / Standard</option>
                    <option value="FEMALE">Female / Women</option>
                    <option value="MALE">Male / Men</option>
                    <option value="STAFF">Staff / Faculty Only</option>
                    <option value="ACCESSIBLE">Accessible / Disabled</option>
                    <option value="THEORY_CLASSROOM">Theory Classroom</option>
                    <option value="LABORATORY">Practical Laboratory</option>
                    <option value="STAIRWAY">Stairway</option>
                    <option value="ELEVATOR">Elevator</option>
                  </select>
                </div>
              </div>

              {/* Relative Direction */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Relative Direction in Current Panorama *
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {DIRECTION_OPTIONS.map((dir) => (
                    <button
                      key={dir.value}
                      type="button"
                      onClick={() => setRelativeDirection(dir.value)}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-bold transition-all ${
                        relativeDirection === dir.value
                          ? 'bg-sky-500/20 border-sky-400 text-sky-300 ring-2 ring-sky-500/20'
                          : 'bg-slate-950/60 border-white/10 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      <div className="mb-1">{dir.icon}</div>
                      <span className="text-[10px] text-center">{dir.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Building & Floor */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Building *
                  </label>
                  <select
                    value={buildingId}
                    onChange={(e) => {
                      setBuildingId(e.target.value);
                      const opt = e.target.selectedOptions[0]?.text;
                      if (opt) setBuildingName(opt);
                    }}
                    className="w-full bg-slate-950/80 border border-white/15 rounded-xl px-3 py-2.5 text-xs text-slate-200 font-semibold focus:outline-none focus:border-sky-500"
                  >
                    <option value="bld_mg">Mahatma Gandhi Block</option>
                    <option value="bld_sm">St. Mary's Block</option>
                    <option value="bld_sj">St. Joseph Block</option>
                    <option value="bld_chavara">St. Chavara Block</option>
                    <option value="bld_admin">Administrative Block</option>
                    <option value="bld_outdoor">Campus Grounds</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Floor Level *
                  </label>
                  <select
                    value={floorNumber}
                    onChange={(e) => setFloorNumber(Number(e.target.value))}
                    className="w-full bg-slate-950/80 border border-white/15 rounded-xl px-3 py-2.5 text-xs text-slate-200 font-semibold focus:outline-none focus:border-sky-500"
                  >
                    <option value={0}>Ground Floor (0)</option>
                    <option value={1}>First Floor (1)</option>
                    <option value={2}>Second Floor (2)</option>
                    <option value={3}>Third Floor (3)</option>
                  </select>
                </div>
              </div>

              {/* Optional Room Code & Verification Notes */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Room Number / Plaque (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. MG 204, 108, SM 163"
                    value={roomNumber}
                    onChange={(e) => setRoomNumber(e.target.value)}
                    className="w-full bg-slate-950/80 border border-white/15 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 font-medium focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Notes / Visible Landmarks
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Near west staircase"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-slate-950/80 border border-white/15 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 font-medium focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              {/* Submit CTA */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-black text-sm shadow-xl shadow-sky-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
              >
                <Save size={16} />
                <span>{editingPlaceId ? 'Preview & Update Place' : 'Verify & Anchor Place'}</span>
              </button>
            </form>
          )}

          {/* ── TAB 2: NATURAL PHRASE ASSISTANT ── */}
          {activeTab === 'natural' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-slate-950/60 rounded-2xl border border-white/10">
                <p className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Sparkles size={14} className="text-sky-400" />
                  Natural Description Input
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Describe what exists in this panorama naturally. The system will extract the place and relative direction without guessing.
                </p>

                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. Right side is girls toilet, straight ahead is staircase..."
                    value={naturalPhrase}
                    onChange={(e) => setNaturalPhrase(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleParseNatural()}
                    className="flex-1 bg-slate-900 border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500"
                  />
                  <button
                    onClick={() => handleParseNatural()}
                    disabled={isParsingNatural || !naturalPhrase.trim()}
                    className="px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <Send size={13} />
                    <span>Parse</span>
                  </button>
                </div>
              </div>

              {/* Sample Quick Phrases */}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Quick Examples (Click to Parse)
                </p>
                <div className="flex flex-col gap-1.5">
                  {QUICK_PHRASES.map((phrase) => (
                    <button
                      key={phrase}
                      onClick={() => {
                        setNaturalPhrase(phrase);
                        handleParseNatural(phrase);
                      }}
                      className="text-left px-3 py-2 rounded-xl bg-slate-950/50 hover:bg-slate-800 border border-white/5 text-xs font-medium text-slate-300 hover:text-white transition-colors flex items-center justify-between group"
                    >
                      <span>"{phrase}"</span>
                      <CornerUpRight size={13} className="text-slate-500 group-hover:text-sky-400" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── TAB 3: PLACES ANCHORED AT CURRENT PANORAMA ── */}
          {activeTab === 'panorama_places' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Destinations Anchored to {currentPanorama.id}
                </span>
                <button
                  onClick={loadPanoramaPlaces}
                  className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1"
                >
                  <RefreshCw size={12} /> Refresh
                </button>
              </div>

              {mappedPlaces.length === 0 ? (
                <div className="p-8 text-center bg-slate-950/40 rounded-2xl border border-white/5">
                  <MapPin size={24} className="text-slate-600 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-300">No destinations mapped to this panorama yet</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Use the Structured Creator to anchor places here.</p>
                </div>
              ) : (
                mappedPlaces.map((place) => (
                  <div
                    key={place.id}
                    className="p-3.5 bg-slate-950/70 rounded-2xl border border-white/10 flex items-center justify-between gap-3 group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/25 flex items-center justify-center text-sky-400 flex-shrink-0">
                        <MapPin size={16} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-slate-100 font-bold text-xs truncate">{place.name}</p>
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-sky-400/10 text-sky-300 border border-sky-400/20">
                            {place.category}
                          </span>
                        </div>
                        <p className="text-slate-400 text-[11px] truncate mt-0.5">
                          {place.relativeDirection} • {place.buildingName} ({place.floorName})
                          {place.roomNumber ? ` • Rm ${place.roomNumber}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => handleStartEdit(place)}
                        className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                        title="Edit place"
                      >
                        <Edit3 size={13} />
                      </button>
                      <button
                        onClick={() => handleDeletePlace(place.id, place.name)}
                        className="p-1.5 rounded-lg bg-slate-800 text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 transition-colors"
                        title="Delete place"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── TAB 4: AUDIT LOGS ── */}
          {activeTab === 'audit' && (
            <div className="space-y-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Recent Campus Verification Audit Logs
              </span>
              {auditLogs.length === 0 ? (
                <p className="text-xs text-slate-500">No audit log records found.</p>
              ) : (
                auditLogs.slice(0, 20).map((log) => (
                  <div
                    key={log.id}
                    className="p-3 bg-slate-950/60 rounded-xl border border-white/5 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-200">{log.placeName}</span>
                      <span className="text-[10px] font-mono text-sky-400 px-1.5 py-0.5 rounded bg-sky-500/10 border border-sky-500/20">
                        {log.action}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      {log.reason || 'Verification record change'}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-white/5">
                      <span>By: {log.createdBy || 'Campus Mapper'}</span>
                      <span>{new Date(log.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* ─────────────────────────────────────────────────────────────
            5. MANDATORY CONFIRMATION PREVIEW MODAL
        ───────────────────────────────────────────────────────────── */}
        {pendingConfirmationPlace && (
          <div className="fixed inset-0 z-[110] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-slate-900 border border-white/15 rounded-3xl p-6 shadow-2xl space-y-4 animate-scale-up">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={20} className="text-emerald-400" />
                  <h3 className="text-white font-black text-base">Confirm Verified Location</h3>
                </div>
                <button
                  onClick={() => setPendingConfirmationPlace(null)}
                  className="w-7 h-7 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Duplicate Warning Prompt */}
              {duplicateWarning && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start gap-2.5 text-xs text-amber-200">
                  <AlertTriangle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Existing Record Detected</p>
                    <p className="text-[11px] text-amber-300 mt-0.5">
                      "{duplicateWarning.name}" already exists on {duplicateWarning.floorName}. Would you like to confirm and overwrite?
                    </p>
                  </div>
                </div>
              )}

              {/* Confirmation Details Card */}
              <div className="space-y-2.5 bg-slate-950/70 p-4 rounded-2xl border border-white/10 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Place Name:</span>
                  <span className="font-bold text-slate-100">{pendingConfirmationPlace.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Category:</span>
                  <span className="font-bold text-sky-400">{pendingConfirmationPlace.category}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Relative Direction:</span>
                  <span className="font-bold text-emerald-400">{pendingConfirmationPlace.relativeDirection}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Building:</span>
                  <span className="font-bold text-slate-200">{pendingConfirmationPlace.buildingName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Floor Level:</span>
                  <span className="font-bold text-slate-200">{pendingConfirmationPlace.floorName}</span>
                </div>
                {pendingConfirmationPlace.roomNumber && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Room Number:</span>
                    <span className="font-bold text-slate-100">Room {pendingConfirmationPlace.roomNumber}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400">Spatial Anchor (Panorama):</span>
                  <span className="font-mono text-[11px] text-sky-300">{pendingConfirmationPlace.panoramaId}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setPendingConfirmationPlace(null)}
                  className="flex-1 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={handleConfirmAndSave}
                  className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black text-xs shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-1.5 transition-all"
                >
                  <Check size={14} />
                  <span>Confirm & Save to DB</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
