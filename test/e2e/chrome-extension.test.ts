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
  assert.equal(await popup.locator('.queue-load-more').textContent(), 'Hiển thị thêm (450)');
  assert.ok(renderMs < 300, `Queue render ${renderMs}ms exceeded 300ms`);
  assert.ok(metrics.maxLongTaskMs < 50, `Queue long task ${metrics.maxLongTaskMs}ms exceeded 50ms`);
  assert.ok(metrics.heap < 64 * 1024 * 1024, `Queue heap ${metrics.heap} exceeded 64 MiB`);
  const secondRow = popup.locator('.queue-item').nth(1);
  await secondRow.locator('.queue-select').check();
  await popup.locator('[data-bulk-action="pause_selected"]').click();
  await popup.locator('.queue-item.status-paused').filter({ hasText: '@Bench1' }).waitFor();
  await popup.locator('[data-bulk-action="clear_completed"]').click();
  const remainingStatuses = await popup.evaluate(async () => {
    const response = await chrome.runtime.sendMessage({ type: 'GET_QUEUE', payload: {} });
    return response.queue.map((item: { status: string }) => item.status);
  });
  assert.equal(remainingStatuses.includes('done'), false);
  await popup.locator('[data-bulk-action="undo_clear_completed"]').click();
  const restoredStatuses = await popup.evaluate(async () => {
    const response = await chrome.runtime.sendMessage({ type: 'GET_QUEUE', payload: {} });
    return response.queue.map((item: { status: string }) => item.status);
  });
  assert.equal(restoredStatuses.includes('done'), true);
  assert.equal(await popup.locator('.queue-result-details').count() > 0, true);
  t.diagnostic(`Queue DOM: render=${renderMs}ms, maxLongTask=${metrics.maxLongTaskMs}ms, heap=${metrics.heap}`);
});
