# Kế hoạch nâng cấp v7.3 → v8.0

> Lập ngày: 2026-10-14 | Baseline: **v7.2.2** (`npm run check` xanh: 42 unit, 2 e2e, build, budget)
> Trạng thái: **Đang thực hiện** — v7.2.3 → v7.4.2, **v8.0.0 (F1–F3)** và **v8.1.0 (F4)** đã hoàn thành ngày 2026-10-14; F5 chờ chốt phạm vi.

Kế hoạch này dựa trên audit đọc mã nguồn ngày 2026-10-14, chia 4 nhóm: **logic**, **bảo mật**, **hiệu năng**, **UI/UX**, kèm phần tư vấn tính năng mới. Mỗi hạng mục có mã ID, vị trí mã, cách sửa và tiêu chí nghiệm thu. Vị trí dòng (`file:line`) tính theo v7.2.2 và có thể lệch nhẹ khi sửa.

## Tổng quan ưu tiên

| Mốc | Phạm vi | Mục tiêu |
| --- | --- | --- |
| **v7.2.3 — Hotfix** ✅ | L1–L5 (+ S4 cho phím tắt) | Sửa lỗi làm hỏng chức năng hoặc mất dữ liệu — **đã phát hành** |
| **v7.3.0 — Hardening** ✅ | L6–L15, S1–S11, P1–P3 (+ P9, P11) | Bảo mật bridge, ổn định Queue/Saved Job, giảm tải trên X/Telegram |
| **v7.4.0 — Performance & UI** ✅ | P4–P15, U1–U15 | i18n đầy đủ, theme/token thống nhất, accessibility, tối ưu batch/IndexedDB |
| **v8.0.0 — Tính năng mới** ✅ (F1–F3) | F1–F3 (F4–F8 chưa làm) | Mở rộng nguồn tải và quản lý thư viện |

Mức độ: **P0** = hỏng chức năng/mất dữ liệu/rủi ro tài khoản · **P1** = ảnh hưởng rõ tới người dùng · **P2** = cải thiện.

---

## 1. Sửa lỗi logic

### P0 — v7.2.3 ✅ hoàn thành

> Kết quả: L1 xác nhận bằng Chromium (offscreen có `chrome.downloads === undefined`); sửa bằng kênh `OFFSCREEN_SAVE_BLOB` để SW lưu Blob. L2–L4 tách logic sang `shared/collect-state.ts` và `shared/dirty-batch.ts` có regression. L5 sửa sender, nút tweet chạy trên Home/Search, `SHORTCUT_DOWNLOAD` đã được siết theo S4. Gate: 48 unit, 2 e2e, 5 Chromium acceptance.

| ID | Vấn đề | Vị trí | Cách sửa | Nghiệm thu |
| --- | --- | --- | --- | --- |
| **L1** ✅ | Offscreen gọi `chrome.downloads` (offscreen document chỉ có `chrome.runtime`) → HLS, ZIP, `DOWNLOAD_MP4` có thể lỗi toàn bộ. File có `@ts-nocheck` nên typecheck không phát hiện. **Cần xác nhận runtime trước.** | `src/offscreen/offscreen.ts:1-27`, `:148`, `:197` | Offscreen trả blob/object URL (hoặc chunk) về service worker; SW gọi `chrome.downloads.download` và revoke. Bỏ `@ts-nocheck`, thêm kiểu message. | Chromium acceptance tải 1 HLS + 1 ZIP chunk thành công; `tsc` phủ offscreen. |
| **L2** ✅ | `PAGE_LOADED` ghi đè `tabState` mà không giữ `operationId` → Start từ trang không phải `/media` bị treo ở "đang thu thập", Start lần sau không làm gì đến khi bấm Stop. | `src/background/media-messages.ts:151-160`, `scraper.ts:228`, `:261` | Giữ `operationId`/`phase` từ `existingState` khi cùng username; khác username thì gọi `finishCollecting`. | Regression: Start tại `x.com/foo` → reload `/media` → `scrollLoop` chạy. |
| **L3** ✅ | Race mất media: chụp `dirtyItems`, `await` save/prune, rồi `dirtyStore.clear()` → item đến trong lúc `await` bị xóa mà chưa ghi. | `src/background/scraper.ts:454-464` | Chỉ xóa đúng key đã lưu, hoặc đổi Map mới trước khi `await`. | Unit test: thêm item giữa lúc save đang chờ → item vẫn được persist. |
| **L4** ✅ | Race tương tự cho URL đã tải (chống trùng) → sau khi SW restart, file bị tải lại thành bản "(1)". | `src/background/scraper.ts:579-584`, `indexeddb.ts:241` | Tách set ra khỏi map trước khi `await`; lỗi thì merge lại. | Unit test cho `markDownloaded` chạy đồng thời với save. |
| **L5** ✅ | Nút tải trên tweet và phím tắt hover không hoạt động: sender gửi `sourceUrl`/`pageUrl` nhưng allowlist payload chỉ có `tweetId,username` / `url` → message bị loại. Nút còn quay `loading` mãi vì response lỗi bị bỏ qua. | `src/content/content.ts:290-299`, `shortcuts.ts:267`, `src/shared/messages.ts:177-179`, `tweet-btn.ts:213` | Bỏ trường thừa ở sender; xử lý `res.error` → trạng thái `error`; timeout 30 s cho `loading`. **Làm S4 trước khi bật lại `SHORTCUT_DOWNLOAD`.** | Regression: nút tweet trên `/home` và profile cho kết quả done/error trong ≤ 30 s. |

