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
import { answerEmpty, answerJson as answer, stubServer } from '@/testing/stub-server';

import {
  type ComputeProvider,
  ComputeProvidersPanel,
  ComputeProvidersSlot,
  ProviderKindChip,
} from './compute-providers-panel';
import { type AccessLoss } from './organization-access';
import { useOrganizationRole } from './organization-role';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const LIST = 'GET /api/organization/compute-providers';
const REGISTER = 'POST /api/organization/compute-providers';
const ONE = (id: string) => `/api/organization/compute-providers/${id}`;

const scopeOf = (organizationId: string): ResourceScope => ({
  organization: { kind: 'active', organizationId },
  isCurrent: () => true,
  refuse: () => undefined,
});

const providerOf = (fields: Partial<ComputeProvider> = {}): ComputeProvider => ({
  id: 'cp-1',
  kind: 'ssh_host',
  name: 'h2puni',
  locator: 'puni1@h2puni',
  createdAt: Date.UTC(2026, 9, 22),
  createdBy: 'u1',
  resources: 0,
  ...fields,
});

const h2puni = providerOf({ resources: 2 });
const docker = providerOf({ id: 'cp-2', kind: 'docker', name: 'laptop', locator: 'default' });

const role = (value: string) => () =>
  answer(200, { organizationId: 'org-a', name: 'Acme', role: value });
const listing =
  (...providers: ComputeProvider[]) =>
  () =>
    answer(200, { computeProviders: providers });

function RoleReadSlot({ onAccessLost }: { onAccessLost: (loss: AccessLoss) => void }) {
  return (
    <ComputeProvidersSlot role={useOrganizationRole(onAccessLost)} onAccessLost={onAccessLost} />
  );
}

function mount(onAccessLost: (loss: AccessLoss) => void = () => undefined) {
  render(
    <OrganizationResourcesProvider scope={scopeOf('org-a')}>
      <RoleReadSlot onAccessLost={onAccessLost} />
    </OrganizationResourcesProvider>,
  );
}

function stub(routes: Parameters<typeof stubServer>[0]) {
  return stubServer({ 'GET /api/organization/active': [role('admin')], ...routes });
}

const region = () => screen.findByRole('region', { name: 'Compute providers' });
const row = (name: string) => screen.findByRole('listitem', { name });
const routesOf = (sent: ReturnType<typeof stubServer>) => sent.map((request) => request.route);

