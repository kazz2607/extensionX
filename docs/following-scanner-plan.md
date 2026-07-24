# 🧹 Following Scanner & Inactive Unfollow — Implementation Plan

> **Version**: v6.0.0 (planned)  
> **Created**: 2026-07-24  
> **Updated**: 2026-07-24 (thêm Feature 0 — Auto-Scroll Following Page)  
> **Status**: Pending approval

## Tổng quan

Thêm tính năng **Following Scanner** vào extensionX — cho phép người dùng:
1. **[Feature 0]** Auto-scroll trang `/following` xuống cuối để lộ các tài khoản **following cũ nhất**
2. **[Feature 1]** Quét toàn bộ danh sách Following qua API để phân tích mức độ hoạt động
3. **[Feature 1]** Unfollow hàng loạt các tài khoản không còn hoạt động (với preview và xác nhận trước)

---

## ⚠️ Lưu ý quan trọng

- Tính năng **unfollow** yêu cầu session của người dùng đang đăng nhập trên X.com — extension sẽ tận dụng `ct0` (CSRF token) và `auth_token` cookie (HttpOnly) giống cách fetch video hiện tại. **Không cần API key bên ngoài.**
- X.com có rate limit nghiêm ngặt cho unfollow API (~400 unfollow/ngày theo tài khoản). Extension sẽ implement **throttle tự động** và **hiển thị warning** nếu người dùng cố unfollow quá nhiều.
- Việc unfollow là **không thể hoàn tác tự động** (phải follow lại từng người). Extension sẽ yêu cầu xác nhận rõ ràng trước khi thực hiện.

---

## Open Questions

1. **Ngưỡng "không hoạt động"** mặc định là gì?
   - Option A: Không tweet trong **6 tháng** (đề xuất)
   - Option B: Không tweet trong **1 năm**
   - Option C: Cho phép user tự điều chỉnh ngưỡng

2. **Tab mới hay tích hợp vào popup hiện tại?**
   - Option A: Tab mới **"Cleanup"** trong bottom nav (đề xuất — giữ popup gọn gàng)
   - Option B: Tích hợp vào panel Stats

---

## Proposed Changes

### Architecture Overview

```
[Feature 0] Auto-Scroll /following page
        │ Collect usernames from DOM (no API needed)
        ▼
[Feature 1] Following List API ──→ Background SW ──→ User Activity Analysis
                                               ──→ Popup (Cleanup Tab)
                                               ──→ Unfollow API (with throttle)
```

---

## Feature 0 — Auto-Scroll Following Page (Ưu tiên cao)

> **Mục tiêu**: Scroll tự động trang `x.com/<username>/following` xuống tận cuối để lộ ra các tài khoản **following cũ nhất** (X.com load theo thứ tự mới → cũ từ trên xuống dưới).  
> **Ví dụ target**: `https://x.com/henryphan69/following`

### Vấn đề hiện tại

Hàm `SCROLL_DOWN` trong `content.ts` hiện có guard kiểm tra `isMediaPage()` — sẽ trả về `{ error: 'not_media_page' }` nếu không phải trang `/media`, `/photos`, `/videos`, `/likes`, `/bookmarks`. Trang `/following` bị block bởi guard này.

### Giải pháp

**Tái dùng toàn bộ scroll engine hiện có** — chỉ cần mở rộng minimal:

#### [MODIFY] `src/content/content.ts`

1. Thêm hàm `isFollowingPage()`:
   ```typescript
   function isFollowingPage(url = location.href) {
     return /\/[A-Za-z0-9_]+\/following(\/|$)/.test(new URL(url).pathname);
   }
   ```

2. Mở rộng handler `SCROLL_DOWN` — chấp nhận `/following` khi có flag `allowFollowingPage`:
   ```typescript
   if (message.type === 'SCROLL_DOWN') {
     const isAllowed = isMediaPage()
       || (message.allowFollowingPage && isFollowingPage());
     if (!isAllowed) {
       sendResponse({ error: 'not_media_page' });
       return false;
     }
     // ... scroll logic giữ nguyên không đổi
   }
   ```

3. Thêm hàm `extractFollowingUsers()` — quét DOM trang `/following` để lấy username/displayName:
   ```typescript
   function extractFollowingUsers() {
     const cells = document.querySelectorAll('[data-testid="UserCell"]');
     return Array.from(cells).map(cell => ({
       username: cell.querySelector('a[role="link"]')
                   ?.getAttribute('href')?.replace('/', '') || '',
       displayName: cell.querySelector('[data-testid="User-Name"] span')
                       ?.textContent?.trim() || '',
     })).filter(u => u.username);
   }
   ```