### P1 — v7.3.0 ✅ hoàn thành

> Kết quả: L6 nhờ navigation phát hiện trong MAIN world qua bridge; L7/L11 bằng `shared/download-options.ts`; L8 bỏ batch race (mỗi item tự có timeout); L9 timeout theo tiến độ và hủy download treo; L10 router chờ Queue hydrate; L12 matcher chung theo ngày địa phương; L13 controller riêng mỗi lần chạy; L14 tuần tự hóa ghi lịch, dọn alarm khi xóa job; L15 hủy persist khi xóa, `initDB` không cache lỗi. Lỗi nhỏ ở `following-scroll.ts` (đúng trang /following, đóng đúng tab tự tạo) và debounce 500 ms của Queue đã sửa trong 7.3.1.

| ID | Vấn đề | Vị trí | Cách sửa |
| --- | --- | --- | --- |
| **L6** ✅ | `content.ts` chạy ở isolated world nhưng patch `history.pushState` và gọi `window.__scanDOM__` / `__disconnectDOMScanner__` của MAIN world → không bắt được SPA navigation, `scrollLoop` của @a vẫn chạy khi người dùng sang @b. | `src/content/content.ts:359`, `:505-537` | Phát hiện navigation trong script MAIN world rồi chuyển sang isolated bằng `CustomEvent`; gọi scanner qua event. Bỏ khoảng 20 `@ts-ignore`. |
| **L7** ✅ | `RETRY_FAILED` không làm gì sau khi tải từ Queue vì options cũ còn `_operationId`/`_fromQueue`/`_queueId`, trong khi hàm vẫn báo thành công. | `src/background/downloader.ts:332`, `:839-842` | Loại các trường `_` khi lưu options để retry. |
| **L8** ✅ | Batch timeout 105 s ngắn hơn HLS timeout 5 phút → HLS dài bị đếm lỗi trong khi vẫn đang tải; vượt giới hạn song song; `success + failed > total`. | `downloader.ts:185`, `:526-549` | Timeout theo loại media; mỗi item chỉ settle một lần; clear timer. |
| **L9** ✅ | `downloadFile` dùng timeout tuyệt đối 90 s → video lớn trên mạng chậm bị đánh lỗi, rò `activeDownloads`, tải lại thành bản trùng. | `downloader.ts:634-637` | Timeout theo khoảng không có tiến độ (`bytesReceived`); hết hạn thì cancel hoặc đánh dấu pending. |
| **L10** ✅ | Sửa Queue khi SW vừa thức dậy và Queue chưa hydrate: `ADD/REMOVE/CLEAR` bị ghi đè khi bản đã lưu được nạp xong. | `queue-messages.ts:293-368`, `queue.ts:36` | Mọi handler thay đổi Queue phải `await loadPersistedQueue()`. |
| **L11** ✅ | Saved Job ghi đè `saveFolder`/`filenameTemplate` toàn cục bằng chuỗi rỗng. | `download-center-messages.ts:225-233`, `p2-messages.ts:96`, `downloader.ts:341` | Chỉ merge các trường khác rỗng. |
| **L12** ✅ | Lọc ngày dùng UTC; Estimate/Gallery/ZIP/Download lọc khác nhau; `{date}` trong tên file là UTC nhưng folder rule dùng giờ địa phương. | `shared/media-query.ts:11-12`, `p2-messages.ts:33-35`, `p2-tools.ts:98`, `:115-119`, `downloader.ts:727` | Một matcher dùng chung theo ranh giới ngày địa phương; chuẩn hóa URL khi so trùng. |
| **L13** ✅ | Stop rồi bấm Run Unfollow nhanh → hai vòng unfollow chạy song song (gấp đôi tốc độ, **rủi ro tài khoản**). | `background/following-scanner.ts:84-107` | `AbortController` cục bộ cho mỗi lần chạy, cộng cờ/promise running. |
| **L14** ✅ | Lịch Saved Job: alarm handler ghi đè thay đổi xảy ra giữa chừng; xóa job không xóa alarm; `lastStatus='completed'` được gán trước khi tải. | `p2-messages.ts:55-99` | Đọc lại và merge trước khi ghi; dọn alarm khi xóa job; status lấy theo kết quả thật. |
| **L15** ✅ | `CLEAR_DOWNLOADED` không hủy timer persist → lịch sử vừa xóa bị ghi lại. `initDB` cache promise lỗi vĩnh viễn; `clearAllMediaItems` resolve theo `request.onsuccess` thay vì `tx.oncomplete`. | `media-messages.ts:301-334`, `indexeddb.ts:48-66`, `:176-186` | Export hàm cancel persist; reset `dbPromise` khi lỗi; xử lý `onblocked`/`onclose`; await thao tác xóa trước khi báo thành công. |

