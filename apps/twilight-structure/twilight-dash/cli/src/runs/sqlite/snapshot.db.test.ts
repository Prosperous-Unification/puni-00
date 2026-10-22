import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';

import { openStores } from '../open-stores';
import { decodeAdmission, organizationId, ownerId } from '../record-codecs';
import { createManifest, createRun, FixtureClock, unwrapReply } from '../testing/fixtures';
import { bootstrapSqliteStores } from './open-stores';

const writer = `
import { openStores } from ${JSON.stringify(new URL('../open-stores.ts', import.meta.url).pathname)};
const packet=JSON.parse(process.env.RUN_STORE_SNAPSHOT);
const stores=await openStores(packet.configuration,{read:()=>1000});
try {
 const reply=await stores.runs.admitAttempt(packet.guard,packet.admission);
 if(reply.kind!=='applied') throw new Error('snapshot writer admission '+JSON.stringify(reply));
 console.log(JSON.stringify(reply));
} finally {stores.close();}
`;

test('read snapshot remains whole when another process commits between header and attempt reads', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'runs-snapshot-'));
  const configuration = {
    provider: 'sqlite' as const,
    path: join(directory, 'runs.sqlite'),
    organizationId: organizationId('organization'),
    capacity: 1,
    leaseMilliseconds: 100,
    maxBusyAttempts: 3,
    busyDelayMilliseconds: 1,
  };
  const clock = new FixtureClock();
  const initial = await bootstrapSqliteStores({ ...configuration, clock });
  const ownership = unwrapReply(await initial.runs.acquireOwnership(ownerId('owner'), 0));
  unwrapReply(await initial.runs.retainManifest(ownership, createManifest()));
  const run = unwrapReply(await initial.runs.createRun(ownership, createRun()));
  initial.close();
  const stores = await openStores(configuration, clock);
  const admission = decodeAdmission({
    attemptId: 'competing',
    identity: {
      version: 1,
      runId: run.runId,
      occurrenceId: 'occurrence',
      operationKey: 'operation',
    },
    ordinal: 1,
  });
  const descriptor = Object.getOwnPropertyDescriptor(Database.prototype, 'query');
  if (descriptor === undefined) throw new Error('Database.query descriptor absent');
  const original = descriptor.value as Database['query'];
  let commits = 0;
  function query(this: Database, sql: string) {
    const statement = original.call(this, sql);
    if (sql === 'SELECT * FROM run_record WHERE run_id=?' && commits === 0) {
      const get = statement.get.bind(statement);
      Object.defineProperty(statement, 'get', {
        configurable: true,
        value(...parameters: Parameters<typeof get>) {
          Object.defineProperty(statement, 'get', { configurable: true, value: get });
          const header = get(...parameters);
          commits += 1;
          const child = Bun.spawnSync([process.execPath, '-e', writer], {
            env: {
              ...process.env,
              RUN_STORE_SNAPSHOT: JSON.stringify({
                configuration,
                guard: { ownership, runId: run.runId, expectedRevision: 0 },
                admission,
              }),
            },
            timeout: 10000,
            stdout: 'pipe',
            stderr: 'pipe',
          });
          expect(new TextDecoder().decode(child.stderr)).toBe('');
          expect(child.exitCode).toBe(0);
          expect(JSON.parse(new TextDecoder().decode(child.stdout))).toMatchObject({
            kind: 'applied',
            value: { attemptId: 'competing', holdsCapacity: true },
          });
          return header;
        },
      });
    }
    return statement;
  }
  Object.defineProperty(Database.prototype, 'query', { ...descriptor, value: query });
  try {
    const snapshot = await stores.runs.readRun(run.runId);
    expect(commits).toBe(1);
    expect({
      revision: snapshot.run.revision,
      attempts: snapshot.attempts.length,
      reserved: snapshot.capacity.reserved,
    }).toEqual({ revision: 0, attempts: 0, reserved: 0 });
    const current = await stores.runs.readRun(run.runId);
    expect({
      revision: current.run.revision,
      attempts: current.attempts.length,
      reserved: current.capacity.reserved,
    }).toEqual({ revision: 1, attempts: 1, reserved: 1 });
  } finally {
    Object.defineProperty(Database.prototype, 'query', descriptor);
    stores.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
