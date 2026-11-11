/**
 * panoramaResourceManager.ts — Centralized Panorama Resource & Texture Manager
 * WayCampus / CampusNav — Christ College (Autonomous) Irinjalakuda
 *
 * Implements "Next Panorama Ready" Architecture:
 * - Guarantees the user is NEVER transitioned into an unready/blank panorama.
 * - Validates images with actual browser decode (img.decode()).
 * - Deduplicates concurrent network requests via shared Promises.
 * - Preloads active route steps (current + next 2 steps) and outgoing junction targets.
 * - Provides reactive subscription so UI navigation arrows only activate when target is READY.
 */

import * as THREE from 'three';
import { CAMPUS_GRAPH_MAP } from '../data/campusGraph';
import { PanoramaTileLoader } from './panoramaTileLoader';

export type PanoramaLoadingState = 'NOT_REQUESTED' | 'LOADING' | 'READY' | 'FAILED' | 'STALE';

export type PanoramaStateListener = (state: PanoramaLoadingState, panoId: string) => void;

class PanoramaResourceManagerService {
  private static instance: PanoramaResourceManagerService | null = null;

  // Runtime texture cache (in GPU/WebGL memory)
  private textureCache = new Map<string, THREE.Texture>();

  // In-flight download/decode promises (prevents duplicate network requests)
  private inFlightRequests = new Map<string, Promise<THREE.Texture | null>>();

  // Status map tracking each panorama's readiness state
  private statusMap = new Map<string, PanoramaLoadingState>();

  // Subscribers listening for panorama readiness state updates
  private subscribers = new Map<string, Set<PanoramaStateListener>>();
  private globalSubscribers = new Set<PanoramaStateListener>();

  // Retry tracking
  private retryCounts = new Map<string, number>();

  public static getInstance(): PanoramaResourceManagerService {
    if (!PanoramaResourceManagerService.instance) {
      PanoramaResourceManagerService.instance = new PanoramaResourceManagerService();
    }
    return PanoramaResourceManagerService.instance;
  }

  // ─────────────────────────────────────────────────────────────
  // 1. URL Resolution & Path Helpers
  // ─────────────────────────────────────────────────────────────
  public resolvePanoramaUrl(panoId: string, rawImageUrl?: string): string {
    let path = rawImageUrl;
    if (!path) {
      const node = CAMPUS_GRAPH_MAP.get(panoId);
      path = node?.imagePath || `/assets/panoramas/01_OUTDOOR/PANO_20260829_103545_1.jpg`;
    }

    if (path.startsWith('data:') || path.startsWith('blob:')) {
      return path;
    }

    const cleanPath = path.startsWith('/') ? path : '/' + path;

    const isNative =
      typeof window !== 'undefined' &&
      (Boolean((window as any).Capacitor?.isNativePlatform?.()) ||
        window.location.protocol === 'capacitor:' ||
        (window.location.hostname === 'localhost' && window.location.port === ''));

    if (!cleanPath.startsWith('http://') && !cleanPath.startsWith('https://')) {
      return isNative
        ? `https://campnav-b3om.onrender.com${encodeURI(cleanPath)}`
        : encodeURI(cleanPath);
    }

    return encodeURI(cleanPath);
  }

  // ─────────────────────────────────────────────────────────────
  // 2. State & Cache Accessors
  // ─────────────────────────────────────────────────────────────
  public getLoadingState(panoId: string): PanoramaLoadingState {
    return this.statusMap.get(panoId) || 'NOT_REQUESTED';
  }

  public isPanoramaReady(panoId: string): boolean {
    return this.statusMap.get(panoId) === 'READY' && this.textureCache.has(panoId);
  }

  public getCachedTexture(panoId: string): THREE.Texture | null {
    const tex = this.textureCache.get(panoId);
    if (tex) {
      // LRU touch
      this.textureCache.delete(panoId);
      this.textureCache.set(panoId, tex);
      return tex;
    }
    return null;
  }

