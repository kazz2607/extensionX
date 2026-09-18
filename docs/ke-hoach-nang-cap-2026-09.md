# ExtensionX — Kế hoạch nâng cấp sau rà soát mã nguồn

> Phạm vi: ExtensionX v6.1.8 (Manifest V3)
> Rà soát ban đầu: 16-09-2026  
> Cập nhật hiện trạng: 17-09-2026  
> Mục tiêu: giảm lỗi khi X.com thay đổi, giữ giao diện phản hồi nhanh với phiên thu thập/tải lớn, giảm bề mặt tấn công, và tạo nền tảng để mở rộng tính năng.

---

## 1. Bảng tiến độ tổng quan (Progress Dashboard)

Tính đến ngày **17-09-2026**, toàn bộ 5 pha kỹ thuật cốt lõi (Pha 0 → Pha 4) đã hoàn thành và vượt qua 100% các kiểm thử hồi quy:

| Pha | Tên pha & Mục tiêu | Ưu tiên | Trạng thái | Commit tham chiếu |
|---|---|---|---|---|
| **Pha 0** | Cổng chất lượng & Quan sát (CI/CD, regression fixtures, local telemetry) | P0 | ✅ **Hoàn tất** | `8738d3f`, `8c274b9` |
| **Pha 1** | Bảo mật & Tính đúng đắn (Message schema, validate input, cấm path traversal, diệt XSS) | P0 | ✅ **Hoàn tất** | `8738d3f` |
| **Pha 2** | Sửa logic & Độ bền MV3 (State machine, IndexedDB dedup, HLS abort & timeout recovery) | P0/P1 | ✅ **Hoàn tất** | `3d908d1`, `b19c10b` |
| **Pha 3** | Hiệu năng (Observer debounce, batch rAF, per-op progress throttle, diff render) | P1 | ✅ **Hoàn tất** | `9c1f823`, `4b9c5b7` |
| **Pha 4** | UI/UX & Accessibility (Design tokens, phase status bar, preview panel, error diagnostics) | P1 | ✅ **Hoàn tất** | `d19b4dd`, `62d7d12` |
| **Pha 6** | Hỗ trợ Telegram Web (DOM Scanner, inject nút tải xuống, bypass restrictions) | P1 | ✅ **Hoàn tất** | |
| **Pha 7** | Đóng lỗ hổng test coverage (URL normalization/dedup) — xem `ke-hoach-pha7-plus-2026-09.md` | P2 | ✅ **Hoàn tất** | |
| **Pha 8** | Refactor `popup.ts`/`fab.ts` thành module nhỏ — xem `ke-hoach-pha7-plus-2026-09.md` | P2 | ✅ **Hoàn tất** (cần smoke test tay trên Chrome thật) | |
| **Pha 9** | Interactive Download Picker — xem `ke-hoach-pha7-plus-2026-09.md` | P2 | ✅ **Hoàn tất** (cần smoke test tay trên Chrome thật) | |
| **Pha 10** | Resume đáng tin cậy (queue) — xem `ke-hoach-pha7-plus-2026-09.md` | P2 | ✅ **Hoàn tất** (cần smoke test tay trên Chrome thật) | |
| **Pha 11** | Download Recipe/Preset theo profile — xem `ke-hoach-pha7-plus-2026-09.md` | P2 | ✅ **Hoàn tất** (cần smoke test tay trên Chrome thật) | |
| **Pha 12** | Quản lý hàng đợi nâng cao (pause/reorder/retry) — xem `ke-hoach-pha7-plus-2026-09.md` | P3 | ✅ **Hoàn tất** (cần smoke test tay trên Chrome thật) | |
| **Pha 13** | Template đặt tên file linh hoạt — xem `ke-hoach-pha7-plus-2026-09.md` | P3 | ✅ **Hoàn tất** (cần smoke test tay trên Chrome thật) | |
| **Pha 14** | Xuất Manifest JSON/CSV nâng cao — xem `ke-hoach-pha7-plus-2026-09.md` | P3 | ✅ **Hoàn tất** (cần smoke test tay trên Chrome thật) | |

**Trạng thái kiểm thử hiện hành (`npm run check`):**
- ✅ `15/15 unit tests` pass
- ✅ `2/2 e2e fixture regression tests` pass
- ✅ `TypeScript (tsc --noEmit)` clean (không có lỗi typecheck)
- ✅ `ESLint` clean
- ✅ `Vite build` thành công toàn bộ 14 entrypoints

---

