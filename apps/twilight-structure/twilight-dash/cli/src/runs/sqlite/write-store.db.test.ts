import { deepStrictEqual, throws } from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { organizationId } from '../record-codecs';
import { FixtureClock } from '../testing/fixtures';
import { createRecoveryStores } from '../testing/sqlite-fixture';
import { writeStoreContract } from '../testing/write-store-contract';
writeStoreContract('sqlite writes', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'write-store-'));
  const clock = new FixtureClock();
  return {
    ...(await createRecoveryStores(directory, {
      path: join(directory, 'runs.sqlite'),
      organizationId: organizationId('organization'),
      capacity: 2,
      leaseMilliseconds: 100,
      clock,
      maxBusyAttempts: 20,
      busyDelayMilliseconds: 1,
    })),
    clock,
  };
});
import { writeReciprocalContract } from '../testing/write-store-contract';
writeReciprocalContract('sqlite writes', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'write-reciprocal-'));
  const clock = new FixtureClock();
  return {
    ...(await createRecoveryStores(directory, {
      path: join(directory, 'runs.sqlite'),
      organizationId: organizationId('organization'),
      capacity: 2,
      leaseMilliseconds: 100,
      clock,
      maxBusyAttempts: 20,
      busyDelayMilliseconds: 1,
    })),
    clock,
  };
});

import { rejects } from 'node:assert/strict';

import { expect, test } from 'bun:test';

import { readExecutionHistory as readVerifiedExecutionHistory } from '../claim-history';
import { stageClaimRequest } from '../claim-history';
import type { RecoveryBeginCall } from '../recovery-records';
import { settleFixture } from '../testing/construct-fixture';
import { unwrapReply } from '../testing/fixtures';
import { prepareSession } from '../testing/fixtures';
import { createRecoveryInspection } from '../testing/sqlite-fixture';
import { createWriteFixture } from '../testing/write-fixture';
import { retainWriteReceipt } from '../testing/write-store-contract';
import { validateHistory } from '../validate-history';
import { executionCommandId } from '../value-codecs';
import { acceptWriteReceipt } from '../write-history';
import { encodeKey } from './identity-key';
import { openSqliteStores } from './open-stores';
import { readHistory } from './read-history';
async function writeInspection() {
  const directory = mkdtempSync(join(tmpdir(), 'write-integrity-'));
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
  const inspection = await createRecoveryInspection(directory, options);
  return { ...inspection, clock };
}

for (const operation of ['stage', 'accept'] as const)
  for (const table of operation === 'stage'
    ? [
        'run6_runtime_intent',
        'run6_write',
        'run6_write_obligation',
        'run6_write_format',
        'run6_usage',
      ]
    : [
        'run6_runtime_acceptance',
        'run6_write',
        'run6_write_receipt',
        'run6_write_format',
        'run6_usage',
      ])
    test(
      'late ' + operation + ' abort at ' + table + ' rolls back every published half',
      async () => {
        const fixture = await writeInspection();
        try {
          const setup = await createWriteFixture({ ...fixture.stores, clock: fixture.clock });
          let acceptance:
            Parameters<typeof fixture.stores.runs.recordWriteAcceptance>[1] | undefined;
          if (operation === 'accept') {
            const stage = unwrapReply(
              await fixture.stores.runs.stageWrite(setup.guard, setup.command),
            );
            const evidence = await retainWriteReceipt(fixture.stores, stage.intent);
            acceptance = {
              version: 1,
              kind: 'accept_write',
              commandId: executionCommandId('accept-write'),
              stageCommandId: setup.command.commandId,
              intent: stage.intent,
              evidence,
              projection: {
                version: 1,
                actorId: 'account',
                basisAfter: 'rb1:' + 'b'.repeat(64),
                applied: [
                  { index: 0, kind: 'setProgress' },
                  { index: 1, kind: 'releaseWorkItem' },
                ],
              },
            };
          }
          const guard = await setup.currentGuard();
          const before = {
            run: await fixture.stores.runs.readRun(setup.run.runId),
            history: await fixture.stores.runs.readExecutionHistory(
              setup.run.runId,
              setup.guard.attemptId,
            ),
            scope: await fixture.stores.runs.readRuntimeScope(setup.scope),
            marker: fixture.database.query('SELECT * FROM run6_write_format').all(),
          };
          fixture.database.run(
            `CREATE TRIGGER fail_write_half BEFORE ${table === 'run6_write_format' || table === 'run6_usage' ? 'UPDATE' : 'INSERT'} ON ${table} BEGIN SELECT RAISE(ABORT,'late write half'); END`,
          );
          await rejects(
            operation === 'stage'
              ? fixture.stores.runs.stageWrite(guard, setup.command)
              : fixture.stores.runs.recordWriteAcceptance(guard, acceptance!),
            /late write half/,
          );
          fixture.database.run('DROP TRIGGER fail_write_half');
          const readable = await Promise.allSettled([
            fixture.stores.runs.readRun(setup.run.runId),
            fixture.stores.runs.readExecutionHistory(setup.run.runId, setup.guard.attemptId),
            fixture.stores.runs.readRuntimeScope(setup.scope),
          ]);
          expect(readable.map((read) => read.status)).toEqual([
            'fulfilled',
            'fulfilled',
            'fulfilled',
          ]);
          expect({
            run: await fixture.stores.runs.readRun(setup.run.runId),
            history: await fixture.stores.runs.readExecutionHistory(
              setup.run.runId,
              setup.guard.attemptId,
            ),
            scope: await fixture.stores.runs.readRuntimeScope(setup.scope),
            marker: fixture.database.query('SELECT * FROM run6_write_format').all(),
          }).toEqual(before);
        } finally {
          await fixture.close();
        }
      },
    );

