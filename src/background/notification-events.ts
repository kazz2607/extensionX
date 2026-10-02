import type { NotificationEvent } from '../types.ts';

const EVENTS_KEY = 'notification_events_v1';
const EVENT_LIMIT = 100;

export async function listNotificationEvents(): Promise<NotificationEvent[]> {
  const stored = await chrome.storage.local.get(EVENTS_KEY);
  return Array.isArray(stored[EVENTS_KEY]) ? (stored[EVENTS_KEY] as NotificationEvent[]).slice(0, EVENT_LIMIT) : [];
}

export async function addNotificationEvent(level: NotificationEvent['level'], title: string, message: string): Promise<void> {
  const events = await listNotificationEvents();
  events.unshift({ id: crypto.randomUUID(), createdAt: Date.now(), level, title: title.slice(0, 100), message: message.slice(0, 300), read: false });
  await chrome.storage.local.set({ [EVENTS_KEY]: events.slice(0, EVENT_LIMIT) });
  if (level !== 'info') await chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon128.png', title, message }).catch(() => '');
}

export async function markNotificationEventsRead(): Promise<void> {
  const events = await listNotificationEvents();
  await chrome.storage.local.set({ [EVENTS_KEY]: events.map((item) => ({ ...item, read: true })) });
}
