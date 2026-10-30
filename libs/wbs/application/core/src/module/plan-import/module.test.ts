import { openMemorySource } from '@wbs/store-memory';
import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import { servicesOver } from '../../compose';
import { clockOf } from '../../ports/clock';
import { CREATOR_ADMISSION } from '../../ports/edit-admission';
import { INACTIVE_EXTERNAL_DEPENDENCIES } from '../../ports/external-dependency-authoring';
import { LEGACY_ACCESS, type ResourceAccess } from '../../ports/organization-access';
import type { Broadcaster } from '../../ports/project-event';
import type { Scope } from '../../ports/unit-of-work';
import { createLocalDependencyContext } from '../../service/dependency-context';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { localCommandAccess } from '../../testing/organization-access-fixture';
import { planDocumentFixture } from '../../testing/plan-document-fixture';
import { fastScheduler } from '../../testing/scheduler-fixture';
import { installPlanImport } from './check';
import { PLAN_IMPORT_LABEL } from './contract';
import { ImportedPlanResource } from './imported-plan.resource';
import { planImportModule } from './module';

const STAMP_AT = 1_757_851_200_000;

const requirements = () => {
  const source = openMemorySource();
  let next = 0;
  const clock = clockOf({ now: () => STAMP_AT, newId: () => `imported-${String(++next)}` });
  return {
    commandAccess: localCommandAccess,
    externalDependencies: INACTIVE_EXTERNAL_DEPENDENCIES,
    clock,
    scheduler: fastScheduler,
    uow: source.uow,
    announcements: recordingBroadcaster(),
    batchServices: (scope: Scope, broadcast: Broadcaster) =>
      servicesOver(scope.stores, {
        dependencyContext: createLocalDependencyContext(scope.stores),
        admission: CREATOR_ADMISSION,
        clock,
        broadcast,
        scheduler: fastScheduler,
      }),
  };
};

/**
 * A complete host graph over the same requirements.
 *
 * Written out rather than shared with the incomplete graph below: a helper
 * returning either registration object gives DI Bag's builder a union it
 * refuses at the type level, the same TS2345 Plan history's and Bounded
 * replay sweep's own `module.test.ts` record for their two graphs.
 */
const completeHost = () =>
  DiBag.createBuilder()
    .withInstalledModules([planImportModule])
    .withServices({
      commandAccess: DiBag.createProvider(() => localCommandAccess, {
        factoryReturnKind: 'sync-value',
      }),
      externalDependencies: DiBag.createProvider(() => INACTIVE_EXTERNAL_DEPENDENCIES, {
        factoryReturnKind: 'sync-value',
      }),
      clock: DiBag.createProvider(() => clockOf({ now: () => STAMP_AT, newId: () => 'id' }), {
        factoryReturnKind: 'sync-value',
      }),
      scheduler: DiBag.createProvider(() => fastScheduler, { factoryReturnKind: 'sync-value' }),
      uow: DiBag.createProvider(() => openMemorySource().uow, { factoryReturnKind: 'sync-value' }),
      announcements: DiBag.createProvider(() => recordingBroadcaster(), {
        factoryReturnKind: 'sync-value',
      }),
      batchServices: DiBag.createProvider(
        () => (scope: Scope, broadcast: Broadcaster) =>
          servicesOver(scope.stores, {
            dependencyContext: createLocalDependencyContext(scope.stores),
            admission: CREATOR_ADMISSION,
            clock: clockOf({ now: () => STAMP_AT, newId: () => 'id' }),
            broadcast,
            scheduler: fastScheduler,
          }),
        { factoryReturnKind: 'sync-value' },
      ),
      committedFanout: DiBag.createProvider(() => undefined, { factoryReturnKind: 'sync-value' }),
    })
    .buildContainer();

