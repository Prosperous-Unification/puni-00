import { createHash } from 'node:crypto';
import { chmod, cp, readFile, unlink, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { ordinaryHoldSourceEpochV1 } from './dependency-owner-custody';
import { readHistoricalSources } from './ordinary-historical-sources';

const archive = new URL('./ordinary-febb-sources/', import.meta.url);
const owner = 'tools/tool-remote-scripts/src/lib/edge-ownership.ts';

async function expectArchiveRefusal(opening: Promise<unknown>, message: string): Promise<void> {
  const refusal = await opening.then(
    () => undefined,
    (cause: unknown) => cause,
  );
  expect(refusal).toBeInstanceOf(Error);
  if (!(refusal instanceof Error)) throw new Error('archive refusal was not an Error');
  expect(refusal.message).toContain(message);
}

async function copyArchive(): Promise<URL> {
  const root = scratchSync('ordinary-historical-sources-');
  const copied = pathToFileURL(`${root}/archive/`);
  await cp(archive, copied, { recursive: true });
  return copied;
}

test('historical source archive retains the exact complete seventeen-source epoch', async () => {
  const supplied = await readHistoricalSources('/historical');
  expect(supplied.size).toBe(17);
  for (const pin of ordinaryHoldSourceEpochV1.pins) {
    const bytes = supplied.get(`/historical/${pin.relative}`);
    expect(bytes).toBeDefined();
    if (bytes === undefined) throw new Error('historical source bytes absent');
    expect(bytes.byteLength).toBe(pin.bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(pin.sha256);
  }
});

for (const missing of ['manifest.json', `${owner}.txt`])
  test(`historical source archive refuses absent ${missing}`, async () => {
    const copied = await copyArchive();
    await unlink(new URL(missing, copied));
    await expectArchiveRefusal(readHistoricalSources('/historical', copied), 'ENOENT');
  });

for (const relative of ['manifest.json', `${owner}.txt`])
  test(`historical source archive refuses unreadable ${relative}`, async () => {
    const copied = await copyArchive();
    const unreadable = new URL(relative, copied);
    await chmod(unreadable, 0);
    try {
      await expectArchiveRefusal(readHistoricalSources('/historical', copied), 'EACCES');
    } finally {
      await chmod(unreadable, 0o600);
    }
  });

test('historical source archive refuses an altered complete-roster manifest', async () => {
  const copied = await copyArchive();
  const manifest = new URL('manifest.json', copied);
  const bytes = await readFile(manifest, 'utf8');
  await writeFile(manifest, bytes.replace('ordinary-febb-custody-v1', 'foreign-source-epoch'));
  await expectArchiveRefusal(
    readHistoricalSources('/historical', copied),
    'historical source archive manifest differs',
  );
});

test('historical source archive refuses changed bytes with the original length', async () => {
  const copied = await copyArchive();
  const source = new URL(`${owner}.txt`, copied);
  const bytes = await readFile(source);
  const first = bytes.at(0);
  if (first === undefined) throw new Error('historical source fixture is empty');
  bytes[0] = first ^ 1;
  await writeFile(source, bytes);
  await expectArchiveRefusal(
    readHistoricalSources('/historical', copied),
    'historical source archive bytes differ',
  );
});

for (const fault of ['missing', 'duplicate'] as const)
  test(`historical source archive refuses a ${fault} source roster entry`, async () => {
    const copied = await copyArchive();
    const manifest = new URL('manifest.json', copied);
    const packet = JSON.parse(await readFile(manifest, 'utf8')) as { sources: unknown[] };
    if (fault === 'missing') packet.sources.pop();
    else packet.sources.push(packet.sources[0]);
    await writeFile(manifest, JSON.stringify(packet, null, 2) + '\n');
    await expectArchiveRefusal(
      readHistoricalSources('/historical', copied),
      'historical source archive manifest differs',
    );
  });
