import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { requestSchema, responseSchema } from './schema-shape';

const projectParams = requestSchema(type({ id: 'string' }));
const stepParams = requestSchema(type({ id: 'string', stepId: 'string' }));
/** Whitespace is a domain name refusal, not a structural request defect. */
// Proof: using responseSchema admitted the extra name body,200 instead of422
// in step.controller.db.test.ts's undeclared-input case.
const nameBody = requestSchema(type({ name: 'string' }));
/**
 * A new step's name and, optionally, the step code its creator chose; absent,
 * the code is suggested from the name. Grammar and reservation are domain
 * refusals (422), not structural defects, so the code arrives as any string.
 */
const newStepBody = requestSchema(type({ name: 'string', 'code?': 'string' }));
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
 * Proof: with `code` required, `still reads a step from a be-01 that predates
 * step codes` in `step-shapes.test.ts` failed on `must have required property
 * 'code'`; watched 2026-09-27.
 */
export const stepShape = type({
  id: 'string',
  projectId: 'string',
  name: 'string',
  position: 'number',
  'code?': 'string | null',
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
  { status: 403, schema: responseSchema(type({ error: "'forbidden'" })) },
  { status: 404, schema: responseSchema(type({ error: "'not_found'" })) },
] as const;
const nameRefusals = [
  { status: 422, schema: responseSchema(type({ error: "'name_required'" })) },
  ...sharedRefusals,
  { status: 400, schema: responseSchema(type({ error: "'invalid_json'" })) },
  { status: 409, schema: responseSchema(type({ error: "'taken'" })) },
  { status: 422, schema: responseSchema(type({ error: "'invalid_body'" })) },
] as const;

/** Adds a named step to a project; creation retains the existing 200 response. */
export const addStep = defineEndpointShape({
  method: 'POST',
  path: '/api/projects/:id/steps',
  operationId: 'postApiProjectsByIdSteps',
  policies,
  params: projectParams,
  body: newStepBody,
  bodyMedia: ['application/json', 'application/x-www-form-urlencoded', 'multipart/form-data'],
  responses: [{ kind: 'json', status: 200, schema: stepReply }],
  refusals: [
    ...nameRefusals,
    { status: 422, schema: responseSchema(type({ error: "'invalid_code' | 'reserved_code'" })) },
    { status: 409, schema: responseSchema(type({ error: "'code_taken'" })) },
  ] as const,
  document: { summary: 'Add a project step.' },
});

/** Renames the addressed project step without changing its position. */
export const renameStep = defineEndpointShape({
  method: 'PATCH',
  path: '/api/projects/:id/steps/:stepId',
  operationId: 'patchApiProjectsByIdStepsByStepId',
  policies,
  params: stepParams,
  body: nameBody,
  bodyMedia: ['application/json', 'application/x-www-form-urlencoded', 'multipart/form-data'],
  responses: [{ kind: 'json', status: 200, schema: stepReply }],
  refusals: nameRefusals,
  document: { summary: 'Rename a project step.' },
});

/**
 * Removes a step, reporting every usage category before explicit cascade.
 * Cascade remains a string: only its exact value true confirms removal, and
 * repeated query values retain the adapter's legacy last-value reading.
 */
export const removeStep = defineEndpointShape({
  method: 'DELETE',
  path: '/api/projects/:id/steps/:stepId',
  operationId: 'deleteApiProjectsByIdStepsByStepId',
  policies,
  params: stepParams,
  // Proof: the tolerant wrapper deleted the used step,204 instead of400 in
  // the unknown-cascade-query wire case (step.controller.db.test.ts).
  query: requestSchema(type({ 'cascade?': 'string' })),
  responses: [{ kind: 'empty', status: 204 }],
  refusals: [
    ...sharedRefusals,
    { status: 400, schema: responseSchema(type({ error: "'invalid_body'" })) },
    {
      status: 409,
      schema: responseSchema(
        type({
          error: "'in_use'",
          inUse: {
            estimates: 'number',
            actuals: 'number',
            progress: 'number',
            measures: 'number',
            assignments: 'number',
            assumedAssignees: type({
              workItemId: 'string',
              assumedNow: 'string | null',
              assumedAfter: 'string | null',
            }).array(),
          },
        }),
      ),
    },
    {
      status: 409,
      // A typed dependency names the step; it must be removed or reassigned first.
      schema: responseSchema(
        type({ error: "'referenced_by_dependency'", dependencyIds: 'string[]' }),
      ),
    },
    // Removing the step would move a legacy anchor into a step-node cycle.
    { status: 409, schema: responseSchema(type({ error: "'dependency_cycle'" })) },
  ],
  document: { summary: 'Remove a project step, confirming cascade when it is used.' },
});
