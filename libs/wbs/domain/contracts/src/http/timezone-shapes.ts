import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { responseSchema } from './schema-shape';

/**
 * Reads the IANA zones this be-01 accepts as a project timezone, `UTC`
 * included, so a client offers only zones the PATCH will not refuse
 * (`step-node-attempts` D3): a browser's own `Intl` list may differ.
 */
export const readTimezones = defineEndpointShape({
  method: 'GET',
  path: '/api/timezones',
  operationId: 'getApiTimezones',
  policies: [{ kind: 'identity', require: 'signed-in' }],
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(type({ timezones: 'string[]' })),
    },
  ],
  refusals: [
    {
      status: 400,
      schema: responseSchema(
        type({ error: "'invalid_query' | 'invalid_params' | 'invalid_body'" }),
      ),
    },
    { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
  ],
  document: { summary: 'List the IANA zones a project timezone may be set to.' },
});
