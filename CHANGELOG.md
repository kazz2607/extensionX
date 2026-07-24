# Changelog

Tất cả các thay đổi đáng chú ý của dự án **X Media Downloader** sẽ được ghi chép tại file này.

## [5.6.0] - 2026-07-24
### Feature 0: Following Cleanup Page
- **[Standalone Cleanup Tab]:** Tách tính năng tìm danh sách Following cũ nhất ra khỏi popup thành một trang giao diện riêng (`cleanup/cleanup.html`), không gian hiển thị rộng rãi, dễ theo dõi tiến trình và tìm kiếm.
- **[Background Engine]:** Khai báo hệ thống scroll ngầm tự động trong Service Worker (`following-scroll.ts`) giúp load danh sách following mà không cần mở trực tiếp tab, có thể chạy ngầm (tab inactive) nhờ offscreen heartbeat.
- **[Search & Export]:** Hỗ trợ tìm kiếm realtime theo tên, copy username hoặc export toàn bộ danh sách Following ra định dạng CSV để dễ dàng quản lý.
- **[Refactor]:** Dọn dẹp logic khỏi `popup.ts`, tối ưu hóa navigation popup.

---

## [5.5.4] - 2026-06-27
### Bug Fixes
- **[BUG-06 — Keyboard Focus Fix]:** Sửa lỗi phím tắt chỉ hoạt động ở lần đầu tiên. Nguyên nhân do Clipboard Fallback sử dụng thẻ `textarea` tạm thời và để lại selection, cũng như vấn đề Window Focus. Đã viết lại cơ chế copy fallback an toàn hơn bằng `ta.blur()`, xóa selection và bổ sung hệ thống debug log chi tiết cho `handleKeydown` trong `shortcuts.ts`.

---

## [5.5.1] - 2026-06-27
### Bug Fixes
- **[BUG-05 — Hover Detection Fix]:** Cải thiện nhận diện ảnh hover trong script `shortcuts.ts`. Thay vì dùng sự kiện `mouseover` (dễ bị chặn bởi thẻ `<div>` overlay hoặc thẻ `<a>`), chuyển sang bắt tọa độ chuột bằng `mousemove` và dùng hàm `document.elementsFromPoint(x, y)` trong event `keydown` để xuyên qua mọi lớp overlay và lấy chính xác thẻ `<img>` đang nằm bên dưới. Giúp phím tắt hoạt động 100% trên các trang web có cấu trúc DOM phức tạp (như Instagram, X.com, Pinterest).

---

## [5.5.0] - 2026-06-27
### Global Keyboard Shortcuts & Power Features

- **[FEA-04 — Global Shortcuts]:** Thêm content script độc lập `shortcuts.ts` chạy trên mọi trang web (`<all_urls>`). Hỗ trợ 5 phím tắt tiện ích khi hover chuột vào hình ảnh: `Ctrl+C` (Copy liên kết mà ảnh trỏ tới), `Ctrl+S` (Tải ảnh trực tiếp), `Ctrl+Shift+C` (Copy URL file ảnh), `Ctrl+Shift+O` (Mở ảnh tab mới), `Ctrl+Shift+G` (Tìm kiếm ngược Google Lens). Đặc biệt trên X.com, `Ctrl+C` sẽ tự động trích xuất permalink của tweet chứa ảnh đó. Tính năng được thiết kế an toàn: không ghi đè nếu đang select text hoặc nhập liệu. Mặc định TẮT.
- **[UI-07 — Shortcuts Settings]:** Thêm section "Keyboard Shortcuts (Global)" trong trang Options. Bao gồm master toggle để bật/tắt toàn bộ, và các toggle con cho từng phím tắt riêng biệt. Giao diện tự động làm mờ các option con khi master toggle tắt. Cấu hình được đồng bộ qua `chrome.storage.sync`.
- **[Core — Shortcut Download]:** Thêm `SHORTCUT_DOWNLOAD` message handler vào Service Worker để nhận yêu cầu từ `shortcuts.ts` và sử dụng `chrome.downloads.download` API tải ảnh trực tiếp, vượt qua hạn chế CORS của trình duyệt.
- **[UI-08 — Inline Toast]:** `shortcuts.ts` triển khai hệ thống notification (toast) độc lập, tự chứa inline CSS để hiển thị feedback ngay lập tức (VD: "✓ Copied link") trên mọi website mà không cần phụ thuộc vào stylesheet bên ngoài hay bị chặn bởi CSP.

---

## [5.4.0] - 2026-06-05
### Queue & Bookmark Improvements

- **[FEA-01 — Toggle Bookmark Scanning]:** Thêm option **"Quét Bookmarks cá nhân"** trong Settings (bật mặc định). Khi tắt, extension bỏ qua hoàn toàn trang `x.com/i/bookmarks` — `startCollecting()` trong `scraper.ts` kiểm tra `getCachedOptions().enableBookmarks` trước khi bắt đầu scroll. Dùng options cache TTL 5s sẵn có — 0 overhead. (`types.ts`, `options.ts`, `options.html`, `scraper.ts`)

- **[FEA-02 — Queue Export / Import]:** Xuất toàn bộ queue ra file `extensionx_queue_YYYYMMDD.json` (nút **Export** trong Queue tab header). Import từ file JSON ở máy khác hoặc lần sau (nút **Import** — file input ẩn). Logic merge: chỉ thêm items chưa có (so sánh `id`); item `downloading` được reset về `waiting`; item `done`/`error` bị bỏ qua. SW handlers: `EXPORT_QUEUE` + `IMPORT_QUEUE` với validation đầy đủ. (`queue.ts`, `messages.ts`, `popup.html`, `popup.ts`, `types.ts`)

- **[FEA-03 — File Count per Profile in Queue]:** Queue item đang `downloading` giờ hiển thị rõ số file: `📥 23 / 150 files · 15%` bên dưới tên profile (class `queue-file-count`, font xanh accent). `updateQueueItemProgress()` đồng thời cập nhật cả mini progress bar (UI-06) và file count badge — không re-render toàn bộ list. (`popup.ts`, `popup.html`)

---

## [5.3.1] - 2026-06-04
### Bug Fixes

- **[Bug 1 — Auto-download sau khi collect]:** Xóa `startNextInQueue()` khỏi handler `ADD_TO_QUEUE` — thêm vào queue không còn tự động bắt đầu download nữa. User phải bấm **Start** trong Queue tab để khởi chạy. Đồng thời fix `finally` block của `startDownload`: chỉ kéo queue item tiếp theo nếu download đến từ queue (`_fromQueue === true`) — direct download (bấm nút Download) không còn trigger queue.
- **[Bug 2 — Không có nút dừng download]:**
  - `downloader.ts`: Thêm `_stopRequested` flag + `stopDownload()` function. Mỗi worker kiểm tra flag trước khi lấy file tiếp theo — dừng sạch sau khi hoàn tất file đang tải, không abort giữa chừng.
  - `messages.ts`: Handler `STOP_DOWNLOAD` → gọi `stopDownload()`.
  - `popup.html` + `popup.ts`: Nút **⏹ Stop** màu đỏ xuất hiện trong action bar khi download đang chạy, ẩn khi rảnh. Queue tab: item `downloading` hiện nút **⏹** thay vì nút xóa bị disabled.

---

