import { render as renderBare } from '@testing-library/react';
import { Component, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ComputeProvider } from '@/components/organization/compute-providers-panel';
import { type ResourceScope } from '@/lib/organization-context';
import { OrganizationResourcesProvider } from '@/runtime/organization-resources';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@/testing/organization-render';
import { answerJson as answer, stubServer } from '@/testing/stub-server';

import { type ProjectResource, ResourceRow, ResourcesPanel } from './resources-panel';

const NOW = Date.UTC(2026, 9, 23, 10, 0);
const CADENCE_S = 300;
const READ = 'GET /api/projects/p1/resources';
const PROVIDERS = 'GET /api/organization/compute-providers';
const PLAN = 'POST /api/projects/p1/commands';
const DIRECTORY = 'POST /api/directory/commands';

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
