import React, { useState, useMemo, useEffect } from 'react';
import {
  Building2,
  Layers,
  Plus,
  Trash2,
  Edit3,
  AlertTriangle,
  CheckCircle2,
  Search,
  Filter,
  Users,
  MapPin,
  Shield,
  Save,
  X,
  Globe,
  Phone,
  Mail,
  Info,
} from 'lucide-react';
import { Room, Department, Building, Teacher, CampusInfoData } from '../../../../../shared/types';
import { getPanoramaThumbnail } from '../data/campusEntities';
import { ApiService } from '../../../services/api';

interface CampusSectionProps {
  buildings: Building[];
  departments: Department[];
  rooms: Room[];
  teachers: Teacher[];
  onSaveRoom?: (room: Partial<Room>) => Promise<void>;
  onDeleteRoom?: (roomId: string) => Promise<void>;
}

function normalizeBuildingId(bldId?: string): string {
  if (!bldId) return '';
  const clean = bldId.toLowerCase().trim();
  if (clean === 'mg' || clean === 'bld_mg' || clean === 'main' || clean === 'bld_main') return 'bld_main';
  if (clean === 'ab' || clean === 'bld_ab' || clean === 'admin') return 'bld_ab';
  if (clean === 'sm' || clean === 'bld_sm' || clean === 'commerce') return 'bld_sm';
  if (clean === 'sj' || clean === 'bld_sj' || clean === 'science') return 'bld_sj';
  if (clean === 'sc' || clean === 'bld_sc' || clean === 'chavara') return 'bld_sc';
  if (clean === 'mt' || clean === 'bld_mt' || clean === 'teresa') return 'bld_mt';
  if (clean === 'hm' || clean === 'bld_hm' || clean === 'lf' || clean === 'hotel') return 'bld_hm';
  if (clean === 'bpe' || clean === 'bld_bpe' || clean === 'gb' || clean === 'bld_gb' || clean === 'bld_gabriel' || clean === 'sports') return 'bld_bpe';
  if (clean === 'bba' || clean === 'bld_bba') return 'bld_bba';
  if (clean === 'sb' || clean === 'bld_sb' || clean === 'sneha') return 'bld_sb';
  if (clean === 'gate' || clean === 'bld_gate' || clean === 'outdoor') return 'bld_gate';
  if (clean === 'aud' || clean === 'bld_aud') return 'bld_main';
  return clean.startsWith('bld_') ? clean : `bld_${clean}`;
}

