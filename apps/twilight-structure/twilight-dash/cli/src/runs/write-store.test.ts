import { rejects } from 'node:assert/strict';

import { expect, test } from 'bun:test';

import { organizationId } from './record-codecs';
import { verifyRuntimeReceipt } from './runtime-receipt';
import { FixtureClock } from './testing/fixtures';
import { unwrapReply } from './testing/fixtures';
import { createMemoryStores } from './testing/memory-stores';
import { createWriteFixture } from './testing/write-fixture';
import { writeStoreContract } from './testing/write-store-contract';
import { retainWriteReceipt } from './testing/write-store-contract';
import { executionCommandId } from './value-codecs';
writeStoreContract('memory writes', async () => {
  const clock = new FixtureClock();
  return await Promise.resolve({
    ...createMemoryStores({
      organizationId: organizationId('organization'),
      capacity: 2,
      leaseMilliseconds: 100,
      clock,
    }),
    clock,
  });
});

for (const operation of ['stage', 'accept'] as const)
  for (const fault of ['journal', 'reply'] as const)
    test(
      'memory ' +
        operation +
        ' preparation ' +
        fault +
        ' clone failure retains one exact readable predecessor',
      async () => {
        const clock = new FixtureClock();
        const stores = createMemoryStores({
          organizationId: organizationId('organization'),
          capacity: 1,
          leaseMilliseconds: 100,
          clock,
        });
        const clone = globalThis.structuredClone;
        const sentinel = new Error('write ' + fault + ' preparation clone failed');
        try {
          const setup = await createWriteFixture({ ...stores, clock });
          const stage =
            operation === 'accept'
              ? unwrapReply(await stores.runs.stageWrite(setup.guard, setup.command))
              : undefined;
          const guard = await setup.currentGuard();
          const evidence =
            stage === undefined
              ? setup.stateEvidence
              : await retainWriteReceipt(stores, stage.intent);
          const receipt =
            stage === undefined
              ? undefined
              : await verifyRuntimeReceipt(stores.artifacts, stage.intent, evidence);
          if (receipt !== undefined && receipt.acceptance.kind !== 'write')
            throw Error('write receipt absent');
          const before = {
            run: await stores.runs.readRun(setup.run.runId),
            history: await stores.runs.readExecutionHistory(setup.run.runId, setup.guard.attemptId),
            scope: await stores.runs.readRuntimeScope(setup.scope),
          };
          globalThis.structuredClone = (value, options) => {
            if (typeof value === 'object' && value !== null && 'kind' in value) {
              const kind = value.kind;
              if (
                fault === 'journal' &&
                'reply' in value &&
                kind === (operation === 'stage' ? 'stage_write' : 'accept_write')
              )
                throw sentinel;
              if (
                fault === 'reply' &&
                kind === 'applied' &&
                'value' in value &&
                typeof value.value === 'object' &&
                value.value !== null &&
                'kind' in value.value &&
                value.value.kind === (operation === 'stage' ? 'write_staged' : 'write_accepted')
              )
                throw sentinel;
            }
            return clone(value, options);
          };
          const publish = () => {
            if (stage === undefined) return stores.runs.stageWrite(guard, setup.command);
            if (receipt?.acceptance.kind !== 'write')
              throw new Error('verified write receipt absent');
            return stores.runs.recordWriteAcceptance(guard, {
              version: 1,
              kind: 'accept_write',
              commandId: executionCommandId('accept-write'),
              stageCommandId: setup.command.commandId,
              intent: stage.intent,
              evidence,
              projection: {
                version: 1,
                actorId: receipt.actorId,
                basisAfter: receipt.acceptance.basisAfter,
                applied: receipt.acceptance.applied,
              },
            });
          };
          try {
            await rejects(publish, (cause) => cause === sentinel);
          } finally {
            globalThis.structuredClone = clone;
          }
          const after = await Promise.all([
            stores.runs.readRun(setup.run.runId),
            stores.runs.readExecutionHistory(setup.run.runId, setup.guard.attemptId),
            stores.runs.readRuntimeScope(setup.scope),
          ]).then(
            ([run, history, scope]) => ({
              kind: 'readable' as const,
              bundle: { run, history, scope },
            }),
            (cause: unknown) => ({ kind: 'corrupt' as const, cause }),
          );
          expect(after).toEqual({ kind: 'readable', bundle: before });
        } finally {
          globalThis.structuredClone = clone;
          await stores.close();
        }
      },
    );
import { writeReciprocalContract } from './testing/write-store-contract';
writeReciprocalContract('memory writes', async () => {
  const clock = new FixtureClock();
  return await Promise.resolve({
    ...createMemoryStores({
      organizationId: organizationId('organization'),
      capacity: 2,
      leaseMilliseconds: 100,
      clock,
    }),
    clock,
  });
});

test('explicit undefined fixture context returns actual target without a fabricated facts catalog', async () => {
  const clock = new FixtureClock();
  const stores = createMemoryStores({
    organizationId: organizationId('organization'),
    capacity: 1,
    leaseMilliseconds: 100,
    clock,
  });
  try {
    const target = await createWriteFixture({ ...stores, clock }, undefined);
    expect(Object.hasOwn(target, 'facts')).toBe(false);
    expect(target.command.commandId).toBe(executionCommandId('stage-write'));
    expect((await stores.runs.stageWrite(target.guard, target.command)).kind).toBe('applied');
  } finally {
    await stores.close();
  }
});
