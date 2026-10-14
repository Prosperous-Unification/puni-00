import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { OnboardingScreen } from '@/components/onboarding/onboarding-screen';
import { SessionFeaturesProvider } from '@/lib/session-features';
import { fakeDirectoryApi } from '@/modules/directory/fake-directory-api';
import { browserStorage } from '@/modules/preferences/browser-storage.repository';
import { type ApplicationServices, installApplicationRuntime } from '@/runtime/application-runtime';
import { ApplicationServicesProvider } from '@/runtime/application-services-context';
import { credentialOf } from '@/runtime/credential';
import { createLifetimeSlot } from '@/runtime/lifetime-slot';
import type { OrganizationRoutes } from '@/runtime/organization-owner';
import { createSessionOwner, installSessionRuntime } from '@/runtime/session-runtime';
import { fakeProjectApi } from '@/testing/fake-project-api';
import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
import { SILENT_STREAM } from '@/testing/silent-stream';
import { answerJson, stubServer } from '@/testing/stub-server';
publishApplicationRuntimeForEachTest();
import { OrganizationGate } from './organization-gate';
const current = { organizationId: 'org-a', name: 'Alpha', role: 'admin' as const };
afterEach(() => vi.unstubAllGlobals());
it.each(['selection', 'switcher'] as const)(
  'accepts another invitation from %s and refreshes choices without selection',
  async (entry) => {
    let accepted = false;
    const sent = stubServer({
      'GET /api/onboarding': [
        () => answerJson(200, { state: 'selection_required', memberships: [current] }),
      ],
      'GET /api/organization/active': [
        () =>
          entry === 'selection'
            ? answerJson(403, { error: 'no_active_organization' })
            : answerJson(200, current),
      ],
      'GET /api/organization/memberships': [
        () =>
          answerJson(200, {
            state: 'selection_required',
            memberships: [
              { ...current, ssoRequired: false },
              ...(accepted
                ? [{ organizationId: 'org-b', name: 'Beta', role: 'member', ssoRequired: false }]
                : []),
            ],
          }),
      ],
      'POST /api/onboarding/invitations/accept': [
        () => {
          accepted = true;
          return answerJson(200, { membership: { organizationId: 'org-b', role: 'member' } });
        },
      ],
    });
    render(
      <OnboardingScreen
        onSignOut={() => undefined}
        renderOrganization={(mode) => (
          <OrganizationGate
            mode={mode}
            identity={{ userId: 'u1', credential: credentialOf('tok') }}
            openOwner={() =>
              createSessionOwner({
                clientFor: () => fakeDirectoryApi(),
                projectClientFor: () => fakeProjectApi(),
                streamDeps: SILENT_STREAM,
              })
            }
            notices={() => ({ announce: () => undefined, close: () => undefined })}
            onOwner={() => undefined}
            onSignOut={() => undefined}
            renderRuntime={(_runtime, switcher) => (
              <>
                {switcher}
                <p>Alpha resources</p>
              </>
            )}
          />
        )}
      >
        <p>Legacy resources</p>
      </OnboardingScreen>,
    );
    if (entry === 'switcher') fireEvent.click(await screen.findByText('Organization: Alpha'));
    await screen.findByRole('button', { name: 'Choose Alpha' });
    fireEvent.change(await screen.findByLabelText('Invitation code'), {
      target: { value: 'beta-invitation' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));
    await screen.findByRole('button', { name: 'Choose Beta' });
    expect(screen.getByRole('button', { name: 'Choose Alpha' })).toBeTruthy();
    expect(sent.filter((request) => request.route.startsWith('POST'))).toEqual([
      { route: 'POST /api/onboarding/invitations/accept', body: { token: 'beta-invitation' } },
    ]);
    expect(screen.queryByText('Alpha resources') !== null).toBe(entry === 'switcher');
  },
);
function mount(routes: OrganizationRoutes, mode: 'legacy' | 'activated' = 'activated') {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        Response.json({
          state: 'selection_required',
          memberships: [{ ...current, ssoRequired: false }],
        }),
      ),
    ),
  );
  return render(
    <SessionFeaturesProvider
      value={mode === 'legacy' ? { onboarding: false, organizations: false } : null}
    >
      <OrganizationGate
        mode={mode}
        identity={{ userId: 'u1', credential: credentialOf('tok') }}
        openOwner={() =>
          createSessionOwner({
            clientFor: () => fakeDirectoryApi(),
            projectClientFor: () => fakeProjectApi(),
            streamDeps: SILENT_STREAM,
          })
        }
        routes={routes}
        notices={() => ({ announce: () => undefined, close: () => undefined })}
        onOwner={() => undefined}
        onSignOut={() => undefined}
        renderRuntime={(runtime, switcher) => (
          <>
            {switcher}
            <p>
              Resources{' '}
              {runtime.organization.kind === 'active'
                ? runtime.organization.organizationId
                : 'legacy'}
            </p>
          </>
        )}
      />
    </SessionFeaturesProvider>,
  );
}
it('starts the inactive deployment runtime without reading membership choices', async () => {
  mount(
    {
      discover: () => {
        throw new Error('inactive discovery');
      },
      select: () => {
        throw new Error('inactive selection');
      },
    },
    'legacy',
  );
  const requests = vi.mocked(fetch);
  await screen.findByText('Resources legacy');
  expect(requests).not.toHaveBeenCalled();
});
it('requires an explicit choice even for a sole membership', async () => {
  const select = vi.fn(() =>
    Promise.resolve({
      kind: 'success' as const,
      representation: 'json' as const,
      status: 200 as const,
      headers: new Headers(),
      body: { organizationId: 'org-a' },
    }),
  );
  mount({
    discover: () =>
      Promise.resolve({
        kind: 'refusal',
        representation: 'json',
        status: 403,
        headers: new Headers(),
        body: { error: 'no_active_organization' },
      }),
    select,
  });
  await screen.findByRole('button', { name: 'Choose Alpha' });
  expect(select).not.toHaveBeenCalled();
  expect(screen.queryByText('Resources org-a')).toBeNull();
});
it('withdraws every resource view after a failed switch and offers explicit recovery', async () => {
  mount({
    discover: () =>
      Promise.resolve({
        kind: 'success',
        representation: 'json',
        status: 200,
        headers: new Headers(),
        body: current,
      }),
    select: () =>
      Promise.resolve({
        kind: 'refusal',
        representation: 'json',
        status: 403,
        headers: new Headers(),
        body: { error: 'not_a_member' },
      }),
  });
  await screen.findByText('Resources org-a');
  fireEvent.click(screen.getByText('Organization: Alpha'));
  fireEvent.click(await screen.findByRole('button', { name: 'Choose Alpha' }));
  await screen.findByText('You no longer belong to that organization.');
  expect(screen.queryByText('Resources org-a')).toBeNull();
  expect(screen.getByRole('button', { name: 'Check current organization' })).toBeTruthy();
});
it('focus withdraws resources before discovery settles', async () => {
  let reads = 0;
  mount({
    discover: () =>
      ++reads === 1
        ? Promise.resolve({
            kind: 'success',
            representation: 'json',
            status: 200,
            headers: new Headers(),
            body: current,
          })
        : new Promise(() => undefined),
    select: () =>
      Promise.resolve({
        kind: 'success',
        representation: 'json',
        status: 200,
        headers: new Headers(),
        body: { organizationId: 'org-a' },
      }),
  });
  await screen.findByText('Resources org-a');
  fireEvent.focus(window);
  await waitFor(() => {
    expect(screen.queryByText('Resources org-a')).toBeNull();
  });
  expect(reads).toBe(2);
});

