# Audit bảo mật và quyền extension

> Rà soát cho **7.2.0** | Cập nhật: 2026-10-02

## Quyền Manifest

| Quyền | Chức năng | Quyết định |
| --- | --- | --- |
| `downloads` | Lưu ảnh/video/GIF và theo dõi kết quả tải | Giữ, chức năng cốt lõi |
| `storage` | Options, Queue, phiên, lịch sử và media theo profile | Giữ; dữ liệu chỉ lưu cục bộ |
| `tabs` | Gắn profile với tab X/Twitter và gửi trạng thái về đúng tab | Giữ; `activeTab` đã loại vì trùng phạm vi |
| `scripting` | Khởi tạo bridge trong MAIN world khi cần | Giữ |
| `offscreen` | Ghép HLS và tạo ZIP theo chunk ngoài service worker | Giữ |
| `alarms` | Keep-alive có giới hạn và lịch Saved Job do người dùng bật | Giữ |
| `notifications` | Báo hoàn tất/lỗi và Notification Center | Giữ |
| `declarativeNetRequest` | Điều chỉnh CORS cho endpoint Syndication xác định | Giữ; rule chỉ áp dụng `cdn.syndication.twimg.com` |

Host permissions chỉ bao phủ X/Twitter, các CDN media X cần tải và Telegram Web A/K. Không có host wildcard toàn Internet. `web_accessible_resources` tiếp tục giới hạn theo resource và origin trong manifest.

Download Center và P2 không thêm permission hoặc host. Saved Jobs chạy trực tiếp hoặc theo lịch mà người dùng chủ động bật; lịch tối thiểu 60 phút, bỏ qua khi coordinator bận và không polling nền. ZIP chỉ fetch host media X đã allowlist, giới hạn 200 file/operation và 500 MiB/chunk. Dữ liệu cấu hình/lịch/thông báo nằm trong `chrome.storage.local`; không cloud sync token, URL media hoặc lịch sử.

Đánh giá optional permission cho P1 đã hoàn tất: Telegram host và `notifications` tiếp tục là quyền bắt buộc trong nhánh 7.0.x vì content script Telegram được khai báo tĩnh và thông báo hoàn tất có thể xảy ra sau khi popup đóng; chuyển sang optional ngay sẽ tạo prompt giữa workflow và làm mất hành vi hiện có. Không mở rộng thêm host/quyền cho Following Scanner: scan dùng trang X đang đăng nhập, unfollow chỉ chạy sau preview/xác nhận và token phiên chỉ nằm trong RAM.

## Biên tin nhắn runtime

- Chỉ nhận message type nằm trong allowlist.
- Mỗi type có allowlist field payload; field dư, envelope lạ, payload không phải object hoặc message thường trên 256 KB bị từ chối.
- Background chỉ chấp nhận sender nội bộ extension; lệnh gắn username từ content script phải khớp tab X/Twitter tương ứng.
- `HLS_DONE` có envelope riêng gồm `requestId`, `dataUrl` hoặc `error`; không chấp nhận field khác. Data URL từ offscreen nội bộ được miễn giới hạn 256 KB vì là nội dung video, nhưng vẫn yêu cầu sender cùng extension và request ID hợp lệ.
- URL media, Telegram sender, Queue import và options vẫn qua validator theo domain trước khi thực thi.
- Các lệnh Download Center/Saved Jobs có allowlist field; job được validate lại tại background trước khi lưu hoặc chạy.
- `FOLLOWING_SCAN_PAGE` chỉ nhận từ tab X/Twitter, giới hạn 500 candidate mỗi page và 10.000 candidate mỗi operation; `START_UNFOLLOW` giới hạn 100 ID và yêu cầu `confirmed: true`.
- Message P2 dùng field allowlist, Gallery tối đa 100 mục/page, schedule được validate 60–43.200 phút và error report không chứa username/URL/raw exception.

## Bề mặt cần theo dõi

- MAIN-world bridge trên X chỉ chuyển dữ liệu cần thiết, không log bearer/cookie/query URL nhạy cảm.
- Telegram private stream dùng URL ngắn hạn; không persist URL token vào diagnostic.
- Offscreen HLS phải gắn request ID và bỏ qua callback của operation cũ.
- ZIP offscreen phải giữ cap file/byte, chỉ tải HTTPS từ CDN X allowlist, dùng SHA-256 trong operation và revoke Blob URL sau khi hoàn tất.
- Queue import có giới hạn byte/record và parse nguyên tử; tên file/thư mục được sanitize chống traversal.
- Rule DNR phải được review lại nếu thay đổi host hoặc header.

## Regression bắt buộc

`test/validation.test.ts` kiểm tra type lạ, field payload/envelope dư, message quá lớn, host media sai, sender Telegram sai và Queue import không hợp lệ. Mọi thay đổi permission hoặc message schema phải cập nhật bảng này và chạy `npm run check`.