## [5.3.0] - 2026-06-04
### UI Polish

- **[UI-01 — Error Details + Retry]:** Sau khi download có lỗi, popup hiện panel màu đỏ với danh sách chi tiết (tối đa 10 entries). Nút **Retry** tái khởi động download — `skipDuplicates` tự bỏ qua file đã tải OK, chỉ retry đúng file lỗi.
- **[UI-02 — Stats Donut Realtime]:** Biểu đồ donut trong Stats tab giờ tự cập nhật khi đang thu thập nếu tab đang mở — không cần chuyển tab qua lại.
- **[UI-03 — Auto-save Indicator]:** Options page hiện `⏳ Saving...` ngay khi user gõ (trước khi debounce 500ms fire), rồi đổi thành `✓ Saved` sau khi lưu thành công.
- **[UI-04 — Empty State Onboarding]:** Khi popup mở mà chưa nhận ra profile X.com (không phải X.com, hoặc trang không phải media), hiển thị card hướng dẫn 3 bước: Mở `/media` → Start Collecting → Download.
- **[UI-05 — FAB Mini Progress]:** FAB download button hiển thị `⏳ 45% (45/100)` realtime trong khi batch download đang chạy (throttle 2s). Reset về `↓ Download` khi xong.
- **[UI-06 — Queue Live Progress Bar]:** Queue item đang `downloading` hiện mini progress bar màu xanh + text `current/total (%)` cập nhật realtime — không re-render toàn bộ list.

---

## [5.2.0] - 2026-06-04
### Performance Optimization

- **[PERF-02 — Offscreen Cache]:** Thêm module-level flag `_offscreenReady` trong `downloader.ts`. `ensureOffscreen()` giờ skip async `chrome.runtime.getContexts()` I/O call cho mỗi file HLS tiếp theo — chỉ gọi 1 lần duy nhất khi SW khởi động hoặc offscreen chưa tồn tại. Khi Chrome throw lỗi "single offscreen document", flag được set đúng thay vì bỏ qua.
- **[PERF-03 — Memory Warning 50k]:** `addMediaItems()` trong `scraper.ts` phát hiện khi `mediaStore` vượt 50.000 items và broadcast `MEDIA_MEMORY_WARNING` đến popup (1 lần duy nhất / profile để tránh spam). Popup hiển thị toast cảnh báo màu vàng nhắc user dừng thu thập và tải xuống trước.
- **[PERF-04 — CSV Export Chunked]:** `buildCSV()` giờ trả `{ csv, total, exported, truncated, nextOffset }` thay vì raw string. Giới hạn 10.000 rows/lần xuất — tránh tạo string khổng lồ trong RAM. Popup hỗ trợ pagination: bấm lại nút CSV để xuất trang tiếp theo, filename tự động thêm `_p2`, `_p3`... Offset reset tự động khi đổi profile hoặc filter.
- **[SEC-02 Patch]:** Sửa instance bị bỏ sót trong CSRF refresh path của `scraper.ts` — `(self as any).userCsrfToken = newToken` → `setCsrfToken(newToken)`.

---

## [5.1.0] - 2026-06-04
### Bug Fixes & Security Hardening (P0 + P2)

#### 🔴 Bug Fixes
- **[BUG-01 — activeDownloads Conflict]:** Xóa `const activeDownloads = new Map()` khai báo lại trong `downloader.ts` đang shadow import từ `state.ts`. Fix đồng thời `filename.split('/').pop() || ''` để tránh `string | undefined` type error.
- **[BUG-02 — Duplicate Alarm Listener]:** Xóa `chrome.alarms.onAlarm.addListener` trùng lặp trong `service-worker.ts` — listener đã được quản lý hoàn toàn trong `downloader.ts`.
- **[BUG-03 — Options I/O Cache]:** Thêm `getCachedOptions()` với TTL 5 giây trong `scraper.ts`. Thay thế toàn bộ `chrome.storage.sync.get('options')` raw calls trong `applyOptionsFilter()`, `checkAutoScroll()`, và `scrollLoop()`. Cache tự invalidate qua `chrome.storage.onChanged` khi user thay đổi Settings — giảm ~99% storage reads trong session thu thập lớn.
- **[BUG-04 — Mini Button Duplicate Skip]:** `handleDownloadTweet()` (nút ↓ trên từng tweet) giờ gọi `loadDownloadedUrls()` và `isAlreadyDownloaded()` trước khi tải, đồng thời `markDownloaded()` sau khi thành công — nhất quán với luồng `startDownload()` batch.

#### 🔵 Security
- **[SEC-01 — Path Traversal Fix]:** `sanitizeFolder()` trong `utils.ts` giờ split theo `/`, lọc từng segment riêng lẻ, và block segment thuần túy `..` / `.` — chặn path traversal kiểu `../../evil` ra ngoài thư mục Downloads.
- **[SEC-02 — CSRF Token Scoping]:** Thay `(self as any).userCsrfToken = ct0` bằng `setCsrfToken(ct0)` trong `messages.ts`; thay `(self as any).userCsrfToken` bằng module-level `userCsrfToken` từ `state.ts` trong `scraper.ts` — token không còn leak lên global SW scope.
- **[SEC-03 — URL Path Validation]:** `validateMediaItem()` trong `content.ts` thêm bước kiểm tra regex `pathname` chỉ cho phép `[/a-zA-Z0-9._\-~%]` — chặn URL injection với path bất thường từ page context.
- **[SEC-04 — Dynamic Bearer Token]:** `page-interceptor.ts` capture Authorization header từ API requests của X.com và dispatch `XMD_BEARER_TOKEN` event. `content.ts` relay lên SW qua `UPDATE_BEARER` message (dedup). `messages.ts` gọi `setDynamicBearer()`. `tweet-api.ts` thêm `getBearerToken()` dùng dynamic bearer nếu có, fallback về hardcoded — extension không còn phụ thuộc 100% vào static bearer token.
- **[SEC-05 — TypeScript @ts-ignore Cleanup]:** Loại bỏ các `@ts-ignore` quan trọng trong `messages.ts`: typed `usernames` array, optional chaining thay casting cho `existingState`, `(err: any)` type annotation thay vì untyped catch, `(mediaItems as any[])` explicit cast thay `@ts-ignore` blindly.

---

## [5.0.5] - 2026-06-04
### Bug Fixes & Improvements
- **[Queue Engine]:** Sửa triệt để lỗi Queue bị đứng (không hoạt động khi bấm Start) sau khi Service Worker vào trạng thái ngủ ngầm (sleep), bằng cách tự động khôi phục danh sách media từ IndexedDB.
- **[State Variable Fix]:** Sửa lỗi `ReferenceError` chết ngầm liên quan đến biến `downloadInProgress` (đã được thay bằng `downloadState.inProgress` trong đợt refactor).
- **[Options Auto-Save]:** Bổ sung tính năng Auto-save cho trang Cài đặt (Options) kèm theo kỹ thuật debounce cho text/number input, mang lại trải nghiệm mượt mà không cần phải bấm nút Lưu. Sửa lỗi TypeScript ngầm trong file `options.ts`.

---

