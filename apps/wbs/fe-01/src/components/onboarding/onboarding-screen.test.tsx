import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { stubServer } from '@/testing/stub-server';

import { OnboardingScreen } from './onboarding-screen';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('onboarding screen', () => {
  it('hands the visible sign-out gesture to the app coordinator', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(answer(200, { state: 'create_organization' }))),
    );
    const onSignOut = vi.fn();
    render(
      <OnboardingScreen onSignOut={onSignOut}>
        <p>Existing app</p>
      </OnboardingScreen>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it('lists the memberships to select with an SSO-enforced one locked', async () => {
    stubServer({
      'GET /api/onboarding': [
        () =>
          answer(200, {
            state: 'selection_required',
            memberships: [{ organizationId: 'g', name: 'Globex', role: 'admin' }],
          }),
      ],
      'GET /api/organization/memberships': [
        () =>
          answer(200, {
            state: 'selection_required',
            memberships: [
              { organizationId: 'g', name: 'Globex', role: 'admin', ssoRequired: true },
            ],
          }),
      ],
    });
    render(
      <OnboardingScreen onSignOut={() => undefined}>
        <p>Existing app</p>
      </OnboardingScreen>,
    );
    const list = await screen.findByRole('list', { name: 'Your organizations' });
    expect(within(list).getByRole('listitem').textContent).toContain('Locked');
  });

  it('keeps the existing app when onboarding is inactive', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(answer(403, { error: 'onboarding_inactive' }))),
    );
    render(
      <OnboardingScreen onSignOut={() => undefined}>
        <p>Existing app</p>
      </OnboardingScreen>,
    );
    expect(await screen.findByText('Existing app')).toBeDefined();
  });

  it('renders verification, query failure, creation, join and pending states', async () => {
    const states = [
      { state: 'verification_required' },
      { state: 'create_organization' },
      { state: 'join_organization', organization: { id: 'a', name: 'Acme' }, pending: false },
      { state: 'join_organization', organization: { id: 'a', name: 'Acme' }, pending: true },
    ];
    for (const state of states) {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve(answer(200, state))),
      );
      const shown = render(
        <OnboardingScreen onSignOut={() => undefined}>
          <p>Existing app</p>
        </OnboardingScreen>,
      );
      await waitFor(() => {
        expect(screen.queryByText('Loading onboarding…')).toBeNull();
      });
      if (state.state === 'verification_required')
        expect(screen.getByText(/Verify your email address/)).toBeDefined();
      if (state.state === 'create_organization')
        expect(screen.getByRole('button', { name: 'Create organization' })).toBeDefined();
      if (state.state === 'join_organization' && !state.pending)
        expect(screen.getByRole('button', { name: 'Request to join' })).toBeDefined();
      if (state.state === 'join_organization' && state.pending)
        expect(screen.getByText('Your request to join is pending.')).toBeDefined();
      shown.unmount();
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    render(
      <OnboardingScreen onSignOut={() => undefined}>
        <p>Existing app</p>
      </OnboardingScreen>,
    );
    expect(await screen.findByRole('alert')).toBeDefined();
  });

  it('submits a request and then shows pending without a membership', async () => {
    let pending = false;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          pending = true;
          return Promise.resolve(
            answer(201, { request: { id: 'r', organizationId: 'a', status: 'pending' } }),
          );
        }
        return Promise.resolve(
          answer(200, {
            state: 'join_organization',
            organization: { id: 'a', name: 'Acme' },
            pending,
          }),
        );
      }),
    );
    render(
      <OnboardingScreen onSignOut={() => undefined}>
        <p>Existing app</p>
      </OnboardingScreen>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Request to join' }));
    expect(await screen.findByText('Your request to join is pending.')).toBeDefined();
  });

  it('renders a creation refusal while keeping the form usable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) =>
        Promise.resolve(
          init?.method === 'POST'
            ? answer(409, { error: 'domain_matched' })
            : answer(200, { state: 'create_organization' }),
        ),
      ),
    );
    render(
      <OnboardingScreen onSignOut={() => undefined}>
        <p>Existing app</p>
      </OnboardingScreen>,
    );
    expect(screen.getByText('Loading onboarding…')).toBeDefined();
    fireEvent.change(await screen.findByLabelText('Organization name'), {
      target: { value: 'Acme' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create organization' }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Your domain belongs to an organization. Request to join it.',
    );
    expect(screen.getByRole('button', { name: 'Create organization' })).toBeDefined();
  });

  it('renders a write-scope refusal on creation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) =>
        Promise.resolve(
          init?.method === 'POST'
            ? answer(403, { error: 'insufficient_scope' })
            : answer(200, { state: 'create_organization' }),
        ),
      ),
    );
    render(
      <OnboardingScreen onSignOut={() => undefined}>
        <p>Existing app</p>
      </OnboardingScreen>,
    );
    fireEvent.change(await screen.findByLabelText('Organization name'), {
      target: { value: 'Acme' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create organization' }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'This sign-in cannot set up an organization. Sign in to WBS again.',
    );
  });
});

it.each(['creation', 'invitation acceptance'] as const)(
  '%s refreshes choices without selection',
  async (action) => {
    let member = false;
    const posted: string[] = [];
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posted.push(url);
        member = true;
        return Promise.resolve(
          action === 'creation'
            ? answer(201, {
                organization: { id: 'org-a', name: 'Alpha' },
                membership: { organizationId: 'org-a', userId: 'u1', role: 'super_admin' },
              })
            : answer(200, { membership: { organizationId: 'org-a', role: 'member' } }),
        );
      }
      return Promise.resolve(
        answer(
          200,
          member
            ? {
                state: 'selection_required',
                memberships: [{ organizationId: 'org-a', name: 'Alpha', role: 'member' }],
              }
            : { state: 'create_organization' },
        ),
      );
    });
    render(
      <OnboardingScreen
        onSignOut={() => undefined}
        renderOrganization={(mode) => <p>Choices {mode}</p>}
      >
        <p>Legacy app</p>
      </OnboardingScreen>,
    );
    if (action === 'creation') {
      fireEvent.change(await screen.findByLabelText('Organization name'), {
        target: { value: 'Alpha' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Create organization' }));
    } else {
      fireEvent.change(await screen.findByLabelText('Invitation code'), {
        target: { value: 'invitation-code' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));
    }
    await screen.findByText('Choices activated');
    expect(posted).toEqual([
      action === 'creation'
        ? '/api/onboarding/organizations'
        : '/api/onboarding/invitations/accept',
    ]);
  },
);
