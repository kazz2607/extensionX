export interface TimedSettlement<T> {
  promise: Promise<T>;
  resolve(value: T): boolean;
  reject(error: Error): boolean;
}

/** One-shot promise settlement with a deterministic timeout for callback APIs. */
export function createTimedSettlement<T>(timeoutMs: number, timeoutError: () => Error): TimedSettlement<T> {
  let settled = false;
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (error: Error) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    rejectPromise(timeoutError());
  }, timeoutMs);
  const finish = (callback: () => void): boolean => {
    if (settled) return false;
    settled = true;
    clearTimeout(timer);
    callback();
    return true;
  };
  return {
    promise,
    resolve: (value) => finish(() => resolvePromise(value)),
    reject: (error) => finish(() => rejectPromise(error)),
  };
}
