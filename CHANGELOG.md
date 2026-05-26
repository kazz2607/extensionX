# Changelog

Tất cả các thay đổi đáng chú ý của dự án **X Media Downloader** sẽ được ghi chép tại file này.

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
