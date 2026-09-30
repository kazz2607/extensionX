import type { DomainMessageHandler } from './message-handler.ts';
import { getFollowingScrollState, startFollowingScroll, stopFollowingScroll } from './following-scroll.ts';
import { isXUrl } from '../shared/validation.ts';

export const handleFollowingMessage: DomainMessageHandler = (message, _sender, sendResponse) => {
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
    default:
      return undefined;
  }
};
