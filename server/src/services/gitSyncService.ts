/**
 * GitSyncService — Deprecated / Retired
 * 
 * CampusNav runtime persistence has migrated to Google Cloud Firestore (IDataRepository).
 * This service is kept as a stub to prevent broken imports during transition.
 */

export interface GitSyncResult {
  success: boolean;
  message: string;
  commitSha?: string;
  url?: string;
}

class GitSyncService {
  public getToken(): string | null {
    return null;
  }

  public getDataRepo(): string | null {
    return null;
  }

  public getCodeRepo(): string {
    return 'muni-rul/CampNav';
  }

  public getDataBranch(): string {
    return 'main';
  }

  public getDataPath(): string {
    return 'server/data/campusnav_db.json';
  }

  public isConfigured(): boolean {
    return false;
  }

  public getLastKnownRemoteSha(): string | null {
    return null;
  }

  public getLastKnownRemoteAccountCount(): number {
    return 0;
  }

  public isSyncPaused(): boolean {
    return false;
  }

  public setSyncPaused(_paused: boolean, _reason?: string): void {}

  public setLastKnownRemoteState(_sha: string | null, _count: number): void {}

  public async fetchLatestRemoteDatabase(_force?: boolean): Promise<{ success: boolean; content?: string; message: string; sha?: string; byteLength?: number; accountCount?: number }> {
    return {
      success: false,
      message: 'GitSync is retired. Runtime persistence is managed by Firestore.',
    };
  }

  public getStatus() {
    return {
      isConfigured: false,
      dataRepo: null,
      codeRepo: 'muni-rul/CampNav',
      branch: 'main',
      lastSyncTime: null,
      lastSyncSuccess: null,
      lastSyncMessage: 'Retired: Firestore is the single source of truth.',
      lastCommitSha: null,
      isSyncing: false,
      syncPaused: false,
      syncPauseReason: null,
      isFirestoreActive: true,
    };
  }

  public async syncFile(_path?: string): Promise<GitSyncResult> {
    return {
      success: false,
      message: 'GitSync is retired. Runtime persistence is managed by Firestore.',
    };
  }
}

export const gitSyncService = new GitSyncService();
