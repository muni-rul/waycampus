/**
 * sessionPersistenceService.ts — WayCampus Location & Session State Persistence Engine
 * Christ College (Autonomous), Irinjalakuda
 *
 * Preserves the user's current campus location, active route progression,
 * and camera orientation across browser refresh (F5, Ctrl+R, mobile browser pull-to-refresh).
 *
 * Architecture Invariants:
 * 1. SYNCHRONOUS INITIALIZATION: Restores state synchronously during React initialization
 *    so there is ZERO visible jump/flash from the entrance gate.
 * 2. EXPLICIT DEEP LINK PRIORITY: If explicit QR or deep-link parameters (?qr=, ?pano=, ?to=)
 *    are present in the URL, they take precedence over generic saved state.
 * 3. COMMITTED-ONLY PERSISTENCE: Panoramas are only saved as the current location once they
 *    are successfully loaded and rendered (using applyReadyTexture).
 * 4. GRACEFUL STALE-DATA DISCARD: If a saved panorama ID is invalid or deleted, it is safely
 *    discarded and safely falls back to the default entrance without crashing.
 * 5. CAMERA ORIENTATION PRESERVATION: Saves camera yaw, pitch, and FOV, clamped within safe limits.
 */

import { CAMPUS_GRAPH_MAP } from '../data/campusGraph';
import { SearchResult } from '../../../shared/types';
import { NavigationRoute, findNavigationRoute } from './campusPathfinder';

export type NavigationStatus = 'IDLE' | 'ROUTE_READY' | 'NAVIGATING' | 'ARRIVED' | 'ERROR';

export interface SavedCameraState {
  yaw: number;
  pitch: number;
  fov?: number;
}

export interface SavedSessionState {
  version: number;
  timestamp: number;
  currentPanoramaId: string;
  currentNodeId: string;
  activeFloorNumber?: number | 'ALL';
  selectedBuildingId?: string | null;
  userNodeId?: string;
  userLocationLabel?: string;
  // Route / Navigation state
  isNavigating?: boolean;
  navigationStatus?: NavigationStatus;
  activeNavigationRoute?: NavigationRoute | null;
  currentRouteIndex?: number;
  selectedDestination?: SearchResult | null;
  visitedNodeIds?: string[];
  // Camera state
  cameraState?: SavedCameraState;
  restoreStatus?: 'RESTORED' | 'FRESH_DEFAULT' | 'DEEP_LINK_OVERRIDE' | 'INVALID_FALLBACK';
}

const STORAGE_KEY_SESSION = 'waycampus_session_state_v1';
const STORAGE_KEY_LOCAL = 'waycampus_last_location_v1';

/**
 * Checks if the current URL contains explicit deep-link or QR parameters.
 * When true, explicit user intent takes priority over background saved session.
 */
export function hasExplicitDeepLink(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return Boolean(
      params.get('pano') ||
      params.get('node') ||
      params.get('qr') ||
      params.get('block') ||
      params.get('to') ||
      params.get('dest')
    );
  } catch {
    return false;
  }
}

/**
 * Validates that a panorama node ID exists in the authoritative campus graph.
 */
export function isValidPanoramaId(id?: string | null): boolean {
  if (!id || typeof id !== 'string') return false;
  return CAMPUS_GRAPH_MAP.has(id.trim());
}

/**
 * Reads and validates the persisted session state.
 * Returns null if no valid state exists, if explicit deep-links are present,
 * or if saved data is corrupt/stale.
 */
export function getRestoredSessionState(): SavedSessionState | null {
  if (typeof window === 'undefined') return null;

  // Explicit QR/deep-link parameter takes priority
  if (hasExplicitDeepLink()) {
    return null;
  }

  try {
    // 1. Check sessionStorage (tab-isolated, survives reload)
    let raw = sessionStorage.getItem(STORAGE_KEY_SESSION);
    if (!raw) {
      // 2. Check localStorage as secondary fallback
      raw = localStorage.getItem(STORAGE_KEY_LOCAL);
    }
    if (!raw) return null;

    const parsed: SavedSessionState = JSON.parse(raw);
    if (!parsed || !parsed.currentPanoramaId) return null;

    // Validate node existence in verified campus graph
    if (!isValidPanoramaId(parsed.currentPanoramaId)) {
      clearSessionState();
      return null;
    }

    // Clamp and sanitize camera state (min pitch 11° and max FOV 66° hides photographer head at nadir)
    if (parsed.cameraState) {
      const { yaw, pitch, fov } = parsed.cameraState;
      parsed.cameraState = {
        yaw: typeof yaw === 'number' && !isNaN(yaw) ? ((yaw % 360) + 360) % 360 : 0,
        pitch: typeof pitch === 'number' && !isNaN(pitch) ? Math.max(11, Math.min(72, pitch)) : 12,
        fov: typeof fov === 'number' && !isNaN(fov) ? Math.max(34, Math.min(66, fov)) : 62,
      };
    }

    // Recompute and synchronize active navigation route with current graph & pathfinder
    if (parsed.isNavigating && parsed.activeNavigationRoute) {
      try {
        const freshRoute = findNavigationRoute(
          parsed.activeNavigationRoute.startNodeId || 'outdoor_001',
          parsed.activeNavigationRoute.destinationNodeId || 'outdoor_203',
          parsed.activeNavigationRoute.destinationTitle || 'Destination'
        );
        if (freshRoute) {
          parsed.activeNavigationRoute = freshRoute;
          const mappedIdx = freshRoute.pathNodeIds.indexOf(parsed.currentPanoramaId);
          if (mappedIdx !== -1) {
            parsed.currentRouteIndex = mappedIdx;
          }
        }
      } catch (e) {
        console.warn('[WayCampus Persistence] Failed to refresh active route:', e);
      }
    }

    parsed.restoreStatus = 'RESTORED';
    return parsed;
  } catch (err) {
    console.warn('[WayCampus Persistence] Failed to read saved session state:', err);
    clearSessionState();
    return null;
  }
}

