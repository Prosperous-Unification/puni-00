import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { assertNoWriterBarrier, clearWriterBarrier, writeWriterBarrier } from './writer-barrier';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true });
});
async function stateRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'writer-barrier-'));
  roots.push(root);
  return root;
}
const intent = {
  candidate: 'registry/be@sha256:abc',
  sha: 'deadbeef',
  from: 'blue' as const,
  to: 'green' as const,
  outgoingId: 'a'.repeat(64),
};

test('persisted stop intent blocks an ordinary retry without replacing recovery bytes', async () => {
  const root = await stateRoot();
  await assertNoWriterBarrier(root);
  await writeWriterBarrier(root, 'stop', intent);
  const before = await readFile(join(root, 'be-writer-stop.json'), 'utf8');
  await refuses(assertNoWriterBarrier(root), 'explicit recovery');
  await refuses(writeWriterBarrier(root, 'stop', { ...intent, sha: 'other' }));
  expect(await readFile(join(root, 'be-writer-stop.json'), 'utf8')).toBe(before);
});

test('a malformed or unreadable marker never admits an ordinary retry', async () => {
  const root = await stateRoot();
  await writeFile(join(root, 'be-writer-exposure.json'), 'broken');
  await refuses(assertNoWriterBarrier(root), 'explicit recovery');
  await refuses(assertNoWriterBarrier(join(root, 'be-writer-exposure.json')));
});

test('commit removes both persisted barriers before a subsequent deploy', async () => {
  const root = await stateRoot();
  await writeWriterBarrier(root, 'stop', intent);
  await writeWriterBarrier(root, 'exposure', intent);
  await clearWriterBarrier(root);
  await assertNoWriterBarrier(root);
});

async function refuses(operation: Promise<unknown>, text?: string): Promise<void> {
  let failure = '';
  try {
    await operation;
  } catch (cause) {
    failure = cause instanceof Error ? cause.message : String(cause);
  }
  expect(failure).not.toBe('');
  if (text !== undefined) expect(failure).toContain(text);
}

test('an absent trusted state directory cannot mean no interrupted transition', async () => {
  const root = await stateRoot();
  await refuses(assertNoWriterBarrier(join(root, 'missing')));
});
