import { readSolution } from '@wbs/contracts';

import type { OrganizationAccess } from '../ports/organization-access';
import type { WorkPackageObservation } from '../ports/work-package-observation';
import { bind, type HttpReply } from './endpoint';
import { organizationRefusal } from './organization-refusal';

/**
 * Resolves a solution slug through the caller's access: under scoped access a
 * work package the organization does not own is `not_found` exactly as an absent
 * slug. Complete request evidence is retained before initial admission, then current
 * admission, slug ownership, package.read and private projection share the observation.
 * The following historical proof concerns organization scoping, not current grant admission.
 * Proof: reading the slug unscoped made `answers a foreign solution slug as
 * an absent one` in `import-export-organization.controller.db.test.ts` answer
 * 200 with B's work package; watched 2026-09-27.
 */
export function solutionRoutes(
  observation: WorkPackageObservation,
  organizations: OrganizationAccess,
) {
  return [
    bind(readSolution, async ({ params, principal }): Promise<HttpReply<typeof readSolution>> => {
      // Proof: R1, the route clone omitted; after absent404 the exact caller carried issuedAt99/scopes[editor] instead of retained values (2/2/2).
      // `retains the complete solution principal before initial admission and forwards its expected access`.
      // Nested evidence only; bind masks top-level ID mutation. No browser/verifier or observer-clone proof. Watched 2026-11-14.
      const retained = structuredClone(principal);
      const resolved = await organizations.resolve(retained);
      if (!resolved.ok) return organizationRefusal(resolved);
      // Proof: R2, expectedAccess replaced by legacy; after absent404 the exact caller lost the real scoped context (2/2/2).
      // `retains the complete solution principal before initial admission and forwards its expected access`.
      // Explicit unit-observer argument protocol only, not SQL/credential policy. Watched 2026-11-14.
      const observed = await observation.readSolution(
        { kind: 'human', principal: retained, expectedAccess: resolved.access },
        params.slug,
      );
      // Proof: R3, the later observation-refusal return omitted; after initial403/calls0 the direct reply became200/bodyundefined instead of409 (4/3/4).
      // `forwards initial solution membership refusal without observing and later context refusal exactly`.
      // Modeled direct reply forwarding only, not mounted500 or credential-policy proof. Watched 2026-11-14.
      if (!observed.ok) return organizationRefusal(observed);
      const found = observed.value;
      return found === null
        ? { ok: false, status: 404, body: { error: 'not_found' } }
        : { ok: true, status: 200, body: found };
    }),
  ] as const;
}