## 2. Kết quả baseline và nguyên tắc thực hiện

- `npm run check`: pipeline kiểm thử hợp nhất (`typecheck`, `lint`, `test`, `test:e2e`, `build`), bắt buộc chạy trước mọi commit.
- `npx tsc --noEmit`: sạch lỗi type.
- Thứ tự áp dụng đã thực hiện nghiêm ngặt: **ổn định dữ liệu + bảo mật (P0/P1) → đo đạc (P0) → tối ưu (P3) → UI (P4) → tính năng mới (P5+)**. Mỗi hạng mục đều có kiểm thử tự động đi kèm.

---

## 3. Các phát hiện và trạng thái xử lý

| Ưu tiên | Phát hiện từ mã nguồn | Rủi ro / tác động | Vị trí chính | Trạng thái & Giải pháp đã áp dụng |
| --- | --- | --- | --- | --- |
| P0 | Message handler nhận `message`/`payload` không có schema | Dữ liệu sai hoặc message không tin cậy có thể kích hoạt hành động nhạy cảm. | `background/messages.ts` | ✅ **Đã xử lý (Pha 1)**: Thêm runtime message validator với envelope 256KB, kiểm tra extension sender ID và URL tab thuộc allowlist `x.com`/`twitter.com`. |
| P0 | Content script chạy trong `MAIN` world hook `fetch`/`XHR` relay về extension | X.com là môi trường không tin cậy; dữ liệu có thể bị giả mạo. | `content/page-interceptor.ts`, `content/content.ts` | ✅ **Đã xử lý (Pha 1)**: Isolated content script không tin cậy URL hay state do page gửi; derive `tabId` và URL trực tiếp từ `sender.tab`. |
| P0 | Đường dẫn/tên file tải xuống và dữ liệu import/export đi qua nhiều lớp | Path traversal logic, tên file độc hại, queue hỏng hoặc XSS. | `downloader.ts`, `queue.ts`, `messages.ts` | ✅ **Đã xử lý (Pha 1)**: `sanitizeFolder` loại bỏ triệt để `..`, slash, control char; validate schema import queue atomic; whitelist extension. |
| P1 | Progress download broadcast tới mọi tab | Snackbar sai ngữ cảnh, tạo message thừa khi mở nhiều profile. | `background/downloader.ts` | ✅ **Đã xử lý (Pha 2 & 3)**: Chuyển sang `broadcastToTab` có filter username/tab; throttle progress per-operationId. |
| P1 | Nhiều điểm dựng UI bằng `innerHTML` | Dữ liệu từ profile/tweet có thể gây DOM-XSS. | `content/snackbar.ts`, `popup/popup.ts`, `options/options.ts` | ✅ **Đã xử lý (Pha 1, 3, 4)**: Chuyển toàn bộ render động sang `textContent` và `DocumentFragment`. Loại bỏ inline `onclick` trong options.html (CSP compliance). |
| P1 | MutationObserver/hook mạng chạy liên tục trên SPA X.com | CPU cao, quét lặp, observer rò rỉ bộ nhớ khi chuyển trang. | `dom-scanner.ts`, `content.ts` | ✅ **Đã xử lý (Pha 3)**: Thu hẹp target vào `primaryColumn`, scroll debounce 500ms, batch event qua `requestAnimationFrame`, expose teardown hook khi SPA navigation. |
| P1 | Dedup lịch sử tải lưu mảng URL trong `chrome.storage.local` (50k items) | Tốn quota/RAM, truy xuất O(n), không đồng nhất với media IndexedDB. | `scraper.ts`, `indexeddb.ts` | ✅ **Đã xử lý (Pha 2)**: Chuyển lưu trữ dedup vào IndexedDB có index URL hash, TTL 180 ngày và giới hạn LRU 50.000 items/profile. |
| P1 | Các màn hình popup/options lớn, event và state gắn chặt DOM | Khó bảo trì, lag khi danh sách dài, thiếu accessibility. | `popup.ts`, `popup.css` | ✅ **Đã xử lý (Pha 3 & 4)**: Phân trang history 50/page, diff-render queue, design tokens CSS, ARIA live cho tiến trình, preview trước download. |

---

## 4. Pha 0 — Cổng chất lượng và quan sát (P0) ✅ HOÀN TẤT

