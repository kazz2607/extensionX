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
    <img src="https://pbs.twimg.com/media/${suffix}.jpg?name=small" /></article>
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

test('Chrome extension fixture collects isolated media after SPA navigation', { timeout: 45_000 }, async (t) => {
  const extensionDir = await prepareTestExtension();
  const profileDir = await mkdtemp(join(tmpdir(), 'extensionx-e2e-profile-'));
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
