# P2 Toolkit — estimate, gallery, ZIP và lịch tải

> ExtensionX **9.0.1** | Cập nhật: 2026-11-26 | Trạng thái: **Released trong 7.2.0, ổn định trong 7.2.1–9.0.1 (ô profile nhận #hashtag và link Search/List từ 9.0.0; ZIP tải trước 4 file song song từ 8.4.0; ZIP chia phần không bỏ file, loại HLS, báo kết quả trong Notification Center từ 8.2.3; ZIP không còn dùng JSZip, tạo bằng bộ ghi STORE tích hợp từ 8.2.2; ZIP lưu file qua service worker từ 7.2.3; Estimate/Gallery/ZIP dùng chung bộ lọc ngày theo giờ địa phương từ 7.3.0)**

P2 Toolkit nằm trong Download Center và gom các công cụ lập kế hoạch/tổ chức download mà không mở rộng permission hiện hành.

## Phạm vi đã triển khai

- **Ước tính trước tải:** đếm ảnh/video/GIF, URL đã tải, số file còn lại, kích thước ước tính và cảnh báo job lớn. Đây là heuristic từ metadata; mục không có kích thước được đánh dấu riêng.
- **Rule-based organization:** `saveFolder` hỗ trợ `{username}`, `{year}`, `{month}`, `{type}`; từng segment được sanitize, giới hạn độ sâu và có preview.
- **Báo cáo lỗi:** JSON/CSV tối đa 500 phiên lỗi, chỉ gồm thời gian, loại media, trạng thái và counter; không xuất username, URL, token hay raw exception.
- **Gallery bounded:** đọc IndexedDB bằng cursor và trả tối đa 100 mục/trang; UI nạp 50 mục/lần, media dùng lazy/preload metadata.
- **ZIP theo chunk:** tối đa 200 file/lượt, mặc định 50 file/phần và 500 MiB/phần; chạm một trong hai giới hạn thì lưu phần hiện tại và mở phần mới (chỉ file đơn > 500 MiB hoặc tải lỗi bị bỏ qua và được đếm). ZIP được tạo trong offscreen document, offscreen được giữ mở tới khi ZIP xong và kết quả ghi vào Notification Center; SHA-256 loại nội dung trùng trong operation, tên entry có đuôi và không trùng, Blob URL được revoke sau download. Mỗi lúc chỉ một lượt ZIP. Từ 8.4.0 offscreen tải trước tối đa 4 file cùng lúc nhưng xử lý đúng thứ tự, nên tên file, chống trùng và chia phần không đổi.
- **Nguồn (từ 9.0.0):** ô profile của công cụ P2 và ô "Username hoặc nguồn" của Saved Job nhận `NASA`, `@NASA`, `#hashtag`, hoặc link X của profile, trang tìm kiếm hay List; chữ nhập được chuyển thành khoá thu thập (`collectionKeyFromInput`), link ngoài X bị từ chối. Danh sách hiện tên nguồn dễ đọc ("#cats", "🔍 cat photos", "📋 1234567").
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
