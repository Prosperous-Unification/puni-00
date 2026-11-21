import type { StepCatalogue, StepInUsePair, StepUnbindOutcome } from '@wbs/core';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { expect } from 'bun:test';

import type { StepCatalogueFixture } from '../step-catalogue-fixture';
import type { StepCatalogueCaseId } from './step-catalogue';

async function prepareUnbind(fixture: StepCatalogueFixture, organizationWide: boolean) {
  const { source, port, seed } = fixture;
  expect(
    (
      await port.defineAndBindStep(
        seed.organizationId,
        {
          id: 'unbind-dev',
          code: 'unbind-dev',
          name: 'Unbind Development',
          defaultEstimateUnit: 'minutes',
          defaultAllowancePercent: 12.5,
          position: 20,
        },
        {
          bindingId: 'unbind-primary',
          scopeKind: organizationWide ? 'organization' : 'project',
          scopeId: organizationWide ? seed.organizationId : seed.projectId,
          workItemTypeId: null,
          position: 10,
        },
        seed.stamp,
      )
    ).ok,
  ).toBe(true);
  expect(
    (await port.readPackage(seed.organizationId, seed.workPackageId))?.steps.map(
      ({ stepId }) => stepId,
    ),
  ).toEqual(['unbind-dev']);
  expect(await source.stores.workItems.listByWorkPackage(seed.workPackageId)).toEqual([]);
  return fixture;
}

async function insertUnbindLeaf(
  fixture: StepCatalogueFixture,
  id: string,
  name: string,
  workPackageId: string,
  position: number,
) {
  await fixture.source.stores.workItems.insert(
    workItemRow({ id, name, workPackageId, position }),
    [],
    fixture.seed.stamp,
  );
}

function requireUnbind(fixture: StepCatalogueFixture): void {
  // Missing required API is an explicit scaffold oracle after real setup, not a behavior or R5 proof.
  expect(Object.hasOwn(fixture.port, 'unbindStep')).toBe(true);
  expect(typeof fixture.port.unbindStep).toBe('function');
}

