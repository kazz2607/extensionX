/**
 * following-scroll.ts — Feature 0: Auto-Scroll trang /following
 *
 * Scroll tự động trang x.com/<username>/following xuống tận cuối
 * để lộ ra các tài khoản following cũ nhất (X.com load mới → cũ từ trên xuống).
 *
 * Tái dùng waitForTabLoad() và sleep() từ utils.ts.
 * Kết quả trả về REVERSE ORDER — user cũ nhất ở index 0.
 */

import { broadcastToPopup, sleep, waitForTabLoad } from './utils.ts';
import { FollowingUserEntry, FollowingScrollState } from '../types.ts';

// ─── State ────────────────────────────────────────────────────────────────────
let _scrollState: FollowingScrollState = {
  isScrolling: false,
  targetUrl: '',
  scrollCount: 0,
  usersFound: 0,
  reachedEnd: false,
  users: [],
};

export function getFollowingScrollState(): FollowingScrollState {
  return { ..._scrollState, users: [..._scrollState.users] };
}

// ─── Stop Flag ────────────────────────────────────────────────────────────────
let _stopRequested = false;

export function stopFollowingScroll() {
  _stopRequested = true;
}

// ─── Main: Scroll Following Page To End ──────────────────────────────────────
export async function startFollowingScroll(targetUrl: string): Promise<void> {
  if (_scrollState.isScrolling) {
    console.warn('[following-scroll] Đang chạy — bỏ qua yêu cầu mới');
    return;
  }

  _stopRequested = false;
  _scrollState = {
    isScrolling: true,
    targetUrl,
    scrollCount: 0,
    usersFound: 0,
    reachedEnd: false,
    users: [],
  };

  broadcastToPopup('FOLLOWING_SCROLL_STARTED', { targetUrl });

  // BUG-L7: Track xem có tự tạo tab mới không để đóng sau khi xong
  let createdNewTab = false;

  try {
    // Tìm tab đang mở x.com để dùng, hoặc dùng tab active
    const tabs = await chrome.tabs.query({ url: ['https://x.com/*', 'https://twitter.com/*'] });
    let tabId: number | undefined;

    if (tabs.length > 0) {
      // Ưu tiên tab đang active, fallback tab đầu tiên
      const activeTab = tabs.find(t => t.active) || tabs[0];
      tabId = activeTab.id;
    } else {
      // Không có tab x.com — tạo tab mới
      const newTab = await chrome.tabs.create({ url: targetUrl, active: true });
      tabId = newTab.id;
      createdNewTab = true; // BUG-L7: Đánh dấu để đóng sau
    }

    if (!tabId) {
      throw new Error('Không tìm được tab hợp lệ');
    }

    // Navigate đến trang /following nếu chưa ở đó
    const currentTab = await chrome.tabs.get(tabId).catch(() => null);
    if (!currentTab?.url?.includes('/following')) {
      await chrome.tabs.update(tabId, { url: targetUrl });
      await waitForTabLoad(tabId);
      await sleep(3000); // Chờ X.com render virtual list
    } else {
      await sleep(1000);
    }

    // Map dedup: username → order (order tăng dần = mới hơn → cũ hơn khi scroll)
    const allUsers = new Map<string, FollowingUserEntry>();
    let orderCounter = 0;
    const MAX_SCROLLS = 1000;
    const SCROLL_DELAY_MS = 2200;
    let noNewCount = 0;

    while (!_stopRequested && _scrollState.scrollCount < MAX_SCROLLS) {
      let scrollResult: any;

      try {
        scrollResult = await chrome.tabs.sendMessage(tabId, {
          type: 'SCROLL_FOLLOWING_PAGE',
          waitMs: SCROLL_DELAY_MS,
        });
      } catch (err: any) {
        console.warn('[following-scroll] sendMessage lỗi:', err.message);
        break;
      }

      if (scrollResult?.error === 'not_following_page') {
        console.warn('[following-scroll] Tab không còn ở trang /following');
        break;
      }

      // Merge users mới vào map (giữ order đầu tiên gặp = order xuất hiện trên DOM)
      const newUsers: { username: string; displayName: string }[] = scrollResult?.users || [];
      let newCount = 0;
      for (const u of newUsers) {
        if (!allUsers.has(u.username)) {
          allUsers.set(u.username, {
            username: u.username,
            displayName: u.displayName,
            order: orderCounter++,
          });
          newCount++;
        }
      }

      _scrollState.scrollCount++;
      _scrollState.usersFound = allUsers.size;

      // Broadcast progress về popup
      broadcastToPopup('FOLLOWING_SCROLL_PROGRESS', {
        scrollCount: _scrollState.scrollCount,
        usersFound: _scrollState.usersFound,
        newThisScroll: newCount,
        reachedEnd: scrollResult?.reachedEnd || false,
        isHidden: scrollResult?.isHidden || false,
      });

      // Kiểm tra đã đến cuối chưa
      if (scrollResult?.reachedEnd) {
        noNewCount++;
        if (noNewCount >= 3) {
          _scrollState.reachedEnd = true;
          break;
        }
      } else if (scrollResult?.isHidden) {
        // Tab bị ẩn: X.com không load thêm — chờ và thử lại
        noNewCount = 0;
      } else {
        noNewCount = 0;
      }

      await sleep(SCROLL_DELAY_MS + Math.random() * 500);
    }

    // Đảo ngược: index 0 = oldest (xuất hiện cuối cùng trong DOM = following lâu nhất)
    const sortedUsers = Array.from(allUsers.values())
      .sort((a, b) => b.order - a.order); // order cao = scroll về sau = following cũ hơn

    _scrollState.users = sortedUsers;
    _scrollState.isScrolling = false;

    broadcastToPopup('FOLLOWING_SCROLL_DONE', {
      users: sortedUsers,
      total: sortedUsers.length,
      scrollCount: _scrollState.scrollCount,
      reachedEnd: _scrollState.reachedEnd,
      stopped: _stopRequested,
    });

    console.log(`[following-scroll] Xong: ${sortedUsers.length} users sau ${_scrollState.scrollCount} scrolls`);

  } catch (err: any) {
    console.error('[following-scroll] Lỗi:', err.message);
    _scrollState.isScrolling = false;
    broadcastToPopup('FOLLOWING_SCROLL_ERROR', { error: err.message });
  } finally {
    // BUG-L7 FIX: Đóng tab nếu extension tự tạo — tránh rác tab sau khi scroll xong
    if (createdNewTab) {
      const tabs = await chrome.tabs.query({ url: ['https://x.com/*', 'https://twitter.com/*'] });
      const newTab = tabs.find(t => t.url?.includes('/following'));
      if (newTab?.id) {
        chrome.tabs.remove(newTab.id).catch(() => {});
        console.debug('[following-scroll] BUG-L7: Đã đóng tab tự tạo');
      }
    }
  }
}