for (const operation of ['stage', 'accept'] as const)
  for (const fault of ['ignored update', 'reset after update'] as const)
    test(
      'semantic usage ' + fault + ' aborts actual ' + operation + ' before publishing a bundle',
      async () => {
        const fixture = await writeInspection();
        try {
          const setup = await createWriteFixture({ ...fixture.stores, clock: fixture.clock });
          let publishing = () =>
            fixture.stores.runs.stageWrite(setup.guard, setup.command).then((reply) => {
              expect(reply.kind).toBe('applied');
            });
          if (operation === 'accept') {
            const stage = unwrapReply(
              await fixture.stores.runs.stageWrite(setup.guard, setup.command),
            );
            const guard = await setup.currentGuard();
            const input = {
              commandId: executionCommandId('accept-write'),
              stageCommandId: setup.command.commandId,
              intent: stage.intent,
              evidence: await retainWriteReceipt(fixture.stores, stage.intent),
            };
            publishing = () =>
              acceptWriteReceipt(fixture.stores.runs, fixture.stores.artifacts, guard, input).then(
                (reply) => {
                  expect(reply.kind).toBe('applied');
                },
              );
          }
          const snapshot = async () => ({
            run: await fixture.stores.runs.readRun(setup.run.runId),
            history: await fixture.stores.runs.readExecutionHistory(
              setup.run.runId,
              setup.guard.attemptId,
            ),
            scope: await fixture.stores.runs.readRuntimeScope(setup.scope),
            usage: fixture.database.query('SELECT * FROM run6_usage').all(),
          });
          const before = await snapshot();
          fixture.database.run(
            fault === 'ignored update'
              ? 'CREATE TRIGGER fail_usage BEFORE UPDATE ON run6_usage BEGIN SELECT RAISE(IGNORE); END'
              : 'CREATE TRIGGER fail_usage AFTER UPDATE ON run6_usage BEGIN UPDATE run6_usage SET used=0 WHERE singleton=1; END',
          );
          await rejects(publishing(), /write usage marker was not updated/);
          fixture.database.run('DROP TRIGGER fail_usage');
          expect(await snapshot()).toEqual(before);
        } finally {
          await fixture.close();
        }
      },
    );

