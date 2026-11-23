import { Button, CONTROL_HEIGHT, FIELD_LABEL_CLASS, FORM_CLASS, SELECT_CLASS } from '@ui/saas-01';
import {
  addSpacePerson,
  addSpaceTeam,
  type ClientReply,
  listPeople,
  listTeams,
  type readSpace,
  removeSpacePerson,
  removeSpaceTeam,
} from '@wbs/contracts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { type AccessLoss, lostAccess } from '@/components/organization/organization-access';
import { OrganizationSection } from '@/components/organization/organization-section';
import { browserClient, failureMessage, unreachable } from '@/lib/http';
import { useResourceScope } from '@/runtime/organization-resources';

import { spaceRefusal } from './space-access';
import {
  ALERT_CLASS,
  FIELD_CLASS,
  LIST_CLASS,
  NOTE_CLASS,
  ROW_CLASS,
  STATUS_CLASS,
} from './space-chrome';

const SHAPES = [
  listPeople,
  listTeams,
  addSpacePerson,
  removeSpacePerson,
  addSpaceTeam,
  removeSpaceTeam,
] as const;
type SpaceRead = Extract<ClientReply<typeof readSpace>, { kind: 'success' }>['body'];
type MembershipKind = 'people' | 'teams';
interface Member {
  readonly id: string;
  readonly name: string;
}
type Directory =
  | { kind: 'loading' }
  | { kind: 'failure'; message: string }
  | { kind: 'ready'; members: readonly Member[] };
interface Props {
  readonly read: SpaceRead;
  readonly kind: MembershipKind;
  readonly onChanged: () => Promise<void>;
  readonly onAccessLost: (loss: AccessLoss) => void;
}

/** Named-space belonging uses current directory labels, without granting access or scheduling capacity. */
export function SpaceMembers(props: Props): React.JSX.Element {
  const scope = useResourceScope();
  const owner = scope.organization.kind === 'active' ? scope.organization.organizationId : 'legacy';
  return <Membership key={JSON.stringify([owner, props.read.space.id, props.kind])} {...props} />;
}

