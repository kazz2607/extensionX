// @ts-nocheck
import { tabState, downloadState, mediaStore } from './state.ts';

// ─── FAB Helpers ──────────────────────────────────────────────────────────────
async function updateFAB(tabId, username, scrollCount) {
  if (!tabId) return;
  const count = mediaStore.get(username)?.size || 0;
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'FAB_UPDATE', payload: { count, scrollCount } });
  } catch (_) {}
}

async function broadcastFABState(tabId, state) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'FAB_UPDATE', payload: { state } });
  } catch (_) {}
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function updateBadge(username) {
  const total = mediaStore.get(username)?.size || 0;
  chrome.action.setBadgeText({ text: total > 9999 ? '9999+' : String(total) });
  chrome.action.setBadgeBackgroundColor({ color: '#1D9BF0' });
}

// BUG-9 FIX: Không log lỗi khi popup đóng (expected behavior)
function broadcastToPopup(type, payload) {
  chrome.runtime.sendMessage({ type, payload }).catch((_err) => {
    // Popup đóng = expected. Chỉ log nếu lỗi bất thường.
    // if (_err?.message && !_err.message.includes('Receiving end does not exist')) {
    //   console.warn('[SW] broadcastToPopup error:', _err.message);
    // }
  });
}

// Gửi message về tab đang active của username (dùng cho Snackbar)
// BUG-E FIX: Ưu tiên tab đang collecting; nếu không có thì gửi tab cuối cùng
// Tránh gửi đến TẤT CẢ tab cùng username khi mở nhiều tab → nhiều snackbar
function broadcastToTab(username, type, payload) {
  let targetTabId = null;
  // Ưu tiên tab đang actively collecting
  tabState.forEach((state, tabId) => {
    if (state.username === username && state.isCollecting) {
      targetTabId = tabId;
    }
  });
  // Fallback: tab cuối cùng khớp username
  if (!targetTabId) {
    tabState.forEach((state, tabId) => {
      if (state.username === username) {
        targetTabId = tabId;
      }
    });
  }
  if (targetTabId) {
    chrome.tabs.sendMessage(targetTabId, { type, payload }).catch(() => {});
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function waitForTabLoad(tabId) {
  return new Promise(resolve => {
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(resolve, 10000);
  });
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('[X Media Downloader] v4.3.0 — Date Range Filter + Multi-Profile Queue + Popup v2');
});


function sanitizeFolder(folder) {
  return folder
    .replace(/[<>:"|?*\\]/g, '_') // ký tự không hợp lệ trên Windows
    .replace(/^\/+|\/+$/g, '')    // bỏ slash đầu/cuối
    .trim();
} // sanitizeFolder

export { broadcastToPopup, broadcastToTab, updateBadge, updateFAB, broadcastFABState, sanitizeFolder, sleep, waitForTabLoad };
