import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { requestSchema, responseSchema } from './schema-shape';

/** Personal super-admin consent; authority is resolved from the authenticated request. */
export const approveSharedPeopleRestore = defineEndpointShape({
  method: 'POST',
  path: '/api/organization/shared-people/restore-approvals',
  operationId: 'postApiOrganizationSharedPeopleRestoreApprovals',
  humanOnly: true,
  policies: [
    { kind: 'origin', when: 'always-unsafe-with-session-cookie' },
    { kind: 'identity', require: 'write-scope' },
    // Proof: omitting this policy issued approval in org-b for stale org-a browser intent; the mounted organization inventory case failed.
    { kind: 'organization-resource', operation: 'mutation' },
  ],
  // Proof: deleting undeclared keys admitted actorId; widening the digest regex returned 500 instead of 400.
  // Both faults failed the mounted malformed/authority-body case independently.
  body: requestSchema(
    type({
      operationId: 'string > 0',
      backupDigest: /^[a-f0-9]{64}$/,
    }),
  ),
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({
          approval: {
            id: 'string',
            operationId: 'string',
            backupDigest: 'string',
            organizationId: 'string',
            actorId: 'string',
            createdAt: 'number',
          },
        }),
      ),
    },
  ],
  refusals: [
    {
      status: 400,
      schema: responseSchema(
        type({ error: "'invalid_params' | 'invalid_query' | 'invalid_json' | 'invalid_body'" }),
      ),
    },
    { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
    organizationRefusal,
    organizationContextRefusal,
    {
      status: 403,
      schema: responseSchema(type({ error: "'invalid_origin' | 'insufficient_scope'" })),
    },
    { status: 403, schema: responseSchema(type({ error: "'forbidden'" })) },
    // Two arms rather than one enumerated error: `organization_required` also
    // carries a command position from a measure batch, so its refusal variants
    // are a union TypeScript cannot match against an enumerated `error`.
    { status: 409, schema: responseSchema(type({ error: "'organization_required'" })) },
    { status: 409, schema: responseSchema(type({ error: "'restore_approval_conflict'" })) },
  ],
  document: {
    summary: 'Personally approve a shared people backup restore in the active organization.',
  },
});
