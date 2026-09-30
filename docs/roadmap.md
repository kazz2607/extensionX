# X Media Downloader — Roadmap

> Phiên bản hiện tại: **6.2.8** | Cập nhật: 2026-09-30

Tài liệu này là nguồn duy nhất cho trạng thái sản phẩm, phần việc đã hoàn thành và backlog. Chi tiết từng bản phát hành nằm trong [`CHANGELOG.md`](../CHANGELOG.md).

## Trạng thái hiện tại

Extension đang dùng Manifest V3, TypeScript strict và Vite. Các luồng chính:

- Thu thập media X.com bằng GraphQL interception kết hợp DOM fallback.
- Lưu media theo profile trong IndexedDB và khôi phục sau khi service worker ngủ.
- Tải ảnh, video, GIF và HLS; hỗ trợ lọc, chống trùng và template tên file.
- Queue nhiều profile với pause, reorder, retry, resume và progress trực tiếp.
- Download Picker, Filter Preset, Manifest export và Watch mode.
- Tải ảnh/video trực tiếp trên Telegram Web A/K, gồm Range-fetch cho stream riêng tư.
- Following Scanner Feature 0: tự cuộn trang Following và hiển thị tiến độ.

Quality gate hiện hành: TypeScript, ESLint, **25 unit tests**, **2 fixture e2e tests** và production build. Chi tiết tại [`quality-gate.md`](quality-gate.md).

## Kiến trúc chính

```text
src/
├── background/       Service worker, queue, downloader, IndexedDB, scraper
├── content/          X.com/Telegram content scripts, FAB, interceptor
├── popup/            Popup và các panel tách module
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

Các kế hoạch Pha 0–15 cũ đã hoàn thành và được hợp nhất vào bảng này; không còn duy trì file kế hoạch riêng.

## Backlog đang hoạt động

### P0 — Xác nhận thực tế Queue v6.2.8

- Smoke test trên Chrome thật với queue có profile 0, vài trăm và hàng nghìn media.
- Xác nhận item đổi sang `downloading` ngay, popup không còn timeout 8 giây.
- Xác nhận item không có IndexedDB data chuyển `error` và queue tiếp tục mục kế tiếp.
- Xác nhận **Dừng** đưa item đang tải về **Tạm dừng**, hiện nút **▶ Tiếp tục** và không còn nút Dừng bị treo.
- Xác nhận profile có video chỉ tải video và ảnh bài viết độc lập, không tải `ext_tw_video_thumb`/`amplify_video_thumb`.
- Bổ sung regression test chuyên biệt cho message `START_QUEUE` khi có harness service worker phù hợp.

Phần coordinator, paused recovery, dedupe-complete và unit regression đã hoàn thành trong v6.2.8. Smoke test lifecycle trên Chrome thật và fault injection IndexedDB/Chrome Downloads/HLS tiếp tục là điều kiện xác nhận thực tế trước khi đóng P0 hoàn toàn.

### P1 — Following Scanner Feature 1

- Quét danh sách Following qua API với pagination và rate-limit an toàn.
- Phân tích tài khoản không hoạt động theo ngưỡng do người dùng chọn.
- Preview bắt buộc trước khi unfollow; throttle, stop/resume và báo cáo kết quả.
- Không tự động unfollow nền và không lưu token nhạy cảm.

Thiết kế chi tiết còn hoạt động tại [`following-scanner-plan.md`](following-scanner-plan.md).

### P1 — Type safety còn lại

- Dọn `any`/`@ts-ignore` còn lại trong content scripts chạy trong trang.
- Chuẩn hóa message payload thành discriminated union đầy đủ.
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
- [`upgrade-plan.md`](upgrade-plan.md) — kế hoạch nâng cấp kỹ thuật, UI/UX và tính năng theo các mốc 6.2.8–7.0.0.
- [`huong-dan-cai-dat.md`](huong-dan-cai-dat.md) — cài đặt, sử dụng và xử lý sự cố.
- [`quality-gate.md`](quality-gate.md) — kiểm thử và baseline chất lượng.
- [`publish-guide.md`](publish-guide.md) — đóng gói và phát hành.
- [`following-scanner-plan.md`](following-scanner-plan.md) — kế hoạch tính năng còn mở.
