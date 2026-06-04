import fs from 'fs';

const lines = fs.readFileSync('src/background/service-worker.ts', 'utf-8').split('\n');

function getLines(start, end) {
  return lines.slice(start - 1, end).join('\n');
}

const messagesTs = `// @ts-nocheck
import { mediaStore, statsStore, tabState, downloadedStore, downloadState, pendingHlsRequests, setCsrfToken } from './state.ts';
import { addMediaItems, applyOptionsFilter, checkAutoScroll, startCollecting, stopCollecting, clearSession, fetchVideoForTweetWithRefresh } from './scraper.ts';
import { startDownload, handleDownloadTweet, buildCSV } from './downloader.ts';
import { profileQueue, setProfileQueue, persistQueue, startNextInQueue, broadcastQueueUpdate } from './queue.ts';
import { updateBadge, broadcastToPopup, updateFAB } from './utils.ts';
import { getMediaItems } from './indexeddb.ts';

${getLines(203, 594)}
`;

fs.writeFileSync('src/background/messages.ts', messagesTs);
