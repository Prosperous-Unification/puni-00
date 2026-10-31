import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { organizationId } from '../record-codecs';
import { constructFixture } from '../testing/construct-fixture';
import { FixtureClock } from '../testing/fixtures';
import { createFormat4Inspection, openFormat4Stores } from '../testing/format4-fixture';
import {
  createRecoveryFenceCall,
  createRecoveryObservationCall,
  recoveryContract,
} from '../testing/recovery-contract';
import { createRecoveryInspection, createRecoveryStores } from '../testing/sqlite-fixture';
import { encodeKey } from './identity-key';
import { downgradeUnusedSqliteIdentityKeys } from './migrate-identities';
import { FORMAT4, FORMAT5 } from './schema';

recoveryContract('sqlite recovery', async (capacity = 1) => {
  const directory = mkdtempSync(join(tmpdir(), 'recovery-'));
  const clock = new FixtureClock();
  const stores = await createRecoveryStores(directory, {
    path: join(directory, 'runs.sqlite'),
    organizationId: organizationId('organization'),
    capacity,
    leaseMilliseconds: 100,
    clock,
    maxBusyAttempts: 20,
    busyDelayMilliseconds: 1,
  });
  return { ...stores, clock };
});

import { rejects } from 'node:assert/strict';

import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';

import { referenceArtifact } from '../artifact-integrity';
import { decodeCurrentAttempt, ownerId } from '../record-codecs';
import { decodeRecoveryHistory } from '../recovery-codecs';
import { digestRuntimeRequest, runtimeScopeKey } from '../runtime-codecs';
import { prepareClaimed, unwrapReply } from '../testing/fixtures';
import {
  authorityReceipt,
  authorityRequest,
  runtimePin,
  runtimeScope,
} from '../testing/runtime-history-contract';
import { downgradeUnusedSqliteStores } from './migrate-recovery';
import { openSqliteStores } from './open-stores';

function captureRecovery(database: Database) {
  return database
    .query<{ name: string }, []>("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name")
    .all()
    .map(({ name }) => ({
      name,
      rows: database.query(`SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`).all(),
    }));
}
function createExchange<T>(value: T, context: unknown, request: unknown, status = 200) {
  const body = {
    artifact: referenceArtifact(
      new TextEncoder().encode(JSON.stringify(value)),
      'application/json',
    ),
    value,
  };
  const exchange = {
    version: 1,
    scope: runtimeScope,
    ledgerId: 'ledger',
    context,
    request,
    status,
    body: body.artifact,
  };
  return {
    body,
    envelope: {
      artifact: referenceArtifact(
        new TextEncoder().encode(JSON.stringify(exchange)),
        'application/json',
      ),
      value: exchange,
    },
  };
}

async function createPhysicalFixture(
  closed: boolean,
  format: 'current' | 'historical' = 'current',
) {
  const directory = mkdtempSync(join(tmpdir(), 'recovery-physical-'));
  const options = {
    path: join(directory, 'runs.sqlite'),
    organizationId: organizationId('organization'),
    capacity: 1,
    leaseMilliseconds: 100,
    clock: new FixtureClock(),
    maxBusyAttempts: 2,
    busyDelayMilliseconds: 1,
  };
  const descriptor = format === 'historical' ? FORMAT4 : FORMAT5;
  const { stores, database, close } = await (
    format === 'historical' ? createFormat4Inspection : createRecoveryInspection
  )(directory, options);
  return await constructFixture(async () => {
    const ownership = unwrapReply(await stores.runs.acquireOwnership(ownerId('local-A'), 0));
    unwrapReply(await stores.runs.pinRuntimeScope(ownership, runtimePin));
    const original = unwrapReply(
      await stores.runs.stageRuntimeRequest(
        { ownership, scope: runtimeScope, expectedRevision: 0 },
        authorityRequest('original', null),
      ),
    );
    const call = {
      kind: 'authority' as const,
      guard: { ownership, scope: runtimeScope, expectedRevision: 1, expectedRecoveryRevision: 0 },
      intent: {
        version: 1 as const,
        recoveryId: 'recover',
        target: { kind: 'authority' as const, original },
        begunScopeRevision: 1,
        resolver: { ownerId: ownership.ownerId, epoch: ownership.epoch },
      },
    };
    unwrapReply(await stores.runs.beginRecovery(call));
    if (closed) {
      const canonicalRequest = authorityRequest('fence', 1);
      const requestDigest = digestRuntimeRequest(canonicalRequest);
      const state = createExchange(
        {
          schemaVersion: 1,
          ledgerId: 'ledger',
          scope: runtimeScope,
          basis: 'rb1:' + 'a'.repeat(64),
          facts: { projectRevision: 0, workItems: [], steps: [] },
          authority: { kind: 'held', ownerId: 'receiver-owner', generation: 1 },
          claims: [],
        },
        { kind: 'initial_state', recoveryId: 'recover' },
        { kind: 'state' },
      );
      const fence = {
        version: 1,
        recoveryId: 'recover',
        ordinal: 1,
        canonicalRequest,
        requestDigest,
        owner: call.intent.resolver,
        stagedRevision: 1,
        basis: { kind: 'initial', state },
      };
      const reply = createExchange(
        authorityReceipt({
          version: 1,
          commandId: 'fence',
          canonicalRequest,
          requestDigest,
          localOwner: call.intent.resolver,
          stagedRevision: 1,
        }),
        {
          kind: 'fence_reply',
          recoveryId: 'recover',
          ordinal: 1,
          requestDigest,
          stagedRevision: 1,
        },
        { kind: 'authority', canonicalRequest },
      );
      const observation = { version: 1, kind: 'accepted', fence, reply, observedRevision: 2 };
      const lookup = createExchange(
        { error: 'runtime_receipt_not_found' },
        {
          kind: 'original_lookup',
          recoveryId: 'recover',
          ordinal: 1,
          observationRevision: 2,
          fenceExchange: reply.envelope.artifact,
          fenceReceipt: reply.body.artifact,
        },
        { kind: 'lookup', commandId: original.commandId },
        404,
      );
      const history = decodeRecoveryHistory({
        version: 1,
        intent: call.intent,
        revision: 3,
        fences: [fence],
        observations: [observation],
        closure: {
          version: 1,
          recoveryId: 'recover',
          original,
          fence: { fence, observation },
          decision: { kind: 'fenced_nonaccepted', lookup },
          resolvedRevision: 3,
          resolver: call.intent.resolver,
          scopeBefore: 1,
          scopeAfter: 2,
          originalReply: null,
          attemptReply: null,
        },
      });
      const scopeKey = runtimeScopeKey(runtimeScope);
      const barrier = {
        recoveryId: 'recover',
        scope: runtimeScope,
        scopeBefore: 1,
        scopeAfter: 2,
        generationFloor: 2,
      };
      database.run('BEGIN IMMEDIATE');
      database
        .query(`INSERT INTO ${descriptor.family.recovery_fence} VALUES (?,?,?,?,?)`)
        .run(descriptor.encode('recover'), 1, descriptor.encode('fence'), 1, JSON.stringify(fence));
      database
        .query(`INSERT INTO ${descriptor.family.recovery_observation} VALUES (?,?,?,?)`)
        .run(descriptor.encode('recover'), 1, 2, JSON.stringify(observation));
      database
        .query(`INSERT INTO ${descriptor.family.recovery_closure} VALUES (?,?,?)`)
        .run(descriptor.encode('recover'), 3, JSON.stringify(history.closure));
      database
        .query(`INSERT INTO ${descriptor.family.recovery_barrier} VALUES (?,?,?,?)`)
        .run(scopeKey, 2, descriptor.encode('recover'), JSON.stringify(barrier));
      database.run(`UPDATE ${descriptor.family.recovery_journal} SET revision=3`);
      database.run(`DELETE FROM ${descriptor.family.recovery_active}`);
      database.run(
        `UPDATE ${descriptor.family.recovery_format} SET fence_count=1,observation_count=1,closure_count=1,barrier_count=1,active_count=0`,
      );
      database.run(`UPDATE ${descriptor.family.runtime_scope} SET revision=2`);
      database.run('COMMIT');
      expect(await stores.runs.readRuntimeScope(runtimeScope)).toMatchObject({
        revision: 2,
        pendingCommandId: null,
        activeRecoveryId: null,
        generationFloor: 2,
        recoveries: [history],
      });
    }
    return { stores, database, options, call, close };
  }, [close]);
}