1. Thêm scripts `typecheck`, `lint`, `test`, `test:e2e` vào `package.json`; lệnh `npm run check` chạy toàn bộ pipeline.
2. Thiết lập test unit cho: chuẩn hóa media URL, `sanitizeFolder`, lọc theo ngày/từ khóa, dedup và chuyển trạng thái queue. Sử dụng fixture GraphQL đã khử dữ liệu nhạy cảm.
3. Thiết lập E2E fixture regression: kiểm thử sanitized GraphQL fixture và queue state machine transition.
4. Thêm telemetry cục bộ, opt-in: thống kê số media, thời gian scan, số lỗi, có nút xuất diagnostic JSON đã redact dữ liệu nhạy cảm (`docs/quality-gate.md`).
5. Đặt SLO ban đầu cho popup và background processing.

### Cập nhật triển khai Pha 0
- Script `npm run check` hoạt động trơn tru trong CI/CD.
- Harness kiểm thử tự động tại `test/` và `test/e2e/`.

---

## 5. Pha 1 — Bảo mật và tính đúng đắn (P0) ✅ HOÀN TẤT

### 5.1 Hợp đồng message và xác thực nguồn
- Tạo parser runtime tại `src/shared/validation.ts` và `src/shared/messages.ts`, chỉ nhận payload hợp lệ có kích thước < 256 KB.
- `messages.ts` reject mặc định; kiểm tra `sender.id === chrome.runtime.id`, `sender.tab?.id` và URL thuộc allowlist `x.com`/`twitter.com`.
- Trạng thái `tabId`, `username`, URL nhạy cảm không nhận từ page world mà suy ra từ `sender.tab`.

