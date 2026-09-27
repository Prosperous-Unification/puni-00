import { inMemoryPlanEvents } from '@wbs/store-memory/history-fixture';
import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import { installPlanEvent } from './check';
import { PLAN_EVENT_LABEL } from './contract';
import { planEventModule } from './module';

const completeHost = () =>
  DiBag.createBuilder()
    .withInstalledModules([planEventModule])
    .withServices({
      planEventStore: DiBag.createProvider(() => inMemoryPlanEvents(), {
        factoryReturnKind: 'sync-value',
      }),
    })
    .buildContainer();

describe('the Plan event module', () => {
  it('keeps the repository ordering and prunes by age', async () => {
    const events = inMemoryPlanEvents([
      {
        id: 'old',
        projectId: 'project-1',
        userId: 'owner',
        kind: 'edit',
        label: 'old',
        workItemId: null,
        stepId: null,
        before: null,
        after: null,
        createdAt: 0,
      },
      {
        id: 'recent',
        projectId: 'project-1',
        userId: 'owner',
        kind: 'edit',
        label: 'recent',
        workItemId: null,
        stepId: null,
        before: null,
        after: null,
        createdAt: 36 * 60 * 60 * 1_000,
      },
      {
        id: 'new',
        projectId: 'project-1',
        userId: 'owner',
        kind: 'edit',
        label: 'new',
        workItemId: null,
        stepId: null,
        before: null,
        after: null,
        createdAt: 2 * 24 * 60 * 60 * 1_000,
      },
    ]);
    const { planEvents } = installPlanEvent({ events });
    expect((await planEvents.readHistory('project-1', {})).map((event) => event.id)).toEqual([
      'new',
      'recent',
      'old',
    ]);
    expect(await planEvents.pruneHistory(2 * 24 * 60 * 60 * 1_000, 1)).toBe(1);
    expect((await planEvents.readHistory('project-1', {})).map((event) => event.id)).toEqual([
      'new',
      'recent',
    ]);
  });

  it('exports only the resource', () => {
    const exposed: object = installPlanEvent({ events: inMemoryPlanEvents() });
    expect(Object.keys(exposed)).toEqual(['planEvents']);
    expect(
      Object.values(exposed).every((value) => !(value instanceof Object && 'resolve' in value)),
    ).toBe(true);
  });

  it('keeps the private binding out of the host graph', () => {
    const host = completeHost();
    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('planEventSettings'),
    ).toThrow('DI_BAG_UNKNOWN_SERVICE_KEY: Service "planEventSettings" is not registered.');
  });

  it('labels the private binding', () => {
    expect(
      completeHost()
        .graphSnapshot()
        .bindings.map((binding) => binding.bindingLabel),
    ).toContain(`${PLAN_EVENT_LABEL}/planEventSettings`);
  });

  it('names the missing requirement', () => {
    const partial = DiBag.createBuilder().withInstalledModules([planEventModule]) as unknown as {
      buildContainer: () => { resolve: (key: string) => unknown };
    };
    expect(() => partial.buildContainer().resolve('planEvents')).toThrow(
      `Cannot resolve "${PLAN_EVENT_LABEL}/planEventSettings": dependency "planEventStore" is not registered. Resolution path: planEvents -> ${PLAN_EVENT_LABEL}/planEventSettings -> planEventStore.`,
    );
  });
});
