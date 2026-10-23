import { DeliveryReadingSchema } from '@shared/delivery';
import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { engineUnavailableRefusal } from './scheduler-shapes';
import { requestSchema, responseSchema } from './schema-shape';

/** Reads delivery only for a saved reference owned by the addressed accessible work item. */
export const getWorkItemDelivery = defineEndpointShape({
  method: 'GET',
  path: '/api/projects/:id/work-items/:workItemId/refs/:refId/delivery',
  operationId: 'getApiProjectsByIdWork-itemsByWorkItemIdRefsByRefIdDelivery',
  policies: [
    // Proof: removing identity made the unauthenticated mounted request return 500 instead of 401.
    { kind: 'identity', require: 'signed-in' },
    // Proof: removing this policy made refuses stale organization context before provider reads return 200 instead of 409.
    { kind: 'organization-resource', operation: 'read' },
  ],
  // Proof: admitting a URL query made refuses caller-selected URLs without provider reads return 200 instead of 400.
  params: requestSchema(type({ id: 'string', workItemId: 'string', refId: 'string' })),
  // Proof: widening this response to unknown admitted malformed trusted reader output (200 instead of 500).
  responses: [{ kind: 'json', status: 200, schema: responseSchema(DeliveryReadingSchema) }],
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
    engineUnavailableRefusal,
  ],
  document: {
    summary: 'Observe delivery for a saved work-item reference.',
    description:
      'Reads the authorized stored URL on demand. Observations preserve unknown and partial coverage and do not change planning progress. Unsupported and unavailable provider readings are explicit outcomes. Merged does not imply deployed or accepted.',
  },
});
