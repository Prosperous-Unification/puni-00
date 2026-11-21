import { readAcceptedPlanReference, registerAcceptedPlanReference } from '@wbs/contracts';

import type { AcceptedPlanReferences } from '../module/accepted-plan-reference/accepted-plan-reference.feature';
import type { OrganizationAccess } from '../ports/organization-access';
import { bind, type HttpReply } from './endpoint';
import { organizationRefusal } from './organization-refusal';

/** The mounted endpoints let the source recheck the admitted principal before every lookup or mutation. */
export function acceptedPlanReferenceRoutes(
  register: AcceptedPlanReferences,
  organizations: OrganizationAccess,
) {
  return [
    bind(
      registerAcceptedPlanReference,
      async ({
        params,
        principal,
        body,
      }): Promise<HttpReply<typeof registerAcceptedPlanReference>> => {
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        const registered = await register.register(
          params.id,
          { principal, expectedAccess: resolved.access },
          body,
        );
        if (registered.ok) return { ok: true, status: 201, body: registered.value };
        if ('refusal' in registered) return organizationRefusal(registered);
        const { error } = registered;
        switch (error) {
          case 'not_found':
            return { ok: false, status: 404, body: { error } };
          case 'forbidden':
          case 'insufficient_scope':
            return { ok: false, status: 403, body: { error } };
          case 'invalid_plan_artifacts':
          case 'unsupported_plan_version':
            return { ok: false, status: 400, body: { error } };
          case 'reference_changed':
          case 'live_plan_changed':
          case 'connected_plan':
          case 'live_plan_unavailable':
            return { ok: false, status: 409, body: { error } };
        }
      },
    ),
    bind(
      readAcceptedPlanReference,
      async ({
        params,
        principal,
        query,
      }): Promise<HttpReply<typeof readAcceptedPlanReference>> => {
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        const { version, referenceDigest } = query;
        let selector: { version: number; referenceDigest: string } | undefined;
        // Proof: Entering historical lookup only when both parts were supplied made "requires
        // explicit acceptance expectations, canonical byte transport, and a complete lookup
        // selector" fail. The faulted fixture received 200 with the active lock and basis instead
        // of 400 on the first incomplete query.
        if (version !== undefined || referenceDigest !== undefined) {
          const parsedVersion = Number(version);
          // Proof: Allowing unsafe integer versions made "requires explicit acceptance
          // expectations, canonical byte transport, and a complete lookup selector" fail. The
          // faulted fixture received 404 `not_found` instead of 400.
          if (referenceDigest === undefined || !Number.isSafeInteger(parsedVersion))
            return { ok: false, status: 400, body: { error: 'invalid_query' } };
          selector = { version: parsedVersion, referenceDigest };
        }
        const read = await register.read(
          params.id,
          { principal, expectedAccess: resolved.access },
          query,
          selector,
        );
        if (read.ok) return { ok: true, status: 200, body: read.value };
        if ('refusal' in read) return organizationRefusal(read);
        return read.error === 'not_found'
          ? { ok: false, status: 404, body: { error: read.error } }
          : { ok: false, status: 403, body: { error: read.error } };
      },
    ),
  ] as const;
}
