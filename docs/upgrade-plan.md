# Kế hoạch nâng cấp ExtensionX

> Baseline: **6.4.0** | Cập nhật: 2026-09-30 | Trạng thái: **6.4.0 implemented; browser acceptance pending**

Tài liệu này đề xuất lộ trình nâng cấp dựa trên mã nguồn hiện tại. Trọng tâm là độ tin cậy của Queue/download, hiệu năng với profile lớn, thu hẹp bề mặt bảo mật, hoàn thiện UI/UX và bổ sung tính năng có giá trị thực tế. Đây là kế hoạch triển khai, không phải danh sách lỗi đã được xác nhận; các mục cần đo hoặc tái hiện được ghi rõ là audit/benchmark.

## 1. Mục tiêu và chỉ số thành công

| Nhóm | Baseline cần đo | Mục tiêu |
| --- | --- | --- |
| Queue | Start/Stop/Resume đã có unit test, chưa có browser lifecycle test đầy đủ | Không có item treo; một download toàn cục; phục hồi đúng sau SW restart |
| Popup | Queue đang tránh render lại khi chỉ đổi progress | Mở popup với 1.000 media < 300 ms; thao tác UI không có long task > 50 ms |
| Thu thập | GraphQL + DOM fallback + MutationObserver | Không quét trùng subtree; CPU nền gần 0 khi trang ổn định |
| Storage | IndexedDB theo profile, lịch sử tải tối đa 50.000 URL | Đọc/ghi theo batch/cursor; không nhân đôi toàn bộ tập dữ liệu trong bộ nhớ |
| Download | Worker pool 1–5, timeout và HLS offscreen | Stop phản hồi < 500 ms; retry có giới hạn; không tải thumbnail video |
| Bảo mật | CSP, URL/sender validation và diagnostic redact đã có | Mọi message có payload typed; quyền/host có lý do; không có dữ liệu nhạy cảm trong log/export |
| Chất lượng | 31 unit + 2 fixture e2e + browser workflow CI | Browser regression bắt buộc cho Queue, X DOM fallback và Telegram |

## 2. Nguyên tắc triển khai

- Sửa correctness và lifecycle trước khi tối ưu hoặc thêm tính năng.
- Mọi tác vụ dài phải có operation ID, abort/stop, timeout và bỏ qua callback cũ.
- State nghiệp vụ nằm ở background/shared; popup chỉ render state và phát intent.
- Dữ liệu từ page world, import file, storage và runtime message đều là dữ liệu không tin cậy.
- Không mở rộng permission/host nếu chưa có use case, threat model và giải thích cho người dùng.
- Mỗi phase phải có benchmark trước/sau, regression test và đường rollback độc lập.

## 3. P0 — Ổn định Queue và download (6.2.8)

> Tiến độ: **Implemented, pending real-browser acceptance** — coordinator, paused recovery, dedupe-complete và unit regression đã hoàn thành; browser lifecycle/fault-injection vẫn cần xác nhận để đóng phase.

### 3.1 Chuẩn hóa state machine

- Thay các cờ rời `inProgress`, `_queueStartPending`, `_queueStartCancelled`, `_stopRequested` bằng một download coordinator có trạng thái rõ ràng: `idle → preparing → downloading → stopping → paused/completed/error`.
- Mỗi lượt chạy có `operationId` và `AbortController`; mọi kết quả IndexedDB, HLS, Chrome Downloads và timer phải kiểm tra operation hiện hành.
- Tách `startNextInQueue()` thành các bước thuần: chọn item, chuẩn bị media, claim slot, chạy job, finalize. Không gọi chéo vòng giữa `queue.ts` và `downloader.ts` nếu có thể thay bằng coordinator/event.
- Persist Queue ngay tại các transition quan trọng; debounce chỉ dùng cho progress không quan trọng.
- Khi Service Worker thức dậy, khôi phục trạng thái gián đoạn thành paused và yêu cầu người dùng tiếp tục, không auto-download.

### 3.2 Fix logic và edge case

- Stop trong các thời điểm: trước/sau IndexedDB, đang chờ Chrome download ID, đang ghép HLS và giữa hai worker.
- Queue rỗng, item không có media, tất cả file bị dedupe, import queue đang dở, xóa item hiện hành và profile trùng username.
- Phân biệt `paused`, `cancelled`, `failed`, `completed`; không dùng `waiting + paused` như trạng thái ngầm lâu dài sau khi schema mới ổn định.
- Queue phải cập nhật `mediaCount` sau khi lọc thumbnail, filter loại media, ngày, keyword và dedupe; UI hiển thị count “sẽ tải”, không phải count thô.
- Retry chỉ chạy phần thất bại hoặc chưa tải, không tải lại phần thành công.

