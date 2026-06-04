import fs from 'fs';

const lines = fs.readFileSync('src/background/service-worker.ts', 'utf-8').split('\n');

let stateCode = `// @ts-nocheck\nexport const mediaStore = new Map();\nexport const dirtyMediaStore = new Map();\nexport const tabState = new Map();\nexport const statsStore = new Map();\nexport const downloadedStore = new Map();\nexport let downloadState = { inProgress: false };\nexport const pendingHlsRequests = new Map();\nexport const activeDownloads = new Map();\n`;
let queueCode = `// @ts-nocheck\nimport { mediaStore, downloadState } from './state.ts';\nimport { startDownload } from './downloader.ts';\nimport { broadcastToPopup } from './utils.ts';\n`;
let scraperCode = `// @ts-nocheck\nimport { mediaStore, dirtyMediaStore, statsStore, tabState, downloadState } from './state.ts';\nimport { fetchVideoForTweet } from './tweet-api.ts';\nimport { updateBadge, broadcastToPopup, updateFAB } from './utils.ts';\n`;
let downloaderCode = `// @ts-nocheck\nimport { mediaStore, downloadedStore, tabState, downloadState, pendingHlsRequests, activeDownloads } from './state.ts';\nimport { broadcastToPopup, isIdmHijack, maybeWarnIdm, getValidFilename } from './utils.ts';\n`;
let messagesCode = `// @ts-nocheck\nimport { mediaStore, statsStore, tabState, downloadedStore, downloadState, pendingHlsRequests } from './state.ts';\nimport { addMediaItems, applyOptionsFilter, checkAutoScroll, startCollecting, stopCollecting, clearSession, persistSession } from './scraper.ts';\nimport { startDownload, handleDownloadTweet, buildCSV } from './downloader.ts';\nimport { profileQueue, persistQueue, broadcastQueueUpdate, startNextInQueue } from './queue.ts';\nimport { updateBadge, broadcastToPopup, updateFAB } from './utils.ts';\nimport { fetchVideoForTweetWithRefresh } from './scraper.ts';\nimport { getMediaItems } from './indexeddb.ts';\n`;
let utilsCode = `// @ts-nocheck\n`;

// Simple manual splitting based on keywords.
// Actually, it's safer to just let the human agent (me) write the files explicitly using write_to_file.
