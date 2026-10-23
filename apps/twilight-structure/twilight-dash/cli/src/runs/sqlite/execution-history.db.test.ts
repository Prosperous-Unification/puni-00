import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';

import { organizationId } from '../record-codecs';
import { executionHistoryContract } from '../testing/execution-history-contract';
import { FixtureClock } from '../testing/fixtures';
import { bootstrapSqliteStores } from './open-stores';

async function createExecutionDatabase() {
  const directory = mkdtempSync(join(tmpdir(), 'execution-history-'));
  const clock = new FixtureClock();
  const options = {
    path: join(directory, 'runs.sqlite'),
    organizationId: organizationId('organization'),
    capacity: 2,
    leaseMilliseconds: 100,
    clock,
    maxBusyAttempts: 20,
    busyDelayMilliseconds: 1,
  };
  try {
    const stores = await bootstrapSqliteStores(options);
    return {
      ...stores,
      connection: stores,
      directory,
      options,
      clock,
      close() {
        stores.close();
        rmSync(directory, { recursive: true, force: true });
      },
    };
  } catch (cause) {
    rmSync(directory, { recursive: true, force: true });
    throw cause;
  }
}
executionHistoryContract('sqlite execution history', createExecutionDatabase);
test('execution history bootstrap declares format3', async () => {
  const stores = await createExecutionDatabase();
  const database = new Database(stores.options.path, { readonly: true });
  try {
    expect(database.query('SELECT schema_version FROM run_meta').get()).toEqual({
      schema_version: 3,
    });
  } finally {
    database.close();
    stores.close();
  }
});

import { prepareSession, unwrapReply } from '../testing/fixtures';
test('sqlite renewal audits lost execution history after owner fencing', async () => {
  const stores = await createExecutionDatabase();
  const database = new Database(stores.options.path);
  try {
    const setup = await prepareSession(stores);
    database.query('DELETE FROM run_execution WHERE command_id=?').run(setup.opened.commandId);
    expect(
      await stores.runs.renewOwnership({ ...setup.ownership, epoch: setup.ownership.epoch + 1 }),
    ).toEqual({ kind: 'refused', reason: 'owner_stale' });
    // eslint-disable-next-line @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression -- Bun rejection matchers complete asynchronously despite their void declaration; keep the assertion awaited.
    await expect(stores.runs.renewOwnership(setup.ownership)).rejects.toThrow(
      /provenance|revision|history/,
    );
  } finally {
    database.close();
    stores.close();
  }
});

import { stageClaimRequest } from '../claim-history';
import { executionCommandId, ownerId } from '../record-codecs';
import { recordPreparation } from '../record-preparation';
import { admitExecution, createExecutionCommand } from '../testing/fixtures';
import { authorityRequest, runtimeEvidence } from '../testing/runtime-history-contract';

test('history rejects preparation owner earlier than admission with otherwise coherent replies', async () => {
  const stores = await createExecutionDatabase();
  const database = new Database(stores.options.path);
  try {
    const first = unwrapReply(await stores.runs.acquireOwnership(ownerId('first'), 0));
    stores.clock.advance(101);
    const second = unwrapReply(await stores.runs.acquireOwnership(ownerId('second'), first.epoch));
    const setup = await admitExecution(stores, { ownership: second, suffix: 'later' });
    unwrapReply(
      await recordPreparation(
        stores.runs,
        stores.artifacts,
        await setup.currentGuard(),
        setup.preparationInput,
      ),
    );
    stores.clock.advance(101);
    unwrapReply(await stores.runs.acquireOwnership(ownerId('third'), second.epoch));
    expect(
      (await stores.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId)).attempt
        .admittedEpoch,
    ).toBe(2);
    database.run(
      "UPDATE run_execution SET record=json_set(record,'$.command.fact.intent.owner.epoch',1),reply=json_set(reply,'$.attempt.state.preparation.owner.epoch',1)",
    );
    database.run(
      "UPDATE run_attempt SET record=json_set(record,'$.state.preparation.owner.epoch',1)",
    );
    // eslint-disable-next-line @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression -- Bun rejection matchers complete asynchronously despite their void declaration; keep the assertion awaited.
    await expect(
      stores.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId),
    ).rejects.toThrow('corrupt preparation owner');
  } finally {
    database.close();
    stores.close();
  }
});

test('history rejects same epoch reattachment label change below current ownership', async () => {
  const stores = await createExecutionDatabase();
  const database = new Database(stores.options.path);
  try {
    const setup = await prepareSession(stores);
    const command = createExecutionCommand(
      {
        kind: 'session_reattached',
        locator: setup.locator,
        owner: setup.owner,
        evidence: setup.preparationInput.stateEvidence,
      },
      'reattached',
    );
    unwrapReply(await stores.runs.recordExecution(await setup.currentGuard(), command));
    stores.clock.advance(101);
    unwrapReply(await stores.runs.acquireOwnership(ownerId('later'), setup.ownership.epoch));
    expect(
      (await stores.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId)).executions,
    ).toHaveLength(3);
    database
      .query(
        "UPDATE run_execution SET record=json_set(record,'$.command.fact.owner.ownerId','forged'),reply=json_set(reply,'$.attempt.state.session.attachment.owner.ownerId','forged') WHERE command_id=?",
      )
      .run(command.commandId);
    database.run(
      "UPDATE run_attempt SET record=json_set(record,'$.state.session.attachment.owner.ownerId','forged')",
    );
    // eslint-disable-next-line @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression -- Bun rejection matchers complete asynchronously despite their void declaration; keep the assertion awaited.
    await expect(
      stores.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId),
    ).rejects.toThrow('corrupt execution command transition');
  } finally {
    database.close();
    stores.close();
  }
});

for (const fault of ['earlier epoch', 'same epoch different label'] as const)
  test('history rejects claim stage owner ' + fault + ' than retained attachment', async () => {
    const stores = await createExecutionDatabase();
    const database = new Database(stores.options.path);
    try {
      const setup = await prepareSession(stores);
      stores.clock.advance(101);
      const second = unwrapReply(
        await stores.runs.acquireOwnership(ownerId('second'), setup.ownership.epoch),
      );
      unwrapReply(
        await stores.runs.recordExecution(
          { ...(await setup.currentGuard()), ownership: second },
          createExecutionCommand(
            {
              kind: 'session_reattached',
              locator: setup.locator,
              owner: { ownerId: second.ownerId, epoch: second.epoch },
              evidence: setup.preparationInput.stateEvidence,
            },
            'attached-second',
          ),
        ),
      );
      const rotated = unwrapReply(
        await stores.runs.stageRuntimeRequest(
          { ownership: second, scope: setup.scope, expectedRevision: 2 },
          authorityRequest('rotated', 1, setup.scope),
        ),
      );
      unwrapReply(
        await stores.runs.recordRuntimeAcceptance(
          { ownership: second, scope: setup.scope, expectedRevision: 3 },
          { intent: rotated, evidence: runtimeEvidence },
        ),
      );
      const staged = unwrapReply(
        await stageClaimRequest(
          stores.runs,
          stores.artifacts,
          { ...(await setup.scopedGuard()), ownership: second },
          {
            commandId: executionCommandId('stage'),
            canonicalRequest: setup.canonicalRequest.replace('"generation":1', '"generation":2'),
            stateEvidence: setup.preparationInput.stateEvidence,
          },
        ),
      );
      stores.clock.advance(101);
      unwrapReply(await stores.runs.acquireOwnership(ownerId('third'), second.epoch));
      expect(
        (await stores.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId)).attempt
          .state.kind,
      ).toBe('claiming');
      const forged =
        fault === 'earlier epoch'
          ? { ownerId: setup.owner.ownerId, epoch: 1 }
          : { ownerId: 'forged', epoch: 2 };
      for (const commandId of [rotated.commandId, staged.intent.commandId])
        database
          .query(
            "UPDATE run_runtime_intent SET record=json_set(record,'$.localOwner',json(?)) WHERE command_id=?",
          )
          .run(JSON.stringify(forged), commandId);
      database
        .query(
          "UPDATE run_execution SET reply=json_set(reply,'$.intent.localOwner',json(?),'$.attempt.state.intent.localOwner',json(?)) WHERE command_id='stage'",
        )
        .run(JSON.stringify(forged), JSON.stringify(forged));
      database
        .query("UPDATE run_attempt SET record=json_set(record,'$.state.intent.localOwner',json(?))")
        .run(JSON.stringify(forged));
      // eslint-disable-next-line @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression -- Bun rejection matchers complete asynchronously despite their void declaration; keep the assertion awaited.
      await expect(
        stores.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId),
      ).rejects.toThrow('corrupt claim stage consequence');
    } finally {
      database.close();
      stores.close();
    }
  });