for (const format of ['current', 'historical'] as const)
  test(
    'complete closed recovery reopens and refuses unused down while preserving all evidence ' +
      format,
    async () => {
      const fixture = await createPhysicalFixture(true, format);
      try {
        const before = captureRecovery(fixture.database);
        const reopened = await (format === 'historical' ? openFormat4Stores : openSqliteStores)(
          fixture.options,
        );
        try {
          expect(await reopened.runs.readRuntimeScope(runtimeScope)).toMatchObject({
            activeRecoveryId: null,
            recoveries: [{ revision: 3, closure: { scopeAfter: 2 } }],
          });
        } finally {
          await reopened.close();
        }
        await rejects(
          (format === 'historical'
            ? downgradeUnusedSqliteStores
            : downgradeUnusedSqliteIdentityKeys)(fixture.options),
          (cause: unknown) => {
            expect(cause).toMatchObject({ failure: 'used_history', phase: 'transaction' });
            return true;
          },
        );
        expect(captureRecovery(fixture.database)).toEqual(before);
      } finally {
        await fixture.close();
      }
    },
  );

for (const [fault, sql, closed] of [
  ['missing marker', 'DELETE FROM run5_recovery_format', false],
  [
    'extra marker',
    'PRAGMA ignore_check_constraints=ON; INSERT INTO run5_recovery_format VALUES (2,1,0,0,0,0,1)',
    false,
  ],
  ['journal count', 'UPDATE run5_recovery_format SET journal_count=2', false],
  ['journal command key', 'UPDATE run5_recovery_journal SET command_id=\'"wrong"\'', false],
  ['journal scope key', "UPDATE run5_recovery_journal SET scope_key='wrong'", false],
  ['active key', "UPDATE run5_recovery_active SET scope_key='wrong'", false],
  ['active journal', 'UPDATE run5_recovery_active SET recovery_id=\'"wrong"\'', false],
  ['lost journal family', 'DELETE FROM run5_recovery_journal', false],
  ['lost active family', 'DELETE FROM run5_recovery_active', false],
  ['lost fence family', 'DELETE FROM run5_recovery_fence', true],
  ['lost observation family', 'DELETE FROM run5_recovery_observation', true],
  ['lost closure family', 'DELETE FROM run5_recovery_closure', true],
  ['lost barrier family', 'DELETE FROM run5_recovery_barrier', true],
  ['fence command key', 'UPDATE run5_recovery_fence SET command_id=\'"wrong"\'', true],
  ['fence ordinal', 'UPDATE run5_recovery_fence SET ordinal=2', true],
  ['observation ordinal', 'UPDATE run5_recovery_observation SET ordinal=2', true],
  ['closure revision', 'UPDATE run5_recovery_closure SET revision=4', true],
  ['barrier scope key', "UPDATE run5_recovery_barrier SET scope_key='wrong'", true],
  ['barrier scope revision', 'UPDATE run5_recovery_barrier SET scope_after=3', true],
] as const)
  test(`physical recovery ${fault} refuses read mutation and reopen without repair`, async () => {
    const fixture = await createPhysicalFixture(closed);
    try {
      fixture.database.run(sql);
      const before = captureRecovery(fixture.database);
      if (fault === 'journal count')
        await rejects(
          fixture.stores.runs.readRuntimeScope(runtimeScope),
          /corrupt recovery physical counts/,
        );
      else await rejects(fixture.stores.runs.readRuntimeScope(runtimeScope));
      await rejects(fixture.stores.runs.beginRecovery(fixture.call));
      await rejects(openSqliteStores(fixture.options));
      expect(captureRecovery(fixture.database)).toEqual(before);
    } finally {
      await fixture.close();
    }
  });

