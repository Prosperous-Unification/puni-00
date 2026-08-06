import { beforeEach, describe, expect, it } from 'bun:test';

import type { Project, ProjectStore, WorkItemStore } from '../repository';
import { recordingBroadcaster } from '../testing/broadcast-fixture';
import { inMemoryDependencies } from '../testing/dependency-fixture';
import { inMemoryEstimates } from '../testing/estimate-fixture';
import { inMemoryProjects } from '../testing/project-fixture';
import { inMemoryWorkItems } from '../testing/work-item-fixture';
import { WorkItemService } from './work-item.service';

const OWNER = 'owner-account';
const STRANGER = 'stranger-account';

let projects: ProjectStore;
let workItems: WorkItemStore;
let service: WorkItemService;
let projectId: string;
let roleId: string;
let dependencies: ReturnType<typeof inMemoryDependencies>;

beforeEach(async () => {
  projects = inMemoryProjects();
  workItems = inMemoryWorkItems();
  dependencies = inMemoryDependencies();
  service = new WorkItemService({
    workItems,
    projects,
    estimates: inMemoryEstimates(workItems),
    dependencies,
    broadcast: recordingBroadcaster(),
  });
  const project: Project = {
    id: crypto.randomUUID(),
    name: 'Rewire the shed',
    ownerId: OWNER,
    restricted: false,
    createdAt: 1,
  };
  roleId = crypto.randomUUID();
  await projects.create(project, [{ id: roleId, projectId: project.id, name: 'Dev' }]);
  projectId = project.id;
});

/** Creates under `parentId`, after `afterId`, returning the new id. */
async function add(name: string, parentId: string | null = null, afterId: string | null = null) {
  const outcome = await service.create(projectId, OWNER, { parentId, afterId, name });
  if (!outcome.ok) throw new Error(`create failed: ${outcome.reason}`);
  return outcome.result.id;
}

/** The project's work items as `number → name`, which is what a reader actually sees. */
async function numbered(): Promise<Record<string, string>> {
  const tree = await service.tree(projectId);
  if (tree === null) throw new Error('project vanished');
  return Object.fromEntries(tree.workItems.map((w) => [w.number, w.name]));
}

describe('creating work items', () => {
  it('numbers roots in the order they are added', async () => {
    const first = await add('Strip the old wiring');
    await add('Run the new cable', null, first);

    expect(await numbered()).toEqual({
      '010': 'Strip the old wiring',
      '020': 'Run the new cable',
    });
  });

  it('inserts between two siblings without writing either', async () => {
    const first = await add('Strip');
    await add('Cable', null, first);

    await add('Survey', null, first);

    expect(await numbered()).toEqual({ '010': 'Strip', '020': 'Survey', '030': 'Cable' });
  });

  it('nests children under their parent', async () => {
    const strip = await add('Strip');
    const socket = await add('Sockets', strip);
    await add('Back boxes', socket);

    expect(await numbered()).toEqual({
      '010': 'Strip',
      '010.1': 'Sockets',
      '010.1.1': 'Back boxes',
    });
  });

  it('accepts an empty name', async () => {
    await add('');
    expect(await numbered()).toEqual({ '010': '' });
  });

  it('refuses a stranger on a restricted project', async () => {
    await projects.update(projectId, { restricted: true });

    const outcome = await service.create(projectId, STRANGER, {
      parentId: null,
      afterId: null,
      name: 'Sneaky',
    });

    expect(outcome).toEqual({ ok: false, reason: 'forbidden' });
    expect(await numbered()).toEqual({});
  });
});

