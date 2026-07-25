# ExtensionX — Kế Hoạch Nâng Cấp Toàn Diện v5.7.2+

> **Phiên bản hiện tại:** 5.7.0  
> **Ngày phân tích:** 2026-07-24 | **Cập nhật:** 2026-07-24  
> **Phạm vi:** Performance · Security · UI/UX Bug Fixes · Logic Fixes · New Features  

---

## 📋 Mục Lục

1. [Tổng Quan Kiến Trúc](#1-tổng-quan-kiến-trúc)
2. [🐛 Fix Lỗi Logic Khẩn Cấp](#2--fix-lỗi-logic-khẩn-cấp)
3. [⚡ Tối Ưu Hiệu Năng](#3--tối-ưu-hiệu-năng)
4. [🔒 Tăng Cường Bảo Mật](#4--tăng-cường-bảo-mật)
5. [🎨 Fix Lỗi Giao Diện UI](#5--fix-lỗi-giao-diện-ui)
6. [✨ Đề Xuất Tính Năng Mới](#6--đề-xuất-tính-năng-mới)
7. [🛠️ TypeScript Cleanup](#7--typescript-cleanup)
8. [Roadmap Thực Thi](#8-roadmap-thực-thi)

---

## 1. Tổng Quan Kiến Trúc

```
ExtensionX v5.7.2
├── background/
│   ├── service-worker.ts     — Entry point (chỉ import)
│   ├── messages.ts           — 531 lines, Message hub
│   ├── downloader.ts         — 687 lines ✅ typed (0 @ts-ignore)
│   ├── scraper.ts            — 532 lines ✅ Smart Auto-Stop + EMA delay
│   ├── tweet-api.ts          — 384 lines, Multi-layer API fetch
│   ├── queue.ts              — 134 lines ✅ typed + mediaCount sync
│   ├── following-scroll.ts   — 183 lines ✅ auto tab cleanup
│   ├── indexeddb.ts          — IndexedDB persistence layer
│   ├── state.ts              — 13 lines, Shared state
│   └── utils.ts              — ✅ PERF-02 tab visibility check
├── content/
│   ├── content.ts            — 459 lines, Script injector + relay
│   ├── page-interceptor.ts   — Hook fetch/XHR để bắt media URL
│   ├── dom-scanner.ts        — DOM fallback scanner
│   ├── fab.ts                — 672 lines, Floating Action Button
│   ├── shortcuts.ts          — 468 lines ✅ BUG-L1: input guard + scope fix
│   ├── tweet-btn.ts          — Mini download button per tweet
│   └── snackbar.ts           — In-page notifications
├── popup/
│   ├── popup.ts              — 1425 lines ✅ -170 lines sau refactor
│   ├── following-panel.ts    — [NEW] ✅ Following Scanner module riêng
│   ├── popup.html            — ✅ custom modal, XSS sanitized
│   └── popup.css             — ✅ UI-02 daterange smooth animation
├── options/
│   ├── options.html          — ✅ FEAT-08 Smart Auto-Stop UI
│   └── options.ts            — ✅ live folder preview + autoStop load/save
└── types.ts                  — ✅ DownloadOptions + QueueItem typed
```

---

## 2. 🐛 Fix Lỗi Logic Khẩn Cấp

### BUG-L1: `shortcuts.ts` inject trên MỌI trang — conflict với keyboard shortcuts của web app

**File:** `src/manifest.json` · `src/content/shortcuts.ts`

**Vấn đề:**  
`shortcuts.ts` được inject vào `<all_urls>` kể cả Google Docs, Gmail, VSCode web — có thể conflict với `Ctrl+C`, `Ctrl+S` vì extension intercept keydown TRƯỚC default behavior.

**Fix đề xuất:**  
- Thêm `"exclude_matches"` cho các domain phổ biến (Google Docs, Gmail, Notion...)
- Hoặc giới hạn chỉ inject trên `x.com` và `twitter.com`, bỏ `<all_urls>`
- Trong `shortcuts.ts`: kiểm tra `target.tagName === 'INPUT' || target.isContentEditable` trước khi intercept

```typescript
// shortcuts.ts — Thêm guard này trước khi xử lý phím
document.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
      || target.isContentEditable || target.closest('[contenteditable]')) return;
  // ... logic hiện tại
}, { capture: true });
```

---

### BUG-L2: `startDownload()` không có type cho `options` — 80+ TypeScript errors

**File:** `src/background/downloader.ts` — Lines 116, 277

**Vấn đề:**  
Hàm `startDownload(username, options = {})` dùng untyped `{}` — TypeScript không thể kiểm tra property access. 60+ `@ts-ignore` trong file là debt rất nguy hiểm.

**Fix:** Thêm interface vào `types.ts`:
```typescript
export interface DownloadOptions {
  filterType?: 'all' | 'images' | 'videos' | 'gifs';
  skipDuplicates?: boolean;
  dateFrom?: string;
  dateTo?: string;
  keyword?: string;
  flatUsername?: boolean;
  filenameUsername?: boolean;
  saveFolder?: string;
  concurrency?: number;
  showSnackbar?: boolean;
  _fromQueue?: boolean;
  _queueId?: string;
}
```

---

### BUG-L3: Race condition — `clearSession()` xóa nhầm session user khác

**File:** `src/background/scraper.ts` — Line 411

**Vấn đề:**  
```typescript
// Xóa cả active_session_username dù user khác đang active
await chrome.storage.local.remove([`session_${username}`, 'active_session_username']);
```

**Fix:**
```typescript
async function clearSession(username: string) {
  await chrome.storage.local.remove(`session_${username}`);
  // Chỉ xóa nếu đang trỏ đúng username này
  const current = await chrome.storage.local.get('active_session_username');
  if (current.active_session_username === username) {
    await chrome.storage.local.remove('active_session_username');
  }
  await clearMediaItems(username);
}
```

---

### BUG-L4: Scroll delay không reset khi tab chuyển từ hidden → visible

**File:** `src/background/scraper.ts` — Lines 305-311

**Vấn đề:**  
`currentDelayMs` không được reset về `baseDelayMs` khi tab active lại sau khi bị ẩn.

**Fix:**
```typescript
if (scrollResult?.isHidden) {
  noNewCount = 0;
  currentDelayMs = baseDelayMs; // Reset về delay gốc
}
```

---

### BUG-L5: `sendBG()` không có timeout — UI có thể treo khi Service Worker bị Chrome kill

**File:** `src/popup/popup.ts` — Lines 1329-1338

**Vấn đề:**  
```typescript
// Promise có thể không bao giờ resolve nếu SW bị terminate
chrome.runtime.sendMessage({ type, payload }, res => { ... });
```

**Fix:**
```typescript
function sendBG(type: string, payload: any, timeoutMs = 8000): Promise<any> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { resolve(null); }, timeoutMs);
    chrome.runtime.sendMessage({ type, payload }, (res) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) resolve(null);
      else resolve(res);
    });
  });
}
```

---

### BUG-L6: Queue `mediaCount` snapshot khi add — không update khi user scroll thêm

**File:** `src/background/messages.ts` — Lines 196-213

**Fix:** Trong `startNextInQueue()`, update `mediaCount` từ store thực tế:
```typescript
next.mediaCount = store.size; // Cập nhật số thực tế trước khi download
```

---

### BUG-L7: `following-scroll.ts` không đóng tab mới nếu tự tạo

**File:** `src/background/following-scroll.ts` — Lines 63-67

**Fix:**
```typescript
let createdNewTab = false;
if (tabs.length === 0) {
  const newTab = await chrome.tabs.create({ url: targetUrl, active: true });
  tabId = newTab.id;
  createdNewTab = true;
}
// Trong finally:
if (createdNewTab && tabId) chrome.tabs.remove(tabId).catch(() => {});
```

---

## 3. ⚡ Tối Ưu Hiệu Năng

### PERF-01: `popup.ts` 1509 lines — cần tách module

**Vấn đề:** File quá lớn, khó maintain. `renderQueue()` dùng `innerHTML` cho toàn bộ list mỗi lần update → reflow DOM không cần thiết.

**Fix đề xuất — Tách thành 5 module:**
- `popup-core.ts` — State + messages
- `popup-queue.ts` — Queue panel
- `popup-stats.ts` — Donut chart + stats
- `popup-cleanup.ts` — Following scanner
- `popup-ui.ts` — Toast, buttons, helpers

---

### PERF-02: `broadcastToTab()` gửi SNACKBAR đến mọi tab collecting thay vì đúng tab

**File:** `src/background/downloader.ts` — Lines 73-77

**Fix:** Chỉ gửi đến tab có `state.username === username`.

---

### PERF-03: Options cache TTL 5 giây — quá ngắn, re-read storage liên tục trong scroll loop

**File:** `src/background/scraper.ts` — Line 11

**Fix:**
```typescript
const OPTIONS_CACHE_TTL = 60_000; // Tăng lên 60s (đã có invalidation listener)
```

---

### PERF-04: `loadDownloadedUrls()` load 50k URL vào RAM — chiếm 5-10MB

**File:** `src/background/scraper.ts` — Line 435

**Fix:** Chỉ load 20,000 URL gần nhất (newest-first). Với user power user, đây giảm đáng kể RAM footprint.

---

### PERF-05: Adaptive scroll delay không smooth — nhảy đột ngột từ 1000ms → 6000ms

**File:** `src/background/scraper.ts` — Line 290

**Fix — EMA smoothing:**
```typescript
const target = Math.min(Math.max(Math.round(scrollResult.adaptiveAvg * 1.5 + 800), 1000), 6000);
currentDelayMs = Math.round(currentDelayMs * 0.7 + target * 0.3); // EMA 70/30
```

---

### PERF-06: `buildCSV()` tạo 10k string array trong RAM cùng lúc

**File:** `src/background/downloader.ts` — Lines 681-706

**Fix:** Dùng generator pattern để stream CSV theo chunk, giảm peak RAM.

---

## 4. 🔒 Tăng Cường Bảo Mật

### SEC-01: Hardcoded Bearer Token trong source code

**File:** `src/background/tweet-api.ts` — Line 12

**Vấn đề:** Token Twitter guest bị lộ trong source (dù là public token).  
**Fix:** Tách vào `config.ts`, thêm auto-fallback khi token bị revoke.

---

### SEC-02: `SHORTCUT_DOWNLOAD` không validate URL scheme — XSS/SSRF potential

**File:** `src/background/messages.ts` — Lines 455-482

**Vấn đề:**
```typescript
chrome.downloads.download({ url, filename, saveAs: false }, ...)
// url chưa được validate scheme!
```

**Fix:**
```typescript
const urlObj = new URL(url);
if (!['https:', 'http:', 'blob:', 'data:'].includes(urlObj.protocol)) {
  sendResponse({ error: `URL scheme not allowed: ${urlObj.protocol}` });
  return true;
}
```

---

### SEC-03: XSS trong `renderQueue()` — innerHTML với username chưa được escape

**File:** `src/popup/popup.ts` — Lines 368-395

**Vấn đề:**
```typescript
list.innerHTML = `...@${item.username}...`; // XSS nếu username từ import JSON có HTML
```

**Fix — Tạo helper và dùng trong mọi innerHTML:**
```typescript
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c)
  );
}
```
Thêm validation trong `importQueue()`: username chỉ chứa `[A-Za-z0-9_]{1,50}`.

---

### SEC-04: Thiếu Content Security Policy trong manifest

**File:** `src/manifest.json`

**Fix:**
```json
"content_security_policy": {
  "extension_pages": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.twimg.com; connect-src 'self' https://cdn.syndication.twimg.com https://api.twitter.com"
}
```

---

### SEC-05: `chrome.tabs.query({})` đọc URL mọi tab người dùng

**File:** `src/background/scraper.ts` — Line 202

**Fix:**
```typescript
// Trước:
const tabs = await chrome.tabs.query({});
// Sau:
const tabs = await chrome.tabs.query({ url: ['https://x.com/*', 'https://twitter.com/*'] });
```

---

### SEC-06: XSS trong `renderHistory()` — tên file/username không escaped

**File:** `src/popup/popup.ts` — (renderHistory function)

**Fix:** Áp dụng `escapeHtml()` cho mọi dynamic content trong `innerHTML`.

---

## 5. 🎨 Fix Lỗi Giao Diện UI

### UI-01: Cleanup Panel — Progress bar không reset khi chạy lại

**Fix:**
```typescript
btnStart.addEventListener('click', async () => {
  const progressBar = document.getElementById('cleanup-progress-bar');
  if (progressBar) progressBar.style.width = '0%';
  const resultsEl = document.getElementById('cleanup-results');
  if (resultsEl) resultsEl.style.display = 'none';
  _cleanupUsers = [];
  // ...
});
```

---

### UI-02: DateRange panel toggle đột ngột (display: none) — thiếu animation

**Fix — CSS transition thay vì toggle display:**
```css
.daterange-panel {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.25s ease;
}
.daterange-panel.open { max-height: 300px; }
```
```typescript
els.daterangePanel.classList.toggle('open', _dateRangeOpen);
```

---

### UI-03: Toast không có queue — nhiều toast cùng lúc override nhau

**Fix:** Implement toast queue system với FIFO:
```typescript
const _toastQueue: Array<{ msg: string; type: string; duration: number }> = [];
let _toastActive = false;

function showToast(msg: string, type = 'info', duration = 3000) {
  _toastQueue.push({ msg, type, duration });
  if (!_toastActive) drainToastQueue();
}
```

---

### UI-04: Donut chart — HLS legend gây nhầm lẫn cho user không biết HLS là gì

**Fix:**
- Đổi nhãn "HLS" → "HLS Stream" với tooltip: "HTTP Live Streaming — video playlist dạng .m3u8"
- Hoặc merge hoàn toàn vào "Videos", hiển thị breakdown trong tooltip khi hover

---

### UI-05: FAB button không có visual feedback khi disabled

**Fix:** Thêm CSS class `is-busy` khi đang download/collect:
```css
#__xmd_fab__ .xmd-btn.is-busy {
  opacity: 0.5;
  pointer-events: none;
  cursor: not-allowed;
}
```

---

### UI-06: Scroll speed hiển thị stale value sau khi dừng

**Fix:**
```typescript
function updateScrollSpeed(newCount: number) {
  const elapsed = (Date.now() - lastScrollTime) / 1000;
  const delta = newCount - lastScrollCount;
  if (elapsed > 2) {
    els.statusSpeed.textContent = delta > 0
      ? `${(delta / elapsed * 60).toFixed(0)} media/min`
      : '0 media/min';
  }
  lastScrollCount = newCount;
  lastScrollTime = Date.now();
}
```

---

### UI-07: Options page thiếu Live Preview đường dẫn thư mục

**Mô tả:** User nhập folder path nhưng không thấy kết quả thực tế.

**Fix — Thêm preview trong options.html:**
```
📁 Files sẽ được lưu tại:
Downloads / [folder] / @username / images / tweet123_ab12c.jpg
```
Update realtime khi gõ folder name.

---

### UI-08: `window.confirm()` khi xóa media — blocking, không thể style

**Fix:** Tạo custom confirmation modal:
```html
<div id="confirm-modal" class="modal hidden">
  <div class="modal-backdrop"></div>
  <div class="modal-box">
    <p id="confirm-msg"></p>
    <div class="modal-actions">
      <button id="confirm-cancel">Hủy</button>
      <button id="confirm-ok" class="btn-danger">Xác nhận</button>
    </div>
  </div>
</div>
```

---

## 6. ✨ Đề Xuất Tính Năng Mới

### FEAT-01: 📊 Media Preview Gallery trong Popup ⭐ High Priority

**Mô tả:** Thêm tab "Preview" hiển thị grid thumbnail trước khi download. User có thể bỏ chọn media không muốn tải, filter theo hướng ảnh (landscape/portrait), preview video (autoplay nhỏ).

**Implement:**
```typescript
// Message mới: GET_MEDIA_PREVIEW
const items = Array.from(store.values())
  .slice(offset, offset + 50)
  .map(item => ({
    ...item,
    thumbUrl: item.type === 'image'
      ? item.url.replace(/name=\w+/, 'name=small')
      : null
  }));
```

---

### FEAT-02: ⏸️ Pause/Resume Download ⭐ High Priority

**Mô tả:** Tạm dừng download và tiếp tục sau, không phải bắt đầu lại từ đầu.

**Implement:** Thêm `_pauseRequested` flag tương tự `_stopRequested`. Trong `runWorker()`: khi pause, sleep trong loop thay vì break.

---

### FEAT-03: 📅 Auto-Schedule Download

**Mô tả:** Dùng `chrome.alarms` (đã có trong manifest) để lên lịch tải tự động vào khung giờ nhất định (vd: 2-4h sáng).

```typescript
// options — thêm field
schedule?: { enabled: boolean; time: string; days: number[] }

chrome.alarms.create('scheduled-download', {
  when: getNextScheduledTime(opts.schedule),
  periodInMinutes: 24 * 60
});
```

---

### FEAT-04: 🔍 Content-Hash Duplicate Detection

**Mô tả:** Nâng cấp dedup dựa trên URL sang content-hash — không tải lại ảnh đã có dù URL khác. Detect repost/crop bằng perceptual hash (pHash).

**Độ khó:** Hard — cần research thêm

---

### FEAT-05: 📱 Notification Center (Bell Icon)

**Mô tả:** Lưu lại lịch sử thông báo (download xong, lỗi, warning) thay vì chỉ toast rồi biến mất. Thêm bell icon với badge count.

**Độ khó:** Easy

---

### FEAT-06: 🌐 Hoàn thiện Multi-language

**Mô tả:** Audit toàn bộ hardcoded strings trong `popup.ts`. Thêm locale `vi` hoàn chỉnh. Thêm `ja` và `ko` (X.com có lượng lớn user Nhật/Hàn).

---

### FEAT-07: 📤 Export JSON + ZIP Manifest

**Mô tả:**
- **JSON export:** Toàn bộ metadata cho developer/power user
- **ZIP manifest:** Text file chứa URLs + metadata JSON (không ZIP ảnh thực — quá lớn)

**Độ khó:** Easy

---

### FEAT-08: 🎯 Smart Auto-Stop ⭐ High Priority

**Mô tả:** Dừng scroll khi X scroll liên tiếp không có media mới — thông minh hơn `maxScrolls` hiện tại.

```typescript
// options
maxEmptyScrolls?: number; // Default: 5

// scraper.ts — scrollLoop()
if (newMediaThisScroll === 0) {
  emptyScrollStreak++;
  if (emptyScrollStreak >= opts.maxEmptyScrolls) {
    broadcastToPopup('COLLECT_DONE', { reason: 'no_new_media', ... });
    break;
  }
} else {
  emptyScrollStreak = 0;
}
```

---

### FEAT-09: 🔗 Direct Tweet URL Input

**Mô tả:** Input field trong popup để nhập URL tweet trực tiếp và tải media ngay, không cần vào trang.

---

### FEAT-10: 🧹 Disk Usage Manager

**Mô tả:** Hiển thị dung lượng IndexedDB và cho phép dọn dẹp:
- "Xóa session cũ hơn 7 ngày"
- "Giữ chỉ X profiles gần nhất"
- Estimate disk size theo item count

---

## 7. 🛠️ TypeScript Cleanup

### TS-01: Xóa 80+ `@ts-ignore` — thay bằng proper typing

**Phạm vi:** `downloader.ts` (60+), `messages.ts` (20+), `scraper.ts` (10+)

**Công việc:**
1. Tạo `DownloadOptions` interface (BUG-L2)
2. Type tất cả function parameters
3. Fix toàn bộ errors trong `ts_errors.log`

---

### TS-02: Bật strict mode trong tsconfig.json

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true
  }
}
```

---

### TS-03: Type chính xác cho `QueueItem.result`

**File:** `src/types.ts` — Line 31

```typescript
// Trước:
result?: any;

// Sau:
result?: {
  success: number;
  failed: number;
  total: number;
  skipped: number;
  error?: string;
} | null;
```

---

## 8. Roadmap Thực Thi

### Sprint 1 — Critical Fixes ✅ DONE (2026-07-24)

| ID | Task | File | Status |
|----|------|------|--------|
| BUG-L1 | Fix shortcuts.ts inject scope | manifest.json + shortcuts.ts | ✅ Done |
| BUG-L5 | Thêm timeout cho sendBG() | popup.ts | ✅ Done |
| BUG-L3 | Fix clearSession() race condition | scraper.ts | ✅ Done |
| SEC-02 | Validate URL scheme SHORTCUT_DOWNLOAD | messages.ts | ✅ Done |
| SEC-03 | XSS sanitization renderQueue() | popup.ts | ✅ Done |
| SEC-05 | Fix chrome.tabs.query bảo mật | scraper.ts | ✅ Done |
| UI-03 | Toast queue system | popup.ts | ✅ Done |
| UI-08 | Custom confirm modal | popup.html + popup.ts | ✅ Done |

---

### Sprint 2 — TypeScript & Logic ✅ DONE (2026-07-24)

| ID | Task | File | Status |
|----|------|------|--------|
| TS-01 | Tạo DownloadOptions interface | types.ts + downloader.ts | ✅ Done |
| BUG-L2 | Type toàn bộ downloader.ts | downloader.ts | ✅ Done |
| TS-02 | Bật strict mode | tsconfig.json | ✅ Đã có sẵn |
| TS-03 | Type QueueItem.result | types.ts | ✅ Done |
| BUG-L4 | Fix scroll delay reset | scraper.ts | ✅ Done |
| BUG-L6 | Update mediaCount trong queue | queue.ts | ✅ Done |
| BUG-L7 | Cleanup created tab | following-scroll.ts | ✅ Done |

---

### Sprint 3 — Performance & UI ✅ DONE (2026-07-24)

| ID | Task | File | Status |
|----|------|------|--------|
| PERF-02 | Fix broadcastToTab — skip discarded tab | utils.ts | ✅ Done |
| PERF-03 | Tăng options cache TTL 5s→30s | scraper.ts | ✅ Done |
| PERF-05 | EMA smoothing adaptive delay | scraper.ts | ✅ Done |
| SEC-04 | Thêm CSP vào manifest | manifest.json | ✅ Done |
| UI-01 | Fix COLLECT_DONE reset + auto_stop reason | popup.ts | ✅ Done |
| UI-02 | Animate daterange panel (max-height) | popup.css + popup.ts | ✅ Done |
| UI-07 | Live folder preview + filenameUsername trigger | options.ts + options.html | ✅ Done |
| FEAT-08 | Smart Auto-Stop (EMA counter + options UI) | scraper.ts + options | ✅ Done |

---

### Sprint 4 — New Features (~1-2 tuần)

| ID | Feature | Effort | Priority |
|----|---------|--------|----------|
| FEAT-02 | Pause/Resume Download | 4h | 🔴 High |
| FEAT-09 | Direct Tweet URL Input | 3h | 🟡 Medium |
| FEAT-06 | Multi-language hoàn chỉnh | 1 ngày | 🟡 Medium |
| FEAT-01 | Media Preview Gallery | 2 ngày | 🟡 Medium |
| FEAT-05 | Notification Center | 4h | 🟢 Low |
| FEAT-07 | JSON/ZIP Export | 4h | 🟢 Low |
| FEAT-03 | Auto-Schedule | 1 ngày | 🟢 Low |
| FEAT-10 | Disk Usage Manager | 4h | 🟢 Low |
| FEAT-04 | Smart Dedup (pHash) | 3 ngày | 🔵 Research |

---

## Phụ Lục: File Cần Chú Ý

| File | Vấn đề chính | Độ ưu tiên | Trạng thái |
|------|-------------|------------|------------|
| `downloader.ts` | 60+ @ts-ignore, untyped params | 🔴 Cao | ✅ Fixed Sprint 2 |
| `popup.ts` | 1588 lines, cần tách module | 🟡 Medium | ⏳ Sprint 4 (-170 lines refactored, +Following Settings toggle) |
| `manifest.json` | shortcuts inject `<all_urls>` | 🔴 Cao | ✅ Fixed Sprint 1 |
| `messages.ts` | QueueItem status type mismatch, XSS | 🔴 Cao | ✅ Fixed Sprint 1 |
| `scraper.ts` | clearSession race condition, cache TTL | 🟡 Medium | ✅ Fixed Sprint 1+3 |
| `tweet-api.ts` | Hardcoded bearer token | 🟢 Low | ⏳ Sprint 4 |

---

*Cập nhật: 2026-07-24. Version hiện tại: **v5.7.2** (Sprint 1+2+3 + Following Scanner hoàn thành). Sprint 4 tiếp theo.*