it('persisted pageshow withdraws resources before discovery settles', async () => {
  let reads = 0;
  mount({
    discover: () =>
      ++reads === 1
        ? Promise.resolve({
            kind: 'success',
            representation: 'json',
            status: 200,
            headers: new Headers(),
            body: current,
          })
        : new Promise(() => undefined),
    select: () =>
      Promise.resolve({
        kind: 'success',
        representation: 'json',
        status: 200,
        headers: new Headers(),
        body: { organizationId: 'org-a' },
      }),
  });
  await screen.findByText('Resources org-a');
  fireEvent(window, new PageTransitionEvent('pageshow', { persisted: true }));
  await waitFor(() => {
    expect(screen.queryByText('Resources org-a')).toBeNull();
  });
  expect(reads).toBe(2);
});

it('fails application retirement when the organization runtime cannot retire', async () => {
  const slot = createLifetimeSlot<ApplicationServices>(1_000);
  await slot.replace(() =>
    installApplicationRuntime({
      openStore: browserStorage,
      isLive: () => slot.snapshot().status === 'live',
    }),
  );
  const sessions = createSessionOwner({
    clientFor: () => fakeDirectoryApi(),
    projectClientFor: () => fakeProjectApi(),
    streamDeps: SILENT_STREAM,
    install: (dependencies) => {
      const runtime = installSessionRuntime(dependencies);
      return {
        services: runtime.services,
        close: async (options) => {
          await runtime.close(options);
          throw new Error('retirement broke');
        },
      };
    },
  });
  const mounted = render(
    <ApplicationServicesProvider slot={slot}>
      <OrganizationGate
        mode="legacy"
        identity={{ userId: 'u1', credential: credentialOf('token') }}
        openOwner={() => sessions}
        onOwner={() => undefined}
        onSignOut={() => undefined}
        renderRuntime={() => <p>Legacy resources</p>}
      />
    </ApplicationServicesProvider>,
  );
  await screen.findByText('Legacy resources');
  mounted.unmount();
  await expect(slot.retire()).rejects.toThrow();
  expect(slot.snapshot().status).toBe('fatal');
});