test('late begin marker abort rolls back journal and active index before reopen', async () => {
  const fixture = await createPhysicalFixture(false);
  try {
    fixture.database.run('DELETE FROM run5_recovery_active');
    fixture.database.run('DELETE FROM run5_recovery_journal');
    fixture.database.run('UPDATE run5_recovery_format SET journal_count=0,active_count=0');
    fixture.database.run(
      "CREATE TRIGGER begin_marker_abort BEFORE UPDATE ON run5_recovery_format WHEN (SELECT count(*) FROM run5_recovery_journal)=1 AND (SELECT count(*) FROM run5_recovery_active)=1 BEGIN SELECT RAISE(ABORT,'late begin marker injected'); END",
    );
    const before = captureRecovery(fixture.database);
    await rejects(fixture.stores.runs.beginRecovery(fixture.call), /late begin marker injected/);
    expect(captureRecovery(fixture.database)).toEqual(before);
    const reopened = await openSqliteStores(fixture.options);
    try {
      expect(await reopened.runs.readRuntimeScope(runtimeScope)).toMatchObject({
        activeRecoveryId: null,
        recoveries: [],
      });
      fixture.database.run('DROP TRIGGER begin_marker_abort');
      expect(await reopened.runs.beginRecovery(fixture.call)).toMatchObject({ kind: 'applied' });
    } finally {
      await reopened.close();
    }
  } finally {
    await fixture.close();
  }
});

import { MIGRATIONS } from './format';

test('production down artifact refuses used recovery before dropping any table and rolls back its temporary guard', async () => {
  const fixture = await createPhysicalFixture(true, 'historical');
  try {
    const before = captureRecovery(fixture.database);
    const temporary = fixture.database.query('SELECT * FROM sqlite_temp_schema').all();
    fixture.database.run('BEGIN IMMEDIATE');
    try {
      let failure: unknown;
      try {
        for (const statement of MIGRATIONS[3].down
          .split('--> statement-breakpoint')
          .map((statement) => statement.trim())
          .filter((statement) => statement.length > 0))
          fixture.database.run(statement);
      } catch (cause) {
        failure = cause;
      }
      expect(
        fixture.database
          .query("SELECT name FROM sqlite_schema WHERE name='run_recovery_journal'")
          .all(),
      ).toEqual([{ name: 'run_recovery_journal' }]);
      expect(failure).toBeInstanceOf(Error);
      expect(String(failure)).toContain('CHECK constraint failed');
      expect(fixture.database.inTransaction).toBe(true);
    } finally {
      fixture.database.run('ROLLBACK');
    }
    expect(captureRecovery(fixture.database)).toEqual(before);
    expect(fixture.database.query('SELECT * FROM sqlite_temp_schema').all()).toEqual(temporary);
  } finally {
    await fixture.close();
  }
});

