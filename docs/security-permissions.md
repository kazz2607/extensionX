# Audit bảo mật và quyền extension

> Rà soát cho **8.2.1** | Cập nhật: 2026-10-14

## Quyền Manifest

| Quyền | Chức năng | Quyết định |
| --- | --- | --- |
| `downloads` | Lưu ảnh/video/GIF và theo dõi kết quả tải | Giữ, chức năng cốt lõi |
| `storage` | Options, Queue, phiên, lịch sử và media theo profile | Giữ; dữ liệu chỉ lưu cục bộ |
| `scripting` | Kích hoạt tải Blob/stream trong trang Telegram Web (`TG_DOWNLOAD_MEDIA`) | Giữ |
| `offscreen` | Ghép HLS và tạo ZIP theo chunk ngoài service worker | Giữ |
| `alarms` | Keep-alive có giới hạn và lịch Saved Job do người dùng bật | Giữ |
| `notifications` | Báo hoàn tất/lỗi và Notification Center | Giữ |

Host permissions chỉ bao phủ X/Twitter, các CDN media X cần tải và Telegram Web A/K. Không có host wildcard toàn Internet.

Đã loại bỏ trong 7.3.0:

- `tabs` — host permission đã cho đọc URL của tab X/Telegram; tab khác không cần. Bỏ quyền này cũng bỏ cảnh báo cài đặt "đọc lịch sử duyệt web".
- `declarativeNetRequest` và rule CORS `Access-Control-Allow-Origin: *` cho `cdn.syndication.twimg.com` — rule mở API này cho mọi website, trong khi service worker/offscreen đã vượt CORS nhờ host permission.
- `web_accessible_resources` — script MAIN world chỉ còn được manifest nạp một lần (bundle `content/main-world.js`), không còn chèn `<script src=chrome-extension://…>`, nên trang không thể dò extension qua resource công khai.

Download Center và P2 không thêm permission hoặc host. Saved Jobs chạy trực tiếp hoặc theo lịch mà người dùng chủ động bật; lịch tối thiểu 60 phút, bỏ qua khi coordinator bận và không polling nền. ZIP chỉ fetch host media X đã allowlist, giới hạn 200 file/operation và 500 MiB/chunk. Dữ liệu cấu hình/lịch/thông báo nằm trong `chrome.storage.local`; không cloud sync token, URL media hoặc lịch sử.

Đánh giá optional permission cho P1 đã hoàn tất: Telegram host và `notifications` tiếp tục là quyền bắt buộc trong nhánh 7.0.x vì content script Telegram được khai báo tĩnh và thông báo hoàn tất có thể xảy ra sau khi popup đóng; chuyển sang optional ngay sẽ tạo prompt giữa workflow và làm mất hành vi hiện có. Không mở rộng thêm host/quyền cho Following Scanner: scan dùng trang X đang đăng nhập, unfollow chỉ chạy sau preview/xác nhận và token phiên chỉ nằm trong RAM.

Từ 7.4.0 popup và Options không còn tải font từ Google Fonts: các trang extension không gửi request mạng nào khi mở, khớp với cam kết chỉ xử lý cục bộ.

## Bridge trang X ↔ content script

Từ 7.3.0, script MAIN world (interceptor, DOM scanner, FAB, nút tweet, snackbar) trao đổi với content script qua một `MessagePort` riêng thay cho `CustomEvent` trên `window`. Content script gửi port ngay tại `document_start`; listener MAIN world đăng ký ở capture phase trước mọi script của trang, nhận port đầu tiên và chặn lan truyền, đồng thời giữ sẵn các primitive (`postMessage`, `addEventListener`) trước khi trang có thể patch. Hệ quả: script của x.com (hoặc XSS trên x.com) không thể đọc dữ liệu bridge, không giả được lệnh tải/thu thập, bearer, query ID hay trang Following. Allowlist message theo chiều nằm ở `src/shared/page-bridge-protocol.ts`; Chromium acceptance kiểm tra trang không lấy được port và event giả không có tác dụng.

