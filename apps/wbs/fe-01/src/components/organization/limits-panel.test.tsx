import { render as renderBare } from '@testing-library/react';
import { Component, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type ResourceScope } from '@/lib/organization-context';
import { OrganizationResourcesProvider } from '@/runtime/organization-resources';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@/testing/organization-render';
import { answerJson as answer, stubServer } from '@/testing/stub-server';

import { LimitsPanel, LimitsReady, LimitsSlot, type OrganizationLimitsRead } from './limits-panel';
import { type AccessLoss } from './organization-access';
import { useOrganizationRole } from './organization-role';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const scopeOf = (organizationId: string): ResourceScope => ({
  organization: { kind: 'active', organizationId },
  isCurrent: () => true,
  refuse: () => undefined,
});

const limitsOf = (fields: Partial<OrganizationLimitsRead> = {}): OrganizationLimitsRead => ({
  source: 'organization',
  limits: { maxAgentPersons: 8, maxConcurrentClaims: 200, maxCapacityUnitsPerResource: 64 },
  usage: {
    agentPersons: 7,
    concurrentClaims: 12,
    capacityUnits: [{ resourceId: 'r1', name: 'h2puni ram', unitLabel: 'GB', units: 48 }],
  },
  ...fields,
});

const role = (value: string) => () =>
  answer(200, { organizationId: 'org-a', name: 'Acme', role: value });

/** The slot under its own role read, as the organization page gives it one. */
function RoleReadSlot({ onAccessLost }: { onAccessLost: (loss: AccessLoss) => void }) {
  return <LimitsSlot role={useOrganizationRole(onAccessLost)} onAccessLost={onAccessLost} />;
}

function mountSlot(onAccessLost: (loss: AccessLoss) => void = () => undefined) {
  render(
    <OrganizationResourcesProvider scope={scopeOf('org-a')}>
      <RoleReadSlot onAccessLost={onAccessLost} />
    </OrganizationResourcesProvider>,
  );
}

const region = () => screen.findByRole('region', { name: 'Organization limits' });
const rowOf = (label: string): HTMLElement => {
  const row = screen.getByText(label).closest('li');
  if (row === null) throw new Error(`No limit row for ${label}`);
  return row;
};

