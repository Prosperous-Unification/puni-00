import { projectRow } from '@wbs/store-memory/project-fixture';
import { describe, expect, it } from 'bun:test';

import { inMemoryServices } from './harness';

const OWNER = 'owner-account';
const STAMP = { at: 1, by: OWNER };
const RAM = 'resource-ram';

/** A project with one leaf and a declared resource, over the harness's own stores. */
async function seeded() {
  const plan = inMemoryServices();
  const project = projectRow({ id: crypto.randomUUID(), ownerId: OWNER });
  await plan.stores.projects.create(project, [], STAMP);
  const added = await plan.stores.directory.addResource(
    { id: RAM, name: 'ram', kind: 'divisible', unitLabel: 'GB' },
    STAMP,
  );
  if (!added.ok) throw new Error('the resource was refused');
  const created = await plan.service.create(project.id, OWNER, {
    parentId: null,
    afterId: null,
    name: 'Build',
  });
  if (!created.ok) throw new Error(`create failed: ${created.reason}`);
  return { plan, projectId: project.id, leafId: created.value.id };
}

describe('the in-memory harness', () => {
  // The probe PR #585's review wrote: a harness that kept a removed row's
  // demands would hand them back to a row put back without them, so a test
  // over it could pass where production (SQLite's cascade) loses them.
  it('takes a removed row’s demands, so a row put back without them reads none', async () => {
    const { plan, projectId, leafId } = await seeded();
    const { workItems, demands } = plan.stores;
    expect(await demands.set(leafId, RAM, 4, STAMP)).toBe('written');
    const row = (await workItems.listByProject(projectId)).find(({ id }) => id === leafId);
    if (row === undefined) throw new Error('the leaf is not stored');
    await workItems.remove([leafId], [], STAMP);
    expect(await demands.listByProject(projectId)).toEqual([]);
    // The row alone, as an undo that carried no demands would write it.
    await workItems.insert(row, [], STAMP);
    expect(await demands.listByProject(projectId)).toEqual([]);
  });

  it('puts a deleted row’s demands back through the journal, and takes them on redo', async () => {
    const { plan, projectId, leafId } = await seeded();
    const { service, stores } = plan;
    expect(await service.setDemand(leafId, OWNER, RAM, 4)).toMatchObject({ ok: true });
    const stated = [{ workItemId: leafId, resourceId: RAM, units: 4 }];
    expect(await service.remove(leafId, OWNER, null)).toMatchObject({ ok: true });
    expect(await stores.demands.listByProject(projectId)).toEqual([]);
    expect(await service.undo(projectId, OWNER)).toMatchObject({ ok: true });
    expect(await stores.demands.listByProject(projectId)).toEqual(stated);
    expect(await service.redo(projectId, OWNER)).toMatchObject({ ok: true });
    expect(await stores.demands.listByProject(projectId)).toEqual([]);
  });
});
