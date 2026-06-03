# X Media Downloader — Roadmap & Lịch sử Phát triển

> Tài liệu tổng hợp: kiến trúc hiện tại, những gì đã hoàn thành và định hướng phát triển tiếp theo.
> Cập nhật: 2026-06-03 | Phiên bản hiện tại: **4.0.1**

---

## 1. Kiến Trúc Hiện Tại (v4.x)

```
extensionX/
├── manifest.json                  # Chrome Extension Manifest V3
├── background/
│   ├── service-worker.js          # Service Worker (core logic, download queue)
│   └── tweet-api.js               # Fallback API & User Session bypass CORS
├── content/
│   ├── content.js                 # Content script chạy trên x.com
│   ├── dom-scanner.js             # Fallback quét DOM tìm thumbnail
│   ├── fab.js                     # Floating Action Button trên trang X.com
│   ├── tweet-btn.js               # Download Mini Button trên từng tweet
│   └── page-interceptor.js        # Hook fetch/XHR/JSON.parse (MAIN world)
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── options/
│   ├── options.html
│   └── options.js
├── offscreen/
│   ├── offscreen.html
│   └── offscreen.js               # Xử lý HLS (ghép TS segments)
├── lib/
│   ├── hls-fetcher.js             # Parse & tải HLS m3u8
│   ├── i18n.js                    # Đa ngôn ngữ (EN/VI)
│   └── utils.js
├── _locales/                      # i18n: vi, en
├── rules.json                     # declarativeNetRequest rules
└── docs/
    ├── roadmap.md                 # File này
    ├── huong-dan-cai-dat.md
    └── publish-guide.md
```

### Luồng Hoạt Động

```
User mở Profile Page (x.com/username/media)
        │
        ▼
[content.js] Inject page-interceptor.js vào MAIN world (document_start)
        │
        ▼
[page-interceptor.js] Hook window.fetch, XMLHttpRequest, JSON.parse
        ├── Bắt GraphQL response (UserMedia, UserTweets, TweetDetail)
        ├── Parse JSON → extract media URLs (depth ≤ 35)
        └── dispatchEvent('X_MEDIA_FOUND', { urls, username })
        │
        ▼
[content.js] Lắng nghe CustomEvent
        └── chrome.runtime.sendMessage({ type: 'MEDIA_FOUND', ... })
        │
        ▼
[service-worker.js] Nhận message, lưu vào mediaStore (Map in-memory) + persist vào chrome.storage.local (Session Restore)
        ├── Keep-alive bằng chrome.alarms (ping mỗi 24s khi đang tải)
        ├── Worker pool (CONCURRENCY = 1–5, cài được trong Options)
        └── Gửi FAB_UPDATE về tab & DOWNLOAD_DONE về popup sau khi xong
        │
        ▼
[chrome.downloads.download()] — Video/GIF MP4: tải thẳng
[offscreen.js] — HLS: fetch TS segments → ghép → trả base64
        │
        ▼
File được lưu vào:
  Downloads/{baseFolder}/{username}/images/   ← ảnh
  Downloads/{baseFolder}/{username}/videos/   ← mp4
  Downloads/{baseFolder}/{username}/gifs/     ← gif mp4
```

---

## 2. Trạng Thái Hoàn Thành (theo CHANGELOG)

### ✅ Phase 1 — MVP (v1.0.0)
- GraphQL Interceptor hook fetch/XHR
- Content script inject + relay messages
- Service Worker nhận & lưu media list
- Auto-scroll cơ bản
- Popup UI (count + download button)

### ✅ Phase 2 — Tính Năng Nâng Cao (v2.0.0)
- HLS video support (hls-fetcher, offscreen)
- DOM Scanner fallback (MutationObserver)
- Floating Action Button (FAB) trên trang X.com
- Filter tabs (All / Images / Videos / GIFs)
- Progress bar realtime
- Export CSV

### ✅ Phase 3 — Hoàn Thiện (v3.0.0 → v3.9.0)
- **v3.0–3.4** Direct download, bypass CORS, Hook JSON.parse+XHR, i18n, Dark/Light mode
- **v3.5.x** macOS fix, SW keep-alive, worker pool, IDM detect, context invalidation
- **v3.6.0** Download Mini Button trên từng tweet
- **v3.7.0** Session Restore — `persistSession()` / `clearSession()`, restore banner
- **v3.8.0** Smart Filters — lọc avatar/banner/card-preview + kích thước tối thiểu
- **v3.9.0** FAB Draggable — drag handle trục Y, viewport clamp, persist `localStorage`

