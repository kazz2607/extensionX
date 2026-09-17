import './messages.ts';
import { loadPersistedQueue, broadcastQueueUpdate } from './queue.ts';
import { stopCollectingForTab } from './scraper.ts';
import { setCsrfToken, tabState } from './state.ts';

loadPersistedQueue().then(() => {
  broadcastQueueUpdate();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  stopCollectingForTab(tabId);
  // The CSRF token belongs to an authenticated page session. Do not retain it
  // in memory once the final tracked X tab is gone.
  if (tabState.size === 0) setCsrfToken('');
});
