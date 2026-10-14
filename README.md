# X Media Downloader ⬇️

Extension Chrome mạnh mẽ cho phép bạn tải toàn bộ ảnh, video và GIF từ bất kỳ profile nào trên X.com (Twitter) với chất lượng gốc, hoàn toàn tự động và sắp xếp gọn gàng vào thư mục theo tên người dùng.

> **Phiên bản hiện tại: 8.1.0** — Tự giảm tốc khi X giới hạn tốc độ (429), nghỉ giữa các file, tối đa 6 luồng; 8.0.0 thêm Search/Hashtag, caption và like trong Manifest, danh sách file lỗi.

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
- 📄 **Xuất CSV & Manifest:** Lưu danh sách URL media đã quét thành `.csv`, hoặc xuất Manifest JSON/CSV các file đã tải theo từng profile.
- 🖼️ **Download Picker:** Chọn/bỏ chọn từng ảnh/video qua lưới thumbnail trước khi tải.
- 💾 **Filter Preset:** Lưu và nạp lại bộ lọc (loại media, khoảng ngày, từ khoá) cho từng profile.
- 📋 **Queue nâng cao:** Tạm dừng, đổi thứ tự, thử lại từng mục; tự resume đúng cách sau khi Service Worker restart.
- 🧭 **Download Center:** Quản lý Queue, tìm kiếm/lọc trạng thái, xem lịch sử và lỗi trên một trang đầy đủ.
- 💼 **Saved Jobs:** Lưu profile, bộ lọc, thư mục và template tên file để chủ động chạy lại khi cần, không polling nền.
- 🧩 **Template tên file:** Tự đặt tên file bằng `{username} {tweetId} {date} {type} {ext} {index}` kèm preview.
- 👁 **Watch mode:** Báo media mới của profile theo dõi mỗi khi mở popup — không polling ngầm.
- 🔒 **100% Xử lý cục bộ:** Toàn bộ quá trình quét, phân tích và tải xuống diễn ra trên máy của bạn, không có bất kỳ kết nối nào tới server bên thứ 3.
- 🌐 **Song ngữ English / Tiếng Việt:** Toàn bộ popup, Options, Download Center, FAB, snackbar và thông báo; English là mặc định, đổi trong Options.
- 🌓 **Theme theo hệ thống:** Sáng / Tối / Theo hệ thống, áp dụng đồng bộ cho popup, Options và Download Center.
- ✈️ **Telegram Web:** Chèn nút tải trực tiếp lên ảnh/video, hỗ trợ media từ URL HTTP(S), `blob:`, `data:`, canvas và video stream của nhóm/chat riêng tư (tải theo từng đoạn Range, có % tiến độ) trên giao diện A/K.

## 🛠 Hướng Dẫn Cài Đặt

Vui lòng xem [mục lục tài liệu](docs/README.md) hoặc [hướng dẫn cài đặt](docs/huong-dan-cai-dat.md).

**Tóm tắt cài đặt:**
1. Mở Chrome, truy cập `chrome://extensions`
2. Bật **Developer mode** (Chế độ dành cho nhà phát triển) ở góc trên bên phải.
3. Chọn **Load unpacked** (Tải tiện ích đã giải nén).
4. Trỏ tới thư mục chứa mã nguồn extension này.

## 💻 Cách Sử Dụng

1. Mở trang media của bất kỳ tài khoản X.com nào (ví dụ: `https://x.com/NASA/media`).
2. Nhấn vào biểu tượng **Widget tròn màu xanh** ở góc phải màn hình, chọn **Collect** (widget tự ẩn khi X đang mở ảnh phóng to hoặc hộp thoại).
3. (Hoặc) Click vào biểu tượng Extension trên thanh công cụ của Chrome, chọn **Start Collecting**.
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
- Đặt mẫu tên file tuỳ chỉnh (token `{username} {tweetId} {date} {type} {ext} {index}`).
- Chọn ngôn ngữ (English / Tiếng Việt) và giao diện (Theo hệ thống / Sáng / Tối).

## 🔒 Quyền (Permissions) Giải Thích

- `downloads`: Để extension có thể lưu file tự động vào máy bạn.
- `storage`: Lưu cấu hình cài đặt và session restore.
- `scripting`: Kích hoạt tải Blob/stream trong trang Telegram Web. Extension không yêu cầu `tabs` hay `activeTab` (bỏ từ 7.3.0); URL tab X/Telegram đọc được nhờ host permission.
- `offscreen`: Ghép video HLS và tạo ZIP theo chunk trong document ngầm.
- `alarms`: Keep-alive Service Worker khi đang tải nhiều file và lịch Saved Job do người dùng bật.
- `notifications`: Thông báo hệ thống khi tải xong (có thể tắt trong Options).
- `host_permissions` (`*.x.com`, `*.twitter.com`, `pbs.twimg.com`, `video.twimg.com`, `cdn.syndication.twimg.com`, `web.telegram.org`): Cho phép extension đọc media từ X/Twitter và gắn nút tải trên Telegram Web.

---

*Phát triển nội bộ — Phiên bản **8.1.0** | Cập nhật: 2026-10-14*
