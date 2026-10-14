/**
 * page-route.ts — which X routes can collect media (MAIN world).
 * Same parser as the service worker and content script (usernameFromXUrl), so
 * page scripts skip work exactly where collected media would be dropped.
 */
import { usernameFromXUrl } from '../shared/validation.ts';

export function routeCollectsMedia(url = location.href): boolean {
  return usernameFromXUrl(url) !== null;
}
