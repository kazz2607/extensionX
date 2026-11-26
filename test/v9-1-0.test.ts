import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isAllowedSender, parseExtensionMessage } from '../src/shared/messages.ts';

// Commands the X content scripts legitimately send (see CONTENT_SCRIPT_TYPES in messages.ts).
const CONTENT_SCRIPT_TYPES = ['MEDIA_FOUND', 'PAGE_LOADED', 'START_COLLECTING', 'START_DOWNLOAD', 'DOWNLOAD_TWEET', 'SHORTCUT_DOWNLOAD', 'DIAGNOSTIC_METRIC'] as const;

const manifest = JSON.parse(await readFile(new URL('../src/manifest.json', import.meta.url), 'utf8')) as {
  permissions: string[];
  host_permissions: string[];
  content_scripts: Array<{ matches: string[] }>;
};

test('S19: the manifest no longer asks for scripting or wildcard X/Twitter hosts', () => {
  assert.deepEqual([...manifest.permissions].sort(), ['alarms', 'downloads', 'notifications', 'offscreen', 'storage']);
  assert.deepEqual([...manifest.host_permissions].sort(), [
    'https://api.x.com/*',
    'https://cdn.syndication.twimg.com/*',
    'https://pbs.twimg.com/*',
    'https://twitter.com/*',
    'https://video.twimg.com/*',
    'https://web.telegram.org/*',
    'https://x.com/*',
  ]);
  // Every content script page is covered by a host permission (tabs.query by URL needs it).
  for (const script of manifest.content_scripts) {
    for (const match of script.matches) assert.ok(manifest.host_permissions.includes(match), match);
  }
});

test('S19: Telegram sends no runtime command; only x.com/twitter.com content scripts do', () => {
  const origin = 'chrome-extension://abc/';
  assert.equal(parseExtensionMessage({ type: 'TG_DOWNLOAD_MEDIA', payload: { url: 'blob:https://web.telegram.org/1', filename: 'a.jpg' } }), null, 'the old command is unknown');
  for (const type of CONTENT_SCRIPT_TYPES) {
    assert.equal(isAllowedSender(type, 'https://web.telegram.org/k/', origin), false, `${type} from Telegram`);
    assert.equal(isAllowedSender(type, 'https://mobile.x.com/NASA', origin), false, `${type} from a subdomain`);
  }
  assert.equal(isAllowedSender('MEDIA_FOUND', 'https://x.com/NASA/media', origin), true);
  assert.equal(isAllowedSender('MEDIA_FOUND', 'https://twitter.com/NASA/media', origin), true);
});
