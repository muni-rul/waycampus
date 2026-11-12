/**
 * GitSyncService — Cloud REST API Persistence for CampusNav
 * 
 * Provides automated commit-and-push of `campusnav_db.json` to an isolated,
 * SEPARATE data repository (GITHUB_DATA_REPO) using the GitHub REST API.
 * 
 * Security Guard: Refuses to sync if GITHUB_DATA_REPO is identical to the application code repository.
 */

import fs from 'fs';

export interface GitSyncResult {
  success: boolean;
  message: string;
  commitSha?: string;
  url?: string;
}

class GitSyncService {
  private syncTimer: NodeJS.Timeout | null = null;
  private isSyncing = false;
  private lastSyncTime: string | null = null;
  private lastSyncSuccess: boolean | null = null;
  private lastSyncMessage: string | null = null;
  private lastCommitSha: string | null = null;

  // Fail-Safe Sync Guards
  private lastKnownRemoteSha: string | null = null;
  private lastKnownRemoteAccountCount: number = 0;
  private syncPaused: boolean = false;
  private syncPauseReason: string | null = null;
  private onMergeConflict: ((remoteJson: string) => Promise<void> | void) | null = null;

  public getToken(): string | null {
    return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null;
  }

  public getDataRepo(): string | null {
    // Expected format: "owner/repo", e.g. "muni-rul/campnav-live-data"
    return process.env.GITHUB_DATA_REPO?.trim() || null;
  }

  public getCodeRepo(): string {
    return (process.env.GITHUB_REPO || 'muni-rul/CampNav').trim();
  }

  public getDataBranch(): string {
    return process.env.GITHUB_DATA_BRANCH?.trim() || 'main';
  }

  public getDataPath(): string {
    return process.env.GITHUB_DATA_PATH?.trim() || 'server/data/campusnav_db.json';
  }

  public isConfigured(): boolean {
    const token = this.getToken();
    const dataRepo = this.getDataRepo();
    const codeRepo = this.getCodeRepo();

    if (!token || !dataRepo) {
      return false;
    }

    if (codeRepo && dataRepo.toLowerCase() === codeRepo.toLowerCase()) {
      console.warn(
        `[GitSync Security Guard] Refusing cloud sync: GITHUB_DATA_REPO (${dataRepo}) matches the application code repository. Live runtime data must not be written to the code repository. Falling back to local disk persistence.`
      );
      return false;
    }

    return true;
  }

  public setMergeHandler(handler: (remoteJson: string) => Promise<void> | void): void {
    this.onMergeConflict = handler;
  }

  public setLastKnownRemoteState(sha: string | null, accountCount: number): void {
    this.lastKnownRemoteSha = sha;
    this.lastKnownRemoteAccountCount = accountCount;
  }

  public getLastKnownRemoteAccountCount(): number {
    return this.lastKnownRemoteAccountCount;
  }

  public getLastKnownRemoteSha(): string | null {
    return this.lastKnownRemoteSha;
  }

  public isSyncPaused(): boolean {
    return this.syncPaused;
  }

  public setSyncPaused(paused: boolean, reason?: string): void {
    this.syncPaused = paused;
    this.syncPauseReason = reason || null;
  }

