export type DownloadPhase = 'idle' | 'preparing' | 'downloading' | 'stopping' | 'completed' | 'error';
export type DownloadSource = 'direct' | 'queue';

export interface DownloadOperation {
  id: string;
  username: string;
  source: DownloadSource;
  queueId?: string;
  phase: DownloadPhase;
  controller: AbortController;
}

/** Owns the single global download slot and invalidates stale async callbacks. */
export class DownloadCoordinator {
  private active: DownloadOperation | null = null;

  get phase(): DownloadPhase { return this.active?.phase ?? 'idle'; }
  get operationId(): string | null { return this.active?.id ?? null; }
  get username(): string | null { return this.active?.username ?? null; }
  get signal(): AbortSignal | null { return this.active?.controller.signal ?? null; }
  get isBusy(): boolean { return this.active !== null; }

  begin(username: string, source: DownloadSource, queueId?: string): DownloadOperation | null {
    if (this.isBusy) return null;
    const operation: DownloadOperation = {
      id: crypto.randomUUID(), username, source, queueId, phase: 'preparing', controller: new AbortController(),
    };
    this.active = operation;
    return operation;
  }

  isCurrent(id: string): boolean {
    return this.active?.id === id && !this.active.controller.signal.aborted;
  }

  markDownloading(id: string): boolean {
    if (!this.isCurrent(id) || this.active?.phase !== 'preparing') return false;
    this.active.phase = 'downloading';
    return true;
  }

  requestStop(): DownloadOperation | null {
    if (!this.active || !['preparing', 'downloading'].includes(this.active.phase)) return null;
    this.active.phase = 'stopping';
    this.active.controller.abort();
    return this.active;
  }

  settle(id: string, phase: Extract<DownloadPhase, 'completed' | 'error'>): boolean {
    if (!this.active || this.active.id !== id) return false;
    this.active.phase = phase;
    return true;
  }

  release(id: string): boolean {
    if (!this.active || this.active.id !== id) return false;
    this.active = null;
    return true;
  }
}
