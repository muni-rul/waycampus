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
import { PanoramasSection } from './sections/PanoramasSection';
import { PublishSection } from './sections/PublishSection';

import {
  REAL_BUILDINGS,
  REAL_DEPARTMENTS,
  REAL_ROOMS,
  REAL_TEACHERS,
  getAllCombinedPlaceTags,
} from './data/campusEntities';

import { PanoramaRouteDebugger } from '../debug/PanoramaRouteDebugger';
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
  const [is3DViewportOpen, setIs3DViewportOpen] = useState(false);
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
    };
  });

  // Section Badges
  const [badges] = useState<Partial<Record<ControlCenterSectionId, number | string>>>({});

  // Load live counts
  useEffect(() => {
    const loadOverviewData = async () => {
      try {
        const places = await ApiService.getPlaces().catch(() => []);
        const combinedTags = getAllCombinedPlaceTags();
        const placeCount = Array.isArray(places) && places.length > combinedTags.length ? places.length : combinedTags.length;

        setStats((prev) => ({
          ...prev,
          panoramas: (panoramas && panoramas.length > 0) ? panoramas.length : CAMPUS_GRAPH.length,
          tags: placeCount,
          faculty: REAL_TEACHERS.length,
          departments: REAL_DEPARTMENTS.length,
          rooms: REAL_ROOMS.length,
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
    setIs3DViewportOpen(true);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#f0f4f9] text-slate-800 flex flex-col font-sans select-none overflow-hidden animate-in fade-in duration-150">
      {/* Topbar */}
      <ControlCenterTopbar
        currentUser={currentUser}
        unsavedCount={hasUnsavedChanges ? 1 : 0}
        is3DViewportOpen={is3DViewportOpen}
        onToggle3DViewport={() => setIs3DViewportOpen(!is3DViewportOpen)}
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
        </main>

        {/* Floating / Docked 3D Studio & Street View Viewport (Disabled when in Edit Connections) */}
        {is3DViewportOpen && activeSection !== 'panoramas' && activePanorama && (
          <div className="w-[480px] xl:w-[600px] border-l border-slate-200 bg-white flex flex-col shadow-2xl relative z-30 animate-in slide-in-from-right duration-200">
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs font-bold text-slate-900">
                <Eye className="w-4 h-4 text-[#1a56db]" />
                <span>3D Viewport: Node #{activePanorama.id}</span>
              </div>
              <button
                onClick={() => setIs3DViewportOpen(false)}
                className="p-1 hover:bg-slate-200 text-slate-400 hover:text-slate-700 rounded-lg transition"
                title="Close 3D Viewport"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 relative overflow-hidden">
              <PanoramaRouteDebugger
                currentPanorama={activePanorama}
                onSelectPanorama={(id) => onSelectPanorama(id)}
                onClose={() => setIs3DViewportOpen(false)}
                cameraYaw={cameraYaw}
                cameraPitch={cameraPitch}
                onSetCameraOrientation={(yaw, pitch) => {
                  if (onSetCameraOrientation) {
                    onSetCameraOrientation(yaw, pitch ?? 0);
                  }
                }}
              />
            </div>
          </div>
        )}
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
