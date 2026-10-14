import { isAllowedSender, parseExtensionMessage } from '../shared/messages.ts';
import { handleExportMessage } from './export-messages.ts';
import { handleDownloadCenterMessage } from './download-center-messages.ts';
import { handleFollowingMessage } from './following-messages.ts';
import { isInternalSender, type DomainMessageHandler } from './message-handler.ts';
import { handleMediaMessage } from './media-messages.ts';
import { handleQueueMessage } from './queue-messages.ts';
import { handleStorageMessage } from './storage-messages.ts';
import { handleP2Message } from './p2-messages.ts';
import { isQueueHydrated, loadPersistedQueue } from './queue.ts';
import type { MessageType, ParsedRuntimeMessage } from '../shared/messages.ts';

const handlers: readonly DomainMessageHandler[] = [
  handleQueueMessage,
  handleDownloadCenterMessage,
  handleExportMessage,
  handleStorageMessage,
  handleP2Message,
  handleFollowingMessage,
  handleMediaMessage,
];

// Queue commands must see the persisted queue: after a service-worker wake an
// edit applied to the still-empty in-memory queue would be overwritten when the
// stored queue finishes loading.
const QUEUE_TYPES: ReadonlySet<MessageType> = new Set<MessageType>([
  'ADD_TO_QUEUE', 'REMOVE_FROM_QUEUE', 'GET_QUEUE', 'CLEAR_QUEUE', 'START_QUEUE', 'RETRY_QUEUE_ITEM',
  'TOGGLE_QUEUE_PAUSE', 'REORDER_QUEUE_ITEM', 'QUEUE_BULK_ACTION', 'EXPORT_QUEUE', 'IMPORT_QUEUE',
]);

function dispatch(message: ParsedRuntimeMessage, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void): boolean {
  for (const handler of handlers) {
    const keepChannelOpen = handler(message, sender, sendResponse);
    if (keepChannelOpen !== undefined) return keepChannelOpen;
  }
  return false;
}

chrome.runtime.onMessage.addListener((rawMessage, sender, sendResponse) => {
  const message = parseExtensionMessage(rawMessage);
  if (!isInternalSender(sender) || !message || !isAllowedSender(message.type, sender.url, chrome.runtime.getURL(''))) {
    sendResponse({ error: 'Invalid message' });
    return false;
  }
  if (QUEUE_TYPES.has(message.type) && !isQueueHydrated()) {
    void loadPersistedQueue().then(() => dispatch(message, sender, sendResponse));
    return true;
  }
  return dispatch(message, sender, sendResponse);
});
