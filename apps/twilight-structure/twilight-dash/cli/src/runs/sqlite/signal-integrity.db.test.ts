import { doesNotReject, rejects } from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseOrThrow } from '@shared/validation';
import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';

import { CompletionCodec, decodeAdmission, decodeExecutionFact } from '../record-codecs';
import { digestIntent, organizationId } from '../record-codecs';
import {
  createCompletion,
  createExecutionCommand,
  FixtureClock,
  prepareAttempt,
  unwrapReply,
} from '../testing/fixtures';
import { prepareReceipt } from '../testing/receipts-contract';
import { prepareWait } from '../testing/signals-contract';
import { bootstrapSqliteStores, openSqliteStores } from './open-stores';

async function createFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'run-signal-integrity-'));
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
  const stores = await bootstrapSqliteStores(options);
  const database = new Database(options.path);
  return { ...stores, database, directory, clock, options };
}
const corruptions = [
  {
    name: 'decision physical key',
    kind: 'decision',
    sql: "UPDATE run_decision SET record=json_set(record,'$.decisionId','wrong')",
    message: 'corrupt decision identity',
  },
  {
    name: 'decision physical attempt',
    kind: 'decision',
    sql: "UPDATE run_decision SET record=json_set(record,'$.attemptId','wrong')",
    message: 'corrupt decision identity',
  },
  {
    name: 'decision wait key',
    kind: 'decision',
    sql: "UPDATE run_decision SET record=json_set(record,'$.correlationKey','wrong')",
    message: 'corrupt decision wait provenance',
  },
  {
    name: 'decision choice',
    kind: 'decision',
    sql: "UPDATE run_decision SET record=json_set(record,'$.choice','wrong')",
    message: 'corrupt decision wait provenance',
  },
  {
    name: 'consumption physical attempt',
    kind: 'consumption',
    sql: "UPDATE run_consumption SET reply=json_set(reply,'$.attemptId','wrong')",
    message: 'corrupt consumption identity',
  },
  {
    name: 'consumption physical wait',
    kind: 'consumption',
    sql: "UPDATE run_consumption SET wait=json_set(wait,'$.correlationKey','wrong')",
    message: 'corrupt consumption identity',
  },
  {
    name: 'consumption full wait',
    kind: 'consumption',
    sql: "UPDATE run_consumption SET wait=json_set(wait,'$.prompt.mediaType','wrong')",
    message: 'corrupt consumed wait provenance',
  },
  {
    name: 'consumption original reply',
    kind: 'consumption',
    sql: "UPDATE run_consumption SET reply=json_set(reply,'$.state.claim.personId','wrong'); UPDATE run_attempt SET record=json_set(record,'$.state.claim.personId','wrong')",
    message: 'corrupt consumption reply',
  },
  {
    name: 'missing consumed decision',
    kind: 'consumption',
    sql: 'DELETE FROM run_decision',
    message: 'corrupt missing consumed decision',
  },
  {
    name: 'missing consumption',
    kind: 'consumption',
    sql: 'DELETE FROM run_consumption',
    message: 'corrupt current attempt provenance',
  },
  {
    name: 'receipt physical command',
    kind: 'receipt',
    sql: "UPDATE run_receipt SET record=json_set(record,'$.commandId','wrong')",
    message: 'corrupt receipt identity',
  },
  {
    name: 'receipt physical attempt',
    kind: 'receipt',
    sql: "UPDATE run_receipt SET reply=json_set(reply,'$.attemptId','wrong')",
    message: 'corrupt receipt identity',
  },
  {
    name: 'receipt command digest',
    kind: 'receipt',
    sql: "UPDATE run_receipt SET record=json_set(record,'$.commandDigest','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')",
    message: 'corrupt receipt transition',
  },
  {
    name: 'receipt original reply',
    kind: 'receipt',
    sql: "UPDATE run_receipt SET reply=json_set(reply,'$.state.claim.personId','wrong'); UPDATE run_attempt SET record=json_set(record,'$.state.claim.personId','wrong')",
    message: 'corrupt receipt reply',
  },
  {
    name: 'missing receipt',
    kind: 'receipt',
    sql: 'DELETE FROM run_receipt',
    message: 'corrupt current attempt provenance',
  },
  {
    name: 'terminal outbox present',
    kind: 'receipt',
    sql: "INSERT INTO run_outbox(command_id) VALUES ('command')",
    message: 'corrupt terminal outbox',
  },
  {
    name: 'completion predecessor authority',
    kind: 'receipt',
    sql: "UPDATE run_completion SET record=json_set(record,'$.intent.authority.personId','wrong')",
    message: 'corrupt completion transition',
  },
] as const;
for (const corruption of corruptions)
  test(`public read rejects ${corruption.name} and reopen rejects corruption`, async () => {
    const fixture = await createFixture();
    let closed = false;
    try {
      const setup =
        corruption.kind === 'receipt' ? await prepareReceipt(fixture) : await prepareWait(fixture);
      if ('decision' in setup) {
        unwrapReply(await fixture.runs.receiveDecision(setup.ownership, setup.decision));
        if (corruption.kind === 'consumption')
          unwrapReply(
            await fixture.runs.consumeDecision(
              await setup.currentGuard(),
              setup.decision.decisionId,
            ),
          );
      } else
        unwrapReply(await fixture.runs.reconcileReceipt(await setup.currentGuard(), setup.receipt));
      const valid = await fixture.runs.readRun(setup.run.runId);
      expect(valid.attempts).toHaveLength(1);
      fixture.database.run(corruption.sql);
      if (corruption.name === 'completion predecessor authority') {
        const row = fixture.database
          .query<{ record: string }, []>('SELECT record FROM run_completion')
          .get();
        if (row === null) throw new Error('missing fixture completion');
        const completion = parseOrThrow(CompletionCodec, JSON.parse(row.record));
        const changed = {
          ...completion,
          intent: { ...completion.intent, commandDigest: digestIntent(completion.intent) },
        };
        fixture.database.query('UPDATE run_completion SET record=?').run(JSON.stringify(changed));
      }
      await rejects(fixture.runs.readRun(setup.run.runId), new RegExp(corruption.message));
      fixture.close();
      closed = true;
      await rejects(openSqliteStores(fixture.options));
    } finally {
      fixture.database.close();
      if (!closed) fixture.close();
      rmSync(fixture.directory, { recursive: true });
    }
  });