for (const format of ['current', 'historical'] as const)
  test(
    'complete accepted claim hold reopens preserves old acknowledgements and refuses unused down ' +
      format,
    async () => {
      const directory = mkdtempSync(join(tmpdir(), 'recovery-held-down-'));
      const options = {
        path: join(directory, 'runs.sqlite'),
        organizationId: organizationId('organization'),
        capacity: 1,
        leaseMilliseconds: 100,
        clock: new FixtureClock(),
        maxBusyAttempts: 2,
        busyDelayMilliseconds: 1,
      };
      const descriptor = format === 'historical' ? FORMAT4 : FORMAT5;
      const { stores, database, close } = await (
        format === 'historical' ? createFormat4Inspection : createRecoveryInspection
      )(directory, options);
      try {
        const setup = await prepareClaimed({ ...stores, clock: options.clock });
        const execution = await stores.runs.readExecutionHistory(
          setup.run.runId,
          setup.admission.attemptId,
        );
        const accepted = execution.executions.find(
          (entry) => entry.command.kind === 'accept_claim',
        );
        if (accepted?.command.kind !== 'accept_claim')
          throw new Error('missing accepted claim fixture');
        const acknowledgements = database
          .query(`SELECT * FROM ${descriptor.family.execution} ORDER BY rowid`)
          .all();
        const original = setup.staged.intent;
        const recoveryId = 'held-recovery';
        const canonicalRequest = authorityRequest('held-fence', 1);
        const requestDigest = digestRuntimeRequest(canonicalRequest);
        const state = createExchange(
          setup.state,
          { kind: 'initial_state', recoveryId },
          { kind: 'state' },
        );
        const fence = {
          version: 1,
          recoveryId,
          ordinal: 1,
          canonicalRequest,
          requestDigest,
          owner: setup.owner,
          stagedRevision: 1,
          basis: { kind: 'initial', state },
        };
        const reply = createExchange(
          authorityReceipt({
            version: 1,
            commandId: 'held-fence',
            canonicalRequest,
            requestDigest,
            localOwner: setup.owner,
            stagedRevision: 1,
          }),
          { kind: 'fence_reply', recoveryId, ordinal: 1, requestDigest, stagedRevision: 1 },
          { kind: 'authority', canonicalRequest },
        );
        const observation = { version: 1, kind: 'accepted', fence, reply, observedRevision: 2 };
        const originalReceipt: unknown = JSON.parse(
          new TextDecoder().decode(
            await stores.artifacts.readArtifact(setup.accepted.acceptance.evidence),
          ),
        );
        const lookup = createExchange(
          originalReceipt,
          {
            kind: 'original_lookup',
            recoveryId,
            ordinal: 1,
            observationRevision: 2,
            fenceExchange: reply.envelope.artifact,
            fenceReceipt: reply.body.artifact,
          },
          { kind: 'lookup', commandId: original.commandId },
        );
        const held = decodeCurrentAttempt({
          ...setup.accepted.attempt,
          version: 3,
          revision: setup.accepted.attempt.revision + 1,
          state: {
            kind: 'recovery_hold',
            cause: 'claim_accepted_fenced',
            closureId: recoveryId,
            checkpoint: setup.accepted.attempt.state,
          },
        });
        const history = decodeRecoveryHistory({
          version: 1,
          revision: 3,
          intent: {
            version: 1,
            recoveryId,
            target: {
              kind: 'claim',
              original,
              runId: setup.run.runId,
              attemptId: held.attemptId,
              stageCommandId: 'stage-claim',
              acceptanceCommandId: 'accept-claim',
            },
            begunScopeRevision: 3,
            resolver: setup.owner,
          },
          fences: [fence],
          observations: [observation],
          closure: {
            version: 1,
            recoveryId,
            original,
            fence: { fence, observation },
            decision: { kind: 'accepted', lookup, command: accepted.command },
            resolvedRevision: 3,
            resolver: setup.owner,
            scopeBefore: 3,
            scopeAfter: 5,
            originalReply: { kind: 'claim', command: accepted.command, ack: setup.accepted },
            attemptReply: held,
          },
        });
        const scopeKey = runtimeScopeKey(setup.scope);
        const barrier = {
          recoveryId,
          scope: setup.scope,
          scopeBefore: 3,
          scopeAfter: 5,
          generationFloor: 2,
        };
        database.run('BEGIN IMMEDIATE');
        database
          .query(`INSERT INTO ${descriptor.family.recovery_journal} VALUES (?,?,?,?,?)`)
          .run(
            descriptor.encode(recoveryId),
            descriptor.encode(original.commandId),
            scopeKey,
            3,
            JSON.stringify(history.intent),
          );
        database
          .query(`INSERT INTO ${descriptor.family.recovery_fence} VALUES (?,?,?,?,?)`)
          .run(
            descriptor.encode(recoveryId),
            1,
            descriptor.encode('held-fence'),
            1,
            JSON.stringify(fence),
          );
        database
          .query(`INSERT INTO ${descriptor.family.recovery_observation} VALUES (?,?,?,?)`)
          .run(descriptor.encode(recoveryId), 1, 2, JSON.stringify(observation));
        database
          .query(`INSERT INTO ${descriptor.family.recovery_closure} VALUES (?,?,?)`)
          .run(descriptor.encode(recoveryId), 3, JSON.stringify(history.closure));
        database
          .query(`INSERT INTO ${descriptor.family.recovery_barrier} VALUES (?,?,?,?)`)
          .run(scopeKey, 5, descriptor.encode(recoveryId), JSON.stringify(barrier));
        database.run(
          `UPDATE ${descriptor.family.recovery_format} SET journal_count=1,fence_count=1,observation_count=1,closure_count=1,barrier_count=1,active_count=0`,
        );
        database
          .query(`UPDATE ${descriptor.family.attempt} SET record=? WHERE attempt_id=?`)
          .run(JSON.stringify(held), descriptor.encode(held.attemptId));
        database
          .query(`UPDATE ${descriptor.family.record} SET record=? WHERE run_id=?`)
          .run(
            JSON.stringify({ ...execution.run, revision: execution.run.revision + 1 }),
            descriptor.encode(setup.run.runId),
          );
        database.run(`UPDATE ${descriptor.family.runtime_scope} SET revision=5`);
        database.run('COMMIT');
        expect(await stores.runs.readRun(setup.run.runId)).toMatchObject({
          version: 3,
          attempts: [held],
          capacity: { reserved: 1 },
        });
        expect(
          database.query(`SELECT * FROM ${descriptor.family.execution} ORDER BY rowid`).all(),
        ).toEqual(acknowledgements);
        const before = captureRecovery(database);
        const reopened = await (format === 'historical' ? openFormat4Stores : openSqliteStores)(
          options,
        );
        try {
          expect(
            (await reopened.runs.readExecutionHistory(setup.run.runId, held.attemptId)).attempt,
          ).toEqual(held);
        } finally {
          await reopened.close();
        }
        await rejects(
          (format === 'historical'
            ? downgradeUnusedSqliteStores
            : downgradeUnusedSqliteIdentityKeys)(options),
          (cause: unknown) => {
            expect(cause).toMatchObject({ failure: 'used_history', phase: 'transaction' });
            return true;
          },
        );
        expect(captureRecovery(database)).toEqual(before);
      } finally {
        await close();
      }
    },
  );

