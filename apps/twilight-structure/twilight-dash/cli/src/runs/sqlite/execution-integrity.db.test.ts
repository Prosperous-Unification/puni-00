import { doesNotReject, rejects } from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';

import type { ExecutionSubmission } from '../execution-records';
import { attemptId, decodeAttempt, decodeExecutionFact, organizationId } from '../record-codecs';
import { recordOutcome } from '../record-outcome';
import type { Attempt, ExecutionFact } from '../records';
import type { AttemptGuard, StoreReply } from '../run-store';
import {
  createCompletion,
  createExecutionCommand,
  FixtureClock,
  prepareAttempt,
  prepareTurn,
  unwrapReply,
} from '../testing/fixtures';
import { bootstrapSqliteStores, openSqliteStores } from './open-stores';

async function createFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'run-execution-integrity-'));
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
  const setup = await prepareTurn({ ...stores, clock });
  const database = new Database(options.path);
  const history = await stores.runs.readExecutionHistory(
    setup.run.runId,
    setup.admission.attemptId,
  );
  const accepted = history.executions.find((entry) => entry.command.kind === 'accept_claim');
  const staged = history.executions.find((entry) => entry.command.kind === 'stage_turn');
  const preparing = history.executions.find(
    (entry) =>
      entry.command.kind === 'execution' && entry.command.fact.kind === 'preparation_intended',
  );
  if (accepted === undefined || staged === undefined || preparing === undefined)
    throw new Error('fixture history missing');
  const claimCommand = accepted.command;
  const launchCommand = staged.command;
  const wait = {
    version: 1 as const,
    correlationKey: 'question',
    prompt: setup.quiescence.evidence,
    choices: ['yes', 'no'],
  };
  async function replay(
    guard: AttemptGuard,
    command: ExecutionSubmission,
  ): Promise<StoreReply<Attempt>> {
    if (command.kind === 'execution') return await stores.runs.recordExecution(guard, command);
    const scoped = { ...guard, scope: setup.scope, expectedScopeRevision: 0 };
    const reply =
      command.kind === 'stage_claim'
        ? await stores.runs.stageClaim(scoped, command)
        : command.kind === 'accept_claim'
          ? await stores.runs.recordClaimAcceptance(scoped, command)
          : await stores.runs.stageTurn(scoped, command);
    return reply.kind === 'refused' ? reply : { kind: reply.kind, value: reply.value.attempt };
  }
  async function record(command: ExecutionSubmission) {
    return unwrapReply(await replay(await setup.currentGuard(), command));
  }
  let closing: Promise<void> | undefined;
  return {
    ...setup,
    stores,
    database,
    options,
    claimCommand,
    launchCommand,
    wait,
    record,
    replay,
    preparing,
    close(): Promise<void> {
      if (closing !== undefined) return closing;
      closing = (async () => {
        database.close();
        await stores.close();
        rmSync(directory, { recursive: true });
      })();
      return closing;
    },
  };
}
function hasCause(message: string) {
  return (cause: unknown) =>
    cause instanceof Error && cause.cause instanceof Error && cause.cause.message.includes(message);
}

for (const kind of ['interrupted', 'waiting', 'outcome'] as const)
  for (const operation of ['open', 'read', 'admit'] as const)
    test(`${operation} rejects ${kind} quiescence bound to another operation`, async () => {
      const setup = await createFixture();
      try {
        await setup.record(setup.claimCommand);
        if (kind === 'outcome')
          unwrapReply(
            await recordOutcome(
              setup.runs,
              setup.artifacts,
              await setup.currentGuard(),
              createCompletion(setup.claim, setup.quiescence),
            ),
          );
        else
          await setup.record(
            createExecutionCommand(
              kind === 'interrupted'
                ? { kind, quiescence: setup.quiescence }
                : decodeExecutionFact({
                    kind,
                    wait: setup.wait,
                    quiescence: setup.quiescence,
                  }),
            ),
          );
        const guard = await setup.currentGuard();
        setup.database.run(
          "UPDATE run_attempt SET record=json_set(record,'$.state.quiescence.operationKey','other-operation')",
        );
        if (kind === 'outcome')
          setup.database.run(
            "UPDATE run_completion SET record=json_set(record,'$.completion.quiescence.operationKey','other-operation')",
          );
        const before = {
          attempts: setup.database.query('SELECT * FROM run_attempt').all(),
          runs: setup.database.query('SELECT * FROM run_record').all(),
          reservations: setup.database.query('SELECT * FROM run_reservation').all(),
        };
        if (operation === 'open') {
          await setup.stores.close();
          await rejects(
            openSqliteStores(setup.options),
            hasCause('corrupt attempt quiescence operation'),
          );
        } else if (operation === 'read')
          await rejects(setup.runs.readRun(guard.runId), /corrupt attempt quiescence operation/);
        else
          await rejects(
            setup.runs.admitAttempt(
              {
                ownership: guard.ownership,
                runId: guard.runId,
                expectedRevision: guard.expectedRevision,
              },
              { ...setup.admission, attemptId: attemptId('retry'), ordinal: 2 },
            ),
            /corrupt attempt quiescence operation/,
          );
        expect({
          attempts: setup.database.query('SELECT * FROM run_attempt').all(),
          runs: setup.database.query('SELECT * FROM run_record').all(),
          reservations: setup.database.query('SELECT * FROM run_reservation').all(),
        }).toEqual(before);
      } finally {
        await setup.close();
      }
    });

