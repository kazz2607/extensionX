# Quality gate và baseline Pha 0

> Áp dụng cho phiên bản **6.1.1** | Cập nhật: 2026-09-17

## Lệnh bắt buộc

Chạy `npm run check` trước khi tạo PR. Lệnh này gồm TypeScript, ESLint cho mã mới/các helper dùng chung, unit test, regression test bằng fixture, và production build. CI GitHub chạy đúng lệnh này cho pull request và nhánh chính.

`npm run test:e2e` là regression tích hợp dùng fixture GraphQL đã khử dữ liệu nhận diện, kiểm tra filter/queue transition trên mọi máy và trong CI. `npm run test:browser` chạy Chrome với extension build thật và manifest test tạm thời chỉ mở quyền fixture localhost; nó kiểm tra content-script DOM fallback, tách state hai profile/tab, SPA navigation và luồng Telegram canvas/data URL. Manifest phát hành không bị thay đổi.

## SLO khởi điểm

| Tín hiệu | Mục tiêu | Cách xác nhận |
| --- | --- | --- |
| Mở popup với 1.000 media | dưới 300 ms | Chrome Performance profile, median của 5 lần chạy fixture lớn |
| Long task UI | không quá 50 ms | Chrome Performance profile khi cuộn và cập nhật queue |
| Gửi progress | chỉ tab/profile của download | regression đa profile (Pha 2) |
| Khôi phục session | không treo sau service-worker restart | regression đa tab/restart (Pha 2) |

Harness Chrome hiện dành cho regression luồng thu media. Để đưa `test:browser` vào CI, cần provisioning Chrome/Chromium trong runner; khi bổ sung fixture tải HLS và service-worker restart, cập nhật bảng bằng số đo CI thay vì đo thủ công.

## Diagnostic cục bộ, opt-in

- Người dùng phải bật **Diagnostic cục bộ** trong Settings trước khi có dữ liệu được ghi.
- Dữ liệu nằm trong `chrome.storage.local`, không có request mạng.
- Chỉ xuất counter/timestamp/mã lỗi đã lọc ký tự. URL, username, bearer token và raw exception không phải trường của schema export.
- Có nút xuất JSON và xoá dữ liệu trong Settings.

Các metric hiện có: `media.received`, `media.rejected`, `media.accepted`, `scan.duration_ms`, `observer.callback`, `download.failed`, `hls.failed`. Queue retry và HLS timeout sẽ được nối khi scheduler/HLS được chuẩn hoá ở Pha 2–3, để tránh thêm instrumentation thiếu tin cậy vào code cũ.