test('recovery fence late marker abort rolls back exact predecessor and resumes after reopen', async () => {
  const fixture = await createPhysicalFixture(false);
  try {
    const call = await createRecoveryFenceCall(fixture.stores.artifacts, fixture.call, 2);
    fixture.database.run(
      "CREATE TRIGGER fence_marker_abort BEFORE UPDATE ON run5_recovery_format WHEN NEW.fence_count=1 BEGIN SELECT RAISE(ABORT,'late fence marker injected'); END",
    );
    const before = captureRecovery(fixture.database);
    await rejects(fixture.stores.runs.stageRecoveryFence(call), /late fence marker injected/);
    expect(captureRecovery(fixture.database)).toEqual(before);
    const reopened = await openSqliteStores(fixture.options);
    try {
      expect(await reopened.runs.readRuntimeScope(runtimeScope)).toMatchObject({
        recoveries: [{ revision: 0, fences: [] }],
      });
      fixture.database.run('DROP TRIGGER fence_marker_abort');
      expect(await reopened.runs.stageRecoveryFence(call)).toEqual({
        kind: 'applied',
        value: call.input.fence,
      });
      const persisted = await openSqliteStores(fixture.options);
      try {
        expect(await persisted.runs.stageRecoveryFence(call)).toEqual({
          kind: 'duplicate',
          value: call.input.fence,
        });
      } finally {
        await persisted.close();
      }
    } finally {
      await reopened.close();
    }
  } finally {
    await fixture.close();
  }
});

test('recovery fence complete audit precedes replay and decoding', async () => {
  const fixture = await createPhysicalFixture(false);
  try {
    const call = await createRecoveryFenceCall(fixture.stores.artifacts, fixture.call, 2);
    unwrapReply(await fixture.stores.runs.stageRecoveryFence(call));
    fixture.database.run('UPDATE run5_recovery_format SET fence_count=2');
    await rejects(fixture.stores.runs.stageRecoveryFence(call), /corrupt recovery physical counts/);
    Object.assign(call.input, { fence: null });
    await rejects(fixture.stores.runs.stageRecoveryFence(call), /corrupt recovery physical counts/);
  } finally {
    await fixture.close();
  }
});

test('recovery fence closed journal refuses a fresh identity but retains exact replay', async () => {
  const fixture = await createPhysicalFixture(true);
  try {
    const snapshot = await fixture.stores.runs.readRuntimeScope(runtimeScope);
    if (snapshot.kind !== 'pinned' || snapshot.version !== 2)
      throw new Error('fixture scope missing');
    const history = snapshot.recoveries[0];
    const previous = history.fences[0];
    const call = await createRecoveryFenceCall(fixture.stores.artifacts, fixture.call, 2, previous);
    expect(
      await fixture.stores.runs.stageRecoveryFence({ ...call, input: { fence: previous } }),
    ).toEqual({ kind: 'duplicate', value: previous });
    Object.assign(call.guard, {
      expectedRevision: snapshot.revision,
      expectedRecoveryRevision: history.revision,
    });
    Object.assign(call.input.fence, { stagedRevision: history.revision + 1 });
    expect(await fixture.stores.runs.stageRecoveryFence(call)).toEqual({
      kind: 'refused',
      reason: 'state_conflict',
    });
  } finally {
    await fixture.close();
  }
});

test('recovery observation late marker abort rolls back exact predecessor and resumes after reopen', async () => {
  const fixture = await createPhysicalFixture(false);
  try {
    const staged = await createRecoveryFenceCall(fixture.stores.artifacts, fixture.call, 2);
    unwrapReply(await fixture.stores.runs.stageRecoveryFence(staged));
    const call = await createRecoveryObservationCall(fixture.stores.artifacts, staged);
    fixture.database.run(
      "CREATE TRIGGER observation_marker_abort BEFORE UPDATE ON run5_recovery_format WHEN NEW.observation_count=1 BEGIN SELECT RAISE(ABORT,'late observation marker injected'); END",
    );
    const before = captureRecovery(fixture.database);
    await rejects(
      fixture.stores.runs.recordRecoveryFence(call),
      /late observation marker injected/,
    );
    expect(captureRecovery(fixture.database)).toEqual(before);
    const reopened = await openSqliteStores(fixture.options);
    try {
      expect(await reopened.runs.readRuntimeScope(runtimeScope)).toMatchObject({
        recoveries: [{ revision: 1, observations: [] }],
      });
      fixture.database.run('DROP TRIGGER observation_marker_abort');
      const observed = unwrapReply(await reopened.runs.recordRecoveryFence(call));
      const persisted = await openSqliteStores(fixture.options);
      try {
        expect(await persisted.runs.recordRecoveryFence(call)).toEqual({
          kind: 'duplicate',
          value: observed,
        });
      } finally {
        await persisted.close();
      }
    } finally {
      await reopened.close();
    }
  } finally {
    await fixture.close();
  }
});

test('recovery observation complete audit precedes replay and decoding', async () => {
  const fixture = await createPhysicalFixture(false);
  try {
    const staged = await createRecoveryFenceCall(fixture.stores.artifacts, fixture.call, 2);
    unwrapReply(await fixture.stores.runs.stageRecoveryFence(staged));
    const call = await createRecoveryObservationCall(fixture.stores.artifacts, staged);
    unwrapReply(await fixture.stores.runs.recordRecoveryFence(call));
    fixture.database.run('UPDATE run5_recovery_format SET observation_count=2');
    await rejects(
      fixture.stores.runs.recordRecoveryFence(call),
      /corrupt recovery physical counts/,
    );
    Object.assign(call, { input: null });
    await rejects(
      fixture.stores.runs.recordRecoveryFence(call),
      /corrupt recovery physical counts/,
    );
  } finally {
    await fixture.close();
  }
});

test('recovery observation closed journal retains exact old replay', async () => {
  const fixture = await createPhysicalFixture(true);
  try {
    const snapshot = await fixture.stores.runs.readRuntimeScope(runtimeScope);
    if (snapshot.kind !== 'pinned' || snapshot.version !== 2)
      throw new Error('fixture scope missing');
    const observation = snapshot.recoveries[0].observations[0];
    const input =
      observation.kind === 'accepted'
        ? { kind: observation.kind, fence: observation.fence, reply: observation.reply }
        : { kind: observation.kind, fence: observation.fence, reply: observation.reply };
    const call = {
      kind: 'authority' as const,
      guard: fixture.call.guard,
      recoveryId: fixture.call.intent.recoveryId,
      input,
    };
    expect(await fixture.stores.runs.recordRecoveryFence(call)).toEqual({
      kind: 'duplicate',
      value: observation,
    });
    Object.assign(input.reply.body.value, { actorId: 'changed' });
    expect(await fixture.stores.runs.recordRecoveryFence(call)).toEqual({
      kind: 'refused',
      reason: 'identity_conflict',
    });
  } finally {
    await fixture.close();
  }
});

