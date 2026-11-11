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

  public async syncFile(
    localFilePath: string,
    remotePath?: string,
    commitMessage: string = 'chore(db): auto-sync campus database [skip ci] [skip deploy]'
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

    if (this.isSyncing) {
      return {
        success: false,
        message: 'A GitHub synchronization is already in progress.',
      };
    }

    this.isSyncing = true;
    try {
      const fileContent = fs.readFileSync(localFilePath);
      const base64Content = fileContent.toString('base64');

      const apiUrl = `https://api.github.com/repos/${repo}/contents/${targetPath}?ref=${branch}`;
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'CampusNav-Server-Sync/1.0',
      };

      // 1. Get existing file SHA if present
      let existingSha: string | undefined;
      try {
        const getRes = await fetch(apiUrl, { headers, signal: AbortSignal.timeout(10000) });
        if (getRes.ok) {
          const getData = (await getRes.json()) as any;
          existingSha = getData.sha;
        }
      } catch (getErr: any) {
        console.warn('[GitSync] Could not inspect existing file SHA:', getErr.message);
      }

      // 2. Commit file via PUT
      const putBody: any = {
        message: commitMessage,
        content: base64Content,
        branch,
      };
      if (existingSha) {
        putBody.sha = existingSha;
      }

      const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${targetPath}`, {
        method: 'PUT',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(putBody),
        signal: AbortSignal.timeout(15000),
      });

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
      const commitSha = resData?.commit?.sha || '';
      const htmlUrl = resData?.commit?.html_url || '';

      console.log(`[GitSync] Successfully synced database to external data repository (${repo} @ ${branch}): ${commitSha.slice(0, 7)}`);
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

  public scheduleDebouncedSync(localFilePath: string, delayMs: number = 5000): void {
    if (!this.isConfigured()) return;

    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }

    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      this.syncFile(localFilePath).catch((e) => {
        console.warn('[GitSync] Debounced sync background error:', e?.message);
      });
    }, delayMs);
  }

  public async fetchLatestRemoteDatabase(
    remotePath?: string
  ): Promise<string | null> {
    if (!this.isConfigured()) {
      return null;
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

      const res = await fetch(apiUrl, { headers, signal: AbortSignal.timeout(10000) });
      if (!res.ok) {
        console.warn(`[GitSync] Could not fetch remote database from GitHub (HTTP ${res.status}).`);
        this.lastSyncTime = new Date().toISOString();
        this.lastSyncSuccess = false;
        this.lastSyncMessage = `Could not fetch remote database from GitHub (HTTP ${res.status})`;
        return null;
      }

      const data = (await res.json()) as any;
      if (!data || !data.content) {
        return null;
      }

      const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
      console.log(`[GitSync] Successfully retrieved latest database from data repository (${repo} @ ${branch})`);
      this.lastSyncTime = new Date().toISOString();
      this.lastSyncSuccess = true;
      this.lastSyncMessage = `Database restored from data repository ${repo} (${branch}) on startup`;
      return decoded;
    } catch (err: any) {
      console.warn('[GitSync] Error fetching remote database from GitHub:', err?.message);
      this.lastSyncTime = new Date().toISOString();
      this.lastSyncSuccess = false;
      this.lastSyncMessage = `Error fetching remote database: ${err?.message || 'Network error'}`;
      return null;
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
