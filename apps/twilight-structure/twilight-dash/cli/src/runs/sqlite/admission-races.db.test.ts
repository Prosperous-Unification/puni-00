import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { decodeAdmission, organizationId, ownerId, runId } from '../record-codecs';
import { createManifest, createRun, FixtureClock, unwrapReply } from '../testing/fixtures';
import { bootstrapSqliteStores, openSqliteStores } from './open-stores';

const childSource = `
import { existsSync, writeSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { Database } from 'bun:sqlite';
import { openSqliteStores } from ${JSON.stringify(new URL('./open-stores.ts', import.meta.url).pathname)};
const packet=JSON.parse(process.env.RUN_STORE_CHILD);
const stores=await openSqliteStores({...packet.options,clock:{read:()=>1000}});
writeSync(1,JSON.stringify({phase:'ready'})+'\\n');
const readyDeadline=Date.now()+10000;
while(!existsSync(packet.go)) {if(Date.now()>readyDeadline) throw new Error('go barrier timed out');await Bun.sleep(1);}
if(packet.mode==='before') {
 const original=Database.prototype.run;
 Database.prototype.run=function(sql,...parameters) {
  if(sql==='COMMIT') {
   assert.equal(this.inTransaction,true,'admission COMMIT must have active transaction');
   const attempt=this.query('SELECT * FROM run_attempt WHERE attempt_id=?').get(packet.admission.attemptId);
   const reservation=this.query('SELECT * FROM run_reservation WHERE attempt_id=?').get(packet.admission.attemptId);
   const run=this.query('SELECT record FROM run_record WHERE run_id=?').get(packet.guard.runId);
   assert.ok(attempt,'attempt staged before COMMIT');assert.ok(reservation,'reservation staged before COMMIT');
   assert.equal(JSON.parse(run.record).revision,1,'revision staged before COMMIT');
   writeSync(1,JSON.stringify({phase:'before-commit'})+'\\n');
   const deadline=Date.now()+10000;
   while(Date.now()<deadline) Bun.sleepSync(5);
   throw new Error('before-commit kill barrier timed out');
  }
  return original.call(this,sql,...parameters);
 };
}
const reply=await stores.runs.admitAttempt(packet.guard,packet.admission);
writeSync(1,JSON.stringify({phase:'committed',reply})+'\\n');
if(packet.mode==='after') {const deadline=Date.now()+10000;while(Date.now()<deadline) await Bun.sleep(5);throw new Error('after-commit kill barrier timed out');}
stores.close();
`;
async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'run-store-process-'));
  const options = {
    path: join(directory, 'runs.sqlite'),
    organizationId: organizationId('organization'),
    capacity: 1,
    leaseMilliseconds: 100,
    clock: new FixtureClock(),
    maxBusyAttempts: 100,
    busyDelayMilliseconds: 2,
  };
  const stores = await bootstrapSqliteStores(options).catch((cause: unknown) => {
    rmSync(directory, { recursive: true, force: true });
    console.log(
      JSON.stringify({
        event: 'admission-fixture-closed',
        directory,
        exists: existsSync(directory),
        at: new Date().toISOString(),
      }),
    );
    throw cause;
  });
  try {
    const ownership = unwrapReply(await stores.runs.acquireOwnership(ownerId('owner'), 0));
    unwrapReply(await stores.runs.retainManifest(ownership, createManifest()));
    const run = unwrapReply(await stores.runs.createRun(ownership, createRun()));
    const admission = decodeAdmission({
      attemptId: 'attempt',
      identity: {
        version: 1,
        runId: run.runId,
        occurrenceId: 'occurrence',
        operationKey: 'operation',
      },
      ordinal: 1,
    });
    return {
      directory,
      options,
      stores,
      guard: { ownership, runId: run.runId, expectedRevision: 0 },
      admission,
      close() {
        stores.close();
        rmSync(directory, { recursive: true, force: true });
      },
    };
  } catch (cause) {
    stores.close();
    rmSync(directory, { recursive: true, force: true });
    console.log(
      JSON.stringify({
        event: 'admission-fixture-closed',
        directory,
        exists: existsSync(directory),
        at: new Date().toISOString(),
      }),
    );
    throw cause;
  }
}
function spawnChild(packet: unknown) {
  const argv = [process.execPath, '-e', childSource];
  const child = Bun.spawn(argv, {
    env: { ...process.env, RUN_STORE_CHILD: JSON.stringify(packet) },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  console.log(
    JSON.stringify({
      event: 'admission-child-started',
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
        event: 'admission-child-chunk',
        pid: child.pid,
        stream: 'stderr',
        base64: Buffer.from(bytes).toString('base64'),
        at: new Date().toISOString(),
      }),
    );
    console.log(
      JSON.stringify({
        event: 'admission-child-eof',
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
            event: 'admission-child-chunk',
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
          }, 15000);
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
              event: 'admission-child-eof',
              pid: child.pid,
              stream: 'stdout',
              at: new Date().toISOString(),
            }),
          );
          break;
        }
        console.log(
          JSON.stringify({
            event: 'admission-child-chunk',
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
          event: 'admission-child-closed',
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
async function prepareAdmissionProcess(mode: 'race' | 'before' | 'after') {
  const setup = await fixture();
  const go = join(setup.directory, 'go');
  const children: ReturnType<typeof spawnChild>[] = [];
  try {
    const before = await setup.stores.runs.readRun(setup.guard.runId);
    const second = createRun({ runId: runId('second') });
    if (mode === 'race') {
      unwrapReply(await setup.stores.runs.createRun(setup.guard.ownership, second));
      for (const [index, identity] of [setup.guard.runId, second.runId].entries())
        children.push(
          spawnChild({
            options: setup.options,
            go,
            mode,
            guard: { ...setup.guard, runId: identity },
            admission: {
              ...setup.admission,
              attemptId: 'attempt-' + String(index),
              identity: { ...setup.admission.identity, runId: identity },
            },
          }),
        );
      const readiness = await Promise.allSettled(children.map((child) => child.phase()));
      const failures = readiness.filter((entry) => entry.status === 'rejected');
      if (failures.length > 0)
        throw new AggregateError(
          failures.map((entry): unknown => entry.reason),
          'admission readiness failed',
        );
      // Proof: F220 changed both owned children to wrong-ready; this beforeAll equality failed, then both children were killed and awaited with complete streams and fixture cleanup. Restored named race passed; helper-only proof.
      expect(
        readiness.map((entry) => {
          if (entry.status === 'rejected') throw entry.reason;
          return entry.value;
        }),
      ).toEqual([{ phase: 'ready' }, { phase: 'ready' }]);
    } else {
      const child = spawnChild({
        options: setup.options,
        go,
        mode,
        guard: setup.guard,
        admission: setup.admission,
      });
      children.push(child);
      expect(await child.phase()).toEqual({ phase: 'ready' });
    }
    return { setup, go, children, before, second };
  } catch (cause) {
    try {
      await closeAdmissionProcess(setup, children);
    } catch (cleanupCause) {
      // Both original setup and cleanup failures remain in errors; the caught cleanup failure is the direct cause.
      throw new AggregateError([cause, cleanupCause], 'admission setup and cleanup failed', {
        cause: cleanupCause,
      });
    }
    throw cause;
  }
}
async function closeAdmissionProcess(
  setup: Awaited<ReturnType<typeof fixture>>,
  children: readonly ReturnType<typeof spawnChild>[],
) {
  const closed = await Promise.allSettled(children.map((child) => child.close()));
  const failures: unknown[] = closed
    .filter((entry) => entry.status === 'rejected')
    .map((entry): unknown => entry.reason);
  try {
    setup.close();
  } catch (cause) {
    failures.push(cause);
  }
  console.log(
    JSON.stringify({
      event: 'admission-fixture-closed',
      directory: setup.directory,
      exists: existsSync(setup.directory),
      at: new Date().toISOString(),
    }),
  );
  if (failures.length > 0)
    throw new AggregateError(failures, 'admission owned-resource cleanup failed');
}
describe('admission process race', () => {
  let prepared: Awaited<ReturnType<typeof prepareAdmissionProcess>> | undefined;
  beforeAll(async () => {
    prepared = await prepareAdmissionProcess('race');
  }, 15000);
  afterAll(async () => {
    if (prepared !== undefined) await closeAdmissionProcess(prepared.setup, prepared.children);
  });
  test('independent processes contend for capacity one with a shared current owner', async () => {
    if (prepared === undefined) throw new Error('admission setup did not finish');
    const { setup, go, children, second } = prepared;
    writeFileSync(go, 'go');
    const phases = await Promise.all(children.map((child) => child.phase()));
    expect(phases.map((phase) => phase.phase)).toEqual(['committed', 'committed']);
    expect(phases.map((phase) => phase.reply?.kind).sort()).toEqual(['applied', 'refused']);
    expect(phases.find((phase) => phase.reply?.kind === 'refused')?.reply).toEqual({
      kind: 'refused',
      reason: 'capacity_full',
    });
    for (const child of children) {
      expect(await child.child.exited).toBe(0);
      expect(await child.stderr).toBe('');
    }
    const snapshots = await Promise.all(
      [setup.guard.runId, second.runId].map((identity) => setup.stores.runs.readRun(identity)),
    );
    expect(snapshots.flatMap((snapshot) => snapshot.attempts)).toHaveLength(1);
    expect(snapshots.map((snapshot) => snapshot.capacity.reserved)).toEqual([1, 1]);
  });
});
for (const mode of ['before', 'after'] as const)
  describe('admission process ' + mode, () => {
    let prepared: Awaited<ReturnType<typeof prepareAdmissionProcess>> | undefined;
    beforeAll(async () => {
      prepared = await prepareAdmissionProcess(mode);
    }, 15000);
    afterAll(async () => {
      if (prepared !== undefined) await closeAdmissionProcess(prepared.setup, prepared.children);
    });
    test('SIGKILL ' + mode + ' commit preserves a complete admission snapshot', async () => {
      if (prepared === undefined) throw new Error('admission setup did not finish');
      const { setup, go, before } = prepared;
      const child = prepared.children.at(0);
      if (child === undefined) throw new Error('admission child missing');
      writeFileSync(go, 'go');
      const phase = await child.phase();
      expect(phase.phase).toBe(mode === 'before' ? 'before-commit' : 'committed');
      if (mode === 'before') {
        const reader = new Database(setup.options.path, { readonly: true, create: false });
        try {
          expect(reader.query('SELECT * FROM run_attempt').all()).toEqual([]);
          expect(reader.query('SELECT * FROM run_reservation').all()).toEqual([]);
          expect(await setup.stores.runs.readRun(setup.guard.runId)).toEqual(before);
        } finally {
          reader.close();
        }
      } else expect(phase.reply?.kind).toBe('applied');
      child.child.kill('SIGKILL');
      await child.child.exited;
      expect(child.child.signalCode).toBe('SIGKILL');
      expect(await child.stderr).toBe('');
      setup.stores.close();
      const reopened = await openSqliteStores(setup.options);
      try {
        const snapshot = await reopened.runs.readRun(setup.guard.runId);
        if (mode === 'before') expect(snapshot).toEqual(before);
        else {
          expect(snapshot.attempts).toHaveLength(1);
          expect(snapshot.run.revision).toBe(1);
          expect(snapshot.capacity.reserved).toBe(1);
          expect(snapshot.attempts[0]?.holdsCapacity).toBe(true);
        }
      } finally {
        reopened.close();
      }
    });
  });
