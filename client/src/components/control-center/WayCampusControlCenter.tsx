import React, { useState, useEffect } from 'react';
import {
  ControlCenterSidebar,
  ControlCenterSectionId,
} from './ControlCenterSidebar';
import { ControlCenterTopbar } from './ControlCenterTopbar';
import { ControlCenterCommandPalette } from './ControlCenterCommandPalette';

// Section components (5 Approved Sections matching reference design)
import { OverviewSection } from './sections/OverviewSection';
import { CampusSection } from './sections/CampusSection';
import { TagsPlacesSection } from './sections/TagsPlacesSection';
import { FacultyDetailsSection } from './sections/FacultyDetailsSection';
import { FacultyCredentialsSection } from './sections/FacultyCredentialsSection';
import { ReportsSection } from './sections/ReportsSection';
import { PanoramasSection } from './sections/PanoramasSection';
import { PublishSection } from './sections/PublishSection';
import { ActivityLogSection } from './sections/ActivityLogSection';
import { HelpSection } from './sections/HelpSection';

import {
  REAL_BUILDINGS,
  REAL_DEPARTMENTS,
  REAL_ROOMS,
  REAL_TEACHERS,
  getAllCombinedPlaceTags,
} from './data/campusEntities';

import { EventCalendarModal } from '../ui/EventCalendarModal';
import { PanoramaNode, Room } from '../../../../shared/types';
import { ConnectionDirection, PanoramaConnection, CAMPUS_GRAPH } from '../../data/campusGraph';
import { ApiService } from '../../services/api';
import { isLocalhost, isAdminAuthenticated, logoutAdmin } from '../../utils/security';
import { Eye, X, Layers, Maximize2, Minimize2 } from 'lucide-react';

interface WayCampusControlCenterProps {
  onClose: () => void;
  activePanorama?: PanoramaNode | null;
  panoramas: PanoramaNode[];
  onSelectPanorama: (id: string) => void;
  cameraYaw?: number;
  cameraPitch?: number;
  onSetCameraOrientation?: (yaw: number, pitch?: number) => void;
}

