# Hướng Dẫn Cài Đặt — X Media Downloader

> Extension Chrome cho phép tải toàn bộ ảnh, video và GIF từ profile bất kỳ trên X.com (Twitter) về máy tính, tự động lưu vào thư mục `{Downloads}/{username}/` (phân loại theo `images/`, `videos/`, `gifs/`).

---

## 📋 Yêu Cầu

| Yêu cầu | Chi tiết |
|---|---|
| Trình duyệt | Google Chrome phiên bản **88 trở lên** |
| Hệ điều hành | Windows / macOS / Linux |
| Tài khoản X.com | Cần **đăng nhập** để tải media từ profile private |
| Dung lượng ống đĩa | Tùy theo số lượng media tải về |

---

## 🚀 Cài Đặt Extension

### Bước 1 — Tải mã nguồn

Đảm bảo bạn đã có thư mục `extensionX` với cấu trúc đầy đủ:

```
extensionX/
├── manifest.json
├── background/
│   ├── service-worker.js
│   └── tweet-api.js
├── content/
│   ├── content.js
│   ├── page-interceptor.js
│   ├── dom-scanner.js
│   └── fab.js
├── offscreen/
│   ├── offscreen.html
│   └── offscreen.js
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── options/
│   ├── options.html
│   └── options.js
├── lib/
│   ├── hls-fetcher.js
│   ├── i18n.js
│   └── utils.js
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### Bước 2 — Mở trang Quản lý Extension

1. Mở **Google Chrome**
2. Trên thanh địa chỉ, gõ:
   ```
   chrome://extensions
   ```
   và nhấn **Enter**

   ![Trang Extensions](chrome://extensions)

### Bước 3 — Bật Developer Mode

Ở góc **trên bên phải** của trang, bật công tắc **"Developer mode"**:

```
┌─────────────────────────────────────────┐
│  Extensions              Developer mode ●│
└─────────────────────────────────────────┘
```

> ⚠️ Nếu không thấy nút này, hãy đảm bảo bạn đang dùng Chrome (không phải Edge hay Brave với giao diện khác).

### Bước 4 — Load Extension

1. Click nút **"Load unpacked"** xuất hiện ở góc trên trái

   ```
   [ Load unpacked ]  [ Pack extension ]  [ Update ]
   ```

2. Cửa sổ File Explorer mở ra → **chọn thư mục** `extensionX`
   - Đường dẫn mẫu: `D:\Xampp\htdocs\extensionX`
   - Chọn **chính xác thư mục đó** (không chọn file bên trong)

3. Click **"Select Folder"**

### Bước 5 — Xác nhận đã cài thành công

Sau khi load, extension sẽ xuất hiện trong danh sách:

```
┌──────────────────────────────────────────┐
│  ⬇ X Media Downloader          v3.5.3   │
│  Tải toàn bộ ảnh & video từ X.com...    │
│                                          │
│  [Details]  [Remove]           ● Enabled │
└──────────────────────────────────────────┘
```

Icon extension cũng xuất hiện trên thanh toolbar Chrome (góc phải trình duyệt).

> 💡 Nếu không thấy icon trên toolbar, click vào biểu tượng **🧩 (Extensions)** → ghim extension lại.

---

## 🎯 Hướng Dẫn Sử Dụng

### Cách 1 — Dùng Popup (Khuyên Dùng)

#### 1. Mở profile cần tải

Truy cập X.com và vào trang media của người dùng:
```
https://x.com/[username]/media
```

Ví dụ: `https://x.com/NASA/media`

#### 2. Mở Popup Extension

Click icon **⬇** trên toolbar Chrome. Popup sẽ hiển thị:

```
┌─────────────────────────────────────┐
│ ⬇ X Media Downloader      v3.5.3  ⭤☉⚡│
├─────────────────────────────────────┤
│ 👤 @NASA                        [47]│
│    Profile đang được xem            │
├─────────────────────────────────────┤
│ [ Tất cả 47 ][ 🖼 Ảnh 30 ][ 🎬 Video 12 ][ GIF 5 ] │
├─────────────────────────────────────┤
│ ● Sẵn sàng — @NASA                  │
├─────────────────────────────────────┤
│ [ 🔍 Bắt đầu Thu Thập              ]│
│ [ ↓ Download (47) ] [ CSV ] [ 🗑 ]  │
└─────────────────────────────────────┘
```

#### 3. Thu thập media

Click **"Bắt đầu Thu Thập"** — extension sẽ:
- Tự động cuộn trang xuống để load thêm tweet
- Bắt media từ các API request của X.com
- Hiển thị số lượng media tìm được realtime

