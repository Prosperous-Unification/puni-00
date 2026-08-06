import { beforeEach, describe, expect, it } from 'bun:test';

import type { EstimateStore, Project, ProjectStore, WorkItemStore } from '../repository';
import { type RecordingBroadcaster, recordingBroadcaster } from '../testing/broadcast-fixture';
import { inMemoryDependencies } from '../testing/dependency-fixture';
import { inMemoryEstimates } from '../testing/estimate-fixture';
import { inMemoryProjects } from '../testing/project-fixture';
import { inMemoryWorkItems } from '../testing/work-item-fixture';
import { WorkItemService } from './work-item.service';

const OWNER = 'owner-account';

let projects: ProjectStore;
let workItems: WorkItemStore;
let estimates: EstimateStore;
let broadcast: RecordingBroadcaster;
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
    broadcast,
  });
  const project: Project = {
    id: crypto.randomUUID(),
    name: 'Rewire the shed',
    ownerId: OWNER,
    restricted: false,
    createdAt: 1,
  };
  await projects.create(project, []);
  projectId = project.id;
});

async function add(name: string, parentId: string | null = null): Promise<string> {
  const outcome = await service.create(projectId, OWNER, { parentId, afterId: null, name });
  if (!outcome.ok) throw new Error(`create failed: ${outcome.reason}`);
  return outcome.result.id;
}

// `.at` rather than an index: indexing is typed as always present, and every
// assertion here is on a payload that might legitimately not exist.
const latest = () => broadcast.published.at(-1);

describe('what a project subscriber receives', () => {
  it('sends the whole tree when a work item is created', async () => {
    await add('Strip');

    expect(latest()?.projectId).toBe(projectId);
    expect(latest()?.event.type).toBe('tree_replaced');
  });

  it('sends the whole tree when a work item moves', async () => {
    const strip = await add('Strip');
    await add('Cable');
    broadcast.published.length = 0;

    await service.move(strip, OWNER, { parentId: null, afterId: null });

    expect(latest()?.event.type).toBe('tree_replaced');
  });

  it('sends a narrow patch when an estimate changes, with the ancestors it moved', async () => {
    const strip = await add('Strip');
    const sockets = await add('Sockets', strip);
    const boxes = await add('Back boxes', sockets);
    broadcast.published.length = 0;

    await service.setEstimate(boxes, OWNER, 'role-dev', {
      optimistic: 1,
      realistic: 2,
      pessimistic: 3,
    });

    const event = latest()?.event;
    expect(event?.type).toBe('work_items_changed');
    // The edited work item and the two above it, whose totals just changed —
    // and nothing else, which is the whole point of the narrow shape.
    expect(event?.workItems.map((w) => w.name)).toEqual(['Back boxes', 'Sockets', 'Strip']);
  });

  it('sends a narrow patch when a name changes', async () => {
    const strip = await add('Strip');
    broadcast.published.length = 0;

    await service.patch(strip, OWNER, { name: 'Strip the old wiring' });

    expect(latest()?.event.type).toBe('work_items_changed');
    expect(latest()?.event.workItems.map((w) => w.name)).toEqual(['Strip the old wiring']);
  });

  it('sends the whole tree when the project is frozen', async () => {
    await add('Strip');
    broadcast.published.length = 0;

    await service.freeze(projectId, OWNER);

    expect(latest()?.event.type).toBe('tree_replaced');
  });

  it('says nothing when a mutation is refused', async () => {
    const strip = await add('Strip');
    await add('Sockets', strip);
    broadcast.published.length = 0;

    await service.remove(strip, OWNER, null);

    expect(broadcast.published).toEqual([]);
  });
});
