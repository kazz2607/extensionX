/**
 * page-bridge.ts — MAIN-world end of the private page ↔ content-script channel.
 *
 * Every MAIN-world module is bundled into content/main-world.ts so they share
 * this single module instance and its port. Page scripts can neither read the
 * port nor forge messages on it. DOM primitives are captured at document_start,
 * before any X script runs, so later prototype patches cannot intercept them.
 */
import {
  BRIDGE_PENDING_LIMIT,
  EXTENSION_TO_PAGE,
  isBridgeHandshake,
  parseBridgeMessage,
  type ExtensionToPageType,
  type PageToExtensionType,
} from '../shared/page-bridge-protocol.ts';

const addWindowListener = window.addEventListener.bind(window);
const removeWindowListener = window.removeEventListener.bind(window);
const portPost = MessagePort.prototype.postMessage;
const portStart = MessagePort.prototype.start;
const portAddListener = EventTarget.prototype.addEventListener;
const stopImmediate = Event.prototype.stopImmediatePropagation;

type Handler = (detail: unknown) => void;

let port: MessagePort | null = null;
let pending: { type: PageToExtensionType; detail: unknown }[] = [];
const handlers = new Map<ExtensionToPageType, Set<Handler>>();

function dispatch(event: MessageEvent): void {
  const message = parseBridgeMessage(event.data, EXTENSION_TO_PAGE);
  if (!message) return;
  handlers.get(message.type)?.forEach((handler) => {
    try {
      handler(message.detail);
    } catch (error) {
      console.debug('[XMD bridge] handler failed', error);
    }
  });
}

function onWindowMessage(event: MessageEvent): void {
  if (port || event.source !== window) return;
  const transferred = event.ports?.[0];
  if (!isBridgeHandshake(event.data, 'port') || !transferred) return;
  // Hide the port from every later listener, including page scripts.
  stopImmediate.call(event);
  port = transferred;
  portAddListener.call(port, 'message', dispatch as EventListener);
  portStart.call(port);
  removeWindowListener('message', onWindowMessage, true);
  const queued = pending;
  pending = [];
  queued.forEach((message) => portPost.call(port!, message));
}

// Capture phase and registered before any page script: ours runs first.
addWindowListener('message', onWindowMessage, true);

export function sendToExtension(type: PageToExtensionType, detail?: unknown): void {
  if (port) {
    portPost.call(port, { type, detail });
    return;
  }
  if (pending.length >= BRIDGE_PENDING_LIMIT) pending.shift();
  pending.push({ type, detail });
}

export function onExtensionMessage(type: ExtensionToPageType, handler: Handler): () => void {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type)!.add(handler);
  return () => handlers.get(type)?.delete(handler);
}
