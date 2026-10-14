/**
 * page-navigation.ts — SPA route-change detection for the MAIN world.
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