## [5.0.4] - 2026-06-04
### UI & Bug Fixes
- **[Dark Mode Popup]:** Cập nhật `color-scheme: dark` trong `popup.css` để sửa lỗi viền trắng mặc định của trình duyệt xuất hiện bao quanh cửa sổ extension ở chế độ Dark Mode.
- **[Codebase Versions]:** Đồng bộ cập nhật lại toàn bộ các version strings và lịch sử bị tồn đọng (v4.2.0) trong source code và tài liệu hướng dẫn thành version mới nhất.

---

## [5.0.3] - 2026-06-04
### UI & Localization
- **[Full i18n Support]:** Quét và bổ sung `data-i18n` cho toàn bộ các text bị gán cứng trong `popup.html` và `options.html` (như Date Filters, Download Queue, Smart Filters, v.v.).
- Bổ sung hơn 40 cụm từ tiếng Anh & tiếng Việt mới vào `src/lib/i18n.ts`.
- Mở rộng hàm `applyI18nToDOM` để hỗ trợ đa ngôn ngữ cho cả `title` (`data-i18n-title`) và `placeholder` (`data-i18n-placeholder`).

---

## [5.0.2] - 2026-06-04
### Bug Fixes
- **[Vite Build Fix]:** Sửa lỗi nghiêm trọng `page-interceptor` và các scripts inject động không được bundle vào thư mục `dist/`.
- Cấu hình `vite.config.ts` để build độc lập các `web_accessible_resources`. Di chuyển `rules.json` vào thư mục `src/public` để Vite copy sang `dist/` thành công.

---

## [5.0.1] - 2026-06-04
### Sửa lỗi (Fixed)
- **[Không get được URL media sau migrate Vite/TypeScript]:** Sửa `web_accessible_resources` trong manifest từ các đường dẫn `.ts` sang `.js` đúng với artifact build. Trước đó `content.js` inject `content/page-interceptor.js`, `dom-scanner.js`, `fab.js`, `tweet-btn.js`, `snackbar.js` và `lib/i18n.js`, nhưng Chrome MV3 không cho page load vì manifest chỉ whitelist file `.ts`; hậu quả là interceptor/DOM scanner không chạy và không bắt được URL ảnh/video như bản 4.8.
- **[Content script ReferenceError]:** Khai báo trạng thái collecting riêng trong `content.ts` để tránh lỗi khi Service Worker gửi `COLLECT_STARTED_LOCAL` / `COLLECT_STOPPED_LOCAL`.

---

## [5.0.0] - 2026-06-04
### Major Rewrite (Đại tu kiến trúc)
- **[Full TypeScript Migration]:** Chuyển đổi toàn bộ 100% source code từ Vanilla JS sang **TypeScript** (`strict: true`). Giúp loại bỏ hoàn toàn các lỗi runtime tiềm ẩn, cải thiện logic, và tăng cường tính ổn định của ứng dụng.
- **[Vite Bundler & ESM]:** Áp dụng **Vite** để build và bundle extension. Hệ thống module được chuẩn hóa sang ES Modules (ESM). Tốc độ build siêu tốc và tối ưu dung lượng file phân phối.
- **[Modularization]:** Cấu trúc lại toàn bộ các module UI, Core (Service Worker), và Content Scripts. Tách biệt logic và giao diện rõ ràng.

---

## [4.8.0] - 2026-06-04
### Thêm mới (Added)
- **[Keyword / Hashtag Filter]:** Giờ đây bạn có thể lọc media theo từ khóa hoặc hashtag! Thêm ô "Keyword / Hashtag" trong phần Date Range. Plugin sẽ trích xuất nội dung text của tweet từ API và chỉ giữ lại những media nằm trong các tweet có chứa từ khóa đó (ví dụ: gõ "cats" sẽ chỉ tải các hình/video trong tweet nói về cats).
- **[U4 Compact Mode]:** Thêm nút thu gọn ở góc trên cùng bên phải Popup. Bật chế độ này sẽ thu nhỏ Popup lại, ẩn các tính năng như Queue, Stats, History, Filter để làm cho giao diện trở nên gọn gàng, siêu tốc, phù hợp cho những ai chỉ muốn "Click là tải" mà không quan tâm đến các thống kê hay thông số. Cài đặt được lưu lại (`persist`) cho những lần mở sau.

---

## [4.7.0] - 2026-06-04
### Thêm mới (Added)
- **[S3 API Rate Limiting]:** Implement **Token Bucket** rate limiter trong `tweet-api.js` — tối đa 20 calls/phút (1 token mỗi 3 giây). Áp dụng cho cả 3 layer (User Session, Syndication, Guest API). Tự động throttle thay vì drop request, giúp tránh bị X.com block IP hoặc suspend account.
- **[S1 CSRF Token Auto-Refresh]:** Khi token `ct0` bị stale và gây lỗi HTTP 403:
  - `tweet-api.js` throw lỗi `CSRF_STALE` có thể bắt được.
  - `service-worker.js` tự gửi `REQUEST_CSRF_REFRESH` đến tab X.com đang mở.
  - `content.js` đọc cookie `ct0` hiện tại và trả về token mới cho SW.
  - SW retry API call 1 lần với token mới — không cần user reload trang.

---

## [4.6.0] - 2026-06-04
### Thêm mới (Added)
- **[P3 HLS Download Song Song Per-File]:** Nâng cấp kiến trúc tải HLS:
  - **offscreen.js:** Implement FIFO queue với `HLS_MAX_PARALLEL = 2` — tối đa 2 file HLS được xử lý đồng thời thay vì tuần tự từng cái.
  - **hls-fetcher.js:** Tăng concurrency tải TS segment từ **4 → 8** per file, giảm thời gian fetch từng video HLS xuống ~2x.
  - **service-worker.js:** Chuyển từ callback-based sang **Promise + requestId** pattern, cho phép nhiều `DOWNLOAD_HLS` request lưu hành đồng thời mà không bị block.

---

## [4.5.0] - 2026-06-04
### Thêm mới (Added)
- **[P1 Adaptive Scroll Speed]:** Tự động điều chỉnh tốc độ cuộn trang dựa trên tốc độ phản hồi của GraphQL API, giúp tối ưu thời gian thu thập cho máy có mạng nhanh và tránh sót file với mạng chậm. Người dùng có thể bật/tắt trong phần Cài đặt.

---

## [4.4.0] - 2026-06-04
### Thêm mới (Added)
- **[Likes & Bookmarks Tab]:** Hỗ trợ thu thập media từ trang Likes (`/username/likes`) và Bookmarks (`/i/bookmarks`). Extension tự động gán profile ảo `_bookmarks_` và `[username]_likes` để phân biệt thư mục lưu trữ.
- **[P4/P2 Incremental Persist - IndexedDB]:** Chuyển đổi toàn bộ storage engine của `mediaStore` từ `chrome.storage.local` sang IndexedDB. Sử dụng kỹ thuật Delta Write (chỉ ghi dữ liệu mới) giúp giải quyết triệt để lỗi crash/lag khi thu thập trên 50,000 media items, vượt qua giới hạn 5MB của storage local.
- **[U2 Visual Progress per File]:** Nâng cấp trải nghiệm tải xuống hàng loạt:
  - Bắt sự kiện `chrome.downloads.onChanged` trực tiếp trong Service Worker để track tiến độ từng byte.
  - **Popup UI:** Bổ sung danh sách các file đang tải hiển thị ngay dưới thanh tiến trình, bao gồm tên file, % hoàn thành và tốc độ tải (MB/s).
  - **Snackbar UI:** Mini snackbar ở góc trang web cũng được cập nhật hiển thị tốc độ tải và tên file realtime.

