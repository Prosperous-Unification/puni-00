import { rejects } from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';

import { decodeAdmission, organizationId } from '../record-codecs';
import {
  createCompletion,
  createExecutionCommand,
  FixtureClock,
  prepareTurn,
  stageFixtureTurn,
  unwrapReply,
} from '../testing/fixtures';
import { bootstrapSqliteStores, openSqliteStores } from './open-stores';

async function createFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'run-signals-'));
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
  return { ...stores, clock, options, directory };
}

test('probe current claim corruption against intact historical execution', async () => {
  const fixture = await createFixture();
  const setup = await prepareTurn(fixture);
  const database = new Database(fixture.options.path);
  try {
    database.run(
      "UPDATE run_attempt SET record=json_set(record,'$.state.execution.binding.projection.actorId','corrupt-person')",
    );
    await rejects(fixture.runs.readRun(setup.run.runId), /corrupt current attempt provenance/);
    fixture.close();
    await rejects(openSqliteStores(fixture.options), /corrupt/);
  } finally {
    database.close();
    rmSync(fixture.directory, { recursive: true });
  }
});

import { receiptsContract } from '../testing/receipts-contract';
import { signalsContract } from '../testing/signals-contract';
async function createContractFixture() {
  const fixture = await createFixture();
  return {
    ...fixture,
    close() {
      fixture.close();
      rmSync(fixture.directory, { recursive: true });
    },
  };
}
signalsContract('sqlite decisions', createContractFixture);
receiptsContract('sqlite receipts', createContractFixture);

import { doesNotReject } from 'node:assert/strict';

import { parseOrThrow } from '@shared/validation';

import { CommandReceiptCodec, DecisionCodec, decodeExecutionFact, ownerId } from '../record-codecs';
import { receiveDecision, reconcileReceipt } from '../record-signals';
import type { RunStore } from '../run-store';
import { prepareReceipt } from '../testing/receipts-contract';
import { prepareWait } from '../testing/signals-contract';
import { verifiedSignalsContract } from '../testing/verified-signals-contract';
verifiedSignalsContract('sqlite verified signals', createContractFixture);

async function currentGuard(
  runs: RunStore,
  setup: Awaited<ReturnType<typeof prepareWait>> | Awaited<ReturnType<typeof prepareReceipt>>,
) {
  const snapshot = await runs.readRun(setup.run.runId);
  const attempt = snapshot.attempts.find(
    (candidate) => candidate.attemptId === setup.admission.attemptId,
  );
  if (attempt === undefined) throw new Error('missing fixture attempt');
  return {
    ...setup.guard,
    expectedRevision: snapshot.run.revision,
    expectedAttemptRevision: attempt.revision,
  };
}
function physicalSnapshot(database: Database) {
  return [
    'run_meta',
    'run_record',
    'run_attempt',
    'run_reservation',
    'run_decision',
    'run_consumption',
    'run_completion',
    'run_outbox',
    'run_receipt',
    'run_execution',
  ].map((table) => database.query(`SELECT * FROM ${table} ORDER BY rowid`).all());
}
for (const fault of ['receipt', 'consumption', 'reservation'] as const)
  test(`${fault} insert abort preserves whole prior state across reopen`, async () => {
    const fixture = await createFixture();
    let stores = fixture;
    const database = new Database(fixture.options.path);
    try {
      const setup = fault === 'receipt' ? await prepareReceipt(stores) : await prepareWait(stores);
      if ('decision' in setup)
        unwrapReply(await stores.runs.receiveDecision(setup.ownership, setup.decision));
      const guard = await currentGuard(stores.runs, setup);
      const before = await stores.runs.readRun(setup.run.runId);
      const physical = physicalSnapshot(database);
      const table =
        fault === 'receipt'
          ? 'run_receipt'
          : fault === 'consumption'
            ? 'run_consumption'
            : 'run_reservation';
      database.run(
        `CREATE TRIGGER injected_abort BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'injected ${fault} fault'); END`,
      );
      const apply = () =>
        'receipt' in setup
          ? stores.runs.reconcileReceipt(guard, setup.receipt)
          : stores.runs.consumeDecision(guard, setup.decision.decisionId);
      await rejects(apply(), new RegExp(`injected ${fault} fault`));
      expect(physicalSnapshot(database)).toEqual(physical);
      stores.close();
      const reopening = openSqliteStores(fixture.options);
      await doesNotReject(reopening);
      stores = {
        ...(await reopening),
        clock: fixture.clock,
        options: fixture.options,
        directory: fixture.directory,
      };
      expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
      database.run('DROP TRIGGER injected_abort');
      expect((await apply()).kind).toBe('applied');
      const after = await stores.runs.readRun(setup.run.runId);
      stores.close();
      stores = {
        ...(await openSqliteStores(fixture.options)),
        clock: fixture.clock,
        options: fixture.options,
        directory: fixture.directory,
      };
      expect(await stores.runs.readRun(setup.run.runId)).toEqual(after);
      expect((await apply()).kind).toBe('duplicate');
      expect(await stores.runs.readRun(setup.run.runId)).toEqual(after);
    } finally {
      database.close();
      stores.close();
      rmSync(fixture.directory, { recursive: true });
    }
  });