import type { Ownership } from '../records';
import { prepareClaimed, prepareTurn, stageFixtureTurn } from '../testing/fixtures';
async function rotateAuthority(
  setup: Awaited<ReturnType<typeof prepareClaimed>>,
  ownership: Ownership,
  commandId: string,
  generation: number,
) {
  const scope = await setup.runs.readRuntimeScope(setup.scope);
  if (scope.kind !== 'pinned') throw new Error('fixture scope missing');
  const intent = unwrapReply(
    await setup.runs.stageRuntimeRequest(
      { ownership, scope: setup.scope, expectedRevision: scope.revision },
      authorityRequest(commandId, generation, setup.scope),
    ),
  );
  unwrapReply(
    await setup.runs.recordRuntimeAcceptance(
      { ownership, scope: setup.scope, expectedRevision: scope.revision + 1 },
      { intent, evidence: runtimeEvidence },
    ),
  );
}
for (const cut of [
  'before claim acceptance',
  'backward continuation',
  'pending prefix',
  'older same epoch grant',
] as const)
  test('independent context rejects ' + cut + ' with coherent remaining history', async () => {
    const stores = await createExecutionDatabase();
    const database = new Database(stores.options.path);
    try {
      const setup = await prepareClaimed(stores);
      if (cut !== 'before claim acceptance')
        await rotateAuthority(setup, setup.ownership, 'rotated', 1);
      const first = await stageFixtureTurn(setup);
      let commandId = 'stage-turn';
      if (cut === 'backward continuation') {
        unwrapReply(
          await stores.runs.recordExecution(
            await setup.currentGuard(),
            createExecutionCommand(
              {
                kind: 'turn_observed',
                reply: {
                  kind: 'not_started',
                  reason: 'session_busy',
                  identity: { locator: setup.locator, turnKey: 'turn', owner: setup.owner },
                },
              },
              'not-started',
            ),
          ),
        );
        await stageFixtureTurn(setup, { kind: 'initial' }, 'second');
        commandId = 'stage-second';
      }
      const guard = await setup.scopedGuard();
      const before = await stores.runs.readExecutionHistory(
        setup.run.runId,
        setup.attempt.attemptId,
      );
      expect(
        before.executions.find((entry) => entry.command.commandId === commandId)?.context,
      ).toEqual({ version: 1, scopeRevision: cut === 'before claim acceptance' ? 4 : 6 });
      if (cut !== 'older same epoch grant')
        database
          .query(
            "UPDATE run_execution SET record=json_set(record,'$.context.scopeRevision',?) WHERE command_id=?",
          )
          .run(
            cut === 'before claim acceptance' ? 2 : cut === 'backward continuation' ? 4 : 5,
            commandId,
          );
      if (
        cut === 'backward continuation' ||
        cut === 'older same epoch grant' ||
        cut === 'pending prefix'
      ) {
        database
          .query(
            "UPDATE run_execution SET reply=json_set(reply,'$.intent.grantCommandId','authority','$.attempt.state.turn.grantCommandId','authority') WHERE command_id=?",
          )
          .run(commandId);
        database.run(
          "UPDATE run_attempt SET record=json_set(record,'$.state.turn.grantCommandId','authority')",
        );
      }
      const message =
        cut === 'pending prefix'
          ? 'corrupt turn stage consequence'
          : cut === 'older same epoch grant'
            ? 'corrupt execution command reply'
            : 'execution scope context moves backward';
      // eslint-disable-next-line @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression -- Bun rejection matchers complete asynchronously despite their void declaration; keep the assertion awaited.
      await expect(
        stores.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId),
      ).rejects.toThrow(message);
      // eslint-disable-next-line @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression -- Bun rejection matchers complete asynchronously despite their void declaration; keep the assertion awaited.
      await expect(
        stores.runs.stageTurn(guard, {
          version: 2,
          kind: 'stage_turn',
          commandId: executionCommandId('stage-turn'),
          request: first.intent.request,
        }),
      ).rejects.toThrow(message);
    } finally {
      database.close();
      stores.close();
    }
  });

test('original turn acknowledgement survives later grant and owner takeover with independent context', async () => {
  const stores = await createExecutionDatabase();
  try {
    const setup = await prepareTurn(stores);
    await rotateAuthority(setup, setup.ownership, 'same-epoch-later-grant', 1);
    stores.clock.advance(101);
    const replacement = unwrapReply(
      await stores.runs.acquireOwnership(ownerId('replacement'), setup.ownership.epoch),
    );
    await rotateAuthority(setup, replacement, 'replacement-grant', 2);
    const guard = { ...(await setup.scopedGuard()), ownership: replacement };
    const command = {
      version: 2 as const,
      kind: 'stage_turn' as const,
      commandId: executionCommandId('stage-turn'),
      request: setup.turn.intent.request,
    };
    expect(await stores.runs.stageTurn(guard, command)).toEqual({
      kind: 'duplicate',
      value: setup.turn,
    });
    expect(
      (
        await stores.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId)
      ).executions.at(-1)?.context,
    ).toEqual({ version: 1, scopeRevision: 4 });
  } finally {
    stores.close();
  }
});

