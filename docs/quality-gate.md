# Quality gate và baseline hiện hành

> Áp dụng cho phiên bản **8.1.0** | Cập nhật: 2026-10-14

## Baseline hiện hành (v8.1.0)

Gate hiện hành gồm typecheck, ESLint, **i18n gate**, **71 unit test**, 2 e2e fixture, **7 browser acceptance**, benchmark media 100–50.000, Chrome heap/DOM/long-task budget, dependency lockfile review, production build, performance budget và release manifest SHA-256. Regression bao phủ Queue schema v3, migration/rollback, bulk/undo/windowing, IndexedDB reject/stale operation, callback download timeout, media query window, bounded LRU cache, cursor download/export, Following parser/selection, P2 estimate/folder/schedule/redaction/hash, Options/IndexedDB/Saved Jobs/history, clear-all storage, runtime messages, Start Collecting không có `sender.tab` từ extension page, giữ collect operation khi reload `/media`, chống mất dirty media/URL đã tải khi ghi IndexedDB, allowlist message nút tweet/phím tắt và lưu Blob offscreen qua service worker (Chromium xác nhận offscreen không có `chrome.downloads`). Từ 7.3.0: allowlist bridge theo chiều, ràng buộc lệnh runtime theo ngữ cảnh gửi, allowlist options tải, lọc import settings, lọc ngày theo giờ địa phương, URL Telegram, HLS chỉ CDN X không cookie, timeout theo tiến độ; Chromium kiểm tra trang không đọc/giả được bridge, FAB thật vẫn hoạt động, SPA navigation sang profile khác dừng thu thập và offscreen chỉ nhận lệnh từ service worker. Từ 7.3.1: FAB/snackbar chạy ở isolated world trong closed shadow root (trang không truy cập được, test điều khiển qua CDP) và route-gating của script trang dùng chung parser `usernameFromXUrl`. Từ 7.4.0: `npm run i18n` (`scripts/check-i18n.mjs`) chặn chữ tiếng Việt hard-code ngoài bảng dịch, key `data-i18n*` không tồn tại và bảng thiếu en/vi; Chromium kiểm tra ngôn ngữ mặc định English, theme sáng thật sự sáng và JSZip nạp động trong offscreen. Options storage layout được kiểm tra screenshot/overflow tại 400/620 px. Từ 7.4.1: hàng nút hành động và header popup (gộp nút Stop vào vị trí Download, gom cụm nút header) xác minh thủ công bằng Playwright chụp ảnh bản `dist/` thật — chưa có gate Chromium tự động riêng cho layout popup. Từ 7.4.2: thêm Chromium acceptance "tweet-btn re-attaches..." xác nhận `tweet-btn.ts` quét lại đúng `<article>` và gắn nút khi media đến muộn — viết và kiểm chứng logic qua một script Playwright độc lập, nhưng **chưa tự chạy được trong môi trường phát triển hiện tại** (service worker của extension không khởi động được khi nạp qua `--load-extension` ở đây, tái hiện y hệt trên commit liền trước không có thay đổi này — xác nhận là giới hạn môi trường có sẵn, không phải lỗi của test mới); cần CI hoặc máy có Chrome thật để xác nhận test thực sự pass. Từ 8.0.0: unit test cho khoá Search/Hashtag (ổn định, không va chạm, không trùng hậu tố `_likes`, parser profile cũ không đổi), ô CSV an toàn (RFC 4180 + chặn công thức), phân loại nguyên nhân lỗi tải và danh sách file lỗi (gộp, giới hạn 500, bỏ dòng sai định dạng); panel File lỗi kiểm tra bằng ảnh chụp bản build thật — chưa có Chromium acceptance cho Search/Hashtag hay retry chọn lọc. Từ 8.1.0: unit test cho giới hạn luồng/khoảng nghỉ, cổng tạm dừng 429 dùng chung và giới hạn import cài đặt (trần luồng 6). `npm run test:browser` là gate riêng trong browser job vì cần Chromium có hỗ trợ extension.

## Lệnh bắt buộc

Chạy `npm run check` trước khi tạo PR. Lệnh này gồm TypeScript, ESLint cho mã mới/các helper dùng chung, unit test, regression test bằng fixture, production build, kiểm tra budget và tạo `dist/release-manifest.json`. CI GitHub chạy đúng lệnh này cho pull request và nhánh chính.

Source map mặc định không được tạo trong artifact phát hành. Chỉ build nội bộ với `EXTENSIONX_INTERNAL_SOURCEMAP=true npm run build` mới sinh hidden source map.

`npm run test:e2e` là regression tích hợp dùng fixture GraphQL đã khử dữ liệu nhận diện, kiểm tra filter/queue transition trên mọi máy và trong CI. `npm run test:browser` chạy extension build thật; Playwright route fixture trực tiếp trên origin tin cậy `https://x.com` và `https://web.telegram.org` để giữ nguyên sender validation. Suite kiểm tra Download Center, DOM fallback, thumbnail exclusion, tách state hai profile/tab, SPA navigation, Queue double-Start/Stop/Resume/Complete, Service Worker recovery và Telegram canvas/data URL. Manifest phát hành không bị thay đổi.

## SLO khởi điểm

| Tín hiệu | Mục tiêu | Cách xác nhận |
| --- | --- | --- |
| Mở popup với 1.000 media | dưới 300 ms | Chrome Performance profile, median của 5 lần chạy fixture lớn |
| Long task UI | không quá 50 ms | Chrome Performance profile khi cuộn và cập nhật queue |
| Download Center 500 Queue + 500 history | dưới 2.000 ms, không long task | Chromium acceptance; lần đo gần nhất 231 ms/0 ms |
| START_QUEUE acknowledgement | dưới 500 ms | Chromium acceptance; lần đo gần nhất khoảng 2,2 ms |
| Gửi progress | chỉ tab/profile của download | regression đa profile (Pha 2) |
| Khôi phục session | không treo sau service-worker restart | regression đa tab/restart (Pha 2) |

Harness Chrome hiện dành cho regression luồng thu media và chạy trong browser job có provisioning Chromium. Khi bổ sung fixture tải HLS và service-worker restart, cập nhật bảng bằng số đo CI thay vì đo thủ công.

## Diagnostic cục bộ, opt-in

- Người dùng phải bật **Diagnostic cục bộ** trong Settings trước khi có dữ liệu được ghi.
- Dữ liệu nằm trong `chrome.storage.local`, không có request mạng.
- Chỉ xuất counter/timestamp/mã lỗi đã lọc ký tự. URL, username, bearer token và raw exception không phải trường của schema export.
- Có nút xuất JSON và xoá dữ liệu trong Settings.

Các metric hiện có: `media.received`, `media.rejected`, `media.accepted`, `scan.duration_ms`, `observer.callback`, `download.failed`, `hls.failed`. Metric mới chỉ được thêm khi có schema ổn định, giới hạn kích thước và kiểm thử đảm bảo không rò dữ liệu người dùng.
