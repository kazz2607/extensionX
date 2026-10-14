/**
 * Helpers for debounced "write what changed" persistence. A write is async, so
 * entries added while it is pending must survive the post-write cleanup.
 */

/** Drop only entries whose value is still the one that was persisted. */
export function releasePersistedEntries<K, V>(dirty: Map<K, V>, persisted: Iterable<readonly [K, V]>): void {
  for (const [key, value] of persisted) {
    if (dirty.get(key) === value) dirty.delete(key);
  }
}

/** Detach a pending batch so later additions start a fresh one. */
export function takeDirtyBatch<K, T>(pending: Map<K, Set<T>>, key: K): Set<T> | undefined {
  const batch = pending.get(key);
  pending.delete(key);
  return batch?.size ? batch : undefined;
}

/** Put a batch back after a failed write without losing newer additions. */
export function restoreDirtyBatch<K, T>(pending: Map<K, Set<T>>, key: K, batch: Set<T>): void {
  const current = pending.get(key);
  if (current) batch.forEach((value) => current.add(value));
  else pending.set(key, batch);
}