describe('organization limits panel', () => {
  it('renders loading, then each cap with usage beside it and no edit control', async () => {
    stubServer({
      'GET /api/organization/active': [role('admin')],
      'GET /api/organization/limits': [() => answer(200, limitsOf())],
    });
    mountSlot();
    expect(screen.getByText('Loading organization limits…')).toBeDefined();
    const panel = await region();
    await within(panel).findByText('7 of 8');
    expect(within(rowOf('Agent persons')).getByText('7 of 8')).toBeDefined();
    expect(within(rowOf('Concurrent claims')).getByText('12 of 200')).toBeDefined();
    expect(within(panel).getByText('Capacity units per resource (cap 64)')).toBeDefined();
    expect(within(rowOf('h2puni ram')).getByText('48 of 64 GB')).toBeDefined();
    expect(within(panel).getByText('These limits are set for this organization.')).toBeDefined();
    expect(rowOf('Agent persons').getAttribute('data-standing')).toBe('under');
    expect(within(panel).queryByText('Exceeded')).toBeNull();
    // No edit control (L12): the only control is the refresh.
    expect(within(panel).queryAllByRole('textbox')).toHaveLength(0);
    expect(within(panel).queryAllByRole('spinbutton')).toHaveLength(0);
    expect(within(panel).queryAllByRole('combobox')).toHaveLength(0);
    expect(
      within(panel)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Refresh organization limits']);
  });

  it('says deployment default when the organization has no row', async () => {
    stubServer({
      'GET /api/organization/active': [role('super_admin')],
      'GET /api/organization/limits': [() => answer(200, limitsOf({ source: 'default' }))],
    });
    mountSlot();
    expect(
      await within(await region()).findByText(
        'These are the deployment default limits: none are set for this organization.',
      ),
    ).toBeDefined();
  });

  it('marks a count over its cap exceeded and one at its cap as at the cap', async () => {
    stubServer({
      'GET /api/organization/active': [role('admin')],
      'GET /api/organization/limits': [
        () =>
          answer(
            200,
            limitsOf({
              limits: {
                maxAgentPersons: 8,
                maxConcurrentClaims: 10,
                maxCapacityUnitsPerResource: 64,
              },
              usage: {
                agentPersons: 8,
                concurrentClaims: 40,
                capacityUnits: [
                  { resourceId: 'r1', name: 'h2puni ram', unitLabel: 'GB', units: 72 },
                  { resourceId: 'r2', name: 'worktrees', unitLabel: '', units: 10 },
                ],
              },
            }),
          ),
      ],
    });
    mountSlot();
    await within(await region()).findByText('40 of 10');
    expect(rowOf('Concurrent claims').getAttribute('data-standing')).toBe('over');
    expect(within(rowOf('Concurrent claims')).getByText('Exceeded')).toBeDefined();
    expect(rowOf('Agent persons').getAttribute('data-standing')).toBe('at');
    expect(within(rowOf('Agent persons')).getByText('At the cap')).toBeDefined();
    expect(within(rowOf('h2puni ram')).getByText('72 of 64 GB')).toBeDefined();
    expect(within(rowOf('h2puni ram')).getByText('Exceeded')).toBeDefined();
    expect(within(rowOf('worktrees')).getByText('10 of 64')).toBeDefined();
    expect(rowOf('worktrees').getAttribute('data-standing')).toBe('under');
  });

  it('says so when no project states a capacity', async () => {
    stubServer({
      'GET /api/organization/active': [role('admin')],
      'GET /api/organization/limits': [
        () =>
          answer(
            200,
            limitsOf({ usage: { agentPersons: 0, concurrentClaims: 0, capacityUnits: [] } }),
          ),
      ],
    });
    mountSlot();
    const panel = await region();
    expect(
      await within(panel).findByText('No project states a capacity of any resource yet.'),
    ).toBeDefined();
    expect(within(panel).queryByRole('list', { name: 'Capacity by resource' })).toBeNull();
  });

  it('renders a failed read with retry, and recovers', async () => {
    stubServer({
      'GET /api/organization/active': [role('admin')],
      'GET /api/organization/limits': [() => answer(503, {}), () => answer(200, limitsOf())],
    });
    mountSlot();
    const panel = await region();
    expect(await within(panel).findByRole('alert')).toBeDefined();
    expect(within(panel).queryByText('7 of 8')).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: 'Retry organization limits' }));
    expect(await within(panel).findByText('7 of 8')).toBeDefined();
    expect(within(panel).queryByRole('alert')).toBeNull();
  });

  it('renders no panel when the read answers forbidden', async () => {
    const sent = stubServer({
      'GET /api/organization/active': [role('admin')],
      'GET /api/organization/limits': [() => answer(403, { error: 'forbidden' })],
    });
    mountSlot();
    await waitFor(() => {
      expect(sent.map((request) => request.route)).toContain('GET /api/organization/limits');
    });
    await waitFor(() => {
      expect(screen.queryByText('Loading organization limits…')).toBeNull();
    });
    expect(screen.queryByRole('region', { name: 'Organization limits' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each(['member', 'viewer'])(
    'sends no limits request and renders no panel for a %s',
    async (value) => {
      const sent = stubServer({
        'GET /api/organization/active': [role(value)],
        'GET /api/organization/limits': [() => answer(200, limitsOf())],
      });
      mountSlot();
      await waitFor(() => {
        expect(screen.queryByText('Loading organization limits…')).toBeNull();
      });
      // A turn for any request the ready role would start.
      await act(async () => {
        await Promise.resolve();
      });
      expect(sent.map((request) => request.route)).toEqual(['GET /api/organization/active']);
      expect(screen.queryByRole('region', { name: 'Organization limits' })).toBeNull();
    },
  );

  it('sends nothing in a deployment without organizations', async () => {
    const sent = stubServer({});
    render(<RoleReadSlot onAccessLost={() => undefined} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(sent).toEqual([]);
    expect(screen.queryByText('Loading organization limits…')).toBeNull();
  });

  it('renders a failed role read with retry, and recovers', async () => {
    const sent = stubServer({
      'GET /api/organization/active': [() => answer(503, {}), role('admin')],
      'GET /api/organization/limits': [() => answer(200, limitsOf())],
    });
    mountSlot();
    expect(await screen.findByRole('alert')).toBeDefined();
    expect(sent.map((request) => request.route)).toEqual(['GET /api/organization/active']);
    fireEvent.click(screen.getByRole('button', { name: 'Retry organization limits' }));
    expect(await within(await region()).findByText('7 of 8')).toBeDefined();
  });

  it('gives the page up when the read says access was lost', async () => {
    const onAccessLost = vi.fn();
    stubServer({
      'GET /api/organization/active': [role('admin')],
      'GET /api/organization/limits': [() => answer(403, { error: 'not_a_member' })],
    });
    mountSlot(onAccessLost);
    await waitFor(() => {
      expect(onAccessLost).toHaveBeenCalledWith('removed');
    });
  });

  it('sends the read under the captured organization', async () => {
    stubServer({
      'GET /api/organization/active': [role('admin')],
      'GET /api/organization/limits': [() => answer(200, limitsOf())],
    });
    mountSlot();
    await within(await region()).findByText('7 of 8');
    expect(
      vi
        .mocked(fetch)
        .mock.calls.filter(([url]) =>
          (url instanceof Request ? url.url : url.toString()).endsWith('/api/organization/limits'),
        )
        .map(([, init]) => new Headers(init?.headers).get('X-WBS-Expected-Organization')),
    ).toEqual(['org-a']);
  });

  it("never shows the previous organization's numbers after a switch", async () => {
    stubServer({
      'GET /api/organization/limits': [
        () =>
          answer(
            200,
            limitsOf({ usage: { agentPersons: 1, concurrentClaims: 2, capacityUnits: [] } }),
          ),
      ],
    });
    const original = vi.mocked(fetch).getMockImplementation();
    if (original === undefined) throw new Error('stub missing');
    let release: ((reply: Response) => void) | undefined;
    let reads = 0;
    vi.mocked(fetch).mockImplementation((url, init) => {
      if (reads++ === 0)
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      return original(url, init);
    });
    const panelUnder = (organizationId: string) => (
      <OrganizationResourcesProvider scope={scopeOf(organizationId)}>
        <LimitsPanel onAccessLost={() => undefined} />
      </OrganizationResourcesProvider>
    );
    const mounted = renderBare(panelUnder('org-a'));
    mounted.rerender(panelUnder('org-b'));
    await screen.findByText('1 of 8');
    await act(async () => {
      release?.(answer(200, limitsOf()));
      await Promise.resolve();
    });
    expect(screen.getByText('1 of 8')).toBeDefined();
    expect(screen.queryByText('7 of 8')).toBeNull();
  });
});

class LimitsFaultBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? (
      <div role="alert">Limits could not be rendered.</div>
    ) : (
      this.props.children
    );
  }
}

describe('organization limits source', () => {
  it('routes an impossible source to the Error Boundary', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      renderBare(
        <LimitsFaultBoundary>
          {/* An impossible union value, which the read's schema never lets through. */}
          <LimitsReady
            limits={limitsOf({ source: 'operator' as unknown as OrganizationLimitsRead['source'] })}
          />
        </LimitsFaultBoundary>,
      );
      expect(screen.getByRole('alert')).toHaveTextContent('Limits could not be rendered.');
      expect(screen.queryByText(/deployment default/)).toBeNull();
    } finally {
      error.mockRestore();
    }
  });
});
