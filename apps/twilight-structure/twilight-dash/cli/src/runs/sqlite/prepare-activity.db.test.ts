import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { prepareActivity } from '../prepare-activity';
import { executionCommandId, organizationId } from '../record-codecs';
import { admitExecution, FixtureClock } from '../testing/fixtures';
import {
  controlledExecutor,
  preparationDispatchContract,
} from '../testing/preparation-dispatch-contract';
import { bootstrapSqliteStores, openSqliteStores } from './open-stores';

async function create() {
  const directory = mkdtempSync(join(tmpdir(), 'preparation-dispatch-'));
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
    const connection = await bootstrapSqliteStores(options);
    return {
      ...connection,
      connection,
      clock,
      options,
      directory,
      close() {
        connection.close();
        rmSync(directory, { recursive: true, force: true });
      },
    };
  } catch (cause) {
    rmSync(directory, { recursive: true, force: true });
    throw cause;
  }
}
preparationDispatchContract('sqlite preparation dispatch', create);

for (const checkpoint of ['preparing', 'prepared'] as const)
  test(
    'sqlite close/reopen retains ' +
      checkpoint +
      ' and exact replay never reconstructs a live session',
    async () => {
      const stores = await create();
      let reopened: Awaited<ReturnType<typeof openSqliteStores>> | undefined;
      try {
        const setup = await admitExecution(stores);
        const guard = await setup.currentGuard();
        const input = {
          preparation: setup.preparationInput,
          openedCommandId: executionCommandId('opened'),
        };
        const original = { locator: setup.locator, private: Symbol('opaque') };
        let opens = 0;
        const executor = controlledExecutor(() => {
          opens += 1;
          return Promise.resolve(
            checkpoint === 'preparing'
              ? {
                  kind: 'unresolved',
                  preparation: setup.preparationInput.preparation,
                  reason: 'unsupported',
                }
              : { kind: 'opened', session: original },
          );
        });
        const first = await prepareActivity(
          stores.runs,
          stores.artifacts,
          executor,
          guard,
          input,
          new AbortController().signal,
        );
        expect(first.kind).toBe(checkpoint === 'preparing' ? 'pending' : 'prepared');
        stores.connection.close();
        reopened = await openSqliteStores(stores.options);
        const history = await reopened.runs.readExecutionHistory(
          setup.run.runId,
          setup.attempt.attemptId,
        );
        expect(history.attempt).toMatchObject({ state: { kind: checkpoint }, holdsCapacity: true });
        expect(history.executions).toHaveLength(checkpoint === 'preparing' ? 1 : 2);
        const replay = await prepareActivity(
          reopened.runs,
          reopened.artifacts,
          executor,
          guard,
          input,
          new AbortController().signal,
        );
        expect(replay).toMatchObject({
          kind: 'pending',
          reason: 'preparation_already_recorded',
          attempt: { revision: 1, state: { kind: 'preparing' } },
        });
        expect('session' in replay).toBe(false);
        expect(opens).toBe(1);
        expect((await reopened.runs.readRun(setup.run.runId)).capacity.reserved).toBe(1);
      } finally {
        reopened?.close();
        stores.close();
      }
    },
  );
