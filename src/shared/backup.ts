/**
 * backup.ts — F5: sao lưu/khôi phục dữ liệu cục bộ thành một file JSON.
 *
 * Gồm: cấu hình, Saved Jobs, lịch tải, Queue, lịch sử tải và danh sách URL đã
 * tải theo profile (để chuyển máy không tải lại file trùng). KHÔNG gồm danh
 * sách media đã thu thập (lớn, thu thập lại được) hay file lỗi/thông báo.
 *
 * Mọi phần đi qua đúng các parser mà dữ liệu đó vẫn dùng (Saved Jobs, lịch,
 * Queue, lịch sử), nên file sửa tay hoặc hỏng không ghi được giá trị sai vào
 * storage. Phần thiếu hoặc sai định dạng chỉ bị bỏ qua, không làm hỏng cả file.
 */
import type { HistoryEntry, JobSchedule, QueueItem, SavedJob } from '../types.ts';
import { migrateSavedJobsStorage } from './saved-jobs.ts';
import { parseScheduleInput } from './p2-tools.ts';
import { migrateDownloadHistoryStorage } from './download-history.ts';
import { isTrustedMediaUrl, isValidUsername, parseQueueItems } from './validation.ts';

export const BACKUP_KIND = 'extensionx-backup';
export const BACKUP_SCHEMA_VERSION = 1;
/** Đồng bộ với giới hạn lịch sử chống trùng mỗi profile trong IndexedDB. */
export const BACKUP_MAX_URLS_PER_PROFILE = 50_000;
export const BACKUP_MAX_PROFILES = 1_000;

export interface BackupData {
  kind: typeof BACKUP_KIND;
  schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  appVersion: string;
  exportedAt: string;
  options: Record<string, unknown>;
  savedJobs: SavedJob[];
  schedules: JobSchedule[];
  queue: QueueItem[];
  history: HistoryEntry[];
  /** username → URL đã tải (đã chuẩn hoá để chống trùng). */
  downloaded: Record<string, string[]>;
}

export type BackupSection = 'savedJobs' | 'schedules' | 'queue' | 'history' | 'downloaded';

function isPlain(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parseBackupSavedJobs(value: unknown): SavedJob[] {
  return Array.isArray(value) ? migrateSavedJobsStorage({ schemaVersion: 1, jobs: value }).jobs : [];
}

export function parseBackupSchedules(value: unknown): JobSchedule[] {
  return Array.isArray(value)
    ? value.map(parseScheduleInput).filter((item): item is JobSchedule => item !== null)
    : [];
}

export function parseBackupQueue(value: unknown): QueueItem[] {
  return Array.isArray(value) ? parseQueueItems(value) ?? [] : [];
}

export function parseBackupHistory(value: unknown): HistoryEntry[] {
  return Array.isArray(value) ? migrateDownloadHistoryStorage(value).entries : [];
}

/** URL đã tải của một profile: chỉ CDN media X, bỏ trùng, có giới hạn. */
export function parseBackupDownloadedUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const urls = new Set<string>();
  for (const url of value) {
    if (urls.size >= BACKUP_MAX_URLS_PER_PROFILE) break;
    if (isTrustedMediaUrl(url)) urls.add(url);
  }
  return [...urls];
}

/** Đọc file backup. Trả null nếu không phải file backup của ExtensionX. */
export function parseBackupFile(raw: unknown): BackupData | null {
  if (!isPlain(raw) || raw.kind !== BACKUP_KIND || raw.schemaVersion !== BACKUP_SCHEMA_VERSION) return null;
  const downloaded: Record<string, string[]> = {};
  if (isPlain(raw.downloaded)) {
    for (const [username, urls] of Object.entries(raw.downloaded).slice(0, BACKUP_MAX_PROFILES)) {
      if (!isValidUsername(username)) continue;
      const parsed = parseBackupDownloadedUrls(urls);
      if (parsed.length) downloaded[username] = parsed;
    }
  }
  return {
    kind: BACKUP_KIND,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: typeof raw.appVersion === 'string' ? raw.appVersion.slice(0, 20) : '',
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt.slice(0, 40) : '',
    // Cấu hình được trang Options lọc lại theo DEFAULT_OPTIONS khi khôi phục.
    options: isPlain(raw.options) ? raw.options : {},
    savedJobs: parseBackupSavedJobs(raw.savedJobs),
    schedules: parseBackupSchedules(raw.schedules),
    queue: parseBackupQueue(raw.queue),
    history: parseBackupHistory(raw.history),
    downloaded,
  };
}

export function summarizeBackup(data: BackupData): { jobs: number; schedules: number; queue: number; history: number; profiles: number; urls: number } {
  const urlLists = Object.values(data.downloaded);
  return {
    jobs: data.savedJobs.length,
    schedules: data.schedules.length,
    queue: data.queue.length,
    history: data.history.length,
    profiles: urlLists.length,
    urls: urlLists.reduce((sum, urls) => sum + urls.length, 0),
  };
}

/**
 * Chia mảng thành các khối có JSON không vượt `maxBytes`, để mỗi message
 * khôi phục nằm dưới giới hạn 256 KB của kênh message. Một phần tử quá lớn
 * vẫn được gửi riêng (validator phía service worker sẽ loại nếu không hợp lệ).
 */
export function chunkByJsonSize<T>(items: readonly T[], maxBytes = 180_000): T[][] {
  const chunks: T[][] = [];
  let current: T[] = [];
  let size = 2;
  for (const item of items) {
    const itemSize = JSON.stringify(item).length + 1;
    if (current.length && size + itemSize > maxBytes) {
      chunks.push(current);
      current = [];
      size = 2;
    }
    current.push(item);
    size += itemSize;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

/** Gộp Saved Jobs: bản trong backup thay bản cùng id; tổng không vượt `max`. */
export function mergeSavedJobs(existing: readonly SavedJob[], incoming: readonly SavedJob[], max: number): { jobs: SavedJob[]; added: number; updated: number } {
  const jobs = [...existing];
  let added = 0;
  let updated = 0;
  for (const job of incoming) {
    const index = jobs.findIndex((item) => item.id === job.id);
    if (index >= 0) { jobs[index] = job; updated++; continue; }
    if (jobs.length >= max) continue;
    jobs.push(job);
    added++;
  }
  return { jobs, added, updated };
}

/** Gộp lịch sử tải: bỏ dòng trùng (cùng profile + thời điểm), mới nhất trước. */
export function mergeHistory(existing: readonly HistoryEntry[], incoming: readonly HistoryEntry[], max: number): HistoryEntry[] {
  const seen = new Set<string>();
  return [...existing, ...incoming]
    .filter((entry) => {
      const key = `${entry.username}|${entry.date}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, max);
}
