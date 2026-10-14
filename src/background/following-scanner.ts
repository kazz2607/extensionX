import type { FollowingCandidate, FollowingScanState } from '../types.ts';
import { FOLLOWING_SCAN_MAX_RECORDS, validateUnfollowSelection } from '../shared/following-scanner.ts';
import { broadcastToPopup } from './utils.ts';
import { userCsrfToken } from './state.ts';
import { unfollowXUser } from './tweet-api.ts';

let state: FollowingScanState = emptyState();
let candidates = new Map<string, FollowingCandidate>();
let abortController: AbortController | null = null;

function emptyState(): FollowingScanState {
  return { status: 'idle', scanned: 0, candidates: [], processed: 0, succeeded: 0, failed: 0 };
}

function snapshot(): FollowingScanState {
  return { ...state, candidates: [...candidates.values()] };
}

function publish(): void {
  state.scanned = candidates.size;
  state.candidates = [...candidates.values()];
  broadcastToPopup('FOLLOWING_SCAN_STATE', snapshot());
}

export function getFollowingScanState(): FollowingScanState { return snapshot(); }

export function beginFollowingScan(): FollowingScanState {
  abortController?.abort();
  abortController = new AbortController();
  const resume = state.status === 'stopped' && candidates.size > 0;
  if (!resume) candidates = new Map();
  state = resume
    ? { ...state, status: 'scanning', operationId: crypto.randomUUID(), error: undefined }
    : { ...emptyState(), status: 'scanning', operationId: crypto.randomUUID() };
  publish();
  return snapshot();
}

export function ingestFollowingPage(rawCandidates: unknown, cursor?: unknown): number {
  if (state.status !== 'scanning' || !Array.isArray(rawCandidates)) return 0;
  let added = 0;
  for (const raw of rawCandidates.slice(0, 500)) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Partial<FollowingCandidate>;
    if (typeof item.userId !== 'string' || !/^\d{1,30}$/.test(item.userId) ||
        typeof item.username !== 'string' || !/^[A-Za-z0-9_]{1,15}$/.test(item.username) ||
        typeof item.displayName !== 'string' || item.displayName.length > 100 ||
        (item.lastActiveAt !== null && (typeof item.lastActiveAt !== 'number' || !Number.isFinite(item.lastActiveAt)))) continue;
    // An account id keeps the handle it was first seen with, so a later page
    // cannot re-label an id the user is about to select for unfollowing.
    const known = candidates.get(item.userId);
    if (known && known.username.toLowerCase() !== item.username.toLowerCase()) continue;
    if (!known && candidates.size >= FOLLOWING_SCAN_MAX_RECORDS) continue;
    if (!known) added++;
    candidates.set(item.userId, {
      userId: item.userId,
      username: item.username,
      displayName: item.displayName,
      lastActiveAt: item.lastActiveAt ?? null,
      followersCount: typeof item.followersCount === 'number' ? Math.max(0, item.followersCount) : undefined,
      verified: item.verified === true,
      protected: item.protected === true,
      selected: false,
    });
  }
  if (typeof cursor === 'string' && cursor.length <= 500) state.cursor = cursor;
  if (added > 0) publish();
  return added;
}

export function finishFollowingScan(stopped = false, error?: string): void {
  if (state.status !== 'scanning') return;
  state.status = error ? 'error' : stopped ? 'stopped' : 'ready';
  state.error = error;
  publish();
}

export function stopFollowingOperation(): void {
  abortController?.abort();
  if (state.status === 'scanning' || state.status === 'unfollowing') state.status = 'stopped';
  publish();
}

// The previous run may still be inside a request or the throttle wait after
// Stop; a new run must not start until it has actually returned.
let unfollowRun: Promise<{ ok: boolean; error?: string }> | null = null;

function waitOrAbort(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

export function runUnfollowQueue(ids: unknown): Promise<{ ok: boolean; error?: string }> {
  if (unfollowRun) return Promise.resolve({ ok: false, error: 'Previous unfollow run is still stopping' });
  if (state.status !== 'ready' && state.status !== 'stopped') return Promise.resolve({ ok: false, error: 'Scan is not ready' });
  const selected = validateUnfollowSelection(ids, [...candidates.values()]);
  if (!selected) return Promise.resolve({ ok: false, error: 'Invalid unfollow selection' });
  if (!userCsrfToken) return Promise.resolve({ ok: false, error: 'Open X.com and refresh the page before unfollowing' });
  const controller = new AbortController();
  abortController = controller;
  unfollowRun = unfollowSequentially(selected, controller.signal).finally(() => { unfollowRun = null; });
  return unfollowRun;
}

async function unfollowSequentially(selected: FollowingCandidate[], signal: AbortSignal): Promise<{ ok: boolean; error?: string }> {
  state = { ...state, status: 'unfollowing', processed: 0, succeeded: 0, failed: 0, error: undefined };
  publish();
  for (const candidate of selected) {
    if (signal.aborted) break;
    try {
      await unfollowXUser(candidate.userId, userCsrfToken, signal);
      state.succeeded++;
      candidates.delete(candidate.userId);
    } catch (error) {
      if (signal.aborted) break;
      state.failed++;
      const code = error instanceof Error ? error.message : 'UNFOLLOW_FAILED';
      if (/UNFOLLOW_STOP_(401|403|429)/.test(code)) {
        state.error = code;
        state.status = 'error';
        state.processed++;
        publish();
        return { ok: false, error: code };
      }
    }
    state.processed++;
    publish();
    await waitOrAbort(1500 + Math.random() * 1000, signal);
  }
  state.status = signal.aborted ? 'stopped' : state.failed > 0 ? 'error' : 'ready';
  publish();
  return { ok: state.failed === 0 && !signal.aborted, error: state.error };
}
