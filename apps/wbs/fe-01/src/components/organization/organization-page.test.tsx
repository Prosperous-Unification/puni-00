import { afterEach, describe, expect, it, vi } from 'vitest';

import { cleanup, fireEvent, render, screen, waitFor, within } from '@/testing/organization-render';
import { answerEmpty, answerJson as answer, stubServer } from '@/testing/stub-server';

import { OrganizationPage } from './organization-page';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 29);
const offer = (id: string, email: string, fields: Record<string, unknown> = {}) => ({
  id,
  email,
  role: 'member',
  expiresAt: NOW + 7 * DAY,
  revokedAt: null,
  consumedAt: null,
  ...fields,
});

/** Stubs the page's requests, answering every panel not under test with an empty list. */
function stubPage(routes: Parameters<typeof stubServer>[0]) {
  return stubServer({
    'GET /api/organization/sso-connections': [() => answer(200, { connections: [] })],
    'GET /api/organization/join-requests': [() => answer(200, { requests: [] })],
    'GET /api/organization/domains': [() => answer(200, { domains: [] })],
    'GET /api/organization/members': [() => answer(200, { members: [] })],
    'GET /api/organization': [
      () => answer(200, { sharedPeople: false, sharingAvailable: false, canSwitch: false }),
    ],
    ...routes,
  });
}

function renderPage() {
  render(<OrganizationPage nav={<nav />} account={<span />} />);
}

describe('organization page', () => {
  it('composes company sign-in setup on the organization page', async () => {
    stubPage({ 'GET /api/organization/invitations': [() => answer(200, { invitations: [] })] });
    renderPage();
    expect(await screen.findByRole('region', { name: 'Company sign-in' })).toBeDefined();
  });

  it('shows whether the organization shares its people', async () => {
    stubPage({ 'GET /api/organization/invitations': [() => answer(200, { invitations: [] })] });
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Shared people' })).toBeDefined();
    expect(
      await screen.findByText(
        'Sharing people across projects is not available in this release yet.',
      ),
    ).toBeDefined();
  });
});

describe('organization page drawing', () => {
  /**
   * Every control the page offers, in every panel, filled so each panel draws
   * its rows: an unstyled control is one the platform draws as a bevelled box
   * beside the chrome's flat ones.
   */
  function stubEveryPanel() {
    stubPage({
      'GET /api/organization/members': [
        () =>
          answer(200, {
            members: [{ userId: 'u1', username: 'sam', email: null, role: 'admin', createdAt: 1 }],
          }),
      ],
      'GET /api/organization/invitations': [
        () =>
          answer(200, {
            invitations: [offer('a', 'pending@acme.test', { expiresAt: Date.now() + DAY })],
          }),
      ],
      'GET /api/organization/join-requests': [
        () =>
          answer(200, {
            requests: [{ id: 'r', email: 'ask@acme.test', status: 'pending', createdAt: 1 }],
          }),
      ],
      'GET /api/organization/domains': [
        () =>
          answer(200, {
            domains: [
              {
                id: 'd',
                domain: 'acme.test',
                status: 'pending',
                challengeExpiresAt: Date.now() + DAY,
                lastSuccessAt: null,
                lastCheckedAt: null,
                proofWarning: false,
              },
            ],
          }),
      ],
      'GET /api/organization': [
        () => answer(200, { sharedPeople: false, sharingAvailable: true, canSwitch: true }),
      ],
    });
  }

  it("draws every control with the chrome's rounded, tokenised box", async () => {
    stubEveryPanel();
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove sam' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Release acme.test' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Share people across projects' }));
    await screen.findByRole('button', { name: 'Confirm: share people' });
    const controls = [...document.querySelectorAll('main button, main input, main select')];
    expect(controls.length).toBeGreaterThan(12);
    const unstyled = controls
      .filter((control) => !control.classList.contains('rounded-md'))
      .map((control) => control.getAttribute('aria-label') ?? control.textContent);
    // Proof: 2026-10-12, restoring `members-panel.tsx`'s bare controls failed
    // this listing `Change the role of sam`, `Confirm removing sam` and the rest
    // of that panel, and failed the card test below on `Members`.
    expect(unstyled).toEqual([]);
  });

  it('draws each panel as a card named by its heading', async () => {
    stubEveryPanel();
    renderPage();
    for (const name of [
      'Members',
      'Invitations',
      'Join requests',
      'Domains',
      'Company sign-in',
      'Shared people',
    ]) {
      const region = await screen.findByRole('region', { name });
      expect(region.querySelector('.rounded-lg.border')).not.toBeNull();
    }
  });
});

