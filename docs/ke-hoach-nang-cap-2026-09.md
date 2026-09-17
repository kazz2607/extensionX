# ExtensionX — Kế hoạch nâng cấp sau rà soát mã nguồn

> Phạm vi: ExtensionX v5.7.5 (Manifest V3)
> Rà soát: 16-09-2026
> Mục tiêu: giảm lỗi khi X.com thay đổi, giữ giao diện phản hồi nhanh với phiên thu thập/tải lớn, giảm bề mặt tấn công, và tạo nền tảng để mở rộng tính năng.

## 1. Kết quả baseline và nguyên tắc thực hiện

- `npm run build`: thành công. Tuy nhiên Vite không thay thế kiểm thử nghiệp vụ.
- `npx tsc --noEmit`: thành công tại thời điểm rà soát. File `ts_errors.log` trong repo là dữ liệu cũ, không phản ánh trạng thái hiện hành và nên được xóa hoặc thay thế bằng pipeline CI.
- Code còn nhiều `@ts-ignore` và `any`, tập trung ở content scripts, popup và HLS. Đây là rủi ro bảo trì cao dù TypeScript hiện chưa báo lỗi.
- Các mô-đun lớn nhất là `popup.ts` (1.472 dòng), `popup.css` (2.097 dòng), `downloader.ts` (714 dòng), `fab.ts` (671 dòng) và `scraper.ts` (601 dòng). Không nên vừa refactor vừa thêm feature trong cùng một PR.

Thứ tự áp dụng: **ổn định dữ liệu + bảo mật → đo đạc → tối ưu → UI → tính năng**. Mỗi hạng mục phải có kiểm thử hồi quy trước khi chuyển sang hạng mục sau.

## 2. Các phát hiện cần xử lý

| Ưu tiên | Phát hiện từ mã nguồn | Rủi ro / tác động | Vị trí chính |
| --- | --- | --- | --- |
| P0 | Message handler nhận `message`/`payload` không có schema, trong khi có các lệnh xóa storage, download, import queue và điều khiển collector. | Dữ liệu sai hoặc message không tin cậy có thể kích hoạt hành động nhạy cảm. | `background/messages.ts` |
| P0 | Content script chạy trong `MAIN` world hook `fetch` và `XMLHttpRequest`; dữ liệu từ trang được relay về extension. | X.com là môi trường không tin cậy; phải xem mọi payload là input chưa kiểm chứng. | `manifest.json`, `content/page-interceptor.ts`, `content/content.ts` |
| P0 | Đường dẫn/tên file tải xuống và dữ liệu import/export đi qua nhiều lớp. | Path traversal logic, tên file không hợp lệ, queue hỏng hoặc XSS gián tiếp nếu xử lý thiếu chặt. | `downloader.ts`, `queue.ts`, `messages.ts` |
| P1 | Progress download hiện broadcast đến mọi tab đang collect, không gắn với username/tab của download. | Snackbar sai ngữ cảnh, tạo message thừa khi mở nhiều profile. | `background/downloader.ts` |
| P1 | Nhiều điểm dựng UI bằng `innerHTML`; popup có `escapeHtml`, nhưng snackbar/following panel/options chưa thống nhất chính sách. | Dữ liệu từ profile/tweet/URL có thể gây DOM-XSS nếu được dùng như HTML ở lần sửa sau. | `content/snackbar.ts`, `popup/following-panel.ts`, `options/options.ts` |
| P1 | Ba `MutationObserver`/hook mạng hoạt động trên SPA X.com; chưa thấy cơ chế chung đo tần suất, debounce và teardown theo navigation. | CPU cao, quét lặp, listener/observer tồn tại lâu. | `page-interceptor.ts`, `dom-scanner.ts`, `tweet-btn.ts`, `content.ts` |
| P1 | Dedup lịch sử tải được lưu mảng URL trong `chrome.storage.local`, giới hạn 50.000 mục; media đã dùng IndexedDB. | Tốn quota/RAM, truy xuất O(n), và state không nhất quán giữa hai kho. | `scraper.ts`, `indexeddb.ts` |
| P1 | Các màn hình popup/options/FAB lớn, event và state gắn chặt DOM. | Khó tái hiện/fix lỗi UI và dễ làm popup bị giật khi list/queue dài. | `popup.ts`, `popup.css`, `fab.ts` |

