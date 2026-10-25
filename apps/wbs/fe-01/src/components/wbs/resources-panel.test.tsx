import { render as renderBare } from '@testing-library/react';
import { Component, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ComputeProvider } from '@/components/organization/compute-providers-panel';
import { type ResourceScope } from '@/lib/organization-context';
import { OrganizationResourcesProvider } from '@/runtime/organization-resources';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@/testing/organization-render';
import { answerJson as answer, stubServer as baseStubServer } from '@/testing/stub-server';

import { type ProjectResource, ResourceRow, ResourcesPanel } from './resources-panel';

const NOW = Date.UTC(2026, 9, 23, 10, 0);
const CADENCE_S = 300;
const READ = 'GET /api/projects/p1/resources';
const PROVIDERS = 'GET /api/organization/compute-providers';
const PLAN = 'POST /api/projects/p1/commands';
const DIRECTORY = 'POST /api/directory/commands';
const STARTABLE = 'GET /api/projects/p1/startable';
const RESOURCE_USES = 'GET /api/projects/p1/resource-uses';
const stubServer = (routes: Parameters<typeof baseStubServer>[0]) =>
  baseStubServer({
    [RESOURCE_USES]: [() => answer(200, { uses: [], nextCursor: null })],
    ...routes,
  });

beforeEach(() => {
  // Only `Date`: the panel's 30 s tick and every promise stay on the real clock.
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const scope: ResourceScope = {
  organization: { kind: 'active', organizationId: 'org-a' },
  isCurrent: () => true,
  refuse: () => undefined,
};

const h2puni: ComputeProvider = {
  id: 'cp-1',
  kind: 'ssh_host',
  name: 'h2puni',
  locator: 'puni1@h2puni',
  createdAt: NOW - 86_400_000,
  createdBy: 'u1',
  resources: 1,
};
const builder: ComputeProvider = { ...h2puni, id: 'cp-2', kind: 'docker', name: 'builder' };

type Report = NonNullable<ProjectResource['report']>;
const measured = (fields: Partial<Report> = {}): Report => ({
  providerId: 'cp-1',
  observedAt: NOW - 120_000,
  cadenceSeconds: CADENCE_S,
  outcome: { kind: 'measured', capacityUnits: 15, usageUnits: 8 },
  reportedBy: 'p-agent',
  reportedAt: NOW - 119_000,
  ...fields,
});

const resourceOf = (fields: Partial<ProjectResource> = {}): ProjectResource => ({
  id: 'r1',
  name: 'h2puni ram',
  kind: 'divisible',
  unitLabel: 'GB',
  providerId: 'cp-1',
  ...fields,
});

const readOf =
  (resources: ProjectResource[], capacities: { resourceId: string; units: number }[] = []) =>
  () =>
    answer(200, { resources, capacities, demands: [] });
const providersOf =
  (...providers: ComputeProvider[]) =>
  () =>
    answer(200, { computeProviders: providers });
const applied = () => answer(200, { results: [{ index: 0 }], undoable: false, redoable: false });

function mount(onChanged: () => Promise<void> = () => Promise.resolve()) {
  return renderBare(
    <OrganizationResourcesProvider scope={scope}>
      <ResourcesPanel projectId="p1" shown onChanged={onChanged} onDirtyChange={() => undefined} />
    </OrganizationResourcesProvider>,
  );
}

const row = (name: string) => screen.findByRole('listitem', { name });
const plans = (sent: ReturnType<typeof stubServer>) =>
  sent.filter((request) => request.route === PLAN).map((request) => request.body);

describe('resources section states', () => {
  it('renders loading, then each resource with its declared number and provider chip', async () => {
    stubServer({
      [READ]: [
        readOf(
          [
            resourceOf({ report: measured() }),
            resourceOf({ id: 'r2', name: 'worktrees', unitLabel: '', providerId: null }),
          ],
          [{ resourceId: 'r1', units: 12 }],
        ),
      ],
      [PROVIDERS]: [providersOf(h2puni)],
    });
    mount();
    expect(screen.getByText('Loading resources…')).toBeDefined();
    const ram = await row('h2puni ram');
    expect(within(ram).getByText('12 GB')).toBeDefined();
    const picker = within(ram).getByLabelText('Compute provider of h2puni ram');
    expect(picker).toHaveValue('cp-1');
    expect(within(picker).getByRole('option', { selected: true })).toHaveTextContent(
      'h2puni (SSH host)',
    );
    const worktrees = await row('worktrees');
    expect(within(worktrees).getByText('Unstated')).toBeDefined();
    expect(within(worktrees).getByLabelText('Compute provider of worktrees')).toHaveValue('');
    expect(worktrees.getAttribute('data-report')).toBe('none');
  });

  it('renders no report yet, and no number, for a resource with no report', async () => {
    stubServer({ [READ]: [readOf([resourceOf()])], [PROVIDERS]: [providersOf(h2puni)] });
    mount();
    const ram = await row('h2puni ram');
    expect(ram.getAttribute('data-report')).toBe('no_report');
    expect(within(ram).getByText('No report yet')).toBeDefined();
    // Proof: 2026-10-23, `readReport` answering a missing report as
    // `{ measured 0 }` failed here: the row read `Measured 0 GB, 0 in use` and
    // offered `Adopt 0 GB`.
    expect(within(ram).queryByText(/Measured/)).toBeNull();
    expect(within(ram).queryByRole('button', { name: /Adopt/ })).toBeNull();
    expect(ram.querySelector('[data-report-box]')?.textContent).not.toMatch(/\d/);
  });

  it('renders a measurement with its age and the adopt action', async () => {
    stubServer({
      [READ]: [readOf([resourceOf({ report: measured() })], [{ resourceId: 'r1', units: 12 }])],
      [PROVIDERS]: [providersOf(h2puni)],
    });
    mount();
    const ram = await row('h2puni ram');
    expect(ram.getAttribute('data-report')).toBe('measured');
    expect(within(ram).getByText('Measured 15 GB, 8 in use')).toBeDefined();
    expect(within(ram).getByText('Observed 2 min ago.')).toBeDefined();
    expect(within(ram).getByRole('button', { name: /^Adopt 15 GB/ })).toHaveTextContent(
      'Adopt 15 GB',
    );
  });

  it('renders an unreachable report with its reason and no adopt', async () => {
    stubServer({
      [READ]: [
        readOf([
          resourceOf({
            report: measured({
              outcome: { kind: 'unreachable', reason: 'ssh: connection timed out' },
            }),
          }),
        ]),
      ],
      [PROVIDERS]: [providersOf(h2puni)],
    });
    mount();
    const ram = await row('h2puni ram');
    expect(ram.getAttribute('data-report')).toBe('unreachable');
    expect(within(ram).getByText('Unreachable 2 min ago')).toBeDefined();
    expect(within(ram).getByText('ssh: connection timed out')).toBeDefined();
    expect(within(ram).queryByRole('button', { name: /Adopt/ })).toBeNull();
  });

  it('is measured at exactly three cadences and stale one millisecond past, naming the boundary', async () => {
    const boundary = NOW - 3 * CADENCE_S * 1000;
    stubServer({
      [READ]: [
        readOf([
          resourceOf({ report: measured({ observedAt: boundary }) }),
          resourceOf({
            id: 'r2',
            name: 'h2puni disk',
            report: measured({ observedAt: boundary - 1 }),
          }),
        ]),
      ],
      [PROVIDERS]: [providersOf(h2puni)],
    });
    mount();
    expect((await row('h2puni ram')).getAttribute('data-report')).toBe('measured');
    const disk = await row('h2puni disk');
    expect(disk.getAttribute('data-report')).toBe('stale');
    expect(within(disk).getByText('Stale: last report 15 min ago')).toBeDefined();
    expect(
      within(disk).getByText(
        'Dash reports every 5 min; a report is stale after 15 min (3 × cadence). It measured 15 GB, 8 in use.',
      ),
    ).toBeDefined();
    expect(within(disk).queryByRole('button', { name: /Adopt/ })).toBeNull();
  });

  it('shows a member each reference unnamed, with no picker and no adopt', async () => {
    stubServer({
      [READ]: [readOf([resourceOf({ report: measured() })], [{ resourceId: 'r1', units: 12 }])],
      [PROVIDERS]: [() => answer(403, { error: 'forbidden' })],
      [STARTABLE]: [startableOf({ resourceId: 'r1', capacity: 12, occupied: 0, free: 12 })],
    });
    mount();
    const ram = await row('h2puni ram');
    expect(within(ram).getByText('Fulfilled by a compute provider')).toBeDefined();
    expect(within(ram).getByText('Measured 15 GB, 8 in use')).toBeDefined();
    expect(within(ram).queryByRole('combobox')).toBeNull();
    expect(within(ram).queryByRole('button', { name: /Adopt/ })).toBeNull();
    expect(screen.queryByText(/could not be read/)).toBeNull();
  });

  it('renders the empty directory', async () => {
    stubServer({ [READ]: [readOf([])], [PROVIDERS]: [providersOf()] });
    mount();
    expect(await screen.findByText(/This directory holds no resources yet/)).toBeDefined();
    expect(screen.queryByRole('list', { name: 'Resources' })).toBeNull();
  });

  it('renders a failed read with retry, and recovers', async () => {
    stubServer({
      [READ]: [() => answer(503, {}), readOf([resourceOf()])],
      [PROVIDERS]: [providersOf(h2puni)],
    });
    mount();
    expect(await screen.findByRole('alert')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Retry resources' }));
    expect(await row('h2puni ram')).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('sends no request while its tab is not shown', async () => {
    const sent = stubServer({ [READ]: [readOf([])], [PROVIDERS]: [providersOf()] });
    renderBare(
      <OrganizationResourcesProvider scope={scope}>
        <ResourcesPanel
          projectId="p1"
          shown={false}
          onChanged={() => Promise.resolve()}
          onDirtyChange={() => undefined}
        />
      </OrganizationResourcesProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(sent).toEqual([]);
  });
});

describe('resources section clock', () => {
  it('goes stale on its own clock without a reread', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'], now: NOW });
    const sent = stubServer({
      [READ]: [
        readOf([
          resourceOf({ report: measured({ observedAt: NOW - 3 * CADENCE_S * 1000 + 10_000 }) }),
        ]),
      ],
      [PROVIDERS]: [providersOf(h2puni)],
    });
    mount();
    const ram = await row('h2puni ram');
    expect(ram.getAttribute('data-report')).toBe('measured');
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(ram.getAttribute('data-report')).toBe('stale');
    expect(sent.filter((request) => request.route === READ)).toHaveLength(1);
  });
});

describe('resources section instances read', () => {
  it('renders a failed instances read with retry, and recovers', async () => {
    stubServer({
      [READ]: [readOf([resourceOf({ report: measured() })], [{ resourceId: 'r1', units: 12 }])],
      [PROVIDERS]: [() => answer(500, {}), providersOf(h2puni)],
    });
    mount();
    const ram = await row('h2puni ram');
    expect(await screen.findByRole('alert')).toHaveTextContent(/./);
    expect(within(ram).queryByRole('combobox')).toBeNull();
    expect(within(ram).queryByRole('button', { name: /Adopt/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry resources' }));
    expect(await within(ram).findByLabelText('Compute provider of h2puni ram')).toHaveValue('cp-1');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('resources section writes', () => {
  it('adopts once however often it is clicked, and undo restores the declared number', async () => {
    const onChanged = vi.fn(() => Promise.resolve());
    const sent = stubServer({
      [READ]: [
        readOf([resourceOf({ report: measured() })], [{ resourceId: 'r1', units: 12 }]),
        readOf([resourceOf({ report: measured() })], [{ resourceId: 'r1', units: 15 }]),
        readOf([resourceOf({ report: measured() })], [{ resourceId: 'r1', units: 12 }]),
      ],
      [PROVIDERS]: [providersOf(h2puni)],
      [PLAN]: [applied],
    });
    mount(onChanged);
    const ram = await row('h2puni ram');
    const adopt = within(ram).getByRole('button', { name: /^Adopt 15 GB/ });
    // Both clicks inside one act: the second lands before React redraws the
    // button disabled, so only the section's own admission stands between them.
    act(() => {
      adopt.click();
      adopt.click();
    });
    expect(await within(ram).findByRole('status')).toHaveTextContent(
      'Declared 15 GB from the measurement (was 12 GB).',
    );
    expect(plans(sent)).toEqual([
      { commands: [{ kind: 'setResourceCapacity', resourceId: 'r1', units: 15 }] },
    ]);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(within(ram).getByText('15 GB')).toBeDefined();
    fireEvent.click(within(ram).getByRole('button', { name: /^Undo adopting/ }));
    await waitFor(() => {
      expect(within(ram).queryByRole('status')).toBeNull();
    });
    expect(within(ram).getByText('12 GB')).toBeDefined();
    expect(plans(sent)).toEqual([
      { commands: [{ kind: 'setResourceCapacity', resourceId: 'r1', units: 15 }] },
      { commands: [{ kind: 'setResourceCapacity', resourceId: 'r1', units: 12 }] },
    ]);
  });

  it('offers no undo once another writer stated a different number', async () => {
    const sent = stubServer({
      [READ]: [
        readOf([resourceOf({ report: measured() })], [{ resourceId: 'r1', units: 12 }]),
        readOf([resourceOf({ report: measured() })], [{ resourceId: 'r1', units: 15 }]),
        readOf([resourceOf({ report: measured() })], [{ resourceId: 'r1', units: 20 }]),
      ],
      [PROVIDERS]: [providersOf(h2puni)],
      [PLAN]: [applied],
    });
    const panelShown = (shown: boolean) => (
      <OrganizationResourcesProvider scope={scope}>
        <ResourcesPanel
          projectId="p1"
          shown={shown}
          onChanged={() => Promise.resolve()}
          onDirtyChange={() => undefined}
        />
      </OrganizationResourcesProvider>
    );
    const mounted = renderBare(panelShown(true));
    const ram = await row('h2puni ram');
    fireEvent.click(within(ram).getByRole('button', { name: /^Adopt 15 GB/ }));
    expect(await within(ram).findByRole('status')).toBeDefined();
    // Somebody else states 20 GB; the tab is shown again and rereads.
    mounted.rerender(panelShown(false));
    mounted.rerender(panelShown(true));
    expect(await within(ram).findByText('20 GB')).toBeDefined();
    expect(within(ram).queryByRole('status')).toBeNull();
    expect(within(ram).queryByRole('button', { name: /^Undo adopting/ })).toBeNull();
    expect(plans(sent)).toHaveLength(1);
  });

  it('undoes an adoption over an unstated capacity by clearing it', async () => {
    const sent = stubServer({
      [READ]: [
        readOf([resourceOf({ report: measured() })]),
        readOf([resourceOf({ report: measured() })], [{ resourceId: 'r1', units: 15 }]),
        readOf([resourceOf({ report: measured() })]),
      ],
      [PROVIDERS]: [providersOf(h2puni)],
      [PLAN]: [applied],
    });
    mount();
    const ram = await row('h2puni ram');
    fireEvent.click(within(ram).getByRole('button', { name: /^Adopt 15 GB/ }));
    expect(await within(ram).findByRole('status')).toHaveTextContent('(was unstated)');
    fireEvent.click(within(ram).getByRole('button', { name: /^Undo adopting/ }));
    await waitFor(() => {
      expect(plans(sent)).toHaveLength(2);
    });
    expect(plans(sent)[1]).toEqual({
      commands: [{ kind: 'setResourceCapacity', resourceId: 'r1', units: null }],
    });
  });

  it('says a refused adopt in place and offers no undo', async () => {
    stubServer({
      [READ]: [readOf([resourceOf({ report: measured() })], [{ resourceId: 'r1', units: 12 }])],
      [PROVIDERS]: [providersOf(h2puni)],
      [PLAN]: [
        () =>
          answer(409, {
            error: 'capacity_limit',
            at: 0,
            kind: 'setResourceCapacity',
            resourceId: 'r1',
            cap: 16,
            declared: 8,
            asked: 15,
          }),
      ],
    });
    mount();
    const ram = await row('h2puni ram');
    fireEvent.click(within(ram).getByRole('button', { name: /^Adopt 15 GB/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Organization limit: h2puni ram would declare 23 of 16 units across your projects (8 stated by your other projects, 15 asked here). Nothing was changed.',
    );
    expect(within(ram).queryByRole('status')).toBeNull();
    expect(within(ram).getByText('12 GB')).toBeDefined();
  });

  it('names an instance on a resource through the directory command', async () => {
    const sent = stubServer({
      [READ]: [
        readOf([resourceOf({ providerId: null })]),
        readOf([resourceOf({ providerId: 'cp-2' })]),
      ],
      [PROVIDERS]: [providersOf(h2puni, builder)],
      [DIRECTORY]: [() => answer(200, { results: [{ index: 0 }] })],
    });
    mount();
    const ram = await row('h2puni ram');
    const picker = within(ram).getByLabelText('Compute provider of h2puni ram');
    expect(
      within(picker)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['None', 'h2puni (SSH host)', 'builder (Docker)']);
    fireEvent.change(picker, { target: { value: 'cp-2' } });
    await waitFor(() => {
      expect(within(ram).getByLabelText('Compute provider of h2puni ram')).toHaveValue('cp-2');
    });
    expect(sent.find((request) => request.route === DIRECTORY)?.body).toEqual({
      commands: [{ kind: 'patchResource', resourceId: 'r1', patch: { providerId: 'cp-2' } }],
    });
  });

  it.each([
    [
      'unknown_provider',
      404,
      'That compute provider is no longer registered — someone may have removed it. Nothing was changed.',
    ],
    [
      'provider_not_in_organization',
      409,
      'That compute provider belongs to another organization, so this resource cannot name it. Nothing was changed.',
    ],
  ] as const)('says %s on a provider change, never as a change', async (error, status, text) => {
    stubServer({
      [READ]: [readOf([resourceOf({ providerId: null })])],
      [PROVIDERS]: [providersOf(h2puni)],
      [DIRECTORY]: [() => answer(status, { error, at: 0, kind: 'patchResource' })],
    });
    mount();
    const ram = await row('h2puni ram');
    fireEvent.change(within(ram).getByLabelText('Compute provider of h2puni ram'), {
      target: { value: 'cp-1' },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(within(ram).getByLabelText('Compute provider of h2puni ram')).toHaveValue('');
  });
});

class ReportFaultBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? (
      <div role="alert">Resources could not be rendered.</div>
    ) : (
      this.props.children
    );
  }
}

describe('resources section faults', () => {
  it('draws an impossible report outcome from the read as a failed read', async () => {
    stubServer({
      [READ]: [
        readOf([
          resourceOf({
            // An impossible union value: the read's schema refuses it at the boundary.
            report: measured({ outcome: { kind: 'guessed' } as unknown as Report['outcome'] }),
          }),
        ]),
      ],
      [PROVIDERS]: [providersOf(h2puni)],
    });
    mount();
    expect(await screen.findByRole('alert')).toBeDefined();
    expect(screen.queryByRole('listitem', { name: 'h2puni ram' })).toBeNull();
  });

  it('routes an impossible report outcome to the Error Boundary', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderBare(
      <ReportFaultBoundary>
        <ResourceRow
          resource={resourceOf({
            // An impossible union value, which the read's schema never lets through.
            report: measured({ outcome: { kind: 'guessed' } as unknown as Report['outcome'] }),
          })}
          declared={12}
          providers={{ kind: 'unnamed' }}
          now={NOW}
          busy={false}
          adoption={null}
          onAdopt={() => undefined}
          onUndo={() => undefined}
          onProvider={() => undefined}
        />
      </ReportFaultBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Resources could not be rendered.');
    error.mockRestore();
  });
});

const directories = (sent: ReturnType<typeof stubServer>) =>
  sent.filter((request) => request.route === DIRECTORY).map((request) => request.body);

describe('resources section directory (wbs-resources 1.5)', () => {
  it('adds a resource with its kind and unit, and clears the form once it lands', async () => {
    const sent = stubServer({
      [READ]: [
        readOf([]),
        readOf([resourceOf({ id: 'r9', name: 'staging', kind: 'exclusive', unitLabel: 'env' })]),
      ],
      [PROVIDERS]: [providersOf(h2puni)],
      [DIRECTORY]: [() => answer(200, { results: [{ index: 0, id: 'r9' }] })],
    });
    mount();
    const form = await screen.findByRole('form', { name: 'Add a resource' });
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: ' staging ' } });
    fireEvent.change(within(form).getByLabelText('Kind'), { target: { value: 'exclusive' } });
    fireEvent.change(within(form).getByLabelText('Unit'), { target: { value: 'env' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add resource' }));
    expect(await row('staging')).toBeDefined();
    expect(directories(sent)).toEqual([
      {
        commands: [
          { kind: 'createResource', name: 'staging', resourceKind: 'exclusive', unitLabel: 'env' },
        ],
      },
    ]);
    expect(within(form).getByLabelText('Name')).toHaveValue('');
  });

  it('says a name already held in place and keeps what was typed', async () => {
    stubServer({
      [READ]: [readOf([resourceOf()])],
      [PROVIDERS]: [providersOf(h2puni)],
      [DIRECTORY]: [
        () => answer(409, { error: 'taken', at: 0, kind: 'createResource', name: 'h2puni ram' }),
      ],
    });
    mount();
    const form = await screen.findByRole('form', { name: 'Add a resource' });
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'h2puni ram' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add resource' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A resource named “h2puni ram” already exists. Nothing was changed.',
    );
    expect(within(form).getByLabelText('Name')).toHaveValue('h2puni ram');
  });

  it('says a role that may not change the directory, never hiding the refusal', async () => {
    stubServer({
      [READ]: [readOf([resourceOf()])],
      [PROVIDERS]: [() => answer(403, { error: 'forbidden' })],
      [DIRECTORY]: [() => answer(403, { error: 'forbidden' })],
    });
    mount();
    const form = await screen.findByRole('form', { name: 'Add a resource' });
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'disk' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add resource' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Your role cannot change this organization’s resources/,
    );
  });

  it('renames a resource and changes its unit label through patchResource', async () => {
    const sent = stubServer({
      [READ]: [readOf([resourceOf()]), readOf([resourceOf({ name: 'h2 ram', unitLabel: 'GiB' })])],
      [PROVIDERS]: [providersOf(h2puni)],
      [DIRECTORY]: [applied],
    });
    mount();
    const ram = await row('h2puni ram');
    fireEvent.click(within(ram).getByRole('button', { name: 'Edit h2puni ram' }));
    const form = within(ram).getByRole('form', { name: 'Edit h2puni ram' });
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'h2 ram' } });
    fireEvent.change(within(form).getByLabelText('Unit'), { target: { value: 'GiB' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    expect(await row('h2 ram')).toBeDefined();
    expect(directories(sent)).toEqual([
      {
        commands: [
          {
            kind: 'patchResource',
            resourceId: 'r1',
            patch: { name: 'h2 ram', unitLabel: 'GiB' },
          },
        ],
      },
    ]);
  });

  const inUse = (demands: number, occupancies: number, other: string | null) => () =>
    answer(409, {
      error: 'in_use',
      at: 0,
      kind: 'deleteResource',
      usage: {
        projects: [
          {
            id: 'p1',
            name: 'This plan',
            workItems: [{ id: 'w1', number: '010', name: 'A', effects: [] }],
          },
          ...(other === null
            ? []
            : [
                {
                  id: 'p2',
                  name: other,
                  workItems: [{ id: 'w9', number: '020', name: 'B', effects: [] }],
                },
              ]),
        ],
        members: [],
      },
      counts: { demands, capacities: 1, occupancies },
    });

  it('names what still uses a resource and removes it with them on confirm', async () => {
    const onChanged = vi.fn(() => Promise.resolve());
    const sent = stubServer({
      [READ]: [readOf([resourceOf()]), readOf([])],
      [PROVIDERS]: [providersOf(h2puni)],
      [DIRECTORY]: [inUse(2, 1, 'Swarm B'), inUse(2, 1, 'Swarm B'), applied],
    });
    mount(onChanged);
    const ram = await row('h2puni ram');
    fireEvent.click(within(ram).getByRole('button', { name: 'Remove h2puni ram' }));
    // The plain confirm first: nothing is sent until it is answered.
    expect(await within(ram).findByRole('alert')).toHaveTextContent(/cannot be undone/);
    expect(directories(sent)).toEqual([]);
    fireEvent.click(within(ram).getByRole('button', { name: 'Remove h2puni ram' }));
    const alert = await within(ram).findByText(/is still used by/);
    expect(alert.closest('[role="alert"]')).toHaveTextContent(
      'h2puni ram is still used by 2 demands, 1 capacity and 1 claim holding it. Its demands are in this project (1 work item) and “Swarm B” (1 work item). Capacities and claims are counted across every project. Removing it with them takes all of these away, and cannot be undone.' +
        '1 live claim holds it: its agent keeps the claim but no longer holds these units.',
    );
    expect(onChanged).not.toHaveBeenCalled();
    fireEvent.click(within(ram).getByRole('button', { name: 'Remove with them' }));
    expect(await screen.findByText(/This directory holds no resources yet/)).toBeDefined();
    // The re-check before the cascade answered what was shown.
    expect(directories(sent)).toEqual([
      { commands: [{ kind: 'deleteResource', resourceId: 'r1' }] },
      { commands: [{ kind: 'deleteResource', resourceId: 'r1' }] },
      { commands: [{ kind: 'deleteResource', resourceId: 'r1', cascade: true }] },
    ]);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('asks again when what uses a resource changed since it was shown', async () => {
    const sent = stubServer({
      [READ]: [readOf([resourceOf()])],
      [PROVIDERS]: [providersOf(h2puni)],
      [DIRECTORY]: [inUse(2, 0, null), inUse(3, 0, 'Swarm B')],
    });
    mount();
    const ram = await row('h2puni ram');
    fireEvent.click(within(ram).getByRole('button', { name: 'Remove h2puni ram' }));
    fireEvent.click(await within(ram).findByRole('button', { name: 'Remove h2puni ram' }));
    fireEvent.click(await within(ram).findByRole('button', { name: 'Remove with them' }));
    expect(await within(ram).findByText(/changed since you were shown/)).toBeDefined();
    expect(within(ram).getByRole('alert')).toHaveTextContent(/3 demands/);
    expect(within(ram).getByRole('alert')).toHaveTextContent(/“Swarm B”/);
    expect(directories(sent)).toEqual([
      { commands: [{ kind: 'deleteResource', resourceId: 'r1' }] },
      { commands: [{ kind: 'deleteResource', resourceId: 'r1' }] },
    ]);
  });

  it('removes an unused resource only after a confirm naming its provider link', async () => {
    const sent = stubServer({
      [READ]: [readOf([resourceOf()]), readOf([])],
      [PROVIDERS]: [providersOf(h2puni)],
      [DIRECTORY]: [applied],
    });
    mount();
    const ram = await row('h2puni ram');
    fireEvent.click(within(ram).getByRole('button', { name: 'Remove h2puni ram' }));
    expect(await within(ram).findByRole('alert')).toHaveTextContent(
      'Remove h2puni ram from the directory? Every project loses it, and it cannot be undone: the plan’s Undo does not reach the directory, and its compute provider link goes with it.',
    );
    // Keep is where the keyboard lands, and Keep sends nothing.
    expect(document.activeElement).toBe(
      within(ram).getByRole('button', { name: 'Keep h2puni ram' }),
    );
    fireEvent.click(within(ram).getByRole('button', { name: 'Keep h2puni ram' }));
    expect(within(ram).queryByRole('alert')).toBeNull();
    expect(document.activeElement).toBe(
      within(ram).getByRole('button', { name: 'Remove h2puni ram' }),
    );
    expect(directories(sent)).toEqual([]);
    fireEvent.click(within(ram).getByRole('button', { name: 'Remove h2puni ram' }));
    fireEvent.click(await within(ram).findByRole('button', { name: 'Remove h2puni ram' }));
    expect(await screen.findByText(/This directory holds no resources yet/)).toBeDefined();
    expect(directories(sent)).toEqual([
      { commands: [{ kind: 'deleteResource', resourceId: 'r1' }] },
    ]);
  });

  it('lands on the next resource after a removal, and on Add after the last', async () => {
    const disk = resourceOf({ id: 'r2', name: 'h2puni disk', providerId: null });
    stubServer({
      [READ]: [readOf([resourceOf(), disk]), readOf([disk]), readOf([])],
      [PROVIDERS]: [providersOf(h2puni)],
      [DIRECTORY]: [applied],
    });
    mount();
    const ram = await row('h2puni ram');
    fireEvent.click(within(ram).getByRole('button', { name: 'Remove h2puni ram' }));
    fireEvent.click(await within(ram).findByRole('button', { name: 'Remove h2puni ram' }));
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Edit h2puni disk' }));
    });
    const left = await row('h2puni disk');
    fireEvent.click(within(left).getByRole('button', { name: 'Remove h2puni disk' }));
    fireEvent.click(await within(left).findByRole('button', { name: 'Remove h2puni disk' }));
    const form = await screen.findByRole('form', { name: 'Add a resource' });
    await waitFor(() => {
      expect(document.activeElement).toBe(within(form).getByLabelText('Name'));
    });
  });

  it('moves the keyboard into the edit form and back to Edit', async () => {
    stubServer({ [READ]: [readOf([resourceOf()])], [PROVIDERS]: [providersOf(h2puni)] });
    mount();
    const ram = await row('h2puni ram');
    fireEvent.click(within(ram).getByRole('button', { name: 'Edit h2puni ram' }));
    const form = within(ram).getByRole('form', { name: 'Edit h2puni ram' });
    expect(document.activeElement).toBe(within(form).getByLabelText('Name'));
    fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }));
    expect(document.activeElement).toBe(
      within(ram).getByRole('button', { name: 'Edit h2puni ram' }),
    );
  });

  it('states and clears this project’s capacity by hand', async () => {
    const onChanged = vi.fn(() => Promise.resolve());
    const sent = stubServer({
      [READ]: [
        readOf([resourceOf()]),
        readOf([resourceOf()], [{ resourceId: 'r1', units: 16 }]),
        readOf([resourceOf()]),
      ],
      [PROVIDERS]: [providersOf(h2puni)],
      [PLAN]: [applied],
    });
    mount(onChanged);
    const ram = await row('h2puni ram');
    const box = within(ram).getByRole('textbox', { name: 'This project may use h2puni ram' });
    fireEvent.change(box, { target: { value: '16' } });
    fireEvent.click(within(ram).getByRole('button', { name: 'State' }));
    expect(await within(ram).findByText('16 GB')).toBeDefined();
    fireEvent.change(box, { target: { value: '' } });
    fireEvent.click(within(ram).getByRole('button', { name: 'State' }));
    expect(await within(ram).findByText('Unstated')).toBeDefined();
    expect(plans(sent)).toEqual([
      { commands: [{ kind: 'setResourceCapacity', resourceId: 'r1', units: 16 }] },
      { commands: [{ kind: 'setResourceCapacity', resourceId: 'r1', units: null }] },
    ]);
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it('says a capacity that is not a number in place', async () => {
    const sent = stubServer({
      [READ]: [readOf([resourceOf()])],
      [PROVIDERS]: [providersOf(h2puni)],
      [PLAN]: [applied],
    });
    mount();
    const ram = await row('h2puni ram');
    for (const typed of ['0x10', '9'.repeat(400)]) {
      fireEvent.change(
        within(ram).getByRole('textbox', { name: 'This project may use h2puni ram' }),
        { target: { value: typed } },
      );
      fireEvent.click(within(ram).getByRole('button', { name: 'State' }));
      expect(await screen.findByRole('alert'), typed).toHaveTextContent(
        'The declared capacity of h2puni ram is a whole number, or blank for unstated.',
      );
    }
    expect(plans(sent)).toEqual([]);
  });
});

const startableOf =
  (...resources: { resourceId: string; occupied: number; free: number; capacity: number }[]) =>
  () =>
    answer(200, {
      leaves: [],
      claimed: [],
      subtreeClaims: [],
      occupancyScope: 'project',
      resources: resources.map((each) => ({
        ...each,
        name: 'h2puni ram',
        unitLabel: 'GB',
        kind: 'divisible',
      })),
    });

describe('resources section holdings (wbs-resources 1.5)', () => {
  it('says what claims hold of a stated resource and what is free', async () => {
    stubServer({
      [READ]: [readOf([resourceOf()], [{ resourceId: 'r1', units: 32 }])],
      [PROVIDERS]: [providersOf(h2puni)],
      [STARTABLE]: [startableOf({ resourceId: 'r1', capacity: 32, occupied: 6, free: 26 })],
    });
    mount();
    const ram = await row('h2puni ram');
    expect(within(ram).getByText('Claims hold 6 GB')).toBeDefined();
    expect(within(ram).getByText('26 GB free')).toBeDefined();
    expect(screen.queryByText(/could not be read/)).toBeNull();
  });

  it('says the holdings are missing when the startable read fails', async () => {
    stubServer({
      [READ]: [readOf([resourceOf()], [{ resourceId: 'r1', units: 32 }])],
      [PROVIDERS]: [providersOf(h2puni)],
      [STARTABLE]: [() => answer(500, {})],
    });
    mount();
    const ram = await row('h2puni ram');
    expect(
      await screen.findByText(
        'What claims hold right now could not be read; the declared numbers below are current.',
      ),
    ).toBeDefined();
    expect(within(ram).queryByText(/free$/)).toBeNull();
  });
});

describe('resources section holdings from an older server', () => {
  it('says a server that reports no holdings', async () => {
    stubServer({
      [READ]: [readOf([resourceOf()], [{ resourceId: 'r1', units: 32 }])],
      [PROVIDERS]: [providersOf(h2puni)],
      [STARTABLE]: [() => answer(200, { leaves: [], claimed: [], subtreeClaims: [] })],
    });
    mount();
    const ram = await row('h2puni ram');
    expect(
      await screen.findByText(
        'This server does not report what claims hold; the declared numbers below are current.',
      ),
    ).toBeDefined();
    expect(within(ram).queryByText(/Claims hold|No claim holds/)).toBeNull();
  });

  it('says a stated resource the holdings list leaves out', async () => {
    stubServer({
      [READ]: [readOf([resourceOf()], [{ resourceId: 'r1', units: 32 }])],
      [PROVIDERS]: [providersOf(h2puni)],
      [STARTABLE]: [startableOf()],
    });
    mount();
    const ram = await row('h2puni ram');
    expect(await within(ram).findByText('No holdings were reported for it.')).toBeDefined();
  });
});

describe('resource-use integration', () => {
  it('shows a registered use in the live Resources section', async () => {
    stubServer({
      [READ]: [readOf([resourceOf()])],
      [PROVIDERS]: [providersOf(h2puni)],
      [RESOURCE_USES]: [
        () =>
          answer(200, {
            uses: [
              {
                id: 'u1',
                source: 'reported',
                organizationId: 'org-a',
                projectId: 'p1',
                projectName: 'Plan',
                resourceId: 'r1',
                resourceName: 'h2puni ram',
                unitLabel: 'GB',
                providerId: 'cp-1',
                providerName: 'h2puni',
                workItemId: 'w1',
                workItemName: 'Compile',
                stepId: null,
                attemptNumber: null,
                agentRun: 'run-7',
                responsiblePersonId: 'agent-1',
                responsiblePersonName: 'Build agent',
                locator: '/work/build-7',
                units: 12,
                state: 'cleanup_pending',
                revision: 2,
                createdAt: NOW,
                updatedAt: NOW,
                createdBy: 'u1',
                updatedBy: 'u1',
                retention: null,
              },
            ],
            nextCursor: null,
          }),
      ],
    });
    mount();
    expect(
      await screen.findByRole('listitem', { name: /h2puni ram for Compile/ }),
    ).toHaveTextContent('Cleanup pending');
    expect(await row('h2puni ram')).toBeDefined();
  });

  it('keeps the resource editor available when tracking is refused', async () => {
    stubServer({
      [READ]: [readOf([resourceOf()])],
      [PROVIDERS]: [providersOf(h2puni)],
      [RESOURCE_USES]: [() => answer(503, { error: 'resource_tracking_unavailable' })],
    });
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('Resource uses could not be read');
    expect(await row('h2puni ram')).toBeDefined();
    expect(screen.getByRole('button', { name: /Edit h2puni ram/ })).toBeDefined();
  });
});