## Biên tin nhắn runtime

- Chỉ nhận message type nằm trong allowlist.
- Mỗi type có allowlist field payload; field dư, envelope lạ, payload không phải object hoặc message thường trên 256 KB bị từ chối.
- Background chỉ chấp nhận sender nội bộ extension, và mỗi loại lệnh gắn với ngữ cảnh gửi hợp lệ (`isAllowedSender`): content script chỉ gửi được 12 lệnh thu thập/tải; lệnh quản trị (unfollow, xóa dữ liệu, import Queue, lịch, Following scan…) chỉ từ trang extension; `HLS_DONE`/`OFFSCREEN_SAVE_BLOB` chỉ từ offscreen. Offscreen chỉ nhận lệnh từ service worker. Lệnh gắn username từ content script phải khớp tab X/Twitter tương ứng.
- `HLS_DONE` có envelope riêng gồm `requestId`, `dataUrl` hoặc `error`; không chấp nhận field khác. Data URL từ offscreen nội bộ được miễn giới hạn 256 KB vì là nội dung video, nhưng vẫn yêu cầu sender cùng extension và request ID hợp lệ.
- URL media, Telegram sender, Queue import và options vẫn qua validator theo domain trước khi thực thi. `START_DOWNLOAD` chỉ nhận field options trong allowlist (field nội bộ `_queueId`/`_operationId`/`_fromQueue` bị từ chối); import settings được lọc theo kiểu/ngưỡng của `DEFAULT_OPTIONS` (`src/shared/options-import.ts`).
- HLS chỉ fetch HTTPS từ CDN media X (kể cả URL trong playlist) với `credentials: 'omit'`; `TG_DOWNLOAD_MEDIA` chỉ nhận `blob:`/stream cùng origin Telegram hoặc `data:` ảnh/video.
- Following Scanner giữ nguyên handle đầu tiên của mỗi account ID, nên một trang sau không thể gắn nhãn lại ID mà người dùng sắp chọn unfollow; danh sách và hộp xác nhận unfollow hiển thị account ID cạnh handle (7.3.1).
- `OFFSCREEN_SAVE_BLOB` (từ 7.2.3) chỉ nhận từ chính offscreen document (`sender.url` là `offscreen/offscreen.html`, không có `sender.tab`), chỉ nhận `blob:` URL do extension tạo và đường dẫn tương đối không có `..`, `\` hoặc `:`. Offscreen không có `chrome.downloads`; mọi file HLS/ZIP đều được service worker lưu qua cùng registry `activeDownloads`, nên Stop hủy được.
- `SHORTCUT_DOWNLOAD` (từ 7.2.3) chỉ nhận từ tab X/Twitter và chỉ tải HTTPS từ CDN media X allowlist; không còn chấp nhận `http:`, `data:` hay `blob:` lấy từ thuộc tính `<img>` của trang.
- `DOWNLOAD_TWEET` nhận từ mọi tab X/Twitter (kể cả Home/Search); username chỉ được dùng khi khớp profile của tab, ngược lại bị bỏ qua.
- Các lệnh Download Center/Saved Jobs có allowlist field; job được validate lại tại background trước khi lưu hoặc chạy.
- `FOLLOWING_SCAN_PAGE` chỉ nhận từ tab X/Twitter, giới hạn 500 candidate mỗi page và 10.000 candidate mỗi operation; `START_UNFOLLOW` giới hạn 100 ID và yêu cầu `confirmed: true`.
- Message P2 dùng field allowlist, Gallery tối đa 100 mục/page, schedule được validate 60–43.200 phút và error report không chứa username/URL/raw exception.

Từ 8.0.0 (F1–F3), không thêm quyền hay host permission:
- `GET_FAILED_ITEMS`, `RETRY_FAILED_ITEMS`, `CLEAR_FAILED_ITEMS` chỉ nhận từ trang extension (không có trong danh sách lệnh content script được phép). `ids` phải là mảng chuỗi, tối đa 500 phần tử; retry chỉ tải lại URL đã nằm trong danh sách lỗi và vẫn qua `startDownload` (allowlist CDN X, sanitize đường dẫn) như mọi lượt tải.
- Mục lỗi lưu ở `chrome.storage.local` chỉ gồm profile, URL media CDN X đã kiểm tra, tweetId, mã nguyên nhân và câu lỗi đã rút gọn (`formatDownloadError`, không chứa URL/token/raw exception); dòng sai định dạng bị loại khi đọc.
- Khoá Search/Hashtag chỉ gồm `[a-z0-9_]`, suy ra từ URL `x.com`/`twitter.com` HTTPS; trang khác domain không được nhận diện. Script trang và service worker dùng chung một parser nên tab/sender vẫn được so khớp đúng khoá như profile.
- Caption tweet trong CSV được đặt trong ô có trích dẫn và thêm `'` trước ký tự `= + - @` để không thành công thức khi mở bằng bảng tính.

