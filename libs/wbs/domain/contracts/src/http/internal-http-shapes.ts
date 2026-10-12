import { type } from 'arktype';

import {
  InternalForwardRequest,
  InternalForwardResponse,
  InternalResumeResponse,
} from '../internal';
import { defineEndpointShape } from './endpoint-shape';
import { organizationRefusal } from './organization-refusal';
import { requestSchema, responseSchema } from './schema-shape';

/**
 * ArkType's unordered union removes the array as a subtype of the index map.
 * Its schema parser erases inference: the exact two runtime branches below and
 * their emitted anyOf are checked by internal-http-shapes.test.ts, which is the
 * boundary justifying this local type restoration.
 * Proof: widening this restoration to unknown produced TS2578 on the string-
 * cursor negative in internal-http-shapes.test.ts; restoring the numeric union
 * made the same isolated compiler check pass.
 * Proof: deleting the array branch returned422 instead of200 in the mounted
 * legacy-cursor case; a zero lower bound returned422 instead of200 in the
 * real replay-from-minus-one case (internal.integration.test.ts).
 */
const resumePoints = type
  .schema({
    branches: [
      { sequence: 'number', proto: 'Array' },
      { index: [{ signature: 'string', value: 'number' }], domain: 'object' },
    ],
    ordered: true,
  })
  .as<Record<string, number> | number[]>();

// Proof: removing identity reached malformed JSON parsing,400 instead of401
// in internal.integration.test.ts's pre-parse identity case.
const policies = [{ kind: 'identity', require: 'internal' }] as const;
/**
 * The gateway's own secret, then the socket's forwarded browser credential
 * (`__Host-wbs_access` and `__Host-wbs_organization` cookies, as sent), proved
 * through be-01's ordinary browser authentication with read scope.
 */
const gatewayBrowserPolicies = [{ kind: 'identity', require: 'gateway-browser' }] as const;
// Proof: removing form media returned422 instead of200 in the mounted
// duplicate-payload forms case (http/elysia/internal.test.ts).
const bodyMedia = [
  'application/json',
  'application/x-www-form-urlencoded',
  'multipart/form-data',
] as const;
const refusals = [
  {
    status: 400,
    schema: responseSchema(type({ error: "'invalid_params' | 'invalid_query' | 'invalid_json'" })),
  },
  { status: 401, schema: responseSchema(type({ error: "'unauthorized'" })) },
  { status: 422, schema: responseSchema(type({ error: "'invalid_body'" })) },
] as const;

/**
 * Acknowledges an arbitrary gateway payload without making the socket a write
 * authority. Forms preserve duplicate message values as an arbitrary array.
 * Proof: using responseSchema for the body admitted extra envelope fields,
 *200 instead of422 in internal.integration.test.ts's strict-body case.
 */
export const forwardInternal = defineEndpointShape({
  method: 'POST',
  path: '/internal/forward',
  operationId: 'postInternalForward',
  policies,
  body: requestSchema(InternalForwardRequest),
  bodyMedia,
  responses: [{ kind: 'json', status: 200, schema: responseSchema(InternalForwardResponse) }],
  refusals,
  document: { summary: 'Acknowledge a forwarded gateway message.' },
});

/**
 * Reads replay from legacy numeric cursors, including -1, fractions and arrays.
 * The explicit array arm preserves the old index-map parser's accepted inputs;
 * the binding interprets array indices as subscription keys through Object.entries.
 * Replay messages remain opaque historical JSON while outcome metadata is closed.
 * Proof: an unknown-valued response map admitted a missing events list,200
 * instead of500 in the mounted replay-reply case (http/elysia/internal.test.ts).
 */
export const resumeInternal = defineEndpointShape({
  method: 'POST',
  path: '/internal/resume',
  operationId: 'postInternalResume',
  // Replay is a read for the socket's own principal: the gateway forwards that
  // browser credential and be-01 checks every named project before replaying.
  policies: gatewayBrowserPolicies,
  body: requestSchema(type({ resume_points: resumePoints, trace_id: 'string' })),
  bodyMedia,
  responses: [{ kind: 'json', status: 200, schema: responseSchema(InternalResumeResponse) }],
  refusals: [
    refusals[0],
    { status: 401, schema: responseSchema(type({ error: "'unauthorized' | 'unauthenticated'" })) },
    { status: 403, schema: responseSchema(type({ error: "'insufficient_scope'" })) },
    refusals[2],
  ],
  document: { summary: 'Replay recorded events to one reconnecting gateway socket.' },
});

/** Checks one project for a gateway's single-use, read-scoped delegation. */
export const gatewayProjectAccess = defineEndpointShape({
  method: 'POST',
  path: '/internal/gateway/projects/:projectId/access',
  operationId: 'postInternalGatewayProjectAccess',
  policies: [{ kind: 'identity', require: 'gateway-delegation' }],
  params: requestSchema(type({ projectId: 'string' })),
  responses: [{ kind: 'empty', status: 204 }],
  refusals: [
    { status: 400, schema: responseSchema(type({ error: "'invalid_params' | 'invalid_body'" })) },
    { status: 401, schema: responseSchema(type({ error: "'unauthorized' | 'unauthenticated'" })) },
    { status: 403, schema: responseSchema(type({ error: "'insufficient_scope'" })) },
    organizationRefusal,
    { status: 404, schema: responseSchema(type({ error: "'not_found'" })) },
  ],
  document: { summary: 'Check a gateway delegation against current project access.' },
});

/**
 * Checks one project for the browser principal behind one gateway socket:
 * current membership and an organization-scoped project, as `gatewayProjectAccess`,
 * but proved by the forwarded browser credential rather than a signed delegation.
 */
export const gatewayBrowserProjectAccess = defineEndpointShape({
  method: 'POST',
  path: '/internal/gateway/projects/:projectId/browser-access',
  operationId: 'postInternalGatewayProjectBrowserAccess',
  policies: gatewayBrowserPolicies,
  params: requestSchema(type({ projectId: 'string' })),
  responses: [{ kind: 'empty', status: 204 }],
  refusals: [
    { status: 400, schema: responseSchema(type({ error: "'invalid_params' | 'invalid_body'" })) },
    { status: 401, schema: responseSchema(type({ error: "'unauthorized' | 'unauthenticated'" })) },
    { status: 403, schema: responseSchema(type({ error: "'insufficient_scope'" })) },
    organizationRefusal,
    { status: 404, schema: responseSchema(type({ error: "'not_found'" })) },
  ],
  document: { summary: 'Check a gateway socket principal against current project access.' },
});
