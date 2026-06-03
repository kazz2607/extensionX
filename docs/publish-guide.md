# Hướng Dẫn Đóng Gói và Xuất Bản Lên Chrome Web Store

Tài liệu này hướng dẫn chi tiết các bước để chuẩn bị, đóng gói mã nguồn và đưa tiện ích **X Media Downloader** lên chợ ứng dụng Chrome Web Store (CWS).

---

## 1. Chuẩn Bị (Làm Sạch Mã Nguồn)

Trước khi đóng gói, bạn cần loại bỏ các thư mục và tập tin không cần thiết để file nén (ZIP) nhẹ nhất có thể và tránh bị Google từ chối do mã nguồn rác.

**Những thành phần CẦN giữ lại:**
- `_locales/`
- `background/`
- `content/`
- `icons/`
- `lib/`
- `offscreen/`
- `options/`
- `popup/`
- `manifest.json`
- `rules.json`

**Những thành phần CẦN loại bỏ (Không đưa vào file ZIP):**
- Thư mục `.git/` (dữ liệu quản lý phiên bản)
- Thư mục `docs/` (chứa tài liệu nội bộ, kế hoạch)
- Thư mục `scratch/` (code nháp)
- `README.md`, `CHANGELOG.md` (nếu không cần thiết)
- Các file test như `test-api.js`, `test-synd.js`

---

## 2. Đóng Gói Tiện Ích (Tạo File ZIP)

1. Mở thư mục gốc của dự án (`extensionX`).
2. Chọn tất cả các file/thư mục thuộc danh sách "CẦN giữ lại" ở trên.
3. Click chuột phải, chọn **Compress to ZIP file** (trên Windows 11) hoặc **Send to > Compressed (zipped) folder** (Windows 10).
4. Đặt tên file ZIP rõ ràng, ví dụ: `x-media-downloader-v4.0.1.zip`.

> [!WARNING]
> Đảm bảo file `manifest.json` nằm ở **thư mục gốc** bên trong file ZIP. Nếu giải nén file ZIP ra mà thấy một thư mục cha bọc ngoài (ví dụ `extensionX/manifest.json`), Google sẽ báo lỗi không hợp lệ.

---

## 3. Tạo Tài Khoản Nhà Phát Triển

Nếu bạn chưa có tài khoản Chrome Web Store Developer:
1. Truy cập: [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/)
2. Đăng nhập bằng tài khoản Google (Gmail).
3. Thanh toán phí đăng ký **$5.00 USD** (phí thu một lần duy nhất).
4. Hoàn tất khai báo thông tin cá nhân/tổ chức.

---

## 4. Tải Tiện Ích Lên (Upload)

1. Tại Dashboard, nhấn nút **+ New Item** (Thêm mục mới).
2. Kéo thả file `x-media-downloader-v4.0.1.zip` của bạn vào ô tải lên.
3. Chờ Google quét virus sơ bộ. Nếu hợp lệ, bạn sẽ được chuyển sang trang điền thông tin chi tiết (Store Listing).

---

## 5. Điền Thông Tin Cửa Hàng (Store Listing)

Mục này rất quan trọng để thu hút người dùng và vượt qua vòng kiểm duyệt.

### 5.1. Mô Tả Chi Tiết (Description)
Viết mô tả rõ ràng tính năng của tiện ích. Không sử dụng từ ngữ vi phạm bản quyền hay lừa đảo.
*Ví dụ:*
> "X Media Downloader là công cụ tối ưu giúp bạn tải xuống hình ảnh, video và GIF từ bất kỳ hồ sơ X.com (Twitter) nào. Hỗ trợ tự động nhận diện chất lượng video tốt nhất, bỏ qua lỗi phân trang, phân loại folder gọn gàng và không giới hạn số lượng tải."

### 5.2. Hình Ảnh (Graphic Assets)
- **Store icon:** 128x128 pixel (Dùng file `icons/icon128.png`).
- **Screenshots:** Ít nhất 1-2 ảnh kích thước chuẩn (khuyên dùng `1280x800` hoặc `640x400`). Hãy chụp lại màn hình Popup hiển thị tiến trình tải mượt mà.
- **Promo marquee (Tuỳ chọn):** 440x280 pixel. Ảnh bìa hiển thị khi extension được đề xuất.

---

## 6. Khai Báo Quyền riêng tư (Privacy & Permissions)

Google kiểm duyệt rất gắt gao các quyền (permissions) mà extension yêu cầu trong `manifest.json`. Bạn phải giải thích lý do cụ thể tại sao lại cần từng quyền:

- `downloads`: Dùng để lưu file ảnh/video thông qua API `chrome.downloads` vào máy tính người dùng.
- `storage`: Dùng để lưu cài đặt cấu hình (thư mục gốc, tuỳ chọn flat directory).
- `scripting` & `activeTab`: Dùng để tiêm mã đọc giao diện (DOM scanner) vào trang X.com khi người dùng nhấn nút kích hoạt trên popup.
- `declarativeNetRequest`: Dùng để sửa đổi header CORS hỗ trợ fetch video.

**Single Purpose (Mục đích duy nhất):**
Khẳng định tiện ích chỉ phục vụ một mục đích duy nhất: "Giúp người dùng sao lưu, tải xuống media từ mạng xã hội X.com."

**Data Usage (Sử dụng dữ liệu):**
Đánh dấu xác nhận tiện ích của bạn KHÔNG thu thập dữ liệu cá nhân (PII), KHÔNG bán dữ liệu cho bên thứ ba và KHÔNG theo dõi hành vi duyệt web ngoài X.com.

---

## 7. Gửi Xét Duyệt (Submit for Review)

1. Nhấn nút **Save draft** (Lưu nháp) để kiểm tra lại toàn bộ thông tin.
2. Nếu mọi ô báo đỏ (lỗi) đã biến mất, nút **Submit for Review** (Gửi để xét duyệt) sẽ sáng lên.
3. Nhấn Submit.

### Chờ Đợi Kết Quả
- Tiện ích mới có thể mất từ **vài giờ đến 2-3 ngày** (thậm chí 1 tuần) để đội ngũ Google review tự động và thủ công.
- Trạng thái sẽ hiện là *Pending review*. Khi thành công sẽ đổi thành *Published*.
- Nếu bị từ chối, Google sẽ gửi email giải thích lý do cụ thể. Đa phần là do thiếu giải thích về Permissions hoặc file ZIP chứa code mã hoá (minified/obfuscated) không hợp lệ (nhưng dự án của ta code hoàn toàn nguyên bản Vanilla JS nên sẽ không gặp lỗi này).

---

🎉 **Chúc bạn phát hành X Media Downloader thành công!**
