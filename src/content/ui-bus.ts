/**
 * ui-bus.ts — in-process messages between content.ts and the on-page UI (FAB,
 * snackbar). Both run in the isolated content-script world, whose DOM
 * prototypes page scripts cannot patch, so nothing here is visible to x.com.
 */
export type UiMessageType = 'XMD_FAB_ACTION' | 'XMD_FAB_UPDATE' | 'XMD_SNACKBAR_UPDATE' | 'XMD_LANG_UPDATE';

type Handler = (detail: unknown) => void;

const handlers = new Map<UiMessageType, Set<Handler>>();

export function emitUi(type: UiMessageType, detail?: unknown): void {
  handlers.get(type)?.forEach((handler) => {
    try {
      handler(detail);
    } catch (error) {
      console.debug('[XMD ui] handler failed', error);
    }
  });
}

export function onUi(type: UiMessageType, handler: Handler): () => void {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type)!.add(handler);
  return () => handlers.get(type)?.delete(handler);
}
