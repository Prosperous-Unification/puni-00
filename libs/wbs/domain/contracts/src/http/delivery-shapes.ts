import { DeliveryReadingSchema } from '@shared/delivery';
import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { engineUnavailableRefusal } from './scheduler-shapes';
import { requestSchema, responseSchema } from './schema-shape';

/**
 * A reading as the server served it. `servedAt` is the server's clock when it answered, so a
 * client ages `reading`'s `observedAt` against the server's clock rather than its own; a cached
 * reading is served with its original `observedAt`.
 */
export const ServedDeliveryReadingSchema = type({
  reading: DeliveryReadingSchema,
  servedAt: type.string.matching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
});
export type ServedDeliveryReading = typeof ServedDeliveryReadingSchema.infer;

/** Reads delivery only for a saved reference owned by the addressed accessible work item. */
export const getWorkItemDelivery = defineEndpointShape({
  method: 'GET',
  path: '/api/projects/:id/work-items/:workItemId/refs/:refId/delivery',
  operationId: 'getApiProjectsByIdWork-itemsByWorkItemIdRefsByRefIdDelivery',
  policies: [
    // Proof: removing identity made 'refuses unauthenticated, unbound and removed members without provider reads' answer 500 instead of 401 (2026-10-24).
    { kind: 'identity', require: 'signed-in' },
    // Proof: removing this policy made 'refuses stale organization context before provider reads' answer 200 instead of 409 (2026-10-24).
    { kind: 'organization-resource', operation: 'read' },
  ],
  // No query schema: any query is refused. Proof: declaring an optional url query made 'refuses caller-selected URLs without provider reads' answer 200 instead of 400 (2026-10-24).
  params: requestSchema(type({ id: 'string', workItemId: 'string', refId: 'string' })),
  // Proof: widening this response to unknown made 'refuses a bare reading without servedAt at the client boundary' (delivery-shapes.test.ts) answer success instead of failure (2026-10-24).
  responses: [{ kind: 'json', status: 200, schema: responseSchema(ServedDeliveryReadingSchema) }],
  refusals: [
    {
      status: 400,
      schema: responseSchema(
        type({ error: "'invalid_params' | 'invalid_query' | 'invalid_body' | 'invalid_json'" }),
      ),
    },
    { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
    { status: 404, schema: responseSchema(type({ error: "'not_found'" })) },
    /** The organization spent its provider reads; a cached reading is still served. */
    // Proof: answering this refusal as 409 made 'validates the 429 and 503 delivery refusals at the client boundary' fail the 429 (2026-10-24).
    {
      status: 429,
      schema: responseSchema(
        type({ error: "'delivery_rate_limited'", retryAfterSeconds: 'number.integer >= 1' }),
      ),
    },
    /** Every provider read slot stayed taken for the whole bounded wait. */
    { status: 503, schema: responseSchema(type({ error: "'delivery_busy'" })) },
    organizationRefusal,
    organizationContextRefusal,
    engineUnavailableRefusal,
  ],
  document: {
    summary: 'Observe delivery for a saved work-item reference.',
    description:
      'Reads the authorized stored URL on demand. Observations preserve unknown and partial coverage and do not change planning progress. Unsupported and unavailable provider readings are explicit outcomes. Merged does not imply deployed or accepted. Readings are cached for a short time per URL, so a refresh may answer the same observedAt; servedAt is the server clock when it answered. Provider reads are limited per organization (429 delivery_rate_limited with retryAfterSeconds) and across the server (503 delivery_busy).',
  },
});
