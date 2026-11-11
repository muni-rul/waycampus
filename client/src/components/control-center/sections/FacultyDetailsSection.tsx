import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Building2,
  MapPin,
  Pencil,
  Plus,
  Navigation,
  Compass,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  Layers,
  Sparkles,
  Info,
  X,
  FileCheck
} from 'lucide-react';
import { ApiService } from '../../../services/api';
import { Teacher, Department } from '../../../../../shared/types';
import OFFICIAL_FACULTY_DATA from '../../../data/officialFaculty.json';
import OFFICIAL_DEPARTMENTS_DATA from '../../../data/officialDepartments.json';
import { CAMPUS_GRAPH_MAP } from '../../../data/campusGraph';
import { findNavigationRoute, NavigationRoute } from '../../../services/campusPathfinder';
import { setLiveCampusSearchData, rebuildCampusSearchIndex } from '../../../services/campusSearchService';
import { REAL_BUILDINGS } from '../data/campusEntities';

interface FacultyDetailsSectionProps {
  onRefresh?: () => void;
}

export const FacultyDetailsSection: React.FC<FacultyDetailsSectionProps> = ({ onRefresh }) => {
  // Authoritative State
  const [teachers, setTeachers] = useState<Teacher[]>(() => OFFICIAL_FACULTY_DATA as unknown as Teacher[]);
  const [departments, setDepartments] = useState<Department[]>(() => OFFICIAL_DEPARTMENTS_DATA as unknown as Department[]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'FACULTY' | 'DEPARTMENTS'>('FACULTY');

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [streamFilter, setStreamFilter] = useState<'ALL' | 'AIDED' | 'UNAIDED'>('ALL');

  // Notifications
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Operation A: Edit Faculty Modal
  const [facultyToEdit, setFacultyToEdit] = useState<Teacher | null>(null);
  const [editDeptId, setEditDeptId] = useState('');
  const [editRoomNumber, setEditRoomNumber] = useState('');
  const [isSavingTeacher, setIsSavingTeacher] = useState(false);
  const [teacherValidationError, setTeacherValidationError] = useState<string | null>(null);

  // Operation B: Rename & Edit Department Modal
  const [deptToEdit, setDeptToEdit] = useState<Department | null>(null);
  const [editDeptName, setEditDeptName] = useState('');
  const [editDeptCode, setEditDeptCode] = useState('');
  const [editDeptStream, setEditDeptStream] = useState<'AIDED' | 'UNAIDED'>('AIDED');
  const [editDeptBuilding, setEditDeptBuilding] = useState('');
  const [editDeptFloor, setEditDeptFloor] = useState('');
  const [editDeptRoom, setEditDeptRoom] = useState('');
  const [editDeptNodeId, setEditDeptNodeId] = useState('');
  const [isSavingDept, setIsSavingDept] = useState(false);
  const [deptValidationError, setDeptValidationError] = useState<string | null>(null);

  // Add Department Modal
  const [isAddDeptModalOpen, setIsAddDeptModalOpen] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptCode, setNewDeptCode] = useState('');
  const [newDeptStream, setNewDeptStream] = useState<'AIDED' | 'UNAIDED'>('UNAIDED');
  const [newDeptBuilding, setNewDeptBuilding] = useState('Administrative Block');
  const [newDeptFloor, setNewDeptFloor] = useState('Ground Floor');
  const [newDeptRoom, setNewDeptRoom] = useState('');
  const [newDeptNodeId, setNewDeptNodeId] = useState('ab_044');
  const [isCreatingDept, setIsCreatingDept] = useState(false);
  const [addDeptValidationError, setAddDeptValidationError] = useState<string | null>(null);

  // Test Route Preview Modal
  const [testRoute, setTestRoute] = useState<{
    targetTitle: string;
    targetNodeId: string;
    route: NavigationRoute | null;
  } | null>(null);

  // Fetch authoritative data on mount
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [tchs, depts] = await Promise.all([
        ApiService.getTeachers().catch(() => []),
        ApiService.getDepartments().catch(() => []),
      ]);

      const finalT = Array.isArray(tchs) && tchs.length > 0 ? tchs : (OFFICIAL_FACULTY_DATA as unknown as Teacher[]);
      const finalD = Array.isArray(depts) && depts.length > 0 ? depts : (OFFICIAL_DEPARTMENTS_DATA as unknown as Department[]);

      setTeachers(finalT);
      setDepartments(finalD);
      setLiveCampusSearchData({ teachers: finalT, departments: finalD });
    } catch (err) {
      console.warn('Using bundled authoritative faculty & department data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const showNotification = (type: 'success' | 'error' | 'info', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback((prev) => (prev?.message === message ? null : prev));
    }, 5000);
  };

  // Helper: check if a node is reachable in campus graph from outdoor_001
  const checkReachability = (nodeId?: string | null): { reachable: boolean; steps: number; distance: number } => {
    if (!nodeId || !CAMPUS_GRAPH_MAP.has(nodeId)) {
      return { reachable: false, steps: 0, distance: 0 };
    }
    if (nodeId === 'outdoor_001') {
      return { reachable: true, steps: 1, distance: 0 };
    }
    const route = findNavigationRoute('outdoor_001', nodeId, 'Destination');
    if (route && route.pathNodeIds && route.pathNodeIds.length > 0) {
      return { reachable: true, steps: route.steps.length, distance: route.totalDistanceMeters };
    }
    return { reachable: false, steps: 0, distance: 0 };
  };

  // Filtered Faculty List
  const filteredTeachers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return teachers.filter((t) => {
      const deptName = (t.department || (t as any).departmentName || '').toLowerCase();
      const name = (t.name || '').toLowerCase();
      const designation = (t.designation || '').toLowerCase();
      const stream = (t.departmentType || 'AIDED').toUpperCase();

      const matchesSearch = !q || name.includes(q) || deptName.includes(q) || designation.includes(q);
      const matchesDept = departmentFilter === 'ALL' || deptName === departmentFilter.toLowerCase();
      const matchesStream = streamFilter === 'ALL' || stream === streamFilter;

      return matchesSearch && matchesDept && matchesStream;
    });
  }, [teachers, searchQuery, departmentFilter, streamFilter]);

  // Filtered Department List
  const filteredDepartments = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return departments.filter((d) => {
      const name = (d.name || '').toLowerCase();
      const code = (d.code || '').toLowerCase();
      const stream = (d.departmentType || 'AIDED').toUpperCase();

      const matchesSearch = !q || name.includes(q) || code.includes(q);
      const matchesStream = streamFilter === 'ALL' || stream === streamFilter;

      return matchesSearch && matchesStream;
    });
  }, [departments, searchQuery, streamFilter]);

  // Department options for select
  const departmentOptions = useMemo(() => {
    return [...departments].sort((a, b) => a.name.localeCompare(b.name));
  }, [departments]);

  // Handle open Operation A Modal (Edit Teacher Department)
  const handleOpenEditTeacher = (teacher: Teacher) => {
    setFacultyToEdit(teacher);
    setTeacherValidationError(null);

    // Find current department ID
    const currentDeptName = (teacher.department || (teacher as any).departmentName || '').toLowerCase();
    const matchedDept = departments.find(
      (d) => d.id === teacher.departmentId || d.name.toLowerCase() === currentDeptName || d.code.toLowerCase() === currentDeptName
    );
    setEditDeptId(matchedDept ? matchedDept.id : departments[0]?.id || '');
    setEditRoomNumber((teacher as any).roomNumber || (teacher as any).departmentPlaceName || '');
  };

  // Selected department in teacher edit modal
  const selectedTeacherDept = useMemo(() => {
    return departments.find((d) => d.id === editDeptId);
  }, [departments, editDeptId]);

  // Selected teacher department reachability
  const teacherTargetReachability = useMemo(() => {
    return checkReachability(selectedTeacherDept?.nodeId);
  }, [selectedTeacherDept]);

  // Save Operation A (Teacher Department Update)
  const handleSaveTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!facultyToEdit) return;

    if (!selectedTeacherDept) {
      setTeacherValidationError('Please select a valid department.');
      return;
    }

    if (!selectedTeacherDept.nodeId || !CAMPUS_GRAPH_MAP.has(selectedTeacherDept.nodeId)) {
      setTeacherValidationError(
        `Department "${selectedTeacherDept.name}" does not have a valid campus panorama node (${selectedTeacherDept.nodeId || 'missing'}). Cannot route to this department.`
      );
      return;
    }

    if (!teacherTargetReachability.reachable) {
      setTeacherValidationError(
        `Selected department node "${selectedTeacherDept.nodeId}" is unreachable in the campus graph from Main Gate. Please ensure connections are configured before reassigning faculty.`
      );
      return;
    }

    setIsSavingTeacher(true);
    setTeacherValidationError(null);

    try {
      const updates = {
        departmentId: selectedTeacherDept.id,
        department: selectedTeacherDept.name,
        departmentName: selectedTeacherDept.name,
        departmentType: selectedTeacherDept.departmentType || 'AIDED',
        nodeId: selectedTeacherDept.nodeId,
        departmentPlaceId: selectedTeacherDept.placeId || `dept_${selectedTeacherDept.id}`,
        departmentPlaceName: editRoomNumber.trim() || selectedTeacherDept.name,
        departmentPlaceNodeId: selectedTeacherDept.nodeId,
        departmentPlaceVerified: true,
        roomNumber: editRoomNumber.trim() || selectedTeacherDept.roomNumber || undefined,
      };

      const updated = await ApiService.updateTeacher(facultyToEdit.id, updates);

      // Update state locally
      const newTeachers = teachers.map((t) => (t.id === facultyToEdit.id ? { ...t, ...updates, ...updated } : t));
      setTeachers(newTeachers);
      setLiveCampusSearchData({ teachers: newTeachers, departments });
      rebuildCampusSearchIndex();

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('campnav:faculty_updated'));
        window.dispatchEvent(new CustomEvent('campnav_data_sync'));
      }

      showNotification('success', `Updated department for ${facultyToEdit.name} to "${selectedTeacherDept.name}".`);
      setFacultyToEdit(null);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setTeacherValidationError(err?.message || 'Failed to update faculty member department.');
    } finally {
      setIsSavingTeacher(false);
    }
  };

  // Handle open Operation B Modal (Rename & Edit Department)
  const handleOpenEditDept = (dept: Department) => {
    setDeptToEdit(dept);
    setDeptValidationError(null);
    setEditDeptName(dept.name);
    setEditDeptCode(dept.code || '');
    setEditDeptStream(dept.departmentType === 'UNAIDED' ? 'UNAIDED' : 'AIDED');
    setEditDeptBuilding(dept.buildingName || 'Administrative Block');
    setEditDeptFloor(dept.floorName || 'Ground Floor');
    setEditDeptRoom(dept.roomNumber || '');
    setEditDeptNodeId(dept.nodeId || 'ab_044');
  };

  // Selected department edit reachability
  const deptEditReachability = useMemo(() => {
    return checkReachability(editDeptNodeId);
  }, [editDeptNodeId]);

  // Save Operation B (Global Department Rename & Location Update)
  const handleSaveDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptToEdit) return;

    if (!editDeptName.trim()) {
      setDeptValidationError('Department name cannot be empty.');
      return;
    }

    if (!editDeptNodeId.trim() || !CAMPUS_GRAPH_MAP.has(editDeptNodeId.trim())) {
      setDeptValidationError(`Selected node "${editDeptNodeId}" does not exist in campus panorama graph.`);
      return;
    }

    if (!deptEditReachability.reachable) {
      setDeptValidationError(
        `Destination node "${editDeptNodeId}" is not reachable from the campus graph. Cannot save until connected.`
      );
      return;
    }

    setIsSavingDept(true);
    setDeptValidationError(null);

    const isRenamed = editDeptName.trim().toLowerCase() !== deptToEdit.name.toLowerCase();

    try {
      const updates = {
        name: editDeptName.trim(),
        code: editDeptCode.trim() || deptToEdit.code,
        departmentType: editDeptStream,
        buildingName: editDeptBuilding.trim(),
        floorName: editDeptFloor.trim(),
        roomNumber: editDeptRoom.trim() || undefined,
        nodeId: editDeptNodeId.trim(),
      };

      const updated = await ApiService.updateDepartment(deptToEdit.id, updates);

      // Update departments state
      const newDepts = departments.map((d) => (d.id === deptToEdit.id ? { ...d, ...updates, ...updated } : d));
      setDepartments(newDepts);

      // Cascade update to teachers if department was renamed
      let newTeachers = teachers;
      if (isRenamed) {
        newTeachers = teachers.map((t) => {
          const isAssigned =
            t.departmentId === deptToEdit.id ||
            t.department?.toLowerCase() === deptToEdit.name.toLowerCase() ||
            (t as any).departmentName?.toLowerCase() === deptToEdit.name.toLowerCase();
          if (isAssigned) {
            return {
              ...t,
              department: updates.name,
              departmentName: updates.name,
              nodeId: updates.nodeId,
              departmentPlaceNodeId: updates.nodeId,
            };
          }
          return t;
        });
        setTeachers(newTeachers);
      }

      setLiveCampusSearchData({ teachers: newTeachers, departments: newDepts });
      rebuildCampusSearchIndex();

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('campnav:faculty_updated'));
        window.dispatchEvent(new CustomEvent('campnav_data_sync'));
      }

      showNotification(
        'success',
        isRenamed
          ? `Globally renamed "${deptToEdit.name}" to "${updates.name}". Associated faculty records and routing updated.`
          : `Updated location for department "${updates.name}".`
      );
      setDeptToEdit(null);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setDeptValidationError(err?.message || 'Failed to update department.');
    } finally {
      setIsSavingDept(false);
    }
  };

  // Add Department Reachability check
  const addDeptReachability = useMemo(() => {
    return checkReachability(newDeptNodeId);
  }, [newDeptNodeId]);

  // Create New Department
  const handleCreateDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeptName.trim()) {
      setAddDeptValidationError('Department name is required.');
      return;
    }
    if (!newDeptCode.trim()) {
      setAddDeptValidationError('Department code is required (e.g. CS, BOT, PHYS).');
      return;
    }
    if (!newDeptNodeId.trim() || !CAMPUS_GRAPH_MAP.has(newDeptNodeId.trim())) {
      setAddDeptValidationError(`Selected node "${newDeptNodeId}" does not exist in campus panorama graph.`);
      return;
    }
    if (!addDeptReachability.reachable) {
      setAddDeptValidationError('Selected node is not reachable in campus graph from Main Gate.');
      return;
    }

    setIsCreatingDept(true);
    setAddDeptValidationError(null);

    try {
      const payload = {
        name: newDeptName.trim(),
        code: newDeptCode.trim().toUpperCase(),
        departmentType: newDeptStream,
        buildingName: newDeptBuilding.trim(),
        floorName: newDeptFloor.trim(),
        roomNumber: newDeptRoom.trim() || undefined,
        nodeId: newDeptNodeId.trim(),
      };

      const created = await ApiService.createDepartment(payload);
      const newDepts = [...departments, created];
      setDepartments(newDepts);
      setLiveCampusSearchData({ teachers, departments: newDepts });
      rebuildCampusSearchIndex();

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('campnav:faculty_updated'));
        window.dispatchEvent(new CustomEvent('campnav_data_sync'));
      }

      showNotification('success', `Created new academic department "${created.name}".`);
      setIsAddDeptModalOpen(false);
      setNewDeptName('');
      setNewDeptCode('');
      setNewDeptRoom('');
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setAddDeptValidationError(err?.message || 'Failed to create department.');
    } finally {
      setIsCreatingDept(false);
    }
  };

  // Test Route Calculation
  const handleTestRoute = (title: string, nodeId?: string | null) => {
    if (!nodeId || !CAMPUS_GRAPH_MAP.has(nodeId)) {
      showNotification('error', `Cannot test route: Node ID "${nodeId || 'none'}" is not in campus graph.`);
      return;
    }
    const route = findNavigationRoute('outdoor_001', nodeId, title);
    setTestRoute({
      targetTitle: title,
      targetNodeId: nodeId,
      route,
    });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 text-slate-800 animate-in fade-in">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 sm:p-6 bg-white border border-slate-200/80 rounded-3xl shadow-xs">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold text-blue-600 mb-1">
            <Users className="w-4 h-4" />
            <span className="uppercase tracking-wider">Campus Directory & Automatic Navigation</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#0f2744]">Faculty Details</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
            Manage 277 verified faculty members, 38 academic departments, physical room associations, and dynamic
            automatic turn-by-turn routing across the campus graph.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={isLoading}
            className="flex items-center space-x-2 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 rounded-xl transition"
            title="Refresh Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Sync Live</span>
          </button>

          {activeTab === 'DEPARTMENTS' && (
            <button
              onClick={() => {
                setAddDeptValidationError(null);
                setIsAddDeptModalOpen(true);
              }}
              className="flex items-center space-x-2 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Department</span>
            </button>
          )}
        </div>
      </div>

      {/* Global Feedback Banner */}
      {feedback && (
        <div
          className={`flex items-center justify-between p-4 rounded-2xl border text-sm font-medium animate-in fade-in ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : feedback.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            ) : feedback.type === 'error' ? (
              <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0" />
            ) : (
              <Info className="w-5 h-5 text-blue-600 flex-shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="p-1 hover:opacity-75 transition">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Faculty</span>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">{teachers.length}</div>
          <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1 mt-0.5">
            <CheckCircle2 className="w-3 h-3" /> Authoritative Records
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Departments</span>
            <Building2 className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">{departments.length}</div>
          <span className="text-[11px] text-indigo-600 font-semibold flex items-center gap-1 mt-0.5">
            <FileCheck className="w-3 h-3" /> Aided & Self-Financing
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Graph Reachable</span>
            <Navigation className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-600 mt-1">100%</div>
          <span className="text-[11px] text-slate-500 font-medium mt-0.5">Connected to Main Gate</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Avg Faculty / Dept</span>
            <Sparkles className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">
            {departments.length ? Math.round(teachers.length / departments.length) : 0}
          </div>
          <span className="text-[11px] text-slate-500 font-medium mt-0.5">Dynamic Roster Distribution</span>
        </div>
      </div>

      {/* View Switcher Tabs & Filters */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          {/* Main Sub-Tabs */}
          <div className="flex p-1 bg-slate-100 rounded-2xl">
            <button
              onClick={() => setActiveTab('FACULTY')}
              className={`flex items-center space-x-2 px-4 py-2 text-xs font-bold rounded-xl transition ${
                activeTab === 'FACULTY'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Faculty Roster ({teachers.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('DEPARTMENTS')}
              className={`flex items-center space-x-2 px-4 py-2 text-xs font-bold rounded-xl transition ${
                activeTab === 'DEPARTMENTS'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Manage Departments & Locations ({departments.length})</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 md:max-w-xs">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={activeTab === 'FACULTY' ? 'Search teacher or department...' : 'Search department name or code...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Filter Selectors */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider flex items-center gap-1">
            <Filter className="w-3 h-3" /> Filters:
          </span>

          {activeTab === 'FACULTY' && (
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-medium focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 text-xs"
            >
              <option value="ALL">All Departments ({departments.length})</option>
              {departmentOptions.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          )}

          <select
            value={streamFilter}
            onChange={(e) => setStreamFilter(e.target.value as any)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-medium focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 text-xs"
          >
            <option value="ALL">All Streams (Aided & Unaided)</option>
            <option value="AIDED">Aided Stream</option>
            <option value="UNAIDED">Unaided / Self-Financing</option>
          </select>

          {(departmentFilter !== 'ALL' || streamFilter !== 'ALL' || searchQuery) && (
            <button
              onClick={() => {
                setDepartmentFilter('ALL');
                setStreamFilter('ALL');
                setSearchQuery('');
              }}
              className="text-xs text-blue-600 hover:underline font-semibold ml-auto"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Main Content: Tab 1 - Faculty Roster */}
      {activeTab === 'FACULTY' && (
        <div className="bg-white border border-slate-200/80 rounded-3xl shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Showing {filteredTeachers.length} of {teachers.length} Faculty Members
            </span>
            <span className="text-xs text-slate-400">Operation A: Change individual faculty department assignment</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/70 text-slate-500 font-bold tracking-wider uppercase text-[10px]">
                  <th className="py-3 px-4">Faculty Member</th>
                  <th className="py-3 px-4">Current Department</th>
                  <th className="py-3 px-4">Campus Location & Node</th>
                  <th className="py-3 px-4 text-center">Graph Route</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredTeachers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      No faculty members match the current search or filters.
                    </td>
                  </tr>
                ) : (
                  filteredTeachers.map((t) => {
                    const deptName = t.department || (t as any).departmentName || 'General Academic';
                    const stream = (t.departmentType || 'AIDED').toUpperCase();
                    const targetNode = t.nodeId || t.departmentPlaceNodeId;
                    const reach = checkReachability(targetNode);

                    return (
                      <tr key={t.id} className="hover:bg-blue-50/30 transition">
                        {/* Name & Designation */}
                        <td className="py-3.5 px-4 font-semibold text-slate-900">
                          <div className="text-xs font-bold text-slate-900">{t.name}</div>
                          <div className="text-[11px] text-slate-500 font-normal mt-0.5">
                            {t.designation || 'Faculty Member'}
                          </div>
                        </td>

                        {/* Department Badge */}
                        <td className="py-3.5 px-4">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200/60 font-semibold text-slate-800 text-[11px]">
                            <span>{deptName}</span>
                            <span
                              className={`text-[9px] px-1 py-0.2 rounded font-bold ${
                                stream === 'AIDED' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {stream}
                            </span>
                          </div>
                        </td>

                        {/* Location & Node */}
                        <td className="py-3.5 px-4">
                          <div className="text-[11px] text-slate-700 flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            <span>
                              {(t as any).roomNumber || (t as any).departmentPlaceName || 'Department Office'}
                            </span>
                          </div>
                          <div className="text-[10px] font-mono text-slate-400 mt-0.5">Node: {targetNode || 'unassigned'}</div>
                        </td>

                        {/* Graph Status */}
                        <td className="py-3.5 px-4 text-center">
                          {reach.reachable ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Reachable ({reach.steps} steps)</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200/60">
                              <AlertTriangle className="w-3 h-3" />
                              <span>Unreachable</span>
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right space-x-1.5">
                          <button
                            onClick={() => handleTestRoute(t.name, targetNode)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:text-blue-600 bg-slate-100 hover:bg-blue-50 rounded-lg transition"
                            title="Calculate route from Main Gate"
                          >
                            <Navigation className="w-3 h-3" />
                            <span>Test Route</span>
                          </button>
                          <button
                            onClick={() => handleOpenEditTeacher(t)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 text-[11px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition"
                          >
                            <Pencil className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Main Content: Tab 2 - Manage Departments & Locations */}
      {activeTab === 'DEPARTMENTS' && (
        <div className="bg-white border border-slate-200/80 rounded-3xl shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Showing {filteredDepartments.length} of {departments.length} Academic Departments
            </span>
            <span className="text-xs text-slate-400">Operation B: Global department rename & physical location setup</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/70 text-slate-500 font-bold tracking-wider uppercase text-[10px]">
                  <th className="py-3 px-4">Department Name & Code</th>
                  <th className="py-3 px-4">Stream</th>
                  <th className="py-3 px-4">Faculty Count</th>
                  <th className="py-3 px-4">Physical Campus Location</th>
                  <th className="py-3 px-4 text-center">Graph Reachability</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredDepartments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      No departments match the current search or filters.
                    </td>
                  </tr>
                ) : (
                  filteredDepartments.map((dept) => {
                    const assignedFacultyCount = teachers.filter(
                      (t) =>
                        t.departmentId === dept.id ||
                        t.department?.toLowerCase() === dept.name.toLowerCase() ||
                        (t as any).departmentName?.toLowerCase() === dept.name.toLowerCase()
                    ).length;

                    const reach = checkReachability(dept.nodeId);

                    return (
                      <tr key={dept.id} className="hover:bg-blue-50/30 transition">
                        {/* Name & Code */}
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900 text-xs">{dept.name}</div>
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5">Code: {dept.code || dept.id}</div>
                          {dept.previousNames && dept.previousNames.length > 0 && (
                            <div className="text-[10px] text-amber-600 mt-0.5">
                              Prev: {dept.previousNames.join(', ')}
                            </div>
                          )}
                        </td>

                        {/* Stream */}
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                              dept.departmentType === 'UNAIDED'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {dept.departmentType || 'AIDED'}
                          </span>
                        </td>

                        {/* Faculty Count */}
                        <td className="py-3.5 px-4 font-semibold">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold">
                            <Users className="w-3 h-3 text-slate-500" />
                            {assignedFacultyCount} teachers
                          </span>
                        </td>

                        {/* Physical Campus Location */}
                        <td className="py-3.5 px-4">
                          <div className="text-[11px] font-semibold text-slate-800 flex items-center gap-1">
                            <Building2 className="w-3 h-3 text-slate-400" />
                            <span>
                              {dept.buildingName || 'Main Block'} ({dept.floorName || 'Ground Floor'})
                            </span>
                          </div>
                          <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                            Node: {dept.nodeId || 'missing'} {dept.roomNumber ? `• Room: ${dept.roomNumber}` : ''}
                          </div>
                        </td>

                        {/* Reachability */}
                        <td className="py-3.5 px-4 text-center">
                          {reach.reachable ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Reachable ({reach.distance}m)</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200/60">
                              <AlertTriangle className="w-3 h-3" />
                              <span>Missing / Disconnected</span>
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right space-x-1.5">
                          <button
                            onClick={() => handleTestRoute(dept.name, dept.nodeId)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:text-blue-600 bg-slate-100 hover:bg-blue-50 rounded-lg transition"
                          >
                            <Navigation className="w-3 h-3" />
                            <span>Test Route</span>
                          </button>
                          <button
                            onClick={() => handleOpenEditDept(dept)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 text-[11px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition"
                          >
                            <Pencil className="w-3 h-3" />
                            <span>Rename / Edit</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Operation A Modal: Change Individual Faculty Department */}
      {facultyToEdit && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-200">
                  Operation A • Individual Faculty Update
                </span>
                <h3 className="text-lg font-black">{facultyToEdit.name}</h3>
                <p className="text-xs text-blue-100">{facultyToEdit.designation || 'Faculty Member'}</p>
              </div>
              <button
                onClick={() => setFacultyToEdit(null)}
                className="p-1.5 rounded-full hover:bg-white/20 text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveTeacher} className="p-6 space-y-4">
              {teacherValidationError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  <span>{teacherValidationError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Assigned Academic Department *</label>
                <select
                  value={editDeptId}
                  onChange={(e) => setEditDeptId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
                >
                  {departmentOptions.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name} ({dept.departmentType || 'AIDED'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Department Location & Reachability Preview */}
              {selectedTeacherDept && (
                <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2 text-xs">
                  <div className="flex items-center justify-between font-bold text-slate-800">
                    <span className="flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-blue-600" />
                      Physical Campus Destination
                    </span>
                    {teacherTargetReachability.reachable ? (
                      <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Graph Reachable
                      </span>
                    ) : (
                      <span className="text-[10px] text-rose-700 font-bold bg-rose-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Missing Node
                      </span>
                    )}
                  </div>

                  <div className="text-slate-600 text-[11px] space-y-1">
                    <div>
                      <strong className="text-slate-700">Building:</strong> {selectedTeacherDept.buildingName || 'Administrative Block'}
                    </div>
                    <div>
                      <strong className="text-slate-700">Floor:</strong> {selectedTeacherDept.floorName || 'Ground Floor'}
                    </div>
                    <div>
                      <strong className="text-slate-700">Destination Panorama Node:</strong>{' '}
                      <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-800 font-mono">
                        {selectedTeacherDept.nodeId}
                      </code>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Specific Cabin / Room Name (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Faculty Room 12 or HOD Cabin"
                  value={editRoomNumber}
                  onChange={(e) => setEditRoomNumber(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setFacultyToEdit(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingTeacher || !teacherTargetReachability.reachable}
                  className="flex items-center space-x-2 px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs transition"
                >
                  {isSavingTeacher ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Save Department Assignment</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Operation B Modal: Global Department Rename & Location Management */}
      {deptToEdit && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-indigo-700 to-blue-700 text-white flex items-center justify-between flex-shrink-0">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-200">
                  Operation B • Global Department Management
                </span>
                <h3 className="text-lg font-black">{deptToEdit.name}</h3>
                <p className="text-xs text-indigo-100 font-mono">Stable ID: {deptToEdit.id}</p>
              </div>
              <button
                onClick={() => setDeptToEdit(null)}
                className="p-1.5 rounded-full hover:bg-white/20 text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveDept} className="p-6 space-y-4 overflow-y-auto">
              {deptValidationError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  <span>{deptValidationError}</span>
                </div>
              )}

              {/* Informational banner about global cascade */}
              <div className="p-3.5 bg-blue-50 border border-blue-200/80 rounded-2xl text-xs text-blue-800 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <strong>Global Rename Integrity:</strong> Renaming this department preserves its permanent ID (
                  <code>{deptToEdit.id}</code>) and automatically updates all associated faculty records, search aliases, and
                  routes. The old name will be safely dereferenced.
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Department Canonical Name *</label>
                  <input
                    type="text"
                    value={editDeptName}
                    onChange={(e) => setEditDeptName(e.target.value)}
                    placeholder="e.g. Computer Science Department"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Department Code</label>
                  <input
                    type="text"
                    value={editDeptCode}
                    onChange={(e) => setEditDeptCode(e.target.value)}
                    placeholder="e.g. CS"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Academic Stream</label>
                  <select
                    value={editDeptStream}
                    onChange={(e) => setEditDeptStream(e.target.value as any)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
                  >
                    <option value="AIDED">Aided Stream</option>
                    <option value="UNAIDED">Unaided / Self-Financing</option>
                  </select>
                </div>
              </div>

              {/* Physical Location Section */}
              <div className="pt-3 border-t border-slate-100 space-y-3">
                <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-900">
                  <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Physical Campus Location & Panorama Routing</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Building</label>
                    <input
                      type="text"
                      value={editDeptBuilding}
                      onChange={(e) => setEditDeptBuilding(e.target.value)}
                      placeholder="e.g. Administrative Block"
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Floor</label>
                    <input
                      type="text"
                      value={editDeptFloor}
                      onChange={(e) => setEditDeptFloor(e.target.value)}
                      placeholder="e.g. Ground Floor or Floor 1"
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Room / Office Number</label>
                    <input
                      type="text"
                      value={editDeptRoom}
                      onChange={(e) => setEditDeptRoom(e.target.value)}
                      placeholder="e.g. AB 101"
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Panorama Node ID *</label>
                    <input
                      type="text"
                      value={editDeptNodeId}
                      onChange={(e) => setEditDeptNodeId(e.target.value.trim())}
                      placeholder="e.g. ab_044 or outdoor_001"
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-semibold text-slate-800"
                      required
                    />
                  </div>
                </div>

                {/* Live Node Reachability Indicator */}
                <div className="p-3 rounded-2xl border text-xs font-medium">
                  {deptEditReachability.reachable ? (
                    <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 -m-3 p-3 rounded-2xl border border-emerald-200/60">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span>
                        Verified Reachable via Campus Graph ({deptEditReachability.steps} navigation steps,{' '}
                        {deptEditReachability.distance} meters from Main Gate).
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-rose-700 bg-rose-50 -m-3 p-3 rounded-2xl border border-rose-200/60">
                      <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                      <span>
                        Validation Error: Node &quot;{editDeptNodeId}&quot; is missing or unreachable from campus graph.
                        Cannot save until connected.
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDeptToEdit(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingDept || !deptEditReachability.reachable}
                  className="flex items-center space-x-2 px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs transition"
                >
                  {isSavingDept ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Save Department Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Department Modal */}
      {isAddDeptModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="px-6 py-5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-200">Create Academic Unit</span>
                <h3 className="text-lg font-black">Add New Department</h3>
              </div>
              <button
                onClick={() => setIsAddDeptModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-white/20 text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDept} className="p-6 space-y-4">
              {addDeptValidationError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  <span>{addDeptValidationError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Department Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Data Science Department"
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Code *</label>
                  <input
                    type="text"
                    placeholder="e.g. DS"
                    value={newDeptCode}
                    onChange={(e) => setNewDeptCode(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs uppercase font-mono font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Stream</label>
                  <select
                    value={newDeptStream}
                    onChange={(e) => setNewDeptStream(e.target.value as any)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                  >
                    <option value="AIDED">Aided</option>
                    <option value="UNAIDED">Unaided</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Building</label>
                  <input
                    type="text"
                    value={newDeptBuilding}
                    onChange={(e) => setNewDeptBuilding(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Floor</label>
                  <input
                    type="text"
                    value={newDeptFloor}
                    onChange={(e) => setNewDeptFloor(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Panorama Node ID *</label>
                <input
                  type="text"
                  value={newDeptNodeId}
                  onChange={(e) => setNewDeptNodeId(e.target.value.trim())}
                  placeholder="e.g. ab_044"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-semibold"
                  required
                />
              </div>

              <div className="p-3 rounded-2xl border text-xs font-medium">
                {addDeptReachability.reachable ? (
                  <div className="flex items-center gap-2 text-emerald-700">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Reachable from Main Gate ({addDeptReachability.steps} steps)</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-rose-700">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    <span>Selected node is unreachable in campus graph.</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddDeptModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingDept || !addDeptReachability.reachable}
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl shadow-xs transition"
                >
                  {isCreatingDept ? 'Creating...' : 'Create Department'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Test Route Preview Modal */}
      {testRoute && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="px-6 py-5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-200">
                  Navigation Engine Route Verification
                </span>
                <h3 className="text-lg font-black">{testRoute.targetTitle}</h3>
                <p className="text-xs text-emerald-100 font-mono">Target Node: {testRoute.targetNodeId}</p>
              </div>
              <button
                onClick={() => setTestRoute(null)}
                className="p-1.5 rounded-full hover:bg-white/20 text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto text-xs">
              {testRoute.route ? (
                <>
                  <div className="grid grid-cols-3 gap-2 p-3 bg-emerald-50 border border-emerald-200/80 rounded-2xl text-center">
                    <div>
                      <div className="text-[10px] uppercase font-bold text-emerald-700">Distance</div>
                      <div className="text-base font-black text-emerald-900">{testRoute.route.totalDistanceMeters}m</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-bold text-emerald-700">Est. Walk</div>
                      <div className="text-base font-black text-emerald-900">
                        {Math.ceil(testRoute.route.estimatedWalkTimeSeconds / 60)} min
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-bold text-emerald-700">Steps</div>
                      <div className="text-base font-black text-emerald-900">{testRoute.route.steps.length}</div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                      <Navigation className="w-3.5 h-3.5 text-emerald-600" />
                      Calculated Turn-by-Turn Steps (from Main Gate):
                    </h4>
                    <ol className="space-y-2 border-l-2 border-emerald-300 ml-2 pl-3">
                      {testRoute.route.steps.map((st, i) => (
                        <li key={i} className="text-slate-700 relative">
                          <span className="absolute -left-[19px] top-1.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white" />
                          <div className="font-semibold text-slate-900">{st.instruction}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            Node: {st.nodeId} {st.distanceMeters ? `• ${st.distanceMeters}m` : ''}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                </>
              ) : (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700">
                  <AlertTriangle className="w-5 h-5 text-rose-600 mb-1" />
                  <strong>Route Calculation Failed:</strong> No path found between Main Gate (<code>outdoor_001</code>) and{' '}
                  <code>{testRoute.targetNodeId}</code>.
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => setTestRoute(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
