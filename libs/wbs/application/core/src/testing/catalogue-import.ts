import { expect } from 'bun:test';

import { servicesOver } from '../compose';
import { createImportService } from '../module/plan-import/composition';
import { clockOf } from '../ports/clock';
import { LEGACY_EDIT_ADMISSION } from '../ports/edit-admission';
import { INACTIVE_EXTERNAL_DEPENDENCIES } from '../ports/external-dependency-authoring';
import type { Source } from '../ports/source';
import type { UnitOfWork } from '../ports/unit-of-work';
import { createLocalDependencyContext } from '../service/dependency-context';
import { recordingBroadcaster } from './broadcast-fixture';
import { planDocumentFixture } from './plan-document-fixture';
import { fastScheduler } from './scheduler-fixture';

export const IMPORT_CATALOGUE_ORGANIZATION = 'import-catalogue-org';
export const IMPORT_CATALOGUE_PROJECT = 'import-catalogue-project';
export const IMPORT_CATALOGUE_SIBLING = 'import-catalogue-sibling';
export const IMPORT_CATALOGUE_STAMP = { at: 100, by: 'catalogue-importer' };
export const CATALOGUE_IMPORT_CASES = [
  'unknown',
  'define',
  'reuse',
  'bind',
  'values',
  'retired',
  'retired-default',
  'retirement-absent',
  'reserved-known',
  'reserved-new',
  'own-cycle',
  'own-acyclic',
  'overflow',
  'legacy-graph-fault',
  'catalogue-absent',
  'manifest-absent',
  'birth-values-absent',
  'unit-refused',
  'allowance-refused',
] as const;

