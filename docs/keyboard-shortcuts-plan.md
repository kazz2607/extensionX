# X Media Downloader — Keyboard Shortcuts (Global) (v5.5.0)

> Kế hoạch bổ sung tính năng **Phím Tắt Toàn Cục (Global Keyboard Shortcuts)** hoạt động trên **mọi trang web**.
> Tạo ngày: 2026-06-27 | Phiên bản hiện tại: **5.4.0** → Mục tiêu: **v5.5.0**

---

## 1. Tổng Quan Yêu Cầu

### Yêu cầu chính
- Thêm **section "Shortcuts"** trong trang Options cho phép cấu hình phím tắt
- Khi hover chuột vào **bất kỳ hình ảnh nào** trên **bất kỳ trang web nào** và nhấn **Ctrl+C** → **copy URL liên kết** mà hình ảnh đó trỏ tới (href của thẻ `<a>` bao quanh ảnh)
- Tính năng hoạt động **global trên mọi website**, KHÔNG giới hạn chỉ X.com
- Đây là tính năng **mở rộng thêm** cho extension

### Làm rõ: "Copy địa chỉ liên kết của tấm hình"

Trên một trang web bất kỳ, ảnh thường nằm trong thẻ link:
```html
<a href="https://example.com/full-article">
  <img src="https://example.com/thumbnail.jpg">
</a>
```

- ✅ **Copy liên kết:** `https://example.com/full-article` (href của `<a>` bao quanh ảnh)
- Nếu ảnh **không nằm trong link** → copy URL nguồn của ảnh (`src`) làm fallback
- Trên X.com cụ thể → copy link tweet: `https://x.com/user/status/123/photo/1`

---

## 2. Thay Đổi Kiến Trúc Quan Trọng

### 2.1 Vấn đề: Content Script hiện chỉ chạy trên X.com

Hiện tại `manifest.json` chỉ inject content script trên `x.com` và `twitter.com`:
```json
"content_scripts": [{
  "matches": ["https://x.com/*", "https://twitter.com/*"],
  "js": ["content/content.ts"]
}]
```

### 2.2 Giải pháp: Thêm content script riêng cho shortcuts

Tạo **content script mới, độc lập, nhẹ** chỉ dành cho shortcuts, inject trên **mọi trang web**:

```json
"content_scripts": [
  {
    "matches": ["https://x.com/*", "https://twitter.com/*"],
    "js": ["content/content.ts"],
    "run_at": "document_start"
  },
  {
    "matches": ["<all_urls>"],
    "js": ["content/shortcuts.ts"],
    "run_at": "document_end",
    "all_frames": false
  }
]
```

**Tại sao tách riêng?**
- `content.ts` chứa logic nặng (interceptor, DOM scanner, FAB...) — chỉ cần trên X.com
- `shortcuts.ts` rất nhẹ (~3-5KB) — chỉ lắng nghe keyboard + mouse hover
- Tránh ảnh hưởng hiệu năng các trang web khác
- User có thể tắt shortcuts qua toggle mà không ảnh hưởng tính năng X.com

### 2.3 Permissions cần thêm

```json
"host_permissions": [
  // ... existing X.com permissions ...
  "<all_urls>"   // ← MỚI: cần để clipboard API hoạt động trên mọi trang
]
```

> ⚠️ **Lưu ý:** Thêm `<all_urls>` vào `host_permissions` sẽ yêu cầu user chấp nhận quyền mới khi update extension. Nếu muốn tránh điều này, có thể dùng `optional_permissions` + `chrome.permissions.request()` để hỏi user khi bật shortcuts lần đầu.

### 2.4 Phương án thay thế: Optional Permissions (khuyến nghị)

Để không yêu cầu quyền `<all_urls>` từ đầu (tránh user sợ):

```json
"optional_permissions": ["<all_urls>"]
```

Khi user bật shortcuts trong Settings → `chrome.permissions.request({ origins: ["<all_urls>"] })` → Chrome hiện popup xin quyền → nếu đồng ý → dùng `chrome.scripting.registerContentScripts()` để inject `shortcuts.ts` lên mọi trang.

---

## 3. Thiết Kế Tính Năng Phím Tắt

### 3.1 Phím Tắt Đề Xuất

