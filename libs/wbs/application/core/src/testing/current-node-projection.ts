import { expect } from 'bun:test';

import { servicesOver } from '../compose';
import { clockOf } from '../ports/clock';
import { LEGACY_EDIT_ADMISSION } from '../ports/edit-admission';
import type { Source } from '../ports/source';
import { createLocalDependencyContext } from '../service/dependency-context';
import { recordingBroadcaster } from './broadcast-fixture';
import { CLAIM_DEV, CLAIM_QA, seedCurrentClaimObservation } from './current-claim-observation';
import { fastScheduler } from './scheduler-fixture';
import type { StepCatalogueSeed } from './step-catalogue-seed';

/** Actual Source reads retain each resolved node and stored progress through hold reduction. */
export async function assertCurrentNodeProjection(
  source: Source,
  seed: StepCatalogueSeed,
  hasDistinctSets: boolean,
  isHeld: boolean,
  purpose: 'readings' | 'resources',
): Promise<void> {
  await seedCurrentClaimObservation(source, seed);
  if (hasDistinctSets)
    expect(
      (
        await source.stores.stepCatalogue.unbindStep(
          seed.organizationId,
          CLAIM_QA + ':second',
          { dryRun: false },
          seed.stamp,
        )
      ).kind,
    ).toBe('unbound');
  for (const workItemId of ['claim-first', 'claim-second']) {
    expect(
      await source.stores.progress.set(
        { workItemId, stepId: CLAIM_DEV, state: 'done', statedAt: seed.stamp.at },
        seed.stamp,
      ),
    ).toBe('written');
    expect(
      (await source.stores.workItems.patch(workItemId, { maxParallel: 3 }, seed.stamp)).ok,
    ).toBe(true);
  }
  if (isHeld)
    expect(
      (await source.stores.workItems.patch('claim-first', { hold: 'on_hold' }, seed.stamp)).ok,
    ).toBe(true);
  const progress = await source.stores.progress.listByWorkPackage(seed.workPackageId);
  const service = servicesOver(source.stores, {
    dependencyContext: createLocalDependencyContext(source.stores),
    admission: LEGACY_EDIT_ADMISSION,
    clock: clockOf({ now: () => seed.stamp.at, newId: () => 'unused-node-read-id' }),
    broadcast: recordingBroadcaster(),
    scheduler: fastScheduler,
  }).workItems;
  const tree = await service.tree(seed.workPackageId);
  if (tree === null || 'kind' in tree) throw new Error('Actual current node tree absent');
  const first = tree.workItems.find((row) => row.id === 'claim-first');
  const second = tree.workItems.find((row) => row.id === 'claim-second');
  const empty = tree.workItems.find((row) => row.id === 'claim-empty');
  const parent = tree.workItems.find((row) => row.id === 'claim-parent');
  if (first === undefined || second === undefined || empty === undefined || parent === undefined)
    throw new Error('Actual current node owner absent');
  if (purpose === 'readings') {
    expect(first.nodeReadings).toEqual({
      [CLAIM_DEV]: 'done',
      [CLAIM_QA]: isHeld ? 'on_hold' : 'waiting',
    });
    expect(Object.keys(first.nodeReadings ?? {})).toEqual([CLAIM_DEV, CLAIM_QA]);
    expect(second.nodeReadings).toEqual(
      hasDistinctSets ? { [CLAIM_DEV]: 'done' } : { [CLAIM_QA]: 'unknown', [CLAIM_DEV]: 'done' },
    );
    expect(Object.keys(second.nodeReadings ?? {})).toEqual(
      hasDistinctSets ? [CLAIM_DEV] : [CLAIM_QA, CLAIM_DEV],
    );
    expect(empty.nodeReadings).toEqual({});
    expect(parent).not.toHaveProperty('nodeReadings');
  } else {
    expect(Object.keys(first.nodeResources ?? {})).toEqual([CLAIM_DEV, CLAIM_QA]);
    expect(Object.keys(second.nodeResources ?? {})).toEqual(
      hasDistinctSets ? [CLAIM_DEV] : [CLAIM_QA, CLAIM_DEV],
    );
    expect(first.nodeResources?.[CLAIM_DEV]).toEqual({
      nodeId: 'sn1.claim-first.' + CLAIM_DEV,
      assignment: { kind: 'unassigned' },
      teams: { kind: 'unstated' },
      maxParallel: 3,
      width: 3,
    });
    expect(empty.nodeResources).toEqual({});
    expect(parent).not.toHaveProperty('nodeResources');
  }
  expect(await source.stores.progress.listByWorkPackage(seed.workPackageId)).toEqual(progress);
  const input = await service.scheduleInput(seed.workPackageId);
  if (input === null) throw new Error('Actual current scheduling input absent');
  expect(input.slices.some((slice) => slice.workItemId === 'claim-first')).toBe(!isHeld);
}