const historyFaults: readonly [string, boolean, string, string?][] = [
  ['absent semantic usage marker', false, 'DELETE FROM run6_usage'],
  [
    'duplicate semantic usage marker',
    false,
    'PRAGMA ignore_check_constraints=ON; INSERT INTO run6_usage VALUES (2,0)',
  ],
  [
    'malformed semantic usage marker',
    false,
    'PRAGMA ignore_check_constraints=ON; UPDATE run6_usage SET used=2',
  ],
  [
    'unlinked conditional write stage behind restored predecessor',
    false,
    "UPDATE run6_attempt SET record=json_set(record,'$.version',2,'$.revision',json_extract(record,'$.revision')-1,'$.holdsCapacity',json('true'),'$.state',json_extract(record,'$.state.checkpoint')); INSERT INTO run6_reservation SELECT attempt_id FROM run6_attempt; UPDATE run6_record SET record=json_set(record,'$.revision',json_extract(record,'$.revision')-1); DELETE FROM run6_write; DELETE FROM run6_write_obligation; UPDATE run6_write_format SET record_count=0,obligation_count=0",
  ],
  [
    'unlinked conditional write acceptance behind pending predecessor',
    true,
    "UPDATE run6_attempt SET record=(SELECT json_extract(record,'$.reply.attempt') FROM run6_write WHERE json_extract(record,'$.kind')='stage_write'); UPDATE run6_record SET record=json_set(record,'$.revision',json_extract(record,'$.revision')-1); INSERT INTO run6_write_obligation SELECT command_id,json_extract(record,'$.reply.obligation') FROM run6_write WHERE json_extract(record,'$.kind')='stage_write'; DELETE FROM run6_write WHERE json_extract(record,'$.kind')='accept_write'; DELETE FROM run6_write_receipt; UPDATE run6_write_format SET record_count=1,obligation_count=1,receipt_count=0",
  ],
  [
    'independent stage scope link diagnostic',
    false,
    "UPDATE run6_write SET record=json_set(record,'$.context.scopeRevision',json_extract(record,'$.context.scopeRevision')+1,'$.reply.intent.stagedRevision',json_extract(record,'$.reply.intent.stagedRevision')+1,'$.reply.attempt.state.intent.stagedRevision',json_extract(record,'$.reply.attempt.state.intent.stagedRevision')+1,'$.reply.obligation.intent.stagedRevision',json_extract(record,'$.reply.obligation.intent.stagedRevision')+1); UPDATE run6_attempt SET record=json_set(record,'$.state.intent.stagedRevision',json_extract(record,'$.state.intent.stagedRevision')+1)",
    'corrupt write stage link',
  ],
  [
    'independent acceptance scope link diagnostic',
    true,
    "UPDATE run6_write SET record=json_set(record,'$.context.scopeRevision',json_extract(record,'$.context.scopeRevision')+1,'$.reply.receipt.acceptance.acceptedRevision',json_extract(record,'$.reply.receipt.acceptance.acceptedRevision')+1,'$.reply.attempt.state.receipt.acceptance.acceptedRevision',json_extract(record,'$.reply.attempt.state.receipt.acceptance.acceptedRevision')+1) WHERE json_extract(record,'$.kind')='accept_write'; UPDATE run6_attempt SET record=json_set(record,'$.state.receipt.acceptance.acceptedRevision',json_extract(record,'$.state.receipt.acceptance.acceptedRevision')+1); UPDATE run6_write_receipt SET record=json_set(record,'$.acceptance.acceptedRevision',json_extract(record,'$.acceptance.acceptedRevision')+1)",
    'corrupt write acceptance link',
  ],
  [
    'stage acknowledgement checkpoint substitution',
    false,
    "UPDATE run6_write SET record=json_set(record,'$.reply.attempt.state.checkpoint.turn.request.input','forged checkpoint'); UPDATE run6_attempt SET record=json_set(record,'$.state.checkpoint.turn.request.input','forged checkpoint')",
  ],
  [
    'acceptance acknowledgement checkpoint substitution',
    true,
    "UPDATE run6_write SET record=json_set(record,'$.reply.attempt.state.checkpoint.turn.request.input','forged checkpoint') WHERE json_extract(record,'$.kind')='accept_write'; UPDATE run6_attempt SET record=json_set(record,'$.state.checkpoint.turn.request.input','forged checkpoint')",
  ],
  [
    'extra orphan obligation with agreeing count',
    false,
    `INSERT INTO run6_write_obligation(stage_command_id,record) SELECT '${encodeKey('orphan')}',json_set(record,'$.stageCommandId','orphan') FROM run6_write_obligation; UPDATE run6_write_format SET obligation_count=2`,
  ],
  [
    'extra orphan local receipt with agreeing count',
    true,
    `INSERT INTO run6_write_receipt(stage_command_id,record) SELECT '${encodeKey('orphan')}',json_set(record,'$.stageCommandId','orphan') FROM run6_write_receipt; UPDATE run6_write_format SET receipt_count=2`,
  ],
  [
    'stage current scope cut trails journal',
    false,
    'UPDATE run6_runtime_scope SET revision=revision-1',
  ],
  [
    'accept current scope cut trails journal',
    true,
    'UPDATE run6_runtime_scope SET revision=revision-1',
  ],
  ['missing stage', false, 'DELETE FROM run6_write; UPDATE run6_write_format SET record_count=0'],
  [
    'missing obligation with agreeing count',
    false,
    'DELETE FROM run6_write_obligation; UPDATE run6_write_format SET obligation_count=0',
  ],
  [
    'changed obligation disposition',
    false,
    "UPDATE run6_write_obligation SET record=json_set(record,'$.disposition.kind','fenced_nonaccepted','$.disposition.recoveryId','invented')",
  ],
  [
    'independent stage context',
    false,
    "UPDATE run6_write SET record=json_set(record,'$.context.scopeRevision',0)",
  ],
  [
    'stage acknowledgement outcome',
    false,
    "UPDATE run6_write SET record=json_set(record,'$.reply.attempt.state.outcome.summary','forged')",
  ],
  [
    'current write attempt outcome',
    false,
    "UPDATE run6_attempt SET record=json_set(record,'$.state.outcome.summary','forged')",
  ],
  [
    'missing local receipt with agreeing count',
    true,
    'DELETE FROM run6_write_receipt; UPDATE run6_write_format SET receipt_count=0',
  ],
  [
    'changed local receipt projection',
    true,
    "UPDATE run6_write_receipt SET record=json_set(record,'$.projection.actorId','other')",
  ],
  [
    'terminal attempt receipt',
    true,
    "UPDATE run6_attempt SET record=json_set(record,'$.state.receipt.projection.actorId','other')",
  ],
  [
    'acceptance acknowledgement',
    true,
    "UPDATE run6_write SET record=json_set(record,'$.reply.receipt.projection.actorId','other') WHERE json_extract(record,'$.kind')='accept_write'",
  ],
  ['write physical run identity', false, `UPDATE run6_write SET run_id='${encodeKey('other')}'`],
  [
    'write physical command identity',
    false,
    `UPDATE run6_write SET command_id='${encodeKey('other')}'`,
  ],
  [
    'write physical attempt identity',
    false,
    `UPDATE run6_write SET attempt_id='${encodeKey('other')}'`,
  ],
  [
    'obligation physical identity',
    false,
    `UPDATE run6_write_obligation SET stage_command_id='${encodeKey('other')}'`,
  ],
  [
    'receipt physical identity',
    true,
    `UPDATE run6_write_receipt SET stage_command_id='${encodeKey('other')}'`,
  ],
  ['write record count', false, 'UPDATE run6_write_format SET record_count=2'],
  ['write obligation count', false, 'UPDATE run6_write_format SET obligation_count=0'],
  ['write receipt count', true, 'UPDATE run6_write_format SET receipt_count=0'],
  ['absent write marker', false, 'DELETE FROM run6_write_format'],
  [
    'duplicate write marker',
    false,
    'PRAGMA ignore_check_constraints=ON; INSERT INTO run6_write_format VALUES (2,0,0,0)',
  ],
];
for (const [fault, terminal, sql, expected] of historyFaults)
  test('every public entry audits ' + fault + ' behind plausible current write state', async () => {
    const fixture = await writeInspection();
    try {
      const setup = await createWriteFixture({ ...fixture.stores, clock: fixture.clock });
      const stage = unwrapReply(await fixture.stores.runs.stageWrite(setup.guard, setup.command));
      if (terminal)
        unwrapReply(
          await acceptWriteReceipt(
            fixture.stores.runs,
            fixture.stores.artifacts,
            await setup.currentGuard(),
            {
              commandId: executionCommandId('accept-write'),
              stageCommandId: setup.command.commandId,
              intent: stage.intent,
              evidence: await retainWriteReceipt(fixture.stores, stage.intent),
            },
          ),
        );
      const guard = await setup.currentGuard();
      expect((await fixture.stores.runs.readRun(setup.run.runId)).version).toBe(4);
      fixture.database.run('PRAGMA foreign_keys=OFF');
      for (const statement of sql
        .split(';')
        .map((statement) => statement.trim())
        .filter((statement) => statement.length > 0))
        fixture.database.run(statement);
      if (expected === undefined) await rejects(fixture.stores.runs.readRun(setup.run.runId));
      else await rejects(fixture.stores.runs.readRun(setup.run.runId), new RegExp(expected));
      await rejects(
        fixture.stores.runs.readExecutionHistory(setup.run.runId, setup.guard.attemptId),
      );
      await rejects(fixture.stores.runs.readRuntimeScope(setup.scope));
      await rejects(fixture.stores.runs.stageWrite(setup.guard, setup.command));
      await rejects(fixture.stores.runs.renewOwnership(guard.ownership));
      await fixture.stores.closeConnection();
      await rejects(openSqliteStores(fixture.options));
    } finally {
      await fixture.close();
    }
  });

