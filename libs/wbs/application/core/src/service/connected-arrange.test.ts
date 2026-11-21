import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { expect, test } from 'bun:test';

import { WorkItemService } from '../module/work-item/work-item.resource';
import { LEGACY_EDIT_ADMISSION } from '../ports/edit-admission';
import { INACTIVE_EXTERNAL_DEPENDENCIES } from '../ports/external-dependency-authoring';
import { createBoundFixturePackage } from '../testing/bound-package-fixture';
import { testClock } from '../testing/clock-fixture';
import { createConnectedOptimizationRead } from '../testing/connected-optimization-view.fixture';
import { createTestServices } from '../testing/harness';
import { createLegacyWorkPackageFixture } from '../testing/legacy-work-package-fixture';
import { createLocalDependencyContext } from './dependency-context';

async function createArrangementFixture(
  state: Parameters<typeof createConnectedOptimizationRead>[0],
) {
  const captured = createConnectedOptimizationRead(state);
  const metadata = captured.metadataByWorkPackage.get('A');
  if (metadata === undefined) throw new Error('missing fixture metadata');
  const { source } = await createLegacyWorkPackageFixture('u', 'org', 'captured-parent');
  const services = createTestServices(source);
  const service = new WorkItemService({
    ...services.stores,
    broadcast: services.broadcast,
    scheduler: services.scheduler,
    admission: LEGACY_EDIT_ADMISSION,
    externalDependencyAuthoring: INACTIVE_EXTERNAL_DEPENDENCIES,
    dependencyContext: createLocalDependencyContext(services.stores),
    clock: testClock,
    livePlans: {
      read: () => Promise.reject(new Error('unexpected owned human read')),
      readWorkPackage: () => Promise.resolve(captured),
      readExport: () => Promise.reject(new Error('unexpected export')),
      readExecution: () => Promise.reject(new Error('unexpected execution')),
      readAggregate: () => Promise.reject(new Error('unexpected aggregate')),
    },
  });
  const stamp = { at: 1, by: 'u' };
  await createBoundFixturePackage(
    source,
    'org',
    workPackageRow(metadata.workPackage),
    [
      {
        definition: {
          id: 'build',
          name: 'Build',
          code: 'build',
          position: 0,
          defaultEstimateUnit: 'workdays',
          defaultAllowancePercent: 0,
        },
        binding: {
          bindingId: 'arrangement-build-binding',
          scopeKind: 'project',
          scopeId: 'captured-parent',
          workItemTypeId: null,
          position: 0,
        },
      },
    ],
    stamp,
  );
  for (const row of metadata.workItems) await services.stores.workItems.insert(row, [], stamp);
  return { ...services, service, captured };
}

test.each(['pending', 'boundary-infeasible'] as const)(
  'connected selected optimized %s refuses without writes',
  async (state) => {
    const services = await createArrangementFixture(state);
    const before = await services.stores.workItems.listByWorkPackage('A');
    expect(await services.service.arrangeBySchedule('A', 'u')).toEqual({
      ok: false,
      reason: 'schedule_not_ready',
    });
    expect(await services.stores.workItems.listByWorkPackage('A')).toEqual(before);
    expect(services.broadcast.published).toEqual([]);
  },
);

test.each(['ready', 'ready-sibling', 'floor'] as const)(
  'connected selected optimized %s accepts the final target placement',
  async (state) => {
    const services = await createArrangementFixture(state);
    const placement = services.captured.projection.placement;
    if (placement.kind !== 'scheduled') throw new Error('missing fixture placement');
    const selected = placement.byWorkPackage.get('A');
    if (selected === undefined) throw new Error('missing fixture schedule');
    // Consumer boundary: later component selection can change final dates after the
    // target stage. Make the final row order differ from that retained stage.
    const moved = new Map(selected.workItems);
    const second = moved.get('a2');
    if (second === undefined) throw new Error('missing second row');
    moved.set('a2', {
      ...second,
      earliestStart: 0,
      earliestFinish: 1,
      latestStart: 0,
      latestFinish: 1,
    });
    const first = moved.get('a');
    if (first === undefined) throw new Error('missing first row');
    moved.set('a', {
      ...first,
      earliestStart: 2,
      earliestFinish: 3,
      latestStart: 2,
      latestFinish: 3,
    });
    const captured = {
      ...services.captured,
      projection: {
        ...services.captured.projection,
        placement: {
          ...placement,
          byWorkPackage: new Map(placement.byWorkPackage).set('A', {
            ...selected,
            workItems: moved,
          }),
        },
      },
    };
    Object.assign(services.captured, captured);
    expect(await services.service.arrangeBySchedule('A', 'u')).toEqual({ ok: true, value: null });
    expect(
      (await services.stores.workItems.listByWorkPackage('A'))
        .sort((left, right) => left.position - right.position)
        .map((row) => row.id),
    ).toEqual(['a2', 'a']);
    expect(services.broadcast.published).toHaveLength(1);
  },
);

test.each(['engine_unavailable', 'calendar_range'] as const)(
  'connected captured %s refuses without writes',
  async (reason) => {
    const services = await createArrangementFixture('ready');
    Object.assign(services.captured.projection, {
      placement:
        reason === 'engine_unavailable'
          ? { kind: reason, engine: 'optimized', workPackages: ['A'], reason: 'adapter_missing' }
          : { kind: 'unavailable', reason },
    });
    const before = await services.stores.workItems.listByWorkPackage('A');
    expect(await services.service.arrangeBySchedule('A', 'u')).toEqual({ ok: false, reason });
    expect(await services.stores.workItems.listByWorkPackage('A')).toEqual(before);
    expect(services.broadcast.published).toEqual([]);
  },
);
