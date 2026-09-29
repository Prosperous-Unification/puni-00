import { changeMemberRole, type ClientReply, listMembers, removeMember } from '@wbs/contracts';
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

const members = browserClient([listMembers, changeMemberRole, removeMember]);

type Member = Extract<
  ClientReply<typeof listMembers>,
  { kind: 'success' }
>['body']['members'][number];
type Role = Member['role'];
type View =
  | { kind: 'loading' }
  | { kind: 'failure'; message: string }
  | { kind: 'ready'; members: readonly Member[] };

/**
 * The active organization's members, for an administrator: change a role or
 * remove a member. Only admin and super-admin may read the list; the server's
 * role matrix decides every change, and each change re-reads the list.
 */
export function MembersPanel({
  onAccessLost,
}: {
  onAccessLost: (loss: AccessLoss) => void;
}): React.JSX.Element {
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [chosen, setChosen] = useState<Readonly<Record<string, Role>>>({});
  const [removing, setRemoving] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [fault, setFault] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    const reply = await members.getApiOrganizationMembers({});
    switch (reply.kind) {
      case 'success':
        setView({ kind: 'ready', members: reply.body.members });
        setChosen({});
        return;
      case 'failure':
        setView({ kind: 'failure', message: failureMessage(reply.failure) });
        return;
      case 'refusal': {
        const outcome = memberRefusal(reply.body.error, 'view members');
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
      setFault(new Error('Unexpected member list failure', { cause }));
    });
  }, [refresh]);

  if (fault !== null) throw fault;

  async function change(
    send: () => Promise<ClientReply<typeof changeMemberRole | typeof removeMember>>,
    success: string,
  ) {
    setSending(true);
    setMessage('');
    try {
      const reply = await send();
      switch (reply.kind) {
        case 'success':
          setMessage(success);
          await refresh();
          return;
        case 'failure':
          setMessage(failureMessage(reply.failure));
          return;
        case 'refusal': {
          const outcome = memberRefusal(reply.body.error, 'make this change');
          if (outcome.kind === 'lost') {
            onAccessLost(outcome.loss);
            return;
          }
          setMessage(outcome.text);
          await refresh();
          return;
        }
        default:
          return unreachable(reply);
      }
    } catch (cause) {
      setFault(new Error('Unexpected member change failure', { cause }));
    } finally {
      setSending(false);
    }
  }

  return (
    <section aria-labelledby="members-heading" className="mb-8">
      <h2 id="members-heading" className="mb-2 text-xl font-semibold">
        Members
      </h2>
      {view.kind === 'loading' && <p>Loading members…</p>}
      {view.kind === 'failure' && <p role="alert">{view.message}</p>}
      {view.kind === 'ready' && view.members.length === 0 && <p>No members.</p>}
      {view.kind === 'ready' && view.members.length > 0 && (
        <ul aria-label="Members">
          {view.members.map((member) => {
            const role = chosen[member.userId] ?? member.role;
            return (
              <li key={member.userId} className="flex flex-wrap items-center gap-2">
                <span>{member.username}</span>
                <span>{member.email ?? 'No email address'}</span>
                <label htmlFor={`member-role-${member.userId}`}>Role for {member.username}</label>
                <select
                  id={`member-role-${member.userId}`}
                  className="border p-2"
                  value={role}
                  onChange={(event) => {
                    const next = roleOf(event.target.value);
                    setChosen((current) => ({ ...current, [member.userId]: next }));
                  }}
                >
                  <option value="viewer">Viewer</option>
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                  <option value="super_admin">Super-admin</option>
                </select>
                <button
                  type="button"
                  disabled={sending || role === member.role}
                  aria-label={`Change the role of ${member.username}`}
                  onClick={() => {
                    // Proof: 2026-09-29, sending the listed role instead of the
                    // chosen one failed `changes a role to the chosen one and
                    // re-reads the list`: expected { role: 'viewer' } to deeply equal { role: 'member' }.
                    void change(
                      () =>
                        members.patchApiOrganizationMembersByUserId({
                          params: { userId: member.userId },
                          body: { role },
                        }),
                      `${member.username} is now ${ROLE_NAMES[role]}.`,
                    );
                  }}
                >
                  Change role
                </button>
                {removing === member.userId ? (
                  <>
                    <button
                      type="button"
                      disabled={sending}
                      aria-label={`Confirm removing ${member.username}`}
                      onClick={() => {
                        setRemoving(null);
                        void change(
                          () =>
                            members.deleteApiOrganizationMembersByUserId({
                              params: { userId: member.userId },
                            }),
                          `${member.username} was removed.`,
                        );
                      }}
                    >
                      Confirm removal
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRemoving(null);
                      }}
                    >
                      Keep
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={sending}
                    aria-label={`Remove ${member.username}`}
                    onClick={() => {
                      // Proof: 2026-09-29, removing on the first click failed
                      // `removes only after confirmation`.
                      setRemoving(member.userId);
                    }}
                  >
                    Remove
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {message !== '' && <p role="status">{message}</p>}
    </section>
  );
}

const ROLE_NAMES: Record<Role, string> = {
  super_admin: 'Super-admin',
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
};

/** The select offers only the four membership roles; anything else is a programming error. */
function roleOf(value: string): Role {
  if (value === 'super_admin' || value === 'admin' || value === 'member' || value === 'viewer')
    return value;
  throw new Error(`Unexpected membership role option: ${value}`);
}

type MemberRefusalCode = Extract<
  ClientReply<typeof listMembers | typeof changeMemberRole | typeof removeMember>,
  { kind: 'refusal' }
>['body']['error'];

/**
 * Every modeled member refusal receives its own copy.
 *
 * Proof: 2026-09-29, answering `last_super_admin` with the role copy failed
 * `renders the last_super_admin change refusal`.
 */
function memberRefusal(error: MemberRefusalCode, action: string): RefusalOutcome {
  switch (error) {
    case 'onboarding_inactive':
    case 'unauthenticated':
    case 'no_active_organization':
    case 'not_a_member':
      return lostAccess(error);
    case 'forbidden':
      return said(`Your role cannot ${action}.`);
    case 'last_super_admin':
      return said('The organization needs at least one super-admin.');
    case 'not_found':
      return said('That person is no longer a member.');
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
