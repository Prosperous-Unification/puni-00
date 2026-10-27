import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { dispatchTurn } from '../dispatch-turn';
import { organizationId } from '../record-codecs';
import { FixtureClock } from '../testing/fixtures';
import { turnDispatchContract, turnDispatchFixture } from '../testing/turn-dispatch-contract';
import { bootstrapSqliteStores, openSqliteStores } from './open-stores';
turnDispatchContract('sqlite turn dispatch', async () => {
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

test('second SQLite reader sees durable turn intent before executor entry and exact reopened observation', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'turn-dispatch-reader-'));
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
  const writer = await bootstrapSqliteStores(options);
  let reader: Awaited<ReturnType<typeof openSqliteStores>> | undefined;
  try {
    const setup = await turnDispatchFixture({ ...writer, clock });
    reader = await openSqliteStores(options);
    const observer = reader;
    const turn = setup.executor.turn.bind(setup.executor);
    setup.executor.turn = async (...args) => {
      const history = await observer.runs.readExecutionHistory(
        setup.run.runId,
        setup.attempt.attemptId,
      );
      expect(history.attempt.state).toMatchObject({
        kind: 'turn_pending',
        turn: { request: { turnKey: 'turn' }, locator: setup.locator },
      });
      expect(history.run.revision).toBe(setup.guard.expectedRevision + 1);
      expect(history.attempt.revision).toBe(setup.guard.expectedAttemptRevision + 1);
      expect(await observer.runs.readRuntimeScope(setup.scope)).toMatchObject({
        revision: setup.guard.expectedScopeRevision,
        pendingCommandId: null,
      });
      return await turn(...args);
    };
    const reply = await dispatchTurn(
      setup.runs,
      setup.artifacts,
      setup.runtime,
      setup.claims,
      setup.executor,
      setup.session,
      setup.guard,
      setup.input,
      setup.control,
    );
    expect(reply.kind).toBe('observed');
    if (reply.kind !== 'observed') throw new Error('observed turn missing');
    reader.close();
    reader = await openSqliteStores(options);
    expect(
      (await reader.runs.readExecutionHistory(setup.run.runId, setup.attempt.attemptId)).attempt,
    ).toEqual(reply.attempt);
  } finally {
    reader?.close();
    writer.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
