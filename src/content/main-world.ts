/**
 * main-world.ts — single MAIN-world bundle for X.com.
 *
 * The page scripts share one page-bridge instance (and its private port), so
 * they are bundled together instead of being listed as separate files.
 * page-bridge must load first so its message listener precedes page scripts.
 */
import { sendToExtension } from './page-bridge.ts';
import { onNavigation } from './page-navigation.ts';
import './page-interceptor.ts';
import './dom-scanner.ts';
import './fab.ts';
import './tweet-btn.ts';
import './snackbar.ts';

onNavigation((url) => sendToExtension('XMD_NAVIGATED', { url }));