  // ─────────────────────────────────────────────────────────────
  // 3. Subscription Mechanism for Reactive UI
  // ─────────────────────────────────────────────────────────────
  public subscribe(panoId: string, listener: PanoramaStateListener): () => void {
    if (!this.subscribers.has(panoId)) {
      this.subscribers.set(panoId, new Set());
    }
    this.subscribers.get(panoId)!.add(listener);

    // Immediately notify with current state
    listener(this.getLoadingState(panoId), panoId);

    return () => {
      const set = this.subscribers.get(panoId);
      if (set) {
        set.delete(listener);
        if (set.size === 0) this.subscribers.delete(panoId);
      }
    };
  }

  public subscribeAll(listener: PanoramaStateListener): () => void {
    this.globalSubscribers.add(listener);
    return () => {
      this.globalSubscribers.delete(listener);
    };
  }

  private notify(panoId: string, state: PanoramaLoadingState) {
    this.statusMap.set(panoId, state);

    const panoSubs = this.subscribers.get(panoId);
    if (panoSubs) {
      panoSubs.forEach((cb) => {
        try {
          cb(state, panoId);
        } catch (e) {
          console.warn('[PanoramaResourceManager] Error in subscriber callback:', e);
        }
      });
    }

    this.globalSubscribers.forEach((cb) => {
      try {
        cb(state, panoId);
      } catch (e) {
        console.warn('[PanoramaResourceManager] Error in global subscriber callback:', e);
      }
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 4. Core Preloader with Hardware Decode Validation
  // ─────────────────────────────────────────────────────────────
  public async preloadPanorama(panoId: string, rawUrl?: string, priority = false): Promise<boolean> {
    if (!panoId) return false;

    // 1. Fast path: Already decoded and verified in runtime cache
    if (this.isPanoramaReady(panoId)) {
      return true;
    }

    // 2. Fast path: Request is already in-flight — share Promise to prevent duplicate network traffic
    if (this.inFlightRequests.has(panoId)) {
      const tex = await this.inFlightRequests.get(panoId);
      return Boolean(tex);
    }

    // 3. Initiate deduplicated load promise
    this.notify(panoId, 'LOADING');

    let targetUrl: string;
    try {
      const manifest = await PanoramaTileLoader.fetchManifest(panoId);
      targetUrl = manifest
        ? PanoramaTileLoader.getPreviewUrl(panoId)
        : this.resolvePanoramaUrl(panoId, rawUrl);
    } catch {
      targetUrl = this.resolvePanoramaUrl(panoId, rawUrl);
    }

    const requestPromise = this.executeLoadWithVerification(panoId, targetUrl);
    this.inFlightRequests.set(panoId, requestPromise);

    try {
      const texture = await requestPromise;
      if (texture) {
        // Enforce max texture cache (LRU disposal of oldest textures)
        const MAX_TEXTURES = 25;
        while (this.textureCache.size >= MAX_TEXTURES) {
          const oldestKey = this.textureCache.keys().next().value;
          if (oldestKey && oldestKey !== panoId) {
            const oldTex = this.textureCache.get(oldestKey);
            if (oldTex) oldTex.dispose();
            this.textureCache.delete(oldestKey);
          } else {
            break;
          }
        }

        this.textureCache.set(panoId, texture);
        this.notify(panoId, 'READY');
        this.retryCounts.delete(panoId);
        return true;
      } else {
        this.handleFailure(panoId, targetUrl);
        return false;
      }
    } catch (err) {
      console.warn(`[PanoramaResourceManager] Failed loading panorama ${panoId}:`, err);
      this.handleFailure(panoId, targetUrl);
      return false;
    } finally {
      this.inFlightRequests.delete(panoId);
    }
  }

  private async executeLoadWithVerification(panoId: string, targetUrl: string): Promise<THREE.Texture | null> {
    // A. Check local CacheStorage first for 0ms instant loading
    if (typeof window !== 'undefined' && 'caches' in window && !targetUrl.startsWith('data:') && !targetUrl.startsWith('blob:')) {
      try {
        const rawPath = targetUrl.startsWith('http') ? new URL(targetUrl).pathname : targetUrl;
        const cachedResponse = (await caches.match(rawPath)) || (await caches.match(decodeURI(rawPath)));
        if (cachedResponse && cachedResponse.ok) {
          const blob = await cachedResponse.blob();
          const objUrl = URL.createObjectURL(blob);
          const tex = await this.decodeAndCreateTexture(objUrl, true);
          if (tex) return tex;
        }
      } catch (cacheErr) {
        console.warn(`[PanoramaResourceManager] Cache check skipped for ${panoId}:`, cacheErr);
      }
    }

    // B. Network Load with Image.decode() verification
    return await this.decodeAndCreateTexture(targetUrl, false);
  }

  /**
   * Verifies that the image is not only fetched via HTTP 200,
   * but is mathematically DECODED by the browser rendering engine.
   */
  private decodeAndCreateTexture(url: string, revokeAfter = false): Promise<THREE.Texture | null> {
    return new Promise((resolve) => {
      const img = new Image();
      if (!url.startsWith('data:') && !url.startsWith('blob:')) {
        img.crossOrigin = 'anonymous';
      }

      const cleanup = () => {
        img.onload = null;
        img.onerror = null;
        if (revokeAfter && url.startsWith('blob:')) {
          try { URL.revokeObjectURL(url); } catch {}
        }
      };

      const handleSuccess = async () => {
        try {
          // Browser native hardware decode verification
          if ('decode' in img) {
            await img.decode();
          }

          const texture = new THREE.Texture(img);
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.generateMipmaps = false;
          texture.needsUpdate = true;

          cleanup();
          resolve(texture);
        } catch (e) {
          console.warn('[PanoramaResourceManager] Image decode failed:', e);
          cleanup();
          resolve(null);
        }
      };

      img.onload = handleSuccess;
      img.onerror = () => {
        cleanup();
        resolve(null);
      };

      img.src = url;
    });
  }

  private handleFailure(panoId: string, url: string) {
    const currentRetries = this.retryCounts.get(panoId) || 0;
    const MAX_RETRIES = 2;

    if (currentRetries < MAX_RETRIES) {
      this.retryCounts.set(panoId, currentRetries + 1);
      const delay = (currentRetries + 1) * 1200;
      setTimeout(() => {
        this.preloadPanorama(panoId, url, true);
      }, delay);
    } else {
      this.notify(panoId, 'FAILED');
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 5. Intelligent Route & Junction Prefetching
  // ─────────────────────────────────────────────────────────────
  /**
   * Prefetches the active route sequence:
   * 1. Current panorama (Priority 1)
   * 2. Next immediate destination panorama (Priority 2)
   * 3. Next 2 panoramas along route (Priority 3)
   */
  public preloadRoute(pathNodeIds: string[], currentIdx = 0): void {
    if (!pathNodeIds || pathNodeIds.length === 0) return;

    // Step 1: Current node (must be ready)
    const currentId = pathNodeIds[currentIdx];
    if (currentId) {
      this.preloadPanorama(currentId, undefined, true);
    }

    // Step 2: Next immediate node (must be preloaded before arrow becomes active)
    const nextId = pathNodeIds[currentIdx + 1];
    if (nextId) {
      this.preloadPanorama(nextId, undefined, true);
    }

    // Step 3: Next 2 nodes along path (preload quietly)
    for (let i = currentIdx + 2; i <= currentIdx + 3 && i < pathNodeIds.length; i++) {
      const futureId = pathNodeIds[i];
      if (futureId) {
        setTimeout(() => {
          this.preloadPanorama(futureId, undefined, false);
        }, (i - currentIdx) * 300);
      }
    }
  }

  /**
   * Prefetches all immediately available outgoing connections at a junction.
   */
  public preloadJunction(currentNodeId: string): void {
    const node = CAMPUS_GRAPH_MAP.get(currentNodeId);
    if (!node || !node.connections) return;

    node.connections.forEach((conn, index) => {
      if (conn.targetId) {
        setTimeout(() => {
          this.preloadPanorama(conn.targetId, undefined, false);
        }, index * 250);
      }
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 6. Invalidation & Cache Management
  // ─────────────────────────────────────────────────────────────
  public invalidatePanorama(panoId: string): void {
    const tex = this.textureCache.get(panoId);
    if (tex) {
      tex.dispose();
      this.textureCache.delete(panoId);
    }
    this.inFlightRequests.delete(panoId);
    this.notify(panoId, 'STALE');
  }

  public clearRuntimeCache(): void {
    this.textureCache.forEach((tex) => tex.dispose());
    this.textureCache.clear();
    this.inFlightRequests.clear();
    this.statusMap.clear();
  }
}

export const PanoramaResourceManager = PanoramaResourceManagerService.getInstance();
