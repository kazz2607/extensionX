/**
 * page-navigation.ts — SPA route-change detection for the MAIN world, and the
 * shared DOM-addition observer (onAddedElements) of the page scripts.
 * X navigates with the History API; only MAIN-world patches see X's own
 * pushState/replaceState calls (an isolated-world patch never fires).
 */
type NavigationListener = (url: string) => void;

const listeners = new Set<NavigationListener>();
let lastUrl = location.href;

function check(): void {
  if (location.href === lastUrl) return;
  lastUrl = location.href;
  listeners.forEach((listener) => {
    try {
      listener(lastUrl);
    } catch (error) {
      console.debug('[XMD navigation] listener failed', error);
    }
  });
}

window.addEventListener('popstate', check);
window.addEventListener('hashchange', check);
for (const method of ['pushState', 'replaceState'] as const) {
  const original = history[method];
  history[method] = function (this: History, ...args: Parameters<typeof original>) {
    const result = original.apply(this, args);
    queueMicrotask(check);
    return result;
  };
}

export function onNavigation(listener: NavigationListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ─── P22: one MutationObserver for every MAIN-world script ──────────────────
// page-interceptor (video elements), dom-scanner and tweet-btn used to run
// three subtree observers over the same DOM. One observer walks each batch of
// added nodes once and hands the elements to every subscriber.
type AddedElementsListener = (elements: readonly Element[]) => void;
const addedListeners = new Set<AddedElementsListener>();
let domObserver: MutationObserver | null = null;

function startDomObserver(): void {
  if (domObserver) return;
  domObserver = new MutationObserver((mutations) => {
    const added: Element[] = [];
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        // nodeType instead of instanceof: nodes created in another realm
        // (iframe) are not instances of this page's Element.
        if (node.nodeType === 1) added.push(node as Element);
      }
    }
    if (!added.length) return;
    addedListeners.forEach((listener) => {
      try {
        listener(added);
      } catch (error) {
        console.debug('[XMD dom] listener failed', error);
      }
    });
  });
  domObserver.observe(document.documentElement, { childList: true, subtree: true });
}

/** Elements added anywhere in the document, batched per observer callback (from DOMContentLoaded on). */
export function onAddedElements(listener: AddedElementsListener): () => void {
  addedListeners.add(listener);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startDomObserver, { once: true });
  else startDomObserver();
  return () => addedListeners.delete(listener);
}
