import { inMemoryPlanEvents } from '@wbs/store-memory/history-fixture';
import { inMemoryProjects, projectRow } from '@wbs/store-memory/project-fixture';
import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import { installPlanHistory } from './check';
import { PLAN_HISTORY_LABEL } from './contract';
import { planHistoryModule } from './module';

const requirements = () => ({
  projectStore: inMemoryProjects(),
  planEventStore: inMemoryPlanEvents(),
});

/**
 * A complete host graph over the same requirements.
 *
 * Written out rather than shared with the incomplete graph below: a helper
 * returning either registration object gives DI Bag's builder a union it refuses
 * at the type level (`TS2345 … is not assignable to parameter of type 'never'`,
 * observed 2026-09-21).
 */
const completeHost = () =>
  DiBag.createBuilder()
    .withInstalledModules([planHistoryModule])
    .withServices({
      projectStore: DiBag.createProvider(() => inMemoryProjects(), {
        factoryReturnKind: 'sync-value',
      }),
      planEventStore: DiBag.createProvider(() => inMemoryPlanEvents(), {
        factoryReturnKind: 'sync-value',
      }),
    })
    .buildContainer();

describe('the Plan history module', () => {
  it('answers not_found for a project nothing holds', async () => {
    const { history } = installPlanHistory(requirements());

    expect(await history.read('no-such-project', {})).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });

  it('reads the events of a project that exists', async () => {
    const projectStore = inMemoryProjects();
    const project = projectRow({ id: crypto.randomUUID() });
    await projectStore.create(project, [], { at: 1, by: project.ownerId });
    const { history } = installPlanHistory({
      projectStore,
      planEventStore: inMemoryPlanEvents(),
    });

    expect(await history.read(project.id, {})).toEqual({ ok: true, value: [] });
  });

  /**
   * The production installer hands out the contract's exports and nothing else.
   *
   * This is the assertion that makes the bag unreachable: `installPlanHistory`
   * is what `composeServices` calls, and an extra property on the object it
   * returns still satisfies `PlanHistoryExports`, so the type checker does not
   * refuse a returned bag. Enumerating the surface does.
   */
  it('exposes only the contract exports from its installer', () => {
    const exposed: object = installPlanHistory(requirements());

    expect(Object.keys(exposed)).toEqual(['history']);
    expect(
      Object.values(exposed).every((value) => !(value instanceof Object && 'resolve' in value)),
    ).toBe(true);
  });

  /** A host that installs the module cannot name what the module did not export. */
  it('keeps its private bindings out of a host graph', () => {
    const host = completeHost();

    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('historySettings'),
    ).toThrow('DI_BAG_UNKNOWN_SERVICE_KEY: Service "historySettings" is not registered.');
  });

  /** The label is what makes a private binding identifiable in any graph report. */
  it('labels its private bindings with the module name', () => {
    const host = completeHost();

    expect(host.graphSnapshot().bindings.map((binding) => binding.bindingLabel)).toContain(
      `${PLAN_HISTORY_LABEL}/historySettings`,
    );
  });

  /**
   * The label reaches a real DI failure message.
   *
   * A host that forgets a requirement is refused by the type checker, so the cast
   * reaches the runtime path an untyped or generated host reaches. The message
   * has to say which module asked, because `planEventStore` alone would not.
   */
  it('names itself when a host omits a requirement', () => {
    const partial = DiBag.createBuilder()
      .withInstalledModules([planHistoryModule])
      .withServices({
        projectStore: DiBag.createProvider(() => inMemoryProjects(), {
          factoryReturnKind: 'sync-value',
        }),
      }) as unknown as {
      buildContainer: () => { resolve: (key: string) => unknown };
    };
    const host = partial.buildContainer();

    expect(() => host.resolve('history')).toThrow(
      `Cannot resolve "${PLAN_HISTORY_LABEL}/historySettings": dependency "planEventStore" is not registered. Resolution path: history -> ${PLAN_HISTORY_LABEL}/historySettings -> planEventStore.`,
    );
  });
});