test('consumed decisions retain original replies across later waits reopen and handover', async () => {
  const fixture = await createFixture();
  let stores = fixture;
  try {
    const setup = await prepareWait(stores);
    unwrapReply(await stores.runs.receiveDecision(setup.ownership, setup.decision));
    const competing = parseOrThrow(DecisionCodec, { ...setup.decision, decisionId: 'competing' });
    unwrapReply(await stores.runs.receiveDecision(setup.ownership, competing));
    const guard = await currentGuard(stores.runs, setup);
    const original = unwrapReply(
      await stores.runs.consumeDecision(guard, setup.decision.decisionId),
    );
    await stageFixtureTurn(
      setup,
      { kind: 'decision', decisionId: setup.decision.decisionId },
      'continuation',
    );
    const next = createExecutionCommand(
      decodeExecutionFact({
        ...setup.command.fact,
        wait: {
          version: 1,
          correlationKey: 'second-wait',
          prompt: setup.quiescence.evidence,
          choices: ['yes', 'no'],
        },
      }),
    );
    unwrapReply(await stores.runs.recordExecution(await currentGuard(stores.runs, setup), next));
    const before = await stores.runs.readRun(setup.run.runId);
    stores.close();
    stores = {
      ...(await openSqliteStores(fixture.options)),
      clock: fixture.clock,
      options: fixture.options,
      directory: fixture.directory,
    };
    expect(await stores.runs.receiveDecision(setup.ownership, setup.decision)).toEqual({
      kind: 'duplicate',
      value: setup.decision,
    });
    expect(await stores.runs.consumeDecision(guard, setup.decision.decisionId)).toEqual({
      kind: 'duplicate',
      value: original,
    });
    expect(
      await stores.runs.consumeDecision(
        await currentGuard(stores.runs, setup),
        competing.decisionId,
      ),
    ).toEqual({ kind: 'refused', reason: 'decision_conflict' });
    expect(await stores.runs.recordExecution(guard, setup.command)).toEqual({
      kind: 'duplicate',
      value: setup.waiting,
    });
    fixture.clock.advance(101);
    const ownership = unwrapReply(
      await stores.runs.acquireOwnership(ownerId('replacement'), setup.ownership.epoch),
    );
    expect(await stores.runs.consumeDecision(guard, setup.decision.decisionId)).toEqual({
      kind: 'refused',
      reason: 'owner_stale',
    });
    expect(
      await stores.runs.consumeDecision({ ...guard, ownership }, setup.decision.decisionId),
    ).toEqual({ kind: 'duplicate', value: original });
    expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
  } finally {
    stores.close();
    rmSync(fixture.directory, { recursive: true });
  }
});

test('lost acknowledgement fake source reconciles recorded command after reopen without another attempt', async () => {
  const fixture = await createFixture();
  let stores = fixture;
  try {
    const setup = await prepareReceipt(stores);
    const guard = await currentGuard(stores.runs, setup);
    const remote = new Map([[setup.receipt.commandId, setup.receipt]]);
    // Only this exact recorded command is accepted by the fake source; generic progress lacks digest and claim authority.
    expect(() =>
      parseOrThrow(CommandReceiptCodec, {
        version: 2,
        acceptedWbsRevision: 'wbs-2',
        evidence: setup.quiescence.evidence,
      }),
    ).toThrow();
    stores.close();
    stores = {
      ...(await openSqliteStores(fixture.options)),
      clock: fixture.clock,
      options: fixture.options,
      directory: fixture.directory,
    };
    const pending = (await stores.runs.readRun(setup.run.runId)).pendingIntents;
    expect(pending).toEqual([setup.completion.intent]);
    const receipt = remote.get(setup.completion.intent.commandId);
    if (receipt === undefined) throw new Error('fake source missing exact command');
    const terminal = unwrapReply(
      await reconcileReceipt(stores.runs, stores.artifacts, guard, receipt),
    );
    stores.close();
    stores = {
      ...(await openSqliteStores(fixture.options)),
      clock: fixture.clock,
      options: fixture.options,
      directory: fixture.directory,
    };
    expect(await stores.runs.reconcileReceipt(guard, receipt)).toEqual({
      kind: 'duplicate',
      value: terminal,
    });
    const after = await stores.runs.readRun(setup.run.runId);
    expect(after.attempts).toHaveLength(1);
    expect(after.pendingIntents).toEqual([]);
    expect(after.capacity.reserved).toBe(0);
  } finally {
    stores.close();
    rmSync(fixture.directory, { recursive: true });
  }
});