---

## [4.3.0] - 2026-06-04
### Thêm mới (Added)
- **[Date Range Filter] Lọc media theo khoảng thời gian trước khi tải:** User có thể giới hạn download chỉ các media được đăng trong khoảng ngày nhất định — không cần tải toàn bộ rồi xóa thủ công.
  - **Snowflake ID → Timestamp:** `tweetDateFromId()` parse Twitter Snowflake ID bằng công thức `(BigInt(id) >> 22n) + 1288834974657` để lấy thời điểm đăng tweet chính xác. Gắn vào mỗi media item khi `addMediaItems()`.
  - **Collapsible Date Picker trong Popup (Main tab):** Thanh "📅 Date Range" có thể bấm để mở/đóng panel, hiện sau khi collect được media.
  - **4 Preset nhanh:** "7 days", "30 days", "3 months", "This year" — 1 click điền đầy cả From và To.
  - **Preview Count Realtime:** Khi đặt filter, popup query SW (`GET_MEDIA_COUNT_FILTERED`) và hiện số item khớp ngay lập tức (debounce 300ms).
  - **Badge "Active"** xuất hiện trên header Date Range khi filter đang bật — nhắc user không quên filter đang áp dụng.
  - **Clear button:** Xóa nhanh filter bằng nút × bên cạnh header.
  - **Áp dụng lúc download và CSV export:** SW filter theo date range trước khi đưa vào download queue.

### Thay đổi kỹ thuật (Technical)
- `tweetDateFromId(tweetId)`: Helper function dùng BigInt, có sanity check (2006 ≤ date ≤ now+1day).
- `addMediaItems()`: Gắn `tweetDate` (timestamp ms) vào mỗi item khi lưu vào store.
- `startDownload()`: Thêm filter bước date range sau filter type, trước duplicate detection.
- Message handler `GET_MEDIA_COUNT_FILTERED`: Đếm items theo filterType + dateFrom + dateTo cho popup preview.
- `popup.js`: State `dateFrom`, `dateTo`, `setupDateRange()`, `clearDateRange()`, `updateDateRangeUI()`, `updateDateRangeCount()`.

---

## [4.2.0] - 2026-06-04
### Thêm mới (Added)
- **[Multi-Profile Queue] Hàng đợi tải nhiều profile tuần tự:** User có thể thêm nhiều profile vào hàng đợi và extension tự động tải tuần tự (NASA → SpaceX → NatGeo...) mà không cần giám sát.
  - Queue được lưu vào `chrome.storage.local` — không mất khi reload/restart.
  - Sau khi xong profile này, SW tự động kích hoạt profile tiếp theo qua `startNextInQueue()`.
  - 5 message handlers mới: `ADD_TO_QUEUE`, `REMOVE_FROM_QUEUE`, `GET_QUEUE`, `CLEAR_QUEUE`, `START_QUEUE`.
  - Mỗi queue item có status: `waiting` | `downloading` | `done` | `error`.
  - Khi SW restart, item `downloading` được reset về `waiting` để không mất tiến trình.
- **[Popup v2] Tab Navigation 3 tabs — Main / Queue / Stats:**
  - **Tab Main:** Toàn bộ UI cũ (profile card, filter tabs, status, collect/download buttons).
  - **Tab Queue:** Danh sách hàng đợi với status badge màu sắc, nút xóa từng item, nút "Add Current" thêm profile hiện tại vào queue, nút Start/Clear.
  - **Tab Stats:** Biểu đồ donut SVG breakdown theo loại media (Images/Videos/GIFs/HLS) + legend + history list.
  - Bottom navigation bar với icon SVG, active indicator line, badge số đỏ trên Queue tab.
  - Slide animation khi chuyển tab.
- **[Nút "Add to Queue" trong action bar]:** Nút nhỏ bên cạnh Download — thêm profile hiện tại vào queue với 1 click.
- **[Options Export Settings]:** Xuất toàn bộ cài đặt ra file JSON (`extensionx_settings_YYYYMMDD.json`) qua `chrome.downloads`.
- **[Options Import Settings]:** Nạp file JSON cài đặt đã export — validate schema → merge với DEFAULT_OPTIONS → reload.
- **[Options Reset to Default]:** Đặt lại toàn bộ cài đặt về mặc định với confirm dialog.

### Cải tiến (Improvements)
- **[Popup] History được chuyển vào Stats tab** — Main tab gọn hơn, Stats tab có thêm context visual.
- **[Service Worker] Version log cập nhật** → `v4.2.0`.

---

## [4.1.0] - 2026-06-03
### Thêm mới (Added)
- **[Duplicate Detection] Tự động bỏ qua file đã tải:** Hệ thống tự động ghi nhớ các URL đã tải thành công theo từng username (lưu vào `chrome.storage.local`). Ở các lần tải sau, extension sẽ tự động so sánh và bỏ qua những file đã có, giúp tiết kiệm băng thông, thời gian và dung lượng đĩa cứng. Có thể bật/tắt tính năng này bằng checkbox "Skip downloaded" ở Popup.
- **[Security] Kiểm tra tính hợp lệ dữ liệu (S2):** Bổ sung validation chặt chẽ trong content script để loại bỏ mọi payload độc hại gửi từ context của trang web.
- **[Sanitize] Tự động làm sạch tên file (S4):** Bổ sung hàm lọc bỏ các ký tự không hợp lệ với hệ thống file khỏi chuỗi trước khi lưu, bảo vệ thư mục Downloads.
- **[Notifications] Thông báo hệ thống (U3):** Tự động hiển thị Chrome Notification sau khi hoàn tất tải. Có thể bật/tắt trong Options.
- **[Giao diện] Tự động đổi màu theo hệ thống (U6):** Thêm tuỳ chọn System trong phần Theme của trang Settings, tự động chuyển đổi sáng/tối theo HĐH.

---