### ✅ Phase 4 — UX Nâng Cao (v4.0.x)
- **v4.0.0** Progress Snackbar — snackbar glassmorphism trên trang, realtime, auto-dismiss, toggle trong Options
- **v4.0.1** Bug Fixes — 7 lỗi sửa trong phiên này:
  - Guard `tweetId` rỗng trước khi gọi API (chặn cascade 404)
  - Bỏ `format=jpg` ép buộc — giữ format gốc PNG/WebP
  - `keepalive ping` chuyển từ `log` → `debug`
  - `async forEach` → `Promise.all(map)` trong MEDIA_FOUND
  - `broadcastToTab` chỉ gửi 1 tab (không spam tất cả tab)
  - FAB `updateFabI18n()` dùng `isDownloading` flag đúng cách
  - DOM scanner validate `tweetId` ≥10 digits

---

## 3. Tính Năng Đã Hoàn Thành & Kế Hoạch Tiếp Theo

### ✅ Đã Hoàn Thành

| Version | Tính năng |
|---|---|
| v3.6.0 | **Download Mini Button** — Nút ↓ xuất hiện trên từng tweet có media, click → tải ngay |
| v3.7.0 | **Session Restore** — Tự lưu phiên thu thập, khôi phục sau khi browser tắt/crash |
| v3.8.0 | **Smart Filters** — Tự động lọc avatar, banner, card preview, và ảnh nhỏ <150px khỏi danh sách media |
| v3.9.0 | **FAB Draggable** — Kéo thả FAB lên/xuống trên cạnh phải, vị trí được nhớ qua localStorage |
| v4.0.0 | **Progress Snackbar** — Snackbar glassmorphism trên trang X.com, realtime progress, auto-dismiss, toggle trong Options |
| v4.0.1 | **Bug Fixes** — Guard tweetId rỗng, bỏ format=jpg, debug log, async fix, broadcastToTab 1 tab, FAB i18n fix |

---

## 4. Đề Xuất Phát Triển Tiếp Theo

> Được tư vấn dựa trên phân tích kiến trúc hiện tại (v4.0.1), code review toàn bộ 11 files core, và các điểm yếu còn tồn tại.
> Độ ưu tiên: 🔴 Cao — 🟡 Trung bình — 🔵 Thấp/Tùy chọn

---

### 🔴 4.1. Tính Năng Mới (Features)

#### v4.1.0 — Duplicate Detection & Skip
**Vấn đề:** Hiện tại, nếu user chạy thu thập 2 lần trên cùng 1 profile, extension sẽ tải lại toàn bộ file đã có trên máy — gây lãng phí băng thông và tạo file trùng.

**Đề xuất:**
- Lưu danh sách `downloadedUrls` vào `chrome.storage.local` theo key `downloaded_{username}`
- Trước mỗi download, check hash URL — bỏ qua nếu đã có
- Thêm nút **"Chỉ tải mới"** trong popup (skip already downloaded)
- Hiển thị badge "X files skipped" trong DOWNLOAD_DONE

**Files cần sửa:** `service-worker.js`, `popup.js`, `popup.html`

---

#### v4.2.0 — Date Range Filter (Lọc theo ngày)
**Vấn đề:** Không có cách lọc media theo khoảng thời gian. Nếu user chỉ muốn ảnh từ tháng 3/2025 đến 5/2025, họ phải tải toàn bộ rồi xóa thủ công.

**Đề xuất:**
- Thêm `tweetDate` vào mỗi media item (parse từ Snowflake ID: `tweetId >> 22 + 1288834974657`)
- Thêm filter **"Từ ngày / Đến ngày"** trong Options hoặc Popup
- Khi START_DOWNLOAD, filter danh sách theo date range trước

**Files cần sửa:** `service-worker.js`, `tweet-api.js`, `options.html`, `options.js`

> **Lưu ý kỹ thuật:** Tweet ID là Snowflake ID — timestamp có thể extract bằng:
> `new Date(Number(BigInt(tweetId) >> 22n) + 1288834974657).toISOString()`

