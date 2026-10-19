import { type } from 'arktype';

import { commandKindsType, commandParserRefusal } from './command-parser-refusal';
import { defineEndpointShape } from './endpoint-shape';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { planCommandsBody } from './plan-command-shapes';
import { engineUnavailableRefusal } from './scheduler-shapes';
import { requestSchema, responseSchema } from './schema-shape';
import { stepBlockageInactiveRefusal } from './step-blockage-refusal';
import { WORK_ITEM_OUTLINE } from './work-item-fields';
import { numberedWorkItem, workItemSlice, workItemTree } from './work-item-response';

export { commandParserRefusal } from './command-parser-refusal';

const context = { at: 'number', kind: commandKindsType } as const;
const named = type({ id: 'string', name: 'string' });
const effect = type({ kind: "'assignment_dropped'", step: named })
  .or({ kind: "'label_nulled'" })
  .or({ kind: "'label_removed'" })
  .or({ kind: "'capacity_released'", size: 'number', fromId: 'string' })
  .or({
    kind: "'assumed_assignee_changed'",
    assumedNow: 'string | null',
    assumedAfter: 'string | null',
  });
const usage = type({
  projects: type({
    id: 'string',
    name: 'string',
    workItems: type({
      id: 'string',
      number: 'string',
      name: 'string',
      effects: effect.array(),
    }).array(),
  }).array(),
  members: named.array(),
});
/**
 * The wire omits the producer kind. Known fields are reserved across variants;
 * unknown additive fields remain readable. The binding checks producer-specific
 * required fields before erasing its internal kind. An untagged client cannot
 * infer that a missing membership belongs to a patch response.
 */