## [4.0.1] - 2026-06-03
### Sửa lỗi (Fixed)
- **[BUG-A] `video_placeholder` với `tweetId` rỗng gây cascade API 404:** DOM scanner đôi khi tạo ra `video_placeholder` item mà không có `tweetId` hợp lệ (ví dụ: video thumbnail không có `article` bao quanh trên trang Media Grid). Service Worker nhận item này → gọi `fetchVideoForTweet('')` → API trả 404 hàng loạt, spam console. Fix bằng cách thêm guard `!item.tweetId || !/^\d{10,}$/.test(item.tweetId)` trước khi xử lý — bỏ qua ngay lập tức nếu tweetId không hợp lệ.
- **[BUG-B] DOM scanner ép `format=jpg` làm mất chất lượng ảnh PNG/WebP:** `dom-scanner.js` gắn `format=jpg` vào URL của mọi ảnh khi nâng lên `name=orig`. Điều này ép X.com convert ảnh PNG trong suốt/WebP sang JPEG, gây mất dữ liệu (transparency, chất lượng nén). Fix bằng cách bỏ dòng `searchParams.set('format', 'jpg')` — chỉ giữ `name=orig` để server tự trả format tốt nhất.
- **[BUG-C] `keepalive ping` log spam console mỗi 24 giây:** `console.log('[SW] keepalive ping')` gọi mỗi 24 giây gây console bị clog. Đổi thành `console.debug` để ẩn khỏi console thường, chỉ hiện trong DevTools khi bật verbose mode.
- **[BUG-D] `async forEach` trong MEDIA_FOUND không được await đúng cách:** `mediaItems.forEach(async item => ...)` không quản lý async đúng — các promise chạy song song không kiểm soát được, `applyOptionsFilter` trong nhánh `else` không được await. Fix bằng cách dùng `Promise.all(mediaItems.map(async item => ...))` với `await applyOptionsFilter()`.
- **[BUG-E] `broadcastToTab` gửi Snackbar đến TẤT CẢ tab cùng username:** Nếu user mở nhiều tab cùng profile, SNACKBAR_UPDATE sẽ hiển thị trên tất cả tab cùng lúc. Fix bằng cách ưu tiên gửi đến tab đang `isCollecting = true`; fallback là tab cuối cùng khớp username.
- **[BUG-F] FAB `updateFabI18n()` overwrite text download khi đổi ngôn ngữ lúc đang tải:** Logic cũ check `!downloadBtn.disabled && text.includes('...')` bị ngược — khi `isDownloading = true`, button bị disable → `!disabled = false` → luôn set text idle, làm mất chữ "Đang tải...". Fix bằng cách dùng `isDownloading` flag trực tiếp.
- **[BUG-G] `dom-scanner` không validate `tweetId` trước khi tạo `video_placeholder`:** Video từ DOM scanner có thể có `tweetId = ''` do không tìm được link status trên trang. Fix bằng cách thêm regex check `/^\d{10,}$/` — chỉ chấp nhận ID có ít nhất 10 chữ số số.

### Cải tiến (Improvements)
- **[CHANGELOG] Xóa entry `[3.3.0]` trùng lặp:** Hai entry `[3.3.0]` trong CHANGELOG đã được hợp nhất thành một.
- **[Log] Cập nhật onInstalled log từ `v3` → `v4.0.0`** để phản ánh đúng version hiện tại.
- **[Cleanup] Xóa dead code `MP4_FETCH_PROGRESS` handler trong popup.js:** Handler này không bao giờ được kích hoạt vì Service Worker chỉ gửi `MP4_PROGRESS`. Đây là tàn dư từ thời dùng Offscreen để fetch video.

---

## [4.0.0] - 2026-06-03

### Thêm mới (Added)
- **[Progress Snackbar] Hiển thị tiến trình download ngay trên trang X.com:** Snackbar mini xuất hiện ở giữa dưới màn hình khi bắt đầu download — không cần mở popup để theo dõi tiến độ.
  - **Glassmorphism UI:** `backdrop-filter: blur(20px)`, border mj, bo góc 16px — xẻ phóng, hiện đại.
  - **Shimmer progress bar:** Gradient `#1D9BF0 → #a855f7`, animation shimmer khi đang tải.
  - **Realtime:** Cập nhật `percent`, `current/total`, tên file đang tải sau mỗi file hoàn thành.
  - **Auto-dismiss:** Tự đóng sau 3.5 giây khi tải xong; hiển thị tóm tắt (số thành công, số lỗi nếu có).
  - **Manual close:** Nút `✕` để đóng tức thì.
  - **Slide-up/down animation:** `cubic-bezier(0.34, 1.56, 0.64, 1)` — bounce nhẹ khi hiện.
  - **Bật/tắt trong Options** (mặc định bật): Options → section Download → toggle "🔔 Hiển thị tiến trình trên trang".
- **[Architecture] `broadcastToTab()` helper trong service-worker.js:** Gửi message về tab của username đang active thông qua `chrome.tabs.sendMessage`, tương tự pattern `FAB_UPDATE` đã dùng trước đó.

---

## [3.9.0] - 2026-06-03
### Thêm mới (Added)
- **[FAB Draggable] Kéo thả FAB lên/xuống trên cạnh phải màn hình:** Thêm drag handle (3 vạch ngang) phía trên main button. User có thể kéo FAB đến vị trí thoải mái, tránh che các nút của X.com.
  - **Mouse & Touch**: Hỗ trợ cả chuột (mousedown/mousemove/mouseup) và cảm ứng (touchstart/touchmove/touchend) — hoạt động trên tablet.
  - **Chỉ kéo theo trục Y**: FAB giữ cố định `right: 20px`, chỉ di chuyển lên/xuống — phù hợp layout panel mở về bên trái.
  - **Viewport clamp**: FAB không bao giờ vượt ra ngoài viewport (giữ cách mép 8px trên/dưới), tự điều chỉnh khi resize window.
  - **Lưu vị trí**: Vị trí được lưu vào `localStorage` (key `__xmd_fab_top_pct__`) và khôi phục mỗi khi load trang — FAB luôn xuất hiện đúng chỗ user muốn.
  - **Drag vs Click**: Ngưỡng 5px — di chuyển < 5px được coi là click (không kích hoạt drag), đảm bảo click thường không bị nhầm thành kéo.
  - **Panel tự đóng khi kéo**: Panel info đóng lại ngay khi bắt đầu kéo — tránh panel nhảy lung tung.

---

## [3.8.0] - 2026-06-03
### Thêm mới (Added)
- **[Smart Filters] Lọc ảnh rác tự động khi thu thập:** Extension tự động loại bỏ ảnh không phải nội dung tweet trước khi lưu vào danh sách media. Không cần cấu hình — bật mặc định, hoạt động realtime khi scroll.
  - **Lọc avatar & banner**: Bỏ qua URL `/profile_images/` và `/profile_banners/` — những ảnh đại diện xuất hiện trong GraphQL response nhưng không phải media tweet.
  - **Lọc card preview**: Bỏ qua URL `/card_img/` — thumbnail nhỏ gắn kèm tweet có chứa link bài viết ngoài.
  - **Lọc theo kích thước**: Bỏ ảnh có `width` hoặc `height` nhỏ hơn ngưỡng tối thiểu (mặc định 150×150 px). Chỉ áp dụng khi GraphQL trả về metadata `original_info` — không lọc nhầm ảnh khi thiếu metadata.
  - **Cài đặt trong Options → 🔍 Smart Filters**: 2 toggle (avatar/card) + 2 number input (min W × H). Có thể tắt từng filter độc lập.
- **[Refactor] Metadata ảnh phong phú hơn từ page-interceptor.js:** Bổ sung `width`, `height`, `ext` (jpg/png/webp), `mediaKey` vào mỗi image item từ GraphQL — cơ sở cho Smart Filters và các feature tương lai. Filter URL rác (avatar/banner/card) cũng được áp dụng sớm ngay tại interceptor để tránh dispatch event không cần thiết.

---

## [3.7.0] - 2026-06-03

