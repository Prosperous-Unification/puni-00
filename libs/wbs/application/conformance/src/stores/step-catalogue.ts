import type {
  CatalogueStepBinding,
  NewStepBinding,
  NewStepDefinition,
  Source,
  StepCatalogue,
  StepCatalogueRows,
  StepDefinition,
  TransactionalStores,
} from '@wbs/core';
import { expect } from 'bun:test';

import type { CASE_MANIFEST, CaseRegistration } from '../case-manifest';
import type { StepCatalogueFixture } from '../step-catalogue-fixture';
import { STEP_CATALOGUE_UNBIND_ASSERTIONS } from './step-catalogue-unbind';
import { STEP_ESTIMATE_APPLICABILITY_ASSERTIONS } from './step-estimate-applicability';
import { STEP_ESTIMATE_READER_ASSERTIONS } from './step-estimate-readers';
import { STEP_ESTIMATE_TARGET_LIFETIME_ASSERTIONS } from './step-estimate-target-lifetime';
import { STEP_ESTIMATE_READER_LIFETIME_ASSERTIONS } from "./step-estimate-reader-lifetime";
import { STEP_FACT_WRITER_ASSERTIONS } from './step-fact-writer';
import { STEP_POINT_WRITER_ASSERTIONS } from './step-point-writers';
import { STEP_POINT_SUBTREE_ASSERTIONS } from './step-point-subtrees';
import {STEP_SUBTREE_ESTIMATE_ASSERTIONS} from './step-subtree-estimates';
import { STEP_PACKAGE_READER_ASSERTIONS } from './step-package-readers';
import {STEP_POINT_READER_ASSERTIONS} from './step-point-readers';
import { STEP_POINT_READER_LIFETIME_ASSERTIONS } from './step-point-reader-lifetime';
import { STEP_TUPLE_READER_ASSERTIONS } from './step-tuple-readers';
import { STEP_SUBTREE_OWNERSHIP_ASSERTIONS } from './step-subtree-ownership';
import { STEP_ALLOCATOR_RESERVATION_ASSERTIONS } from './step-allocator-reservation';
import { STEP_ISSUED_PARENT_READER_ASSERTIONS } from './step-issued-parent-reader';

export type StepCatalogueCaseId = (typeof CASE_MANIFEST)['stepCatalogue'][number];
export type OpenStepCatalogueCase = (caseId: StepCatalogueCaseId) => Promise<StepCatalogueFixture>;

function orderedCatalogue(rows: StepCatalogueRows | null) {
  if (rows === null) throw new Error('Fixture organization catalogue is absent');
  const byDefinition = (left: StepDefinition, right: StepDefinition) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  const byBinding = (left: CatalogueStepBinding, right: CatalogueStepBinding) =>
    left.bindingId < right.bindingId ? -1 : left.bindingId > right.bindingId ? 1 : 0;
  return {
    definitions: [...rows.definitions].sort(byDefinition),
    bindings: [...rows.bindings].sort(byBinding),
  };
}

async function publicCatalogueState({ port, seed }: StepCatalogueFixture) {
  return {
    catalogue: orderedCatalogue(await port.readCatalogue(seed.organizationId)),
    own: await port.readPackage(seed.organizationId, seed.workPackageId),
    sibling: await port.readPackage(seed.organizationId, seed.siblingWorkPackageId),
    foreignCatalogue: orderedCatalogue(await port.readCatalogue(seed.foreignOrganizationId)),
    foreignPackage: await port.readPackage(seed.foreignOrganizationId, seed.foreignWorkPackageId),
  };
}

type CatalogueCall<Value> =
  { readonly ok: true; readonly value: Value } | { readonly ok: false; readonly cause: unknown };
type MutableCatalogue<Value> = { -readonly [Key in keyof Value]: Value[Key] };

async function captureCatalogueCall<Value>(
  call: () => Value | Promise<Value>,
): Promise<CatalogueCall<Value>> {
  try {
    return { ok: true, value: await call() };
  } catch (cause: unknown) {
    return { ok: false, cause };
  }
}

async function expectClosedCatalogueCall(call: () => unknown): Promise<void> {
  const refused = await captureCatalogueCall(call);
  expect(refused.ok).toBe(false);
  if (refused.ok) throw new Error('closed catalogue call resolved');
  expect(refused.cause).toBeInstanceOf(Error);
  if (!(refused.cause instanceof Error)) throw refused.cause;
  expect(refused.cause.message).toContain('closed');
}

