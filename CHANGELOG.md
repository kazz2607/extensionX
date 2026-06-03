# Changelog

Tất cả các thay đổi đáng chú ý của dự án **X Media Downloader** sẽ được ghi chép tại file này.

## [3.9.0] - 2026-06-03
### Thêm mới (Added)
- **[FAB Draggable] Kéo thả FAB lên/xuống trên cạnh phải màn hình:** Thêm drag handle (3 vạch ngang) phía trên main button. User có thể kéo FAB đến vị trí thoải mái, tránh che các nút của X.com.
  - **Mouse & Touch**: Hỗ trợ cả chuột (mousedown/mousemove/mouseup) và cảm ứng (touchstart/touchmove/touchend) — hoạt động trên tablet.
  - **Chỉ kéo theo trục Y**: FAB giữ cố định `right: 20px`, chỉ di chuyển lên/xuống — phù hợp layout panel mở về bên trái.
  - **Viewport clamp**: FAB không bao giờ vượt ra ngoài viewport (giữ cách mép 8px trên/dưới), tự điều chỉnh khi resize window.
  - **Lưu vị trí**: Vị trí được lưu vào `localStorage` (key `__xmd_fab_top_pct__`) và khôi phục mỗi khi load trang — FAB luôn xuất hiện đúng chỗ user muốn.
  - **Drag vs Click**: Ngưỡng 5px — di chuyển < 5px được coi là click (không kích hoạt drag), đảm bảo click thường không bị nhầm thành kéo.
  - **Panel tự đóng khi kéo**: Panel info đóng lại ngay khi bắt đầu kéo — tránh panel nhảy lung tung.

---

## [3.8.0] - 2026-06-03
### Thêm mới (Added)
- **[Smart Filters] Lọc ảnh rác tự động khi thu thập:** Extension tự động loại bỏ ảnh không phải nội dung tweet trước khi lưu vào danh sách media. Không cần cấu hình — bật mặc định, hoạt động realtime khi scroll.
  - **Lọc avatar & banner**: Bỏ qua URL `/profile_images/` và `/profile_banners/` — những ảnh đại diện xuất hiện trong GraphQL response nhưng không phải media tweet.
  - **Lọc card preview**: Bỏ qua URL `/card_img/` — thumbnail nhỏ gắn kèm tweet có chứa link bài viết ngoài.
  - **Lọc theo kích thước**: Bỏ ảnh có `width` hoặc `height` nhỏ hơn ngưỡng tối thiểu (mặc định 150×150 px). Chỉ áp dụng khi GraphQL trả về metadata `original_info` — không lọc nhầm ảnh khi thiếu metadata.
  - **Cài đặt trong Options → 🔍 Smart Filters**: 2 toggle (avatar/card) + 2 number input (min W × H). Có thể tắt từng filter độc lập.
- **[Refactor] Metadata ảnh phong phú hơn từ page-interceptor.js:** Bổ sung `width`, `height`, `ext` (jpg/png/webp), `mediaKey` vào mỗi image item từ GraphQL — cơ sở cho Smart Filters và các feature tương lai. Filter URL rác (avatar/banner/card) cũng được áp dụng sớm ngay tại interceptor để tránh dispatch event không cần thiết.

---

## [3.7.0] - 2026-06-03

### Thêm mới (Added)
- **[Session Restore] Khôi phục phiên thu thập sau khi tắt browser:** Extension tự động lưu tiến trình thu thập vào `chrome.storage.local` sau mỗi 2 giây (debounce) và mỗi 5 lần scroll. Khi mở popup lại sau khi browser tắt/crash, một **banner thông báo** xuất hiện cho phép người dùng:
  - **"Tiếp tục"**: Nạp lại toàn bộ media đã thu thập vào bộ nhớ, sẵn sàng download ngay hoặc tiếp tục scroll thu thập thêm.
  - **"×"**: Hủy phiên cũ và xóa dữ liệu đã lưu.
  - Banner hiển thị: username, số lượng media, số lần scroll, và thời gian kể từ lần lưu cuối.
  - Dữ liệu được lưu dưới key `session_<username>` trong `chrome.storage.local` (10MB limit — đủ cho hàng nghìn items).
  - Debounce 2 giây để tránh ghi storage quá nhiều khi media flood.
  - Tự xóa session sau khi restore thành công hoặc bị hủy thủ công.
