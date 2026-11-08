import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { requestSchema, responseSchema } from './schema-shape';

const readPolicies = [{ kind: 'identity', require: 'signed-in' }] as const;

/**
 * A project's newest **Claim history** acts (`wbs-claim-display` C13, C14,
 * spec `claim-reads`): its `claim` and `release` plan events and each claim or
 * release run inside a multi-command batch, newest first,
 * `limit` 1 to 100 (default 50, anything else 400 `invalid_query`), no cursor.
 * A caller the tree read refuses is refused alike. A holder or work item
 * deleted since reads `null`; undo and redo are not listed.
 */
export const readClaimHistory = defineEndpointShape({
  method: 'GET',
  path: '/api/projects/:id/claim-history',
  operationId: 'getApiProjectsByIdClaim-history',
  // Proof: with the organization-resource policy dropped, `covers every
  // mounted organization mutation` and `refuses a stale expected organization
  // before returning resource content` (organization-context.controller.db.test.ts)
  // failed for this read; watched 2026-10-24.
  policies: [...readPolicies, { kind: 'organization-resource', operation: 'read' }],
  params: requestSchema(type({ id: 'string' })),
  query: requestSchema(type({ 'limit?': 'string' })),
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({
          events: type({
            eventId: 'string',
            act: 'number',
            at: 'number',
            kind: "'claim' | 'release'",
            reason: "'claimed' | 'released' | 'lease_expired' | 'credential_revoked'",
            claims: type({
              claimId: 'string',
              workItemId: 'string',
              stepId: 'string | null',
              runId: 'string | null',
              holder: type({ personId: 'string', name: 'string | null' }),
              item: type({ number: 'string', numberIsFrozen: 'boolean', name: 'string' }).or(
                'null',
              ),
            }).array(),
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
    summary: 'List the newest claims and releases of a project, each with who, what and why.',
    description:
      "events: the project's claims and releases, newest first, at most limit of them (a whole number 1 to 100, default 50; anything else is refused 400 invalid_query). A claim or release made in one postApiProjectsByIdCommands batch beside other commands is listed too: the acts of one batch share eventId and are told apart by act (their order in the batch, 0 for the first; the last runs first in this list); a lone act has act 0. Each names eventId, act, at (epoch milliseconds), kind (claim or release), reason (claimed for a claim, released for a releaseWorkItem command, lease_expired or credential_revoked for a release the lease sweep wrote) and claims: each with claimId, workItemId, stepId (null for a subtree claim), runId, holder (personId, and name or null when the person was deleted since) and item (the work item's number, numberIsFrozen and name as the plan holds it now, or null when it was deleted since). Undo and redo are not listed: read the claims held now with getApiProjectsByIdClaims.",
  },
});
