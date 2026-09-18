# Rà soát toàn bộ Pha + Roadmap triển khai tiếp (Pha 7+)

> Kế hoạch kế tiếp của `ke-hoach-nang-cap-2026-09.md` — rà soát độc lập lại Pha 0-6 và lên roadmap cho backlog kỹ thuật + Phase 5+.

## Context

`docs/ke-hoach-nang-cap-2026-09.md` khai báo Pha 0-4 và Pha 6 là "✅ Hoàn tất". Trước khi lên kế hoạch tiếp, cần xác nhận độc lập rằng code thật khớp với các claim đó (không chỉ tin vào tài liệu), rồi mới thiết kế các pha tiếp theo cho backlog kỹ thuật và 6 tính năng "Phase 5+" đã đề xuất trong tài liệu. Đã chạy 3 Explore agent song song đọc trực tiếp source code để verify, và khảo sát kiến trúc hiện tại (popup.ts, fab.ts, data model, IndexedDB, filename, export) làm cơ sở thiết kế các pha mới.

Người dùng đã chọn: **refactor popup.ts/fab.ts trước khi thêm tính năng mới**, và phiên lên plan này **chưa code**.

---

## Phần 1 — Kết quả rà soát lại toàn bộ Pha

Tất cả claim "Hoàn tất" đều **CONFIRMED bằng code thật** (file:line cụ thể đã được agent trích dẫn), chỉ có 2 điểm lệch nhỏ, không phải lỗi chức năng:

| Pha | Điểm lệch phát hiện | Mức độ | Xử lý |
|---|---|---|---|
| Pha 0 | Tài liệu nói có unit test cho "chuẩn hóa media URL" và "dedup" — thực tế **không có test nào** cho `name=orig` rewrite (`messages.ts:104`) hay `normalizeUrlForDedup` (`scraper.ts:496`) | Thiếu test coverage, không phải bug | → Pha 7 dưới đây |
| Pha 4 | Tài liệu liệt kê "🎞️ Đang ghép HLS stream" như 1 trạng thái riêng — thực tế đó chỉ là biến thể text/icon của state `downloading` (`setStatus`, popup.ts:1401), không phải state thứ 6 độc lập | Sai chữ trong tài liệu, không phải bug | Không cần sửa code; có thể sửa lại mô tả trong doc nếu muốn |

Các nhánh đã verify kỹ và **đúng 100%** với code: message schema 256KB + sender/allowlist check (`shared/messages.ts`, `background/messages.ts`), sanitizeFolder/Filename chống path traversal (`shared/validation.ts:78-102`), toàn bộ `innerHTML=` còn lại đều là template tĩnh (không có dữ liệu động → không phải XSS), state machine `queue-state.ts` (waiting→downloading→{waiting,done,error}, error→waiting, done terminal), `operationId` + `broadcastToTab` theo tab/username, IndexedDB dedup TTL 180 ngày + cap 50.000/profile (đúng như tài liệu ghi "per profile"), HLS AbortController + backoff+jitter + không retry 4xx, `recoverQueueItemAfterRestart`, dom-scanner primaryColumn+debounce+teardown hook, rAF batching, per-operationId throttle map, popup diff-render + pagination 50/trang, design tokens CSS, a11y (role/aria-live/aria-expanded), preview panel, copy-log diagnostics, Telegram manifest + `detectCurrentTab`.

**Kết luận:** nền tảng kỹ thuật Pha 0-6 vững, có thể xây tiếp lên trên mà không cần vá lại gì trước — trừ 1 việc nhỏ (test gap) đưa vào Pha 7.

---

## Phần 2 — Kiến trúc hiện tại làm cơ sở cho các pha mới

- **popup.ts** (1741 dòng) đã có 1 tiền lệ module hoá: `following-panel.ts`, nhận dependency qua object `{ showToast, sendBG }` — đây là pattern để tái sử dụng khi tách tiếp.
- **Data model**: `QueueItem`/`MediaItem`/`DownloadOptions`/`QueueExportData` tại `src/types.ts`; state machine tại `src/shared/queue-state.ts`.
- **Resume hiện tại chỉ là requeue**: `recoverQueueItemAfterRestart` reset `downloading`→`waiting`, KHÔNG lưu checkpoint tiến độ; `mediaStore` in-memory mất khi SW restart, phải load lại từ IndexedDB.
- **IndexedDB** (`indexeddb.ts`) chỉ có 2 store: `media_items`, `downloaded_urls` (TTL+LRU). Không có store nào cho preset/recipe. Settings hiện là 1 blob toàn cục (`chrome.storage.sync['options']`) — không theo profile.
- **Filename**: `buildFilename`/`buildDownloadPath` (`downloader.ts:663-697`) là pattern cứng `[username_]<tweetId|mediaKey>_<rand5>.<ext>`, chưa có template token.
- **fab.ts** (671 dòng): 1 IIFE, chưa module hoá, nhưng giao tiếp với `content.ts` hoàn toàn qua CustomEvent (`XMD_FAB_ACTION`/`XMD_FAB_UPDATE`) — tách module rủi ro thấp vì đã lỏng khớp (loosely coupled) sẵn.
- **Export hiện có**: 4 cơ chế tách rời (CSV media hiện tại, JSON queue, JSON settings, JSON diagnostics) — **download history (`download_history`, cap 20) chưa có export nào**.