### 3.3 Regression bắt buộc

- Browser test: Start → Đang tải → Stop → Tạm dừng → Resume → Hoàn tất.
- Browser test hai lần bấm Start nhanh chỉ tạo một job.
- Mô phỏng SW restart tại `preparing` và `downloading`.
- Fixture có ảnh thật + video + `ext_tw_video_thumb` + `amplify_video_thumb`.
- Fault injection cho IndexedDB reject, `chrome.downloads.download` timeout và HLS abort.

### Definition of Done

- Không còn transition Queue ngoài state machine.
- Không có promise/timer của operation cũ thay đổi operation mới.
- Toàn bộ kịch bản trên chạy xanh trong CI và Chrome thật.

## 4. P1 — Hiệu năng và khả năng mở rộng (6.3.0)

> Tiến độ: **Implemented core optimizations** — worker cursor, single-pass filtering, Queue event delegation/rAF batching, hidden-tab observer pause và Telegram watchdog 2 giây đã hoàn thành. Virtualization, IndexedDB cursor trực tiếp và benchmark Chrome fixture lớn chuyển sang backlog đo đạc tiếp theo.

### 4.1 Popup và UI list

- Virtualize Queue, Picker, History và Following list khi vượt 100–200 phần tử.
- Dùng event delegation thay vì gắn listener cho từng row sau mỗi render.
- Chia nhỏ `popup.ts` (hiện khoảng 1.300 dòng) thành controller theo tab và typed store dùng chung.
- Batch cập nhật progress theo `requestAnimationFrame`; chỉ thay text/width của row liên quan.
- Lazy-load panel ít dùng như History, Following và Picker sau khi người dùng mở tab.

### 4.2 Thu thập DOM

- Benchmark `MutationObserver` của `dom-scanner.ts`, `tweet-btn.ts` và Telegram; gom mutation theo frame và dedupe root lồng nhau.
- Không full-scan document sau mỗi mutation/navigation; dùng subtree mới và một lần reconciliation có giới hạn.
- Dừng observer/timer khi tab ẩn hoặc route không còn phù hợp; khởi tạo lại khi `visibilitychange`/SPA navigation.
- Thay polling Telegram 500 ms bằng observer/event khi ổn định; giữ watchdog chậm làm fallback.

### 4.3 Memory, IndexedDB và download

- Tránh `Array.from(store.values())` cho profile rất lớn; truy vấn IndexedDB theo cursor/batch và áp filter theo dòng.
- Thay `queue.shift()` trong worker pool bằng chỉ số cursor để tránh chi phí dịch mảng O(n).
- Giới hạn cache media trong RAM theo LRU/profile active; giải phóng sau khi job hoàn tất.
- Ghi downloaded URLs và media delta theo batch có transaction; đo thời gian và quota failure.
- HLS/MP4 lớn ưu tiên streaming/chunk pipeline; tránh data URL hoặc Blob kép khi API trình duyệt cho phép.

### Benchmark/DoD

- Bộ fixture 100, 1.000, 10.000 và 50.000 media.
- Báo cáo median/p95 cho mở popup, render list, filter, start Queue và peak heap.
- 10.000 media không khóa popup; memory không tăng tuyến tính do giữ bản sao thừa.

## 5. P1 — Bảo mật và quyền riêng tư (6.3.0)

> Tiến độ: **Implemented boundary and permission audit** — runtime message có allowlist type/field/envelope, regression field dư và `activeTab` trùng lặp đã được loại. Discriminated response typing đầy đủ tiếp tục được thực hiện theo domain.

### 5.1 Message boundary

- Chuyển `ExtensionMessage.payload: any` thành discriminated union cho toàn bộ message.
- Mỗi handler khai báo schema, giới hạn kích thước, sender hợp lệ, tab/profile binding và response type.
- Tách message từ MAIN world qua content bridge có allowlist field; không chuyển nguyên response GraphQL.
- Thêm test giả mạo sender, payload dư field, URL sai host, batch quá lớn và replay operation cũ.

### 5.2 Least privilege

