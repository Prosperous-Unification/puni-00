import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { answerJson as answer, stubServer } from '@/testing/stub-server';

import { type AccessLoss } from './organization-access';
import { SsoConnectionsPanel } from './sso-connections-panel';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const claim = (id: string, status = 'verified') => ({
  id,
  domain: `${id}.test`,
  status,
  challengeExpiresAt: null,
  lastSuccessAt: 1,
  lastCheckedAt: 1,
  proofWarning: false,
});
const connection = (id: string, fields: Record<string, unknown> = {}) => ({
  id: `connection-${id}`,
  domainClaimId: id,
  domain: `${id}.test`,
  auth0Connection: `${id}-saml`,
  strategy: 'samlp',
  loginSlug: `route-${id}`,
  enforced: false,
  provenAt: null,
  provenBy: null,
  lastPrefixMismatchAt: null,
  ...fields,
});
function stubPanel(routes: Parameters<typeof stubServer>[0] = {}) {
  return stubServer({
    'GET /api/organization/sso-connections': [() => answer(200, { connections: [] })],
    'GET /api/organization/domains': [() => answer(200, { domains: [claim('available')] })],
    ...routes,
  });
}
function renderPanel(onAccessLost: (loss: AccessLoss) => void = () => undefined) {
  render(<SsoConnectionsPanel onAccessLost={onAccessLost} />);
}
async function fillCreate() {
  fireEvent.change(await screen.findByLabelText('Verified domain'), {
    target: { value: 'available' },
  });
  fireEvent.change(screen.getByLabelText('Auth0 connection name'), {
    target: { value: 'customer-oidc' },
  });
  fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'oidc' } });
  fireEvent.change(screen.getByLabelText('Login slug'), { target: { value: 'customer-eu' } });
}

