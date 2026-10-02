# P2 Toolkit — estimate, gallery, ZIP và lịch tải

> ExtensionX **7.2.0** | Cập nhật: 2026-10-02 | Trạng thái: **Released**

P2 Toolkit nằm trong Download Center và gom các công cụ lập kế hoạch/tổ chức download mà không mở rộng permission hiện hành.

## Phạm vi đã triển khai

- **Ước tính trước tải:** đếm ảnh/video/GIF, URL đã tải, số file còn lại, kích thước ước tính và cảnh báo job lớn. Đây là heuristic từ metadata; mục không có kích thước được đánh dấu riêng.
- **Rule-based organization:** `saveFolder` hỗ trợ `{username}`, `{year}`, `{month}`, `{type}`; từng segment được sanitize, giới hạn độ sâu và có preview.
- **Báo cáo lỗi:** JSON/CSV tối đa 500 phiên lỗi, chỉ gồm thời gian, loại media, trạng thái và counter; không xuất username, URL, token hay raw exception.
- **Gallery bounded:** đọc IndexedDB bằng cursor và trả tối đa 100 mục/trang; UI nạp 50 mục/lần, media dùng lazy/preload metadata.
- **ZIP theo chunk:** tối đa 200 file/lượt, mặc định 50 file/phần và 500 MiB/phần. ZIP được tạo trong offscreen document; SHA-256 loại nội dung trùng trong operation và Blob URL được revoke sau download.
- **Lịch Saved Job:** người dùng chủ động bật chu kỳ 1 giờ–30 ngày. `chrome.alarms` được phục hồi khi Service Worker thức dậy; lượt chạy bị bỏ qua nếu coordinator đang bận.
- **Notification Center:** giữ tối đa 100 sự kiện cục bộ, hỗ trợ đánh dấu đã đọc và system notification cho warning/error/success.

## Giới hạn an toàn

- Không cloud sync dữ liệu media, token hoặc lịch sử; không telemetry từ xa.
- Không ZIP vô hạn hoặc gom toàn bộ media thành một Blob.
- Không chạy nhiều Saved Job song song và không cố vượt rate-limit/phiên đăng nhập.
- HLS không được ghép vào ZIP như video hoàn chỉnh; nên dùng download trực tiếp cho HLS.
- Estimate không thực hiện HEAD/fetch hàng loạt và không cam kết dung lượng chính xác.

## Acceptance

- Pure regression bao phủ estimate, folder traversal, schedule bounds, redaction và SHA-256 determinism.
- Runtime message dùng allowlist field và typed response map.
- Download Center qua responsive/keyboard/screenshot smoke tại 320/360/400 px.
- Popup có intrinsic width 360 px để tránh Chrome co thành dải dọc; viewport dưới 360 px dùng responsive override riêng.
