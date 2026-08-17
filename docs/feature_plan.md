# Đề xuất tính năng mới cho ExtensionX

Dựa trên phiên bản hiện tại (v5.7.4) đã hoạt động rất ổn định với các tính năng cơ bản và phím tắt thông minh, dưới đây là một số ý tưởng tính năng mở rộng nâng cao mà chúng ta có thể cân nhắc phát triển tiếp theo để biến ExtensionX thành một công cụ siêu mạnh mẽ:

## 1. Bulk Download (Tải hàng loạt thông minh)
- **Mô tả:** Thêm một nút trên giao diện Popup cho phép "Quét toàn bộ ảnh trên trang web hiện tại".
- **Tiện ích:** Thay vì phải tải hoặc copy từng ảnh một, extension sẽ tự động gom link toàn bộ ảnh trên trang (rất tiện cho các trang truyện tranh).
- **Bộ lọc:** Cung cấp bộ lọc theo kích thước (ví dụ: chỉ tải ảnh lớn hơn 500x500px) để loại bỏ ảnh icon, ảnh quảng cáo.

## 2. Auto-Scroll & Scrape (Tự động cuộn và thu thập)
- **Mô tả:** Khi kích hoạt, trang web sẽ tự động cuộn từ từ xuống dưới cùng, sau đó thu thập mọi hình ảnh hiện ra.
- **Tiện ích:** Khắc phục được các trang web sử dụng công nghệ Lazy-load (chỉ tải ảnh khi cuộn chuột tới nơi). Rất phù hợp với các nền tảng mạng xã hội hoặc truyện tranh cuộn dọc.

## 3. Đóng gói thành file ZIP
- **Mô tả:** Tích hợp thư viện JSZip. Sau khi quét hàng loạt ảnh, hệ thống không tải từng file lẻ tẻ (tránh việc tải 100 ảnh làm treo trình duyệt hoặc báo popup liên tục), mà sẽ nén lại thành 1 file `.zip` duy nhất.
- **Tiện ích:** Gọn gàng thư mục tải về, dễ dàng quản lý theo tên chương/tên tác giả.

## 4. Rename Pattern (Đổi tên file tự động theo quy tắc)
- **Mô tả:** Cho phép người dùng thiết lập cấu trúc tên file trước khi tải trong trang Settings.
- **Ví dụ:** `[Tên_Web] - [Tên_Tác_Giả] - [Số_Thứ_Tự].jpg`
- **Tiện ích:** Giúp người dùng tiết kiệm hàng giờ đồng hồ ngồi phân loại và đổi tên file sau khi tải về.

## 5. Chế độ "Lấy ảnh gốc" (Extract Original Source)
- **Mô tả:** Tự động bắt link gốc chất lượng cao nhất của ảnh dù trang web có sử dụng các mánh lới che giấu bằng thẻ Canvas hay thẻ DIV chứa background.
- **Tiện ích:** Đảm bảo ảnh tải về không bị mờ hay thu nhỏ độ phân giải.

## 6. Alt + Click để tải nhanh
- **Mô tả:** Bổ sung thêm thao tác chuột. Giữ phím `Alt` và `Click chuột trái` vào bất kỳ bức ảnh nào trên trang web để tải nó về máy ngay lập tức (không cần dùng bàn phím).

---
**Nhận xét:**
Nếu bạn thấy tính năng nào trên đây hữu ích và phù hợp với nhu cầu hiện tại, hãy cho mình biết để mình bắt tay vào viết code và hiện thực hóa nó ngay nhé!
