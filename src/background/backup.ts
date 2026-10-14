/**
 * backup.ts — F5: xuất và khôi phục dữ liệu cục bộ (service worker).
 *
 * Xuất: một object JSON (xem src/shared/backup.ts). Khôi phục: trang Options
 * gửi từng phần theo khối nhỏ (giới hạn 256 KB/message); mỗi phần được kiểm
 * tra lại ở đây bằng đúng parser của dữ liệu đó trước khi ghi — không tin dữ
 * liệu từ trang. Khôi phục là GỘP (không xóa dữ liệu hiện có).
 */
import type { BackupData, BackupSection } from '../shared/backup.ts';
import {
  BACKUP_KIND,
  BACKUP_MAX_URLS_PER_PROFILE,
  BACKUP_SCHEMA_VERSION,
  mergeHistory,
  mergeSavedJobs,
  parseBackupDownloadedUrls,
  parseBackupHistory,
  parseBackupQueue,
  parseBackupSavedJobs,
} from '../shared/backup.ts';
import { SAVED_JOBS_MAX } from '../shared/saved-jobs.ts';
import { DOWNLOAD_HISTORY_MAX } from '../shared/download-history.ts';
import { isValidUsername } from '../shared/validation.ts';
import { mediaRepository } from './indexeddb.ts';
import { listSavedJobs, replaceSavedJobs } from './saved-jobs.ts';
import { listDownloadHistory, replaceDownloadHistory } from './download-history.ts';
import { listJobSchedules, restoreSchedules } from './p2-messages.ts';
import { importQueue, loadPersistedQueue, profileQueue } from './queue.ts';
import { downloadedStore } from './state.ts';

export async function buildBackup(): Promise<{ json: string; profiles: number; urls: number }> {
  const [stored, savedJobs, schedules, history, summary] = await Promise.all([
    chrome.storage.sync.get('options'),
    listSavedJobs(),
    listJobSchedules(),
    listDownloadHistory(),
    mediaRepository.getStorageSummary(),
    loadPersistedQueue(),
  ]);
  const downloaded: Record<string, string[]> = {};
  let urls = 0;
  // URL vừa tải còn nằm trong bộ nhớ (ghi IndexedDB có debounce vài giây) —
  // gộp cả hai để file backup không thiếu những file mới tải xong.
  const persisted = new Set(summary.profiles.filter((profile) => profile.downloadedUrls > 0).map((profile) => profile.username));
  const usernames = new Set([...persisted, ...[...downloadedStore].filter(([, set]) => set.size > 0).map(([username]) => username)]);
  const lists = await Promise.all([...usernames].map(async (username) => {
    const fromDb = persisted.has(username) ? await mediaRepository.getDownloadedUrls(username) : [];
    // Bản trong bộ nhớ có thể giữ cả URL IndexedDB đã tỉa; giữ phần cuối (mới
    // nhất) trong giới hạn, vì khôi phục cắt theo thứ tự mảng.
    const merged = [...new Set([...fromDb, ...(downloadedStore.get(username) ?? [])])];
    return [username, merged.slice(-BACKUP_MAX_URLS_PER_PROFILE)] as const;
  }));
  for (const [username, list] of lists) {
    if (!list.length) continue;
    downloaded[username] = list;
    urls += list.length;
  }
  const data: BackupData = {
    kind: BACKUP_KIND,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: chrome.runtime.getManifest().version,
    exportedAt: new Date().toISOString(),
    options: (stored.options as Record<string, unknown> | undefined) ?? {},
    savedJobs,
    schedules,
    queue: profileQueue,
    history,
    downloaded,
  };
  return { json: JSON.stringify(data), profiles: Object.keys(downloaded).length, urls };
}

/** Khôi phục một phần. Trả số mục đã thêm/cập nhật. */
export async function restoreBackupSection(section: BackupSection, items: unknown[], username?: string): Promise<number> {
  switch (section) {
    case 'savedJobs': {
      const { jobs, added, updated } = mergeSavedJobs(await listSavedJobs(), parseBackupSavedJobs(items), SAVED_JOBS_MAX);
      await replaceSavedJobs(jobs);
      return added + updated;
    }
    case 'schedules':
      // Phải chạy sau savedJobs: lịch của job không tồn tại bị bỏ qua.
      return restoreSchedules(items);
    case 'queue': {
      await loadPersistedQueue();
      return importQueue(parseBackupQueue(items)).added;
    }
    case 'history': {
      const merged = mergeHistory(await listDownloadHistory(), parseBackupHistory(items), DOWNLOAD_HISTORY_MAX);
      await replaceDownloadHistory(merged);
      return merged.length;
    }
    case 'downloaded': {
      if (!isValidUsername(username)) return 0;
      const urls = parseBackupDownloadedUrls(items);
      if (!urls.length) return 0;
      await mediaRepository.saveDownloadedUrls(username, urls);
      await mediaRepository.pruneDownloadedUrls(username).catch(() => 0);
      // Bản nhớ đệm của service worker (nếu đã nạp) phải thấy ngay URL vừa khôi
      // phục, nếu không lượt tải trong phiên này vẫn tải lại file trùng.
      const cached = downloadedStore.get(username);
      if (cached) for (const url of urls) cached.add(url);
      return urls.length;
    }
  }
}
