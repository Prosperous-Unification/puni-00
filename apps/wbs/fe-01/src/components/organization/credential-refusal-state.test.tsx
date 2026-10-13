import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppFaultBoundary } from '@/components/chrome/app-fault';
import { answerJson as answer, stubServer } from '@/testing/stub-server';

import { CredentialRefusalState } from './credential-refusal-state';
import { type CredentialRefusal } from './organization-access';
import { OrganizationPage } from './organization-page';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// The slug is deliberately unlike the organization's id or name, so a link
// built on the client from either cannot match the path be-01 chose.
const SSO_REQUIRED = {
  error: 'sso_required',
  organizationId: 'org_7f3a',
  login: '/api/auth/login?organization=acme-eu-2',
  link: true,
} as const;

/** Every panel's first read answers `refusal`, as one credential rule refuses them all. */
function refuseEveryPanel(refusal: object) {
  return stubServer({
    'GET /api/organization/members': [() => answer(403, refusal)],
    'GET /api/organization/invitations': [() => answer(403, refusal)],
    'GET /api/organization/join-requests': [() => answer(403, refusal)],
    'GET /api/organization/domains': [() => answer(403, refusal)],
    'GET /api/organization': [() => answer(403, refusal)],
  });
}

function renderPage() {
  render(<OrganizationPage nav={<nav />} account={<span />} />);
}

describe('the organization page refused by enforced SSO', () => {
  it('replaces the panels with the company sign-in state and its link wording', async () => {
    refuseEveryPanel(SSO_REQUIRED);
    renderPage();
    const state = await screen.findByRole('alert');
    expect(
      within(state).getByText('This organization requires its company sign-in.'),
    ).toBeDefined();
    expect(
      within(state).getByText('Link your company sign-in, then sign in via SSO.'),
    ).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Members' })).toBeNull();
  });

  it('links the company slug selected by the server instead of its organization id', async () => {
    const sent = refuseEveryPanel(SSO_REQUIRED);
    renderPage();
    fireEvent.change(await screen.findByLabelText('How did you sign in to WBS?'), {
      target: { value: 'provider' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Link your company sign-in' }));
    await vi.waitFor(() => {
      expect(sent.some((request) => request.route === 'POST /api/auth/link/auth0')).toBe(true);
    });
    expect(sent.find((request) => request.route === 'POST /api/auth/link/auth0')?.body).toEqual({
      organization: 'acme-eu-2',
    });
    expect(
      screen.getByRole('link', { name: 'Sign in with your company' }).getAttribute('href'),
    ).toBe(SSO_REQUIRED.login);
  });

  it('links the company sign-in to the exact path the refusal names', async () => {
    refuseEveryPanel(SSO_REQUIRED);
    renderPage();
    const action = await screen.findByRole('link', { name: 'Sign in with your company' });
    expect(action.getAttribute('href')).toBe('/api/auth/login?organization=acme-eu-2');
  });
});

describe('the organization page refused by its session policy', () => {
  it('says the session is too old and offers the refusal’s sign-in again', async () => {
    refuseEveryPanel({
      error: 'reauthentication_required',
      organizationId: 'org_7f3a',
      reason: 'max_session',
      login: '/api/auth/login?reauthenticate=org_7f3a&x=1',
    });
    renderPage();
    const state = await screen.findByRole('alert');
    expect(within(state).getByText('Your session for this organization is too old.')).toBeDefined();
    expect(within(state).getByRole('link', { name: 'Sign in again' }).getAttribute('href')).toBe(
      '/api/auth/login?reauthenticate=org_7f3a&x=1',
    );
  });

  it('asks for a fresh sign-in when the reauthentication interval passed', async () => {
    refuseEveryPanel({
      error: 'reauthentication_required',
      organizationId: 'org_7f3a',
      reason: 'reauthenticate_after',
      login: '/api/auth/login?reauthenticate=org_7f3a',
    });
    renderPage();
    const state = await screen.findByRole('alert');
    expect(within(state).getByText('This organization asks you to sign in again.')).toBeDefined();
    expect(
      within(state).getByText(
        'It needs a fresh sign-in after a set time. Sign in again to continue.',
      ),
    ).toBeDefined();
  });
});

describe('the credential refusal state', () => {
  function renderGuarded(refusal: CredentialRefusal) {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <AppFaultBoundary>
        <CredentialRefusalState refusal={refusal} />
      </AppFaultBoundary>,
    );
  }

  it('throws for an unknown credential refusal', () => {
    // A code this page does not know, smuggled past the type as be-01 drift would be.
    renderGuarded({ ...SSO_REQUIRED, error: 'mfa_required' } as unknown as CredentialRefusal);
    expect(screen.getByRole('alert').hasAttribute('data-app-fault')).toBe(true);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('throws for an unknown reauthentication reason', () => {
    renderGuarded({
      error: 'reauthentication_required',
      organizationId: 'org_7f3a',
      reason: 'device_changed',
      login: '/api/auth/login?reauthenticate=org_7f3a',
    } as unknown as CredentialRefusal);
    expect(screen.getByRole('alert').hasAttribute('data-app-fault')).toBe(true);
  });

  it.each([
    '/api/auth/login?email=a@acme.test',
    '/api/auth/login?organization=',
    '/api/auth/login?organization=ACME',
    '/api/auth/login?organization=acme&organization=other',
    '/api/auth/login?organization=acme&method=google',
    '/api/auth/login?organization=acme&reauthenticate=org_7f3a',
  ])('refuses a malformed company login path %s', (login) => {
    renderGuarded({ ...SSO_REQUIRED, login });
    expect(screen.getByRole('alert').hasAttribute('data-app-fault')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Link your company sign-in' })).toBeNull();
  });

  it('offers no company link for a session-policy refusal', () => {
    renderGuarded({
      error: 'reauthentication_required',
      organizationId: 'org_7f3a',
      login: '/api/auth/login?reauthenticate=org_7f3a',
      reason: 'max_session',
    });
    expect(screen.queryByRole('button', { name: 'Link your company sign-in' })).toBeNull();
  });

  it('refuses a sign-in path that leaves be-01’s login start', () => {
    renderGuarded({ ...SSO_REQUIRED, login: '//evil.test/api/auth/login?organization=acme' });
    expect(screen.getByRole('alert').hasAttribute('data-app-fault')).toBe(true);
    expect(screen.queryByRole('link', { name: 'Sign in with your company' })).toBeNull();
  });
});

it('withdraws organization panels on context refusal', async () => {
  stubServer({
    'GET /api/organization/members': [() => answer(409, { error: 'organization_context_changed' })],
    'GET /api/organization/invitations': [
      () => answer(409, { error: 'organization_context_changed' }),
    ],
    'GET /api/organization/join-requests': [
      () => answer(409, { error: 'organization_context_changed' }),
    ],
    'GET /api/organization/domains': [() => answer(409, { error: 'organization_context_changed' })],
    'GET /api/organization': [() => answer(409, { error: 'organization_context_changed' })],
  });
  renderPage();
  expect(await screen.findByText('No organization is selected for this session.')).toBeDefined();
  expect(screen.queryByRole('heading', { name: 'Members' })).toBeNull();
});