const appliedResults = type({
  results: type({
    index: 'number',
    'id?': 'string',
    'ref?': 'string',
    // Proof: widening known kind/serviceIds admitted malformed fields on createTeam,200 instead of500 in the mounted results case.
    'entity?': {
      id: 'string',
      name: 'string',
      'kind?': "'person' | 'agent'",
      'serviceIds?': 'string[]',
      'teamIds?': 'string[]',
    },
    // A `claimWorkItem` result: whether it wrote nothing, and the claims holding the steps.
    'alreadyHeld?': 'boolean',
    'claimIds?': 'string[]',
  }).array(),
});
const claimHolder = type({
  claimId: 'string',
  personId: 'string',
  name: 'string',
  runId: 'string | null',
});
export const commandResults = responseSchema(appliedResults);
const readPolicies = [{ kind: 'identity', require: 'signed-in' }] as const;
// Proof: removing origin or weakening write scope reached malformed JSON,400 instead of403 in the mounted policy cases.
const writePolicies = [
  { kind: 'origin', when: 'always-unsafe-with-session-cookie' },
  { kind: 'identity', require: 'write-scope' },
] as const;
const params = requestSchema(type({ id: 'string' }));
const genericRefusals = [
  {
    status: 400,
    schema: responseSchema(
      type({ error: "'invalid_params' | 'invalid_query' | 'invalid_body' | 'invalid_json'" }),
    ),
  },
  { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
] as const;
const writeRefusals = [
  ...genericRefusals,
  {
    status: 403,
    schema: responseSchema(type({ error: "'invalid_origin' | 'insufficient_scope'" })),
  },
] as const;
/**
 * A batch refused whole, before any command: the caller's organization does
 * not own the project (the same 404 as an absent one) or its role may not
 * write there. Answered only after organization activation.
 */
const scopedBatchRefusals = [
  organizationRefusal,
  organizationContextRefusal,
  { status: 403, schema: responseSchema(type({ error: "'forbidden'" })) },
  { status: 404, schema: responseSchema(type({ error: "'not_found'" })) },
] as const;
const batchRefusals = [
  ...writeRefusals,
  ...scopedBatchRefusals,
  { status: 400, schema: commandParserRefusal },
  {
    status: 400,
    schema: responseSchema(
      type.or(
        type({ ...context, error: "'too_many_commands'" }),
        type({ ...context, error: "'project_required'" }),
        type({ ...context, error: "'unknown_ref'" }),
        type({ ...context, error: "'missing_id'" }),
        type({ ...context, error: "'duplicate_ref'" }),
        type({ ...context, error: "'name_required'" }),
        type({ ...context, error: "'strategy_required'" }),
        type({ ...context, error: "'has_children'" }),
        type({ ...context, error: "'not_before_reason_needs_a_date'" }),
        type({ ...context, error: "'work_item_takes_one_type'" }),
        type({ ...context, error: "'invalid_kind'" }),
        type({ ...context, error: "'nothing_to_change'" }),
      ),
    ),
  },
  {
    status: 403,
    schema: responseSchema(
      type.or(
        type({ ...context, error: "'forbidden'" }),
        // `claimWorkItem`/`releaseWorkItem`: the caller may not act as the person named.
        type({ ...context, error: "'person_not_bound'" }),
        type({ ...context, error: "'credential_not_for_person'" }),
        type({ ...context, error: "'parent_claim_foreign'" }),
      ),
    ),
  },
  {
    status: 404,
    schema: responseSchema(
      type.or(
        type({ ...context, error: "'not_found'" }),
        type({ ...context, error: "'parent_claim_unknown'" }),
        type({ ...context, error: "'unknown_step'" }),
        type({ ...context, error: "'unknown_dependency'" }),
        type({ ...context, error: "'unknown_metric'" }),
        type({ ...context, error: "'unknown_person'" }),
        type({ ...context, error: "'unknown_team'" }),
        type({ ...context, error: "'unknown_tag'" }),
        type({ ...context, error: "'unknown_service'" }),
        type({ ...context, error: "'unknown_type'" }),
        type({ ...context, error: "'unknown_system'" }),
        type({ ...context, error: "'unknown_attempt'" }),
      ),
    ),
  },
  {
    status: 409,
    schema: responseSchema(
      type.or(
        type({ ...context, error: "'cycle'" }),
        // Retired at ADR 0023 and deliberately kept: no release since refuses a
        // move for a frozen number, but an outgoing be-01 can answer a browser
        // holding the incoming fe-01 for the length of a swap, and an arm this
        // union lacks is a 409 the client cannot parse at all.
        type({ ...context, error: "'frozen'" }),
        // `arrangeBySchedule` while the project's selected optimized variant is
        // still solving, and on a deployment with no optimizer installed.
        type({ ...context, error: "'schedule_not_ready'" }),
        type({ ...context, error: "'engine_unavailable'" }),
        type({ ...context, error: "'rolled_up'" }),
        type({ ...context, error: "'ancestor'" }),
        // A typed dependency whose endpoints resolve a step node onto itself.
        type({ ...context, error: "'self_node'" }),
        type({ ...context, error: "'not_a_parent'" }),
        type({ ...context, error: "'duplicate_dependency'" }),
        type({ ...context, error: "'too_large'" }),
        // `setStatus` refusals (`add-work-item-statuses`).
        type({ ...context, error: "'readiness_after_progress'" }),
        type({ ...context, error: "'cannot_hold_done'" }),
        type({ ...context, error: "'no_steps'" }),
        // Attempt refusals (`step-node-attempts` D2).
        type({ ...context, error: "'node_done'" }),
        type({ ...context, error: "'attempt_running'" }),
        type({ ...context, error: "'no_running_attempt'" }),
        // Claim refusals that carry nothing beside their reason (`wbs-team-claims`).
        type({ ...context, error: "'parent_claim_not_ancestor'" }),
        type({ ...context, error: "'item_done'" }),
        type({ ...context, error: "'not_claimed_by'" }),
      ),
    ),
  },
  {
    status: 409,
    schema: responseSchema(
      type.or(
        type({ ...context, error: "'not_startable'", status: 'string' }),
        type({ ...context, error: "'step_done'", stepIds: 'string[]' }),
        type({ ...context, error: "'already_claimed'", holders: claimHolder.array() }),
        type({ ...context, error: "'inside_subtree_claim'", holder: claimHolder }),
        type({ ...context, error: "'overlaps_subtree_claim'", holder: claimHolder }),
      ),
    ),
  },
  { status: 409, schema: responseSchema(type({ ...context, error: "'taken'", name: 'string' })) },
  { status: 409, schema: responseSchema(type({ ...context, error: "'in_use'", usage })) },
  {
    status: 409,
    schema: responseSchema(
      type.or(
        // Proof: removing this arm made mounted create/batch refusals return 500, 2026-10-17.
        type({
          ...context,
          error: "'referenced_by_step_parallel'",
          nodes: type({ workItemId: 'string', stepId: 'string' }).array(),
        }),
        type({ ...context, error: "'node_on_parent'", dependencyIds: 'string[]' }),
        type({ ...context, error: "'descendant_step_on_leaf'", dependencyIds: 'string[]' }),
      ),
    ),
  },
  {
    status: 422,
    schema: responseSchema(
      type.or(
        type({ ...context, error: "'minutes_not_integer'" }),
        type({ ...context, error: "'minutes_above_max'" }),
        type({ ...context, error: "'invalid_estimate'" }),
        type({ ...context, error: "'calendar_range'" }),
        type({ ...context, error: "'unsupported_relationship_type'" }),
        type({ ...context, error: "'attempt_in_future'" }),
        type({ ...context, error: "'attempt_ends_before_start'" }),
        type({
          ...context,
          error: "'deadline_before_project_start'",
          workItemId: 'string',
          projectDayZero: 'string',
        }),
      ),
    ),
  },
] as const;

/**
 * Reads the complete tree, this account's conditional undo state, and current
 * step addresses. The two address fields are optional on the wire because a
 * newer client can read an older be-01 during blue/green swap or after rollback.
 * Every be-01 that knows these fields sends both; they stay outside
 * {@link workItemTree} so embedded plan documents retain their existing shape.
 *
 * Proof: with both address fields required, `tree boundary refuses missing core
 * producer fields while allowing additive metadata` failed on `must have
 * required property 'addressRevision'` and `must have required property
 * 'stepNodes'`; watched 2026-09-27. With `addressRevision` and `reference`
 * widened to `unknown`, the same test's malformed-present cases failed on
 * `Expected issues, Received: undefined`; watched 2026-09-27.
 */
export const getWorkItems = defineEndpointShape({
  method: 'GET',
  path: '/api/projects/:id/work-items',
  operationId: 'getApiProjectsByIdWork-items',
  policies: [...readPolicies, { kind: 'organization-resource', operation: 'read' }],
  params,
  // `full=true` names today's whole dump explicitly and answers it byte for
  // byte; the paged read is getWorkItemRows. Callers that must also reach a
  // be-01 older than this query keep sending nothing: that be-01 refuses it.
  query: requestSchema(type({ 'full?': "'true'" })),
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        workItemTree.and({
          undoable: 'boolean',
          redoable: 'boolean',
          'addressRevision?': 'string',
          'stepNodes?': type({
            id: 'string',
            workItemId: 'string',
            stepId: 'string',
            reference: 'string | null',
          }).array(),
          // The zone a step card reads attempt instants in
          // (`step-node-attempts` D7); optional for an older be-01 mid-swap.
          'timezone?': 'string',
        }),
      ),
    },
  ],
  refusals: [
    ...genericRefusals,
    { status: 404, schema: responseSchema(type({ error: "'not_found'" })) },
    organizationRefusal,
    organizationContextRefusal,
    engineUnavailableRefusal,
  ],
  document: {
    summary: 'Read the whole project work-item tree, every field included.',
    description:
      'Answers every work item with notes, schedule and slices, plus the project’s steps and settings: hundreds of KB on a large project. full=true answers the same dump. Use list work-item rows (getApiProjectsByIdWork-item-rows) for paged reads; this tool is for export only. For a page of work items use getApiProjectsByIdWork-item-rows; for one work item in full use getApiProjectsByIdWork-itemsByWorkItemId.',
  },
});