for (const operation of ['receive', 'consume', 'receipt'] as const)
  test(`stale ${operation} owner refuses before corrupt target and duplicate reads`, async () => {
    const fixture = await createFixture();
    try {
      const setup =
        operation === 'receipt' ? await prepareReceipt(fixture) : await prepareWait(fixture);
      if ('decision' in setup)
        unwrapReply(await fixture.runs.receiveDecision(setup.ownership, setup.decision));
      const guard = await setup.currentGuard();
      fixture.clock.advance(101);
      // Corrupt the named target while retaining decodable owner metadata.
      fixture.database.run("UPDATE run_attempt SET record=json_set(record,'$.version',99)");
      const pending =
        'receipt' in setup
          ? fixture.runs.reconcileReceipt(guard, setup.receipt)
          : operation === 'receive'
            ? fixture.runs.receiveDecision(setup.ownership, setup.decision)
            : fixture.runs.consumeDecision(guard, setup.decision.decisionId);
      await doesNotReject(pending);
      expect(await pending).toEqual({ kind: 'refused', reason: 'owner_stale' });
    } finally {
      fixture.database.close();
      fixture.close();
      rmSync(fixture.directory, { recursive: true });
    }
  });

test('admission rejects terminal predecessor missing its confirmed receipt provenance', async () => {
  const fixture = await createFixture();
  try {
    const setup = await prepareReceipt(fixture);
    unwrapReply(await fixture.runs.reconcileReceipt(await setup.currentGuard(), setup.receipt));
    const before = await fixture.runs.readRun(setup.run.runId);
    fixture.database.run('DELETE FROM run_receipt');
    const admission = decodeAdmission({ ...setup.admission, attemptId: 'retry', ordinal: 2 });
    await rejects(
      fixture.runs.admitAttempt(
        {
          ownership: setup.ownership,
          runId: setup.run.runId,
          expectedRevision: before.run.revision,
        },
        admission,
      ),
      /corrupt current attempt provenance/,
    );
    expect(fixture.database.query('SELECT attempt_id FROM run_attempt').all()).toEqual([
      { attempt_id: setup.admission.attemptId },
    ]);
  } finally {
    fixture.database.close();
    fixture.close();
    rmSync(fixture.directory, { recursive: true });
  }
});

test('completion rejects current claim corruption against intact historical execution', async () => {
  const fixture = await createFixture();
  try {
    const setup = await prepareAttempt(fixture);
    unwrapReply(
      await fixture.runs.recordExecution(
        setup.guard,
        createExecutionCommand({ kind: 'claim_acquired', claim: setup.claim }),
      ),
    );
    const guard = await setup.currentGuard();
    fixture.database.run(
      "UPDATE run_attempt SET record=json_set(record,'$.state.claim.personId','wrong')",
    );
    await rejects(
      fixture.runs.commitOutcome(guard, createCompletion(setup.claim, setup.quiescence)),
      /corrupt current attempt provenance/,
    );
    expect(fixture.database.query('SELECT * FROM run_completion').all()).toEqual([]);
  } finally {
    fixture.database.close();
    fixture.close();
    rmSync(fixture.directory, { recursive: true });
  }
});

