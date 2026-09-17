> **BrainSync Context Pumper** 🧠
> Dynamically loaded for active file: `src/options/options.ts` (Domain: **Generic Logic**)

### 🔴 Generic Logic Gotchas
- **⚠️ GOTCHA: Fixed null crash in HTMLElement — parallelizes async operations for speed**: - // UI-06: Cập nhật progress bar live của queue item đang downloading
+ // UI-06 + FEA-03: Cập nhật progress bar + file count live của queue item đang downloading
-   const metaEl = document.querySelector<HTMLElement>(`.queue-item[data-id="${active.id}"] .queue-item-meta`);
+ 
-   if (!metaEl) return;
+   // UI-06: mini progress bar trong queue-item-meta
-   const progressHTML = `
+   const metaEl = document.querySelector<HTMLElement>(`.queue-item[data-id="${active.id}"] .queue-item-meta`);
-     <div class="queue-mini-progress"><div class="queue-mini-bar" style="width:${payload.percent}%"></div></div>
+   if (metaEl) {
-     <span style="font-size:10px">${payload.current}/${payload.total} • ${payload.percent}%</span>`;
+     const progressHTML = `
-   metaEl.innerHTML = progressHTML;
+       <div class="queue-mini-progress"><div class="queue-mini-bar" style="width:${payload.percent}%"></div></div>
-   metaEl.dataset.progress = progressHTML; // cache để renderQueue có thể restore
+       <span style="font-size:10px">${payload.current}/${payload.total} • ${payload.percent}%</span>`;
- }
+     metaEl.innerHTML = progressHTML;
- 
+     metaEl.dataset.progress = progressHTML;
- async function addCurrentToQueue() {
+   }
- // @ts-ignore
+ 
-   if (!currentUsername) return;
+   // FEA-03: file count badge rõ ràng hơn
-   const mediaCount = parseInt(els.badge.textContent) || 0;
+   const fileCountEl = document.querySelector<HTMLElement>(`#qfc-${active.id}`);
-   if (mediaCount === 0) {
+   if (fileCountEl) {
-     showToast('Chưa có media — hãy thu thập trước', 'error');
+     fileCountEl.textContent = `📥 ${payload.current} / ${payload.total} files · ${payload.percent}%`;
-     return;
+   }
-   }
+ }
-   const skipDuplicates = els.skipCheckbox ? els.skipCheckbox.checked : true;
+ 
-   const res: any = await sendBG('ADD_TO_QUEUE', {
+ async function addCurrentToQueue() {
-     username: currentUsername,
+ // @ts-ignore
-     filterType: activeFilter,
+   if (!currentUser
… [diff truncated]

📌 IDE AST Context: Modified symbols likely include [currentUsername, isCollecting, isDownloading, activeFilter, stats]
- **⚠️ GOTCHA: Fixed null crash in File — parallelizes async operations for speed**: -     return `<li class="queue-item status-${item.status}" data-id="${item.id}">
+     // FEA-03: File count span — chỉ render cho item đang downloading
-       <div class="queue-item-avatar">${item.username.slice(0, 2).toUpperCase()}</div>
+     const fileCountSpan = item.status === 'downloading'
-       <div class="queue-item-info">
+       ? `<span class="queue-file-count" id="qfc-${item.id}">📥 đang tải...</span>`
-         <div class="queue-item-name">@${item.username}</div>
+       : '';
-         <div class="queue-item-meta">${metaText}</div>
+ 
-       </div>
+     return `<li class="queue-item status-${item.status}" data-id="${item.id}">
-       <span class="queue-status ${item.status}">${statusLabel}</span>
+       <div class="queue-item-avatar">${item.username.slice(0, 2).toUpperCase()}</div>
-       ${canRemove
+       <div class="queue-item-info">
-         ? `<button class="btn-queue-remove" data-id="${item.id}" title="Xóa khỏi queue">×</button>`
+         <div class="queue-item-name">@${item.username}</div>
-         : `<button class="btn-queue-stop" data-id="${item.id}" title="Dừng download">⏹</button>`}
+         <div class="queue-item-meta">${metaText}</div>
-     </li>`;
+         ${fileCountSpan}
-   }).join('');
+       </div>
- 
+       <span class="queue-status ${item.status}">${statusLabel}</span>
-   // Restore live progress bar nếu có item đang downloading
+       ${canRemove
-   const activeItem = (downloadQueue as any[]).find(q => q.status === 'downloading');
+         ? `<button class="btn-queue-remove" data-id="${item.id}" title="Xóa khỏi queue">×</button>`
-   if (activeItem) {
+         : `<button class="btn-queue-stop" data-id="${item.id}" title="Dừng download">⏹</button>`}
-     const metaEl = list.querySelector<HTMLElement>(`.queue-item[data-id="${activeItem.id}"] .queue-item-meta`);
+     </li>`;
-     if (metaEl && metaEl.dataset.progress) {
+   }).join('');
-       metaEl.innerHTML = metaEl.dataset.progress;
+ 
-     }
+   // Re
… [diff truncated]

📌 IDE AST Context: Modified symbols likely include [currentUsername, isCollecting, isDownloading, activeFilter, stats]
- **⚠️ GOTCHA: Fixed null crash in Stop — parallelizes async operations for speed**: - }
+ 
- 
+   // Bug 2: Stop button cho item đang downloading trong queue
- // UI-06: Cập nhật progress bar live của queue item đang downloading
+ // @ts-ignore
- function updateQueueItemProgress(payload: any) {
+   list.querySelectorAll('.btn-queue-stop').forEach(btn => {
-   const active = (downloadQueue as any[]).find(q => q.status === 'downloading');
+ // @ts-ignore
-   if (!active) return;
+     btn.addEventListener('click', async (e) => {
-   const metaEl = document.querySelector<HTMLElement>(`.queue-item[data-id="${active.id}"] .queue-item-meta`);
+       e.stopPropagation();
-   if (!metaEl) return;
+       await sendBG('STOP_DOWNLOAD', {});
-   const progressHTML = `
+       showToast('⏹ Đang dừng download...', 'info');
-     <div class="queue-mini-progress"><div class="queue-mini-bar" style="width:${payload.percent}%"></div></div>
+     });
-     <span style="font-size:10px">${payload.current}/${payload.total} • ${payload.percent}%</span>`;
+   });
-   metaEl.innerHTML = progressHTML;
+ }
-   metaEl.dataset.progress = progressHTML; // cache để renderQueue có thể restore
+ 
- }
+ // UI-06: Cập nhật progress bar live của queue item đang downloading
- 
+ function updateQueueItemProgress(payload: any) {
- async function addCurrentToQueue() {
+   const active = (downloadQueue as any[]).find(q => q.status === 'downloading');
- // @ts-ignore
+   if (!active) return;
-   if (!currentUsername) return;
+   const metaEl = document.querySelector<HTMLElement>(`.queue-item[data-id="${active.id}"] .queue-item-meta`);
-   const mediaCount = parseInt(els.badge.textContent) || 0;
+   if (!metaEl) return;
-   if (mediaCount === 0) {
+   const progressHTML = `
-     showToast('Chưa có media — hãy thu thập trước', 'error');
+     <div class="queue-mini-progress"><div class="queue-mini-bar" style="width:${payload.percent}%"></div></div>
-     return;
+     <span style="font-size:10px">${payload.current}/${payload.total} • ${payload.percent}%</span>`;
-   }
+   metaEl.innerHTML 
… [diff truncated]

📌 IDE AST Context: Modified symbols likely include [currentUsername, isCollecting, isDownloading, activeFilter, stats]
- **⚠️ GOTCHA: Fixed null crash in Restore — parallelizes async operations for speed**: -       ${canRemove ? `<button class="btn-queue-remove" data-id="${item.id}" title="Xóa khỏi queue">×</button>` : ''}
+       ${canRemove
-     </li>`;
+         ? `<button class="btn-queue-remove" data-id="${item.id}" title="Xóa khỏi queue">×</button>`
-   }).join('');
+         : `<button class="btn-queue-stop" data-id="${item.id}" title="Dừng download">⏹</button>`}
- 
+     </li>`;
-   // Restore live progress bar nếu có item đang downloading
+   }).join('');
-   const activeItem = (downloadQueue as any[]).find(q => q.status === 'downloading');
+ 
-   if (activeItem) {
+   // Restore live progress bar nếu có item đang downloading
-     const metaEl = list.querySelector<HTMLElement>(`.queue-item[data-id="${activeItem.id}"] .queue-item-meta`);
+   const activeItem = (downloadQueue as any[]).find(q => q.status === 'downloading');
-     if (metaEl && metaEl.dataset.progress) {
+   if (activeItem) {
-       metaEl.innerHTML = metaEl.dataset.progress;
+     const metaEl = list.querySelector<HTMLElement>(`.queue-item[data-id="${activeItem.id}"] .queue-item-meta`);
-     }
+     if (metaEl && metaEl.dataset.progress) {
-   }
+       metaEl.innerHTML = metaEl.dataset.progress;
- 
+     }
-   // Remove listeners
+   }
- // @ts-ignore
+ 
-   list.querySelectorAll('.btn-queue-remove').forEach(btn => {
+   // Remove listeners
-     btn.addEventListener('click', async (e) => {
+   list.querySelectorAll('.btn-queue-remove').forEach(btn => {
-       e.stopPropagation();
+ // @ts-ignore
-       const id = btn.dataset.id;
+     btn.addEventListener('click', async (e) => {
-       await sendBG('REMOVE_FROM_QUEUE', { id });
+       e.stopPropagation();
-       showToast('Đã xóa khỏi hàng đợi', 'info');
+       const id = btn.dataset.id;
-     });
+       await sendBG('REMOVE_FROM_QUEUE', { id });
-   });
+       showToast('Đã xóa khỏi hàng đợi', 'info');
- }
+     });
- 
+   });
- // UI-06: Cập nhật progress bar live của queue item đang downloading
+ }
- function updateQueueItemProg
… [diff truncated]

📌 IDE AST Context: Modified symbols likely include [currentUsername, isCollecting, isDownloading, activeFilter, stats]
- **⚠️ GOTCHA: Fixed null crash in downloader — offloads heavy computation off the main thread**: - export { startDownload, handleDownloadTweet, activeErrors, buildCSV, retryLastDownload };
+ // Bug 2: Dừng download đang chạy — workers sẽ thoát sau file hiện tại
- 
+ function stopDownload(): boolean {
+   if (!downloadState.inProgress) return false;
+   _stopRequested = true;
+   console.log('[SW] ⏹ stopDownload: yêu cầu dừng sau file hiện tại...');
+   return true;
+ }
+ 
+ export { startDownload, handleDownloadTweet, activeErrors, buildCSV, retryLastDownload, stopDownload };
+ 

📌 IDE AST Context: Modified symbols likely include [KEEPALIVE_ALARM, DOWNLOAD_TIMEOUT_MS, _lastFabProgressTime, chrome.alarms.onAlarm.addListener() callback, startKeepAlive]

### 📐 Generic Logic Conventions & Fixes
- **[decision] decision in options.ts**: -  * options.js — Logic trang Cài đặt (v5.3.1)
+  * options.js — Logic trang Cài đặt (v5.4.0)

📌 IDE AST Context: Modified symbols likely include [DEFAULT_OPTIONS, loadOptions, saveOptions, updateScrollLabel, updateConcurrencyLabel]
- **[what-changed] Replaced dependency Logic**: -  * options.js — Logic trang Cài đặt (v5.3.0)
+  * options.js — Logic trang Cài đặt (v5.3.1)
- // ─── v5.3.0: Export / Import / Reset ──────────────────────────────────────────────────
+ // ─── v5.3.1: Export / Import / Reset ──────────────────────────────────────────────────
-       _version: '5.3.0',
+       _version: '5.3.1',

📌 IDE AST Context: Modified symbols likely include [DEFAULT_OPTIONS, loadOptions, saveOptions, updateScrollLabel, updateConcurrencyLabel]
- **[convention] Replaced dependency Logic — confirmed 3x**: -  * options.js — Logic trang Cài đặt (v5.2.0)
+  * options.js — Logic trang Cài đặt (v5.3.0)
- // ─── v5.2.0: Export / Import / Reset ──────────────────────────────────────────────────
+ // ─── v5.3.0: Export / Import / Reset ──────────────────────────────────────────────────
-       _version: '5.2.0',
+       _version: '5.3.0',

📌 IDE AST Context: Modified symbols likely include [DEFAULT_OPTIONS, loadOptions, saveOptions, updateScrollLabel, updateConcurrencyLabel]
- **[convention] Fixed null crash in Queue — prevents null/undefined runtime crashes — confirmed 6x**: -   // CSV Export
+   // FEA-02: Queue Export
-   els.btnCsv.addEventListener('click', async () => {
+   if (els.btnQueueExport) {
- // @ts-ignore
+     els.btnQueueExport.addEventListener('click', async () => {
-     if (!currentUsername) return;
+       const res: any = await sendBG('EXPORT_QUEUE', {});
-     const res: any = await sendBG('EXPORT_CSV', {
+       if (!res?.ok || !res.data) { showToast('Không có dữ liệu để xuất', 'error'); return; }
-       username: currentUsername,
+       const json = JSON.stringify(res.data, null, 2);
-       filterType: activeFilter,
+       const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
-       offset: _csvOffset,  // PERF-04: pagination
+       const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
-     });
+       chrome.downloads.download({ url: dataUrl, filename: `extensionx_queue_${dateStr}.json`, saveAs: false });
- 
+       showToast(`✓ Đã xuất ${res.data.queue?.length || 0} profile(s)`, 'success');
-     if (!res?.csv) { showToast('Không có dữ liệu để xuất', 'error'); return; }
+     });
- 
+   }
-     const dataUrl = 'data:text/csv;charset=utf-8,' + encodeURIComponent(res.csv);
+ 
-     const dateStr = new Date().toISOString().slice(0,10).replace(/-/g,'');
+   // FEA-02: Queue Import
-     // PERF-04: Thêm số trang vào filename khi truncated
+   if (els.inputQueueImport) {
-     const pageNum = Math.floor(_csvOffset / 10000) + 1;
+     els.inputQueueImport.addEventListener('change', async (e: Event) => {
-     const pageLabel = res.truncated || _csvOffset > 0 ? `_p${pageNum}` : '';
+       const file = (e.target as HTMLInputElement).files?.[0];
-     chrome.downloads.download({
+       if (!file) return;
-       url: dataUrl,
+       (e.target as HTMLInputElement).value = '';
-       filename: `${currentUsername}_media_${dateStr}${pageLabel}.csv`,
+       try {
-       saveAs: false,
+         const text = await file.text();
-     });
+         const res: any = aw
… [diff truncated]

📌 IDE AST Context: Modified symbols likely include [currentUsername, isCollecting, isDownloading, activeFilter, stats]
- **[what-changed] Replaced dependency broadcastQueueUpdate**: - import { profileQueue, setProfileQueue, persistQueue, startNextInQueue, broadcastQueueUpdate } from './queue.ts';
+ import { profileQueue, setProfileQueue, persistQueue, startNextInQueue, broadcastQueueUpdate, exportQueue, importQueue } from './queue.ts';

📌 IDE AST Context: Modified symbols likely include [chrome.runtime.onMessage.addListener() callback]
- **[what-changed] Replaced dependency QueueItem**: - import { QueueItem } from '../types.ts';
+ import { QueueItem, QueueExportData } from '../types.ts';

📌 IDE AST Context: Modified symbols likely include [profileQueue, setProfileQueue, loadPersistedQueue, _queuePersistTimer, persistQueue]
- **[convention] Fixed null crash in Stop — prevents null/undefined runtime crashes — confirmed 5x**: -   // UI-01: Error details — Retry và Close
+   // Bug 2: Stop download button
-   if (els.btnRetry) {
+   if (els.btnStopDownload) {
-     els.btnRetry.addEventListener('click', async () => {
+     els.btnStopDownload.addEventListener('click', async () => {
-       els.errorDetails.style.display = 'none';
+       await sendBG('STOP_DOWNLOAD', {});
-       await sendBG('RETRY_FAILED', {});
+       showToast('⏹ Đang dừng — hoàn tất file hiện tại rồi dừng', 'info');
-       showToast('Đang retry các file lỗi...', 'info');
+     });
-       isDownloading = true;
+   }
-       showProgress(true);
+ 
-       updateButtons();
+   // UI-01: Error details — Retry và Close
-     });
+   if (els.btnRetry) {
-   }
+     els.btnRetry.addEventListener('click', async () => {
-   if (els.btnErrorClose) {
+       els.errorDetails.style.display = 'none';
-     els.btnErrorClose.addEventListener('click', () => {
+       await sendBG('RETRY_FAILED', {});
-       els.errorDetails.style.display = 'none';
+       showToast('Đang retry các file lỗi...', 'info');
-     });
+       isDownloading = true;
-   }
+       showProgress(true);
- 
+       updateButtons();
-   // Theme toggle
+     });
-   els.btnTheme.addEventListener('click', toggleTheme);
+   }
- 
+   if (els.btnErrorClose) {
-   // Compact Mode toggle
+     els.btnErrorClose.addEventListener('click', () => {
-   if (els.btnCompact) {
+       els.errorDetails.style.display = 'none';
-     els.btnCompact.addEventListener('click', toggleCompactMode);
+     });
-   // History clear
+   // Theme toggle
-   els.btnHistClear.addEventListener('click', async () => {
+   els.btnTheme.addEventListener('click', toggleTheme);
-     downloadHistory = [];
+ 
-     await chrome.storage.local.remove('download_history');
+   // Compact Mode toggle
-     renderHistory();
+   if (els.btnCompact) {
-     showToast('Đã xóa lịch sử', 'info');
+     els.btnCompact.addEventListener('click', toggleCompactMode);
-   });
+   }
- }
+ 
- 
+   // History cle
… [diff truncated]

📌 IDE AST Context: Modified symbols likely include [currentUsername, isCollecting, isDownloading, activeFilter, stats]
- **[what-changed] Replaced dependency downloaderts**: - import { startDownload, handleDownloadTweet, buildCSV, retryLastDownload } from './downloader.ts';
+ import { startDownload, handleDownloadTweet, buildCSV, retryLastDownload, stopDownload } from './downloader.ts';

📌 IDE AST Context: Modified symbols likely include [chrome.runtime.onMessage.addListener() callback]
- **[what-changed] Replaced dependency downloaderts**: - import { startDownload, handleDownloadTweet, buildCSV } from './downloader.ts';
+ import { startDownload, handleDownloadTweet, buildCSV, retryLastDownload } from './downloader.ts';

📌 IDE AST Context: Modified symbols likely include [chrome.runtime.onMessage.addListener() callback]
- **[problem-fix] problem-fix in downloader.ts**: - export { startDownload, handleDownloadTweet, activeErrors, buildCSV };
+ // UI-01: Retry bằng cách chạy lại download cuối — skipDuplicates tự bỏ qua file đã tải OK
- 
+ function retryLastDownload(): boolean {
+   if (downloadState.inProgress || !_lastDownloadUsername) return false;
+   startDownload(_lastDownloadUsername, _lastDownloadOptions);
+   return true;
+ }
+ 
+ export { startDownload, handleDownloadTweet, activeErrors, buildCSV, retryLastDownload };
+ 

📌 IDE AST Context: Modified symbols likely include [KEEPALIVE_ALARM, DOWNLOAD_TIMEOUT_MS, _lastFabProgressTime, chrome.alarms.onAlarm.addListener() callback, startKeepAlive]
