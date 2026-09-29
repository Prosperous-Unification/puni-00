import { type ClientReply, confirmEmailChallenge, createEmailChallenge } from '@wbs/contracts';
import { useState } from 'react';

import { browserClient, failureMessage, unreachable } from '@/lib/http';

const challenges = browserClient([createEmailChallenge, confirmEmailChallenge]);

type Step = { kind: 'address' } | { kind: 'code'; email: string; expiresAt: number };

/**
 * A password account proves its address with a single-use code sent by the
 * server's mail sink. Success re-reads onboarding through `onVerified` rather
 * than assuming verification: the server's discovery decides the next state.
 *
 * An account that signs in through an identity provider is refused with
 * `password_account_required`, and the copy sends it back to that provider.
 */
export function EmailVerification({
  onVerified,
}: {
  onVerified: () => Promise<void>;
}): React.JSX.Element {
  const [step, setStep] = useState<Step>({ kind: 'address' });
  const [address, setAddress] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [fault, setFault] = useState<Error | null>(null);

  if (fault !== null) throw fault;

  async function sendCode(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setMessage('');
    try {
      const email = address.trim();
      const reply = await challenges.postApiOnboardingEmailChallenges({ body: { email } });
      switch (reply.kind) {
        case 'success':
          setCode('');
          setStep({ kind: 'code', email, expiresAt: reply.body.expiresAt });
          return;
        case 'failure':
          setMessage(failureMessage(reply.failure));
          return;
        case 'refusal':
          setMessage(challengeRefusal(reply.body.error));
          return;
        default:
          return unreachable(reply);
      }
    } catch (cause) {
      setFault(new Error('Unexpected email verification failure', { cause }));
    } finally {
      setSending(false);
    }
  }

  async function confirmCode(event: React.SyntheticEvent<HTMLFormElement>, email: string) {
    event.preventDefault();
    setSending(true);
    setMessage('');
    try {
      const reply = await challenges.postApiOnboardingEmailChallengesConfirm({
        body: { email, token: code.trim() },
      });
      switch (reply.kind) {
        case 'success':
          // Proof: 2026-09-29, dropping this re-read failed `sends a challenge,
          // confirms the code and re-reads onboarding`: the create form never
          // appeared and the screen kept the code step.
          await onVerified();
          return;
        case 'failure':
          setMessage(failureMessage(reply.failure));
          return;
        case 'refusal':
          setMessage(confirmRefusal(reply.body.error));
          return;
        default:
          return unreachable(reply);
      }
    } catch (cause) {
      setFault(new Error('Unexpected email verification failure', { cause }));
    } finally {
      setSending(false);
    }
  }

  return (
    <section>
      <p>Verify your email address to continue.</p>
      <p>Accounts that sign in through an identity provider verify there, then sign in again.</p>
      {step.kind === 'address' ? (
        <form onSubmit={(event) => void sendCode(event)}>
          <label htmlFor="verification-address">Email address</label>
          <input
            id="verification-address"
            className="border p-2"
            type="email"
            value={address}
            onChange={(event) => {
              setAddress(event.target.value);
            }}
            required
            maxLength={254}
          />
          <button type="submit" disabled={sending}>
            Send code
          </button>
        </form>
      ) : (
        <form onSubmit={(event) => void confirmCode(event, step.email)}>
          <p>
            Enter the code we sent to {step.email}. It expires at{' '}
            <time dateTime={new Date(step.expiresAt).toISOString()}>
              {new Date(step.expiresAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>
            .
          </p>
          <label htmlFor="verification-code">Code from the email</label>
          <input
            id="verification-code"
            className="border p-2"
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
            }}
            required
            autoComplete="one-time-code"
          />
          <button type="submit" disabled={sending}>
            Verify email
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={() => {
              setMessage('');
              setStep({ kind: 'address' });
            }}
          >
            Use a different address
          </button>
        </form>
      )}
      {message !== '' && <p role="alert">{message}</p>}
    </section>
  );
}

type RefusalCode<Shape extends typeof createEmailChallenge | typeof confirmEmailChallenge> =
  Extract<ClientReply<Shape>, { kind: 'refusal' }>['body']['error'];

const ADDRESS_CONFLICT = 'Another account already uses this email address.';
const SIGNED_OUT = 'Your session ended. Sign in again.';
const WRITE_ACCESS_REQUIRED = 'This sign-in cannot verify an email address. Sign in to WBS again.';
const PROVIDER_ACCOUNT =
  'This account signs in through your identity provider. Verify your email there, then sign in again.';
const INACTIVE = 'Email verification is not active yet.';

/**
 * Every modeled issuance refusal receives its own copy.
 *
 * Proof: 2026-09-29, answering `delivery_failed` with the generic reload copy
 * failed `renders the delivery_failed challenge refusal on the address step`.
 */
function challengeRefusal(error: RefusalCode<typeof createEmailChallenge>): string {
  switch (error) {
    case 'address_conflict':
      return ADDRESS_CONFLICT;
    case 'delivery_failed':
      return 'We could not send the code. Try again later.';
    case 'password_account_required':
      return PROVIDER_ACCOUNT;
    case 'invalid_body':
      return 'Enter a valid email address.';
    case 'onboarding_inactive':
      return INACTIVE;
    case 'insufficient_scope':
      return WRITE_ACCESS_REQUIRED;
    case 'unauthenticated':
      return SIGNED_OUT;
    case 'invalid_json':
    case 'invalid_query':
    case 'invalid_origin':
      return 'Could not send the code. Reload and try again.';
    default:
      return unreachable(error);
  }
}

/** Every modeled confirmation refusal receives its own copy. */
function confirmRefusal(error: RefusalCode<typeof confirmEmailChallenge>): string {
  switch (error) {
    case 'challenge_invalid':
      return 'That code is wrong, expired or already used. Send a new code.';
    case 'address_conflict':
      return ADDRESS_CONFLICT;
    case 'password_account_required':
      return PROVIDER_ACCOUNT;
    case 'onboarding_inactive':
      return INACTIVE;
    case 'insufficient_scope':
      return WRITE_ACCESS_REQUIRED;
    case 'unauthenticated':
      return SIGNED_OUT;
    case 'invalid_body':
    case 'invalid_json':
    case 'invalid_query':
    case 'invalid_origin':
      return 'Could not check the code. Send a new code and try again.';
    default:
      return unreachable(error);
  }
}
