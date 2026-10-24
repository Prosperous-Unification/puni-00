import { describe, expect, it, vi } from 'vitest';

import type { OpenSocket, ProjectStreamDeps, SocketHandlers } from '@/lib/project-stream';
import { createChannel } from '@/modules/channel';
import type { PlanFeedRefusal } from '@/modules/plan-feed/contract';
import { createDeliveredPlan } from '@/modules/plan-feed/delivered-plan-store';
import { openSavedPlans } from '@/modules/saved-plans/saved-plans.feature';
import { fakeProjectApi } from '@/testing/fake-project-api';
import { NO_SAVED_PLANS } from '@/testing/no-saved-plans';
import { recordCalls } from '@/testing/record-calls';

import { browserSavedPlanRoutes, projectServicesOver } from './composition';

/** The ten routes a refresh owner reads, as the client records them. */
const READ_ROUTES = [
  'tree',
  'steps',
  'listTeams',
  'listTags',
  'listServices',
  'listWorkItemTypes',
  'listExternalSystems',
  'listPeople',
  'listCalendarMarkers',
  'readClaims',
] as const;

/** A reader of `projectId` that is always on screen, with its own stores. */
function readerOf(projectId: string) {
  return {
    projectId,
    subscribe: undefined,
    isActiveReader: () => true,
    plan: createDeliveredPlan(),
    refusals: createChannel<PlanFeedRefusal>(),
  };
}

describe('the project composition root', () => {
  it('reads the reader’s project through the one client, and nothing before it is asked', async () => {
    const client = fakeProjectApi();
    const reads: string[] = [];
    for (const route of READ_ROUTES) {
      recordCalls(client, route, (...args) => reads.push([route, ...args].join(':')));
    }
    const services = projectServicesOver(client, NO_SAVED_PLANS);
    expect(reads).toEqual([]);

    const reader = readerOf('p1');
    const feed = services.planFeedFor(reader);
    await vi.waitFor(() => {
      expect(reader.plan.snapshot().tree).not.toBeNull();
    });
    feed.close();

    expect(reads.filter((read) => read.startsWith('tree:'))).toEqual(['tree:p1']);
    expect(new Set(reads.map((read) => read.split(':')[0]))).toEqual(new Set(READ_ROUTES));
  });

  it('writes the reader’s calendar markers through the one client', async () => {
    const client = fakeProjectApi();
    const creates = recordCalls(client, 'createCalendarMarker', (projectId, marker) => [
      projectId,
      marker.name,
    ]);
    const services = projectServicesOver(client, NO_SAVED_PLANS);
    const reader = readerOf('p1');
    const feed = services.planFeedFor(reader);
    await vi.waitFor(() => {
      expect(reader.plan.snapshot().tree).not.toBeNull();
    });
    const markers = services.calendarMarkersFor({
      projectId: 'p1',
      readRefreshOwner: () => feed.owner,
      announceRefusal: (refusal) => {
        throw new Error(`refused: ${String(refusal.cause)}`);
      },
    });

    await markers.add({ markerId: 'cutover', date: '2026-10-05', name: 'Cutover' });
    feed.close();

    expect(creates).toEqual([['p1', 'Cutover']]);
    expect(client.markers.map((marker) => marker.name)).toEqual(['Cutover']);
  });

  it('binds each project’s commands to that project, over the same client', () => {
    const client = fakeProjectApi();
    const freezes = recordCalls(client, 'freezeProject', (projectId) => projectId);
    const services = projectServicesOver(client, NO_SAVED_PLANS);

    void services.planCommandsFor('p1').freezeProject();
    void services.planCommandsFor('p2').freezeProject();

    expect(freezes).toEqual(['p1', 'p2']);
  });

  it('reaches the client at the moment of each call, not when it was composed', async () => {
    const client = fakeProjectApi();
    const services = projectServicesOver(client, NO_SAVED_PLANS);
    const later: string[] = [];
    const tree = client.tree.bind(client);
    client.tree = (projectId) => {
      later.push(`tree:${projectId}`);
      return tree(projectId);
    };
    client.arrangeBySchedule = (projectId) => {
      later.push(`arrange:${projectId}`);
      return Promise.resolve();
    };

    const reader = readerOf('p1');
    const feed = services.planFeedFor(reader);
    await vi.waitFor(() => {
      expect(reader.plan.snapshot().tree).not.toBeNull();
    });
    feed.close();
    await services.planCommandsFor('p1').arrangeBySchedule();

    expect(later).toEqual(['tree:p1', 'arrange:p1']);
  });
});