- Audit từng permission: `tabs`, `activeTab`, `scripting`, `declarativeNetRequest`, `offscreen`, `alarms`, `notifications` và `downloads`.
- Loại permission trùng/không dùng; cân nhắc `optional_permissions` cho Telegram, notification hoặc tính năng ít dùng.
- Thu hẹp `host_permissions` và `web_accessible_resources` theo đúng origin/resource cần thiết.
- Rà `rules.json` để bảo đảm rule DNR không mở rộng header hoặc origin ngoài mục tiêu.

### 5.3 Dữ liệu và dependency

- Thiết lập retention cho media cache, queue, history và diagnostic; thêm màn hình xem/xóa dung lượng theo profile.
- Không log token, cookie, query URL nhạy cảm, username hoặc nội dung tweet trong diagnostic.
- Import Queue/Options/ZIP: giới hạn byte, số record, độ sâu, tên file, CRC và chống zip bomb/path traversal.
- Thêm `npm audit --omit=dev`/dependency review phù hợp CI; kiểm kê thư viện vendored như JSZip và quy trình cập nhật.
- Threat model ngắn cho X MAIN-world interceptor, Telegram stream, offscreen document và Following unfollow.

### DoD

- Có bảng permission → tính năng → lý do.
- 100% runtime messages qua parser typed và sender validation.
- Security regression xanh; diagnostic/export không chứa secret test fixtures.

## 6. P1 — UI/UX và accessibility (6.3.1)

> Tiến độ: **Implemented core Queue UX** — primary action theo state, global resume, live summary, ARIA cho row actions/progress, responsive 320–360 px, forced-colors và confirm focus trap đã hoàn thành. Screenshot regression và kiểm tra screen reader/zoom trên Chrome thật vẫn cần nghiệm thu thủ công.

### 6.1 Hệ thống giao diện

- Chuẩn hóa token màu, spacing, radius, typography, focus ring và trạng thái disabled/loading/error.
- Mỗi action chỉ có một nguồn trạng thái; khóa double-click và hiển thị tiến trình ngay dưới 100 ms.
- Không dùng chỉ màu/icon để truyền trạng thái; luôn có label/tooltip/ARIA tương ứng.
- Chuẩn hóa thuật ngữ Việt/Anh: Start/Bắt đầu, Stop/Dừng, Pause/Tạm dừng, Resume/Tiếp tục.

### 6.2 Queue

- Header cố định gồm tổng item, đang chạy, tạm dừng, lỗi và tiến độ toàn Queue.
- Một nút primary thay đổi theo state: **Bắt đầu / Tạm dừng Queue / Tiếp tục Queue**; stop/cancel là action riêng có xác nhận khi cần.
- Row hiển thị số file dự kiến, đã tải, bỏ qua, lỗi và lý do lỗi ngắn; chi tiết mở bằng disclosure.
- Thêm thao tác hàng loạt: retry lỗi, pause/resume đã chọn, xóa completed; undo ngắn cho xóa Queue item.
- Empty/error/loading state riêng; không để toast là nơi duy nhất báo kết quả.

### 6.3 Popup tổng thể

- Kiểm tra layout ở 320/360/400 px, zoom 125–200%, chuỗi tiếng Việt dài và dark mode.
- Điều hướng bàn phím hoàn chỉnh; focus không mất sau rerender; modal có focus trap và trả focus đúng chỗ.
- Tôn trọng `prefers-reduced-motion`; contrast đạt WCAG AA cho text/control.
- Skeleton chỉ dùng khi có độ trễ thật; tránh nhảy layout khi count/progress cập nhật.

### DoD

- Checklist keyboard, screen reader labels, contrast, zoom và responsive được đưa vào PR template/test thủ công.
- Screenshot regression cho các state chính của Main, Picker, Queue, Stats và Following.

## 7. P2 — Kiến trúc, kiểm thử và vận hành (6.4.0)

> Tiến độ: **Implemented** — message router đã tách theo domain; IndexedDB/Chrome storage có abstraction; Queue, Options và DB có migration regression; CI có performance budget; artifact phát hành có danh sách file và SHA-256. Typed response consumer và browser lifecycle sâu tiếp tục trong backlog.

- Tách `messages.ts` theo domain (`queue-messages`, `media-messages`, `following-messages`, `export-messages`).
- Tạo repository abstraction cho IndexedDB và adapter cho Chrome APIs để unit test không phụ thuộc global mock rời rạc.
- Loại dần `any`/`@ts-ignore` còn lại, ưu tiên boundary content/page và response GraphQL.
- Bổ sung test migration schema/version cho Queue, Options và IndexedDB.
- Thêm performance budget vào CI: bundle size, số module, fixture benchmark không regression quá ngưỡng.
- Source map chỉ dùng nội bộ; release artifact có manifest checksum và danh sách file cho reproducible build.
- Diagnostic opt-in có mã lỗi ổn định, counter giới hạn và nút xuất gói hỗ trợ đã redact.

