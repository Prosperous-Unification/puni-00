import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppFaultBoundary } from '@/components/chrome/app-fault';
import { answerJson as answer, stubServer } from '@/testing/stub-server';

import { CompanySignInLink } from './company-sign-in-link';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function choose(choice: string) {
  fireEvent.change(screen.getByLabelText('How did you sign in to WBS?'), {
    target: { value: choice },
  });
}
function submit() {
  fireEvent.submit(
    screen.getByRole('button', { name: 'Link your company sign-in' }).closest('form')!,
  );
}

describe('company sign-in link', () => {
  it('requires an explicit current sign-in choice before posting', () => {
    const sent = stubServer({});
    render(<CompanySignInLink organization="acme-eu-2" navigate={vi.fn()} />);
    submit();
    expect(screen.getByRole('alert').textContent).toBe('Choose how you signed in to WBS.');
    expect(sent).toHaveLength(0);
  });
  it('posts only the company slug for a provider sign-in and leaves for Auth0', async () => {
    const sent = stubServer({
      'POST /api/auth/link/auth0': [
        () => answer(200, { location: 'https://tenant.test/authorize' }),
      ],
    });
    const navigate = vi.fn();
    render(<CompanySignInLink organization="acme-eu-2" navigate={navigate} />);
    choose('provider');
    submit();
    await vi.waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('https://tenant.test/authorize');
    });
    expect(sent[0]?.body).toEqual({ organization: 'acme-eu-2' });
    expect(screen.getByRole('button')).toHaveProperty('disabled', true);
  });
  it('requires a fresh password for a WBS password sign-in', () => {
    const sent = stubServer({});
    render(<CompanySignInLink organization="acme-eu-2" navigate={vi.fn()} />);
    choose('password');
    submit();
    expect(screen.getByRole('alert').textContent).toBe('Enter your WBS password.');
    expect(sent).toHaveLength(0);
  });
  it('posts the password with the company slug and clears it when choosing a provider', async () => {
    const sent = stubServer({
      'POST /api/auth/link/auth0': [() => answer(401, { error: 'invalid_credentials' })],
    });
    render(<CompanySignInLink organization="acme-eu-2" navigate={vi.fn()} />);
    choose('password');
    fireEvent.change(screen.getByLabelText('Your WBS password'), { target: { value: 'secret' } });
    submit();
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'That password is not correct.',
    );
    expect(sent[0]?.body).toEqual({ organization: 'acme-eu-2', password: 'secret' });
    choose('provider');
    expect(screen.queryByLabelText('Your WBS password')).toBeNull();
    choose('password');
    expect(screen.getByLabelText('Your WBS password')).toHaveProperty('value', '');
  });
  it('prevents repeated form submissions while a request is pending', async () => {
    let release: (response: Response) => void = () => {
      throw new Error('Request not started');
    };
    const sent: string[] = [];
    vi.stubGlobal('fetch', (url: string) => {
      sent.push(url);
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    });
    render(<CompanySignInLink organization="acme-eu-2" navigate={vi.fn()} />);
    choose('provider');
    submit();
    submit();
    expect(sent).toHaveLength(1);
    expect(screen.getByRole('button')).toHaveProperty('disabled', true);
    release(answer(429, { error: 'invalid_credentials' }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Too many attempts. Wait a few minutes and try again.',
    );
    expect(screen.getByRole('button')).toHaveProperty('disabled', false);
  });
  it.each([
    [
      404,
      { error: 'sso_connection_not_found' },
      'That company sign-in is not set up. Check its address and try again.',
    ],
    [500, { error: 'server_error' }, 'The server returned an unexpected response. Try again.'],
  ])('renders the %s failure and allows retry', async (status, body, message) => {
    stubServer({ 'POST /api/auth/link/auth0': [() => answer(status, body)] });
    render(<CompanySignInLink organization="acme-eu-2" navigate={vi.fn()} />);
    choose('provider');
    submit();
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', message);
    expect(screen.getByRole('button')).toHaveProperty('disabled', false);
  });
  it('renders a transport failure and allows retry', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
    render(<CompanySignInLink organization="acme-eu-2" navigate={vi.fn()} />);
    choose('provider');
    submit();
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Could not reach the server. Try again.',
    );
    expect(screen.getByRole('button')).toHaveProperty('disabled', false);
  });

  it('refuses an insecure authorization target through the fault boundary', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubServer({
      'POST /api/auth/link/auth0': [() => answer(200, { location: 'http://evil.test/' })],
    });
    const navigate = vi.fn();
    render(
      <AppFaultBoundary>
        <CompanySignInLink organization="acme-eu-2" navigate={navigate} />
      </AppFaultBoundary>,
    );
    choose('provider');
    submit();
    await vi.waitFor(() => {
      expect(screen.getByRole('alert').hasAttribute('data-app-fault')).toBe(true);
    });
    expect(navigate).not.toHaveBeenCalled();
  });
});