export const STEP_CATALOGUE_UNBIND_ASSERTIONS: readonly {
  readonly caseId: StepCatalogueCaseId;
  assert(fixture: StepCatalogueFixture): Promise<void>;
}[] = [
  {
    caseId: 'stepCatalogue.unbindStep:estimate-refusal-and-preview',
    async assert(fixture) {
      const { source, port, seed } = await prepareUnbind(fixture, false);
      await insertUnbindLeaf(fixture, 'unbind-leaf', 'Protected Leaf', seed.workPackageId, 10);
      const estimate = {
        workItemId: 'unbind-leaf',
        stepId: 'unbind-dev',
        optimistic: 1,
        realistic: 2,
        pessimistic: 3,
      };
      expect(await source.stores.estimates.set(estimate, seed.stamp)).toBe('written');
      expect(fixture.readEvidence().estimates).toEqual([estimate]);
      const before = fixture.readEvidence();
      const pairs: readonly StepInUsePair[] = [
        {
          id: 'unbind-leaf',
          name: 'Protected Leaf',
          stepId: 'unbind-dev',
          workPackageId: seed.workPackageId,
          facts: ['estimate'],
        },
      ];
      requireUnbind(fixture);
      expect(
        await port.unbindStep(seed.organizationId, 'unbind-primary', { dryRun: false }, seed.stamp),
      ).toEqual({ kind: 'step_nodes_in_use', count: 1, pairs });
      expect(fixture.readEvidence()).toEqual(before);
      expect(
        await port.unbindStep(seed.organizationId, 'unbind-primary', { dryRun: true }, seed.stamp),
      ).toEqual({ kind: 'preview', wouldRefuse: 'step_nodes_in_use', count: 1, pairs });
      expect(fixture.readEvidence()).toEqual(before);
      expect(
        (await port.readPackage(seed.organizationId, seed.workPackageId))?.steps.map(
          ({ stepId }) => stepId,
        ),
      ).toEqual(['unbind-dev']);
    },
  },
  {
    caseId: 'stepCatalogue.unbindStep:safe-preview-apply-retains-values',
    async assert(fixture) {
      const { port, seed } = await prepareUnbind(fixture, false);
      await insertUnbindLeaf(fixture, 'unbind-empty-leaf', 'Empty Leaf', seed.workPackageId, 10);
      const before = fixture.readEvidence();
      const values = [
        {
          workPackageId: seed.workPackageId,
          stepId: 'unbind-dev',
          estimateUnit: 'minutes',
          allowanceBps: 1250,
          allowanceRevision: 0,
        },
      ];
      expect(before.packageValues).toEqual(values);
      expect(before.estimates).toEqual([]);
      requireUnbind(fixture);
      expect(
        await port.unbindStep(seed.organizationId, 'unbind-primary', { dryRun: true }, seed.stamp),
      ).toEqual({ kind: 'preview', wouldRefuse: null });
      expect(fixture.readEvidence()).toEqual(before);
      expect(
        await port.unbindStep(seed.organizationId, 'unbind-primary', { dryRun: false }, seed.stamp),
      ).toEqual({
        kind: 'unbound',
        workPackageIds: [seed.workPackageId],
        projectIds: [seed.projectId],
      });
      expect(
        (await port.readCatalogue(seed.organizationId))?.definitions.map(({ id }) => id),
      ).toEqual(['unbind-dev']);
      expect((await port.readCatalogue(seed.organizationId))?.bindings).toEqual([]);
      expect((await port.readPackage(seed.organizationId, seed.workPackageId))?.steps).toEqual([]);
      expect(fixture.readEvidence().packageValues).toEqual(values);
      expect(fixture.readEvidence().estimates).toEqual([]);
    },
  },
  {
    caseId: 'stepCatalogue.unbindStep:redundant-binding-keeps-protected-node',
    async assert(fixture) {
      const { source, port, seed } = await prepareUnbind(fixture, true);
      expect(
        (
          await port.bindStep(
            seed.organizationId,
            {
              bindingId: 'unbind-secondary',
              stepId: 'unbind-dev',
              scopeKind: 'project',
              scopeId: seed.projectId,
              workItemTypeId: null,
              position: 5,
            },
            seed.stamp,
          )
        ).ok,
      ).toBe(true);
      await insertUnbindLeaf(fixture, 'redundant-leaf', 'Retained Leaf', seed.workPackageId, 10);
      const estimate = {
        workItemId: 'redundant-leaf',
        stepId: 'unbind-dev',
        optimistic: 2,
        realistic: 4,
        pessimistic: 6,
      };
      expect(await source.stores.estimates.set(estimate, seed.stamp)).toBe('written');
      const before = fixture.readEvidence();
      expect(before.estimates).toEqual([estimate]);
      expect(
        (await port.readPackage(seed.organizationId, seed.workPackageId))?.steps
          .at(0)
          ?.via.map(({ bindingId }) => bindingId),
      ).toEqual(['unbind-primary', 'unbind-secondary']);
      requireUnbind(fixture);
      expect(
        await port.unbindStep(
          seed.organizationId,
          'unbind-secondary',
          { dryRun: true },
          seed.stamp,
        ),
      ).toEqual({ kind: 'preview', wouldRefuse: null });
      expect(fixture.readEvidence()).toEqual(before);
      expect(
        await port.unbindStep(
          seed.organizationId,
          'unbind-secondary',
          { dryRun: false },
          seed.stamp,
        ),
      ).toEqual({
        kind: 'unbound',
        workPackageIds: [seed.workPackageId],
        projectIds: [seed.projectId],
      });
      expect(
        (await port.readPackage(seed.organizationId, seed.workPackageId))?.steps
          .at(0)
          ?.via.map(({ bindingId }) => bindingId),
      ).toEqual(['unbind-primary']);
      expect(fixture.readEvidence().estimates).toEqual(before.estimates);
      expect(fixture.readEvidence().packageValues).toEqual(before.packageValues);
    },
  },
  {
    caseId: 'stepCatalogue.unbindStep:201-pairs-cap-and-order',
    async assert(fixture) {
      const { source, port, seed } = await prepareUnbind(fixture, true);
      const leaves = [
        ...Array.from({ length: 100 }, (_, index) => ({
          id: 'main-' + String(100 - index).padStart(3, '0'),
          name: 'Main ' + String(100 - index),
          workPackageId: seed.workPackageId,
          position: index + 1,
        })),
        ...Array.from({ length: 101 }, (_, index) => ({
          id: 'sibling-' + String(101 - index).padStart(3, '0'),
          name: 'Sibling ' + String(101 - index),
          workPackageId: seed.siblingWorkPackageId,
          position: index + 1,
        })),
      ];
      // Deliberately reverse insertion order; binary IDs also oppose the independently specified ascending position order.
      await source.uow.run(async ({ stores }) => {
        for (const leaf of [...leaves].reverse()) {
          await stores.workItems.insert(workItemRow(leaf), [], seed.stamp);
          expect(
            await stores.estimates.set(
              {
                workItemId: leaf.id,
                stepId: 'unbind-dev',
                optimistic: 1,
                realistic: 2,
                pessimistic: 3,
              },
              seed.stamp,
            ),
          ).toBe('written');
        }
        return { commit: true, value: undefined };
      });
      expect(fixture.readEvidence().estimates.length).toBe(201);
      const before = fixture.readEvidence();
      const pairs: readonly StepInUsePair[] = leaves
        .slice(0, 200)
        .map(({ id, name, workPackageId }) => ({
          id,
          name,
          workPackageId,
          stepId: 'unbind-dev',
          facts: ['estimate'],
        }));
      expect(pairs.length).toBe(200);
      requireUnbind(fixture);
      expect(
        await port.unbindStep(seed.organizationId, 'unbind-primary', { dryRun: false }, seed.stamp),
      ).toEqual({ kind: 'step_nodes_in_use', count: 201, pairs });
      expect(fixture.readEvidence()).toEqual(before);
      expect(
        await port.unbindStep(seed.organizationId, 'unbind-primary', { dryRun: true }, seed.stamp),
      ).toEqual({ kind: 'preview', wouldRefuse: 'step_nodes_in_use', count: 201, pairs });
      expect(fixture.readEvidence()).toEqual(before);
    },
  },
  ...(['preview', 'refusal'] as const).map(
    (
      mode,
    ): {
      readonly caseId: StepCatalogueCaseId;
      assert(fixture: StepCatalogueFixture): Promise<void>;
    } => ({
      caseId:
        mode === 'preview'
          ? 'stepCatalogue.unbindStep:borrowed-preview-keeps-unrelated-commit'
          : 'stepCatalogue.unbindStep:borrowed-refusal-keeps-unrelated-commit',
      async assert(fixture) {
        const { source, port, seed } = await prepareUnbind(fixture, false);
        await insertUnbindLeaf(
          fixture,
          'borrowed-unbind-leaf',
          'Borrowed Protected Leaf',
          seed.workPackageId,
          10,
        );
        const estimate = {
          workItemId: 'borrowed-unbind-leaf',
          stepId: 'unbind-dev',
          optimistic: 3,
          realistic: 4,
          pessimistic: 5,
        };
        if (mode === 'refusal')
          expect(await source.stores.estimates.set(estimate, seed.stamp)).toBe('written');
        const before = fixture.readEvidence();
        expect(before.estimates).toEqual(mode === 'refusal' ? [estimate] : []);
        requireUnbind(fixture);
        const pairs: readonly StepInUsePair[] = [
          {
            id: 'borrowed-unbind-leaf',
            name: 'Borrowed Protected Leaf',
            stepId: 'unbind-dev',
            workPackageId: seed.workPackageId,
            facts: ['estimate'],
          },
        ];
        const committed = await source.uow.run(async ({ stores }) => {
          expect(
            (
              await stores.stepCatalogue.defineAndBindStep(
                seed.organizationId,
                {
                  id: 'unbind-survivor',
                  code: 'unbind-survivor',
                  name: 'Unrelated Surviving Work',
                  defaultEstimateUnit: 'workdays',
                  defaultAllowancePercent: 7.25,
                  position: 30,
                },
                {
                  bindingId: 'unbind-survivor-binding',
                  scopeKind: 'project',
                  scopeId: seed.projectId,
                  workItemTypeId: null,
                  position: 30,
                },
                seed.stamp,
              )
            ).ok,
          ).toBe(true);
          const outcome = await stores.stepCatalogue.unbindStep(
            seed.organizationId,
            'unbind-primary',
            { dryRun: mode === 'preview' },
            seed.stamp,
          );
          expect(outcome).toEqual(
            mode === 'preview'
              ? { kind: 'preview', wouldRefuse: null }
              : { kind: 'step_nodes_in_use', count: 1, pairs },
          );
          // This is the actual borrowed graph, before the caller commits. A candidate deletion must already have been rolled back locally.
          expect(
            (await stores.stepCatalogue.readCatalogue(seed.organizationId))?.bindings.map(
              ({ bindingId }) => bindingId,
            ),
          ).toEqual(['unbind-primary', 'unbind-survivor-binding']);
          expect(
            (
              await stores.stepCatalogue.readPackage(seed.organizationId, seed.workPackageId)
            )?.steps.map(({ stepId }) => stepId),
          ).toEqual(['unbind-dev', 'unbind-survivor']);
          return { commit: true, value: 'unrelated catalogue write committed' };
        });
        expect(committed).toBe('unrelated catalogue write committed');
        expect(
          (await port.readCatalogue(seed.organizationId))?.definitions.map(({ id }) => id),
        ).toEqual(['unbind-dev', 'unbind-survivor']);
        expect(
          (await port.readCatalogue(seed.organizationId))?.bindings.map(
            ({ bindingId }) => bindingId,
          ),
        ).toEqual(['unbind-primary', 'unbind-survivor-binding']);
        expect(
          (await port.readPackage(seed.organizationId, seed.workPackageId))?.steps.map(
            ({ stepId }) => stepId,
          ),
        ).toEqual(['unbind-dev', 'unbind-survivor']);
        expect(fixture.readEvidence().estimates).toEqual(before.estimates);
        expect(fixture.readEvidence().packageValues).toEqual([
          {
            workPackageId: seed.workPackageId,
            stepId: 'unbind-dev',
            estimateUnit: 'minutes',
            allowanceBps: 1250,
            allowanceRevision: 0,
          },
          {
            workPackageId: seed.workPackageId,
            stepId: 'unbind-survivor',
            estimateUnit: 'workdays',
            allowanceBps: 725,
            allowanceRevision: 0,
          },
        ]);
      },
    }),
  ),
  ...buildUnbindLifetimeAssertions(),
];

