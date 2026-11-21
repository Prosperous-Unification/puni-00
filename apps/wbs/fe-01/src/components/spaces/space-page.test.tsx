import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { Component, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@/testing/organization-render';
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

const workPackage = (id: string, name = id) => ({
  id,
  name,
  abbreviation: `P${id.toUpperCase()}`,
  projectId: `project-${id}`,
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
  createdByName: 'ada',
  lastOpenedAt: null,
});

const read = (ids: readonly string[], writable: boolean) => ({
  space: {
    id: 's',
    name: 'Q3',
    virtual: false,
    projectCount: ids.length,
    workPackageCount: ids.length,
    revision: 1,
    createdById: 'u',
    createdAt: 1,
  },
  writable,
  personIds: [],
  serviceTeamIds: [],
  projects: ids.map((id, index) => ({
    project: { id: `project-${id}`, name: `Engagement ${id}` },
    workPackages: [workPackage(id)],
    position: (index + 1) * 10,
  })),
});

/** Each default fixture row belongs to its explicitly named distinct project. */
const readAt = (placements: readonly (readonly [string, number])[], writable: boolean) => ({
  ...read(
    placements.map(([id]) => id),
    writable,
  ),
  projects: placements.map(([id, position]) => ({
    project: { id: `project-${id}`, name: `Engagement ${id}` },
    workPackages: [workPackage(id)],
    position,
  })),
});

const project = (
  id: string,
  name: string,
  spaceId: string | null,
  spacePosition: number | null,
) => ({
  id,
  organizationId: 'org-a',
  spaceId,
  spacePosition,
  name,
  revision: 0,
  createdAt: 1,
  updatedAt: null,
  createdBy: null,
  workPackageCount: 1,
});

const rolledUp = (finalTotal: number) => ({
  kind: 'rolled_up' as const,
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
  workPackageRevision: 0,
  seq: 1,
});

/** Complete one-child project replies; unrelated control fixtures explicitly model figure outages. */
function figures(
  entries: Readonly<Record<string, ReturnType<typeof rolledUp> | { kind: 'unavailable' }>>,
) {
  return {
    projects: Object.entries(entries).map(([id, rollUp], index) => {
      let parent: unknown = rollUp;
      if (rollUp.kind !== 'unavailable') {
        const { scheduleError, displayed, workPackageRevision, seq, ...summary } = rollUp;
        parent = summary;
      }
      return {
        project: { id: 'project-' + id, name: 'Engagement ' + id },
        position: (index + 1) * 10,
        rollUp: parent,
        workPackages: [{ workPackage: workPackage(id), rollUp }],
      };
    }),
  };
}

class ProtocolBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? <p role="alert">Space protocol failed</p> : this.props.children;
  }
}

for (const fault of [
  'unknown-project',
  'duplicate-project',
  'wrong-parent',
  'duplicate-child',
  'missing-project',
] as const)
  it('rejects contradictory rollup protocol ' + fault, async () => {
    const reply = figures({ p1: rolledUp(11) });
    const group = reply.projects.at(0);
    if (group === undefined) throw new Error('fixture group absent');
    switch (fault) {
      case 'unknown-project':
        group.project.id = 'other-project';
        group.workPackages[0].workPackage.projectId = 'other-project';
        break;
      case 'duplicate-project':
        group.workPackages = [];
        group.rollUp = { kind: 'empty' };
        reply.projects.push(structuredClone(group));
        break;
      case 'wrong-parent':
        group.workPackages[0].workPackage.projectId = 'other-project';
        break;
      case 'duplicate-child':
        group.workPackages.push(structuredClone(group.workPackages[0]));
        break;
      case 'missing-project':
        reply.projects = [];
        break;
    }
    stubServer({
      'GET /api/spaces/s': [() => answer(200, read(['p1'], false))],
      'GET /api/spaces/s/in-progress': [
        () => answer(200, { items: [], truncated: false, unavailable: [] }),
      ],
      'GET /api/spaces/s/roll-ups': [() => answer(200, reply)],
    });
    routed(
      <ProtocolBoundary>
        <SpacePage spaceId="s" nav={null} account={null} />
      </ProtocolBoundary>,
    );
    expect(await screen.findByText('Space protocol failed')).toBeDefined();
    expect(screen.queryByRole('table', { name: 'Projects and work packages' })).toBeNull();
  });

