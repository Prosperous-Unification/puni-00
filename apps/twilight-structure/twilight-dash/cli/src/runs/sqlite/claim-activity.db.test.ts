import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { createRuntimeClient } from '../../bridge/runtime-client';
import { claimActivity } from '../claim-activity';
import { readExecutionHistory } from '../claim-history';
import { organizationId } from '../record-codecs';
import {
  claimDispatchBytes,
  claimDispatchContract,
  claimDispatchFixture,
} from '../testing/claim-dispatch-contract';
import { FixtureClock } from '../testing/fixtures';
import { bootstrapSqliteStores, openSqliteStores } from './open-stores';

claimDispatchContract('sqlite claim dispatch', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'claim-dispatch-'));
  const clock = new FixtureClock();
  try {
    const connection = await bootstrapSqliteStores({
      path: join(directory, 'runs.sqlite'),
      organizationId: organizationId('organization'),
      capacity: 2,
      leaseMilliseconds: 100,
      clock,
      maxBusyAttempts: 20,
      busyDelayMilliseconds: 1,
    });
    return {
      ...connection,
      clock,
      close() {
        connection.close();
        rmSync(directory, { recursive: true, force: true });
      },
    };
  } catch (cause) {
    rmSync(directory, { recursive: true, force: true });
    throw cause;
  }
});

test('SQLite close/reopen retains exact pending claim and reconciles only with explicit current revisions', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'claim-dispatch-reopen-'));
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
  const connection = await bootstrapSqliteStores(options);
  let reopened: Awaited<ReturnType<typeof openSqliteStores>> | undefined;
  try {
    const setup = await claimDispatchFixture({ ...connection, clock });
    let committed: string | undefined;
    const sent: string[] = [];
    const client = createRuntimeClient(async (shape) => {
      sent.push(shape.operationId);
      if (shape.operationId === 'applyRuntimeCommands') {
        committed = await claimDispatchBytes(setup);
        throw new Error('lost response after simulated receiver commit');
      }
      if (committed === undefined) throw new Error('receipt missing');
      return new Response(committed);
    });
    const first = await claimActivity(
      connection.runs,
      connection.artifacts,
      client,
      setup.guard,
      setup.input,
      new AbortController().signal,
    );
    expect(first.kind).toBe('pending');
    const before = await connection.runs.readExecutionHistory(
      setup.run.runId,
      setup.attempt.attemptId,
    );
    const scope = await connection.runs.readRuntimeScope(setup.scope);
    if (scope.kind !== 'pinned') throw new Error('scope missing');
    const current = {
      ...setup.guard,
      expectedRevision: before.run.revision,
      expectedAttemptRevision: before.attempt.revision,
      expectedScopeRevision: scope.revision,
    };
    connection.close();
    reopened = await openSqliteStores(options);
    expect(
      await reopened.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId),
    ).toEqual(before);
    expect(
      await claimActivity(
        reopened.runs,
        reopened.artifacts,
        client,
        setup.guard,
        setup.input,
        new AbortController().signal,
      ),
    ).toMatchObject({
      kind: 'pending',
      observation: { kind: 'local_refused', reason: 'revision_conflict' },
    });
    const reply = await claimActivity(
      reopened.runs,
      reopened.artifacts,
      client,
      current,
      setup.input,
      new AbortController().signal,
    );
    expect(reply.kind).toBe('accepted');
    expect(sent).toEqual(['applyRuntimeCommands', 'lookupRuntimeReceipt', 'lookupRuntimeReceipt']);
    const history = await readExecutionHistory(
      reopened.runs,
      reopened.artifacts,
      setup.run.runId,
      setup.attempt.attemptId,
    );
    expect(history.attempt.state.kind).toBe('ready');
    expect(history.attempt.holdsCapacity).toBe(true);
    expect(history.completion).toBeNull();
    // Close/reopen checks persisted provider state; it does not simulate process-kill, power loss, receiver authenticity or physical fencing.
  } finally {
    reopened?.close();
    connection.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
