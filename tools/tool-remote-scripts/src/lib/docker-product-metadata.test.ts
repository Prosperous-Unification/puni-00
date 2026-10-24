import { throws } from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { scratchSync } from '@tools/test-scratch';
import { expect } from 'bun:test';
import { test } from 'bun:test';

import { type ProductMetadataChild, readProductMetadata, spawnProductMetadata } from './docker-product-metadata';
import { withDependencyOwner } from './edge-ownership';
import { envLayout } from './env';

function fixture() {
  const root = scratchSync('product-metadata-');
  const layout = { ...envLayout('prod'), root, stateDir: root };
  return { root, layout, plan: { sha: 'a'.repeat(40), layouts: [layout] } };
}

function child(stdout: string, stderr = '', code = 0): ProductMetadataChild {
  const stream = (value: string) => new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(value));
      controller.close();
    },
  });
  return { stdout: stream(stdout), stderr: stream(stderr), exited: Promise.resolve(code), kill: () => { throw new Error('unexpected metadata child kill'); } };
}

test('the closed product metadata adapter refuses a shortened container ID before spawn', () => {
  throws(() => spawnProductMetadata({ kind: 'container', id: 'abc' }), /metadata request/);
});

test('the closed product metadata adapter refuses a shortened image ID before spawn', () => {
  throws(() => spawnProductMetadata({ kind: 'image', id: 'sha256:abc' }), /metadata request/);
});

test('metadata dispatch retains exact owner intent and only a digest of private stdout', async () => {
  const { root, layout, plan } = fixture();
  await withDependencyOwner(plan, async (owner) => {
    let intentRead: Promise<string> | undefined;
    const observed = await readProductMetadata(owner, layout, () => {
      intentRead = readFile(`${root}/edge-owner-000001-intent.json`, 'utf8');
      return child('PRIVATE_SENTINEL');
    }, { kind: 'top', id: 'b'.repeat(64) }, performance.now() + 40000);
    expect(await intentRead).toContain('"top"');
    expect(observed).toBe('PRIVATE_SENTINEL');
    const readback = await readFile(`${root}/edge-owner-000001-readback.json`, 'utf8');
    expect(readback).toContain('responseSha256');
    expect(readback).not.toContain('PRIVATE_SENTINEL');
  }, root);
});
