import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { LifetimeFault } from '@/components/chrome/lifetime-fault';
import { InvitationAcceptance } from '@/components/onboarding/invitation-acceptance';
import { useFeatureReachable } from '@/lib/session-features';
import { useRetirementJoin } from '@/runtime/application-services-context';
import { createOrganizationOwner, type OrganizationRoutes } from '@/runtime/organization-owner';
import {
  type SessionIdentity,
  type SessionOwner,
  type SessionRuntime,
} from '@/runtime/session-runtime';

import { CredentialRefusalState } from './credential-refusal-state';
import { MembershipChoices } from './membership-choices';

export interface OrganizationNotices {
  readonly announce: () => void;
  readonly close: () => void;
}

/** Same-origin notices carry invalidation alone; discovery remains authoritative. */
export function browserOrganizationNotices(
  invalidate: (message: unknown) => void,
): OrganizationNotices {
  const channel = new BroadcastChannel('wbs-organization-context');
  channel.onmessage = (event: MessageEvent<unknown>) => {
    invalidate(event.data);
  };
  return {
    announce: () => {
      channel.postMessage('changed');
    },
    close: () => {
      channel.close();
    },
  };
}

/**
 * Owns the complete signed-in resource region through explicit organization transitions.
 * Invitation acceptance refreshes membership choices without changing the active context.
 */
export function OrganizationGate({
  identity,
  mode,
  openOwner,
  onOwner,
  onSignOut,
  renderRuntime,
  routes,
  notices = browserOrganizationNotices,
}: {
  identity: Pick<SessionIdentity, 'userId' | 'credential'>;
  mode: 'legacy' | 'activated';
  openOwner: () => SessionOwner;
  onOwner: (owner: SessionOwner) => void;
  onSignOut: (owner: SessionOwner) => void;
  renderRuntime: (runtime: SessionRuntime, switcher: ReactNode, signOut: () => void) => ReactNode;
  routes?: OrganizationRoutes;
  notices?: (invalidate: (message: unknown) => void) => OrganizationNotices;
}): React.JSX.Element {
  const reachable = useFeatureReachable('organizations');
  const [sessions] = useState(openOwner);
  const channel = useRef<OrganizationNotices | null>(null);
  const [owner] = useState(() =>
    createOrganizationOwner({
      identity,
      sessions,
      routes,
      announce: () => {
        if (channel.current === null) throw new Error('organization notice channel is absent');
        channel.current.announce();
      },
    }),
  );
  const state = useSyncExternalStore(owner.subscribe, owner.snapshot);
  const join = useRetirementJoin();
  const [fault, setFault] = useState<Error | null>(null);
  const [membershipsRevision, setMembershipsRevision] = useState(0);
  const observe = (operation: Promise<unknown>) => {
    void operation.catch((cause: unknown) => {
      setFault(new Error('Unexpected organization transition failure', { cause }));
    });
  };
  useEffect(() => {
    onOwner(sessions);
  }, [onOwner, sessions]);
  useEffect(() => {
    observe(mode === 'legacy' ? owner.legacy() : owner.refresh());
    return () => {
      // Proof: removing retirement rejection failed `fails application retirement when the organization runtime cannot retire` (c2-fault-join).
      const before = sessions.snapshot();
      const failedBefore = before.status === 'fatal' && before.terminal;
      join(
        owner.leave().then(() => {
          const after = sessions.snapshot();
          if (!failedBefore && after.status === 'fatal' && after.terminal)
            throw new Error('Organization runtime retirement failed');
        }),
      );
    };
  }, [owner, mode, join, sessions]);
  useEffect(() => {
    if (mode === 'legacy') return;
    const invalidate = (message: unknown) => {
      observe(owner.notice(message));
    };
    const opened = notices(invalidate);
    channel.current = opened;
    const focus = () => {
      invalidate('focus');
    };
    const pageshow = (event: PageTransitionEvent) => {
      // Proof: ignoring restored pages failed `persisted pageshow withdraws resources before discovery settles` (c2-fault-restore).
      if (event.persisted) invalidate('pageshow');
    };
    // Proof: dropping this listener failed `focus withdraws resources before discovery settles` (c2-fault-focus).
    window.addEventListener('focus', focus);
    window.addEventListener('pageshow', pageshow);
    return () => {
      window.removeEventListener('focus', focus);
      window.removeEventListener('pageshow', pageshow);
      channel.current = null;
      opened.close();
    };
  }, [owner, mode, notices]);
  const signOut = () => {
    observe(owner.leave());
    onSignOut(sessions);
  };
  if (fault !== null) throw fault;
  if (state.kind === 'fatal') return <LifetimeFault fault={state.fault} />;
  if (state.kind === 'legacy') return <>{renderRuntime(state.runtime, null, signOut)}</>;
  // Proof: without this guard, quiet-load.spec.ts failed all three local-mode
  // pages on GET /api/organization/memberships 403 before legacy startup settled.
  // Removing it also failed `starts the inactive deployment runtime without reading
  // membership choices`: the request spy observed one membership read.
  if (mode === 'legacy' && !reachable) return <main className="p-8">Loading organization…</main>;
  const choose = (organizationId: string) => {
    observe(owner.choose(organizationId));
  };
  const switcher = (
    <section aria-label="Organization context">
      <MembershipChoices
        // Proof: removing this key failed both invitation-entry regressions: accepted Beta never appeared in choices.
        key={membershipsRevision}
        onChoose={choose}
        disabled={state.kind === 'switching' || state.kind === 'loading'}
      />
      {/* Proof: removing acceptance failed both `accepts another invitation from … and refreshes choices without selection` cases: no invitation-code field. */}
      <InvitationAcceptance
        onAccepted={() => {
          setMembershipsRevision((revision) => revision + 1);
          return Promise.resolve();
        }}
      />
    </section>
  );
  // Proof: retaining the previous active snapshot on failure failed `withdraws every resource view after a failed switch and offers explicit recovery` (c2-fault-retain).
  if (state.kind === 'active')
    return (
      <div className="contents" key={state.generation}>
        {renderRuntime(
          state.runtime,
          <>
            <details className="relative">
              <summary className="cursor-pointer">Organization: {state.organization.name}</summary>
              <div className="bg-background border-border absolute right-0 z-50 mt-2 max-h-80 w-72 overflow-y-auto rounded-md border p-3 shadow-lg">
                {switcher}
              </div>
            </details>
          </>,
          signOut,
        )}
      </div>
    );
  return (
    <main className="p-8">
      <h1>Choose your organization</h1>
      {state.kind === 'loading' && <p role="status">Checking your organization…</p>}
      {state.kind === 'switching' && <p role="status">Switching organization…</p>}
      {state.kind === 'failure' && <p role="alert">{state.message}</p>}
      {state.kind === 'lost' &&
        (state.refusal.error === 'sso_required' ||
        state.refusal.error === 'reauthentication_required' ? (
          <CredentialRefusalState refusal={state.refusal} />
        ) : (
          <p role="alert">
            Your organization context is no longer available. Choose again or check your current
            organization.
          </p>
        ))}
      {switcher}
      <button
        type="button"
        disabled={state.kind === 'switching' || state.kind === 'loading'}
        onClick={() => {
          observe(owner.refresh());
        }}
      >
        Check current organization
      </button>
      <button type="button" onClick={signOut}>
        Sign out
      </button>
    </main>
  );
}