const replyFaults = [
  ['claim_accepted', '$.attempt.state.execution.binding.projection.actorId', 'different-person'],
  ['turn_staged', '$.attempt.state.execution.binding.projection.actorId', 'different-person'],
  ['turn_staged', '$.attempt.state.turn.locator.session.sessionId', 'different-session'],
  ['recovery_required', '$.attempt.state.reason', 'different-reason'],
  [
    'recovery_required',
    '$.attempt.state.checkpoint.execution.binding.projection.actorId',
    'different-person',
  ],
  [
    'recovery_required',
    '$.attempt.state.checkpoint.turn.locator.session.sessionId',
    'different-session',
  ],
  ['unresolved', '$.attempt.state.observation.reason', 'different-reason'],
  ['unresolved', '$.attempt.state.observation.evidence.byteLength', 999],
  [
    'unresolved',
    '$.attempt.state.checkpoint.execution.binding.projection.actorId',
    'different-person',
  ],
  ['interrupted', '$.attempt.state.quiescence.observedAt', 1001],
  ['interrupted', '$.attempt.state.quiescence.effect', 'absent'],
  [
    'interrupted',
    '$.attempt.state.checkpoint.execution.binding.projection.actorId',
    'different-person',
  ],
  ['waiting', '$.attempt.state.wait.correlationKey', 'different-question'],
  ['waiting', '$.attempt.state.wait.prompt.byteLength', 999],
  ['waiting', '$.attempt.state.wait.choices[0]', 'different-choice'],
  [
    'waiting',
    '$.attempt.state.checkpoint.execution.binding.projection.actorId',
    'different-person',
  ],
  ['unknown', '$.attempt.state.observation.reason', 'different-reason'],
  ['unknown', '$.attempt.state.observation.evidence.byteLength', 999],
  ['claim_accepted', '$.attempt.identity.operationKey', 'different-operation'],
  ['claim_accepted', '$.attempt.identity.occurrenceId', 'different-occurrence'],
  ['claim_accepted', '$.attempt.ordinal', 2],
  ['claim_accepted', '$.attempt.admittedEpoch', 2],
  ['claim_accepted', '$.attempt.revision', 2],
] as const;
async function recordVariant(
  setup: Awaited<ReturnType<typeof createFixture>>,
  kind: (typeof replyFaults)[number][0],
) {
  const claimed = await setup.record(setup.claimCommand);
  if (kind === 'claim_accepted') return { command: setup.claimCommand, reply: claimed };
  const launched = await setup.record(setup.launchCommand);
  if (kind === 'turn_staged') return { command: setup.launchCommand, reply: launched };
  const fact: ExecutionFact = decodeExecutionFact(
    kind === 'recovery_required'
      ? { kind, reason: 'recovering' }
      : kind === 'unresolved'
        ? { kind, reason: 'unknown effect', evidence: setup.quiescence.evidence }
        : kind === 'waiting'
          ? { kind, wait: setup.wait, quiescence: setup.quiescence }
          : {
              kind: 'interrupted',
              quiescence: {
                ...setup.quiescence,
                effect: kind === 'unknown' ? 'unknown' : 'failed',
              },
            },
  );
  const command = createExecutionCommand(fact, 'observed-command');
  const reply = await setup.record(command);
  return { command, reply };
}
for (const [kind, path, replacement] of replyFaults)
  for (const operation of ['open', 'replay'] as const)
    test(`${operation} rejects historical ${kind} reply contradiction at ${path}`, async () => {
      const setup = await createFixture();
      try {
        const { command } = await recordVariant(setup, kind);
        const guard = await setup.currentGuard();
        expect((await setup.runs.readRun(guard.runId)).attempts).toHaveLength(1);
        const projection = () =>
          ['run_record', 'run_attempt', 'run_reservation'].map((table) =>
            setup.database.query(`SELECT * FROM ${table} ORDER BY rowid`).all(),
          );
        const before = projection();
        const message =
          path === '$.attempt.revision'
            ? 'scoped execution predecessor has no session'
            : 'corrupt execution command reply';
        setup.database
          .query('UPDATE run_execution SET reply=json_set(reply,?,?) WHERE command_id=?')
          .run(path, replacement, command.commandId);
        if (operation === 'open') {
          await setup.stores.close();
          await rejects(openSqliteStores(setup.options), hasCause(message));
        } else {
          await rejects(setup.replay(guard, command), new RegExp(message));
          expect(projection()).toEqual(before);
        }
      } finally {
        await setup.close();
      }
    });

