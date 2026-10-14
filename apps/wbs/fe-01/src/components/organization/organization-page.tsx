import { type ReactNode, useState } from 'react';

import { AppHeader } from '@/components/chrome/app-header';
import { buttonVariants } from '@/components/ui/button';
import { useFeatureReachable } from '@/lib/session-features';
import { cn } from '@/lib/utils';

import { AccessState } from './access-state';
import { CredentialRefusalState } from './credential-refusal-state';
import { DomainsPanel } from './domains-panel';
import { InvitationsPanel } from './invitations-panel';
import { JoinRequestsPanel } from './join-requests-panel';
import { MembersPanel } from './members-panel';
import { type AccessLoss, lossCopy } from './organization-access';
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
 */
export function OrganizationPage({
  nav,
  account,
}: {
  nav: ReactNode;
  account: ReactNode;
}): React.JSX.Element {
  // A deployment the session read reported without organizations starts in
  // the state the panels' refusals would reach, and mounts no panel to ask.
  const reachable = useFeatureReachable('organizations');
  const [loss, setLoss] = useState<AccessLoss | null>(reachable ? null : 'inactive');
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
