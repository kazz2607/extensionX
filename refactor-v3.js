import fs from 'fs';

const lines = fs.readFileSync('src/background/service-worker.ts', 'utf-8').split('\n');
function getLines(start, end) {
  return lines.slice(start - 1, end).join('\n');
}

// 3. utils.ts
const utilsTs = `// @ts-nocheck
import { tabState, downloadState, mediaStore } from './state.ts';

${getLines(1530, 1605)}

${getLines(1506, 1511)} // sanitizeFolder

export { broadcastToPopup, broadcastToTab, updateBadge, updateFAB, broadcastFABState, sanitizeFolder, sleep, waitForTabLoad };
`;
fs.writeFileSync('src/background/utils.ts', utilsTs);

// 4. downloader.ts
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

// 7. service-worker.ts
const swTs = `// @ts-nocheck
import './messages.ts';
import { loadPersistedQueue, broadcastQueueUpdate } from './queue.ts';

// Khởi tải queue từ storage khi SW khởi động
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

console.log('Refactoring V3 complete!');