4. Thêm handler `SCROLL_FOLLOWING_PAGE`:
   ```typescript
   if (message.type === 'SCROLL_FOLLOWING_PAGE') {
     // Scroll + extract DOM users
     window.scrollTo(0, document.documentElement.scrollHeight);
     setTimeout(() => {
       const users = extractFollowingUsers();
       sendResponse({
         done: true,
         users,
         reachedEnd: /* same logic as SCROLL_DOWN */,
         isHidden: document.hidden,
       });
     }, message.waitMs || 2000);
     return true;
   }
   ```

#### [NEW] `src/background/following-scroll.ts`

Module điều phối quá trình scroll trang following:

```typescript
export async function scrollFollowingToEnd(
  targetUrl: string,
  tabId: number,
  maxScrolls = 500
): Promise<{ username: string; displayName: string; order: number }[]>
```

**Flow bên trong:**
```
scrollFollowingToEnd(url, tabId)
  ├── chrome.tabs.update(tabId, { url })     // navigate đến /following
  ├── waitForTabLoad(tabId)                  // hàm có sẵn trong utils.ts
  ├── sleep(3000)                            // chờ X.com render
  ├── allUsers = new Map()                   // dedup theo username
  ├── while (!reachedEnd && scroll < max):
  │     ├── sendMessage(SCROLL_FOLLOWING_PAGE, { waitMs, allowFollowingPage: true })
  │     ├── merge users vào allUsers (giữ order đầu tiên gặp)
  │     ├── broadcastToPopup(FOLLOWING_SCROLL_PROGRESS, { count, scrollCount })
  │     └── sleep(delay + jitter)
  └── broadcastToPopup(FOLLOWING_SCROLL_DONE, { users: [...allUsers].reverse(), total })
      // reverse để cũ nhất lên đầu
```

#### [MODIFY] `src/background/messages.ts`

Thêm handlers:

| Message Type | Payload | Mô tả |
|---|---|---|
| `START_FOLLOWING_SCROLL` | `{ targetUrl, username }` | Bắt đầu scroll trang /following |
| `STOP_FOLLOWING_SCROLL` | — | Dừng scroll |
| `GET_FOLLOWING_SCROLL_STATE` | — | Lấy trạng thái scroll hiện tại |

#### [MODIFY] `src/popup/popup.html` + `popup.ts`

Thêm nút **"Scroll to Oldest"** trong Cleanup panel:

```
┌──────────────────────────────────────────┐
│  📜 Scroll to Oldest Following           │
│  ────────────────────────────────────── │
│  Target URL:                             │
│  [x.com/henryphan69/following        ]   │
│                                          │
│  [▶ Start Scroll]          [■ Stop]      │
│                                          │
│  ████████████░░░░  312 users found       │
│  Scrolled: 48 times                      │
│                                          │
│  ✅ Done! Oldest followers:              │
│  1. @oldest_user  (followed first)       │
│  2. @second_user                         │
│  ...                                     │
│                                          │
│  [📋 Copy Usernames]  [⬇ Export CSV]     │
└──────────────────────────────────────────┘
```

**Output sau khi scroll xong:**
- Danh sách toàn bộ usernames following, **reverse order** (cũ nhất lên đầu)
- **"Copy to Clipboard"** — copy list `@username` ngăn cách bởi newline
- **"Export CSV"** — xuất file `following_<username>_oldest.csv`

---

## Feature 1 — Following Scanner via API

### 1. Background — Following API Layer

#### [NEW] `src/background/following-api.ts`
Module mới xử lý toàn bộ logic gọi API X.com:

- **`fetchFollowingList(ct0, cursor?)`**: Gọi GraphQL `Following` endpoint của X.com (authenticated), trả về danh sách tài khoản đang theo dõi có phân trang.
- **`fetchUserLastActivity(userId, ct0)`**: Lấy thông tin tweet gần nhất của một user qua `UserTweets` GraphQL API.
- **`unfollowUser(userId, ct0)`**: Gọi API `friendships/destroy.json` để unfollow 1 user.
- **Rate limiter riêng** cho unfollow (max 5 unfollow/phút mặc định, configurable).

**GraphQL Endpoints sẽ dùng:**
```
GET  https://x.com/i/api/graphql/.../Following
GET  https://x.com/i/api/graphql/.../UserTweets
POST https://x.com/i/api/1.1/friendships/destroy.json
```

### 2. Background — Message Handlers

#### [MODIFY] `src/background/messages.ts`
Thêm các message handlers mới:

| Message Type | Payload | Mô tả |
|---|---|---|
| `START_FOLLOWING_SCAN` | `{ ct0 }` | Bắt đầu quét following list |
| `GET_FOLLOWING_SCAN_STATE` | — | Lấy trạng thái scan hiện tại |
| `STOP_FOLLOWING_SCAN` | — | Dừng scan |
| `FETCH_ACTIVITY_BATCH` | `{ userIds[], ct0 }` | Lấy activity info cho batch users |
| `START_UNFOLLOW_BATCH` | `{ userIds[], ct0 }` | Bắt đầu unfollow hàng loạt |
| `STOP_UNFOLLOW_BATCH` | — | Dừng unfollow |

