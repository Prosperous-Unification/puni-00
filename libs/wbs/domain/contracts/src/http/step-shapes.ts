import { PERMISSIONS } from '@wbs/domain/access-role';
import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { requestSchema, responseSchema } from './schema-shape';

const stepParams = requestSchema(type({ id: 'string', stepId: 'string' }));
/**
 * One step as every read and write returns it.
 *
 * `code` has three readings, and they are different facts. A string is the
 * step's code. `null` is an **uncoded** step — written mid-swap by an older
 * release and not yet backfilled — which a reader must render as such. Absent
 * is an **older be-01** that predates step codes answering a newer client:
 * blue and green, or a rolled-back backend, can pair them, and refusing that
 * answer would turn every step read and write into `invalid_response`. Every
 * be-01 that knows codes sends the key, which its mounted tests assert.
 *
 * `allowancePercent` is optional for the same reason: absent is an older
 * be-01 that predates step allowances, which charged every step at 0%. Every
 * be-01 that knows allowances sends it.
 *
 * Proof: with `code` required, `still reads a step from a be-01 that predates
 * step codes` in `step-shapes.test.ts` failed on `must have required property
 * 'code'`; watched 2026-09-27.
 */
export const stepShape = type({
  id: 'string',
  workPackageId: 'string',
  name: 'string',
  position: 'number',
  'code?': 'string | null',
  'allowancePercent?': 'number',
  // Proof: requiring this field refused the pre-unit backend fixture; malformed present hours remains refused (step-shapes.test.ts, 2026-10-12).
  // An older backend predates units and can only answer workday steps.
  'estimateUnit?': "'workdays' | 'minutes'",
});
const stepReply = responseSchema(type({ step: stepShape }));
const policies = [
  // Proof: removing origin or weakening write-scope independently reached JSON
  // parsing,400 instead of403 in the mounted step-policy case.
  { kind: 'origin', when: 'always-unsafe-with-session-cookie' },
  { kind: 'identity', require: 'write-scope' },
] as const;
const sharedRefusals = [
  { status: 400, schema: responseSchema(type({ error: "'invalid_query' | 'invalid_params'" })) },
  { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
  {
    status: 403,
    schema: responseSchema(type({ error: "'invalid_origin' | 'insufficient_scope'" })),
  },
  {
    status: 403,
    schema: responseSchema(
      type({
        error: "'forbidden'",
        'permission?': type.enumerated(...PERMISSIONS.map(({ id }) => id)),
      }),
    ),
  },
  organizationRefusal,
  organizationContextRefusal,
  { status: 404, schema: responseSchema(type({ error: "'not_found'" })) },
] as const;
/**
 * Explicit values for one current package/step pair. Shared definition metadata
 * and binding membership belong to their organization/scope routes. Allowance
 * arrives as integer hundredths of a percent; allowance commands retain undo/redo.
 */
export const patchWorkPackageStepValues = defineEndpointShape({
  method: 'PATCH',
  path: '/api/work-packages/:id/steps/:stepId',
  operationId: 'patchWorkPackageStepValues',
  policies: [...policies, { kind: 'organization-resource', operation: 'mutation' }],
  params: stepParams,
  body: requestSchema(
    type({
      'estimateUnit?': "'workdays' | 'minutes'",
      'allowanceBps?': '0 <= number.integer <= 100000',
    }),
  ),
  bodyMedia: ['application/json', 'application/x-www-form-urlencoded', 'multipart/form-data'],
  responses: [{ kind: 'json', status: 200, schema: stepReply }],
  refusals: [
    ...sharedRefusals,
    { status: 400, schema: responseSchema(type({ error: "'invalid_json'" })) },
    { status: 422, schema: responseSchema(type({ error: "'invalid_body'" })) },
    { status: 422, schema: responseSchema(type({ error: "'calendar_range'" })) },
    {
      status: 409,
      schema: responseSchema(type({ error: "'estimates_present'", count: 'number' })),
    },
  ] as const,
  document: { summary: 'Set the addressed work package step unit or allowance.' },
} as const);