import { existsSync, readFileSync } from 'node:fs';
test('complete catalog rejects a genuine foreign write journal instead of hiding it behind another valid run', async () => {
  const own = await writeInspection();
  await settleFixture(async () => {
    const foreign = await writeInspection();
    await settleFixture(async () => {
      const setup = await createWriteFixture({ ...own.stores, clock: own.clock });
      const foreignOwner = await createWriteFixture({ ...foreign.stores, clock: foreign.clock });
      const other = await createWriteFixture(
        { ...foreign.stores, clock: foreign.clock },
        { ownership: foreignOwner.ownership, suffix: 'other' },
      );
      unwrapReply(await foreign.stores.runs.stageWrite(other.guard, other.command));
      const row = foreign.database
        .query<{ command_id: string; run_id: string; attempt_id: string; record: string }, []>(
          'SELECT command_id,run_id,attempt_id,record FROM run6_write',
        )
        .get();
      if (row === null) throw Error('actual foreign write journal missing');
      expect((await own.stores.runs.readRun(setup.run.runId)).version).toBe(4);
      own.database.run('PRAGMA foreign_keys=OFF');
      own.database
        .query('INSERT INTO run6_write(command_id,run_id,attempt_id,record) VALUES (?,?,?,?)')
        .run(row.command_id, row.run_id, row.attempt_id, row.record);
      own.database.run('UPDATE run6_write_format SET record_count=1');
      await rejects(own.stores.runs.readRun(setup.run.runId), /orphan write history/);
      await rejects(own.stores.runs.readExecutionHistory(setup.run.runId, setup.guard.attemptId));
      await rejects(own.stores.runs.readRuntimeScope(setup.scope));
      await rejects(own.stores.runs.stageWrite(setup.guard, setup.command));
      await own.stores.closeConnection();
      await rejects(openSqliteStores(own.options));
    }, [() => foreign.close()]);
  }, [() => own.close()]);
});

for (const domain of ['execution', 'recovery'] as const)
  test('history audits coherent write local ' + domain + ' reservation collisions', async () => {
    const fixture = await writeInspection();
    try {
      const stores = { ...fixture.stores, clock: fixture.clock };
      const setup = await createWriteFixture(stores);
      const stage = unwrapReply(await stores.runs.stageWrite(setup.guard, setup.command));
      let identity: string;
      if (domain === 'execution') {
        const history = await stores.runs.readExecutionHistory(
          setup.run.runId,
          setup.guard.attemptId,
        );
        identity = history.executions[0].command.commandId;
      } else {
        unwrapReply(
          await acceptWriteReceipt(stores.runs, stores.artifacts, await setup.currentGuard(), {
            commandId: executionCommandId('accept-write'),
            stageCommandId: setup.command.commandId,
            intent: stage.intent,
            evidence: await retainWriteReceipt(stores, stage.intent),
          }),
        );
        const other = await prepareSession(stores, { ownership: setup.ownership, suffix: 'other' });
        const claimed = unwrapReply(
          await stageClaimRequest(stores.runs, stores.artifacts, await other.scopedGuard(), {
            commandId: executionCommandId('legacy-stage'),
            canonicalRequest: other.canonicalRequest,
            stateEvidence: other.preparationInput.stateEvidence,
          }),
        );
        const begin: RecoveryBeginCall = {
          kind: 'claim',
          guard: { ...(await other.scopedGuard()), expectedRecoveryRevision: 0 },
          intent: {
            version: 1,
            recoveryId: 'legacy-recovery',
            begunScopeRevision: claimed.intent.stagedRevision,
            resolver: other.owner,
            target: {
              kind: 'claim',
              original: claimed.intent,
              runId: other.run.runId,
              attemptId: other.attempt.attemptId,
              stageCommandId: 'legacy-stage',
              acceptanceCommandId: 'legacy-accept',
            },
          },
        };
        unwrapReply(await stores.runs.beginRecovery(begin));
        identity = begin.intent.recoveryId;
      }
      fixture.database.run('PRAGMA foreign_keys=OFF');
      fixture.database
        .query(
          "UPDATE run6_write SET command_id=?,record=json_set(record,'$.command.commandId',?,'$.reply.obligation.stageCommandId',?,'$.reply.attempt.state.stageCommandId',?) WHERE command_id=?",
        )
        .run(encodeKey(identity), identity, identity, identity, encodeKey(setup.command.commandId));
      fixture.database
        .query(
          "UPDATE run6_attempt SET record=json_set(record,'$.state.stageCommandId',?) WHERE attempt_id=?",
        )
        .run(identity, encodeKey(setup.guard.attemptId));
      if (domain === 'execution')
        fixture.database
          .query(
            "UPDATE run6_write_obligation SET stage_command_id=?,record=json_set(record,'$.stageCommandId',?) WHERE stage_command_id=?",
          )
          .run(encodeKey(identity), identity, encodeKey(setup.command.commandId));
      else {
        fixture.database
          .query(
            "UPDATE run6_write SET record=json_set(record,'$.command.stageCommandId',?,'$.reply.receipt.stageCommandId',?,'$.reply.attempt.state.stageCommandId',?,'$.reply.attempt.state.receipt.stageCommandId',?) WHERE json_extract(record,'$.kind')='accept_write'",
          )
          .run(identity, identity, identity, identity);
        fixture.database
          .query(
            "UPDATE run6_attempt SET record=json_set(record,'$.state.receipt.stageCommandId',?) WHERE attempt_id=?",
          )
          .run(identity, encodeKey(setup.guard.attemptId));
        fixture.database
          .query(
            "UPDATE run6_write_receipt SET stage_command_id=?,record=json_set(record,'$.stageCommandId',?) WHERE stage_command_id=?",
          )
          .run(encodeKey(identity), identity, encodeKey(setup.command.commandId));
      }
      await rejects(
        stores.runs.readRun(setup.run.runId),
        domain === 'execution'
          ? /duplicate local submission identity/
          : /corrupt write recovery command collision/,
      );
      await rejects(stores.runs.readExecutionHistory(setup.run.runId, setup.guard.attemptId));
      await rejects(stores.runs.readRuntimeScope(setup.scope));
      await rejects(stores.runs.renewOwnership(setup.ownership));
      await fixture.stores.closeConnection();
      await rejects(openSqliteStores(fixture.options));
    } finally {
      await fixture.close();
    }
  });

