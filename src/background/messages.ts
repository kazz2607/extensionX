import { parseExtensionMessage } from '../shared/messages.ts';
import { handleExportMessage } from './export-messages.ts';
import { handleDownloadCenterMessage } from './download-center-messages.ts';
import { handleFollowingMessage } from './following-messages.ts';
import { isInternalSender, type DomainMessageHandler } from './message-handler.ts';
import { handleMediaMessage } from './media-messages.ts';
import { handleQueueMessage } from './queue-messages.ts';
import { handleStorageMessage } from './storage-messages.ts';

const handlers: readonly DomainMessageHandler[] = [
  handleQueueMessage,
  handleDownloadCenterMessage,
  handleExportMessage,
  handleStorageMessage,
  handleFollowingMessage,
  handleMediaMessage,
];

chrome.runtime.onMessage.addListener((rawMessage, sender, sendResponse) => {
  const message = parseExtensionMessage(rawMessage);
  if (!isInternalSender(sender) || !message) {
    sendResponse({ error: 'Invalid message' });
    return false;
  }

  for (const handler of handlers) {
    const keepChannelOpen = handler(message, sender, sendResponse);
    if (keepChannelOpen !== undefined) return keepChannelOpen;
  }
  return false;
});