Khi muốn dừng → click **"Dừng Thu Thập"**

> ⏱ Thời gian thu thập phụ thuộc vào số lượng media trong profile. Profile nhiều ảnh (~1000+) có thể mất 5–15 phút.

#### 4. Tải về

- Click **"Download"** để tải toàn bộ file về máy
- Hoặc chọn tab **Ảnh / Video / GIF** rồi click Download để lọc theo loại
- Click **"CSV"** để xuất danh sách URL ra file `.csv`

Các file sẽ được lưu vào thư mục Downloads theo cấu trúc:
```
Downloads/
└── NASA/              ← tên username
    ├── images/        ← ảnh JPG chất lượng gốc
    ├── videos/        ← video MP4 bitrate cao nhất
    └── gifs/          ← GIF (dạng MP4)
```

> 💡 Bạn có thể thêm thư mục cơ sở trong **Cài đặt** (ví dụ `X_Media`)
> → File sẽ lưu vào `Downloads/X_Media/NASA/images/...`

---

### Cách 2 — Dùng FAB Widget (Nhanh hơn)

Khi vào trang X.com, một **nút tròn màu xanh** xuất hiện ở góc dưới bên phải màn hình:

```
                        ┌─────────────────────────┐
                        │ Media thu thập      127 │
                        │ Scroll              043 │
                        │ ─────────────────────── │
                        │ [▶ Thu Thập] [↓ Download]│
                        └─────────────────────────┘
                                          ⬇ ← Click để mở/đóng
```

- **Click vào nút** để mở/đóng panel
- **"▶ Thu Thập"** → bắt đầu auto-scroll
- **"↓ Download"** → download ngay khi thu thập xong

---

## ⚙️ Cài Đặt (Options)

Click biểu tượng **⚙** trên popup để mở trang cài đặt:

| Cài đặt | Mặc định | Mô tả |
|---|---|---|
| **Thư mục cơ sở** | (rỗng) | Tên thư mục con trong Downloads. Ví dụ: `X_Media` → lưu vào `Downloads/X_Media/username/` |
| **Lưu chung 1 thư mục** | Tắt | Nếu bật, không chia thư mục con (images, videos, gifs) |
| Loại media | Ảnh + Video + GIF | Chọn loại cần thu thập |
| Chất lượng ảnh | Gốc (Orig) | Kích thước ảnh tải về |
| Tự động scroll | Tắt | Tự bắt đầu khi vào trang /media |
| Tốc độ scroll | 2 giây | Delay giữa mỗi lần scroll |
| Số scroll tối đa | 200 | 0 = không giới hạn |
| Số file tải đồng thời | 3 | Tăng để tải nhanh hơn (1–5) |
| Hỏi vị trí lưu | Tắt | Chrome hỏi nơi lưu từng file |
| Số media tối đa | 0 (không giới hạn) | Giới hạn số media mỗi profile |
| **🌙 Dark / ☀️ Light Mode** | Dark | Chuyển giao diện tối/sáng (nút ☀️/🌙 trên header) |
| **📝 Tên file Username_TweetID** | Tắt | Lưu tên file theo `username_tweetId_serial.ext` |

---

## 🔄 Cập Nhật Extension

Khi có phiên bản mới:

1. Sao chép files mới vào thư mục `extensionX` (ghi đè)
2. Vào `chrome://extensions`
3. Click **🔄 (Reload)** trên card của extension

---

## ❓ Xử Lý Sự Cố

### Extension không tìm thấy media

**Nguyên nhân:** X.com thay đổi API endpoint

**Giải pháp:**
1. Thử tải trang lại (`F5`)
2. Scroll xuống thủ công một vài lần trước khi dùng Thu Thập
3. Extension sẽ tự động dùng **DOM fallback** để quét thêm

---

### Số badge không tăng khi scroll

**Nguyên nhân:** Service worker có thể bị sleep (Manifest V3 limitation)

**Giải pháp:**
1. Click vào popup để "wake up" service worker
2. Thử click **Dừng → Bắt đầu** lại
3. Từ v3.5.1: Extension đã có keep-alive tự động — lỗi này ít xảy ra hơn trước

### Download dừng giữa chừng

**Nguyên nhân (trước v3.5.1):** Service Worker bị Chrome terminate sau ~5 phút tải.

**Giải pháp:** Cập nhật lên v3.5.1 — đã có keep-alive tự động. Nếu vẫn gặp:
1. Đảm bảo Chrome đang ở foreground (không minimize)
2. Kiểm tra kết nối mạng ổn định

---

### File ZIP tải về bị lỗi / trống

**Nguyên nhân:** Media URL đã hết hạn hoặc bị chặn