test('coherent retained write projection remains bound to original receipt bytes', async () => {
  const fixture = await writeInspection();
  try {
    const setup = await createWriteFixture({ ...fixture.stores, clock: fixture.clock });
    const stage = unwrapReply(await fixture.stores.runs.stageWrite(setup.guard, setup.command));
    unwrapReply(
      await acceptWriteReceipt(
        fixture.stores.runs,
        fixture.stores.artifacts,
        await setup.currentGuard(),
        {
          commandId: executionCommandId('accept-write'),
          stageCommandId: setup.command.commandId,
          intent: stage.intent,
          evidence: await retainWriteReceipt(fixture.stores, stage.intent),
        },
      ),
    );
    fixture.database.run(
      "UPDATE run6_write SET record=json_set(record,'$.command.projection.actorId','other','$.reply.receipt.projection.actorId','other','$.reply.attempt.state.receipt.projection.actorId','other') WHERE json_extract(record,'$.kind')='accept_write'",
    );
    fixture.database.run(
      "UPDATE run6_attempt SET record=json_set(record,'$.state.receipt.projection.actorId','other')",
    );
    fixture.database.run(
      "UPDATE run6_write_receipt SET record=json_set(record,'$.projection.actorId','other')",
    );
    expect(
      (await fixture.stores.runs.readExecutionHistory(setup.run.runId, setup.guard.attemptId))
        .version,
    ).toBe(3);
    await rejects(
      readVerifiedExecutionHistory(
        fixture.stores.runs,
        fixture.stores.artifacts,
        setup.run.runId,
        setup.guard.attemptId,
      ),
      /historical write projection differs from artifact/,
    );
  } finally {
    await fixture.close();
  }
});
const writeChildSource = `
import {Database} from 'bun:sqlite';import {writeFileSync} from 'node:fs';
import {strict as assert} from 'node:assert';
import {openSqliteStores} from ${JSON.stringify(new URL('./open-stores.ts', import.meta.url).pathname)};
import {stageWriteRequest,acceptWriteReceipt} from ${JSON.stringify(new URL('../write-history.ts', import.meta.url).pathname)};
import {encodeKey} from ${JSON.stringify(new URL('./identity-key.ts', import.meta.url).pathname)};
const packet=JSON.parse(process.env.WRITE_CHILD_PACKET);const stores=await openSqliteStores({...packet.options,clock:{read:()=>1000}});
const original=Database.prototype.run;
if(packet.cut==='before')Database.prototype.run=function(sql,...parameters){
 if(sql==='COMMIT'&&this.query('SELECT command_id FROM run6_write WHERE command_id=?').get(encodeKey(packet.input.commandId))!==null){
  assert.equal(this.inTransaction,true);const attempt=JSON.parse(this.query('SELECT record FROM run6_attempt WHERE attempt_id=?').get(encodeKey(packet.guard.attemptId)).record);
  assert.equal(attempt.state.kind,packet.operation==='stage'?'write_pending':'write_terminal');
  assert.equal(this.query('SELECT attempt_id FROM run6_reservation WHERE attempt_id=?').get(encodeKey(packet.guard.attemptId)),null);
  const marker=this.query('SELECT * FROM run6_write_format').get();assert.equal(marker.record_count,packet.operation==='stage'?1:2);assert.equal(marker.obligation_count,packet.operation==='stage'?1:0);assert.equal(marker.receipt_count,packet.operation==='stage'?0:1);
  writeFileSync(packet.ready,JSON.stringify({phase:'before',attempt}));const deadline=Date.now()+20000;while(Date.now()<deadline)Bun.sleepSync(2);throw Error('write before-commit barrier expired');
 }return original.call(this,sql,...parameters);
};
try{const reply=packet.operation==='stage'?await stageWriteRequest(stores.runs,stores.artifacts,packet.guard,packet.input):await acceptWriteReceipt(stores.runs,stores.artifacts,packet.guard,packet.input);assert.equal(reply.kind,'applied');writeFileSync(packet.ready,JSON.stringify({phase:'after',reply}));await Bun.sleep(20000);throw Error('write after-commit barrier expired');}finally{await stores.close();}
`;
for (const operation of ['stage', 'accept'] as const)
  for (const cut of ['before', 'after'] as const)
    test(
      'SIGKILL ' + cut + ' actual ' + operation + ' COMMIT reopens one exact coupled bundle',
      async () => {
        const fixture = await writeInspection();
        let child: ReturnType<typeof Bun.spawn> | undefined;
        let output: Promise<string> | undefined;
        let errors: Promise<string> | undefined;
        let isExitObserved = false;
        try {
          const setup = await createWriteFixture({ ...fixture.stores, clock: fixture.clock });
          let input: unknown = {
            commandId: setup.command.commandId,
            completion: setup.completion,
            canonicalRequest: setup.canonicalRequest,
            stateEvidence: setup.stateEvidence,
          };
          if (operation === 'accept') {
            const stage = unwrapReply(
              await fixture.stores.runs.stageWrite(setup.guard, setup.command),
            );
            input = {
              commandId: executionCommandId('accept-write'),
              stageCommandId: setup.command.commandId,
              intent: stage.intent,
              evidence: await retainWriteReceipt(fixture.stores, stage.intent),
            };
          }
          const guard = await setup.currentGuard();
          const before = {
            run: await fixture.stores.runs.readRun(setup.run.runId),
            history: await fixture.stores.runs.readExecutionHistory(
              setup.run.runId,
              setup.guard.attemptId,
            ),
            scope: await fixture.stores.runs.readRuntimeScope(setup.scope),
          };
          fixture.database.close();
          await fixture.stores.closeConnection();
          const ready = join(fixture.options.path, '..', 'write-child-ready');
          const packet = { operation, cut, options: fixture.options, guard, input, ready };
          child = Bun.spawn([process.execPath, '-e', writeChildSource], {
            env: { ...process.env, WRITE_CHILD_PACKET: JSON.stringify(packet) },
            stdout: 'pipe',
            stderr: 'pipe',
          });
          output = new Response(child.stdout as ReadableStream<Uint8Array>).text();
          errors = new Response(child.stderr as ReadableStream<Uint8Array>).text();
          console.log(
            JSON.stringify({
              event: 'write-child-started',
              pid: child.pid,
              argv: [process.execPath, '-e', writeChildSource],
              packet,
            }),
          );
          const deadline = Date.now() + 20000;
          while (!existsSync(ready)) {
            if (child.exitCode !== null)
              throw Error('write child exited before barrier: ' + (await errors));
            if (Date.now() >= deadline) throw Error('write child barrier not observed: ' + ready);
            await Bun.sleep(2);
          }
          const observed = JSON.parse(readFileSync(ready, 'utf8')) as {
            phase: string;
            reply?: unknown;
          };
          expect(observed.phase).toBe(cut);
          child.kill('SIGKILL');
          const closed = await Promise.all([child.exited, output, errors]);
          isExitObserved = true;
          expect(child.signalCode).toBe('SIGKILL');
          expect(closed[1]).toBe('');
          expect(closed[2]).toBe('');
          console.log(
            JSON.stringify({
              event: 'write-child-closed',
              pid: child.pid,
              exit: closed[0],
              signal: child.signalCode,
              stdoutEOF: true,
              stderrEOF: true,
            }),
          );
          const reopened = await openSqliteStores(fixture.options);
          try {
            const current = {
              run: await reopened.runs.readRun(setup.run.runId),
              history: await reopened.runs.readExecutionHistory(
                setup.run.runId,
                setup.guard.attemptId,
              ),
              scope: await reopened.runs.readRuntimeScope(setup.scope),
            };
            if (cut === 'before') expect(current).toEqual(before);
            else {
              expect(current.run.run.revision).toBe(before.run.run.revision + 1);
              expect(current.history.attempt.state.kind).toBe(
                operation === 'stage' ? 'write_pending' : 'write_terminal',
              );
              expect(current.run.capacity.reserved).toBe(0);
              expect(current.run.version).toBe(4);
              if (current.run.version !== 4) throw Error('current write snapshot absent');
              expect(current.run.writeObligations).toHaveLength(operation === 'stage' ? 1 : 0);
              expect(current.run.writeReceipts).toHaveLength(operation === 'stage' ? 0 : 1);
              const reply =
                operation === 'stage'
                  ? await reopened.runs.stageWrite(guard, setup.command)
                  : await acceptWriteReceipt(
                      reopened.runs,
                      reopened.artifacts,
                      guard,
                      input as Parameters<typeof acceptWriteReceipt>[3],
                    );
              deepStrictEqual(reply, {
                kind: 'duplicate',
                value: (observed.reply as { value: unknown }).value,
              });
            }
          } finally {
            await reopened.close();
          }
        } finally {
          if (child !== undefined && !isExitObserved) {
            child.kill('SIGKILL');
            await child.exited;
            await Promise.all([output, errors]);
          }
          await fixture.close();
        }
      },
      60000,
    );