describe('moving work items', () => {
  it('renumbers everything the move displaced', async () => {
    const strip = await add('Strip');
    const cable = await add('Cable', null, strip);

    const outcome = await service.move(cable, OWNER, { parentId: null, afterId: null });

    expect(outcome.ok).toBe(true);
    expect(await numbered()).toEqual({ '010': 'Cable', '020': 'Strip' });
  });

  it('re-parents into another branch', async () => {
    const strip = await add('Strip');
    const cable = await add('Cable', null, strip);

    await service.move(cable, OWNER, { parentId: strip, afterId: null });

    expect(await numbered()).toEqual({ '010': 'Strip', '010.1': 'Cable' });
  });

  it('refuses to move a work item beneath itself', async () => {
    // Left unchecked this detaches the subtree from every root: the rows still
    // exist, no number can be derived for them, and the project reads as if the
    // work simply vanished.
    const strip = await add('Strip');
    const sockets = await add('Sockets', strip);

    const outcome = await service.move(strip, OWNER, { parentId: sockets, afterId: null });

    expect(outcome).toEqual({ ok: false, reason: 'cycle' });
    expect(await numbered()).toEqual({ '010': 'Strip', '010.1': 'Sockets' });
  });
});

describe('deleting work items', () => {
  it('removes a leaf and closes the gap', async () => {
    const strip = await add('Strip');
    const cable = await add('Cable', null, strip);
    await add('Test', null, cable);

    await service.remove(cable, OWNER, null);

    expect(await numbered()).toEqual({ '010': 'Strip', '020': 'Test' });
  });

  it('refuses a parent with no strategy, writing nothing', async () => {
    const strip = await add('Strip');
    await add('Sockets', strip);

    const outcome = await service.remove(strip, OWNER, null);

    expect(outcome).toEqual({ ok: false, reason: 'strategy_required' });
    expect(await numbered()).toEqual({ '010': 'Strip', '010.1': 'Sockets' });
  });

  it('cascade takes the whole subtree', async () => {
    const strip = await add('Strip');
    const sockets = await add('Sockets', strip);
    await add('Back boxes', sockets);
    await add('Cable', null, strip);

    await service.remove(strip, OWNER, 'cascade');

    expect(await numbered()).toEqual({ '010': 'Cable' });
  });

  it('promote lifts children into their parent’s place, in order', async () => {
    const strip = await add('Strip');
    const sockets = await add('Sockets', strip);
    await add('Switches', strip, sockets);
    await add('Cable', null, strip);

    await service.remove(strip, OWNER, 'promote');

    expect(await numbered()).toEqual({
      '010': 'Sockets',
      '020': 'Switches',
      '030': 'Cable',
    });
  });
});

