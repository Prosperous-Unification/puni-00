import { type ClientReply, readCapacityMode, switchCapacityMode } from '@wbs/contracts';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { browserClient, failureMessage, unreachable } from '@/lib/http';

import {
  type AccessLoss,
  lostAccess,
  READ_ONLY,
  type RefusalOutcome,
  RELOAD,
  said,
} from './organization-access';
import {
  ALERT_CLASS,
  CONTROL_HEIGHT,
  OrganizationSection,
  ROW_ACTIONS_CLASS,
  STATUS_CLASS,
} from './organization-section';

const sharing = browserClient([readCapacityMode, switchCapacityMode]);

type View =
  | { kind: 'loading' }
  | { kind: 'failure'; message: string }
  | { kind: 'ready'; sharedPeople: boolean; sharingAvailable: boolean; canSwitch: boolean };

const SHARED_WORDS =
  'People are shared across projects: each project is scheduled around the work its people have in the projects ranked above it.';
const ISOLATED_WORDS =
  'Each project schedules its people as if it had them alone. A person booked in two projects at once shows as an overlap on their load.';
const UNAVAILABLE_WORDS = 'Sharing people across projects is not available in this release yet.';
const SUPER_ADMIN_WORDS = 'Only a super-admin can change whether people are shared.';

/**
 * Whether the active organization shares its people across projects
 * (`share-people-across-projects`, ADR 0034), and the switch. Any member reads
 * it; the server lets only a super-admin switch it. A switch moves the dates
 * of every project in the organization, so it asks for a confirmation, and
 * switching back restores each project's own dates. Only a caller the server
 * says may switch (`canSwitch`) is offered the switch; everyone else reads why
 * not. A release that cannot run shared people says so instead of offering a
 * switch it would refuse; an organization already shared can always be
 * switched back.
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
        setView({
          kind: 'ready',
          sharedPeople: reply.body.sharedPeople,
          sharingAvailable: reply.body.sharingAvailable,
          canSwitch: reply.body.canSwitch,
        });
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
          // The refusal may mean the release or the caller's role changed since
          // the read; re-reading puts the panel in the state the server holds,
          // so the switch it just refused is not offered again.
          // Proof: 2026-10-11, without this re-read `stops offering a switch
          // the server refused` still found the button.
          await refresh();
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
    <OrganizationSection id="sharing-heading" title="Shared people">
      {view.kind === 'loading' && <p className={STATUS_CLASS}>Loading how people are shared…</p>}
      {view.kind === 'failure' && (
        <p role="alert" className={ALERT_CLASS}>
          {view.message}
        </p>
      )}
      {view.kind === 'ready' && (
        <>
          <p className="text-sm leading-relaxed">
            {view.sharedPeople ? SHARED_WORDS : ISOLATED_WORDS}
          </p>
          {confirming ? (
            <div
              role="group"
              aria-label="Confirm the switch"
              className="border-destructive/40 bg-destructive/5 flex flex-col gap-3 rounded-md border p-3"
            >
              <p className="text-sm font-medium">
                This moves the dates of every project in the organization. Switching back restores
                them.
              </p>
              <p className={ROW_ACTIONS_CLASS}>
                <Button
                  type="button"
                  variant="destructive"
                  className={CONTROL_HEIGHT}
                  disabled={sending}
                  onClick={() => {
                    // Proof: 2026-10-11, sending the mode already held instead
                    // of its opposite made `shares people after a confirmation
                    // and re-reads the mode` receive { sharedPeople: false }.
                    void switchTo(!view.sharedPeople);
                  }}
                >
                  {view.sharedPeople ? 'Confirm: stop sharing people' : 'Confirm: share people'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className={CONTROL_HEIGHT}
                  disabled={sending}
                  onClick={() => {
                    setConfirming(false);
                  }}
                >
                  Cancel
                </Button>
              </p>
            </div>
          ) : !view.sharedPeople && !view.sharingAvailable ? (
            // Proof: 2026-10-11, offering the switch whatever the release
            // supports made `offers no switch a release without shared
            // people would refuse` find the button.
            <p className="text-muted-foreground text-sm">{UNAVAILABLE_WORDS}</p>
          ) : !view.canSwitch ? (
            // Proof: 2026-10-11, offering the switch whatever the caller's role
            // made `explains, without a switch, that only a super-admin may
            // change it` find the button.
            <p className="text-muted-foreground text-sm">{SUPER_ADMIN_WORDS}</p>
          ) : (
            <Button
              type="button"
              variant="outline"
              className={`self-start ${CONTROL_HEIGHT}`}
              onClick={() => {
                setConfirming(true);
              }}
            >
              {view.sharedPeople ? 'Stop sharing people' : 'Share people across projects'}
            </Button>
          )}
        </>
      )}
      {message !== '' && (
        <p role="status" className={STATUS_CLASS}>
          {message}
        </p>
      )}
    </OrganizationSection>
  );
}

type SharingRefusalCode = Extract<
  ClientReply<typeof readCapacityMode | typeof switchCapacityMode>,
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
      return said(SUPER_ADMIN_WORDS);
    case 'capacity_mode_unsupported':
      return said(UNAVAILABLE_WORDS);
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
