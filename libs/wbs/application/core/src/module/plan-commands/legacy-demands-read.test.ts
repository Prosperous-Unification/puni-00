import { openMemorySourceFixture } from '@wbs/store-memory/source';
import { describe, expect, it } from 'bun:test';

import { servicesOver } from '../../compose';
import { CREATOR_ADMISSION } from '../../ports/edit-admission';
import { LEGACY_ACCESS } from '../../ports/organization-access';
import type { Scope } from '../../ports/unit-of-work';
import { createLocalDependencyContext } from '../../service/dependency-context';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { testClock } from '../../testing/clock-fixture';
import { expectCreated } from '../../testing/expect-created';
import { localCommandAccess } from '../../testing/organization-access-fixture';
import { fastScheduler } from '../../testing/scheduler-fixture';
import { workItemRow } from '../../testing/work-item-fixture';
import { createPlanCommandRunner } from './composition';

const F = 'account-f';

/**
 * The tree read's demand fields before organization activation (`wbs-resources`
 * 1.5, legacy access): root names, and the panel's two-statement batch undone
 * by one Undo.
 */
/** One project with leaf `090` and the plan-command runner over a fresh memory source. */
async function planOfOneLeaf(extraLeaf = false) {
  const { source } = openMemorySourceFixture();
  const broadcast = recordingBroadcaster();
  const options = {
    dependencyContext: createLocalDependencyContext(source.stores),
    admission: CREATOR_ADMISSION,
    clock: testClock,
    broadcast,
    scheduler: fastScheduler,
  };
  const graph = servicesOver(source.stores, options);
  await source.stores.users.create(
    { id: F, username: F, passwordHash: 'x', createdAt: 1 },
    { at: 1, by: F },
  );
  const created = expectCreated(await graph.projects.create('L', F));
  const projectId = created.project.id;
  for (const step of created.steps)
    await source.stores.steps.add(
      { id: step.id, projectId, name: step.name, allowancePercent: 0, estimateUnit: 'workdays' },
      { at: 1, by: F },
    );
  await source.stores.workItems.insert(
    workItemRow({ id: '090', projectId, parentId: null, position: 1 }),
    [],
    { at: 1, by: F },
  );
  if (extraLeaf)
    await source.stores.workItems.insert(
      workItemRow({ id: '095', projectId, parentId: null, position: 2 }),
      [],
      { at: 1, by: F },
    );
  const runner = createPlanCommandRunner({
    uow: source.uow,
    commandAccess: localCommandAccess,
    announcements: broadcast,
    publicServices: graph,
    batchServices: (scope: Scope, announcements) =>
      servicesOver(scope.stores, {
        ...options,
        dependencyContext: createLocalDependencyContext(scope.stores),
        broadcast: announcements,
      }),
  });
  return { source, graph, runner, projectId, steps: created.steps };
}

describe('demands on the tree read before activation', () => {
  it('names root resources, and one Undo takes a two-statement batch back', async () => {
    const { source, graph, runner, projectId } = await planOfOneLeaf();
    const declared = await runner.runDirectory(F, [
      { kind: 'createResource', name: 'staging', resourceKind: 'exclusive', unitLabel: 'env' },
      { kind: 'createResource', name: 'ram', resourceKind: 'divisible', unitLabel: 'GB' },
    ]);
    if (!declared.ok) throw new Error('the resources were not declared');
    const [staging, ram] = declared.results.map(({ id }) => id);
    if (staging === undefined || ram === undefined) throw new Error('a resource minted no id');

    const before = await graph.workItems.treeWithin(projectId, LEGACY_ACCESS);
    expect(before).not.toHaveProperty('demands');
    expect(before).not.toHaveProperty('demandedResources');

    const applied = await runner.run(projectId, F, [
      { kind: 'setDemand', workItemId: '090', resourceId: staging, units: 1 },
      { kind: 'setDemand', workItemId: '090', resourceId: ram, units: 4 },
    ]);
    expect(applied.ok).toBe(true);
    // Proof: with the legacy branch answering the tree alone, this failed on
    // `expect(received).toMatchObject(expected)` with no `demands`; watched 2026-10-25.
    expect(await graph.workItems.treeWithin(projectId, LEGACY_ACCESS)).toMatchObject({
      demands: [
        { workItemId: '090', resourceId: ram, units: 4 },
        { workItemId: '090', resourceId: staging, units: 1 },
      ].sort((a, b) => a.resourceId.localeCompare(b.resourceId)),
      demandedResources: [
        { id: staging, name: 'staging', kind: 'exclusive', unitLabel: 'env' },
        { id: ram, name: 'ram', kind: 'divisible', unitLabel: 'GB' },
      ].sort((a, b) => a.id.localeCompare(b.id)),
    });

    const undone = await graph.workItems.undo(projectId, F);
    expect(undone).toMatchObject({ ok: true });
    const back = await graph.workItems.treeWithin(projectId, LEGACY_ACCESS);
    expect(back).not.toHaveProperty('demands');
    await source.close();
  });
});

describe('a resource removed between the tree read and its labels', () => {
  it('labels a bar of a resource removed between the two reads', async () => {
    const { source, graph, runner, projectId, steps } = await planOfOneLeaf(true);
    const declared = await runner.runDirectory(F, [
      { kind: 'createResource', name: 'staging', resourceKind: 'exclusive', unitLabel: 'env' },
    ]);
    if (!declared.ok) throw new Error('the resource was not declared');
    const staging = declared.results[0]?.id;
    if (staging === undefined) throw new Error('staging minted no id');
    const applied = await runner.run(projectId, F, [
      ...['090', '095'].flatMap((workItemId) => [
        ...steps.map((step) => ({
          kind: 'setEstimate' as const,
          workItemId,
          stepId: step.id,
          days: { optimistic: 2, realistic: 2, pessimistic: 2 },
        })),
        { kind: 'setDemand' as const, workItemId, resourceId: staging, units: 1 },
      ]),
      { kind: 'setResourceCapacity', resourceId: staging, units: 1 },
    ]);
    expect(applied.ok).toBe(true);
    const levelled = await graph.workItems.treeWithin(projectId, LEGACY_ACCESS);
    expect(levelled).toHaveProperty('resourceLabels');
    // The catalog read beside the labels answers after a cascade removed
    // staging: the schedule just read still waits for it.
    const directory = source.stores.directory;
    const listResources = directory.listResources.bind(directory);
    let removed = false;
    directory.listResources = async () => {
      if (!removed) {
        removed = true;
        const gone = await runner.runDirectory(F, [
          { kind: 'deleteResource', resourceId: staging, cascade: true },
        ]);
        expect(gone.ok).toBe(true);
      }
      return listResources();
    };
    const after = await graph.workItems.treeWithin(projectId, LEGACY_ACCESS);
    expect(after).not.toHaveProperty('resourceLabels');
    expect(after).not.toHaveProperty('demands');
    await source.close();
  });
});
