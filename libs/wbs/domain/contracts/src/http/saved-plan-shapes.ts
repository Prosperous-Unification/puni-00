import { PERMISSIONS } from '@wbs/domain/access-role';
import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { requestSchema, responseSchema } from './schema-shape';

const params = requestSchema(type({ id: 'string' }));
// Proof: removing read identity returned422 instead of401 in the mounted policy case
// in saved-plan.controller.db.test.ts.
const readPolicies = [{ kind: 'identity', require: 'signed-in' }] as const;
// Proof: removing origin or weakening write-scope returned400 instead of403
// in the mounted policy case (saved-plan.controller.db.test.ts).
const writePolicies = [
  { kind: 'origin', when: 'always-unsafe-with-session-cookie' },
  { kind: 'identity', require: 'write-scope' },
] as const;
const bodyMedia = [
  'application/json',
  'application/x-www-form-urlencoded',
  'multipart/form-data',
] as const;
const storedBody = type({ schemaVersion: 'number', bytes: 'string', sha256: 'string' });
// Proof: optional algorithmId returned200 instead of500 in the mounted
// stored-response case (saved-plan.controller.db.test.ts).
const schedule = type({
  present: 'true',
  body: storedBody,
  inputSha256: 'string',
  algorithmId: 'string',
}).or({ present: 'false', absentReason: 'string' });
const savedPlan = type({
  id: 'string',
  workPackageId: 'string',
  name: 'string',
  createdBy: 'string',
  createdAt: 'number',
  input: storedBody,
  schedule,
});
const integrity = type({
  reason: "'body_missing'",
  savedPlanId: 'string',
  body: "'input' | 'schedule'",
})
  .or({
    reason: "'body_hash_mismatch'",
    savedPlanId: 'string',
    body: "'input' | 'schedule'",
    stored: 'string',
    recomputed: 'string',
  })
  .or({
    reason: "'schedule_input_mismatch'",
    savedPlanId: 'string',
    body: "'schedule'",
    scheduleInputSha256: 'string',
    inputSha256: 'string',
  })
  .or({
    reason: "'input_version_unreadable'",
    savedPlanId: 'string',
    body: "'input'",
    storedVersion: 'number',
    readerVersion: 'number',
    versionReason: "'from-the-future' | 'no-upgrade-path' | 'not-a-version'",
  })
  .or({
    reason: "'body_invalid'",
    savedPlanId: 'string',
    body: "'input' | 'schedule'",
    // Proof: making path or code optional returned 422 instead of 500 for malformed
    // refusals on mounted read/compare (optional-refusal-{path,code}.log.txt).
    path: 'string',
    code: 'string',
  });
const commonRefusals = [
  { status: 400, schema: responseSchema(type({ error: "'invalid_params'" })) },
  { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
  organizationRefusal,
  organizationContextRefusal,
  {
    status: 501,
    schema: responseSchema(
      type({
        error: "'unsupported_body_version'",
        savedPlanId: 'string',
        body: "'input' | 'schedule'",
        version: 'number',
        supported: 'number[]',
      }),
    ),
  },
] as const;
const notFound = { status: 404, schema: responseSchema(type({ error: "'not_found'" })) } as const;
const readRefusals = [
  ...commonRefusals,
  notFound,
  { status: 400, schema: responseSchema(type({ error: "'invalid_body' | 'invalid_query'" })) },
] as const;
const writeRefusals = [
  ...commonRefusals,
  notFound,
  { status: 400, schema: responseSchema(type({ error: "'invalid_query'" })) },
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
  { status: 503, schema: responseSchema(type({ error: "'snapshot_busy'" })) },
] as const;
const nameRefusals = [
  ...writeRefusals,
  { status: 400, schema: responseSchema(type({ error: "'invalid_json'" })) },
  { status: 422, schema: responseSchema(type({ error: "'invalid_body'" })) },
] as const;

/**
 * A required save object with an optional name; {} selects the server's timestamp.
 * Proof: dropping minimum length or replacing requestSchema with responseSchema
 * returned201 instead of422 in the mounted name-admission case. Optional
 * createdById returned201 instead of500 in the mounted stored-response case
 * (saved-plan.controller.db.test.ts).
 */
export const savePlan = defineEndpointShape({
  method: 'POST',
  path: '/api/work-packages/:id/saved-plans',
  operationId: 'postApiWorkPackagesByIdSaved-plans',
  policies: [...writePolicies, { kind: 'organization-resource', operation: 'mutation' }],
  params,
  body: requestSchema(type({ 'name?': 'string > 0' })),
  bodyMedia,
  responses: [
    {
      kind: 'json',
      status: 201,
      schema: responseSchema(type({ savedPlan: savedPlan.and({ createdById: 'string | null' }) })),
    },
  ],
  refusals: [
    ...nameRefusals,
    {
      status: 409,
      schema: responseSchema(
        type({
          error: "'quota'",
          refusal: {
            limit: "'body_bytes' | 'plan_count' | 'work_package_bytes'",
            asked: 'number',
            allowed: 'number',
          },
        }),
      ),
    },
  ],
  document: { summary: 'Save a work package plan.' },
});

/** Lists saved headers and their byte budgets without parsing stored bodies. */
export const listSavedPlans = defineEndpointShape({
  method: 'GET',
  path: '/api/work-packages/:id/saved-plans',
  operationId: 'getApiWorkPackagesByIdSaved-plans',
  policies: [...readPolicies, { kind: 'organization-resource', operation: 'read' }],
  params,
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({
          savedPlans: type({
            id: 'string',
            name: 'string',
            createdBy: 'string',
            createdAt: 'number',
            inputBytes: 'number',
            scheduleBytes: 'number | null',
            scheduleAbsentReason: 'string | null',
          }).array(),
        }),
      ),
    },
  ],
  refusals: readRefusals,
  document: { summary: 'List saved work package plans.' },
});