## 3. Pha 0 — Cổng chất lượng và quan sát (1–2 ngày)

1. Thêm scripts `typecheck`, `lint`, `test`, `test:e2e` vào `package.json`; CI bắt buộc chạy build + typecheck cho mọi PR. Không đưa log lỗi cũ như `ts_errors.log` vào nguồn sự thật.
2. Thiết lập test unit cho: chuẩn hóa media URL, `sanitizeFolder`, xây tên file, lọc theo ngày/từ khóa/kích thước, dedup và chuyển trạng thái queue. Dùng fixture GraphQL đã khử dữ liệu nhạy cảm.
3. Thiết lập E2E với trang fixture mô phỏng DOM X.com: collect ảnh/video/HLS, SPA navigation, pause/resume, 2 tab khác profile, service worker restart, download lỗi/timeout.
4. Thêm telemetry **cục bộ, opt-in, không gửi ra mạng**: số media nhận/loại, thời gian scan, số callback observer, hàng đợi, retry, HLS timeout và lỗi theo mã. Có nút export diagnostic đã redaction.
5. Đặt SLO ban đầu: popup mở <300 ms với 1.000 media; UI không long task >50 ms; không gửi progress tới tab sai; state session khôi phục đúng sau service-worker restart.

**Điều kiện hoàn tất:** CI xanh, có fixture regression tối thiểu cho các luồng ở trên và dashboard/debug view local để so trước-sau.

### Cập nhật triển khai Pha 0 (17-09-2026)

- Đã có `npm run check` (typecheck, lint, unit test, fixture regression, build) và workflow CI bắt buộc.
- Đã thêm fixture GraphQL đã khử dữ liệu nhận diện, regression cho media/filter/queue transition, cùng unit test URL/path/import/dedup-facing validation và redaction lỗi.
- Đã thêm diagnostic cục bộ opt-in, xuất/xoá JSON và SLO khởi điểm. Quy tắc privacy và giới hạn của harness được ghi tại `docs/quality-gate.md`.
- `test:e2e` chạy regression fixture trong CI; `test:browser` là harness Chrome extension thật cho DOM fallback, SPA navigation và 2 tab/profile. Pause/resume, service-worker restart và HLS timeout còn cần fixture chuyên biệt khi Pha 2 chuẩn hóa cancellation/retry.
- CI có browser job riêng: provision Chromium Playwright rồi chạy `test:browser`; harness chỉ dùng manifest tạm có quyền localhost, không thay đổi manifest phát hành.

## 4. Pha 1 — Bảo mật và tính đúng đắn (P0, 3–5 ngày)

### 4.1 Hợp đồng message và xác thực nguồn

- Tạo `src/shared/messages.ts`: discriminated union cho từng `type`, payload/response có kiểu chặt, hàm `parseMessage` runtime (Zod/Valibot hoặc validator nội bộ nhỏ).
- Ở `background/messages.ts`, reject mặc định; kiểm tra `sender.id === chrome.runtime.id`; với message liên quan tab phải có `sender.tab?.id`, URL thuộc allowlist `x.com`/`twitter.com`, và username khớp state của tab.
- Không nhận `tabId`, `username`, URL hoặc trạng thái nhạy cảm từ page world làm quyền hạn. Derive `tabId` từ `sender`, URL từ `chrome.tabs.get`, và xác nhận lại trước các lệnh destructive.
- Ràng buộc kích thước payload, số media/batch, độ dài tweet text, và format tweet ID/URL để chống memory exhaustion.

### 4.2 Validate input và an toàn download

