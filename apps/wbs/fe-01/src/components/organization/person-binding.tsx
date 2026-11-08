import { Button } from '@ui/saas-01';
import { type ClientReply, listMembers } from '@wbs/contracts';
import { type ReactNode, useCallback, useEffect, useState } from 'react';

import { failureMessage, unreachable } from '@/lib/http';
import type { PersonView } from '@/lib/wbs-api';
import { useResourceClient } from '@/runtime/organization-resources';

import { lostAccess, READ_ONLY, RELOAD } from './organization-access';
import { resourceStanding, useOrganizationRole } from './organization-role';

const MEMBERS_SHAPES = [listMembers] as const;

type Member = Extract<
  ClientReply<typeof listMembers>,
  { kind: 'success' }
>['body']['members'][number];

/**
 * The account binding drawn under one person on the Directory page
 * (`wbs-claim-display` 11.5): `bind` sends `patchPerson { accountId }`, null
 * to unbind, through the page's own directory write; `busy` is that write.
 */
export type BindingOf = (
  person: PersonView,
  bind: (accountId: string | null) => void,
  busy: boolean,
) => ReactNode;

/** The organization's members as the binding picker reads them. */
type MembersView =
  | { kind: 'loading' }
  | { kind: 'failure'; message: string; retry: () => void }
  | { kind: 'ready'; members: readonly Member[] };

/**
 * Who each person is bound to, and for an organization admin the control that
 * binds them (`wbs-team-claims` D5; be-01 refuses anyone else `forbidden`).
 *
 * - No organization: null, and the page draws no binding line.
 * - Role loading or withdrawn: nothing per row.
 * - Admin or super-admin: the members are read once, and each row offers them
 *   with `Not bound`.
 * - Member or viewer: the binding read-only, in words that need no member
 *   list (which only an admin may read): your account, another, or none.
 *
 * Proof: drawing the control for every role made `shows a member the binding
 * read-only` fail on `Unable to find an element with the text: Bound to your
 * account` (the admin's control drawn instead); watched 2026-10-27.
 */
export function usePersonBindings(userId: string): BindingOf | null {
  const role = useOrganizationRole(ignoreLoss);
  const isAdmin = role.kind === 'ready' && resourceStanding(role.role) === 'admin';
  const members = useMembers(isAdmin);
  switch (role.kind) {
    case 'legacy':
      return null;
    case 'loading':
    case 'withdrawn':
      return () => null;
    case 'failure':
      return function failedBindingOf(person) {
        return (
          <p role="alert" data-person-binding={person.id} className="text-destructive text-sm">
            Account binding: {role.message}
          </p>
        );
      };
    case 'ready':
      return function bindingOf(person, bind, busy) {
        if (person.accountId === undefined) {
          return (
            <p data-person-binding={person.id} className="text-muted-foreground text-sm">
              This server does not say which account {person.name} is bound to.
            </p>
          );
        }
        if (!isAdmin) {
          return (
            <p data-person-binding={person.id} className="text-muted-foreground text-sm">
              {readOnlyWords(person.accountId, userId)}
            </p>
          );
        }
        return (
          <PersonBinding
            person={person}
            boundTo={person.accountId}
            members={members}
            userId={userId}
            bind={bind}
            busy={busy}
          />
        );
      };
    default:
      return unreachable(role);
  }
}

/** What a member or viewer reads: they may not list the members to name the account. */
function readOnlyWords(accountId: string | null, userId: string): string {
  if (accountId === null) return 'Not bound to an account';
  return accountId === userId ? 'Bound to your account' : 'Bound to another account';
}

/** The binding as an admin reads it, naming the member it is bound to. */
function boundWords(accountId: string | null, members: readonly Member[], userId: string): string {
  if (accountId === null) return 'Not bound to an account';
  const member = members.find((each) => each.userId === accountId);
  if (member === undefined) return 'Bound to an account that is no longer a member';
  return `Bound to ${member.username}${member.userId === userId ? ' (you)' : ''}`;
}

/** The value the picker holds for `Not bound`: no member id is empty. */
const NOT_BOUND = '';

