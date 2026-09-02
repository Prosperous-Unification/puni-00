import { beforeEach, describe, expect, it } from 'bun:test';

import type { Project, ProjectStore } from '../repository';
import { type RecordingBroadcaster } from '../testing/broadcast-fixture';
import { inMemoryServices } from '../testing/harness';
import { projectRow } from '../testing/project-fixture';
import type { ProjectEvent } from './broadcast';
import type { WorkItemService } from './work-item.service';

const OWNER = 'owner-account';

let projects: ProjectStore;
let broadcast: RecordingBroadcaster;
let service: WorkItemService;
let projectId: string;

beforeEach(async () => {
  const harness = inMemoryServices();
  ({ projects } = harness.stores);
  broadcast = harness.broadcast;
  service = harness.service;
  const project: Project = projectRow({
    id: crypto.randomUUID(),
    ownerId: OWNER,
  });
  // Seeded with the step the estimates below name — the service refuses one
  // the project does not hold.
  await projects.create(
    project,
    [{ id: 'step-dev', projectId: project.id, name: 'Dev', position: 10 }],
    { at: 1, by: OWNER },
  );
  projectId = project.id;
});

async function add(name: string, parentId: string | null = null): Promise<string> {
  const outcome = await service.create(projectId, OWNER, { parentId, afterId: null, name });
  if (!outcome.ok) throw new Error(`create failed: ${outcome.reason}`);
  return outcome.value.id;
}

// `.at` rather than an index: indexing is typed as always present, and every
// assertion here is on a payload that might legitimately not exist.
const latest = () => broadcast.published.at(-1);

/**
 * The names an event carries, or a loud failure when it carries none.
 *
 * `ProjectEvent` also covers the step events, which carry a step rather than
 * work items, so reading `workItems` off the union needs a narrowing — and a
 * test that quietly read nothing would assert against an empty list.
 */
function namesIn(event: ProjectEvent | undefined): string[] {
  if (event === undefined) throw new Error('nothing was published');
  if (event.type !== 'tree_replaced') {
    throw new Error(`a ${event.type} event carries no work items`);
  }
  return event.workItems.map((each) => each.name);
}

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

  // A cell edit used to send the edited row and its ancestors. It cannot any
  // more: every write arrives in a batch, the batch announces once after it
  // commits, and there is no single row to name. What these two hold is that a
  // figure edit and a name edit each still reach subscribers, carrying the
  // whole plan and therefore the ancestors whose totals moved with it.
  it('sends the whole tree when an estimate changes, ancestors included', async () => {
    const strip = await add('Strip');
    const sockets = await add('Sockets', strip);
    const boxes = await add('Back boxes', sockets);
    broadcast.published.length = 0;

    await service.setEstimate(boxes, OWNER, 'step-dev', {
      optimistic: 1,
      realistic: 2,
      pessimistic: 3,
    });

    const event = latest()?.event;
    expect(event?.type).toBe('tree_replaced');
    expect(namesIn(event)).toEqual(['Strip', 'Sockets', 'Back boxes']);
  });

  it('sends the whole tree when a name changes', async () => {
    const strip = await add('Strip');
    broadcast.published.length = 0;

    await service.patch(strip, OWNER, { name: 'Strip the old wiring' });

    expect(latest()?.event.type).toBe('tree_replaced');
    expect(namesIn(latest()?.event)).toEqual(['Strip the old wiring']);
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
