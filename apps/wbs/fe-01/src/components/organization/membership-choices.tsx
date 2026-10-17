import { type ClientReply, listOrganizationMemberships } from '@wbs/contracts';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { browserClient, failureMessage, unreachable } from '@/lib/http';
import { cn } from '@/lib/utils';

import { ROLE_NAMES } from './members-panel';

const choices = browserClient([listOrganizationMemberships]);

type Membership = Extract<
  ClientReply<typeof listOrganizationMemberships>,
  { kind: 'success' }
>['body']['memberships'][number];
type View =
  | { kind: 'loading' }
  | { kind: 'failure'; message: string }
  | { kind: 'ready'; memberships: readonly Membership[] };

/**
 * The signed-in account's current organizations, from
 * `GET /api/organization/memberships`. An organization whose enforced SSO this
 * sign-in cannot enter (`ssoRequired`) is shown locked with the company sign-in
 * hint, never as an entry to choose. A failed read is a failure state, never
 * an empty list.
 */
export function MembershipChoices({
  onChoose,
  disabled = false,
}: {
  onChoose?: (organizationId: string) => void;
  disabled?: boolean;
}): React.JSX.Element {
  // Proof: selecting the sole discovered membership failed `requires an explicit choice even for a sole membership` (c2-fault-sole).
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [fault, setFault] = useState<Error | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void readChoices(controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setView(next);
      })
      .catch((cause: unknown) => {
        setFault(new Error('Unexpected membership list failure', { cause }));
      });
    return () => {
      controller.abort();
    };
  }, []);

  if (fault !== null) throw fault;
  if (view.kind === 'loading') return <p>Loading your organizations…</p>;
  if (view.kind === 'failure') return <p role="alert">{view.message}</p>;
  if (view.memberships.length === 0) return <p>You have no organization memberships yet.</p>;
  return (
    <ul aria-label="Your organizations" className="m-0 flex list-none flex-col gap-2 p-0">
      {view.memberships.map((membership) => (
        <MembershipEntry
          key={membership.organizationId}
          membership={membership}
          onChoose={onChoose}
          disabled={disabled}
        />
      ))}
    </ul>
  );
}

function MembershipEntry({
  membership,
  onChoose,
  disabled,
}: {
  membership: Membership;
  onChoose?: (organizationId: string) => void;
  disabled: boolean;
}): React.JSX.Element {
  const locked = membership.ssoRequired;
  // Proof: 2026-10-12, ignoring `ssoRequired` here failed `shows an
  // SSO-enforced organization locked, with the company sign-in hint`.
  return (
    <li className={cn('border-border rounded-md border px-4 py-3', locked && 'bg-muted')}>
      <div className="flex items-baseline justify-between gap-4">
        <span className={cn('font-medium', locked && 'text-muted-foreground')}>
          {membership.name}
        </span>
        <span className="text-muted-foreground text-sm">
          {locked ? 'Locked' : ROLE_NAMES[membership.role]}
        </span>
      </div>
      {!locked && onChoose !== undefined && (
        <Button
          variant="outline"
          size="sm"
          type="button"
          disabled={disabled}
          onClick={() => {
            onChoose(membership.organizationId);
          }}
        >
          Choose {membership.name}
        </Button>
      )}
      {locked && (
        <p className="text-muted-foreground mt-1 text-sm">
          Requires its company sign-in. Sign out, then sign in with your company.
        </p>
      )}
    </li>
  );
}

async function readChoices(signal: AbortSignal): Promise<View> {
  const reply = await choices.getApiOrganizationMemberships({ signal });
  switch (reply.kind) {
    case 'success':
      return { kind: 'ready', memberships: reply.body.memberships };
    case 'failure':
      return { kind: 'failure', message: failureMessage(reply.failure) };
    // Proof: 2026-10-12, answering a refusal with an empty `ready` view failed
    // `renders a failed membership read as a failure, not an empty list`: no alert.
    case 'refusal':
      return { kind: 'failure', message: refusalWords(reply.body.error) };
    default:
      return unreachable(reply);
  }
}

function refusalWords(
  error: Extract<
    ClientReply<typeof listOrganizationMemberships>,
    { kind: 'refusal' }
  >['body']['error'],
): string {
  switch (error) {
    case 'unauthenticated':
      return 'Your session ended. Sign in again.';
    case 'onboarding_inactive':
      return 'Organization selection is not active yet.';
    case 'insufficient_scope':
      return 'This sign-in cannot list your organizations. Sign in to WBS again.';
    case 'invalid_body':
    case 'invalid_query':
      return 'Could not list your organizations. Reload and try again.';
    default:
      return unreachable(error);
  }
}
