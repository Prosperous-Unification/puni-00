import { describe, expect, it } from 'bun:test';

import type { EventLogStore, RecordedEvent } from './event-log-store';

function replayFrom(store: EventLogStore): Promise<readonly RecordedEvent[]> {
  return store.rangeSince('project:p1', -1);
}

describe('store ports', () => {
  it('admits an event-log consumer without a SQLite transaction method', async () => {
    const event: RecordedEvent = {
      subscription: 'project:p1',
      seq: 0,
      message: { type: 'project_changed' },
      createdAt: 1,
    };
    const store: EventLogStore = {
      recordEvent: () => Promise.resolve(event),
      rangeSince: () => Promise.resolve([event]),
      oldestSeq: () => Promise.resolve(0),
      latestSeq: () => Promise.resolve(0),
      pruneBeyond: () => Promise.resolve(0),
    };

    expect(await replayFrom(store)).toEqual([event]);
  });
});
