import { changeSharedPeople, type ClientReply, readSharedPeople } from '@wbs/contracts';
import { useCallback, useEffect, useState } from 'react';

import { browserClient, failureMessage, unreachable } from '@/lib/http';

import {
  type AccessLoss,
  lostAccess,
  READ_ONLY,
  type RefusalOutcome,
  RELOAD,
  said,
} from './organization-access';

const sharing = browserClient([readSharedPeople, changeSharedPeople]);

type View =
  | { kind: 'loading' }
  | { kind: 'failure'; message: string }
  | { kind: 'ready'; sharedPeople: boolean };

const SHARED_WORDS =
  'People are shared across projects: each project is scheduled around the work its people have in the projects ranked above it.';
const ISOLATED_WORDS =
  'Each project schedules its people as if it had them alone. A person booked in two projects at once shows as an overlap on their load.';

/**
 * Whether the active organization shares its people across projects
 * (`share-people-across-projects`, ADR 0034), and the switch. Any member reads
 * it; the server lets only a super-admin switch it. A switch moves the dates
 * of every project in the organization, so it asks for a confirmation, and
 * switching back restores each project's own dates.
 */
export function SharingPanel({
  onAccessLost,
}: {
  onAccessLost: (loss: AccessLoss) => void;
}): React.JSX.Element {
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [fault, setFault] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    const reply = await sharing.getApiOrganization({});
    switch (reply.kind) {
      case 'success':
        setView({ kind: 'ready', sharedPeople: reply.body.sharedPeople });
        return;
      case 'failure':
        setView({ kind: 'failure', message: failureMessage(reply.failure) });
        return;
      case 'refusal': {
        const outcome = sharingRefusal(reply.body.error);
        if (outcome.kind === 'lost') onAccessLost(outcome.loss);
        else setView({ kind: 'failure', message: outcome.text });
        return;
      }
      default:
        return unreachable(reply);
    }
  }, [onAccessLost]);

  useEffect(() => {
    void refresh().catch((cause: unknown) => {
      setFault(new Error('Unexpected sharing read failure', { cause }));
    });
  }, [refresh]);

  if (fault !== null) throw fault;

  async function switchTo(sharedPeople: boolean) {
    setSending(true);
    setMessage('');
    try {
      const reply = await sharing.patchApiOrganization({ body: { sharedPeople } });
      switch (reply.kind) {
        case 'success':
          setConfirming(false);
          setMessage(
            reply.body.sharedPeople
              ? 'People are now shared across projects.'
              : 'Each project now schedules its people alone.',
          );
          await refresh();
          return;
        case 'failure':
          setMessage(failureMessage(reply.failure));
          return;
        case 'refusal': {
          const outcome = sharingRefusal(reply.body.error);
          if (outcome.kind === 'lost') {
            onAccessLost(outcome.loss);
            return;
          }
          setConfirming(false);
          setMessage(outcome.text);
          return;
        }
        default:
          return unreachable(reply);
      }
    } catch (cause) {
      setFault(new Error('Unexpected sharing switch failure', { cause }));
    } finally {
      setSending(false);
    }
  }

  return (
    <section aria-labelledby="sharing-heading" className="mb-8">
      <h2 id="sharing-heading" className="mb-2 text-xl font-semibold">
        Shared people
      </h2>
      {view.kind === 'loading' && <p>Loading how people are shared…</p>}
      {view.kind === 'failure' && <p role="alert">{view.message}</p>}
      {view.kind === 'ready' && (
        <>
          <p>{view.sharedPeople ? SHARED_WORDS : ISOLATED_WORDS}</p>
          {confirming ? (
            <p className="flex flex-wrap items-center gap-2">
              <span>This moves the dates of every project in the organization.</span>
              <button
                type="button"
                disabled={sending}
                onClick={() => {
                  // Proof: 2026-09-29, sending the mode already held instead
                  // of its opposite made `shares people after a confirmation
                  // and re-reads the mode` receive { sharedPeople: false }.
                  void switchTo(!view.sharedPeople);
                }}
              >
                {view.sharedPeople ? 'Confirm: stop sharing people' : 'Confirm: share people'}
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() => {
                  setConfirming(false);
                }}
              >
                Cancel
              </button>
            </p>
          ) : (
            <button
              type="button"
              onClick={() => {
                setConfirming(true);
              }}
            >
              {view.sharedPeople ? 'Stop sharing people' : 'Share people across projects'}
            </button>
          )}
        </>
      )}
      {message !== '' && <p role="status">{message}</p>}
    </section>
  );
}

type SharingRefusalCode = Extract<
  ClientReply<typeof readSharedPeople | typeof changeSharedPeople>,
  { kind: 'refusal' }
>['body']['error'];

/** Every modeled sharing refusal receives its own copy. */
function sharingRefusal(error: SharingRefusalCode): RefusalOutcome {
  switch (error) {
    case 'unauthenticated':
    case 'no_active_organization':
    case 'not_a_member':
      return lostAccess(error);
    // Before activation there is no organization to share people in.
    case 'organization_required':
      return lostAccess('no_active_organization');
    case 'forbidden':
      return said('Only a super-admin can change whether people are shared.');
    case 'insufficient_scope':
      return said(READ_ONLY);
    case 'invalid_query':
    case 'invalid_body':
    case 'invalid_json':
    case 'invalid_params':
    case 'invalid_origin':
      return said(RELOAD);
    default:
      return unreachable(error);
  }
}
