import { openMemorySource } from '@wbs/store-memory';
import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import { servicesOver } from '../../compose';
import { clockOf } from '../../ports/clock';
import type { Broadcaster } from '../../ports/project-event';
import type { Scope } from '../../ports/unit-of-work';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { planDocumentFixture } from '../../testing/plan-document-fixture';
import { fastScheduler } from '../../testing/scheduler-fixture';
import { installPlanImport } from './check';
import { PLAN_IMPORT_LABEL } from './contract';
import { planImportModule } from './module';

const STAMP_AT = 1_757_851_200_000;

const requirements = () => {
  const source = openMemorySource();
  let next = 0;
  const clock = clockOf({ now: () => STAMP_AT, newId: () => `imported-${String(++next)}` });
  return {
    clock,
    scheduler: fastScheduler,
    uow: source.uow,
    announcements: recordingBroadcaster(),
    batchServices: (scope: Scope, broadcast: Broadcaster) =>
      servicesOver(scope.stores, { clock, broadcast, scheduler: fastScheduler }),
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
    .installModule(planImportModule)
    .register({
      clock: DiBag.fromSyncFactory(() => clockOf({ now: () => STAMP_AT, newId: () => 'id' })),
      scheduler: DiBag.fromSyncFactory(() => fastScheduler),
      uow: DiBag.fromSyncFactory(() => openMemorySource().uow),
      announcements: DiBag.fromSyncFactory(() => recordingBroadcaster()),
      batchServices: DiBag.fromSyncFactory(
        () => (scope: Scope, broadcast: Broadcaster) =>
          servicesOver(scope.stores, {
            clock: clockOf({ now: () => STAMP_AT, newId: () => 'id' }),
            broadcast,
            scheduler: fastScheduler,
          }),
      ),
    })
    .build();

describe('the Plan import module', () => {
  it('refuses a document whose deadline sits before the project start, without an admitted batch', async () => {
    const { imports } = installPlanImport(requirements());
    const document = planDocumentFixture();
    const row = document.workItems.at(0);
    if (row === undefined) throw new Error('fixture lost its own first work item');
    row.deadline = '2026-09-13';

    expect(await imports.import(document, 'importer')).toMatchObject({
      ok: false,
      code: 'deadline_before_project_start',
      path: 'workItems[0].deadline',
    });
  });

  it('admits a small document over the graph installPlanImport wires', async () => {
    const announcements = recordingBroadcaster();
    const { imports } = installPlanImport({ ...requirements(), announcements });

    const outcome = await imports.import(planDocumentFixture(), 'importer');

    expect(outcome).toMatchObject({ ok: true, rows: 1 });
    expect(
      announcements.published.some((entry) => entry.event.type === 'project_settings_changed'),
    ).toBe(true);
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
    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "importOptions" is not registered.');
  });

  /** The label is what makes a private binding identifiable in any graph report. */
  it('labels its private bindings with the module name', () => {
    const host = completeHost();

    expect(host.inspectGraph().bindings.map((binding) => binding.label)).toContain(
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
      .installModule(planImportModule)
      .register({
        clock: DiBag.fromSyncFactory(() => clockOf({ now: () => STAMP_AT, newId: () => 'id' })),
        scheduler: DiBag.fromSyncFactory(() => fastScheduler),
        uow: DiBag.fromSyncFactory(() => openMemorySource().uow),
        announcements: DiBag.fromSyncFactory(() => recordingBroadcaster()),
      }) as unknown as {
      build: () => { resolve: (key: string) => unknown };
    };
    const host = partial.build();

    expect(() => host.resolve('imports')).toThrow(
      `Cannot resolve "${PLAN_IMPORT_LABEL}/importOptions": dependency "batchServices" is not registered. Resolution path: imports -> ${PLAN_IMPORT_LABEL}/importOptions -> batchServices.`,
    );
  });
});