import { readRuntimeHistory } from '../runtime-history';

test('recovery observation coherent same-reference receipt rewrite passes raw audit but fails verified read', async () => {
  const fixture = await createPhysicalFixture(false);
  try {
    const staged = await createRecoveryFenceCall(fixture.stores.artifacts, fixture.call, 2);
    unwrapReply(await fixture.stores.runs.stageRecoveryFence(staged));
    const call = await createRecoveryObservationCall(fixture.stores.artifacts, staged);
    const observed = unwrapReply(await fixture.stores.runs.recordRecoveryFence(call));
    Object.assign(observed.reply.body.value, { actorId: 'forged' });
    fixture.database
      .query('UPDATE run5_recovery_observation SET record=?')
      .run(JSON.stringify(observed));
    expect(await fixture.stores.runs.readRuntimeScope(runtimeScope)).toMatchObject({
      recoveries: [{ observations: [observed] }],
    });
    const reopened = await openSqliteStores(fixture.options);
    try {
      await rejects(
        readRuntimeHistory(reopened.runs, reopened.artifacts, runtimeScope),
        /recovery value differs from actual artifact/,
      );
    } finally {
      await reopened.close();
    }
  } finally {
    await fixture.close();
  }
});

for (const field of ['actorId', 'body', 'observedRevision', 'fence'] as const)
  test('recovery observation reopen refuses missing retained field ' + field, async () => {
    const fixture = await createPhysicalFixture(false);
    try {
      const staged = await createRecoveryFenceCall(fixture.stores.artifacts, fixture.call, 2);
      unwrapReply(await fixture.stores.runs.stageRecoveryFence(staged));
      const call = await createRecoveryObservationCall(fixture.stores.artifacts, staged);
      const observed = unwrapReply(await fixture.stores.runs.recordRecoveryFence(call));
      if (field === 'actorId') Reflect.deleteProperty(observed.reply.body.value, field);
      else if (field === 'body') Reflect.deleteProperty(observed.reply.envelope.value, field);
      else Reflect.deleteProperty(observed, field);
      fixture.database
        .query('UPDATE run5_recovery_observation SET record=?')
        .run(JSON.stringify(observed));
      await rejects(fixture.stores.runs.readRuntimeScope(runtimeScope));
      await rejects(fixture.stores.runs.recordRecoveryFence(call));
      await rejects(openSqliteStores(fixture.options));
    } finally {
      await fixture.close();
    }
  });

for (const part of ['envelope', 'body'] as const)
  test(
    'recovery observation verified history rejects actual absent ' + part + ' bytes',
    async () => {
      const fixture = await createPhysicalFixture(false);
      try {
        const staged = await createRecoveryFenceCall(fixture.stores.artifacts, fixture.call, 2);
        unwrapReply(await fixture.stores.runs.stageRecoveryFence(staged));
        const call = await createRecoveryObservationCall(fixture.stores.artifacts, staged);
        const observed = unwrapReply(await fixture.stores.runs.recordRecoveryFence(call));
        fixture.database
          .query('DELETE FROM run_artifact WHERE digest=?')
          .run(observed.reply[part].artifact.digest);
        expect(await fixture.stores.runs.readRuntimeScope(runtimeScope)).toMatchObject({
          recoveries: [{ observations: [observed] }],
        });
        await rejects(
          readRuntimeHistory(fixture.stores.runs, fixture.stores.artifacts, runtimeScope),
          /artifact does not exist/,
        );
      } finally {
        await fixture.close();
      }
    },
  );

import { stageClaimRequest } from '../claim-history';
import { executionCommandId } from '../record-codecs';
import type { RecoveryBeginCall } from '../recovery-records';
import { prepareSession, retainClaimReceipt } from '../testing/fixtures';
import { createRecoveryResolveCall } from '../testing/recovery-contract';

/** Uses only public semantic producers; raw SQL is reserved for injected faults and observation. */
async function createClosureFixture(family: 'authority' | 'claim', accepted = true) {
  if (family === 'authority') {
    const fixture = await createPhysicalFixture(false);
    return await constructFixture(async () => {
      const resolve = await createRecoveryResolveCall(fixture.stores, fixture.call, accepted);
      return { ...fixture, resolve };
    }, [() => fixture.close()]);
  }
  const directory = mkdtempSync(join(tmpdir(), 'closure-claim-'));
  const options = {
    path: join(directory, 'runs.sqlite'),
    organizationId: organizationId('organization'),
    capacity: 1,
    leaseMilliseconds: 100,
    clock: new FixtureClock(),
    maxBusyAttempts: 2,
    busyDelayMilliseconds: 1,
  };
  const { stores, database, close } = await createRecoveryInspection(directory, options);
  return await constructFixture(async () => {
    const setup = await prepareSession({ ...stores, clock: options.clock });
    const staged = unwrapReply(
      await stageClaimRequest(stores.runs, stores.artifacts, await setup.scopedGuard(), {
        commandId: executionCommandId('stage-claim'),
        canonicalRequest: setup.canonicalRequest,
        stateEvidence: setup.preparationInput.stateEvidence,
      }),
    );
    const call: RecoveryBeginCall = {
      kind: 'claim',
      guard: { ...(await setup.scopedGuard()), expectedRecoveryRevision: 0 },
      intent: {
        version: 1,
        recoveryId: 'recover-claim',
        target: {
          kind: 'claim',
          original: staged.intent,
          runId: setup.run.runId,
          attemptId: setup.admission.attemptId,
          stageCommandId: 'stage-claim',
          acceptanceCommandId: 'accept-claim',
        },
        begunScopeRevision: staged.intent.stagedRevision,
        resolver: setup.owner,
      },
    };
    unwrapReply(await stores.runs.beginRecovery(call));
    const resolve = await createRecoveryResolveCall(
      stores,
      call,
      accepted,
      await retainClaimReceipt(setup, staged.intent),
    );
    return { stores, database, options, call, resolve, close };
  }, [close]);
}