Lỗi nhỏ: `following-scroll.ts:80` chấp nhận bất kỳ URL `/following` nào (có thể quét following của người khác); `:189-192` đóng nhầm tab `/following` đầu tiên tìm thấy; Queue persist debounce 500 ms có thể mất thay đổi cuối nếu SW bị kill.

---

## 2. Bảo mật

> v7.3.0: S1, S3–S10 hoàn thành. v7.3.1: S2 (hiển thị account ID trong danh sách và hộp xác nhận unfollow) và S11 (FAB/snackbar chạy ở isolated world, trong closed shadow root) hoàn thành.

Đã kiểm tra và **không cần sửa**: XSS (mọi `innerHTML` là template tĩnh, dữ liệu động dùng `textContent`), path traversal trong tên file/thư mục, sender validation cho `MEDIA_FOUND`/`PAGE_LOADED`, token chỉ giữ trong RAM của SW, giới hạn của Following Scanner, ZIP allowlist với `credentials:'omit'`.

| ID | Mức | Vấn đề | Vị trí | Cách sửa |
| --- | --- | --- | --- | --- |
| **S1** ✅ | Med | Bridge MAIN → isolated dùng `CustomEvent` toàn cục, nên script bất kỳ trên x.com (hoặc một lỗ XSS) có thể giả `XMD_FAB_ACTION` (`START_DOWNLOAD` tự ghi file, bỏ qua prompt "automatic downloads"), giả bearer/queryId, giả trang following. | `src/content/content.ts:218-300` | Page chỉ được gửi tên action; isolated world tự dựng payload. Hành động tải/thu thập cần user gesture trong isolated world (FAB/nút tweet chuyển sang isolated hoặc closed shadow DOM), hoặc dùng `MessageChannel` với nonce mỗi lần load. |
| **S2** ✅ | Med | Following page giả có thể ghép `userId` nạn nhân với `username` khác → người dùng unfollow nhầm tài khoản. | `background/following-scanner.ts:99-124`, `tweet-api.ts:87-104` | Chỉ nhận candidate từ response do SW tự fetch, hoặc SW tự resolve `userId → screen_name`; hiển thị userId trong preview. |
| **S3** ✅ | Med | `isInternalSender` chỉ kiểm tra `sender.id`, mà content script cũng thỏa → lệnh chỉ dành cho popup (`START_UNFOLLOW`, `CLEAR_ALL_*`, `IMPORT_QUEUE`, `SET_JOB_SCHEDULE`…) có thể bị gọi từ content script. | `background/message-handler.ts:10-12`, `offscreen.ts:134` | Khai báo nguồn hợp lệ cho từng loại message: popup-only yêu cầu `!sender.tab` và `sender.url` thuộc extension; offscreen chỉ nhận từ SW. |
| **S4** ✅ | Med | `SHORTCUT_DOWNLOAD` tải URL bất kỳ (`http`, `data`, 50 MB, gửi kèm cookie) lấy từ thuộc tính `img` do page kiểm soát. Hiện chưa khai thác được chỉ vì đang bị lỗi L5. | `media-messages.ts:451-493`, `shortcuts.ts:318-341` | Bắt buộc tab X, chỉ HTTPS, kiểm tra `isTrustedMediaUrl`; host khác dùng `saveAs:true`. |
| **S5** ✅ | Low-Med | Rule DNR thêm `Access-Control-Allow-Origin: *` cho `cdn.syndication.twimg.com` với mọi initiator, trong khi SW không cần rule này. | `src/public/rules.json` | Xóa rule và quyền `declarativeNetRequest` (bớt một cảnh báo quyền). |
| **S6** ✅ | Low-Med | HLS fetcher theo playlist sang host bất kỳ với `credentials:'include'`; `DOWNLOAD_MP4` không kiểm tra URL. | `lib/hls-fetcher.ts:102`, `:177-184`, `offscreen.ts:162` | Kiểm tra `isTrustedMediaUrl` cho từng URL đã resolve, chỉ HTTPS, `credentials:'omit'`. |
| **S7** ✅ | Low | `TG_DOWNLOAD_MEDIA` nhận URL không kiểm tra scheme rồi click trong MAIN world (nguy cơ `javascript:`). | `media-messages.ts:497-528` | Chỉ nhận `blob:` hoặc `https://web.telegram.org`. |
| **S8** ✅ | Low | `START_DOWNLOAD` nhận key lạ, kể cả trường nội bộ `_operationId`/`_queueId`; `filenameTemplate` không kiểm tra kiểu (gây crash `.trim()`). | `shared/validation.ts:86-102`, `downloader.ts:323-414`, `:723` | Allowlist chặt; loại trường `_` ở message bên ngoài; `filenameTemplate` là string ≤ 200 ký tự. |
| **S9** ✅ | Low | Import settings không có schema validation (sai lệch với `security-permissions.md`). | `options/options.ts:445-472` | Validate theo allowlist key/kiểu như `isValidDownloadOptions`; cập nhật tài liệu. |
| **S10** ✅ | Low | Quyền `tabs` rộng hơn mức cần (host permission đã cho đọc `tab.url` của tab X), gây cảnh báo "đọc lịch sử duyệt web". | `manifest.json` | Bỏ `tabs`; chạy lại browser acceptance. |
| **S11** ✅ | Low | X đọc được trạng thái extension (`FAB_UPDATE`/`SNACKBAR_UPDATE` chứa username, tên file); script MAIN bị inject hai lần (manifest và `<script src>`) → lộ `web_accessible_resources` để fingerprint. | `content.ts:55-80`, `:425-446`, `manifest.json` | Bỏ đường `injectScript`, xóa `web_accessible_resources` (hoặc `use_dynamic_url`); UI tiến độ đặt trong closed shadow root. |

