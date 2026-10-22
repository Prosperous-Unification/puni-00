import { Button, buttonVariants } from '@ui/saas-01';
import { type ReactNode, useState } from 'react';

import { AppHeader } from '@/components/chrome/app-header';
import { unreachable } from '@/lib/http';
import { useFeatureReachable } from '@/lib/session-features';
import { cn } from '@/lib/utils';

import { AccessState } from './access-state';
import { CredentialRefusalState } from './credential-refusal-state';
import { DomainsPanel } from './domains-panel';
import { InvitationsPanel } from './invitations-panel';
import { JoinRequestsPanel } from './join-requests-panel';
import { LimitsSlot } from './limits-panel';
import { MachineCredentialsPanel } from './machine-credentials-panel';
import { MembersPanel } from './members-panel';
import { type AccessLoss, lossCopy } from './organization-access';
import { credentialReach, type RoleView, useOrganizationRole } from './organization-role';
import { ProvisioningTokensPanel } from './provisioning-tokens-panel';
import { SessionPolicyPanel } from './session-policy-panel';
import { SharingPanel } from './sharing-panel';
import { SsoConnectionsPanel } from './sso-connections-panel';

/**
 * Administration of the session's active organization, at `/organization`.
 *
 * The active organization is the server's: this page never names one. When any
 * panel learns that the page lost its access (removed, no organization bound,
 * signed out, not active, or a sign-in the organization's rules refuse), the
 * whole page is replaced by that state, and the panels unmount with every row
 * they read, so a stale tab keeps nothing of the organization it lost.
 *
 * `userId` is the signed-in account, which the machine credentials panel
 * compares with each agent person's bound account (A7).
 */
export function OrganizationPage({
  nav,
  account,
  userId,
}: {
  nav: ReactNode;
  account: ReactNode;
  userId: string;
}): React.JSX.Element {
  // A deployment the session read reported without organizations starts in
  // the state the panels' refusals would reach, and mounts no panel to ask.
  const reachable = useFeatureReachable('organizations');
  const [loss, setLoss] = useState<AccessLoss | null>(reachable ? null : 'inactive');
  // One role read for every slot that draws by role, so the page sends
  // `GET /api/organization/active` once however many slots read it.
  // Proof: 2026-10-22, each slot calling `useOrganizationRole` itself failed
  // `reads the caller's role once for every slot that draws by it` (2 requests).
  const role = useOrganizationRole(setLoss);
  return (
    <>
      <AppHeader nav={nav} account={account} />
      {/*
       * The scroller is `main`, the Directory's way: the app shell is one
       * window tall, so a page that let the document scroll instead painted
       * the canvas, not `bg-background`, beside its column below the first
       * window in the dark palette (seen at 1280, 2026-10-12).
       */}
      <main className="bg-background text-foreground min-h-0 flex-1 overflow-y-auto font-sans">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:p-8">
          <h1 className="text-2xl font-semibold">Organization</h1>
          {/*
           * Proof: 2026-09-29, rendering the panels whatever `loss` held failed
           * `clears the organization's rows when a refusal says access was lost`:
           * the invited address stayed on screen beside the no-access state.
           */}
          {loss === null ? (
            <>
              <MembersPanel onAccessLost={setLoss} />
              <InvitationsPanel onAccessLost={setLoss} />
              <JoinRequestsPanel onAccessLost={setLoss} />
              <DomainsPanel onAccessLost={setLoss} />
              {/* Proof: omitting this panel failed `composes company sign-in setup on the organization page` (2026-10-13). */}
              <SsoConnectionsPanel onAccessLost={setLoss} />
              {/* Proof: omitting this panel failed the session-policy composition test (2026-10-13). */}
              <SessionPolicyPanel onAccessLost={setLoss} />
              {/* Proof: 2026-10-22, omitting this slot failed `composes the limits panel for an admin`. */}
              <LimitsSlot role={role} onAccessLost={setLoss} />
              {/* Proof: omitted composition failed the mounted provisioning-token composition test (2026-10-15). */}
              <ProvisioningTokensPanel onAccessLost={setLoss} />
              <MachineCredentialsSlot role={role} userId={userId} onAccessLost={setLoss} />
              {/*
               * Proof: 2026-10-11, leaving this panel out failed `shows whether
               * the organization shares its people`.
               */}
              <SharingPanel onAccessLost={setLoss} />
            </>
          ) : typeof loss === 'string' ? (
            <AccessState
              {...lossCopy(loss)}
              action={
                // A document load rather than a router link: a session that
                // ended has to meet the startup check again to be asked to
                // sign in, and the other losses lose nothing by it.
                <a className={cn(buttonVariants(), 'no-underline')} href="/">
                  Open the plan
                </a>
              }
            />
          ) : (
            // Proof: 2026-10-12, rendering only the headline sentence here failed
            // `replaces the panels with the company sign-in state and its link wording`.
            <CredentialRefusalState refusal={loss} />
          )}
        </div>
      </main>
    </>
  );
}

/**
 * The machine credentials panel once the caller's role is known: none in a
 * deployment without organizations or for a viewer, who sends no credentials
 * request at all (task 6.4), and a rendered failure with retry when the role
 * cannot be read.
 */
function MachineCredentialsSlot({
  role,
  userId,
  onAccessLost,
}: {
  role: RoleView;
  userId: string;
  onAccessLost: (loss: AccessLoss) => void;
}): React.JSX.Element | null {
  switch (role.kind) {
    case 'legacy':
    case 'withdrawn':
      return null;
    case 'loading':
      return <p className="text-sm">Loading machine credentials…</p>;
    case 'failure':
      return (
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-destructive text-sm">
            {role.message}
          </p>
          <Button type="button" variant="outline" className="self-start" onClick={role.retry}>
            Retry machine credentials
          </Button>
        </div>
      );
    case 'ready': {
      const reach = credentialReach(role.role);
      // Proof: 2026-10-22, rendering the panel for every role failed `renders no
      // credentials panel for a viewer and sends no credentials request`.
      if (reach === 'none') return null;
      return <MachineCredentialsPanel viewer={{ userId, reach }} onAccessLost={onAccessLost} />;
    }
    default:
      return unreachable(role);
  }
}