| # | Phím Tắt | Hành Động | Áp dụng | Ưu tiên |
|---|---|---|---|---|
| **S1** | `Ctrl+C` (hover ảnh) | **Copy liên kết** mà ảnh trỏ tới (href của `<a>` bao quanh), fallback = copy `src` ảnh | **Mọi trang web** | 🔴 Cao |
| S2 | `Ctrl+S` (hover ảnh) | **Tải ngay** ảnh đang hover — save trực tiếp | **Mọi trang web** | 🟠 TB |
| S3 | `Ctrl+Shift+C` (hover ảnh) | **Copy URL file ảnh** (`src`) — URL trực tiếp của file ảnh | **Mọi trang web** | 🟠 TB |
| S4 | `Ctrl+Shift+D` (hover ảnh) | **Tải tất cả ảnh** trên trang hiện tại (hoặc trong viewport) | **Mọi trang web** | 🟡 Thấp |
| S5 | `Ctrl+Shift+O` (hover ảnh) | **Mở ảnh gốc** trong tab mới — mở `src` ảnh ở tab mới | **Mọi trang web** | 🟡 Thấp |
| S6 | `Ctrl+Shift+G` (hover ảnh) | **Reverse Image Search** — Mở Google Lens với ảnh | **Mọi trang web** | 🟡 Thấp |

### 3.2 Chi Tiết S1 — Copy Liên Kết Ảnh (Yêu cầu chính)

**Khi user hover chuột lên ảnh trên bất kỳ trang web nào và nhấn `Ctrl+C`:**

```
User hover chuột lên ảnh bất kỳ
        │
        ▼
Nhấn Ctrl+C
        │
        ▼
[shortcuts.ts] keydown listener
        │
        ├── Kiểm tra: có text đang selected?
        │   └── CÓ → BỎ QUA, để browser copy text bình thường
        │
        ├── Kiểm tra: element hover có phải <img> không?
        │   └── KHÔNG → BỎ QUA, Ctrl+C bình thường
        │
        └── ĐÚNG là <img>:
              │
              ├── Tìm <a> cha gần nhất: img.closest('a[href]')
              │   ├── TÌM THẤY → copyUrl = a.href (liên kết mà ảnh trỏ tới)
              │   └── KHÔNG CÓ <a> → copyUrl = img.src (fallback: URL ảnh)
              │
              ├── 🔹 Trường hợp đặc biệt X.com:
              │   └── Nếu hostname là x.com/twitter.com
              │       → extract tweet link: x.com/user/status/ID/photo/N
              │
              ├── navigator.clipboard.writeText(copyUrl)
              ├── preventDefault() — chặn Ctrl+C mặc định
              └── Hiện toast: "✓ Copied: https://..."
```

**Ví dụ trên các website khác nhau:**

| Website | HTML | Kết quả Ctrl+C |
|---|---|---|
| X.com | `<a href="/user/status/123"><img src="pbs.twimg..."></a>` | `https://x.com/user/status/123/photo/1` |
| Instagram | `<a href="/p/ABC123/"><img src="..."></a>` | `https://instagram.com/p/ABC123/` |
| Pinterest | `<a href="/pin/12345/"><img src="..."></a>` | `https://pinterest.com/pin/12345/` |
| Blog/News | `<a href="/article/full"><img src="thumb.jpg"></a>` | `https://blog.com/article/full` |
| Ảnh không có link | `<img src="photo.jpg">` (không có `<a>`) | `https://site.com/photo.jpg` (fallback) |

### 3.3 Xử Lý Xung Đột Phím Tắt

| Tình huống | Hành vi |
|---|---|
| Hover ảnh + Ctrl+C + **không** select text | → Copy liên kết ảnh ✅ |
| **Có text đang select** + Ctrl+C | → Copy text bình thường (KHÔNG override) |
| **Không hover ảnh** + Ctrl+C | → Ctrl+C bình thường |
| Hover ảnh + Ctrl+S | → Tải ảnh (override "Save page") |
| **Đang nhập liệu** (input/textarea focus) + Ctrl+C | → KHÔNG override |
| Trang web có custom Ctrl+C handler | → Extension chạy trước (priority), website handler vẫn chạy nếu không preventDefault |

---

## 4. Thiết Kế Kỹ Thuật

### 4.1 Types — `src/types.ts`