import {
  type CoupledProviderCommand as CoupledCommand,
  invokeCoupledProvider as invokeCoupled,
  prepareCoupledProvider,
} from '../testing/execution-history-contract';
import { openSqliteStores } from './open-stores';
async function prepareCoupled(kind: CoupledCommand['kind']) {
  const stores = await createExecutionDatabase();
  try {
    const prepared = await prepareCoupledProvider(stores, kind, {
      stage: executionCommandId('coupled-stage'),
      accept: executionCommandId('coupled-accept'),
      turn: executionCommandId('coupled-turn'),
      turnKey: 'turn',
    });
    return { stores, ...prepared };
  } catch (cause) {
    stores.close();
    throw cause;
  }
}
function captureRows(database: Database) {
  const tables = database
    .query("SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE 'run_%' ORDER BY name")
    .all() as { name: string }[];
  return tables.map(({ name }) => ({
    name,
    rows: database.query('SELECT * FROM "' + name.replaceAll('"', '""') + '" ORDER BY rowid').all(),
  }));
}
for (const kind of ['stage_claim', 'accept_claim', 'stage_turn'] as const) {
  const seams =
    kind === 'stage_turn'
      ? ['attempt', 'execution']
      : ['scope row', 'scope counter', 'attempt', 'execution'];
  for (const seam of seams)
    test(
      'coupled ' + kind + ' rolls back both histories after ' + seam + ' abort and reopens exactly',
      async () => {
        const fixture = await prepareCoupled(kind);
        const database = new Database(fixture.stores.options.path);
        try {
          const before = captureRows(database);
          const history = await fixture.stores.runs.readExecutionHistory(
            fixture.setup.run.runId,
            fixture.setup.attempt.attemptId,
          );
          const target =
            seam === 'scope row'
              ? kind === 'stage_claim'
                ? 'INSERT ON run_runtime_intent'
                : 'INSERT ON run_runtime_acceptance'
              : seam === 'scope counter'
                ? 'UPDATE ON run_format'
                : seam === 'attempt'
                  ? 'UPDATE ON run_attempt'
                  : 'INSERT ON run_execution';
          database.run(
            'CREATE TRIGGER abort_coupled BEFORE ' +
              target +
              " BEGIN SELECT RAISE(ABORT,'abort coupled publication'); END",
          );
          // eslint-disable-next-line @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression -- Bun rejection matchers complete asynchronously despite their void declaration; keep the assertion awaited.
          await expect(
            invokeCoupled(fixture.stores.runs, fixture.guard, fixture.command),
          ).rejects.toThrow('abort coupled publication');
          expect(captureRows(database)).toEqual(before);
          expect(
            await fixture.stores.runs.readExecutionHistory(
              fixture.setup.run.runId,
              fixture.setup.attempt.attemptId,
            ),
          ).toEqual(history);
          database.run('DROP TRIGGER abort_coupled');
          fixture.stores.connection.close();
          const reopened = await openSqliteStores(fixture.stores.options);
          try {
            expect(captureRows(database)).toEqual(before);
            expect(
              await reopened.runs.readExecutionHistory(
                fixture.setup.run.runId,
                fixture.setup.attempt.attemptId,
              ),
            ).toEqual(history);
            const committed = await invokeCoupled(reopened.runs, fixture.guard, fixture.command);
            if (committed.kind === 'refused')
              throw new Error('restored coupled operation refused: ' + committed.reason);
            expect(committed.kind).toBe('applied');
            expect(committed.value.attempt.revision).toBe(
              fixture.guard.expectedAttemptRevision + 1,
            );
            expect((await reopened.runs.readRun(fixture.setup.run.runId)).capacity.reserved).toBe(
              1,
            );
            const scope = await reopened.runs.readRuntimeScope(fixture.setup.scope);
            expect(scope).toMatchObject({
              revision: fixture.guard.expectedScopeRevision + (kind === 'stage_turn' ? 0 : 1),
              pendingCommandId: kind === 'stage_claim' ? 'wire-claim' : null,
            });
          } finally {
            reopened.close();
          }
        } finally {
          database.close();
          fixture.stores.close();
        }
      },
    );
}

