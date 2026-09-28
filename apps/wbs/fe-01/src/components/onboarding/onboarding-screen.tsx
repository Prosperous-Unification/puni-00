import {
  type ClientReply,
  createOnboardingOrganization,
  readOnboarding,
  submitOnboardingJoinRequest,
} from '@wbs/contracts';
import { useCallback, useEffect, useState } from 'react';

import { browserClient, failureMessage, unreachable } from '@/lib/http';

const onboarding = browserClient([
  readOnboarding,
  createOnboardingOrganization,
  submitOnboardingJoinRequest,
]);
type Discovery = Extract<ClientReply<typeof readOnboarding>, { kind: 'success' }>['body'];
type View =
  | { kind: 'loading' }
  | { kind: 'inactive' }
  | { kind: 'failure'; message: string }
  | { kind: 'fault'; error: Error }
  | { kind: 'ready'; state: Discovery };

/** Signed-in routing is inert until the activation marker admits onboarding. */
export function OnboardingScreen({
  children,
  onSignOut,
}: {
  children: React.ReactNode;
  onSignOut: () => void;
}): React.JSX.Element {
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [name, setName] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    const reply = await onboarding.getApiOnboarding({});
    switch (reply.kind) {
      case 'success':
        setView({ kind: 'ready', state: reply.body });
        return;
      case 'failure':
        setView({ kind: 'failure', message: failureMessage(reply.failure) });
        return;
      case 'refusal':
        switch (reply.body.error) {
          case 'onboarding_inactive':
            setView({ kind: 'inactive' });
            return;
          case 'unauthenticated':
            setView({ kind: 'failure', message: 'Your session ended. Sign in again.' });
            return;
          case 'invalid_query':
          case 'invalid_body':
          case 'invalid_json':
            setView({
              kind: 'failure',
              message: 'Could not check onboarding. Reload and try again.',
            });
            return;
          default:
            return unreachable(reply.body);
        }
      default:
        return unreachable(reply);
    }
  }, []);

  useEffect(() => {
    void refresh().catch((cause: unknown) => {
      setView({ kind: 'fault', error: new Error('Unexpected onboarding failure', { cause }) });
    });
  }, [refresh]);

  async function createOrganization(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setMessage('');
    try {
      const reply = await onboarding.postApiOnboardingOrganizations({ body: { name } });
      switch (reply.kind) {
        case 'success':
          await refresh();
          return;
        case 'failure':
          setMessage(failureMessage(reply.failure));
          return;
        case 'refusal':
          // Proof: 2026-09-28, dropping this message failed `renders a
          // creation refusal while keeping the form usable` in Vitest.
          setMessage(createRefusal(reply.body.error));
          return;
        default:
          return unreachable(reply);
      }
    } catch (cause) {
      setView({ kind: 'fault', error: new Error('Unexpected onboarding failure', { cause }) });
    } finally {
      setSending(false);
    }
  }

  async function requestJoin(organizationId: string) {
    setSending(true);
    setMessage('');
    try {
      const reply = await onboarding.postApiOnboardingJoinRequests({ body: { organizationId } });
      switch (reply.kind) {
        case 'success':
          await refresh();
          return;
        case 'failure':
          setMessage(failureMessage(reply.failure));
          return;
        case 'refusal':
          setMessage(joinRefusal(reply.body.error));
          return;
        default:
          return unreachable(reply);
      }
    } catch (cause) {
      setView({ kind: 'fault', error: new Error('Unexpected onboarding failure', { cause }) });
    } finally {
      setSending(false);
    }
  }

  if (view.kind === 'loading') return <main className="p-8">Loading onboarding…</main>;
  if (view.kind === 'fault') throw view.error;
  if (view.kind === 'inactive') return <>{children}</>;
  if (view.kind === 'failure')
    return (
      <main className="p-8" role="alert">
        {view.message}
      </main>
    );
  const state = view.state;
  return (
    <main className="bg-background text-foreground mx-auto max-w-xl p-8 font-sans">
      <h1 className="mb-4 text-2xl font-semibold">Join your organization</h1>
      <button type="button" onClick={onSignOut}>
        Sign out
      </button>
      {state.state === 'verification_required' && (
        <p>Verify your email address with your identity provider to continue.</p>
      )}
      {state.state === 'selection_required' && (
        <section>
          <p>Your memberships are ready for organization selection.</p>
          <ul>
            {state.memberships.map((membership) => (
              <li key={membership.organizationId}>{membership.name}</li>
            ))}
          </ul>
        </section>
      )}
      {state.state === 'create_organization' && (
        <form onSubmit={(event) => void createOrganization(event)}>
          <label htmlFor="organization-name">Organization name</label>
          <input
            id="organization-name"
            className="border p-2"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
            required
            maxLength={120}
          />
          <button type="submit" disabled={sending}>
            Create organization
          </button>
        </form>
      )}
      {state.state === 'join_organization' && (
        <section>
          <p>Your domain belongs to {state.organization.name}.</p>
          {state.pending ? (
            <p>Your request to join is pending.</p>
          ) : (
            <button
              type="button"
              disabled={sending}
              onClick={() => {
                void requestJoin(state.organization.id);
              }}
            >
              Request to join
            </button>
          )}
        </section>
      )}
      {message !== '' && <p role="alert">{message}</p>}
    </main>
  );
}

/** Every modeled create refusal receives visible copy. */
function createRefusal(
  error: Extract<
    ClientReply<typeof createOnboardingOrganization>,
    { kind: 'refusal' }
  >['body']['error'],
): string {
  switch (error) {
    case 'onboarding_inactive':
      return 'Onboarding is not active yet.';
    case 'email_verification_required':
      return 'Verify your email address to continue.';
    case 'already_member':
      return 'You already belong to an organization.';
    case 'domain_matched':
      return 'Your domain belongs to an organization. Request to join it.';
    case 'invalid_body':
      return 'Enter a valid organization name.';
    case 'invalid_json':
    case 'invalid_query':
    case 'invalid_origin':
      return 'Could not create the organization. Reload and try again.';
    case 'unauthenticated':
      return 'Your session ended. Sign in again.';
    default:
      return unreachable(error);
  }
}

/** Every modeled submission refusal receives visible copy. */
function joinRefusal(
  error: Extract<
    ClientReply<typeof submitOnboardingJoinRequest>,
    { kind: 'refusal' }
  >['body']['error'],
): string {
  switch (error) {
    case 'onboarding_inactive':
      return 'Onboarding is not active yet.';
    case 'email_verification_required':
      return 'Verify your email address to continue.';
    case 'already_member':
      return 'You already belong to an organization.';
    case 'join_request_pending':
      return 'Your request to join is pending.';
    case 'not_found':
      return 'This organization no longer matches your email domain.';
    case 'invalid_body':
    case 'invalid_json':
    case 'invalid_query':
    case 'invalid_origin':
      return 'Could not send the request. Reload and try again.';
    case 'unauthenticated':
      return 'Your session ended. Sign in again.';
    default:
      return unreachable(error);
  }
}