for (const field of ['scope.projectId', 'workItemId'] as const)
  test(`open rejects execution command and reply carrying another target ${field}`, async () => {
    const setup = await createFixture();
    try {
      await setup.record(setup.claimCommand);
      setup.database
        .query(
          'UPDATE run_execution SET record=json_set(record,?,?),reply=json_set(reply,?,?) WHERE command_id=?',
        )
        .run(
          `$.command.fact.intent.target.observation.${field}`,
          'different-target',
          `$.attempt.state.preparation.target.observation.${field}`,
          'different-target',
          setup.preparing.command.commandId,
        );
      await setup.stores.close();
      await rejects(
        openSqliteStores(setup.options),
        hasCause('corrupt execution command transition'),
      );
    } finally {
      await setup.close();
    }
  });

test('portable terminal decoding binds quiescence to its attempt operation', async () => {
  const setup = await createFixture();
  try {
    const attempt = (await setup.runs.readRun(setup.run.runId)).attempts.find(
      (candidate) => candidate.attemptId === setup.admission.attemptId,
    );
    if (attempt === undefined) throw new Error('fixture attempt missing');
    const completion = createCompletion(setup.claim, setup.quiescence);
    expect(() =>
      decodeAttempt({
        ...attempt,
        holdsCapacity: false,
        state: {
          kind: 'terminal',
          checkpoint: setup.checkpoint,
          outcome: completion.outcome,
          receipt: {
            version: 2,
            commandId: completion.intent.commandId,
            commandDigest: completion.intent.commandDigest,
            claim: setup.claim,
            acceptedWbsRevision: 'accepted',
            evidence: setup.quiescence.evidence,
          },
          quiescence: { ...completion.quiescence, operationKey: 'other-operation' },
        },
      }),
    ).toThrow('corrupt attempt quiescence operation');
  } finally {
    await setup.close();
  }
});

for (const kind of [
  'claim_accepted',
  'turn_staged',
  'recovery_required',
  'unresolved',
  'interrupted',
  'waiting',
  'unknown',
] as const)
  test(`historical ${kind} reply survives reopen and later state without becoming current state`, async () => {
    const setup = await createFixture();
    try {
      const { command, reply } = await recordVariant(setup, kind);
      const guard = await setup.currentGuard();
      if (kind !== 'interrupted' && kind !== 'waiting')
        unwrapReply(
          await recordOutcome(
            setup.runs,
            setup.artifacts,
            guard,
            createCompletion(setup.claim, setup.quiescence),
          ),
        );
      const current = await setup.runs.readRun(guard.runId);
      await setup.stores.close();
      const reopened = await openSqliteStores(setup.options);
      try {
        expect(
          await (async () => {
            if (command.kind === 'execution')
              return await reopened.runs.recordExecution(guard, command);
            const scoped = { ...guard, scope: setup.scope, expectedScopeRevision: 0 };
            const replay =
              command.kind === 'accept_claim'
                ? await reopened.runs.recordClaimAcceptance(scoped, command)
                : command.kind === 'stage_turn'
                  ? await reopened.runs.stageTurn(scoped, command)
                  : await reopened.runs.stageClaim(scoped, command);
            return replay.kind === 'refused'
              ? replay
              : { kind: replay.kind, value: replay.value.attempt };
          })(),
        ).toEqual({
          kind: 'duplicate',
          value: reply,
        });
        expect(await reopened.runs.readRun(guard.runId)).toEqual(current);
      } finally {
        await reopened.close();
      }
    } finally {
      await setup.close();
    }
  });