for (const domain of ['local', 'settlement'] as const)
  test(
    'history owner duplicate write ' + domain + ' diagnostic uses an actual provider catalog',
    async () => {
      const fixture = await writeInspection();
      await settleFixture(async () => {
        const setup = await createWriteFixture({ ...fixture.stores, clock: fixture.clock });
        unwrapReply(await fixture.stores.runs.stageWrite(setup.guard, setup.command));
        const { catalog } = readHistory(fixture.database);
        expect(validateHistory(catalog).length).toBe(1);
        const duplicate =
          domain === 'local'
            ? { ...catalog, writes: [...catalog.writes, ...catalog.writes] }
            : { ...catalog, obligations: [...catalog.obligations, ...catalog.obligations] };
        throws(
          () => validateHistory(duplicate),
          domain === 'local'
            ? /duplicate local submission identity/
            : /duplicate write settlement identity/,
        );
      }, [() => fixture.close()]);
    },
  );

test('ignored obligation DELETE aborts actual acceptance and reopens the exact pending bundle', async () => {
  const fixture = await writeInspection();
  let reopened: Awaited<ReturnType<typeof openSqliteStores>> | undefined;
  try {
    const setup = await createWriteFixture({ ...fixture.stores, clock: fixture.clock });
    const stage = unwrapReply(await fixture.stores.runs.stageWrite(setup.guard, setup.command));
    const guard = await setup.currentGuard();
    const input = {
      commandId: executionCommandId('delete-proof-accept'),
      stageCommandId: setup.command.commandId,
      intent: stage.intent,
      evidence: await retainWriteReceipt(fixture.stores, stage.intent),
    };
    const capturePhysical = () =>
      fixture.database
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE 'run_%' ORDER BY name",
        )
        .all()
        .map(({ name }) => ({
          name,
          rows: fixture.database
            .query('SELECT * FROM "' + name.replaceAll('"', '""') + '"')
            .all()
            .map((row) => JSON.stringify(row))
            .sort(),
        }));
    const readVisible = async (runs: typeof fixture.stores.runs) => ({
      run: await runs.readRun(setup.run.runId),
      history: await runs.readExecutionHistory(setup.run.runId, setup.guard.attemptId),
      scope: await runs.readRuntimeScope(setup.scope),
    });
    const before = { physical: capturePhysical(), visible: await readVisible(fixture.stores.runs) };
    fixture.database.run(
      'CREATE TRIGGER ignore_obligation_delete BEFORE DELETE ON run6_write_obligation BEGIN SELECT RAISE(IGNORE); END',
    );
    const acceptance = await acceptWriteReceipt(
      fixture.stores.runs,
      fixture.stores.artifacts,
      guard,
      input,
    ).then(
      (value) => ({ kind: 'returned' as const, value }),
      (cause: unknown) => ({ kind: 'thrown' as const, cause }),
    );
    console.log(
      JSON.stringify({
        event: 'ignored-obligation-delete',
        acceptance:
          acceptance.kind === 'returned'
            ? acceptance
            : { kind: acceptance.kind, cause: String(acceptance.cause) },
        before: before.physical,
        after: capturePhysical(),
      }),
    );
    expect(acceptance.kind).toBe('thrown');
    if (acceptance.kind !== 'thrown')
      throw Error('ignored obligation DELETE unexpectedly committed');
    expect(String(acceptance.cause)).toContain('write obligation removal differs');
    fixture.database.run('DROP TRIGGER ignore_obligation_delete');
    expect({
      physical: capturePhysical(),
      visible: await readVisible(fixture.stores.runs),
    }).toEqual(before);
    await fixture.stores.closeConnection();
    reopened = await openSqliteStores(fixture.options);
    expect({ physical: capturePhysical(), visible: await readVisible(reopened.runs) }).toEqual(
      before,
    );
    expect(await reopened.runs.stageWrite(setup.guard, setup.command)).toEqual({
      kind: 'duplicate',
      value: stage,
    });
    const accepted = await acceptWriteReceipt(reopened.runs, reopened.artifacts, guard, input);
    expect(accepted.kind).toBe('applied');
    if (accepted.kind !== 'applied') throw new Error('unguarded acceptance control refused');
    expect(await acceptWriteReceipt(reopened.runs, reopened.artifacts, guard, input)).toEqual({
      ...accepted,
      kind: 'duplicate',
    });
  } finally {
    await settleFixture(async () => {
      if (reopened !== undefined) await reopened.close();
    }, [() => fixture.close()]);
  }
});