  public async syncFile(
    localFilePath: string,
    remotePath?: string,
    commitMessage: string = 'chore(db): auto-sync campus database [skip ci] [skip deploy]',
    options?: { allowAccountRemoval?: boolean }
  ): Promise<GitSyncResult> {
    if (!this.isConfigured()) {
      console.warn(
        '[Persistence] GITHUB_DATA_REPO/GITHUB_TOKEN not set: data is stored on local disk only and WILL BE LOST on restart/redeploy.'
      );
      this.lastSyncSuccess = false;
      this.lastSyncMessage = 'GitHub Data Sync not configured or GITHUB_DATA_REPO equals code repository. Using local disk persistence.';
      return {
        success: false,
        message: 'GitHub Data Sync not configured or GITHUB_DATA_REPO equals code repository. Using local disk persistence.',
      };
    }

    // Guard 1: If initial remote fetch failed on startup, pause all outgoing syncs to protect remote data
    if (this.syncPaused) {
      const msg = `Cloud sync paused to protect remote data: initial remote fetch failed (${this.syncPauseReason}). Waiting for successful remote restore.`;
      console.warn(`[CloudSync Guard] ${msg}`);
      this.lastSyncSuccess = false;
      this.lastSyncMessage = msg;
      return { success: false, message: msg };
    }

    const token = this.getToken()!;
    const repo = this.getDataRepo()!;
    const branch = this.getDataBranch();
    const targetPath = remotePath || this.getDataPath();

    if (!fs.existsSync(localFilePath)) {
      this.lastSyncSuccess = false;
      this.lastSyncMessage = `Local file ${localFilePath} does not exist to sync.`;
      return {
        success: false,
        message: `Local file ${localFilePath} does not exist to sync.`,
      };
    }

    // Guard 2: Never push a state that reduces faculty accounts compared with last known remote state
    let localAccountCount = 0;
    try {
      const raw = fs.readFileSync(localFilePath, 'utf-8');
      const parsed = JSON.parse(raw);
      localAccountCount = Array.isArray(parsed.facultyAccounts) ? parsed.facultyAccounts.length : 0;
    } catch {
      return {
        success: false,
        message: 'Could not parse local database file to verify account integrity before push.',
      };
    }

    if (!options?.allowAccountRemoval && localAccountCount < this.lastKnownRemoteAccountCount) {
      const msg = `Refusing cloud sync: local state has fewer faculty accounts (${localAccountCount}) than last known remote state (${this.lastKnownRemoteAccountCount}). Account protection engaged.`;
      console.warn(`[CloudSync Guard] ${msg}`);
      this.lastSyncSuccess = false;
      this.lastSyncMessage = msg;
      return { success: false, message: msg };
    }

    if (this.isSyncing) {
      return {
        success: false,
        message: 'A GitHub synchronization is already in progress.',
      };
    }

    this.isSyncing = true;
    try {
      const fileContent = fs.readFileSync(localFilePath);
      const fileSizeMb = fileContent.length / (1024 * 1024);
      if (fileSizeMb >= 50) {
        console.warn(
          `[CloudSync Warning] Database file size (${fileSizeMb.toFixed(2)} MB) is approaching GitHub limit (100 MB). Consider pruning snapshots.`
        );
      }
      const base64Content = fileContent.toString('base64');

      const apiUrl = `https://api.github.com/repos/${repo}/contents/${targetPath}?ref=${branch}`;
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'CampusNav-Server-Sync/1.0',
      };

      // Guard 3: Use the verified lastKnownRemoteSha for optimistic concurrency (stale writers get HTTP 409)
      const putBody: any = {
        message: commitMessage,
        content: base64Content,
        branch,
      };
      if (this.lastKnownRemoteSha) {
        putBody.sha = this.lastKnownRemoteSha;
      }

      let putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${targetPath}`, {
        method: 'PUT',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(putBody),
        signal: AbortSignal.timeout(30000),
      });

      // Handle 409 Conflict: Remote was updated by another writer since our last fetch
      if (putRes.status === 409) {
        console.warn('[CloudSync] HTTP 409 Conflict: remote repository has newer changes. Merging remote state and retrying once...');
        const remoteRes = await this.fetchLatestRemoteDatabase(targetPath);
        if (remoteRes.content) {
          if (this.onMergeConflict) {
            await this.onMergeConflict(remoteRes.content);
          }
          // Re-read merged file and re-encode
          const mergedContent = fs.readFileSync(localFilePath);
          putBody.content = mergedContent.toString('base64');
          if (this.lastKnownRemoteSha) {
            putBody.sha = this.lastKnownRemoteSha;
          }

          putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${targetPath}`, {
            method: 'PUT',
            headers: {
              ...headers,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(putBody),
            signal: AbortSignal.timeout(30000),
          });
        }
      }

      if (!putRes.ok) {
        const errJson = (await putRes.json().catch(() => ({}))) as any;
        const msg = errJson.message || `HTTP ${putRes.status} ${putRes.statusText}`;
        console.error('[GitSync] GitHub commit failed:', msg);
        this.lastSyncTime = new Date().toISOString();
        this.lastSyncSuccess = false;
        this.lastSyncMessage = `GitHub commit failed: ${msg}`;
        return {
          success: false,
          message: `GitHub commit failed: ${msg}`,
        };
      }

      const resData = (await putRes.json()) as any;
      const commitSha = resData?.commit?.sha || resData?.content?.sha || '';
      const htmlUrl = resData?.commit?.html_url || '';

      console.log(`[GitSync] Successfully synced database to external data repository (${repo} @ ${branch}): ${commitSha.slice(0, 7)}`);
      this.lastKnownRemoteSha = commitSha;
      this.lastKnownRemoteAccountCount = localAccountCount;
      this.lastSyncTime = new Date().toISOString();
      this.lastSyncSuccess = true;
      this.lastSyncMessage = `Successfully synced database to data repository ${repo} (${branch})`;
      this.lastCommitSha = commitSha;
      return {
        success: true,
        message: `Successfully synced database to data repository ${repo} (${branch})`,
        commitSha,
        url: htmlUrl,
      };
    } catch (err: any) {
      console.error('[GitSync] Error during GitHub sync:', err.message);
      this.lastSyncTime = new Date().toISOString();
      this.lastSyncSuccess = false;
      this.lastSyncMessage = err.message || 'GitHub sync error';
      return {
        success: false,
        message: err.message || 'GitHub sync error',
      };
    } finally {
      this.isSyncing = false;
    }
  }

  public scheduleDebouncedSync(
    localFilePath: string,
    delayMs: number = 5000,
    options?: { allowAccountRemoval?: boolean }
  ): void {
    if (!this.isConfigured()) return;

    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }

    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      this.syncFile(localFilePath, undefined, undefined, options).catch((e) => {
        console.warn('[GitSync] Debounced sync background error:', e?.message);
      });
    }, delayMs);
  }

  public async fetchLatestRemoteDatabase(
    remotePath?: string
  ): Promise<{ content: string | null; status: number }> {
    if (!this.isConfigured()) {
      return { content: null, status: 0 };
    }

    const token = this.getToken()!;
    const repo = this.getDataRepo()!;
    const branch = this.getDataBranch();
    const targetPath = remotePath || this.getDataPath();

    try {
      const apiUrl = `https://api.github.com/repos/${repo}/contents/${targetPath}?ref=${branch}`;
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'CampusNav-Server-Sync/1.0',
      };

      const res = await fetch(apiUrl, { headers, signal: AbortSignal.timeout(30000) });

      if (res.status === 404) {
        console.log('[CloudSync] No remote data (404): starting from seed');
        this.lastKnownRemoteSha = null;
        this.lastKnownRemoteAccountCount = 0;
        this.syncPaused = false;
        this.syncPauseReason = null;
        this.lastSyncTime = new Date().toISOString();
        this.lastSyncSuccess = true;
        this.lastSyncMessage = 'No remote data file found on GitHub (404); ready to initialize seed';
        return { content: null, status: 404 };
      }

      if (!res.ok) {
        const statusMsg = `HTTP ${res.status}`;
        console.warn(`[CloudSync] Remote fetch failed: ${statusMsg}; sync paused to protect data`);
        this.syncPaused = true;
        this.syncPauseReason = statusMsg;
        this.lastSyncTime = new Date().toISOString();
        this.lastSyncSuccess = false;
        this.lastSyncMessage = `Could not fetch remote database from GitHub (${statusMsg})`;
        return { content: null, status: res.status };
      }

      const data = (await res.json()) as any;
      if (!data || typeof data !== 'object') {
        console.warn('[CloudSync] Remote fetch returned invalid metadata; sync paused to protect data');
        this.syncPaused = true;
        this.syncPauseReason = 'Invalid metadata response';
        return { content: null, status: 500 };
      }

      const fileSizeBytes = typeof data.size === 'number' ? data.size : 0;
      if (fileSizeBytes === 0 && (!data.content || data.content.length === 0)) {
        console.warn('[CloudSync] Remote file is empty (size 0); sync paused to protect data');
        this.syncPaused = true;
        this.syncPauseReason = 'Empty remote file (size 0)';
        this.lastSyncTime = new Date().toISOString();
        this.lastSyncSuccess = false;
        this.lastSyncMessage = 'Remote file on GitHub has size 0';
        return { content: null, status: 200 };
      }

      let decoded: string | null = null;
      let effectiveSize = fileSizeBytes;

      // 1. Small files (<= 1 MB): GitHub returns inline base64 in data.content
      if (typeof data.content === 'string' && data.content.trim().length > 0 && data.encoding === 'base64') {
        decoded = Buffer.from(data.content, 'base64').toString('utf-8');
      }

      // 2. Large files (1 MB to 100 MB, encoding "none" or empty content):
      // Primary: Git Blobs API (GET /repos/{owner}/{repo}/git/blobs/{sha})
      if (!decoded && data.sha) {
        try {
          const blobUrl = `https://api.github.com/repos/${repo}/git/blobs/${data.sha}`;
          const blobRes = await fetch(blobUrl, {
            headers,
            signal: AbortSignal.timeout(30000),
          });
          if (blobRes.ok) {
            const blobData = (await blobRes.json()) as any;
            if (blobData && typeof blobData.content === 'string' && blobData.encoding === 'base64') {
              decoded = Buffer.from(blobData.content, 'base64').toString('utf-8');
              if (blobData.size) effectiveSize = blobData.size;
            }
          }
        } catch (blobErr: any) {
          console.warn('[CloudSync] Git Blobs API download failed, attempting raw contents fallback:', blobErr?.message);
        }

        // Fallback: Contents API with Accept: application/vnd.github.raw+json or application/vnd.github.v3.raw
        if (!decoded) {
          try {
            const rawHeaders = {
              ...headers,
              Accept: 'application/vnd.github.raw+json, application/vnd.github.v3.raw',
            };
            const rawRes = await fetch(apiUrl, {
              headers: rawHeaders,
              signal: AbortSignal.timeout(30000),
            });
            if (rawRes.ok) {
              decoded = await rawRes.text();
            }
          } catch (rawErr: any) {
            console.warn('[CloudSync] Raw contents download fallback failed:', rawErr?.message);
          }
        }
      }

      if (!decoded || decoded.trim().length === 0) {
        console.warn('[CloudSync] Remote fetch returned empty content; sync paused to protect data');
        this.syncPaused = true;
        this.syncPauseReason = 'Empty payload or failed large file download';
        this.lastSyncTime = new Date().toISOString();
        this.lastSyncSuccess = false;
        this.lastSyncMessage = 'Could not retrieve file content from GitHub';
        return { content: null, status: 200 };
      }

      // Validate JSON structure
      let parsed: any;
      try {
        parsed = JSON.parse(decoded);
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.buildings)) {
          throw new Error('Database payload missing required fields (e.g. buildings array)');
        }
      } catch (parseErr: any) {
        console.warn(`[CloudSync] Remote file is not valid JSON (${parseErr.message}); sync paused to protect data`);
        this.syncPaused = true;
        this.syncPauseReason = `Invalid JSON: ${parseErr.message}`;
        this.lastSyncTime = new Date().toISOString();
        this.lastSyncSuccess = false;
        this.lastSyncMessage = `Invalid JSON from GitHub: ${parseErr.message}`;
        return { content: null, status: 200 };
      }

      const accCount = Array.isArray(parsed.facultyAccounts) ? parsed.facultyAccounts.length : 0;
      const tchCount = Array.isArray(parsed.teachers) ? parsed.teachers.length : 0;
      const sizeMb = (effectiveSize / (1024 * 1024)).toFixed(2);

      this.lastKnownRemoteSha = data.sha || null;
      this.lastKnownRemoteAccountCount = accCount;
      this.syncPaused = false;
      this.syncPauseReason = null;

      console.log(`[CloudSync] Restored ${accCount} faculty accounts, ${tchCount} teachers from data repo (size ${sizeMb} MB)`);

      this.lastSyncTime = new Date().toISOString();
      this.lastSyncSuccess = true;
      this.lastSyncMessage = `Database restored from data repository ${repo} (${branch}) on startup`;
      return { content: decoded, status: 200 };
    } catch (err: any) {
      const errMsg = err?.message || 'Network error';
      console.warn(`[CloudSync] Remote fetch failed: ${errMsg}; sync paused to protect data`);
      this.syncPaused = true;
      this.syncPauseReason = errMsg;
      this.lastSyncTime = new Date().toISOString();
      this.lastSyncSuccess = false;
      this.lastSyncMessage = `Error fetching remote database: ${errMsg}`;
      return { content: null, status: 500 };
    }
  }

  public getStatus() {
    return {
      configured: this.isConfigured(),
      dataRepo: this.getDataRepo(),
      branch: this.getDataBranch(),
      lastSyncTime: this.lastSyncTime,
      lastSyncSuccess: this.lastSyncSuccess,
      lastSyncMessage:
        this.lastSyncMessage ||
        (this.isConfigured()
          ? 'Ready. Auto-sync triggers on account changes.'
          : 'GITHUB_DATA_REPO / GITHUB_TOKEN not configured on this server'),
      lastCommitSha: this.lastCommitSha,
      isSyncing: this.isSyncing,
    };
  }
}

export const gitSyncService = new GitSyncService();