- Chuẩn hóa duy nhất bằng `URL`; chỉ chấp nhận `https:` và host trong allowlist (`pbs.twimg.com`, `video.twimg.com`, X API cần thiết). Cấm `data:`, `blob:`, `file:`, hostname đánh lừa và redirect ra ngoài allowlist.
- `sanitizeFolder` phải loại `..`, slash/backslash, control character, tên rỗng và giới hạn độ dài mỗi segment; chỉ tạo filename từ whitelist ký tự + extension suy luận từ URL/content type.
- Schema hóa file import queue: version, max item, enum `filterType`/`status`, username hợp lệ. Import thất bại phải atomic: không ghi queue một phần.
- Thay mọi chỗ gắn dữ liệu động vào `innerHTML` bằng `textContent`/DOM API; nếu cần template tĩnh, chỉ nội suy qua helper escape duy nhất và test XSS. `snackbar.ts` nên giữ reference đến node username/counter/done thay vì dựng lại HTML.
- Rà lại hard-coded bearer token/cookie/CSRF: không log token, không persist token nếu không cần; xoá token khi tab/session kết thúc; redact URL query và header trong diagnostic.

**Kiểm thử bắt buộc:** payload sai schema, message từ tab không thuộc X, URL độc hại, username/path độc hại, import queue lỗi, strings HTML trong display name/tweet/filename.

### Cập nhật triển khai Pha 1 (17-09-2026)

- Thêm parser runtime chung với envelope giới hạn 256 KB, chỉ nhận type hợp lệ/payload object; các command content quan trọng kiểm tra extension sender, tab X.com và username suy ra từ URL tab.
- `PAGE_LOADED` không còn tin URL do page gửi; state dùng URL từ `sender.tab`.
- Translation fallback ghi qua `textContent`; các render popup động còn lại dùng escape helper hoặc DOM APIs và tiếp tục được chuyển dần trong Pha 3 (virtual rendering).
- Queue, history, active-download và error detail đã chuyển sang `DocumentFragment`/`textContent`; `innerHTML` còn lại chỉ dành cho template/SVG tĩnh hoặc geometry đã tính từ counter nội bộ.

## 5. Pha 2 — Sửa logic và độ bền MV3 (P0/P1, 4–6 ngày)

1. Tạo state machine rõ ràng cho collector: `idle → starting → collecting → stopping → stopped | failed`; cho download/queue: `waiting → preparing → downloading → paused | done | failed | cancelled`. Chỉ cho phép transition hợp lệ và persist snapshot versioned.
2. Gắn `operationId` cho mỗi phiên collect/download/HLS. Mọi callback, timeout và message phải mang ID này; bỏ qua callback cũ sau khi navigation, stop hoặc retry. Đây là cách chặn race condition tốt hơn so với chỉ dùng boolean/map module-level.
3. Gắn `username`, `tabId`, `operationId` vào `ActiveDownload`; `broadcastToTab` chỉ gửi progress tới tab đúng profile. Popup nhận update theo operationId để không render trạng thái cũ.
4. Đảm bảo `clearSession`, clear media, stop, tab close và service-worker restart đều cancel timer/observer/pending HLS, cập nhật IndexedDB + storage theo transaction/logical commit.
5. Với HLS offscreen: có hàng đợi hữu hạn, cancellation signal, retry exponential backoff có jitter, phân loại lỗi HTTP/network/playlist/segment, dọn pending request ở mọi nhánh và đóng offscreen khi idle.
6. Lưu dedup vào IndexedDB (key theo normalized URL/hash + username, có timestamp/index và TTL/LRU), thay mảng 40–50k URL trong `chrome.storage.local`. `storage.local` chỉ giữ session/options/snapshot nhỏ.

**Tiêu chí nghiệm thu:** 2 profile chạy song song không lẫn progress/media; refresh/navigate/đóng tab khi collect không để orphan task; restart service worker giữa HLS/download không treo vô hạn; retry không tải trùng.

