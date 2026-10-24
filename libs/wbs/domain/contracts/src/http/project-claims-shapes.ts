import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { requestSchema, responseSchema } from './schema-shape';

const readPolicies = [{ kind: 'identity', require: 'signed-in' }] as const;

/**
 * Every **Claim** held in one project, with the server's instant at the read
 * (`wbs-claim-display` C1, C2, spec `claim-reads`). A caller the tree read
 * refuses is refused alike: an organization's viewer reads it, a foreign or
 * absent project is 404 `not_found`. It reads no schedule, so it answers while
 * the tree read is refused `engine_unavailable`.
 */
export const readProjectClaims = defineEndpointShape({
  method: 'GET',
  path: '/api/projects/:id/claims',
  operationId: 'getApiProjectsByIdClaims',
  // Proof: with the organization-resource policy dropped, `covers every mounted
  // organization mutation` (organization-context.controller.db.test.ts) failed
  // for this read; watched 2026-10-23.
  policies: [...readPolicies, { kind: 'organization-resource', operation: 'read' }],
  params: requestSchema(type({ id: 'string' })),
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({
          readAt: 'number',
          claims: type({
            claimId: 'string',
            workItemId: 'string',
            number: 'string',
            numberIsFrozen: 'boolean',
            name: 'string',
            stepId: 'string | null',
            holder: type({ personId: 'string', name: 'string' }),
            runId: 'string | null',
            parentClaimId: 'string | null',
            claimedAt: 'number',
            leaseExpiresAt: 'number | null',
            leaseRevokedAt: 'number | null',
          }).array(),
        }),
      ),
    },
  ],
  refusals: [
    {
      status: 400,
      schema: responseSchema(
        type({ error: "'invalid_params' | 'invalid_query' | 'invalid_body' | 'invalid_json'" }),
      ),
    },
    { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
    { status: 404, schema: responseSchema(type({ error: "'not_found'" })) },
    organizationRefusal,
    organizationContextRefusal,
  ],
  document: {
    summary: 'List every claim held in a project: who holds what, under which run, and its lease.',
    description:
      "readAt: the server clock at the read (epoch milliseconds); a lease has leaseExpiresAt minus readAt left. claims: every step claim and subtree claim of the project, whatever the work item status, in tree order, a subtree claim (stepId null) before the step claims of the same item, step claims in project step order. Each names the work item id, its frozen number (numberIsFrozen) or else its derived one, its name, the step, the claim id, the holder (personId and name), the run, the subtree claim it is delegated under (parentClaimId), the write instant, the lease expiry (null for a claim no agent renews) and the instant the holder's last credential was revoked (null unless revoked; a revoked lease has run out and the claim is being released). Claim with postApiProjectsByIdCommands kind claimWorkItem; keep an agent's leases with postApiClaimsRenew.",
  },
});