```typescript
export interface ShortcutConfig {
  modifiers: string;  // 'ctrl', 'ctrl+shift', 'alt+shift'
  key: string;        // 'c', 's', 'd', ...
}

export interface ShortcutsOptions {
  enabled: boolean;                        // Master toggle
  copyLink: ShortcutConfig | false;        // S1: Copy liên kết ảnh
  downloadMedia: ShortcutConfig | false;   // S2: Tải ảnh hover
  copyImageUrl: ShortcutConfig | false;    // S3: Copy URL file ảnh
  downloadAll: ShortcutConfig | false;     // S4: Tải tất cả ảnh trang
  openOriginal: ShortcutConfig | false;    // S5: Mở ảnh tab mới
  reverseSearch: ShortcutConfig | false;   // S6: Google Lens
  showToast: boolean;                      // Hiện toast notification
}
```

### 4.2 Default Options

```typescript
const DEFAULT_SHORTCUTS: ShortcutsOptions = {
  enabled: false,     // ← Mặc định TẮT (user phải bật chủ động)
  copyLink:      { modifiers: 'ctrl', key: 'c' },
  downloadMedia: { modifiers: 'ctrl', key: 's' },
  copyImageUrl:  { modifiers: 'ctrl+shift', key: 'c' },
  downloadAll:   { modifiers: 'ctrl+shift', key: 'd' },
  openOriginal:  { modifiers: 'ctrl+shift', key: 'o' },
  reverseSearch: { modifiers: 'ctrl+shift', key: 'g' },
  showToast: true,
};
```

> ⚠️ Mặc định **TẮT** vì tính năng override Ctrl+C cần user đồng ý chủ động.

### 4.3 Content Script: `shortcuts.ts` (Chạy trên MỌI trang)

**Đặc điểm:**
- **Nhẹ:** ~3-5KB, không import thư viện nặng
- **Độc lập:** Không phụ thuộc vào `content.ts` hay các script X.com
- **Self-contained:** Tự tạo toast UI (CSS inline, không cần `snackbar.ts`)
- **Lazy load:** Đọc config 1 lần từ `chrome.storage.sync`, cache trong biến
- **Isolated world:** Chạy trong extension context (có quyền `chrome.*` API)

```typescript
// Pseudo-code logic chính
(() => {
  let mouseX = 0;
  let mouseY = 0;
  let config: ShortcutsOptions | null = null;

  // 1. Load config
  chrome.storage.sync.get('options', (result) => {
    config = result.options?.shortcuts || DEFAULT_SHORTCUTS;
    if (!config.enabled) return; // Tắt → không làm gì
    init();
  });

  function init() {
    // 2. Track tọa độ chuột liên tục
    document.addEventListener('mousemove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    }, { capture: true, passive: true });

    // 3. Listen keyboard
    document.addEventListener('keydown', handleKeydown, true); // capture phase
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!config?.enabled) return;

    // Tìm ảnh ngay dưới con trỏ chuột (xuyên qua overlay)
    const elements = document.elementsFromPoint(mouseX, mouseY);
    const hoveredImg = elements.find(el => el.tagName === 'IMG') as HTMLImageElement;
    if (!hoveredImg) return;

    // Skip nếu đang trong input/textarea/contenteditable
    const active = document.activeElement;
    if (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA'
        || (active as HTMLElement)?.isContentEditable) return;

    // Skip nếu có text đang selected
    if (window.getSelection()?.toString()) return;

    // Match shortcut
    if (matchShortcut(e, config.copyLink)) {
      e.preventDefault();
      copyImageLink(hoveredImg);
    }
    // ... other shortcuts
  }

  function copyImageLink(img: HTMLImageElement) {
    let url: string;

    // X.com special handling
    if (isXcom()) {
      url = extractTweetLink(img) || getParentLinkHref(img) || img.src;
    } else {
      // Generic: tìm <a> cha → lấy href
      url = getParentLinkHref(img) || img.src;
    }

    navigator.clipboard.writeText(url).then(() => {
      showToast(`✓ Copied: ${truncate(url, 60)}`);
    });
  }

  function getParentLinkHref(img: HTMLElement): string | null {
    const a = img.closest('a[href]') as HTMLAnchorElement;
    return a ? a.href : null;
  }
})();
```

### 4.4 Toast UI (Self-contained trong shortcuts.ts)

Vì `shortcuts.ts` chạy trên mọi trang, cần tự tạo toast notification thay vì dùng `snackbar.ts` (chỉ có trên X.com):

