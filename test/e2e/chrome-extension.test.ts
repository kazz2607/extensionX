import assert from 'node:assert/strict';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { chromium, type BrowserContext } from '@playwright/test';

const chromePath = process.env.PLAYWRIGHT_CHROME_EXECUTABLE ?? chromium.executablePath();

function mediaPage(username: string, suffix: string) {
  return `<!doctype html><html><head><title>${username}</title></head><body>
    <article><a href="/${username}/status/1850000000000000000"><time>now</time></a>
    <img src="https://pbs.twimg.com/media/${suffix}.jpg?name=small" />
    <img src="https://pbs.twimg.com/ext_tw_video_thumb/1850000000000000000/pu/img/${suffix}-poster.jpg?name=small" />
    </article>
  </body></html>`;
}

async function prepareTestExtension(): Promise<string> {
  const extensionDir = await mkdtemp(join(tmpdir(), 'extensionx-e2e-extension-'));
  await cp('dist', extensionDir, { recursive: true });
  return extensionDir;
}

async function extensionId(context: BrowserContext): Promise<string> {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  return new URL(worker.url()).host;
}

async function waitForCount(getCount: () => Promise<number>, expected: number): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if ((await getCount()) === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.equal(await getCount(), expected, 'media count did not reach expected value');
}

async function waitForQueueStatus(getStatus: () => Promise<string | null>, expected: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await getStatus()) === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(await getStatus(), expected, `Queue status did not reach ${expected}`);
}

async function closeExtensionWorker(context: BrowserContext, extensionId: string, page: import('@playwright/test').Page): Promise<void> {
  const cdp = await context.newCDPSession(page);
  const targets = await cdp.send('Target.getTargets');
  const workerTarget = targets.targetInfos.find((target) => target.type === 'service_worker' && target.url.startsWith(`chrome-extension://${extensionId}/`));
  assert.ok(workerTarget, 'extension service worker target was not found');
  await cdp.send('Target.closeTarget', { targetId: workerTarget.targetId });
  await cdp.detach();
}

