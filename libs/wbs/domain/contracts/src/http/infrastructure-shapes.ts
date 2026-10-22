import { type } from 'arktype';

import type { DependencyRuntimeCapability } from '../dependency-runtime';
import { defineEndpointShape } from './endpoint-shape';
import { responseSchema, type SchemaShape } from './schema-shape';

// Proof: dropping the version parameter made the mounted endpoint test expect
// "text/plain; version=0.0.4" and receive "text/plain".
export const PROMETHEUS_CONTENT_TYPE = 'text/plain; version=0.0.4';

const bodyRefusal = {
  status: 400,
  schema: responseSchema(type({ error: "'invalid_body'" })),
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
    bodyRefusal,
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
  refusals: [bodyRefusal],
  document: { summary: 'Expose backend Prometheus metrics.' },
});

const backendDependencyCapability: SchemaShape<
  DependencyRuntimeCapability & { readonly role: 'backend' }
> = responseSchema(
  type({
    protocol: "'wbs-dependency-runtime'",
    version: '1',
    role: "'backend'",
    semantics: "'cross-project-dependencies-v1'[]",
  }),
);

/** Immutable backend binary support; empty semantics explicitly mean incapable, never activation authority. */
export const dependencyCapability = defineEndpointShape({
  method: 'GET',
  path: '/api/runtime/dependency-capability',
  operationId: 'getDependencyCapability',
  policies: [{ kind: 'organization-control' }],
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: backendDependencyCapability,
    },
  ],
  refusals: [bodyRefusal],
  document: {
    summary:
      'Report immutable backend dependency semantic support, independently of store activation.',
  },
});
