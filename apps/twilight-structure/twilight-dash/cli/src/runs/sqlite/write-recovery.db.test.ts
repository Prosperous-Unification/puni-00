import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FixtureClock } from '../testing/fixtures';
import { writeRecoveryContract } from '../testing/write-recovery-contract';
import { organizationId } from '../value-codecs';
import { bootstrapSqliteStores } from './open-stores';
writeRecoveryContract('sqlite write recovery', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'write-recovery-'));
  console.log('Task3 recovery DB root ' + directory);
  const clock = new FixtureClock();
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
    async close() {
      await connection.close();
      rmSync(directory, { recursive: true });
      console.log('Task3 recovery closed and removed ' + directory);
    },
  };
});

import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';

import { dispatchRecovery } from '../dispatch-recovery';
import type { RecoveryResolveCall } from '../recovery-records';
import type { RunStore } from '../run-store';
import { settleFixture } from '../testing/construct-fixture';
import { unwrapReply } from '../testing/fixtures';
import { writeDispatchFixture } from '../testing/write-dispatch-contract';
import { createWriteRecoveryClient } from '../testing/write-recovery-contract';
import { stageWriteRequest } from '../write-history';
import { openSqliteStores } from './open-stores';

for (const ignored of [false, true])
  test(
    ignored
      ? 'ignored obligation UPDATE aborts actual nonacceptance and reopens the exact pending bundle'
      : 'nonaccepted recovery publishes its obligation and closure together',
    async () => {
      const directory = mkdtempSync(join(tmpdir(), 'write-nonacceptance-'));
      console.log('Task3 fix1 nonacceptance DB root ' + directory);
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
      let stores = await bootstrapSqliteStores(options);
      const inspection = new Database(options.path);
      try {
        const setup = await writeDispatchFixture({ ...stores, clock });
        const { acceptanceCommandId, ...input } = setup.input;
        const stage = unwrapReply(
          await stageWriteRequest(stores.runs, stores.artifacts, setup.guard, input),
        );
        const guard = { ...(await setup.currentGuard()), expectedRecoveryRevision: 0 };
        const recoveryId = 'ignored-obligation-update';
        unwrapReply(
          await stores.runs.beginRecovery({
            kind: 'write',
            guard,
            intent: {
              version: 2,
              recoveryId,
              target: {
                kind: 'write',
                original: stage.intent,
                runId: guard.runId,
                attemptId: guard.attemptId,
                stageCommandId: input.commandId,
                acceptanceCommandId,
              },
              begunScopeRevision: stage.intent.stagedRevision,
              resolver: { ownerId: guard.ownership.ownerId, epoch: guard.ownership.epoch },
            },
          }),
        );
        const capturePuni = () =>
          inspection
            .query<{ name: string }, []>(
              "SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE 'run_%' ORDER BY name",
            )
            .all()
            .map(({ name }) => ({
              name,
              rows: inspection
                .query('SELECT * FROM "' + name.replaceAll('"', '""') + '"')
                .all()
                .map((row) => JSON.stringify(row))
                .sort(),
            }));
        const readVisible = async (runs: RunStore) => ({
          run: await runs.readRun(guard.runId),
          history: await runs.readExecutionHistory(guard.runId, guard.attemptId),
          scope: await runs.readRuntimeScope(setup.scope),
        });
        let before:
          | {
              physical: ReturnType<typeof capturePuni>;
              visible: Awaited<ReturnType<typeof readVisible>>;
            }
          | undefined;
        let submitted: RecoveryResolveCall | undefined;
        let resolution:
          | { kind: 'returned'; value: Awaited<ReturnType<RunStore['resolveRecovery']>> }
          | { kind: 'thrown'; cause: unknown }
          | undefined;
        const runs: RunStore = {
          ...stores.runs,
          async resolveRecovery(call) {
            if (submitted !== undefined) throw Error('resolution unexpectedly repeated');
            if (call.kind !== 'write' || call.decision.kind !== 'fenced_nonaccepted')
              throw Error('actual nonacceptance decision missing');
            submitted = structuredClone(call);
            const visible = await readVisible(stores.runs);
            before = { visible, physical: capturePuni() };
            if (ignored)
              inspection.run(
                'CREATE TRIGGER task3_ignore_obligation_update BEFORE UPDATE ON run6_write_obligation BEGIN SELECT RAISE(IGNORE); END',
              );
            return await stores.runs.resolveRecovery(call).then(
              (value) => {
                resolution = { kind: 'returned', value };
                return value;
              },
              (cause: unknown) => {
                resolution = { kind: 'thrown', cause };
                throw cause;
              },
            );
          },
        };
        const trace: string[] = [];
        const dispatch = await dispatchRecovery(
          runs,
          stores.artifacts,
          createWriteRecoveryClient(setup, stage.intent, false, trace, false),
          { kind: 'write', guard, recoveryId },
          new AbortController().signal,
        ).then(
          (value) => ({ kind: 'returned' as const, value }),
          (cause: unknown) => ({ kind: 'thrown' as const, cause }),
        );
        if (before === undefined || submitted === undefined || resolution === undefined)
          throw Error('real resolution publication was not reached');
        const after = capturePuni();
        console.log(
          'Task3 fix1 ignored obligation UPDATE ' +
            JSON.stringify({
              ignored,
              resolution:
                resolution.kind === 'returned'
                  ? resolution
                  : { kind: 'thrown', cause: String(resolution.cause) },
              dispatch:
                dispatch.kind === 'returned'
                  ? dispatch
                  : { kind: 'thrown', cause: String(dispatch.cause) },
              before: before.physical,
              after,
            }),
        );
        expect(trace).toEqual([
          'readRuntimeState',
          'acquireRuntimeAuthority',
          'lookupRuntimeReceipt',
        ]);
        if (ignored) {
          expect(resolution.kind).toBe('thrown');
          if (resolution.kind !== 'thrown')
            throw Error('ignored obligation UPDATE unexpectedly committed');
          expect(String(resolution.cause)).toContain('write obligation disposition differs');
          expect(dispatch.kind).toBe('thrown');
          expect({ physical: after, visible: await readVisible(stores.runs) }).toEqual(before);
          await stores.close();
          console.log('Task3 fix1 provider stopped ' + options.path);
          stores = await openSqliteStores(options);
          console.log('Task3 fix1 provider reopened ' + options.path);
          expect({ physical: capturePuni(), visible: await readVisible(stores.runs) }).toEqual(
            before,
          );
          inspection.run('DROP TRIGGER task3_ignore_obligation_update');
          const retried = await stores.runs.resolveRecovery(submitted);
          expect(retried.kind).toBe('applied');
          if (retried.kind !== 'applied') throw Error('nonacceptance retry refused');
          expect(await stores.runs.resolveRecovery(submitted)).toEqual({
            ...retried,
            kind: 'duplicate',
          });
        } else {
          expect(resolution.kind).toBe('returned');
          expect(dispatch).toMatchObject({
            kind: 'returned',
            value: { kind: 'resolved', closure: { decision: { kind: 'fenced_nonaccepted' } } },
          });
        }
        expect(await stores.runs.readRun(guard.runId)).toMatchObject({
          capacity: { reserved: 0 },
          writeObligations: [{ disposition: { kind: 'fenced_nonaccepted', recoveryId } }],
          attempts: [{ holdsCapacity: false, state: { kind: 'write_nonaccepted' } }],
        });
        expect(await stores.runs.readRuntimeScope(setup.scope)).toMatchObject({
          activeRecoveryId: null,
          pendingCommandId: null,
          generationFloor: 2,
        });
        expect(inspection.query('SELECT * FROM run6_recovery_closure').all()).toHaveLength(1);
        expect(inspection.query('SELECT * FROM run6_recovery_barrier').all()).toHaveLength(1);
        expect(inspection.query('SELECT * FROM run6_recovery_active').all()).toHaveLength(0);
      } finally {
        await settleFixture(async () => {
          await stores.close();
        }, [
          () => {
            inspection.close();
          },
        ]);
        rmSync(directory, { recursive: true });
        console.log('Task3 fix1 nonacceptance closed and removed ' + directory);
      }
    },
    60000,
  );