### Thêm mới (Added)
- **[Session Restore] Khôi phục phiên thu thập sau khi tắt browser:** Extension tự động lưu tiến trình thu thập vào `chrome.storage.local` sau mỗi 2 giây (debounce) và mỗi 5 lần scroll. Khi mở popup lại sau khi browser tắt/crash, một **banner thông báo** xuất hiện cho phép người dùng:
  - **"Tiếp tục"**: Nạp lại toàn bộ media đã thu thập vào bộ nhớ, sẵn sàng download ngay hoặc tiếp tục scroll thu thập thêm.
  - **"×"**: Hủy phiên cũ và xóa dữ liệu đã lưu.
  - Banner hiển thị: username, số lượng media, số lần scroll, và thời gian kể từ lần lưu cuối.
  - Dữ liệu được lưu dưới key `session_<username>` trong `chrome.storage.local` (10MB limit — đủ cho hàng nghìn items).
  - Debounce 2 giây để tránh ghi storage quá nhiều khi media flood.
  - Tự xóa session sau khi restore thành công hoặc bị hủy thủ công.
- **[Refactor] `persistSession()` / `clearSession()` module-level trong service-worker.js:** Quản lý vòng đời session rõ ràng, được gọi tại `addMediaItems()`, `stopCollecting()`, `scrollLoop()` (mỗi 5 scroll), và `CLEAR_MEDIA`.

---

## [3.6.0] - 2026-06-03
### Thêm mới (Added)
- **[Download Mini Button] Nút tải nhỏ trực tiếp trên từng tweet:** Tự động chèn icon ↓ vào thanh action bar (cạnh các nút Reply/Retweet/Like/Share) của mỗi tweet có ảnh hoặc video. Click → tải ngay media của tweet đó mà không cần mở popup hay FAB.
  - Phát hiện media thông minh: ảnh `pbs.twimg.com` (loại trừ avatar/banner), `<video>` element, và video thumbnail (chưa phát).
  - Luồng download: ưu tiên cache trong `mediaStore` → fallback gọi API (`fetchVideoForTweet`) → nếu tweet là video chưa xem, API sẽ lấy URL thực.
  - Trạng thái nút: idle (icon ↓) → loading (spinner) → done (✓ xanh lá, reset 3s) / error (✗ đỏ, reset 3s).
  - Hỗ trợ gallery tweet (nhiều ảnh): download tất cả media cùng lúc.
  - Tự cập nhật khi scroll và điều hướng SPA (không cần reload trang).
  - Theo dõi đúng username từ URL để lưu file vào đúng thư mục.
- **[Refactor] `downloadSingleItem()` module-level:** Tách hàm download một item ra scope module trong `service-worker.js` — tái dụng cho cả `startDownload()` (batch) lẫn `DOWNLOAD_TWEET` (single), tránh duplicate code.

---

## [3.5.5] - 2026-06-02
### Sửa lỗi (Fixed)
- **[FAB] Bấm nút `__xmd_main_btn__` không trigger download:** Logic cũ check `!downloadBtn.disabled` để quyết định có download hay không — nhưng `downloadBtn` bị disable ngay sau lần download đầu tiên và không bao giờ được enable lại (vì FAB không nhận được tín hiệu download xong). Sửa bằng cách thêm flag `isDownloading` riêng biệt trong `fab.js`, độc lập với trạng thái `disabled` của button. Main btn giờ check `isDownloading` thay vì `downloadBtn.disabled`.
- **[FAB] `isDownloading` không reset sau khi download xong:** Service Worker chỉ broadcast `DOWNLOAD_DONE` lên popup qua `broadcastToPopup()`, không gửi tín hiệu gì về tab chứa FAB. FAB không biết download đã xong → `isDownloading = true` mãi mãi → bấm lần 2, 3... không có tác dụng. Sửa bằng cách thêm `FAB_UPDATE { state: 'DOWNLOAD_DONE' }` gửi về tab qua `chrome.tabs.sendMessage()` trong `finally` block của `startDownload()`.

---

