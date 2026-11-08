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
const ACTIVE = 'GET /api/organization/active';

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
/** The caller's role in org-a, as `GET /api/organization/active` answers it. */
const activeAs =
  (role: 'super_admin' | 'admin' | 'member' | 'viewer', organizationId = 'org-a') =>
  () =>
    answer(200, { organizationId, name: 'Org A', role });
/**
 * The stub server with the caller an admin of org-a unless `routes` answers
 * the role read itself: the section asks for the role before anything that
 * depends on it.
 */
const serve = (routes: Parameters<typeof stubServer>[0]) =>
  stubServer({ [ACTIVE]: [activeAs('admin')], ...routes });
const applied = () => answer(200, { results: [{ index: 0 }], undoable: false, redoable: false });

function mount(onChanged: () => Promise<void> = () => Promise.resolve(), resourceScope = scope) {
  return renderBare(
    <OrganizationResourcesProvider scope={resourceScope}>
      <ResourcesPanel projectId="p1" shown onChanged={onChanged} onDirtyChange={() => undefined} />
    </OrganizationResourcesProvider>,
  );
}

const row = (name: string) => screen.findByRole('listitem', { name });
/** A row's provider chip, found by the words a screen reader reads from it. */
const chipIn = (scope: HTMLElement, words: string) =>
  within(scope).getByText(
    (_content, node) =>
      node?.hasAttribute('data-provider-chip') === true && node.textContent === words,
  );
const providerReads = (sent: ReturnType<typeof stubServer>) =>
  sent.filter((request) => request.route === PROVIDERS);
const plans = (sent: ReturnType<typeof stubServer>) =>
  sent.filter((request) => request.route === PLAN).map((request) => request.body);