/** Actual legacy-admitted Sources exercise current catalogue mechanics; this is not scoped authorization certification. */
export async function assertCatalogueImport(
  source: Source,
  evidence: () => unknown,
  purpose: (typeof CATALOGUE_IMPORT_CASES)[number],
  seedType: (id: string, name: string) => Promise<void>,
  retainReservedCode: () => void,
): Promise<void> {
  const stamp = IMPORT_CATALOGUE_STAMP;
  const hasTypes = purpose === 'own-cycle' || purpose === 'own-acyclic';
  if (hasTypes)
    for (const [id, name] of [
      ['type-dev-first', 'Dev first'],
      ['type-qa-first', 'QA first'],
    ]) {
      await seedType(id, name);
    }
  if (purpose !== 'unknown' && purpose !== 'define' && purpose !== 'reserved-new') {
    for (const [index, code] of ['impl', 'qa'].entries()) {
      const defined = await source.stores.stepCatalogue.defineAndBindStep(
        IMPORT_CATALOGUE_ORGANIZATION,
        {
          id: 'global-' + code,
          code,
          name: 'Existing ' + code,
          position: (index + 1) * 10,
          defaultEstimateUnit: 'minutes',
          defaultAllowancePercent: 7,
        },
        {
          bindingId: 'existing-' + code,
          scopeKind: hasTypes ? 'organization' : 'project',
          scopeId: hasTypes
            ? IMPORT_CATALOGUE_ORGANIZATION
            : purpose === 'bind' || (purpose === 'overflow' && code === 'qa')
              ? IMPORT_CATALOGUE_SIBLING
              : IMPORT_CATALOGUE_PROJECT,
          workItemTypeId: hasTypes ? 'type-dev-first' : null,
          position:
            purpose === 'overflow' && code === 'impl' ? Number.MAX_SAFE_INTEGER : (index + 1) * 10,
        },
        stamp,
      );
      expect(defined.ok).toBe(true);
      if (hasTypes)
        expect(
          await source.stores.stepCatalogue.bindStep(
            IMPORT_CATALOGUE_ORGANIZATION,
            {
              bindingId: 'second-' + code,
              stepId: 'global-' + code,
              scopeKind: 'organization',
              scopeId: IMPORT_CATALOGUE_ORGANIZATION,
              workItemTypeId: 'type-qa-first',
              position: (2 - index) * 10,
            },
            stamp,
          ),
        ).toMatchObject({ ok: true });
    }
  }
  if (purpose === 'reserved-known') retainReservedCode();
  if (purpose === 'retired' || purpose === 'retired-default') {
    expect(
      await source.stores.stepCatalogue.unbindStep(
        IMPORT_CATALOGUE_ORGANIZATION,
        'existing-impl',
        { dryRun: false },
        stamp,
      ),
    ).toMatchObject({ kind: 'unbound' });
    expect(
      await source.stores.stepCatalogue.retireStepDefinition(
        IMPORT_CATALOGUE_ORGANIZATION,
        'global-impl',
        stamp,
      ),
    ).toEqual({ ok: true });
    expect(
      await source.stores.stepCatalogue.readRetiredCodes(IMPORT_CATALOGUE_ORGANIZATION),
    ).toEqual(['impl']);
    if (purpose === 'retired') {
      const codes = await source.stores.stepCatalogue.readRetiredCodes(
        IMPORT_CATALOGUE_ORGANIZATION,
      );
      if (codes === null) throw new Error('Retained code fixture owner disappeared');
      Reflect.set(codes, 0, 'caller-mutation');
      expect(
        await source.stores.stepCatalogue.readRetiredCodes(IMPORT_CATALOGUE_ORGANIZATION),
      ).toEqual(['impl']);
      expect(await source.stores.stepCatalogue.readRetiredCodes('absent-organization')).toBeNull();
      const expired: (() => Promise<unknown>)[] = [];
      await source.uow.run(async (scope) => {
        expired.push(() =>
          scope.stores.stepCatalogue.readRetiredCodes(IMPORT_CATALOGUE_ORGANIZATION),
        );
        expect(
          await scope.stores.stepCatalogue.readRetiredCodes(IMPORT_CATALOGUE_ORGANIZATION),
        ).toEqual(['impl']);
        return {
          commit: false,
          value: undefined,
          afterRollback: async (repaired) => {
            expired.push(() =>
              repaired.stores.stepCatalogue.readRetiredCodes(IMPORT_CATALOGUE_ORGANIZATION),
            );
            expect(
              await repaired.stores.stepCatalogue.readRetiredCodes(IMPORT_CATALOGUE_ORGANIZATION),
            ).toEqual(['impl']);
          },
        };
      });
      const failures = await Promise.all(
        expired.map((read) =>
          read().then(
            () => null,
            (cause: unknown) => cause,
          ),
        ),
      );
      expect(
        failures.map((failure) => failure instanceof Error && failure.message.includes('closed')),
      ).toEqual([true, true]);
    }
  }
  const document = planDocumentFixture();
  if (purpose === 'reserved-known' || purpose === 'reserved-new')
    document.steps[0].code = 's1-impl';
  document.capacity = [];
  document.calendarMarkers = [];
  document.directory = {
    teams: [],
    people: [],
    tags: [],
    services: [],
    types: [],
    externalSystems: [],
    resources: [],
  };
  document.workItems = document.workItems.map((row) => ({
    ...row,
    serviceTeamId: null,
    serviceId: null,
    teamIds: [],
    tagIds: [],
    serviceIds: [],
    typeIds: [],
    externalRefs: [],
    assignees: {},
    measures: {},
  }));
  if (purpose === 'legacy-graph-fault') {
    const first = document.workItems.at(0);
    if (first === undefined) throw new Error('Legacy graph import has no first row');
    document.workItems.push({
      ...structuredClone(first),
      id: 'legacy-second',
      position: 20,
      dependsOn: [first.id],
    });
  }
  if (hasTypes) {
    document.document.version = 12;
    document.directory.types = [
      { id: 'file-type-first', name: 'Dev first' },
      { id: 'file-type-second', name: 'QA first' },
    ];
    const first = document.workItems.at(0);
    if (first === undefined) throw new Error('Catalogue graph import has no first row');
    first.typeIds = ['file-type-first'];
    document.workItems.push({
      ...structuredClone(first),
      id: 'row-second',
      typeIds: ['file-type-second'],
      position: 20,
    });
    if (purpose === 'own-acyclic') {
      document.steps[0].position = 20;
      document.steps[1].position = 10;
    }
    const edge = (id: string, from: string, fromStep: string, to: string, toStep: string) => ({
      id,
      type: 'FS' as const,
      predecessor: {
        kind: 'internal' as const,
        scope: 'node' as const,
        workItem: from,
        step: fromStep,
      },
      successor: { kind: 'internal' as const, scope: 'node' as const, workItem: to, step: toStep },
    });
    document.typedDependencies =
      purpose === 'own-cycle'
        ? [
            edge('forward', first.id, 'step-2', 'row-second', 'step-2'),
            edge('back', 'row-second', 'step-1', first.id, 'step-1'),
          ]
        : [
            edge('forward', first.id, 'step-1', 'row-second', 'step-2'),
            edge('back', 'row-second', 'step-1', first.id, 'step-2'),
          ];
  }
  let sequence = 0;
  const clock = clockOf({
    now: () => stamp.at,
    newId: () => 'catalogue-import-' + String(++sequence),
  });
  const announcements = recordingBroadcaster();
  const failures = new Map<string, string>([
    ['legacy-graph-fault', 'import-own-order-capture-fault'],
    ['catalogue-absent', 'admitted import catalogue is absent'],
    ['manifest-absent', 'admitted import project manifest is absent'],
    ['retirement-absent', 'admitted import retirement catalogue is absent'],
    ['birth-values-absent', 'import birth lacks a resolved step value'],
    ['unit-refused', 'new import package unit refused: not_found'],
    ['allowance-refused', 'new import package allowance refused: not_found'],
  ]);
  const expectedFailure = failures.get(purpose);
  const observedUow: UnitOfWork = {
    run: (act) =>
      source.uow.run((scope) =>
        act({
          ...scope,
          // Fault only the borrowed dependency result; real writes, rollback and observations retain their actual Source owner.
          stores: {
            ...scope.stores,
            stepCatalogue: new Proxy(scope.stores.stepCatalogue, {
              get(target, property, receiver) {
                if (
                  (purpose === 'catalogue-absent' && property === 'readCatalogue') ||
                  (purpose === 'retirement-absent' && property === 'readRetiredCodes') ||
                  (purpose === 'manifest-absent' && property === 'readManifest')
                )
                  return () => Promise.resolve(null);
                const member: unknown = Reflect.get(target, property, receiver);
                return typeof member === 'function'
                  ? (...args: unknown[]): unknown => Reflect.apply(member, target, args)
                  : member;
              },
            }),
            workPackages: new Proxy(scope.stores.workPackages, {
              get(target, property, receiver) {
                if (purpose === 'birth-values-absent' && property === 'stepsOf')
                  return () => Promise.resolve([]);
                if (
                  (purpose === 'unit-refused' && property === 'setStepUnit') ||
                  (purpose === 'allowance-refused' && property === 'setStepAllowance')
                )
                  return () => Promise.resolve({ ok: false, reason: 'not_found' });
                const member: unknown = Reflect.get(target, property, receiver);
                return typeof member === 'function'
                  ? (...args: unknown[]): unknown => Reflect.apply(member, target, args)
                  : member;
              },
            }),
            workItems: new Proxy(scope.stores.workItems, {
              get(target, property, receiver) {
                if (purpose === 'legacy-graph-fault' && property === 'resolveStepOrders')
                  return () => Promise.reject(new Error('import-own-order-capture-fault'));
                const member: unknown = Reflect.get(target, property, receiver);
                return typeof member === 'function'
                  ? (...args: unknown[]): unknown => Reflect.apply(member, target, args)
                  : member;
              },
            }),
          },
        }),
      ),
  };
  const imports = createImportService({
    commandAccess: {
      resolve: () => Promise.resolve({ ok: true as const, access: { kind: 'legacy' as const } }),
    },
    clock,
    externalDependencies: INACTIVE_EXTERNAL_DEPENDENCIES,
    scheduler: fastScheduler,
    uow: expectedFailure === undefined ? source.uow : observedUow,
    announcements,
    batchServices: (scope, broadcast) =>
      servicesOver(scope.stores, {
        clock,
        scheduler: fastScheduler,
        admission: LEGACY_EDIT_ADMISSION,
        broadcast,
        dependencyContext: createLocalDependencyContext(scope.stores),
      }),
  });
  const catalogue = await source.stores.stepCatalogue.readCatalogue(IMPORT_CATALOGUE_ORGANIZATION);
  if (catalogue === null) throw new Error('Import test catalogue is absent');
  if (purpose === 'values') {
    const sibling = await source.stores.workPackages.createWithSteps(
      {
        id: 'values-sibling',
        projectId: IMPORT_CATALOGUE_PROJECT,
        name: 'Existing independent values',
        restricted: false,
        estimateMethod: 'pert',
        depReach: 'whole-item',
        pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
        estimateRounding: 'ceil',
        startDate: null,
        solutionRef: null,
        revision: 0,
        createdAt: stamp.at,
      },
      stamp,
      { kind: 'legacy' },
    );
    expect(typeof sibling).toBe('object');
    expect(
      await source.stores.workPackages.setStepAllowance('values-sibling', 'global-impl', 19, stamp),
    ).toMatchObject({ ok: true });
  }
  const before = evidence();
  const pending = imports.import(
    document,
    { kind: 'legacy', actorId: stamp.by },
    IMPORT_CATALOGUE_PROJECT,
    { defineMissing: purpose === 'define' || purpose === 'retired' || purpose === 'reserved-new' },
  );
  if (expectedFailure !== undefined) {
    const failure: unknown = await pending.then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(failure).toHaveProperty('message', expectedFailure);
    expect(evidence()).toEqual(before);
    expect(announcements.published).toEqual([]);
    return;
  }
  const outcome = await pending;
  if (purpose === 'unknown') {
    expect(outcome).toEqual({ ok: false, code: 'unknown_step_codes', codes: ['impl', 'qa'] });
    expect(evidence()).toEqual(before);
    expect(announcements.published).toEqual([]);
    return;
  }
  if (purpose === 'retired' || purpose === 'retired-default') {
    expect(outcome).toEqual({ ok: false, code: 'retired_step_codes', codes: ['impl'] });
    expect(evidence()).toEqual(before);
    expect(announcements.published).toEqual([]);
    return;
  }
  if (purpose === 'reserved-new') {
    expect(outcome).toMatchObject({ ok: false, code: 'source_refused', detail: 'reserved_code' });
    expect(evidence()).toEqual(before);
    expect(announcements.published).toEqual([]);
    return;
  }
  if (purpose === 'own-cycle') {
    expect(outcome).toMatchObject({ ok: false, code: 'invalid_typed_dependency', detail: 'cycle' });
    expect(evidence()).toEqual(before);
    expect(announcements.published).toEqual([]);
    return;
  }
  expect(outcome).toMatchObject({ ok: true, rows: hasTypes ? 2 : 1 });
  if (!outcome.ok) throw new Error('Catalogue import was refused');
  const steps = await source.stores.workPackages.stepsOf(outcome.workPackageId);
  expect(steps.map((step) => step.code)).toEqual([
    purpose === 'reserved-known' ? 's1-impl' : 'impl',
    'qa',
  ]);
  expect(steps.map((step) => step.estimateUnit)).toEqual(['workdays', 'workdays']);
  expect(steps.map((step) => step.allowancePercent)).toEqual([0, 30]);
  const build = steps.find(
    (step) => step.code === (purpose === 'reserved-known' ? 's1-impl' : 'impl'),
  );
  if (build === undefined) throw new Error('Imported build step is absent');
  expect(build.id).not.toBe('step-1');
  const estimates = await source.stores.estimates.listByWorkPackage(outcome.workPackageId);
  expect(estimates).toHaveLength(hasTypes ? 2 : 1);
  for (const estimate of estimates)
    expect(estimate).toMatchObject({
      stepId: build.id,
      optimistic: 1,
      realistic: 2,
      pessimistic: 3,
    });
  for (const actual of await source.stores.actuals.listByWorkPackage(outcome.workPackageId))
    expect(actual).toMatchObject({ stepId: build.id, days: 1 });
  for (const progress of await source.stores.progress.listByWorkPackage(outcome.workPackageId))
    expect(progress).toMatchObject({ stepId: build.id, state: 'in_progress' });
  const after = await source.stores.stepCatalogue.readCatalogue(IMPORT_CATALOGUE_ORGANIZATION);
  if (after === null) throw new Error('Import organization disappeared');
  if (purpose === 'reuse' || purpose === 'values') expect(after).toEqual(catalogue);
  if (purpose === 'values')
    expect(
      (await source.stores.workPackages.stepsOf('values-sibling')).map((step) => [
        step.id,
        step.estimateUnit,
        step.allowancePercent,
      ]),
    ).toEqual([
      ['global-impl', 'minutes', 19],
      ['global-qa', 'minutes', 7],
    ]);
  if (purpose === 'overflow')
    expect(
      after.bindings
        .filter((binding) => binding.scopeId === IMPORT_CATALOGUE_PROJECT)
        .toSorted((left, right) => left.position - right.position)
        .map((binding) => [binding.stepId, binding.position]),
    ).toEqual([
      ['global-impl', 10],
      ['global-qa', 20],
    ]);
  if (purpose !== 'define') {
    expect(build.id).toBe('global-impl');
    expect(
      after.definitions.map((definition) => [
        definition.name,
        definition.defaultEstimateUnit,
        definition.defaultAllowancePercent,
      ]),
    ).toEqual([
      ['Existing impl', 'minutes', 7],
      ['Existing qa', 'minutes', 7],
    ]);
  }
  if (purpose === 'bind') {
    expect(
      after.bindings
        .filter((binding) => binding.scopeId === IMPORT_CATALOGUE_PROJECT)
        .map((binding) => [binding.stepId, binding.workItemTypeId]),
    ).toEqual([
      ['global-impl', null],
      ['global-qa', null],
    ]);
  }
}
