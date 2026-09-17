import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { chromium, type BrowserContext } from '@playwright/test';

const localChromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const chromePath = process.env.PLAYWRIGHT_CHROME_EXECUTABLE ?? (existsSync(localChromePath) ? localChromePath : chromium.executablePath());

function mediaPage(username: string, suffix: string) {
  return `<!doctype html><html><head><title>${username}</title></head><body>
    <article><a href="/${username}/status/1850000000000000000"><time>now</time></a>
    <img src="https://pbs.twimg.com/media/${suffix}.jpg?name=small" /></article>
  </body></html>`;
}

async function prepareTestExtension(baseUrl: string): Promise<string> {
  const extensionDir = await mkdtemp(join(tmpdir(), 'extensionx-e2e-extension-'));
  await cp('dist', extensionDir, { recursive: true });
  const manifestPath = join(extensionDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, any>;
  manifest.host_permissions = [...manifest.host_permissions, `${baseUrl}/*`];
  for (const contentScript of manifest.content_scripts) contentScript.matches = [...contentScript.matches, `${baseUrl}/*`];
  for (const resource of manifest.web_accessible_resources) resource.matches = [...resource.matches, `${baseUrl}/*`];
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
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
  const server = createServer((request, response) => {
    const [, username = 'Alice'] = (request.url ?? '/Alice/media').split('/');
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(mediaPage(username, username.toLowerCase()));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const extensionDir = await prepareTestExtension(baseUrl);
  const profileDir = await mkdtemp(join(tmpdir(), 'extensionx-e2e-profile-'));
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: chromePath,
    headless: true,
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`, '--no-first-run'],
  });
  t.after(async () => {
    await context.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(extensionDir, { recursive: true, force: true });
    await rm(profileDir, { recursive: true, force: true });
  });
  const id = await extensionId(context);
  const alice = await context.newPage();
  const bob = await context.newPage();
  await Promise.all([alice.goto(`${baseUrl}/Alice/media`), bob.goto(`${baseUrl}/Bob/media`)]);

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
});
