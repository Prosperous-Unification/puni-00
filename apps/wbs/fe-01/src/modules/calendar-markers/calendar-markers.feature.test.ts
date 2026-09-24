import { describe, expect, it } from 'vitest';

import type { PlanRefresh } from '@/lib/plan-refresh';

import { createCalendarMarkers } from './calendar-markers.feature';
import type { CalendarMarkerRoutes, CalendarMarkersHost, CalendarMarkerView } from './contract';

const STORED: CalendarMarkerView = {
  id: 'launch',
  name: 'Launch',
  date: '2026-03-02',
  color: '#2563eb',
};

/** An owner that records only what this module ever asks of it. */
function fakeOwner(asked: string[]): PlanRefresh {
  return {
    initialize: () => Promise.resolve({ status: 'installed' }),
    invalidate: (invalidation) => {
      asked.push(`invalidate:${invalidation.resources.join(',')}`);
      return Promise.resolve({ status: 'installed' });
    },
    getSnapshot: () => {
      throw new Error('the calendar markers never read a snapshot');
    },
    subscribe: () => () => undefined,
    dispose: () => undefined,
  };
}

interface Reader {
  readonly host: CalendarMarkersHost;
  readonly asked: string[];
  readonly refusals: unknown[];
  readonly owner: PlanRefresh;
  /** Puts a different owner in place, as a new project's effect does. */
  replaceOwner: (next: PlanRefresh | null) => void;
  /** Withdraws the reader, as its owner does: from then on it answers no owner at all. */
  leave: () => void;
}

/** The four routes, recording what each was asked for into one list. */
function recordingRoutes(asked: string[]): CalendarMarkerRoutes {
  return {
    createCalendarMarker: (_projectId, marker) => {
      asked.push(`create:${String(marker.markerId)}`);
      return Promise.resolve(STORED);
    },
    renameCalendarMarker: (_projectId, markerId, name) => {
      asked.push(`rename:${markerId}:${name}`);
      return Promise.resolve(STORED);
    },
    recolorCalendarMarker: (_projectId, markerId, color) => {
      asked.push(`recolor:${markerId}:${String(color)}`);
      return Promise.resolve(STORED);
    },
    deleteCalendarMarker: (_projectId, markerId) => {
      asked.push(`delete:${markerId}`);
      return Promise.resolve();
    },
  };
}

function readerOver(routes: Partial<CalendarMarkerRoutes> = {}): Reader {
  const asked: string[] = [];
  const refusals: unknown[] = [];
  const owner = fakeOwner(asked);
  let installed: PlanRefresh | null = owner;
  const api: CalendarMarkerRoutes = { ...recordingRoutes(asked), ...routes };
  return {
    asked,
    refusals,
    owner,
    replaceOwner: (next) => {
      installed = next;
    },
    leave: () => {
      installed = null;
    },
    host: {
      projectId: 'p1',
      api,
      readRefreshOwner: () => installed,
      announceRefusal: ({ cause }) => {
        refusals.push(cause);
      },
    },
  };
}

/** A route that refuses, and the cause it refuses with. */
const REFUSED = new Error('marker_not_found');
const refusingRename: Partial<CalendarMarkerRoutes> = {
  renameCalendarMarker: () => Promise.reject(REFUSED),
};

describe('the calendar markers a reader may put on the chart', () => {
  it('takes each of the four gestures to its own route', async () => {
    const reader = readerOver();
    const markers = createCalendarMarkers(reader.host);

    await markers.add({ markerId: 'cutover', date: '2026-03-04', name: 'Cutover' });
    await markers.rename('launch', 'Go live');
    await markers.recolor('launch', '#0386a5');
    await markers.remove('launch');

    expect(reader.asked.filter((one) => !one.startsWith('invalidate'))).toEqual([
      'create:cutover',
      'rename:launch:Go live',
      'recolor:launch:#0386a5',
      'delete:launch',
    ]);
  });

  it('reads the markers again after a write it accepted', async () => {
    const reader = readerOver();
    const markers = createCalendarMarkers(reader.host);

    await markers.remove('launch');

    expect(reader.asked).toEqual(['delete:launch', 'invalidate:markers']);
  });

  it('reads the markers again after a write it refused, and says what was refused', async () => {
    const reader = readerOver(refusingRename);
    const markers = createCalendarMarkers(reader.host);

    await markers.rename('launch', 'Go live');

    expect(reader.refusals).toEqual([REFUSED]);
    expect(reader.asked).toEqual(['invalidate:markers']);
  });

  it('writes nothing at all before a refresh owner exists', async () => {
    const reader = readerOver();
    reader.replaceOwner(null);
    const markers = createCalendarMarkers(reader.host);

    await markers.remove('launch');

    expect(reader.asked).toEqual([]);
  });

  it('says nothing and rereads nothing once another owner has taken its place', async () => {
    const reader = readerOver(refusingRename);
    const markers = createCalendarMarkers(reader.host);
    const started = markers.rename('launch', 'Go live');
    reader.replaceOwner(fakeOwner(reader.asked));

    await started;

    expect(reader.refusals).toEqual([]);
    expect(reader.asked).toEqual([]);
  });

  it('says nothing and rereads nothing once the reader has left the screen', async () => {
    const reader = readerOver(refusingRename);
    const markers = createCalendarMarkers(reader.host);
    const started = markers.rename('launch', 'Go live');
    reader.leave();

    await started;

    expect(reader.refusals).toEqual([]);
    expect(reader.asked).toEqual([]);
  });

  it('rereads nothing once another owner has taken its place, though the write was accepted', async () => {
    const asked: string[] = [];
    let installed: PlanRefresh | null = fakeOwner(asked);
    let acceptWrite!: () => void;
    const held = new Promise<void>((resolve) => {
      acceptWrite = resolve;
    });
    const markers = createCalendarMarkers({
      projectId: 'p1',
      api: {
        ...recordingRoutes(asked),
        deleteCalendarMarker: (_projectId, markerId) => {
          asked.push(`delete:${markerId}`);
          return held;
        },
      },
      readRefreshOwner: () => installed,
      announceRefusal: () => undefined,
    });

    const started = markers.remove('launch');
    installed = fakeOwner(asked);
    acceptWrite();
    await started;

    expect(asked).toEqual(['delete:launch']);
  });
});
