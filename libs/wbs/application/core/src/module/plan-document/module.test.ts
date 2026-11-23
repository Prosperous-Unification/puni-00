import { openMemorySourceFixture } from '@wbs/store-memory/source';
import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import { servicesOver } from '../../compose';
import type { CalendarMarker } from '../../ports/calendar-marker-store';
import { clockOf } from '../../ports/clock';
import { LEGACY_EDIT_ADMISSION } from '../../ports/edit-admission';
import { createLocalDependencyContext } from '../../service/dependency-context';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { expectCreated } from '../../testing/expect-created';
import { seedLegacyPackageParent } from '../../testing/legacy-package-source-fixture';
import { fastScheduler } from '../../testing/scheduler-fixture';
import { installPlanDocument } from './check';
import { PLAN_DOCUMENT_LABEL } from './contract';
import { planDocumentModule } from './module';

const EXPORTED_AT = Date.parse('2026-09-24T09:00:00.000Z');

/**
 * Historical IO-era fixture description (retired):
 * One memory source holding a work package, and the requirements that export it:
 * the directory store, a marker read answering one marker, and a fixed clock.
 *
 * The marker read is a stub rather than the Calendar marker resource on
 * purpose: `ports/sideways-type-boundaries.test.ts` refuses any file of this
 * module that reaches `module/calendar-marker/calendar-marker.resource.ts`, tests included.
 */
async function seeded() {
  const parentFixture = openMemorySourceFixture();
  const source = parentFixture.source;
  await source.stores.users.create(
    { id: 'owner', username: 'owner', passwordHash: null, createdAt: 1 },
    { at: 1, by: 'owner' },
  );
  seedLegacyPackageParent(parentFixture, {
    organizationId: 'fixture-legacy-org',
    projectId: 'fixture-project',
    creator: 'owner',
  });
  let next = 0;
  const clock = clockOf({ now: () => EXPORTED_AT, newId: () => `id-${String(++next)}` });
  const services = servicesOver(source.stores, {
    dependencyContext: createLocalDependencyContext(source.stores),
    admission: LEGACY_EDIT_ADMISSION,
    clock,
    broadcast: recordingBroadcaster(),
    scheduler: fastScheduler,
  });
  const { workPackage } = expectCreated(
    await services.workPackages.create('Plan', 'fixture-project', 'owner'),
  );
  const tree = await services.workItems.tree(workPackage.id);
  if (tree === null || 'kind' in tree) throw new Error('the seeded work package has no tree');
  const marker: CalendarMarker = {
    id: 'marker-1',
    workPackageId: workPackage.id,
    date: '2026-09-30',
    name: 'Launch',
    color: null,
    createdAt: EXPORTED_AT,
  };
  return {
    workPackage,
    tree,
    reads: {
      project: { id: 'fixture-project', name: 'Fixture parent' },
      directory: { teams: [], people: [], tags: [], services: [], types: [], externalSystems: [] },
      markers: [marker],
      stepParallels: [],
      resources: { resources: [], capacities: [], demands: [] },
      measures: { definitions: null, facts: [], estimates: [], budgets: [] },
    },
    requirements: { clock },
  };
}

const hostRequirements = () => ({});

/**
 * A complete host graph.
 *
 * Written out rather than shared with the incomplete graph below: a helper
 * returning either registration object gives DI Bag's builder a union it
 * refuses at the type level, the same TS2345 every prior 040.6 module's own
 * `module.test.ts` records for its two graphs.
 */
const completeHost = () =>
  DiBag.createBuilder()
    .withInstalledModules([planDocumentModule])
    .withServices({
      ...hostRequirements(),
      clock: DiBag.createProvider(() => ({ now: () => 0 }), { factoryReturnKind: 'sync-value' }),
    })
    .buildContainer();

describe('the Plan document module', () => {
  it('serializes constructed captured markers using the graph-supplied clock', async () => {
    const { workPackage, tree, reads, requirements } = await seeded();
    const { planDocuments } = installPlanDocument(requirements);

    const exported = planDocuments.exportCaptured({ ...workPackage, timezone: 'UTC' }, tree, reads);

    if (!exported.ok) throw new Error('export refused');
    expect(exported.value.document).toEqual({
      format: 'wbs-plan',
      version: 15,
      exportedAt: '2026-09-24T09:00:00.000Z',
    });
    expect(exported.value.calendarMarkers).toEqual([
      { id: 'marker-1', date: '2026-09-30', name: 'Launch', color: null },
    ]);
  });

  /**
   * The production installer hands out the contract's exports and nothing
   * else. Same reasoning as every prior 040.6 module's own installer test: an
   * object with an extra property still satisfies `PlanDocumentExports`, so
   * only enumerating the returned surface catches a leak the type checker
   * would not.
   */
  it('exposes only the contract exports from its installer', async () => {
    const { requirements } = await seeded();
    const exposed: object = installPlanDocument(requirements);

    expect(Object.keys(exposed)).toEqual(['planDocuments']);
    expect(
      Object.values(exposed).every((value) => !(value instanceof Object && 'resolve' in value)),
    ).toBe(true);
  });

  /** A host that installs the module cannot name what the module did not export. */
  it('keeps its private bindings out of a host graph', () => {
    const host = completeHost();

    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('planDocumentOptions'),
    ).toThrow('DI_BAG_UNKNOWN_SERVICE_KEY: Service "planDocumentOptions" is not registered.');
  });

  /** The label is what makes a private binding identifiable in any graph report. */
  it('labels its private bindings with the module name', () => {
    const host = completeHost();

    expect(host.graphSnapshot().bindings.map((binding) => binding.bindingLabel)).toContain(
      `${PLAN_DOCUMENT_LABEL}/planDocumentOptions`,
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
      .withInstalledModules([planDocumentModule])
      .withServices(hostRequirements()) as unknown as {
      buildContainer: () => { resolve: (key: string) => unknown };
    };
    const host = partial.buildContainer();

    expect(() => host.resolve('planDocuments')).toThrow(
      `Cannot resolve "${PLAN_DOCUMENT_LABEL}/planDocumentOptions": dependency "clock" is not registered. Resolution path: planDocuments -> ${PLAN_DOCUMENT_LABEL}/planDocumentOptions -> clock.`,
    );
  });
});
