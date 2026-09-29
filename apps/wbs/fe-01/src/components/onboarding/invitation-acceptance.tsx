import { acceptInvitation, type ClientReply } from '@wbs/contracts';
import { useState } from 'react';

import { browserClient, failureMessage, unreachable } from '@/lib/http';

const acceptance = browserClient([acceptInvitation]);

/**
 * Accepts an invitation by the code its email carried. The server matches the
 * code against the signed-in user's current verified address; success
 * re-reads onboarding through `onAccepted`, which then shows the membership.
 */
export function InvitationAcceptance({
  onAccepted,
}: {
  onAccepted: () => Promise<void>;
}): React.JSX.Element {
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [fault, setFault] = useState<Error | null>(null);

  if (fault !== null) throw fault;

  async function accept(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setMessage('');
    try {
      const reply = await acceptance.postApiOnboardingInvitationsAccept({
        body: { token: code.trim() },
      });
      switch (reply.kind) {
        case 'success':
          // Proof: 2026-09-29, dropping this re-read failed `accepts an
          // invitation and re-reads onboarding`: the selection state never
          // appeared.
          await onAccepted();
          return;
        case 'failure':
          setMessage(failureMessage(reply.failure));
          return;
        case 'refusal':
          setMessage(acceptRefusal(reply.body.error));
          return;
        default:
          return unreachable(reply);
      }
    } catch (cause) {
      setFault(new Error('Unexpected invitation acceptance failure', { cause }));
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={(event) => void accept(event)} className="mt-6">
      <label htmlFor="invitation-code">Invitation code</label>
      <input
        id="invitation-code"
        className="border p-2"
        value={code}
        onChange={(event) => {
          setCode(event.target.value);
        }}
        required
      />
      <button type="submit" disabled={sending}>
        Accept invitation
      </button>
      {message !== '' && <p role="alert">{message}</p>}
    </form>
  );
}

/**
 * Every modeled acceptance refusal receives its own copy; an expired, revoked
 * or used offer is one state because the server answers them alike.
 *
 * Proof: 2026-09-29, answering `recipient_mismatch` with the invalid-code copy
 * failed `renders the recipient_mismatch acceptance refusal`.
 */
function acceptRefusal(
  error: Extract<ClientReply<typeof acceptInvitation>, { kind: 'refusal' }>['body']['error'],
): string {
  switch (error) {
    case 'invitation_invalid':
      return 'This invitation expired, was revoked or was already used. Ask for a new one.';
    case 'not_found':
      return 'That invitation code is not valid.';
    case 'recipient_mismatch':
      return 'This invitation was sent to a different email address.';
    case 'email_verification_required':
      return 'Verify your email address before accepting an invitation.';
    case 'onboarding_inactive':
      return 'Invitations are not active yet.';
    case 'insufficient_scope':
      return 'This sign-in cannot accept an invitation. Sign in to WBS again.';
    case 'unauthenticated':
      return 'Your session ended. Sign in again.';
    case 'forbidden':
    case 'invalid_body':
    case 'invalid_json':
    case 'invalid_query':
    case 'invalid_params':
    case 'invalid_origin':
      return 'Could not accept the invitation. Reload and try again.';
    default:
      return unreachable(error);
  }
}