## 8. Đề xuất tính năng mới

### Nên ưu tiên sau khi hoàn thành P0/P1

1. **Download Center:** trang đầy đủ thay popup nhỏ, tìm kiếm/lọc job, xem lỗi, retry phần lỗi và lịch sử theo profile.
2. **Ước tính trước khi tải:** số file, loại media, dung lượng ước tính, file trùng và cảnh báo job lớn.
3. **Saved Jobs:** lưu cấu hình profile + filter + cách đặt tên; người dùng chủ động chạy lại, không polling nền.
4. **Rule-based organization:** template thư mục theo `{username}/{year}/{month}/{type}` với preview và sanitize.
5. **Quản lý storage:** dung lượng theo profile, tuổi dữ liệu, dọn cache/history có preview và xác nhận.
6. **Export báo cáo lỗi:** JSON/CSV đã redact gồm mã lỗi, loại media và số lần retry để hỗ trợ debug.

### Có giá trị nhưng cần prototype/đánh giá chi phí

- Gallery toàn trang với virtual grid, chọn hàng loạt và so sánh duplicate.
- Đóng gói ZIP theo chunk với giới hạn dung lượng; không tạo một Blob khổng lồ trong RAM.
- Content-hash dedupe tùy chọn cho file đã tải; cần cân nhắc chi phí đọc file/quyền truy cập.
- Following Scanner Feature 1 theo kế hoạch riêng, chỉ triển khai sau threat model và preview bắt buộc.
- Lịch tải thủ công qua `chrome.alarms`, chỉ khi thiết kế rõ giới hạn MV3, đăng nhập và rate-limit.

### Chưa khuyến nghị

- Cloud sync mặc định, telemetry từ xa hoặc auto-unfollow nền: tăng mạnh rủi ro quyền riêng tư và vận hành.
- Tải song song không giới hạn: dễ gặp rate limit, memory spike và trạng thái khó phục hồi.
- Tự động cập nhật GraphQL query ID từ nguồn bên ngoài không xác thực.

## 9. Thứ tự phát hành đề xuất

| Mốc | Phạm vi | Điều kiện phát hành |
| --- | --- | --- |
| 6.2.8 | Queue coordinator, lifecycle/browser regression | Stop/Resume/SW restart xanh trên Chrome thật |
| 6.3.0 | Performance + typed messages + permission audit | Benchmark đạt mục tiêu, security regression xanh |
| 6.3.1 | Queue UI, responsive, accessibility | Keyboard/zoom/contrast/screenshot checklist đạt |
| 6.4.0 | Module hóa background, storage adapter, migration tests | Không đổi hành vi, coverage lifecycle tăng |
| 7.0.0 | Download Center/Saved Jobs và schema ổn định mới | Migration tương thích, tài liệu và rollback đầy đủ |

Không gộp toàn bộ roadmap vào một release. Mỗi mốc nên có feature flag hoặc commit tách biệt để bisect và rollback.

## 10. Checklist cho mỗi hạng mục

- Có issue mô tả hiện trạng, cách đo/tái hiện và acceptance criteria.
- Có threat/privacy review nếu chạm permission, network, storage hoặc dữ liệu tài khoản.
- Có unit test cho logic thuần và browser test cho lifecycle/UI quan trọng.
- Chạy `npm run check`; chạy `npm run test:browser` cho thay đổi content/background/popup.
- So sánh benchmark/bundle trước và sau; không chấp nhận tối ưu chỉ dựa trên cảm giác.
- Cập nhật changelog, roadmap, hướng dẫn người dùng và version khi phát hành.

## 11. Việc nên bắt đầu ngay

1. Mở rộng browser harness cho Queue Start/Stop/Resume và SW restart.
2. Hoàn thiện typed response map cho popup/content consumer.
3. Đo popup/heap với fixture 1.000, 10.000 và 50.000 media để có baseline runtime.
4. Thêm fault injection thực tế cho IndexedDB, Chrome Downloads và HLS abort.
5. Prototype virtualized Queue/Picker; chỉ áp dụng khi số đo vượt budget.
6. Kiểm tra Chrome thật cho keyboard, zoom, screen reader và Queue lifecycle trước khi đóng browser acceptance.