/**
 * A work-item page row: the outline always, every other tree field only when
 * its field group was named, and `slices` only for the `slices` group.
 */
export const workItemRow = numberedWorkItem
  .pick(...WORK_ITEM_OUTLINE)
  .and({ updatedAt: 'number | null', 'slices?': workItemSlice.array() })
  .and(numberedWorkItem.omit(...WORK_ITEM_OUTLINE).partial());

/**
 * One page of a project's work items in tree order (spec `list-reads`). Tree
 * order and every derived field are computed over the whole project before any
 * filter; the cursor names the last row answered. A cursor whose work item has
 * left the project answers 409 `stale_cursor`; a `parentId` naming no work item
 * of the project answers 404 `unknown_parent`.
 */
export const getWorkItemRows = defineEndpointShape({
  method: 'GET',
  path: '/api/projects/:id/work-item-rows',
  operationId: 'getApiProjectsByIdWork-item-rows',
  policies: [...readPolicies, { kind: 'organization-resource', operation: 'read' }],
  params,
  query: requestSchema(
    type({
      'q?': 'string',
      'status?': 'string',
      'parentId?': 'string',
      'depth?': 'string',
      'updatedSince?': 'string',
      'fields?': 'string',
      'limit?': 'string',
      'cursor?': 'string',
    }),
  ),
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({ rows: workItemRow.array(), nextCursor: 'string | null', projectRevision: 'number' }),
      ),
    },
  ],
  refusals: [
    ...genericRefusals,
    { status: 404, schema: responseSchema(type({ error: "'not_found'" })) },
    { status: 404, schema: responseSchema(type({ error: "'unknown_parent'" })) },
    organizationRefusal,
    organizationContextRefusal,
    engineUnavailableRefusal,
    { status: 409, schema: responseSchema(type({ error: "'stale_cursor'" })) },
  ],
  document: {
    summary: 'Read a page of a project’s work items in tree order, outline fields by default.',
    description:
      'Each row has id, projectId, parentId, number, name, status, dates, revision and updatedAt. fields adds comma-separated groups: notes, schedule, slices, estimates, constraints, labels. Filters: q (name contains, case-insensitive), status (comma-separated statuses), parentId (rows below that work item) with depth (levels below it, or below the top), updatedSince (epoch ms, inclusive; filters the row’s own last write (its stamp also moves when siblings are respaced), not re-derived number, status or dates). limit is 1-200, default 25; pass nextCursor back as cursor until it is null.',
  },
});

