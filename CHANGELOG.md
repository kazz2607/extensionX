# Changelog

Tất cả các thay đổi đáng chú ý của dự án **X Media Downloader** sẽ được ghi chép tại file này.

## [3.4.2] - 2026-05-27
### Sửa lỗi (Fixed)
- **Auto Scroll:** Sửa lỗi nghiêm trọng khiến tiện ích tiếp tục cuộn trang vô hạn ngay cả khi người dùng chuyển sang trang khác (như trang chủ hoặc một bài đăng cụ thể). Cải thiện logic để dừng thu thập ngay lập tức khi phát hiện không còn ở trang Media.

---

## [3.4.1] - 2026-05-27
### Sửa lỗi (Fixed)
- **Auto Scroll:** Cải thiện độ ổn định của tính năng tự động cuộn trang. Xóa bỏ cuộn mượt (smooth) để tận dụng tối đa thời gian chờ mạng, kết hợp thủ thuật (scroll trick) để buộc X.com tải thêm ảnh.
- **Auto Scroll:** Tạm dừng thông minh (pause) khi người dùng thu nhỏ trình duyệt hoặc chuyển tab, tránh tình trạng báo lỗi sai do X.com ngừng render.

---

## [3.4.0] - 2026-05-27
### Thêm mới (Added)
- **Đa ngôn ngữ (i18n):** Hỗ trợ Tiếng Anh (Mặc định) và Tiếng Việt. Bạn có thể thay đổi ngôn ngữ ngay trong trang Cài đặt (Options).
- **Giao diện Options mới:** Bổ sung phần Cài đặt Giao diện (Appearance) chứa tùy chọn đổi Ngôn ngữ và Chủ đề (Theme) gọn gàng hơn.

---

## [3.3.0] - 2026-05-27
### Thêm mới (Added)
- **Light / Dark Mode Toggle:** Thêm nút chuyển đổi giao diện (biểu tượng ☀️/🌙) ngay trên thanh Header của cả Popup và trang Cài đặt. Trạng thái được lưu vào `chrome.storage.local` và đồng bộ tự động giữa hai trang.
- **Định dạng tên file Username_TweetID_Serial:** Thêm tùy chọn mới trong phần Download của trang Cài đặt. Khi bật, file sẽ được đặt tên theo định dạng `username_TweetID_randomSerial.ext` (ví dụ: `NASA_1234567890_ab3f2.jpg`), thay vì chỉ dùng TweetID như trước. Giúp dễ nhận biết nguồn gốc file khi lưu vào cùng một thư mục.

---

## [3.3.0] - 2026-05-27
### Thêm mới (Added)
- **Bật/Tắt Light Mode & Dark Mode:** Thêm nút chuyển đổi giao diện (☀️/🌙) trực tiếp trên header của Popup và trang Cài đặt. Trạng thái được lưu vào `chrome.storage.local` và đồng bộ tự động giữa Popup và Options khi mở lại.
- **Đặt tên file theo Username_TweetID_Serial:** Bổ sung tuỳ chọn trong trang Cài đặt → Download, cho phép lưu tên file theo định dạng `username_TweetID_random.ext` (ví dụ: `NASA_1234567890_ab3f2.jpg`) thay vì chỉ `TweetID_random.ext` như trước.

### Sửa lỗi (Fixed)
- **Counter đếm media trên trang Home / Explore:** `content.js` relay toàn bộ `X_MEDIA_FOUND` bất kể người dùng đang ở trang nào. Sửa bằng cách thêm flag `isCollecting` — chỉ đếm và gửi media lên Service Worker khi đang trong phiên thu thập do người dùng chủ động kích hoạt. Badge số lượng trên icon extension giờ chỉ tăng khi đang thu thập trên trang profile/media.

---

## [3.2.0] - 2026-05-26
### Sửa lỗi & Tối ưu (Fixed & Improved)
- **Bypass CORS cho video NSFW:** Đưa luồng truy vấn API nội bộ về Service Worker, kết hợp sử dụng User Cookie (`ct0`) để gọi trực tiếp endpoint `x.com/i/api`. Khắc phục hoàn toàn lỗi HTTP 404/403 khi lấy video NSFW (18+).
- **MAIN World Interceptor:** Cấu hình `page-interceptor.js` chạy trong không gian `MAIN` thông qua `manifest.json` ở mốc `document_start`. Đảm bảo đánh chặn GraphQL API hoàn hảo trước khi bị inline script của Twitter chặn đứng.
- **Hook JSON.parse & XHR:** Bắt trực tiếp dữ liệu React `__INITIAL_STATE__` từ `JSON.parse` và luồng phân trang cũ từ `XMLHttpRequest`. Đảm bảo quét sạch 100% video URL trên màn hình ngay khi cuộn chuột.
- **Tránh gọi API thừa (Duplicate Check):** Cải tiến `dom-scanner` và Service Worker để bỏ qua các thẻ video nếu URL gốc của chúng đã được Interceptor thu thập thành công. Giảm tải request báo lỗi 404 vô ích.