### Cập nhật triển khai Pha 2 (17-09-2026) ✅ HOÀN TẤT

- Mỗi request HLS hiện có `AbortController`; Stop hủy task đang chạy, bỏ task FIFO đang chờ và reject waiter ở service worker ngay lập tức.
- Fetch playlist/segment dùng retry giới hạn (3 lần), exponential backoff có jitter; lỗi HTTP 4xx không retry và segment thiếu không tạo video partial.
- Tab đóng dọn collection state theo tab; offscreen tự đóng sau 30 giây rảnh. Dedup IndexedDB có TTL 180 ngày và giới hạn LRU 50.000 URL/profile khi profile được nạp.
- Queue recovery sau service-worker restart dùng `recoverQueueItemAfterRestart` (named helper) thay vì inline logic; tất cả mutation status dùng `transitionQueueItem` — invalid transitions bị reject tường minh.
- Fix `fetchText` trong `hls-fetcher.ts` nuốt `AbortError`: re-throw khi `signal.aborted`, đảm bảo abort propagate đúng qua toàn bộ retry/backoff chain.
- 3 HLS regression tests pass: retry transient, abort trước fetch, abort trong backoff. Tổng: 14/14 unit test xanh. CI green.

## 6. Pha 3 — Hiệu năng (P1, 3–5 ngày)

- Dùng `Performance.mark/measure` để ghi baseline cho scan, render popup, persist và download scheduler trước khi thay đổi.
- Gom batch `MEDIA_FOUND` theo `requestAnimationFrame`/timeout ngắn, dedup trước khi gọi `applyOptionsFilter`; giới hạn số API video placeholder đồng thời để tránh burst request.
- Trong các content scanner, chỉ quan sát subtree cần thiết, debounce mutation, xử lý node mới thay vì quét lại toàn trang; disconnect/reconnect theo route SPA và dùng `AbortController` cho fetch đang chạy.
- Dùng scheduler có concurrency dùng chung cho download thường/HLS, giới hạn theo cấu hình và network errors; progress throttle theo tab/operation thay vì broadcast toàn cục.
- Popup: render theo diff, `DocumentFragment`, event delegation và virtual list/pagination cho queue, history, errors và following list. Không thay toàn bộ `innerHTML` khi chỉ progress thay đổi.
- Tách CSS theo popup/options/FAB và dùng CSS variables/design tokens; rà style inline để giảm chi phí reflow và giúp dark/light theme nhất quán.

**Mục tiêu đo được:** giảm callback observer ≥50% trên fixture cuộn dài; popup vẫn thao tác mượt với 1.000 queue/history entries; không tăng heap tuyến tính theo toàn bộ lịch sử dedup.

## 7. Pha 4 — UI/UX và các lỗi giao diện (P1, 3–4 ngày)

1. Chuẩn hóa design tokens (màu, spacing, typography, z-index, trạng thái focus/disabled/loading) và component nhỏ: Button, Toggle, Select, Toast, Modal, Progress, Empty/Error state.
2. Kiểm tra responsive popup ở 320/360/400 px, zoom 200%, dark/light mode, tiếng Việt/Anh dài, và `prefers-reduced-motion`.
3. Sửa accessibility: điều khiển có label, focus ring, focus trap/ESC cho modal, ARIA live cho tiến trình, aria-expanded cho panel, contrast AA, thao tác đầy đủ bằng bàn phím.
4. Hiển thị trạng thái theo phase thay vì spinner chung: “Đang chờ trang”, “Đang quét”, “Đang lấy video”, “Đang tải 3/20”, “Tạm dừng”, “Cần đăng nhập”, “Rate limited”. Error card phải có action Retry/Copy diagnostic/Go to tab.
5. Thêm preview trước download: filter áp dụng, số sẽ bỏ qua do duplicate, dung lượng ước tính nếu biết, và cảnh báo rõ khi chọn concurrency cao/HLS.