import { afterAll, beforeAll, describe } from 'bun:test';
const coupledChildSource = `
import { writeSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { Database } from 'bun:sqlite';
import { openSqliteStores } from ${JSON.stringify(new URL('./open-stores.ts', import.meta.url).pathname)};
const packet=JSON.parse(process.env.RUN_COUPLED_CHILD);
const stores=await openSqliteStores({...packet.options,clock:{read:()=>1000}});
writeSync(1,JSON.stringify({phase:'ready'})+'\\n');
let timer;
try {
 const signal=await Promise.race([Bun.stdin.text(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('coupled start timed out')),10000);})]);
 assert.equal(signal,'start-coupled\\n');
} finally { if(timer!==undefined) clearTimeout(timer); }
if(packet.mode==='before') {
 const original=Database.prototype.run;
 Database.prototype.run=function(sql,...parameters) {
  const execution=sql==='COMMIT'?this.query('SELECT record,reply FROM run_execution WHERE command_id=?').get(packet.command.commandId):null;
  if(execution!==null) {
   assert.equal(this.inTransaction,true,'coupled COMMIT has active transaction');
   const scope=this.query('SELECT revision FROM run_runtime_scope').get();
   const counts=this.query('SELECT scope_count,intent_count,acceptance_count FROM run_format').get();
   const run=this.query('SELECT record FROM run_record WHERE run_id=?').get(packet.guard.runId);
   const attempt=this.query('SELECT record FROM run_attempt WHERE attempt_id=?').get(packet.guard.attemptId);
   assert.equal(JSON.parse(run.record).revision,packet.guard.expectedRevision+1);
   assert.equal(JSON.parse(attempt.record).revision,packet.guard.expectedAttemptRevision+1);
   assert.equal(JSON.parse(execution.record).context.scopeRevision,packet.guard.expectedScopeRevision);
   assert.deepEqual(JSON.parse(execution.reply).attempt,JSON.parse(attempt.record));
   assert.equal(this.query('SELECT count(*) AS count FROM run_reservation').get().count,1);
   assert.equal(scope.revision,packet.guard.expectedScopeRevision+(packet.command.kind==='stage_turn'?0:1));
   assert.deepEqual(counts,{scope_count:packet.counts.scope_count,intent_count:packet.counts.intent_count+(packet.command.kind==='stage_claim'?1:0),acceptance_count:packet.counts.acceptance_count+(packet.command.kind==='accept_claim'?1:0)});
   if(packet.command.kind==='stage_claim') assert.ok(this.query('SELECT record FROM run_runtime_intent WHERE command_id=?').get(JSON.parse(packet.command.canonicalRequest).commandId));
   if(packet.command.kind==='accept_claim') assert.ok(this.query('SELECT record FROM run_runtime_acceptance WHERE command_id=?').get(packet.command.intent.commandId));
   writeSync(1,JSON.stringify({phase:'before-commit',scope,counts,execution,attempt,run})+'\\n');
   const deadline=Date.now()+10000;while(Date.now()<deadline) Bun.sleepSync(5);throw new Error('coupled before COMMIT kill barrier timed out');
  }
  return original.call(this,sql,...parameters);
 };
}
const reply=packet.command.kind==='stage_claim'?await stores.runs.stageClaim(packet.guard,packet.command):packet.command.kind==='accept_claim'?await stores.runs.recordClaimAcceptance(packet.guard,packet.command):await stores.runs.stageTurn(packet.guard,packet.command);
assert.equal(reply.kind,'applied');
writeSync(1,JSON.stringify({phase:'committed',reply})+'\\n');
const deadline=Date.now()+10000;while(Date.now()<deadline) await Bun.sleep(5);throw new Error('coupled after COMMIT kill barrier timed out');
`;
function spawnCoupledChild(packet: unknown) {
  const argv = [process.execPath, '-e', coupledChildSource];
  const child = Bun.spawn(argv, {
    env: { ...process.env, RUN_COUPLED_CHILD: JSON.stringify(packet) },
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  console.log(
    JSON.stringify({
      event: 'coupled-child-started',
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
        event: 'coupled-child-chunk',
        pid: child.pid,
        stream: 'stderr',
        base64: Buffer.from(bytes).toString('base64'),
        at: new Date().toISOString(),
      }),
    );
    return new TextDecoder().decode(bytes);
  });
  let pending = '';
  async function phase(): Promise<{ phase: string; reply?: { kind: string; value: unknown } }> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          for (;;) {
            const newline = pending.indexOf('\n');
            if (newline >= 0) {
              const line = pending.slice(0, newline);
              pending = pending.slice(newline + 1);
              // The same retained child source emits this protocol; each phase is asserted by its caller.
              return JSON.parse(line) as {
                phase: string;
                reply?: { kind: string; value: unknown };
              };
            }
            const chunk = await reader.read();
            if (chunk.done)
              throw new Error(
                'coupled child exited ' + String(await child.exited) + ': ' + (await stderr),
              );
            console.log(
              JSON.stringify({
                event: 'coupled-child-chunk',
                pid: child.pid,
                stream: 'stdout',
                base64: Buffer.from(chunk.value).toString('base64'),
                at: new Date().toISOString(),
              }),
            );
            pending += new TextDecoder().decode(chunk.value);
          }
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error('coupled child phase timed out'));
          }, 15000);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
  return {
    child,
    stderr,
    phase,
    async start() {
      await child.stdin.write('start-coupled\n');
      await child.stdin.flush();
      await child.stdin.end();
    },
    async close() {
      if (child.exitCode === null) child.kill('SIGKILL');
      const exitCode = await child.exited;
      await stderr;
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) {
          console.log(
            JSON.stringify({
              event: 'coupled-child-eof',
              pid: child.pid,
              stream: 'stdout',
              at: new Date().toISOString(),
            }),
          );
          break;
        }
        console.log(
          JSON.stringify({
            event: 'coupled-child-chunk',
            pid: child.pid,
            stream: 'stdout',
            base64: Buffer.from(chunk.value).toString('base64'),
            at: new Date().toISOString(),
          }),
        );
      }
      console.log(
        JSON.stringify({
          event: 'coupled-child-closed',
          pid: child.pid,
          exitCode,
          signal: child.signalCode,
          at: new Date().toISOString(),
        }),
      );
      reader.releaseLock();
    },
  };
}
async function prepareCoupledProcess(kind: CoupledCommand['kind'], mode: 'before' | 'after') {
  const fixture = await prepareCoupled(kind);
  let child: ReturnType<typeof spawnCoupledChild> | undefined;
  const database = new Database(fixture.stores.options.path);
  try {
    const before = captureRows(database);
    const history = await fixture.stores.runs.readExecutionHistory(
      fixture.setup.run.runId,
      fixture.setup.attempt.attemptId,
    );
    const counts = database
      .query('SELECT scope_count,intent_count,acceptance_count FROM run_format')
      .get();
    database.close();
    fixture.stores.connection.close();
    child = spawnCoupledChild({
      mode,
      options: fixture.stores.options,
      guard: fixture.guard,
      command: fixture.command,
      counts,
      before,
    });
    // Proof: F14 changed this child's ready phase to wrong-ready; the startup assertion failed and cleanup awaited SIGKILL, stdout EOF and exact directory removal. Restored claim-before passed.
    expect(await child.phase()).toEqual({ phase: 'ready' });
    return { fixture, child, before, history };
  } catch (cause) {
    try {
      if (child !== undefined) await child.close();
    } finally {
      database.close();
      fixture.stores.close();
    }
    throw cause;
  }
}
for (const kind of ['stage_claim', 'accept_claim', 'stage_turn'] as const)
  for (const mode of ['before', 'after'] as const)
    describe('coupled process ' + kind + ' ' + mode, () => {
      let prepared: Awaited<ReturnType<typeof prepareCoupledProcess>> | undefined;
      beforeAll(async () => {
        prepared = await prepareCoupledProcess(kind, mode);
      }, 15000);
      afterAll(async () => {
        if (prepared !== undefined) {
          try {
            await prepared.child.close();
          } finally {
            prepared.fixture.stores.close();
          }
        }
      });
      test(
        'SIGKILL ' +
          mode +
          ' ' +
          kind +
          ' retains both histories counters and reservations on reopen',
        async () => {
          if (prepared === undefined) throw new Error('coupled process setup did not finish');
          const { fixture, child, before, history } = prepared;
          await child.start();
          const phase = await child.phase();
          expect(phase.phase).toBe(mode === 'before' ? 'before-commit' : 'committed');
          child.child.kill('SIGKILL');
          await child.child.exited;
          expect(child.child.signalCode).toBe('SIGKILL');
          expect(await child.stderr).toBe('');
          const reopened = await openSqliteStores(fixture.stores.options);
          const database = new Database(fixture.stores.options.path);
          try {
            const after = await reopened.runs.readExecutionHistory(
              fixture.setup.run.runId,
              fixture.setup.attempt.attemptId,
            );
            if (mode === 'before') {
              expect(captureRows(database)).toEqual(before);
              expect(after).toEqual(history);
            } else {
              expect(phase.reply?.kind).toBe('applied');
              expect(after.attempt.revision).toBe(fixture.guard.expectedAttemptRevision + 1);
              expect(phase.reply?.value).toEqual(after.executions.at(-1)?.reply);
              expect(after.executions.at(-1)?.context).toEqual({
                version: 1,
                scopeRevision: fixture.guard.expectedScopeRevision,
              });
              expect((await reopened.runs.readRun(fixture.setup.run.runId)).capacity.reserved).toBe(
                1,
              );
              const scope = await reopened.runs.readRuntimeScope(fixture.setup.scope);
              expect(scope).toMatchObject({
                revision: fixture.guard.expectedScopeRevision + (kind === 'stage_turn' ? 0 : 1),
                pendingCommandId: kind === 'stage_claim' ? 'wire-claim' : null,
              });
              const duplicate = await invokeCoupled(reopened.runs, fixture.guard, fixture.command);
              expect(duplicate.kind).toBe('duplicate');
              if (duplicate.kind !== 'duplicate')
                throw new Error('coupled replay did not return duplicate');
              expect(phase.reply?.value).toEqual(duplicate.value);
            }
          } finally {
            database.close();
            reopened.close();
          }
        },
      );
    });

for (const kind of ['stage_claim', 'accept_claim', 'stage_turn'] as const)
  test('sqlite coupled ' + kind + ' audits missing opened history before publication', async () => {
    const fixture = await prepareCoupled(kind),
      database = new Database(fixture.stores.options.path);
    try {
      const opened = database
        .query('SELECT * FROM run_execution WHERE command_id=?')
        .get(fixture.setup.opened.commandId) as {
        command_id: string;
        attempt_id: string;
        record: string;
        reply: string;
      } | null;
      if (opened === null) throw new Error('opened fixture row missing');
      database.query('DELETE FROM run_execution WHERE command_id=?').run(opened.command_id);
      const before = captureRows(database);
      expect(
        await invokeCoupled(
          fixture.stores.runs,
          {
            ...fixture.guard,
            ownership: { ...fixture.guard.ownership, epoch: fixture.guard.ownership.epoch + 1 },
          },
          fixture.command,
        ),
      ).toEqual({ kind: 'refused', reason: 'owner_stale' });
      // eslint-disable-next-line @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression -- Bun rejection matchers complete asynchronously despite their void declaration; keep the assertion awaited.
      await expect(
        invokeCoupled(fixture.stores.runs, fixture.guard, fixture.command),
      ).rejects.toThrow(/provenance|revision|history/);
      expect(captureRows(database)).toEqual(before);
      database
        .query('INSERT INTO run_execution(command_id,attempt_id,record,reply) VALUES (?,?,?,?)')
        .run(opened.command_id, opened.attempt_id, opened.record, opened.reply);
      expect((await invokeCoupled(fixture.stores.runs, fixture.guard, fixture.command)).kind).toBe(
        'applied',
      );
    } finally {
      database.close();
      fixture.stores.close();
    }
  });

