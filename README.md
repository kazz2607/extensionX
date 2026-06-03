# X Media Downloader ⬇️

Extension Chrome mạnh mẽ cho phép bạn tải toàn bộ ảnh, video và GIF từ bất kỳ profile nào trên X.com (Twitter) với chất lượng gốc, hoàn toàn tự động và sắp xếp gọn gàng vào thư mục theo tên người dùng.

## ✨ Tính Năng Nổi Bật

- 🚀 **Thu thập tự động (Auto-scroll):** Tự động cuộn trang và thu thập media nhanh chóng.
- 🗂️ **Tổ chức thông minh:** Tự động tạo thư mục theo `username` (ví dụ: `Downloads/NASA/`). Hỗ trợ tạo thư mục con phân loại theo `images`, `videos`, `gifs` hoặc gộp chung tuỳ ý.
- 🎬 **Hỗ trợ HLS Video (.m3u8):** Xử lý mượt mà các video định dạng HLS (tải từng segment và nối lại) ở độ phân giải cao nhất.
- 🔍 **Thu thập kép (Dual Engine):** Kết hợp bắt GraphQL API request và quét DOM (MutationObserver) để đảm bảo không bỏ sót bất kỳ hình ảnh hay video nào.
- 🔘 **Widget tiện lợi (FAB):** Nút công cụ nổi ngay trên trang X.com, có thể kéo lên/xuống tự do, giúp thao tác nhanh mà không cần mở popup.
- ⬇️ **Download Mini Button:** Nút tải nhỏ xuất hiện trực tiếp trên từng tweet có media — click là tải ngay.
- 🔔 **Progress Snackbar:** Thanh tiến trình glassmorphism xuất hiện ngay trên trang X.com khi download, không cần mở popup theo dõi.
- 💾 **Session Restore:** Tự động lưu phiên thu thập và khôi phục sau khi browser tắt hoặc crash.
- 🧹 **Smart Filters:** Tự động loại bỏ ảnh avatar, banner, card preview và ảnh nhỏ hơn ngưỡng tối thiểu.
- 📄 **Xuất CSV:** Lưu danh sách các URL media đã quét được thành file `.csv` chỉ với 1 click.
- 🔒 **100% Xử lý cục bộ:** Toàn bộ quá trình quét, phân tích và tải xuống diễn ra trên máy của bạn, không có bất kỳ kết nối nào tới server bên thứ 3.

## 🛠 Hướng Dẫn Cài Đặt

Vui lòng xem chi tiết tại: [Hướng Dẫn Cài Đặt](docs/huong-dan-cai-dat.md)

**Tóm tắt cài đặt:**
1. Mở Chrome, truy cập `chrome://extensions`
2. Bật **Developer mode** (Chế độ dành cho nhà phát triển) ở góc trên bên phải.
3. Chọn **Load unpacked** (Tải tiện ích đã giải nén).
4. Trỏ tới thư mục chứa mã nguồn extension này.

## 💻 Cách Sử Dụng

1. Mở trang media của bất kỳ tài khoản X.com nào (ví dụ: `https://x.com/NASA/media`).
2. Nhấn vào biểu tượng **Widget tròn màu xanh** ở góc phải màn hình, chọn **Thu Thập**.
3. (Hoặc) Click vào biểu tượng Extension trên thanh công cụ của Chrome, chọn **Bắt đầu Thu Thập**.
4. Chờ extension cuộn trang và tìm kiếm media.
5. Click **Download** để tải tất cả ảnh/video/gif xuống máy.

## ⚙️ Tuỳ Chỉnh

Click vào nút ⚙ (Cài đặt) trên popup của extension để tuỳ chỉnh:
- Đặt Thư mục cơ sở lưu trữ (ví dụ: gõ `TwitterMedia` để lưu vào `Downloads/TwitterMedia/...`).
- Tuỳ chọn gộp chung thư mục media hoặc chia tách theo loại (Ảnh / Video / GIF).
- Cài đặt tốc độ cuộn trang, số luồng tải song song, số lượng media tối đa...
- Chọn tải riêng lẻ Từng loại Ảnh / Video / GIF ở chất lượng gốc.
- Bật/tắt Smart Filters, ngưỡng kích thước tối thiểu cho ảnh.
- Bật/tắt Progress Snackbar trên trang khi đang tải.

## 🔒 Quyền (Permissions) Giải Thích

- `downloads`: Để extension có thể lưu file tự động vào máy bạn.
- `storage`: Lưu cấu hình cài đặt và session restore.
- `scripting`, `activeTab`, `tabs`: Để nhúng mã thu thập (interceptor, dom scanner, fab) trực tiếp vào trang X.com.
- `alarms`: Keep-alive Service Worker khi đang tải nhiều file, tránh bị Chrome terminate.
- `host_permissions` (`*.x.com`, `*.twitter.com`, `pbs.twimg.com`, `video.twimg.com`): Cho phép extension đọc dữ liệu và fetch media file từ server của Twitter.

---

*Phát triển nội bộ — Phiên bản **4.1.0** | Cập nhật: 2026-06-03*
