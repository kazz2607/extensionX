import type { ParsedRuntimeMessage } from '../shared/messages.ts';

export type SendResponse = (response: unknown) => void;
export type DomainMessageHandler = (
  message: ParsedRuntimeMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: SendResponse,
) => boolean | undefined;

export function isInternalSender(sender: chrome.runtime.MessageSender): boolean {
  return sender.id === chrome.runtime.id;
}
