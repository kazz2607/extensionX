# Following Scanner & Inactive Unfollow - Implementation Plan

> **Version**: v6.0.0 (planned)
> **Created**: 2026-07-24
> **Updated**: 2026-07-24 (Feature 0 hoàn thành - Tách thành Standalone Tab)
> **Status**: Feature 0 (Auto-Scroll) DONE. Feature 1 (API Scanner) Pending.

## Tong quan

Them tinh nang **Following Scanner** vao extensionX - cho phep nguoi dung:
1. **[Feature 0]** Auto-scroll trang `/following` xuong cuoi de lo cac tai khoan **following cu nhat**
2. **[Feature 1]** Quet toan bo danh sach Following qua API de phan tich muc do hoat dong
3. **[Feature 1]** Unfollow hang loat cac tai khoan khong con hoat dong (voi preview va xac nhan truoc)

---

## Luu y quan trong

- Tinh nang **unfollow** yeu cau session cua nguoi dung dang dang nhap tren X.com -- extension se tan dung `ct0` (CSRF token) va `auth_token` cookie (HttpOnly) giong cach fetch video hien tai. **Khong can API key ben ngoai.**
- X.com co rate limit nghiem ngat cho unfollow API (~400 unfollow/ngay theo tai khoan). Extension se implement **throttle tu dong** va **hien thi warning** neu nguoi dung co unfollow qua nhieu.
- Viec unfollow la **khong the hoan tac tu dong** (phai follow lai tung nguoi). Extension se yeu cau xac nhan ro rang truoc khi thuc hien.

---

## Open Questions

1. **Nguong "khong hoat dong"** mac dinh la gi?
   - Option A: Khong tweet trong **6 thang** (de xuat)
   - Option B: Khong tweet trong **1 nam**
   - Option C: Cho phep user tu dieu chinh nguong

2. **Tab moi hay tich hop vao popup hien tai?**
   - Option A: Tab moi **"Cleanup"** trong bottom nav (de xuat -- giu popup gon gang)
   - Option B: Tich hop vao panel Stats

---

## Architecture Overview

```
[Feature 0] Auto-Scroll /following page
        | Collect usernames from DOM (no API needed)
        v
[Feature 1] Following List API --> Background SW --> User Activity Analysis
                                               --> Popup (Cleanup Tab)
                                               --> Unfollow API (with throttle)
```

---

## Feature 0 -- Auto-Scroll Following Page (Uu tien cao)

> **Muc tieu**: Scroll tu dong trang `x.com/<username>/following` xuong tan cuoi de lo ra cac tai khoan **following cu nhat**.
> X.com load theo thu tu moi -> cu tu tren xuong duoi.
> **Vi du target**: `https://x.com/henryphan69/following`

### Van de hien tai

Ham `SCROLL_DOWN` trong `content.ts` hien co guard kiem tra `isMediaPage()` -- se tra ve `{ error: 'not_media_page' }` neu khong phai trang `/media`, `/photos`, `/videos`, `/likes`, `/bookmarks`. Trang `/following` bi block boi guard nay.

### Giai phap

**Tai dung toan bo scroll engine hien co** -- chi can mo rong minimal:

#### [MODIFY] `src/content/content.ts`

**Buoc 1** - Them ham `isFollowingPage()`:
```typescript
function isFollowingPage(url = location.href) {
  return /\/[A-Za-z0-9_]+\/following(\/|$)/.test(new URL(url).pathname);
}
```

**Buoc 2** - Mo rong handler `SCROLL_DOWN` voi flag `allowFollowingPage`:
```typescript
if (message.type === 'SCROLL_DOWN') {
  const isAllowed = isMediaPage()
    || (message.allowFollowingPage && isFollowingPage());
  if (!isAllowed) {
    sendResponse({ error: 'not_media_page' });
    return false;
  }
  // ... scroll logic giu nguyen khong doi
}
```

**Buoc 3** - Them ham `extractFollowingUsers()` -- quet DOM lay username tu UserCell:
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

