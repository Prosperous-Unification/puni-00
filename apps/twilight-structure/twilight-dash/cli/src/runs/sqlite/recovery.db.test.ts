import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { organizationId } from '../record-codecs';
import { FixtureClock } from '../testing/fixtures';
import { recoveryContract } from '../testing/recovery-contract';
import { bootstrapSqliteStores } from './open-stores';

recoveryContract('sqlite recovery', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'recovery-'));
  const clock = new FixtureClock();
  const stores = await bootstrapSqliteStores({
    path: join(directory, 'runs.sqlite'),
    organizationId: organizationId('organization'),
    capacity: 1,
    leaseMilliseconds: 100,
    clock,
    maxBusyAttempts: 20,
    busyDelayMilliseconds: 1,
  });
  return {
    ...stores,
    clock,
    async close() {
      await stores.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
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

async function createPhysicalFixture(closed: boolean) {
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
  let stores: Awaited<ReturnType<typeof bootstrapSqliteStores>> | undefined;
  let database: Database | undefined;
  try {
    stores = await bootstrapSqliteStores(options);
    database = new Database(options.path);
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
        .query('INSERT INTO run_recovery_fence VALUES (?,?,?,?,?)')
        .run('recover', 1, 'fence', 1, JSON.stringify(fence));
      database
        .query('INSERT INTO run_recovery_observation VALUES (?,?,?,?)')
        .run('recover', 1, 2, JSON.stringify(observation));
      database
        .query('INSERT INTO run_recovery_closure VALUES (?,?,?)')
        .run('recover', 3, JSON.stringify(history.closure));
      database
        .query('INSERT INTO run_recovery_barrier VALUES (?,?,?,?)')
        .run(scopeKey, 2, 'recover', JSON.stringify(barrier));
      database.run('UPDATE run_recovery_journal SET revision=3');
      database.run('DELETE FROM run_recovery_active');
      database.run(
        'UPDATE run_recovery_format SET fence_count=1,observation_count=1,closure_count=1,barrier_count=1,active_count=0',
      );
      database.run('UPDATE run_runtime_scope SET revision=2');
      database.run('COMMIT');
      expect(await stores.runs.readRuntimeScope(runtimeScope)).toMatchObject({
        revision: 2,
        pendingCommandId: null,
        activeRecoveryId: null,
        generationFloor: 2,
        recoveries: [history],
      });
    }
    return {
      stores,
      database,
      options,
      call,
      async close() {
        try {
          database?.close();
        } finally {
          try {
            await stores?.close();
          } finally {
            rmSync(directory, { recursive: true, force: true });
          }
        }
      },
    };
  } catch (cause) {
    try {
      database?.close();
    } finally {
      try {
        await stores?.close();
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }
    throw cause;
  }
}

test('complete closed recovery reopens and refuses unused down while preserving all evidence', async () => {
  const fixture = await createPhysicalFixture(true);
  try {
    const before = captureRecovery(fixture.database);
    const reopened = await openSqliteStores(fixture.options);
    try {
      expect(await reopened.runs.readRuntimeScope(runtimeScope)).toMatchObject({
        activeRecoveryId: null,
        recoveries: [{ revision: 3, closure: { scopeAfter: 2 } }],
      });
    } finally {
      await reopened.close();
    }
    await rejects(downgradeUnusedSqliteStores(fixture.options), (cause: unknown) => {
      expect(cause).toMatchObject({ failure: 'used_history', phase: 'transaction' });
      return true;
    });
    expect(captureRecovery(fixture.database)).toEqual(before);
  } finally {
    await fixture.close();
  }
});

for (const [fault, sql, closed] of [
  ['missing marker', 'DELETE FROM run_recovery_format', false],
  [
    'extra marker',
    'PRAGMA ignore_check_constraints=ON; INSERT INTO run_recovery_format VALUES (2,1,0,0,0,0,1)',
    false,
  ],
  ['journal count', 'UPDATE run_recovery_format SET journal_count=2', false],
  ['journal command key', "UPDATE run_recovery_journal SET command_id='wrong'", false],
  ['journal scope key', "UPDATE run_recovery_journal SET scope_key='wrong'", false],
  ['active key', "UPDATE run_recovery_active SET scope_key='wrong'", false],
  ['active journal', "UPDATE run_recovery_active SET recovery_id='wrong'", false],
  ['lost journal family', 'DELETE FROM run_recovery_journal', false],
  ['lost active family', 'DELETE FROM run_recovery_active', false],
  ['lost fence family', 'DELETE FROM run_recovery_fence', true],
  ['lost observation family', 'DELETE FROM run_recovery_observation', true],
  ['lost closure family', 'DELETE FROM run_recovery_closure', true],
  ['lost barrier family', 'DELETE FROM run_recovery_barrier', true],
  ['fence command key', "UPDATE run_recovery_fence SET command_id='wrong'", true],
  ['fence ordinal', 'UPDATE run_recovery_fence SET ordinal=2', true],
  ['observation ordinal', 'UPDATE run_recovery_observation SET ordinal=2', true],
  ['closure revision', 'UPDATE run_recovery_closure SET revision=4', true],
  ['barrier scope key', "UPDATE run_recovery_barrier SET scope_key='wrong'", true],
  ['barrier scope revision', 'UPDATE run_recovery_barrier SET scope_after=3', true],
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
    fixture.database.run('DELETE FROM run_recovery_active');
    fixture.database.run('DELETE FROM run_recovery_journal');
    fixture.database.run('UPDATE run_recovery_format SET journal_count=0,active_count=0');
    fixture.database.run(
      "CREATE TRIGGER begin_marker_abort BEFORE UPDATE ON run_recovery_format WHEN (SELECT count(*) FROM run_recovery_journal)=1 AND (SELECT count(*) FROM run_recovery_active)=1 BEGIN SELECT RAISE(ABORT,'late begin marker injected'); END",
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
  const fixture = await createPhysicalFixture(true);
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

test('complete accepted claim hold reopens preserves old acknowledgements and refuses unused down', async () => {
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
  let stores: Awaited<ReturnType<typeof bootstrapSqliteStores>> | undefined;
  let database: Database | undefined;
  try {
    stores = await bootstrapSqliteStores(options);
    database = new Database(options.path);
    const setup = await prepareClaimed({ ...stores, clock: options.clock });
    const execution = await stores.runs.readExecutionHistory(
      setup.run.runId,
      setup.admission.attemptId,
    );
    const accepted = execution.executions.find((entry) => entry.command.kind === 'accept_claim');
    if (accepted?.command.kind !== 'accept_claim')
      throw new Error('missing accepted claim fixture');
    const acknowledgements = database.query('SELECT * FROM run_execution ORDER BY rowid').all();
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
      .query('INSERT INTO run_recovery_journal VALUES (?,?,?,?,?)')
      .run(recoveryId, original.commandId, scopeKey, 3, JSON.stringify(history.intent));
    database
      .query('INSERT INTO run_recovery_fence VALUES (?,?,?,?,?)')
      .run(recoveryId, 1, 'held-fence', 1, JSON.stringify(fence));
    database
      .query('INSERT INTO run_recovery_observation VALUES (?,?,?,?)')
      .run(recoveryId, 1, 2, JSON.stringify(observation));
    database
      .query('INSERT INTO run_recovery_closure VALUES (?,?,?)')
      .run(recoveryId, 3, JSON.stringify(history.closure));
    database
      .query('INSERT INTO run_recovery_barrier VALUES (?,?,?,?)')
      .run(scopeKey, 5, recoveryId, JSON.stringify(barrier));
    database.run(
      'UPDATE run_recovery_format SET journal_count=1,fence_count=1,observation_count=1,closure_count=1,barrier_count=1,active_count=0',
    );
    database
      .query('UPDATE run_attempt SET record=? WHERE attempt_id=?')
      .run(JSON.stringify(held), held.attemptId);
    database
      .query('UPDATE run_record SET record=? WHERE run_id=?')
      .run(
        JSON.stringify({ ...execution.run, revision: execution.run.revision + 1 }),
        setup.run.runId,
      );
    database.run('UPDATE run_runtime_scope SET revision=5');
    database.run('COMMIT');
    expect(await stores.runs.readRun(setup.run.runId)).toMatchObject({
      version: 3,
      attempts: [held],
      capacity: { reserved: 1 },
    });
    expect(database.query('SELECT * FROM run_execution ORDER BY rowid').all()).toEqual(
      acknowledgements,
    );
    const before = captureRecovery(database);
    const reopened = await openSqliteStores(options);
    try {
      expect(
        (await reopened.runs.readExecutionHistory(setup.run.runId, held.attemptId)).attempt,
      ).toEqual(held);
    } finally {
      await reopened.close();
    }
    await rejects(downgradeUnusedSqliteStores(options), (cause: unknown) => {
      expect(cause).toMatchObject({ failure: 'used_history', phase: 'transaction' });
      return true;
    });
    expect(captureRecovery(database)).toEqual(before);
  } finally {
    try {
      database?.close();
    } finally {
      try {
        await stores?.close();
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  }
});
