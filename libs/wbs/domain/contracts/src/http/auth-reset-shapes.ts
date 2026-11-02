import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { responseSchema } from './schema-shape';

/**
 * Clears only the browser's WBS cookies. This explicit recovery never verifies
 * identity or acknowledges durable logout; API credential carriers are refused.
 */
export const resetBrowserSession = defineEndpointShape({
  method: 'POST',
  path: '/api/auth/reset',
  operationId: 'postApiAuthReset',
  // Proof: removing the Origin policy made mounted `refuses reset without the exact Origin` answer 204 instead of 403.
  policies: [{ kind: 'origin', when: 'always' }, { kind: 'organization-control' }],
  defaultResponseHeaders: [['cache-control', 'no-store']],
  responses: [{ kind: 'empty', status: 204 }],
  refusals: [
    {
      status: 400,
      schema: responseSchema(
        type({ error: "'invalid_body' | 'invalid_query' | 'invalid_client'" }),
      ),
    },
    { status: 403, schema: responseSchema(type({ error: "'invalid_origin'" })) },
  ],
  document: { summary: 'Clear saved browser sign-in cookies without ending a server session.' },
});