for (const operation of ['stage', 'accept'] as const)
  for (const publication of operation === 'stage'
    ? (['journal', 'obligation', 'counts'] as const)
    : (['journal', 'receipt', 'counts'] as const))
    test(`ignored ${operation} ${publication} publication preserves the complete predecessor`, async () => {
      const fixture = await writeInspection();
      let reopened: Awaited<ReturnType<typeof openSqliteStores>> | undefined;
      try {
        const setup = await createWriteFixture({ ...fixture.stores, clock: fixture.clock });
        const stage =
          operation === 'accept'
            ? unwrapReply(await fixture.stores.runs.stageWrite(setup.guard, setup.command))
            : undefined;
        const guard = operation === 'stage' ? setup.guard : await setup.currentGuard();
        const input =
          stage === undefined
            ? undefined
            : {
                commandId: executionCommandId('publication-accept'),
                stageCommandId: setup.command.commandId,
                intent: stage.intent,
                evidence: await retainWriteReceipt(fixture.stores, stage.intent),
              };
        const submit = (stores: Pick<typeof fixture.stores, 'runs' | 'artifacts'>) => {
          if (operation === 'stage') return stores.runs.stageWrite(guard, setup.command);
          if (input === undefined) throw new Error('publication acceptance input missing');
          return acceptWriteReceipt(stores.runs, stores.artifacts, guard, input);
        };
        const capturePhysical = () =>
          fixture.database
            .query<{ name: string }, []>(
              "SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE 'run_%' ORDER BY name",
            )
            .all()
            .map(({ name }) => ({
              name,
              rows: fixture.database
                .query('SELECT * FROM "' + name.replaceAll('"', '""') + '"')
                .all()
                .map((row) => JSON.stringify(row))
                .sort(),
            }));
        const readVisible = async (runs: typeof fixture.stores.runs) => ({
          run: await runs.readRun(setup.run.runId),
          history: await runs.readExecutionHistory(setup.run.runId, setup.guard.attemptId),
          scope: await runs.readRuntimeScope(setup.scope),
        });
        const before = {
          physical: capturePhysical(),
          visible: await readVisible(fixture.stores.runs),
        };
        const table =
          publication === 'journal'
            ? 'run6_write'
            : publication === 'counts'
              ? 'run6_write_format'
              : publication === 'obligation'
                ? 'run6_write_obligation'
                : 'run6_write_receipt';
        fixture.database.run(
          `CREATE TRIGGER ignore_write_publication BEFORE ${publication === 'counts' ? 'UPDATE' : 'INSERT'} ON ${table} BEGIN SELECT RAISE(IGNORE); END`,
        );
        const submitted = await submit(fixture.stores).then(
          (value) => ({ kind: 'returned' as const, value }),
          (cause: unknown) => ({ kind: 'thrown' as const, cause }),
        );
        console.log(
          JSON.stringify({
            event: 'ignored-write-publication',
            operation,
            publication,
            submitted:
              submitted.kind === 'returned'
                ? submitted
                : { kind: submitted.kind, cause: String(submitted.cause) },
            before: before.physical,
            after: capturePhysical(),
          }),
        );
        expect(
          submitted.kind,
          operation + ' ' + publication + ' must abort before publication',
        ).toBe('thrown');
        if (submitted.kind !== 'thrown')
          throw new Error('ignored write publication returned success');
        const expectedFailure =
          publication === 'journal'
            ? 'write journal publication differs'
            : publication === 'obligation'
              ? 'write obligation publication differs'
              : publication === 'receipt'
                ? 'write receipt publication differs'
                : operation === 'stage'
                  ? 'write stage counts publication differs'
                  : 'write acceptance counts publication differs';
        expect(submitted.cause).toBeInstanceOf(Error);
        expect(String(submitted.cause)).toContain(expectedFailure);
        expect({
          physical: capturePhysical(),
          visible: await readVisible(fixture.stores.runs),
        }).toEqual(before);
        await fixture.stores.closeConnection();
        reopened = await openSqliteStores(fixture.options);
        expect({ physical: capturePhysical(), visible: await readVisible(reopened.runs) }).toEqual(
          before,
        );
        fixture.database.run('DROP TRIGGER ignore_write_publication');
        const applied = await submit(reopened);
        expect(applied.kind).toBe('applied');
        if (applied.kind !== 'applied') throw new Error('publication retry did not apply');
        const published = {
          physical: capturePhysical(),
          visible: await readVisible(reopened.runs),
        };
        expect(await submit(reopened)).toEqual({ ...applied, kind: 'duplicate' });
        expect({ physical: capturePhysical(), visible: await readVisible(reopened.runs) }).toEqual(
          published,
        );
      } finally {
        await settleFixture(async () => {
          if (reopened !== undefined) await reopened.close();
        }, [() => fixture.close()]);
      }
    });