function PersonBinding({
  person,
  boundTo,
  members,
  userId,
  bind,
  busy,
}: {
  person: PersonView;
  boundTo: string | null;
  members: MembersView;
  userId: string;
  bind: (accountId: string | null) => void;
  busy: boolean;
}): React.JSX.Element {
  const [chosen, setChosen] = useState<string | null>(null);
  const shown = chosen ?? boundTo ?? NOT_BOUND;
  if (members.kind === 'loading') {
    return (
      <p data-person-binding={person.id} className="text-muted-foreground text-sm">
        Reading the members to bind {person.name} to…
      </p>
    );
  }
  if (members.kind === 'failure') {
    return (
      <div data-person-binding={person.id} className="flex flex-wrap items-center gap-2">
        <p role="alert" className="text-destructive text-sm">
          Account binding: {members.message}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={members.retry}>
          Retry members
        </Button>
      </div>
    );
  }
  const target = shown === NOT_BOUND ? null : shown;
  return (
    <div data-person-binding={person.id} className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">{boundWords(boundTo, members.members, userId)}</span>
      <label htmlFor={`binding-${person.id}`} className="sr-only">
        Account for {person.name}
      </label>
      <select
        id={`binding-${person.id}`}
        className="border-control-edge bg-background h-11 rounded-md border px-2"
        value={shown}
        disabled={busy}
        onChange={(event) => {
          setChosen(event.target.value);
        }}
      >
        <option value={NOT_BOUND}>Not bound</option>
        {members.members.map((member) => (
          <option key={member.userId} value={member.userId}>
            {member.username}
            {member.userId === userId ? ' (you)' : ''}
          </option>
        ))}
      </select>
      <Button
        type="button"
        variant="outline"
        className="h-11"
        // Proof: enabling this whatever is chosen made `offers Bind only once
        // another account is chosen` fail on `expected <button …(2)></button>
        // to have property "disabled" with value true`; watched 2026-10-27.
        disabled={busy || target === boundTo}
        onClick={() => {
          bind(target);
          setChosen(null);
        }}
      >
        {target === null && boundTo !== null ? `Unbind ${person.name}` : `Bind ${person.name}`}
      </Button>
    </div>
  );
}

/** Reads the members once while `isAdmin`; a member or viewer reads nothing. */
function useMembers(isAdmin: boolean): MembersView {
  const client = useResourceClient(MEMBERS_SHAPES);
  const [view, setView] = useState<MembersView>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [fault, setFault] = useState<Error | null>(null);
  const retry = useCallback(() => {
    setAttempt((count) => count + 1);
  }, []);
  useEffect(() => {
    if (!isAdmin) return;
    let isLive = true;
    setView({ kind: 'loading' });
    void client
      .getApiOrganizationMembers({})
      .then((reply) => {
        if (!isLive) return;
        switch (reply.kind) {
          case 'success':
            setView({ kind: 'ready', members: reply.body.members });
            return;
          case 'failure':
            setView({ kind: 'failure', message: failureMessage(reply.failure), retry });
            return;
          case 'refusal':
            setView({ kind: 'failure', message: membersRefusalWords(reply.body), retry });
            return;
          default:
            return unreachable(reply);
        }
      })
      .catch((cause: unknown) => {
        if (isLive) setFault(new Error('Unexpected member list failure', { cause }));
      });
    return () => {
      isLive = false;
    };
  }, [client, isAdmin, attempt, retry]);
  if (fault !== null) throw fault;
  return view;
}

type MembersRefusal = Extract<ClientReply<typeof listMembers>, { kind: 'refusal' }>['body'];

/**
 * A refused members read in words. A lost organization is the page's to
 * draw (the role read reports it); here it only says the list is unavailable.
 */
function membersRefusalWords(refusal: MembersRefusal): string {
  switch (refusal.error) {
    case 'forbidden':
      return 'Your role cannot read the members, so no account can be chosen.';
    case 'insufficient_scope':
      return READ_ONLY;
    case 'invalid_query':
    case 'invalid_body':
      return RELOAD;
    case 'onboarding_inactive':
    case 'unauthenticated':
    case 'organization_context_changed':
    case 'no_active_organization':
    case 'not_a_member':
      return lostWords(lostAccess(refusal.error));
    case 'sso_required':
    case 'reauthentication_required':
      return lostWords(lostAccess(refusal));
    default:
      return unreachable(refusal);
  }
}

function lostWords(outcome: ReturnType<typeof lostAccess>): string {
  return outcome.kind === 'message'
    ? outcome.text
    : 'You no longer have access to this organization’s members.';
}

/** See `usePeopleCredentials`: the runtime scope, not the page, owns a loss. */
function ignoreLoss(): void {
  return undefined;
}