---

## 3. Hiệu năng

> v7.3.0: P1, P2, P3, P9, P11 hoàn thành. v7.3.1: P4 (SW lọc/ghi theo batch), P5 (quét store một lần mỗi batch thay vì index riêng — tránh lệch khi cache bị xóa ở nhiều nơi), P8, P12 hoàn thành. P2 dùng route-gating thay vì allowlist operation để không bỏ sót media.

Các mục đã làm (Queue/Download Center windowing, coalesce progress bằng rAF, cursor cho Picker/CSV, bỏ qua tab ẩn) không lặp lại ở đây.

### P0/P1

| ID | Vấn đề | Vị trí | Cách sửa |
| --- | --- | --- | --- |
| **P1** ✅ | Mỗi callback MutationObserver và mỗi lần scan gửi `DIAGNOSTIC_METRIC` qua IPC, SW đọc `storage.sync` để kiểm tra — **kể cả khi diagnostic đang tắt (mặc định)**. Điều này giữ SW thức liên tục. | `content/dom-scanner.ts:188-190`, `:240-242`, `content.ts:234-240`, `media-messages.ts:249-254`, `background/diagnostics.ts:8-15` | Content đọc option một lần (theo dõi `storage.onChanged`) và bỏ event khi tắt; khi bật thì gộp và flush mỗi 30–60 s; SW cache `isEnabled`. |
| **P2** ✅ | Mọi response GraphQL của X bị parse và duyệt 2–3 lần trên main thread (hook fetch, XHR, override `JSON.parse` toàn cục), kể cả Home/DM/Notifications vốn bị bỏ qua. | `content/page-interceptor.ts:173-241`, `:194-216`, `:316-337`, `:395-417` | Allowlist operation (UserMedia, UserTweets, Likes, Bookmarks, TweetDetail, Following, Search); bỏ qua khi route không có username; duyệt theo path đã biết; bỏ override `JSON.parse`. |
| **P3** ✅ | Telegram quét lại toàn bộ document và ép layout mỗi frame khi chat thay đổi. | `content/tg-content.ts:269-275`, `:397-399`, `:444-502` | Chỉ quét các root mới thêm; selector `:not([data-ext-x-telegram-download])`; kiểm tra viewer rẻ trước `isOnScreen`; throttle khoảng 4 Hz. |
| **P4** ✅ | `MEDIA_FOUND` xử lý từng item: 200 item gây khoảng 1.000 lượt IPC/storage (badge, popup, FAB, persist, diagnostic). | `media-messages.ts:121-130`, `scraper.ts:127-171` | Lọc theo mảng, gọi `addMediaItems` một lần, mỗi batch chỉ một lần cập nhật badge/popup/FAB. Content chia batch > 200 thay vì để SW loại cả batch. |
| **P5** ✅ | Mỗi `video_placeholder` quét O(n) toàn profile (tới 50k item). | `media-messages.ts:98-107` | Duy trì `Set<tweetId>` video theo profile. |
| **P6** ✅ | `tweet-btn` giữ `btnMap` chứa nút của mọi tweet → rò cả cây `<article>` đã detach; observer trên `document.body` quét lại toàn bộ article. | `content/tweet-btn.ts:193`, `:286-314` | Dùng `WeakMap` hoặc tra bằng `data-xmd-btn`; chỉ xử lý root mới thêm; observe primaryColumn. |
| **P7** ✅ | `DOWNLOAD_PROGRESS` gửi toàn bộ mảng lỗi mỗi file (tăng O(n²)), không throttle, mỗi lần còn gọi `tabs.get`. | `downloader.ts:475-485`, `:541-546`, `popup.ts:1094` | Chỉ gửi 20 lỗi cuối hoặc số đếm; throttle khoảng 4 Hz. |
| **P8** ✅ | dom-scanner quét toàn document mỗi 500 ms khi cuộn, tạo `new URL()` cho mọi `<img>` trước khi kiểm tra trùng, `discovered` không giới hạn, chạy cả trên Home/Explore. | `content/dom-scanner.ts:58-72`, `:223-231` | Dedupe theo `src` thô trước; bỏ qua route không có username; giới hạn/clear khi điều hướng; fallback theo scroll mỗi 2 s. |
| **P9** ✅ | Bộ script MAIN khoảng 50 KB bị inject hai lần mỗi lần load trang (manifest và `<script>`); `i18n.js` không có guard. | `content.ts:55-81` | Gộp với S11 — bỏ `injectScript`. |
| **P10** ✅ | Prune retention `getAll()` tới 50k record trong transaction readwrite sau mỗi lần SW restart. | `indexeddb.ts:129-153`, `:242-266`, `scraper.ts:459` | Index `[username, addedAt]`; `count()` trước, rồi dùng cursor từ bản ghi cũ nhất; lưu trạng thái đã kiểm tra trong storage. |

