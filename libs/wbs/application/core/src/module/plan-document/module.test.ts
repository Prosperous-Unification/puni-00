import { openMemorySource } from '@wbs/store-memory';
import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import { servicesOver } from '../../compose';
import type { CalendarMarkerReader } from '../../ports/calendar-marker-read';
import type { CalendarMarker } from '../../ports/calendar-marker-store';
import { clockOf } from '../../ports/clock';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { fastScheduler } from '../../testing/scheduler-fixture';
import { installPlanDocument } from './check';
import { PLAN_DOCUMENT_LABEL } from './contract';
import { planDocumentModule } from './module';

const EXPORTED_AT = Date.parse('2026-09-24T09:00:00.000Z');

/**
 * One memory source holding a project, and the requirements that export it:
 * the directory store, a marker read answering one marker, and a fixed clock.
 *
 * The marker read is a stub rather than the Calendar marker resource on
 * purpose: `ports/sideways-type-boundaries.test.ts` refuses any file of this
 * module that reaches `service/calendar-marker.service.ts`, tests included.
 */
async function seeded() {
  const source = openMemorySource();
  let next = 0;
  const clock = clockOf({ now: () => EXPORTED_AT, newId: () => `id-${String(++next)}` });
  const services = servicesOver(source.stores, {
    clock,
    broadcast: recordingBroadcaster(),
    scheduler: fastScheduler,
  });
  const { project } = await services.projects.create('Plan', 'owner');
  const tree = await services.workItems.tree(project.id);
  if (tree === null || 'kind' in tree) throw new Error('the seeded project has no tree');
  const marker: CalendarMarker = {
    id: 'marker-1',
    projectId: project.id,
    date: '2026-09-30',
    name: 'Launch',
    color: null,
    createdAt: EXPORTED_AT,
  };
  const markers: CalendarMarkerReader = {
    list: (projectId) =>
      Promise.resolve(
        projectId === project.id
          ? { ok: true, value: [marker] }
          : { ok: false, reason: 'not_found', about: 'project' },
      ),
  };
  return { project, tree, requirements: { directory: source.stores.directory, markers, clock } };
}

const hostRequirements = () => {
  const source = openMemorySource();
  return {
    directory: DiBag.createProvider(() => source.stores.directory, {
      factoryReturnKind: 'sync-value',
    }),
    markers: DiBag.createProvider(
      () => ({
        list: () => Promise.resolve({ ok: true as const, value: [] }),
      }),
      { factoryReturnKind: 'sync-value' },
    ),
  };
};

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
  it('exports a project with its markers over the graph installPlanDocument wires', async () => {
    const { project, tree, requirements } = await seeded();
    const { planDocuments } = installPlanDocument(requirements);

    const exported = await planDocuments.export(project, tree);

    expect(exported.document).toEqual({
      format: 'wbs-plan',
      version: 1,
      exportedAt: '2026-09-24T09:00:00.000Z',
    });
    expect(exported.calendarMarkers).toEqual([
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