for (const operation of ['decision', 'receipt'] as const)
  test(`corrupt durable ${operation} evidence rejects verified mutation`, async () => {
    const fixture = await createFixture();
    let stores = fixture;
    const database = new Database(fixture.options.path);
    try {
      const setup =
        operation === 'decision' ? await prepareWait(stores) : await prepareReceipt(stores);
      const before = await stores.runs.readRun(setup.run.runId);
      const guard = await currentGuard(stores.runs, setup);
      database
        .query('UPDATE run_artifact SET content=? WHERE digest=?')
        .run(new TextEncoder().encode('corrupted'), setup.quiescence.evidence.digest);
      stores.close();
      stores = {
        ...(await openSqliteStores(fixture.options)),
        clock: fixture.clock,
        options: fixture.options,
        directory: fixture.directory,
      };
      await rejects(
        'decision' in setup
          ? receiveDecision(stores.runs, stores.artifacts, setup.ownership, setup.decision)
          : reconcileReceipt(stores.runs, stores.artifacts, guard, setup.receipt),
        /artifact integrity/,
      );
      expect(await stores.runs.readRun(setup.run.runId)).toEqual(before);
    } finally {
      database.close();
      stores.close();
      rmSync(fixture.directory, { recursive: true });
    }
  });
import { signalEdgeContract } from '../testing/signal-edge-contract';
signalEdgeContract('sqlite signal edges', createContractFixture);

for (const operation of ['decision', 'receipt'] as const)
  test(`trusted sqlite ${operation} snapshots request before its transaction wait`, async () => {
    const fixture = await createFixture();
    try {
      const setup =
        operation === 'decision' ? await prepareWait(fixture) : await prepareReceipt(fixture);
      if ('decision' in setup) {
        const owner = { ...setup.ownership };
        const decision = { ...setup.decision };
        const pending = fixture.runs.receiveDecision(owner, decision);
        owner.ownerId = ownerId('wrong');
        decision.choice = 'wrong';
        expect(await pending).toEqual({ kind: 'applied', value: setup.decision });
      } else {
        const guard = { ...(await setup.currentGuard()), ownership: { ...setup.ownership } };
        const receipt = { ...setup.receipt, claim: { ...setup.claim } };
        const pending = fixture.runs.reconcileReceipt(guard, receipt);
        guard.ownership.ownerId = ownerId('wrong');
        guard.expectedRevision = 999;
        receipt.acceptedWbsRevision = 'wrong';
        const reply = await pending;
        expect(reply).toMatchObject({ kind: 'applied' });
        expect(unwrapReply(reply).state).toMatchObject({
          kind: 'terminal',
          receipt: setup.receipt,
        });
      }
    } finally {
      fixture.close();
      rmSync(fixture.directory, { recursive: true });
    }
  });

test('old failed receipt survives reopen while an independent run becomes active and terminal', async () => {
  const fixture = await createFixture();
  let stores = fixture;
  try {
    const setup = await prepareReceipt(stores);
    const guard = await setup.currentGuard();
    const original = unwrapReply(await stores.runs.reconcileReceipt(guard, setup.receipt));
    const first = await stores.runs.readRun(setup.run.runId);
    const retry = decodeAdmission({ ...setup.admission, attemptId: 'next', ordinal: 2 });
    expect(
      await stores.runs.admitAttempt(
        {
          ownership: setup.ownership,
          runId: setup.run.runId,
          expectedRevision: first.run.revision,
        },
        retry,
      ),
    ).toEqual({ kind: 'refused', reason: 'attempt_active' });
    const second = await prepareTurn(stores, { ownership: setup.ownership, suffix: 'second' });
    const nextGuard = await second.currentGuard();
    const initial = createCompletion(second.claim, second.quiescence);
    const completion = createCompletion(second.claim, second.quiescence, {
      intent: {
        ...initial.intent,
        commandId: parseOrThrow(CommandReceiptCodec, {
          ...setup.receipt,
          commandId: 'second-command',
        }).commandId,
      },
    });
    stores.close();
    stores = {
      ...(await openSqliteStores(fixture.options)),
      clock: fixture.clock,
      options: fixture.options,
      directory: fixture.directory,
    };
    const active = await stores.runs.readRun(second.run.runId);
    expect(await stores.runs.reconcileReceipt(guard, setup.receipt)).toEqual({
      kind: 'duplicate',
      value: original,
    });
    expect(await stores.runs.readRun(second.run.runId)).toEqual(active);
    const pending = unwrapReply(await stores.runs.commitOutcome(nextGuard, completion));
    const receipt = {
      ...setup.receipt,
      commandId: completion.intent.commandId,
      commandDigest: completion.intent.commandDigest,
      claim: second.claim,
    };
    unwrapReply(
      await stores.runs.reconcileReceipt(
        {
          ...nextGuard,
          expectedRevision: active.run.revision + 1,
          expectedAttemptRevision: pending.revision,
        },
        receipt,
      ),
    );
    const terminal = await stores.runs.readRun(second.run.runId);
    stores.close();
    stores = {
      ...(await openSqliteStores(fixture.options)),
      clock: fixture.clock,
      options: fixture.options,
      directory: fixture.directory,
    };
    expect(await stores.runs.reconcileReceipt(guard, setup.receipt)).toEqual({
      kind: 'duplicate',
      value: original,
    });
    expect(await stores.runs.readRun(second.run.runId)).toEqual(terminal);
    expect([
      ...(await stores.runs.readRun(setup.run.runId)).receipts,
      ...terminal.receipts,
    ]).toHaveLength(2);
  } finally {
    stores.close();
    rmSync(fixture.directory, { recursive: true });
  }
});