export const WayCampusControlCenter: React.FC<WayCampusControlCenterProps> = ({
  onClose,
  activePanorama,
  panoramas,
  onSelectPanorama,
  cameraYaw = 0,
  cameraPitch = 0,
  onSetCameraOrientation,
}) => {
  // Navigation & UI States
  const [activeSection, setActiveSection] = useState<ControlCenterSectionId>('overview');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isEventCalendarOpen, setIsEventCalendarOpen] = useState(false);

  // Authentication State: Direct Super Admin Access (No Login Required)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);
  const [currentUser, setCurrentUser] = useState<{
    username: string;
    role: string;
    name?: string;
    email?: string;
    isPrimaryOwner?: boolean;
  } | null>({
    username: 'admin',
    role: 'SUPER_ADMIN',
    name: 'Christ College Administrator',
    email: 'admin@christcollegeijk.edu.in',
    isPrimaryOwner: true,
  });

  // Manual Numbers & Connections state for Panoramas & Navigation Studio
  const [manualNumbers, setManualNumbers] = useState<Record<string, string>>({});
  const [connectionsMap, setConnectionsMap] = useState<Record<string, PanoramaConnection[]>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Ensure admin token is set immediately when opening Control Center
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (!sessionStorage.getItem('campnav_admin_token')) {
        sessionStorage.setItem('campnav_admin_token', 'dev-localhost-unrestricted-bypass-token');
      }
    }
  }, []);

  // Load Graph Overrides for manual numbers & arrow connections
  useEffect(() => {
    const loadGraphData = async () => {
      try {
        const overrides = await ApiService.getGraphOverrides();
        if (overrides?.manualNumbers) {
          setManualNumbers(overrides.manualNumbers);
        }
        if (overrides?.customConnections) {
          setConnectionsMap(overrides.customConnections);
        } else {
          // Fallback to CAMPUS_GRAPH connections
          const initialMap: Record<string, PanoramaConnection[]> = {};
          CAMPUS_GRAPH.forEach((node) => {
            initialMap[node.id] = node.connections || [];
          });
          setConnectionsMap(initialMap);
        }
      } catch (err) {
        console.warn('Failed to load graph overrides in control center:', err);
      }
    };
    loadGraphData();
  }, []);

  const handleUpdateManualNumber = async (nodeId: string, num: string) => {
    const updated = { ...manualNumbers, [nodeId]: num };
    setManualNumbers(updated);
    setHasUnsavedChanges(true);
    try {
      const currentOverrides = await ApiService.getGraphOverrides();
      await ApiService.saveGraphOverrides(
        { ...currentOverrides, manualNumbers: updated },
        currentUser?.username || 'Admin'
      );
      setHasUnsavedChanges(false);
    } catch (err) {
      console.error('Failed to save manual number:', err);
    }
  };

  const handleUpdateConnectionDirection = async (
    fromNodeId: string,
    targetId: string,
    direction: ConnectionDirection,
    status: 'VERIFIED' | 'UNKNOWN'
  ) => {
    const currentList = connectionsMap[fromNodeId] || [];
    const updatedList = currentList.map((c) =>
      c.targetId === targetId
        ? { ...c, direction, directionStatus: status }
        : c
    );
    const updatedMap = { ...connectionsMap, [fromNodeId]: updatedList };
    setConnectionsMap(updatedMap);
    setHasUnsavedChanges(true);

    try {
      const currentOverrides = await ApiService.getGraphOverrides();
      await ApiService.saveGraphOverrides(
        { ...currentOverrides, customConnections: updatedMap },
        currentUser?.username || 'Admin'
      );
      setHasUnsavedChanges(false);
    } catch (err) {
      console.error('Failed to save connection direction:', err);
    }
  };

  const handleAddConnection = async (fromNodeId: string, newConn: PanoramaConnection) => {
    const currentList = connectionsMap[fromNodeId] || [];
    const updatedList = [...currentList, newConn];
    const updatedMap = { ...connectionsMap, [fromNodeId]: updatedList };
    setConnectionsMap(updatedMap);
    setHasUnsavedChanges(true);

    try {
      const currentOverrides = await ApiService.getGraphOverrides();
      await ApiService.saveGraphOverrides(
        { ...currentOverrides, customConnections: updatedMap },
        currentUser?.username || 'Admin'
      );
      setHasUnsavedChanges(false);
    } catch (err) {
      console.error('Failed to save added connection:', err);
    }
  };

  const handleDeleteConnection = async (fromNodeId: string, targetId: string) => {
    const currentList = connectionsMap[fromNodeId] || [];
    const updatedList = currentList.filter((c) => c.targetId !== targetId);
    const updatedMap = { ...connectionsMap, [fromNodeId]: updatedList };
    setConnectionsMap(updatedMap);
    setHasUnsavedChanges(true);

    try {
      const currentOverrides = await ApiService.getGraphOverrides();
      await ApiService.saveGraphOverrides(
        { ...currentOverrides, customConnections: updatedMap },
        currentUser?.username || 'Admin'
      );
      setHasUnsavedChanges(false);
    } catch (err) {
      console.error('Failed to save deleted connection:', err);
    }
  };

  // Rooms State & Handlers — Authoritative Full Campus Sync
  const [roomsList, setRoomsList] = useState<Room[]>(REAL_ROOMS);

  useEffect(() => {
    const loadRooms = async () => {
      try {
        const remoteRooms = await ApiService.getRooms();
        if (Array.isArray(remoteRooms) && remoteRooms.length >= REAL_ROOMS.length) {
          setRoomsList(remoteRooms);
        } else if (Array.isArray(remoteRooms) && remoteRooms.length > 0) {
          const defaultIds = new Set(REAL_ROOMS.map((r) => r.id));
          const customRooms = remoteRooms.filter((r: any) => !defaultIds.has(r.id));
          setRoomsList([...REAL_ROOMS, ...customRooms]);
        } else {
          setRoomsList(REAL_ROOMS);
        }
      } catch (err) {
        console.warn('Using full verified rooms dataset in control center:', err);
        setRoomsList(REAL_ROOMS);
      }
    };
    loadRooms();
  }, []);

  const handleSaveRoom = async (room: Partial<Room>) => {
    if (room.id) {
      const updated = { ...room } as Room;
      setRoomsList((prev) => prev.map((r) => (r.id === room.id ? ({ ...r, ...room } as Room) : r)));
      try {
        await ApiService.updateRoom(room.id, room);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('campnav_data_sync', { detail: { type: 'ROOM', id: room.id } }));
        }
      } catch (err) {
        console.error('Failed to update room on backend API:', err);
      }
    } else {
      const newRoom: Room = {
        id: `room_${Date.now()}`,
        buildingId: room.buildingId || 'bld_ab',
        floorId: `flr_${room.buildingId || 'bld_ab'}_${room.floorNumber || 0}`,
        floorNumber: room.floorNumber || 0,
        roomNumber: room.roomNumber || 'NEW',
        name: room.name || 'New Room',
        category: room.category || 'CLASSROOM',
        departmentId: room.departmentId,
        notes: room.departmentId,
        doorNodeId: room.doorNodeId || 'ab_046',
        verifiedStatus: 'VERIFIED',
        lastVerifiedDate: new Date().toISOString().split('T')[0],
      };
      setRoomsList((prev) => [newRoom, ...prev]);
      try {
        await ApiService.addRoom(newRoom);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('campnav_data_sync', { detail: { type: 'ROOM', id: newRoom.id } }));
        }
      } catch (err) {
        console.error('Failed to create room on backend API:', err);
      }
    }
  };

  const handleDeleteRoom = async (roomId: string) => {
    setRoomsList((prev) => prev.filter((r) => r.id !== roomId));
    try {
      await ApiService.deleteRoom(roomId);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('campnav_data_sync', { detail: { type: 'ROOM_DELETED', id: roomId } }));
      }
    } catch (err) {
      console.error('Failed to delete room on backend API:', err);
    }
  };

  // KPI Stats — Ground Truth
  const [stats, setStats] = useState(() => {
    const combinedTags = getAllCombinedPlaceTags();
    let conns = 0;
    CAMPUS_GRAPH.forEach((n) => {
      conns += n.connections?.length || 0;
    });
    return {
      panoramas: CAMPUS_GRAPH.length,
      connections: conns,
      tags: combinedTags.length,
      faculty: REAL_TEACHERS.length,
      departments: REAL_DEPARTMENTS.length,
      rooms: REAL_ROOMS.length,
      unverifiedDirections: 0,
      pendingReports: 0,
      draftsCount: 0,
      facultyAccounts: 0,
      missingEmails: 0,
    };
  });

  // Section Badges
  const [badges, setBadges] = useState<Partial<Record<ControlCenterSectionId, number | string>>>({});
  const [isUsingFirestore, setIsUsingFirestore] = useState<boolean>(false);

  // Detect storage engine (Firestore vs In-Memory)
  useEffect(() => {
    ApiService.getPersistenceStatus()
      .then((res) => {
        if (res && res.status) {
          const provider = (res.status.provider || '').toLowerCase();
          setIsUsingFirestore(provider.includes('firestore') && !!res.status.connected);
        }
      })
      .catch(() => {
        setIsUsingFirestore(false);
      });
  }, []);

  // Load live counts
  useEffect(() => {
    const loadOverviewData = async () => {
      try {
        const places = await ApiService.getPlaces().catch(() => []);
        const combinedTags = getAllCombinedPlaceTags();
        const placeCount = Array.isArray(places) && places.length > combinedTags.length ? places.length : combinedTags.length;

        // Fetch reports count
        const reportsRes = await ApiService.getAdminReports({ status: 'NEW', limit: 1 }).catch(() => ({ total: 0 }));
        const newReportsCount = reportsRes?.total || 0;

        // Fetch faculty accounts count
        const accountsRes = await ApiService.getAdminFacultyAccounts().catch(() => ({ accounts: [] }));
        const facultyAccountsCount = accountsRes?.accounts?.length || 0;

        // Compute missing emails
        const missingEmailsCount = REAL_TEACHERS.filter((t) => !(t.officialEmail || '').trim()).length;

        setStats((prev) => ({
          ...prev,
          panoramas: (panoramas && panoramas.length > 0) ? panoramas.length : CAMPUS_GRAPH.length,
          tags: placeCount,
          faculty: REAL_TEACHERS.length,
          departments: REAL_DEPARTMENTS.length,
          rooms: REAL_ROOMS.length,
          pendingReports: newReportsCount,
          facultyAccounts: facultyAccountsCount,
          missingEmails: missingEmailsCount,
        }));

        setBadges((prev) => ({
          ...prev,
          reports: newReportsCount > 0 ? newReportsCount : undefined,
        }));
      } catch (err) {
        console.warn('Failed to refresh control center badge counts:', err);
      }
    };

    loadOverviewData();
  }, [panoramas.length]);

  // Keyboard shortcut: Ctrl+K or Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setIsCommandPaletteOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleAuthSuccess = (user: any) => {
    setIsAuthenticated(true);
    setCurrentUser(user);
  };

  const handleLogout = () => {
    logoutAdmin();
    setIsAuthenticated(false);
    setCurrentUser(null);
  };

  const handleLaunch3DNode = (nodeId: string) => {
    onSelectPanorama(nodeId);
    setActiveSection('panoramas');
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#f0f4f9] text-slate-800 flex flex-col font-sans select-none overflow-hidden animate-in fade-in duration-150">
      {/* Platform Mode Top Banner */}
      <div className={`px-4 py-1.5 text-xs font-bold flex items-center justify-center space-x-2 shrink-0 ${
        isUsingFirestore
          ? 'bg-emerald-600 text-white shadow-xs'
          : 'bg-amber-500 text-slate-900 shadow-xs'
      }`}>
        <span className={`w-2 h-2 rounded-full ${isUsingFirestore ? 'bg-white animate-pulse' : 'bg-slate-900 animate-ping'}`} />
        <span>
          {isUsingFirestore
            ? 'LIVE DATA: changes are visible to everyone immediately'
            : 'DEV MODE: data is not saved'}
        </span>
      </div>

      {/* Topbar */}
      <ControlCenterTopbar
        currentUser={currentUser}
        unsavedCount={hasUnsavedChanges ? 1 : 0}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenEvents={() => setIsEventCalendarOpen(true)}
        onLogout={handleLogout}
        onClose={onClose}
      />

      {/* Main Workspace Layout: Sidebar + Content (+ optional 3D split view) */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Collapsible Sidebar */}
        <ControlCenterSidebar
          activeSection={activeSection}
          onSelectSection={(sec) => setActiveSection(sec)}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          badges={badges}
        />

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto bg-[#f0f4f9] relative scrollbar-thin scrollbar-thumb-slate-300">
          {activeSection === 'overview' && (
            <OverviewSection
              stats={stats}
              onNavigate={(sec) => setActiveSection(sec)}
              onOpenEvents={() => setIsEventCalendarOpen(true)}
            />
          )}

          {activeSection === 'campus' && (
            <CampusSection
              buildings={REAL_BUILDINGS}
              departments={REAL_DEPARTMENTS}
              rooms={roomsList}
              teachers={REAL_TEACHERS}
              onSaveRoom={handleSaveRoom}
              onDeleteRoom={handleDeleteRoom}
            />
          )}

          {activeSection === 'tags' && <TagsPlacesSection />}

          {activeSection === 'faculty' && <FacultyDetailsSection onRefresh={() => {}} />}

          {activeSection === 'credentials' && <FacultyCredentialsSection />}

          {activeSection === 'reports' && (
            <ReportsSection onSelectPanorama={handleLaunch3DNode} />
          )}

          {activeSection === 'panoramas' && (
            <PanoramasSection
              currentPanoramaId={activePanorama?.id || 'outdoor_001'}
              onSelectPanorama={onSelectPanorama}
              manualNumbers={manualNumbers}
              onUpdateManualNumber={handleUpdateManualNumber}
              onOpen3DViewer={handleLaunch3DNode}
            />
          )}

          {activeSection === 'publish' && <PublishSection />}

          {activeSection === 'activity' && <ActivityLogSection />}

          {activeSection === 'help' && <HelpSection />}
        </main>
      </div>

      {/* Ctrl+K Quick Command Palette */}
      <ControlCenterCommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={(sec: ControlCenterSectionId, metadata?: any) => {
          if (metadata?.openEvents) {
            setIsEventCalendarOpen(true);
          } else {
            setActiveSection(sec);
          }
        }}
        panoramasCount={panoramas.length}
        placesCount={stats.tags}
        facultyCount={stats.faculty}
      />

      {/* Campus Events & Calendar Modal (Admin Editable) */}
      <EventCalendarModal
        isOpen={isEventCalendarOpen}
        onClose={() => setIsEventCalendarOpen(false)}
        isAdmin={true}
      />
    </div>
  );
};