**Buoc 4** - Them handler `SCROLL_FOLLOWING_PAGE`:
```typescript
if (message.type === 'SCROLL_FOLLOWING_PAGE') {
  const prevHeight = document.documentElement.scrollHeight;
  window.scrollTo(0, prevHeight);
  setTimeout(() => window.scrollBy(0, -100), 100);
  setTimeout(() => window.scrollTo(0, document.documentElement.scrollHeight), 300);

  setTimeout(() => {
    const newHeight = document.documentElement.scrollHeight;
    const isAtBottom = (window.scrollY + window.innerHeight) >= (newHeight - 200);
    const users = extractFollowingUsers();
    sendResponse({
      done: true,
      users,
      reachedEnd: !document.hidden && isAtBottom && (newHeight <= prevHeight + 50),
      isHidden: document.hidden,
    });
  }, message.waitMs || 2000);
  return true;
}
```

#### [NEW] `src/background/following-scroll.ts`

Module dieu phoi qua trinh scroll trang following:

```typescript
export async function scrollFollowingToEnd(
  targetUrl: string,
  tabId: number,
  maxScrolls = 500
): Promise<{ username: string; displayName: string; order: number }[]>
```

Flow chi tiet:
```
scrollFollowingToEnd(url, tabId)
  |-- chrome.tabs.update(tabId, { url })     // navigate den /following
  |-- waitForTabLoad(tabId)                  // ham co san trong utils.ts
  |-- sleep(3000)                            // cho X.com render
  |-- allUsers = new Map()                   // dedup theo username
  |-- while (!reachedEnd && scroll < max):
  |     |-- sendMessage(SCROLL_FOLLOWING_PAGE, { waitMs })
  |     |-- merge users vao allUsers (giu order xuat hien dau tien)
  |     |-- broadcastToPopup(FOLLOWING_SCROLL_PROGRESS, { count, scrollCount })
  |     `-- sleep(delay + jitter)
  `-- broadcastToPopup(FOLLOWING_SCROLL_DONE, { users: reverse(allUsers), total })
      // REVERSE de cu nhat len dau
```

#### [MODIFY] `src/background/messages.ts`

Them cac handlers moi:

| Message Type               | Payload              | Mo ta                          |
|----------------------------|----------------------|--------------------------------|
| START_FOLLOWING_SCROLL     | { targetUrl }        | Bat dau scroll trang /following |
| STOP_FOLLOWING_SCROLL      | --                   | Dung scroll                    |
| GET_FOLLOWING_SCROLL_STATE | --                   | Lay trang thai scroll          |

#### UI trong Cleanup Panel - "Scroll to Oldest" section

```
+------------------------------------------+
|  Scroll to Oldest Following              |
|  ----------------------------------------|
|  Target URL:                             |
|  [ x.com/henryphan69/following       ]   |
|                                          |
|  [> Start Scroll]          [Stop]        |
|                                          |
|  [==========-------]  312 users found   |
|  Scrolled: 48 times                      |
|                                          |
|  Done! Oldest accounts:                  |
|  1. @oldest_user  (followed first)       |
|  2. @second_user                         |
|  ...                                     |
|                                          |
|  [Copy Usernames]   [Export CSV]         |
+------------------------------------------+
```

Output sau khi scroll xong:
- Danh sach usernames following, **reverse order** (cu nhat -> moi nhat)
- Nut **Copy to Clipboard** -- copy list @username
- Nut **Export CSV** -- xuat file `following_<username>_oldest.csv`

---

## Feature 1 -- Following Scanner via API

### 1. [NEW] `src/background/following-api.ts`

- `fetchFollowingList(ct0, cursor?)` -- GraphQL Following endpoint, co phan trang
- `fetchUserLastActivity(userId, ct0)` -- UserTweets GraphQL, lay tweet gan nhat
- `unfollowUser(userId, ct0)` -- POST friendships/destroy.json
- Rate limiter rieng cho unfollow (max 5/phut, configurable)

GraphQL Endpoints:
```
GET  https://x.com/i/api/graphql/.../Following
GET  https://x.com/i/api/graphql/.../UserTweets
POST https://x.com/i/api/1.1/friendships/destroy.json
```

### 2. [MODIFY] `src/background/messages.ts`

| Message Type         | Payload              | Mo ta                       |
|----------------------|----------------------|-----------------------------|
| START_FOLLOWING_SCAN | { ct0 }              | Bat dau quet following list  |
| STOP_FOLLOWING_SCAN  | --                   | Dung scan                   |
| FETCH_ACTIVITY_BATCH | { userIds[], ct0 }   | Lay activity info batch      |
| START_UNFOLLOW_BATCH | { userIds[], ct0 }   | Bat dau unfollow hang loat  |
| STOP_UNFOLLOW_BATCH  | --                   | Dung unfollow               |

