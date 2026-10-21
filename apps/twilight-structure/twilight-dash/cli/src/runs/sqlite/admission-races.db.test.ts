import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';

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
  const stores = await bootstrapSqliteStores(options);
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
}
function spawnChild(packet: unknown) {
  const child = Bun.spawn([process.execPath, '-e', childSource], {
    env: { ...process.env, RUN_STORE_CHILD: JSON.stringify(packet) },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stderr = new Response(child.stderr).text();
  const reader = child.stdout.getReader();
  let pending = '';
  async function phase() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          for (;;) {
            const newline = pending.indexOf('\n');
            if (newline >= 0) {
              const line = pending.slice(0, newline);
              pending = pending.slice(newline + 1);
              return JSON.parse(line) as {
                phase: string;
                reply?: { kind: string; reason?: string };
              };
            }
            const chunk = await reader.read();
            if (chunk.done)
              throw new Error(`child exited ${String(await child.exited)}: ${await stderr}`);
            pending += new TextDecoder().decode(chunk.value);
          }
        })(),
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
      await child.exited;
      reader.releaseLock();
    },
  };
}
test('independent processes contend for capacity one with a shared current owner', async () => {
  const setup = await fixture();
  const go = join(setup.directory, 'go');
  const second = createRun({ runId: runId('second') });
  unwrapReply(await setup.stores.runs.createRun(setup.guard.ownership, second));
  const children = [setup.guard.runId, second.runId].map((identity, index) =>
    spawnChild({
      options: setup.options,
      go,
      mode: 'race',
      guard: { ...setup.guard, runId: identity },
      admission: {
        ...setup.admission,
        attemptId: `attempt-${String(index)}`,
        identity: { ...setup.admission.identity, runId: identity },
      },
    }),
  );
  try {
    expect(await Promise.all(children.map((child) => child.phase()))).toEqual([
      { phase: 'ready' },
      { phase: 'ready' },
    ]);
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
  } finally {
    for (const child of children) await child.close();
    setup.close();
  }
});
for (const mode of ['before', 'after'] as const)
  test(`SIGKILL ${mode} commit preserves a complete admission snapshot`, async () => {
    const setup = await fixture();
    const go = join(setup.directory, 'go');
    const before = await setup.stores.runs.readRun(setup.guard.runId);
    const child = spawnChild({
      options: setup.options,
      go,
      mode,
      guard: setup.guard,
      admission: setup.admission,
    });
    try {
      expect(await child.phase()).toEqual({ phase: 'ready' });
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
    } finally {
      await child.close();
      setup.close();
    }
  });