## 8. Tính năng mới đề xuất

| Ưu tiên | Tính năng | Giá trị | Điều kiện triển khai |
| --- | --- | --- | --- |
| Cao | Download plan/preview + chọn/bỏ chọn từng media | Người dùng biết chính xác thứ sẽ tải và giảm tải nhầm. | Hoàn tất model `MediaItem`, virtual list. |
| Cao | Resume đáng tin cậy | Tiếp tục từ session sau crash/đóng popup, hiển thị lý do không thể resume. | Hoàn tất operationId + state machine. |
| Cao | Download recipe | Lưu filter, folder, format tên file theo profile/danh sách. | Validate folder/URL và migration options. |
| Trung bình | Hàng đợi có pause/reorder/retry theo item | Kiểm soát batch lớn tốt hơn. | Scheduler và queue state machine. |
| Trung bình | Quy tắc đặt tên có preview | Template `{username}/{date}_{tweetId}_{index}.{ext}` tránh collision. | Sanitizer/template parser có whitelist. |
| Trung bình | Export manifest JSON/CSV | Kiểm tra lại những gì đã tải, gồm URL đã redaction tùy chọn. | Quy tắc privacy/export schema. |
| Thấp | Chế độ “watch profile” thủ công | Báo có media mới theo lịch người dùng chọn. | Permission/giới hạn rate rõ ràng, opt-in. |
| Thấp | Báo cáo tương thích X.com | Người dùng export diagnostic khi selector/API X thay đổi. | Telemetry local + redaction tuyệt đối. |

Không khuyến nghị triển khai watch/background polling trước khi có rate limiting, UX consent và xử lý thay đổi API X.com bền vững.

## 9. Lộ trình phát hành

| Mốc | Nội dung | Definition of done |
| --- | --- | --- |
| v5.8.0 Stabilization | Pha 0 + 1 | CI, schema message, validate URL/path/import, không DOM-XSS trong test. |
| v5.9.0 Reliability | Pha 2 | State machine, operationId, dedup IndexedDB, E2E multi-tab/restart xanh. |
| v6.0.0 Performance & UI | Pha 3 + 4 | Có benchmark đạt mục tiêu, virtual list, a11y/responsive pass. |
| v6.1+ Product | Tính năng ưu tiên cao | Feature flag, telemetry local opt-in, hướng dẫn/migration hoàn chỉnh. |

## 10. Backlog kỹ thuật chi tiết

- Chia `popup.ts` thành `popup-state`, `popup-messages`, `popup-queue`, `popup-history`, `popup-render`, `popup-actions`; không thay đổi hành vi trong PR refactor đầu tiên.
- Tách `fab.ts` thành view, drag controller và collect actions; thêm teardown contract cho toàn bộ content script.
- Thay `@ts-ignore` dần theo module bằng type guard và declaration cho `Window`; bật dần `noUncheckedIndexedAccess` sau khi test baseline ổn định.
- Pin version dependency bằng lockfile, chạy audit dependency trong CI, và có lịch cập nhật Vite/TypeScript/plugin hàng tháng.
- Viết changelog theo “fixed / security / known limitations”, cùng ma trận browser Chrome stable/beta và các route X: profile/media/status/likes/bookmarks/following.

## 11. Rủi ro và quyết định cần chốt

- X.com thay đổi DOM/GraphQL thường xuyên: ưu tiên adapter có version/feature detection + fallback DOM, không phụ thuộc một selector/query ID duy nhất.
- `MAIN` world là cần thiết để intercept network nhưng không được là trust boundary. Mọi dữ liệu crossing world phải được parse/validate ở isolated content script/background.
- Một số video/HLS bị giới hạn bởi session, region, DRM hoặc thay đổi endpoint; UI cần báo “không khả dụng” minh bạch thay vì retry vô hạn.
- Trước v6.0, giữ compatibility migration cho options/session/queue cũ và có rollback path cho IndexedDB schema.
