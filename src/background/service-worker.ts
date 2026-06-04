// @ts-nocheck
import './messages.ts';
import { loadPersistedQueue, broadcastQueueUpdate } from './queue.ts';

loadPersistedQueue().then(() => {
  broadcastQueueUpdate();
});

const KEEPALIVE_ALARM = 'sw-keepalive';
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_ALARM) {
    console.debug('[SW] keepalive ping');
  }
});
