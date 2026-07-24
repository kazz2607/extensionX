# 🧹 Following Scanner & Inactive Unfollow — Implementation Plan

> **Version**: v6.0.0 (planned)  
> **Created**: 2026-07-24  
> **Status**: Pending approval

## Tổng quan

Thêm tính năng **Following Scanner** vào extensionX — cho phép người dùng:
1. **Quét toàn bộ danh sách Following** của tài khoản X đang đăng nhập
2. **Phân tích mức độ hoạt động** của từng tài khoản (dựa trên ngày tweet cuối cùng, số lượng tweet, v.v.)
3. **Unfollow hàng loạt** các tài khoản không còn hoạt động (với preview và xác nhận trước)

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
Following List API ──→ Background SW ──→ User Activity Analysis
                                    ──→ Popup (Cleanup Tab)
                                    ──→ Unfollow API (with throttle)
```

---

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

---

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

---

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
```

---

### 4. Popup — Cleanup Tab (Panel mới)

#### [MODIFY] `src/popup/popup.html`
- Thêm tab **"Cleanup"** vào bottom nav (icon: broom/sweep)
- Thêm `panel-cleanup` với layout đầy đủ

**Layout của Cleanup Panel:**
```
┌─────────────────────────────────┐
│ 🧹 Following Scanner            │
│ ─────────────────────────────── │
│ [Scan Following List]  ▶ Start  │
│                                 │
│ 📊 Kết quả scan:                │
│  ● 523 accounts scanned         │
│  ● 87 inactive (>6 months)      │
│  ● 12 unknown                   │
│                                 │
│ Filter: [All ▾] [Sort ▾]        │
│ [☑ Select All]  [Unfollow X]    │
│ ─────────────────────────────── │
│ ☐ @user1  Last: 2 years ago     │
│ ☑ @user2  Last: 1 year ago      │
│ ☑ @user3  Never tweeted         │
│ ☐ @user4  Last: 3 days ago  ✓   │
│    ...                          │
│                                 │
│ [⚠ Unfollow 2 selected]         │
└─────────────────────────────────┘
```

#### [MODIFY] `src/popup/popup.css`
Thêm styles cho Cleanup panel.

#### [MODIFY] `src/popup/popup.ts`
Thêm logic UI cho Cleanup panel:
- `initCleanupPanel()`: Khởi tạo panel
- `renderFollowingList()`: Render danh sách user với virtual scroll
- `updateScanProgress()`: Cập nhật progress bar real-time
- `confirmAndUnfollow()`: Dialog xác nhận trước khi unfollow

---

### 5. Content Script

#### [MODIFY] `src/content/content.ts`
Đã có sẵn cơ chế lấy `ct0` CSRF token — sẽ tái dùng. Extension sẽ yêu cầu user mở tab X.com để lấy token trước khi scan.

---

## UI/UX Flow

```
User click "Cleanup" tab
        │
        ▼
[Check: đã có ct0?]──No──→ Hiện banner "Vui lòng mở X.com trước"
        │Yes
        ▼
[Btn: Scan Following List]
        │
        ▼
Background SW gọi Following API (có phân trang)
Broadcast progress → popup cập nhật real-time
        │
        ▼
[Scan done: X accounts found]
Hiện danh sách có filter/sort:
  - Filter: All / Inactive / Active / Unknown
  - Sort: Last activity / Name / Followers
        │
        ▼
User tick checkbox để chọn accounts cần unfollow
        │
        ▼
[Btn: Unfollow X selected]
        │
        ▼
Confirmation dialog: "Unfollow 5 accounts?" [Confirm] [Cancel]
        │ Confirm
        ▼
Background SW unfollow từng user (throttled ~5/phút)
Progress bar + live update trong popup
        │
        ▼
Done! Toast: "Unfollowed 5 accounts ✓"
```

---

## Verification Plan

### Build Check
```bash
npm run build
```

### Manual Verification Steps
1. Load extension vào Chrome (Developer mode)
2. Đăng nhập X.com
3. Click popup → tab "Cleanup"
4. Click "Scan Following List" → xác nhận progress bar hoạt động
5. Xem danh sách → filter "Inactive" → thấy accounts không hoạt động
6. Tick 1-2 account → Click Unfollow → xác nhận dialog → xác nhận unfollow thành công
7. Kiểm tra rate limit warning khi chọn nhiều accounts

### Rate Limit Tests
- Thử unfollow > 10 accounts → xác nhận throttle hoạt động (delay giữa các request)
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
