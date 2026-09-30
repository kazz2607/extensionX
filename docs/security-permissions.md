# Audit bảo mật và quyền extension

> Rà soát cho **7.0.0** | Cập nhật: 2026-09-30

## Quyền Manifest

| Quyền | Chức năng | Quyết định |
| --- | --- | --- |
| `downloads` | Lưu ảnh/video/GIF và theo dõi kết quả tải | Giữ, chức năng cốt lõi |
| `storage` | Options, Queue, phiên, lịch sử và media theo profile | Giữ; dữ liệu chỉ lưu cục bộ |
| `tabs` | Gắn profile với tab X/Twitter và gửi trạng thái về đúng tab | Giữ; `activeTab` đã loại vì trùng phạm vi |
| `scripting` | Khởi tạo bridge trong MAIN world khi cần | Giữ |
| `offscreen` | Ghép HLS ngoài service worker | Giữ |
| `alarms` | Keep-alive có giới hạn trong lúc download dài | Giữ |
| `notifications` | Báo hoàn tất/lỗi khi người dùng bật | Giữ |
| `declarativeNetRequest` | Điều chỉnh CORS cho endpoint Syndication xác định | Giữ; rule chỉ áp dụng `cdn.syndication.twimg.com` |

Host permissions chỉ bao phủ X/Twitter, các CDN media X cần tải và Telegram Web A/K. Không có host wildcard toàn Internet. `web_accessible_resources` tiếp tục giới hạn theo resource và origin trong manifest.

Download Center và Saved Jobs không thêm permission hoặc host. Saved Jobs chỉ chạy sau thao tác rõ ràng của người dùng; không có alarm/polling mới. Dữ liệu cấu hình nằm trong `chrome.storage.local` tại `saved_jobs_v1`; lịch sử versioned nằm tại `download_history_v2` và mirror rollback giới hạn 20 mục tại `download_history`.

## Biên tin nhắn runtime

- Chỉ nhận message type nằm trong allowlist.
- Mỗi type có allowlist field payload; field dư, envelope lạ, payload không phải object hoặc message thường trên 256 KB bị từ chối.
- Background chỉ chấp nhận sender nội bộ extension; lệnh gắn username từ content script phải khớp tab X/Twitter tương ứng.
- `HLS_DONE` có envelope riêng gồm `requestId`, `dataUrl` hoặc `error`; không chấp nhận field khác. Data URL từ offscreen nội bộ được miễn giới hạn 256 KB vì là nội dung video, nhưng vẫn yêu cầu sender cùng extension và request ID hợp lệ.
- URL media, Telegram sender, Queue import và options vẫn qua validator theo domain trước khi thực thi.
- Các lệnh Download Center/Saved Jobs có allowlist field; job được validate lại tại background trước khi lưu hoặc chạy.

## Bề mặt cần theo dõi

- MAIN-world bridge trên X chỉ chuyển dữ liệu cần thiết, không log bearer/cookie/query URL nhạy cảm.
- Telegram private stream dùng URL ngắn hạn; không persist URL token vào diagnostic.
- Offscreen HLS phải gắn request ID và bỏ qua callback của operation cũ.
- Queue import có giới hạn byte/record và parse nguyên tử; tên file/thư mục được sanitize chống traversal.
- Rule DNR phải được review lại nếu thay đổi host hoặc header.

## Regression bắt buộc

`test/validation.test.ts` kiểm tra type lạ, field payload/envelope dư, message quá lớn, host media sai, sender Telegram sai và Queue import không hợp lệ. Mọi thay đổi permission hoặc message schema phải cập nhật bảng này và chạy `npm run check`.