describe('company sign-in connection setup', () => {
  it('shows loading, empty connections and no eligible domain state', async () => {
    stubPanel({ 'GET /api/organization/domains': [() => answer(200, { domains: [] })] });
    renderPanel();
    expect(screen.getByText('Loading company sign-in…')).toBeDefined();
    expect(await screen.findByText('No company sign-in connections yet.')).toBeDefined();
    expect(
      screen.getByText('Verify an unused domain in Domains, then refresh here.'),
    ).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Create connection' })).toBeNull();
  });

  it('offers only verified domains', async () => {
    stubPanel({
      'GET /api/organization/domains': [
        () =>
          answer(200, {
            domains: [
              claim('pending', 'pending'),
              claim('suspended', 'suspended'),
              claim('available'),
            ],
          }),
      ],
    });
    renderPanel();
    const select = await screen.findByLabelText('Verified domain');
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Choose a verified domain', 'available.test']);
  });

  it('excludes domains already used by a connection', async () => {
    stubPanel({
      'GET /api/organization/sso-connections': [
        () => answer(200, { connections: [connection('used')] }),
      ],
      'GET /api/organization/domains': [
        () => answer(200, { domains: [claim('used'), claim('available')] }),
      ],
    });
    renderPanel();
    const select = await screen.findByLabelText('Verified domain');
    expect(within(select).queryByRole('option', { name: 'used.test' })).toBeNull();
  });

  it('creates with the claim id and exact fields, then refreshes both lists', async () => {
    const sent = stubPanel({
      'GET /api/organization/sso-connections': [
        () => answer(200, { connections: [] }),
        () => answer(200, { connections: [connection('available')] }),
      ],
      'POST /api/organization/sso-connections': [
        () => answer(201, { connection: connection('available') }),
      ],
    });
    renderPanel();
    await fillCreate();
    fireEvent.click(screen.getByRole('button', { name: 'Create connection' }));
    expect(
      await screen.findByText(
        'Connection recorded. Start a proof sign-in to verify its identity prefix.',
      ),
    ).toBeDefined();
    expect(sent.find((request) => request.route.startsWith('POST'))?.body).toEqual({
      domainClaimId: 'available',
      auth0Connection: 'customer-oidc',
      strategy: 'oidc',
      loginSlug: 'customer-eu',
    });
    await screen.findByText('available-saml');
    expect(
      sent.filter((request) => request.route === 'GET /api/organization/domains'),
    ).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Create connection' })).toBeNull();
  });

  it('throws on an impossible strategy selection', async () => {
    stubPanel();
    renderPanel();
    await fillCreate();
    const faults: unknown[] = [];
    const collectFault = (event: ErrorEvent) => {
      faults.push(event.error);
      event.preventDefault();
    };
    window.addEventListener('error', collectFault);
    try {
      fireEvent.change(screen.getByLabelText('Strategy'), { target: { value: 'unknown' } });
      expect(faults).toHaveLength(1);
      expect(faults[0]).toHaveProperty('message', 'Unexpected enterprise strategy');
    } finally {
      window.removeEventListener('error', collectFault);
    }
  });

  it('refuses a forged unused-domain selection before posting', async () => {
    const sent = stubPanel();
    renderPanel();
    await fillCreate();
    fireEvent.change(screen.getByLabelText('Verified domain'), { target: { value: 'absent' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Create connection' }).closest('form')!);
    expect(
      await screen.findByText('Choose a verified domain that has no company sign-in connection.'),
    ).toBeDefined();
    expect(sent.some((request) => request.route.startsWith('POST'))).toBe(false);
  });

  it('blocks repeated submissions while create is held', async () => {
    const sent = stubPanel();
    renderPanel();
    await fillCreate();
    let finish: ((response: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const form = screen.getByRole('button', { name: 'Create connection' }).closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
    expect(screen.getByLabelText('Login slug')).toHaveProperty('disabled', true);
    finish!(answer(409, { error: 'login_slug_taken' }));
    await screen.findByText('That login slug is already in use. Choose another.');
    expect(sent.filter((request) => request.route.startsWith('GET'))).toHaveLength(4);
  });

  it.each([
    [
      'domain_not_verified',
      'That domain is no longer verified. Verify it before creating a connection.',
    ],
    ['sso_connection_exists', 'That domain already has a company sign-in connection.'],
    ['login_slug_taken', 'That login slug is already in use. Choose another.'],
    ['not_found', 'That domain claim no longer exists.'],
  ])('refreshes after the %s create conflict', async (error, copy) => {
    const sent = stubPanel({
      'POST /api/organization/sso-connections': [
        () => answer(error === 'not_found' ? 404 : 409, { error }),
      ],
    });
    renderPanel();
    await fillCreate();
    fireEvent.click(screen.getByRole('button', { name: 'Create connection' }));
    expect(await screen.findByText(copy)).toBeDefined();
    await waitFor(() => {
      expect(sent.filter((request) => request.route.startsWith('GET'))).toHaveLength(4);
    });
  });

  it.each(['connections', 'domains'])(
    'offers no create or proof controls after a forbidden %s read',
    async (endpoint) => {
      stubPanel({
        'GET /api/organization/sso-connections': [
          () => answer(200, { connections: [connection('secret')] }),
        ],
        [`GET /api/organization/${endpoint === 'connections' ? 'sso-connections' : 'domains'}`]: [
          () => answer(403, { error: 'forbidden' }),
        ],
      });
      renderPanel();
      expect(await screen.findByRole('alert')).toHaveProperty(
        'textContent',
        'Only a super-admin can set up company sign-in.',
      );
      expect(screen.queryByLabelText('Verified domain')).toBeNull();
      expect(screen.queryByRole('button', { name: /Start proof/ })).toBeNull();
    },
  );

  it('clears controls on query failure and recovers with explicit refresh', async () => {
    const sent = stubPanel({
      'GET /api/organization/sso-connections': [
        () => answer(503, {}),
        () => answer(200, { connections: [connection('recovered')] }),
      ],
    });
    renderPanel();
    await screen.findByRole('alert');
    expect(screen.queryByLabelText('Verified domain')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh company sign-in' }));
    expect(await screen.findByText('recovered-saml')).toBeDefined();
    expect(sent.filter((request) => request.route.startsWith('GET'))).toHaveLength(4);
  });

  it.each(['forbidden', 'insufficient_scope'])(
    'removes controls when create loses super-admin authority (%s)',
    async (error) => {
      stubPanel({
        'POST /api/organization/sso-connections': [() => answer(403, { error })],
      });
      renderPanel();
      await fillCreate();
      fireEvent.click(screen.getByRole('button', { name: 'Create connection' }));
      await screen.findByRole('alert');
      expect(screen.queryByLabelText('Verified domain')).toBeNull();
    },
  );

  it.each([
    [401, { error: 'unauthenticated' }, 'signed_out'],
    [403, { error: 'no_active_organization' }, 'no_organization'],
    [403, { error: 'not_a_member' }, 'removed'],
    [
      403,
      {
        error: 'sso_required',
        organizationId: 'org-id',
        login: '/api/auth/login?organization=server-slug',
        link: true,
      },
      null,
    ],
    [
      403,
      {
        error: 'reauthentication_required',
        organizationId: 'org-id',
        reason: 'max_session',
        login: '/api/auth/login?organization=server-slug',
      },
      null,
    ],
  ])('hands read authority loss %s %j to the page', async (status, refusal, loss) => {
    const onAccessLost = vi.fn();
    stubPanel({ 'GET /api/organization/sso-connections': [() => answer(status, refusal)] });
    renderPanel(onAccessLost);
    await waitFor(() => {
      expect(onAccessLost).toHaveBeenCalledWith(loss ?? refusal);
    });
  });

  it('hands create authority loss to the page', async () => {
    const onAccessLost = vi.fn();
    stubPanel({
      'POST /api/organization/sso-connections': [() => answer(403, { error: 'not_a_member' })],
    });
    renderPanel(onAccessLost);
    await fillCreate();
    fireEvent.click(screen.getByRole('button', { name: 'Create connection' }));
    await waitFor(() => {
      expect(onAccessLost).toHaveBeenCalledWith('removed');
    });
  });

  it('uses server proof and enforcement labels and each row slug for proof', async () => {
    const sent = stubPanel({
      'GET /api/organization/sso-connections': [
        () =>
          answer(200, {
            connections: [
              connection('one'),
              connection('two', {
                strategy: 'oidc',
                provenAt: 1,
                provenBy: 'owner',
                enforced: true,
                lastPrefixMismatchAt: 2,
              }),
            ],
          }),
      ],
      'POST /api/auth/link/auth0': [() => answer(401, { error: 'invalid_credentials' })],
    });
    renderPanel();
    const rows = await screen.findAllByRole('listitem');
    expect(rows[0]?.textContent).toMatch(/Not proven/);
    expect(rows[0]?.textContent).toMatch(/Not enforced/);
    expect(rows[1]?.textContent).toMatch(/Proven/);
    expect(rows[1]?.textContent).toMatch(/Enforced/);
    expect(rows[1]?.textContent).toMatch(/Last prefix mismatch:/);
    fireEvent.click(screen.getByRole('button', { name: 'Start proof for one.test' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start proof for two.test' }));
    expect(screen.getAllByLabelText('How did you sign in to WBS?')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('How did you sign in to WBS?'), {
      target: { value: 'provider' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Link your company sign-in' }));
    await screen.findByRole('alert');
    expect(sent.find((request) => request.route === 'POST /api/auth/link/auth0')?.body).toEqual({
      organization: 'route-two',
    });
  });

  it('blocks the selected proof form while a create request is held', async () => {
    const sent = stubPanel({
      'GET /api/organization/sso-connections': [
        () => answer(200, { connections: [connection('one')] }),
      ],
      'POST /api/auth/link/auth0': [() => answer(401, { error: 'invalid_credentials' })],
    });
    renderPanel();
    await fillCreate();
    fireEvent.click(screen.getByRole('button', { name: 'Start proof for one.test' }));
    fireEvent.change(screen.getByLabelText('How did you sign in to WBS?'), {
      target: { value: 'password' },
    });
    fireEvent.change(screen.getByLabelText('Your WBS password'), {
      target: { value: 'fresh-password' },
    });
    let finish: ((response: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create connection' }));
    expect(screen.getByLabelText('How did you sign in to WBS?')).toHaveProperty('disabled', true);
    expect(screen.getByLabelText('Your WBS password')).toHaveProperty('disabled', true);
    const link = screen.getByRole('button', { name: 'Link your company sign-in' });
    expect(link).toHaveProperty('disabled', true);
    // A form event can bypass disabled controls; admission must still refuse it.
    fireEvent.submit(link.closest('form')!);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
    expect(sent.some((request) => request.route === 'POST /api/auth/link/auth0')).toBe(false);
    finish!(answer(409, { error: 'login_slug_taken' }));
    await screen.findByText('That login slug is already in use. Choose another.');
    const proof = await screen.findByRole('button', { name: 'Start proof for one.test' });
    expect(proof).toHaveProperty('disabled', false);
    fireEvent.click(proof);
    fireEvent.change(screen.getByLabelText('How did you sign in to WBS?'), {
      target: { value: 'provider' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Link your company sign-in' }));
    await screen.findByRole('alert');
    expect(sent.find((request) => request.route === 'POST /api/auth/link/auth0')?.body).toEqual({
      organization: 'route-one',
    });
  });

  it('freezes the only proof target while its start request is held', async () => {
    stubPanel({
      'GET /api/organization/sso-connections': [
        () => answer(200, { connections: [connection('one'), connection('two')] }),
      ],
    });
    renderPanel();
    await fillCreate();
    fireEvent.click(await screen.findByRole('button', { name: 'Start proof for one.test' }));
    fireEvent.change(screen.getByLabelText('How did you sign in to WBS?'), {
      target: { value: 'provider' },
    });
    let finish: ((response: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Link your company sign-in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start proof for two.test' }));
    expect(screen.getByRole('button', { name: 'Start proof for two.test' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getByRole('button', { name: 'Refresh company sign-in' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getAllByLabelText('How did you sign in to WBS?')).toHaveLength(1);
    expect(screen.getByRole('group', { name: 'Prove one.test' })).toBeDefined();
    fireEvent.submit(screen.getByRole('button', { name: 'Create connection' }).closest('form')!);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
    finish!(answer(401, { error: 'invalid_credentials' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Start proof for two.test' })).toHaveProperty(
      'disabled',
      false,
    );
  });
});
