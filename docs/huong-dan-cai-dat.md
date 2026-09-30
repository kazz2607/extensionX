# Hướng dẫn cài đặt và sử dụng

> X Media Downloader **6.2.7** | Cập nhật: 2026-09-30

Extension tải ảnh, video và GIF từ X.com, đồng thời hỗ trợ tải media trực tiếp trên Telegram Web A/K.

## Yêu cầu

- Chrome hoặc trình duyệt Chromium hỗ trợ Manifest V3.
- Node.js và npm nếu cài từ mã nguồn.
- Tài khoản X.com/Telegram đã đăng nhập cho nội dung yêu cầu quyền truy cập.

## Cài đặt từ mã nguồn

1. Tải hoặc clone repository.
2. Mở terminal tại thư mục dự án.
3. Cài dependency và build:

   ```powershell
   npm install
   npm run build
   ```

4. Mở `chrome://extensions`.
5. Bật **Developer mode**.
6. Chọn **Load unpacked** và trỏ tới thư mục `dist/`.
7. Kiểm tra popup hiển thị version **6.2.7**.

## Cập nhật extension

1. Lấy source mới nhất và chạy lại `npm run build`.
2. Mở `chrome://extensions` và bấm **Reload** trên extension.
3. Tải lại các tab X.com/Telegram đang mở để content script mới được nạp.

## Tải media từ X.com

1. Mở trang profile, media, likes hoặc bookmarks được hỗ trợ.
2. Mở popup và bấm **Start Collecting**.
3. Chờ số media tăng; dừng khi đủ hoặc để Smart Auto-Stop kết thúc.
4. Chọn loại media, date range, keyword hoặc preset nếu cần.
5. Bấm **Download**, hoặc dùng tab **Picker** để chọn từng mục.

File được lưu dưới thư mục Downloads theo cấu hình, mặc định phân nhóm theo username và loại media.

## Dùng Queue nhiều profile

1. Thu thập media của một profile và bấm **Add to Queue**.
2. Lặp lại với các profile khác.
3. Mở tab **Queue** và bấm **Start**.
4. Có thể pause/resume, đổi thứ tự, dừng hoặc retry từng mục.

Từ v6.2.7, `START_QUEUE` được xác nhận ngay; item chuyển sang **Đang tải** trước khi đọc IndexedDB. Nếu dữ liệu profile không còn trong IndexedDB, item chuyển **Lỗi** và queue tiếp tục mục kế tiếp. Khi bấm **Dừng**, item đang tải chuyển sang **Tạm dừng** và hiện nút **▶ Tiếp tục**.

Queue chỉ tải ảnh bài viết độc lập. Ảnh bìa/thumbnail dùng để đại diện cho video (`ext_tw_video_thumb`, `amplify_video_thumb`) được bỏ qua; file video gốc vẫn được tải bình thường.

## Các tính năng chính

- **Download Picker:** chọn tối đa 200 thumbnail mỗi lần; kết hợp được với bộ lọc.
- **Filter Preset:** lưu loại media, date range, keyword và tùy chọn chống trùng theo profile.
- **Filename Template:** dùng token như `{username}`, `{tweetId}`, `{date}`, `{type}`, `{ext}`, `{index}`.
- **Manifest export:** xuất JSON/CSV cho lịch sử tải.
- **Watch mode:** so sánh số media khi người dùng chủ động mở lại popup; không polling nền.
- **FAB và nút tweet:** thao tác tải nhanh trực tiếp trên X.com.
- **Following Scroll:** tự cuộn trang Following; API Scanner/Unfollow vẫn đang ở backlog.

## Tải media từ Telegram Web

- Extension hỗ trợ `https://web.telegram.org/a/` và `/k/`.
- Ảnh/video có nút tải trực tiếp; video stream riêng tư được tải theo từng Range trong ngữ cảnh trang.
- Sau khi reload/cập nhật extension, phải F5 tab Telegram.
- Nếu video chưa có stream URL, hãy phát video hoặc chờ video sẵn sàng rồi thử lại.

## Cài đặt

Trang Options cho phép cấu hình:

- Thư mục và cách phân loại file.
- Số download đồng thời.
- Bỏ qua file đã tải.
- Template tên file.
- Smart Auto-Stop, snackbar, notification và feature toggle.
- Diagnostic cục bộ opt-in, export và xóa dữ liệu diagnostic.

Các thay đổi được tự động lưu; kiểm tra trạng thái **Saved** trước khi đóng trang.

## Xử lý sự cố

### Không tìm thấy media

- Đảm bảo đang ở đúng profile/tab được hỗ trợ và đã đăng nhập.
- Tải lại trang, bắt đầu collect rồi cuộn để X.com nạp thêm dữ liệu.
- Với profile private, tài khoản hiện tại phải có quyền xem.

### Queue không bắt đầu

- Xác nhận popup và `dist/manifest.json` cùng version 6.2.7.
- Reload extension và mở lại popup.
- Mục có `0 media` sẽ chuyển Error; kiểm tra profile khác còn dữ liệu hay không.
- Mở Service Worker console và tìm `START_QUEUE`, `Queue IndexedDB load failed` hoặc lỗi download.

### Download dừng hoặc lỗi

- Kiểm tra mạng và quyền download của Chrome.
- Giảm concurrency trong Options.
- Dùng **Retry**; tùy chọn chống trùng sẽ bỏ qua file đã tải thành công.
- Tắt tạm download manager bên thứ ba nếu nó đổi đường dẫn hoặc chặn nhiều file.

### Telegram không tải được video

- F5 tab Telegram sau mỗi lần reload extension.
- Mở viewer/phát video để Telegram tạo stream URL.
- Kiểm tra lỗi HTTP 401/403/408/429/5xx trong console.

### Không thấy FAB hoặc nút tải

- Reload tab sau khi cập nhật extension.
- Kiểm tra feature toggle trong Options.
- Xác nhận extension có quyền chạy trên domain hiện tại.

## Thu thập log khi báo lỗi

1. Mở `chrome://extensions` → extension → **Service worker** → Console.
2. Với lỗi popup: chuột phải popup → **Inspect** → Console.
3. Gửi tên version, bước tái hiện và thông báo lỗi; không gửi bearer token, cookie hoặc URL có token.

## Quyền riêng tư

- Dữ liệu media, queue, history và diagnostic nằm cục bộ trong trình duyệt.
- Diagnostic mặc định tắt và không chứa username, URL hoặc token thô.
- Extension chỉ dùng phiên đăng nhập hiện tại để truy cập nội dung người dùng đã có quyền xem.

Xem thêm: [mục lục tài liệu](README.md), [quality gate](quality-gate.md) và [lịch sử phát hành](../CHANGELOG.md).