---

#### v4.3.0 — Multi-Profile Queue (Hàng đợi nhiều profile)
**Vấn đề:** Hiện tại chỉ download 1 profile tại một thời điểm. User muốn xếp hàng NASA → SpaceX → NatGeo và đi ngủ.

**Đề xuất:**
- Thêm **Download Queue** trong popup — list các profile đã thu thập
- SW xử lý tuần tự: xong profile này → tự động chuyển profile tiếp
- Mỗi item trong queue hiển thị: username, count, status (waiting/downloading/done)
- Persist queue vào `chrome.storage.local`

**Files cần sửa:** `service-worker.js`, `popup.html`, `popup.js`, `popup.css`

---

#### v4.4.0 — Likes & Bookmarks Tab
**Vấn đề:** Extension chỉ thu thập từ trang `/media` của profile. User muốn tải media từ trang **Likes** (`/likes`) hoặc **Bookmarks** (`/i/bookmarks`).

**Đề xuất:**
- Mở rộng `page-interceptor.js` để bắt thêm GraphQL endpoint `Likes`, `Bookmarks`
- Extend `content.js` để nhận diện URL `/likes` và `/i/bookmarks`
- Thêm UI selector trong popup: "Thu thập từ: [Media] [Likes] [Bookmarks]"

**Files cần sửa:** `page-interceptor.js`, `content.js`, `popup.html`, `popup.js`

---

### 🟡 4.2. Hiệu Năng (Performance)

#### P1 — Adaptive Scroll Speed (Tốc độ scroll thích nghi)
**Vấn đề:** Tốc độ scroll hiện tại là fixed (1–6s). Nếu mạng nhanh, có thể scroll nhanh hơn; nếu mạng chậm, cần chờ lâu hơn để API kịp trả về.

**Đề xuất:**
- Đo `responseTime` trung bình của các GraphQL request gần nhất (rolling average 5 requests)
- Tự điều chỉnh `scrollDelay` trong khoảng [0.8s, 6s] dựa trên response time
- Hiển thị "Adaptive speed: 1.2s" trong FAB hoặc Snackbar

**Files cần sửa:** `content.js`, `page-interceptor.js`

---

#### P2 — IndexedDB thay thế chrome.storage.local cho Media Store
**Vấn đề:** `chrome.storage.local` có giới hạn ~10MB/item và tổng ~5MB default (có thể tăng lên `QUOTA_BYTES` với `unlimitedStorage`). Profile lớn với 10,000+ media items có thể gây lỗi quota. Hiện tại `mediaStore` lưu in-memory — mất khi SW restart.

**Đề xuất:**
- Migrate `mediaStore` sang **IndexedDB** (không có giới hạn thực tế, async, structured)
- Dùng **Dexie.js** (3KB) hoặc native IndexedDB API
- `persistSession()` → ghi vào IndexedDB thay `chrome.storage.local`
- `chrome.storage.local` chỉ dùng cho options, history, theme (nhỏ)

**Files cần sửa:** `service-worker.js` (toàn bộ storage layer)

---

#### P3 — HLS Download Song Song Per-File
**Vấn đề:** `hls-fetcher.js` tải HLS 4 segments/batch nhưng các HLS file khác nhau vẫn nằm trong queue tuần tự do `workerPool`. Với CONCURRENCY=3, có thể có 3 HLS download song song — mỗi cái dùng riêng Offscreen.

**Đề xuất:**
- Cho phép Offscreen document xử lý nhiều HLS request đồng thời (hiện chỉ xử lý 1)
- Implement message queue trong `offscreen.js` với FIFO processing
- Tăng `CONCURRENCY` cho HLS segments lên 6–8 (hiện là 4)

**Files cần sửa:** `offscreen.js`, `hls-fetcher.js`

---

#### P4 — Lazy Load mediaStore (Pagination)
**Vấn đề:** `addMediaItems()` và `getMediaList()` hoạt động trên toàn bộ Map. Với profile 50,000+ media, việc serialize/deserialize toàn bộ để persist là rất chậm.