for (const kind of ['stage_claim', 'accept_claim', 'stage_turn'] as const)
  for (const boundary of ['guard', 'command'] as const)
    test(
      'sqlite coupled ' + kind + ' snapshots ' + boundary + ' before transaction await',
      async () => {
        const fixture = await prepareCoupled(kind);
        try {
          const expected = structuredClone(fixture.command);
          const pending = invokeCoupled(fixture.stores.runs, fixture.guard, fixture.command);
          if (boundary === 'guard')
            Object.assign(fixture.guard, {
              expectedScopeRevision: fixture.guard.expectedScopeRevision + 1,
            });
          else
            switch (fixture.command.kind) {
              case 'stage_claim': {
                const wire = JSON.parse(fixture.command.canonicalRequest) as { commandId: string };
                wire.commandId = 'caller-mutated-wire';
                Object.assign(fixture.command, { canonicalRequest: JSON.stringify(wire) });
                break;
              }
              case 'accept_claim':
                Object.assign(fixture.command.projection, { claimId: 'caller-mutated-claim' });
                break;
              case 'stage_turn':
                Object.assign(fixture.command.request, { input: 'caller-mutated-input' });
                break;
            }
          const applied = await pending;
          expect(applied.kind).toBe('applied');
          const history = await fixture.stores.runs.readExecutionHistory(
            fixture.setup.run.runId,
            fixture.setup.attempt.attemptId,
          );
          expect(
            history.executions.find((entry) => entry.command.commandId === expected.commandId)
              ?.command,
          ).toEqual(expected);
        } finally {
          fixture.stores.close();
        }
      },
    );

for (const kind of ['stage_claim', 'accept_claim', 'stage_turn'] as const)
  test('sqlite coupled ' + kind + ' audits absent reservation before publication', async () => {
    const fixture = await prepareCoupled(kind),
      database = new Database(fixture.stores.options.path);
    try {
      const reservation = database
        .query('SELECT attempt_id FROM run_reservation WHERE attempt_id=?')
        .get(fixture.setup.attempt.attemptId) as { attempt_id: string } | null;
      if (reservation === null) throw new Error('fixture reservation missing');
      database.query('DELETE FROM run_reservation WHERE attempt_id=?').run(reservation.attempt_id);
      const before = captureRows(database);
      expect(
        await invokeCoupled(
          fixture.stores.runs,
          {
            ...fixture.guard,
            ownership: { ...fixture.guard.ownership, epoch: fixture.guard.ownership.epoch + 1 },
          },
          fixture.command,
        ),
      ).toEqual({ kind: 'refused', reason: 'owner_stale' });
      // eslint-disable-next-line @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression -- Bun rejection matchers complete asynchronously despite their void declaration; keep the assertion awaited.
      await expect(
        invokeCoupled(fixture.stores.runs, fixture.guard, fixture.command),
      ).rejects.toThrow('corrupt attempt reservation');
      expect(captureRows(database)).toEqual(before);
      database
        .query('INSERT INTO run_reservation(attempt_id) VALUES (?)')
        .run(reservation.attempt_id);
      expect((await invokeCoupled(fixture.stores.runs, fixture.guard, fixture.command)).kind).toBe(
        'applied',
      );
    } finally {
      database.close();
      fixture.stores.close();
    }
  });

import { decodeRecordedExecution } from '../execution-codecs';
import {
  attemptId as historyAttemptId,
  decodeExecutionFact,
  decodeReceipt,
  executionCommandId as historyCommandId,
} from '../record-codecs';
import { prepareReceipt } from '../testing/receipts-contract';
import { runtimePin } from '../testing/runtime-history-contract';
import { prepareWait } from '../testing/signals-contract';
import { type HistoryCatalog, validateHistory } from '../validate-history';
import { readHistory } from './read-history';

