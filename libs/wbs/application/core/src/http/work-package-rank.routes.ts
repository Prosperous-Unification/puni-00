import { moveWorkPackageRank, readWorkPackageRank } from '@wbs/contracts';
import type { Permission } from '@wbs/domain';

import type { OrganizationAccess } from '../ports/organization-access';
import type {
  WorkPackageRankRefusal,
  WorkPackageRankResource,
} from '../service/work-package-rank.resource';
import { bind } from './endpoint';
import { organizationRefusal } from './organization-refusal';

const REFUSED = {
  organization_required: { ok: false, status: 409, body: { error: 'organization_required' } },
  forbidden: { ok: false, status: 403, body: { error: 'forbidden' } },
  not_found: { ok: false, status: 404, body: { error: 'not_found' } },
} as const;

const refused = <R extends WorkPackageRankRefusal>(
  refusal: R,
  permission?: Permission,
): (typeof REFUSED)[R] => ({
  ...REFUSED[refusal],
  body: { ...REFUSED[refusal].body, ...(permission === undefined ? {} : { permission }) },
});

/**
 * The work package rank routes. Organization access is resolved before anything
 * effects; verified caller and validated targets are retained before its await.
 * The resource owns current grant, identity and ownership rules.
 */
export function workPackageRankRoutes(
  ranks: WorkPackageRankResource,
  organizations: OrganizationAccess,
) {
  return [
    bind(readWorkPackageRank, async ({ principal }) => {
      const actorId = principal.id;
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved);
      // Proof: rank-route-read-actor: rereading a mutable request actor after resolution.
      // retains rank read route id before organization resolution
      // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
      const outcome = await ranks.read(actorId, resolved.access);
      if ('authority' in outcome) return organizationRefusal(outcome.authority);
      return outcome.ok
        ? { ok: true, status: 200, body: { workPackages: outcome.workPackages } }
        : refused(outcome.refusal, outcome.permission);
    }),
    bind(moveWorkPackageRank, async ({ params, body, principal }) => {
      // Proof: rank-route-caller: retaining the mutable resolver caller.
      // retains rank move route id before organization resolution
      // retains rank move route authentication before organization resolution
      // retains rank move route delegation before organization resolution
      // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
      // Proof: rank-route-auth-deep: shallow request copying retains nested verifier aliases.
      // retains rank move route authentication before organization resolution
      // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
      const actor = structuredClone(principal);
      const workPackageId = params.id;
      const afterWorkPackageId = body.afterWorkPackageId ?? null;
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved);
      // Proof: rank-route-target: rereading the validated mutable rank target after resolution.
      // retains rank/mode route target before the bound resolver await
      // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
      // Proof: rank-route-destination: rereading the validated mutable rank destination after resolution.
      // retains rank/mode route destination before the bound resolver await
      // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
      const outcome = await ranks.move(actor, resolved.access, workPackageId, afterWorkPackageId);
      if ('authority' in outcome) return organizationRefusal(outcome.authority);
      return outcome.ok
        ? { ok: true, status: 200, body: { workPackages: outcome.workPackages } }
        : refused(outcome.refusal, outcome.permission);
    }),
  ] as const;
}