- **[Refactor] `persistSession()` / `clearSession()` module-level trong service-worker.js:** Quản lý vòng đời session rõ ràng, được gọi tại `addMediaItems()`, `stopCollecting()`, `scrollLoop()` (mỗi 5 scroll), và `CLEAR_MEDIA`.

---

## [3.6.0] - 2026-06-03
### Thêm mới (Added)
- **[Download Mini Button] Nút tải nhỏ trực tiếp trên từng tweet:** Tự động chèn icon ↓ vào thanh action bar (cạnh các nút Reply/Retweet/Like/Share) của mỗi tweet có ảnh hoặc video. Click → tải ngay media của tweet đó mà không cần mở popup hay FAB.
  - Phát hiện media thông minh: ảnh `pbs.twimg.com` (loại trừ avatar/banner), `<video>` element, và video thumbnail (chưa phát).
  - Luồng download: ưu tiên cache trong `mediaStore` → fallback gọi API (`fetchVideoForTweet`) → nếu tweet là video chưa xem, API sẽ lấy URL thực.
  - Trạng thái nút: idle (icon ↓) → loading (spinner) → done (✓ xanh lá, reset 3s) / error (✗ đỏ, reset 3s).
  - Hỗ trợ gallery tweet (nhiều ảnh): download tất cả media cùng lúc.
  - Tự cập nhật khi scroll và điều hướng SPA (không cần reload trang).
  - Theo dõi đúng username từ URL để lưu file vào đúng thư mục.
- **[Refactor] `downloadSingleItem()` module-level:** Tách hàm download một item ra scope module trong `service-worker.js` — tái dụng cho cả `startDownload()` (batch) lẫn `DOWNLOAD_TWEET` (single), tránh duplicate code.

---

## [3.5.5] - 2026-06-02
### Sửa lỗi (Fixed)
- **[FAB] Bấm nút `__xmd_main_btn__` không trigger download:** Logic cũ check `!downloadBtn.disabled` để quyết định có download hay không — nhưng `downloadBtn` bị disable ngay sau lần download đầu tiên và không bao giờ được enable lại (vì FAB không nhận được tín hiệu download xong). Sửa bằng cách thêm flag `isDownloading` riêng biệt trong `fab.js`, độc lập với trạng thái `disabled` của button. Main btn giờ check `isDownloading` thay vì `downloadBtn.disabled`.
- **[FAB] `isDownloading` không reset sau khi download xong:** Service Worker chỉ broadcast `DOWNLOAD_DONE` lên popup qua `broadcastToPopup()`, không gửi tín hiệu gì về tab chứa FAB. FAB không biết download đã xong → `isDownloading = true` mãi mãi → bấm lần 2, 3... không có tác dụng. Sửa bằng cách thêm `FAB_UPDATE { state: 'DOWNLOAD_DONE' }` gửi về tab qua `chrome.tabs.sendMessage()` trong `finally` block của `startDownload()`.

---