it('withholds the older whole project when a child moves across rollup chunk epochs', async () => {
  const ids = Array.from({ length: ROLL_UP_CHUNK + 1 }, (_, at) => 'p' + String(at));
  const first = figures(
    Object.fromEntries(ids.slice(0, ROLL_UP_CHUNK).map((id) => [id, rolledUp(11)])),
  );
  first.projects[0].workPackages[0].workPackage = {
    ...workPackage('shared', 'Shared'),
    projectId: 'project-p0',
  };
  const last = figures({ p20: rolledUp(20) });
  last.projects[0].workPackages[0].workPackage = {
    ...workPackage('shared', 'Shared'),
    projectId: 'project-p20',
  };
  stubServer({
    'GET /api/spaces/s': [() => answer(200, read(ids, false))],
    'GET /api/spaces/s/in-progress': [
      () => answer(200, { items: [], truncated: false, unavailable: [] }),
    ],
    'GET /api/spaces/s/roll-ups': [() => answer(200, first), () => answer(200, last)],
  });
  routed(<SpacePage spaceId="s" nav={null} account={null} />);
  expect(
    await screen.findByText('Project contents changed. Refresh to update its figures.'),
  ).toBeDefined();
  expect(screen.getAllByRole('link', { name: 'Shared' })).toHaveLength(1);
  const table = screen.getByRole('table', { name: 'Projects and work packages' });
  expect(
    within(table).getByRole('row', { name: /^Engagement p0(?:\s|$)/ }).textContent,
  ).not.toContain('11');
  expect(within(table).getByRole('row', { name: /^Engagement p20(?:\s|$)/ }).textContent).toContain(
    '20',
  );
});

it('publishes parent figures and the captured child membership together using project IDs', async () => {
  const sent = stubServer({
    'GET /api/spaces/s': [() => answer(200, read(['p1'], false))],
    'GET /api/spaces/s/in-progress': [
      () => answer(200, { items: [], truncated: false, unavailable: [] }),
    ],
    'GET /api/spaces/s/roll-ups': [
      () =>
        answer(200, {
          projects: [
            {
              project: { id: 'project-p1', name: 'Engagement p1' },
              position: 10,
              rollUp: {
                kind: 'rolled_up',
                dates: { startsOn: '2026-10-01', endsOn: '2026-10-20' },
                finalTotal: 20,
                status: 'in_progress',
                counts: { ...rolledUp(20).counts, leaves: 6, estimated: 6 },
                waitingForPerson: 0,
                waitingForCapacity: 0,
              },
              workPackages: [
                { workPackage: workPackage('p1'), rollUp: rolledUp(12) },
                {
                  workPackage: { ...workPackage('p2'), projectId: 'project-p1' },
                  rollUp: rolledUp(8),
                },
              ],
            },
          ],
        }),
    ],
  });
  routed(<SpacePage spaceId="s" nav={null} account={null} />);
  const table = await screen.findByRole('table', { name: 'Projects and work packages' });
  await waitFor(() => {
    expect(
      within(table).getByRole('row', { name: /^Engagement p1(?:\s|$)/ }).textContent,
    ).toContain('20');
  });
  expect(within(table).getByRole('row', { name: /^p1(?:\s|$)/ }).textContent).toContain('12');
  expect(within(table).getByRole('row', { name: /^p2(?:\s|$)/ }).textContent).toContain('8');
  expect(sent.find((request) => request.route.endsWith('/roll-ups'))?.search).toBe(
    '?projectIds=project-p1',
  );
});

it('withdraws the space when a rollup chunk observes membership loss after the header read', async () => {
  stubServer({
    'GET /api/spaces/s': [() => answer(200, read(['p1'], false))],
    'GET /api/spaces/s/in-progress': [
      () => answer(200, { items: [], truncated: false, unavailable: [] }),
    ],
    'GET /api/spaces/s/roll-ups': [() => answer(403, { error: 'not_a_member' })],
  });
  routed(<SpacePage spaceId="s" nav={null} account={null} />);
  expect(await screen.findByText('You no longer have access to this organization.')).toBeDefined();
  expect(screen.queryByRole('table', { name: 'Projects and work packages' })).toBeNull();
});

