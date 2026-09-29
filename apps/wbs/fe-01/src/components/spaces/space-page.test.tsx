import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { answerEmpty, answerJson as answer, stubServer } from '@/testing/stub-server';

import { ROLL_UP_CHUNK, SpacePage } from './space-page';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Renders under a router, which the page's links need. */
function routed(ui: ReactNode) {
  const root = createRootRoute({ component: () => ui });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  render(<RouterProvider router={router} />);
}

const project = (id: string, name = id) => ({
  id,
  name,
  ownerId: 'u',
  restricted: false,
  estimateMethod: 'pert',
  depReach: 'whole-item',
  pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
  estimateRounding: 'exact',
  startDate: null,
  solutionRef: null,
  revision: 0,
  createdAt: 1,
  optimizationEnabled: false,
  scheduleEngine: 'fast',
  scheduleObjective: 'pri',
  ownerName: 'ada',
  lastOpenedAt: null,
});

const read = (ids: readonly string[], writable: boolean) => ({
  space: {
    id: 's',
    name: 'Q3',
    virtual: false,
    projectCount: ids.length,
    revision: 1,
    createdById: 'u',
    createdAt: 1,
  },
  writable,
  rows: ids.map((id, index) => ({ project: project(id), position: (index + 1) * 10 })),
});

const rolledUp = (finalTotal: number) => ({
  kind: 'rolled_up',
  dates: { startsOn: '2026-10-01', endsOn: '2026-10-20' },
  finalTotal,
  status: 'in_progress',
  counts: {
    byStatus: {
      unknown: 0,
      draft: 0,
      ready: 0,
      in_progress: 1,
      blocked_by_proxy: 0,
      on_hold: 0,
      blocked: 0,
      done: 2,
    },
    leaves: 3,
    estimated: 3,
  },
  scheduleError: null,
  waitingForPerson: 0,
  waitingForCapacity: 0,
  displayed: 'fast',
  projectRevision: 0,
  seq: 1,
});