/** One work item with every whole-tree field, its own slices and its update instant. */
export const getWorkItem = defineEndpointShape({
  method: 'GET',
  path: '/api/projects/:id/work-items/:workItemId',
  operationId: 'getApiProjectsByIdWork-itemsByWorkItemId',
  policies: [...readPolicies, { kind: 'organization-resource', operation: 'read' }],
  params: requestSchema(type({ id: 'string', workItemId: 'string' })),
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({
          workItem: numberedWorkItem.and({
            updatedAt: 'number | null',
            slices: workItemSlice.array(),
          }),
          projectRevision: 'number',
        }),
      ),
    },
  ],
  refusals: [
    ...genericRefusals,
    { status: 404, schema: responseSchema(type({ error: "'not_found'" })) },
    organizationRefusal,
    organizationContextRefusal,
    engineUnavailableRefusal,
  ],
  document: { summary: 'Read one work item in full, with its own slices.' },
});

/** Resolves a readable step address against the revision returned by the work-item read. */
export const getStepReference = defineEndpointShape({
  method: 'GET',
  path: '/api/projects/:id/step-references',
  operationId: 'getApiProjectsByIdStep-references',
  policies: [...readPolicies, { kind: 'organization-resource', operation: 'read' }],
  params,
  query: requestSchema(type({ reference: 'string', revision: 'string' })),
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({ stepNodeId: 'string', workItemId: 'string', stepId: 'string', reference: 'string' }),
      ),
    },
  ],
  refusals: [
    ...genericRefusals,
    { status: 404, schema: responseSchema(type({ error: "'not_found'" })) },
    organizationRefusal,
    organizationContextRefusal,
    {
      status: 409,
      schema: responseSchema(
        type({ error: "'stale_address_revision'", addressRevision: 'string' }),
      ),
    },
    {
      status: 422,
      schema: responseSchema(
        type({
          error: "'unresolvable_reference'",
          reason:
            "'malformed' | 'unknown_work_item' | 'ambiguous_work_item' | 'parent' | 'unknown_code' | 'alias_mismatch'",
        }),
      ),
    },
  ],
  document: {
    summary:
      'Resolve a step reference such as 010.s1-dev to its step node ID. Pass the addressRevision the work-item read returned (not projectRevision). A 409 means addresses changed since that read: read the work items again and re-check which step you mean before resolving.',
  },
});