/** The real UoW holds the Source coordinator; every queued operation is settled before returning or propagating its earlier failure. */
async function queueCatalogueWrite<Value>(
  source: Source<TransactionalStores>,
  enqueue: () => Promise<Value>,
  mutate: () => void,
): Promise<Value> {
  let pending: Promise<CatalogueCall<Value>> | undefined;
  const turn = await captureCatalogueCall(() =>
    source.uow.run(() => {
      pending = captureCatalogueCall(enqueue);
      mutate();
      return Promise.resolve({ commit: false as const, value: undefined });
    }),
  );
  const queued = pending;
  if (queued === undefined) {
    if (!turn.ok) throw turn.cause;
    throw new Error('catalogue write was not queued');
  }
  const settled = await queued;
  if (!turn.ok) {
    if (!settled.ok)
      throw new AggregateError(
        [turn.cause, settled.cause],
        'catalogue holding turn and queued write failed',
        { cause: settled.cause },
      );
    throw turn.cause;
  }
  if (!settled.ok) throw settled.cause;
  return settled.value;
}

/** Frozen returned shapes are valid too; public rereads, not mutability, own the detachment oracle. */
function alterCatalogueReturn(returned: object, key: PropertyKey, value: unknown): void {
  Reflect.set(returned, key, value);
}