### P2

| ID | Vấn đề | Cách sửa |
| --- | --- | --- |
| **P11** ✅ | HLS ghép segment bằng cách copy sang một `Uint8Array` → RAM khoảng 2× kích thước video (`hls-fetcher.ts:69-78`). | `new Blob(segments, {type})`, không copy. |
| **P12** ✅ | `performance.mark/measure` không bao giờ được clear trong trang X (`dom-scanner.ts:52`, `:183`). | Dùng hiệu `performance.now()`, hoặc clear sau khi đo. |
| **P13** ✅ | `icon128.png` thực chất là JPEG 1024×1024, nặng 300 KB. | Xuất lại PNG 128 px. |
| **P14** ✅ | JSZip (103 KB) được import tĩnh ở mỗi lần mở offscreen (`offscreen.ts:3`). | `await import()` trong `processZipChunks`. |
| **P15** ✅ | Download Center fetch lại toàn bộ dữ liệu ở mỗi `QUEUE_UPDATE` (`download-center.ts:322`). | Dùng `payload.queue`, chỉ gọi `renderQueue()`. |

Nhỏ: ~~`waitForTabLoad` không gỡ listener khi timeout~~ (sửa ở v8.1.0); ~~popup init có khoảng 8 `await` tuần tự~~ (v8.1.0: theme/compact và lịch sử/Queue/phiên/cấu hình chạy song song); index `url` không dùng trên `media_items` **giữ nguyên** — gỡ cần nâng `DB_VERSION`, làm hỏng rollback.

### Chỉ tiêu đo (bổ sung vào `quality-gate.md`)

1. Lướt profile X với diagnostic tắt: **0** `DIAGNOSTIC_METRIC`, tối đa **2** `MEDIA_FOUND`/giây.
2. Cuộn Home và profile trong 60 s: script extension chiếm **≤ 2 %** main thread, không có long task > 50 ms.
3. Telegram: `processDOM` chạy **≤ 4 lần/giây**, 0 forced style recalc khi viewer đóng.
4. `MEDIA_FOUND` 200 item xử lý trong **≤ 50 ms**, đúng 1 lần cập nhật badge/popup/FAB; cold-load profile 50k item không có `getAll` > 10k.
5. Không còn DOM detach do extension giữ sau 10 phút cuộn; peak heap offscreen khi ghép HLS **≤ 1,1×** kích thước file; payload progress < 2 KB.

---

## 4. Giao diện (UI/UX)

> v7.4.0: U1–U15 hoàn thành, trừ U9 một phần (nút icon đã có title/aria-label đa ngôn ngữ; ký tự `×` chưa thay bằng SVG). P10 thay index `[username, addedAt]` (cần nâng IndexedDB, phá rollback) bằng cursor + kiểm tra retention hằng ngày hoặc khi profile vượt ngưỡng thêm 1.000 mục. v7.4.1: U16 (phát hiện sau phát hành, không nằm trong audit gốc) hoàn thành. v7.4.2: U9 hoàn tất nốt; phần "Dọn dẹp" (selector `.queue-status` trùng, 2 `!important` thừa) đã làm — khảo sát lại cho thấy `style=""` inline đã được dọn ở một đợt trước đó, không còn sót (grep `src/**/*.html`/`.ts` cho `style="` ra 0 kết quả).

### P0/P1

