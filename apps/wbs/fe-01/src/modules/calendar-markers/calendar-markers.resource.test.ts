import { describe, expect, it } from 'vitest';

import { createCalendarMarkerWrites } from './calendar-markers.resource';
import type { CalendarMarkerRoutes, CalendarMarkerView } from './contract';

const STORED: CalendarMarkerView = {
  id: 'launch',
  name: 'Launch',
  date: '2026-03-02',
  color: '#2563eb',
};

/** The four routes, recording what each was called with. */
function fakeRoutes(): { api: CalendarMarkerRoutes; asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    api: {
      createCalendarMarker: (workPackageId, marker) => {
        asked.push(
          `create:${workPackageId}:${String(marker.markerId)}:${marker.date}:${marker.name}`,
        );
        return Promise.resolve(STORED);
      },
      renameCalendarMarker: (workPackageId, markerId, name) => {
        asked.push(`rename:${workPackageId}:${markerId}:${name}`);
        return Promise.resolve(STORED);
      },
      recolorCalendarMarker: (workPackageId, markerId, color) => {
        asked.push(`recolor:${workPackageId}:${markerId}:${String(color)}`);
        return Promise.resolve(STORED);
      },
      deleteCalendarMarker: (workPackageId, markerId) => {
        asked.push(`delete:${workPackageId}:${markerId}`);
        return Promise.resolve();
      },
    },
  };
}

describe('the calendar markers of one work package, as this browser writes them', () => {
  it('names the markers resource, and only it, as what a marker edit dirties', () => {
    const writes = createCalendarMarkerWrites({ workPackageId: 'p1', api: fakeRoutes().api });

    expect(writes.dirtied).toEqual(['markers']);
  });

  it('sends an add to the create route, on the work package it was built for', async () => {
    const routes = fakeRoutes();
    const writes = createCalendarMarkerWrites({ workPackageId: 'p1', api: routes.api });

    await writes.send({
      kind: 'add',
      marker: { markerId: 'cutover', date: '2026-03-04', name: 'Cutover' },
    });

    expect(routes.asked).toEqual(['create:p1:cutover:2026-03-04:Cutover']);
  });

  it('sends a rename to the rename route, with the name and nothing else', async () => {
    const routes = fakeRoutes();
    const writes = createCalendarMarkerWrites({ workPackageId: 'p1', api: routes.api });

    await writes.send({ kind: 'rename', markerId: 'launch', name: 'Go live' });

    expect(routes.asked).toEqual(['rename:p1:launch:Go live']);
  });

  it('sends a recolour to the recolour route, a cleared colour included', async () => {
    const routes = fakeRoutes();
    const writes = createCalendarMarkerWrites({ workPackageId: 'p1', api: routes.api });

    await writes.send({ kind: 'recolor', markerId: 'launch', color: '#0386a5' });
    await writes.send({ kind: 'recolor', markerId: 'launch', color: null });

    expect(routes.asked).toEqual(['recolor:p1:launch:#0386a5', 'recolor:p1:launch:null']);
  });

  it('sends a removal to the delete route', async () => {
    const routes = fakeRoutes();
    const writes = createCalendarMarkerWrites({ workPackageId: 'p1', api: routes.api });

    await writes.send({ kind: 'remove', markerId: 'launch' });

    expect(routes.asked).toEqual(['delete:p1:launch']);
  });

  it('lets a refusal through unworded, because saying it is nobody here’s job', async () => {
    const routes = fakeRoutes();
    const refused = new Error('marker_not_found');
    const writes = createCalendarMarkerWrites({
      workPackageId: 'p1',
      api: {
        ...routes.api,
        renameCalendarMarker: () => Promise.reject(refused),
      },
    });

    const thrown = await writes
      .send({ kind: 'rename', markerId: 'launch', name: 'Go live' })
      .then(() => null)
      .catch((cause: unknown) => cause);

    expect(thrown).toBe(refused);
  });
});
