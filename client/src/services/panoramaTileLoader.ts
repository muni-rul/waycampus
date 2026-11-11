/**
 * panoramaTileLoader.ts
 * Google-Street-View-Style Multi-Resolution Panorama Tile Loader & Prioritizer
 *
 * Handles manifest retrieval, LOD 0-3 tile extraction, viewport-aware priority queues,
 * Three.js GPU texture management, Cache API storage, and fallback handling.
 */

import * as THREE from 'three';

export interface TileLevelMeta {
  level: number;
  width: number;
  height: number;
  columns: number;
  rows: number;
  tilePattern: string;
}

export interface PanoramaTileManifest {
  panoramaId: string;
  sourceFilename: string;
  version: string;
  projection: 'equirectangular';
  tileSize: number;
  sourceWidth: number;
  sourceHeight: number;
  preview: string;
  levels: TileLevelMeta[];
  generatedAt?: string;
}

export interface VisibleTileCoord {
  level: number;
  row: number;
  col: number;
  key: string;
  distFromCenter: number;
}

const CACHE_NAME = 'campnav-tiles-v1';
const MAX_TEXTURE_CACHE = 64; // Max GPU tile textures in memory

class PanoramaTileLoaderService {
  private manifestCache = new Map<string, PanoramaTileManifest | null>();
  private manifestPromises = new Map<string, Promise<PanoramaTileManifest | null>>();
  private tileTextureCache = new Map<string, THREE.Texture>();
  private inFlightTileLoads = new Map<string, Promise<THREE.Texture | null>>();
  private failedTileUrls = new Set<string>();

  /**
   * Helper to resolve asset URLs across Web and Capacitor Native
   */
  private resolveAssetUrl(path: string): string {
    const isNative =
      typeof window !== 'undefined' &&
      (Boolean((window as any).Capacitor?.isNativePlatform?.()) ||
        window.location.protocol === 'capacitor:' ||
        (window.location.hostname === 'localhost' && window.location.port === ''));

    const cleanPath = path.startsWith('/') ? path : '/' + path;
    if (isNative) {
      return `https://campnav-b3om.onrender.com${encodeURI(cleanPath)}`;
    }
    return cleanPath;
  }

  /**
   * Fetches the tile manifest for a panorama node
   */
  public async fetchManifest(panoramaId: string): Promise<PanoramaTileManifest | null> {
    if (this.manifestCache.has(panoramaId)) {
      return this.manifestCache.get(panoramaId)!;
    }

    if (this.manifestPromises.has(panoramaId)) {
      return this.manifestPromises.get(panoramaId)!;
    }

    const manifestUrl = this.resolveAssetUrl(`/panorama-tiles/${panoramaId}/manifest.json`);

    const promise = (async () => {
      try {
        const response = await fetch(manifestUrl, { cache: 'default' });
        if (!response.ok) {
          this.manifestCache.set(panoramaId, null);
          return null;
        }
        const contentType = response.headers.get('content-type');
        if (contentType && !contentType.includes('application/json')) {
          this.manifestCache.set(panoramaId, null);
          return null;
        }
        const data = (await response.json()) as PanoramaTileManifest;
        if (!data || !Array.isArray(data.levels) || data.panoramaId !== panoramaId) {
          this.manifestCache.set(panoramaId, null);
          return null;
        }
        this.manifestCache.set(panoramaId, data);
        return data;
      } catch (err) {
        this.manifestCache.set(panoramaId, null);
        return null;
      } finally {
        this.manifestPromises.delete(panoramaId);
      }
    })();

    this.manifestPromises.set(panoramaId, promise);
    return promise;
  }

  /**
   * Synchronously returns cached manifest if already fetched
   */
  public getCachedManifest(panoramaId: string): PanoramaTileManifest | null {
    return this.manifestCache.get(panoramaId) || null;
  }

  /**
   * Returns the URL of the continuous preview baseline image
   */
  public getPreviewUrl(panoramaId: string): string {
    return this.resolveAssetUrl(`/panorama-tiles/${panoramaId}/preview.jpg`);
  }

  /**
   * Returns the URL of a specific tile in the pyramid
   */
  public getTileUrl(panoramaId: string, level: number, row: number, col: number): string {
    return this.resolveAssetUrl(`/panorama-tiles/${panoramaId}/lod-${level}/tile_${row}_${col}.jpg`);
  }

