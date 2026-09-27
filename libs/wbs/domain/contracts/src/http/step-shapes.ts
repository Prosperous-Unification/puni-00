import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { requestSchema, responseSchema } from './schema-shape';

const projectParams = requestSchema(type({ id: 'string' }));
const stepParams = requestSchema(type({ id: 'string', stepId: 'string' }));
/**
 * Whitespace is a domain name refusal, not a structural request defect. The
 * allowance a step is added with is optional and omitted means 0%; it is
 * structurally a number here, and its 0–1000, two-decimal range is the
 * domain's `allowancePercentOf`, refused as `invalid_allowance`.
 */
// Proof: using responseSchema admitted the extra name body,200 instead of422
// in step.controller.db.test.ts's undeclared-input case.
const addBody = requestSchema(type({ name: 'string', 'allowancePercent?': 'number' }));
/** A rename, an allowance edit, or both; an empty body is `invalid_body`. */
const patchBody = requestSchema(type({ 'name?': 'string', 'allowancePercent?': 'number' }));
const stepReply = responseSchema(
  type({
    step: {
      id: 'string',
      projectId: 'string',
      name: 'string',
      position: 'number',
      allowancePercent: 'number',
    },
  }),
);
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
  {
    status: 422,
    schema: responseSchema(type({ error: "'invalid_body' | 'invalid_allowance'" })),
  },
] as const;

/** Adds a named step to a project, with an optional allowance; retains the 200 response. */
export const addStep = defineEndpointShape({
  method: 'POST',
  path: '/api/projects/:id/steps',
  operationId: 'postApiProjectsByIdSteps',
  policies,
  params: projectParams,
  body: addBody,
  bodyMedia: ['application/json', 'application/x-www-form-urlencoded', 'multipart/form-data'],
  responses: [{ kind: 'json', status: 200, schema: stepReply }],
  refusals: nameRefusals,
  document: { summary: 'Add a project step.' },
});

/**
 * Renames the addressed project step, sets its estimate allowance, or both.
 * The allowance edit is the journalled `setStepAllowance` command — one undo —
 * applied after the rename.
 */
export const renameStep = defineEndpointShape({
  method: 'PATCH',
  path: '/api/projects/:id/steps/:stepId',
  operationId: 'patchApiProjectsByIdStepsByStepId',
  policies,
  params: stepParams,
  body: patchBody,
  bodyMedia: ['application/json', 'application/x-www-form-urlencoded', 'multipart/form-data'],
  responses: [{ kind: 'json', status: 200, schema: stepReply }],
  refusals: nameRefusals,
  document: { summary: 'Rename a project step or set its estimate allowance.' },
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
  ],
  document: { summary: 'Remove a project step, confirming cascade when it is used.' },
});
