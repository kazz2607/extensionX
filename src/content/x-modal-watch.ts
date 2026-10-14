/**
 * x-modal-watch.ts — report when X shows a modal layer (media lightbox,
 * compose box, dialogs). X renders these into #layers; only that subtree is
 * observed, and checks are coalesced to one per animation frame.
 */
const MODAL_SELECTOR = '[aria-modal="true"], [role="dialog"]';

export function watchXModals(onChange: (open: boolean) => void): void {
  let open = false;
  let scheduled = false;
  const check = (layers: Element) => {
    scheduled = false;
    const next = layers.querySelector(MODAL_SELECTOR) !== null;
    if (next !== open) {
      open = next;
      onChange(open);
    }
  };
  const observeLayers = (layers: Element) => {
    new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => check(layers));
    }).observe(layers, { childList: true, subtree: true });
    check(layers);
  };

  const existing = document.getElementById('layers');
  if (existing) {
    observeLayers(existing);
    return;
  }
  // X mounts #layers deep inside #react-root after load, so the waiter needs
  // subtree; it only does a getElementById per frame and disconnects as soon
  // as #layers appears.
  const start = () => {
    let pending = false;
    const waiter = new MutationObserver(() => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        const layers = document.getElementById('layers');
        if (!layers) return;
        waiter.disconnect();
        observeLayers(layers);
      });
    });
    waiter.observe(document.body, { childList: true, subtree: true });
  };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
}