```typescript
function showToast(message: string) {
  // Tạo element nếu chưa có
  let toast = document.getElementById('__xmd_shortcut_toast__');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = '__xmd_shortcut_toast__';
    toast.style.cssText = `
      position: fixed; bottom: 24px; left: 50%;
      transform: translateX(-50%) translateY(60px);
      background: rgba(15,15,15,0.92); color: #00ba7c;
      padding: 10px 20px; border-radius: 999px;
      font: 13px/1 'Inter', sans-serif; font-weight: 500;
      border: 1px solid rgba(0,186,124,0.3);
      backdrop-filter: blur(12px);
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      z-index: 2147483647; /* max z-index */
      transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s;
      opacity: 0; pointer-events: none;
      max-width: 500px; white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis;
    `;
    document.body.appendChild(toast);
  }
  // Show
  toast.textContent = message;
  toast.style.opacity = '1';
  toast.style.transform = 'translateX(-50%) translateY(0)';
  // Auto-hide
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(60px)';
  }, 2000);
}
```

### 4.5 Options Page — Section Shortcuts

Thêm section mới trong `options.html`:

```
┌─────────────────────────────────────────────┐
│ ⌨️ KEYBOARD SHORTCUTS (GLOBAL)              │
├─────────────────────────────────────────────┤
│                                             │
│  Bật phím tắt trên mọi trang web  [OFF]    │
│  Hoạt động trên mọi website, không chỉ     │
│  X.com. Override Ctrl+C khi hover ảnh.     │
│                                             │
│ ─────────────────────────────────────────── │
│                                             │
│  🔗 Copy liên kết ảnh        Ctrl+C  [ON]  │
│  Hover ảnh → copy URL link mà ảnh trỏ tới │
│                                             │
│  ⬇️ Tải ảnh đang hover       Ctrl+S  [ON]  │
│  Hover ảnh → tải trực tiếp về máy          │
│                                             │
│  📋 Copy URL ảnh gốc    Ctrl+Shift+C [ON]  │
│  Copy URL trực tiếp của file ảnh           │
│                                             │
│  🌐 Mở ảnh tab mới      Ctrl+Shift+O [ON]  │
│  Mở ảnh gốc trong tab trình duyệt mới     │
│                                             │
│  🔍 Google Lens          Ctrl+Shift+G [ON]  │
│  Tìm kiếm ngược hình ảnh                  │
│                                             │
│ ─────────────────────────────────────────── │
│                                             │
│  💡 Chỉ hoạt động khi hover chuột vào ảnh. │
│     Ctrl+C copy text bình thường nếu đang  │
│     select text hoặc không hover ảnh.      │
│                                             │
│  🔔 Hiện thông báo toast         [══ON══]  │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 5. Files Cần Tạo / Sửa

### Files mới

| File | Mô tả |
|---|---|
| `src/content/shortcuts.ts` | Content script **global** — xử lý phím tắt trên mọi trang web. Nhẹ, độc lập, self-contained. |

### Files cần sửa

| File | Thay đổi |
|---|---|
| `src/manifest.json` | Thêm content_scripts entry mới cho `shortcuts.ts` với `"matches": ["<all_urls>"]`. Thêm `"optional_permissions": ["<all_urls>"]` hoặc mở rộng `host_permissions`. |
| `src/types.ts` | Thêm `ShortcutConfig`, `ShortcutsOptions` interfaces. Thêm `shortcuts?` vào `Options`. |
| `src/options/options.html` | Thêm section "⌨️ Keyboard Shortcuts (Global)" với master toggle + toggles cho từng shortcut. |
| `src/options/options.ts` | Thêm `DEFAULT_SHORTCUTS` vào `DEFAULT_OPTIONS`. Load/save shortcuts config. Logic bật/tắt xin quyền `<all_urls>`. |
| `src/lib/i18n.ts` | Thêm cụm từ i18n cho shortcuts section (EN/VI). |

### Files KHÔNG cần sửa

| File | Lý do |
|---|---|
| `src/content/content.ts` | `shortcuts.ts` là script **độc lập**, không cần inject từ `content.ts` |
| `src/content/snackbar.ts` | Toast được tạo trực tiếp trong `shortcuts.ts` (self-contained) |
| `src/content/fab.ts` | Không liên quan |
| `src/background/*` | S2 (download) sẽ gửi message đến SW, nhưng phần còn lại không cần thay đổi SW |

---

## 6. Kế Hoạch Triển Khai

### Phase 1: Core S1 + Settings UI (Ưu tiên cao nhất)

- [ ] **Bước 1:** `types.ts` — thêm `ShortcutConfig`, `ShortcutsOptions`
- [ ] **Bước 2:** `manifest.json` — thêm content_scripts entry `<all_urls>` + optional_permissions
- [ ] **Bước 3:** Tạo `content/shortcuts.ts` — **S1: Copy liên kết ảnh trên mọi trang** + toast tự tạo
- [ ] **Bước 4:** `options.html` — section UI "Keyboard Shortcuts (Global)"
- [ ] **Bước 5:** `options.ts` — load/save shortcuts config, DEFAULT_SHORTCUTS

### Phase 2: Các Shortcuts Bổ Sung

- [ ] **Bước 6:** S2 — Tải ảnh hover (Ctrl+S) — gửi `chrome.runtime.sendMessage` → SW download
- [ ] **Bước 7:** S3 — Copy URL file ảnh (Ctrl+Shift+C)
- [ ] **Bước 8:** S5 — Mở ảnh tab mới (Ctrl+Shift+O)
- [ ] **Bước 9:** S6 — Google Lens reverse search (Ctrl+Shift+G)

### Phase 3: Polish

- [ ] **Bước 10:** i18n strings (EN/VI)
- [ ] **Bước 11:** X.com-specific enhancements (extract tweet link, photo index)
- [ ] **Bước 12:** Test edge cases trên nhiều website (Google, Instagram, Reddit, blog...)
- [ ] **Bước 13:** Build & kiểm tra toàn diện

---

## 7. Edge Cases

| Case | Xử lý |
|---|---|
| Đang select text + Ctrl+C | **KHÔNG override** — `window.getSelection().toString()` check |
| Đang focus input/textarea | **KHÔNG override** — check `activeElement` |
| Ảnh không nằm trong `<a>` | Fallback → copy `img.src` (URL file ảnh) |
| Ảnh trong `<a>` nhưng href = `"#"` hoặc `javascript:` | Bỏ qua href không hợp lệ → fallback `img.src` |
| Ảnh CSS background (không phải `<img>`) | Hiện tại không hỗ trợ — chỉ `<img>` tag |
| Ảnh trong iframe | Không hỗ trợ (`all_frames: false`) |
| Ảnh lazy-load (src = placeholder) | Ưu tiên `data-src` hoặc `srcset` nếu có |
| Trang X.com | X.com-specific: extract tweet permalink thay vì `<a>` href thông thường |
| Shortcuts bị tắt trong Settings | `config.enabled === false` → script load nhưng không làm gì |
| Website có CSP chặn inline style | Toast dùng inline style trực tiếp, không bị CSP chặn vì chạy trong extension context |

---

## 8. Tổng Kết

| ID | Tính năng | Phím tắt | Scope | Mô tả |
|---|---|---|---|---|
| **S1** | **Copy liên kết ảnh** | `Ctrl+C` hover ảnh | 🌐 Mọi trang | Copy URL mà ảnh link tới (`<a>` href) |
| S2 | Tải ảnh hover | `Ctrl+S` hover ảnh | 🌐 Mọi trang | Download ảnh trực tiếp |
| S3 | Copy URL file ảnh | `Ctrl+Shift+C` hover ảnh | 🌐 Mọi trang | Copy src URL file ảnh |
| S5 | Mở ảnh tab mới | `Ctrl+Shift+O` hover ảnh | 🌐 Mọi trang | Mở ảnh gốc trong tab mới |
| S6 | Reverse search | `Ctrl+Shift+G` hover ảnh | 🌐 Mọi trang | Mở Google Lens |
| UI | Settings section | — | Extension | Toggle on/off từng shortcut |

**Ước tính thời gian:**
- Phase 1 (S1 + Settings): ~2-3 giờ
- Phase 2 (S2-S6): ~1-2 giờ
- Phase 3 (Polish): ~1 giờ
- **Tổng: ~4-6 giờ**

---

## 9. Lộ Trình Phiên Bản

```
[ĐÃ XONG]
v5.4.0  ── Queue & Bookmark improvements                            ✅ DONE

[TIẾP THEO]
v5.5.0  ── Global Keyboard Shortcuts (mọi trang web)                🔜 NEXT
         ├── S1: Copy liên kết ảnh (Ctrl+C hover)
         ├── S2: Tải ảnh hover (Ctrl+S)
         ├── S3-S6: Shortcuts nâng cao
         └── Settings UI section mới

[TƯƠNG LAI]
v5.6.0  ── Context Menu (right-click), Hover Preview Overlay
v6.0.0  ── Full-page Dashboard, Masonry Media Gallery
v7.0.0  ── Cloud Integration, Auto-fetch
```

---

*Tài liệu cập nhật: 2026-06-27*