### 5.2 Validate input và an toàn download
- Allowlist host tải xuống chỉ gồm các domain media chính thức của X (`pbs.twimg.com`, `video.twimg.com`,...).
- Hàm `sanitizeFolder` và `sanitizeFilename` loại bỏ hoàn toàn path traversal (`..`, `\`, `/`), control characters.
- Import queue được validate nghiêm ngặt theo schema, đảm bảo tính atomic khi ghi dữ liệu.
- Thay thế toàn bộ các điểm gán `innerHTML` động bằng `textContent` và `DocumentFragment`.

---

## 6. Pha 2 — Sửa logic và độ bền MV3 (P0/P1) ✅ HOÀN TẤT

1. **State Machine**: Tạo transition logic rõ ràng cho collector và download queue. Mọi chuyển đổi trạng thái bất hợp lệ đều bị từ chối tường minh (`transitionQueueItem`).
2. **OperationId & Isolation**: Gắn `operationId` cho từng phiên tải; progress gửi đúng tab profile qua `broadcastToTab`.
3. **Dọn dẹp tài nguyên**: Khi đóng tab hoặc dừng download, hủy toàn bộ pending fetch và timer. Offscreen document tự động đóng sau 30 giây idle.
4. **Dedup IndexedDB**: Chuyển lưu trữ URL đã tải từ `storage.local` sang IndexedDB với TTL 180 ngày và LRU 50.000 items/profile.
5. **HLS Abort & Timeout Recovery**:
   - `AbortController` cho từng request HLS; hủy ngay lập tức khi người dùng bấm Stop.
   - Sửa lỗi trong `hls-fetcher.ts` nuốt `AbortError`: propagate lỗi chính xác khi `signal.aborted`.
   - Cơ chế retry exponential backoff có jitter cho network transient errors, không retry lỗi 4xx.
6. **Queue Recovery**: Khôi phục hàng đợi sau khi Service Worker restart thông qua helper `recoverQueueItemAfterRestart`.

---

## 7. Pha 3 — Hiệu năng (P1) ✅ HOÀN TẤT

1. **dom-scanner (P3-1)**:
   - Thu hẹp phạm vi `MutationObserver` từ toàn bộ `document.body` về `primaryColumn` (fallback `main → body`).
   - Debounce scroll listener 500ms.
   - Thêm `Performance.mark/measure` để đo đạc thời gian quét DOM.
   - Expose hook teardown `__disconnectDOMScanner__()` dọn dẹp observer khi chuyển trang.
2. **content.ts (P3-2)**:
   - Batch các event `X_MEDIA_FOUND` trong một khung hình `requestAnimationFrame` để tránh burst messaging.
   - SPA navigation tự động ngắt kết nối scanner cũ và tái khởi tạo observer mới theo `primaryColumn`.
3. **downloader.ts (P3-3)**:
   - Chuyển `_lastFabProgressTime` sang `Map` theo `operationId` giúp nhiều profile tải song song không tranh chấp throttle progress.
4. **popup.ts (P3-4)**:
   - `renderQueue` diff signature `id+status`: chỉ render lại DOM khi có thay đổi cấu trúc, cập nhật trực tiếp item progress.
   - `renderHistory` phân trang 50 mục/lần với nút "Xem thêm", giải quyết triệt để vấn đề giật lag khi lịch sử có hàng ngàn bản ghi.
   - Donut chart cập nhật thuộc tính SVG trực tiếp thay vì dựng lại toàn bộ DOM.

---

## 8. Pha 4 — UI/UX và Accessibility (P1) ✅ HOÀN TẤT

1. **Design Tokens (CSS)**:
   - Chuẩn hóa CSS variables `:root` và `[data-theme="light"]`: alias `--text` cho `--text-primary`.
   - Spacing scale đồng nhất `--space-1` (4px) đến `--space-6` (24px).
   - Z-index tokens có phân lớp: `--z-fab` (100), `--z-modal` (500), `--z-toast` (1000).
   - Styling trau chuốt cho `.history-show-more button`, `.status-phase-icon`, `.download-preview`, `.btn-copy-errors`.
2. **Accessibility (a11y)**:
   - Status bar có `role="status"` và `aria-live="polite"` giúp screen reader thông báo trạng thái tải thời gian thực.
   - Daterange toggle có `role="button"`, `tabindex="0"`, `aria-expanded` và hỗ trợ phím `Enter`/`Space`.
   - Status dot có thuộc tính `aria-label` mô tả trạng thái chi tiết.
3. **Status Bar theo Phase**:
   - Thay thế spinner đơn điệu bằng hiển thị trực quan theo phase cụ thể kèm icon:
     - ⏳ Chờ trang X.com (`idle`)
     - 🔍 Đang quét media (`collecting`)
     - 📦 Chuẩn bị tải
     - ⬇️ Đang tải file (`downloading`)
     - 🎞️ Đang ghép HLS stream
     - ✓ Hoàn tất tải (`done`/`success`)
     - ⚠️ Lỗi / IDM chiếm quyền / Rate limit (`error`)
4. **Download Preview Panel**:
   - Tự động hiển thị trước khi download: số lượng media sau khi lọc, số lượng bỏ qua do đã tải (`_downloadedCount`).
   - Cảnh báo rõ ràng khi concurrency ≥ 4 (tải nặng mạng) hoặc phát hiện stream HLS (mất thời gian ghép file).
5. **Error Diagnostics**:
   - Bổ sung nút **"Copy log"** trong Error Card cho phép sao chép toàn bộ danh sách lỗi (kèm dấu thời gian ISO) vào clipboard để báo lỗi nhanh chóng.

---

## 9. Pha 6 — Hỗ trợ Telegram Web (P1) ✅ HOÀN TẤT

1. **Permissions & Manifest**:
   - Bổ sung `https://web.telegram.org/*` vào `host_permissions` và `content_scripts`.
2. **DOM Injection (tg-content.ts)**:
   - Dùng `MutationObserver` lắng nghe DOM của Telegram Web.
   - Thêm nút Download (SVG icon, class `.ext-x-tg-download-btn`) trực tiếp vào thẻ ảnh/video trên giao diện Telegram (bản K/A).
3. **Download Bridge**:
   - Bắt sự kiện click tải xuống trên Telegram Web. Trích xuất URL gốc (`src` hoặc `blob:`) hoặc dùng `canvas.toDataURL()` nếu Telegram render ảnh trên canvas.
   - URL HTTP(S) được truyền qua message type `TG_DOWNLOAD_MEDIA` đến Background Script để gọi `chrome.downloads.download`.
   - URL `blob:` và `data:` được tải ngay trong tab nguồn để giữ đúng document context và tránh giới hạn kích thước runtime message.
   - Suy luận phần mở rộng từ URL/MIME, chờ phản hồi background và hiển thị trạng thái thành công/lỗi trên nút tải.
   - Background chỉ chấp nhận yêu cầu từ `https://web.telegram.org`, làm sạch tên file và giới hạn URL đầu vào.
4. **Popup UI Detection**:
   - Mở rộng logic `detectCurrentTab()` để nhận diện Telegram Web.
   - Khóa các nút chức năng của X.com khi đang ở Telegram, chỉ hiện thông báo hướng dẫn người dùng bấm nút tải trực tiếp trên trình duyệt.

---

## 10. Đề xuất tính năng mới (Phase 5+)

| Ưu tiên | Tính năng | Giá trị người dùng | Điều kiện kỹ thuật |
| --- | --- | --- | --- |
| **Cao** | Interactive Download Picker | Xem preview thumbnail và chọn/bỏ chọn từng media cụ thể trước khi tải. | Tận dụng `download-preview` panel và danh sách media trong IndexedDB. |
| **Cao** | Resume đáng tin cậy | Tiếp tục tải từ session trước sau khi đóng trình duyệt hoặc crash. | Đã có nền tảng `operationId` + `state machine` từ Pha 2. |
| **Cao** | Download Recipe / Preset | Lưu cấu hình filter, thư mục, định dạng tên file riêng cho từng profile. | Tích hợp vào options migration. |
| **Trung bình** | Quản lý hàng đợi nâng cao | Cho phép tạm dừng, đổi thứ tự (drag-drop/reorder), retry từng item trong queue. | Hoàn thiện UI Queue controls. |
| **Trung bình** | Template đặt tên file linh hoạt | Cho phép template `{username}_{date}_{tweetId}_{index}.{ext}` kèm preview thời gian thực. | Sử dụng sanitizer whitelist đã có. |
| **Trung bình** | Xuất Manifest JSON/CSV nâng cao | Báo cáo chi tiết các file đã tải kèm metadata (retweet, timestamp, resolution). | Mở rộng schema export từ Pha 0. |
| **Thấp** | Chế độ theo dõi profile (Watch) | Kiểm tra và thông báo media mới theo chu kỳ người dùng chọn. | Cần cơ chế rate-limit chặt chẽ và UX consent. |

---

## 10. Lộ trình phát hành

| Phiên bản | Nội dung | Tiêu chí hoàn tất (Definition of Done) | Trạng thái |
| --- | --- | --- | --- |
| **v5.8.0** (Stabilization) | Pha 0 + Pha 1 | CI/CD pipeline bắt buộc, runtime message schema, validation URL/path/import, triệt tiêu XSS. | ✅ **Đã hoàn thành** |
| **v5.9.0** (Reliability) | Pha 2 | State machine cho collector & queue, operationId, IndexedDB dedup, HLS abort & timeout recovery. | ✅ **Đã hoàn thành** |
| **v6.0.0** (Performance & UI) | Pha 3 + Pha 4 | Giảm 50% observer overhead, rAF batching, phân trang history, design tokens, phase status bar, preview panel. | ✅ **Sẵn sàng phát hành** |
| **v6.1.0** (Telegram Integration) | Pha 6 | Hỗ trợ tải trực tiếp ảnh/video từ Telegram Web (K & A versions). | ✅ **Đã hoàn thành** |
| **v6.1.8** (Telegram Reliability) | Pha 6 | Sửa luồng `blob:`/`data:`, giữ đúng định dạng file, xác thực sender và bổ sung regression tests. | ✅ **Đã hoàn thành** |
| **v6.2.0+** (Product Features) | Phase 5+ | Download picker (chọn từng ảnh/video), resume session sau crash, queue reordering. | 📋 Đang lập kế hoạch |

---

## 12. Backlog kỹ thuật và bảo trì định kỳ

1. **Refactor cấu trúc module `popup.ts`**:
   - Hiện tại `popup.ts` (~1.700 dòng). Đề xuất chia nhỏ thành các submodules chuyên trách:
     - `popup-state.ts`: Quản lý reactive state & storage sync.
     - `popup-messages.ts`: Xử lý `chrome.runtime.onMessage`.
     - `popup-queue.ts`: Logic hiển thị và điều khiển Multi-Profile Queue.
     - `popup-history.ts`: Logic phân trang và hiển thị Download History.
     - `popup-ui.ts`: Render DOM, status bar, preview panel, error dialogs.
2. **Modularize `fab.ts`**:
   - Tách thành floating button view, drag gesture controller và collect bridge.
3. **Nâng cao Type Safety**:
   - Loại bỏ dần các annotation `@ts-ignore` và `any` còn lại trong `popup.ts` và content scripts; thay bằng type guards và `Window` interface mở rộng.
4. **Bảo trì Dependencies**:
   - Kiểm tra định kỳ hàng tháng các bản cập nhật bảo mật của Vite, TypeScript, Rollup/Rolldown.
5. **Khả năng thích ứng với thay đổi từ X.com**:
   - Duy trì song song cơ chế bắt GraphQL API (network interceptor) và cơ chế fallback quét DOM (`dom-scanner.ts`) để đảm bảo extension vẫn hoạt động ổn định khi X thay đổi cấu trúc giao diện hoặc query ID.