function captureClosure(database: Database) {
  return {
    rows: captureRecovery(database),
    schema: database.query('SELECT * FROM sqlite_schema ORDER BY name').all(),
    temporary: database.query('SELECT * FROM sqlite_temp_schema ORDER BY name').all(),
  };
}

for (const family of ['authority', 'claim'] as const)
  for (const cut of ['acceptance', 'finalization'] as const)
    test('recovery closure late rollback exact predecessor ' + family + ' ' + cut, async () => {
      const fixture = await createClosureFixture(family);
      try {
        const commandId = fixture.call.intent.target.original.commandId;
        const beforeTrigger = captureClosure(fixture.database);
        const acceptance =
          "EXISTS(SELECT 1 FROM run5_runtime_acceptance WHERE command_id='" +
          encodeKey(commandId).replaceAll("'", "''") +
          "')";
        const execution =
          family === 'claim'
            ? ' AND EXISTS(SELECT 1 FROM run5_execution WHERE command_id=\'"accept-claim"\')'
            : '';
        const hold =
          family === 'claim'
            ? " AND EXISTS(SELECT 1 FROM run5_attempt WHERE json_extract(record,'$.version')=3 AND json_extract(record,'$.holdsCapacity')=1) AND (SELECT count(*) FROM run5_reservation)=1"
            : '';
        fixture.database.run(
          cut === 'acceptance'
            ? 'CREATE TRIGGER closure_abort BEFORE INSERT ON run5_recovery_closure WHEN ' +
                acceptance +
                execution +
                " BEGIN SELECT RAISE(ABORT,'late closure acceptance injected'); END"
            : 'CREATE TRIGGER closure_abort BEFORE UPDATE ON run5_recovery_journal WHEN ' +
                acceptance +
                execution +
                hold +
                " AND EXISTS(SELECT 1 FROM run5_recovery_closure) AND EXISTS(SELECT 1 FROM run5_recovery_barrier) AND EXISTS(SELECT 1 FROM run5_recovery_active) AND (SELECT closure_count FROM run5_recovery_format)=0 BEGIN SELECT RAISE(ABORT,'late closure finalization injected'); END",
        );
        const before = captureClosure(fixture.database);
        await rejects(
          fixture.stores.runs.resolveRecovery(fixture.resolve),
          new RegExp('late closure ' + cut + ' injected'),
        );
        expect(captureClosure(fixture.database)).toEqual(before);
        const reopened = await openSqliteStores(fixture.options);
        try {
          expect(await reopened.runs.readRuntimeScope(runtimeScope)).toMatchObject({
            activeRecoveryId: fixture.call.intent.recoveryId,
            recoveries: [{ revision: 2, closure: null }],
          });
          expect(captureClosure(fixture.database)).toEqual(before);
          fixture.database.run('DROP TRIGGER closure_abort');
          expect(captureClosure(fixture.database)).toEqual(beforeTrigger);
          const closed = unwrapReply(await reopened.runs.resolveRecovery(fixture.resolve));
          expect(await reopened.runs.resolveRecovery(fixture.resolve)).toEqual({
            kind: 'duplicate',
            value: closed,
          });
          const persisted = await openSqliteStores(fixture.options);
          try {
            expect(await persisted.runs.resolveRecovery(fixture.resolve)).toEqual({
              kind: 'duplicate',
              value: closed,
            });
          } finally {
            await persisted.close();
          }
          const used = captureClosure(fixture.database);
          await rejects(downgradeUnusedSqliteIdentityKeys(fixture.options), (cause: unknown) => {
            expect(cause).toMatchObject({ failure: 'used_history' });
            return true;
          });
          expect(captureClosure(fixture.database)).toEqual(used);
        } finally {
          await reopened.close();
        }
      } finally {
        await fixture.close();
      }
    });

test('recovery closure application performs no history reads between its first write and commit', async () => {
  const fixture = await createClosureFixture('claim');
  // eslint-disable-next-line @typescript-eslint/unbound-method -- Restore native functions and preserve each original receiver.
  const query = Database.prototype.query;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- Restore native functions and preserve each original receiver.
  const run = Database.prototype.run;
  let applying = false;
  let marking = false;
  function inspectStatement(sql: string) {
    if (sql.startsWith('INSERT INTO run5_runtime_acceptance')) applying = true;
    if (!applying) return;
    if (sql === 'UPDATE run5_usage SET used=1 WHERE singleton=1 AND used IN (0,1)') {
      marking = true;
      return;
    }
    // Proof: Task3 064 inserted early usage UPDATE/readback between real closure writes; the next semantic write failed this oracle.
    if (
      marking &&
      /^(INSERT|UPDATE|DELETE|REPLACE)/i.test(sql) &&
      sql !== 'UPDATE run_meta SET last_observed_at=? WHERE singleton=1'
    )
      throw new Error('semantic write after usage finalization');
    // Proof: Task3 063 inserted a raw history-table SELECT between real writes; this oracle rejected it without relying on an independent history audit.
    if (/^SELECT/i.test(sql) && !(marking && sql === 'SELECT * FROM run5_usage'))
      throw new Error('history read during partial closure publication');
  }
  try {
    Database.prototype.query = function (this: Database, sql: string) {
      inspectStatement(sql);
      return query.call(this, sql);
    } as typeof Database.prototype.query;
    Database.prototype.run = function (sql, ...parameters) {
      inspectStatement(sql);
      const changed = run.call(this, sql, ...parameters);
      if (sql === 'COMMIT') applying = false;
      return changed;
    };
    const closed = unwrapReply(await fixture.stores.runs.resolveRecovery(fixture.resolve));
    expect(closed.attemptReply).toMatchObject({ version: 3, holdsCapacity: true });
    expect(marking).toBe(true);
  } finally {
    Database.prototype.query = query;
    Database.prototype.run = run;
    await fixture.close();
  }
});

