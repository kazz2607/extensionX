# Baseline hiệu năng và build budget 8.2.2

> Cập nhật: 2026-10-14

## Tối ưu đã áp dụng

- Worker download dùng cursor dùng chung thay cho `queue.shift()`, tránh dịch mảng O(n) ở mỗi file.
- Lọc thumbnail video bằng một lượt duyệt, không tạo đồng thời bản sao `Array.from(...).filter(...)`.
- Queue dùng một click listener theo event delegation thay vì gắn lại listener cho từng row sau mỗi render.
- Progress Queue được gộp bằng `requestAnimationFrame`, mỗi frame chỉ áp dụng bản cập nhật mới nhất.
- DOM scanner bỏ qua mutation khi tab ẩn và reconcile khi tab hiện lại.
- Telegram dùng MutationObserver cho thay đổi thường xuyên; watchdog dự phòng giảm từ 500 ms xuống 2 giây.

## Ngân sách phát hành

| Tình huống | Mục tiêu |
| --- | --- |
| Mở popup với 1.000 media | median dưới 300 ms |
| Tương tác/cập nhật Queue | không có long task trên 50 ms |
| Stop download | UI phản hồi dưới 500 ms |
| 10.000 media | popup không bị khóa, không giữ thêm bản sao mảng không cần thiết |

Build 8.2.2 tiếp tục áp dụng gate tự động trong `npm run check` và tính cả entrypoint Download Center:

| Chỉ số build | Ngưỡng | Kết quả 8.2.2 |
| --- | ---: | ---: |
| Tổng JavaScript trong `dist/` | ≤ 420.000 byte | 381.998 byte |
| JavaScript bundle lớn nhất | ≤ 120.000 byte | 115.963 byte |
| Số module TypeScript trong `src/` | ≤ 110 | 107 |

Ngưỡng số module tăng từ 85 lên 95 trong 7.3.0 vì bridge MAIN ↔ isolated, navigation và các helper có kiểm thử được tách thành module nhỏ; tổng dung lượng JavaScript gần như không đổi.

Tối ưu runtime 7.3.0: metric diagnostic không rời trang khi chưa bật (mặc định) và service worker cache cờ diagnostic; interceptor chỉ parse GraphQL trên route profile/likes/bookmarks (và trang Following), XHR không parse hai lần, hook `JSON.parse` quét một chuỗi thay vì năm; Telegram chỉ quét subtree mới thêm, tối đa khoảng 4 lần/giây, cộng một lượt toàn trang mỗi 2 giây; HLS ghép segment không còn bản sao toàn bộ video; script MAIN không còn bị nạp hai lần. 7.3.1: `MEDIA_FOUND` lọc/ghi theo batch với đúng một lần cập nhật badge/popup/FAB, placeholder video quét store một lần mỗi batch; DOM scanner bỏ qua route không thu thập, lọc theo `src` gốc trước khi parse URL, quét dự phòng khi cuộn 2 giây/lần, giới hạn 20.000 key và không còn để lại `performance.mark`. Tổng JavaScript tăng khoảng 13 KB vì bộ dịch i18n được bundle vào `content.js` cho FAB/snackbar ở isolated world (popup vẫn có bản riêng); v7.4.0 cần tách bảng dịch để không vượt ngưỡng 400 KB.

7.4.0: ngưỡng tổng JavaScript nâng từ 400.000 lên 460.000 byte vì bảng dịch en/vi của popup, Options, Download Center và service worker (~70 KB dữ liệu chuỗi). Bảng dịch được tách theo bề mặt nên content script trên X không mang chuỗi của trang khác: `content.js` ~32 KB, `shortcuts.js` ~8 KB. Tối ưu runtime 7.4.0: progress tải gửi tối đa ~4 lần/giây và chỉ 20 lỗi gần nhất; nút tweet không còn giữ cây `<article>` đã tháo khỏi DOM và chỉ quét subtree mới; Download Center cập nhật Queue tại chỗ thay vì đọc lại storage; JSZip (~96 KB) chỉ nạp khi tạo ZIP; retention duyệt bằng cursor, chạy khi đến hạn hằng ngày hoặc khi profile vượt ngưỡng thêm 1.000 mục; `icon128.png` từ JPEG 300 KB thành PNG 128 px 9 KB.

7.4.1 (hotfix): sửa layout popup (hàng nút hành động và header) — thuần CSS/HTML cộng 1 dòng JS ẩn/hiện nút có sẵn, không thêm module hay phụ thuộc mới; dung lượng JS gần như không đổi so với 7.4.0 (+131 byte).

7.4.2: thay ký tự `×`/`✕` bằng SVG ở 5 nút đóng/xóa (U9) và dọn CSS trùng lặp — không thêm module; dung lượng JS tăng không đáng kể so với 7.4.1 (+413 byte, các chuỗi SVG tĩnh trong popup/download-center/content).

8.0.0: F1–F3 thêm khoảng 15 KB JavaScript (service worker +6 KB: parser Search/Hashtag, ô CSV, phân loại lỗi, lưu file lỗi; Download Center +3 KB: panel File lỗi; bảng dịch en/vi). Bản build chỉ còn 1,5 KB tổng / 0,2 KB file lớn nhất / 1 module dưới ngưỡng cũ (460 KB / 110 KB / 105), nên ngưỡng nâng lên 480 KB / 120 KB / 110 để còn chỗ cho F4–F5. Không thêm công việc nền: file lỗi chỉ được ghi khi một file thất bại, đường thành công dùng bản sao trong bộ nhớ và không đọc storage khi file chưa từng lỗi.

