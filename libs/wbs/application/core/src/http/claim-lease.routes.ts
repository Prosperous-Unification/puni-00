import { credentialPinOf, renewClaimLeases } from '@wbs/contracts';

import type { PlanCommandRunner } from '../module/plan-commands/plan-commands.feature';
import type { OrganizationAccess } from '../ports/organization-access';
import { bind, type HttpReply } from './endpoint';
import { organizationRefusal } from './organization-refusal';

const notPinned = { ok: false, status: 403, body: { error: 'not_pinned' } } as const;

/**
 * The agent heartbeat (`wbs-claim-leases` L4, L12, L13). Organization
 * authority is resolved first, so an unbound caller learns nothing; the
 * caller's credential must be pinned to a person (a machine credential or an
 * MCP consent), whose leases the runner renews through the public graph,
 * reading before it takes the write turn.
 */
export function claimLeaseRoutes(
  organizations: OrganizationAccess,
  runner: Pick<PlanCommandRunner, 'renewLeases'>,
) {
  return [
    bind(renewClaimLeases, async ({ principal }): Promise<HttpReply<typeof renewClaimLeases>> => {
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved);
      const pin = credentialPinOf(principal.authentication);
      // Proof: with this refusal removed, `renews on an agent heartbeat and
      // refuses a session heartbeat not_pinned` (claim-lease.controller.db.test.ts)
      // answered the session 200 (2 pass, 1 fail); watched 2026-10-23.
      if (pin === null || !('personId' in pin)) return notPinned;
      const standing = await runner.renewLeases(pin.personId);
      return { ok: true, status: 200, body: standing };
    }),
  ] as const;
}
