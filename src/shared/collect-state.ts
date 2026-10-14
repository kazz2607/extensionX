export type CollectPhase = 'idle' | 'starting' | 'collecting' | 'stopping' | 'stopped' | 'failed';

const allowed: Readonly<Record<CollectPhase, readonly CollectPhase[]>> = {
  idle: ['starting'],
  starting: ['collecting', 'stopping', 'failed'],
  collecting: ['stopping', 'stopped', 'failed'],
  stopping: ['stopped'],
  stopped: ['starting'],
  failed: ['starting', 'stopped'],
};

export function canTransitionCollectPhase(from: CollectPhase, to: CollectPhase): boolean {
  return allowed[from].includes(to);
}

export interface CollectStateSnapshot {
  username?: string;
  isCollecting?: boolean;
  scrollCount?: number;
  phase?: CollectPhase;
  operationId?: string;
}

/**
 * Decide whether a page load continues the running collection. startCollecting()
 * reloads the tab on /media and then checks its operationId, so a continuing
 * load must keep it; another profile or a non-media page ends the run.
 */
export function continueCollectOnPageLoad(
  existing: CollectStateSnapshot | undefined,
  username: string,
  isMediaPage: boolean,
): Required<Pick<CollectStateSnapshot, 'isCollecting' | 'scrollCount' | 'phase'>> & { operationId?: string } {
  const sameProfile = existing?.username?.toLowerCase() === username.toLowerCase();
  const isCollecting = Boolean(existing?.isCollecting) && isMediaPage && sameProfile;
  return {
    isCollecting,
    scrollCount: isCollecting ? (existing?.scrollCount ?? 0) : 0,
    phase: isCollecting ? (existing?.phase ?? 'collecting') : 'stopped',
    operationId: isCollecting ? existing?.operationId : undefined,
  };
}