test('Chrome extension fixture covers media collection and Queue lifecycle', { timeout: 90_000 }, async (t) => {
  const extensionDir = await prepareTestExtension();
  const profileDir = await mkdtemp(join(tmpdir(), 'extensionx-e2e-profile-'));
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: chromePath,
    headless: process.env.PLAYWRIGHT_HEADED !== 'true',
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`, '--no-first-run', '--enable-precise-memory-info'],
  });
  t.after(async () => {
    await context.close();
    await rm(extensionDir, { recursive: true, force: true });
    await rm(profileDir, { recursive: true, force: true });
  });
  await context.route('https://x.com/**', async (route) => {
    const [, username = 'Alice'] = new URL(route.request().url()).pathname.split('/');
    await route.fulfill({ status: 200, contentType: 'text/html', body: mediaPage(username, username.toLowerCase()) });
  });
  await context.route('https://web.telegram.org/**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body></body></html>',
  }));
  await context.route('https://pbs.twimg.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/jpeg', body: '' }));
  const id = await extensionId(context);
  const downloadCenter = await context.newPage();
  await downloadCenter.goto(`chrome-extension://${id}/download-center/download-center.html`);
  assert.equal(await downloadCenter.locator('h1').textContent(), 'Download Center');
  await downloadCenter.locator('#summary-waiting').waitFor();

  const alice = await context.newPage();
  const bob = await context.newPage();
  await Promise.all([alice.goto('https://x.com/Alice/media'), bob.goto('https://x.com/Bob/media')]);

  const options = await context.newPage();
  await options.goto(`chrome-extension://${id}/options/options.html`);
  async function count(username: string): Promise<number> {
    return options.evaluate(async (name) => {
      const response = await chrome.runtime.sendMessage({ type: 'GET_MEDIA_COUNT', payload: { username: name } });
      return response.count;
    }, username);
  }
  await waitForCount(() => count('Alice'), 1);
  await waitForCount(() => count('Bob'), 1);

  // Popup messages have no sender.tab. Manual collection must resolve the
  // exact profile tab from PAGE_LOADED state and acknowledge only after the
  // collector has actually started.
  const manualStart = await options.evaluate(() => chrome.runtime.sendMessage({ type: 'START_COLLECTING', payload: { username: 'Alice' } }));
  t.diagnostic(`Manual collection response: ${JSON.stringify(manualStart)}`);
  assert.equal(manualStart.ok, true);
  const collectingState = await options.evaluate(() => chrome.runtime.sendMessage({ type: 'GET_TAB_STATE', payload: { username: 'Alice' } }));
  assert.equal(collectingState.isCollecting, true);
  await options.evaluate(() => chrome.runtime.sendMessage({ type: 'STOP_COLLECTING', payload: { username: 'Alice' } }));

  await alice.evaluate(() => {
    history.pushState({}, '', '/Alice/media?page=2');
    const article = document.createElement('article');
    article.innerHTML = '<a href="/Alice/status/1850000000000000001"><time>now</time></a><img src="https://pbs.twimg.com/media/alice-next.jpg?name=small">';
    document.body.append(article);
  });
  await waitForCount(() => count('Alice'), 2);
  assert.equal(await count('Bob'), 1);
  // Media persistence is intentionally debounced; allow the dirty batch to
  // reach IndexedDB before terminating the worker.
  await new Promise((resolve) => setTimeout(resolve, 2_500));

  async function queueStatus(id: string): Promise<string | null> {
    return options.evaluate(async (queueId) => {
      const response = await chrome.runtime.sendMessage({ type: 'GET_QUEUE', payload: {} });
      const item = response.queue?.find((entry: { id: string }) => entry.id === queueId);
      return item?.status ?? null;
    }, id);
  }

  // A service-worker restart must migrate an interrupted v2 item to the
  // explicit v3 paused state and must never auto-resume it.
  const interruptedId = 'Alice_restart';
  await options.evaluate(async ({ id: queueId }) => {
    await chrome.storage.local.set({
      profile_queue: {
        schemaVersion: 2,
        items: [{
          id: queueId, username: 'Alice', filterType: 'all', skipDuplicates: true,
          addedAt: Date.now(), status: 'downloading', mediaCount: 2, result: null,
        }],
      },
    });
  }, { id: interruptedId });
  const cdp = await context.newCDPSession(options);
  const targets = await cdp.send('Target.getTargets');
  const workerTarget = targets.targetInfos.find((target) => target.type === 'service_worker' && target.url.startsWith(`chrome-extension://${id}/`));
  assert.ok(workerTarget, 'extension service worker target was not found');
  await cdp.send('Target.closeTarget', { targetId: workerTarget.targetId });
  await cdp.detach();
  await waitForQueueStatus(() => queueStatus(interruptedId), 'paused');
  await options.evaluate(() => chrome.runtime.sendMessage({ type: 'CLEAR_QUEUE', payload: {} }));

  // Starting twice may acknowledge both messages while storage is loading,
  // but coordinator ownership must still result in exactly one active job.
  const queueId = await options.evaluate(async () => {
    const added = await chrome.runtime.sendMessage({
      type: 'ADD_TO_QUEUE',
      payload: { username: 'Alice', filterType: 'all', skipDuplicates: true, keyword: '' },
    });
    return added.queue?.find((item: { username: string }) => item.username === 'Alice')?.id as string;
  });
  assert.ok(queueId);
  await options.evaluate(() => Promise.all([
    chrome.runtime.sendMessage({ type: 'START_QUEUE', payload: {} }),
    chrome.runtime.sendMessage({ type: 'START_QUEUE', payload: {} }),
  ]));
  await waitForQueueStatus(() => queueStatus(queueId), 'downloading');
  const activeCount = await options.evaluate(async () => {
    const response = await chrome.runtime.sendMessage({ type: 'GET_QUEUE', payload: {} });
    return response.queue.filter((item: { status: string }) => item.status === 'downloading').length;
  });
  assert.equal(activeCount, 1);

  await options.evaluate(() => chrome.runtime.sendMessage({ type: 'STOP_DOWNLOAD', payload: {} }));
  await waitForQueueStatus(() => queueStatus(queueId), 'paused');

  // Mark fixture media as already downloaded, then restart the worker again so
  // the resumed operation loads the persisted dedupe index. This exercises the
  // terminal all-deduped path without depending on Chromium's download shelf.
  await options.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('XMediaDownloaderDB', 3);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const media = await new Promise<Array<{ url: string }>>((resolve, reject) => {
      const request = db.transaction('media_items', 'readonly').objectStore('media_items').index('username').getAll('Alice');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('downloaded_urls', 'readwrite');
      const store = tx.objectStore('downloaded_urls');
      for (const item of media) {
        const parsed = new URL(item.url);
        const name = parsed.searchParams.get('name') || '';
        const format = parsed.searchParams.get('format') || '';
        const normalized = name || format
          ? `${parsed.origin}${parsed.pathname}?name=${name}&format=${format}`
          : `${parsed.origin}${parsed.pathname}`;
        store.put({ id: `Alice:${normalized}`, username: 'Alice', url: normalized, addedAt: Date.now() });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  const restartCdp = await context.newCDPSession(options);
  const restartTargets = await restartCdp.send('Target.getTargets');
  const restartWorker = restartTargets.targetInfos.find((target) => target.type === 'service_worker' && target.url.startsWith(`chrome-extension://${id}/`));
  assert.ok(restartWorker, 'extension service worker target was not found before resume');
  await restartCdp.send('Target.closeTarget', { targetId: restartWorker.targetId });
  await restartCdp.detach();

  await options.evaluate(() => chrome.runtime.sendMessage({ type: 'START_QUEUE', payload: {} }));
  await waitForQueueStatus(() => queueStatus(queueId), 'done', 30_000);

  // Telegram's canvas/data URL path must download inside the originating tab;
  // sending it through runtime messaging would exceed the message-size limit.
  const telegram = await context.newPage();
  await telegram.goto('https://web.telegram.org/k/');
  await telegram.evaluate(() => {
    const wrapper = document.createElement('div');
    wrapper.className = 'message-media';
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    canvas.getContext('2d')?.fillRect(0, 0, 200, 200);
    wrapper.append(canvas);
    document.body.append(wrapper);
  });
  const telegramButton = telegram.locator('.message-media .ext-x-tg-download-btn');
  await telegramButton.waitFor();
  const [telegramDownload] = await Promise.all([
    telegram.waitForEvent('download'),
    telegramButton.click(),
  ]);
  assert.match(telegramDownload.suggestedFilename(), /^telegram_image_\d+\.jpg$/);
});

test('P0 Queue acceptance covers scale, preparing restart, and Downloads callback timeout', { timeout: 120_000 }, async (t) => {
  const extensionDir = await prepareTestExtension();
  const profileDir = await mkdtemp(join(tmpdir(), 'extensionx-p0-profile-'));
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: chromePath,
    headless: process.env.PLAYWRIGHT_HEADED !== 'true',
    acceptDownloads: true,
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`, '--no-first-run', '--enable-precise-memory-info'],
  });
  t.after(async () => {
    await context.close();
    await rm(extensionDir, { recursive: true, force: true });
    await rm(profileDir, { recursive: true, force: true });
  });
  await context.route('https://pbs.twimg.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/jpeg', body: 'fixture' }));
  const id = await extensionId(context);
  const options = await context.newPage();
  await options.goto(`chrome-extension://${id}/options/options.html`);
  const heapBefore = await options.evaluate(() => (performance as Performance & { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize);

  async function seedProfile(username: string, count: number, downloaded: boolean): Promise<void> {
    await options.evaluate(async ({ name, size, markDownloaded }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('XMediaDownloaderDB', 3);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['media_items', 'downloaded_urls'], 'readwrite');
        const media = tx.objectStore('media_items');
        const completed = tx.objectStore('downloaded_urls');
        for (let index = 0; index < size; index++) {
          const url = `https://pbs.twimg.com/media/${name}-${index}.jpg`;
          media.put({ id: `${name}:${url}`, username: name, type: 'image', url, tweetDate: Date.now() });
          if (markDownloaded) completed.put({ id: `${name}:${url}`, username: name, url, addedAt: Date.now() });
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    }, { name: username, size: count, markDownloaded: downloaded });
  }

  async function addQueue(username: string): Promise<string> {
    return options.evaluate(async (name) => {
      const response = await chrome.runtime.sendMessage({
        type: 'ADD_TO_QUEUE', payload: { username: name, filterType: 'all', skipDuplicates: true, keyword: '' },
      });
      return response.queue.find((item: { username: string }) => item.username === name).id;
    }, username);
  }

  async function queueItem(queueId: string): Promise<{ status: string; mediaCount: number; result?: { failed: number; skipped: number } } | null> {
    return options.evaluate(async (targetId) => {
      const response = await chrome.runtime.sendMessage({ type: 'GET_QUEUE', payload: {} });
      return response.queue.find((item: { id: string }) => item.id === targetId) ?? null;
    }, queueId);
  }

  // Empty profile must fail deterministically and allow the next Queue item to run.
  const emptyId = await addQueue('EmptyProfile');
  await options.evaluate(() => chrome.runtime.sendMessage({ type: 'START_QUEUE', payload: {} }));
  await waitForQueueStatus(async () => (await queueItem(emptyId))?.status ?? null, 'error');

  // Hundreds and thousands of persisted media exercise cold IndexedDB loading.
  for (const [username, size] of [['Scale100', 100], ['Scale1000', 1_000]] as const) {
    await seedProfile(username, size, true);
    const queueId = await addQueue(username);
    await options.evaluate(() => chrome.runtime.sendMessage({ type: 'START_QUEUE', payload: {} }));
    await waitForQueueStatus(async () => (await queueItem(queueId))?.status ?? null, 'done', 30_000);
    const item = await queueItem(queueId);
    assert.equal(item?.mediaCount, 0);
    assert.equal(item?.result?.skipped, size);
  }

  // Keep getAll busy long enough to observe and terminate the worker in preparing.
  await seedProfile('PreparingRestart', 20_000, true);
  const pickerResult = await options.evaluate(() => chrome.runtime.sendMessage({
    type: 'GET_MEDIA_ITEMS_FILTERED', payload: { username: 'PreparingRestart', filterType: 'all' },
  }));
  assert.equal(pickerResult.items.length, 200);
  assert.equal(pickerResult.total, 20_000);
  const csvResult = await options.evaluate(() => chrome.runtime.sendMessage({
    type: 'EXPORT_CSV', payload: { username: 'PreparingRestart', filterType: 'all', offset: 0 },
  }));
  assert.equal(csvResult.total, 20_000);
  assert.equal(csvResult.exported, 10_000);
  assert.equal(csvResult.truncated, true);
  const manifestResult = await options.evaluate(() => chrome.runtime.sendMessage({
    type: 'EXPORT_MANIFEST', payload: { username: 'PreparingRestart' },
  }));
  assert.equal(manifestResult.total, 20_000);
  assert.equal(manifestResult.exported, 10_000);
  assert.equal(manifestResult.truncated, true);
  const heapAfter = await options.evaluate(() => (performance as Performance & { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize);
  const heapDelta = heapAfter - heapBefore;
  assert.ok(heapAfter <= 128 * 1024 * 1024, `Chrome heap ${heapAfter} exceeded 128 MiB`);
  assert.ok(heapDelta <= 32 * 1024 * 1024, `Chrome heap delta ${heapDelta} exceeded 32 MiB`);
  t.diagnostic(`Chrome heap: before=${heapBefore}, after=${heapAfter}, delta=${heapDelta}`);
  const preparingId = await addQueue('PreparingRestart');
  await options.evaluate(() => chrome.runtime.sendMessage({ type: 'START_QUEUE', payload: {} }));
  const preparingDeadline = Date.now() + 10_000;
  let observedPreparing = false;
  while (Date.now() < preparingDeadline) {
    const state = await options.evaluate(() => chrome.runtime.sendMessage({ type: 'GET_DOWNLOAD_STATE', payload: {} }));
    if (state.phase === 'preparing') { observedPreparing = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(observedPreparing, true, 'Queue operation never exposed the preparing phase');
  await closeExtensionWorker(context, id, options);
  await waitForQueueStatus(async () => (await queueItem(preparingId))?.status ?? null, 'paused', 30_000);
  await options.evaluate(() => chrome.runtime.sendMessage({ type: 'CLEAR_QUEUE', payload: {} }));

  // Exercise the production callback wrapper: no callback must time out, mark
  // the item error, and release the coordinator so the following item runs.
  await seedProfile('TimeoutProfile', 1, false);
  const timeoutId = await addQueue('TimeoutProfile');
  const followingEmptyId = await addQueue('AfterTimeout');
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  await worker.evaluate(() => {
    const nativeSetTimeout = globalThis.setTimeout.bind(globalThis);
    globalThis.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) =>
      nativeSetTimeout(handler, delay === 90_000 ? 25 : delay, ...args)) as typeof setTimeout;
    chrome.downloads.download = (() => undefined) as typeof chrome.downloads.download;
  });
  await options.evaluate(() => chrome.runtime.sendMessage({ type: 'START_QUEUE', payload: {} }));
  await waitForQueueStatus(async () => (await queueItem(timeoutId))?.status ?? null, 'error', 15_000);
  await waitForQueueStatus(async () => (await queueItem(followingEmptyId))?.status ?? null, 'error', 15_000);
  assert.equal((await queueItem(timeoutId))?.result?.failed, 1);

  const clearedStorage = await options.evaluate(() => chrome.runtime.sendMessage({ type: 'CLEAR_ALL_PROFILE_STORAGE', payload: {} }));
  assert.equal(clearedStorage.ok, true);
  assert.equal(clearedStorage.summary.totalMediaItems, 0);
  assert.equal(clearedStorage.summary.totalDownloadedUrls, 0);
  assert.equal(clearedStorage.summary.profiles.length, 0);
});

test('P1 Queue DOM and long-task budget covers 500 rows', { timeout: 60_000 }, async (t) => {
  const extensionDir = await prepareTestExtension();
  const profileDir = await mkdtemp(join(tmpdir(), 'extensionx-p1-dom-profile-'));
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: chromePath,
    headless: process.env.PLAYWRIGHT_HEADED !== 'true',
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`, '--no-first-run', '--enable-precise-memory-info'],
  });
  t.after(async () => {
    await context.close();
    await rm(extensionDir, { recursive: true, force: true });
    await rm(profileDir, { recursive: true, force: true });
  });
  const id = await extensionId(context);
  const setup = await context.newPage();
  await setup.goto(`chrome-extension://${id}/options/options.html`);
  await setup.evaluate(async () => {
    const items = Array.from({ length: 500 }, (_, index) => ({
      id: `Bench${index}_${index}`,
      username: `Bench${index}`,
      filterType: 'all', skipDuplicates: true, addedAt: index + 1,
      status: index % 5 === 0 ? 'error' : index % 7 === 0 ? 'done' : 'waiting',
      mediaCount: 10,
      result: index % 5 === 0 ? { success: 0, failed: 1, total: 1, skipped: 0, error: 'Fixture failure' } : null,
    }));
    await chrome.storage.local.set({ profile_queue: { schemaVersion: 3, items } });
  });
  await closeExtensionWorker(context, id, setup);
  const popup = await context.newPage();
  await popup.addInitScript(() => {
    (globalThis as typeof globalThis & { __queueLongTasks?: number[] }).__queueLongTasks = [];
    new PerformanceObserver((list) => {
      (globalThis as typeof globalThis & { __queueLongTasks: number[] }).__queueLongTasks.push(...list.getEntries().map((entry) => entry.duration));
    }).observe({ type: 'longtask', buffered: true });
  });
  await popup.goto(`chrome-extension://${id}/popup/popup.html`);
  await popup.evaluate(() => { (globalThis as typeof globalThis & { __queueLongTasks: number[] }).__queueLongTasks = []; });
  const renderMs = await popup.evaluate(async () => {
    const startedAt = performance.now();
    document.getElementById('nav-queue')?.click();
    while (document.querySelectorAll('.queue-item').length < 50) {
      await new Promise(requestAnimationFrame);
    }
    return performance.now() - startedAt;
  });
  const metrics = await popup.evaluate(() => ({
    rows: document.querySelectorAll('.queue-item').length,
    maxLongTaskMs: Math.max(0, ...(globalThis as typeof globalThis & { __queueLongTasks?: number[] }).__queueLongTasks || []),
    heap: (performance as Performance & { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize,
  }));
  assert.equal(metrics.rows, 50);
  assert.equal(await popup.locator('.queue-load-more').textContent(), 'Show more (450)');
  assert.ok(renderMs < 300, `Queue render ${renderMs}ms exceeded 300ms`);
  assert.ok(metrics.maxLongTaskMs < 50, `Queue long task ${metrics.maxLongTaskMs}ms exceeded 50ms`);
  assert.ok(metrics.heap < 64 * 1024 * 1024, `Queue heap ${metrics.heap} exceeded 64 MiB`);
  await popup.locator('#nav-queue').click();
  await popup.locator('#panel-queue.active').waitFor();
  const secondRow = popup.locator('.queue-item').nth(1);
  await secondRow.locator('.queue-select').check({ force: true });
  await popup.locator('.queue-bulk-menu').evaluate((element: HTMLDetailsElement) => { element.open = true; });
  await popup.locator('[data-bulk-action="pause_selected"]').click();
  await popup.locator('.queue-item.status-paused').filter({ hasText: '@Bench1' }).waitFor();
  await popup.locator('.queue-bulk-menu').evaluate((element: HTMLDetailsElement) => { element.open = true; });
  await popup.locator('[data-bulk-action="clear_completed"]').click();
  const remainingStatuses = await popup.evaluate(async () => {
    const response = await chrome.runtime.sendMessage({ type: 'GET_QUEUE', payload: {} });
    return response.queue.map((item: { status: string }) => item.status);
  });
  assert.equal(remainingStatuses.includes('done'), false);
  await popup.locator('.queue-bulk-menu').evaluate((element: HTMLDetailsElement) => { element.open = true; });
  await popup.locator('[data-bulk-action="undo_clear_completed"]').click();
  const restoredStatuses = await popup.evaluate(async () => {
    const response = await chrome.runtime.sendMessage({ type: 'GET_QUEUE', payload: {} });
    return response.queue.map((item: { status: string }) => item.status);
  });
  assert.equal(restoredStatuses.includes('done'), true);
  assert.equal(await popup.locator('.queue-result-details').count() > 0, true);
  t.diagnostic(`Queue DOM: render=${renderMs}ms, maxLongTask=${metrics.maxLongTaskMs}ms, heap=${metrics.heap}`);
});

test('P1 responsive, keyboard and screenshot acceptance covers every primary surface', { timeout: 60_000 }, async (t) => {
  const extensionDir = await prepareTestExtension();
  const profileDir = await mkdtemp(join(tmpdir(), 'extensionx-a11y-profile-'));
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: chromePath,
    headless: process.env.PLAYWRIGHT_HEADED !== 'true',
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`, '--no-first-run'],
  });
  t.after(async () => {
    await context.close();
    await rm(extensionDir, { recursive: true, force: true });
    await rm(profileDir, { recursive: true, force: true });
  });
  const id = await extensionId(context);
  const popup = await context.newPage({ viewport: { width: 400, height: 700 } });
  await popup.goto(`chrome-extension://${id}/popup/popup.html`);
  await popup.locator('#nav-main').waitFor();
  // v7.4.0: English is the default language and the light theme is really light
  // (the confirm dialog used to keep a hard-coded dark background).
  assert.equal(await popup.evaluate(() => document.documentElement.lang), 'en');
  await popup.evaluate(() => chrome.storage.local.set({ theme: 'light' }));
  await popup.reload();
  await popup.locator('#nav-main').waitFor();
  const lightTheme = await popup.evaluate(() => {
    const luminance = (color: string) => {
      const [r, g, b] = (color.match(/\d+(\.\d+)?/g) ?? ['0', '0', '0']).slice(0, 3).map(Number);
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    };
    const box = document.querySelector('.confirm-box');
    return {
      theme: document.documentElement.dataset.theme,
      body: luminance(getComputedStyle(document.body).backgroundColor),
      confirm: box ? luminance(getComputedStyle(box).backgroundColor) : 1,
    };
  });
  assert.equal(lightTheme.theme, 'light');
  assert.ok(lightTheme.body > 0.85 && lightTheme.confirm > 0.85, `light theme surfaces are dark: ${JSON.stringify(lightTheme)}`);
  await popup.evaluate(() => chrome.storage.local.set({ theme: 'dark' }));
  await popup.reload();
  await popup.locator('#nav-main').waitFor();
  const surfaces = [
    ['main', '#nav-main', '#panel-main'],
    ['picker', '#nav-picker', '#panel-picker'],
    ['queue', '#nav-queue', '#panel-queue'],
    ['stats', '#nav-stats', '#panel-stats'],
    ['following', '#nav-cleanup', '#panel-cleanup'],
  ] as const;
  for (const width of [320, 360, 400]) {
    await popup.setViewportSize({ width, height: 700 });
    for (const [name, tab, panel] of surfaces) {
      await popup.locator(tab).click();
      assert.equal(await popup.locator(tab).getAttribute('aria-selected'), 'true');
      assert.equal(await popup.locator(panel).getAttribute('role'), 'tabpanel');
      const overflow = await popup.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, `${name} overflows horizontally at ${width}px by ${overflow}px`);
      const screenshot = await popup.screenshot({ animations: 'disabled' });
      assert.ok(screenshot.byteLength > 5_000, `${name} screenshot at ${width}px is unexpectedly empty`);
    }
  }
  await popup.locator('#nav-main').focus();
  await popup.keyboard.press('ArrowRight');
  assert.equal(await popup.locator('#nav-picker').getAttribute('aria-selected'), 'true');
  await popup.evaluate(async () => {
    const queue = Array.from({ length: 500 }, (_, index) => ({
      id: `bench_${index}`, username: `Bench${index}`, filterType: 'all', skipDuplicates: true,
      addedAt: Date.now() - index, status: index % 5 === 0 ? 'done' : 'waiting', mediaCount: index, result: null,
    }));
    const entries = Array.from({ length: 500 }, (_, index) => ({
      username: `Bench${index}`, count: index, filter: 'all', date: new Date(Date.now() - index * 1000).toISOString(), status: 'completed',
    }));
    await chrome.storage.local.set({
      profile_queue: { schemaVersion: 3, items: queue },
      download_history_v2: { schemaVersion: 2, entries },
      download_history: entries.slice(0, 20),
    });
  });
  await closeExtensionWorker(context, id, popup);
  const center = await context.newPage({ viewport: { width: 360, height: 760 } });
  await center.addInitScript(() => {
    (globalThis as typeof globalThis & { __longTasks?: number[] }).__longTasks = [];
    new PerformanceObserver((list) => {
      (globalThis as typeof globalThis & { __longTasks?: number[] }).__longTasks?.push(...list.getEntries().map((entry) => entry.duration));
    }).observe({ type: 'longtask', buffered: true });
  });
  const centerStarted = Date.now();
  await center.goto(`chrome-extension://${id}/download-center/download-center.html`);
  await center.locator('#queue-list .item').first().waitFor();
  const centerRenderMs = Date.now() - centerStarted;
  assert.equal(await center.locator('#queue-list .item').count(), 50);
  assert.equal(await center.locator('#history-list .item').count(), 50);
  assert.ok(centerRenderMs < 2_000, `Download Center initial render ${centerRenderMs}ms exceeds 2000ms navigation budget`);
  await center.evaluate(() => { (globalThis as typeof globalThis & { __longTasks?: number[] }).__longTasks = []; });
  await center.locator('#btn-refresh').click();
  await center.waitForTimeout(500);
  const maxCenterLongTask = await center.evaluate(() => Math.max(0, ...((globalThis as typeof globalThis & { __longTasks?: number[] }).__longTasks ?? [])));
  assert.ok(maxCenterLongTask < 50, `Download Center long task ${maxCenterLongTask}ms exceeds 50ms`);
  assert.ok((await center.screenshot({ animations: 'disabled' })).byteLength > 5_000);
  const centerOverflow = await center.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(centerOverflow <= 1, `Download Center overflows horizontally by ${centerOverflow}px`);
  const startQueueMs = await center.evaluate(async () => {
    const started = performance.now();
    await chrome.runtime.sendMessage({ type: 'START_QUEUE', payload: {} });
    const elapsed = performance.now() - started;
    await chrome.runtime.sendMessage({ type: 'STOP_DOWNLOAD', payload: {} });
    return elapsed;
  });
  assert.ok(startQueueMs < 500, `START_QUEUE acknowledgement ${startQueueMs}ms exceeds 500ms`);
  const optionsPage = await context.newPage({ viewport: { width: 620, height: 760 } });
  await optionsPage.goto(`chrome-extension://${id}/options/options.html`);
  await optionsPage.locator('#btn-clear-all-storage').waitFor();
  for (const width of [400, 620]) {
    await optionsPage.setViewportSize({ width, height: 760 });
    const metrics = await optionsPage.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      copyWidth: document.querySelector('.storage-copy')?.getBoundingClientRect().width ?? 0,
      summaryWidth: document.getElementById('storage-summary')?.getBoundingClientRect().width ?? 0,
    }));
    assert.ok(metrics.overflow <= 1, `Options storage section overflows at ${width}px by ${metrics.overflow}px`);
    assert.ok(metrics.copyWidth >= width - 90, `Options storage copy is squeezed to ${metrics.copyWidth}px at ${width}px`);
    assert.ok(metrics.summaryWidth >= width - 90, `Options storage summary is squeezed to ${metrics.summaryWidth}px at ${width}px`);
    assert.ok((await optionsPage.screenshot({ animations: 'disabled' })).byteLength > 5_000);
  }
  t.diagnostic(`Captured 15 popup + 2 Options screenshots; Download Center=${centerRenderMs}ms, maxLongTask=${maxCenterLongTask}ms, START_QUEUE=${startQueueMs}ms`);
});

test('v7.2.3 offscreen blobs are saved by the service worker, not chrome.downloads in offscreen', { timeout: 60_000 }, async (t) => {
  const extensionDir = await prepareTestExtension();
  const profileDir = await mkdtemp(join(tmpdir(), 'extensionx-offscreen-profile-'));
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: chromePath,
    headless: process.env.PLAYWRIGHT_HEADED !== 'true',
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`, '--no-first-run'],
  });
  t.after(async () => {
    await context.close();
    await rm(extensionDir, { recursive: true, force: true });
    await rm(profileDir, { recursive: true, force: true });
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  await worker.evaluate(() => chrome.offscreen.createDocument({ url: 'offscreen/offscreen.html', reasons: ['BLOBS'], justification: 'acceptance' }));
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const { targetInfos } = await cdp.send('Target.getTargets');
  const offscreen = targetInfos.find((target) => target.url.endsWith('/offscreen/offscreen.html'));
  assert.ok(offscreen, 'offscreen document target was not found');
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: offscreen.targetId, flatten: false });
  let nextId = 1;
  const evaluateOffscreen = (expression: string) => new Promise<unknown>((resolve) => {
    const id = nextId++;
    cdp.on('Target.receivedMessageFromTarget', (event) => {
      const reply = JSON.parse(event.message) as { id?: number; result?: { result?: { value?: unknown } } };
      if (reply.id === id) resolve(reply.result?.result?.value);
    });
    void cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true } }) });
  });

  // The platform restriction that broke HLS/ZIP in v7.0.1–v7.2.2.
  assert.equal(await evaluateOffscreen('typeof chrome.downloads'), 'undefined');
  const saved = JSON.parse(String(await evaluateOffscreen(`(async () => {
    const url = URL.createObjectURL(new Blob([new Uint8Array(4096)], { type: 'video/mp2t' }));
    try {
      return JSON.stringify(await chrome.runtime.sendMessage({ type: 'OFFSCREEN_SAVE_BLOB', payload: { url, filename: 'acceptance/hls.ts', username: 'acceptance' } }));
    } finally { URL.revokeObjectURL(url); }
  })()`))) as { downloadId?: number; error?: string };
  assert.ok(saved.downloadId, `offscreen save failed: ${saved.error}`);
  const download = await worker.evaluate((id) => new Promise<{ state: string; bytes: number }>((resolve) => {
    chrome.downloads.search({ id }, (items) => resolve({ state: items[0]?.state ?? '', bytes: items[0]?.bytesReceived ?? 0 }));
  }), saved.downloadId);
  assert.deepEqual(download, { state: 'complete', bytes: 4096 });

  // P14: JSZip is a lazily imported chunk; it must still load inside the
  // offscreen document and produce a ZIP blob.
  const zipBytes = await evaluateOffscreen(`(async () => {
    await import('../jszip.min.js');
    const zip = new globalThis.JSZip();
    zip.file('a.txt', 'hello');
    return (await zip.generateAsync({ type: 'blob' })).size;
  })()`);
  assert.ok(typeof zipBytes === 'number' && zipBytes > 0, `lazy JSZip did not produce a ZIP: ${String(zipBytes)}`);

  // Extension pages and tabs cannot use the offscreen-only save channel.
  const options = await context.newPage();
  await options.goto(`chrome-extension://${new URL(worker.url()).host}/options/options.html`);
  const rejected = await options.evaluate(() => chrome.runtime.sendMessage({ type: 'OFFSCREEN_SAVE_BLOB', payload: { url: 'blob:chrome-extension://x/1', filename: 'a.ts' } }));
  assert.ok((rejected as { error?: string }).error, 'extension page reached the offscreen save channel');

  // Offscreen work is driven by the service worker only.
  const fromWorker = await worker.evaluate(() => chrome.runtime.sendMessage({ target: 'offscreen', type: 'CANCEL_HLS', requestId: 'none' }));
  assert.deepEqual(fromWorker, { cancelled: false });
  const fromPage = await options.evaluate(() => chrome.runtime.sendMessage({ target: 'offscreen', type: 'CANCEL_HLS', requestId: 'none' }).catch(() => 'no-receiver'));
  assert.notDeepEqual(fromPage, { cancelled: false }, 'an extension page drove the offscreen document');
});

test('v7.3.0 page scripts cannot read or forge the extension bridge; SPA navigation reaches the worker', { timeout: 60_000 }, async (t) => {
  const extensionDir = await prepareTestExtension();
  const profileDir = await mkdtemp(join(tmpdir(), 'extensionx-bridge-profile-'));
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: chromePath,
    headless: process.env.PLAYWRIGHT_HEADED !== 'true',
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`, '--no-first-run'],
  });
  t.after(async () => {
    await context.close();
    await rm(extensionDir, { recursive: true, force: true });
    await rm(profileDir, { recursive: true, force: true });
  });
  // A hostile inline script that runs as early as any X script can.
  const hostile = `<script>
    window.__stolenPorts = 0;
    window.addEventListener('message', (e) => { if (e.ports && e.ports.length && !(e.data && e.data.forged)) window.__stolenPorts++; }, true);
    const fake = new MessageChannel();
    fake.port1.onmessage = (e) => { window.__leaked = (window.__leaked || 0) + 1; };
    window.postMessage({ __xmdBridge: 'port', forged: true }, location.origin, [fake.port2]);
  </script>`;
  await context.route('https://x.com/**', async (route) => {
    const [, username = 'Carol'] = new URL(route.request().url()).pathname.split('/');
    const body = mediaPage(username, username.toLowerCase()).replace('<head>', `<head>${hostile}`);
    await route.fulfill({ status: 200, contentType: 'text/html', body });
  });
  await context.route('https://pbs.twimg.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/jpeg', body: '' }));
  const id = await extensionId(context);
  const carol = await context.newPage();
  await carol.goto('https://x.com/Carol/media');
  const options = await context.newPage();
  await options.goto(`chrome-extension://${id}/options/options.html`);
  const send = (message: unknown) => options.evaluate((m) => chrome.runtime.sendMessage(m), message);
  const mediaCount = async () => (await send({ type: 'GET_MEDIA_COUNT', payload: { username: 'Carol' } }) as { count: number }).count;
  const isCollecting = async () => (await send({ type: 'GET_TAB_STATE', payload: { username: 'Carol' } }) as { isCollecting: boolean }).isCollecting;
  await waitForCount(mediaCount, 1);

  // Legacy window events and a forged port no longer reach the service worker.
  await carol.evaluate(() => {
    window.dispatchEvent(new CustomEvent('XMD_FAB_ACTION', { detail: { action: 'START_COLLECTING' } }));
    window.dispatchEvent(new CustomEvent('X_MEDIA_FOUND', { detail: { mediaItems: [{ type: 'image', url: 'https://pbs.twimg.com/media/forged.jpg', tweetId: '1850000000000000009' }] } }));
  });
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  assert.equal(await isCollecting(), false, 'a page event started collection');
  assert.equal(await mediaCount(), 1, 'a page event injected media');
  const pageView = await carol.evaluate(() => ({
    stolen: (window as unknown as { __stolenPorts: number }).__stolenPorts,
    leaked: (window as unknown as { __leaked?: number }).__leaked ?? 0,
  }));
  assert.deepEqual(pageView, { stolen: 0, leaked: 0 }, 'page saw the bridge port or received bridge traffic');

  // The real FAB still drives the worker, and worker updates still reach the FAB.
  // FAB/snackbar live in closed shadow roots: invisible to page scripts.
  const pageSeesFab = await carol.evaluate(() => ({
    badge: document.getElementById('__xmd_badge__') !== null,
    shadowRoot: document.getElementById('__xmd_fab_host__')?.shadowRoot ?? null,
    hostMounted: document.getElementById('__xmd_fab_host__') !== null,
  }));
  assert.deepEqual(pageSeesFab, { badge: false, shadowRoot: null, hostMounted: true });
  // U13: X mounts #layers late and deep inside #react-root; opening a modal
  // there hides the FAB and closing it shows the FAB again.
  const fabDisplay = () => carol.evaluate(() => (document.getElementById('__xmd_fab_host__') as HTMLElement).style.display);
  const waitForFabDisplay = async (expected: string) => {
    const deadline = Date.now() + 5_000;
    while ((await fabDisplay()) !== expected && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(await fabDisplay(), expected, `FAB display should be '${expected}'`);
  };
  await carol.evaluate(() => {
    const root = document.createElement('div');
    root.id = 'react-root';
    root.innerHTML = '<div><div id="fixture-shell"></div></div>';
    document.body.append(root);
  });
  await new Promise((resolve) => setTimeout(resolve, 200));
  // #layers appears later, nested — not as a direct child of <body>.
  await carol.evaluate(() => {
    const layers = document.createElement('div');
    layers.id = 'layers';
    document.getElementById('fixture-shell')!.append(layers);
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  await carol.evaluate(() => {
    const modal = document.createElement('div');
    modal.setAttribute('aria-modal', 'true');
    modal.id = 'fixture-modal';
    document.getElementById('layers')!.append(modal);
  });
  await waitForFabDisplay('none');
  await carol.evaluate(() => document.getElementById('fixture-modal')!.remove());
  await waitForFabDisplay('');

  // DevTools protocol can pierce closed shadow roots; use it to drive the FAB.
  const fabCdp = await context.newCDPSession(carol);
  const callOnFabElement = async (elementId: string, fn: string): Promise<unknown> => {
    const { root } = await fabCdp.send('DOM.getDocument', { depth: -1, pierce: true });
    type DomNode = { nodeId: number; attributes?: string[]; children?: DomNode[]; shadowRoots?: DomNode[] };
    const find = (node: DomNode): DomNode | undefined => {
      const attrs = node.attributes ?? [];
      for (let i = 0; i < attrs.length; i += 2) if (attrs[i] === 'id' && attrs[i + 1] === elementId) return node;
      for (const child of [...(node.shadowRoots ?? []), ...(node.children ?? [])]) {
        const hit = find(child);
        if (hit) return hit;
      }
      return undefined;
    };
    const target = find(root as DomNode);
    if (!target) return undefined;
    const { object } = await fabCdp.send('DOM.resolveNode', { nodeId: target.nodeId });
    const { result } = await fabCdp.send('Runtime.callFunctionOn', { objectId: object.objectId!, functionDeclaration: fn, returnByValue: true });
    return result.value;
  };
  const badgeDeadline = Date.now() + 10_000;
  while ((await callOnFabElement('__xmd_badge__', 'function () { return this.textContent; }')) !== '1' && Date.now() < badgeDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.equal(await callOnFabElement('__xmd_badge__', 'function () { return this.textContent; }'), '1', 'worker update did not reach the FAB');
  await callOnFabElement('__xmd_collect_btn__', 'function () { this.click(); }');
  const deadline = Date.now() + 10_000;
  while (!(await isCollecting()) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(await isCollecting(), true, 'FAB click did not start collection');

  // X navigates with pushState in the MAIN world; switching profile ends the run.
  await carol.evaluate(() => history.pushState({}, '', '/Dave/media'));
  const navDeadline = Date.now() + 10_000;
  while ((await isCollecting()) && Date.now() < navDeadline) await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(await isCollecting(), false, 'SPA navigation to another profile did not stop collection');
});