it('shows an empty project and places readable packages beneath their actual project row', async () => {
  stubServer({
    'GET /api/spaces/s': [
      () =>
        answer(200, {
          ...read([], true),
          space: { ...read([], true).space, projectCount: 2, workPackageCount: 1 },
          personIds: [],
          serviceTeamIds: [],
          projects: [
            { project: { id: 'empty', name: 'Empty engagement' }, position: 10, workPackages: [] },
            {
              project: { id: 'engagement', name: 'Engagement' },
              position: 20,
              workPackages: [{ ...workPackage('delivery', 'Delivery'), projectId: 'engagement' }],
            },
          ],
        }),
    ],
    // The later catalogue can see a moved-out project while the current contents still show it.
    'GET /api/projects': [
      () =>
        answer(200, {
          projects: [{ ...project('empty', 'Empty engagement', null, null), workPackageCount: 0 }],
        }),
    ],
    'GET /api/spaces/s/in-progress': [
      () => answer(200, { items: [], truncated: false, unavailable: [] }),
    ],
    'GET /api/spaces/s/roll-ups': [
      () =>
        answer(200, {
          projects: [
            {
              project: { id: 'empty', name: 'Empty engagement' },
              position: 10,
              rollUp: { kind: 'empty' },
              workPackages: [],
            },
            {
              ...figures({ delivery: rolledUp(8) }).projects[0],
              project: { id: 'engagement', name: 'Engagement' },
              position: 20,
              workPackages: [
                {
                  workPackage: { ...workPackage('delivery', 'Delivery'), projectId: 'engagement' },
                  rollUp: rolledUp(8),
                },
              ],
            },
          ],
        }),
    ],
  });
  routed(<SpacePage spaceId="s" nav={null} account={null} />);
  const table = await screen.findByRole('table', { name: 'Projects and work packages' });
  const rows = within(table).getAllByRole('row');
  expect(rows.map((row) => row.querySelector('th')?.textContent)).toEqual([
    'Project / work package',
    'Empty engagement',
    'Engagement',
    'Delivery',
  ]);
  expect(
    screen.getByRole('button', { name: 'Remove Empty engagement from this space' }),
  ).toBeDefined();
  expect(screen.queryByRole('button', { name: 'Remove Delivery from this space' })).toBeNull();
  await waitFor(() => {
    expect(within(table).getByRole('row', { name: /^Delivery(?:\s|$)/ }).textContent).toContain(
      'In progress',
    );
  });
  expect(screen.queryByRole('combobox', { name: 'Add a project' })).toBeNull();
  expect(screen.getByRole('link', { name: 'Delivery' }).getAttribute('href')).toBe(
    '/?workPackage=delivery',
  );
});

