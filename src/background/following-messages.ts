import type { DomainMessageHandler } from './message-handler.ts';
import { getFollowingScrollState, startFollowingScroll, stopFollowingScroll } from './following-scroll.ts';
import { isXUrl } from '../shared/validation.ts';
import { beginFollowingScan, getFollowingScanState, ingestFollowingPage, runUnfollowQueue, stopFollowingOperation } from './following-scanner.ts';

export const handleFollowingMessage: DomainMessageHandler = (message, sender, sendResponse) => {
  const { type, payload } = message;
  switch (type) {
    case 'START_FOLLOWING_SCROLL': {
      const { targetUrl } = payload || {};
      if (!isXUrl(targetUrl) || !new URL(targetUrl).pathname.endsWith('/following')) {
        sendResponse({ error: 'Missing targetUrl' }); return true;
      }
      void startFollowingScroll(targetUrl).catch((err: unknown) => {
        console.error('[SW] startFollowingScroll error:', err instanceof Error ? err.message : String(err));
      });
      sendResponse({ ok: true });
      return true;
    }
    case 'STOP_FOLLOWING_SCROLL':
      stopFollowingScroll();
      sendResponse({ ok: true });
      return false;
    case 'GET_FOLLOWING_SCROLL_STATE':
      sendResponse({ state: getFollowingScrollState() });
      return true;
    case 'START_FOLLOWING_SCAN': {
      const targetUrl = payload?.targetUrl;
      if (!isXUrl(targetUrl) || !new URL(targetUrl).pathname.endsWith('/following')) {
        sendResponse({ error: 'Invalid following URL' }); return false;
      }
      const state = beginFollowingScan();
      void startFollowingScroll(targetUrl).catch((error: unknown) => console.error('[following-scan]', error));
      sendResponse({ ok: true, state });
      return false;
    }
    case 'FOLLOWING_SCAN_PAGE':
      if (!sender.tab?.id || !isXUrl(sender.tab.url)) { sendResponse({ ok: false }); return false; }
      sendResponse({ ok: true, added: ingestFollowingPage(payload?.candidates, payload?.cursor) });
      return false;
    case 'GET_FOLLOWING_SCAN_STATE':
      sendResponse({ state: getFollowingScanState() });
      return false;
    case 'STOP_FOLLOWING_SCAN':
      stopFollowingOperation();
      stopFollowingScroll();
      sendResponse({ ok: true });
      return false;
    case 'START_UNFOLLOW':
      if (payload?.confirmed !== true) { sendResponse({ error: 'Explicit confirmation required' }); return false; }
      if (!Array.isArray(payload.ids) || payload.ids.length < 1 || payload.ids.length > 100) {
        sendResponse({ error: 'Invalid unfollow selection' }); return false;
      }
      sendResponse({ ok: true });
      void runUnfollowQueue(payload.ids).catch((error: unknown) => console.error('[following-unfollow]', error));
      return false;
    default:
      return undefined;
  }
};
