import fs from 'fs';

const lines = fs.readFileSync('src/background/service-worker.ts', 'utf-8').split('\n');
function getLines(start, end) {
  return lines.slice(start - 1, end).join('\n');
}

const stateTs = `// @ts-nocheck
export const mediaStore = new Map();
export const dirtyMediaStore = new Map();
export const tabState = new Map();
export const statsStore = new Map();
export const downloadedStore = new Map();
export let downloadState = { inProgress: false };
export const pendingHlsRequests = new Map();
export const activeDownloads = new Map();
export let userCsrfToken = '';
export function setCsrfToken(token) { userCsrfToken = token; }
`;
fs.writeFileSync('src/background/state.ts', stateTs);

const queueTs = `// @ts-nocheck
import { mediaStore, downloadState } from './state.ts';
import { startDownload } from './downloader.ts';
import { broadcastToPopup } from './utils.ts';
export let profileQueue = [];
export function setProfileQueue(q) { profileQueue = q; }

${getLines(63, 127)}

export { loadPersistedQueue, persistQueue, broadcastQueueUpdate, startNextInQueue };
`;
fs.writeFileSync('src/background/queue.ts', queueTs);

const utilsTs = `// @ts-nocheck
import { tabState, downloadState, mediaStore } from './state.ts';

${getLines(1530, 1605)}
${getLines(1506, 1511)} // sanitizeFolder

export { broadcastToPopup, broadcastToTab, updateBadge, updateFAB, broadcastFABState, sanitizeFolder, sleep, waitForTabLoad };
`;
fs.writeFileSync('src/background/utils.ts', utilsTs);

const downloaderTs = `// @ts-nocheck
import { mediaStore, downloadedStore, tabState, downloadState, pendingHlsRequests, activeDownloads } from './state.ts';
import { broadcastToPopup, broadcastToTab, sanitizeFolder, broadcastFABState } from './utils.ts';
import { showDownloadNotification, fetchVideoForTweetWithRefresh } from './scraper.ts';
import { startNextInQueue, profileQueue, persistQueue, broadcastQueueUpdate } from './queue.ts';

${getLines(129, 201)}
${getLines(1015, 1161)}
${getLines(1163, 1366)}
${getLines(1368, 1504)}
${getLines(1513, 1528)}

export { startDownload, handleDownloadTweet, activeErrors, buildCSV };
`;
fs.writeFileSync('src/background/downloader.ts', downloaderTs);

const scraperTs = `// @ts-nocheck
import { mediaStore, dirtyMediaStore, statsStore, tabState, downloadState, downloadedStore, userCsrfToken, setCsrfToken } from './state.ts';
import { fetchVideoForTweet } from './tweet-api.ts';
import { updateBadge, broadcastToPopup, updateFAB, broadcastFABState, sleep, waitForTabLoad, sanitizeFolder } from './utils.ts';
import { saveMediaItems, getMediaItems, clearMediaItems } from './indexeddb.ts';

${getLines(18, 44)}
${getLines(596, 1013)}

export {
  requestCsrfRefresh, fetchVideoForTweetWithRefresh,
  addMediaItems, applyOptionsFilter, tweetDateFromId,
  checkAutoScroll, startCollecting, stopCollecting, scrollLoop,
  persistSession, clearSession,
  loadDownloadedUrls, isAlreadyDownloaded, markDownloaded, showDownloadNotification
};
`;
fs.writeFileSync('src/background/scraper.ts', scraperTs);

const messagesTs = `// @ts-nocheck
import { mediaStore, statsStore, tabState, downloadedStore, downloadState, pendingHlsRequests, setCsrfToken } from './state.ts';
import { addMediaItems, applyOptionsFilter, checkAutoScroll, startCollecting, stopCollecting, clearSession, fetchVideoForTweetWithRefresh } from './scraper.ts';
import { startDownload, handleDownloadTweet, buildCSV } from './downloader.ts';
import { profileQueue, setProfileQueue, persistQueue, startNextInQueue, broadcastQueueUpdate } from './queue.ts';
import { updateBadge, broadcastToPopup, updateFAB } from './utils.ts';
import { getMediaItems } from './indexeddb.ts';

${getLines(203, 594).replace(/profileQueue = /g, 'setProfileQueue(').replace(/id\);/g, 'id));').replace(/downloading.\);/g, 'downloading.));')}
`;
fs.writeFileSync('src/background/messages.ts', messagesTs);

const swTs = `// @ts-nocheck
import './messages.ts';
import { loadPersistedQueue, broadcastQueueUpdate } from './queue.ts';

loadPersistedQueue().then(() => {
  broadcastQueueUpdate();
});

const KEEPALIVE_ALARM = 'sw-keepalive';
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_ALARM) {
    console.debug('[SW] keepalive ping');
  }
});
`;
fs.writeFileSync('src/background/service-worker.ts', swTs);

console.log('Refactoring FINAL complete!');