/** Each editor and directory observation retire before their late replies can withdraw a newer owner. */
function Membership({ read, kind, onChanged, onAccessLost }: Props): React.JSX.Element {
  const scope = useResourceScope();
  const live = useRef(false);
  const pending = useRef(false);
  const focusAfterWrite = useRef(false);
  const refreshButton = useRef<HTMLButtonElement>(null);
  const [directory, setDirectory] = useState<Directory>({ kind: 'loading' });
  const [chosen, setChosen] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [fault, setFault] = useState<Error | null>(null);
  const isCurrent = useCallback(() => live.current && scope.isCurrent(), [scope]);
  const client = useMemo(
    () =>
      browserClient(SHAPES, {
        ...scope,
        // Proof: removing editor fencing let a held old-space refusal withdraw its successor (space-member-ui-fault-write-owner-v1).
        isCurrent,
      }),
    [scope, isCurrent],
  );
  const title = kind === 'people' ? 'People in this space' : 'Teams in this space';
  const noun = kind === 'people' ? 'person' : 'team';
  const ids = kind === 'people' ? read.personIds : read.serviceTeamIds;

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  useEffect(() => {
    let current = true;
    const reader = browserClient(SHAPES, {
      ...scope,
      // Proof: omitting the read epoch withdrew a newer directory observation (space-member-ui-fault-directory-owner-v1).
      isCurrent: () => current && live.current && scope.isCurrent(),
    });
    setDirectory({ kind: 'loading' });
    setChosen('');
    async function readDirectory(): Promise<void> {
      const reply =
        kind === 'people' ? await reader.getApiPeople({}) : await reader.getApiTeams({});
      if (!current || !live.current) return;
      switch (reply.kind) {
        case 'success': {
          const members = 'people' in reply.body ? reply.body.people : reply.body.teams;
          // Proof: omitting uniqueness displayed the repeated identity instead of the protocol boundary (space-member-ui-fault-directory-identity-v1).
          if (new Set(members.map((member) => member.id)).size !== members.length)
            throw new Error('Space membership directory repeated an identity');
          setDirectory({ kind: 'ready', members });
          return;
        }
        case 'failure':
          if (reply.failure.code !== 'cancelled')
            setDirectory({ kind: 'failure', message: failureMessage(reply.failure) });
          return;
        case 'refusal': {
          const outcome = spaceRefusal(reply.body);
          if (outcome.kind !== 'message') {
            withdrawSpace(reply.body, onAccessLost);
            return;
          }
          setDirectory({ kind: 'failure', message: outcome.text });
          return;
        }
        default:
          return unreachable(reply);
      }
    }
    void readDirectory().catch((cause: unknown) => {
      if (current && live.current)
        setFault(new Error('Unexpected membership directory failure', { cause }));
    });
    return () => {
      current = false;
    };
  }, [kind, read, scope, onAccessLost]);

  useEffect(() => {
    if (sending || !focusAfterWrite.current) return;
    focusAfterWrite.current = false;
    refreshButton.current?.focus();
  }, [sending]);

  /** Writes only a currently offered identity, then rereads membership rather than predicting its revision. */
  async function changeMembership(member: Member, adding: boolean): Promise<void> {
    if (
      // Proof: omitting synchronous admission sent both same-turn submissions (space-member-ui-fault-write-admission-v1).
      pending.current ||
      !isCurrent() ||
      !read.writable ||
      read.space.virtual ||
      scope.organization.kind !== 'active'
    )
      return;
    if (
      directory.kind !== 'ready' ||
      ids.some((id) => !directory.members.some((entry) => entry.id === id))
    )
      return;
    const attached = ids.includes(member.id);
    if (attached === adding || !directory.members.some((entry) => entry.id === member.id)) return;
    pending.current = true;
    setSending(true);
    setMessage('');
    try {
      const params = { id: read.space.id };
      const reply =
        kind === 'people'
          ? adding
            ? await client.postApiSpacesByIdPeopleByPersonId({
                params: { ...params, personId: member.id },
              })
            : await client.deleteApiSpacesByIdPeopleByPersonId({
                params: { ...params, personId: member.id },
              })
          : adding
            ? await client.postApiSpacesByIdTeamsByTeamId({
                params: { ...params, teamId: member.id },
              })
            : await client.deleteApiSpacesByIdTeamsByTeamId({
                params: { ...params, teamId: member.id },
              });
      if (!isCurrent()) return;
      switch (reply.kind) {
        case 'success':
          setMessage(
            `${adding ? 'Added' : 'Removed'} ${member.name}${adding ? ' to' : ' from'} this space.`,
          );
          break;
        case 'failure':
          if (reply.failure.code === 'cancelled') return;
          setMessage(failureMessage(reply.failure));
          break;
        case 'refusal': {
          const outcome = spaceRefusal(reply.body);
          if (outcome.kind !== 'message') {
            withdrawSpace(reply.body, onAccessLost);
            return;
          }
          setMessage(
            reply.body.error === 'not_found'
              ? `That space or ${noun} no longer exists.`
              : outcome.text,
          );
          break;
        }
        default:
          return unreachable(reply);
      }
      await onChanged();
      if (isCurrent()) focusAfterWrite.current = true;
    } catch (cause: unknown) {
      if (isCurrent()) setFault(new Error('Unexpected space membership write failure', { cause }));
    } finally {
      pending.current = false;
      if (isCurrent()) setSending(false);
    }
  }

  if (fault !== null) throw fault;
  // Proof: omitting this state reached a missing-label fault instead of withholding stale membership (space-member-ui-fault-changed-members-v1).
  const changed =
    directory.kind === 'ready' &&
    ids.some((id) => !directory.members.some((member) => member.id === id));
  const candidates =
    directory.kind === 'ready'
      ? directory.members.filter((member) => !ids.includes(member.id))
      : [];
  return (
    <OrganizationSection id={`space-${kind}-heading`} title={title}>
      <div>
        <Button
          ref={refreshButton}
          type="button"
          variant="outline"
          className={CONTROL_HEIGHT}
          disabled={sending}
          onClick={() => {
            void onChanged().catch((cause: unknown) => {
              if (isCurrent())
                setFault(new Error('Unexpected membership refresh failure', { cause }));
            });
          }}
        >
          Refresh {kind}
        </Button>
      </div>
      {directory.kind === 'loading' && (
        <p role="status" className={STATUS_CLASS}>
          Loading {kind}…
        </p>
      )}
      {directory.kind === 'failure' && (
        <p role="alert" className={ALERT_CLASS}>
          {directory.message}
        </p>
      )}
      {changed && (
        <p role="status" className={STATUS_CLASS}>
          {title} changed while loading. Refresh to update membership.
        </p>
      )}
      {directory.kind === 'ready' && !changed && (
        <>
          {ids.length === 0 ? (
            <p className={NOTE_CLASS}>No {kind} in this space.</p>
          ) : (
            <ul aria-label={title} className={LIST_CLASS}>
              {ids.map((id) => {
                const member = directory.members.find((entry) => entry.id === id);
                if (member === undefined)
                  throw new Error('Membership lost its validated directory label');
                return (
                  <li key={id} className={ROW_CLASS}>
                    <span className="min-w-0 text-sm [overflow-wrap:anywhere]">{member.name}</span>
                    {/* Proof: omitting the render guards exposed viewer mutations (space-member-ui-fault-viewer-controls-v1). */}
                    {read.writable && (
                      <Button
                        type="button"
                        variant="outline"
                        className={`text-destructive hover:text-destructive ${CONTROL_HEIGHT}`}
                        disabled={sending}
                        aria-label={`Remove ${noun} ${member.name} from this space`}
                        onClick={() => {
                          void changeMembership(member, false);
                        }}
                      >
                        Remove
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {read.writable && candidates.length > 0 && (
            <form
              aria-label={`Add a ${noun} to this space`}
              className={FORM_CLASS}
              onSubmit={(event) => {
                event.preventDefault();
                const member = candidates.find((entry) => entry.id === chosen);
                if (member !== undefined) void changeMembership(member, true);
              }}
            >
              <span className={FIELD_CLASS}>
                <label htmlFor={`space-add-${noun}`} className={FIELD_LABEL_CLASS}>
                  Add a {noun}
                </label>
                <select
                  id={`space-add-${noun}`}
                  className={`${SELECT_CLASS} w-full min-w-0`}
                  value={chosen}
                  disabled={sending}
                  onChange={(event) => {
                    setChosen(event.target.value);
                  }}
                >
                  <option value="">Choose a {noun}</option>
                  {candidates.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </span>
              <Button type="submit" className={CONTROL_HEIGHT} disabled={sending || chosen === ''}>
                Add
              </Button>
            </form>
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

/** Maps validated membership access loss to the containing space page. */
function withdrawSpace(
  refusal: Extract<ClientReply<typeof addSpacePerson>, { kind: 'refusal' }>['body'],
  onAccessLost: Props['onAccessLost'],
): void {
  switch (refusal.error) {
    case 'unauthenticated':
    case 'organization_context_changed':
    case 'no_active_organization':
    case 'not_a_member': {
      const outcome = lostAccess(refusal.error);
      if (outcome.kind !== 'lost')
        throw new Error('Organization loss retained membership controls');
      onAccessLost(outcome.loss);
      return;
    }
    case 'sso_required':
    case 'reauthentication_required':
      onAccessLost(refusal);
      return;
    case 'organization_required':
      onAccessLost('no_organization');
      return;
    default:
      throw new Error('Unexpected membership withdrawal refusal');
  }
}
