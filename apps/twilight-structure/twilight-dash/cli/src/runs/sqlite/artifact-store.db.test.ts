import { rejects } from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';

import { organizationId } from '../record-codecs';
import { artifactStoreContract } from '../testing/artifact-store-contract';
import { FixtureClock } from '../testing/fixtures';
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
artifactStoreContract('sqlite artifacts', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'run-artifacts-'));
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
for (const fault of ['bytes', 'length', 'metadata', 'declared length'] as const)
  test(`corrupt existing artifact ${fault} throws before retain or metadata conflict`, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'run-artifacts-'));
    const configuration = options(join(directory, 'store.sqlite'));
    let stores = await bootstrapSqliteStores(configuration);
    try {
      const retained = await stores.artifacts.retainArtifact(
        new TextEncoder().encode('hello'),
        'text/plain',
      );
      if (retained.kind !== 'retained') throw new Error('expected retained artifact');
      stores.close();
      const database = new Database(configuration.path);
      if (fault === 'bytes')
        database.query('UPDATE run_artifact SET content=?').run(new TextEncoder().encode('jello'));
      else if (fault === 'length')
        database.query('UPDATE run_artifact SET content=?').run(new Uint8Array([1]));
      else if (fault === 'declared length')
        database
          .query('UPDATE run_artifact SET reference=?')
          .run(JSON.stringify({ ...retained.reference, byteLength: 999 }));
      else {
        const bytes = new TextEncoder().encode('jello');
        database.query('UPDATE run_artifact SET reference=?,content=?').run(
          JSON.stringify({
            ...retained.reference,
            digest: createHash('sha256').update(bytes).digest('hex'),
          }),
          bytes,
        );
      }
      database.close();
      stores = await openSqliteStores(configuration);
      await rejects(stores.artifacts.readArtifact(retained.reference), /artifact integrity/);
      for (const mediaType of ['text/plain', 'application/json'])
        await rejects(
          stores.artifacts.retainArtifact(new TextEncoder().encode('hello'), mediaType),
          /artifact integrity/,
        );
    } finally {
      stores.close();
      rmSync(directory, { recursive: true });
    }
  });

test('sqlite artifact retention reads back a suppressed insert and throws without claiming retention', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'run-artifact-readback-'));
  const configuration = options(join(directory, 'store.sqlite'));
  const stores = await bootstrapSqliteStores(configuration);
  const database = new Database(configuration.path);
  try {
    database.run(
      'CREATE TRIGGER suppress_artifact BEFORE INSERT ON run_artifact BEGIN SELECT RAISE(IGNORE); END;',
    );
    await rejects(
      stores.artifacts.retainArtifact(new TextEncoder().encode('hello'), 'text/plain'),
      /artifact does not exist after retention/,
    );
    expect(database.query('SELECT * FROM run_artifact').all()).toEqual([]);
  } finally {
    database.close();
    stores.close();
    rmSync(directory, { recursive: true });
  }
});
