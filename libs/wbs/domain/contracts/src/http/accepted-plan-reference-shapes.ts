import {
  GitObjectId,
  NativePlanTasks,
  PlanRef,
  PlanReferenceWire,
  Sha256,
} from '@shared/plan-reference';
import { type } from 'arktype';

import { defineEndpointShape, type EndpointShape } from './endpoint-shape';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { requestSchema, responseSchema } from './schema-shape';

const collection = '/api/projects/:id/accepted-plan-references' as const;
const params = requestSchema(type({ id: 'string' }));
const version = type('0 < number.integer <= 9007199254740991');
const scopedRepository = {
  repository: PlanRef.get('repository'),
  change: PlanRef.get('change'),
};
const scope = {
  organizationId: 'string>=1',
  projectId: PlanRef.get('plan'),
  ...scopedRepository,
} as const;
const selector = { version, referenceDigest: Sha256 };
const lock = type({ ...scope, ...selector });
const expected = type({ kind: "'absent'" }).or({ kind: "'version'", ...selector });

/** Standard padded base64 without alternate padding bits or whitespace. */
// Proof: Accepting any string as base64 made "requires explicit acceptance expectations, canonical
// byte transport, and a complete lookup selector" fail. The faulted fixture received 400 with
// `invalid_plan_artifacts` where the fixture expected `invalid_body` on the third malformed
// request.
const base64 = type(
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}[AEIMQUYcgkosw048]=|[A-Za-z0-9+/][AQgw]==)?(?![\s\S])/,
);
const artifacts = {
  exportBytes: base64,
  requirementsBytes: base64,
  reference: PlanReferenceWire,
  tasks: NativePlanTasks,
};

const registration = type({
  ...scopedRepository,
  // Proof: Making the expectation optional made "rejects a missing expectation before the reference
  // writer checks grants" fail. The faulted fixture received 403 `forbidden` and one writer entry
  // instead of 400 `invalid_body` and zero entries, with zero rows on both sides.
  expected,
  planningCommit: GitObjectId,
  sourceBaseCommit: GitObjectId,
  ...artifacts,
});

export const acceptedReferenceArtifacts = type(artifacts).onDeepUndeclaredKey('reject');

const active = type({ lock, writeBasis: 'string>=1' });
const historical = type({ lock, ...artifacts });
const historyQuery = type({
  ...scopedRepository,
  'version?': type(/^[1-9][0-9]{0,15}(?![\s\S])/),
  'referenceDigest?': Sha256,
});
const commonRefusals = [
  { status: 400, schema: responseSchema(type({ error: "'invalid_params' | 'invalid_query'" })) },
  { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
  {
    status: 403,
    schema: responseSchema(type({ error: "'insufficient_scope'" }).or({ error: "'forbidden'" })),
  },
  { status: 404, schema: responseSchema(type({ error: "'not_found'" })) },
  organizationRefusal,
  organizationContextRefusal,
] as const;

export type RegisterPlanReference = typeof registration.infer;
export type ActivePlanReference = typeof active.infer;
export type HistoricalPlanReference = typeof historical.infer;
export type AcceptedReferenceLock = typeof lock.infer;
export type AcceptedReferenceArtifacts = Omit<HistoricalPlanReference, 'lock'>;

/** Registers a verified operator's ordinary export against an explicit expected acceptance. */
export const registerAcceptedPlanReference = defineEndpointShape({
  method: 'POST',
  path: collection,
  operationId: 'postApiProjectsByIdAcceptedPlanReferences',
  humanOnly: true,
  params,
  policies: [
    // Proof: Omitting the organization mutation policy made "refuses a register whose expected
    // browser organization disagrees with current access" fail. The faulted fixture received 201
    // instead of 409 for a mismatched expected browser organization.
    { kind: 'organization-resource', operation: 'mutation' },
    { kind: 'origin', when: 'always-unsafe-with-session-cookie' },
    { kind: 'identity', require: 'signed-in' },
  ],
  body: requestSchema(registration),
  bodyMedia: ['application/json'],
  responses: [{ kind: 'json', status: 201, schema: responseSchema(active) }],
  refusals: [
    ...commonRefusals,
    { status: 403, schema: responseSchema(type({ error: "'invalid_origin'" })) },
    {
      status: 400,
      schema: responseSchema(
        type({
          error:
            "'invalid_body' | 'invalid_json' | 'invalid_plan_artifacts' | 'unsupported_plan_version'",
        }),
      ),
    },
    {
      status: 409,
      schema: responseSchema(
        type({
          error:
            "'reference_changed' | 'live_plan_changed' | 'connected_plan' | 'live_plan_unavailable'",
        }),
      ),
    },
  ],
  document: { summary: 'Register an ordinary WBS plan reference using exact expected acceptance.' },
} as const satisfies EndpointShape);

/** Reads the active lock and write basis, or the exact artifacts by historical version and digest. */
export const readAcceptedPlanReference = defineEndpointShape({
  method: 'GET',
  path: collection,
  operationId: 'getApiProjectsByIdAcceptedPlanReferences',
  params,
  query: requestSchema(historyQuery),
  policies: [
    { kind: 'organization-resource', operation: 'read' },
    { kind: 'identity', require: 'signed-in' },
  ],
  responses: [{ kind: 'json', status: 200, schema: responseSchema(active.or(historical)) }],
  refusals: [
    ...commonRefusals,
    { status: 400, schema: responseSchema(type({ error: "'invalid_body'" })) },
  ],
  document: {
    summary: 'Read an active or historical accepted plan reference.',
    description:
      'Supply both version and referenceDigest to read the retained artifacts. A scoped lookup without either selector reads the active lock and write basis.',
  },
} as const satisfies EndpointShape);
