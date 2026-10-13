import { startAuth0Link } from '@wbs/contracts';
import { useId, useRef, useState } from 'react';

import { authorizationTarget, startRefusal } from '@/components/onboarding/auth0-link';
import { Button } from '@/components/ui/button';
import { browserClient, failureMessage, unreachable } from '@/lib/http';

const links = browserClient([startAuth0Link]);

/**
 * Starts a company identity link without changing the current credential's
 * authority. `/auth/me` does not expose credential kind, so the person must
 * choose their current sign-in; be-01 verifies that choice and fresh password.
 * `organization` is the slug from the validated server-selected login URL.
 */
export function CompanySignInLink({
  organization,
  navigate = (url) => {
    window.location.assign(url);
  },
}: {
  organization: string;
  /** Leaves the page for the validated provider address; injected in tests. */
  navigate?: (url: string) => void;
}): React.JSX.Element {
  const choiceId = useId();
  const passwordId = useId();
  const [choice, setChoice] = useState('');
  const [password, setPassword] = useState('');
  const pending = useRef(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [fault, setFault] = useState<Error | null>(null);
  if (fault !== null) throw fault;

  async function start(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    // Proof: 2026-10-13, removing this guard made `prevents repeated form
    // submissions while a request is pending` send two production requests.
    if (pending.current) return;
    // Proof: 2026-10-13, skipping this branch made `requires an explicit
    // current sign-in choice before posting` send a request without a choice.
    if (choice === '') {
      setMessage('Choose how you signed in to WBS.');
      return;
    }
    // Proof: 2026-10-13, skipping this branch made `requires a fresh
    // password for a WBS password sign-in` send the empty password.
    if (choice === 'password' && password === '') {
      setMessage('Enter your WBS password.');
      return;
    }
    pending.current = true;
    setSending(true);
    setMessage('');
    try {
      const reply = await links.postApiAuthLinkAuth0({
        // Proof: 2026-10-13, always including password failed `posts only
        // the company slug for a provider sign-in and leaves for Auth0`.
        body: { organization, ...(choice === 'password' ? { password } : {}) },
      });
      switch (reply.kind) {
        case 'success':
          navigate(authorizationTarget(reply.body.location).href);
          return;
        case 'failure':
          setMessage(failureMessage(reply.failure));
          break;
        case 'refusal':
          setMessage(startRefusal(reply));
          break;
        default:
          return unreachable(reply);
      }
      pending.current = false;
      setSending(false);
    } catch (cause) {
      setFault(new Error('Unexpected company sign-in link failure', { cause }));
    }
  }

  return (
    <form onSubmit={(event) => void start(event)} className="flex w-full flex-col gap-3">
      <label htmlFor={choiceId}>How did you sign in to WBS?</label>
      <select
        id={choiceId}
        value={choice}
        disabled={sending}
        required
        className="border-input bg-background rounded-md border p-2"
        onChange={(event) => {
          setChoice(event.target.value);
          // Proof: 2026-10-13, retaining the password failed `posts the
          // password with the company slug and clears it when choosing a provider`.
          setPassword('');
          setMessage('');
        }}
      >
        <option value="">Choose your current sign-in</option>
        <option value="provider">An identity provider (company, Google, GitHub or Auth0)</option>
        <option value="password">My WBS username and password</option>
      </select>
      {choice === 'password' && (
        <>
          <label htmlFor={passwordId}>Your WBS password</label>
          <input
            id={passwordId}
            type="password"
            autoComplete="current-password"
            required
            className="border-input bg-background rounded-md border p-2"
            value={password}
            disabled={sending}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
        </>
      )}
      <Button type="submit" disabled={sending}>
        Link your company sign-in
      </Button>
      {sending && <p role="status">Opening your company sign-in…</p>}
      {message !== '' && <p role="alert">{message}</p>}
    </form>
  );
}
