import { doesNotReject, rejects } from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { decodeExecutionFact, organizationId } from '../record-codecs';
import { recordExecution } from '../record-execution';
import { recordOutcome } from '../record-outcome';
import { retainManifest } from '../retain-manifest';
import { executionCommandContract } from '../testing/execution-command-contract';
import { executionContract } from '../testing/execution-contract';
import { executionEdgeContract } from '../testing/execution-edge-contract';
import { createExecutionCommand } from '../testing/fixtures';
import { FixtureClock } from '../testing/fixtures';
import { createCompletion, createManifest, prepareTurn, unwrapReply } from '../testing/fixtures';
import { outcomeCollisionContract } from '../testing/outcome-collision-contract';
import { outcomeContract } from '../testing/outcomes-contract';
import { verifiedOperationsContract } from '../testing/verified-operations-contract';
import { bootstrapSqliteStores, openSqliteStores } from './open-stores';

async function create() {
  const directory = mkdtempSync(join(tmpdir(), 'run-outcomes-'));
  const clock = new FixtureClock();
  const stores = await bootstrapSqliteStores({
    path: join(directory, 'store.sqlite'),
    organizationId: organizationId('organization'),
    capacity: 1,
    leaseMilliseconds: 100,
    clock,
    maxBusyAttempts: 2,
    busyDelayMilliseconds: 1,
  });
  let closing: Promise<void> | undefined;
  return {
    ...stores,
    clock,
    close(): Promise<void> {
      if (closing !== undefined) return closing;
      closing = (async () => {
        await stores.close();
        rmSync(directory, { recursive: true });
      })();
      return closing;
    },
  };
}
executionContract('sqlite execution', create);
outcomeContract('sqlite outcomes', create);

verifiedOperationsContract('sqlite verified operations', create);

async function durableFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'run-durable-outcomes-'));
  const clock = new FixtureClock();
  const options = {
    path: join(directory, 'store.sqlite'),
    organizationId: organizationId('organization'),
    capacity: 1,
    leaseMilliseconds: 100,
    clock,
    maxBusyAttempts: 2,
    busyDelayMilliseconds: 1,
  };
  let stores: Awaited<ReturnType<typeof bootstrapSqliteStores>> | undefined;
  try {
    stores = await bootstrapSqliteStores(options);
    const setup = await prepareTurn({ ...stores, clock });
    return { ...setup, options, directory, stores };
  } catch (cause) {
    try {
      if (stores !== undefined) await stores.close();
      rmSync(directory, { recursive: true });
    } catch (cleanupCause) {
      throw new AggregateError([cause, cleanupCause], 'store setup and cleanup failed', {
        cause: cleanupCause,
      });
    }
    throw cause;
  }
}

test('outbox abort rolls back outcome revisions and capacity before reopen then commits both together', async () => {
  const setup = await durableFixture();
  let stores = setup.stores;
  const database = new Database(setup.options.path);
  try {
    const guard = await setup.currentGuard();
    const completion = createCompletion(setup.claim, setup.quiescence);
    const before = await stores.runs.readRun(setup.run.runId);
    database.run(
      "CREATE TRIGGER fail_outbox BEFORE INSERT ON run5_outbox BEGIN SELECT RAISE(ABORT, 'injected outbox fault'); END;",
    );
    await rejects(
      recordOutcome(stores.runs, stores.artifacts, guard, completion),
      /injected outbox fault/,
    );
    await stores.close();
    const reopening = openSqliteStores(setup.options);
    await doesNotReject(reopening);
    stores = await reopening;
    expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
    expect(database.query('SELECT * FROM run5_completion').all()).toEqual([]);
    expect(database.query('SELECT * FROM run5_outbox').all()).toEqual([]);
    database.run('DROP TRIGGER fail_outbox');
    expect((await recordOutcome(stores.runs, stores.artifacts, guard, completion)).kind).toBe(
      'applied',
    );
    const after = await stores.runs.readRun(setup.run.runId);
    expect(after.pendingIntents).toEqual([completion.intent]);
    expect(after.attempts[0]?.state).toMatchObject({
      kind: 'outcome_pending_progress',
      outcome: completion.outcome,
    });
    expect(after.capacity.reserved).toBe(0);
    await stores.close();
    stores = await openSqliteStores(setup.options);
    expect(await stores.runs.readRun(setup.run.runId)).toEqual(after);
    expect(await stores.runs.commitOutcome(guard, completion)).toMatchObject({ kind: 'duplicate' });
    expect(await stores.runs.recordExecution(guard, setup.opened)).toMatchObject({
      kind: 'duplicate',
    });
    expect(await stores.runs.readRun(setup.run.runId)).toEqual(after);
  } finally {
    database.close();
    await stores.close();
    rmSync(setup.directory, { recursive: true });
  }
});