---

## Phần 3 — Roadmap các pha tiếp theo

### Pha 7 — Đóng lỗ hổng test coverage ✅ HOÀN TẤT
- Tách 2 hàm pure (`normalizeUrlForDedup`, `normalizeMediaUrlToOrig`) từ `scraper.ts`/`messages.ts` (nơi chúng inline/không export, không test được vì phụ thuộc IndexedDB/chrome.* tại module scope) ra `src/shared/validation.ts` — không đổi logic, chỉ thêm type và export.
- `scraper.ts`/`messages.ts` giờ import lại 2 hàm này từ shared thay vì định nghĩa/inline riêng.
- Thêm test case mới trong `test/validation.test.ts` (`'normalizes media URLs for dedup and forces video URLs to original quality'`).
- Kết quả: `npm run check` xanh (16/16 unit test, 2/2 e2e, typecheck/lint/build sạch).

### Pha 8 — Refactor `popup.ts` & `fab.ts` ✅ HOÀN TẤT
- `popup.ts`: 1741 → 1199 dòng. Tách 6 module theo pattern `following-panel.ts` (deps object, tự query DOM riêng): `status-bar.ts`, `toast.ts`, `donut-chart.ts`, `history-panel.ts`, `date-range.ts`, `queue-panel.ts`. Giữ nguyên trong popup.ts: DOM ref cache, init sequence, `setupListeners`, `listenToMessages` (message router — giữ nguyên tại popup.ts như phương án dự phòng đã duyệt, chỉ đổi thành gọi vào các module mới), profile/tab state, preview panel.
- `fab.ts`: 671 dòng (1 IIFE) → entry point 28 dòng + 5 module: `fab-css.ts`, `fab-dom.ts`, `fab-drag.ts`, `fab-i18n.ts`, `fab-events.ts`.
- Không đổi hành vi — chỉ di chuyển code; dọn 1 biến chết (`_toastTimer` không dùng) khi tách toast.ts.
- Verify: `npm run check` xanh (typecheck/lint/16 unit test/2 e2e/build 14 entrypoints). Build xác nhận cả `dist/popup/popup.js` và `dist/content/fab.js` bundle đúng, không còn `import`/`export` sót lại (Vite bundle content script thành IIFE như cũ).
- Playwright browser test (`npm run test:browser`, ngoài phạm vi `npm run check`) fail với timeout chờ Service Worker — đã xác minh lỗi này **có sẵn trước Pha 8** (test lại trên code cũ cho cùng lỗi), là hạn chế môi trường sandbox, không phải regression.
- **Còn thiếu so với plan gốc**: chưa thực hiện smoke test thủ công trên Chrome thật (X.com + Telegram Web) — môi trường hiện tại không có trình duyệt tương tác để làm; cần người dùng tự xác nhận sau khi build lại extension.

### Pha 9 — Interactive Download Picker ✅ HOÀN TẤT
- Backend: `DownloadOptions.selectedUrls?: string[]` (`types.ts`) + validate chặt trong `isValidDownloadOptions` (cap 2000 URL, mỗi URL phải qua `isTrustedMediaUrl`) — chặn mảng không giới hạn/không tin cậy lọt qua (`shared/validation.ts`). `startDownload` (`downloader.ts`) lọc thêm theo `selectedUrls` ngay sau filterType, trước date/keyword/dedup. Message mới `GET_MEDIA_ITEMS_FILTERED` (`background/messages.ts`) trả `{items, total, truncated}`, cap `PICKER_ITEM_LIMIT=200`, lọc type/date/keyword giống hệt `GET_MEDIA_COUNT_FILTERED` (không lọc skipDuplicates — picker hiện mọi item khớp, dedup vẫn áp dụng lúc tải thật).
- Frontend: module mới `src/popup/download-picker.ts` (theo pattern deps-object của Pha 8) — lưới thumbnail (`<img>` cho ảnh, icon cho video/gif/hls vì X mã hoá GIF thành mp4 nội bộ, không có URL ảnh tĩnh), chọn/bỏ từng item hoặc tất cả, cảnh báo khi bị cắt bớt do vượt cap.
- `popup.ts`: refactor `beginDownload(extraOptions)` dùng chung giữa nút Download thường và nút "Tải mục đã chọn" của picker — tránh lặp lại sequence set trạng thái UI + gọi `START_DOWNLOAD`.
- `popup.html`/`popup.css`: thêm tab "Picker" (vị trí 2, sau Main) + panel shell JS tự inject (giống `panel-cleanup`), CSS grid tái dùng token màu/spacing sẵn có, không tạo token mới.
- Test: thêm case cho `selectedUrls` trong `test/validation.test.ts` (hợp lệ / quá dài / URL không tin cậy). `npm run check` xanh (17 unit test, 2 e2e, typecheck/lint/build).
- **Ngoài phạm vi v1** (đã ghi rõ trong plan): không tích hợp Queue, không auto-refresh khi đang collect, không virtualize — chặn cứng ở 200 item, hướng dẫn thu hẹp bằng filter/date range có sẵn.
- **Chưa làm**: smoke test thủ công trên Chrome thật — môi trường hiện tại không có trình duyệt tương tác.

