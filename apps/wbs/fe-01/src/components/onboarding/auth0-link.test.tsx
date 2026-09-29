import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Component, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { answerJson as answer, stubServer } from '@/testing/stub-server';

import { Auth0Link } from './auth0-link';
import { OnboardingScreen } from './onboarding-screen';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

class Caught extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    return this.state.error === null ? (
      this.props.children
    ) : (
      <p>Caught: {this.state.error.message}</p>
    );
  }
}

async function startLink(password: string) {
  fireEvent.change(await screen.findByLabelText('Your WBS password'), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Link Auth0 account' }));
}

describe('Auth0 link start', () => {
  it('proves the password and leaves for the https authorization location', async () => {
    const sent = stubServer({
      'POST /api/auth/link/auth0': [
        () => answer(200, { location: 'https://tenant.auth0.test/authorize?state=s' }),
      ],
    });
    const navigate = vi.fn();
    render(<Auth0Link navigate={navigate} />);
    await startLink('secret');
    await vi.waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('https://tenant.auth0.test/authorize?state=s');
    });
    expect(sent[0]?.body).toEqual({ password: 'secret' });
  });

  it('refuses a non-https authorization location without leaving the page', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubServer({
      'POST /api/auth/link/auth0': [() => answer(200, { location: 'http://evil.test/authorize' })],
    });
    const navigate = vi.fn();
    render(
      <Caught>
        <Auth0Link navigate={navigate} />
      </Caught>,
    );
    await startLink('secret');
    expect(await screen.findByText(/^Caught: Unexpected Auth0 link failure/)).toBeDefined();
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'That password is not correct.'],
    [429, 'Too many attempts. Wait a few minutes and try again.'],
  ])('renders the %s credential refusal', async (status, copy) => {
    stubServer({
      'POST /api/auth/link/auth0': [() => answer(status, { error: 'invalid_credentials' })],
    });
    render(<Auth0Link navigate={vi.fn()} />);
    await startLink('wrong');
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', copy);
  });

  it('renders the inactive link refusal', async () => {
    stubServer({
      'POST /api/auth/link/auth0': [() => answer(403, { error: 'onboarding_inactive' })],
    });
    render(<Auth0Link navigate={vi.fn()} />);
    await startLink('secret');
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Account linking is not active yet.',
    );
  });
});

describe('Auth0 link outcome on return', () => {
  it.each([
    ['linked', 'Your Auth0 account is linked.'],
    ['collision', 'That Auth0 account or its email already belongs to another WBS account.'],
    ['refused', 'Linking was refused or expired. Start again.'],
  ])('renders %s and strips the parameter', async (outcome, copy) => {
    window.history.replaceState(null, '', `/?auth_link=${outcome}&keep=1`);
    stubServer({ 'GET /api/onboarding': [() => answer(403, { error: 'onboarding_inactive' })] });
    render(
      <OnboardingScreen onSignOut={() => undefined}>
        <p>Existing app</p>
      </OnboardingScreen>,
    );
    expect(await screen.findByText('Existing app')).toBeDefined();
    expect(screen.getByRole('status').textContent).toBe(copy);
    expect(window.location.search).toBe('?keep=1');
  });

  it('ignores an unpublished outcome', async () => {
    window.history.replaceState(null, '', '/?auth_link=toString');
    stubServer({ 'GET /api/onboarding': [() => answer(403, { error: 'onboarding_inactive' })] });
    render(
      <OnboardingScreen onSignOut={() => undefined}>
        <p>Existing app</p>
      </OnboardingScreen>,
    );
    expect(await screen.findByText('Existing app')).toBeDefined();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
