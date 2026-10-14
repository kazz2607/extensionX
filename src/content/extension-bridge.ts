/**
 * extension-bridge.ts — isolated-world end of the private page ↔ content-script
 * channel (see page-bridge.ts and shared/page-bridge-protocol.ts). The port is
 * posted synchronously at document_start so it is queued before anything a
 * page script could post.
 */
import {
  BRIDGE_KEY,
  PAGE_TO_EXTENSION,
  parseBridgeMessage,
  type ExtensionToPageType,
  type PageToExtensionType,
} from '../shared/page-bridge-protocol.ts';

type Handler = (detail: unknown) => void;

const channel = new MessageChannel();
const handlers = new Map<PageToExtensionType, Set<Handler>>();

channel.port1.onmessage = (event: MessageEvent) => {
  const message = parseBridgeMessage(event.data, PAGE_TO_EXTENSION);
  if (!message) return;
  handlers.get(message.type)?.forEach((handler) => {
    try {
      handler(message.detail);
    } catch (error) {
      console.debug('[XMD bridge] handler failed', error);
    }
  });
};

window.postMessage({ [BRIDGE_KEY]: 'port' }, location.origin, [channel.port2]);

/** Messages sent before the page end starts listening are queued by the port. */
export function sendToPage(type: ExtensionToPageType, detail?: unknown): void {
  channel.port1.postMessage({ type, detail });
}

export function onPageMessage(type: PageToExtensionType, handler: Handler): () => void {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type)!.add(handler);
  return () => handlers.get(type)?.delete(handler);
}