type UnbindCall<Value> =
  { readonly ok: true; readonly value: Value } | { readonly ok: false; readonly cause: unknown };
async function captureUnbindCall<Value>(
  call: () => Value | Promise<Value>,
): Promise<UnbindCall<Value>> {
  try {
    return { ok: true, value: await call() };
  } catch (cause: unknown) {
    return { ok: false, cause };
  }
}
async function expectUnbindClosed(call: () => Promise<StepUnbindOutcome>): Promise<void> {
  const rejected = await captureUnbindCall(call);
  expect(rejected.ok).toBe(false);
  if (rejected.ok) throw new Error('settled catalogue unbind capability resolved');
  expect(rejected.cause).toBeInstanceOf(Error);
  if (!(rejected.cause instanceof Error)) throw rejected.cause;
  expect(rejected.cause.message).toContain('closed');
}

function buildUnbindLifetimeAssertions(): readonly {
  readonly caseId: StepCatalogueCaseId;
  assert(fixture: StepCatalogueFixture): Promise<void>;
}[] {
  return [
    {
      caseId: 'stepCatalogue.unbindStep:queued-mode-retention',
      async assert(fixture) {
        const { source, port, seed } = await prepareUnbind(fixture, false);
        await insertUnbindLeaf(
          fixture,
          'queued-unbind-leaf',
          'Queued Unbind Leaf',
          seed.workPackageId,
          10,
        );
        const before = fixture.readEvidence();
        const options = { dryRun: true };
        let pending: Promise<UnbindCall<StepUnbindOutcome>> | undefined;
        const held = await captureUnbindCall(() =>
          source.uow.run(() => {
            pending = captureUnbindCall(() =>
              port.unbindStep(seed.organizationId, 'unbind-primary', options, seed.stamp),
            );
            options.dryRun = false;
            return Promise.resolve({ commit: false, value: 'holding turn released' });
          }),
        );
        const queued = pending;
        if (queued === undefined) {
          if (!held.ok) throw held.cause;
          throw new Error('actual public unbind was not queued');
        }
        const settled = await queued;
        if (!held.ok) {
          if (!settled.ok)
            throw new AggregateError(
              [held.cause, settled.cause],
              'holding UoW and queued unbind failed',
              { cause: settled.cause },
            );
          throw held.cause;
        }
        if (!settled.ok) throw settled.cause;
        expect(options.dryRun).toBe(false);
        expect(settled.value).toEqual({ kind: 'preview', wouldRefuse: null });
        expect(fixture.readEvidence()).toEqual(before);
        expect(
          (await port.readCatalogue(seed.organizationId))?.bindings.map(
            ({ bindingId }) => bindingId,
          ),
        ).toEqual(['unbind-primary']);
      },
    },
    {
      caseId: 'stepCatalogue.unbindStep:borrowed-expiry',
      async assert(fixture) {
        const { source, port, seed } = await prepareUnbind(fixture, false);
        await insertUnbindLeaf(
          fixture,
          'expired-unbind-leaf',
          'Expired Unbind Leaf',
          seed.workPackageId,
          10,
        );
        let borrowed: StepCatalogue | undefined;
        expect(
          await source.uow.run(async ({ stores }) => {
            borrowed = stores.stepCatalogue;
            expect(
              await stores.stepCatalogue.unbindStep(
                seed.organizationId,
                'unbind-primary',
                { dryRun: true },
                seed.stamp,
              ),
            ).toEqual({ kind: 'preview', wouldRefuse: null });
            return { commit: true, value: 'actual borrowed operation settled' };
          }),
        ).toBe('actual borrowed operation settled');
        const expired = borrowed;
        if (expired === undefined) throw new Error('actual borrowed unbind port was not retained');
        const before = fixture.readEvidence();
        for (const dryRun of [false, true]) {
          await expectUnbindClosed(() =>
            expired.unbindStep(seed.organizationId, 'unbind-primary', { dryRun }, seed.stamp),
          );
          expect(fixture.readEvidence()).toEqual(before);
        }
        expect(
          await port.unbindStep(
            seed.organizationId,
            'unbind-primary',
            { dryRun: true },
            seed.stamp,
          ),
        ).toEqual({ kind: 'preview', wouldRefuse: null });
        expect(fixture.readEvidence()).toEqual(before);
      },
    },
    {
      caseId: 'stepCatalogue.unbindStep:detached-refusal',
      async assert(fixture) {
        const { source, port, seed } = await prepareUnbind(fixture, false);
        await insertUnbindLeaf(
          fixture,
          'detached-unbind-leaf',
          'Detached Unbind Leaf',
          seed.workPackageId,
          10,
        );
        const estimate = {
          workItemId: 'detached-unbind-leaf',
          stepId: 'unbind-dev',
          optimistic: 1,
          realistic: 2,
          pessimistic: 3,
        };
        expect(await source.stores.estimates.set(estimate, seed.stamp)).toBe('written');
        const before = fixture.readEvidence();
        const pairs: readonly StepInUsePair[] = [
          {
            id: 'detached-unbind-leaf',
            name: 'Detached Unbind Leaf',
            workPackageId: seed.workPackageId,
            stepId: 'unbind-dev',
            facts: ['estimate'],
          },
        ];
        const returned = await port.unbindStep(
          seed.organizationId,
          'unbind-primary',
          { dryRun: true },
          seed.stamp,
        );
        expect(returned).toEqual({
          kind: 'preview',
          wouldRefuse: 'step_nodes_in_use',
          count: 1,
          pairs,
        });
        if (returned.kind !== 'preview' || returned.wouldRefuse !== 'step_nodes_in_use')
          throw new Error('actual unbind preview protection is absent');
        const firstPair = returned.pairs.at(0);
        if (firstPair === undefined) throw new Error('actual unbind preview pair is absent');
        // Frozen results are valid too: mutation attempts must never reach stored facts or later results.
        Reflect.set(firstPair, 'id', 'caller-mutated-leaf');
        Reflect.set(firstPair, 'name', 'Caller Mutated Name');
        Reflect.set(firstPair.facts, 0, 'claim');
        Reflect.set(returned.pairs, 0, { id: 'caller-mutated-pair' });
        Reflect.set(returned, 'count', 999);
        expect(
          await port.unbindStep(
            seed.organizationId,
            'unbind-primary',
            { dryRun: true },
            seed.stamp,
          ),
        ).toEqual({ kind: 'preview', wouldRefuse: 'step_nodes_in_use', count: 1, pairs });
        expect(
          await port.unbindStep(
            seed.organizationId,
            'unbind-primary',
            { dryRun: false },
            seed.stamp,
          ),
        ).toEqual({ kind: 'step_nodes_in_use', count: 1, pairs });
        expect(fixture.readEvidence()).toEqual(before);
      },
    },
    {
      caseId: 'stepCatalogue.unbindStep:source-close',
      async assert(fixture) {
        const { port, seed } = await prepareUnbind(fixture, false);
        expect(
          await port.unbindStep(
            seed.organizationId,
            'unbind-primary',
            { dryRun: true },
            seed.stamp,
          ),
        ).toEqual({ kind: 'preview', wouldRefuse: null });
        const catalogue = await port.readCatalogue(seed.organizationId);
        if (catalogue === null) throw new Error('actual catalogue is absent before source close');
        expect(catalogue.bindings.map(({ bindingId }) => bindingId)).toEqual(['unbind-primary']);
        await fixture.close();
        for (const dryRun of [false, true])
          await expectUnbindClosed(() =>
            port.unbindStep(seed.organizationId, 'unbind-primary', { dryRun }, seed.stamp),
          );
        expect(catalogue.bindings.map(({ bindingId }) => bindingId)).toEqual(['unbind-primary']);
      },
    },
  ];
}