describe('retained history owner', () => {
  const retained = new Map<string, HistoryCatalog>();
  function catalog(name: string): HistoryCatalog {
    const value = retained.get(name);
    if (value === undefined) throw new Error('missing retained catalog ' + name);
    return structuredClone(value);
  }
  function first<T>(entries: readonly T[]): T {
    const entry = entries[0];
    if (entry === undefined) throw new Error('missing retained fixture entry');
    return entry;
  }
  beforeAll(async () => {
    for (const kind of [
      'turn',
      'stage',
      'queued',
      'scope',
      'wait',
      'consumption',
      'second-wait',
      'completion',
      'receipt',
    ] as const) {
      const stores = await createExecutionDatabase();
      const database = new Database(stores.options.path);
      try {
        if (kind === 'scope') {
          const ownership = unwrapReply(
            await stores.runs.acquireOwnership(ownerId('scope-owner'), 0),
          );
          unwrapReply(await stores.runs.pinRuntimeScope(ownership, runtimePin));
        } else if (kind === 'wait') {
          const setup = await prepareWait(stores);
          unwrapReply(await stores.runs.receiveDecision(setup.ownership, setup.decision));
        } else if (kind === 'second-wait') {
          const setup = await prepareWait(stores);
          unwrapReply(await stores.runs.receiveDecision(setup.ownership, setup.decision));
          unwrapReply(
            await stores.runs.consumeDecision(
              await setup.currentGuard(),
              setup.decision.decisionId,
            ),
          );
          await stageFixtureTurn(
            setup,
            { kind: 'decision', decisionId: setup.decision.decisionId },
            'continued',
          );
          if (setup.command.fact.kind !== 'waiting')
            throw new Error('expected original wait command');
          unwrapReply(
            await stores.runs.recordExecution(
              await setup.currentGuard(),
              createExecutionCommand(
                decodeExecutionFact({
                  ...setup.command.fact,
                  wait: { ...setup.command.fact.wait, correlationKey: 'wait-2' },
                }),
                'second-wait',
              ),
            ),
          );
        } else if (kind === 'queued') await admitExecution(stores);
        else if (kind === 'turn') await prepareTurn(stores);
        else if (kind === 'stage') {
          const setup = await prepareSession(stores);
          unwrapReply(
            await stageClaimRequest(stores.runs, stores.artifacts, await setup.scopedGuard(), {
              commandId: executionCommandId('stage-claim'),
              canonicalRequest: setup.canonicalRequest,
              stateEvidence: setup.preparationInput.stateEvidence,
            }),
          );
        } else if (kind === 'consumption') {
          const setup = await prepareWait(stores);
          unwrapReply(await stores.runs.receiveDecision(setup.ownership, setup.decision));
          unwrapReply(
            await stores.runs.consumeDecision(
              await setup.currentGuard(),
              setup.decision.decisionId,
            ),
          );
        } else {
          const setup = await prepareReceipt(stores);
          if (kind === 'receipt')
            unwrapReply(
              await stores.runs.reconcileReceipt(await setup.currentGuard(), setup.receipt),
            );
        }
        retained.set(kind, structuredClone(readHistory(database).catalog));
      } finally {
        database.close();
        stores.close();
      }
    }
  });
  function rejects(
    name: string,
    fixture: string,
    message: string,
    corrupt: (source: HistoryCatalog) => HistoryCatalog,
  ) {
    test(name, () => {
      const source = catalog(fixture);
      expect(validateHistory(source)).toHaveLength(fixture === 'scope' ? 0 : 1);
      const candidate = corrupt(source);
      expect(() => validateHistory(candidate)).toThrow(message);
    });
  }
  rejects('duplicate manifest identity', 'turn', 'duplicate history identity', (source) => ({
    ...source,
    manifests: [...source.manifests, first(source.manifests)],
  }));
  rejects('orphan execution', 'turn', 'orphan execution history', (source) => {
    const entry = first(source.executions);
    return {
      ...source,
      executions: [
        ...source.executions,
        decodeRecordedExecution({
          ...entry,
          command: { ...entry.command, commandId: historyCommandId('orphan-execution') },
          reply: {
            ...entry.reply,
            attempt: { ...entry.reply.attempt, attemptId: historyAttemptId('orphan') },
          },
        }),
      ],
    };
  });
  rejects('orphan consumption', 'consumption', 'orphan consumption history', (source) => ({
    ...source,
    consumptions: [
      ...source.consumptions,
      {
        ...first(source.consumptions),
        reply: { ...first(source.consumptions).reply, attemptId: historyAttemptId('orphan') },
      },
    ],
  }));
  rejects('orphan completion', 'completion', 'orphan completion history', (source) => ({
    ...source,
    completions: [
      ...source.completions,
      { ...first(source.completions), attemptId: historyAttemptId('orphan') },
    ],
  }));
  rejects('orphan receipt', 'receipt', 'orphan receipt history', (source) => ({
    ...source,
    receipts: [
      ...source.receipts,
      {
        ...first(source.receipts),
        reply: { ...first(source.receipts).reply, attemptId: historyAttemptId('orphan') },
      },
    ],
  }));
  rejects('orphan decision', 'consumption', 'orphan decision history', (source) => ({
    ...source,
    decisions: [
      ...source.decisions,
      { ...first(source.decisions), attemptId: historyAttemptId('orphan') },
    ],
  }));
  rejects('admission ordinal differs', 'turn', 'corrupt admission identity', (source) => ({
    ...source,
    attempts: source.attempts.map((entry) => ({
      ...entry,
      admission: { ...entry.admission, ordinal: entry.admission.ordinal + 1 },
    })),
  }));
  for (const kind of ['stage', 'acceptance'] as const)
    rejects(
      'unlinked runtime claim ' + kind,
      kind === 'stage' ? 'stage' : 'turn',
      'runtime claim has no execution ' + kind,
      (source) => {
        const last = source.executions.find((entry) =>
          kind === 'stage'
            ? entry.command.kind === 'execution' && entry.command.fact.kind === 'session_prepared'
            : entry.command.kind === 'stage_claim',
        );
        if (last === undefined) throw new Error('missing predecessor for unlinked runtime claim');
        const attempt = last.reply.attempt;
        return {
          ...source,
          executions: source.executions.filter(
            (entry) => entry.reply.attempt.revision <= attempt.revision,
          ),
          attempts: source.attempts.map((entry) => ({ ...entry, attempt })),
          runs: source.runs.map((entry) => ({
            ...entry,
            run: { ...entry.run, revision: attempt.revision + 1 },
          })),
        };
      },
    );
  rejects(
    'original consumption reply differs',
    'consumption',
    'corrupt consumption reply',
    (source) => {
      const consumption = first(source.consumptions);
      if (consumption.reply.state.kind !== 'ready') throw new Error('expected ready consumption');
      const reply = {
        ...consumption.reply,
        state: { ...consumption.reply.state, cause: { kind: 'initial' as const } },
      };
      return {
        ...source,
        consumptions: [{ ...consumption, reply }],
        attempts: source.attempts.map((entry) => ({ ...entry, attempt: reply })),
      };
    },
  );
  for (const kind of ['completion', 'receipt'] as const)
    rejects(
      'original ' + kind + ' reply differs',
      kind,
      'corrupt ' + kind + ' original reply',
      (source) => {
        if (kind === 'completion') {
          const completion = first(source.completions);
          if (completion.reply.state.kind !== 'outcome_pending_progress')
            throw new Error('expected pending completion');
          const reply = {
            ...completion.reply,
            state: {
              ...completion.reply.state,
              quiescence: { ...completion.reply.state.quiescence, observedAt: 1001 },
            },
          };
          return {
            ...source,
            completions: [{ ...completion, reply }],
            attempts: source.attempts.map((entry) => ({ ...entry, attempt: reply })),
          };
        }
        const receipt = first(source.receipts);
        if (receipt.reply.state.kind !== 'terminal') throw new Error('expected terminal receipt');
        const reply = {
          ...receipt.reply,
          state: {
            ...receipt.reply.state,
            quiescence: { ...receipt.reply.state.quiescence, observedAt: 1001 },
          },
        };
        return {
          ...source,
          receipts: [{ ...receipt, reply }],
          attempts: source.attempts.map((entry) => ({ ...entry, attempt: reply })),
        };
      },
    );
  rejects('current attempt differs', 'receipt', 'corrupt current attempt provenance', (source) => ({
    ...source,
    attempts: source.attempts.map((entry) => {
      if (entry.attempt.state.kind !== 'terminal') throw new Error('expected terminal attempt');
      return {
        ...entry,
        attempt: {
          ...entry.attempt,
          state: {
            ...entry.attempt.state,
            quiescence: { ...entry.attempt.state.quiescence, observedAt: 1001 },
          },
        },
      };
    }),
  }));
  rejects('initial run differs', 'turn', 'corrupt run identity', (source) => ({
    ...source,
    runs: source.runs.map((entry) => ({ ...entry, initial: { ...entry.initial, revision: 1 } })),
  }));
  rejects('run revision differs', 'turn', 'corrupt run revision provenance', (source) => ({
    ...source,
    runs: source.runs.map((entry) => ({
      ...entry,
      run: { ...entry.run, revision: entry.run.revision + 1 },
    })),
  }));
  rejects('duplicate reservation', 'turn', 'corrupt reservation capacity', (source) => ({
    ...source,
    reservations: [...source.reservations, first(source.reservations)],
  }));
  rejects('capacity below reservations', 'turn', 'corrupt reservation capacity', (source) => ({
    ...source,
    capacity: 0,
  }));
  rejects('orphan reservation', 'turn', 'orphan reservation', (source) => ({
    ...source,
    reservations: [...source.reservations, historyAttemptId('orphan')],
  }));
  rejects('scope audit precedes attempts', 'scope', 'corrupt runtime final revision', (source) => ({
    ...source,
    runtime: {
      ...source.runtime,
      scopes: source.runtime.scopes.map((entry) => ({ ...entry, revision: 1 })),
    },
  }));
  rejects('duplicate run identity', 'turn', 'duplicate history identity', (source) => ({
    ...source,
    runs: [...source.runs, first(source.runs)],
  }));
  rejects('duplicate attempt identity', 'queued', 'duplicate history identity', (source) => ({
    ...source,
    attempts: [...source.attempts, first(source.attempts)],
    runs: source.runs.map((entry) => ({
      ...entry,
      run: { ...entry.run, revision: entry.run.revision * 2 },
    })),
  }));
  rejects('admission attempt differs', 'turn', 'corrupt admission identity', (source) => ({
    ...source,
    attempts: source.attempts.map((entry) => ({
      ...entry,
      admission: { ...entry.admission, attemptId: historyAttemptId('different') },
    })),
  }));
  rejects('admission activity differs', 'turn', 'corrupt admission identity', (source) => ({
    ...source,
    attempts: source.attempts.map((entry) => ({
      ...entry,
      admission: {
        ...entry.admission,
        identity: {
          ...entry.admission.identity,
          occurrenceId: 'different' as typeof entry.admission.identity.occurrenceId,
        },
      },
    })),
  }));
  rejects('missing run diagnostic', 'turn', 'attempt run does not exist', (source) => ({
    ...source,
    runs: [],
  }));
  rejects('missing manifest diagnostic', 'turn', 'manifest does not exist', (source) => ({
    ...source,
    manifests: [],
  }));
  rejects('duplicate execution diagnostic', 'turn', 'duplicate execution identity', (source) => ({
    ...source,
    executions: [...source.executions, first(source.executions)],
  }));
  rejects(
    'duplicate completion diagnostic',
    'completion',
    'duplicate settlement history',
    (source) => ({ ...source, completions: [...source.completions, first(source.completions)] }),
  );
  rejects('event revision diagnostic', 'turn', 'corrupt attempt event revision', (source) => ({
    ...source,
    executions: source.executions.map((entry, index) =>
      index === 0
        ? decodeRecordedExecution({
            ...entry,
            reply: { ...entry.reply, attempt: { ...entry.reply.attempt, revision: 2 } },
          })
        : entry,
    ),
  }));
  rejects(
    'consumed wait provenance differs',
    'consumption',
    'corrupt consumed wait provenance',
    (source) => ({
      ...source,
      consumptions: source.consumptions.map((entry) => ({
        ...entry,
        wait: {
          ...entry.wait,
          prompt: { ...entry.wait.prompt, byteLength: entry.wait.prompt.byteLength + 1 },
        },
      })),
    }),
  );
  rejects(
    'decision names absent wait choice',
    'wait',
    'corrupt decision wait provenance',
    (source) => ({
      ...source,
      decisions: source.decisions.map((entry) => ({ ...entry, choice: 'absent-choice' })),
    }),
  );
  rejects(
    'completion record version differs',
    'completion',
    'corrupt completion transition',
    (source) => ({
      ...source,
      completions: source.completions.map((entry) => ({ ...entry, version: 2 as 1 })),
    }),
  );
  rejects(
    'missing receipt completion diagnostic',
    'receipt',
    'receipt completion does not exist',
    (source) => {
      const receipt = first(source.receipts);
      const reply = { ...receipt.reply, revision: receipt.reply.revision - 1 };
      return {
        ...source,
        completions: [],
        receipts: [{ ...receipt, reply }],
        attempts: source.attempts.map((entry) => ({ ...entry, attempt: reply })),
        runs: source.runs.map((entry) => ({
          ...entry,
          run: { ...entry.run, revision: entry.run.revision - 1 },
        })),
      };
    },
  );
  rejects(
    'claim stage link revision diagnostic',
    'stage',
    'corrupt claim stage link',
    (source) => ({
      ...source,
      executions: source.executions.map((entry) =>
        entry.command.kind === 'stage_claim'
          ? decodeRecordedExecution({ ...entry, context: { version: 1, scopeRevision: 1 } })
          : entry,
      ),
    }),
  );
  rejects(
    'claim acceptance link revision diagnostic',
    'turn',
    'corrupt claim acceptance link',
    (source) => ({
      ...source,
      executions: source.executions.map((entry) =>
        entry.command.kind === 'accept_claim'
          ? decodeRecordedExecution({ ...entry, context: { version: 1, scopeRevision: 4 } })
          : entry,
      ),
    }),
  );

  rejects(
    'remaining unavailable scope diagnostic',
    'stage',
    'execution scope context is unavailable',
    (source) => ({ ...source, runtime: { scopes: [], intents: [], acceptances: [] } }),
  );
  rejects(
    'remaining future scope diagnostic',
    'stage',
    'execution scope context is unavailable',
    (source) => ({
      ...source,
      executions: source.executions.map((entry) =>
        entry.command.kind === 'stage_claim'
          ? decodeRecordedExecution({
              ...entry,
              context: { version: 1, scopeRevision: first(source.runtime.scopes).revision + 1 },
            })
          : entry,
      ),
    }),
  );
  rejects(
    'remaining ordinary refusal diagnostic',
    'turn',
    'corrupt execution command transition',
    (source) => ({
      ...source,
      executions: source.executions.map((entry) =>
        entry.command.kind === 'execution' && entry.command.fact.kind === 'session_prepared'
          ? decodeRecordedExecution({
              ...entry,
              command: {
                ...entry.command,
                fact: {
                  ...entry.command.fact,
                  owner: { ...entry.command.fact.owner, ownerId: ownerId('different') },
                },
              },
            })
          : entry,
      ),
    }),
  );
  rejects(
    'remaining missing scoped predecessor diagnostic',
    'stage',
    'scoped execution predecessor has no session',
    (source) => ({
      ...source,
      executions: source.executions
        .filter((entry) => entry.context !== null)
        .map((entry) =>
          decodeRecordedExecution({
            ...entry,
            reply: {
              ...entry.reply,
              attempt: { ...entry.reply.attempt, revision: entry.reply.attempt.revision - 2 },
            },
          }),
        ),
      attempts: source.attempts.map((entry) => ({
        ...entry,
        attempt: { ...entry.attempt, revision: entry.attempt.revision - 2 },
      })),
      runs: source.runs.map((entry) => ({
        ...entry,
        run: { ...entry.run, revision: entry.run.revision - 2 },
      })),
    }),
  );
  rejects(
    'remaining stage refusal diagnostic',
    'stage',
    'corrupt claim stage consequence',
    (source) => ({
      ...source,
      executions: source.executions.map((entry) =>
        entry.command.kind === 'stage_claim'
          ? decodeRecordedExecution({
              ...entry,
              command: {
                ...entry.command,
                observation: { ...entry.command.observation, stepCode: 'different' },
              },
            })
          : entry,
      ),
    }),
  );
  rejects(
    'remaining acceptance consequence diagnostic',
    'turn',
    'corrupt claim acceptance consequence',
    (source) => ({
      ...source,
      executions: source.executions.map((entry) =>
        entry.command.kind === 'accept_claim'
          ? decodeRecordedExecution({
              ...entry,
              command: {
                ...entry.command,
                evidence: {
                  ...entry.command.evidence,
                  byteLength: entry.command.evidence.byteLength + 1,
                },
              },
            })
          : entry,
      ),
    }),
  );
  rejects(
    'remaining turn refusal diagnostic',
    'turn',
    'corrupt turn stage consequence',
    (source) => ({
      ...source,
      executions: source.executions.map((entry) =>
        entry.command.kind === 'stage_turn'
          ? decodeRecordedExecution({
              ...entry,
              command: {
                ...entry.command,
                request: {
                  ...entry.command.request,
                  cause: { kind: 'decision', decisionId: 'different' },
                },
              },
            })
          : entry,
      ),
    }),
  );
  rejects(
    'remaining completion refusal diagnostic',
    'completion',
    'corrupt completion transition',
    (source) => ({
      ...source,
      completions: source.completions.map((entry) => ({
        ...entry,
        completion: {
          ...entry.completion,
          quiescence: { ...entry.completion.quiescence, effect: 'unknown' as const },
        },
      })),
    }),
  );
  rejects(
    'remaining receipt refusal diagnostic',
    'receipt',
    'corrupt receipt transition',
    (source) => ({
      ...source,
      receipts: source.receipts.map((entry) => ({
        ...entry,
        receipt: decodeReceipt({ ...entry.receipt, commandDigest: 'c'.repeat(64) }),
      })),
    }),
  );
  rejects(
    'remaining reused wait identity',
    'second-wait',
    'corrupt reused wait identity',
    (source) => {
      const original = source.executions.find(
        (entry) => entry.command.kind === 'execution' && entry.command.fact.kind === 'waiting',
      );
      const latest = source.executions.findLast(
        (entry) => entry.command.kind === 'execution' && entry.command.fact.kind === 'waiting',
      );
      if (
        original === undefined ||
        latest === undefined ||
        original === latest ||
        original.command.kind !== 'execution' ||
        original.command.fact.kind !== 'waiting' ||
        latest.command.kind !== 'execution' ||
        latest.command.fact.kind !== 'waiting' ||
        latest.reply.attempt.state.kind !== 'waiting_for_person'
      )
        throw new Error('expected two retained waits');
      const wait = {
        ...latest.command.fact.wait,
        correlationKey: original.command.fact.wait.correlationKey,
      };
      const replacement = decodeRecordedExecution({
        ...latest,
        command: { ...latest.command, fact: { ...latest.command.fact, wait } },
        reply: {
          ...latest.reply,
          attempt: { ...latest.reply.attempt, state: { ...latest.reply.attempt.state, wait } },
        },
      });
      return {
        ...source,
        executions: source.executions.map((entry) => (entry === latest ? replacement : entry)),
        attempts: source.attempts.map((entry) => ({
          ...entry,
          attempt: replacement.reply.attempt,
        })),
      };
    },
  );
  rejects('remaining empty run manifest reference', 'queued', 'corrupt run identity', (source) => ({
    ...source,
    manifests: [],
    attempts: [],
    reservations: [],
    runs: source.runs.map((entry) => ({ ...entry, run: entry.initial })),
  }));
});