describe('the saved plans’ own stream', () => {
  it('counts a reconnect after a drop as a move of the live plan, and rereads the shelf (F-100)', async () => {
    /*
      The shelf's socket subscribes without resuming (`sinceSeq: -1`, no baseline), so
      an event published while it was down never arrives. Whatever happened in the gap
      may have moved the plan, and the list: a resettle after a drop says so.
    */
    const sockets: SocketHandlers[] = [];
    const timers: (() => void)[] = [];
    const openSocket: OpenSocket = (handlers) => {
      sockets.push(handlers);
      return { send: () => undefined, close: () => undefined };
    };
    const streamDeps: ProjectStreamDeps = {
      openSocket,
      schedule: (fn) => timers.push(fn),
      cancel: () => undefined,
      random: () => 0.5,
    };
    const stream = browserSavedPlanRoutes(streamDeps);
    let reads = 0;
    const { savedPlans, close } = openSavedPlans({
      projectId: 'p1',
      isCurrent: () => true,
      routes: {
        ...stream,
        available: () => Promise.resolve(true),
        list: () => {
          reads += 1;
          return Promise.resolve({
            kind: 'success',
            representation: 'json',
            status: 200,
            headers: new Headers(),
            body: { savedPlans: [] },
          });
        },
      },
    });
    const settled = () => new Promise((resolve) => setTimeout(resolve, 0));
    await settled();
    expect(sockets).toHaveLength(1);
    sockets[0].onOpen();
    await settled();
    // The first settle is not a reconnect: nothing was missed.
    expect(savedPlans.livePlanRevision.snapshot()).toBe(0);
    expect(reads).toBe(1);

    sockets[0].onClose();
    timers.shift()?.();
    expect(sockets).toHaveLength(2);
    sockets[1].onOpen();
    await settled();

    // Proof: on 2026-10-16, against 76dc8ab32 (no `onConnectionChange` on the shelf's stream),
    // this failed on `expected +0 to be 1`.
    expect(savedPlans.livePlanRevision.snapshot()).toBe(1);
    expect(reads).toBe(2);
    close();
  });

  it('rereads nothing for five claims announcements', async () => {
    // C21: a claims announcement is per heartbeat per agent; the shelf has not
    // opted into it, so it must not reread its capability or its list for one.
    const sockets: SocketHandlers[] = [];
    const streamDeps: ProjectStreamDeps = {
      openSocket: (handlers) => {
        sockets.push(handlers);
        return { send: () => undefined, close: () => undefined };
      },
      schedule: () => 0,
      cancel: () => undefined,
      random: () => 0.5,
    };
    const stream = browserSavedPlanRoutes(streamDeps);
    let reads = 0;
    let capabilityReads = 0;
    const { savedPlans, close } = openSavedPlans({
      projectId: 'p1',
      isCurrent: () => true,
      routes: {
        ...stream,
        available: () => {
          capabilityReads += 1;
          return Promise.resolve(true);
        },
        list: () => {
          reads += 1;
          return Promise.resolve({
            kind: 'success',
            representation: 'json',
            status: 200,
            headers: new Headers(),
            body: { savedPlans: [] },
          });
        },
      },
    });
    const settled = () => new Promise((resolve) => setTimeout(resolve, 0));
    await settled();
    sockets[0].onOpen();
    await settled();
    const before = { reads, capabilityReads };

    for (const seq of [undefined, undefined, 3, undefined, 4])
      sockets[0].onMessage(
        JSON.stringify({ subscription: 'project:p1', seq, message: { type: 'claims_changed' } }),
      );
    await settled();

    expect({ reads, capabilityReads }).toEqual(before);
    expect(savedPlans.livePlanRevision.snapshot()).toBe(0);
    close();
  });
});