**Đề xuất:**
- `persistSession()` chỉ ghi **incremental changes** (delta) thay vì toàn bộ store
- Track `dirtyItems` — chỉ serialize những item mới thêm/thay đổi
- Debounce hiện đã có 2s — kết hợp với delta write sẽ giảm 90% I/O

**Files cần sửa:** `service-worker.js`

---

### 🔴 4.3. Bảo Mật (Security)

#### S1 — CSRF Token Validation & Rotation
**Vấn đề:** `self.userCsrfToken` được lưu plain trong Service Worker memory. Nếu SW restart, token có thể bị stale — gây 403 lặp.

**Đề xuất:**
- Sau mỗi lần API fail với 403, trigger re-fetch CSRF token từ cookie `ct0` qua `content.js`
- Implement `refreshCsrfToken()` — inject script vào page để đọc `document.cookie` hoặc lấy qua GraphQL header từ page-interceptor
- Validate token format (`/^[a-f0-9]{32,}$/`) trước khi dùng

**Files cần sửa:** `tweet-api.js`, `service-worker.js`, `content.js`

---

#### S2 — Content Security Policy (CSP) Hardening
**Vấn đề:** `page-interceptor.js` inject vào MAIN world và có thể bị page XSS ảnh hưởng. Hiện không có validation đầu vào từ `CustomEvent`.

**Đề xuất:**
- Validate **tất cả fields** từ `X_MEDIA_FOUND` CustomEvent:
  - `url`: phải bắt đầu bằng `https://pbs.twimg.com/` hoặc `https://video.twimg.com/`
  - `tweetId`: phải khớp `/^\d{10,20}$/`
  - `username`: phải khớp `/^[a-zA-Z0-9_]{1,50}$/`
  - `type`: chỉ chấp nhận `['image', 'video', 'gif', 'hls', 'video_placeholder']`
- Thêm `Object.freeze()` trên payload trước khi gửi qua `postMessage`

**Files cần sửa:** `content.js`, `service-worker.js`

---

#### S3 — Rate Limiting cho API Calls
**Vấn đề:** `fetchVideoForTweet()` có thể được gọi hàng trăm lần liên tiếp (mỗi tweet 1 lần). X.com có thể block IP hoặc suspend account nếu quá nhiều API calls.

**Đề xuất:**
- Implement **token bucket** rate limiter: tối đa 20 API calls/phút
- Queue các request vượt limit — drain dần với delay 3s/request
- Ưu tiên Syndication API (không cần auth) trước Guest Token API

**Files cần sửa:** `tweet-api.js`

---

#### S4 — Sanitize Filename trước khi Download
**Vấn đề:** `sanitizeFolder()` trong `options.js` chỉ sanitize folder name. Tên file được tạo từ `tweetId` và `username` — username có thể chứa ký tự đặc biệt không lọc đúng.

**Đề xuất:**
- Hàm `sanitizeFilename(name)` chặt hơn: loại bỏ `\x00-\x1f`, `<>:"/\|?*`, unicode control chars
- Apply cho cả `saveFolder`, `username` trong filename, và `tweetId`
- Max filename length 200 ký tự (Windows NTFS limit 255)

**Files cần sửa:** `service-worker.js`, `lib/utils.js`

---

### 🟡 4.4. Giao Diện (UI/UX)

#### U1 — Popup v2: Tab Navigation (History, Stats, Queue)
**Vấn đề:** Popup hiện tại là single-page, chứa quá nhiều thông tin trên 1 màn hình nhỏ. Phần History đặc biệt bị chèn ép xuống dưới.

**Đề xuất:**
- Redesign popup thành **2-tab layout**:
  - Tab 1: **Main** (profile card + status + collect/download buttons) — như hiện tại
  - Tab 2: **Stats & History** (biểu đồ donut media type, danh sách lịch sử chi tiết hơn)
- Tab navigation ở bottom (icon-based) — không tăng chiều cao popup
- Animation slide khi chuyển tab

**Files cần sửa:** `popup.html`, `popup.css`, `popup.js`

---

#### U2 — Visual Progress per File (Tiến độ từng file)
**Vấn đề:** Progress bar hiện chỉ hiển thị `X / Y files`. User không biết file nào đang tải, tốc độ bao nhiêu, còn bao lâu.