/** Historical difference values are opaque; their category and path remain validated. */
const difference = type({
  category: type.enumerated(
    'added',
    'removed',
    'renamed',
    'reparented',
    'retired-field',
    'reordered',
    'estimates',
    'uncertainty',
    'actuals',
    'progress',
    'measures',
    'ownership',
    'dependencies',
    'settings',
    'freeze',
    'type',
    'tags',
    'external-references',
    'notes',
    'priority',
    'max-parallel',
    'service-assignment',
    'start-no-earlier-than',
    'priority-bands',
    'capacity',
    'registry',
    'dates',
    'other',
  ),
  path: 'string',
  left: 'unknown',
  right: 'unknown',
});

const comparisonWorkPackage = type({
  workPackageId: 'string',
  name: 'string',
  abbreviation: 'string',
});
const comparisonVariant = type({
  state: "'ready'",
  questionHash: 'string',
  proof: "'proven' | 'incomplete' | 'quantisation-floor'",
  chosen: "'baseline' | 'optimized'",
})
  .or({
    state: "'boundary-infeasible'",
    questionHash: 'string',
    evidence: "'contradictory-bounds' | 'initial-model-infeasible'",
  })
  .or({ state: "'pending' | 'retrying' | 'idle'" })
  .or({
    state: "'failed'",
    reason:
      "'timeout' | 'invalid-output' | 'no-solution' | 'internal-error' | 'oom' | 'horizon-overflow' | 'objective-overflow'",
  })
  .or({ state: "'corrupt'", message: 'string' })
  .or({
    state: "'plan-infeasible'",
    items: type({
      ownerWorkItemId: 'string',
      boundWorkItemId: 'string',
      effectiveDeadlineOffset: 'number',
    })
      .array()
      .readonly(),
  });
const comparisonStage = comparisonWorkPackage.and({
  engine: "'fast' | 'optimized'",
  objective: "'pri' | 'time'",
  observation: type({
    inputHash: 'string',
    contractVersion: 'string',
    budgetMs: 'number',
    quantum: 'number',
    wireVersion: 'number',
  }).or('null'),
  selected: "'pri' | 'time' | null",
  variants: type({ pri: comparisonVariant, time: comparisonVariant }).or('null'),
  boundary: {
    kind: "'connected-stage'",
    workPackageId: 'string',
    format: "'connected-stage-v1' | 'connected-stage-v2'",
    canonical: 'string',
    originOrdinal: 'number',
    // Proof: optional fixed/canonical/originOrdinal accepted malformed mounted summaries (500 became 200).
    fixed: type({
      workPackageId: 'string',
      workItemId: 'string',
      stepId: 'string | null',
      workPackageName: 'string',
      workPackageAbbreviation: 'string',
      workItemName: 'string',
      stepName: 'string | null',
      start: 'number',
      finish: 'number',
    })
      .array()
      .readonly(),
  },
});
const comparisonPlacement = type({ kind: "'scheduled'" })
  .or({
    kind: "'dependency_calendar_missing'",
    workPackages: comparisonWorkPackage.array().readonly(),
  })
  .or({
    kind: "'engine_unavailable'",
    engine: "'optimized'",
    workPackages: type('string[]').readonly(),
    reason: "'adapter_missing' | 'connected_optimization_not_supported'",
  })
  .or({ kind: "'unavailable'", reason: "'cycle' | 'calendar_range'" });