export const STEP_CATALOGUE_ASSERTIONS: readonly {
  readonly caseId: StepCatalogueCaseId;
  assert(fixture: StepCatalogueFixture): Promise<void>;
}[] = [
  {
    caseId: 'stepCatalogue.defineAndBindStep:project-empty-materialization',
    async assert({ port, seed }) {
      const created = await port.defineAndBindStep(
        seed.organizationId,
        {
          id: 'catalogue-dev',
          code: 'dev',
          name: 'Development',
          defaultEstimateUnit: 'minutes',
          defaultAllowancePercent: 12.5,
          position: 90,
        },
        {
          bindingId: 'catalogue-project-dev',
          scopeKind: 'project',
          scopeId: seed.projectId,
          workItemTypeId: null,
          position: 20,
        },
        seed.stamp,
      );
      expect(created).toEqual({
        workPackageIds:[seed.workPackageId],projectIds:[seed.projectId],
        ok: true,
        definition: {
          id: 'catalogue-dev',
          organizationId: seed.organizationId,
          code: 'dev',
          name: 'Development',
          defaultEstimateUnit: 'minutes',
          defaultAllowancePercent: 12.5,
          position: 90,
          definedAt: { scopeKind: 'project', scopeId: seed.projectId },
          origin: 'authored',
        },
        binding: {
          bindingId: 'catalogue-project-dev',
          organizationId: seed.organizationId,
          scopeKind: 'project',
          scopeId: seed.projectId,
          stepId: 'catalogue-dev',
          workItemTypeId: null,
          position: 20,
          origin: 'authored',
        },
      });
      expect(await port.readPackage(seed.organizationId, seed.workPackageId)).toEqual({
        chain: {
          level: 'work_package',
          organizationId: seed.organizationId,
          spaceId: seed.spaceId,
          projectId: seed.projectId,
          workPackageId: seed.workPackageId,
        },
        steps: [
          {
            stepId: 'catalogue-dev',
            code: 'dev',
            name: 'Development',
            estimateUnit: 'minutes',
            allowancePercent: 12.5,
            allowanceRevision: 0,
            via: [
              {
                bindingId: 'catalogue-project-dev',
                scopeKind: 'project',
                scopeId: seed.projectId,
                workItemTypeId: null,
              },
            ],
          },
        ],
      });
      expect(await port.readPackage(seed.organizationId, seed.siblingWorkPackageId)).toEqual({
        chain: {
          level: 'work_package',
          organizationId: seed.organizationId,
          spaceId: null,
          projectId: seed.siblingProjectId,
          workPackageId: seed.siblingWorkPackageId,
        },
        steps: [],
      });
      expect(await port.readPackage(seed.organizationId, seed.foreignWorkPackageId)).toBeNull();
      expect(await port.readPackage(seed.organizationId, 'absent-catalogue-package')).toBeNull();
      const catalogue = orderedCatalogue(await port.readCatalogue(seed.organizationId));
      expect(catalogue.definitions.map(({ id }) => id)).toEqual(['catalogue-dev']);
      expect(catalogue.bindings.map(({ bindingId }) => bindingId)).toEqual([
        'catalogue-project-dev',
      ]);
    },
  },
  {
    caseId: 'stepCatalogue.bindStep:scope-union-and-type-key',
    async assert(fixture) {
      const { port, seed } = fixture;
      expect(
        (
          await port.defineAndBindStep(
            seed.organizationId,
            {
              id: 'catalogue-union',
              code: 'union',
              name: 'Union Work',
              defaultEstimateUnit: 'workdays',
              defaultAllowancePercent: 3,
              position: 80,
            },
            {
              bindingId: 'z-org-all',
              scopeKind: 'organization',
              scopeId: seed.organizationId,
              workItemTypeId: null,
              position: 30,
            },
            seed.stamp,
          )
        ).ok,
      ).toBe(true);
      for (const binding of [
        {
          bindingId: 'a-org-typed',
          scopeKind: 'organization',
          scopeId: seed.organizationId,
          stepId: 'catalogue-union',
          workItemTypeId: seed.typeId,
          position: 5,
        },
        {
          bindingId: 'space-all',
          scopeKind: 'space',
          scopeId: seed.spaceId,
          stepId: 'catalogue-union',
          workItemTypeId: null,
          position: 2,
        },
        {
          bindingId: 'project-all',
          scopeKind: 'project',
          scopeId: seed.projectId,
          stepId: 'catalogue-union',
          workItemTypeId: null,
          position: 1,
        },
      ] satisfies readonly NewStepBinding[])
        expect((await port.bindStep(seed.organizationId, binding, seed.stamp)).ok).toBe(true);
      expect(await port.readPackage(seed.organizationId, seed.workPackageId)).toEqual({
        chain: {
          level: 'work_package',
          organizationId: seed.organizationId,
          spaceId: seed.spaceId,
          projectId: seed.projectId,
          workPackageId: seed.workPackageId,
        },
        steps: [
          {
            stepId: 'catalogue-union',
            code: 'union',
            name: 'Union Work',
            estimateUnit: 'workdays',
            allowancePercent: 3,
            allowanceRevision: 0,
            via: [
              {
                bindingId: 'a-org-typed',
                scopeKind: 'organization',
                scopeId: seed.organizationId,
                workItemTypeId: seed.typeId,
              },
              {
                bindingId: 'z-org-all',
                scopeKind: 'organization',
                scopeId: seed.organizationId,
                workItemTypeId: null,
              },
              {
                bindingId: 'space-all',
                scopeKind: 'space',
                scopeId: seed.spaceId,
                workItemTypeId: null,
              },
              {
                bindingId: 'project-all',
                scopeKind: 'project',
                scopeId: seed.projectId,
                workItemTypeId: null,
              },
            ],
          },
        ],
      });
      const sibling = await port.readPackage(seed.organizationId, seed.siblingWorkPackageId);
      expect(sibling?.steps).toEqual([
        {
          stepId: 'catalogue-union',
          code: 'union',
          name: 'Union Work',
          estimateUnit: 'workdays',
          allowancePercent: 3,
          allowanceRevision: 0,
          via: [
            {
              bindingId: 'a-org-typed',
              scopeKind: 'organization',
              scopeId: seed.organizationId,
              workItemTypeId: seed.typeId,
            },
            {
              bindingId: 'z-org-all',
              scopeKind: 'organization',
              scopeId: seed.organizationId,
              workItemTypeId: null,
            },
          ],
        },
      ]);
      const beforeRefusal = await publicCatalogueState(fixture);
      for (const [bindingId, workItemTypeId] of [
        ['duplicate-all', null],
        ['duplicate-typed', seed.typeId],
      ] as const) {
        expect(
          await port.bindStep(
            seed.organizationId,
            {
              bindingId,
              scopeKind: 'organization',
              scopeId: seed.organizationId,
              stepId: 'catalogue-union',
              workItemTypeId,
              position: 40,
            },
            seed.stamp,
          ),
        ).toEqual({ ok: false, reason: 'duplicate_binding' });
        expect(await publicCatalogueState(fixture)).toEqual(beforeRefusal);
      }
    },
  },
  {
    caseId: 'stepCatalogue.defineAndBindStep:modeled-refusals-atomic',
    async assert(fixture) {
      const { port, seed } = fixture;
      expect(
        (
          await port.defineAndBindStep(
            seed.organizationId,
            {
              id: 'catalogue-original',
              code: 'original',
              name: 'Original',
              defaultEstimateUnit: 'minutes',
              defaultAllowancePercent: 1,
              position: 70,
            },
            {
              bindingId: 'catalogue-original-binding',
              scopeKind: 'project',
              scopeId: seed.projectId,
              workItemTypeId: null,
              position: 1,
            },
            seed.stamp,
          )
        ).ok,
      ).toBe(true);
      const beforeRefusal = await publicCatalogueState(fixture);
      for (const [id, code, name, reason] of [
        ['duplicate-code', 'original', 'Different Name', 'code_taken'],
        ['duplicate-name', 'different-code', 'Original', 'name_taken'],
      ] as const) {
        expect(
          await port.defineAndBindStep(
            seed.organizationId,
            {
              id,
              code,
              name,
              defaultEstimateUnit: 'workdays',
              defaultAllowancePercent: 9,
              position: 100,
            },
            {
              bindingId: id + ':binding',
              scopeKind: 'project',
              scopeId: seed.projectId,
              workItemTypeId: null,
              position: 2,
            },
            seed.stamp,
          ),
        ).toEqual({ ok: false, reason });
        expect(await publicCatalogueState(fixture)).toEqual(beforeRefusal);
      }
      expect(
        await port.defineAndBindStep(
          seed.organizationId,
          {
            id: 'foreign-scope-definition',
            code: 'foreign-scope',
            name: 'Foreign Scope',
            defaultEstimateUnit: 'minutes',
            defaultAllowancePercent: 2,
            position: 100,
          },
          {
            bindingId: 'foreign-scope-binding',
            scopeKind: 'project',
            scopeId: seed.foreignProjectId,
            workItemTypeId: null,
            position: 1,
          },
          seed.stamp,
        ),
      ).toEqual({ ok: false, reason: 'not_found' });
      expect(await publicCatalogueState(fixture)).toEqual(beforeRefusal);
      for (const binding of [
        {
          bindingId: 'bind-foreign-project',
          scopeKind: 'project',
          scopeId: seed.foreignProjectId,
          stepId: 'catalogue-original',
          workItemTypeId: null,
          position: 2,
        },
        {
          bindingId: 'bind-absent-definition',
          scopeKind: 'project',
          scopeId: seed.projectId,
          stepId: 'absent-definition',
          workItemTypeId: null,
          position: 2,
        },
        {
          bindingId: 'bind-foreign-type',
          scopeKind: 'project',
          scopeId: seed.projectId,
          stepId: 'catalogue-original',
          workItemTypeId: seed.foreignTypeId,
          position: 2,
        },
      ] satisfies readonly NewStepBinding[]) {
        expect(await port.bindStep(seed.organizationId, binding, seed.stamp)).toEqual({
          ok: false,
          reason: 'not_found',
        });
        expect(await publicCatalogueState(fixture)).toEqual(beforeRefusal);
      }
    },
  },
  {
    caseId: 'stepCatalogue.defineAndBindStep:nan-default-atomic',
    async assert(fixture) {
      const { port, seed } = fixture;
      expect(
        (
          await port.defineAndBindStep(
            seed.organizationId,
            {
              id: 'valid-before-nan-default',
              code: 'valid-before-nan-default',
              name: 'Valid Before nan-default',
              defaultEstimateUnit: 'minutes',
              defaultAllowancePercent: 2.5,
              position: 10,
            },
            {
              bindingId: 'valid-before-nan-default:binding',
              scopeKind: 'project',
              scopeId: seed.projectId,
              workItemTypeId: null,
              position: 1,
            },
            seed.stamp,
          )
        ).ok,
      ).toBe(true);
      const beforeRefusal = await publicCatalogueState(fixture);
      let refusal: { readonly thrown: false } | { readonly thrown: true; readonly cause: unknown } =
        { thrown: false };
      try {
        await port.defineAndBindStep(
          seed.organizationId,
          {
            id: 'invalid-nan-default',
            code: 'invalid-nan-default',
            name: 'Invalid nan-default',
            defaultEstimateUnit: 'workdays',
            defaultAllowancePercent: Number.NaN,
            position: 20,
          },
          {
            bindingId: 'invalid-nan-default:binding',
            scopeKind: 'organization',
            scopeId: seed.organizationId,
            workItemTypeId: null,
            position: 2,
          },
          seed.stamp,
        );
      } catch (cause: unknown) {
        refusal = { thrown: true, cause };
      }
      expect(refusal.thrown).toBe(true);
      if (!refusal.thrown) throw new Error('invalid public catalogue default resolved');
      expect(refusal.cause).toBeInstanceOf(Error);
      if (!(refusal.cause instanceof Error)) throw refusal.cause;
      expect(refusal.cause.message).toBe('catalogue new default allowance is malformed');
      expect(await publicCatalogueState(fixture)).toEqual(beforeRefusal);
    },
  },
  {
    caseId: 'stepCatalogue.defineAndBindStep:range-default-atomic',
    async assert(fixture) {
      const { port, seed } = fixture;
      expect(
        (
          await port.defineAndBindStep(
            seed.organizationId,
            {
              id: 'valid-before-range-default',
              code: 'valid-before-range-default',
              name: 'Valid Before range-default',
              defaultEstimateUnit: 'minutes',
              defaultAllowancePercent: 2.5,
              position: 10,
            },
            {
              bindingId: 'valid-before-range-default:binding',
              scopeKind: 'project',
              scopeId: seed.projectId,
              workItemTypeId: null,
              position: 1,
            },
            seed.stamp,
          )
        ).ok,
      ).toBe(true);
      const beforeRefusal = await publicCatalogueState(fixture);
      let refusal: { readonly thrown: false } | { readonly thrown: true; readonly cause: unknown } =
        { thrown: false };
      try {
        await port.defineAndBindStep(
          seed.organizationId,
          {
            id: 'invalid-range-default',
            code: 'invalid-range-default',
            name: 'Invalid range-default',
            defaultEstimateUnit: 'workdays',
            defaultAllowancePercent: 1000.01,
            position: 20,
          },
          {
            bindingId: 'invalid-range-default:binding',
            scopeKind: 'organization',
            scopeId: seed.organizationId,
            workItemTypeId: null,
            position: 2,
          },
          seed.stamp,
        );
      } catch (cause: unknown) {
        refusal = { thrown: true, cause };
      }
      expect(refusal.thrown).toBe(true);
      if (!refusal.thrown) throw new Error('invalid public catalogue default resolved');
      expect(refusal.cause).toBeInstanceOf(Error);
      if (!(refusal.cause instanceof Error)) throw refusal.cause;
      expect(refusal.cause.message).toBe('catalogue new default allowance is malformed');
      expect(await publicCatalogueState(fixture)).toEqual(beforeRefusal);
    },
  },
  {
    caseId: 'stepCatalogue.defineAndBindStep:precision-default-atomic',
    async assert(fixture) {
      const { port, seed } = fixture;
      expect(
        (
          await port.defineAndBindStep(
            seed.organizationId,
            {
              id: 'valid-before-precision-default',
              code: 'valid-before-precision-default',
              name: 'Valid Before precision-default',
              defaultEstimateUnit: 'minutes',
              defaultAllowancePercent: 2.5,
              position: 10,
            },
            {
              bindingId: 'valid-before-precision-default:binding',
              scopeKind: 'project',
              scopeId: seed.projectId,
              workItemTypeId: null,
              position: 1,
            },
            seed.stamp,
          )
        ).ok,
      ).toBe(true);
      const beforeRefusal = await publicCatalogueState(fixture);
      let refusal: { readonly thrown: false } | { readonly thrown: true; readonly cause: unknown } =
        { thrown: false };
      try {
        await port.defineAndBindStep(
          seed.organizationId,
          {
            id: 'invalid-precision-default',
            code: 'invalid-precision-default',
            name: 'Invalid precision-default',
            defaultEstimateUnit: 'workdays',
            defaultAllowancePercent: 1.001,
            position: 20,
          },
          {
            bindingId: 'invalid-precision-default:binding',
            scopeKind: 'organization',
            scopeId: seed.organizationId,
            workItemTypeId: null,
            position: 2,
          },
          seed.stamp,
        );
      } catch (cause: unknown) {
        refusal = { thrown: true, cause };
      }
      expect(refusal.thrown).toBe(true);
      if (!refusal.thrown) throw new Error('invalid public catalogue default resolved');
      expect(refusal.cause).toBeInstanceOf(Error);
      if (!(refusal.cause instanceof Error)) throw refusal.cause;
      expect(refusal.cause.message).toBe('catalogue new default allowance is malformed');
      expect(await publicCatalogueState(fixture)).toEqual(beforeRefusal);
    },
  },
  {
    caseId: 'stepCatalogue.write:queued-input-retention',
    async assert({ source, port, seed }) {
      const definition: MutableCatalogue<NewStepDefinition> = {
        id: 'queued-definition',
        code: 'queued-work',
        name: 'Queued Work',
        defaultEstimateUnit: 'minutes',
        defaultAllowancePercent: 12.5,
        position: 70,
      };
      const binding: MutableCatalogue<Omit<NewStepBinding, 'stepId'>> = {
        bindingId: 'queued-project',
        scopeKind: 'project',
        scopeId: seed.projectId,
        workItemTypeId: null,
        position: 5,
      };
      const stamp = { ...seed.stamp };
      const defined = await queueCatalogueWrite(
        source,
        () => port.defineAndBindStep(seed.organizationId, definition, binding, stamp),
        () => {
          definition.id = 'changed-definition';
          definition.code = 'changed-work';
          definition.name = 'Changed Work';
          definition.defaultEstimateUnit = 'workdays';
          definition.defaultAllowancePercent = 99;
          definition.position = 999;
          binding.bindingId = 'changed-project';
          binding.scopeKind = 'organization';
          binding.scopeId = seed.foreignOrganizationId;
          binding.workItemTypeId = seed.foreignTypeId;
          binding.position = 999;
          stamp.by = '';
          stamp.at = 999;
        },
      );
      expect(defined).toEqual({
        workPackageIds:[seed.workPackageId],projectIds:[seed.projectId],
        ok: true,
        definition: {
          id: 'queued-definition',
          organizationId: seed.organizationId,
          code: 'queued-work',
          name: 'Queued Work',
          defaultEstimateUnit: 'minutes',
          defaultAllowancePercent: 12.5,
          position: 70,
          definedAt: { scopeKind: 'project', scopeId: seed.projectId },
          origin: 'authored',
        },
        binding: {
          bindingId: 'queued-project',
          organizationId: seed.organizationId,
          scopeKind: 'project',
          scopeId: seed.projectId,
          stepId: 'queued-definition',
          workItemTypeId: null,
          position: 5,
          origin: 'authored',
        },
      });
      const next: MutableCatalogue<NewStepBinding> = {
        bindingId: 'queued-space',
        scopeKind: 'space',
        scopeId: seed.spaceId,
        stepId: 'queued-definition',
        workItemTypeId: seed.typeId,
        position: 2,
      };
      const nextStamp = { ...seed.stamp };
      expect(
        await queueCatalogueWrite(
          source,
          () => port.bindStep(seed.organizationId, next, nextStamp),
          () => {
            next.bindingId = 'changed-space';
            next.scopeId = 'absent-space';
            next.stepId = 'absent-definition';
            next.workItemTypeId = seed.foreignTypeId;
            next.position = 999;
            nextStamp.by = '';
            nextStamp.at = 999;
          },
        ),
      ).toEqual({
        workPackageIds:[seed.workPackageId],projectIds:[seed.projectId],
        ok: true,
        binding: {
          bindingId: 'queued-space',
          organizationId: seed.organizationId,
          scopeKind: 'space',
          scopeId: seed.spaceId,
          stepId: 'queued-definition',
          workItemTypeId: seed.typeId,
          position: 2,
          origin: 'authored',
        },
      });
      expect((await port.readPackage(seed.organizationId, seed.workPackageId))?.steps).toEqual([
        {
          stepId: 'queued-definition',
          code: 'queued-work',
          name: 'Queued Work',
          estimateUnit: 'minutes',
          allowancePercent: 12.5,
          allowanceRevision: 0,
          via: [
            {
              bindingId: 'queued-space',
              scopeKind: 'space',
              scopeId: seed.spaceId,
              workItemTypeId: seed.typeId,
            },
            {
              bindingId: 'queued-project',
              scopeKind: 'project',
              scopeId: seed.projectId,
              workItemTypeId: null,
            },
          ],
        },
      ]);
      expect(await port.readCatalogue(seed.foreignOrganizationId)).toEqual({
        definitions: [],
        bindings: [],
      });
    },
  },
  {
    caseId: 'stepCatalogue.read:detached-nested-values',
    async assert(fixture) {
      const { port, seed } = fixture;
      const created = await port.defineAndBindStep(
        seed.organizationId,
        {
          id: 'detached-definition',
          code: 'detached-work',
          name: 'Detached Work',
          defaultEstimateUnit: 'minutes',
          defaultAllowancePercent: 4.5,
          position: 90,
        },
        {
          bindingId: 'detached-project',
          scopeKind: 'project',
          scopeId: seed.projectId,
          workItemTypeId: null,
          position: 10,
        },
        seed.stamp,
      );
      expect(created.ok).toBe(true);
      if (!created.ok) throw new Error('detachment definition refused: ' + created.reason);
      const afterCreate = structuredClone(await publicCatalogueState(fixture));
      alterCatalogueReturn(created.definition, 'name', 'Caller Changed Definition');
      alterCatalogueReturn(created.definition.definedAt, 'scopeId', 'caller-scope');
      alterCatalogueReturn(created.binding, 'position', 999);
      expect(await publicCatalogueState(fixture)).toEqual(afterCreate);
      const firstCatalogue = await port.readCatalogue(seed.organizationId);
      expect(firstCatalogue).not.toBeNull();
      if (firstCatalogue === null) throw new Error('detachment catalogue absent');
      const firstSnapshot = structuredClone(firstCatalogue);
      const bound = await port.bindStep(
        seed.organizationId,
        {
          bindingId: 'detached-space',
          scopeKind: 'space',
          scopeId: seed.spaceId,
          stepId: 'detached-definition',
          workItemTypeId: seed.typeId,
          position: 5,
        },
        seed.stamp,
      );
      expect(bound.ok).toBe(true);
      if (!bound.ok) throw new Error('detachment binding refused: ' + bound.reason);
      expect(firstCatalogue).toEqual(firstSnapshot);
      const afterBind = structuredClone(await publicCatalogueState(fixture));
      alterCatalogueReturn(bound.binding, 'scopeId', 'caller-space');
      expect(await publicCatalogueState(fixture)).toEqual(afterBind);
      const catalogue = await port.readCatalogue(seed.organizationId),
        packageSteps = await port.readPackage(seed.organizationId, seed.workPackageId);
      expect(catalogue).not.toBeNull();
      expect(packageSteps).not.toBeNull();
      if (catalogue === null || packageSteps === null) throw new Error('detachment read absent');
      const definition = catalogue.definitions.at(0),
        binding = catalogue.bindings.at(0),
        step = packageSteps.steps.at(0),
        via = step?.via.at(0);
      expect(definition).toBeDefined();
      expect(binding).toBeDefined();
      expect(step).toBeDefined();
      expect(via).toBeDefined();
      if (
        definition === undefined ||
        binding === undefined ||
        step === undefined ||
        via === undefined
      )
        throw new Error('detachment nested value absent');
      alterCatalogueReturn(definition.definedAt, 'scopeId', 'caller-definition-scope');
      alterCatalogueReturn(binding, 'stepId', 'caller-step');
      alterCatalogueReturn(catalogue.definitions, 'length', 0);
      alterCatalogueReturn(catalogue.bindings, 'length', 0);
      alterCatalogueReturn(packageSteps.chain, 'projectId', 'caller-project');
      alterCatalogueReturn(via, 'scopeId', 'caller-via');
      alterCatalogueReturn(step, 'allowancePercent', 999);
      alterCatalogueReturn(step.via, 'length', 0);
      alterCatalogueReturn(packageSteps.steps, 'length', 0);
      expect(await publicCatalogueState(fixture)).toEqual(afterBind);
    },
  },
  {
    caseId: 'stepCatalogue.lifetime:borrowed-settlement',
    async assert(fixture) {
      const { source, seed } = fixture;
      for (const settlement of ['commit', 'refuse', 'throw'] as const) {
        const before = structuredClone(await publicCatalogueState(fixture));
        let retained: StepCatalogue | undefined;
        const abort = new Error('intentional catalogue loan abort');
        const transaction = await captureCatalogueCall(() =>
          source.uow.run(async ({ stores }) => {
            const borrowed = stores.stepCatalogue;
            retained = borrowed;
            expect(await borrowed.readCatalogue(seed.organizationId)).toEqual(before.catalogue);
            expect(await borrowed.readPackage(seed.organizationId, seed.workPackageId)).toEqual(
              before.own,
            );
            const stepId = 'loan-' + settlement;
            expect(
              (
                await borrowed.defineAndBindStep(
                  seed.organizationId,
                  {
                    id: stepId,
                    code: stepId,
                    name: 'Loan ' + settlement,
                    defaultEstimateUnit: 'minutes',
                    defaultAllowancePercent: 3,
                    position: 40,
                  },
                  {
                    bindingId: stepId + ':project',
                    scopeKind: 'project',
                    scopeId: seed.projectId,
                    workItemTypeId: null,
                    position: 20,
                  },
                  seed.stamp,
                )
              ).ok,
            ).toBe(true);
            expect(
              (
                await borrowed.bindStep(
                  seed.organizationId,
                  {
                    bindingId: stepId + ':space',
                    scopeKind: 'space',
                    scopeId: seed.spaceId,
                    stepId,
                    workItemTypeId: seed.typeId,
                    position: 10,
                  },
                  seed.stamp,
                )
              ).ok,
            ).toBe(true);
            expect(
              (await borrowed.readPackage(seed.organizationId, seed.workPackageId))?.steps.some(
                (step) => step.stepId === stepId,
              ),
            ).toBe(true);
            expect(await publicCatalogueState(fixture)).toEqual(before);
            if (settlement === 'throw') throw abort;
            if (settlement === 'commit') return { commit: true, value: undefined };
            return { commit: false, value: undefined };
          }),
        );
        if (settlement === 'throw') {
          expect(transaction.ok).toBe(false);
          if (transaction.ok) throw new Error('intentional catalogue loan abort resolved');
          expect(transaction.cause).toBe(abort);
        } else {
          expect(transaction.ok).toBe(true);
          if (!transaction.ok) throw transaction.cause;
        }
        const expired = retained;
        if (expired === undefined) throw new Error('actual catalogue loan was not retained');
        const closedCalls = [
          () => expired.readCatalogue(seed.organizationId),
          () => expired.readPackage(seed.organizationId, seed.workPackageId),
          () =>
            expired.defineAndBindStep(
              seed.organizationId,
              {
                id: 'expired-' + settlement,
                code: 'expired-' + settlement,
                name: 'Expired ' + settlement,
                defaultEstimateUnit: 'minutes',
                defaultAllowancePercent: 1,
                position: 99,
              },
              {
                bindingId: 'expired-' + settlement + ':project',
                scopeKind: 'project',
                scopeId: seed.projectId,
                workItemTypeId: null,
                position: 99,
              },
              seed.stamp,
            ),
          () =>
            expired.bindStep(
              seed.organizationId,
              {
                bindingId: 'expired-' + settlement + ':space',
                scopeKind: 'space',
                scopeId: seed.spaceId,
                stepId: 'loan-commit',
                workItemTypeId: null,
                position: 99,
              },
              seed.stamp,
            ),
        ];
        const after = structuredClone(await publicCatalogueState(fixture));
        if (settlement !== 'commit') expect(after).toEqual(before);
        for (const call of closedCalls) await expectClosedCatalogueCall(call);
        await source.uow.run(async ({ stores }) => {
          expect(await stores.stepCatalogue.readCatalogue(seed.organizationId)).toEqual(
            after.catalogue,
          );
          for (const call of closedCalls) await expectClosedCatalogueCall(call);
          expect(await stores.stepCatalogue.readCatalogue(seed.organizationId)).toEqual(
            after.catalogue,
          );
          expect(
            await stores.stepCatalogue.readPackage(seed.organizationId, seed.workPackageId),
          ).toEqual(after.own);
          return { commit: false, value: undefined };
        });
        expect(await publicCatalogueState(fixture)).toEqual(after);
      }
    },
  },
  {
    caseId: 'stepCatalogue.lifetime:source-close',
    async assert(fixture) {
      const { port, seed } = fixture;
      expect(
        (
          await port.defineAndBindStep(
            seed.organizationId,
            {
              id: 'closed-definition',
              code: 'closed-work',
              name: 'Closed Work',
              defaultEstimateUnit: 'workdays',
              defaultAllowancePercent: 6.25,
              position: 10,
            },
            {
              bindingId: 'closed-project',
              scopeKind: 'project',
              scopeId: seed.projectId,
              workItemTypeId: null,
              position: 10,
            },
            seed.stamp,
          )
        ).ok,
      ).toBe(true);
      const catalogue = await port.readCatalogue(seed.organizationId),
        packageSteps = await port.readPackage(seed.organizationId, seed.workPackageId);
      expect(catalogue).not.toBeNull();
      expect(packageSteps).not.toBeNull();
      const heldCatalogue = structuredClone(catalogue),
        heldPackage = structuredClone(packageSteps);
      const closing = fixture.close();
      expect(fixture.close()).toBe(closing);
      await closing;
      expect(catalogue).toEqual(heldCatalogue);
      expect(packageSteps).toEqual(heldPackage);
      for (const call of [
        () => port.readCatalogue(seed.organizationId),
        () => port.readPackage(seed.organizationId, seed.workPackageId),
        () =>
          port.defineAndBindStep(
            seed.organizationId,
            {
              id: 'after-close',
              code: 'after-close',
              name: 'After Close',
              defaultEstimateUnit: 'minutes',
              defaultAllowancePercent: 1,
              position: 99,
            },
            {
              bindingId: 'after-close:project',
              scopeKind: 'project',
              scopeId: seed.projectId,
              workItemTypeId: null,
              position: 99,
            },
            seed.stamp,
          ),
        () =>
          port.bindStep(
            seed.organizationId,
            {
              bindingId: 'after-close:space',
              scopeKind: 'space',
              scopeId: seed.spaceId,
              stepId: 'closed-definition',
              workItemTypeId: null,
              position: 99,
            },
            seed.stamp,
          ),
      ])
        await expectClosedCatalogueCall(call);
    },
  },
  ...STEP_CATALOGUE_UNBIND_ASSERTIONS,
  ...STEP_ESTIMATE_READER_LIFETIME_ASSERTIONS,
  ...STEP_FACT_WRITER_ASSERTIONS,
  ...STEP_POINT_WRITER_ASSERTIONS,
  ...STEP_POINT_SUBTREE_ASSERTIONS,
  ...STEP_SUBTREE_ESTIMATE_ASSERTIONS,
  ...STEP_PACKAGE_READER_ASSERTIONS,
  ...STEP_ESTIMATE_READER_ASSERTIONS,
  ...STEP_POINT_READER_ASSERTIONS,
  ...STEP_POINT_READER_LIFETIME_ASSERTIONS,
  ...STEP_TUPLE_READER_ASSERTIONS,
  ...STEP_SUBTREE_OWNERSHIP_ASSERTIONS,
  ...STEP_ALLOCATOR_RESERVATION_ASSERTIONS,
  ...STEP_ISSUED_PARENT_READER_ASSERTIONS,
  STEP_ESTIMATE_APPLICABILITY_ASSERTIONS[0],
  STEP_ESTIMATE_APPLICABILITY_ASSERTIONS[1],
  ...STEP_ESTIMATE_TARGET_LIFETIME_ASSERTIONS,
];

/** Registers real assertions and the adapter-owned close once; no absent/inventory-only fallback. */
export function stepCatalogueRegistrations(
  open: OpenStepCatalogueCase,
): readonly CaseRegistration[] {
  return STEP_CATALOGUE_ASSERTIONS.map((assertion): CaseRegistration => ({
    family: 'stepCatalogue',
    caseId: assertion.caseId,
    async openAndRun() {
      const fixture = await open(assertion.caseId);
      return {
        fixtureId: fixture.fixtureId,
        assert: () => assertion.assert(fixture),
        close: () => fixture.close(),
      };
    },
  }));
}