/** Applies every command kind atomically; semantic parsing precedes the 200-command cap. */
export const applyProjectCommands = defineEndpointShape({
  method: 'POST',
  path: '/api/projects/:id/commands',
  operationId: 'postApiProjectsByIdCommands',
  policies: [...writePolicies, { kind: 'organization-resource', operation: 'mutation' }],
  params,
  body: planCommandsBody,
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(appliedResults.and({ undoable: 'boolean', redoable: 'boolean' })),
    },
  ],
  refusals: [...batchRefusals, stepBlockageInactiveRefusal],
  document: { summary: 'Apply a batch of commands to a project, all or none.' },
});

/** Directory requests retain plan kinds so project_required keeps its command index. */
export const applyDirectoryCommands = defineEndpointShape({
  policies: [...writePolicies, { kind: 'organization-resource', operation: 'mutation' }],
  method: 'POST',
  path: '/api/directory/commands',
  operationId: 'postApiDirectoryCommands',
  body: planCommandsBody,
  responses: [{ kind: 'json', status: 200, schema: commandResults }],
  refusals: [...batchRefusals, stepBlockageInactiveRefusal],
  document: { summary: 'Apply a batch of directory commands, all or none.' },
});
const undoResponses = [
  {
    kind: 'json',
    status: 200,
    schema: responseSchema(type({ done: 'string', detail: 'string | null' })),
  },
] as const;
const undoRefusals = [
  stepBlockageInactiveRefusal,
  ...writeRefusals,
  organizationRefusal,
  organizationContextRefusal,
  { status: 403, schema: responseSchema(type({ error: "'forbidden'" })) },
  { status: 404, schema: responseSchema(type({ error: "'not_found'" })) },
  {
    status: 409,
    schema: responseSchema(
      type({ error: "'nothing_to_undo' | 'stale_undo'", detail: 'string | null' }),
    ),
  },
] as const;
/** Reverses this account's last unchanged project batch. */
export const undoProject = defineEndpointShape({
  method: 'POST',
  path: '/api/projects/:id/undo',
  operationId: 'postApiProjectsByIdUndo',
  policies: [...writePolicies, { kind: 'organization-resource', operation: 'mutation' }],
  params,
  responses: undoResponses,
  refusals: undoRefusals,
  document: { summary: 'Undo a project batch.' },
});
/** Reapplies this account's last reversed project batch. */
export const redoProject = defineEndpointShape({
  method: 'POST',
  path: '/api/projects/:id/redo',
  operationId: 'postApiProjectsByIdRedo',
  policies: [...writePolicies, { kind: 'organization-resource', operation: 'mutation' }],
  params,
  responses: undoResponses,
  refusals: undoRefusals,
  document: { summary: 'Redo a project batch.' },
});