## [3.5.4] - 2026-06-02
### Sửa lỗi (Fixed)
- **[Spam lỗi trên trang chrome://extensions] "Extension context invalidated — content script disconnected" xuất hiện hàng loạt:** Mỗi lần `X_MEDIA_FOUND` fire (rất thường xuyên khi scroll) hoặc `MutationObserver` detect DOM thay đổi sau khi SW reload, `handleContextInvalidated()` bị gọi lặp đi lặp lại — mỗi lần gọi đều `console.warn()` và Chrome log toàn bộ vào trang errors tạo ra hàng trăm dòng lỗi. Sửa bằng hai cách: (1) Thêm flag `_contextDead` đảm bảo hàm cleanup chỉ chạy **đúng 1 lần duy nhất** — tất cả các lần gọi tiếp theo đều early-return ngay lập tức. (2) Đổi `console.warn` → `console.debug` — Chrome chỉ đẩy `warn`/`error` vào trang extensions errors, `debug` chỉ hiện trong DevTools console.

---

## [3.5.3] - 2026-06-02
### Sửa lỗi (Fixed)
- **[Xung đột IDM] File download không vào đúng thư mục username khi bật IDM Integration Module:** IDM Integration Module (của Internet Download Manager) hook vào Chrome Downloads API và cancel download của Chrome ngay lập tức (~100–500ms), rồi tự tải file theo cách riêng — bỏ qua hoàn toàn tham số `filename` mà extension truyền vào qua `chrome.downloads.download()`. Hậu quả: file không được lưu vào `{saveFolder}/{username}/images|videos|gifs/`, progress counter báo "X failed" dù IDM đã tải thành công. Sửa bằng cách thêm hàm `isIdmHijack()` phát hiện IDM qua dấu hiệu đặc trưng (download bị interrupted trong vòng 2 giây + error là `USER_CANCELED` hoặc rỗng), sau đó coi đó là thành công thay vì lỗi — tránh counter sai và popup báo lỗi. Extension cũng broadcast `IDM_DETECTED` để popup hiển thị cảnh báo màu cam, nhắc người dùng tắt IDM Integration Module nếu muốn file vào đúng thư mục.

---

## [3.5.2] - 2026-05-29
### Sửa lỗi (Fixed)
- **[Concurrency bị bỏ qua] Tải tất cả file cùng lúc, không giới hạn theo setting:** Code cũ dùng `items.map()` gọi `chrome.downloads.download()` cho **toàn bộ** item ngay lập tức trước khi vòng lặp concurrency kịp chạy — cài đặt "Số file tải đồng thời" trong Options hoàn toàn bị bỏ qua. Sửa bằng **worker pool lazy**: đúng CONCURRENCY worker chạy cùng lúc, mỗi worker tự lấy item tiếp theo từ queue khi rảnh — đảm bảo đúng số download thực sự song song.

---

## [3.5.1] - 2026-05-29
### Sửa lỗi nghiêm trọng (Critical Fixes)
- **[Download dừng giữa chừng] Service Worker bị Chrome terminate sau ~5 phút:** MV3 Service Worker có thể bị Chrome kill trong lúc tải file lớn, khiến toàn bộ hàng đợi download mất. Sửa bằng cách thêm `chrome.alarms` keep-alive (ping mỗi 24 giây) trong suốt quá trình tải — đảm bảo SW không bị terminate dù tải hàng trăm file.
- **[Download treo vô hạn] `downloadFile()` không có timeout:** Nếu Chrome không fire `onChanged` cho một file (network glitch, server timeout...), Promise treo mãi mãi, blocking toàn bộ batch. Sửa bằng cách thêm timeout 90 giây cho mỗi file — nếu quá thời gian, file tự động bị tính là `failed` và download tiếp tục bình thường.
- **[Batch bị block] `Promise.all()` không cô lập lỗi:** Một item treo trong batch sẽ kéo toàn bộ `Promise.all` treo theo. Sửa bằng cách wrap mỗi item với `Promise.race([downloadOne, batchTimeout])` riêng — 1 item fail không bao giờ block các item còn lại.
- **[Extension context invalidated] Content script không cleanup sau SW reload:** Sau khi SW bị reload/update, `chrome.runtime.sendMessage()` ném `Extension context invalidated`. `MutationObserver` (`navObserver`) vẫn chạy và tiếp tục throw lỗi mỗi khi DOM thay đổi. Sửa bằng cách thêm `isExtensionValid()` guard và `handleContextInvalidated()` tự động disconnect observer khi context chết.

### Sửa lỗi (Fixed)
- **[HLS crash] `extractBestStream()` trả `null` không có guard:** Nếu HLS master playlist không có stream hợp lệ, hàm trả `null` dẫn đến `fetchHLS(null)` crash. Thêm null check rõ ràng với error message mô tả.
- **[Offscreen race condition] `ensureOffscreen()` phụ thuộc biến global bị mất khi SW restart:** Sau khi SW restart, biến `globalCreatingOffscreen = null` nhưng offscreen document vẫn tồn tại. Lần gọi tiếp theo tạo lại offscreen → Chrome throw lỗi bị nuốt silently → HLS fail. Sửa bằng cách luôn check `chrome.runtime.getContexts()` trực tiếp, bỏ hoàn toàn biến global.
- **[Double-resolve] Race condition trong `downloadFile()` callback:** `chrome.downloads.search` và `onChanged` có thể cùng resolve một Promise. Thêm `settled` flag + `safeResolve/safeReject` để đảm bảo Promise chỉ settle đúng một lần.
- **[Popup mất trạng thái] Download state không được restore khi popup mở lại:** Khi popup bị đóng và mở lại giữa lúc đang tải, `isDownloading = false` và progress bar bị ẩn — người dùng có thể vô tình trigger download thêm lần nữa. Sửa bằng cách query `GET_DOWNLOAD_STATE` từ SW khi popup khởi động.

### Thêm mới (Added)
- **Permission `alarms`:** Thêm vào `manifest.json` để hỗ trợ `chrome.alarms` keep-alive.

---

## [3.5.0] - 2026-05-27
### Sửa lỗi nghiêm trọng (Critical Fixes)
- **[macOS] Không get được media/image:** Sửa lỗi `page-interceptor.js` không chạy được trong MAIN world trên một số môi trường macOS do `world: "MAIN"` không được áp dụng. Chuyển sang cơ chế inject script thủ công từ `content.js` — đảm bảo interceptor luôn chạy đúng context trên mọi hệ điều hành.
- **[macOS] Lỗi tải video — "Cannot read properties of undefined (reading 'download')":** `chrome.downloads` không có trong Offscreen Document. Sửa bằng cách chuyển toàn bộ `chrome.downloads.download()` về Service Worker; Offscreen Document chỉ trả dữ liệu dưới dạng base64 data URL.
- **Chỉ tải được 1–2 video đầu, phần còn lại fail — "The message port closed before a response was received":** Lỗi xảy ra do file MP4 lớn (50–200 MB) được encode sang base64 (+33%) trước khi gửi qua Chrome message API, vượt giới hạn 64 MB và gây timeout. Sửa bằng cách **bỏ Offscreen hoàn toàn cho video/GIF MP4** — tải thẳng qua `chrome.downloads.download(url)` từ Service Worker. Offscreen chỉ giữ lại cho HLS (ghép TS segments).
- **Bỏ sót media trên profile nhiều video:** Tăng giới hạn độ sâu đệ quy JSON từ 15 → 35 để parse video từ Retweet/quoted tweet (thường nằm rất sâu trong cấu trúc GraphQL). Bỏ điều kiện `video_info` trong hook `JSON.parse` để bắt cả ảnh-only tweet.
- **Bỏ sót media đợt tải đầu tiên:** Bỏ cờ `isCollecting` gate trong content.js — extension giờ lắng nghe media passively ngay khi vào trang, không cần bấm "Bắt đầu" trước. Đợt tải ban đầu ~20 tweet không còn bị bỏ qua.
- **`addMediaItems()` không trả về giá trị:** Hàm thiếu `return newCount` khiến `updateFAB()` không bao giờ được gọi sau khi thêm media mới.
- **Progress bar MP4 không cập nhật:** `popup.js` đọc sai field `payload.loaded` thay vì `payload.bytesReceived` từ `MP4_FETCH_PROGRESS`.

### Tối ưu hóa (Improvements)
- **Inject `page-interceptor.js` sớm hơn:** Inject ngay lập tức ở `document_start` (không qua `DOMContentLoaded`) để bắt được `JSON.parse` và `fetch` từ milisecond đầu tiên trang tải.
- **Xóa khai báo trùng lặp `page-interceptor.js`:** Bỏ entry trong `manifest.json` content_scripts, để `content.js` quản lý toàn bộ — tránh chạy script 2 lần.
- **Timeout 5 phút cho HLS:** Thêm `Promise.race` với timeout 5 phút cho quá trình tải HLS qua Offscreen — tránh treo vô hạn cho video dài.
- **Xóa script tag thừa trong `offscreen.html`:** `hls-fetcher.js` đã được `offscreen.js` import trực tiếp, không cần load thêm qua `<script>` tag.
- **Sync trạng thái collecting sau reload trang:** Service worker gửi lại `COLLECT_STARTED_LOCAL` cho content.js khi `PAGE_LOADED` nếu đang trong phiên thu thập — tránh mất media khi F5.

---

## [3.4.2] - 2026-05-27
### Sửa lỗi (Fixed)
- **Auto Scroll:** Sửa lỗi nghiêm trọng khiến tiện ích tiếp tục cuộn trang vô hạn ngay cả khi người dùng chuyển sang trang khác (như trang chủ hoặc một bài đăng cụ thể). Cải thiện logic để dừng thu thập ngay lập tức khi phát hiện không còn ở trang Media.

---

## [3.4.1] - 2026-05-27
### Sửa lỗi (Fixed)
- **Auto Scroll:** Cải thiện độ ổn định của tính năng tự động cuộn trang. Xóa bỏ cuộn mượt (smooth) để tận dụng tối đa thời gian chờ mạng, kết hợp thủ thuật (scroll trick) để buộc X.com tải thêm ảnh.
- **Auto Scroll:** Tạm dừng thông minh (pause) khi người dùng thu nhỏ trình duyệt hoặc chuyển tab, tránh tình trạng báo lỗi sai do X.com ngừng render.

---

## [3.4.0] - 2026-05-27
### Thêm mới (Added)
- **Đa ngôn ngữ (i18n):** Hỗ trợ Tiếng Anh (Mặc định) và Tiếng Việt. Bạn có thể thay đổi ngôn ngữ ngay trong trang Cài đặt (Options).
- **Giao diện Options mới:** Bổ sung phần Cài đặt Giao diện (Appearance) chứa tùy chọn đổi Ngôn ngữ và Chủ đề (Theme) gọn gàng hơn.

---

## [3.3.0] - 2026-05-27
### Thêm mới (Added)
- **Light / Dark Mode Toggle:** Thêm nút chuyển đổi giao diện (biểu tượng ☀️/🌙) ngay trên thanh Header của cả Popup và trang Cài đặt. Trạng thái được lưu vào `chrome.storage.local` và đồng bộ tự động giữa hai trang.
- **Định dạng tên file Username_TweetID_Serial:** Thêm tùy chọn mới trong phần Download của trang Cài đặt. Khi bật, file sẽ được đặt tên theo định dạng `username_TweetID_randomSerial.ext` (ví dụ: `NASA_1234567890_ab3f2.jpg`), thay vì chỉ dùng TweetID như trước. Giúp dễ nhận biết nguồn gốc file khi lưu vào cùng một thư mục.

### Sửa lỗi (Fixed)
- **Counter đếm media trên trang Home / Explore:** `content.js` relay toàn bộ `X_MEDIA_FOUND` bất kể người dùng đang ở trang nào. Sửa bằng cách thêm flag `isCollecting` — chỉ đếm và gửi media lên Service Worker khi đang trong phiên thu thập do người dùng chủ động kích hoạt. Badge số lượng trên icon extension giờ chỉ tăng khi đang thu thập trên trang profile/media.

---

## [3.2.0] - 2026-05-26
### Sửa lỗi & Tối ưu (Fixed & Improved)
- **Bypass CORS cho video NSFW:** Đưa luồng truy vấn API nội bộ về Service Worker, kết hợp sử dụng User Cookie (`ct0`) để gọi trực tiếp endpoint `x.com/i/api`. Khắc phục hoàn toàn lỗi HTTP 404/403 khi lấy video NSFW (18+).
- **MAIN World Interceptor:** Cấu hình `page-interceptor.js` chạy trong không gian `MAIN` thông qua `manifest.json` ở mốc `document_start`. Đảm bảo đánh chặn GraphQL API hoàn hảo trước khi bị inline script của Twitter chặn đứng.
- **Hook JSON.parse & XHR:** Bắt trực tiếp dữ liệu React `__INITIAL_STATE__` từ `JSON.parse` và luồng phân trang cũ từ `XMLHttpRequest`. Đảm bảo quét sạch 100% video URL trên màn hình ngay khi cuộn chuột.
- **Tránh gọi API thừa (Duplicate Check):** Cải tiến `dom-scanner` và Service Worker để bỏ qua các thẻ video nếu URL gốc của chúng đã được Interceptor thu thập thành công. Giảm tải request báo lỗi 404 vô ích.

---

## [3.1.0] - 2026-05-26
### Sửa lỗi (Fixed)
- **CORS & Syndication API:** Khắc phục triệt để lỗi không lấy được video URL do chính sách CORS của Twitter Syndication API bằng cách áp dụng `declarativeNetRequest` (Ghi đè `Access-Control-Allow-Origin` sang `*`). 
- **DOM Scanner Video:** Cải thiện khả năng phát hiện video thumbnail (ảnh đại diện cho video) trong tab Media của Twitter, giúp lấy được video ngay cả khi Twitter không render thẻ `<video>`.
- **Offscreen Download API Error:** Sửa lỗi `Cannot read properties of undefined (reading 'download')`. Dịch chuyển tác vụ gọi `chrome.downloads` từ Offscreen Document (nơi không có quyền truy cập API) sang Service Worker để tải video MP4/HLS thành công.
- Loại bỏ các HTTP Header `Origin` và `Referer` bị cấm trong Fetch API khi dùng extension.

---

## [3.0.0] - 2026-05-26
### Thay đổi (Changed)
- **Kiến trúc Tải Xuống mới (Direct Download):** Loại bỏ hoàn toàn quá trình tạo file ZIP khổng lồ ngốn RAM. Chuyển sang tải trực tiếp từng file thông qua API `chrome.downloads`.
- **Cấu trúc thư mục:** Tự động tạo thư mục con theo tên người dùng bên trong thư mục `Downloads` mặc định của Chrome (ví dụ: `Downloads/[username]/`).
- **Giao diện Options mới:** Cập nhật trang cài đặt, bổ sung Realtime Preview cho cấu trúc đường dẫn thư mục tải về.
- **Tối ưu hoá Popup:** Nút "Tải ZIP" được đổi thành "Download", nút xuất CSV được làm gọn gàng hơn. Xoá bỏ thanh trạng thái tạo file nén.

### Thêm mới (Added)
- **Tùy chọn Thư mục Cơ sở:** Cho phép người dùng tuỳ biến thư mục cha trong Downloads (vd: `Downloads/X_Media/[username]`).
- **Tùy chọn Gộp Thư mục (Flat Username Directory):** Thêm cài đặt cho phép gộp chung tất cả media vào folder `[username]` thay vì chia tách thành `images`, `videos`, `gifs`.
- **Quản lý Download Queue:** Có thể điều chỉnh số lượng tải song song (Concurrency) từ 1 đến 5 để tránh quá tải kết nối.

### Loại bỏ (Removed)
- Loại bỏ thư viện `jszip` và API Offscreen Document vì không còn cần thiết.

---

## [2.0.0] - 2026-05-26
### Thêm mới (Added)
- **Hỗ trợ Video HLS (.m3u8):** Xây dựng module `hls-fetcher` nội bộ để parse playlist, tải song song các file phân mảnh (TS segment) và ghép lại thành video `.mp4` hoàn chỉnh.
- **DOM Scanner (Fallback):** Bổ sung trình quét cấu trúc HTML với `MutationObserver`. Cho phép phát hiện và lưu lại ảnh/video bị sót khi GraphQL Interceptor hoạt động không hiệu quả do API thay đổi.
- **Floating Action Button (FAB):** Bổ sung Widget trực tiếp trên trang giao diện của X.com. Cho phép thao tác nhanh (Thu thập, Tải xuống) và xem trạng thái realtime mà không cần mở Popup extension.
- **Bộ Lọc Phân Loại (Filter Tabs):** Thêm các tab phân loại `All`, `Images`, `Videos`, `GIFs` trên Popup. Cho phép người dùng lọc và chọn tải riêng từng loại.
- **Trích xuất CSV:** Tính năng xuất danh sách URL đã quét ra file Excel/CSV.
- **Theo dõi Tốc độ & Trạng thái:** Hiển thị thời gian ước tính, trạng thái tải từng phần (cho HLS và ZIP) cùng tỷ lệ thành công/lỗi.

### Sửa lỗi (Fixed)
- Hỗ trợ tốt hơn kiến trúc SPA (Single Page Application) của Twitter, đảm bảo tool tự làm mới trạng thái khi người dùng điều hướng qua lại giữa các profile.

---

## [1.0.0] - (Phase 1)
### Thêm mới (Added)
- **GraphQL Interceptor:** Nhúng đoạn mã bắt luồng API của X.com (`UserMedia`, `TweetDetail`, `UserTweets`) để trích xuất nguyên bản (raw url) các ảnh lớn và video băng thông cao.
- **Kiến trúc MV3:** Cài đặt bộ core Manifest V3 (Service Worker, Content Script, Popup).
- **Auto-scroll:** Cho phép tiện ích tự động cuộn trang liên tục để nạp thêm các tweet cũ.
- **Lưu trữ Blob:** Lưu trữ các URL tìm được trong bộ nhớ, tính toán dữ liệu và nén thành 1 file ZIP đơn giản tải xuống.
