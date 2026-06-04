import fs from 'fs';

let content = fs.readFileSync('src/background/scraper.ts', 'utf-8');

// Imports
content = content.replace(
  "import { saveMediaItems, getMediaItems, clearMediaItems } from './indexeddb.ts';",
  "import { saveMediaItems, getMediaItems, clearMediaItems } from './indexeddb.ts';\nimport { MediaItem, Options, CollectState } from '../types.ts';"
);

// S1: CSRF
content = content.replace(/async function requestCsrfRefresh\(tabId\)/g, "async function requestCsrfRefresh(tabId: number)");
content = content.replace(/resolve\(res\?\.ct0 \|\| null\)/g, "resolve((res as any)?.ct0 || null)");
content = content.replace(/async function fetchVideoForTweetWithRefresh\(tweetId, tabId\)/g, "async function fetchVideoForTweetWithRefresh(tweetId: string, tabId?: number)");
content = content.replace(/if \(err\.message === 'CSRF_STALE' && tabId\)/g, "if ((err as Error).message === 'CSRF_STALE' && tabId)");
content = content.replace(/self\.userCsrfToken/g, "(self as any).userCsrfToken");

// Snowflake ID
content = content.replace(/function tweetDateFromId\(tweetId\)/g, "function tweetDateFromId(tweetId: string | number | undefined)");

// Add Media Items
content = content.replace(/function addMediaItems\(username, items\)/g, "function addMediaItems(username: string, items: MediaItem[])");
content = content.replace(/items\.forEach\(item =>/g, "items.forEach((item: MediaItem) =>");
content = content.replace(/const store = mediaStore\.get\(username\);/g, "const store = mediaStore.get(username)!;");
content = content.replace(/const stats = statsStore\.get\(username\);/g, "const stats = statsStore.get(username)!;");
content = content.replace(/dirtyMediaStore\.get\(username\)\.set/g, "dirtyMediaStore.get(username)!.set");

// Apply Options Filter
content = content.replace(/async function applyOptionsFilter\(username, items\)/g, "async function applyOptionsFilter(username: string, items: MediaItem[])");
content = content.replace(/let opts = \{\};/g, "let opts: Options = {};");
content = content.replace(/let filtered = items\.filter\(item =>/g, "let filtered = items.filter((item: MediaItem) =>");
content = content.replace(/filtered\.filter\(item =>/g, "filtered.filter((item: MediaItem) =>");

// Start / Stop Collecting
content = content.replace(/async function startCollecting\(username, tabId, isMediaPage\)/g, "async function startCollecting(username: string, tabId: number, isMediaPage?: boolean)");
content = content.replace(/tabState\.set\(tabId, \{/g, "tabState.set(tabId, {");
content = content.replace(/username, scrollCount: 0, isCollecting: true, reachedEnd: false/g, "username, scrollCount: 0, isCollecting: true, reachedEnd: false } as CollectState");

content = content.replace(/function stopCollecting\(username, tabId\)/g, "function stopCollecting(username: string, tabId: number)");
content = content.replace(/const state = tabState\.get\(tabId\);/g, "const state = tabState.get(tabId);");
content = content.replace(/if \(state\)/g, "if (state)");

// checkAutoScroll
content = content.replace(/async function checkAutoScroll\(tabId, username\)/g, "async function checkAutoScroll(tabId: number, username: string)");

// Session Restore
content = content.replace(/function persistSession\(username\)/g, "function persistSession(username: string)");
content = content.replace(/catch \(err\)/g, "catch (err: any)");
content = content.replace(/function clearSession\(username\)/g, "function clearSession(username: string)");
content = content.replace(/async function loadDownloadedUrls\(username\)/g, "async function loadDownloadedUrls(username: string)");
content = content.replace(/downloadedStore\.set\(username, new Set\(\)\);/g, "downloadedStore.set(username, new Set<string>());");
content = content.replace(/downloadedStore\.get\(username\)\.add\(url\);/g, "downloadedStore.get(username)!.add(url);");

// isAlreadyDownloaded
content = content.replace(/function isAlreadyDownloaded\(username, url\)/g, "function isAlreadyDownloaded(username: string, url: string)");
content = content.replace(/return downloadedStore\.get\(username\)\?\.has\(url\) \|\| false;/g, "return downloadedStore.get(username)?.has(url) || false;");
content = content.replace(/function markDownloaded\(username, url\)/g, "function markDownloaded(username: string, url: string)");

// showDownloadNotification
content = content.replace(/function showDownloadNotification\(username, success, failed, total, skipped\)/g, "function showDownloadNotification(username: string, success: number, failed: number, total: number, skipped: number)");

fs.writeFileSync('src/background/scraper.ts', content);
console.log('Fixed scraper.ts');