async function createIndexedFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'run-indexed-integrity-'));
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
  const setup = await prepareAttempt({ ...stores, clock });
  const database = new Database(options.path);
  const claimCommand = createExecutionCommand(
    { kind: 'recovery_required', reason: 'lost preparation' },
    'indexed-command',
  );
  let closing: Promise<void> | undefined;
  return {
    ...setup,
    stores,
    database,
    options,
    claimCommand,
    async record(command: typeof claimCommand) {
      return unwrapReply(await stores.runs.recordExecution(await setup.currentGuard(), command));
    },
    close(): Promise<void> {
      if (closing !== undefined) return closing;
      closing = (async () => {
        database.close();
        await stores.close();
        rmSync(directory, { recursive: true });
      })();
      return closing;
    },
  };
}

test('replay rejects an indexed execution whose history read omits its required command', async () => {
  const setup = await createIndexedFixture();
  const descriptor = Object.getOwnPropertyDescriptor(Database.prototype, 'query');
  if (descriptor === undefined) throw new Error('query descriptor absent');
  const query = descriptor.value as Database['query'];
  try {
    await setup.record(setup.claimCommand);
    const guard = await setup.currentGuard();
    Object.defineProperty(Database.prototype, 'query', {
      ...descriptor,
      value(this: Database, sql: string) {
        if (sql.includes("ORDER BY json_extract(e.reply,'$.attempt.revision')"))
          return { all: () => [] };
        return query.call(this, sql);
      },
    });
    await rejects(
      setup.runs.recordExecution(guard, setup.claimCommand),
      /corrupt (missing execution command|current attempt provenance)/,
    );
  } finally {
    Object.defineProperty(Database.prototype, 'query', descriptor);
    await setup.close();
  }
});

test('required indexed command cannot disappear behind a reset admitted projection', async () => {
  const setup = await createIndexedFixture();
  const descriptor = Object.getOwnPropertyDescriptor(Database.prototype, 'query');
  if (descriptor === undefined) throw new Error('query descriptor absent');
  const query = descriptor.value as Database['query'];
  try {
    const admitted = (await setup.runs.readRun(setup.run.runId)).attempts.find(
      (candidate) => candidate.attemptId === setup.guard.attemptId,
    );
    if (admitted === undefined) throw new Error('missing fixture attempt');
    await setup.record(setup.claimCommand);
    const guard = await setup.currentGuard();
    setup.database.run("UPDATE run_record SET record=json_set(record,'$.revision',1)");
    setup.database
      .query('UPDATE run_attempt SET record=? WHERE attempt_id=?')
      .run(JSON.stringify(admitted), admitted.attemptId);
    Object.defineProperty(Database.prototype, 'query', {
      ...descriptor,
      value(this: Database, sql: string) {
        if (sql.includes("ORDER BY json_extract(e.reply,'$.attempt.revision')"))
          return { all: () => [] };
        return query.call(this, sql);
      },
    });
    await rejects(
      setup.runs.recordExecution(guard, setup.claimCommand),
      /corrupt missing execution command/,
    );
  } finally {
    Object.defineProperty(Database.prototype, 'query', descriptor);
    await setup.close();
  }
});

test('fresh illegal execution state remains a typed refusal after transition extraction', async () => {
  const setup = await createFixture();
  try {
    await setup.record(setup.claimCommand);
    const reply = setup.runs.recordExecution(
      await setup.currentGuard(),
      createExecutionCommand(setup.opened.fact, 'fresh-command'),
    );
    await doesNotReject(reply);
    expect(await reply).toEqual({ kind: 'refused', reason: 'state_conflict' });
  } finally {
    await setup.close();
  }
});
