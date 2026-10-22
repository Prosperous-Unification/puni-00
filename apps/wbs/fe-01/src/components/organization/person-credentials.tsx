import { Button } from '@ui/saas-01';
import { type ReactNode, useState } from 'react';

import { unreachable } from '@/lib/http';

import { MachineCredentialsPanel } from './machine-credentials-panel';
import { type CredentialReach, credentialReach, useOrganizationRole } from './organization-role';

/** The person row the people page hands over: its id, name, kind and bound account. */
export interface CredentialPerson {
  readonly id: string;
  readonly name: string;
  readonly kind: 'person' | 'agent';
  readonly accountId?: string | null;
}

/**
 * Whether `viewer` reaches the credentials of `person` (A7): an agent person
 * for an admin, an agent bound to the viewer's own account for a member,
 * nothing for a viewer or a human person.
 */
export function reachesCredentialsOf(
  person: CredentialPerson,
  viewer: { readonly userId: string; readonly reach: CredentialReach },
): boolean {
  if (person.kind !== 'agent') return false;
  switch (viewer.reach) {
    case 'all':
      return true;
    case 'own':
      return person.accountId === viewer.userId;
    case 'none':
      return false;
  }
}

/**
 * An agent person's credentials on the people page, collapsed behind a
 * toggle so the page sends no credentials request until it is opened. A
 * person the viewer does not reach renders nothing and sends nothing. A
 * page-level loss withdraws the whole runtime through its scope, so this
 * only stops drawing the list.
 */
export function PersonCredentials({
  person,
  viewer,
}: {
  person: CredentialPerson;
  viewer: { readonly userId: string; readonly reach: CredentialReach };
}): React.JSX.Element | null {
  const [isOpen, setIsOpen] = useState(false);
  const [isWithdrawn, setIsWithdrawn] = useState(false);
  // Proof: 2026-10-22, returning the toggle for every agent failed `offers a
  // member no list for another account's agent`: the stranger's toggle rendered.
  if (!reachesCredentialsOf(person, viewer) || viewer.reach === 'none' || isWithdrawn) return null;
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="link"
        size="sm"
        className="self-start px-0"
        aria-expanded={isOpen}
        onClick={() => {
          setIsOpen((open) => !open);
        }}
      >
        {isOpen ? `Hide credentials of ${person.name}` : `Show credentials of ${person.name}`}
      </Button>
      {isOpen && (
        <MachineCredentialsPanel
          viewer={{ userId: viewer.userId, reach: viewer.reach }}
          person={{ id: person.id, name: person.name }}
          onAccessLost={() => {
            setIsWithdrawn(true);
          }}
        />
      )}
    </div>
  );
}

/**
 * The people page's credentials surface for `userId`: a function drawing each
 * row's {@link PersonCredentials}, or null in a deployment without
 * organizations. The role is read once for the page; until it is known an
 * agent row draws nothing, and a failed read says so on each agent row with a
 * retry. A page-level loss needs no handling here: the organization runtime's
 * scope withdraws the whole region on those refusals.
 */
export function usePeopleCredentials(
  userId: string,
): ((person: CredentialPerson) => ReactNode) | null {
  const role = useOrganizationRole(ignoreLoss);
  switch (role.kind) {
    case 'legacy':
      return null;
    case 'loading':
    case 'withdrawn':
      return () => null;
    case 'failure': {
      const { message, retry } = role;
      return function failedCredentialsOf(person: CredentialPerson): ReactNode {
        if (person.kind !== 'agent') return null;
        return (
          <div className="flex flex-wrap items-center gap-2">
            <p role="alert" className="text-destructive text-sm">
              Credentials: {message}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={retry}>
              Retry credentials
            </Button>
          </div>
        );
      };
    }
    case 'ready': {
      const viewer = { userId, reach: credentialReach(role.role) };
      return function credentialsOf(person: CredentialPerson): ReactNode {
        return <PersonCredentials person={person} viewer={viewer} />;
      };
    }
    default:
      return unreachable(role);
  }
}

/** See {@link usePeopleCredentials}: the runtime scope, not the page, owns a loss. */
function ignoreLoss(): void {
  return undefined;
}