export const CampusSection: React.FC<CampusSectionProps> = ({
  buildings,
  departments,
  rooms,
  teachers,
  onSaveRoom,
  onDeleteRoom,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'ROOMS' | 'DEPARTMENTS' | 'BUILDINGS' | 'INFO'>('ROOMS');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBuildingFilter, setSelectedBuildingFilter] = useState('ALL');
  const [selectedDepartmentFilter, setSelectedDepartmentFilter] = useState('ALL');
  const [deptSearchQuery, setDeptSearchQuery] = useState('');

  // Campus Info State
  const [campusInfo, setCampusInfo] = useState<CampusInfoData>({
    name: 'Christ College (Autonomous)',
    address: 'Christ College (Autonomous), Irinjalakuda, Thrissur District, Kerala, India - 680125',
    phone: '+91 480 2825258',
    email: 'contact@christcollegeijk.edu.in',
    website: 'https://christcollegeijk.edu.in',
  });
  const [isSavingCampusInfo, setIsSavingCampusInfo] = useState(false);
  const [campusInfoConfirmOpen, setCampusInfoConfirmOpen] = useState(false);

  // Department Edit State
  const [deptList, setDeptList] = useState<Department[]>(departments);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deptConfirmOpen, setDeptConfirmOpen] = useState(false);
  const [isSavingDept, setIsSavingDept] = useState(false);

  useEffect(() => {
    setDeptList(departments);
  }, [departments]);

  useEffect(() => {
    ApiService.getCampusInfo()
      .then((res) => {
        if (res && res.name) {
          setCampusInfo(res);
        }
      })
      .catch((err) => console.warn('Failed to load campus info:', err));
  }, []);

  // Room modal state
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Partial<Room> | null>(null);

  // Room delete impact analysis modal
  const [roomToDelete, setRoomToDelete] = useState<Room | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Unique departments for filter dropdown
  const uniqueDepartments = useMemo(() => {
    return deptList;
  }, [deptList]);

  // Filtered Rooms with comprehensive department matching & building normalization
  const filteredRooms = useMemo(() => {
    return rooms.filter((r) => {
      if (selectedBuildingFilter !== 'ALL') {
        const normFilter = normalizeBuildingId(selectedBuildingFilter);
        const normRoomBld = normalizeBuildingId(r.buildingId);
        if (normRoomBld !== normFilter) return false;
      }
      if (selectedDepartmentFilter !== 'ALL') {
        const matchesDeptId = r.departmentId === selectedDepartmentFilter;
        const matchesDeptName = r.notes?.toLowerCase() === selectedDepartmentFilter.toLowerCase();
        if (!matchesDeptId && !matchesDeptName) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const num = (r.roomNumber || '').toLowerCase();
        const name = (r.name || '').toLowerCase();
        const dept = (r.departmentId || r.notes || '').toLowerCase();
        if (!num.includes(q) && !name.includes(q) && !dept.includes(q)) return false;
      }
      return true;
    });
  }, [rooms, selectedBuildingFilter, selectedDepartmentFilter, searchQuery]);

  // Compute room dependents for impact check
  const getRoomDependents = (roomId: string) => {
    const dependentFaculty = teachers.filter((t) => t.roomId === roomId || t.departmentPlaceId === roomId);
    return {
      faculty: dependentFaculty,
      total: dependentFaculty.length,
    };
  };

  const handleConfirmDelete = async () => {
    if (!roomToDelete || !onDeleteRoom) return;
    setIsDeleting(true);
    try {
      await onDeleteRoom(roomToDelete.id);
      setFeedbackMsg(`Room "${roomToDelete.name}" removed successfully.`);
      setRoomToDelete(null);
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err) {
      console.error('Failed to delete room:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveRoomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRoom || !onSaveRoom) return;
    try {
      await onSaveRoom(editingRoom);
      setFeedbackMsg(`Room "${editingRoom.name}" saved successfully.`);
      setIsRoomModalOpen(false);
      setEditingRoom(null);
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err) {
      console.error('Failed to save room:', err);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 text-slate-800 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold text-blue-600 mb-1">
            <Building2 className="w-4 h-4" />
            <span>CAMPUS DATA PLANE</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-[#0f2744]">
            Campus Infrastructure & Content Management
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Full campus inventory of {rooms.length} academic rooms & classes across {departments.length} departments and {buildings.length} verified blocks.
          </p>
        </div>

        {/* Sub-Tabs */}
        <div className="flex p-1 bg-slate-100 border border-slate-200/80 rounded-2xl shrink-0">
          {(['ROOMS', 'DEPARTMENTS', 'BUILDINGS', 'INFO'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveSubTab(tab)}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer ${
                activeSubTab === tab
                  ? 'bg-white text-[#1a56db] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab === 'ROOMS'
                ? `Rooms & Classes (${rooms.length})`
                : tab === 'DEPARTMENTS'
                ? `Departments & Principal (${deptList.length})`
                : tab === 'BUILDINGS'
                ? `Blocks & Buildings (${buildings.length})`
                : `Campus Info`}
            </button>
          ))}
        </div>
      </div>

      {feedbackMsg && (
        <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-2xl text-xs text-blue-800 flex items-center space-x-2 font-medium">
          <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          1. ROOMS & CLASSES SUB-TAB
          ───────────────────────────────────────────────────────────── */}
      {activeSubTab === 'ROOMS' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search rooms by number, name, or department (e.g. 108, Physics Lab, BCA)..."
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 focus:border-blue-500 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
              />
            </div>

            <div>
              <select
                value={selectedBuildingFilter}
                onChange={(e) => setSelectedBuildingFilter(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-blue-500 truncate shadow-2xs"
              >
                <option value="ALL">All Blocks & Buildings ({buildings.length})</option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <select
                value={selectedDepartmentFilter}
                onChange={(e) => setSelectedDepartmentFilter(e.target.value)}
                className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-blue-500 truncate shadow-2xs"
              >
                <option value="ALL">All Departments</option>
                {uniqueDepartments.map((d) => (
                  <option key={d.id} value={d.name}>{d.name}</option>
                ))}
              </select>

              <button
                onClick={() => {
                  setEditingRoom({
                    name: '',
                    roomNumber: '',
                    floorNumber: 0,
                    buildingId: buildings[0]?.id || 'bld_ab',
                    category: 'CLASSROOM',
                    departmentId: departments[0]?.name || 'General Academic',
                    doorNodeId: 'ab_046',
                  });
                  setIsRoomModalOpen(true);
                }}
                className="px-3.5 py-2 bg-[#1a56db] hover:bg-blue-600 text-white font-bold rounded-xl text-xs transition flex items-center space-x-1.5 shadow-xs shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Room</span>
              </button>
            </div>
          </div>

          {/* Active Filter Indicators */}
          {(selectedBuildingFilter !== 'ALL' || selectedDepartmentFilter !== 'ALL' || searchQuery) && (
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <span className="font-semibold">Filtered results ({filteredRooms.length}):</span>
              {selectedBuildingFilter !== 'ALL' && (
                <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-lg border border-blue-200">
                  Block: {buildings.find((b) => b.id === selectedBuildingFilter)?.code || selectedBuildingFilter}
                  <button onClick={() => setSelectedBuildingFilter('ALL')} className="hover:text-blue-900 cursor-pointer">×</button>
                </span>
              )}
              {selectedDepartmentFilter !== 'ALL' && (
                <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 px-2 py-0.5 rounded-lg border border-purple-200">
                  Dept: {selectedDepartmentFilter}
                  <button onClick={() => setSelectedDepartmentFilter('ALL')} className="hover:text-purple-900 cursor-pointer">×</button>
                </span>
              )}
              <button
                onClick={() => {
                  setSelectedBuildingFilter('ALL');
                  setSelectedDepartmentFilter('ALL');
                  setSearchQuery('');
                }}
                className="text-blue-600 hover:underline text-[11px] ml-1 cursor-pointer"
              >
                Clear all filters
              </button>
            </div>
          )}

          {/* Rooms Table */}
          <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 grid grid-cols-12 text-xs font-bold text-slate-700">
              <span className="col-span-1">Preview</span>
              <span className="col-span-3">Room / Facility Name</span>
              <span className="col-span-1">Number</span>
              <span className="col-span-3">Academic Department</span>
              <span className="col-span-2">Building & Floor</span>
              <span className="col-span-1">Type</span>
              <span className="col-span-1 text-right">Actions</span>
            </div>

            <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
              {filteredRooms.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No rooms or laboratories matching the filter criteria.
                </div>
              ) : (
                filteredRooms.map((room) => {
                  const bld = buildings.find((b) => normalizeBuildingId(b.id) === normalizeBuildingId(room.buildingId));
                  const thumb = getPanoramaThumbnail(room.doorNodeId || room.navigationNodeId || 'ab_046');
                  const deptDisplay = room.departmentId || room.notes || 'General Academic';

                  return (
                    <div
                      key={room.id}
                      className="px-4 py-2.5 grid grid-cols-12 items-center text-xs hover:bg-blue-50/40 transition"
                    >
                      <div className="col-span-1">
                        <img
                          src={thumb}
                          alt={room.name}
                          loading="lazy"
                          className="w-10 h-7 rounded-lg object-cover border border-slate-200 bg-slate-100"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = '/assets/panoramas/06_AB/ab_044.jpg';
                          }}
                        />
                      </div>
                      <div className="col-span-3 font-bold text-slate-900 truncate pr-2">
                        {room.name || 'Unnamed Room'}
                      </div>
                      <div className="col-span-1 font-mono text-blue-700 font-extrabold">
                        {room.roomNumber || '—'}
                      </div>
                      <div className="col-span-3 text-slate-700 truncate pr-2">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 font-semibold text-[11px]">
                          {deptDisplay}
                        </span>
                      </div>
                      <div className="col-span-2 text-slate-500 truncate text-[11px]">
                        {bld?.name || room.buildingId} • Fl {room.floorNumber ?? 0}
                      </div>
                      <div className="col-span-1">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          {room.category || 'ROOM'}
                        </span>
                      </div>
                      <div className="col-span-1 flex items-center justify-end space-x-1.5">
                        <button
                          onClick={() => {
                            setEditingRoom({ ...room });
                            setIsRoomModalOpen(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                          title="Edit Room"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setRoomToDelete(room)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                          title="Delete Room"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          2. DEPARTMENTS & PRINCIPAL SUB-TAB
          ───────────────────────────────────────────────────────────── */}
      {activeSubTab === 'DEPARTMENTS' && (
        <div className="space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={deptSearchQuery}
              onChange={(e) => setDeptSearchQuery(e.target.value)}
              placeholder="Search all departments (e.g. Physics, Commerce, CS, Principal)..."
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 focus:border-blue-500 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {deptList
              .filter((d) => {
                if (!deptSearchQuery.trim()) return true;
                const q = deptSearchQuery.toLowerCase();
                return (
                  d.name.toLowerCase().includes(q) ||
                  (d.code || '').toLowerCase().includes(q) ||
                  (d.description || '').toLowerCase().includes(q) ||
                  (d.headOfDepartment || '').toLowerCase().includes(q)
                );
              })
              .map((dept) => {
                const deptRooms = rooms.filter((r) => {
                  const rDept = (r.departmentId || r.notes || '').toLowerCase();
                  const dName = (dept.name || '').toLowerCase();
                  return rDept.includes(dName) || dName.includes(rDept) || r.departmentId === dept.id;
                });
                const deptNameLower = (dept.name || '').toLowerCase();
                const deptFaculty = teachers.filter(
                  (t) =>
                    (t.departmentName && t.departmentName.toLowerCase() === deptNameLower) ||
                    (t.departmentCategory && t.departmentCategory.toLowerCase() === deptNameLower)
                );

                const isPrincipal = dept.code === 'ADMIN' || dept.id === 'dept_admin_principal';

                return (
                  <div
                    key={dept.id}
                    className={`p-4 bg-white border rounded-2xl space-y-2.5 transition-all shadow-xs flex flex-col justify-between ${
                      isPrincipal
                        ? 'border-blue-300 bg-gradient-to-br from-blue-50/40 via-white to-white ring-1 ring-blue-200'
                        : 'border-slate-200/80 hover:border-blue-400'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                          isPrincipal
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}>
                          {dept.code || 'DEPT'}
                        </span>
                        <div className="flex items-center space-x-1.5">
                          <span className="text-xs text-slate-500 font-medium">
                            {dept.buildingName || 'Campus Main'}
                          </span>
                          <button
                            onClick={() => setEditingDept({ ...dept })}
                            className="p-1 hover:bg-slate-100 text-slate-400 hover:text-blue-600 rounded transition cursor-pointer"
                            title="Edit Department"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <h4 className="text-sm font-black text-slate-900">{dept.name}</h4>

                      {dept.headOfDepartment && (
                        <div className="text-xs text-blue-800 font-bold bg-blue-50/80 px-2 py-1 rounded-lg border border-blue-100 flex items-center space-x-1.5">
                          <Users className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span className="truncate">{dept.headOfDepartment}</span>
                        </div>
                      )}

                      <p className="text-[11px] text-slate-500 line-clamp-2">
                        {dept.description || 'Academic department wing and research centre.'}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">
                        <strong className="text-slate-900">{deptRooms.length}</strong> Rooms • <strong className="text-slate-900">{deptFaculty.length}</strong> Faculty
                      </span>
                      <button
                        onClick={() => {
                          setSelectedDepartmentFilter(dept.name);
                          setActiveSubTab('ROOMS');
                        }}
                        className="text-blue-600 hover:text-blue-800 font-bold cursor-pointer hover:underline"
                      >
                        View Rooms →
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          3. BLOCKS & BUILDINGS SUB-TAB (Exact 11 Verified Campus Blocks)
          ───────────────────────────────────────────────────────────── */}
      {activeSubTab === 'BUILDINGS' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {buildings.map((bld) => {
            const normId = normalizeBuildingId(bld.id);
            const bldRooms = rooms.filter((r) => normalizeBuildingId(r.buildingId) === normId);
            const classrooms = bldRooms.filter((r) => r.category === 'CLASSROOM');
            const labs = bldRooms.filter((r) => r.category === 'LABORATORY' || r.category === 'LAB');
            const thumb = getPanoramaThumbnail(bld.entranceNodeIds?.[0] || 'ab_044');

            return (
              <div
                key={bld.id}
                className="bg-white border border-slate-200/80 hover:border-blue-400 rounded-2xl overflow-hidden shadow-xs transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="relative h-28 w-full bg-slate-100 overflow-hidden border-b border-slate-100">
                    <img
                      src={thumb}
                      alt={bld.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/assets/panoramas/06_AB/ab_044.jpg';
                      }}
                    />
                    <div className="absolute top-2.5 right-2.5">
                      <span className="px-2.5 py-1 text-xs font-mono font-extrabold rounded-lg bg-white/95 text-blue-700 shadow-sm border border-slate-200">
                        {bld.code}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 space-y-2">
                    <h4 className="text-sm font-black text-slate-900 leading-tight">{bld.name}</h4>
                    <p className="text-[11px] text-slate-500 line-clamp-2">{bld.description}</p>
                  </div>
                </div>

                <div className="p-4 pt-0 space-y-3">
                  <div className="grid grid-cols-3 gap-1.5 p-2 bg-slate-50 rounded-xl text-center text-[10px] text-slate-500 border border-slate-100">
                    <div>
                      <div className="font-extrabold text-slate-900 text-xs">{bld.totalFloors}</div>
                      <div>Floors</div>
                    </div>
                    <div>
                      <div className="font-extrabold text-slate-900 text-xs">{classrooms.length}</div>
                      <div>Classes</div>
                    </div>
                    <div>
                      <div className="font-extrabold text-slate-900 text-xs">{labs.length}</div>
                      <div>Labs</div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setSelectedBuildingFilter(bld.id);
                      setActiveSubTab('ROOMS');
                    }}
                    className="w-full py-1.5 px-3 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 font-bold rounded-xl text-xs text-slate-700 transition cursor-pointer text-center"
                  >
                    View All {bldRooms.length} Rooms in Block →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          4. CAMPUS INSTITUTIONAL INFO SUB-TAB
          ───────────────────────────────────────────────────────────── */}
      {activeSubTab === 'INFO' && (
        <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs max-w-2xl space-y-5">
          <div className="flex items-center space-x-3 pb-3 border-b border-slate-100">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">Campus Institutional Details</h3>
              <p className="text-xs text-slate-500">
                Official institution details displayed on public navigation headers, footers and contact links.
              </p>
            </div>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-700 font-bold mb-1">Campus Name</label>
              <input
                type="text"
                value={campusInfo.name}
                onChange={(e) => setCampusInfo({ ...campusInfo, name: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500"
                placeholder="Christ College (Autonomous)"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">Campus Address</label>
              <textarea
                rows={3}
                value={campusInfo.address}
                onChange={(e) => setCampusInfo({ ...campusInfo, address: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500 resize-none"
                placeholder="Full official postal address"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Official Contact Phone</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={campusInfo.phone}
                    onChange={(e) => setCampusInfo({ ...campusInfo, phone: e.target.value })}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500"
                    placeholder="+91 480 2825258"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Official Contact Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={campusInfo.email}
                    onChange={(e) => setCampusInfo({ ...campusInfo, email: e.target.value })}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500"
                    placeholder="contact@christcollegeijk.edu.in"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">Official Website</label>
              <div className="relative">
                <Globe className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="url"
                  value={campusInfo.website || ''}
                  onChange={(e) => setCampusInfo({ ...campusInfo, website: e.target.value })}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500"
                  placeholder="https://christcollegeijk.edu.in"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setCampusInfoConfirmOpen(true)}
                className="px-5 py-2.5 bg-[#1a56db] hover:bg-blue-600 text-white font-bold rounded-xl shadow-xs transition flex items-center space-x-2 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Save Campus Info</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IMPACT ANALYSIS / DELETE ROOM CONFIRMATION MODAL */}
      {roomToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full max-w-md p-6 bg-white border border-rose-200 rounded-3xl shadow-2xl text-slate-800">
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-rose-600">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">Impact Analysis: Room Removal</h3>
                <p className="text-xs text-slate-500">Dependency Check Required Before Deletion</p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl mb-4 space-y-2 text-xs">
              <div>
                <span className="text-slate-500 font-medium">Room to Delete:</span>{' '}
                <strong className="text-slate-900">{roomToDelete.name} ({roomToDelete.roomNumber})</strong>
              </div>
              <div>
                <span className="text-slate-500 font-medium">Dependents:</span>{' '}
                {getRoomDependents(roomToDelete.id).total > 0 ? (
                  <span className="text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 inline-block mt-1">
                    {getRoomDependents(roomToDelete.id).total} Faculty Member(s) assigned to this room!
                  </span>
                ) : (
                  <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 inline-block mt-1">
                    No active dependencies detected. Safe to remove.
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setRoomToDelete(null)}
                className="px-4 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {isDeleting ? 'Deleting...' : 'Confirm Deletion'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT / CREATE ROOM MODAL */}
      {isRoomModalOpen && editingRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full max-w-lg p-6 bg-white border border-slate-200 rounded-3xl shadow-2xl text-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#1a56db] flex items-center justify-center">
                  <Building2 className="w-4 h-4" />
                </div>
                <h3 className="text-base font-black text-[#0f2744]">
                  {editingRoom.id ? 'Edit Classroom / Laboratory' : 'Add New Classroom / Room'}
                </h3>
              </div>
              <button
                onClick={() => {
                  setIsRoomModalOpen(false);
                  setEditingRoom(null);
                }}
                className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRoomSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 mb-1 font-bold">Room Name / Label *</label>
                  <input
                    type="text"
                    required
                    value={editingRoom.name || ''}
                    onChange={(e) => setEditingRoom({ ...editingRoom, name: e.target.value })}
                    placeholder="e.g. Physics Lab 1, Room 104"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1 font-bold">Room Number *</label>
                  <input
                    type="text"
                    required
                    value={editingRoom.roomNumber || ''}
                    onChange={(e) => setEditingRoom({ ...editingRoom, roomNumber: e.target.value })}
                    placeholder="e.g. 104, MG 101, Lab 2"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 mb-1 font-bold">Academic Department</label>
                  <select
                    value={editingRoom.departmentId || ''}
                    onChange={(e) => setEditingRoom({ ...editingRoom, departmentId: e.target.value, notes: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500 truncate"
                  >
                    <option value="General Academic">General Academic</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 mb-1 font-bold">Room Category</label>
                  <select
                    value={editingRoom.category || 'CLASSROOM'}
                    onChange={(e) => setEditingRoom({ ...editingRoom, category: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500"
                  >
                    <option value="CLASSROOM">Classroom</option>
                    <option value="LABORATORY">Laboratory / Lab</option>
                    <option value="OFFICE">Department Office</option>
                    <option value="SEMINAR_HALL">Seminar Hall / Auditorium</option>
                    <option value="STAFF_ROOM">Staff Room / Cabin</option>
                    <option value="TOILET">Restroom</option>
                    <option value="OTHER">Other Landmark</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 mb-1 font-bold">Campus Building / Block</label>
                  <select
                    value={editingRoom.buildingId || ''}
                    onChange={(e) => setEditingRoom({ ...editingRoom, buildingId: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500 truncate"
                  >
                    {buildings.map((b) => (
                      <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 mb-1 font-bold">Floor Number</label>
                  <select
                    value={editingRoom.floorNumber ?? 0}
                    onChange={(e) => setEditingRoom({ ...editingRoom, floorNumber: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500"
                  >
                    <option value={0}>Ground Floor (0)</option>
                    <option value={1}>1st Floor (1)</option>
                    <option value={2}>2nd Floor (2)</option>
                    <option value={3}>3rd Floor (3)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-600 mb-1 font-bold">Associated Panorama Node ID</label>
                <input
                  type="text"
                  value={editingRoom.doorNodeId || editingRoom.navigationNodeId || ''}
                  onChange={(e) => setEditingRoom({ ...editingRoom, doorNodeId: e.target.value, navigationNodeId: e.target.value })}
                  placeholder="e.g. ab_046, outdoor_203"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsRoomModalOpen(false);
                    setEditingRoom(null);
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#1a56db] hover:bg-blue-600 text-white font-bold rounded-xl shadow-xs cursor-pointer"
                >
                  Save Room
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Campus Info Save Confirmation Dialog */}
      {campusInfoConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full max-w-md p-6 bg-white border border-blue-200 rounded-3xl shadow-2xl text-slate-800 space-y-4">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl text-blue-600">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Confirm Campus Info Update</h3>
                <p className="text-xs text-slate-500">Live platform modification</p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1.5 text-slate-700">
              <p>You are updating official campus institutional information for:</p>
              <p className="font-bold text-slate-900">&ldquo;{campusInfo.name}&rdquo;</p>
              <p className="text-[11px] text-slate-500">{campusInfo.address}</p>
              <p className="text-[11px] text-slate-500">Phone: {campusInfo.phone} | Email: {campusInfo.email}</p>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setCampusInfoConfirmOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setIsSavingCampusInfo(true);
                  try {
                    await ApiService.updateCampusInfo(campusInfo);
                    setFeedbackMsg('Campus institutional info updated successfully.');
                    setCampusInfoConfirmOpen(false);
                    setTimeout(() => setFeedbackMsg(null), 4000);
                  } catch (err: any) {
                    alert(err.message || 'Failed to update campus info');
                  } finally {
                    setIsSavingCampusInfo(false);
                  }
                }}
                disabled={isSavingCampusInfo}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition cursor-pointer flex items-center space-x-1.5"
              >
                {isSavingCampusInfo ? <span>Saving...</span> : <span>Confirm Update</span>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Department Edit Modal */}
      {editingDept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full max-w-lg p-6 bg-white border border-slate-200 rounded-3xl shadow-2xl text-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Edit Department</h3>
                  <p className="text-xs text-slate-500">Modify details for {editingDept.name}</p>
                </div>
              </div>
              <button
                onClick={() => setEditingDept(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Department Code</label>
                  <input
                    type="text"
                    value={editingDept.code || ''}
                    onChange={(e) => setEditingDept({ ...editingDept, code: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Building Location</label>
                  <input
                    type="text"
                    value={editingDept.buildingName || ''}
                    onChange={(e) => setEditingDept({ ...editingDept, buildingName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">Department Name</label>
                <input
                  type="text"
                  value={editingDept.name}
                  onChange={(e) => setEditingDept({ ...editingDept, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500 font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">Head of Department (HOD)</label>
                <input
                  type="text"
                  value={editingDept.headOfDepartment || ''}
                  onChange={(e) => setEditingDept({ ...editingDept, headOfDepartment: e.target.value })}
                  placeholder="e.g. Dr. Xavier Joseph"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">Description</label>
                <textarea
                  rows={3}
                  value={editingDept.description || ''}
                  onChange={(e) => setEditingDept({ ...editingDept, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingDept(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setDeptConfirmOpen(true)}
                  className="px-4 py-2 bg-[#1a56db] hover:bg-blue-600 text-white font-bold rounded-xl shadow-xs cursor-pointer flex items-center space-x-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Changes</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Department Save Confirmation Dialog */}
      {deptConfirmOpen && editingDept && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full max-w-md p-6 bg-white border border-blue-200 rounded-3xl shadow-2xl text-slate-800 space-y-4">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl text-blue-600">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Confirm Department Update</h3>
                <p className="text-xs text-slate-500">Live platform modification</p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1 text-slate-700">
              <p>You are saving changes for department:</p>
              <p className="font-bold text-slate-900">&ldquo;{editingDept.name}&rdquo; ({editingDept.code})</p>
              <p className="text-[11px] text-slate-500">HOD: {editingDept.headOfDepartment || 'Not set'}</p>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setDeptConfirmOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setIsSavingDept(true);
                  try {
                    await ApiService.updateDepartment(editingDept.id, editingDept);
                    setDeptList((prev) =>
                      prev.map((d) => (d.id === editingDept.id ? { ...d, ...editingDept } : d))
                    );
                    setFeedbackMsg(`Department "${editingDept.name}" updated successfully.`);
                    setDeptConfirmOpen(false);
                    setEditingDept(null);
                    setTimeout(() => setFeedbackMsg(null), 4000);
                  } catch (err: any) {
                    alert(err.message || 'Failed to update department');
                  } finally {
                    setIsSavingDept(false);
                  }
                }}
                disabled={isSavingDept}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition cursor-pointer flex items-center space-x-1.5"
              >
                {isSavingDept ? <span>Saving...</span> : <span>Confirm Update</span>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
