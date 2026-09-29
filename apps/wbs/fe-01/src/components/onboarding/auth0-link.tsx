import { type ClientReply, startAuth0Link } from '@wbs/contracts';
import { useState } from 'react';

import { browserClient, failureMessage, unreachable } from '@/lib/http';

const links = browserClient([startAuth0Link]);

/**
 * The provider address a link start answered, as a URL to leave for.
 *
 * @throws when it is not an absolute https URL: be-01 builds it from the
 * configured Auth0 issuer, so anything else is a broken or tampered answer,
 * never a place to send the browser with its password session.
 */
export function authorizationTarget(location: string): URL {
  let target: URL;
  try {
    target = new URL(location);
  } catch (cause) {
    throw new Error('Auth0 link start answered an unparseable authorization location', { cause });
  }
  // Proof: 2026-09-29, accepting any parseable URL failed `refuses a non-https
  // authorization location without leaving the page` (navigated to http:).
  if (target.protocol !== 'https:')
    throw new Error('Auth0 link start answered a non-https authorization location');
  return target;
}

/**
 * Links an Auth0 identity to this password account: the account's password is
 * proved again, and the browser then leaves for Auth0. The outcome comes back
 * as `?auth_link=` on return; see {@link readLinkOutcome}.
 */
export function Auth0Link({
  navigate = (url) => {
    window.location.assign(url);
  },
}: {
  /** Leaves the page for `url`; injected in tests. */
  navigate?: (url: string) => void;
}): React.JSX.Element {
  const [password, setPassword] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [fault, setFault] = useState<Error | null>(null);

  if (fault !== null) throw fault;

  async function start(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setMessage('');
    try {
      const reply = await links.postApiAuthLinkAuth0({ body: { password } });
      switch (reply.kind) {
        case 'success':
          navigate(authorizationTarget(reply.body.location).href);
          return;
        case 'failure':
          setMessage(failureMessage(reply.failure));
          return;
        case 'refusal':
          setMessage(startRefusal(reply));
          return;
        default:
          return unreachable(reply);
      }
    } catch (cause) {
      setFault(new Error('Unexpected Auth0 link failure', { cause }));
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={(event) => void start(event)} className="mt-6">
      <p>Or link an Auth0 account whose email is already verified.</p>
      <label htmlFor="link-password">Your WBS password</label>
      <input
        id="link-password"
        className="border p-2"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => {
          setPassword(event.target.value);
        }}
        required
      />
      <button type="submit" disabled={sending}>
        Link Auth0 account
      </button>
      {message !== '' && <p role="alert">{message}</p>}
    </form>
  );
}

/**
 * Every modeled start refusal receives its own copy; `invalid_credentials`
 * is answered at 401 for a wrong password and at 429 when attempts are
 * exhausted.
 *
 * Proof: 2026-09-29, answering the 429 with the wrong-password copy failed
 * `renders the 429 credential refusal`.
 */
function startRefusal(
  reply: Extract<ClientReply<typeof startAuth0Link>, { kind: 'refusal' }>,
): string {
  const error = reply.body.error;
  switch (error) {
    case 'invalid_credentials':
      return reply.status === 429
        ? 'Too many attempts. Wait a few minutes and try again.'
        : 'That password is not correct.';
    case 'onboarding_inactive':
      return 'Account linking is not active yet.';
    case 'invalid_client':
      return 'Linking must go through the WBS site address. Reload and try again.';
    case 'invalid_origin':
    case 'invalid_body':
    case 'invalid_query':
    case 'invalid_params':
    case 'invalid_json':
      return 'Could not start linking. Reload and try again.';
    default:
      return unreachable(error);
  }
}

/** The query parameter be-01's link callback returns its outcome in. */
export const AUTH_LINK_PARAM = 'auth_link';

const LINK_OUTCOME_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  linked: 'Your Auth0 account is linked.',
  refused: 'Linking was refused or expired. Start again.',
  inactive: 'Account linking is not active yet.',
  collision: 'That Auth0 account or its email already belongs to another WBS account.',
  unavailable: 'Auth0 is unavailable right now. Try again later.',
  failed: 'Linking failed. Try again later.',
});

/**
 * The message for the link outcome in the address, or '' for none. An
 * unpublished value is ignored; `Object.hasOwn` keeps `?auth_link=toString`
 * from resolving through the prototype.
 */
export function readLinkOutcome(): string {
  const outcome = new URLSearchParams(window.location.search).get(AUTH_LINK_PARAM);
  if (outcome === null || !Object.hasOwn(LINK_OUTCOME_MESSAGES, outcome)) return '';
  return LINK_OUTCOME_MESSAGES[outcome];
}

/** Drops the outcome once read, so a reload does not repeat it. */
export function clearLinkOutcome(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(AUTH_LINK_PARAM)) return;
  url.searchParams.delete(AUTH_LINK_PARAM);
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}
