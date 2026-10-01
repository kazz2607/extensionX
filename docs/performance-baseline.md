# Baseline hiệu năng và build budget 7.0.1

> Cập nhật: 2026-10-01

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

Build 7.0.1 tiếp tục áp dụng gate tự động trong `npm run check` và tính cả entrypoint Download Center:

| Chỉ số build | Ngưỡng | Kết quả 7.0.1 |
| --- | ---: | ---: |
| Tổng JavaScript trong `dist/` | ≤ 300.000 byte | 255.621 byte |
| JavaScript bundle lớn nhất | ≤ 90.000 byte | 74.471 byte |
| Số module TypeScript trong `src/` | ≤ 80 | 72 |

Ngưỡng nằm trong `performance-budget.json` và được kiểm tra bởi `scripts/check-performance-budget.mjs`.

## Cách đo

Đo runtime trên Chrome production build với fixture 100, 1.000, 10.000 và 50.000 media. Matcher chạy 7 lượt; browser acceptance đo Queue lifecycle, heap 20.000 media và DOM/long-task 500 item. Các chỉ số mở popup tổng thể, Start Queue riêng và các list ngoài Queue vẫn là budget cần bổ sung, không được suy diễn từ benchmark hiện có.

## Phần tiếp tục

Queue đã dùng cửa sổ render 50 row. History/Following/Download Center chỉ áp dụng windowing sau khi có số đo fixture lớn; focus/keyboard behavior cần regression UI riêng.

## Benchmark CPU 2026-10-01

Chạy `npm run benchmark:media` với 7 lượt trên môi trường phát triển hiện tại. Đây là benchmark matcher/filter thuần, không đại diện cho thời gian IndexedDB, render DOM hoặc peak heap Chrome.

| Fixture | Median | p95 |
| ---: | ---: | ---: |
| 100 | 0,043 ms | 0,109 ms |
| 1.000 | 0,157 ms | 1,398 ms |
| 10.000 | 1,528 ms | 8,006 ms |
| 50.000 | 4,906 ms | 19,596 ms |

Budget CI ban đầu cho matcher 50.000 media là p95 ≤ 250 ms. Count/Picker cold-cache nay quét IndexedDB bằng cursor và chỉ giữ cửa sổ Picker tối đa 200 item. Queue windowing được quyết định bằng Chrome DOM/heap benchmark riêng, không dựa trên benchmark CPU này.

## Chrome heap benchmark 2026-10-01

Browser acceptance dùng Chromium với `--enable-precise-memory-info`, fixture IndexedDB 20.000 media, rồi chạy Picker, CSV và Manifest trên cold-cache. Kết quả mẫu: heap tăng **8.375.316 byte** (từ 990.871 lên 9.366.187 byte). Gate bắt buộc giữ heap tuyệt đối ≤ 128 MiB và delta ≤ 32 MiB.

Download/CSV/Manifest cold-cache nay đọc bằng cursor. Picker giữ 200 item; CSV và Manifest giữ tối đa 10.000 record. Media cache RAM dùng LRU tối đa 3 profile hoặc 50.000 item và bảo vệ profile đang collect/download hoặc còn dirty delta.

## Chrome DOM/long-task benchmark 2026-10-01

Queue fixture 500 item ban đầu render toàn bộ mất 796 ms, vượt budget 300 ms. Window 100 row còn 320 ms theo phép đo end-to-end, vì vậy Queue áp dụng cửa sổ 50 row và nút hiển thị thêm. Lần acceptance cuối đo trong renderer đạt **0,5 ms**, không có long task ≥ 50 ms và heap **1.876.811 byte**. Item đang download luôn được giữ trong DOM kể cả nằm ngoài cửa sổ đầu.

History/Following/Download Center chưa có bằng chứng vượt budget nên chưa áp dụng windowing mù.