test('reopen rejects coherently reused historical wait key', async () => {
  const fixture = await createFixture();
  try {
    const setup = await prepareWait(fixture);
    unwrapReply(await fixture.runs.receiveDecision(setup.ownership, setup.decision));
    unwrapReply(
      await fixture.runs.consumeDecision(await setup.currentGuard(), setup.decision.decisionId),
    );
    const command = createExecutionCommand(
      decodeExecutionFact({
        ...setup.command.fact,
        wait: {
          version: 1,
          correlationKey: 'second-wait',
          prompt: setup.quiescence.evidence,
          choices: ['yes', 'no'],
        },
      }),
      'second-wait-command',
    );
    unwrapReply(await fixture.runs.recordExecution(await setup.currentGuard(), command));
    expect((await fixture.runs.readRun(setup.run.runId)).attempts[0]?.state.kind).toBe(
      'waiting_for_person',
    );
    fixture.database.run(
      "UPDATE run_execution SET record=json_set(record,'$.fact.wait.correlationKey','wait-1'), reply=json_set(reply,'$.state.wait.correlationKey','wait-1') WHERE command_id='second-wait-command'",
    );
    fixture.database.run(
      "UPDATE run_attempt SET record=json_set(record,'$.state.wait.correlationKey','wait-1')",
    );
    await rejects(fixture.runs.readRun(setup.run.runId), /corrupt reused wait identity/);
    fixture.close();
    await rejects(openSqliteStores(fixture.options));
  } finally {
    fixture.database.close();
    rmSync(fixture.directory, { recursive: true });
  }
});

test('receipt reconciliation requires its trusted pending intent from the query dependency', async () => {
  const fixture = await createFixture();
  const descriptor = Object.getOwnPropertyDescriptor(Database.prototype, 'query');
  if (descriptor === undefined) throw new Error('query descriptor absent');
  const query = descriptor.value as Database['query'];
  try {
    const setup = await prepareReceipt(fixture);
    const guard = await setup.currentGuard();
    expect((await fixture.runs.readRun(setup.run.runId)).pendingIntents).toHaveLength(1);
    Object.defineProperty(Database.prototype, 'query', {
      ...descriptor,
      value(this: Database, sql: string) {
        if (sql === 'SELECT * FROM run_completion WHERE command_id=?') return { get: () => null };
        return query.call(this, sql);
      },
    });
    await rejects(
      fixture.runs.reconcileReceipt(guard, setup.receipt),
      /pending intent does not exist/,
    );
  } finally {
    Object.defineProperty(Database.prototype, 'query', descriptor);
    fixture.database.close();
    fixture.close();
    rmSync(fixture.directory, { recursive: true });
  }
});

test('duplicate consumption validates current target provenance before replay', async () => {
  const fixture = await createFixture();
  try {
    const setup = await prepareWait(fixture);
    unwrapReply(await fixture.runs.receiveDecision(setup.ownership, setup.decision));
    const guard = await setup.currentGuard();
    const original = unwrapReply(
      await fixture.runs.consumeDecision(guard, setup.decision.decisionId),
    );
    expect(original.state.kind).toBe('queued');
    fixture.database.run(
      "UPDATE run_attempt SET record=json_set(record,'$.state.claim.personId','wrong')",
    );
    await rejects(
      fixture.runs.consumeDecision(guard, setup.decision.decisionId),
      /corrupt current attempt provenance/,
    );
  } finally {
    fixture.database.close();
    fixture.close();
    rmSync(fixture.directory, { recursive: true });
  }
});

test('terminal inspection refuses completion unreadable after reconstruction', async () => {
  const fixture = await createFixture();
  const descriptor = Object.getOwnPropertyDescriptor(Database.prototype, 'query');
  if (descriptor === undefined) throw new Error('query descriptor absent');
  const query = descriptor.value as Database['query'];
  try {
    const setup = await prepareReceipt(fixture);
    unwrapReply(await fixture.runs.reconcileReceipt(await setup.currentGuard(), setup.receipt));
    expect((await fixture.runs.readRun(setup.run.runId)).receipts).toEqual([setup.receipt]);
    let completionReads = 0;
    Object.defineProperty(Database.prototype, 'query', {
      ...descriptor,
      value(this: Database, sql: string) {
        const statement = query.call(this, sql);
        if (sql === 'SELECT * FROM run_completion WHERE attempt_id=?')
          return {
            get: (identity: string) => {
              completionReads += 1;
              return completionReads === 2 ? null : statement.get(identity);
            },
          };
        return statement;
      },
    });
    await rejects(fixture.runs.readRun(setup.run.runId), /Validation failed/);
  } finally {
    Object.defineProperty(Database.prototype, 'query', descriptor);
    fixture.database.close();
    fixture.close();
    rmSync(fixture.directory, { recursive: true });
  }
});
