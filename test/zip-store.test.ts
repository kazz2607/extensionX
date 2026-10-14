import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildStoredZip, crc32 } from '../src/shared/zip-store.ts';

const bytes = (text: string) => new TextEncoder().encode(text);
const concat = (parts: Uint8Array[]) => Buffer.concat(parts.map((part) => Buffer.from(part)));

test('zip-store: CRC-32 matches the standard check values', () => {
  assert.equal(crc32(bytes('')), 0);
  assert.equal(crc32(bytes('hello')), 0x3610a686);
  assert.equal(crc32(bytes('123456789')), 0xcbf43926);
});

test('zip-store: STORE archive has valid headers, offsets and central directory', async () => {
  const files = [
    { name: 'a.jpg', data: bytes('first file') },
    { name: 'clip_01.mp4', data: new Uint8Array(70_000).map((_, i) => i % 251) },
    { name: 'empty.txt', data: new Uint8Array(0) },
  ];
  const zip = concat(buildStoredZip(files, new Date(2026, 9, 14, 21, 30, 10)));
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);

  const eocd = zip.length - 22;
  assert.equal(view.getUint32(eocd, true), 0x06054b50);
  assert.equal(view.getUint16(eocd + 10, true), files.length);
  let cursor = view.getUint32(eocd + 16, true);
  assert.equal(cursor + view.getUint32(eocd + 12, true), eocd, 'central directory ends at EOCD');

  for (const file of files) {
    assert.equal(view.getUint32(cursor, true), 0x02014b50);
    const nameLength = view.getUint16(cursor + 28, true);
    assert.equal(zip.subarray(cursor + 46, cursor + 46 + nameLength).toString(), file.name);
    const local = view.getUint32(cursor + 42, true);
    assert.equal(view.getUint32(local, true), 0x04034b50);
    assert.equal(view.getUint16(local + 8, true), 0, 'STORE method');
    assert.equal(view.getUint32(local + 14, true), crc32(file.data));
    const dataStart = local + 30 + view.getUint16(local + 26, true);
    assert.deepEqual(zip.subarray(dataStart, dataStart + file.data.length), Buffer.from(file.data));
    cursor += 46 + nameLength;
  }

  // Cross-check with a real unzip when the machine has one (macOS/Linux CI).
  let hasUnzip = true;
  try { execFileSync('unzip', ['-v'], { stdio: 'ignore' }); } catch { hasUnzip = false; }
  if (!hasUnzip) return;
  const dir = await mkdtemp(join(tmpdir(), 'zip-store-'));
  try {
    await writeFile(join(dir, 'out.zip'), zip);
    const report = execFileSync('unzip', ['-t', join(dir, 'out.zip')]).toString();
    assert.match(report, /No errors detected/);
    execFileSync('unzip', ['-q', join(dir, 'out.zip'), '-d', join(dir, 'x')]);
    assert.deepEqual(await readFile(join(dir, 'x', 'clip_01.mp4')), Buffer.from(files[1].data));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
