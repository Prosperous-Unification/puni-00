import type { EstimateStore, Scope, TransactionalStores } from '@wbs/core';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { expect, test } from 'bun:test';

import { openSqliteStepCatalogueCase } from './step-catalogue-fixture';

type Attempt<Value> =
  { readonly ok: true; readonly value: Value } | { readonly ok: false; readonly cause: unknown };
async function attempt<Value>(call: () => Promise<Value>): Promise<Attempt<Value>> {
  try {
    return { ok: true, value: await call() };
  } catch (cause: unknown) {
    return { ok: false, cause };
  }
}

test('sqlite estimate target bound repair loan expires without reviving during another real repair', async () => {
  const fixture = await openSqliteStepCatalogueCase(
    'stepCatalogue.defineAndBindStep:project-empty-materialization',
  );
  const execution = await attempt(async () => {
    const { source, seed, port } = fixture;
    const stepId = 'bound-target-step',
      workItemId = 'bound-target-leaf';
    expect(
      (
        await port.defineAndBindStep(
          seed.organizationId,
          {
            id: stepId,
            code: stepId,
            name: 'Bound target',
            position: 10,
            defaultEstimateUnit: 'minutes',
            defaultAllowancePercent: 12.5,
          },
          {
            bindingId: 'bound-target-binding',
            scopeKind: 'project',
            scopeId: seed.projectId,
            workItemTypeId: null,
            position: 10,
          },
          seed.stamp,
        )
      ).ok,
    ).toBe(true);
    await source.stores.workItems.insert(
      workItemRow({ id: workItemId, workPackageId: seed.workPackageId, name: 'Bound leaf' }),
      [],
      seed.stamp,
    );
    expect(
      (await port.readPackage(seed.organizationId, seed.workPackageId))?.steps.map(
        ({ stepId: id }) => id,
      ),
    ).toEqual([stepId]);
    expect(fixture.readEvidence().estimates).toEqual([]);
    const bound = source.bindLivePlans({ schedulerOf: () => fastScheduler });
    expect(typeof bound.stores.estimates.readTarget).toBe('function');
    const before = fixture.readEvidence();
    const target = await bound.stores.estimates.readTarget(workItemId, stepId);
    expect(target).toMatchObject({
      kind: 'resolved',
      step: { stepId },
      values: { estimateUnit: 'minutes', allowancePercent: 12.5, allowanceRevision: 0 },
    });
    expect(fixture.readEvidence()).toEqual(before);
    const captured: { port: EstimateStore | undefined } = { port: undefined };
    const refusal = await bound.uow.run(async ({ stores }) => {
      expect(await stores.estimates.readTarget(workItemId, stepId)).toEqual(target);
      return {
        commit: false,
        value: 'bound-refused-turn',
        afterRollback: async ({ stores: repair }: Scope<TransactionalStores>) => {
          captured.port = repair.estimates;
          expect(await repair.estimates.readTarget(workItemId, stepId)).toEqual(target);
        },
      };
    });
    expect(refusal).toBe('bound-refused-turn');
    const retained = captured.port;
    if (retained === undefined) throw new Error('actual bound repair target loan was not captured');
    expect(fixture.readEvidence()).toEqual(before);
    // Installed Bun declares toThrow as void; retain the actual matcher receiver and await its settlement.
    const rejection: { toThrow(expected: RegExp): unknown } = expect(
      retained.readTarget(workItemId, stepId),
    ).rejects;
    await rejection.toThrow(/closed/);
    expect(fixture.readEvidence()).toEqual(before);
    await bound.uow.run(
      async () =>
        await Promise.resolve({
          commit: false,
          value: undefined,
          afterRollback: async ({ stores }: Scope<TransactionalStores>) => {
            expect(await stores.estimates.readTarget(workItemId, stepId)).toEqual(target);
            // Installed Bun declares toThrow as void; retain the actual matcher receiver and await its settlement.
            const rejection: { toThrow(expected: RegExp): unknown } = expect(
              retained.readTarget(workItemId, stepId),
            ).rejects;
            await rejection.toThrow(/closed/);
          },
        }),
    );
    expect(fixture.readEvidence()).toEqual(before);
    expect(await bound.stores.estimates.readTarget(workItemId, stepId)).toEqual(target);
    expect(await source.stores.estimates.readTarget(workItemId, stepId)).toEqual(target);
  });
  const closing = await attempt(() => fixture.close());
  if (!execution.ok && !closing.ok)
    throw new AggregateError(
      [execution.cause, closing.cause],
      'bound estimate target test and Source close failed',
      { cause: closing.cause },
    );
  if (!execution.ok) throw execution.cause;
  if (!closing.ok) throw closing.cause;
}, 30000);
