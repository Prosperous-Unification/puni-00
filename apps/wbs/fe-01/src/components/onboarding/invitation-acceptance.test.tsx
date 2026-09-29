import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { answerJson as answer, stubServer } from '@/testing/stub-server';

import { OnboardingScreen } from './onboarding-screen';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderScreen() {
  render(
    <OnboardingScreen onSignOut={() => undefined}>
      <p>Existing app</p>
    </OnboardingScreen>,
  );
}

async function acceptCode(code: string) {
  fireEvent.change(await screen.findByLabelText('Invitation code'), { target: { value: code } });
  fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));
}

describe('invitation acceptance', () => {
  it('accepts an invitation and re-reads onboarding', async () => {
    const sent = stubServer({
      'GET /api/onboarding': [
        () => answer(200, { state: 'create_organization' }),
        () =>
          answer(200, {
            state: 'selection_required',
            memberships: [{ organizationId: 'o', name: 'Acme', role: 'member' }],
          }),
      ],
      'POST /api/onboarding/invitations/accept': [
        () => answer(200, { membership: { organizationId: 'o', role: 'member' } }),
      ],
    });
    renderScreen();
    await acceptCode(' tok ');
    expect(await screen.findByText('Acme')).toBeDefined();
    expect(sent.find((request) => request.route.startsWith('POST'))?.body).toEqual({
      token: 'tok',
    });
  });

  it('offers acceptance beside a matching organization', async () => {
    stubServer({
      'GET /api/onboarding': [
        () =>
          answer(200, {
            state: 'join_organization',
            organization: { id: 'a', name: 'Acme' },
            pending: true,
          }),
      ],
    });
    renderScreen();
    expect(await screen.findByLabelText('Invitation code')).toBeDefined();
  });

  it('does not offer acceptance before the email is verified', async () => {
    stubServer({ 'GET /api/onboarding': [() => answer(200, { state: 'verification_required' })] });
    renderScreen();
    await screen.findByLabelText('Email address');
    expect(screen.queryByLabelText('Invitation code')).toBeNull();
  });

  it.each([
    [
      'invitation_invalid',
      409,
      'This invitation expired, was revoked or was already used. Ask for a new one.',
    ],
    ['not_found', 404, 'That invitation code is not valid.'],
    ['recipient_mismatch', 403, 'This invitation was sent to a different email address.'],
    [
      'email_verification_required',
      403,
      'Verify your email address before accepting an invitation.',
    ],
  ])('renders the %s acceptance refusal', async (error, status, copy) => {
    stubServer({
      'GET /api/onboarding': [() => answer(200, { state: 'create_organization' })],
      'POST /api/onboarding/invitations/accept': [() => answer(status, { error })],
    });
    renderScreen();
    await acceptCode('tok');
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', copy);
    expect(screen.getByLabelText('Invitation code')).toBeDefined();
  });
});