## [3.5.4] - 2026-06-02
### Sửa lỗi (Fixed)
- **[Spam lỗi trên trang chrome://extensions] "Extension context invalidated — content script disconnected" xuất hiện hàng loạt:** Mỗi lần `X_MEDIA_FOUND` fire (rất thường xuyên khi scroll) hoặc `MutationObserver` detect DOM thay đổi sau khi SW reload, `handleContextInvalidated()` bị gọi lặp đi lặp lại — mỗi lần gọi đều `console.warn()` và Chrome log toàn bộ vào trang errors tạo ra hàng trăm dòng lỗi. Sửa bằng hai cách: (1) Thêm flag `_contextDead` đảm bảo hàm cleanup chỉ chạy **đúng 1 lần duy nhất** — tất cả các lần gọi tiếp theo đều early-return ngay lập tức. (2) Đổi `console.warn` → `console.debug` — Chrome chỉ đẩy `warn`/`error` vào trang extensions errors, `debug` chỉ hiện trong DevTools console.

---

## [3.5.3] - 2026-06-02
### Sửa lỗi (Fixed)
- **[Xung đột IDM] File download không vào đúng thư mục username khi bật IDM Integration Module:** IDM Integration Module (của Internet Download Manager) hook vào Chrome Downloads API và cancel download của Chrome ngay lập tức (~100–500ms), rồi tự tải file theo cách riêng — bỏ qua hoàn toàn tham số `filename` mà extension truyền vào qua `chrome.downloads.download()`. Hậu quả: file không được lưu vào `{saveFolder}/{username}/images|videos|gifs/`, progress counter báo "X failed" dù IDM đã tải thành công. Sửa bằng cách thêm hàm `isIdmHijack()` phát hiện IDM qua dấu hiệu đặc trưng (download bị interrupted trong vòng 2 giây + error là `USER_CANCELED` hoặc rỗng), sau đó coi đó là thành công thay vì lỗi — tránh counter sai và popup báo lỗi. Extension cũng broadcast `IDM_DETECTED` để popup hiển thị cảnh báo màu cam, nhắc người dùng tắt IDM Integration Module nếu muốn file vào đúng thư mục.

---

## [3.5.2] - 2026-05-29
### Sửa lỗi (Fixed)
- **[Concurrency bị bỏ qua] Tải tất cả file cùng lúc, không giới hạn theo setting:** Code cũ dùng `items.map()` gọi `chrome.downloads.download()` cho **toàn bộ** item ngay lập tức trước khi vòng lặp concurrency kịp chạy — cài đặt "Số file tải đồng thời" trong Options hoàn toàn bị bỏ qua. Sửa bằng **worker pool lazy**: đúng CONCURRENCY worker chạy cùng lúc, mỗi worker tự lấy item tiếp theo từ queue khi rảnh — đảm bảo đúng số download thực sự song song.

---

## [3.5.1] - 2026-05-29
### Sửa lỗi nghiêm trọng (Critical Fixes)
- **[Download dừng giữa chừng] Service Worker bị Chrome terminate sau ~5 phút:** MV3 Service Worker có thể bị Chrome kill trong lúc tải file lớn, khiến toàn bộ hàng đợi download mất. Sửa bằng cách thêm `chrome.alarms` keep-alive (ping mỗi 24 giây) trong suốt quá trình tải — đảm bảo SW không bị terminate dù tải hàng trăm file.
- **[Download treo vô hạn] `downloadFile()` không có timeout:** Nếu Chrome không fire `onChanged` cho một file (network glitch, server timeout...), Promise treo mãi mãi, blocking toàn bộ batch. Sửa bằng cách thêm timeout 90 giây cho mỗi file — nếu quá thời gian, file tự động bị tính là `failed` và download tiếp tục bình thường.
- **[Batch bị block] `Promise.all()` không cô lập lỗi:** Một item treo trong batch sẽ kéo toàn bộ `Promise.all` treo theo. Sửa bằng cách wrap mỗi item với `Promise.race([downloadOne, batchTimeout])` riêng — 1 item fail không bao giờ block các item còn lại.
- **[Extension context invalidated] Content script không cleanup sau SW reload:** Sau khi SW bị reload/update, `chrome.runtime.sendMessage()` ném `Extension context invalidated`. `MutationObserver` (`navObserver`) vẫn chạy và tiếp tục throw lỗi mỗi khi DOM thay đổi. Sửa bằng cách thêm `isExtensionValid()` guard và `handleContextInvalidated()` tự động disconnect observer khi context chết.

### Sửa lỗi (Fixed)
- **[HLS crash] `extractBestStream()` trả `null` không có guard:** Nếu HLS master playlist không có stream hợp lệ, hàm trả `null` dẫn đến `fetchHLS(null)` crash. Thêm null check rõ ràng với error message mô tả.
- **[Offscreen race condition] `ensureOffscreen()` phụ thuộc biến global bị mất khi SW restart:** Sau khi SW restart, biến `globalCreatingOffscreen = null` nhưng offscreen document vẫn tồn tại. Lần gọi tiếp theo tạo lại offscreen → Chrome throw lỗi bị nuốt silently → HLS fail. Sửa bằng cách luôn check `chrome.runtime.getContexts()` trực tiếp, bỏ hoàn toàn biến global.
- **[Double-resolve] Race condition trong `downloadFile()` callback:** `chrome.downloads.search` và `onChanged` có thể cùng resolve một Promise. Thêm `settled` flag + `safeResolve/safeReject` để đảm bảo Promise chỉ settle đúng một lần.
- **[Popup mất trạng thái] Download state không được restore khi popup mở lại:** Khi popup bị đóng và mở lại giữa lúc đang tải, `isDownloading = false` và progress bar bị ẩn — người dùng có thể vô tình trigger download thêm lần nữa. Sửa bằng cách query `GET_DOWNLOAD_STATE` từ SW khi popup khởi động.

### Thêm mới (Added)
- **Permission `alarms`:** Thêm vào `manifest.json` để hỗ trợ `chrome.alarms` keep-alive.

---

## [3.5.0] - 2026-05-27
### Sửa lỗi nghiêm trọng (Critical Fixes)
- **[macOS] Không get được media/image:** Sửa lỗi `page-interceptor.js` không chạy được trong MAIN world trên một số môi trường macOS do `world: "MAIN"` không được áp dụng. Chuyển sang cơ chế inject script thủ công từ `content.js` — đảm bảo interceptor luôn chạy đúng context trên mọi hệ điều hành.
- **[macOS] Lỗi tải video — "Cannot read properties of undefined (reading 'download')":** `chrome.downloads` không có trong Offscreen Document. Sửa bằng cách chuyển toàn bộ `chrome.downloads.download()` về Service Worker; Offscreen Document chỉ trả dữ liệu dưới dạng base64 data URL.
- **Chỉ tải được 1–2 video đầu, phần còn lại fail — "The message port closed before a response was received":** Lỗi xảy ra do file MP4 lớn (50–200 MB) được encode sang base64 (+33%) trước khi gửi qua Chrome message API, vượt giới hạn 64 MB và gây timeout. Sửa bằng cách **bỏ Offscreen hoàn toàn cho video/GIF MP4** — tải thẳng qua `chrome.downloads.download(url)` từ Service Worker. Offscreen chỉ giữ lại cho HLS (ghép TS segments).
- **Bỏ sót media trên profile nhiều video:** Tăng giới hạn độ sâu đệ quy JSON từ 15 → 35 để parse video từ Retweet/quoted tweet (thường nằm rất sâu trong cấu trúc GraphQL). Bỏ điều kiện `video_info` trong hook `JSON.parse` để bắt cả ảnh-only tweet.
- **Bỏ sót media đợt tải đầu tiên:** Bỏ cờ `isCollecting` gate trong content.js — extension giờ lắng nghe media passively ngay khi vào trang, không cần bấm "Bắt đầu" trước. Đợt tải ban đầu ~20 tweet không còn bị bỏ qua.
- **`addMediaItems()` không trả về giá trị:** Hàm thiếu `return newCount` khiến `updateFAB()` không bao giờ được gọi sau khi thêm media mới.
- **Progress bar MP4 không cập nhật:** `popup.js` đọc sai field `payload.loaded` thay vì `payload.bytesReceived` từ `MP4_FETCH_PROGRESS`.

### Tối ưu hóa (Improvements)
- **Inject `page-interceptor.js` sớm hơn:** Inject ngay lập tức ở `document_start` (không qua `DOMContentLoaded`) để bắt được `JSON.parse` và `fetch` từ milisecond đầu tiên trang tải.
- **Xóa khai báo trùng lặp `page-interceptor.js`:** Bỏ entry trong `manifest.json` content_scripts, để `content.js` quản lý toàn bộ — tránh chạy script 2 lần.
- **Timeout 5 phút cho HLS:** Thêm `Promise.race` với timeout 5 phút cho quá trình tải HLS qua Offscreen — tránh treo vô hạn cho video dài.
- **Xóa script tag thừa trong `offscreen.html`:** `hls-fetcher.js` đã được `offscreen.js` import trực tiếp, không cần load thêm qua `<script>` tag.
- **Sync trạng thái collecting sau reload trang:** Service worker gửi lại `COLLECT_STARTED_LOCAL` cho content.js khi `PAGE_LOADED` nếu đang trong phiên thu thập — tránh mất media khi F5.

---

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