  /**
   * Computes the visible tiles given current camera parameters.
   * Sorts visible tiles by distance from the center of the camera look-at vector.
   */
  public getVisibleTileCoords(
    manifest: PanoramaTileManifest,
    levelNum: number,
    cameraYawDeg: number,
    cameraPitchDeg: number,
    fovDeg: number = 75,
    aspect: number = 1.6
  ): VisibleTileCoord[] {
    const level = manifest.levels.find((l) => l.level === levelNum) || manifest.levels[manifest.levels.length - 1];
    if (!level) return [];

    const cols = level.columns;
    const rows = level.rows;

    const hFovDeg = fovDeg * aspect;
    const vFovDeg = fovDeg;

    // Margin around visible cone for predictive pre-streaming (widened to 45 deg for wide displays)
    const marginDeg = 45;
    const normYaw = ((cameraYawDeg % 360) + 360) % 360;

    const colSpanDeg = 360 / cols;
    const rowSpanDeg = 180 / rows;

    const coords: VisibleTileCoord[] = [];

    for (let r = 0; r < rows; r++) {
      // Row pitch center in degrees (-90 to +90)
      // row 0 is top (+90 to +45 in 4-row grid), row 3 is bottom (-45 to -90)
      const rowCenterPitch = 90 - (r + 0.5) * rowSpanDeg;
      const pitchDiff = Math.abs(cameraPitchDeg - rowCenterPitch);

      if (pitchDiff > vFovDeg / 2 + marginDeg + rowSpanDeg / 2) {
        continue; // Vertical frustum cull
      }

      for (let c = 0; c < cols; c++) {
        // Col yaw center in degrees (0 to 360)
        const colCenterYaw = (c + 0.5) * colSpanDeg;
        const yawDiff = Math.abs(((normYaw - colCenterYaw + 540) % 360) - 180);

        if (yawDiff > hFovDeg / 2 + marginDeg + colSpanDeg / 2) {
          continue; // Horizontal frustum cull
        }

        const distFromCenter = Math.hypot(yawDiff, pitchDiff);
        coords.push({
          level: levelNum,
          row: r,
          col: c,
          key: `${manifest.panoramaId}_l${levelNum}_${r}_${c}`,
          distFromCenter,
        });
      }
    }

    // Sort closest to center first for immediate visual sharpness in line of sight
    coords.sort((a, b) => a.distFromCenter - b.distFromCenter);
    return coords;
  }

  /**
   * Loads a tile texture into GPU memory with deduplication and LRU caching
   */
  public async loadTileTexture(
    panoramaId: string,
    level: number,
    row: number,
    col: number
  ): Promise<THREE.Texture | null> {
    const key = `${panoramaId}_l${level}_${row}_${col}`;
    if (this.tileTextureCache.has(key)) {
      const cached = this.tileTextureCache.get(key)!;
      // LRU refresh
      this.tileTextureCache.delete(key);
      this.tileTextureCache.set(key, cached);
      return cached;
    }

    const tileUrl = this.getTileUrl(panoramaId, level, row, col);
    if (this.failedTileUrls.has(tileUrl)) {
      return null;
    }

    if (this.inFlightTileLoads.has(key)) {
      return this.inFlightTileLoads.get(key)!;
    }

    const promise = new Promise<THREE.Texture | null>((resolve) => {
      const loader = new THREE.TextureLoader();
      if (!tileUrl.startsWith('data:') && !tileUrl.startsWith('blob:')) {
        loader.crossOrigin = 'anonymous';
      }

      loader.load(
        tileUrl,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.generateMipmaps = false; // Fast upload without mipmap compute
          texture.anisotropy = 16;

          // Evict oldest texture if limit reached
          while (this.tileTextureCache.size >= MAX_TEXTURE_CACHE) {
            const oldestKey = this.tileTextureCache.keys().next().value;
            if (oldestKey) {
              const oldTex = this.tileTextureCache.get(oldestKey);
              if (oldTex) oldTex.dispose();
              this.tileTextureCache.delete(oldestKey);
            } else {
              break;
            }
          }

          this.tileTextureCache.set(key, texture);
          this.inFlightTileLoads.delete(key);
          resolve(texture);
        },
        undefined,
        () => {
          this.failedTileUrls.add(tileUrl);
          this.inFlightTileLoads.delete(key);
          resolve(null);
        }
      );
    });

    this.inFlightTileLoads.set(key, promise);
    return promise;
  }

  /**
   * Preloads the preview and manifest for upcoming navigation target
   */
  public async preloadTargetPreview(targetId: string): Promise<boolean> {
    try {
      const manifest = await this.fetchManifest(targetId);
      if (!manifest) return false;

      const previewUrl = this.getPreviewUrl(targetId);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = previewUrl;
      await img.decode();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Cleans up textures when disposing viewer
   */
  public clearUnusedTextures(activePanoramaId: string): void {
    const keysToRemove: string[] = [];
    for (const [key, texture] of this.tileTextureCache.entries()) {
      if (!key.startsWith(activePanoramaId)) {
        keysToRemove.push(key);
        texture.dispose();
      }
    }
    keysToRemove.forEach((k) => this.tileTextureCache.delete(k));
  }
}

export const PanoramaTileLoader = new PanoramaTileLoaderService();