const comparisonSide = type({
  source: type({ kind: "'current'" }).or({ kind: "'saved'", savedPlanId: 'string' }),
  // Proof: replacing this endpoint's outer validator with an accepting dependency
  // made the parent-evidence tests first fail on missing left.parent and null
  // right.parent; fresh healthy children passed before and after (2026-11-13).
  parent: type({ kind: "'unrecorded'" }).or({ kind: "'recorded'", projectId: 'string > 0' }),
  schedule: type({ present: 'true', algorithmId: 'string' }).or({
    present: 'false',
    absentReason: 'string',
  }),
  provenance: type({ kind: "'legacy-unknown' | 'local'" }).or({
    kind: "'connected'",
    targetWorkPackageId: 'string',
    mode: "'isolated' | 'shared'",
    placementState: comparisonPlacement,
    workPackages: comparisonWorkPackage.array().readonly(),
    idleWorkPackages: comparisonWorkPackage.array().readonly(),
    stages: comparisonStage.array().readonly(),
  }),
});

/** Compares two saved ids or the exact current sentinel; duplicate queries retain their last value. */
export const compareSavedPlans = defineEndpointShape({
  method: 'GET',
  path: '/api/work-packages/:id/saved-plans/compare',
  operationId: 'getApiWorkPackagesByIdSaved-plansCompare',
  policies: [...readPolicies, { kind: 'organization-resource', operation: 'read' }],
  params,
  query: requestSchema(type({ left: 'string > 0', right: 'string > 0' })),
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({
          diff: { input: difference.array(), schedule: difference.array() },
          // Proof: optional left/right admitted missing summaries in the production schema validator.
          left: comparisonSide,
          right: comparisonSide,
        }),
      ),
    },
  ],
  refusals: [
    ...commonRefusals,
    { status: 400, schema: responseSchema(type({ error: "'invalid_body'" })) },
    // Proof: a parallel tolerant bare404 accepted savedPlanId:42,404 instead
    // of500 in the mounted malformed-comparison-id case.
    {
      status: 404,
      schema: responseSchema(type({ error: "'not_found'", 'savedPlanId?': 'string' })),
    },
    { status: 422, schema: responseSchema(type({ error: "'invalid_query'" })) },
    {
      status: 422,
      schema: responseSchema(
        type({ error: "'corrupt'", savedPlanId: 'string', refusal: integrity }),
      ),
    },
  ],
  document: { summary: 'Compare saved or current work package plans.' },
});

/**
 * Returns verified stored bytes; creation-only creator identity is not required on reads.
 * Proof: requestSchema rejected additive metadata,500 instead of200 in the
 * mounted stored-response case (saved-plan.controller.db.test.ts).
 */
export const readSavedPlan = defineEndpointShape({
  method: 'GET',
  path: '/api/saved-plans/:id',
  operationId: 'getApiSaved-plansById',
  policies: [...readPolicies, { kind: 'organization-resource', operation: 'read' }],
  params,
  responses: [{ kind: 'json', status: 200, schema: responseSchema(type({ savedPlan })) }],
  refusals: [
    ...readRefusals,
    { status: 422, schema: responseSchema(type({ error: "'corrupt'", refusal: integrity })) },
  ],
  document: { summary: 'Read a saved plan.' },
});

/**
 * A rename always names the new value; missing or empty names are refused.
 * Proof: optional name returned500 instead of422; a tolerant body returned200
 * instead of422 in the mounted name-admission case (saved-plan.controller.db.test.ts).
 */
export const renameSavedPlan = defineEndpointShape({
  method: 'PATCH',
  path: '/api/saved-plans/:id',
  operationId: 'patchApiSaved-plansById',
  policies: [...writePolicies, { kind: 'organization-resource', operation: 'mutation' }],
  params,
  body: requestSchema(type({ name: 'string > 0' })),
  bodyMedia,
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(type({ savedPlanId: 'string', name: 'string' })),
    },
  ],
  refusals: nameRefusals,
  document: { summary: 'Rename a saved plan as its creator or work package owner.' },
});

/** Removes a saved plan as its creator or work package owner, returning no representation. */
export const deleteSavedPlan = defineEndpointShape({
  method: 'DELETE',
  path: '/api/saved-plans/:id',
  operationId: 'deleteApiSaved-plansById',
  policies: [...writePolicies, { kind: 'organization-resource', operation: 'mutation' }],
  params,
  responses: [{ kind: 'empty', status: 204 }],
  refusals: [
    ...writeRefusals,
    { status: 400, schema: responseSchema(type({ error: "'invalid_body'" })) },
  ],
  document: { summary: 'Delete a saved plan as its creator or work package owner.' },
});