Từ 8.2.0 (F5 sao lưu/khôi phục), không thêm quyền:
- `EXPORT_BACKUP` và `RESTORE_BACKUP_SECTION` chỉ nhận từ trang extension. Khôi phục đi theo từng khối dưới giới hạn 256 KB/message có sẵn; mỗi khối được service worker kiểm tra lại bằng parser của đúng loại dữ liệu (Saved Jobs, lịch, Queue, lịch sử, URL CDN X tin cậy theo username hợp lệ) trước khi ghi — trang gửi gì cũng không ghi được dữ liệu sai dạng.
- Cấu hình trong file đi qua `sanitizeImportedOptions` như Import Settings. File sao lưu chứa username profile và URL media đã tải (không có cookie, token hay bearer); người dùng cần giữ file này riêng tư.

Từ 8.2.1, không thêm quyền:
- Khi `chrome.downloads` báo `SERVER_FAILED`, service worker gửi một `HEAD` tới đúng URL media đó để đọc mã HTTP (429 hay 5xx): chỉ với URL qua `isTrustedMediaUrl` (CDN X đã có trong host permission), `credentials: 'omit'`, không cache, hủy sau 5 giây; chỉ mã trạng thái được dùng, không đọc nội dung.
- Script trang (MAIN world) không còn gắn URL request lên object XHR (`_interceptUrl`) — trang không đọc hay sửa được giá trị extension dùng để lọc GraphQL.

## Bề mặt cần theo dõi

- MAIN-world bridge trên X chỉ chuyển dữ liệu cần thiết qua port riêng, không log bearer/cookie/query URL nhạy cảm. Từ 7.3.1 FAB và snackbar chạy trong content script (isolated world) và nằm trong closed shadow root: script của trang không đọc được username, tên file hay tiến độ hiển thị — kể cả khi hook prototype DOM, vì isolated world có prototype riêng — và CSS của X không tác động được. Bridge với trang chỉ còn mang dữ liệu thu thập, nút tweet và lệnh quét DOM.
- Telegram private stream dùng URL ngắn hạn; không persist URL token vào diagnostic.
- Offscreen HLS phải gắn request ID và bỏ qua callback của operation cũ.
- ZIP offscreen phải giữ cap file/byte, chỉ tải HTTPS từ CDN X allowlist, dùng SHA-256 trong operation và revoke Blob URL sau khi hoàn tất.
- Queue import có giới hạn byte/record và parse nguyên tử; tên file/thư mục được sanitize chống traversal.

## Regression bắt buộc

`test/validation.test.ts` kiểm tra type lạ, field payload/envelope dư, message quá lớn, host media sai, sender Telegram sai và Queue import không hợp lệ. Mọi thay đổi permission hoặc message schema phải cập nhật bảng này và chạy `npm run check`.
