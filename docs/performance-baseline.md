# Baseline hiệu năng 6.3.0

> Cập nhật: 2026-09-30

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

## Cách đo

Đo trên Chrome production build với fixture 100, 1.000, 10.000 và 50.000 media; chạy 5 lần sau một lượt warm-up. Ghi median/p95 cho mở popup, filter, render Queue, Start Queue và peak JS heap. Kết quả máy thật chưa được ghi vào repository cho đến khi browser harness chạy trên origin X hợp lệ; vì vậy các mục trên là budget, không phải số liệu đã đạt được.

## Phần tiếp tục

Virtualization cho Picker/History/Following và cursor trực tiếp từ IndexedDB cần triển khai sau khi có số đo fixture lớn. Không áp dụng virtualization mù vì chiều cao row và focus/keyboard behavior cần regression UI riêng.
