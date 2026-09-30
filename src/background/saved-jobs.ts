import type { SavedJob, SavedJobInput } from '../types.ts';
import { chromeApi } from './chrome-api.ts';
import { createSavedJobsSnapshot, migrateSavedJobsStorage, SAVED_JOBS_MAX } from '../shared/saved-jobs.ts';

const STORAGE_KEY = 'saved_jobs_v1';

export async function listSavedJobs(): Promise<SavedJob[]> {
  const stored = await chromeApi.storage.local.get(STORAGE_KEY);
  const raw = stored[STORAGE_KEY];
  const snapshot = migrateSavedJobsStorage(raw);
  if (Array.isArray(raw) || (raw && typeof raw === 'object' && (raw as { schemaVersion?: unknown }).schemaVersion !== 1)) {
    await chromeApi.storage.local.set({ [STORAGE_KEY]: snapshot });
  }
  return snapshot.jobs;
}

export async function saveSavedJob(input: SavedJobInput, now = Date.now()): Promise<SavedJob | null> {
  const jobs = await listSavedJobs();
  const existingIndex = input.id ? jobs.findIndex((job) => job.id === input.id) : -1;
  if (existingIndex < 0 && jobs.length >= SAVED_JOBS_MAX) return null;
  const existing = existingIndex >= 0 ? jobs[existingIndex] : undefined;
  const id = existing?.id ?? crypto.randomUUID();
  const saved: SavedJob = {
    ...input,
    id,
    schemaVersion: 1,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  if (existingIndex >= 0) jobs[existingIndex] = saved;
  else jobs.unshift(saved);
  await chromeApi.storage.local.set({ [STORAGE_KEY]: createSavedJobsSnapshot(jobs) });
  return saved;
}

export async function deleteSavedJob(id: string): Promise<boolean> {
  const jobs = await listSavedJobs();
  const filtered = jobs.filter((job) => job.id !== id);
  if (filtered.length === jobs.length) return false;
  await chromeApi.storage.local.set({ [STORAGE_KEY]: createSavedJobsSnapshot(filtered) });
  return true;
}

export async function getSavedJob(id: string): Promise<SavedJob | undefined> {
  return (await listSavedJobs()).find((job) => job.id === id);
}
