import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { answerJson as answer, stubServer } from '@/testing/stub-server';

import { OnboardingScreen } from './onboarding-screen';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const unverified = () => answer(200, { state: 'verification_required' });
const verified = () => answer(200, { state: 'create_organization' });

function renderScreen() {
  render(
    <OnboardingScreen onSignOut={() => undefined}>
      <p>Existing app</p>
    </OnboardingScreen>,
  );
}

async function sendCode(address: string) {
  fireEvent.change(await screen.findByLabelText('Email address'), {
    target: { value: address },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send code' }));
}

async function confirmCode(code: string) {
  fireEvent.change(await screen.findByLabelText('Code from the email'), {
    target: { value: code },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Verify email' }));
}

describe('password email verification', () => {
  it('sends a challenge, confirms the code and re-reads onboarding', async () => {
    const sent = stubServer({
      'GET /api/onboarding': [unverified, verified],
      'POST /api/onboarding/email-challenges': [() => answer(201, { expiresAt: 1_800_000 })],
      'POST /api/onboarding/email-challenges/confirm': [
        () => answer(200, { email: 'ada@acme.test', verified: true }),
      ],
    });
    renderScreen();
    await sendCode(' ada@acme.test ');
    expect(await screen.findByText(/Enter the code we sent to ada@acme.test/)).toBeDefined();
    await confirmCode(' tok ');
    expect(await screen.findByRole('button', { name: 'Create organization' })).toBeDefined();
    expect(sent.filter((request) => request.route.startsWith('POST'))).toEqual([
      { route: 'POST /api/onboarding/email-challenges', body: { email: 'ada@acme.test' } },
      {
        route: 'POST /api/onboarding/email-challenges/confirm',
        body: { email: 'ada@acme.test', token: 'tok' },
      },
    ]);
  });

  it('keeps the code step and names a wrong, expired or used code', async () => {
    stubServer({
      'GET /api/onboarding': [unverified],
      'POST /api/onboarding/email-challenges': [() => answer(201, { expiresAt: 1_800_000 })],
      'POST /api/onboarding/email-challenges/confirm': [
        () => answer(409, { error: 'challenge_invalid' }),
      ],
    });
    renderScreen();
    await sendCode('ada@acme.test');
    await confirmCode('stale');
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'That code is wrong, expired or already used. Send a new code.',
    );
    expect(screen.getByLabelText('Code from the email')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Use a different address' }));
    expect(await screen.findByLabelText('Email address')).toBeDefined();
  });

  it.each([
    ['address_conflict', 409, 'Another account already uses this email address.'],
    ['delivery_failed', 503, 'We could not send the code. Try again later.'],
    [
      'password_account_required',
      403,
      'This account signs in through your identity provider. Verify your email there, then sign in again.',
    ],
    ['invalid_body', 400, 'Enter a valid email address.'],
    [
      'insufficient_scope',
      403,
      'This sign-in cannot verify an email address. Sign in to WBS again.',
    ],
    ['onboarding_inactive', 403, 'Email verification is not active yet.'],
  ])('renders the %s challenge refusal on the address step', async (error, status, copy) => {
    stubServer({
      'GET /api/onboarding': [unverified],
      'POST /api/onboarding/email-challenges': [() => answer(status, { error })],
    });
    renderScreen();
    await sendCode('ada@acme.test');
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', copy);
    expect(screen.getByLabelText('Email address')).toBeDefined();
  });

  it('renders a confirmation address conflict without leaving the code step', async () => {
    stubServer({
      'GET /api/onboarding': [unverified],
      'POST /api/onboarding/email-challenges': [() => answer(201, { expiresAt: 1_800_000 })],
      'POST /api/onboarding/email-challenges/confirm': [
        () => answer(409, { error: 'address_conflict' }),
      ],
    });
    renderScreen();
    await sendCode('ada@acme.test');
    await confirmCode('tok');
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Another account already uses this email address.',
    );
  });

  it('renders an unreachable server as a retryable message', async () => {
    stubServer({ 'GET /api/onboarding': [unverified] });
    renderScreen();
    await sendCode('ada@acme.test');
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Could not reach the server. Try again.',
    );
  });
});
