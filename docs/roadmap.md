# X Media Downloader — Roadmap

> Phiên bản hiện tại: **7.0.1** | Cập nhật: 2026-10-01

Tài liệu này là nguồn duy nhất cho trạng thái sản phẩm, phần việc đã hoàn thành và backlog. Chi tiết từng bản phát hành nằm trong [`CHANGELOG.md`](../CHANGELOG.md).

## Trạng thái hiện tại

Extension đang dùng Manifest V3, TypeScript strict và Vite. Các luồng chính:

- Thu thập media X.com bằng GraphQL interception kết hợp DOM fallback.
- Lưu media theo profile trong IndexedDB và khôi phục sau khi service worker ngủ.
- Tải ảnh, video, GIF và HLS; hỗ trợ lọc, chống trùng và template tên file.
- Queue nhiều profile với pause, reorder, retry, resume và progress trực tiếp.
- Download Center toàn trang và Saved Jobs do người dùng chủ động chạy.
- Download Picker, Filter Preset, Manifest export và Watch mode.
- Tải ảnh/video trực tiếp trên Telegram Web A/K, gồm Range-fetch cho stream riêng tư.
- Following Scanner Feature 0: tự cuộn trang Following và hiển thị tiến độ.

Quality gate hiện hành: TypeScript, ESLint, **37 unit tests**, **2 fixture e2e tests**, benchmark 100–50.000 media, dependency lockfile review, **3 Chromium acceptance tests** (Queue lifecycle/fault/DOM), production build, performance budget và release checksum manifest. Chi tiết tại [`quality-gate.md`](quality-gate.md).

## Kiến trúc chính

```text
src/
├── background/       Service worker, queue, downloader, IndexedDB, scraper
├── content/          X.com/Telegram content scripts, FAB, interceptor
├── popup/            Popup và các panel tách module
├── download-center/  Trang quản lý Queue, Saved Jobs và history
├── options/          Cài đặt, import/export/reset
├── offscreen/        Ghép HLS
├── shared/           Validation và logic thuần có kiểm thử
├── _locales/         Bản dịch en/vi
├── types.ts          Kiểu dữ liệu dùng chung
└── manifest.json     Manifest V3
```

## Các mốc đã hoàn thành

| Mốc | Nội dung chính |
| --- | --- |
| v1–v3 | Thu thập/tải media, auto-scroll, filter, history, FAB và session restore |
| v4 | Queue nhiều profile, date range, IndexedDB, HLS, rate limit và duplicate detection |
| v5.0–v5.4 | Chuyển TypeScript/Vite, i18n, hardening, tối ưu hiệu năng và Queue/Bookmark |
| v5.5–v5.7 | Global shortcuts, Following Scroll, smart auto-stop và sửa GraphQL/session |
| v5.8–v6.0 | Validation/security, state machine, regression fixtures, UI/accessibility |
| v6.1 | Telegram Web A/K và tăng độ tin cậy cho blob/data/stream |
| v6.2.0 | Download Picker, Preset, Queue nâng cao, resume, filename template, Manifest, Watch |
| v6.2.1–v6.2.4 | Range-fetch Telegram private stream, viewer/thumbnail và retry 408/5xx |
| v6.2.5–v6.2.8 | Khôi phục Queue; sửa Start/Stop/Resume, thumbnail video và chuẩn hóa lifecycle bằng coordinator |
| v6.3.0 | Tối ưu worker/Queue/observer; runtime message field allowlist và audit least-privilege |
| v6.3.1 | Primary Queue action theo state, responsive 320–360 px và accessibility semantics |
| v6.4.0 | Module hóa message handler, storage/Chrome adapter, migration regression, performance budget và reproducible release manifest |
| v7.0.0 | Download Center, Saved Jobs và history schema v2 có đường migration/rollback |
| v7.0.1 | Queue lifecycle/fault acceptance, cursor/cache bound, Queue windowing/bulk actions và pipeline Blob object URL |

Các kế hoạch Pha 0–15 cũ đã hoàn thành và được hợp nhất vào bảng này; không còn duy trì file kế hoạch riêng.

## Backlog đang hoạt động

### P0 — Hoàn thành

Automated Chromium acceptance đã xanh cho Queue profile rỗng, cold-load 100/1.000 media, loại thumbnail video, double Start, Stop → Paused → Resume → Complete, restart đúng phase `preparing` với fixture 20.000 record và Downloads callback timeout rồi tiếp tục item kế tiếp. Queue schema v3 dùng `paused` độc lập; IndexedDB reject/stale operation và HLS abort đều có regression.

### P1 — Following Scanner Feature 1

- Quét danh sách Following qua API với pagination và rate-limit an toàn.
- Phân tích tài khoản không hoạt động theo ngưỡng do người dùng chọn.
- Preview bắt buộc trước khi unfollow; throttle, stop/resume và báo cáo kết quả.
- Không tự động unfollow nền và không lưu token nhạy cảm.

Thiết kế chi tiết còn hoạt động tại [`following-scanner-plan.md`](following-scanner-plan.md).

### P1 — Hiệu năng và type safety còn lại

- Chrome heap cho Picker/CSV/Manifest và DOM/long-task Queue đã có budget; Queue 500 item dùng cửa sổ 50 row sau khi full render vượt budget. Tiếp tục đo các list khác trước khi windowing.
- Count/Picker/download/CSV/Manifest đã dùng IndexedDB cursor; media cache đã có LRU bound.
- Dọn `any`/`@ts-ignore` còn lại trong content scripts chạy trong trang; response map domain Queue đã hoàn thành.
- Mở rộng typed response map sang media, export, Following và Download Center consumer.
- Thêm kiểm thử cho các nhánh service-worker lifecycle và IndexedDB failure.

### P2 — Ý tưởng sản phẩm chưa cam kết

- Gallery/dashboard toàn trang cho tập media lớn.
- Đóng gói ZIP có giới hạn bộ nhớ và cảnh báo kích thước.
- Content-hash duplicate detection tùy chọn.
- Notification center và quản lý dung lượng dữ liệu cục bộ.
- Lịch tải tự động chỉ khi có thiết kế MV3/rate-limit rõ ràng.
- Cloud sync chỉ triển khai khi có mô hình quyền riêng tư và opt-in riêng.

## Nguyên tắc phát triển

- Mỗi thay đổi phải qua `npm run check`.
- Không đưa dữ liệu nhạy cảm, URL có token hoặc nội dung người dùng vào diagnostic.
- Tác vụ phá hủy hoặc unfollow phải có preview và xác nhận rõ ràng.
- Tính năng nền phải tôn trọng vòng đời Manifest V3, có khả năng resume và không polling vô hạn.
- Khi phát hành: cập nhật version, changelog, tài liệu hiện hành và build lại `dist/`.

## Tài liệu liên quan

- [`README.md`](README.md) — mục lục tài liệu.
- [`upgrade-plan.md`](upgrade-plan.md) — kế hoạch nâng cấp kỹ thuật, UI/UX và tính năng theo các mốc 6.2.8–7.0.1.
- [`huong-dan-cai-dat.md`](huong-dan-cai-dat.md) — cài đặt, sử dụng và xử lý sự cố.
- [`quality-gate.md`](quality-gate.md) — kiểm thử và baseline chất lượng.
- [`publish-guide.md`](publish-guide.md) — đóng gói và phát hành.
- [`following-scanner-plan.md`](following-scanner-plan.md) — kế hoạch tính năng còn mở.
