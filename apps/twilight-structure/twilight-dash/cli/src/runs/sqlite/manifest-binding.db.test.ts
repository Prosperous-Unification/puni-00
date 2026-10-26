import { rejects } from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';

import { readManifestBinding } from '../manifest-binding';
import { organizationId } from '../record-codecs';
import { FixtureClock } from '../testing/fixtures';
import {
  createBindingFixture,
  manifestBindingContract,
  originalPrompt,
  retainBinding,
} from '../testing/manifest-binding-contract';
import { bootstrapSqliteStores, openSqliteStores } from './open-stores';

function options(path: string) {
  return {
    path,
    organizationId: organizationId('organization'),
    capacity: 1,
    leaseMilliseconds: 100,
    clock: new FixtureClock(),
    maxBusyAttempts: 2,
    busyDelayMilliseconds: 1,
  };
}
manifestBindingContract('sqlite manifest binding', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'manifest-binding-'));
  const stores = await bootstrapSqliteStores(options(join(directory, 'store.sqlite')));
  let isClosed = false;
  return {
    ...stores,
    close() {
      if (!isClosed) {
        isClosed = true;
        stores.close();
        rmSync(directory, { recursive: true });
      }
    },
  };
});

test('sqlite close/reopen keeps original binding and BOM prompt after source file edits', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'manifest-recovery-'));
  const configuration = options(join(directory, 'store.sqlite'));
  let stores = await bootstrapSqliteStores(configuration);
  try {
    const { manifest } = createBindingFixture();
    const bindingPath = join(directory, 'binding.json');
    const promptPath = join(directory, 'prompts/plan.md');
    mkdirSync(join(directory, 'prompts'));
    writeFileSync(bindingPath, manifest.canonicalBinding);
    writeFileSync(promptPath, originalPrompt);
    const fileAcceptance: unknown = JSON.parse(readFileSync(bindingPath, 'utf8'));
    if (
      typeof fileAcceptance !== 'object' ||
      fileAcceptance === null ||
      !('binding' in fileAcceptance)
    )
      throw new Error('expected binding document');
    const initial = createBindingFixture(false, {
      binding: fileAcceptance.binding,
      bytes: readFileSync(promptPath),
    });
    const retained = initial.manifest;
    await stores.artifacts.retainArtifact(readFileSync(promptPath), 'text/plain');
    await retainBinding(stores, retained);
    stores.close();
    writeFileSync(bindingPath, '{"changed":true}');
    writeFileSync(promptPath, 'changed prompt');
    stores = await openSqliteStores(configuration);
    const recovered = await readManifestBinding(stores.runs, stores.artifacts, retained.digest);
    expect(recovered.manifest.digest).toBe(retained.digest);
    expect(recovered.binding).toEqual(initial.accepted);
    expect(recovered.binding.prompts[1].bytesBase64).toBe('77u/cAo=');
    expect(recovered.binding.prompts[1].text).toBe('p\n');
  } finally {
    stores.close();
    rmSync(directory, { recursive: true });
  }
});

test('sqlite recovery refuses corrupt retained bytes after reopen', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'manifest-corrupt-'));
  const configuration = options(join(directory, 'store.sqlite'));
  let stores = await bootstrapSqliteStores(configuration);
  try {
    const { manifest } = createBindingFixture();
    await stores.artifacts.retainArtifact(originalPrompt, 'text/plain');
    await retainBinding(stores, manifest);
    stores.close();
    const database = new Database(configuration.path);
    try {
      database.query('UPDATE run_artifact SET content=?').run(new Uint8Array([1, 2, 3, 4, 5]));
    } finally {
      database.close();
    }
    stores = await openSqliteStores(configuration);
    await rejects(
      readManifestBinding(stores.runs, stores.artifacts, manifest.digest),
      /artifact integrity/,
    );
  } finally {
    stores.close();
    rmSync(directory, { recursive: true });
  }
});
