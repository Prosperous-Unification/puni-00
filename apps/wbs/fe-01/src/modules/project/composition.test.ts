import { describe, expect, it, vi } from 'vitest';

import { createChannel } from '@/modules/channel';
import type { PlanFeedRefusal } from '@/modules/plan-feed/contract';
import { createDeliveredPlan } from '@/modules/plan-feed/delivered-plan-store';
import { fakeProjectApi } from '@/testing/fake-project-api';
import { recordCalls } from '@/testing/record-calls';

import { projectServicesOver } from './composition';

/** The nine routes a refresh owner reads, as the client records them. */
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
    const services = projectServicesOver(client);
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
    const services = projectServicesOver(client);
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
    const services = projectServicesOver(client);

    void services.planCommandsFor('p1').freezeProject();
    void services.planCommandsFor('p2').freezeProject();

    expect(freezes).toEqual(['p1', 'p2']);
  });

  it('reaches the client at the moment of each call, not when it was composed', async () => {
    const client = fakeProjectApi();
    const services = projectServicesOver(client);
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
