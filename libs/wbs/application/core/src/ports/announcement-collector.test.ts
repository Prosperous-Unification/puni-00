import { describe, expect, it } from 'bun:test';

import { recordingBroadcaster } from '../testing/broadcast-fixture';
import { AnnouncementCollector } from './announcement-collector';

/**
 * What the nested-hold guard was for, and what replaced it.
 *
 * The guard lived on `DeferringBroadcaster`, whose queue was an
 * `AsyncLocalStorage` store: a hold opened inside another hold's own context
 * shadowed its parent's, so the parent committed having been told nothing about
 * what the child announced. There is no such window now — a collector is an
 * object a graph was built over, and two batches are two objects — so the guard
 * is gone with the class rather than left standing over a case that cannot
 * happen.
 *
 * What is left to hold is what the collector actually promises: nothing leaves
 * until it is drained, the dedupe rule for content-free events, and the order.
 */
describe('a batch collects its own announcements', () => {
  it('sends nothing until it is drained, then everything in order', async () => {
    const inner = recordingBroadcaster();
    const collector = new AnnouncementCollector(inner);

    await collector.publish('p-1', { type: 'directory_changed' });
    await collector.publish('p-2', { type: 'saved_plans_changed' });
    // Proof: `publish` made to call `this.inner.publish` directly — the shape a
    // batch had before anything held its events — leaves this assertion reading
    // `expected [ Array(2) ] to equal []`, and the two events are gone from the
    // process before the transaction they describe has committed.
    expect(inner.published).toEqual([]);

    await collector.send();
    expect(inner.published).toEqual([
      { projectId: 'p-1', event: { type: 'directory_changed' } },
      { projectId: 'p-2', event: { type: 'saved_plans_changed' } },
    ]);
  });

  it('keeps one content-free event per project, and every event that carries something', async () => {
    const inner = recordingBroadcaster();
    const collector = new AnnouncementCollector(inner);

    await collector.publish('p-1', { type: 'directory_changed' });
    await collector.publish('p-1', { type: 'directory_changed' });
    await collector.publish('p-2', { type: 'directory_changed' });
    await collector.publish('p-1', { type: 'step_removed', stepId: 'a' });
    await collector.publish('p-1', { type: 'step_removed', stepId: 'b' });
    await collector.send();

    // A tag rename across forty projects is forty `directory_changed` and one
    // per project is all any of them says; two `step_removed` are two facts.
    expect(inner.published).toEqual([
      { projectId: 'p-1', event: { type: 'directory_changed' } },
      { projectId: 'p-2', event: { type: 'directory_changed' } },
      { projectId: 'p-1', event: { type: 'step_removed', stepId: 'a' } },
      { projectId: 'p-1', event: { type: 'step_removed', stepId: 'b' } },
    ]);
  });
});
