// @ts-nocheck
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