describe('organization invitations', () => {
  it('renders loading, then the empty state', async () => {
    stubPage({ 'GET /api/organization/invitations': [() => answer(200, { invitations: [] })] });
    renderPage();
    expect(screen.getByText('Loading invitations…')).toBeDefined();
    expect(await screen.findByText('No invitations yet.')).toBeDefined();
  });

  it('names each standing and offers revoke only for a pending invitation', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    stubPage({
      'GET /api/organization/invitations': [
        () =>
          answer(200, {
            invitations: [
              offer('a', 'pending@acme.test'),
              offer('b', 'expired@acme.test', { expiresAt: NOW - 1 }),
              offer('c', 'revoked@acme.test', { revokedAt: NOW - DAY }),
              offer('d', 'accepted@acme.test', { consumedAt: NOW - DAY }),
            ],
          }),
      ],
    });
    renderPage();
    const rows = await screen.findAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      'pending@acme.testMemberPendingRevoke',
      'expired@acme.testMemberExpired',
      'revoked@acme.testMemberRevoked',
      'accepted@acme.testMemberAccepted',
    ]);
  });

  it('sends an invitation and re-reads the list', async () => {
    const sent = stubPage({
      'GET /api/organization/invitations': [
        () => answer(200, { invitations: [] }),
        () => answer(200, { invitations: [offer('a', 'ada@acme.test', { role: 'viewer' })] }),
      ],
      'POST /api/organization/invitations': [
        () => answer(201, { invitation: offer('a', 'ada@acme.test', { role: 'viewer' }) }),
      ],
    });
    renderPage();
    fireEvent.change(await screen.findByLabelText('Email address'), {
      target: { value: ' ada@acme.test ' },
    });
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'viewer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }));
    expect(await screen.findByText('Invitation sent to ada@acme.test.')).toBeDefined();
    expect(await screen.findByText('Viewer', { selector: 'span' })).toBeDefined();
    expect(sent.find((request) => request.route.startsWith('POST'))?.body).toEqual({
      email: 'ada@acme.test',
      role: 'viewer',
    });
  });

  it.each([
    ['forbidden', 403, 'Your role cannot send this invitation.'],
    [
      'delivery_failed',
      503,
      'The invitation email could not be sent, so the invitation was withdrawn.',
    ],
    ['invalid_body', 400, 'Enter a valid email address.'],
    [
      'insufficient_scope',
      403,
      'This sign-in is read-only here. Sign in to WBS again to make changes.',
    ],
  ])('renders the %s send refusal in place', async (error, status, copy) => {
    stubPage({
      'GET /api/organization/invitations': [() => answer(200, { invitations: [] })],
      'POST /api/organization/invitations': [() => answer(status, { error })],
    });
    renderPage();
    fireEvent.change(await screen.findByLabelText('Email address'), {
      target: { value: 'ada@acme.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }));
    expect(await screen.findByText(copy)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Send invitation' })).toBeDefined();
  });

  it('revokes, then renders a conflicting revoke in place', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    stubPage({
      'GET /api/organization/invitations': [
        () =>
          answer(200, { invitations: [offer('a', 'ada@acme.test'), offer('b', 'bo@acme.test')] }),
        () => answer(200, { invitations: [offer('b', 'bo@acme.test')] }),
      ],
      'DELETE /api/organization/invitations/a': [() => answerEmpty(204)],
      'DELETE /api/organization/invitations/b': [
        () => answer(409, { error: 'invitation_invalid' }),
      ],
    });
    renderPage();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Revoke the invitation for ada@acme.test' }),
    );
    await waitFor(() => {
      expect(screen.queryByText('ada@acme.test')).toBeNull();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Revoke the invitation for bo@acme.test' }));
    expect(
      await screen.findByText('That invitation was already accepted, revoked or expired.'),
    ).toBeDefined();
  });

  it('renders a forbidden list as the role refusal, not a crash', async () => {
    stubPage({
      'GET /api/organization/invitations': [() => answer(403, { error: 'forbidden' })],
    });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Your role cannot view invitations.',
    );
  });

  it('renders a query failure', async () => {
    stubPage({});
    renderPage();
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Could not reach the server. Try again.',
    );
  });

  it.each([
    ['not_a_member', 'You no longer have access to this organization.'],
    ['no_active_organization', 'This session has no organization.'],
    ['onboarding_inactive', 'Organization administration is not active yet.'],
  ])('renders the %s list refusal as the page state', async (error, copy) => {
    stubPage({ 'GET /api/organization/invitations': [() => answer(403, { error })] });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', copy);
  });

  it("clears the organization's rows when a refusal says access was lost", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    stubPage({
      'GET /api/organization/invitations': [
        () => answer(200, { invitations: [offer('a', 'ada@acme.test')] }),
      ],
      'DELETE /api/organization/invitations/a': [() => answer(403, { error: 'not_a_member' })],
    });
    renderPage();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Revoke the invitation for ada@acme.test' }),
    );
    const main = screen.getByRole('main');
    expect(await within(main).findByRole('alert')).toHaveProperty(
      'textContent',
      'You no longer have access to this organization.',
    );
    expect(within(main).queryByText('ada@acme.test')).toBeNull();
    expect(within(main).queryByRole('heading', { name: 'Invitations' })).toBeNull();
  });

  it('drops every panel when another panel loses access', async () => {
    stubServer({
      'GET /api/organization/sso-connections': [() => answer(200, { connections: [] })],
      'GET /api/organization/invitations': [
        () => answer(200, { invitations: [offer('a', 'ada@acme.test')] }),
      ],
      'GET /api/organization/join-requests': [() => answer(403, { error: 'not_a_member' })],
      'GET /api/organization/domains': [() => answer(200, { domains: [] })],
      'GET /api/organization/members': [() => answer(200, { members: [] })],
      'GET /api/organization': [
        () => answer(200, { sharedPeople: false, sharingAvailable: false, canSwitch: false }),
      ],
    });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'You no longer have access to this organization.',
    );
    expect(screen.queryByText('ada@acme.test')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Join requests' })).toBeNull();
  });
});
