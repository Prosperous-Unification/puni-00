import { cleanup, render, screen, within } from '@testing-library/react';
import { Component, type ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { httpSavedPlanApi } from '../../lib/saved-plan-api';
import { SavedPlansPanelOver } from '../../testing/saved-plans-panel-over';
import type { SavedPlanComparisonState } from './saved-plan-compare';
import { SavedPlanComparison } from './saved-plan-compare';

const project = { projectId: 'foreign', name: 'Captured upstream', abbreviation: 'OLD' };
const connected = {
  kind: 'connected',
  targetProjectId: 'p1',
  mode: 'shared',
  placementState: { kind: 'scheduled' },
  projects: [project],
  idleProjects: [project],
  stages: [
    {
      ...project,
      engine: 'optimized',
      objective: 'time',
      selected: 'pri',
      observation: {
        inputHash: 'captured-hash',
        contractVersion: 'v1',
        budgetMs: 123,
        quantum: 2,
        wireVersion: 1,
      },
      variants: {
        pri: { state: 'ready', questionHash: 'q1', proof: 'proven', chosen: 'optimized' },
        time: {
          state: 'boundary-infeasible',
          questionHash: 'q2',
          evidence: 'contradictory-bounds',
        },
      },
      boundary: {
        kind: 'connected-stage',
        projectId: 'foreign',
        format: 'connected-stage-v1',
        canonical: '{"frozen":true}',
        originOrdinal: 17,
        fixed: [
          {
            projectId: project.projectId,
            projectName: project.name,
            projectAbbreviation: project.abbreviation,
            workItemId: 'w-old',
            workItemName: 'Captured work',
            stepId: null,
            stepName: null,
            start: 1.25,
            finish: 3.75,
          },
        ],
      },
    },
  ],
};
const comparison = () => ({
  diff: { input: [], schedule: [] },
  left: {
    source: { kind: 'saved', savedPlanId: 'sp1' },
    schedule: { present: true, algorithmId: 'historical' },
    provenance: structuredClone(connected),
  },
  right: {
    source: { kind: 'current' },
    schedule: { present: false, absentReason: 'cycle' },
    provenance: { kind: 'local' },
  },
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function readRequestUrl(request: RequestInfo | URL): string {
  return typeof request === 'string'
    ? request
    : request instanceof URL
      ? request.href
      : request.url;
}

function serve(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn((request: RequestInfo | URL) => {
      const url = readRequestUrl(request);
      if (url.includes('/compare')) return Promise.resolve(Response.json(body));
      if (url.includes('/saved-plans'))
        return Promise.resolve(
          Response.json({
            savedPlans: [
              {
                id: 'sp1',
                name: 'Checkpoint',
                createdBy: 'Ada',
                createdAt: 1,
                inputBytes: 1,
                scheduleBytes: null,
                scheduleAbsentReason: 'contradictory-shelf',
              },
            ],
          }),
        );
      throw new Error(`Unexpected live lookup: ${url}`);
    }),
  );
}

it('renders both frozen summaries through the HTTP client and panel even for an empty diff and contradictory shelf', async () => {
  serve(comparison());
  render(
    <SavedPlansPanelOver
      projectId="p1"
      routes={{
        ...httpSavedPlanApi(),
        available: () => Promise.resolve(true),
        subscribe: () => ({ unsubscribe: () => undefined }),
      }}
    />,
  );
  const left = await screen.findByRole('region', { name: 'Left frozen provenance' });
  expect(within(left).getByText('Schedule captured (historical).')).toBeTruthy();
  expect(within(left).getAllByText('Captured upstream (OLD)').length).toBeGreaterThan(0);
  expect(within(left).getByText(/start offset 1.25; finish offset 3.75/)).toBeTruthy();
  expect(within(left).getByText(/Origin ordinal: 17/)).toBeTruthy();
  expect(within(left).getByText(/boundary infeasible.*contradictory-bounds/)).toBeTruthy();
  expect(within(left).getByText(/ready.*proven.*optimized/)).toBeTruthy();
  expect(within(left).getByText('{"frozen":true}')).toBeTruthy();
  expect(screen.getByRole('region', { name: 'Right frozen provenance' }).textContent).toContain(
    'cycle',
  );
  expect(screen.getByText(/No differences/)).toBeTruthy();
  expect(
    screen.queryByText(/contradictory-shelf/, { selector: '.saved-plan-compare__absent' }),
  ).toBeNull();
  expect(vi.mocked(fetch).mock.calls.map(([request]) => readRequestUrl(request))).toEqual([
    '/api/projects/p1/saved-plans',
    '/api/projects/p1/saved-plans/compare?left=sp1&right=current',
  ]);
});

it.each(['left-source', 'right-source', 'left-project', 'right-project'])(
  'refuses post-decode evidence with wrong %s binding',
  async (fault) => {
    const body = comparison();
    if (fault === 'left-source') body.left.source.savedPlanId = 'other';
    if (fault === 'right-source')
      Object.assign(body.right.source, { kind: 'saved', savedPlanId: 'sp1' });
    if (fault === 'left-project') body.left.provenance.targetProjectId = 'other';
    if (fault === 'right-project')
      Object.assign(body.right, { provenance: { ...connected, targetProjectId: 'other' } });
    serve(body);
    const reply = await httpSavedPlanApi().compare('p1', { saved: 'sp1' }, 'current');
    expect(reply.kind).toBe('failure');
    if (reply.kind === 'failure') expect(reply.failure.code).toBe('invalid_response');
  },
);

it.each([
  [{ kind: 'dependency_calendar_missing', projects: [project] }, 'dependency calendars missing'],
  [
    {
      kind: 'engine_unavailable',
      engine: 'optimized',
      projects: ['foreign'],
      reason: 'adapter_missing',
    },
    'engine unavailable',
  ],
  [{ kind: 'unavailable', reason: 'cycle' }, 'unavailable: cycle'],
  [{ kind: 'unavailable', reason: 'calendar_range' }, 'unavailable: calendar_range'],
])('shows captured placement availability %j', async (placement, words) => {
  const body = comparison();
  Object.assign(body.left.provenance, { placementState: placement });
  serve(body);
  render(
    <SavedPlansPanelOver
      projectId="p1"
      routes={{
        ...httpSavedPlanApi(),
        available: () => Promise.resolve(true),
        subscribe: () => ({ unsubscribe: () => undefined }),
      }}
    />,
  );
  const left = await screen.findByRole('region', { name: 'Left frozen provenance' });
  expect(left.textContent).toContain(words);
  expect(left.textContent).toContain('Schedule captured (historical).');
});

it.each([
  [{ state: 'idle' }, 'idle at capture'],
  [{ state: 'pending' }, 'pending at capture'],
  [{ state: 'retrying' }, 'retrying at capture'],
  [{ state: 'failed', reason: 'timeout' }, 'failed; timeout'],
  [{ state: 'corrupt', message: 'captured fault' }, 'corrupt; captured fault'],
  [
    {
      state: 'plan-infeasible',
      items: [{ ownerWorkItemId: 'owner', boundWorkItemId: 'bound', effectiveDeadlineOffset: 4.5 }],
    },
    'whole plan infeasible; owner / bound: deadline offset 4.5',
  ],
])(
  'shows captured objective %j without changing a valid schedule or offering live retry',
  async (variant, words) => {
    const body = comparison();
    Object.assign(body.left.provenance.stages[0].variants, { time: variant });
    serve(body);
    render(
      <SavedPlansPanelOver
        projectId="p1"
        routes={{
          ...httpSavedPlanApi(),
          available: () => Promise.resolve(true),
          subscribe: () => ({ unsubscribe: () => undefined }),
        }}
      />,
    );
    const left = await screen.findByRole('region', { name: 'Left frozen provenance' });
    expect(left.textContent).toContain(words);
    expect(left.textContent).toContain('Schedule captured (historical).');
    expect(left.textContent).toContain('ready; proven; chosen optimized');
    expect(within(left).queryByRole('button')).toBeNull();
  },
);

class HistoryBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? (
      <p>Historical evidence could not be rendered.</p>
    ) : (
      this.props.children
    );
  }
}