test('recovery closure complete audit precedes malformed input and immutable replay', async () => {
  const fixture = await createClosureFixture('claim');
  try {
    unwrapReply(await fixture.stores.runs.resolveRecovery(fixture.resolve));
    fixture.database.run('UPDATE run5_recovery_format SET closure_count=2');
    await rejects(
      fixture.stores.runs.resolveRecovery(fixture.resolve),
      /corrupt recovery physical counts/,
    );
    Object.assign(fixture.resolve, { decision: null });
    await rejects(
      fixture.stores.runs.resolveRecovery(fixture.resolve),
      /corrupt recovery physical counts/,
    );
  } finally {
    await fixture.close();
  }
});

for (const rollbackFault of [false, true])
  test(
    'recovery closure commit and rollback faults preserve original causes rollbackFault=' +
      String(rollbackFault),
    async () => {
      const fixture = await createClosureFixture('claim');
      // eslint-disable-next-line @typescript-eslint/unbound-method -- Exact native method restored below; receiver preserved for rollback cleanup.
      const nativeRun = Database.prototype.run;
      const commitFailure = new Error('closure commit dependency failed');
      const rollbackFailure = new Error('closure rollback dependency failed');
      const connections = new Set<Database>();
      const before = captureClosure(fixture.database);
      try {
        Database.prototype.run = function (...parameters: Parameters<Database['run']>) {
          if (parameters[0] === 'COMMIT') {
            connections.add(this);
            throw commitFailure;
          }
          if (parameters[0] === 'ROLLBACK' && rollbackFault) throw rollbackFailure;
          return nativeRun.apply(this, parameters);
        };
        await rejects(fixture.stores.runs.resolveRecovery(fixture.resolve), (cause: unknown) => {
          if (rollbackFault) {
            expect(cause).toBeInstanceOf(AggregateError);
            if (!(cause instanceof AggregateError)) throw new Error('missing rollback aggregate');
            expect(cause.errors).toEqual([commitFailure, rollbackFailure]);
            expect(cause.cause).toBe(rollbackFailure);
          } else expect(cause).toBe(commitFailure);
          return true;
        });
        // An independent connection never sees uncommitted consequences, even while rollback is broken.
        expect(captureClosure(fixture.database)).toEqual(before);
      } finally {
        Database.prototype.run = nativeRun;
        for (const connection of connections)
          if (connection.inTransaction) nativeRun.call(connection, 'ROLLBACK');
      }
      try {
        const reopened = await openSqliteStores(fixture.options);
        try {
          expect(captureClosure(fixture.database)).toEqual(before);
          expect(await reopened.runs.resolveRecovery(fixture.resolve)).toMatchObject({
            kind: 'applied',
          });
        } finally {
          await reopened.close();
        }
      } finally {
        await fixture.close();
      }
    },
  );

for (const family of ['authority', 'claim'] as const)
  test('recovery closure competing connections publish once ' + family, async () => {
    const fixture = await createClosureFixture(family);
    const competitor = await openSqliteStores(fixture.options);
    try {
      const replies = await Promise.all([
        fixture.stores.runs.resolveRecovery(fixture.resolve),
        competitor.runs.resolveRecovery(fixture.resolve),
      ]);
      expect(replies.map((reply) => reply.kind).sort()).toEqual(['applied', 'duplicate']);
      expect(unwrapReply(replies[0])).toEqual(unwrapReply(replies[1]));
      expect(
        fixture.database
          .query('SELECT closure_count,barrier_count,active_count FROM run5_recovery_format')
          .get(),
      ).toEqual({ closure_count: 1, barrier_count: 1, active_count: 0 });
    } finally {
      await competitor.close();
      await fixture.close();
    }
  });

for (const fault of ['stage', 'session', 'fence_epoch', 'resolver_epoch'] as const)
  test('recovery closure complete predecessor refuses retained ' + fault, async () => {
    const fixture = await createClosureFixture('claim');
    try {
      if (fault === 'stage' || fault === 'resolver_epoch') {
        fixture.database.run(
          fault === 'stage'
            ? "UPDATE run5_recovery_journal SET record=json_set(record,'$.target.stageCommandId','missing-stage')"
            : "UPDATE run5_recovery_journal SET record=json_set(record,'$.resolver.epoch',2)",
        );
      } else if (fault === 'session') {
        fixture.database.run(
          "UPDATE run5_attempt SET record=json_set(record,'$.state.session.attachment.owner.epoch',2)",
        );
      } else {
        fixture.database.run(
          "UPDATE run5_recovery_fence SET record=json_set(record,'$.owner.epoch',2)",
        );
      }
      const corrupted = captureClosure(fixture.database);
      await rejects(fixture.stores.runs.resolveRecovery(fixture.resolve));
      expect(captureClosure(fixture.database)).toEqual(corrupted);
      await rejects(openSqliteStores(fixture.options));
      expect(captureClosure(fixture.database)).toEqual(corrupted);
    } finally {
      await fixture.close();
    }
  });