describe('a space', () => {
  it('lists its projects, then fills each row as its roll-up arrives', async () => {
    const sent = stubServer({
      'GET /api/spaces/s': [() => answer(200, read(['p1', 'p2'], false))],
      'GET /api/spaces/s/in-progress': [
        () => answer(200, { items: [], truncated: false, unavailable: [] }),
      ],
      'GET /api/spaces/s/roll-ups': [
        () => answer(200, { rollUps: { p1: rolledUp(11), p2: { kind: 'unavailable' } } }),
      ],
    });
    routed(<SpacePage spaceId="s" nav={null} account={null} />);
    const table = await screen.findByRole('table', { name: 'Projects' });
    const firstRow = await within(table).findByRole('row', { name: /p1/ });
    await waitFor(() => {
      expect(firstRow.textContent).toContain('In progress');
    });
    expect(firstRow.textContent).toContain('2026-10-01');
    expect(firstRow.textContent).toContain('2/3');
    expect(within(table).getByRole('row', { name: /p2/ }).textContent).toContain(
      'Schedule unavailable',
    );
    expect(within(firstRow).getByRole('link', { name: 'p1' }).getAttribute('href')).toBe(
      '/?project=p1',
    );
    expect(sent.filter(({ route }) => route.endsWith('/roll-ups'))).toHaveLength(1);
    const timeline = screen.getByRole('list', { name: 'Project timeline' });
    expect(
      within(timeline).getByRole('img', { name: 'p1: 2026-10-01 to 2026-10-20' }),
    ).toBeDefined();
    expect(within(timeline).getByText('p2: no dates')).toBeDefined();
    expect(timeline.querySelectorAll('[data-space-gantt-bar]')).toHaveLength(1);
    expect(await screen.findByText('Nothing is in progress in this space.')).toBeDefined();
  });

  it('asks for roll-ups in chunks of 20', async () => {
    const ids = Array.from({ length: ROLL_UP_CHUNK + 5 }, (_, at) => `p${String(at)}`);
    const sent = stubServer({
      'GET /api/spaces/s': [() => answer(200, read(ids, false))],
      'GET /api/spaces/s/in-progress': [
        () => answer(200, { items: [], truncated: false, unavailable: [] }),
      ],
      'GET /api/spaces/s/roll-ups': [() => answer(200, { rollUps: {} })],
    });
    routed(<SpacePage spaceId="s" nav={null} account={null} />);
    await waitFor(() => {
      expect(sent.filter(({ route }) => route.endsWith('/roll-ups'))).toHaveLength(2);
    });
  });

  it('shows a viewer no handle, and a member the handles', async () => {
    // Proof, observed 2026-09-29: with the handles drawn whatever `writable`
    // said, the viewer's table held the `Remove p1 from this space` button.
    stubServer({
      'GET /api/spaces/s': [() => answer(200, read(['p1', 'p2'], false))],
      'GET /api/spaces/s/in-progress': [
        () => answer(200, { items: [], truncated: false, unavailable: [] }),
      ],
      'GET /api/spaces/s/roll-ups': [() => answer(200, { rollUps: {} })],
    });
    routed(<SpacePage spaceId="s" nav={null} account={null} />);
    await screen.findByRole('table', { name: 'Projects' });
    expect(screen.queryByRole('button', { name: 'Remove p1 from this space' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Move p2 up' })).toBeNull();
    expect(screen.queryByLabelText('Add a project')).toBeNull();
  });

  it('moves, removes and adds for a member, re-reading after each', async () => {
    const sent = stubServer({
      'GET /api/spaces/s': [() => answer(200, read(['p1', 'p2', 'p3'], true))],
      'GET /api/spaces/s/in-progress': [
        () => answer(200, { items: [], truncated: false, unavailable: [] }),
      ],
      'GET /api/spaces/s/roll-ups': [() => answer(200, { rollUps: {} })],
      'GET /api/projects': [
        () => answer(200, { projects: [project('p1'), project('p4', 'Fourth')] }),
      ],
      'POST /api/spaces/s/projects/p3/move': [() => answer(200, { position: 15 })],
      'DELETE /api/spaces/s/projects/p2': [() => answerEmpty(204)],
      'POST /api/spaces/s/projects': [() => answer(201, { position: 40 })],
    });
    routed(<SpacePage spaceId="s" nav={null} account={null} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Move p3 up' }));
    expect(await screen.findByText('Moved p3 up.')).toBeDefined();
    expect(sent.find(({ route }) => route.endsWith('/p3/move'))?.body).toEqual({
      afterProjectId: 'p1',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove p2 from this space' }));
    expect(
      await screen.findByText('Removed p2 from this space. The project is unchanged.'),
    ).toBeDefined();
    fireEvent.change(screen.getByLabelText('Add a project'), { target: { value: 'p4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Added Fourth.')).toBeDefined();
    expect(sent.find(({ route }) => route === 'POST /api/spaces/s/projects')?.body).toEqual({
      projectId: 'p4',
      afterProjectId: 'p3',
    });
  });

  it('renders the empty state and the organization_required state', async () => {
    stubServer({
      'GET /api/spaces/s': [() => answer(200, read([], false))],
      'GET /api/spaces/s/in-progress': [
        () => answer(200, { items: [], truncated: false, unavailable: [] }),
      ],
      'GET /api/spaces/s/roll-ups': [() => answer(200, { rollUps: {} })],
    });
    routed(<SpacePage spaceId="s" nav={null} account={null} />);
    expect(await screen.findByText('No projects in this space yet.')).toBeDefined();
    cleanup();
    stubServer({
      'GET /api/spaces/s': [() => answer(409, { error: 'organization_required' })],
    });
    routed(<SpacePage spaceId="s" nav={null} account={null} />);
    expect((await screen.findByRole('alert')).textContent).toContain('Spaces need an organization');
  });

  it('re-reads every minute while visible', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const sent = stubServer({
        'GET /api/spaces/s': [() => answer(200, read(['p1'], false))],
        'GET /api/spaces/s/in-progress': [
          () => answer(200, { items: [], truncated: false, unavailable: [] }),
        ],
        'GET /api/spaces/s/roll-ups': [() => answer(200, { rollUps: {} })],
      });
      routed(<SpacePage spaceId="s" nav={null} account={null} />);
      await screen.findByRole('table', { name: 'Projects' });
      const reads = () => sent.filter(({ route }) => route === 'GET /api/spaces/s').length;
      expect(reads()).toBe(1);
      await vi.advanceTimersByTimeAsync(60_000);
      await waitFor(() => {
        expect(reads()).toBe(2);
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
