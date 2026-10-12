import {
  type ClientReply,
  createInvitation,
  listInvitations,
  revokeInvitation,
} from '@wbs/contracts';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  FIELD_CLASS,
  FIELD_LABEL_CLASS,
  FORM_CLASS,
  LIST_CLASS,
  OrganizationSection,
  ROW_CLASS,
  SELECT_CLASS,
  STATUS_CLASS,
} from './organization-section';

const invitations = browserClient([listInvitations, createInvitation, revokeInvitation]);

type Invitation = Extract<
  ClientReply<typeof listInvitations>,
  { kind: 'success' }
>['body']['invitations'][number];
type Role = Invitation['role'];
type View =
  | { kind: 'loading' }
  | { kind: 'failure'; message: string }
  | { kind: 'ready'; invitations: readonly Invitation[]; readAt: number };

/**
 * The active organization's invitations: list, send and revoke. Every change
 * re-reads the list, so a row shows the server's state rather than a guess.
 * The server's role matrix decides who may see or send; a refusal is rendered
 * in place, and a lost organization is handed to the page.
 */
export function InvitationsPanel({
  onAccessLost,
}: {
  onAccessLost: (loss: AccessLoss) => void;
}): React.JSX.Element {
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [fault, setFault] = useState<Error | null>(null);

  const settle = useCallback(
    (outcome: RefusalOutcome, place: (text: string) => void) => {
      if (outcome.kind === 'lost') onAccessLost(outcome.loss);
      else place(outcome.text);
    },
    [onAccessLost],
  );

  const refresh = useCallback(async () => {
    const reply = await invitations.getApiOrganizationInvitations({});
    switch (reply.kind) {
      case 'success':
        setView({ kind: 'ready', invitations: reply.body.invitations, readAt: Date.now() });
        return;
      case 'failure':
        setView({ kind: 'failure', message: failureMessage(reply.failure) });
        return;
      case 'refusal':
        settle(listRefusal(reply.body), (text) => {
          setView({ kind: 'failure', message: text });
        });
        return;
      default:
        return unreachable(reply);
    }
  }, [settle]);

  useEffect(() => {
    void refresh().catch((cause: unknown) => {
      setFault(new Error('Unexpected invitation list failure', { cause }));
    });
  }, [refresh]);

  if (fault !== null) throw fault;

  async function send(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setMessage('');
    try {
      const reply = await invitations.postApiOrganizationInvitations({
        body: { email: email.trim(), role },
      });
      switch (reply.kind) {
        case 'success':
          setEmail('');
          setMessage(`Invitation sent to ${reply.body.invitation.email}.`);
          await refresh();
          return;
        case 'failure':
          setMessage(failureMessage(reply.failure));
          return;
        case 'refusal':
          settle(sendRefusal(reply.body), setMessage);
          return;
        default:
          return unreachable(reply);
      }
    } catch (cause) {
      setFault(new Error('Unexpected invitation failure', { cause }));
    } finally {
      setSending(false);
    }
  }

  async function revoke(id: string) {
    setSending(true);
    setMessage('');
    try {
      const reply = await invitations.deleteApiOrganizationInvitationsById({ params: { id } });
      switch (reply.kind) {
        case 'success':
          await refresh();
          return;
        case 'failure':
          setMessage(failureMessage(reply.failure));
          return;
        case 'refusal': {
          const outcome = revokeRefusal(reply.body);
          settle(outcome, setMessage);
          if (outcome.kind === 'message') await refresh();
          return;
        }
        default:
          return unreachable(reply);
      }
    } catch (cause) {
      setFault(new Error('Unexpected invitation failure', { cause }));
    } finally {
      setSending(false);
    }
  }

  return (
    <OrganizationSection id="invitations-heading" title="Invitations">
      {view.kind === 'loading' && <p className={STATUS_CLASS}>Loading invitations…</p>}
      {view.kind === 'failure' && (
        <p role="alert" className={ALERT_CLASS}>
          {view.message}
        </p>
      )}
      {view.kind === 'ready' && (
        <>
          <form onSubmit={(event) => void send(event)} className={FORM_CLASS}>
            <span className={`${FIELD_CLASS} sm:flex-1`}>
              <label htmlFor="invitation-email" className={FIELD_LABEL_CLASS}>
                Email address
              </label>
              <Input
                id="invitation-email"
                className={CONTROL_HEIGHT}
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
                required
                maxLength={254}
              />
            </span>
            <span className={FIELD_CLASS}>
              <label htmlFor="invitation-role" className={FIELD_LABEL_CLASS}>
                Role
              </label>
              <select
                id="invitation-role"
                className={SELECT_CLASS}
                value={role}
                onChange={(event) => {
                  setRole(roleOf(event.target.value));
                }}
              >
                <option value="viewer">Viewer</option>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </span>
            <Button type="submit" className={CONTROL_HEIGHT} disabled={sending}>
              Send invitation
            </Button>
          </form>
          {view.invitations.length === 0 ? (
            <p className="text-muted-foreground text-sm">No invitations yet.</p>
          ) : (
            <ul className={`${LIST_CLASS} border-border divide-border divide-y border-t`}>
              {view.invitations.map((invitation) => {
                const standing = standingOf(invitation, view.readAt);
                return (
                  <li key={invitation.id} className={ROW_CLASS}>
                    <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-medium [overflow-wrap:anywhere]">
                        {invitation.email}
                      </span>
                      <span className="text-muted-foreground text-sm">
                        {ROLE_NAMES[invitation.role]}
                      </span>
                      <span className="text-muted-foreground text-sm">
                        {STANDING_NAMES[standing]}
                      </span>
                    </span>
                    {standing === 'pending' && (
                      <Button
                        type="button"
                        variant="outline"
                        className={`self-start sm:self-auto ${CONTROL_HEIGHT}`}
                        disabled={sending}
                        aria-label={`Revoke the invitation for ${invitation.email}`}
                        onClick={() => {
                          void revoke(invitation.id);
                        }}
                      >
                        Revoke
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
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

type Standing = 'pending' | 'accepted' | 'revoked' | 'expired';

/**
 * An offer's standing when the list was read. Accepted and revoked outrank
 * expiry: they are what happened to the offer.
 */
function standingOf(invitation: Invitation, now: number): Standing {
  if (invitation.consumedAt !== null) return 'accepted';
  if (invitation.revokedAt !== null) return 'revoked';
  if (invitation.expiresAt <= now) return 'expired';
  return 'pending';
}

const STANDING_NAMES: Record<Standing, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  revoked: 'Revoked',
  expired: 'Expired',
};
const ROLE_NAMES: Record<Role, string> = { admin: 'Admin', member: 'Member', viewer: 'Viewer' };

/** The select offers only the three invitation roles; anything else is a programming error. */
function roleOf(value: string): Role {
  if (value === 'admin' || value === 'member' || value === 'viewer') return value;
  throw new Error(`Unexpected invitation role option: ${value}`);
}

type RefusalBody<
  Shape extends typeof listInvitations | typeof createInvitation | typeof revokeInvitation,
> = Extract<ClientReply<Shape>, { kind: 'refusal' }>['body'];

function listRefusal(refusal: RefusalBody<typeof listInvitations>): RefusalOutcome {
  switch (refusal.error) {
    case 'onboarding_inactive':
    case 'unauthenticated':
    case 'no_active_organization':
    case 'not_a_member':
      return lostAccess(refusal.error);
    case 'sso_required':
    case 'reauthentication_required':
      return lostAccess(refusal);
    case 'forbidden':
      return said('Your role cannot view invitations.');
    case 'insufficient_scope':
      return said(READ_ONLY);
    case 'invalid_query':
    case 'invalid_body':
    case 'invalid_json':
    case 'invalid_params':
    case 'invalid_origin':
      return said(RELOAD);
    default:
      return unreachable(refusal);
  }
}

function sendRefusal(refusal: RefusalBody<typeof createInvitation>): RefusalOutcome {
  switch (refusal.error) {
    case 'onboarding_inactive':
    case 'unauthenticated':
    case 'no_active_organization':
    case 'not_a_member':
      return lostAccess(refusal.error);
    case 'sso_required':
    case 'reauthentication_required':
      return lostAccess(refusal);
    case 'forbidden':
      return said('Your role cannot send this invitation.');
    case 'delivery_failed':
      return said('The invitation email could not be sent, so the invitation was withdrawn.');
    case 'invalid_body':
      return said('Enter a valid email address.');
    case 'insufficient_scope':
      return said(READ_ONLY);
    case 'invalid_query':
    case 'invalid_json':
    case 'invalid_params':
    case 'invalid_origin':
      return said(RELOAD);
    default:
      return unreachable(refusal);
  }
}

function revokeRefusal(refusal: RefusalBody<typeof revokeInvitation>): RefusalOutcome {
  switch (refusal.error) {
    case 'onboarding_inactive':
    case 'unauthenticated':
    case 'no_active_organization':
    case 'not_a_member':
      return lostAccess(refusal.error);
    case 'sso_required':
    case 'reauthentication_required':
      return lostAccess(refusal);
    case 'forbidden':
      return said('Your role cannot revoke this invitation.');
    case 'not_found':
      return said('That invitation no longer exists.');
    case 'invitation_invalid':
      return said('That invitation was already accepted, revoked or expired.');
    case 'insufficient_scope':
      return said(READ_ONLY);
    case 'invalid_query':
    case 'invalid_body':
    case 'invalid_json':
    case 'invalid_params':
    case 'invalid_origin':
      return said(RELOAD);
    default:
      return unreachable(refusal);
  }
}
