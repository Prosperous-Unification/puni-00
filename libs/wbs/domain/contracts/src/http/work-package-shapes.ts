import { PERMISSIONS } from '@wbs/domain/access-role';
import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { planDocumentResponse } from './plan-document-shapes';
import { requestSchema, responseSchema } from './schema-shape';
import { workPackage, workPackageWithSteps } from './work-package-response';

const params = requestSchema(type({ id: 'string' }));
// Proof: removing identity made the mounted unauthenticated work package test receive 500 instead of 401.
const readPolicies = [{ kind: 'identity', require: 'signed-in' }] as const;
// Proof: weakening write scope made the mounted opened test receive 404 instead of 403.
// Removing identity made the complete production-route policy test receive 500 instead of 401
// for postApiWorkPackages; removing Origin made it receive 404 instead of 403 for patchApiWorkPackagesById.
const writePolicies = [
  { kind: 'origin', when: 'always-unsafe-with-session-cookie' },
  { kind: 'identity', require: 'write-scope' },
] as const;
const bodyMedia = [
  'application/json',
  'application/x-www-form-urlencoded',
  'multipart/form-data',
] as const;
const readRefusals = [
  {
    status: 400,
    schema: responseSchema(type({ error: "'invalid_body' | 'invalid_query' | 'invalid_params'" })),
  },
  { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
] as const;
const writeRefusals = [
  { status: 400, schema: responseSchema(type({ error: "'invalid_query' | 'invalid_params'" })) },
  { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
  {
    status: 403,
    schema: responseSchema(type({ error: "'invalid_origin' | 'insufficient_scope'" })),
  },
] as const;
const bodyRefusals = [
  ...writeRefusals,
  { status: 400, schema: responseSchema(type({ error: "'invalid_json'" })) },
  { status: 422, schema: responseSchema(type({ error: "'invalid_body'" })) },
] as const;
const notFound = { status: 404, schema: responseSchema(type({ error: "'not_found'" })) } as const;
const forbidden = {
  status: 403,
  schema: responseSchema(
    type({
      error: "'forbidden'",
      'permission?': type.enumerated(...PERMISSIONS.map(({ id }) => id)),
    }),
  ),
} as const;

/** Creates a work package with its ordered starting steps; empty names remain legal. */
export const createWorkPackage = defineEndpointShape({
  method: 'POST',
  path: '/api/work-packages',
  operationId: 'postApiWorkPackages',
  // Proof: removing this resource policy admitted work package creation (200),
  // failing the mounted mutation inventory; watched 2026-10-13.
  policies: [...writePolicies, { kind: 'organization-resource', operation: 'mutation' }],
  // Proof: a tolerant body made the mounted undeclared-create test receive 200 instead of 422.
  body: requestSchema(
    type({
      name: 'string',
      projectId: type('string > 0').matching(/\S/),
      'abbreviation?': 'string',
    }),
  ),
  bodyMedia,
  responses: [{ kind: 'json', status: 200, schema: workPackageWithSteps }],
  refusals: [
    ...bodyRefusals,
    notFound,
    { status: 422, schema: responseSchema(type({ error: "'project_required'" })) },
    organizationRefusal,
    organizationContextRefusal,
    forbidden,
    { status: 422, schema: responseSchema(type({ error: "'invalid_abbreviation'" })) },
    {
      status: 409,
      schema: responseSchema(type({ error: "'abbreviation_taken' | 'abbreviation_exhausted'" })),
    },
  ],
  document: { summary: 'Create a work package with its starting steps.' },
});

/**
 * Lists complete work package settings with creation-actor display names (spec `list-reads`).
 * Current scoped LIST resolves mode/caller and package.read grants in the same observation
 * as its rows, including current parent, P5 restrictions and credential subject/cap.
 * Before durable activation, explicit legacy access retains deployment-wide reads.
 * Raw resource helpers are separate and do not establish this HTTP grant filtering.
 * With no query string: every readable work package in the caller's recency order
 * and `nextCursor: null`, as before paging existed. With any of `q`,
 * `updatedSince`, `limit` or `cursor`: one page, newest update first, then id.
 * `updatedAt` and `nextCursor` are optional on the wire only so a newer client
 * can read an older be-01 mid-swap; every be-01 that knows them sends both.
 */
export const listWorkPackages = defineEndpointShape({
  method: 'GET',
  path: '/api/work-packages',
  operationId: 'getApiWorkPackages',
  policies: [...readPolicies, { kind: 'organization-resource', operation: 'read' }],
  query: requestSchema(
    type({
      'q?': 'string',
      'updatedSince?': 'string',
      'limit?': 'string',
      'cursor?': 'string',
    }),
  ),
  responses: [
    {
      kind: 'json',
      status: 200,
      // Proof: optional ownerName or lastOpenedAt made the mounted list-metadata test receive
      // 200 instead of 500; strict reply fields instead rejected its additive fields with 500.
      schema: responseSchema(
        type({
          workPackages: workPackage
            .and({
              createdByName: 'string',
              lastOpenedAt: 'number | null',
              'updatedAt?': 'number | null',
            })
            .array(),
          'nextCursor?': 'string | null',
        }),
      ),
    },
  ],
  refusals: [...readRefusals, organizationRefusal, organizationContextRefusal],
  document: {
    summary: 'List work packages; pass limit or q for a page, newest update first.',
    description:
      'Without parameters: every currently readable work package in the caller’s own order. Scoped grants and returned rows share one observation; before organization activation legacy access retains deployment-wide reads. With any of q (name contains, case-insensitive), updatedSince (epoch ms, inclusive), limit (1-200, default 25) or cursor (a nextCursor from this list): one page ordered by last update, newest first. Follow nextCursor until it is null.',
  },
});

/** Records readable caller navigation in its admitted writer; package.write is not required, while write scope remains required. */
export const recordWorkPackageOpen = defineEndpointShape({
  method: 'POST',
  path: '/api/work-packages/:id/opened',
  operationId: 'postApiWorkPackagesByIdOpened',
  policies: [...writePolicies, { kind: 'organization-resource', operation: 'mutation' }],
  params,
  responses: [{ kind: 'empty', status: 204 }],
  refusals: [
    ...writeRefusals,
    notFound,
    organizationRefusal,
    organizationContextRefusal,
    { status: 400, schema: responseSchema(type({ error: "'invalid_body'" })) },
  ],
  document: { summary: 'Record this account opening a work package.' },
});

/** The uncoded-step variant is also retained in the closed export 409 union. */
const uncodedSteps = type({
  error: "'uncoded_steps'",
  steps: type({ id: 'string', name: 'string' }).array(),
  command: 'string',
});

/** An older writer's uncoded steps, with the backfill command that makes them exportable. */
export const uncodedStepsRefusal = { status: 409, schema: responseSchema(uncodedSteps) } as const;

/** Closed 409 variants for structured export, including the version 9 preservation fence. */
export const exportWorkPackage409 = {
  status: 409,
  schema: responseSchema(
    uncodedSteps
      .or({ error: "'engine_unavailable'", engine: "'optimized'" })
      // Proof: removing this variant made both mounted sparse exports500 (mutation-response-schema.txt, 2026-10-17).
      .or({ error: "'unsupported_step_parallelism'" }),
  ),
} as const;

/** Exports the core tree without account-specific undo flags, as JSON or unquoted Markdown. */
export const exportWorkPackage = defineEndpointShape({
  method: 'GET',
  path: '/api/work-packages/:id/export',
  operationId: 'getApiWorkPackagesByIdExport',
  // Proof: signed-in alone made the mounted export-scope test receive 404 instead of 403.
  policies: [
    { kind: 'organization-resource', operation: 'read' },
    { kind: 'identity', require: 'read-scope' },
  ],
  params,
  query: requestSchema(type({ format: "'json' | 'markdown'" })),
  responses: [
    // Proof: omitting the core declaration made the mounted deadline-export test admit
    // a row missing deadline: expected 500, received 200.
    { kind: 'json', status: 200, schema: planDocumentResponse },
    { kind: 'text', status: 200, contentType: 'text/markdown; charset=utf-8' },
  ],
  refusals: [
    ...readRefusals,
    notFound,
    organizationRefusal,
    organizationContextRefusal,
    { status: 403, schema: responseSchema(type({ error: "'insufficient_scope'" })) },
    { status: 400, schema: responseSchema(type({ error: "'unsupported_format'" })) },
    exportWorkPackage409,
  ],
  document: { summary: 'Export the work package WBS and schedule as JSON or Markdown.' },
});

/**
 * Reads settings and ordered steps through the current same-observation package.read decision.
 * Scoped invisible and foreign targets answer the same 404 as absence. The actual durable
 * preactivation mode preserves deployment-wide legacy reads; raw resource helpers are separate.
 */
export const readWorkPackage = defineEndpointShape({
  method: 'GET',
  path: '/api/work-packages/:id',
  operationId: 'getApiWorkPackagesById',
  policies: [...readPolicies, { kind: 'organization-resource', operation: 'read' }],
  params,
  responses: [{ kind: 'json', status: 200, schema: workPackageWithSteps }],
  refusals: [...readRefusals, notFound, organizationRefusal, organizationContextRefusal],
  document: { summary: 'Read a work package and its steps.' },
});

/** Structural weight validation leaves the all-zero sum to WorkPackageService's semantic refusal. */
// Proof: removing the lower bound changed the mounted structural-settings refusal
// from invalid_body to bad_pert_weights. Shared descriptor validation rejects Infinity.
const weight = type('number >= 0');
/** Shape-only date admission preserves the service's bad_start_date for impossible calendar days. */
// Proof: removing the date pattern changed that same test to bad_start_date.
const day = type('string')
  .matching(/^\d{4}-\d{2}-\d{2}$/)
  .or('null');

/** An empty object is a valid patch; omitted fields stay omitted and null clears nullable fields. */
export const patchWorkPackage = defineEndpointShape({
  method: 'PATCH',
  path: '/api/work-packages/:id',
  operationId: 'patchApiWorkPackagesById',
  policies: [...writePolicies, { kind: 'organization-resource', operation: 'mutation' }],
  params,
  // Proof: a tolerant patch admitted undeclared fields in the mounted nested-boundary test (422 → 200).
  body: requestSchema(
    type({
      'name?': 'string',
      'abbreviation?': 'string',
      'restricted?': 'boolean',
      'estimateMethod?': "'pert' | 'optimistic' | 'realistic' | 'pessimistic'",
      'depReach?': "'whole-item' | 'anchor-slice'",
      'pertWeights?': type({ optimistic: weight, realistic: weight, pessimistic: weight }),
      'estimateRounding?': "'exact' | 'floor' | 'round' | 'ceil'",
      'startDate?': day,
      'solutionRef?': type({ slug: 'string > 0', url: 'string > 0' }).or('null'),
      'optimizationEnabled?': 'boolean',
      // Proof: accepting any engine string made the mounted structural-settings test receive 500, not 422.
      'scheduleEngine?': "'fast' | 'optimized'",
      'scheduleObjective?': "'pri' | 'time'",
      // What derived budgets multiply the pessimistic point by
      // (`wbs-measure-budgets` D38); range checked by the service.
      'budgetFactor?': 'number',
      // An IANA zone; the service checks it against the runtime's list, which
      // `GET /api/timezones` serves (`step-node-attempts` D3).
      'timezone?': 'string',
    }),
  ),
  bodyMedia,
  responses: [{ kind: 'json', status: 200, schema: responseSchema(type({ workPackage })) }],
  refusals: [
    {
      status: 409,
      schema: responseSchema(
        type({ error: "'not_overridable_here'", key: "'budgetFactor'", level: "'work_package'" }),
      ),
    },
    ...bodyRefusals,
    notFound,
    organizationRefusal,
    organizationContextRefusal,
    forbidden,
    {
      status: 422,
      schema: responseSchema(
        type({
          error:
            "'bad_start_date' | 'bad_pert_weights' | 'bad_budget_factor' | 'invalid_timezone' | 'invalid_abbreviation'",
        }),
      ),
    },
    {
      status: 409,
      // `dependency_cycle`: a `depReach` change that would close a step-node cycle.
      schema: responseSchema(
        type({
          error:
            "'optimizer_unavailable' | 'solution_taken' | 'dependency_cycle' | 'abbreviation_taken'",
        }),
      ),
    },
  ],
  document: {
    summary: 'Update the addressed work package’s settings.',
    description:
      'Send only the settings to change. budgetFactor is project-only: supplying it here is refused409 not_overridable_here without changing the project or its siblings. Use the admitted project settings endpoint.',
  },
});

// Proof: omitting boundary-infeasible made the generated client refuse its typed 409 as invalid_response (2026-10-22).
const retryRefusal = responseSchema(
  type({ code: "'stale-input-hash'", currentInputHash: 'string' })
    .or({
      code: "'not-retryable'",
      state:
        "'ready' | 'pending' | 'retrying' | 'failed' | 'corrupt' | 'plan-infeasible' | 'boundary-infeasible' | 'idle'",
    })
    .or({ code: "'already-running'" })
    // Proof: removing this variant made the typed client classify its modeled
    // 409 Retry refusal as invalid_response rather than a refusal.
    .or({
      code: "'schedule-input-unavailable'",
      reason: "'engine_unavailable' | 'cycle' | 'calendar_range'",
      workPackageId: 'string',
    })
    // Proof: removing this variant made mounted missing-calendar Retry fail response validation (500).
    .or({
      code: "'schedule-input-unavailable'",
      reason: "'dependency_calendar_missing'",
      workPackageId: 'string',
      workPackages: type({ workPackageId: 'string', abbreviation: 'string', name: 'string' })
        .array()
        .readonly(),
    }),
);

/** Retries one retained failed or corrupt optimizer variant against the current plan input. */
export const retryWorkPackageOptimization = defineEndpointShape({
  method: 'POST',
  path: '/api/work-packages/:id/optimization/retry',
  operationId: 'postApiWorkPackagesByIdOptimizationRetry',
  policies: [...writePolicies, { kind: 'organization-resource', operation: 'mutation' }],
  params,
  // Proof: widening objective to string made the production-path Retry test receive 409 instead of 422.
  body: requestSchema(type({ objective: "'pri' | 'time'", inputHash: 'string' }), {
    undeclaredKeys: 'delete',
  }),
  bodyMedia,
  responses: [
    {
      kind: 'json',
      status: 202,
      schema: responseSchema(
        type({ state: "'retrying'", generation: 'number', inputHash: 'string' }),
      ),
    },
  ],
  refusals: [
    ...bodyRefusals,
    notFound,
    organizationRefusal,
    organizationContextRefusal,
    forbidden,
    { status: 409, schema: retryRefusal },
  ],
  document: { summary: 'Retry one failed or corrupt optimized schedule.' },
});
