# Baseline hiệu năng và build budget 7.2.0

> Cập nhật: 2026-10-02

## Tối ưu đã áp dụng

- Worker download dùng cursor dùng chung thay cho `queue.shift()`, tránh dịch mảng O(n) ở mỗi file.
- Lọc thumbnail video bằng một lượt duyệt, không tạo đồng thời bản sao `Array.from(...).filter(...)`.
- Queue dùng một click listener theo event delegation thay vì gắn lại listener cho từng row sau mỗi render.
- Progress Queue được gộp bằng `requestAnimationFrame`, mỗi frame chỉ áp dụng bản cập nhật mới nhất.
- DOM scanner bỏ qua mutation khi tab ẩn và reconcile khi tab hiện lại.
- Telegram dùng MutationObserver cho thay đổi thường xuyên; watchdog dự phòng giảm từ 500 ms xuống 2 giây.

## Ngân sách phát hành

| Tình huống | Mục tiêu |
| --- | --- |
| Mở popup với 1.000 media | median dưới 300 ms |
| Tương tác/cập nhật Queue | không có long task trên 50 ms |
| Stop download | UI phản hồi dưới 500 ms |
| 10.000 media | popup không bị khóa, không giữ thêm bản sao mảng không cần thiết |

Build 7.2.0 tiếp tục áp dụng gate tự động trong `npm run check` và tính cả entrypoint Download Center:

| Chỉ số build | Ngưỡng | Kết quả 7.2.0 |
| --- | ---: | ---: |
| Tổng JavaScript trong `dist/` | ≤ 400.000 byte | 381.276 byte |
| JavaScript bundle lớn nhất | ≤ 110.000 byte | 103.015 byte |
| Số module TypeScript trong `src/` | ≤ 85 | 78 |

Ngưỡng nằm trong `performance-budget.json` và được kiểm tra bởi `scripts/check-performance-budget.mjs`.

## Cách đo

Đo runtime trên Chrome production build với fixture 100, 1.000, 10.000 và 50.000 media. Matcher chạy 7 lượt; browser acceptance đo Queue lifecycle, heap 20.000 media, DOM/long-task 500 item, Download Center, responsive, keyboard và START_QUEUE acknowledgement.

## Phần tiếp tục

P0, P1 và phạm vi P2 cam kết đã hoàn tất. Budget tăng có chủ đích cho JSZip trong offscreen bundle; popup/service-worker vẫn nằm dưới ngưỡng và ZIP chỉ chạy theo thao tác người dùng.

## Benchmark CPU 2026-10-02

Chạy `npm run benchmark:media` với 7 lượt trên môi trường phát triển hiện tại. Đây là benchmark matcher/filter thuần, không đại diện cho thời gian IndexedDB, render DOM hoặc peak heap Chrome.

| Fixture | Median | p95 |
| ---: | ---: | ---: |
| 100 | 0,027 ms | 0,084 ms |
| 1.000 | 0,116 ms | 1,455 ms |
| 10.000 | 0,816 ms | 1,228 ms |
| 50.000 | 2,325 ms | 15,214 ms |

Budget CI ban đầu cho matcher 50.000 media là p95 ≤ 250 ms. Count/Picker cold-cache nay quét IndexedDB bằng cursor và chỉ giữ cửa sổ Picker tối đa 200 item. Queue windowing được quyết định bằng Chrome DOM/heap benchmark riêng, không dựa trên benchmark CPU này.

## Chrome heap benchmark 2026-10-02

Browser acceptance dùng Chromium với `--enable-precise-memory-info`, fixture IndexedDB 20.000 media, rồi chạy Picker, CSV và Manifest trên cold-cache. Kết quả bản phát hành: heap tăng **8.313.665 byte** (từ 1.059.164 lên 9.372.829 byte). Gate bắt buộc giữ heap tuyệt đối ≤ 128 MiB và delta ≤ 32 MiB.

Download/CSV/Manifest cold-cache nay đọc bằng cursor. Picker giữ 200 item; CSV và Manifest giữ tối đa 10.000 record. Media cache RAM dùng LRU tối đa 3 profile hoặc 50.000 item và bảo vệ profile đang collect/download hoặc còn dirty delta.

## Chrome DOM/long-task benchmark 2026-10-02

Queue fixture 500 item ban đầu render toàn bộ mất 796 ms, vượt budget 300 ms. Window 100 row còn 320 ms theo phép đo end-to-end, vì vậy Queue áp dụng cửa sổ 50 row và nút hiển thị thêm. Lần acceptance cuối đo trong renderer đạt **101,5 ms**, không có long task ≥ 50 ms và heap **1.876.326 byte**. Item đang download luôn được giữ trong DOM kể cả nằm ngoài cửa sổ đầu.

Download Center đã áp dụng cửa sổ 50 row sau benchmark; History và Following tiếp tục giữ giới hạn dữ liệu và regression hiện hành.

## Download Center và responsive acceptance 2026-10-02

Fixture 500 Queue + 500 history cho thấy cửa sổ 100+100 row có một long task 52 ms, vượt budget. Download Center vì vậy dùng cửa sổ 50 row cho mỗi list. Lần acceptance bản phát hành đạt **267 ms** từ navigation đến row đầu, **0 ms** long task trong refresh/render và acknowledgement `START_QUEUE` khoảng **1,5 ms**. Popup Main/Picker/Queue/Stats/Following và Download Center đều qua smoke screenshot/overflow tại 320, 360 và 400 px; keyboard chuyển tab bằng phím mũi tên được kiểm tra tự động.