**Đề xuất:**
- Hiển thị **tên file đang tải** (truncated) + **speed** (MB/s) + **ETA**
- Mini file list trong Snackbar: 3 file gần nhất (done ✓ / downloading ⟳ / failed ✗)
- Trong popup: expandable file list với status từng file

**Files cần sửa:** `content/snackbar.js`, `popup.js`, `popup.html`

---

#### U3 — Notification khi Download Xong (Chrome Notification API)
**Vấn đề:** Khi download xong, user chỉ biết nếu đang mở popup. Nếu đang làm việc tab khác, không có thông báo.

**Đề xuất:**
- Dùng `chrome.notifications.create()` để hiện system notification khi `DOWNLOAD_DONE`
- Nội dung: "✓ Đã tải 127 files — @NASA" + action button "Mở thư mục"
- Toggle trong Options: "Thông báo khi hoàn thành"
- Thêm quyền `"notifications"` vào `manifest.json`

**Files cần sửa:** `service-worker.js`, `manifest.json`, `options.html`, `options.js`

---

#### U4 — Popup Mini Mode (Compact View)
**Vấn đề:** Popup mặc định khá rộng (400px). Trên màn hình nhỏ hoặc khi cần thao tác nhanh, user muốn view gọn hơn.

**Đề xuất:**
- Thêm nút **"Compact"** (thu nhỏ) — ẩn tabs, history, folder info
- Compact mode chỉ hiển thị: badge count + 2 nút Collect/Download + status line
- Persist compact preference vào `chrome.storage.local`

**Files cần sửa:** `popup.html`, `popup.css`, `popup.js`

---

#### U5 — Options Page v2: Real-time Preview
**Vấn đề:** Options page hiện có `folder-preview` tốt, nhưng thiếu preview cho filename format và thiếu section "Export / Import settings".

**Đề xuất:**
- Thêm **Filename Preview** live: hiển thị ví dụ tên file theo format được chọn
  - `NASA_1921847562910_a3f2b.jpg` (với username mode)
  - `1921847562910_a3f2b.jpg` (default)
- Thêm **Export Settings** (JSON file) và **Import Settings** từ file
- Thêm **Reset to Default** button với confirm dialog

**Files cần sửa:** `options.html`, `options.js`

---

#### U6 — Dark Mode System (Auto-detect OS preference)
**Vấn đề:** Theme hiện tại chỉ có Manual toggle. Nếu OS đang Dark mode, user muốn extension tự theo.

**Đề xuất:**
- Thêm option thứ 3: **"System"** (tự theo OS)
- Implement `window.matchMedia('(prefers-color-scheme: dark)')` listener
- Khi system theme đổi → tự apply không cần reload
- Default value: `"system"` thay vì `"dark"`

**Files cần sửa:** `options.html`, `options.js`, `popup.js`

---

## 5. Ghi Chú Kỹ Thuật Quan Trọng

| Vấn đề | Giải pháp đã áp dụng |
|---|---|
| SW bị Chrome terminate | `chrome.alarms` keep-alive mỗi 24s khi đang tải |
| Download treo vô hạn | Timeout 90s/file + `Promise.race` |
| Script injection CSP | `chrome.scripting.executeScript` với `world: "MAIN"` |
| IDM hijack download | `isIdmHijack()` phát hiện + coi là thành công |
| Extension context dead | Flag `_contextDead` chỉ cleanup 1 lần, `console.debug` thay `warn` |
| Concurrency bị bỏ qua | Lazy worker pool thay `items.map()` |
| macOS MP4 message limit | Bỏ Offscreen cho MP4, tải thẳng qua `chrome.downloads.download(url)` |
| JSON depth quá nông | Tăng depth đệ quy từ 15 → 35 |
| Dữ liệu mất khi SW/browser restart | `persistSession()` debounce 2s → `chrome.storage.local`, restore banner trong popup |
| Ảnh rác (avatar, card, icon) lọt vào danh sách | Smart Filters: lọc URL pattern `/profile_images/`, `/profile_banners/`, `/card_img/` + ngưỡng kích thước tối thiểu |
| FAB che nút của X.com | FAB Draggable: kéo handle trục Y, clamp viewport, persist `localStorage` |
| User không biết tiến độ khi popup đóng | Progress Snackbar: `broadcastToTab()` → content.js relay → snackbar.js |
| **video_placeholder** tweetId rỗng gây cascade 404 | Guard `!/^\d{10,}$/.test(tweetId)` ở cả SW lẫn dom-scanner (v4.0.1) |
| DOM scanner ép `format=jpg` làm mất chất lượng PNG/WebP | Bỏ `searchParams.set('format','jpg')` — chỉ giữ `name=orig` (v4.0.1) |
| Snackbar hiện trên nhiều tab cùng lúc | `broadcastToTab()` chỉ gửi tab đang collecting hoặc tab gần nhất (v4.0.1) |
| FAB text bị reset khi đổi ngôn ngữ lúc đang tải | `updateFabI18n()` dùng `isDownloading` flag thay vì check text (v4.0.1) |

