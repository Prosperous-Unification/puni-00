import { type ReactNode, useState } from 'react';

import { AppHeader } from '@/components/chrome/app-header';

import { DomainsPanel } from './domains-panel';
import { InvitationsPanel } from './invitations-panel';
import { JoinRequestsPanel } from './join-requests-panel';
import { MembersPanel } from './members-panel';
import { type AccessLoss, lossCopy } from './organization-access';

/**
 * Administration of the session's active organization, at `/organization`.
 *
 * The active organization is the server's: this page never names one. When any
 * panel learns that the page lost its access (removed, no organization bound,
 * signed out or not active), the whole page is replaced by that state, and the
 * panels unmount with every row they read, so a stale tab keeps nothing of the
 * organization it lost.
 */
export function OrganizationPage({
  nav,
  account,
}: {
  nav: ReactNode;
  account: ReactNode;
}): React.JSX.Element {
  const [loss, setLoss] = useState<AccessLoss | null>(null);
  return (
    <>
      <AppHeader nav={nav} account={account} />
      <main className="bg-background text-foreground mx-auto w-full max-w-3xl p-8 font-sans">
        <h1 className="mb-6 text-2xl font-semibold">Organization</h1>
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
          </>
        ) : (
          <p role="alert">{lossCopy(loss)}</p>
        )}
      </main>
    </>
  );
}