| ID | Vấn đề | Vị trí | Cách sửa |
| --- | --- | --- | --- |
| **U1** ✅ | Nút tải tweet quay mãi trên `/home`, `/search`, `/bookmarks` (xem L5). | `tweet-btn.ts:213` | Trạng thái lỗi, timeout, hoặc chỉ inject trên route được hỗ trợ. |
| **U2** ✅ | Khoảng 200 dòng tiếng Việt hard-code ngoài `t()`, trong khi ngôn ngữ mặc định là English → giao diện lẫn ngôn ngữ. Nhiều nhất ở popup.ts (64), download-center.ts (35), options.ts (35), queue-panel.ts (29), following-panel.ts (16). | nhiều file | Đưa vào `TRANSLATIONS`, thêm helper nội suy `t(key, {n})`; CI lint chặn chuỗi có dấu tiếng Việt ngoài `i18n.ts`. |
| **U3** ✅ | Key i18n chưa định nghĩa nên hiển thị nguyên tên key: `opt_filename_template(_desc)`, `preview_to_download`, `preview_skipped`. | `options.html:552-553`, `popup.html:346`, `:350` | Bổ sung 4 key cho en/vi; test đối chiếu `data-i18n` với `TRANSLATIONS`. |
| **U4** ✅ | 21 toggle trong Options dùng `display:none` cho input → không dùng được bằng bàn phím/screen reader; Options không có `:focus-visible`, input đặt `outline:none`. | `options.html:141`, `:164`, `:174`, `:195` | Ẩn input về mặt thị giác (opacity 0, phủ toàn toggle); thêm style `:focus-visible`. |
| **U5** ✅ | Light theme hỏng: `<style>` inline trong popup.html hard-code màu tối (`rgba(255,255,255,…)`) → modal confirm tối trên nền sáng, thanh progress và divider biến mất. | `popup.html:12-73` | Chuyển sang popup.css và dùng token `--bg-card`, `--border`, `--red`… |
| **U6** ✅ | Biến CSS không được định nghĩa: `--surface`, `--text-sec` → nút bulk Queue không có nền, mất phân cấp chữ. | `popup.css:1382`, `:1388`, `:1904`, `popup.html:17-60` | Thay bằng `--bg-hover`, `--text-secondary`. |
| **U7** ✅ | Ba trang có ba bộ token khác nhau; Download Center chỉ có dark theme và bảng màu khác hẳn; token z-index khai báo nhưng không dùng. | `options.html:10-38`, `download-center.css:1-14`, `popup.css:37-39` | Tạo `src/shared/tokens.css` dùng chung; Download Center áp `data-theme`. |
| **U8** ✅ | Theme mặc định là dark thay vì system; bấm toggle một lần làm mất lựa chọn "system". | `popup.ts:288-299`, `options.ts:391` | Mặc định `system`; toggle xoay vòng system → light → dark và hiển thị trạng thái. |

### P2

| ID | Vấn đề | Cách sửa |
| --- | --- | --- |
| **U9** ✅ | Nút chỉ có icon: `title` tiếng Việt hard-code, thiếu `aria-label`, dùng ký tự `×`/`✕` làm icon; nhãn bottom-nav hard-code tiếng Anh dù đã có key `nav_*`. | Thêm `data-i18n-title`/`data-i18n-aria-label`; icon close dạng SVG (v7.4.2: 5 nút đóng/xóa trong popup, Download Center, snackbar và Queue — xem U9 không bao gồm các icon chữ/mũi tên khác của Queue (`▲▼⏸▶↻⏹`, ngoài phạm vi) và dấu `×` ở "W × H" trong Options, vốn là ký hiệu nhân chứ không phải icon). |
| **U10** ✅ | Download Picker không có trạng thái loading/error; lỗi bị hiển thị thành "không có media"; khi không có username thì grid của profile cũ vẫn còn. | Skeleton với `aria-busy`, trạng thái lỗi có nút Retry, clear grid và selection. |
| **U11** ✅ | Danh sách Following trống trơn khi filter không khớp; định dạng ngày theo locale trình duyệt thay vì ngôn ngữ app. | Thêm empty-state; `toLocaleDateString(lang)`. |
| **U12** ✅ | Trạng thái nút tweet chỉ hiện qua `title`, không có `aria-label`/`aria-busy`. | Cập nhật đồng bộ cùng `title`. |
| **U13** ✅ | FAB/snackbar dùng z-index tối đa → che lightbox/modal của X; snackbar trùng vị trí toast của X; `min-width:340px` tràn trên màn hẹp. | Ẩn/hạ FAB khi có `[aria-modal="true"]`; dời snackbar; `min-width: min(340px, calc(100vw - 40px))`. |
| **U14** ✅ | 23 key i18n không dùng (`nav_*`, `stat_*`, `date_preset_*`…) trong khi UI tương ứng hard-code; `<html lang>` cố định. | Nối các key sẵn có; đặt `document.documentElement.lang` sau `loadI18n`. |
| **U15** ✅ | Popup/Options tải font Inter từ Google Fonts → request ngoài (mâu thuẫn cam kết "chỉ xử lý cục bộ"), FOUT, không có font khi offline. | Đóng gói woff2 cục bộ hoặc dùng system font stack. |
| **U16** ✅ (v7.4.1) | `.btn-row` chỉ khai báo 3 cột lưới nhưng có 4 nút thật ở trạng thái thường (Download, queue-add, CSV, Clear) và 5 nút khi đang tải (Stop chen thêm thay vì thay chỗ Download) → nút dư tràn xuống dòng riêng, sát thanh tab dưới cùng. `.header` không có rule cho `.header-text`, 5 nút icon cạnh tranh chỗ với tên thương hiệu → "Media Downloader" vỡ thành 2 dòng ngay lần mở đầu. Phát hiện qua ảnh chụp người dùng gửi sau khi phát hành 7.4.0. | `popup.css:543-547` (nay 4 cột), `popup.ts` `updateButtons()` (Stop thay chỗ Download), `popup.css`/`popup.html` quanh `.header`/`.header-left`/`.logo`/`.app-name` (gom nút vào `.header-actions`, thêm `min-width:0`/`white-space:nowrap`/ellipsis). |