8.1.0 (F4): +3 KB JavaScript (giới hạn luồng/khoảng nghỉ, cổng tạm dừng 429, hai cài đặt mới và chuỗi dịch). Khoảng nghỉ chỉ làm chậm lượt tải khi người dùng bật; ở mặc định (0 giây) đường tải không thêm lần chờ nào. Popup khởi động song song các bước đọc storage độc lập.

8.2.0 (F5): +13 KB JavaScript — Options +8,8 KB (giao diện sao lưu/khôi phục, kiểm tra file, 22 chuỗi song ngữ), service worker +3 KB. Ngưỡng giữ nguyên; tổng JS chỉ còn ~3 KB dưới 480 KB, nên tính năng kế tiếp cần xem lại ngân sách (vd. tách bảng dịch của Options) trước khi nâng ngưỡng.

8.2.1: +0,8 KB (dò mã HTTP khi `SERVER_FAILED`, gộp URL đã tải trong bộ nhớ khi sao lưu); gỡ `@ts-ignore` không đổi dung lượng. Còn ~2,4 KB dưới 480 KB.

8.2.2 (giảm dung lượng): bỏ JSZip (96 KB). ZIP do `src/shared/zip-store.ts` tạo (phương thức STORE, ~2 KB): ảnh/video X đã nén sẵn nên DEFLATE gần như không giảm dung lượng; file ZIP có thể lớn hơn vài phần trăm nhưng tạo nhanh hơn và không cần thư viện ngoài. Tổng JS **478.116 → 381.998 byte (−20 %)**; ngưỡng tổng hạ từ 480.000 xuống **420.000** để giữ phần đã giảm. File lớn nhất vẫn là service worker (115.963 / 120.000 byte).

Ngưỡng nằm trong `performance-budget.json` và được kiểm tra bởi `scripts/check-performance-budget.mjs`.

## Cách đo

Đo runtime trên Chrome production build với fixture 100, 1.000, 10.000 và 50.000 media. Matcher chạy 7 lượt; browser acceptance đo Queue lifecycle, heap 20.000 media, DOM/long-task 500 item, Download Center, responsive, keyboard và START_QUEUE acknowledgement.

## Phần tiếp tục

P0, P1 và phạm vi P2 cam kết đã hoàn tất. Budget tăng có chủ đích cho JSZip trong offscreen bundle; popup/service-worker vẫn nằm dưới ngưỡng và ZIP chỉ chạy theo thao tác người dùng.

## Benchmark CPU 2026-10-02

Chạy `npm run benchmark:media` với 7 lượt trên môi trường phát triển hiện tại. Đây là benchmark matcher/filter thuần, không đại diện cho thời gian IndexedDB, render DOM hoặc peak heap Chrome.

| Fixture | Median | p95 |
| ---: | ---: | ---: |
| 100 | 0,031 ms | 0,808 ms |
| 1.000 | 0,140 ms | 1,196 ms |
| 10.000 | 0,863 ms | 1,177 ms |
| 50.000 | 2,987 ms | 25,494 ms |

Budget CI ban đầu cho matcher 50.000 media là p95 ≤ 250 ms. Count/Picker cold-cache nay quét IndexedDB bằng cursor và chỉ giữ cửa sổ Picker tối đa 200 item. Queue windowing được quyết định bằng Chrome DOM/heap benchmark riêng, không dựa trên benchmark CPU này.

## Chrome heap benchmark 2026-10-02

Browser acceptance dùng Chromium với `--enable-precise-memory-info`, fixture IndexedDB 20.000 media, rồi chạy Picker, CSV và Manifest trên cold-cache. Kết quả bản phát hành: heap tăng **8.313.649 byte** (từ 1.060.676 lên 9.374.325 byte). Gate bắt buộc giữ heap tuyệt đối ≤ 128 MiB và delta ≤ 32 MiB.

Download/CSV/Manifest cold-cache nay đọc bằng cursor. Picker giữ 200 item; CSV và Manifest giữ tối đa 10.000 record. Media cache RAM dùng LRU tối đa 3 profile hoặc 50.000 item và bảo vệ profile đang collect/download hoặc còn dirty delta.

## Chrome DOM/long-task benchmark 2026-10-02

Queue fixture 500 item ban đầu render toàn bộ mất 796 ms, vượt budget 300 ms. Window 100 row còn 320 ms theo phép đo end-to-end, vì vậy Queue áp dụng cửa sổ 50 row và nút hiển thị thêm. Lần acceptance cuối đo trong renderer đạt **3,3 ms**, không có long task ≥ 50 ms và heap **1.917.522 byte**. Item đang download luôn được giữ trong DOM kể cả nằm ngoài cửa sổ đầu.

Download Center đã áp dụng cửa sổ 50 row sau benchmark; History và Following tiếp tục giữ giới hạn dữ liệu và regression hiện hành.

## Download Center và responsive acceptance 2026-10-02

Fixture 500 Queue + 500 history cho thấy cửa sổ 100+100 row có một long task 52 ms, vượt budget. Download Center vì vậy dùng cửa sổ 50 row cho mỗi list. Lần acceptance bản phát hành đạt **310 ms** từ navigation đến row đầu, **0 ms** long task trong refresh/render và acknowledgement `START_QUEUE` khoảng **1,3 ms**. Popup Main/Picker/Queue/Stats/Following, Download Center và Options storage đều qua smoke screenshot/overflow; Options được đo riêng tại 400 và 620 px, keyboard chuyển tab bằng phím mũi tên được kiểm tra tự động.
