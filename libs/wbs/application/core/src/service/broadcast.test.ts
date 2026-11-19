import { inMemoryCalendarMarkers } from '@wbs/store-memory/calendar-marker-fixture';
import { testCalendarMarkerService } from '@wbs/store-memory/testing/service-fixtures';
import type { inMemoryWorkPackages } from '@wbs/store-memory/work-package-fixture';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { beforeEach, describe, expect, it } from 'bun:test';

import type { CalendarMarkerService } from '../module/calendar-marker/calendar-marker.resource';
import type { WorkItemService } from '../module/work-item/work-item.resource';
import type { WorkPackageEvent } from '../ports/work-package-event';
import type { WorkPackage, WorkPackageStore } from '../ports/work-package-store';
import { type RecordingBroadcaster, recordingBroadcaster } from '../testing/broadcast-fixture';
import { createTestServices } from '../testing/harness';
import { createLegacyWorkPackageFixture } from '../testing/legacy-work-package-fixture';

const PROJECT_ID = 'caller-fixture-parent';
const OWNER = 'owner-account';

let workPackages: Omit<WorkPackageStore, 'setStepUnit'>;
let broadcast: RecordingBroadcaster;
let service: WorkItemService;
let workPackageId: string;

beforeEach(async () => {
  const harness = createTestServices((await createLegacyWorkPackageFixture(OWNER, 'caller-legacy', PROJECT_ID)).source, {
});
  ({ workPackages } = harness.stores);
  broadcast = harness.broadcast;
  service = harness.service;
  const workPackage: WorkPackage = workPackageRow({
    id: crypto.randomUUID(),
    projectId: PROJECT_ID,
  });
  // Seeded with the step the estimates below name — the service refuses one
  // the work package does not hold.
  await workPackages.create(
    workPackage,
    [
      {
        id: 'step-dev',
        workPackageId: workPackage.id,
        name: 'Dev',
        position: 10,
        code: 'dev',
        allowancePercent: 0,
        estimateUnit: 'workdays' as const,
      },
    ],
    { at: 1, by: OWNER },
  );
  workPackageId = workPackage.id;
});

async function add(name: string, parentId: string | null = null): Promise<string> {
  const outcome = await service.create(workPackageId, OWNER, { parentId, afterId: null, name });
  if (!outcome.ok) throw new Error(`create failed: ${outcome.reason}`);
  return outcome.value.id;
}

// `.at` rather than an index: indexing is typed as always present, and every
// assertion here is on a payload that might legitimately not exist.
const latest = () => broadcast.published.at(-1);

/**
 * The names an event carries, or a loud failure when it carries none.
 *
 * `WorkPackageEvent` also covers the step events, which carry a step rather than
 * work items, so reading `workItems` off the union needs a narrowing — and a
 * test that quietly read nothing would assert against an empty list.
 */
function namesIn(event: WorkPackageEvent | undefined): string[] {
  if (event === undefined) throw new Error('nothing was published');
  if (event.type !== 'tree_replaced') {
    throw new Error(`a ${event.type} event carries no work items`);
  }
  return event.workItems.map((each) => each.name);
}