for (const operation of [
  'manifest prompt',
  'manifest policy',
  'output',
  'completion evidence',
  'interrupted',
  'unresolved',
  'wait prompt',
  'wait evidence',
] as const)
  test(`corrupt durable ${operation} prevents the verified mutation`, async () => {
    const setup = await durableFixture();
    let stores = setup.stores;
    const database = new Database(setup.options.path);
    try {
      const retained = await stores.artifacts.retainArtifact(
        new TextEncoder().encode('distinct corrupt artifact'),
        'text/plain',
      );
      if (retained.kind !== 'retained') throw new Error('expected retained artifact');
      const bad = retained.reference;
      const guard = await setup.currentGuard();
      const before = await stores.runs.readRun(setup.run.runId);
      database
        .query('UPDATE run_artifact SET content=? WHERE digest=?')
        .run(new TextEncoder().encode('corrupted'), bad.digest);
      await stores.close();
      stores = await openSqliteStores(setup.options);
      if (operation.startsWith('manifest')) {
        const manifest = createManifest(
          operation === 'manifest prompt' ? { prompts: [bad] } : { toolPolicies: [bad] },
        );
        await rejects(
          retainManifest(stores.runs, stores.artifacts, setup.ownership, manifest),
          /artifact integrity/,
        );
        await rejects(stores.runs.readManifest(manifest.digest), /manifest does not exist/);
      } else if (operation === 'output' || operation === 'completion evidence') {
        const initial = createCompletion(setup.claim, setup.quiescence);
        const outcome = { ...initial.outcome, artifacts: [bad] };
        const completion =
          operation === 'output'
            ? createCompletion(setup.claim, setup.quiescence, {
                outcome,
                intent: { ...initial.intent, outcome },
              })
            : { ...initial, quiescence: { ...initial.quiescence, evidence: bad } };
        await rejects(
          recordOutcome(stores.runs, stores.artifacts, guard, completion),
          /artifact integrity/,
        );
      } else {
        const quiescence = { ...setup.quiescence, evidence: bad };
        const fact =
          operation === 'interrupted'
            ? decodeExecutionFact({ kind: 'interrupted', quiescence })
            : operation === 'unresolved'
              ? decodeExecutionFact({ kind: 'unresolved', reason: 'ambiguous', evidence: bad })
              : decodeExecutionFact({
                  kind: 'waiting',
                  wait: {
                    version: 1,
                    correlationKey: 'question',
                    prompt: operation === 'wait prompt' ? bad : setup.quiescence.evidence,
                    choices: ['yes'],
                  },
                  quiescence: operation === 'wait evidence' ? quiescence : setup.quiescence,
                });
        await rejects(
          recordExecution(stores.runs, stores.artifacts, guard, createExecutionCommand(fact)),
          /artifact integrity/,
        );
      }
      expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
    } finally {
      database.close();
      await stores.close();
      rmSync(setup.directory, { recursive: true });
    }
  });