### 3. [MODIFY] `src/types.ts`

```typescript
export interface FollowingUser {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  followersCount: number;
  tweetCount: number;
  lastTweetDate?: number | null;
  activityScore?: 'active' | 'inactive' | 'unknown';
  selected?: boolean;
}

export interface FollowingScanState {
  isScanning: boolean;
  total: number;
  scanned: number;
  cursor?: string;
  users: FollowingUser[];
}

export interface UnfollowBatchState {
  isRunning: boolean;
  total: number;
  done: number;
  failed: number;
  current?: string;
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

## UI/UX Flow -- Feature 0 (Scroll to Oldest)

```
User mo x.com/henryphan69/following (hoac bat ky /following)
  |
  v
Click popup --> tab "Cleanup" --> sub-section "Scroll to Oldest"
  |
  v
Extension tu detect URL tab hien tai, dien san target URL
  |
  v
[> Start Scroll]
  |
  v
Background SW navigate tab den /following (neu chua o do)
Content script scroll loop:
  - Scroll xuong + extract users tu [data-testid="UserCell"]
  - Dedup theo username
  - Broadcast FOLLOWING_SCROLL_PROGRESS --> popup hien real-time counter
  |
  v
[reachedEnd = true] --> Scroll xong!
Danh sach users duoc REVERSE (cu nhat --> dau danh sach)
  |
  v
[Copy List] hoac [Export CSV]
User biet duoc ai da following tu dau tien
```

## UI/UX Flow -- Feature 1 (API Scan + Unfollow)

```
User click "Cleanup" tab --> sub-section "API Scan"
  |
  v
[Check: da co ct0?] -- No --> Hien banner "Vui long mo X.com truoc"
  | Yes
  v
[Scan Following List] --> Background SW goi GraphQL API (co phan trang)
Broadcast progress --> popup cap nhat real-time
  |
  v
Hien danh sach voi filter/sort:
  - Filter: All / Inactive / Active / Unknown
  - Sort: Last activity / Name / Followers
  |
  v
User tick checkbox --> [Unfollow X selected]
Confirmation dialog --> unfollow throttled ~5/phut
Done! Toast: "Unfollowed 5 accounts"
```

---

## Verification Plan

```bash
npm run build
```

### Feature 0 - Manual Test
1. Mo `x.com/henryphan69/following`
2. Click popup --> "Cleanup" tab
3. Xac nhan URL duoc dien san
4. Click "Start Scroll" --> xac nhan counter tang dan
5. Cho den cuoi --> xac nhan reverse order (cu nhat len dau)
6. Click "Export CSV" --> xac nhan file download

### Feature 1 - Manual Test
1. Dang nhap X.com
2. Click "API Scan" --> "Scan Following List"
3. Filter "Inactive" --> thay accounts khong hoat dong
4. Tick accounts --> Unfollow --> xac nhan dialog
5. Kiem tra rate limit warning khi chon nhieu accounts

---

## Pham vi thay doi (Summary)

| File                                  | Loai   | Mo ta                                         |
|---------------------------------------|--------|-----------------------------------------------|
| src/content/content.ts                | MODIFY | Them isFollowingPage, extractFollowingUsers, SCROLL_FOLLOWING_PAGE handler |
| src/background/following-scroll.ts    | NEW    | Scroll engine cho /following page (Feature 0) |
| src/background/following-api.ts       | NEW    | Following/Unfollow API layer (Feature 1)       |
| src/background/messages.ts            | MODIFY | Them 9 message handlers                       |
| src/types.ts                          | MODIFY | Them 4 interface moi                          |
| src/popup/popup.html                  | MODIFY | Them Cleanup tab + panel (2 sub-sections)     |
| src/popup/popup.css                   | MODIFY | Styles cho Cleanup panel                      |
| src/popup/popup.ts                    | MODIFY | Logic UI cho Cleanup panel                    |

**Estimated effort**: ~800-1000 dong code moi/sua

**Thu tu trien khai de xuat:**
1. Feature 0 (Scroll to Oldest) -- don gian hon, tai dung scroll engine co san
2. Feature 1 (API Scan + Unfollow) -- phuc tap hon, can authenticated GraphQL API