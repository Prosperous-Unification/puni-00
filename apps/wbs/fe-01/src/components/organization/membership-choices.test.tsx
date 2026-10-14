import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { answerJson as answer, stubServer } from '@/testing/stub-server';

import { MembershipChoices } from './membership-choices';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const LOCKED_HINT = 'Requires its company sign-in. Sign out, then sign in with your company.';

describe('membership choices', () => {
  it('shows an SSO-enforced organization locked, with the company sign-in hint', async () => {
    stubServer({
      'GET /api/organization/memberships': [
        () =>
          answer(200, {
            state: 'selection_required',
            memberships: [
              { organizationId: 'a', name: 'Acme', role: 'member', ssoRequired: false },
              { organizationId: 'g', name: 'Globex', role: 'admin', ssoRequired: true },
            ],
          }),
      ],
    });
    render(<MembershipChoices onChoose={() => undefined} />);
    const list = await screen.findByRole('list', { name: 'Your organizations' });
    const [acme, globex] = within(list).getAllByRole('listitem');
    expect(acme.textContent).toContain('Acme');
    expect(acme.textContent).toContain('Member');
    expect(acme.textContent).not.toContain('Locked');
    expect(acme.textContent).not.toContain('company sign-in');
    expect(within(globex).getByText('Locked')).toBeDefined();
    expect(within(globex).queryByRole('button', { name: 'Choose Globex' })).toBeNull();
    expect(within(acme).getByRole('button', { name: 'Choose Acme' })).toBeDefined();
    expect(within(globex).getByText(LOCKED_HINT)).toBeDefined();
  });

  it('renders a failed membership read as a failure, not an empty list', async () => {
    stubServer({
      'GET /api/organization/memberships': [() => answer(403, { error: 'insufficient_scope' })],
    });
    render(<MembershipChoices />);
    expect((await screen.findByRole('alert')).textContent).toBe(
      'This sign-in cannot list your organizations. Sign in to WBS again.',
    );
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.queryByText('You have no organization memberships yet.')).toBeNull();
  });

  it('renders an unreachable server as a failure, not an empty list', async () => {
    stubServer({});
    render(<MembershipChoices />);
    expect(await screen.findByRole('alert')).toBeDefined();
    expect(screen.queryByText('You have no organization memberships yet.')).toBeNull();
  });

  it('says when there is no membership to choose', async () => {
    stubServer({
      'GET /api/organization/memberships': [
        () => answer(200, { state: 'onboarding_required', memberships: [] }),
      ],
    });
    render(<MembershipChoices />);
    expect(screen.getByText('Loading your organizations…')).toBeDefined();
    expect(await screen.findByText('You have no organization memberships yet.')).toBeDefined();
  });
});
