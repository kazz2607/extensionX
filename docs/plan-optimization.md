# Kế hoạch Tối ưu hoá Toàn diện (Performance, Security, MV3 Standards)

## 1. Phân tích hiện trạng & Phát hiện lỗi nghiêm trọng (Critical Bugs)

### 1.1 Lỗi mất dữ liệu do vòng đời Service Worker (MV3)
- **Vấn đề:** Hiện tại `mediaStore`, `tabState`, `statsStore` đang được lưu bằng biến toàn cục (`new Map()`) trong `service-worker.js`. Theo chuẩn Manifest V3, Service Worker sẽ bị trình duyệt "ngủ đông" (terminate) sau 30 giây không hoạt động hoặc 5 phút chạy liên tục. Khi SW bị tắt, **toàn bộ dữ liệu đã thu thập sẽ bị mất trắng**.
- **Giải pháp:** Phải chuyển toàn bộ state sang `chrome.storage.session` (truy xuất siêu tốc bằng RAM, giữ nguyên theo phiên làm việc trình duyệt) hoặc `chrome.storage.local`. Cần thêm quyền `unlimitedStorage` vào `manifest.json` để tránh lỗi vượt quá giới hạn 5MB khi thu thập hàng nghìn media.

### 1.2 Lỗi bảo mật nhúng Script (Security)
- **Vấn đề:** `page-interceptor.js` hiện được nhúng bằng cách tạo thẻ `<script src="...">` và nhồi vào DOM trong `content.js`. Cách này đang vi phạm các chính sách bảo mật CSP (Content Security Policy) mới của Google và dễ bị Chrome Store reject.
- **Giải pháp:** Sử dụng API chuẩn của MV3 là `chrome.scripting.executeScript` với thuộc tính `world: "MAIN"` để tiêm code trực tiếp vào ngữ cảnh trang mà không cần thao tác DOM. Cần khai báo quyền `scripting` trong manifest (đã có).

### 1.3 Hiệu năng DOM Scanner (Performance)
- **Vấn đề:** `MutationObserver` trong `dom-scanner.js` quét toàn bộ DOM mỗi khi có thẻ mới xuất hiện. Khi lướt X.com lâu, số lượng DOM Node lên đến hàng ngàn, gây tràn RAM và giật lag trang web (CPU spike).
- **Giải pháp:** Áp dụng kỹ thuật `Debounce` (chờ 300ms mới quét 1 lần) và `requestAnimationFrame` để đồng bộ với nhịp render của màn hình, giảm tải tối đa cho CPU.

## 2. Kế hoạch Tối ưu hoá App & UI

### 2.1 Tối ưu hoá Giao diện (UI/UX)
- **FAB Draggable:** Nút FAB đôi khi đè lên các nút hệ thống của X.com. Cần bổ sung tính năng "Kéo thả (Draggable)" để người dùng tự do di chuyển nút FAB lên/xuống dọc theo mép màn hình.
- **Tiến trình tải Background:** Hiện tại Chrome có giới hạn popup sẽ bị đóng nếu người dùng click ra ngoài. Nên hiển thị UI theo dõi download dưới dạng Snackbar mini trực tiếp trên trang X.com thay vì bắt người dùng mở popup liên tục.

### 2.2 Tối ưu ứng dụng (App Optimization)
- **Bảo trì kết nối Download:** Khi tải số lượng file cực lớn (>5000), Service Worker có nguy cơ bị trình duyệt kill. Sẽ cần cấu trúc lại hàng đợi tải (Download Queue) kết hợp dùng API `chrome.alarms` để "đánh thức" SW định kỳ, giữ cho tiến trình không bị gián đoạn.

## 3. Đề xuất Tính năng mới (New Features)

1. **Nút Download Mini cho từng Tweet (Individual Tweet Downloader):**
   - *Mô tả:* Thay vì thu thập cả profile, extension sẽ tự động chèn thêm một nút "Tải xuống" nhỏ xíu (icon tải) vào cạnh nút "Thích/Share" của mỗi bài viết. Cho phép click để tải ngay ảnh/video của riêng dòng trạng thái đó.
2. **Khôi phục phiên làm việc (Session Restore):**
   - *Mô tả:* Lưu lại lịch sử các profile đang quét dở dang vào storage. Nếu trình duyệt bị tắt đột ngột, lần sau mở lên có thể tiếp tục tiến trình thu thập.
3. **Bộ Lọc Thông Minh (Smart Filters):**
   - *Mô tả:* Lọc bỏ các ảnh rác (avatar kích thước nhỏ < 150px, ảnh icon). Chỉ ưu tiên tải những bức ảnh có chất lượng cao thực sự.

## 4. Lộ trình triển khai (Roadmap)

- **Giai đoạn 1 (Khẩn cấp):** Sửa lỗi mất dữ liệu Service Worker (MV3 State Persistence) và thêm quyền `unlimitedStorage`. Cập nhật cách inject Script sang chuẩn `chrome.scripting.executeScript`. Tối ưu CPU cho DOM Scanner.
- **Giai đoạn 2 (Trải nghiệm người dùng):** Làm cho nút FAB kéo thả được, đẩy thanh trạng thái tải (Progress bar) ra ngoài trang web X.com.
- **Giai đoạn 3 (Tính năng Mới):** Tích hợp nút Download Mini cho từng bài viết đơn lẻ.
