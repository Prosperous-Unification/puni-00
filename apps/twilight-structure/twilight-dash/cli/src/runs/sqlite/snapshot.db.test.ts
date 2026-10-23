import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { openStores } from '../open-stores';
import { decodeAdmission, organizationId, ownerId } from '../record-codecs';
import { createManifest, createRun, FixtureClock, unwrapReply } from '../testing/fixtures';
import { bootstrapSqliteStores } from './open-stores';

const writer = `
import { existsSync, renameSync, writeFileSync, writeSync } from 'node:fs';
import { openStores } from ${JSON.stringify(new URL('../open-stores.ts', import.meta.url).pathname)};
const packet=JSON.parse(process.env.RUN_STORE_SNAPSHOT);
const stores=await openStores(packet.configuration,{read:()=>1000});
writeSync(1,JSON.stringify({phase:'ready'})+'\\n');
let reply;
try {
 const deadline=Date.now()+10000;
 while(!existsSync(packet.go)) { if(Date.now()>deadline) throw new Error('snapshot go timed out'); await Bun.sleep(1); }
 reply=await stores.runs.admitAttempt(packet.guard,packet.admission);
 if(reply.kind!=='applied') throw new Error('snapshot writer admission '+JSON.stringify(reply));
} finally {stores.close();}
writeFileSync(packet.committedTemporary,JSON.stringify(reply));
renameSync(packet.committedTemporary,packet.committed);
writeSync(1,JSON.stringify({phase:'committed',reply})+'\\n');
`;
function spawnSnapshotChild(packet: unknown) {
  const argv = [process.execPath, '-e', writer];
  const child = Bun.spawn(argv, {
    env: { ...process.env, RUN_STORE_SNAPSHOT: JSON.stringify(packet) },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  console.log(
    JSON.stringify({
      event: 'snapshot-child-started',
      pid: child.pid,
      parentPid: process.pid,
      argv,
      cwd: process.cwd(),
      packet,
      at: new Date().toISOString(),
    }),
  );
  const reader = child.stdout.getReader();
  const stderr = new Response(child.stderr).arrayBuffer().then((bytes) => {
    console.log(
      JSON.stringify({
        event: 'snapshot-child-chunk',
        pid: child.pid,
        stream: 'stderr',
        base64: Buffer.from(bytes).toString('base64'),
        at: new Date().toISOString(),
      }),
    );
    console.log(
      JSON.stringify({
        event: 'snapshot-child-eof',
        pid: child.pid,
        stream: 'stderr',
        at: new Date().toISOString(),
      }),
    );
    return new TextDecoder().decode(bytes);
  });
  let pending = '';
  async function phase(): Promise<{ phase: string; reply?: { kind: string; reason?: string } }> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reading = (async () => {
      for (;;) {
        const newline = pending.indexOf('\n');
        if (newline >= 0) {
          const line = pending.slice(0, newline);
          pending = pending.slice(newline + 1);
          // This test's retained child source emits the protocol; callers assert each actual phase.
          return JSON.parse(line) as { phase: string; reply?: { kind: string; reason?: string } };
        }
        const chunk = await reader.read();
        if (chunk.done)
          throw new Error('child exited ' + String(await child.exited) + ': ' + (await stderr));
        console.log(
          JSON.stringify({
            event: 'snapshot-child-chunk',
            pid: child.pid,
            stream: 'stdout',
            base64: Buffer.from(chunk.value).toString('base64'),
            at: new Date().toISOString(),
          }),
        );
        pending += new TextDecoder().decode(chunk.value);
      }
    })();
    try {
      return await Promise.race([
        reading,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error('child phase timeout'));
          }, 10000);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
  return {
    child,
    phase,
    stderr,
    async close() {
      if (child.exitCode === null) child.kill('SIGKILL');
      const exitCode = await child.exited;
      await stderr;
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) {
          console.log(
            JSON.stringify({
              event: 'snapshot-child-eof',
              pid: child.pid,
              stream: 'stdout',
              at: new Date().toISOString(),
            }),
          );
          break;
        }
        console.log(
          JSON.stringify({
            event: 'snapshot-child-chunk',
            pid: child.pid,
            stream: 'stdout',
            base64: Buffer.from(chunk.value).toString('base64'),
            at: new Date().toISOString(),
          }),
        );
      }
      reader.releaseLock();
      console.log(
        JSON.stringify({
          event: 'snapshot-child-closed',
          pid: child.pid,
          exitCode,
          signal: child.signalCode,
          procExists: existsSync('/proc/' + String(child.pid)),
          at: new Date().toISOString(),
        }),
      );
    },
  };
}
async function prepareSnapshotProcess() {
  const directory = mkdtempSync(join(tmpdir(), 'runs-snapshot-'));
  let initial: Awaited<ReturnType<typeof bootstrapSqliteStores>> | undefined;
  let stores: Awaited<ReturnType<typeof openStores>> | undefined;
  let child: ReturnType<typeof spawnSnapshotChild> | undefined;
  try {
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
    initial = await bootstrapSqliteStores({ ...configuration, clock });
    const ownership = unwrapReply(await initial.runs.acquireOwnership(ownerId('owner'), 0));
    unwrapReply(await initial.runs.retainManifest(ownership, createManifest()));
    const run = unwrapReply(await initial.runs.createRun(ownership, createRun()));
    initial.close();
    stores = await openStores(configuration, clock);
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

    const go = join(directory, 'go'),
      committed = join(directory, 'committed.json'),
      committedTemporary = join(directory, 'committed.pending');
    child = spawnSnapshotChild({
      configuration,
      guard: { ownership, runId: run.runId, expectedRevision: 0 },
      admission,
      go,
      committed,
      committedTemporary,
    });
    // Proof: F221 changed this owned writer to wrong-ready; the beforeAll equality failed and cleanup killed/awaited it, drained both streams and removed its fixture. Restored named snapshot passed; helper-only proof.
    expect(await child.phase()).toEqual({ phase: 'ready' });
    return { directory, stores, run, go, committed, child };
  } catch (cause) {
    try {
      if (child !== undefined) await child.close();
    } finally {
      initial?.close();
      stores?.close();
      rmSync(directory, { recursive: true, force: true });
      console.log(
        JSON.stringify({
          event: 'snapshot-fixture-closed',
          directory,
          exists: existsSync(directory),
          at: new Date().toISOString(),
        }),
      );
    }
    throw cause;
  }
}
describe('snapshot process', () => {
  let prepared: Awaited<ReturnType<typeof prepareSnapshotProcess>> | undefined;
  beforeAll(async () => {
    prepared = await prepareSnapshotProcess();
  }, 10000);
  afterAll(async () => {
    if (prepared === undefined) return;
    try {
      await prepared.child.close();
    } finally {
      prepared.stores.close();
      rmSync(prepared.directory, { recursive: true, force: true });
      console.log(
        JSON.stringify({
          event: 'snapshot-fixture-closed',
          directory: prepared.directory,
          exists: existsSync(prepared.directory),
          at: new Date().toISOString(),
        }),
      );
    }
  });
  test('read snapshot remains whole when another process commits between header and attempt reads', async () => {
    if (prepared === undefined) throw new Error('snapshot setup did not finish');
    const { stores, run, go, committed, child } = prepared;
    const descriptor = Object.getOwnPropertyDescriptor(Database.prototype, 'query');
    if (descriptor === undefined) throw new Error('Database.query descriptor absent');
    const original = descriptor.value as Database['query'];
    let commits = 0;
    function query(this: Database, sql: string) {
      const statement = original.call(this, sql);
      if (sql === 'SELECT * FROM run_record' && commits === 0) {
        const all = statement.all.bind(statement);
        Object.defineProperty(statement, 'all', {
          configurable: true,
          value(...parameters: Parameters<typeof all>) {
            Object.defineProperty(statement, 'all', { configurable: true, value: all });
            const headers = all(...parameters);
            commits += 1;
            console.log(
              JSON.stringify({
                event: 'snapshot-catalog-headers',
                pid: child.child.pid,
                headers,
                at: new Date().toISOString(),
              }),
            );
            writeFileSync(go, 'go');
            const deadline = Date.now() + 10000;
            while (!existsSync(committed)) {
              if (Date.now() > deadline) throw new Error('snapshot writer commit timed out');
              Bun.sleepSync(1);
            }
            // Proof: F217 made the actual committed path a directory and observed EISDIR; F219 removed the published file and observed ENOENT. Both are helper-only mandatory-read proofs, not wait-timeout proofs.
            const bytes = readFileSync(committed);
            console.log(
              JSON.stringify({
                event: 'snapshot-commit-bytes',
                pid: child.child.pid,
                path: committed,
                base64: bytes.toString('base64'),
                at: new Date().toISOString(),
              }),
            );
            // Proof: F216 published malformed bytes after the real admission; this parser failed with JSON Parse error. Restored snapshot passed; helper evidence only.
            const reply: unknown = JSON.parse(bytes.toString());
            console.log(
              JSON.stringify({
                event: 'snapshot-commit-observed',
                pid: child.child.pid,
                base64: bytes.toString('base64'),
                reply,
                at: new Date().toISOString(),
              }),
            );
            // Proof: F215 changed only the published reply kind after the real admission; this assertion received refused instead of applied. Restored snapshot passed; helper evidence only.
            expect(reply).toMatchObject({
              kind: 'applied',
              value: { attemptId: 'competing', holdsCapacity: true },
            });
            return headers;
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
      expect(await child.child.exited).toBe(0);
      expect(await child.stderr).toBe('');
    }
  });
});