describe('the Plan import module', () => {
  it('refuses current authority before opening the import graph', async () => {
    const source = openMemorySource();
    const { imports } = installPlanImport({
      ...requirements(),
      uow: source.uow,
      commandAccess: {
        resolve: () => Promise.resolve({ ok: false as const, refusal: 'not_a_member' as const }),
      },
      batchServices: () => {
        throw new Error('refused principal reached import graph');
      },
    });
    expect(
      await imports.import(planDocumentFixture(), { kind: 'legacy', actorId: 'importer' }),
    ).toEqual({ ok: false, refusal: 'not_a_member' });
    expect(await source.stores.projects.list()).toEqual([]);
  });

  it('refuses a direct reader before admitting the writer', async () => {
    const { imports } = installPlanImport({
      ...requirements(),
      uow: {
        run: () => {
          throw new Error('reader reached writer');
        },
      },
    });
    expect(
      await imports.import(planDocumentFixture(), {
        kind: 'human',
        principal: { id: 'reader', username: 'reader', scopes: ['read'] },
        expectedAccess: LEGACY_ACCESS,
      }),
    ).toEqual({ ok: false, error: 'insufficient_scope' });
  });

  it('keeps an external v11 import dormant before directory or project writes', async () => {
    const source = openMemorySource();
    const held = requirements();
    const { imports } = installPlanImport({ ...held, uow: source.uow });
    const document = planDocumentFixture();
    document.document.version = 12;
    document.typedDependencies = [
      {
        id: 'cross',
        type: 'FS',
        predecessor: {
          kind: 'external',
          scope: 'whole',
          projectId: 'other-project',
          workItemId: 'stable-row',
          display: {
            projectName: 'Other',
            abbreviation: 'OTHER',
            workItemName: 'Prerequisite',
            address: 'OTHER.1',
          },
        },
        successor: { kind: 'internal', scope: 'whole', workItem: 'row-1' },
      },
    ];
    expect(await imports.import(document, { kind: 'legacy', actorId: 'importer' })).toMatchObject({
      ok: false,
      code: 'external_dependencies_inactive',
      path: 'typedDependencies[0]',
    });
    expect(await source.stores.projects.list()).toEqual([]);
  });

  it('refuses duplicate stable external declarations before dormancy', async () => {
    const { imports } = installPlanImport(requirements());
    const document = planDocumentFixture();
    document.document.version = 12;
    const relationship = {
      id: 'cross',
      type: 'FS' as const,
      predecessor: {
        kind: 'external' as const,
        scope: 'whole' as const,
        projectId: 'other-project',
        workItemId: 'stable-row',
        display: {
          projectName: 'Other',
          abbreviation: 'OTHER',
          workItemName: 'Prerequisite',
          address: 'OTHER.1',
        },
      },
      successor: { kind: 'internal' as const, scope: 'whole' as const, workItem: 'row-1' },
    };
    document.typedDependencies = [relationship, { ...relationship, id: 'cross-again' }];
    expect(await imports.import(document, { kind: 'legacy', actorId: 'importer' })).toMatchObject({
      ok: false,
      code: 'invalid_typed_dependency',
      path: 'typedDependencies[1]',
      detail: 'duplicate',
    });
  });
  it('refuses a document whose deadline sits before the project start, without an admitted batch', async () => {
    const { imports } = installPlanImport(requirements());
    const document = planDocumentFixture();
    const row = document.workItems.at(0);
    if (row === undefined) throw new Error('fixture lost its own first work item');
    row.deadline = '2026-09-13';

    expect(await imports.import(document, { kind: 'legacy', actorId: 'importer' })).toMatchObject({
      ok: false,
      code: 'deadline_before_project_start',
      path: 'workItems[0].deadline',
    });
  });

  it('refuses a row carrying two types before any write, announcing nothing', async () => {
    const announcements = recordingBroadcaster();
    const { imports } = installPlanImport({ ...requirements(), announcements });
    const document = planDocumentFixture();
    document.directory.types.push({ id: 'type-2', name: 'Spike' });
    const row = document.workItems.at(0);
    if (row === undefined) throw new Error('fixture lost its own first work item');
    row.typeIds = ['type-1', 'type-2'];

    expect(await imports.import(document, { kind: 'legacy', actorId: 'importer' })).toEqual({
      ok: false,
      code: 'work_item_takes_one_type',
      path: 'workItems[0].typeIds',
      detail: 'row-1',
    });
    expect(announcements.published).toEqual([]);
  });

  it('admits a small document over the graph installPlanImport wires', async () => {
    const announcements = recordingBroadcaster();
    const { imports } = installPlanImport({ ...requirements(), announcements });

    const outcome = await imports.import(planDocumentFixture(), {
      kind: 'legacy',
      actorId: 'importer',
    });

    expect(outcome).toMatchObject({ ok: true, rows: 1 });
    expect(
      announcements.published.some((entry) => entry.event.type === 'project_settings_changed'),
    ).toBe(true);
  });

  it('refuses a scoped source without borrowed import authority before any write', async () => {
    const source = openMemorySource();
    const announcements = recordingBroadcaster();
    const { imports } = installPlanImport({ ...requirements(), uow: source.uow, announcements });
    const access: ResourceAccess = {
      kind: 'scoped',
      scope: { organizationId: 'org-a', userId: 'importer', role: 'member' },
    };

    const refused: unknown = await imports
      .import(planDocumentFixture(), {
        kind: 'human',
        principal: { id: 'importer', username: 'importer', scopes: ['write'] },
        expectedAccess: access,
      })
      .catch((failure: unknown) => failure);
    expect(refused).toBeInstanceOf(Error);
    if (!(refused instanceof Error)) throw new Error('missing scoped authority did not throw');
    expect(refused.message).toBe('scoped import lacks borrowed authority or fan-out delivery');
    expect(await source.stores.projects.list()).toEqual([]);
    expect(announcements.published).toEqual([]);
  });

  /**
   * The production installer hands out the contract's exports and nothing
   * else. Same reasoning as Plan history's, Bounded replay sweep's and
   * Realtime's own installer tests: an object with an extra property still
   * satisfies `PlanImportExports`, so only enumerating the returned surface
   * catches a leak the type checker would not.
   */
  it('exposes only the contract exports from its installer', () => {
    const exposed: object = installPlanImport(requirements());

    expect(Object.keys(exposed)).toEqual(['imports']);
    expect(
      Object.values(exposed).every((value) => !(value instanceof Object && 'resolve' in value)),
    ).toBe(true);
  });

  /** A host that installs the module cannot name what the module did not export. */
  it('keeps its private bindings out of a host graph', () => {
    const host = completeHost();

    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('importOptions'),
    ).toThrow('DI_BAG_UNKNOWN_SERVICE_KEY: Service "importOptions" is not registered.');
  });

  /** The label is what makes a private binding identifiable in any graph report. */
  it('labels its private bindings with the module name', () => {
    const host = completeHost();

    expect(host.graphSnapshot().bindings.map((binding) => binding.bindingLabel)).toContain(
      `${PLAN_IMPORT_LABEL}/importOptions`,
    );
  });

  /**
   * The label reaches a real DI failure message.
   *
   * A host that forgets a requirement is refused by the type checker, so the
   * cast reaches the runtime path an untyped or generated host reaches.
   */
  it('names itself when a host omits a requirement', () => {
    const partial = DiBag.createBuilder()
      .withInstalledModules([planImportModule])
      .withServices({
        commandAccess: DiBag.createProvider(() => localCommandAccess, {
          factoryReturnKind: 'sync-value',
        }),
        externalDependencies: DiBag.createProvider(() => INACTIVE_EXTERNAL_DEPENDENCIES, {
          factoryReturnKind: 'sync-value',
        }),
        clock: DiBag.createProvider(() => clockOf({ now: () => STAMP_AT, newId: () => 'id' }), {
          factoryReturnKind: 'sync-value',
        }),
        scheduler: DiBag.createProvider(() => fastScheduler, { factoryReturnKind: 'sync-value' }),
        uow: DiBag.createProvider(() => openMemorySource().uow, {
          factoryReturnKind: 'sync-value',
        }),
        announcements: DiBag.createProvider(() => recordingBroadcaster(), {
          factoryReturnKind: 'sync-value',
        }),
      }) as unknown as {
      buildContainer: () => { resolve: (key: string) => unknown };
    };
    const host = partial.buildContainer();

    expect(() => host.resolve('imports')).toThrow(
      `Cannot resolve "${PLAN_IMPORT_LABEL}/importOptions": dependency "batchServices" is not registered. Resolution path: imports -> ${PLAN_IMPORT_LABEL}/importOptions -> batchServices.`,
    );
  });
});

describe('ImportedPlanResource', () => {
  // Proof (2026-09-30): declaring the field `private readonly scope` made this
  // and the AdmittedScope twin fail (8 pass, 2 fail).
  it('keeps the raw scope out of reach at run time', () => {
    const scope = { stores: {} } as Scope;
    const writes = new ImportedPlanResource(scope, {
      actorId: 'importer',
      access: LEGACY_ACCESS,
      externalDependencies: INACTIVE_EXTERNAL_DEPENDENCIES,
      assertActive: () => undefined,
      contextFor: () => {
        throw new Error('reflection test cannot open dependency context');
      },
    });
    expect(Reflect.ownKeys(writes)).toEqual([]);
    expect(Reflect.get(writes, 'scope')).toBeUndefined();
  });
});