### 3. Types

#### [MODIFY] `src/types.ts`
Thêm các interface mới:

```typescript
export interface FollowingUser {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  followersCount: number;
  followingCount: number;
  tweetCount: number;
  lastTweetDate?: number | null;  // timestamp ms
  isVerified?: boolean;
  isProtected?: boolean;
  activityScore?: 'active' | 'inactive' | 'unknown';
  selected?: boolean;  // for batch unfollow UI
}

export interface FollowingScanState {
  isScanning: boolean;
  total: number;          // tổng số following
  scanned: number;        // đã quét xong
  cursor?: string;        // pagination cursor
  users: FollowingUser[];
}

export interface UnfollowBatchState {
  isRunning: boolean;
  total: number;
  done: number;
  failed: number;
  current?: string;       // username đang xử lý
}

// Feature 0
export interface FollowingScrollState {
  isScrolling: boolean;
  targetUrl: string;
  scrollCount: number;
  usersFound: number;
  reachedEnd: boolean;
  users: { username: string; displayName: string; order: number }[];
}
```

---

### 4. Popup — Cleanup Tab (Panel mới)

#### [MODIFY] `src/popup/popup.html`
- Thêm tab **"Cleanup"** vào bottom nav (icon: broom)
- Thêm `panel-cleanup` với 2 sub-section: **Scroll to Oldest** + **API Scanner**

#### [MODIFY] `src/popup/popup.css`
Thêm styles cho Cleanup panel.

#### [MODIFY] `src/popup/popup.ts`
Thêm logic UI cho Cleanup panel:
- `initCleanupPanel()`: Khởi tạo panel
- `startFollowingScroll(targetUrl)`: Gửi `START_FOLLOWING_SCROLL`
- `renderFollowingList()`: Render danh sách user với virtual scroll
- `updateScanProgress()`: Cập nhật progress bar real-time
- `confirmAndUnfollow()`: Dialog xác nhận trước khi unfollow
- `exportFollowingCSV(users)`: Export ra file CSV

---

## Content Script

#### [MODIFY] `src/content/content.ts`
Đã có sẵn cơ chế lấy `ct0` CSRF token — sẽ tái dùng. Extension sẽ yêu cầu user mở tab X.com để lấy token trước khi scan.

---

## UI/UX Flow — Feature 0 (Scroll to Oldest)

```
User mở popup → tab "Cleanup" → section "Scroll to Oldest"
        │
        ├── Extension tự detect URL tab hiện tại
        │   Nếu đang ở /following → điền sẵn target URL
        │   Nếu không → để user nhập username
        ▼
[▶ Start Scroll]
        │
        ▼
Background SW navigate tab đến x.com/<username>/following
Content script scroll loop:
  - Scroll xuống + extract UserCell từ DOM
  - Dedup theo username (giữ order xuất hiện đầu tiên)
  - Broadcast FOLLOWING_SCROLL_PROGRESS → popup update counter
        │
        ▼
[reachedEnd = true] → Scroll xong!
Danh sách users được REVERSE (cũ nhất → index 1)
        │
        ▼
[📋 Copy Usernames] hoặc [⬇ Export CSV]
User biết được ai là following cũ nhất / lâu nhất
```

## UI/UX Flow — Feature 1 (API Scan + Unfollow)

```
User click "Cleanup" tab → section "API Scan"
        │
        ▼
[Check: đã có ct0?]──No──→ Hiện banner "Vui lòng mở X.com trước"
        │Yes
        ▼
[Btn: Scan Following List] → Background SW gọi Following GraphQL API
Broadcast progress → popup cập nhật real-time
        │
        ▼
Hiện danh sách với filter: All / Inactive / Active / Unknown
Sort: Last activity / Name / Followers
        │
        ▼
User tick checkbox → [⚠ Unfollow X selected]
Confirmation dialog → Background SW unfollow (throttled ~5/phút)
Done! Toast: "Unfollowed 5 accounts ✓"
```

---

## Verification Plan

### Build Check
```bash
npm run build
```

- Kiểm tra warning message khi unfollow nhiều

---

## Phạm vi thay đổi (Summary)

| File | Loại | Mô tả |
|------|------|-------|
| `src/background/following-api.ts` | **NEW** | Following/Unfollow API layer |
| `src/background/messages.ts` | **MODIFY** | Thêm 6 message handlers |
| `src/types.ts` | **MODIFY** | Thêm 3 interface mới |
| `src/popup/popup.html` | **MODIFY** | Thêm Cleanup tab + panel |
| `src/popup/popup.css` | **MODIFY** | Styles cho Cleanup panel |
| `src/popup/popup.ts` | **MODIFY** | Logic UI cho Cleanup panel |

**Estimated effort**: ~500–700 dòng code mới/sửa