import { validateAttempt } from './read-executions';
test('remaining sqlite outbox orphan rejects before public read publication', async () => {
  const stores = await createExecutionDatabase(),
    database = new Database(stores.options.path);
  try {
    const setup = await admitExecution(stores),
      before = await stores.runs.readRun(setup.run.runId);
    database.run('PRAGMA foreign_keys=OFF');
    database.query('INSERT INTO run_outbox(command_id) VALUES (?)').run('orphan-pending');
    // eslint-disable-next-line @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression -- Bun rejection matchers complete asynchronously despite their void declaration; keep the assertion awaited.
    await expect(stores.runs.readRun(setup.run.runId)).rejects.toThrow('orphan pending intent');
    database.query('DELETE FROM run_outbox WHERE command_id=?').run('orphan-pending');
    expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
  } finally {
    database.close();
    stores.close();
  }
});
test('remaining sqlite supplied attempt projection must match audited history', async () => {
  const stores = await createExecutionDatabase(),
    database = new Database(stores.options.path);
  try {
    const setup = await prepareTurn(stores),
      history = await stores.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId);
    expect(validateAttempt(database, history.run, history.attempt).executions).toEqual(
      history.executions,
    );
    expect(() =>
      validateAttempt(database, history.run, {
        ...history.attempt,
        revision: history.attempt.revision + 1,
      }),
    ).toThrow('corrupt current attempt provenance');
  } finally {
    database.close();
    stores.close();
  }
});

