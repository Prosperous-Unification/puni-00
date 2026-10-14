import { render as renderBare } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LEGACY_ORGANIZATION, type ResourceScope } from '@/lib/organization-context';
import { OrganizationResourcesProvider } from '@/runtime/organization-resources';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@/testing/organization-render';
import { answerJson as answer, stubServer } from '@/testing/stub-server';

import { type AccessLoss } from './organization-access';
import { SessionPolicyPanel } from './session-policy-panel';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const policy = { maxSessionSeconds: 28800, reauthenticateAfterSeconds: 3600 };
function mount(scope?: ResourceScope, onAccessLost: (loss: AccessLoss) => void = () => undefined) {
  const panel = <SessionPolicyPanel onAccessLost={onAccessLost} />;
  render(
    scope ? (
      <OrganizationResourcesProvider scope={scope}>{panel}</OrganizationResourcesProvider>
    ) : (
      panel
    ),
  );
}
const scope = (isCurrent = () => true, refuse = () => undefined): ResourceScope => ({
  organization: { kind: 'active', organizationId: 'org-a' },
  isCurrent,
  refuse,
});

describe('session policy administration', () => {
  it('renders loading, absence, configured values and refresh', async () => {
    stubServer({
      'GET /api/organization/session-policy': [
        () => answer(200, { policy: null }),
        () => answer(200, { policy }),
      ],
    });
    mount();
    expect(screen.getByText('Loading session policy…')).toBeDefined();
    expect(await screen.findByText('No session policy is set.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh session policy' }));
    expect(await screen.findByDisplayValue('28800')).toBeDefined();
    expect(screen.getByDisplayValue('3600')).toBeDefined();
  });
  it('rejects invalid bounds before posting and sends null for an empty bound', async () => {
    const sent = stubServer({
      'GET /api/organization/session-policy': [() => answer(200, { policy: null })],
      'PUT /api/organization/session-policy': [
        () =>
          answer(200, { policy: { maxSessionSeconds: 3600, reauthenticateAfterSeconds: null } }),
      ],
    });
    mount();
    const max = await screen.findByLabelText('Maximum session length (seconds)');
    const reauth = screen.getByLabelText('Reauthenticate after (seconds)');
    fireEvent.change(max, { target: { value: '299' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save session policy' }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Maximum session length must be whole seconds from 300 to 2592000, or empty.',
    );
    expect(max).toHaveAttribute('aria-invalid', 'true');
    expect(max).toHaveAttribute('aria-describedby', 'policy-max-error');
    expect(sent.filter((request) => request.route.startsWith('PUT'))).toHaveLength(0);
    fireEvent.change(max, { target: { value: '3600' } });
    fireEvent.change(reauth, { target: { value: '3601' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save session policy' }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Reauthentication cannot exceed the maximum session length.',
    );
    expect(reauth).toHaveAttribute('aria-invalid', 'true');
    expect(reauth).toHaveAttribute('aria-describedby', 'policy-reauth-error');
    expect(sent.filter((request) => request.route.startsWith('PUT'))).toHaveLength(0);
    fireEvent.change(reauth, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save session policy' }));
    await screen.findByText('Session policy saved.');
    expect(sent.find((request) => request.route.startsWith('PUT'))?.body).toEqual({
      maxSessionSeconds: 3600,
      reauthenticateAfterSeconds: null,
    });
  });
  it('names and associates an invalid reauthentication bound without sending a request', async () => {
    const sent = stubServer({
      'GET /api/organization/session-policy': [() => answer(200, { policy: null })],
    });
    mount();
    const reauth = await screen.findByLabelText('Reauthenticate after (seconds)');
    fireEvent.change(reauth, { target: { value: '2592001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save session policy' }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Reauthenticate after must be whole seconds from 300 to 2592000, or empty.',
    );
    expect(reauth).toHaveAttribute('aria-invalid', 'true');
    expect(reauth).toHaveAttribute('aria-describedby', 'policy-reauth-error');
    expect(sent.filter((request) => request.route.startsWith('PUT'))).toHaveLength(0);
  });
  it('ignores a late refusal after effect cleanup', async () => {
    stubServer({
      'GET /api/organization/session-policy': [() => answer(403, { error: 'not_a_member' })],
    });
    let release: ((reply: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    const onAccessLost = vi.fn();
    const mounted = render(<SessionPolicyPanel onAccessLost={onAccessLost} />);
    mounted.unmount();
    await act(async () => {
      release?.(answer(403, { error: 'not_a_member' }));
      await Promise.resolve();
    });
    expect(onAccessLost).not.toHaveBeenCalled();
  });
  it('ignores a stale StrictMode GET after the second read becomes ready', async () => {
    stubServer({ 'GET /api/organization/session-policy': [() => answer(200, { policy: null })] });
    const original = vi.mocked(fetch).getMockImplementation()!;
    let release: ((reply: Response) => void) | undefined;
    let reads = 0;
    vi.mocked(fetch).mockImplementation((url, init) => {
      if (reads++ === 0)
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      return original(url, init);
    });
    renderBare(
      <StrictMode>
        <OrganizationResourcesProvider
          scope={{
            organization: LEGACY_ORGANIZATION,
            isCurrent: () => true,
            refuse: () => undefined,
          }}
        >
          <SessionPolicyPanel onAccessLost={() => undefined} />
        </OrganizationResourcesProvider>
      </StrictMode>,
    );
    await screen.findByText('No session policy is set.');
    expect(reads).toBe(2);
    await act(async () => {
      release?.(answer(200, { policy }));
      await Promise.resolve();
    });
    expect(screen.getByText('No session policy is set.')).toBeDefined();
    expect(screen.queryByDisplayValue('28800')).toBeNull();
  });
  it.each(['success', 'forbidden'])('ignores a StrictMode stale GET after %s PUT', async (kind) => {
    stubServer({
      'GET /api/organization/session-policy': [() => answer(200, { policy: null })],
      'PUT /api/organization/session-policy': [
        () =>
          kind === 'success'
            ? answer(200, { policy: { maxSessionSeconds: 7200, reauthenticateAfterSeconds: null } })
            : answer(403, { error: 'forbidden' }),
      ],
    });
    const original = vi.mocked(fetch).getMockImplementation()!;
    let release: ((reply: Response) => void) | undefined;
    let reads = 0;
    vi.mocked(fetch).mockImplementation((url, init) => {
      if (init?.method !== 'PUT' && reads++ === 0)
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      return original(url, init);
    });
    renderBare(
      <StrictMode>
        <OrganizationResourcesProvider
          scope={{
            organization: LEGACY_ORGANIZATION,
            isCurrent: () => true,
            refuse: () => undefined,
          }}
        >
          <SessionPolicyPanel onAccessLost={() => undefined} />
        </OrganizationResourcesProvider>
      </StrictMode>,
    );
    fireEvent.change(await screen.findByLabelText('Maximum session length (seconds)'), {
      target: { value: '3600' },
    });
    expect(reads).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: 'Save session policy' }));
    if (kind === 'success') expect(await screen.findByDisplayValue('7200')).toBeDefined();
    else await screen.findByText('Only a super-admin can manage session policy.');
    await act(async () => {
      release?.(answer(200, { policy }));
      await Promise.resolve();
    });
    if (kind === 'success') expect(screen.getByDisplayValue('7200')).toBeDefined();
    else expect(screen.queryByRole('button', { name: 'Save session policy' })).toBeNull();
  });
  it('clears with both nulls and reconciles the server response', async () => {
    const sent = stubServer({
      'GET /api/organization/session-policy': [() => answer(200, { policy })],
      'PUT /api/organization/session-policy': [() => answer(200, { policy: null })],
    });
    mount();
    await screen.findByDisplayValue('28800');
    fireEvent.click(screen.getByRole('button', { name: 'Clear session policy' }));
    expect(await screen.findByText('No session policy is set.')).toBeDefined();
    expect(sent.find((request) => request.route.startsWith('PUT'))?.body).toEqual({
      maxSessionSeconds: null,
      reauthenticateAfterSeconds: null,
    });
  });
  it('holds one mutation and scopes reads and write', async () => {
    stubServer({ 'GET /api/organization/session-policy': [() => answer(200, { policy: null })] });
    const original = vi.mocked(fetch).getMockImplementation()!;
    let release: ((reply: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementation((url, init) =>
      init?.method === 'PUT'
        ? new Promise<Response>((resolve) => {
            release = resolve;
          })
        : original(url, init),
    );
    mount(scope());
    fireEvent.change(await screen.findByLabelText('Maximum session length (seconds)'), {
      target: { value: '28800' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save session policy' }));
    const form = screen.getByRole('button', { name: 'Save session policy' }).closest('form');
    if (form === null) throw new Error('Policy form missing');
    fireEvent.submit(form);
    expect(vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(
      1,
    );
    expect(
      vi
        .mocked(fetch)
        .mock.calls.map(([, init]) =>
          new Headers(init?.headers).get('X-WBS-Expected-Organization'),
        ),
    ).toEqual(['org-a', 'org-a']);
    release?.(answer(200, { policy }));
    await screen.findByText('Session policy saved.');
  });
  it.each(['not_a_member', 'organization_context_changed', 'reauthentication_required'])(
    'withdraws on %s read refusal',
    async (error) => {
      const onAccessLost = vi.fn();
      const body =
        error === 'reauthentication_required'
          ? {
              error,
              organizationId: 'org-a',
              reason: 'max_session',
              login: '/api/auth/login?prompt=login',
            }
          : { error };
      stubServer({
        'GET /api/organization/session-policy': [
          () => answer(error === 'organization_context_changed' ? 409 : 403, body),
        ],
      });
      mount(scope(), onAccessLost);
      await waitFor(() => {
        expect(onAccessLost).toHaveBeenCalled();
      });
      expect(screen.queryByRole('button', { name: 'Save session policy' })).toBeNull();
    },
  );
  it('drops a late read after its scope is withdrawn', async () => {
    stubServer({ 'GET /api/organization/session-policy': [() => answer(200, { policy })] });
    let release: ((reply: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    let current = true;
    mount(scope(() => current));
    current = false;
    await act(async () => {
      release?.(answer(200, { policy }));
      await Promise.resolve();
    });
    expect(screen.queryByDisplayValue('28800')).toBeNull();
  });
  it('removes controls on a forbidden read and recovers after refresh', async () => {
    stubServer({
      'GET /api/organization/session-policy': [
        () => answer(403, { error: 'forbidden' }),
        () => answer(200, { policy: null }),
      ],
    });
    mount();
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Only a super-admin can manage session policy.',
    );
    expect(screen.queryByRole('button', { name: 'Save session policy' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh session policy' }));
    expect(await screen.findByRole('button', { name: 'Save session policy' })).toBeDefined();
  });
  it('removes controls on query failure and recovers after refresh', async () => {
    stubServer({
      'GET /api/organization/session-policy': [
        () => answer(503, {}),
        () => answer(200, { policy: null }),
      ],
    });
    mount();
    await screen.findByRole('alert');
    expect(screen.queryByRole('button', { name: 'Save session policy' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh session policy' }));
    expect(await screen.findByRole('button', { name: 'Save session policy' })).toBeDefined();
  });
  it('withdraws after mutation requires reauthentication', async () => {
    const onAccessLost = vi.fn();
    stubServer({
      'GET /api/organization/session-policy': [() => answer(200, { policy: null })],
      'PUT /api/organization/session-policy': [
        () =>
          answer(403, {
            error: 'reauthentication_required',
            organizationId: 'org-a',
            reason: 'reauthenticate_after',
            login: '/api/auth/login?prompt=login',
          }),
      ],
    });
    mount(scope(), onAccessLost);
    fireEvent.change(await screen.findByLabelText('Maximum session length (seconds)'), {
      target: { value: '3600' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save session policy' }));
    await waitFor(() => {
      expect(onAccessLost).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'reauthentication_required' }),
      );
    });
    expect(screen.queryByText('Session policy saved.')).toBeNull();
  });
  it('removes controls when a mutation loses super-admin authority', async () => {
    stubServer({
      'GET /api/organization/session-policy': [() => answer(200, { policy })],
      'PUT /api/organization/session-policy': [() => answer(403, { error: 'forbidden' })],
    });
    mount();
    await screen.findByDisplayValue('28800');
    fireEvent.click(screen.getByRole('button', { name: 'Clear session policy' }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Only a super-admin can manage session policy.',
    );
    expect(screen.queryByRole('button', { name: 'Save session policy' })).toBeNull();
  });
  it.each(['300', '2592000', '300.5', '-300', '2592001'])(
    'enforces integer bound %s',
    async (bound) => {
      const sent = stubServer({
        'GET /api/organization/session-policy': [() => answer(200, { policy: null })],
        'PUT /api/organization/session-policy': [
          () =>
            answer(200, {
              policy: { maxSessionSeconds: Number(bound), reauthenticateAfterSeconds: null },
            }),
        ],
      });
      mount();
      fireEvent.change(await screen.findByLabelText('Maximum session length (seconds)'), {
        target: { value: bound },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save session policy' }));
      if (bound === '300' || bound === '2592000') {
        await screen.findByText('Session policy saved.');
        expect(sent.filter((request) => request.route.startsWith('PUT'))).toHaveLength(1);
      } else {
        expect(await screen.findByRole('alert')).toBeDefined();
        expect(sent.filter((request) => request.route.startsWith('PUT'))).toHaveLength(0);
      }
    },
  );
  it('reconciles a save to the policy returned by the server', async () => {
    stubServer({
      'GET /api/organization/session-policy': [() => answer(200, { policy: null })],
      'PUT /api/organization/session-policy': [
        () =>
          answer(200, { policy: { maxSessionSeconds: 7200, reauthenticateAfterSeconds: null } }),
      ],
    });
    mount();
    fireEvent.change(await screen.findByLabelText('Maximum session length (seconds)'), {
      target: { value: '3600' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save session policy' }));
    expect(await screen.findByDisplayValue('7200')).toBeDefined();
  });
});