describe('what a work package subscriber receives', () => {
  it('sends the whole tree when a work item is created', async () => {
    await add('Strip');

    expect(latest()?.workPackageId).toBe(workPackageId);
    expect(latest()?.event.type).toBe('tree_replaced');
  });

  it('sends the whole tree when a work item moves', async () => {
    const strip = await add('Strip');
    await add('Cable');
    broadcast.published.length = 0;

    await service.move(strip, OWNER, { parentId: null, afterId: null }, { kind: 'legacy' });

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

  it('sends the whole tree when the work package is frozen', async () => {
    await add('Strip');
    broadcast.published.length = 0;

    await service.freeze(workPackageId, OWNER);

    expect(latest()?.event.type).toBe('tree_replaced');
  });

  it('says nothing when a mutation is refused', async () => {
    const strip = await add('Strip');
    await add('Sockets', strip);
    broadcast.published.length = 0;

    await service.remove(strip, OWNER, null, { kind: 'legacy' });

    expect(broadcast.published).toEqual([]);
  });
});

/**
 * Slice 9.1. A marker is the one work-package-scoped object a collaborator can add
 * that moves no work item, so nothing this work package already announces covers it:
 * `tree_replaced` is wrong (no row changed) and `directory_changed` is wrong
 * (the vocabulary is untouched). Without its own event the second client's axis
 * stays as it was until something unrelated forces a re-read.
 *
 * Content-free, for `saved_plans_changed`'s reason: a client reads a work package's
 * markers as one list, so the only useful thing to say is "read again", and
 * carrying the row would announce a marker to every reader of the work package
 * before the list route has decided what that reader may see.
 *
 * **Watched negative:** with the `await this.announce(workPackageId)` line deleted
 * from `CalendarMarkerService.remove` and nothing else changed, exactly the two
 * cases that reach a delete fail — `deleting one` on its single event and
 * `all four` on its fourth — while the refusal case stays green. Watched that
 * way on h2puni, 2026-09-06. The delete is called out on its own because it is
 * the write a client cannot recover from by re-reading something else: there is
 * nothing left on the axis to notice is missing.
 */
describe('a calendar marker write announces itself', () => {
  const ACTOR = 'owner-account';
  let markerWorkPackages: ReturnType<typeof inMemoryWorkPackages>;
  let recorder: RecordingBroadcaster;
  let markerService: CalendarMarkerService;
  let markerWorkPackageId: string;

  beforeEach(async () => {
    markerWorkPackages = (await createLegacyWorkPackageFixture(ACTOR, 'caller-legacy', PROJECT_ID))
      .workPackages;
    recorder = recordingBroadcaster();
    markerService = testCalendarMarkerService(
      markerWorkPackages,
      inMemoryCalendarMarkers(),
      undefined,
      recorder,
    );
    const workPackage = workPackageRow({ id: crypto.randomUUID(), projectId: PROJECT_ID });
    await markerWorkPackages.create(workPackage, [], { at: 1, by: ACTOR });
    markerWorkPackageId = workPackage.id;
  });

  /** The one event, so every case below states the whole payload it expects. */
  const CHANGED: WorkPackageEvent = { type: 'calendar_markers_changed' };

  async function makeMarker(): Promise<string> {
    const created = await markerService.create(markerWorkPackageId, ACTOR, {
      date: '2026-08-24',
      name: 'Client demo',
    });
    if (!created.ok) throw new Error(`create failed: ${created.reason}`);
    return created.value.id;
  }

  it('announces one content-free event per write, on all four', async () => {
    const id = await makeMarker();
    await markerService.rename(markerWorkPackageId, id, ACTOR, 'Client demo, moved');
    await markerService.recolor(markerWorkPackageId, id, ACTOR, '#3b82f6');
    await markerService.remove(markerWorkPackageId, id, ACTOR);

    // Four writes, four announcements, in write order and each carrying
    // nothing: `toEqual` on the whole list is what makes "content-free" an
    // assertion rather than a claim about a field nobody reads.
    expect(recorder.published).toEqual([
      { workPackageId: markerWorkPackageId, event: CHANGED },
      { workPackageId: markerWorkPackageId, event: CHANGED },
      { workPackageId: markerWorkPackageId, event: CHANGED },
      { workPackageId: markerWorkPackageId, event: CHANGED },
    ]);
  });

  it('announces deleting one, which is the write a re-read cannot recover', async () => {
    const id = await makeMarker();
    recorder.published.length = 0;

    await markerService.remove(markerWorkPackageId, id, ACTOR);

    expect(recorder.published).toEqual([{ workPackageId: markerWorkPackageId, event: CHANGED }]);
  });

  it('announces nothing for a write it refused', async () => {
    // Both refusals the gate can give, because an event on either would tell
    // every reader of a work package to go and read a list that did not change, on
    // nothing but somebody else's rejected attempt.
    //
    // `not-the-owner` needs a **restricted** work package to be refused: `canEditWorkPackage`
    // is `!restricted || ownerId === actorId`, so a stranger writing to an
    // ordinary work package is allowed here and is not the negative this case wants.
    const restricted = workPackageRow({
      id: crypto.randomUUID(),
      projectId: PROJECT_ID,
      restricted: true,
    });
    await markerWorkPackages.create(restricted, [], { at: 1, by: ACTOR });

    const absent = await markerService.create('no-such-work-package', ACTOR, {
      date: '2026-08-24',
      name: 'Client demo',
    });
    const stranger = await markerService.create(restricted.id, 'not-the-owner', {
      date: '2026-08-24',
      name: 'Client demo',
    });

    // `about: 'workPackage'` on both: the work package is the thing that was missing
    // or closed, and neither refusal is about the marker the body described
    // (TASK-279 AC #7).
    expect(absent).toEqual({ ok: false, reason: 'not_found', about: 'work_package' });
    expect(stranger).toEqual({ ok: false, reason: 'forbidden', about: 'work_package' });
    expect(recorder.published).toEqual([]);
  });
});