**Giải pháp:**
1. Thu thập lại (media URL mới sẽ được tạo từ session hiện tại)
2. Đảm bảo bạn đang **đăng nhập X.com**
3. Kiểm tra trong console của Service Worker để xem chi tiết lỗi

---

### Không thấy FAB widget trên X.com

**Giải pháp:**
1. Tải lại trang (`F5`)
2. Kiểm tra extension đang **Enabled** trong `chrome://extensions`
3. Thử reload extension (nút 🔄)

---

### File tải về không vào đúng thư mục username (IDM conflict)

**Nguyên nhân:** **IDM Integration Module** (của Internet Download Manager) đang bật. IDM hook vào Chrome Downloads API và tự quản lý việc lưu file, bỏ qua hoàn toàn thư mục `{username}/` mà extension chỉ định.

**Giải pháp:**
1. Mở IDM → menu **Downloads → Options → File Types**
2. Tắt tuỳ chọn bắt file từ domain `pbs.twimg.com` và `video.twimg.com`
3. Hoặc vào `chrome://extensions` → tắt **IDM Integration Module** khi dùng X Media Downloader
4. Từ v3.5.3: Extension sẽ hiện cảnh báo màu cam 🟠 trong popup khi phát hiện IDM đang can thiệp

---

### Profile private không tải được

**Nguyên nhân:** Cần quyền xem profile

**Giải pháp:** Đăng nhập bằng tài khoản có quyền follow profile đó

---

## 🔒 Bảo Mật & Quyền Riêng Tư

- ✅ **100% xử lý cục bộ** — không gửi dữ liệu ra server ngoài
- ✅ **Không lưu cookie hoặc password**
- ✅ Chỉ yêu cầu các quyền tối thiểu cần thiết
- ✅ Mã nguồn mở, có thể kiểm tra toàn bộ code

### Giải thích các quyền extension yêu cầu:

| Quyền | Lý do cần |
|---|---|
| `downloads` | Tải file về máy qua `chrome.downloads` |
| `storage` | Lưu cài đặt và lịch sử |
| `tabs` | Đọc URL tab hiện tại để biết username |
| `scripting` | Inject scripts vào trang X.com |
| `offscreen` | Ghép HLS segments thành video |
| `alarms` | Keep-alive Service Worker khi đang tải nhiều file |
| `host_permissions: x.com/*` | Chạy trên trang X.com |
| `host_permissions: pbs.twimg.com/*` | Tải ảnh từ server Twitter |
| `host_permissions: video.twimg.com/*` | Tải video từ server Twitter |

---

## 📁 Cấu Trúc File Tải Về

```
Downloads/
└── [username]/                         ← tự động tạo theo tên profile
    ├── images/
    │   ├── 1234567890_abc12.jpg         ← {tweetId}_{random}.jpg
    │   └── ...
    ├── videos/
    │   ├── 1234567891_def34.mp4
    │   └── ...
    └── gifs/
        └── 1234567892_ghi56.mp4        ← GIF lưu dạng MP4
```

Nếu bật tuỳ chọn **Tên file theo Username_TweetID_Serial**, file sẽ được đặt tên kèm username:
```
Downloads/
└── NASA/
    ├── images/
    │   └── NASA_1234567890_abc12.jpg    ← {username}_{tweetId}_{random}.jpg
    ├── videos/
    │   └── NASA_1234567891_def34.mp4
    └── gifs/
        └── NASA_1234567892_ghi56.mp4
```

Nếu bật tuỳ chọn **Lưu chung vào 1 thư mục theo Username** trong Settings, các file sẽ không bị chia vào thư mục con:
```
Downloads/
└── [username]/
    ├── 1234567890_abc12.jpg
    ├── 1234567891_def34.mp4
    └── 1234567892_ghi56.mp4
```

Nếu đã đặt **Thư mục cơ sở** là `X_Media` trong Settings:
```
Downloads/
└── X_Media/
    └── [username]/
        ├── images/
        ├── videos/
        └── gifs/
```

> **Lưu ý**: Các file được tải **lần lượt** (không nén ZIP), bạn có thể xem tiến độ từng file ngay trong trình duyệt Chrome.

---

## 📞 Hỗ Trợ

Nếu gặp vấn đề, hãy kiểm tra:

1. **Console log**: `chrome://extensions` → click **"Service worker"** → xem tab Console
2. **Inspect popup**: Chuột phải vào popup → **Inspect** → xem Console
3. Đảm bảo Chrome đã được cập nhật lên phiên bản mới nhất

---

*Phiên bản: 3.5.3 | Cập nhật: 2026-06-02*
