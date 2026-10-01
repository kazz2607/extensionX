# Quality gate và baseline hiện hành

> Áp dụng cho phiên bản **7.0.1** | Cập nhật: 2026-10-01

## Baseline hiện hành (v7.0.1)

Gate hiện hành gồm typecheck, ESLint, **37 unit test**, 2 e2e fixture, **3 browser acceptance**, benchmark media 100–50.000, Chrome heap/DOM/long-task budget, dependency lockfile review, production build, performance budget và release manifest SHA-256. Regression bao phủ Queue schema v3, migration/rollback, bulk/undo/windowing, IndexedDB reject/stale operation, callback download timeout, media query window, bounded LRU cache, cursor download/export, Options/IndexedDB/Saved Jobs/history và runtime messages. `npm run test:browser` là gate riêng trong browser job vì cần Chromium có hỗ trợ extension.

## Lệnh bắt buộc

Chạy `npm run check` trước khi tạo PR. Lệnh này gồm TypeScript, ESLint cho mã mới/các helper dùng chung, unit test, regression test bằng fixture, production build, kiểm tra budget và tạo `dist/release-manifest.json`. CI GitHub chạy đúng lệnh này cho pull request và nhánh chính.

Source map mặc định không được tạo trong artifact phát hành. Chỉ build nội bộ với `EXTENSIONX_INTERNAL_SOURCEMAP=true npm run build` mới sinh hidden source map.

`npm run test:e2e` là regression tích hợp dùng fixture GraphQL đã khử dữ liệu nhận diện, kiểm tra filter/queue transition trên mọi máy và trong CI. `npm run test:browser` chạy extension build thật; Playwright route fixture trực tiếp trên origin tin cậy `https://x.com` và `https://web.telegram.org` để giữ nguyên sender validation. Suite kiểm tra Download Center, DOM fallback, thumbnail exclusion, tách state hai profile/tab, SPA navigation, Queue double-Start/Stop/Resume/Complete, Service Worker recovery và Telegram canvas/data URL. Manifest phát hành không bị thay đổi.

## SLO khởi điểm

| Tín hiệu | Mục tiêu | Cách xác nhận |
| --- | --- | --- |
| Mở popup với 1.000 media | dưới 300 ms | Chrome Performance profile, median của 5 lần chạy fixture lớn |
| Long task UI | không quá 50 ms | Chrome Performance profile khi cuộn và cập nhật queue |
| Gửi progress | chỉ tab/profile của download | regression đa profile (Pha 2) |
| Khôi phục session | không treo sau service-worker restart | regression đa tab/restart (Pha 2) |

Harness Chrome hiện dành cho regression luồng thu media và chạy trong browser job có provisioning Chromium. Khi bổ sung fixture tải HLS và service-worker restart, cập nhật bảng bằng số đo CI thay vì đo thủ công.

## Diagnostic cục bộ, opt-in

- Người dùng phải bật **Diagnostic cục bộ** trong Settings trước khi có dữ liệu được ghi.
- Dữ liệu nằm trong `chrome.storage.local`, không có request mạng.
- Chỉ xuất counter/timestamp/mã lỗi đã lọc ký tự. URL, username, bearer token và raw exception không phải trường của schema export.
- Có nút xuất JSON và xoá dữ liệu trong Settings.

Các metric hiện có: `media.received`, `media.rejected`, `media.accepted`, `scan.duration_ms`, `observer.callback`, `download.failed`, `hls.failed`. Metric mới chỉ được thêm khi có schema ổn định, giới hạn kích thước và kiểm thử đảm bảo không rò dữ liệu người dùng.
