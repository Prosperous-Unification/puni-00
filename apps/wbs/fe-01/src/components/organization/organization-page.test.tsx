import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
    'GET /api/organization/join-requests': [() => answer(200, { requests: [] })],
    'GET /api/organization/domains': [() => answer(200, { domains: [] })],
    'GET /api/organization/members': [() => answer(200, { members: [] })],
    ...routes,
  });
}

function renderPage() {
  render(<OrganizationPage nav={<nav />} account={<span />} />);
}

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
    ['no_active_organization', 'No organization is selected for this session.'],
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
      'GET /api/organization/invitations': [
        () => answer(200, { invitations: [offer('a', 'ada@acme.test')] }),
      ],
      'GET /api/organization/join-requests': [() => answer(403, { error: 'not_a_member' })],
      'GET /api/organization/domains': [() => answer(200, { domains: [] })],
      'GET /api/organization/members': [() => answer(200, { members: [] })],
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