Dọn dẹp ✅ (v7.4.2): gộp selector trùng `.queue-status` thành 1 rule; bỏ 2 `!important` thừa trên `.btn-queue-clear` (trùng lặp hoàn toàn với `.btn-text` mà nút đã có sẵn qua class thứ hai, không có xung đột specificity thật nào cần `!important`); `style=""` inline đã được dọn hết từ trước, không còn sót.

---

## 5. Tư vấn tính năng mới (v8.0)

Đánh giá theo: giá trị cho người dùng · công sức · rủi ro (chính sách X/Chrome Web Store, quyền, bảo trì).

| ID | Tính năng | Giá trị | Công sức | Rủi ro | Khuyến nghị |
| --- | --- | --- | --- | --- | --- |
| **F1** ✅ (v8.0.0, thu hẹp) | **Thu thập theo Search / Hashtag / List**: mở rộng interceptor sang `SearchTimeline` và `ListLatestTweetsTimeline`, Queue nhận "nguồn" thay vì chỉ username. | Cao | M | Thấp — tái dùng pipeline sẵn có | **Nên làm** |
| **F2** ✅ (v8.0.0, gộp vào Manifest) | **Metadata sidecar**: xuất `.json` hoặc caption `.txt` cạnh file (tweetId, ngày, text, số like), tùy chọn bật/tắt; hoặc gộp vào Manifest. | Cao (lưu trữ/tìm lại) | S | Thấp | **Nên làm** |
| **F3** ✅ (v8.0.0, chưa có đổi chất lượng) | **Tab "Lỗi" trong Download Center**: danh sách item lỗi theo nguyên nhân (404, timeout, rate-limit), retry có chọn lọc, đổi chất lượng. Kết hợp L7–L9. | Cao | S–M | Thấp | **Nên làm** |
| **F4** ✅ (v8.1.0) | **Giới hạn băng thông/đồng thời** trong Settings (1–6 luồng, nghỉ giữa các batch) để tránh rate-limit khi tải profile lớn. | Trung bình | S | Thấp | Nên làm |
| **F5** | **Backup/Restore toàn bộ dữ liệu cục bộ** (media index, lịch sử chống trùng, Saved Jobs, settings) thành 1 file, có kiểm tra schema (dùng lại validator của S9). Thay thế an toàn cho cloud sync. | Trung bình | M | Thấp | Nên làm |
| **F6** | **Tải thread/hội thoại**: từ `TweetDetail`, tải media của cả thread của tác giả. | Trung bình | S–M | Thấp | Cân nhắc |
| **F7** | **Telegram: tải hàng loạt theo khoảng tin nhắn/album** trong một chat. | Trung bình | L | Trung bình — DOM Telegram thay đổi thường xuyên | Cân nhắc sau F1–F5 |
| **F8** | **Bản Firefox (MV3)**: offscreen/`world: MAIN` cần adapter riêng. | Trung bình (mở rộng người dùng) | L | Trung bình | Để sau v8 |
| — | Cloud sync, tải Spaces/audio, tự động unfollow nền | — | — | Cao (backend, ToS, tài khoản) | **Không khuyến nghị** |

---

## 5b. Kết quả v8.0.0 (F1–F3)

Phạm vi đã chốt trước khi làm (thu hẹp để giữ rủi ro thấp):

- **F1 — Search/Hashtag (không gồm Lists, không có nguồn Queue riêng):** trang `/search?q=` và `/hashtag/<tag>` quy về khoá dạng username (`_search_<chữ>_h<hash>`, `_hashtag_…`, xem `src/shared/collection-source.ts`), giống mẹo `_bookmarks_`/`<user>_likes`, nên IndexedDB, validate, so khớp tab/sender, thư mục tải và Queue dùng lại nguyên vẹn, không đổi schema. `extractMediaFromResponse` vốn quét đệ quy nên `SearchTimeline` được parse mà không sửa interceptor. Parser URL riêng của `content.ts` được thay bằng parser dùng chung. Chưa làm: X Lists (cần lấy tên list qua API riêng; operation `ListLatestTweetsTimeline`), nguồn Search trong Queue nhiều mục.
- **F2 — gộp vào Manifest (không ghi sidecar từng file):** sidecar từng file sẽ nhân đôi lệnh `chrome.downloads` và phải đưa cả `MediaItem` vào đường tải lõi. Manifest JSON thêm `tweetText`, `likeCount`; Manifest CSV và CSV media thêm cột tương ứng qua `csvCell()` (RFC 4180, chặn công thức). `likeCount` đọc từ `favorite_count` trên cùng object tweet interceptor đã có.
- **F3 — danh sách file lỗi + thử lại chọn lọc (chưa đổi chất lượng):** lưu ở `chrome.storage.local` `failed_items_v1` (500 mục) thay vì store IndexedDB mới, vì nâng `DB_VERSION` làm hỏng rollback. `categorizeDownloadError` chạy song song `formatDownloadError` (câu hiển thị giữ nguyên). Thử lại dùng `startDownload` với `selectedUrls`, từng profile một. Đổi chất lượng cần lưu các variant video đang bị bỏ ở 3 chỗ chọn `bestMp4` — để vòng sau.