/**
 * Returns saved camera orientation for initial viewer restoration.
 */
export function getRestoredCameraState(): SavedCameraState | null {
  const session = getRestoredSessionState();
  return session?.cameraState || null;
}

/**
 * Persists the current committed navigation state to browser storage.
 * Only saves when currentPanoramaId is valid.
 */
export function saveSessionState(state: Partial<SavedSessionState>): void {
  if (typeof window === 'undefined') return;
  if (!state.currentPanoramaId || !isValidPanoramaId(state.currentPanoramaId)) return;

  try {
    // Merge with existing state where appropriate
    let existing: Partial<SavedSessionState> = {};
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY_SESSION) || localStorage.getItem(STORAGE_KEY_LOCAL);
      if (raw) existing = JSON.parse(raw) || {};
    } catch {}

    const payload: SavedSessionState = {
      version: 1,
      timestamp: Date.now(),
      currentPanoramaId: state.currentPanoramaId,
      currentNodeId: state.currentNodeId || state.currentPanoramaId,
      activeFloorNumber: state.activeFloorNumber !== undefined ? state.activeFloorNumber : existing.activeFloorNumber,
      selectedBuildingId: state.selectedBuildingId !== undefined ? state.selectedBuildingId : existing.selectedBuildingId,
      userNodeId: state.userNodeId || existing.userNodeId,
      userLocationLabel: state.userLocationLabel || existing.userLocationLabel,
      isNavigating: state.isNavigating !== undefined ? state.isNavigating : existing.isNavigating,
      navigationStatus: state.navigationStatus || existing.navigationStatus || 'IDLE',
      activeNavigationRoute: state.activeNavigationRoute !== undefined ? state.activeNavigationRoute : existing.activeNavigationRoute,
      currentRouteIndex: state.currentRouteIndex !== undefined ? state.currentRouteIndex : existing.currentRouteIndex,
      selectedDestination: state.selectedDestination !== undefined ? state.selectedDestination : existing.selectedDestination,
      visitedNodeIds: state.visitedNodeIds || existing.visitedNodeIds,
      cameraState: state.cameraState || existing.cameraState,
    };

    const str = JSON.stringify(payload);
    sessionStorage.setItem(STORAGE_KEY_SESSION, str);
    localStorage.setItem(STORAGE_KEY_LOCAL, str);
  } catch (err) {
    console.warn('[WayCampus Persistence] Failed to save session state:', err);
  }
}

/**
 * Fast camera-only orientation update (yaw, pitch, fov) without re-saving the entire route object.
 */
export function updatePersistedCameraState(yaw: number, pitch: number, fov?: number): void {
  if (typeof window === 'undefined') return;
  if (isNaN(yaw) || isNaN(pitch)) return;

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY_SESSION) || localStorage.getItem(STORAGE_KEY_LOCAL);
    if (!raw) return;
    const parsed: SavedSessionState = JSON.parse(raw);
    if (!parsed || !parsed.currentPanoramaId) return;

    parsed.cameraState = {
      yaw: ((yaw % 360) + 360) % 360,
      pitch: Math.max(11, Math.min(72, pitch)),
      fov: fov && !isNaN(fov) ? Math.max(34, Math.min(66, fov)) : 62,
    };

    const str = JSON.stringify(parsed);
    sessionStorage.setItem(STORAGE_KEY_SESSION, str);
    localStorage.setItem(STORAGE_KEY_LOCAL, str);
  } catch {}
}

/**
 * Clears saved session state (e.g. on invalid state or explicit reset).
 */
export function clearSessionState(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(STORAGE_KEY_SESSION);
    localStorage.removeItem(STORAGE_KEY_LOCAL);
  } catch {}
}