it.each(['provenance', 'placement', 'outcome', 'source'])(
  'throws an impossible decoded %s union into the Error Boundary',
  (fault) => {
    const body = comparison();
    if (fault === 'source') Object.assign(body.left, { source: { kind: 'future' } });
    if (fault === 'provenance') Object.assign(body.left, { provenance: { kind: 'future' } });
    if (fault === 'placement')
      Object.assign(body.left.provenance, { placementState: { kind: 'future' } });
    if (fault === 'outcome')
      Object.assign(body.left.provenance.stages[0].variants, { time: { state: 'future' } });
    // Inject after decoding: the renderer must refuse impossible internal unions independently of ArkType.
    const state = {
      kind: 'ready',
      left: { saved: 'sp1' },
      right: 'current',
      diff: body.diff,
      summaries: { left: body.left, right: body.right },
      rows: [],
      livePlanRevision: 0,
    } as unknown as SavedPlanComparisonState;
    const logging = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      render(
        <HistoryBoundary>
          <SavedPlanComparison state={state} />
        </HistoryBoundary>,
      );
      expect(screen.getByText('Historical evidence could not be rendered.')).toBeTruthy();
    } finally {
      logging.mockRestore();
    }
  },
);

it('keeps a stage’s earlier foreign interval apart from final schedule differences', async () => {
  const body = comparison();
  Object.assign(body, {
    diff: {
      input: [],
      schedule: [
        { category: 'dates', path: 'schedule.positions[foreign].start', left: 99, right: 100 },
      ],
    },
  });
  serve(body);
  render(
    <SavedPlansPanelOver
      projectId="p1"
      routes={{
        ...httpSavedPlanApi(),
        available: () => Promise.resolve(true),
        subscribe: () => ({ unsubscribe: () => undefined }),
      }}
    />,
  );
  const left = await screen.findByRole('region', { name: 'Left frozen provenance' });
  expect(within(left).getByText(/start offset 1.25; finish offset 3.75/)).toBeTruthy();
  expect(screen.getByLabelText('The schedule').textContent).toContain('99');
});

it('renders a captured Fast stage without inventing optimization outcomes or foreign intervals', async () => {
  const body = comparison();
  Object.assign(body.left.provenance, { idleProjects: [] });
  const stage = body.left.provenance.stages[0];
  Object.assign(stage, { engine: 'fast', observation: null, variants: null, selected: null });
  Object.assign(stage.boundary, { fixed: [] });
  serve(body);
  render(
    <SavedPlansPanelOver
      projectId="p1"
      routes={{
        ...httpSavedPlanApi(),
        available: () => Promise.resolve(true),
        subscribe: () => ({ unsubscribe: () => undefined }),
      }}
    />,
  );
  const left = await screen.findByRole('region', { name: 'Left frozen provenance' });
  expect(within(left).getByText('No optimization observation captured.')).toBeTruthy();
  expect(within(left).getByText('No objective outcomes captured.')).toBeTruthy();
  expect(within(left).getByText('No foreign intervals captured.')).toBeTruthy();
});