---

## [3.1.0] - 2026-05-26
### Sửa lỗi (Fixed)
- **CORS & Syndication API:** Khắc phục triệt để lỗi không lấy được video URL do chính sách CORS của Twitter Syndication API bằng cách áp dụng `declarativeNetRequest` (Ghi đè `Access-Control-Allow-Origin` sang `*`). 
- **DOM Scanner Video:** Cải thiện khả năng phát hiện video thumbnail (ảnh đại diện cho video) trong tab Media của Twitter, giúp lấy được video ngay cả khi Twitter không render thẻ `<video>`.
- **Offscreen Download API Error:** Sửa lỗi `Cannot read properties of undefined (reading 'download')`. Dịch chuyển tác vụ gọi `chrome.downloads` từ Offscreen Document (nơi không có quyền truy cập API) sang Service Worker để tải video MP4/HLS thành công.
- Loại bỏ các HTTP Header `Origin` và `Referer` bị cấm trong Fetch API khi dùng extension.

---

## [3.0.0] - 2026-05-26
### Thay đổi (Changed)
- **Kiến trúc Tải Xuống mới (Direct Download):** Loại bỏ hoàn toàn quá trình tạo file ZIP khổng lồ ngốn RAM. Chuyển sang tải trực tiếp từng file thông qua API `chrome.downloads`.
- **Cấu trúc thư mục:** Tự động tạo thư mục con theo tên người dùng bên trong thư mục `Downloads` mặc định của Chrome (ví dụ: `Downloads/[username]/`).
- **Giao diện Options mới:** Cập nhật trang cài đặt, bổ sung Realtime Preview cho cấu trúc đường dẫn thư mục tải về.
- **Tối ưu hoá Popup:** Nút "Tải ZIP" được đổi thành "Download", nút xuất CSV được làm gọn gàng hơn. Xoá bỏ thanh trạng thái tạo file nén.

### Thêm mới (Added)
- **Tùy chọn Thư mục Cơ sở:** Cho phép người dùng tuỳ biến thư mục cha trong Downloads (vd: `Downloads/X_Media/[username]`).
- **Tùy chọn Gộp Thư mục (Flat Username Directory):** Thêm cài đặt cho phép gộp chung tất cả media vào folder `[username]` thay vì chia tách thành `images`, `videos`, `gifs`.
- **Quản lý Download Queue:** Có thể điều chỉnh số lượng tải song song (Concurrency) từ 1 đến 5 để tránh quá tải kết nối.

### Loại bỏ (Removed)
- Loại bỏ thư viện `jszip` và API Offscreen Document vì không còn cần thiết.

---

## [2.0.0] - 2026-05-26
### Thêm mới (Added)
- **Hỗ trợ Video HLS (.m3u8):** Xây dựng module `hls-fetcher` nội bộ để parse playlist, tải song song các file phân mảnh (TS segment) và ghép lại thành video `.mp4` hoàn chỉnh.
- **DOM Scanner (Fallback):** Bổ sung trình quét cấu trúc HTML với `MutationObserver`. Cho phép phát hiện và lưu lại ảnh/video bị sót khi GraphQL Interceptor hoạt động không hiệu quả do API thay đổi.
- **Floating Action Button (FAB):** Bổ sung Widget trực tiếp trên trang giao diện của X.com. Cho phép thao tác nhanh (Thu thập, Tải xuống) và xem trạng thái realtime mà không cần mở Popup extension.
- **Bộ Lọc Phân Loại (Filter Tabs):** Thêm các tab phân loại `All`, `Images`, `Videos`, `GIFs` trên Popup. Cho phép người dùng lọc và chọn tải riêng từng loại.
- **Trích xuất CSV:** Tính năng xuất danh sách URL đã quét ra file Excel/CSV.
- **Theo dõi Tốc độ & Trạng thái:** Hiển thị thời gian ước tính, trạng thái tải từng phần (cho HLS và ZIP) cùng tỷ lệ thành công/lỗi.

### Sửa lỗi (Fixed)
- Hỗ trợ tốt hơn kiến trúc SPA (Single Page Application) của Twitter, đảm bảo tool tự làm mới trạng thái khi người dùng điều hướng qua lại giữa các profile.

---

## [1.0.0] - (Phase 1)
### Thêm mới (Added)
- **GraphQL Interceptor:** Nhúng đoạn mã bắt luồng API của X.com (`UserMedia`, `TweetDetail`, `UserTweets`) để trích xuất nguyên bản (raw url) các ảnh lớn và video băng thông cao.
- **Kiến trúc MV3:** Cài đặt bộ core Manifest V3 (Service Worker, Content Script, Popup).
- **Auto-scroll:** Cho phép tiện ích tự động cuộn trang liên tục để nạp thêm các tweet cũ.
- **Lưu trữ Blob:** Lưu trữ các URL tìm được trong bộ nhớ, tính toán dữ liệu và nén thành 1 file ZIP đơn giản tải xuống.
