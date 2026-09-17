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
