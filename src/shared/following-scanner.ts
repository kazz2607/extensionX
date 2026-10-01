import type { FollowingCandidate } from '../types.ts';

export const FOLLOWING_PAGE_MAX_RECORDS = 500;
export const FOLLOWING_SCAN_MAX_RECORDS = 10_000;

type UnknownRecord = Record<string, unknown>;
const asRecord = (value: unknown): UnknownRecord | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;

function parseDate(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const parsed = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function parseFollowingGraphqlPage(value: unknown): { candidates: FollowingCandidate[]; cursor?: string } {
  const candidates = new Map<string, FollowingCandidate>();
  let cursor: string | undefined;
  const visit = (node: unknown, depth: number): void => {
    if (depth > 40 || candidates.size >= FOLLOWING_PAGE_MAX_RECORDS || node === null) return;
    if (Array.isArray(node)) { for (const item of node) visit(item, depth + 1); return; }
    const record = asRecord(node);
    if (!record) return;
    const legacy = asRecord(record.legacy);
    const typename = record.__typename;
    const username = legacy?.screen_name;
    const id = record.rest_id ?? legacy?.id_str;
    if ((typename === 'User' || record.rest_id !== undefined) && typeof username === 'string' && /^[A-Za-z0-9_]{1,15}$/.test(username) && typeof id === 'string') {
      const status = asRecord(legacy?.status);
      candidates.set(id, {
        userId: id,
        username,
        displayName: typeof legacy?.name === 'string' ? legacy.name.slice(0, 100) : username,
        lastActiveAt: parseDate(status?.created_at),
        followersCount: typeof legacy?.followers_count === 'number' ? Math.max(0, legacy.followers_count) : undefined,
        verified: record.is_blue_verified === true || legacy?.verified === true,
        protected: legacy?.protected === true,
        selected: false,
      });
    }
    if (typeof record.entryId === 'string' && record.entryId.includes('cursor-bottom')) {
      const content = asRecord(record.content);
      const candidateCursor = content?.value ?? asRecord(content?.itemContent)?.value;
      if (typeof candidateCursor === 'string' && candidateCursor.length <= 500) cursor = candidateCursor;
    }
    for (const child of Object.values(record)) visit(child, depth + 1);
  };
  visit(value, 0);
  return { candidates: [...candidates.values()], cursor };
}

export function isInactiveCandidate(candidate: FollowingCandidate, months: 3 | 6 | 12, now = Date.now()): boolean {
  if (candidate.lastActiveAt === null) return false;
  const cutoff = now - months * 30 * 24 * 60 * 60 * 1000;
  return candidate.lastActiveAt < cutoff;
}

export function validateUnfollowSelection(value: unknown, candidates: readonly FollowingCandidate[], max = 100): FollowingCandidate[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > max || value.some((id) => typeof id !== 'string')) return null;
  const allowed = new Map(candidates.map((candidate) => [candidate.userId, candidate]));
  const unique = [...new Set(value as string[])];
  if (unique.length !== value.length) return null;
  const selected = unique.map((id) => allowed.get(id));
  return selected.every(Boolean) ? selected as FollowingCandidate[] : null;
}
