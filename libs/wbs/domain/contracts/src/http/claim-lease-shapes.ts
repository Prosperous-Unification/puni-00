import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { responseSchema } from './schema-shape';

const writePolicies = [
  { kind: 'origin', when: 'always-unsafe-with-session-cookie' },
  { kind: 'identity', require: 'write-scope' },
] as const;

/**
 * An agent's heartbeat (`wbs-claim-leases` L4, L12, L13): renews every lease
 * of the caller's pinned person that is due, in every project, and answers the
 * leases in force and the earliest expiry. Writes at most once a minute; an
 * unpinned caller (a session, an upstream pair) is refused `not_pinned`.
 */
export const renewClaimLeases = defineEndpointShape({
  method: 'POST',
  path: '/api/claims/renew',
  operationId: 'postApiClaimsRenew',
  policies: [...writePolicies, { kind: 'organization-resource', operation: 'mutation' }],
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(type({ leases: 'number', leaseExpiresAt: 'number | null' })),
    },
  ],
  refusals: [
    // The heartbeat reads no input: a body or query string is refused, never ignored.
    // Proof: without it, a raw agent's `-d '{}'` heartbeat answered 500 `no declared
    // validation refusal` in claim-lease.controller.db.test.ts `refuses a heartbeat
    // carrying a body or a query as a typed 400` (watched 2026-10-24).
    { status: 400, schema: responseSchema(type({ error: "'invalid_body' | 'invalid_query'" })) },
    { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
    {
      status: 403,
      schema: responseSchema(
        type({ error: "'invalid_origin' | 'insufficient_scope' | 'not_pinned'" }),
      ),
    },
    organizationRefusal,
    organizationContextRefusal,
  ],
  document: {
    summary:
      'Renew every claim lease of the calling agent (API key, trusted-issuer token or MCP consent): a claim an agent takes for itself is released by the coordinator 15 minutes after its last write unless renewed. Any committed command batch renews too; call this while idle, at most every few minutes. Answers the leases in force and the earliest expiry (epoch milliseconds). A session is refused not_pinned.',
  },
});