describe('a space', () => {
  it('lists its work packages, then fills each row as its roll-up arrives', async () => {
    const sent = stubServer({
      'GET /api/spaces/s': [() => answer(200, read(['p1', 'p2'], false))],
      'GET /api/spaces/s/in-progress': [
        () => answer(200, { items: [], truncated: false, unavailable: [] }),
      ],
      'GET /api/spaces/s/roll-ups': [
        () => answer(200, figures({ p1: rolledUp(11), p2: { kind: 'unavailable' } })),
      ],
    });
    routed(<SpacePage spaceId="s" nav={null} account={null} />);
    const table = await screen.findByRole('table', { name: 'Projects and work packages' });
    const firstRow = await within(table).findByRole('row', { name: /^p1(?:\s|$)/ });
    await waitFor(() => {
      expect(firstRow.textContent).toContain('In progress');
    });
    expect(firstRow.textContent).toContain('2026-10-01');
    expect(firstRow.textContent).toContain('2/3');
    expect(within(table).getByRole('row', { name: /^p2(?:\s|$)/ }).textContent).toContain(
      'Schedule unavailable',
    );
    expect(within(firstRow).getByRole('link', { name: 'p1' }).getAttribute('href')).toBe(
      '/?workPackage=p1',
    );
    expect(sent.filter(({ route }) => route.endsWith('/roll-ups'))).toHaveLength(1);
    const timeline = screen.getByRole('list', { name: 'Work package timeline' });
    expect(
      within(timeline).getByRole('img', { name: 'p1: 2026-10-01 to 2026-10-20' }),
    ).toBeDefined();
    expect(within(timeline).getByText('p2: schedule unavailable')).toBeDefined();
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
      'GET /api/spaces/s/roll-ups': [() => answer(503, { error: 'fixture_figures_unavailable' })],
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
      'GET /api/spaces/s/roll-ups': [() => answer(503, { error: 'fixture_figures_unavailable' })],
    });
    routed(<SpacePage spaceId="s" nav={null} account={null} />);
    await screen.findByRole('table', { name: 'Projects and work packages' });
    expect(
      screen.queryByRole('button', { name: 'Remove Engagement p1 from this space' }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'Move Engagement p2 up' })).toBeNull();
    expect(screen.queryByLabelText('Add a project')).toBeNull();
  });

  it('moves, removes and adds for a member, re-reading after each', async () => {
    const sent = stubServer({
      'GET /api/spaces/s': [
        () =>
          answer(
            200,
            readAt(
              [
                ['p1', 10],
                ['p2', 20],
                ['p3', 30],
              ],
              true,
            ),
          ),
        () =>
          answer(
            200,
            readAt(
              [
                ['p1', 10],
                ['p3', 15],
                ['p2', 20],
              ],
              true,
            ),
          ),
        () =>
          answer(
            200,
            readAt(
              [
                ['p1', 10],
                ['p3', 15],
              ],
              true,
            ),
          ),
        () =>
          answer(
            200,
            readAt(
              [
                ['p1', 10],
                ['p3', 15],
                ['p4', 40],
              ],
              true,
            ),
          ),
      ],
      'GET /api/spaces/s/in-progress': [
        () => answer(200, { items: [], truncated: false, unavailable: [] }),
      ],
      'GET /api/spaces/s/roll-ups': [() => answer(503, { error: 'fixture_figures_unavailable' })],
      'GET /api/projects': [
        () => answer(200, { projects: [project('project-p4', 'Fourth', null, null)] }),
        () => answer(200, { projects: [project('project-p4', 'Fourth', null, null)] }),
        () => answer(200, { projects: [project('project-p4', 'Fourth', null, null)] }),
        () => answer(200, { projects: [project('project-p4', 'Fourth', 's', 40)] }),
      ],
      'POST /api/spaces/s/projects/project-p3/move': [() => answer(200, { position: 15 })],
      'DELETE /api/spaces/s/projects/project-p2': [() => answerEmpty(204)],
      'POST /api/spaces/s/projects': [() => answer(201, { position: 40 })],
    });
    routed(<SpacePage spaceId="s" nav={null} account={null} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Move Engagement p3 up' }));
    expect(await screen.findByText('Moved Engagement p3 up.')).toBeDefined();
    expect(sent.find(({ route }) => route.endsWith('/project-p3/move'))?.body).toEqual({
      afterProjectId: 'project-p1',
    });
    await waitFor(() => {
      const table = screen.getByRole('table', { name: 'Projects and work packages' });
      expect(
        within(table)
          .getAllByRole('link')
          .map((link) => link.textContent),
      ).toEqual(['p1', 'p3', 'p2']);
      expect(
        screen
          .getByRole('button', { name: 'Remove Engagement p2 from this space' })
          .getAttribute('disabled'),
      ).toBeNull();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Engagement p2 from this space' }));
    expect(
      await screen.findByText(
        'Removed Engagement p2 from this space. Its work packages are unchanged.',
      ),
    ).toBeDefined();
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'p2' })).toBeNull();
    });
    fireEvent.change(screen.getByLabelText('Add a project'), { target: { value: 'project-p4' } });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add' }).getAttribute('disabled')).toBeNull();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Added Fourth.')).toBeDefined();
    expect(sent.find(({ route }) => route === 'POST /api/spaces/s/projects')?.body).toEqual({
      projectId: 'project-p4',
      afterProjectId: 'project-p3',
    });
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'p4' })).toBeDefined();
      expect(sent.filter(({ route }) => route === 'GET /api/spaces/s')).toHaveLength(4);
    });
  });

  it('renders the empty state and the organization_required state', async () => {
    stubServer({
      'GET /api/spaces/s': [() => answer(200, read([], false))],
      'GET /api/spaces/s/in-progress': [
        () => answer(200, { items: [], truncated: false, unavailable: [] }),
      ],
      'GET /api/spaces/s/roll-ups': [() => answer(503, { error: 'fixture_figures_unavailable' })],
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

  it('gives the space up to a fresh sign-in when the session policy refuses it', async () => {
    stubServer({
      'GET /api/spaces/s': [
        () =>
          answer(403, {
            error: 'reauthentication_required',
            organizationId: 'org_7f3a',
            reason: 'max_session',
            login: '/api/auth/login?reauthenticate=org_7f3a',
          }),
      ],
    });
    routed(<SpacePage spaceId="s" nav={null} account={null} />);
    expect(await screen.findByText('Your session for this organization is too old.')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Sign in again' }).getAttribute('href')).toBe(
      '/api/auth/login?reauthenticate=org_7f3a',
    );
  });

  it('re-reads every minute while visible', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const sent = stubServer({
        'GET /api/spaces/s': [() => answer(200, read(['p1'], false))],
        'GET /api/spaces/s/in-progress': [
          () => answer(200, { items: [], truncated: false, unavailable: [] }),
        ],
        'GET /api/spaces/s/roll-ups': [() => answer(503, { error: 'fixture_figures_unavailable' })],
      });
      routed(<SpacePage spaceId="s" nav={null} account={null} />);
      await screen.findByRole('table', { name: 'Projects and work packages' });
      const reads = () => sent.filter(({ route }) => route === 'GET /api/spaces/s').length;
      expect(reads()).toBe(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      await waitFor(() => {
        expect(reads()).toBe(2);
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the old figures until the new chunk answers', async () => {
    stubServer({
      'GET /api/spaces/s': [() => answer(200, read(['p1'], false))],
      'GET /api/spaces/s/in-progress': [
        () => answer(200, { items: [], truncated: false, unavailable: [] }),
      ],
      'GET /api/spaces/s/roll-ups': [() => answer(200, figures({ p1: rolledUp(11) }))],
    });
    routed(<SpacePage spaceId="s" nav={null} account={null} />);
    const row = async () =>
      within(await screen.findByRole('table', { name: 'Projects and work packages' })).getByRole(
        'row',
        {
          name: /^p1(?:\s|$)/,
        },
      );
    await waitFor(async () => {
      expect((await row()).textContent).toContain('In progress');
    });
    // A focus re-reads; the roll-up chunk is held unanswered, whatever order
    // the page's other reads take, and until it answers the row keeps its figures.
    const fetched = vi.mocked(fetch);
    const stubbed = fetched.getMockImplementation();
    if (stubbed === undefined) throw new Error('stubServer left fetch unstubbed');
    const held: { answer: ((response: Response) => void) | null } = { answer: null };
    fetched.mockImplementation((...args: Parameters<typeof fetch>) => {
      const [url] = args;
      const href = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      if (held.answer === null && href.includes('/roll-ups')) {
        return new Promise<Response>((resolve) => {
          held.answer = resolve;
        });
      }
      return stubbed(...args);
    });
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => {
      expect(held.answer).not.toBeNull();
    });
    expect((await row()).textContent).toContain('In progress');
    expect((await row()).textContent).not.toContain('Loading…');
    held.answer?.(answer(200, figures({ p1: rolledUp(12) })));
    await waitFor(async () => {
      expect((await row()).textContent).toContain('12');
    });
  });

  it('refreshes in progress now after a remove', async () => {
    const paint = {
      workPackageId: 'p2',
      workPackageName: 'p2',
      position: 20,
      workItemId: 'w1',
      number: '1',
      name: 'Paint',
      dates: null,
      lateBy: null,
      assignees: [],
      step: null,
    };
    stubServer({
      'GET /api/spaces/s': [
        () => answer(200, read(['p1', 'p2'], true)),
        () => answer(200, read(['p1'], true)),
      ],
      'GET /api/spaces/s/in-progress': [
        () => answer(200, { items: [paint], truncated: false, unavailable: [] }),
        () => answer(200, { items: [], truncated: false, unavailable: [] }),
      ],
      'GET /api/spaces/s/roll-ups': [() => answer(503, { error: 'fixture_figures_unavailable' })],
      'GET /api/projects': [() => answer(200, { projects: [] })],
      'DELETE /api/spaces/s/projects/project-p2': [() => answerEmpty(204)],
    });
    routed(<SpacePage spaceId="s" nav={null} account={null} />);
    expect((await screen.findByRole('list', { name: 'Work in progress' })).textContent).toBe(
      'p2 1 Paint',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove Engagement p2 from this space' }));
    expect(await screen.findByText('Nothing is in progress in this space.')).toBeDefined();
    expect(screen.queryByRole('list', { name: 'Work in progress' })).toBeNull();
  });

  it('says when the projects to add could not be read', async () => {
    stubServer({
      'GET /api/spaces/s': [() => answer(200, read(['p1'], true))],
      'GET /api/spaces/s/in-progress': [
        () => answer(200, { items: [], truncated: false, unavailable: [] }),
      ],
      'GET /api/spaces/s/roll-ups': [() => answer(503, { error: 'fixture_figures_unavailable' })],
      'GET /api/projects': [() => answer(500, { error: 'boom' })],
    });
    routed(<SpacePage spaceId="s" nav={null} account={null} />);
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Your projects could not be read to add one',
    );
    expect(screen.queryByLabelText('Add a project')).toBeNull();
  });

  it('keeps the keyboard on the moved row, and on the heading after a remove', async () => {
    const sent = stubServer({
      'GET /api/spaces/s': [
        () =>
          answer(
            200,
            readAt(
              [
                ['p1', 10],
                ['p2', 20],
                ['p3', 30],
              ],
              true,
            ),
          ),
        () =>
          answer(
            200,
            readAt(
              [
                ['p1', 10],
                ['p3', 15],
                ['p2', 20],
              ],
              true,
            ),
          ),
        () =>
          answer(
            200,
            readAt(
              [
                ['p1', 10],
                ['p3', 15],
              ],
              true,
            ),
          ),
      ],
      'GET /api/spaces/s/in-progress': [
        () => answer(200, { items: [], truncated: false, unavailable: [] }),
      ],
      'GET /api/spaces/s/roll-ups': [() => answer(503, { error: 'fixture_figures_unavailable' })],
      'GET /api/projects': [() => answer(200, { projects: [] })],
      'POST /api/spaces/s/projects/project-p3/move': [() => answer(200, { position: 15 })],
      'DELETE /api/spaces/s/projects/project-p2': [() => answerEmpty(204)],
    });
    routed(<SpacePage spaceId="s" nav={null} account={null} />);
    const up = await screen.findByRole('button', { name: 'Move Engagement p3 up' });
    up.focus();
    fireEvent.click(up);
    await waitFor(() => {
      const table = screen.getByRole('table', { name: 'Projects and work packages' });
      expect(
        within(table)
          .getAllByRole('link')
          .map((link) => link.textContent),
      ).toEqual(['p1', 'p3', 'p2']);
      expect(document.activeElement?.getAttribute('aria-label')).toBe('Move Engagement p3 up');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Engagement p2 from this space' }));
    await waitFor(() => {
      expect(document.activeElement?.tagName).toBe('H1');
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Q3' }));
      expect(screen.queryByRole('link', { name: 'p2' })).toBeNull();
    });
    expect(sent.find(({ route }) => route.endsWith('/project-p3/move'))?.body).toEqual({
      afterProjectId: 'project-p1',
    });
    expect(
      sent.filter(({ route }) => route === 'DELETE /api/spaces/s/projects/project-p2'),
    ).toHaveLength(1);
  });
});

describe('a space, drawn', () => {
  it("draws every control with the chrome's rounded box, and each panel as a card", async () => {
    stubServer({
      'GET /api/spaces/s': [() => answer(200, read(['p1', 'p2'], true))],
      'GET /api/spaces/s/in-progress': [
        () => answer(200, { items: [], truncated: false, unavailable: [] }),
      ],
      'GET /api/spaces/s/roll-ups': [
        () => answer(200, figures({ p1: rolledUp(11), p2: { kind: 'unavailable' } })),
      ],
      'GET /api/projects': [
        () => answer(200, { projects: [project('project-p4', 'Fourth', null, null)] }),
      ],
    });
    routed(<SpacePage spaceId="s" nav={null} account={null} />);
    await screen.findByLabelText('Add a project');
    const controls = [...document.querySelectorAll('main button, main input, main select')];
    expect(controls.length).toBeGreaterThan(6);
    const unstyled = controls
      .filter((control) => !control.classList.contains('rounded-md'))
      .map((control) => control.getAttribute('aria-label') ?? control.textContent);
    // Proof: 2026-10-12, restoring `WorkPackageRow`'s bare `<button>`s failed this
    // listing `Move p1 up`, `Move p1 down`, `Remove p1 from this space` and p2's.
    expect(unstyled).toEqual([]);
    const table = screen.getByRole('table', { name: 'Projects and work packages' });
    expect(table.closest('.rounded-lg.border')).not.toBeNull();
    for (const name of ['Timeline', 'In progress now']) {
      expect(
        screen.getByRole('region', { name }).querySelector('.rounded-lg.border'),
      ).not.toBeNull();
    }
  });
});

it('keeps the space visible and explains a project already assigned elsewhere', async () => {
  const sent = stubServer({
    'GET /api/spaces/s': [() => answer(200, read([], true))],
    'GET /api/projects': [
      () =>
        answer(200, {
          projects: [
            {
              id: 'candidate-project',
              organizationId: 'org-a',
              spaceId: null,
              spacePosition: null,
              name: 'Candidate project',
              revision: 0,
              createdAt: 1,
              updatedAt: null,
              createdBy: null,
              workPackageCount: 0,
            },
          ],
        }),
    ],
    'GET /api/spaces/s/in-progress': [
      () => answer(200, { items: [], truncated: false, unavailable: [] }),
    ],
    'GET /api/spaces/s/roll-ups': [() => answer(503, { error: 'fixture_figures_unavailable' })],
    'POST /api/spaces/s/projects': [
      () =>
        answer(409, {
          error: 'project_in_other_space',
          spaceId: 'private-other-space',
        }),
    ],
  });
  routed(<SpacePage spaceId="s" nav={null} account={null} />);
  const projects = await screen.findByRole('combobox', { name: 'Add a project' });
  fireEvent.change(projects, { target: { value: 'candidate-project' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  expect(
    await screen.findByText(
      'That project already belongs to another space. Remove it there before adding it here.',
    ),
  ).toBeDefined();
  expect(screen.getByRole('heading', { name: 'Q3' })).toBeDefined();
  expect(screen.getByRole('combobox', { name: 'Add a project' })).toBeDefined();
  expect(screen.queryByText('private-other-space')).toBeNull();
  expect(sent.find(({ route }) => route === 'POST /api/spaces/s/projects')?.body).toEqual({
    projectId: 'candidate-project',
    afterProjectId: null,
  });
});

it('offers one placement control set for a project with two package rows', async () => {
  const held = read(['p1', 'p1-child', 'p2'], true);
  const grouped = {
    ...held,
    space: { ...held.space, projectCount: 2 },
    projects: [
      {
        project: { id: 'project-p1', name: 'Engagement p1' },
        position: 10,
        workPackages: [workPackage('p1'), { ...workPackage('p1-child'), projectId: 'project-p1' }],
      },
      {
        project: { id: 'project-p2', name: 'Engagement p2' },
        position: 20,
        workPackages: [workPackage('p2')],
      },
    ],
  };
  stubServer({
    'GET /api/spaces/s': [() => answer(200, grouped)],
    'GET /api/projects': [() => answer(200, { projects: [] })],
    'GET /api/spaces/s/in-progress': [
      () => answer(200, { items: [], truncated: false, unavailable: [] }),
    ],
    'GET /api/spaces/s/roll-ups': [() => answer(503, { error: 'fixture_figures_unavailable' })],
  });
  routed(<SpacePage spaceId="s" nav={null} account={null} />);
  const table = await screen.findByRole('table', { name: 'Projects and work packages' });
  expect(
    within(table)
      .getAllByRole('link')
      .map((link) => link.textContent),
  ).toEqual(['p1', 'p1-child', 'p2']);
  expect(screen.getAllByRole('button', { name: /^Remove Engagement / })).toHaveLength(2);
  expect(
    screen.queryByRole('button', {
      name: 'Remove Engagement p1-child from this space',
    }),
  ).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Move Engagement p1 up' }).getAttribute('disabled'),
  ).not.toBeNull();
  expect(
    screen.getByRole('button', { name: 'Move Engagement p2 down' }).getAttribute('disabled'),
  ).not.toBeNull();
});