Gate: 68 unit test, 2 e2e, `npm run check` xanh; ngân sách build nâng 480 KB / 120 KB / 110 module. Chưa kiểm thử trên X thật và chưa có Chromium acceptance cho F1/F3.

## 5c. Kết quả v8.1.0 (F4)

- Số luồng 1–6 (`clampConcurrency`, giá trị cũ tới 10 được đưa về 6); **Nghỉ giữa các file** 0–10 giây; **Giảm tốc khi bị giới hạn (429)** bật sẵn: mọi luồng nghỉ 60 giây qua một `PauseGate` dùng chung (nhiều luồng cùng gặp 429 không cộng dồn thời gian nghỉ), file bị chặn được xếp lại một lần trước khi tính là lỗi. Mọi khoảng chờ thoát ngay khi bấm Stop. Logic thuần ở `src/shared/download-throttle.ts`.
- Không dùng "giới hạn băng thông" theo byte/giây: `chrome.downloads` không cho điều tiết tốc độ một file; giới hạn số luồng + khoảng nghỉ + lùi khi 429 là cách điều tiết thực tế.
- Gate: 71 unit test. Chưa thử với phản hồi 429 thật từ X.

## 6. Thứ tự thực hiện đề xuất

1. ~~Xác minh L1 trên Chromium~~ — đã xác nhận lỗi.
2. ~~**v7.2.3**: L1–L5 + regression test~~ — hoàn thành 2026-10-14.
3. ~~**v7.3.0**~~ — hoàn thành 2026-10-14: S1/S3/S11/P9 làm cùng nhau (cùng thay đổi kiến trúc bridge content ↔ page), sau đó S2, S4–S10, L6–L15, P1–P3.
4. ~~**v7.4.0**~~ — hoàn thành 2026-10-14: U2/U3/U14 (i18n) → U5–U8 (token/theme) → U4/U9–U13 (accessibility) → P4–P15.
5. ~~**v7.4.1**: U16 (hotfix layout popup)~~ — hoàn thành 2026-10-14, phát hiện qua báo cáo người dùng sau phát hành 7.4.0.
6. ~~**v7.4.2**: U9 còn lại, dọn CSS, Chromium fixture tweet-btn~~ — hoàn thành 2026-10-14.
7. ~~**v8.0.0**: F1, F2, F3~~ — hoàn thành 2026-10-14 (phạm vi thu hẹp, xem 5b).
8. ~~**v8.1.0**: F4 + 2 việc nhỏ ở mục Hiệu năng~~ — hoàn thành 2026-10-14.
9. **Tiếp theo:** F5 (cần chốt phạm vi); X Lists cho F1; đổi chất lượng khi thử lại cho F3.

## 6b. Tồn đọng sau v8.1.0

Các mốc v7.2.3 → v8.1.0 đã phát hành (xem `CHANGELOG.md`). Còn lại:

- **Kiểm thử thủ công trên X/Telegram thật:** Search/Hashtag (tab Media/Latest, hashtag tiếng Việt), Manifest có caption/like, panel File lỗi và thử lại; cùng các mục cũ (đổi ngôn ngữ, lightbox ẩn FAB, HLS, Following Scanner, icon SVG U9).
- **Test:** Chromium fixture `tweet-btn re-attaches...` (7.4.2) chưa chạy được trong môi trường dev — service worker không khởi động khi Playwright nạp `--load-extension` ở đây; cần CI hoặc máy có Chrome thật. Chưa có Chromium acceptance cho Search/Hashtag và retry chọn lọc.
- **Mở rộng F1/F3:** X Lists; nguồn Search trong Queue; đổi chất lượng khi thử lại (lưu variant video).
- **F5:** Backup/Restore dữ liệu cục bộ — cần chốt phạm vi (chỉ settings + Saved Jobs, hay cả media index và lịch sử chống trùng).
- **Chỉ tiêu đo hiệu năng** ở mục 3 chưa được đưa vào `quality-gate.md`.

## 7. Tiêu chí hoàn thành chung

- `npm run check` và `npm run test:browser` xanh ở mọi mốc.
- Mỗi lỗi L/S có ít nhất một regression test (unit hoặc Chromium acceptance).
- Không tăng quyền trong manifest; mục tiêu là **giảm** (`tabs`, `declarativeNetRequest`, `web_accessible_resources`).
- Không còn `@ts-nocheck`; giảm `@ts-ignore` trong `content.ts` về 0.
- Cập nhật `security-permissions.md`, `performance-baseline.md`, `quality-gate.md` theo số đo mới.