import { parseOrThrow, type } from '@shared/validation';

import { CompletionRecordCodec, ExecutionRecordCodec } from '../execution-codecs';
import { decodeCompletionRow, decodeExecutionRow } from './row-codecs';
for (const fault of ['version', 'unknown key'] as const)
  test('storage boundary completion envelope rejects ' + fault, async () => {
    const stores = await createExecutionDatabase(),
      database = new Database(stores.options.path);
    try {
      const setup = await prepareReceipt(stores),
        before = await stores.runs.readRun(setup.run.runId);
      const row = parseOrThrow(
        type({ command_id: 'string', record: 'string' }),
        database.query('SELECT command_id,record FROM run_completion').get(),
      );
      const envelope = parseOrThrow(CompletionRecordCodec, JSON.parse(row.record));
      const candidate =
        fault === 'version' ? { ...envelope, version: 2 } : { ...envelope, unexpected: true };
      database
        .query('UPDATE run_completion SET record=? WHERE command_id=?')
        .run(JSON.stringify(candidate), row.command_id);
      // eslint-disable-next-line @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression -- Bun rejection matchers complete asynchronously despite their void declaration; keep the assertion awaited.
      await expect(stores.runs.readRun(setup.run.runId)).rejects.toThrow();
      database
        .query('UPDATE run_completion SET record=? WHERE command_id=?')
        .run(row.record, row.command_id);
      expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
    } finally {
      database.close();
      stores.close();
    }
  });
for (const field of ['attempt', 'run'] as const)
  test(
    'storage boundary completion original reply ' + field + ' matches physical row',
    async () => {
      const stores = await createExecutionDatabase(),
        database = new Database(stores.options.path);
      try {
        const setup = await prepareReceipt(stores);
        const row = parseOrThrow(
          type({ command_id: 'string', attempt_id: 'string', record: 'string' }),
          database.query('SELECT * FROM run_completion').get(),
        );
        expect(decodeCompletionRow(row).attemptId).toBe(setup.attempt.attemptId);
        const envelope = parseOrThrow(CompletionRecordCodec, JSON.parse(row.record));
        const reply =
          field === 'attempt'
            ? { ...envelope.reply, attemptId: 'different' }
            : { ...envelope.reply, identity: { ...envelope.reply.identity, runId: 'different' } };
        expect(() =>
          decodeCompletionRow({ ...row, record: JSON.stringify({ ...envelope, reply }) }),
        ).toThrow('corrupt completion identity');
      } finally {
        database.close();
        stores.close();
      }
    },
  );
test('storage boundary execution record rejects forbidden reply shadow', async () => {
  const stores = await createExecutionDatabase(),
    database = new Database(stores.options.path);
  try {
    const setup = await prepareTurn(stores),
      before = await stores.runs.readRun(setup.run.runId);
    const row = parseOrThrow(
      type({ command_id: 'string', record: 'string' }),
      database.query('SELECT command_id,record FROM run_execution ORDER BY rowid LIMIT 1').get(),
    );
    const envelope = parseOrThrow(ExecutionRecordCodec, JSON.parse(row.record));
    database
      .query('UPDATE run_execution SET record=? WHERE command_id=?')
      .run(JSON.stringify({ ...envelope, reply: { ignored: true } }), row.command_id);
    // eslint-disable-next-line @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression -- Bun rejection matchers complete asynchronously despite their void declaration; keep the assertion awaited.
    await expect(stores.runs.readRun(setup.run.runId)).rejects.toThrow();
    database
      .query('UPDATE run_execution SET record=? WHERE command_id=?')
      .run(row.record, row.command_id);
    expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
  } finally {
    database.close();
    stores.close();
  }
});
test('storage boundary execution decoder rejects mismatched original reply family', async () => {
  const stores = await createExecutionDatabase(),
    database = new Database(stores.options.path);
  try {
    const setup = await prepareTurn(stores);
    const row = parseOrThrow(
      type({
        command_id: 'string',
        attempt_id: 'string',
        run_id: 'string',
        record: 'string',
        reply: 'string',
      }),
      database
        .query(
          "SELECT e.*,a.run_id FROM run_execution e JOIN run_attempt a ON a.attempt_id=e.attempt_id WHERE json_extract(e.record,'$.command.kind')='stage_claim'",
        )
        .get(),
    );
    const decoded = decodeExecutionRow(row);
    expect(decoded.reply.attempt.attemptId).toBe(setup.attempt.attemptId);
    const reply = { version: 1, kind: 'execution', attempt: decoded.reply.attempt };
    expect(() => decodeExecutionRow({ ...row, reply: JSON.stringify(reply) })).toThrow();
  } finally {
    database.close();
    stores.close();
  }
});

import { prepareAttempt } from '../testing/fixtures';
test('sqlite shared history audit rejects queued reservation loss before public read', async () => {
  const stores = await createExecutionDatabase();
  const database = new Database(stores.options.path);
  try {
    const setup = await prepareAttempt(stores);
    expect((await stores.runs.readRun(setup.run.runId)).attempts.at(0)?.state).toEqual({
      kind: 'queued',
    });
    database.query('DELETE FROM run_reservation WHERE attempt_id=?').run(setup.admission.attemptId);
    try {
      // eslint-disable-next-line @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression -- Bun rejection matchers complete asynchronously despite their void declaration; keep the assertion awaited.
      await expect(stores.runs.readRun(setup.run.runId)).rejects.toThrow(
        'corrupt attempt reservation',
      );
    } finally {
      database
        .query('INSERT INTO run_reservation(attempt_id) VALUES (?)')
        .run(setup.admission.attemptId);
    }
    expect((await stores.runs.readRun(setup.run.runId)).capacity.reserved).toBe(1);
  } finally {
    database.close();
    stores.close();
  }
});
