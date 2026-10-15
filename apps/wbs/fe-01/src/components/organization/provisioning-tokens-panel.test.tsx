import { render as renderBare } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ResourceScope } from '@/lib/organization-context';
import { OrganizationResourcesProvider } from '@/runtime/organization-resources';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@/testing/organization-render';
import { answerEmpty, answerJson as answer, stubServer } from '@/testing/stub-server';

import { ProvisioningTokensPanel } from './provisioning-tokens-panel';
const token = { id: 'token-a', createdAt: 1000, expiresAt: null, revokedAt: null };
const scope = (isCurrent = () => true): ResourceScope => ({
  organization: { kind: 'active', organizationId: 'org-a' },
  isCurrent,
  refuse: () => undefined,
});
function mount(owningScope?: ResourceScope, onAccessLost = vi.fn()) {
  const panel = <ProvisioningTokensPanel onAccessLost={onAccessLost} />;
  return render(
    owningScope ? (
      <OrganizationResourcesProvider scope={owningScope}>{panel}</OrganizationResourcesProvider>
    ) : (
      panel
    ),
  );
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('provisioning token administration', () => {
  it('renders loading, empty and metadata on refresh', async () => {
    stubServer({
      'GET /api/organization/provisioning-tokens': [
        () => answer(200, { tokens: [] }),
        () => answer(200, { tokens: [token] }),
      ],
    });
    mount();
    expect(screen.getByText('Loading provisioning tokens…')).toBeDefined();
    await screen.findByText('No provisioning tokens.');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh provisioning tokens' }));
    await screen.findByText('token-a');
    expect(screen.getByText('No expiry')).toBeDefined();
  });
  it('requires the exact selected id before revoke and refreshes server state', async () => {
    const sent = stubServer({
      'GET /api/organization/provisioning-tokens': [
        () => answer(200, { tokens: [token] }),
        () => answer(200, { tokens: [{ ...token, revokedAt: 5000 }] }),
      ],
      'DELETE /api/organization/provisioning-tokens/token-a': [() => answerEmpty(204)],
    });
    mount();
    const confirmation = await screen.findByLabelText('Token ID to revoke');
    fireEvent.change(confirmation, { target: { value: 'token-a ' } });
    fireEvent.submit(confirmation.closest('form')!);
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Enter the exact token ID to revoke it.',
    );
    expect(sent.filter((request) => request.route.startsWith('DELETE'))).toHaveLength(0);
    fireEvent.change(confirmation, { target: { value: 'token-a' } });
    fireEvent.submit(confirmation.closest('form')!);
    await screen.findByText('Revoked');
    expect(screen.getByText('Revoked at: 1970-01-01T00:00:05.000Z')).toBeDefined();
    expect(sent.filter((request) => request.route.startsWith('DELETE'))).toHaveLength(1);
  });
  it('serializes forced submissions while a revoke is held', async () => {
    stubServer({
      'GET /api/organization/provisioning-tokens': [() => answer(200, { tokens: [token] })],
    });
    mount();
    const confirmation = await screen.findByLabelText('Token ID to revoke');
    let writes = 0;
    vi.mocked(fetch).mockImplementation(() => {
      writes++;
      return new Promise<Response>(() => undefined);
    });
    fireEvent.change(confirmation, { target: { value: token.id } });
    fireEvent.submit(confirmation.closest('form')!);
    fireEvent.submit(confirmation.closest('form')!);
    expect(writes).toBe(1);
    expect(screen.getByRole('button', { name: 'Issue provisioning token' })).toBeDisabled();
  });
  it.each([
    ['forbidden', 'Only a super-admin can manage provisioning tokens.'],
    ['insufficient_scope', 'This sign-in is read-only here. Sign in to WBS again to make changes.'],
  ])('renders %s without mutation controls', async (error, message) => {
    stubServer({ 'GET /api/organization/provisioning-tokens': [() => answer(403, { error })] });
    mount();
    await screen.findByText(message);
    expect(screen.queryByRole('button', { name: 'Issue provisioning token' })).toBeNull();
  });
  it('renders query failure and refresh', async () => {
    stubServer({
      'GET /api/organization/provisioning-tokens': [
        () => answer(503, {}),
        () => answer(200, { tokens: [] }),
      ],
    });
    mount();
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh provisioning tokens' }));
    await screen.findByText('No provisioning tokens.');
  });
  it('withdraws page access on a membership refusal', async () => {
    stubServer({
      'GET /api/organization/provisioning-tokens': [() => answer(403, { error: 'not_a_member' })],
    });
    const lost = vi.fn();
    mount(undefined, lost);
    await waitFor(() => {
      expect(lost).toHaveBeenCalledWith('removed');
    });
  });
  it('uses the captured organization on reads and writes', async () => {
    stubServer({
      'GET /api/organization/provisioning-tokens': [() => answer(200, { tokens: [] })],
      'POST /api/organization/provisioning-tokens': [
        () => answer(201, { id: 'new', token: 'one-time-secret', createdAt: 2000 }),
      ],
    });
    mount(scope());
    await screen.findByText('No provisioning tokens.');
    fireEvent.click(screen.getByRole('button', { name: 'Issue provisioning token' }));
    await screen.findByText('one-time-secret');
    for (const [, init] of vi.mocked(fetch).mock.calls)
      expect(new Headers(init?.headers).get('X-WBS-Expected-Organization')).toBe('org-a');
  });
  it('ignores a stale StrictMode read after mutation', async () => {
    stubServer({
      'GET /api/organization/provisioning-tokens': [() => answer(200, { tokens: [] })],
      'POST /api/organization/provisioning-tokens': [
        () => answer(201, { id: 'new', token: 'fresh-secret', createdAt: 2000 }),
      ],
    });
    let release: ((response: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    renderBare(
      <StrictMode>
        <OrganizationResourcesProvider scope={scope()}>
          <ProvisioningTokensPanel onAccessLost={() => undefined} />
        </OrganizationResourcesProvider>
      </StrictMode>,
    );
    await screen.findByText('No provisioning tokens.');
    fireEvent.click(screen.getByRole('button', { name: 'Issue provisioning token' }));
    await screen.findByText('fresh-secret');
    await act(async () => {
      await Promise.resolve();
      release?.(answer(200, { tokens: [token] }));
    });
    expect(screen.queryByText('token-a')).toBeNull();
    expect(screen.getByText('fresh-secret')).toBeDefined();
  });
});

describe('one-time provisioning secrets', () => {
  it('rotates the selected token and reports the server overlap, then dismisses the secret', async () => {
    const expiresAt = 1712345678901;
    const sent = stubServer({
      'GET /api/organization/provisioning-tokens': [() => answer(200, { tokens: [token] })],
      'POST /api/organization/provisioning-tokens/token-a/rotate': [
        () =>
          answer(201, {
            id: 'successor',
            token: 'rotated-secret',
            createdAt: 2000,
            previousExpiresAt: expiresAt,
          }),
      ],
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Rotate token-a' }));
    await screen.findByText('rotated-secret');
    expect(
      screen.getByText(`Previous token expires: ${new Date(expiresAt).toISOString()}`),
    ).toBeDefined();
    expect(sent.filter((request) => request.route.startsWith('POST'))).toEqual([
      { route: 'POST /api/organization/provisioning-tokens/token-a/rotate', body: undefined },
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss secret' }));
    expect(screen.queryByText('rotated-secret')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh provisioning tokens' }));
    await screen.findByText('token-a');
    expect(screen.queryByText('rotated-secret')).toBeNull();
  });
  it('discards an issued secret on refresh, without writing browser storage', async () => {
    const local = vi.spyOn(Storage.prototype, 'setItem');
    stubServer({
      'GET /api/organization/provisioning-tokens': [() => answer(200, { tokens: [] })],
      'POST /api/organization/provisioning-tokens': [
        () => answer(201, { id: 'new', token: 'ephemeral-secret', createdAt: 2000 }),
      ],
    });
    mount();
    await screen.findByText('No provisioning tokens.');
    fireEvent.click(screen.getByRole('button', { name: 'Issue provisioning token' }));
    await screen.findByText('ephemeral-secret');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh provisioning tokens' }));
    await screen.findByText('No provisioning tokens.');
    expect(screen.queryByText('ephemeral-secret')).toBeNull();
    expect(local).not.toHaveBeenCalled();
    local.mockRestore();
  });
  it('clears the prior secret before a held write and ignores its reply after withdrawal', async () => {
    stubServer({
      'GET /api/organization/provisioning-tokens': [() => answer(200, { tokens: [] })],
      'POST /api/organization/provisioning-tokens': [
        () => answer(201, { id: 'new', token: 'prior-secret', createdAt: 2000 }),
      ],
    });
    let current = true;
    mount(scope(() => current));
    await screen.findByText('No provisioning tokens.');
    fireEvent.click(screen.getByRole('button', { name: 'Issue provisioning token' }));
    await screen.findByText('prior-secret');
    let release: ((response: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Issue provisioning token' }));
    expect(screen.queryByText('prior-secret')).toBeNull();
    await waitFor(() => {
      expect(release).toBeTypeOf('function');
    });
    current = false;
    await act(async () => {
      await Promise.resolve();
      release?.(answer(201, { id: 'late', token: 'withdrawn-secret', createdAt: 3000 }));
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Issue provisioning token' })).not.toBeDisabled(),
    );
    expect(screen.queryByText('withdrawn-secret')).toBeNull();
  });
  it('discards secrets and controls on forbidden mutation', async () => {
    stubServer({
      'GET /api/organization/provisioning-tokens': [() => answer(200, { tokens: [] })],
      'POST /api/organization/provisioning-tokens': [
        () => answer(201, { id: 'new', token: 'prior-secret', createdAt: 2000 }),
        () => answer(403, { error: 'forbidden' }),
      ],
    });
    mount();
    await screen.findByText('No provisioning tokens.');
    fireEvent.click(screen.getByRole('button', { name: 'Issue provisioning token' }));
    await screen.findByText('prior-secret');
    fireEvent.click(screen.getByRole('button', { name: 'Issue provisioning token' }));
    await screen.findByText('Only a super-admin can manage provisioning tokens.');
    expect(screen.queryByText('prior-secret')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Issue provisioning token' })).toBeNull();
  });
  it.each([
    ['token_limit', 'Two provisioning tokens are already live. Revoke one before issuing another.'],
    [
      'sso_connection_unproven',
      'Prove a company sign-in connection before issuing provisioning tokens.',
    ],
    ['not_found', 'This provisioning token is no longer live. Refresh the token list.'],
  ])('renders %s without displaying a secret', async (error, message) => {
    stubServer({
      'GET /api/organization/provisioning-tokens': [() => answer(200, { tokens: [token] })],
      'POST /api/organization/provisioning-tokens/token-a/rotate': [
        () => answer(error === 'not_found' ? 404 : 409, { error }),
      ],
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Rotate token-a' }));
    await screen.findByText(message);
    expect(screen.queryByRole('button', { name: 'Dismiss secret' })).toBeNull();
  });
});

it('serializes refresh before a same-render issue click', async () => {
  stubServer({ 'GET /api/organization/provisioning-tokens': [() => answer(200, { tokens: [] })] });
  mount();
  await screen.findByText('No provisioning tokens.');
  const issue = screen.getByRole('button', { name: 'Issue provisioning token' });
  const refresh = screen.getByRole('button', { name: 'Refresh provisioning tokens' });
  let writes = 0;
  vi.mocked(fetch).mockImplementation((_url, init) => {
    if (init?.method === 'POST') writes++;
    return new Promise<Response>(() => undefined);
  });
  act(() => {
    refresh.click();
    issue.click();
  });
  expect(writes).toBe(0);
});

it('discards a held secret response after unmount and remount', async () => {
  stubServer({ 'GET /api/organization/provisioning-tokens': [() => answer(200, { tokens: [] })] });
  const mounted = mount();
  await screen.findByText('No provisioning tokens.');
  let release: ((response: Response) => void) | undefined;
  vi.mocked(fetch).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Issue provisioning token' }));
  await waitFor(() => {
    expect(release).toBeTypeOf('function');
  });
  mounted.unmount();
  mount();
  await screen.findByText('No provisioning tokens.');
  await act(async () => {
    await Promise.resolve();
    release?.(answer(201, { id: 'late', token: 'unmounted-secret', createdAt: 3000 }));
  });
  expect(screen.queryByText('unmounted-secret')).toBeNull();
});
