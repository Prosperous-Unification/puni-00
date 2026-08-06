import { beforeEach, describe, expect, it } from 'bun:test';

import type { EstimateStore, Project, ProjectStore, WorkItemStore } from '../repository';
import { recordingBroadcaster } from '../testing/broadcast-fixture';
import { inMemoryDependencies } from '../testing/dependency-fixture';
import { inMemoryDirectory } from '../testing/directory-fixture';
import { inMemoryEstimates } from '../testing/estimate-fixture';
import { inMemoryProjects } from '../testing/project-fixture';
import { inMemoryWorkItems } from '../testing/work-item-fixture';
import type { Days } from './roll-up';
import { WorkItemService } from './work-item.service';

const OWNER = 'owner-account';
const DEV = 'role-dev';
const QA = 'role-qa';

let projects: ProjectStore;
let workItems: WorkItemStore;
let estimates: EstimateStore;
let broadcast: ReturnType<typeof recordingBroadcaster>;
let service: WorkItemService;
let projectId: string;

beforeEach(async () => {
  projects = inMemoryProjects();
  workItems = inMemoryWorkItems();
  estimates = inMemoryEstimates(workItems);
  broadcast = recordingBroadcaster();
  service = new WorkItemService({
    workItems,
    projects,
    estimates,
    dependencies: inMemoryDependencies(),
    directory: inMemoryDirectory(),
    broadcast,
  });
  const project: Project = {
    id: crypto.randomUUID(),
    name: 'Rewire the shed',
    ownerId: OWNER,
    restricted: false,
    estimateMethod: 'pert',
    startDate: null,
    createdAt: 1,
  };
  await projects.create(project, []);
  projectId = project.id;
});

const days = (optimistic: number, realistic: number, pessimistic: number): Days => ({
  optimistic,
  realistic,
  pessimistic,
});

async function add(name: string, parentId: string | null = null): Promise<string> {
  const outcome = await service.create(projectId, OWNER, { parentId, afterId: null, name });
  if (!outcome.ok) throw new Error(`create failed: ${outcome.reason}`);
  return outcome.result.id;
}

/**
 * Estimates by work item name. A Map rather than a Record because indexing a
 * Record is typed as always present, and every assertion below turns on the
 * difference between a role that is absent and one that is zero.
 */
async function shown(): Promise<Map<string, Record<string, Days>>> {
  const tree = await service.tree(projectId);
  if (tree === null) throw new Error('project vanished');
  return new Map(tree.workItems.map((w) => [w.name, w.estimates]));
}

describe('setting estimates', () => {
  it('stores an estimate against a leaf and shows it in the tree', async () => {
    const strip = await add('Strip');

    await service.setEstimate(strip, OWNER, DEV, days(1, 2, 3));

    expect((await shown()).get('Strip')?.[DEV]).toEqual(days(1, 2, 3));
  });

  it('refuses an estimate on a work item that has children', async () => {
    // Its figures are the sum of what is below it. A stored estimate here would
    // either be ignored or double-counted, and neither is visible to whoever
    // typed it.
    const strip = await add('Strip');
    await add('Sockets', strip);

    const outcome = await service.setEstimate(strip, OWNER, DEV, days(1, 2, 3));

    expect(outcome).toEqual({ ok: false, reason: 'rolled_up' });
  });

  it('marks a parent as rolled up and a leaf as not', async () => {
    const strip = await add('Strip');
    await add('Sockets', strip);

    const tree = await service.tree(projectId);
    const byName = new Map(tree?.workItems.map((w) => [w.name, w.rolledUp]));
    expect(byName.get('Strip')).toBe(true);
    expect(byName.get('Sockets')).toBe(false);
  });
});

describe('estimates follow the first and last child', () => {
  it('hands the estimate down when a first child arrives', async () => {
    const strip = await add('Strip');
    await service.setEstimate(strip, OWNER, DEV, days(1, 2, 3));

    await add('Sockets', strip);

    const tree = await shown();
    // The child now holds it, and the parent still reports the same total —
    // which is what makes the move safe to do without asking.
    expect(tree.get('Sockets')?.[DEV]).toEqual(days(1, 2, 3));
    expect(tree.get('Strip')?.[DEV]).toEqual(days(1, 2, 3));
  });

  it('takes the estimate back when the last child goes', async () => {
    const strip = await add('Strip');
    await service.setEstimate(strip, OWNER, DEV, days(1, 2, 3));
    const sockets = await add('Sockets', strip);

    await service.remove(sockets, OWNER, 'cascade');

    expect((await shown()).get('Strip')?.[DEV]).toEqual(days(1, 2, 3));
  });

  it('leaves the estimate alone when a second child arrives', async () => {
    const strip = await add('Strip');
    await service.setEstimate(strip, OWNER, DEV, days(1, 2, 3));
    await add('Sockets', strip);

    await add('Switches', strip);

    const tree = await shown();
    expect(tree.get('Sockets')?.[DEV]).toEqual(days(1, 2, 3));
    expect(tree.get('Switches')?.[DEV]).toBeUndefined();
  });
});

describe('roll-up through the tree', () => {
  it('sums two children into their parent, per role', async () => {
    const strip = await add('Strip');
    const one = await add('Sockets', strip);
    const two = await add('Switches', strip);
    await service.setEstimate(one, OWNER, DEV, days(1, 2, 3));
    await service.setEstimate(two, OWNER, DEV, days(2, 3, 4));
    await service.setEstimate(one, OWNER, QA, days(0.5, 0.5, 1));

    const tree = await shown();

    expect(tree.get('Strip')?.[DEV]).toEqual(days(3, 5, 7));
    expect(tree.get('Strip')?.[QA]).toEqual(days(0.5, 0.5, 1));
  });

  it('omits a role no descendant estimated', async () => {
    const strip = await add('Strip');
    const one = await add('Sockets', strip);
    await service.setEstimate(one, OWNER, DEV, days(1, 2, 3));

    expect((await shown()).get('Strip')?.[QA]).toBeUndefined();
  });
});