### Pha 10 — Resume đáng tin cậy (ưu tiên Cao)
- Không tạo cơ chế checkpoint mới từ đầu — tái dùng store `downloaded_urls` (đã có TTL/LRU) làm nguồn "đã xong" khi resume.
- Khi `startNextInQueue` chạy lại sau SW restart, đảm bảo LUÔN so khớp với `downloaded_urls` cho username đó để bỏ qua item đã tải, không chỉ khi `skipDuplicates` được bật.
- Cần rà kỹ tương tác `queue.ts` ↔ `downloader.ts` ở đường resume để xác nhận không bỏ sót state nào.

### Pha 11 — Download Recipe/Preset theo profile (ưu tiên Cao)
- Lưu trữ mới: key `preset_${username}` trong `chrome.storage.local` (hoặc store IndexedDB riêng nếu cần nhiều preset/profile), schema = snapshot `DownloadOptions` con (filterType, skipDuplicates, saveFolder, flatUsername, filenameUsername, dateFrom/dateTo, keyword).
- UI: nút "Lưu preset"/"Nạp preset" cạnh bộ lọc hiện có, module mới `presets.ts`.

### Pha 12 — Quản lý hàng đợi nâng cao: pause/reorder/retry (ưu tiên Trung bình)
- "Retry": đã có sẵn transition `error→waiting` — chỉ cần nút UI gọi `transitionQueueItem`.
- "Pause": thêm cờ `paused` trên item, KHÔNG thêm state mới vào state machine (tránh phá hợp đồng `transitionQueueItem` đang được assert nhiều nơi) — `startNextInQueue` bỏ qua item có cờ này.
- "Reorder": thêm drag-and-drop trong `queue-panel.ts` (đã tách ở Pha 8), backed bởi thao tác splice mảng + `persistQueue` hiện có.

### Pha 13 — Template đặt tên file linh hoạt (ưu tiên Trung bình)
- Thay `buildFilename`/`buildDownloadPath` cứng bằng hàm thay token: `{username} {tweetId} {date} {type} {ext} {index}`.
- **Bắt buộc**: kết quả cuối cùng luôn phải đi qua `sanitizeFilenameStr`/`sanitizeFolderPath` hiện có làm bước cuối, để giữ nguyên đảm bảo chống path traversal của Pha 1 — không cho template bỏ qua sanitizer.
- UI nhập template + preview realtime trong options.ts.

### Pha 14 — Xuất Manifest JSON/CSV nâng cao (ưu tiên Trung bình)
- Gộp `downloadHistory` (hiện chưa có export nào) + metadata giữ trong `downloaded_urls` (mediaKey/tweetDate/username/url) thành 1 manifest, theo đúng format versioned JSON đã dùng cho `exportQueue`/`exportSettings` (`{ _version, _exportedAt, ... }`).

### Pha 15 — Watch mode theo profile (ưu tiên Thấp — để sau, lập plan riêng)
- Tài liệu gốc đã đánh dấu "Thấp" và cần thiết kế kỹ rate-limit + consent UX để tránh bị X.com coi là bot. Không đi sâu ở đây; nên lập plan riêng sau khi Pha 9-14 xong.

### Ghi chú backlog không đưa vào pha riêng
- **Dọn `any`/`@ts-ignore`** (340+ `@ts-ignore`, ~90 chỗ `any`): không làm big-bang pass. Chính sách: không thêm mới (đã có rule trong CLAUDE.md), dọn dần theo file mỗi khi pha nào đó chạm tới.
- **Bảo trì dependency định kỳ**: việc vận hành thủ công, ngoài phạm vi 1 pha code.

---

## Phần 4 — Thứ tự thực hiện & tiêu chí hoàn tất mỗi pha

**Pha 7 → Pha 8 → Pha 9 → Pha 10 → Pha 11 → Pha 12 → Pha 13 → Pha 14** (Pha 15 lập plan riêng sau).

Mỗi pha coi là xong khi:
1. `npm run check` (typecheck + lint + test + e2e + build) xanh.
2. Có unit test mới cho logic mới thêm (theo pattern `test/validation.test.ts` hiện có) — riêng Pha 8 (refactor thuần) thêm bước smoke test thủ công trên Chrome thật (X.com + Telegram Web) vì đây là thay đổi cấu trúc module, rủi ro runtime không bị bắt bởi typecheck/unit test.
3. Cập nhật `docs/ke-hoach-nang-cap-2026-09.md` (bảng tiến độ + lộ trình phát hành) sau khi mỗi pha hoàn tất, giữ tài liệu đồng bộ với code — đúng nguyên tắc dự án đã theo từ Pha 0-6.