const childSource = `
import { encodeKey } from ${JSON.stringify(new URL('./identity-key.ts', import.meta.url).pathname)};
import { writeSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { Database } from 'bun:sqlite';
import { openSqliteStores } from ${JSON.stringify(new URL('./open-stores.ts', import.meta.url).pathname)};
import { recordOutcome } from ${JSON.stringify(new URL('../record-outcome.ts', import.meta.url).pathname)};
const packet=JSON.parse(process.env.RUN_OUTCOME_CHILD);
const stores=await openSqliteStores({...packet.options,clock:{read:()=>1000}});
try {
writeSync(1,JSON.stringify({phase:'ready'})+'\\n');
let startTimer;
try {
 const signal=await Promise.race([Bun.stdin.text(),new Promise((_,reject)=>{startTimer=setTimeout(()=>reject(new Error('outcome start gate timed out')),10000);})]);
 assert.equal(signal,'start-outcome\\n','exact outcome start signal');
} finally { if(startTimer!==undefined) clearTimeout(startTimer); }
if(packet.mode==='before') {
 const original=Database.prototype.run;
 Database.prototype.run=function(sql,...parameters) {
  if(sql==='COMMIT' && this.query('SELECT command_id FROM run5_outbox WHERE command_id=?').get(encodeKey(packet.completion.intent.commandId))!==null) {
   assert.equal(this.inTransaction,true,'outcome COMMIT must have active transaction');
   const attempt=this.query('SELECT record FROM run5_attempt WHERE attempt_id=?').get(encodeKey(packet.guard.attemptId));
   const reservation=this.query('SELECT * FROM run5_reservation WHERE attempt_id=?').get(encodeKey(packet.guard.attemptId));
   const run=this.query('SELECT record FROM run5_record WHERE run_id=?').get(encodeKey(packet.guard.runId));
   const completion=this.query('SELECT * FROM run5_completion WHERE command_id=?').get(encodeKey(packet.completion.intent.commandId));
   assert.equal(JSON.parse(attempt.record).state.kind,'outcome_pending_progress');
   assert.equal(reservation,null,'settled capacity released before COMMIT');
   assert.equal(JSON.parse(run.record).revision,7,'revision staged before COMMIT');
   assert.ok(completion,'immutable completion staged before COMMIT');
   writeSync(1,JSON.stringify({phase:'before-commit'})+'\\n');
   const deadline=Date.now()+10000;
   while(Date.now()<deadline) Bun.sleepSync(5);
   throw new Error('before-commit kill barrier timed out');
  }
  return original.call(this,sql,...parameters);
 };
}
const reply=await recordOutcome(stores.runs,stores.artifacts,packet.guard,packet.completion);
writeSync(1,JSON.stringify({phase:'committed',reply})+'\\n');
const deadline=Date.now()+10000;while(Date.now()<deadline) await Bun.sleep(5);throw new Error('after-commit kill barrier timed out');
} finally { await stores.close(); }
`;
function spawnOutcomeChild(packet: unknown) {
  const child = Bun.spawn([process.execPath, '-e', childSource], {
    env: { ...process.env, RUN_OUTCOME_CHILD: JSON.stringify(packet) },
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  console.log(
    JSON.stringify({
      event: 'outcome-child-started',
      pid: child.pid,
      argv: [process.execPath, '-e', childSource],
      packet,
    }),
  );
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
              return JSON.parse(line) as { phase: string; reply?: { kind: string } };
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
    async start() {
      await child.stdin.write('start-outcome\n');
      await child.stdin.flush();
      await child.stdin.end();
    },
    async close() {
      if (child.exitCode === null) child.kill('SIGKILL');
      const exitCode = await child.exited;
      console.log(
        JSON.stringify({
          event: 'outcome-child-closed',
          pid: child.pid,
          exitCode,
          signal: child.signalCode,
        }),
      );
      reader.releaseLock();
    },
  };
}
async function prepareOutcomeProcess(mode: 'before' | 'after') {
  const setup = await durableFixture();
  let child: ReturnType<typeof spawnOutcomeChild> | undefined;
  try {
    const guard = await setup.currentGuard();
    const completion = createCompletion(setup.claim, setup.quiescence);
    const before = await setup.stores.runs.readRun(setup.run.runId);
    await setup.stores.close();
    child = spawnOutcomeChild({ mode, options: setup.options, guard, completion });
    // Proof: F13 changed the real child phase to wrong-ready; this bounded hook failed, killed/awaited its exact child and removed its owned fixture. Restored before-COMMIT case passed.
    expect(await child.phase()).toEqual({ phase: 'ready' });
    return { setup, guard, completion, before, child };
  } catch (cause) {
    try {
      if (child !== undefined) await child.close();
      await setup.stores.close();
      rmSync(setup.directory, { recursive: true });
    } catch (cleanupCause) {
      throw new AggregateError([cause, cleanupCause], 'store setup and cleanup failed', {
        cause: cleanupCause,
      });
    }
    throw cause;
  }
}
for (const mode of ['before', 'after'] as const)
  describe('outcome process ' + mode, () => {
    let prepared: Awaited<ReturnType<typeof prepareOutcomeProcess>> | undefined;
    beforeAll(async () => {
      prepared = await prepareOutcomeProcess(mode);
    }, 15000);
    afterAll(async () => {
      if (prepared === undefined) return;
      await prepared.child.close();
      rmSync(prepared.setup.directory, { recursive: true });
    });
    test(`SIGKILL ${mode} outcome commit preserves atomic pending progress on reopen`, async () => {
      if (prepared === undefined) throw new Error('outcome process setup did not finish');
      const { setup, completion, before, child } = prepared;
      await child.start();
      const phase = await child.phase();
      expect(phase.phase).toBe(mode === 'before' ? 'before-commit' : 'committed');
      if (mode === 'after') expect(phase.reply?.kind).toBe('applied');
      child.child.kill('SIGKILL');
      await child.child.exited;
      expect(child.child.signalCode).toBe('SIGKILL');
      expect(await child.stderr).toBe('');
      const reopened = await openSqliteStores(setup.options);
      try {
        const snapshot = await reopened.runs.readRun(setup.run.runId);
        if (mode === 'before') expect(snapshot).toEqual(before);
        else {
          expect(snapshot.run.revision).toBe(7);
          expect(snapshot.attempts[0]?.state).toMatchObject({
            kind: 'outcome_pending_progress',
            outcome: completion.outcome,
          });
          expect(snapshot.pendingIntents).toEqual([completion.intent]);
          expect(snapshot.capacity.reserved).toBe(0);
          expect(
            await reopened.runs.admitAttempt(
              {
                ownership: setup.ownership,
                runId: setup.run.runId,
                expectedRevision: snapshot.run.revision,
              },
              {
                ...setup.admission,
                attemptId: 'retry' as typeof setup.admission.attemptId,
                ordinal: 2,
              },
            ),
          ).toEqual({ kind: 'refused', reason: 'attempt_active' });
          expect(await reopened.runs.readRun(setup.run.runId)).toEqual(snapshot);
        }
      } finally {
        await reopened.close();
      }
    });
  });

executionEdgeContract('sqlite execution edges', create);

for (const fault of [
  'missing outbox',
  'missing completion',
  'state outcome mismatch',
  'completion authority mismatch',
  'completion attempt key',
] as const)
  test(`open rejects ${fault} after a committed outcome`, async () => {
    const setup = await durableFixture();
    const completion = createCompletion(setup.claim, setup.quiescence);
    unwrapReply(
      await recordOutcome(
        setup.stores.runs,
        setup.stores.artifacts,
        await setup.currentGuard(),
        completion,
      ),
    );
    await setup.stores.close();
    const database = new Database(setup.options.path);
    try {
      if (fault === 'missing outbox') database.run('DELETE FROM run5_outbox');
      else if (fault === 'missing completion') {
        database.run('DELETE FROM run5_outbox');
        database.run('DELETE FROM run5_completion');
      } else if (fault === 'state outcome mismatch')
        database.run(
          "UPDATE run5_attempt SET record=json_set(record,'$.state.outcome.summary','tampered')",
        );
      else if (fault === 'completion attempt key')
        database.run('UPDATE run5_completion SET attempt_id=\'"other"\'');
      else
        database.run(
          "UPDATE run5_completion SET record=json_set(record,'$.completion.intent.claim.attemptId','other')",
        );
      await rejects(openSqliteStores(setup.options), /corrupt/);
    } finally {
      database.close();
      rmSync(setup.directory, { recursive: true });
    }
  });

for (const kind of ['queued', 'turn_pending', 'reconciling', 'unresolved'] as const)
  test(`open rejects ${kind} recorded without held capacity even when reservation agrees`, async () => {
    const setup = await durableFixture();
    await setup.stores.close();
    const database = new Database(setup.options.path);
    try {
      const checkpoint = setup.checkpoint;
      const state =
        kind === 'queued'
          ? { kind }
          : kind === 'turn_pending'
            ? checkpoint
            : kind === 'reconciling'
              ? { kind, checkpoint, reason: 'lost' }
              : {
                  kind,
                  checkpoint,
                  observation: {
                    kind: 'artifact',
                    reason: 'lost',
                    evidence: setup.quiescence.evidence,
                  },
                };
      database
        .query(
          "UPDATE run5_attempt SET record=json_set(record,'$.state',json(?),'$.holdsCapacity',json('false'))",
        )
        .run(JSON.stringify(state));
      database.run('DELETE FROM run5_reservation');
      await rejects(openSqliteStores(setup.options), /corrupt/);
    } finally {
      database.close();
      rmSync(setup.directory, { recursive: true });
    }
  });
for (const kind of ['interrupted', 'waiting', 'outcome'] as const)
  test(`open rejects ${kind} releasing capacity with unknown effect`, async () => {
    const setup = await durableFixture();
    if (kind === 'outcome')
      unwrapReply(
        await recordOutcome(
          setup.stores.runs,
          setup.stores.artifacts,
          await setup.currentGuard(),
          createCompletion(setup.claim, setup.quiescence),
        ),
      );
    else
      unwrapReply(
        await setup.stores.runs.recordExecution(
          await setup.currentGuard(),
          createExecutionCommand(
            kind === 'interrupted'
              ? { kind, quiescence: setup.quiescence }
              : decodeExecutionFact({
                  kind,
                  wait: {
                    version: 1,
                    correlationKey: 'question',
                    prompt: setup.quiescence.evidence,
                    choices: ['yes'],
                  },
                  quiescence: setup.quiescence,
                }),
          ),
        ),
      );
    await setup.stores.close();
    const database = new Database(setup.options.path);
    try {
      database.run(
        "UPDATE run5_attempt SET record=json_set(record,'$.state.quiescence.effect','unknown')",
      );
      if (kind === 'outcome')
        database.run(
          "UPDATE run5_completion SET record=json_set(record,'$.completion.quiescence.effect','unknown')",
        );
      await rejects(openSqliteStores(setup.options), /corrupt/);
    } finally {
      database.close();
      rmSync(setup.directory, { recursive: true });
    }
  });

executionCommandContract('sqlite execution commands', create);

for (const fault of ['command key', 'attempt key', 'run key'] as const)
  test(`open rejects immutable execution ${fault} corruption`, async () => {
    const setup = await durableFixture();
    await setup.stores.close();
    const database = new Database(setup.options.path);
    try {
      if (fault === 'command key')
        database.run(
          "UPDATE run5_execution SET record=json_set(record,'$.command.commandId','other')",
        );
      else if (fault === 'attempt key')
        database.run(
          "UPDATE run5_execution SET reply=json_set(reply,'$.attempt.attemptId','other')",
        );
      else
        database.run(
          "UPDATE run5_execution SET reply=json_set(reply,'$.attempt.identity.runId','other')",
        );
      await rejects(openSqliteStores(setup.options), /corrupt/);
    } finally {
      database.close();
      rmSync(setup.directory, { recursive: true });
    }
  });

outcomeCollisionContract('sqlite completion collisions', create);

test('open identifies a physically relabeled completion before treating it as another pending command', async () => {
  const setup = await durableFixture();
  unwrapReply(
    await recordOutcome(
      setup.stores.runs,
      setup.stores.artifacts,
      await setup.currentGuard(),
      createCompletion(setup.claim, setup.quiescence),
    ),
  );
  await setup.stores.close();
  const database = new Database(setup.options.path);
  try {
    database.run('UPDATE run5_completion SET command_id=\'"relabeled"\'');
    database.run('UPDATE run5_outbox SET command_id=\'"relabeled"\'');
    await rejects(
      openSqliteStores(setup.options),
      (cause: unknown) =>
        cause instanceof Error &&
        cause.cause instanceof Error &&
        cause.cause.message.includes('corrupt completion identity'),
    );
  } finally {
    database.close();
    rmSync(setup.directory, { recursive: true });
  }
});