describe('dependencies', () => {
  it('records an edge and reports it against the dependent work item', async () => {
    const a = await add('Strip');
    const b = await add('Sand');

    expect(await service.addDependency(b, OWNER, a)).toEqual({ ok: true, result: null });

    const tree = await service.tree(projectId);
    expect(tree?.workItems.find((w) => w.id === b)?.dependsOn).toEqual([a]);
    expect(tree?.workItems.find((w) => w.id === a)?.dependsOn).toEqual([]);
  });

  it('refuses an edge that closes a cycle and writes nothing', async () => {
    const a = await add('Strip');
    const b = await add('Sand');
    await service.addDependency(b, OWNER, a);

    expect(await service.addDependency(a, OWNER, b)).toEqual({ ok: false, reason: 'cycle' });

    const tree = await service.tree(projectId);
    expect(tree?.workItems.find((w) => w.id === a)?.dependsOn).toEqual([]);
  });

  it('refuses an edge onto its own parent', async () => {
    const parent = await add('Phase');
    const child = await add('Task', parent);

    expect(await service.addDependency(child, OWNER, parent)).toEqual({
      ok: false,
      reason: 'ancestor',
    });
  });

  it('refuses a predecessor that is not in the project', async () => {
    const a = await add('Strip');

    expect(await service.addDependency(a, OWNER, crypto.randomUUID())).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });

  it('removes an edge, and removing one that is not there is not an error', async () => {
    const a = await add('Strip');
    const b = await add('Sand');
    await service.addDependency(b, OWNER, a);

    expect(await service.removeDependency(b, OWNER, a)).toEqual({ ok: true, result: null });
    expect(await service.removeDependency(b, OWNER, a)).toEqual({ ok: true, result: null });

    const tree = await service.tree(projectId);
    expect(tree?.workItems.find((w) => w.id === b)?.dependsOn).toEqual([]);
  });

  it("takes a work item's edges with it when it is deleted", async () => {
    // The foreign keys refuse a delete that would orphan an edge, so this is not
    // tidiness — without it, deleting a row that anything depends on fails.
    const a = await add('Strip');
    const b = await add('Sand');
    await service.addDependency(b, OWNER, a);

    expect(await service.remove(a, OWNER, null)).toEqual({ ok: true, result: null });

    const tree = await service.tree(projectId);
    expect(tree?.workItems.find((w) => w.id === b)?.dependsOn).toEqual([]);
  });

  it('takes the edges when a parent is deleted and its children are promoted', async () => {
    // The other delete path. It removes one row rather than a subtree, and it
    // had no edge cleanup at all — found by asking whether the first fix covered
    // both branches rather than assuming the tests would have said.
    const parent = await add('Phase');
    await add('Task', parent);
    const other = await add('Sand');
    await service.addDependency(other, OWNER, parent);

    expect(await service.remove(parent, OWNER, 'promote')).toEqual({ ok: true, result: null });

    const tree = await service.tree(projectId);
    expect(tree?.workItems.find((w) => w.id === other)?.dependsOn).toEqual([]);
  });

  it('still reads a project whose dependencies contain a cycle', async () => {
    // The write path refuses a cycle, but two clients drawing conflicting edges
    // at the same instant are each checked against the graph as they read it.
    // If that ever lands, every read of the project must not throw — the rows
    // are still there and a plan nobody can open is worse than one with no
    // dates in it.
    const a = await add('Strip');
    const b = await add('Sand');
    await dependencies.add({ id: 'x', projectId, predecessorId: a, successorId: b });
    await dependencies.add({ id: 'y', projectId, predecessorId: b, successorId: a });

    const tree = await service.tree(projectId);

    expect(tree?.workItems).toHaveLength(2);
    expect(tree?.scheduleError).toBe('cycle');
    expect(tree?.workItems[0]?.schedule).toMatchObject({ earliestStart: 0, estimated: false });
  });

  it('lets a failure that is not a cycle out rather than calling it one', async () => {
    // codex, high. An unqualified catch turned every exception in that block
    // into "your dependencies run in a circle" — a stack overflow on a deep
    // tree, a future mistake in the duration sum, anything. R5: unknown is not
    // OK, and a confident wrong answer is the worst kind.
    const a = await add('Strip');
    const broken = {
      ...dependencies,
      listByProject: () => Promise.reject(new Error('the dependency table is on fire')),
    };
    const service2 = new WorkItemService({
      workItems,
      projects,
      estimates: inMemoryEstimates(workItems),
      dependencies: broken,
      broadcast: recordingBroadcaster(),
    });

    expect(service2.tree(projectId)).rejects.toThrow(/on fire/);
    expect(a).toBeDefined();
  });

  it('does not report a predecessor that is not in the project', async () => {
    const a = await add('Strip');
    await dependencies.add({
      id: 'stray',
      projectId,
      predecessorId: crypto.randomUUID(),
      successorId: a,
    });

    const tree = await service.tree(projectId);

    expect(tree?.workItems.find((w) => w.id === a)?.dependsOn).toEqual([]);
  });

  it('reports no schedule error for a project that schedules', async () => {
    await add('Strip');

    expect((await service.tree(projectId))?.scheduleError).toBeNull();
  });

  it('schedules a dependent work item after the one it waits for', async () => {
    const a = await add('Strip');
    const b = await add('Sand');
    await service.setEstimate(a, OWNER, roleId, { optimistic: 2, realistic: 2, pessimistic: 2 });
    await service.setEstimate(b, OWNER, roleId, { optimistic: 3, realistic: 3, pessimistic: 3 });
    await service.addDependency(b, OWNER, a);

    const tree = await service.tree(projectId);
    const sand = tree?.workItems.find((w) => w.id === b)?.schedule;

    expect(sand).toMatchObject({ earliestStart: 2, earliestFinish: 5, critical: true });
  });
});