---

## 6. Ma Trận Ưu Tiên

| Tính năng | Độ khó | Impact | Ưu tiên |
|---|---|---|---|
| **v4.1.0** Duplicate Detection & Skip | ⭐⭐ | 🔥🔥🔥 | 🔴 Cao |
| **S2** CSP Input Validation | ⭐ | 🔥🔥🔥 | 🔴 Cao |
| **S4** Sanitize Filename | ⭐ | 🔥🔥 | 🔴 Cao |
| **U3** Chrome Notification khi xong | ⭐ | 🔥🔥🔥 | 🔴 Cao |
| **U6** Dark Mode System (auto) | ⭐ | 🔥🔥 | 🔴 Cao |
| **v4.2.0** Date Range Filter | ⭐⭐⭐ | 🔥🔥🔥 | 🟡 Trung bình |
| **P4** Incremental persist (delta write) | ⭐⭐ | 🔥🔥 | 🟡 Trung bình |
| **U2** Visual Progress per File | ⭐⭐ | 🔥🔥 | 🟡 Trung bình |
| **U5** Options Export/Import | ⭐⭐ | 🔥 | 🟡 Trung bình |
| **S3** API Rate Limiting | ⭐⭐⭐ | 🔥🔥 | 🟡 Trung bình |
| **P1** Adaptive Scroll Speed | ⭐⭐ | 🔥 | 🔵 Thấp |
| **S1** CSRF Token Refresh | ⭐⭐⭐ | 🔥🔥 | 🔵 Thấp |
| **P2** IndexedDB Migration | ⭐⭐⭐⭐ | 🔥🔥🔥 | 🔵 Long-term |
| **v4.3.0** Multi-Profile Queue | ⭐⭐⭐⭐ | 🔥🔥🔥 | 🔵 Long-term |
| **v4.4.0** Likes & Bookmarks Tab | ⭐⭐⭐⭐ | 🔥🔥🔥 | 🔵 Long-term |
| **U1** Popup 2-Tab Navigation | ⭐⭐⭐ | 🔥🔥 | 🔵 Long-term |
| **P3** HLS Song Song Per-File | ⭐⭐⭐ | 🔥 | 🔵 Long-term |
| **U4** Compact Mode | ⭐⭐ | 🔥 | 🔵 Thấp |

---

## 7. Phiên Bản Tiếp Theo — Đề Xuất Lộ Trình

```
v4.1.0  ── Duplicate Detection + S2/S4 Security + U3 Notification + U6 System Theme
v4.2.0  ── Date Range Filter + P4 Incremental Persist + U2 Visual Progress
v4.3.0  ── Multi-Profile Queue + U1 Popup v2 + U5 Options Export/Import
v4.4.0  ── Likes & Bookmarks Tab + S3 Rate Limiting + P2 IndexedDB
v5.0.0  ── Major rewrite: TypeScript migration, P1 Adaptive Speed, Full MV3 compliance
```

---

## 8. Tài Liệu Tham Khảo

- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/develop/migrate/manifest-v3-migration)
- [chrome.offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
- [chrome.downloads API](https://developer.chrome.com/docs/extensions/reference/api/downloads)
- [chrome.alarms API](https://developer.chrome.com/docs/extensions/reference/api/alarms)
- [chrome.scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting)
- [chrome.notifications API](https://developer.chrome.com/docs/extensions/reference/api/notifications)
- [IndexedDB MDN](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [Twitter Snowflake ID](https://en.wikipedia.org/wiki/Snowflake_ID)