describe('compute providers panel states', () => {
  it('renders loading, then each instance with its kind, locator and resources', async () => {
    stub({ [LIST]: [listing(h2puni, docker)] });
    mount();
    expect(screen.getByText('Loading compute providers…')).toBeDefined();
    const first = await row('h2puni');
    expect(within(first).getByText('SSH host')).toBeDefined();
    expect(within(first).getByText('puni1@h2puni')).toBeDefined();
    expect(within(first).getByText('Fulfils 2 resources')).toBeDefined();
    const second = await row('laptop');
    expect(within(second).getByText('Docker')).toBeDefined();
    expect(within(second).getByText('Fulfils no resource yet')).toBeDefined();
    expect(within(await region()).queryByRole('alert')).toBeNull();
  });

  it('renders the empty state with the register action', async () => {
    stub({ [LIST]: [listing()] });
    mount();
    const panel = await region();
    expect(await within(panel).findByText(/No compute provider is registered yet/)).toBeDefined();
    expect(within(panel).getByRole('button', { name: 'Register compute provider' })).toBeDefined();
    expect(within(panel).queryByRole('list', { name: 'Compute providers list' })).toBeNull();
  });

  it('renders a failed read with retry, and recovers', async () => {
    stub({ [LIST]: [() => answer(503, {}), listing(h2puni)] });
    mount();
    const panel = await region();
    expect(await within(panel).findByRole('alert')).toBeDefined();
    expect(within(panel).queryByRole('button', { name: 'Register compute provider' })).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: 'Retry compute providers' }));
    expect(await row('h2puni')).toBeDefined();
    expect(within(panel).queryByRole('alert')).toBeNull();
  });

  it('renders no panel when the read answers forbidden', async () => {
    const sent = stub({ [LIST]: [() => answer(403, { error: 'forbidden' })] });
    mount();
    await waitFor(() => {
      expect(routesOf(sent)).toContain(LIST);
    });
    await waitFor(() => {
      expect(screen.queryByText('Loading compute providers…')).toBeNull();
    });
    expect(screen.queryByRole('region', { name: 'Compute providers' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each(['member', 'viewer'])(
    'sends no providers request and renders no panel for a %s',
    async (value) => {
      const sent = stubServer({
        'GET /api/organization/active': [role(value)],
        [LIST]: [listing(h2puni)],
      });
      mount();
      await waitFor(() => {
        expect(screen.queryByText('Loading compute providers…')).toBeNull();
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(routesOf(sent)).toEqual(['GET /api/organization/active']);
      expect(screen.queryByRole('region', { name: 'Compute providers' })).toBeNull();
    },
  );

  it('renders a failed role read with retry, and recovers', async () => {
    const sent = stubServer({
      'GET /api/organization/active': [() => answer(503, {}), role('super_admin')],
      [LIST]: [listing(h2puni)],
    });
    mount();
    expect(await screen.findByRole('alert')).toBeDefined();
    expect(routesOf(sent)).toEqual(['GET /api/organization/active']);
    fireEvent.click(screen.getByRole('button', { name: 'Retry compute providers' }));
    expect(await row('h2puni')).toBeDefined();
  });

  it('gives the page up when the read says access was lost', async () => {
    const lost = vi.fn();
    stub({ [LIST]: [() => answer(403, { error: 'not_a_member' })] });
    mount(lost);
    await waitFor(() => {
      expect(lost).toHaveBeenCalledWith('removed');
    });
  });

  it("never shows the previous organization's providers after a switch", async () => {
    stubServer({ [LIST]: [listing(docker)] });
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
        <ComputeProvidersPanel onAccessLost={() => undefined} />
      </OrganizationResourcesProvider>
    );
    const mounted = renderBare(panelUnder('org-a'));
    mounted.rerender(panelUnder('org-b'));
    await row('laptop');
    await act(async () => {
      release?.(answer(200, { computeProviders: [h2puni] }));
      await Promise.resolve();
    });
    expect(screen.getByRole('listitem', { name: 'laptop' })).toBeDefined();
    expect(screen.queryByRole('listitem', { name: 'h2puni' })).toBeNull();
  });
});

describe('compute providers panel writes', () => {
  async function openRegister() {
    fireEvent.click(
      await within(await region()).findByRole('button', { name: 'Register compute provider' }),
    );
    return screen.findByRole('dialog', { name: 'Register a compute provider' });
  }

  it('registers with the kind from the contract, then rereads', async () => {
    const sent = stub({
      [LIST]: [listing(), listing(providerOf({ name: 'h4claw', locator: 'puni1@h4claw' }))],
      [REGISTER]: [
        () => answer(201, providerOf({ name: 'h4claw', locator: 'puni1@h4claw', kind: 'docker' })),
      ],
    });
    mount();
    const dialog = await openRegister();
    const kind = within(dialog).getByLabelText('Kind');
    expect(
      within(kind)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['SSH host', 'Docker', 'Kubernetes', 'PUNI pool']);
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: ' h4claw ' } });
    fireEvent.change(kind, { target: { value: 'docker' } });
    expect(within(dialog).getByText(/The Docker context Dash runs against/)).toBeDefined();
    fireEvent.change(within(dialog).getByLabelText('Locator'), {
      target: { value: 'puni1@h4claw' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Register' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Registered h4claw.');
    expect(await row('h4claw')).toBeDefined();
    expect(sent.find((request) => request.route === REGISTER)?.body).toEqual({
      kind: 'docker',
      name: 'h4claw',
      locator: 'puni1@h4claw',
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it.each([
    [
      'name_taken',
      409,
      'Another compute provider here already has this name. Choose another name.',
    ],
    ['forbidden', 403, 'Only an admin can manage compute providers. Nothing was changed.'],
    [
      'invalid_body',
      400,
      'Choose a plain name of at most 80 characters and a locator of at most 256, neither looking like a key or token.',
    ],
  ] as const)(
    'renders %s on register and keeps the draft, never as success',
    async (error, status, text) => {
      const sent = stub({
        [LIST]: [listing()],
        [REGISTER]: [() => answer(status, { error })],
      });
      mount();
      const dialog = await openRegister();
      fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'h2puni' } });
      fireEvent.change(within(dialog).getByLabelText('Locator'), { target: { value: 'x@y' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Register' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(text);
      expect(within(dialog).getByLabelText('Name')).toHaveValue('h2puni');
      expect(screen.queryByRole('status')).toBeNull();
      // Proof: 2026-10-23, treating every register reply as success failed this
      // case for all three codes: `Registered h2puni.` and a reread appeared.
      expect(routesOf(sent).filter((route) => route === LIST)).toHaveLength(1);
    },
  );

  it('renames and relocates with only the changed fields', async () => {
    const moved = providerOf({ locator: 'puni1@h2puni.lan' });
    const sent = stub({
      [LIST]: [listing(providerOf()), listing(moved)],
      [`PATCH ${ONE('cp-1')}`]: [() => answer(200, moved)],
    });
    mount();
    fireEvent.click(within(await row('h2puni')).getByRole('button', { name: 'Edit h2puni' }));
    const form = screen.getByRole('form', { name: 'Edit h2puni' });
    fireEvent.change(within(form).getByLabelText('Locator'), {
      target: { value: 'puni1@h2puni.lan' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Saved h2puni.');
    expect(await screen.findByText('puni1@h2puni.lan')).toBeDefined();
    expect(sent.find((request) => request.route === `PATCH ${ONE('cp-1')}`)?.body).toEqual({
      locator: 'puni1@h2puni.lan',
    });
  });

  it('closes an unchanged edit without sending a patch', async () => {
    const sent = stub({ [LIST]: [listing(providerOf())] });
    mount();
    fireEvent.click(within(await row('h2puni')).getByRole('button', { name: 'Edit h2puni' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => {
      expect(screen.queryByRole('form', { name: 'Edit h2puni' })).toBeNull();
    });
    expect(routesOf(sent).some((route) => route.startsWith('PATCH'))).toBe(false);
  });

  it('renders unknown_provider on an edit in place', async () => {
    stub({
      [LIST]: [listing(providerOf())],
      [`PATCH ${ONE('cp-1')}`]: [() => answer(404, { error: 'unknown_provider' })],
    });
    mount();
    fireEvent.click(within(await row('h2puni')).getByRole('button', { name: 'Edit h2puni' }));
    const form = screen.getByRole('form', { name: 'Edit h2puni' });
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'h2' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'This compute provider is no longer registered. Refresh the list.',
    );
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('removes an instance no resource names after one confirmation', async () => {
    const sent = stub({
      [LIST]: [listing(providerOf()), listing()],
      [`DELETE ${ONE('cp-1')}`]: [() => answerEmpty(204)],
    });
    mount();
    fireEvent.click(within(await row('h2puni')).getByRole('button', { name: 'Remove h2puni' }));
    const confirm = screen.getByRole('group', { name: 'Remove h2puni' });
    expect(within(confirm).getByText('Remove h2puni? No resource names it.')).toBeDefined();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Remove compute provider' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Removed h2puni.');
    expect(await screen.findByText(/No compute provider is registered yet/)).toBeDefined();
    const removal = sent.find((request) => request.route === `DELETE ${ONE('cp-1')}`);
    expect(removal?.search).toBeUndefined();
  });

  it('names the referencing resources and removes them only with cascade', async () => {
    const sent = stub({
      [LIST]: [listing(h2puni), listing()],
      [`DELETE ${ONE('cp-1')}`]: [
        () =>
          answer(409, {
            error: 'in_use',
            resources: [
              { id: 'r1', name: 'h2puni ram' },
              { id: 'r2', name: 'h2puni tmp disk' },
            ],
          }),
        () => answerEmpty(204),
      ],
    });
    mount();
    fireEvent.click(within(await row('h2puni')).getByRole('button', { name: 'Remove h2puni' }));
    const confirm = screen.getByRole('group', { name: 'Remove h2puni' });
    expect(within(confirm).getByText(/2 resources name it/)).toBeDefined();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Remove compute provider' }));
    expect(
      await within(confirm).findByText(
        'h2puni fulfils h2puni ram and h2puni tmp disk. Removing it clears all 2 references and deletes their capacity reports; no plan changes.',
      ),
    ).toBeDefined();
    // The refusal is a confirmation, never a success: the instance is still listed.
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('listitem', { name: 'h2puni' })).toBeDefined();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Remove and clear 2 references' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Removed h2puni.');
    expect(
      sent
        .filter((request) => request.route === `DELETE ${ONE('cp-1')}`)
        .map((request) => request.search),
    ).toEqual([undefined, '?cascade=true']);
  });

  it('keeps the instance when the confirmation is declined', async () => {
    const sent = stub({ [LIST]: [listing(h2puni)] });
    mount();
    fireEvent.click(within(await row('h2puni')).getByRole('button', { name: 'Remove h2puni' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(screen.queryByRole('group', { name: 'Remove h2puni' })).toBeNull();
    expect(routesOf(sent).some((route) => route.startsWith('DELETE'))).toBe(false);
  });

  it('renders a refused cascade as an alert, never as removed', async () => {
    stub({
      [LIST]: [listing(h2puni)],
      [`DELETE ${ONE('cp-1')}`]: [
        () => answer(409, { error: 'in_use', resources: [{ id: 'r1', name: 'h2puni ram' }] }),
        () => answer(404, { error: 'unknown_provider' }),
      ],
    });
    mount();
    fireEvent.click(within(await row('h2puni')).getByRole('button', { name: 'Remove h2puni' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove compute provider' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove and clear the reference' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This compute provider is no longer registered. Refresh the list.',
    );
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('serializes a double-clicked removal', async () => {
    const sent = stub({
      [LIST]: [listing(providerOf()), listing()],
      [`DELETE ${ONE('cp-1')}`]: [() => answerEmpty(204)],
    });
    mount();
    fireEvent.click(within(await row('h2puni')).getByRole('button', { name: 'Remove h2puni' }));
    const button = screen.getByRole('button', { name: 'Remove compute provider' });
    // Both clicks inside one act: the second lands before React redraws the
    // button disabled, so only the panel's own admission stands between them.
    act(() => {
      button.click();
      button.click();
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Removed h2puni.');
    expect(routesOf(sent).filter((route) => route.startsWith('DELETE'))).toHaveLength(1);
  });
});

class ProvidersFaultBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? (
      <div role="alert">Compute providers could not be rendered.</div>
    ) : (
      this.props.children
    );
  }
}

describe('compute provider kind chip', () => {
  it('routes an impossible kind to the Error Boundary', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderBare(
      <ProvidersFaultBoundary>
        {/* An impossible union value, which the read's schema never lets through. */}
        <ProviderKindChip kind={'mainframe' as unknown as ComputeProvider['kind']} />
      </ProvidersFaultBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Compute providers could not be rendered.');
    error.mockRestore();
  });
});
