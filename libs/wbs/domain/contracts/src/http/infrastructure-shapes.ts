import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { responseSchema } from './schema-shape';

// Proof: dropping the version parameter made the mounted endpoint test expect
// "text/plain; version=0.0.4" and receive "text/plain".
export const PROMETHEUS_CONTENT_TYPE = 'text/plain; version=0.0.4';

/** A probe or scrape carrying a body or a query string; neither route reads input. */
const inputRefusal = {
  status: 400,
  schema: responseSchema(type({ error: "'invalid_body' | 'invalid_query'" })),
} as const;

/** Process readiness and its dependency state, including deploy commit identity. */
export const health = defineEndpointShape({
  method: 'GET',
  path: '/health',
  operationId: 'getHealth',
  policies: [{ kind: 'organization-control' }],
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(type({ status: "'ok'", commit: 'string | null' })),
    },
  ],
  refusals: [
    {
      status: 503,
      schema: responseSchema(
        type({
          error: "'dependency_unavailable'",
          status: "'migrating' | 'database_unreachable' | 'schema_missing'",
          commit: 'string | null',
        }),
      ),
    },
    // Proof: omitting this declaration made the real production /health TCP
    // test receive six 500s instead of typed 400s for GET/HEAD body framing.
    inputRefusal,
  ],
  document: { summary: 'Report backend readiness and dependency health.' },
});

/** Prometheus exposition text, including a diagnostic scrape on collector failure. */
export const metrics = defineEndpointShape({
  method: 'GET',
  path: '/metrics',
  operationId: 'getMetrics',
  policies: [{ kind: 'organization-control' }],
  responses: [
    { kind: 'text', status: 200, contentType: PROMETHEUS_CONTENT_TYPE },
    { kind: 'text', status: 500, contentType: PROMETHEUS_CONTENT_TYPE },
  ],
  refusals: [inputRefusal],
  document: { summary: 'Expose backend Prometheus metrics.' },
});
