import { rejects } from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseOrThrow } from '@shared/validation';
import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';

import { CommandIdCodec } from '../record-codecs';
import { decodeAdmission } from '../record-codecs';
import { decodeDecision, decodeExecutionFact, decodeReceipt } from '../record-codecs';
import { organizationId, ownerId, runId } from '../record-codecs';
import type { RecoveryBeginCall } from '../recovery-records';
import {
  createCompletion,
  createExecutionCommand,
  prepareTurn,
  stageFixtureTurn,
} from '../testing/fixtures';
import { createManifest, createRun, FixtureClock, unwrapReply } from '../testing/fixtures';
import { createMemoryStores } from '../testing/memory-stores';
import { createRecoveryResolveCall } from '../testing/recovery-contract';
import { authorityRequest, runtimePin, runtimeScope } from '../testing/runtime-history-contract';
import { MIGRATIONS } from './format';
import { bootstrapSqliteStores, openSqliteStores } from './open-stores';

const identities = ['\ud800', '\ud801', '\udc00', '\ufffd', '\\ud800', '\0', '🪁'];

for (const provider of ['memory', 'sqlite'] as const)
  test(`${provider} preserves distinct UTF-16 run identities through save read retry and reopen`, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'identity-keys-'));
    const options = {
      path: join(directory, 'runs.sqlite'),
      organizationId: organizationId('organization'),
      capacity: 10,
      leaseMilliseconds: 100,
      clock: new FixtureClock(),
      maxBusyAttempts: 10,
      busyDelayMilliseconds: 1,
    };
    const stores =
      provider === 'memory' ? createMemoryStores(options) : await bootstrapSqliteStores(options);
    try {
      const ownership = unwrapReply(await stores.runs.acquireOwnership(ownerId('owner'), 0));
      unwrapReply(await stores.runs.retainManifest(ownership, createManifest()));
      for (const identity of identities) {
        const run = createRun({ runId: runId(identity) });
        expect(await stores.runs.createRun(ownership, run)).toEqual({
          kind: 'applied',
          value: run,
        });
        expect((await stores.runs.readRun(run.runId)).run).toEqual(run);
        expect(await stores.runs.createRun(ownership, run)).toEqual({
          kind: 'duplicate',
          value: run,
        });
      }
      for (const identity of identities)
        expect((await stores.runs.readRun(runId(identity))).run.runId).toBe(runId(identity));
      if (provider === 'sqlite') {
        await stores.close();
        const reopened = await openSqliteStores(options);
        try {
          for (const identity of identities)
            expect((await reopened.runs.readRun(runId(identity))).run.runId).toBe(runId(identity));
        } finally {
          await reopened.close();
        }
      }
    } finally {
      await stores.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

async function createIdentityFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'identity-keys-proof-'));
  const options = {
    path: join(directory, 'runs.sqlite'),
    organizationId: organizationId('organization'),
    capacity: 10,
    leaseMilliseconds: 100,
    clock: new FixtureClock(),
    maxBusyAttempts: 10,
    busyDelayMilliseconds: 1,
  };
  const stores = await bootstrapSqliteStores(options);
  return {
    options,
    stores,
    async close() {
      await stores.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

for (const fault of ['noncanonical', 'mismatch'] as const)
  test(`public read refuses ${fault} physical identity with logical guards installed`, async () => {
    const fixture = await createIdentityFixture();
    const database = new Database(fixture.options.path);
    try {
      const ownership = unwrapReply(
        await fixture.stores.runs.acquireOwnership(ownerId('owner'), 0),
      );
      unwrapReply(await fixture.stores.runs.retainManifest(ownership, createManifest()));
      unwrapReply(await fixture.stores.runs.createRun(ownership, createRun({ runId: runId('a') })));
      database
        .query('UPDATE run5_record SET run_id=?')
        .run(fault === 'noncanonical' ? '"\\u0061"' : '"b"');
      await rejects(
        fault === 'noncanonical'
          ? fixture.stores.runs.readManifest(createManifest().digest)
          : fixture.stores.runs.readRun(runId('b')),
        fault === 'noncanonical' ? /noncanonical sqlite identity key/ : /corrupt run identity/,
      );
    } finally {
      database.close();
      await fixture.close();
    }
  });

for (const fault of ['suppressed', 'absent', 'invalid'] as const)
  test(`applied ownership rolls back when usage marking is ${fault} after audit`, async () => {
    const fixture = await createIdentityFixture();
    const database = new Database(fixture.options.path);
    try {
      const before = database.query('SELECT * FROM run_meta').all();
      if (fault === 'suppressed')
        database.run(
          'CREATE TRIGGER lose_usage BEFORE UPDATE ON run5_usage BEGIN SELECT RAISE(IGNORE); END',
        );
      else {
        if (fault === 'invalid') database.run('PRAGMA ignore_check_constraints=ON');
        database.run(
          `CREATE TRIGGER lose_usage AFTER UPDATE OF ownership ON run_meta BEGIN ${fault === 'absent' ? 'DELETE FROM run5_usage' : 'UPDATE run5_usage SET used=2'}; END`,
        );
      }
      await rejects(fixture.stores.runs.acquireOwnership(ownerId('owner'), 0));
      expect(database.query('SELECT * FROM run_meta').all()).toEqual(before);
      expect(database.query('SELECT * FROM run5_usage').all()).toEqual([{ singleton: 1, used: 0 }]);
    } finally {
      database.close();
      await fixture.close();
    }
  });

for (const fault of ['absent', 'invalid', 'used'] as const)
  test(`direct identity down refuses ${fault} usage without dropping tables`, async () => {
    const fixture = await createIdentityFixture();
    const database = new Database(fixture.options.path);
    try {
      if (fault === 'absent') database.run('DELETE FROM run5_usage');
      if (fault === 'invalid') {
        database.run('PRAGMA ignore_check_constraints=ON');
        database.run('UPDATE run5_usage SET used=2');
        database.run('PRAGMA ignore_check_constraints=OFF');
      }
      if (fault === 'used')
        unwrapReply(await fixture.stores.runs.acquireOwnership(ownerId('owner'), 0));
      database.run('BEGIN IMMEDIATE');
      try {
        expect(() => {
          for (const statement of MIGRATIONS[4].down
            .split('--> statement-breakpoint')
            .map((statement) => statement.trim())
            .filter(Boolean))
            database.run(statement);
        }).toThrow();
      } finally {
        database.run('ROLLBACK');
      }
      expect(
        database.query("SELECT name FROM sqlite_schema WHERE name='run5_record'").all(),
      ).toEqual([{ name: 'run5_record' }]);
    } finally {
      database.close();
      await fixture.close();
    }
  });

for (const identity of [...identities, 'long-' + 'x'.repeat(512)])
  test(`format5 preserves runtime and recovery identity ${JSON.stringify(identity)}`, async () => {
    const fixture = await createIdentityFixture();
    try {
      const ownership = unwrapReply(
        await fixture.stores.runs.acquireOwnership(ownerId('owner'), 0),
      );
      unwrapReply(await fixture.stores.runs.pinRuntimeScope(ownership, runtimePin));
      const original = unwrapReply(
        await fixture.stores.runs.stageRuntimeRequest(
          { ownership, scope: runtimeScope, expectedRevision: 0 },
          authorityRequest(identity, 2),
        ),
      );
      const begin: RecoveryBeginCall = {
        kind: 'authority',
        guard: { ownership, scope: runtimeScope, expectedRevision: 1, expectedRecoveryRevision: 0 },
        intent: {
          version: 1,
          recoveryId: 'recovery-' + identity,
          target: { kind: 'authority', original },
          begunScopeRevision: 1,
          resolver: { ownerId: ownership.ownerId, epoch: ownership.epoch },
        },
      };
      const begun = unwrapReply(await fixture.stores.runs.beginRecovery(begin));
      const pending = await fixture.stores.runs.readRuntimeScope(runtimeScope);
      if (pending.kind !== 'pinned' || pending.version !== 2)
        throw new Error('expected pinned runtime');
      expect(pending.recoveries).toHaveLength(1);
      expect(await fixture.stores.runs.beginRecovery(begin)).toEqual({
        kind: 'duplicate',
        value: begun,
      });

      const call = await createRecoveryResolveCall(
        fixture.stores,
        begin,
        true,
        undefined,
        undefined,
        'fence-' + identity,
      );
      const closed = unwrapReply(await fixture.stores.runs.resolveRecovery(call));
      expect(await fixture.stores.runs.resolveRecovery(call)).toEqual({
        kind: 'duplicate',
        value: closed,
      });
      const before = await fixture.stores.runs.readRuntimeScope(runtimeScope);
      expect(closed.recoveryId).toBe('recovery-' + identity);
      await fixture.stores.close();
      const reopened = await openSqliteStores(fixture.options);
      try {
        expect(await reopened.runs.readRuntimeScope(runtimeScope)).toEqual(before);
      } finally {
        await reopened.close();
      }
    } finally {
      await fixture.close();
    }
  });

for (const identity of identities)
  test(`format5 preserves execution decision consumption completion and receipt keys ${JSON.stringify(identity)}`, async () => {
    const fixture = await createIdentityFixture();
    try {
      const ownership = unwrapReply(
        await fixture.stores.runs.acquireOwnership(ownerId('owner'), 0),
      );
      const setup = await prepareTurn(
        { ...fixture.stores, clock: fixture.options.clock },
        { ownership, suffix: identity },
      );
      const command = createExecutionCommand(
        decodeExecutionFact({
          kind: 'waiting',
          wait: {
            version: 1,
            correlationKey: identity,
            prompt: setup.quiescence.evidence,
            choices: ['yes'],
          },
          quiescence: setup.quiescence,
        }),
        'waiting-' + identity,
      );
      const waitingGuard = await setup.currentGuard();
      const waiting = unwrapReply(await setup.runs.recordExecution(waitingGuard, command));
      expect(await setup.runs.recordExecution(waitingGuard, command)).toEqual({
        kind: 'duplicate',
        value: waiting,
      });
      const decision = decodeDecision({
        version: 1,
        decisionId: identity,
        attemptId: setup.admission.attemptId,
        correlationKey: identity,
        choice: 'yes',
        actorId: 'actor',
        authorizationEvidence: setup.quiescence.evidence,
      });
      unwrapReply(await setup.runs.receiveDecision(ownership, decision));
      expect(await setup.runs.receiveDecision(ownership, decision)).toEqual({
        kind: 'duplicate',
        value: decision,
      });
      const consumptionGuard = await setup.currentGuard();
      const resumed = unwrapReply(
        await setup.runs.consumeDecision(consumptionGuard, decision.decisionId),
      );
      expect(await setup.runs.consumeDecision(consumptionGuard, decision.decisionId)).toEqual({
        kind: 'duplicate',
        value: resumed,
      });
      await stageFixtureTurn(
        setup,
        { kind: 'decision', decisionId: decision.decisionId },
        'continuation',
      );
      const initial = createCompletion(setup.claim, setup.quiescence);
      const completion = createCompletion(setup.claim, setup.quiescence, {
        intent: { ...initial.intent, commandId: parseOrThrow(CommandIdCodec, identity) },
      });
      const completionGuard = await setup.currentGuard();
      const pending = unwrapReply(await setup.runs.commitOutcome(completionGuard, completion));
      expect(await setup.runs.commitOutcome(completionGuard, completion)).toEqual({
        kind: 'duplicate',
        value: pending,
      });
      expect((await setup.runs.readRun(setup.run.runId)).pendingIntents).toEqual([
        completion.intent,
      ]);
      const receipt = decodeReceipt({
        version: 2,
        commandId: identity,
        commandDigest: completion.intent.commandDigest,
        claim: setup.claim,
        acceptedWbsRevision: 'wbs-2',
        evidence: setup.quiescence.evidence,
      });
      const receiptGuard = await setup.currentGuard();
      const terminal = unwrapReply(await setup.runs.reconcileReceipt(receiptGuard, receipt));
      expect(await setup.runs.reconcileReceipt(receiptGuard, receipt)).toEqual({
        kind: 'duplicate',
        value: terminal,
      });
      const before = await setup.runs.readRun(setup.run.runId);
      const history = await setup.runs.readExecutionHistory(
        setup.run.runId,
        setup.admission.attemptId,
      );
      expect(before.consumedDecisionIds).toEqual([decision.decisionId]);
      expect(before.receipts).toEqual([receipt]);
      await fixture.stores.close();
      const reopened = await openSqliteStores(fixture.options);
      try {
        expect(await reopened.runs.readRun(setup.run.runId)).toEqual(before);
        expect(
          await reopened.runs.readExecutionHistory(setup.run.runId, setup.admission.attemptId),
        ).toEqual(history);
      } finally {
        await reopened.close();
      }
    } finally {
      await fixture.close();
    }
  });

for (const fault of ['suppressed used marker', 'reset marker'] as const)
  test(`applied renewal refuses ${fault} independently`, async () => {
    const fixture = await createIdentityFixture();
    const database = new Database(fixture.options.path);
    try {
      const ownership = unwrapReply(
        await fixture.stores.runs.acquireOwnership(ownerId('owner'), 0),
      );
      const before = database.query('SELECT * FROM run_meta').all();
      database.run(
        fault === 'suppressed used marker'
          ? 'CREATE TRIGGER lose_usage BEFORE UPDATE ON run5_usage BEGIN SELECT RAISE(IGNORE); END'
          : 'CREATE TRIGGER lose_usage AFTER UPDATE ON run5_usage WHEN NEW.used=1 BEGIN UPDATE run5_usage SET used=0; END',
      );
      fixture.options.clock.advance(1);
      await rejects(
        fixture.stores.runs.renewOwnership(ownership),
        /identity usage marker was not updated/,
      );
      expect(database.query('SELECT * FROM run_meta').all()).toEqual(before);
      expect(database.query('SELECT used FROM run5_usage').get()).toEqual({ used: 1 });
    } finally {
      database.close();
      await fixture.close();
    }
  });

for (const fault of ['absent', 'invalid', 'extra'] as const)
  test(`public manifest read refuses ${fault} usage marker`, async () => {
    const fixture = await createIdentityFixture();
    const database = new Database(fixture.options.path);
    try {
      const ownership = unwrapReply(
        await fixture.stores.runs.acquireOwnership(ownerId('owner'), 0),
      );
      const manifest = createManifest();
      unwrapReply(await fixture.stores.runs.retainManifest(ownership, manifest));
      database.run('PRAGMA ignore_check_constraints=ON');
      if (fault === 'absent') database.run('DELETE FROM run5_usage');
      if (fault === 'invalid') database.run('UPDATE run5_usage SET used=2');
      if (fault === 'extra') database.run('INSERT INTO run5_usage VALUES (2,0)');
      await rejects(fixture.stores.runs.readManifest(manifest.digest));
    } finally {
      database.close();
      await fixture.close();
    }
  });

test('SQLite retains decoded occurrence ordering over the same distinct admissions as memory', async () => {
  const fixture = await createIdentityFixture();
  const memory = createMemoryStores(fixture.options);
  try {
    const snapshots = [];
    for (const stores of [memory, fixture.stores]) {
      const ownership = unwrapReply(await stores.runs.acquireOwnership(ownerId('owner'), 0));
      unwrapReply(await stores.runs.retainManifest(ownership, createManifest()));
      const run = createRun();
      unwrapReply(await stores.runs.createRun(ownership, run));
      for (const [index, identity] of identities.entries()) {
        const admission = decodeAdmission({
          attemptId: identity,
          identity: {
            version: 1,
            runId: run.runId,
            occurrenceId: identity,
            operationKey: 'operation',
          },
          ordinal: 1,
        });
        const guard = { ownership, runId: run.runId, expectedRevision: index };
        const attempt = unwrapReply(await stores.runs.admitAttempt(guard, admission));
        expect(await stores.runs.admitAttempt(guard, admission)).toEqual({
          kind: 'duplicate',
          value: attempt,
        });
      }
      snapshots.push(await stores.runs.readRun(run.runId));
    }
    const expected = snapshots.at(0);
    if (expected === undefined) throw new Error('memory snapshot missing');
    const actual = snapshots.at(1);
    if (actual === undefined) throw new Error('SQLite snapshot missing');
    expect(actual.attempts).toEqual(
      [...expected.attempts].sort(
        (left, right) =>
          left.identity.occurrenceId.localeCompare(right.identity.occurrenceId) ||
          left.ordinal - right.ordinal,
      ),
    );
    expect({ ...actual, attempts: [] }).toEqual({ ...expected, attempts: [] });
  } finally {
    await memory.close();
    await fixture.close();
  }
});

test('public manifest read refuses extra successor runtime counter marker', async () => {
  const fixture = await createIdentityFixture();
  const database = new Database(fixture.options.path);
  try {
    const ownership = unwrapReply(await fixture.stores.runs.acquireOwnership(ownerId('owner'), 0));
    const manifest = createManifest();
    unwrapReply(await fixture.stores.runs.retainManifest(ownership, manifest));
    database.run('PRAGMA ignore_check_constraints=ON');
    database.run('INSERT INTO run5_runtime_format VALUES (2,0,0,0)');
    await rejects(
      fixture.stores.runs.readManifest(manifest.digest),
      /corrupt runtime count marker/,
    );
  } finally {
    database.close();
    await fixture.close();
  }
});

test('encoded completion ordering cannot admit a collision across two completed attempts', async () => {
  const fixture = await createIdentityFixture();
  try {
    const ownership = unwrapReply(await fixture.stores.runs.acquireOwnership(ownerId('owner'), 0));
    const completed = [];
    for (const identity of ['\0', 'A']) {
      const setup = await prepareTurn(
        { ...fixture.stores, clock: fixture.options.clock },
        { ownership, suffix: identity },
      );
      const initial = createCompletion(setup.claim, setup.quiescence);
      const completion = createCompletion(setup.claim, setup.quiescence, {
        intent: { ...initial.intent, commandId: parseOrThrow(CommandIdCodec, identity) },
      });
      unwrapReply(await setup.runs.commitOutcome(await setup.currentGuard(), completion));
      completed.push({ setup, completion });
    }
    const first = completed.at(0);
    const second = completed.at(1);
    if (first === undefined || second === undefined) throw new Error('missing completed fixtures');
    for (const [own, other] of [
      [first, second],
      [second, first],
    ] as const) {
      const before = await own.setup.runs.readRun(own.setup.run.runId);
      const collision = createCompletion(own.setup.claim, own.setup.quiescence, {
        intent: { ...own.completion.intent, commandId: other.completion.intent.commandId },
      });
      expect(await own.setup.runs.commitOutcome(await own.setup.currentGuard(), collision)).toEqual(
        { kind: 'refused', reason: 'identity_conflict' },
      );
      expect(await own.setup.runs.readRun(own.setup.run.runId)).toEqual(before);
    }
  } finally {
    await fixture.close();
  }
});