describe('resources section states', () => {
  it('renders loading, then each resource with its declared number and provider chip', async () => {
    serve({
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
    serve({ [READ]: [readOf([resourceOf()])], [PROVIDERS]: [providersOf(h2puni)] });
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
    serve({
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

  // `dash-host-jobs` 5.3, "Reserved by two jobs": beside the measured figure, adopt unchanged.
  it('renders reserved units and the two gates holding them beside the measurement', async () => {
    const reservations = [{ dimension: 'memoryGib', units: 6 }];
    serve({
      [READ]: [
        readOf([
          resourceOf({
            unitLabel: 'GiB',
            report: measured({
              outcome: {
                kind: 'measured',
                capacityUnits: 15,
                usageUnits: 8,
                reservedUnits: 12,
                reservedDimension: 'memoryGib',
              },
            }),
            hostJobs: [
              {
                useId: 'j1',
                label: 'gate 1a2b3c4',
                type: 'puni-00-gate',
                host: 'h2puni',
                reservations,
              },
              {
                useId: 'j2',
                label: 'gate 5d6e7f8',
                type: 'puni-00-gate',
                host: 'h2puni',
                reservations,
              },
            ],
          }),
        ]),
      ],
      [PROVIDERS]: [providersOf(h2puni)],
    });
    mount();
    const ram = await row('h2puni ram');
    expect(ram.getAttribute('data-report')).toBe('measured');
    expect(within(ram).getByText('Measured 15 GiB, 8 in use, 12 reserved by 2 jobs')).toBeDefined();
    expect(
      within(ram).getByText('Reserved by gate 1a2b3c4 and gate 5d6e7f8. Observed 2 min ago.'),
    ).toBeDefined();
    expect(within(ram).getByRole('button', { name: /^Adopt 15 GiB/ })).toHaveTextContent(
      'Adopt 15 GiB',
    );
  });

  it('renders an unreachable report with its reason and no adopt', async () => {
    serve({
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
    serve({
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

  it('names the instance on the row for a member, with no picker, and offers a member Adopt', async () => {
    const sent = serve({
      [READ]: [
        readOf(
          [resourceOf({ provider: { kind: 'ssh_host', name: 'h2puni' }, report: measured() })],
          [{ resourceId: 'r1', units: 12 }],
        ),
      ],
      [PROVIDERS]: [() => answer(403, { error: 'forbidden' })],
      [ACTIVE]: [activeAs('member')],
      [STARTABLE]: [startableOf({ resourceId: 'r1', capacity: 12, occupied: 0, free: 12 })],
    });
    mount();
    const ram = await row('h2puni ram');
    expect(providerReads(sent)).toEqual([]);
    expect(chipIn(ram, 'Compute provider: SSH host·h2puni')).toBeDefined();
    expect(within(ram).queryByText('Fulfilled by a compute provider')).toBeNull();
    expect(within(ram).queryByRole('combobox')).toBeNull();
    // be-01 lets a member state capacity, so Adopt follows the role, not the providers list.
    expect(within(ram).getByRole('button', { name: /^Adopt 15 GB/ })).toBeDefined();
  });

  it('shows the chip to an admin beside the picker, and none on a resource without one', async () => {
    serve({
      [READ]: [
        readOf([
          resourceOf({ provider: { kind: 'docker', name: 'builder' }, providerId: 'cp-2' }),
          resourceOf({ id: 'r2', name: 'worktrees', unitLabel: '', providerId: null }),
        ]),
      ],
      [PROVIDERS]: [providersOf(h2puni, builder)],
    });
    mount();
    const ram = await row('h2puni ram');
    expect(chipIn(ram, 'Compute provider: Docker·builder')).toBeDefined();
    expect(within(ram).getByLabelText('Compute provider of h2puni ram')).toHaveValue('cp-2');
    const worktrees = await row('worktrees');
    expect(worktrees.querySelector('[data-provider-chip]')).toBeNull();
  });

  it('shows a member each reference unnamed while the read names no instance', async () => {
    // The swap window: an outgoing be-01 answers `providerId` without `provider`.
    serve({
      [READ]: [readOf([resourceOf({ report: measured() })], [{ resourceId: 'r1', units: 12 }])],
      [PROVIDERS]: [() => answer(403, { error: 'forbidden' })],
      [ACTIVE]: [activeAs('member')],
      [STARTABLE]: [startableOf({ resourceId: 'r1', capacity: 12, occupied: 0, free: 12 })],
    });
    mount();
    const ram = await row('h2puni ram');
    expect(within(ram).getByText('Fulfilled by a compute provider')).toBeDefined();
    expect(within(ram).getByText('Measured 15 GB, 8 in use')).toBeDefined();
    expect(within(ram).queryByRole('combobox')).toBeNull();
    expect(screen.queryByText(/could not be read/)).toBeNull();
  });

  it('renders the empty directory', async () => {
    serve({ [READ]: [readOf([])], [PROVIDERS]: [providersOf()] });
    mount();
    expect(await screen.findByText(/This directory holds no resources yet/)).toBeDefined();
    expect(screen.queryByRole('list', { name: 'Resources' })).toBeNull();
  });

  it('renders a failed read with retry, and recovers', async () => {
    serve({
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
    const sent = serve({ [READ]: [readOf([])], [PROVIDERS]: [providersOf()] });
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
    const sent = serve({
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
    serve({
      [READ]: [readOf([resourceOf({ report: measured() })], [{ resourceId: 'r1', units: 12 }])],
      [PROVIDERS]: [() => answer(500, {}), providersOf(h2puni)],
    });
    mount();
    const ram = await row('h2puni ram');
    expect(await screen.findByRole('alert')).toHaveTextContent(/./);
    expect(within(ram).queryByRole('combobox')).toBeNull();
    // Adopt is the admin's by role, whatever the providers read answered.
    expect(within(ram).getByRole('button', { name: /^Adopt 15 GB/ })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Retry resources' }));
    expect(await within(ram).findByLabelText('Compute provider of h2puni ram')).toHaveValue('cp-1');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('resources section writes', () => {
  it('adopts once however often it is clicked, and undo restores the declared number', async () => {
    const onChanged = vi.fn(() => Promise.resolve());
    const sent = serve({
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

  it('withdraws Undo after the post-adoption read observes viewer', async () => {
    const sent = serve({
      [ACTIVE]: [activeAs('member'), activeAs('viewer')],
      [READ]: [
        readOf([resourceOf({ report: measured() })], [{ resourceId: 'r1', units: 12 }]),
        readOf([resourceOf({ report: measured() })], [{ resourceId: 'r1', units: 15 }]),
      ],
      [PLAN]: [applied],
    });
    mount();
    const ram = await row('h2puni ram');
    fireEvent.click(within(ram).getByRole('button', { name: /^Adopt 15 GB/ }));
    expect(
      await screen.findByText('Your role can read these resources but not change them.'),
    ).toBeDefined();
    expect(await within(ram).findByRole('status')).toHaveTextContent(
      'Declared 15 GB from the measurement (was 12 GB).',
    );
    expect(within(ram).getByText('15 GB')).toBeDefined();
    expect(within(ram).queryByRole('button', { name: /^Undo adopting/ })).toBeNull();
    expect(plans(sent)).toEqual([
      { commands: [{ kind: 'setResourceCapacity', resourceId: 'r1', units: 15 }] },
    ]);
  });

  it('offers no undo once another writer stated a different number', async () => {
    const sent = serve({
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
    const sent = serve({
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
    serve({
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
    const sent = serve({
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
    serve({
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
    serve({
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
    const sent = serve({
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
    serve({
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
    // A member demoted to viewer after the read: be-01 decides.
    serve({
      [READ]: [readOf([resourceOf()])],
      [ACTIVE]: [activeAs('member')],
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
    const sent = serve({
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

  it('withdraws the edit form after forbidden rename observes viewer', async () => {
    const sent = serve({
      [ACTIVE]: [activeAs('member'), activeAs('viewer'), activeAs('member')],
      [READ]: [readOf([resourceOf()])],
      [DIRECTORY]: [() => answer(403, { error: 'forbidden', at: 0, kind: 'patchResource' })],
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
    fireEvent.click(within(ram).getByRole('button', { name: 'Edit h2puni ram' }));
    const form = within(ram).getByRole('form', { name: 'Edit h2puni ram' });
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'stale draft' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText('Your role can read these resources but not change them.'),
    ).toBeDefined();
    expect(await within(ram).findByRole('alert')).toHaveTextContent(/./);
    expect(within(ram).queryByRole('form', { name: 'Edit h2puni ram' })).toBeNull();
    expect(within(ram).queryByRole('button', { name: 'Save' })).toBeNull();
    expect(directories(sent)).toEqual([
      {
        commands: [
          {
            kind: 'patchResource',
            resourceId: 'r1',
            patch: { name: 'stale draft', unitLabel: 'GB' },
          },
        ],
      },
    ]);
    mounted.rerender(panelShown(false));
    mounted.rerender(panelShown(true));
    const edit = await within(ram).findByRole('button', { name: 'Edit h2puni ram' });
    expect(within(ram).queryByRole('form', { name: 'Edit h2puni ram' })).toBeNull();
    fireEvent.click(edit);
    expect(within(ram).getByLabelText('Name')).toHaveValue('h2puni ram');
    expect(directories(sent)).toHaveLength(1);
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
    const sent = serve({
      [READ]: [readOf([resourceOf()]), readOf([])],
      [PROVIDERS]: [providersOf(h2puni)],
      [ACTIVE]: [activeAs('admin')],
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
    const sent = serve({
      [READ]: [readOf([resourceOf()])],
      [PROVIDERS]: [providersOf(h2puni)],
      [ACTIVE]: [activeAs('admin')],
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
    const sent = serve({
      [READ]: [readOf([resourceOf()]), readOf([])],
      [PROVIDERS]: [providersOf(h2puni)],
      [ACTIVE]: [activeAs('admin')],
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

  it('offers a member every write but Remove, and says only an admin may remove', async () => {
    const sent = serve({
      [READ]: [readOf([resourceOf()], [{ resourceId: 'r1', units: 4 }])],
      [PROVIDERS]: [providersOf(h2puni)],
      [ACTIVE]: [activeAs('member')],
    });
    mount();
    const ram = await row('h2puni ram');
    expect(within(ram).getByRole('button', { name: 'Edit h2puni ram' })).toBeDefined();
    expect(
      within(ram).getByRole('textbox', { name: 'This project may use h2puni ram' }),
    ).toHaveValue('4');
    expect(within(ram).queryByRole('button', { name: /Remove/ })).toBeNull();
    expect(screen.getByText('Only an organization admin can remove a resource.')).toBeDefined();
    expect(screen.getByRole('form', { name: 'Add a resource' })).toBeDefined();
    expect(directories(sent)).toEqual([]);
  });

  it('offers a viewer nothing to change, and says so', async () => {
    const sent = serve({
      [READ]: [readOf([resourceOf({ report: measured() })], [{ resourceId: 'r1', units: 4 }])],
      [PROVIDERS]: [providersOf(h2puni)],
      [ACTIVE]: [activeAs('viewer')],
    });
    mount();
    const ram = await row('h2puni ram');
    // The declared number stays on the row's header, read only.
    expect(within(ram).getByText('4 GB')).toBeDefined();
    expect(within(ram).queryByRole('textbox')).toBeNull();
    expect(within(ram).queryByRole('button')).toBeNull();
    expect(within(ram).queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('form', { name: 'Add a resource' })).toBeNull();
    expect(screen.queryByText(/Only an organization admin/)).toBeNull();
    const hint = screen.getByText('Your role can read these resources but not change them.');
    // Above the list, so a phone reader meets it before the rows.
    expect(
      hint.compareDocumentPosition(screen.getByRole('list', { name: 'Resources' })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByText(/adopting a measurement/)).toBeNull();
    expect(
      sent.filter(
        ({ route }) =>
          route !== READ && route !== ACTIVE && route !== STARTABLE && route !== RESOURCE_USES,
      ),
    ).toEqual([]);
  });

  it('tells a viewer of an empty directory nothing about adding', async () => {
    serve({ [READ]: [readOf([])], [ACTIVE]: [activeAs('viewer')] });
    mount();
    const empty = await screen.findByText(/This directory holds no resources yet/);
    expect(empty).toHaveTextContent(/^This directory holds no resources yet\.$/);
    expect(screen.queryByRole('form', { name: 'Add a resource' })).toBeNull();
  });

  for (const role of ['member', 'viewer'] as const)
    it(`never asks a ${role} for the providers list`, async () => {
      const sent = serve({
        [READ]: [readOf([resourceOf()])],
        [PROVIDERS]: [providersOf(h2puni)],
        [ACTIVE]: [activeAs(role)],
      });
      mount();
      await row('h2puni ram');
      expect(providerReads(sent)).toEqual([]);
    });

  it('asks an admin for the providers list once the role read answers', async () => {
    const sent = serve({ [READ]: [readOf([resourceOf()])], [PROVIDERS]: [providersOf(h2puni)] });
    mount();
    expect(await within(await row('h2puni ram')).findByRole('combobox')).toBeDefined();
    expect(providerReads(sent)).toHaveLength(1);
  });

  for (const role of ['admin', 'super_admin'] as const)
    it(`offers ${role === 'admin' ? 'an admin' : 'a super-admin'} Remove, whatever the providers read answered`, async () => {
      serve({
        [READ]: [readOf([resourceOf()])],
        [PROVIDERS]: [() => answer(500, { error: 'internal' })],
        [ACTIVE]: [activeAs(role)],
      });
      mount();
      const ram = await row('h2puni ram');
      expect(within(ram).getByRole('button', { name: 'Remove h2puni ram' })).toBeDefined();
      expect(screen.queryByText(/Only an organization admin/)).toBeNull();
    });

  it('offers every caller without organizations Remove, reading no role', async () => {
    const sent = serve({ [READ]: [readOf([resourceOf({ providerId: null })])] });
    mount(undefined, { ...scope, organization: { kind: 'legacy' } });
    const ram = await row('h2puni ram');
    expect(within(ram).getByRole('button', { name: 'Remove h2puni ram' })).toBeDefined();
    expect(sent.some(({ route }) => route === ACTIVE)).toBe(false);
  });

  it('offers nothing to change while the role read failed, says so, and reads it again', async () => {
    const sent = serve({
      [READ]: [readOf([resourceOf()])],
      [PROVIDERS]: [providersOf(h2puni)],
      [ACTIVE]: [() => answer(500, { error: 'internal' }), activeAs('member')],
    });
    mount();
    const ram = await row('h2puni ram');
    expect(within(ram).queryByRole('button')).toBeNull();
    expect(within(ram).queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('form', { name: 'Add a resource' })).toBeNull();
    expect(providerReads(sent)).toEqual([]);
    expect(
      screen.getByText(/^Your role could not be read, so changing resources is not offered\./),
    ).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Read your role again' }));
    expect(await within(ram).findByRole('button', { name: 'Edit h2puni ram' })).toBeDefined();
    expect(screen.queryByText(/Your role could not be read/)).toBeNull();
  });

  it('says so when reading the role again fails again', async () => {
    serve({
      [READ]: [readOf([resourceOf()])],
      [ACTIVE]: [() => answer(500, { error: 'internal' })],
    });
    mount();
    await row('h2puni ram');
    fireEvent.click(screen.getByRole('button', { name: 'Read your role again' }));
    expect(
      await screen.findByText(/^Your role still could not be read, so changing resources/),
    ).toBeDefined();
    expect(screen.getByRole('button', { name: 'Read your role again' })).toBeEnabled();
  });

  it('offers no reread when the role read is refused for a reason rereading cannot fix', async () => {
    serve({
      [READ]: [readOf([resourceOf()])],
      [ACTIVE]: [() => answer(403, { error: 'insufficient_scope' })],
    });
    mount();
    const ram = await row('h2puni ram');
    expect(within(ram).queryByRole('button')).toBeNull();
    expect(
      screen.getByText(
        'This sign-in is read-only here. Sign in to WBS again to make changes. Changing resources is not offered.',
      ),
    ).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Read your role again' })).toBeNull();
  });

  for (const [error, text] of [
    [
      'not_a_member',
      'You are no longer a member of this organization, so its resources cannot be changed.',
    ],
    ['unauthenticated', 'Your session ended. Sign in again to change resources.'],
  ] as const)
    it(`says why nothing can change when the role read answers ${error}`, async () => {
      serve({
        [READ]: [readOf([resourceOf()])],
        [ACTIVE]: [() => answer(error === 'unauthenticated' ? 401 : 403, { error })],
      });
      mount();
      const ram = await row('h2puni ram');
      expect(within(ram).queryByRole('button')).toBeNull();
      expect(screen.getByText(text)).toBeDefined();
      expect(screen.queryByRole('button', { name: 'Read your role again' })).toBeNull();
    });

  it('says the organization changed when the role read names another one', async () => {
    serve({
      [READ]: [readOf([resourceOf()])],
      [PROVIDERS]: [providersOf(h2puni)],
      [ACTIVE]: [activeAs('admin', 'org-b')],
    });
    mount();
    const ram = await row('h2puni ram');
    expect(within(ram).queryByRole('button')).toBeNull();
    expect(
      screen.getByText('Your organization changed. Reload before changing resources.'),
    ).toBeDefined();
    expect(screen.queryByText(/Your role can read/)).toBeNull();
  });

  it('rereads the role after a forbidden capacity and takes the box away', async () => {
    // A member demoted to viewer since the read.
    serve({
      [READ]: [readOf([resourceOf()], [{ resourceId: 'r1', units: 4 }])],
      [ACTIVE]: [activeAs('member'), activeAs('viewer')],
      [PLAN]: [() => answer(403, { error: 'forbidden', at: 0, kind: 'setResourceCapacity' })],
    });
    mount();
    const ram = await row('h2puni ram');
    fireEvent.change(
      within(ram).getByRole('textbox', { name: 'This project may use h2puni ram' }),
      { target: { value: '3' } },
    );
    fireEvent.click(within(ram).getByRole('button', { name: 'State' }));
    expect(await within(ram).findByRole('alert')).toHaveTextContent(/./);
    await waitFor(() => {
      expect(within(ram).queryByRole('textbox')).toBeNull();
    });
    expect(
      screen.getByText('Your role can read these resources but not change them.'),
    ).toBeDefined();
    expect(within(ram).getByRole('alert')).toBeDefined();
  });

  it('keeps a typed capacity that another write kept from being sent', async () => {
    const disk = resourceOf({ id: 'r2', name: 'h2puni disk', providerId: null });
    const sent = serve({
      [READ]: [
        readOf(
          [resourceOf(), disk],
          [
            { resourceId: 'r1', units: 4 },
            { resourceId: 'r2', units: 9 },
          ],
        ),
      ],
      [PLAN]: [applied],
    });
    mount();
    const ram = await row('h2puni ram');
    const diskRow = await row('h2puni disk');
    fireEvent.change(within(ram).getByRole('textbox'), { target: { value: '5' } });
    fireEvent.change(within(diskRow).getByRole('textbox'), { target: { value: '10' } });
    // Both inside one act: the second lands while the first is in flight.
    act(() => {
      within(ram).getByRole('button', { name: 'State' }).click();
      within(diskRow).getByRole('button', { name: 'State' }).click();
    });
    await waitFor(() => {
      expect(plans(sent)).toHaveLength(1);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(within(diskRow).getByRole('textbox')).toHaveValue('10');
    expect(within(diskRow).getByRole('button', { name: 'State' })).toBeDefined();
    expect(plans(sent)).toEqual([
      { commands: [{ kind: 'setResourceCapacity', resourceId: 'r1', units: 5 }] },
    ]);
  });

  it('says a refused removal in place, closes its confirm and takes Remove away', async () => {
    // An admin demoted since the read: be-01 decides, and the reread follows it.
    serve({
      [READ]: [readOf([resourceOf()])],
      [PROVIDERS]: [providersOf(h2puni)],
      [ACTIVE]: [activeAs('admin'), activeAs('member')],
      [DIRECTORY]: [() => answer(403, { error: 'forbidden', at: 0, kind: 'deleteResource' })],
    });
    mount();
    const ram = await row('h2puni ram');
    fireEvent.click(within(ram).getByRole('button', { name: 'Remove h2puni ram' }));
    fireEvent.click(await within(ram).findByRole('button', { name: 'Remove h2puni ram' }));
    const said = await screen.findByText(
      'Your role no longer allows removing a resource. Nothing was changed.',
    );
    expect(said.getAttribute('role')).toBe('alert');
    expect(within(ram).queryByRole('button', { name: 'Keep h2puni ram' })).toBeNull();
    await waitFor(() => {
      expect(within(ram).queryByRole('button', { name: /Remove/ })).toBeNull();
    });
    expect(said.isConnected).toBe(true);
  });

  it('says a refused cascade in place and closes its confirm', async () => {
    const sent = serve({
      [READ]: [readOf([resourceOf()])],
      [PROVIDERS]: [providersOf(h2puni)],
      [ACTIVE]: [activeAs('admin')],
      [DIRECTORY]: [
        inUse(2, 0, null),
        inUse(2, 0, null),
        () => answer(403, { error: 'forbidden', at: 0, kind: 'deleteResource' }),
      ],
    });
    mount();
    const ram = await row('h2puni ram');
    fireEvent.click(within(ram).getByRole('button', { name: 'Remove h2puni ram' }));
    fireEvent.click(await within(ram).findByRole('button', { name: 'Remove h2puni ram' }));
    fireEvent.click(await within(ram).findByRole('button', { name: 'Remove with them' }));
    expect(
      await screen.findByText(
        'Your role no longer allows removing a resource. Nothing was changed.',
      ),
    ).toBeDefined();
    expect(within(ram).queryByRole('button', { name: 'Remove with them' })).toBeNull();
    expect(directories(sent)).toHaveLength(3);
  });

  it('lands on the next resource after a removal, and on Add after the last', async () => {
    const disk = resourceOf({ id: 'r2', name: 'h2puni disk', providerId: null });
    serve({
      [READ]: [readOf([resourceOf(), disk]), readOf([disk]), readOf([])],
      [PROVIDERS]: [providersOf(h2puni)],
      [ACTIVE]: [activeAs('admin')],
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
    serve({ [READ]: [readOf([resourceOf()])], [PROVIDERS]: [providersOf(h2puni)] });
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
    const sent = serve({
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

  it('shows the declared number again after a refused capacity, and says why beside its row', async () => {
    const disk = resourceOf({ id: 'r2', name: 'h2puni disk', providerId: null });
    serve({
      [READ]: [readOf([resourceOf(), disk], [{ resourceId: 'r1', units: 4 }])],
      [ACTIVE]: [activeAs('member')],
      [PLAN]: [
        () => answer(403, { error: 'forbidden', at: 0, kind: 'setResourceCapacity' }),
        () => answer(503, {}),
      ],
    });
    mount();
    const ram = await row('h2puni ram');
    const box = within(ram).getByRole('textbox', { name: 'This project may use h2puni ram' });
    for (const typed of ['3', '5']) {
      fireEvent.change(box, { target: { value: typed } });
      fireEvent.click(within(ram).getByRole('button', { name: 'State' }));
      expect(await within(ram).findByRole('alert'), typed).toHaveTextContent(/./);
      expect(box, typed).toHaveValue('4');
      expect(within(ram).queryByRole('button', { name: 'State' }), typed).toBeNull();
      expect(within(ram).getByText('4 GB')).toBeDefined();
      expect(within(await row('h2puni disk')).queryByRole('alert'), typed).toBeNull();
    }
  });

  it('says a refused rename beside its row', async () => {
    serve({
      [READ]: [readOf([resourceOf(), resourceOf({ id: 'r2', name: 'disk', providerId: null })])],
      [DIRECTORY]: [
        () => answer(409, { error: 'taken', at: 0, kind: 'patchResource', name: 'disk' }),
      ],
    });
    mount();
    const ram = await row('h2puni ram');
    fireEvent.click(within(ram).getByRole('button', { name: 'Edit h2puni ram' }));
    const form = within(ram).getByRole('form', { name: 'Edit h2puni ram' });
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'disk' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    expect(await within(ram).findByRole('alert')).toHaveTextContent(
      'A resource named “disk” already exists. Nothing was changed.',
    );
  });

  it('says a capacity that is not a number in place', async () => {
    const sent = serve({
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
      expect(await within(ram).findByRole('alert'), typed).toHaveTextContent(
        'The declared capacity of h2puni ram is a whole number, or blank for unstated.',
      );
      // Unsent, so the box keeps what was typed for correcting.
      expect(
        within(ram).getByRole('textbox', { name: 'This project may use h2puni ram' }),
        typed,
      ).toHaveValue(typed);
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
    serve({
      [READ]: [readOf([resourceOf()], [{ resourceId: 'r1', units: 32 }])],
      [PROVIDERS]: [providersOf(h2puni)],
      [ACTIVE]: [activeAs('admin')],
      [STARTABLE]: [startableOf({ resourceId: 'r1', capacity: 32, occupied: 6, free: 26 })],
    });
    mount();
    const ram = await row('h2puni ram');
    expect(within(ram).getByText('Claims hold 6 GB')).toBeDefined();
    expect(within(ram).getByText('26 GB free')).toBeDefined();
    expect(screen.queryByText(/could not be read/)).toBeNull();
  });

  it('says the holdings are missing when the startable read fails', async () => {
    serve({
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
    serve({
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
    serve({
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
    serve({
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
    serve({
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
