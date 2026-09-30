import type { MediaFilterType, SavedJob, SavedJobInput } from '../types.ts';
import { isValidUsername, sanitizeFolderPath } from './validation.ts';

export const SAVED_JOBS_SCHEMA_VERSION = 1;
export const SAVED_JOBS_MAX = 100;
const JOB_ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FILTER_TYPES = new Set<MediaFilterType>(['all', 'images', 'videos', 'gifs']);

export interface SavedJobsSnapshot {
  schemaVersion: typeof SAVED_JOBS_SCHEMA_VERSION;
  jobs: SavedJob[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validDate(value: unknown): value is string {
  if (value === '') return true;
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function parseSavedJobInput(value: unknown): SavedJobInput | null {
  if (!isRecord(value)) return null;
  const id = value.id;
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const username = typeof value.username === 'string' ? value.username.trim() : '';
  const filterType = value.filterType ?? 'all';
  const keyword = typeof value.keyword === 'string' ? value.keyword.trim() : '';
  const dateFrom = value.dateFrom ?? '';
  const dateTo = value.dateTo ?? '';
  const saveFolder = value.saveFolder ?? '';
  const filenameTemplate = value.filenameTemplate ?? '';
  if ((id !== undefined && (typeof id !== 'string' || !JOB_ID_PATTERN.test(id))) ||
      name.length < 1 || name.length > 80 || !isValidUsername(username) ||
      typeof filterType !== 'string' || !FILTER_TYPES.has(filterType as MediaFilterType) ||
      typeof value.skipDuplicates !== 'boolean' || keyword.length > 200 ||
      !validDate(dateFrom) || !validDate(dateTo) ||
      typeof saveFolder !== 'string' || saveFolder.length > 500 ||
      typeof filenameTemplate !== 'string' || filenameTemplate.length > 200) return null;
  if (dateFrom && dateTo && dateFrom > dateTo) return null;
  return {
    ...(typeof id === 'string' ? { id } : {}),
    name,
    username,
    filterType: filterType as MediaFilterType,
    skipDuplicates: value.skipDuplicates,
    keyword,
    dateFrom,
    dateTo,
    saveFolder: sanitizeFolderPath(saveFolder),
    filenameTemplate: filenameTemplate.trim(),
  };
}

export function migrateSavedJobsStorage(value: unknown): SavedJobsSnapshot {
  const rawJobs = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.jobs)
      ? value.jobs
      : [];
  const jobs: SavedJob[] = [];
  const ids = new Set<string>();
  for (const raw of rawJobs.slice(0, SAVED_JOBS_MAX)) {
    if (!isRecord(raw)) continue;
    const input = parseSavedJobInput(raw);
    const id = typeof raw.id === 'string' ? raw.id : '';
    if (!input || !id || ids.has(id)) continue;
    const createdAt = typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : 0;
    const updatedAt = typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : createdAt;
    jobs.push({ ...input, id, schemaVersion: 1, createdAt, updatedAt });
    ids.add(id);
  }
  return { schemaVersion: SAVED_JOBS_SCHEMA_VERSION, jobs };
}

export function createSavedJobsSnapshot(jobs: readonly SavedJob[]): SavedJobsSnapshot {
  return { schemaVersion: SAVED_JOBS_SCHEMA_VERSION, jobs: jobs.slice(0, SAVED_JOBS_MAX).map((job) => ({ ...job })) };
}