test('required write publications apply and replay with genuine no-fault controls', async () => {
  const fixture = await writeInspection();
  await settleFixture(async () => {
    const setup = await createWriteFixture({ ...fixture.stores, clock: fixture.clock });
    const stage = await fixture.stores.runs.stageWrite(setup.guard, setup.command);
    expect(stage.kind).toBe('applied');
    if (stage.kind !== 'applied') throw new Error('no-fault stage control did not apply');
    const staged = unwrapReply(stage);
    expect(await fixture.stores.runs.stageWrite(setup.guard, setup.command)).toEqual({
      ...stage,
      kind: 'duplicate',
    });
    const guard = await setup.currentGuard();
    const input = {
      commandId: executionCommandId('publication-control-accept'),
      stageCommandId: setup.command.commandId,
      intent: staged.intent,
      evidence: await retainWriteReceipt(fixture.stores, staged.intent),
    };
    const accepted = await acceptWriteReceipt(
      fixture.stores.runs,
      fixture.stores.artifacts,
      guard,
      input,
    );
    expect(accepted.kind).toBe('applied');
    if (accepted.kind !== 'applied') throw new Error('no-fault acceptance control did not apply');
    expect(
      await acceptWriteReceipt(fixture.stores.runs, fixture.stores.artifacts, guard, input),
    ).toEqual({ ...accepted, kind: 'duplicate' });
    expect(
      fixture.database
        .query('SELECT record_count,obligation_count,receipt_count FROM run6_write_format')
        .get(),
    ).toEqual({ record_count: 2, obligation_count: 0, receipt_count: 1 });
    expect((await fixture.stores.runs.readRun(setup.run.runId)).capacity.reserved).toBe(0);
  }, [() => fixture.close()]);
});
