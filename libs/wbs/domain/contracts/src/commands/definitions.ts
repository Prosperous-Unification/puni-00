import { type Type, type } from 'arktype';

export type CommandScope = 'project' | 'directory';

type SchemaKind<Schema extends Type> = Schema['infer'] extends {
  kind: infer Kind extends string;
}
  ? Kind
  : never;

type MatchingKind<Kind extends string, Schema extends Type> =
  SchemaKind<Schema> extends Kind ? (Kind extends SchemaKind<Schema> ? unknown : never) : never;

interface CommandDefinition<Schema extends Type> {
  readonly schema: Schema;
  readonly scope: CommandScope;
  readonly description: string;
}

export function defineCommand<const Kind extends string, const Schema extends Type>(
  kind: Kind,
  definition: CommandDefinition<Schema> & MatchingKind<Kind, Schema>,
): CommandDefinition<Schema> {
  return {
    ...definition,
    schema: definition.schema.describe(definition.description),
  };
}

const target = { 'workItemId?': 'string', 'workItemRef?': 'string' } as const;
const placement = {
  'parentId?': 'string | null',
  'parentRef?': 'string',
  'afterId?': 'string | null',
  'afterRef?': 'string',
} as const;
const reference = { 'ref?': 'string' } as const;
const named = { ...reference, name: 'string' } as const;
const step = { ...target, 'stepId?': 'string', 'stepNodeId?': 'string' } as const;
const predecessor = {
  ...target,
  'predecessorId?': 'string',
  'predecessorRef?': 'string',
} as const;
const dependencyEndpoint = type({
  'projectId?': 'string',
  scope: "'whole' | 'node' | 'descendant-step'",
  'workItemId?': 'string',
  'workItemRef?': 'string',
  'stepId?': 'string',
  'stepNodeId?': 'string',
});
const team = { 'teamId?': 'string', 'teamRef?': 'string' } as const;
const person = { 'personId?': 'string', 'personRef?': 'string' } as const;
const tag = { 'tagId?': 'string', 'tagRef?': 'string' } as const;
const service = { 'serviceId?': 'string', 'serviceRef?': 'string' } as const;
const workItemType = { 'typeId?': 'string', 'typeRef?': 'string' } as const;
const resource = { 'resourceId?': 'string', 'resourceRef?': 'string' } as const;
const measure = { 'measureId?': 'string', 'measureRef?': 'string' } as const;
// Proof: admitting frozenNumber failed nested structural validation and made its type fixture report TS2578.
const workItemPatch = type({
  'name?': 'string',
  'notes?': 'string',
  'startNoEarlierThan?': 'string | null',
  'deadline?': 'string | null',
  'factStart?': 'string | null',
  'factEnd?': 'string | null',
  'startNoEarlierThanReason?': 'string | null',
  'priority?': 'number | null',
  'serviceTeamId?': 'string | null',
  'maxParallel?': 'number | null',
  'teamIds?': 'string[]',
  'tagIds?': 'string[]',
  'serviceIds?': 'string[]',
  'typeIds?': 'string[]',
  'teamRefs?': 'string[]',
  'tagRefs?': 'string[]',
  'serviceRefs?': 'string[]',
  'typeRefs?': 'string[]',
  'externalRefs?': type({ systemId: 'string', url: 'string', 'name?': 'string' }).array(),
});

export const commandDefinitions = {
  createWorkItem: defineCommand('createWorkItem', {
    schema: type({
      kind: "'createWorkItem'",
      ...reference,
      ...placement,
      'name?': 'string',
      'notes?': 'string',
      'priority?': 'number | null',
    }),
    scope: 'project',
    description: 'Add a work item. `ref` names it for the rest of this batch.',
  }),
  patchWorkItem: defineCommand('patchWorkItem', {
    schema: type({ kind: "'patchWorkItem'", ...target, patch: workItemPatch }),
    scope: 'project',
    description:
      'Change fields of a work item; only the fields named change. typeIds and typeRefs together name at most one type (a list of zero clears it); more is refused with work_item_takes_one_type.',
  }),
  moveWorkItem: defineCommand('moveWorkItem', {
    schema: type({ kind: "'moveWorkItem'", ...target, ...placement }),
    scope: 'project',
    description:
      'Move a work item under a parent, after a sibling. Refused destination_claimed (names holders) when the parent is a leaf whose steps are claimed.',
  }),
  duplicateWorkItem: defineCommand('duplicateWorkItem', {
    schema: type({ kind: "'duplicateWorkItem'", ...target, ...reference }),
    scope: 'project',
    description: 'Copy a work item with its whole subtree, placed right after it.',
  }),
  deleteWorkItem: defineCommand('deleteWorkItem', {
    schema: type({ kind: "'deleteWorkItem'", ...target, 'strategy?': "'cascade' | 'promote'" }),
    scope: 'project',
    description:
      'Remove a work item. A parent needs a strategy: cascade its children or promote them. Deleting the only child hands its claims back up to the parent; refused children_claimed (names holders) when claims sit on more than one deleted row or on that parent too.',
  }),
  setEstimate: defineCommand('setEstimate', {
    schema: type({
      kind: "'setEstimate'",
      ...step,
      days: { optimistic: 'number', realistic: 'number', pessimistic: 'number' },
    }),
    scope: 'project',
    description:
      'Set the three-point estimate in the step estimate unit (workdays or whole minutes) on a leaf work item. Address it with workItemId/workItemRef and stepId, or stepNodeId (sn1.<workItemId>.<stepId>).',
  }),
  clearEstimate: defineCommand('clearEstimate', {
    schema: type({ kind: "'clearEstimate'", ...step }),
    scope: 'project',
    description:
      'Remove one step’s estimate from a work item. Accepts stepNodeId in place of the work-item and step pair.',
  }),
  setActual: defineCommand('setActual', {
    schema: type({ kind: "'setActual'", ...step, days: 'number' }),
    scope: 'project',
    description:
      'Record the days one step actually took on a work item. Accepts stepNodeId in place of the work-item and step pair.',
  }),
  clearActual: defineCommand('clearActual', {
    schema: type({ kind: "'clearActual'", ...step }),
    scope: 'project',
    description:
      'Remove one step’s actual from a work item. Accepts stepNodeId in place of the work-item and step pair.',
  }),
  setProgress: defineCommand('setProgress', {
    schema: type({ kind: "'setProgress'", ...step, state: "'in_progress' | 'done'" }),
    scope: 'project',
    description:
      'Mark one step of a work item in progress or done. Accepts stepNodeId in place of the work-item and step pair.',
  }),
  setStepBlocked: defineCommand('setStepBlocked', {
    schema: type({ kind: "'setStepBlocked'", ...step, isBlocked: 'boolean' }),
    scope: 'project',
    description:
      'Set or clear direct blockage on one leaf step without changing progress or schedule. Equivalent writes are no-ops; new blockage on done is refused. Accepts stepNodeId in place of the work-item and step pair.',
  }),
  clearProgress: defineCommand('clearProgress', {
    schema: type({ kind: "'clearProgress'", ...step }),
    scope: 'project',
    description:
      'Take a step back to not started. Accepts stepNodeId in place of the work-item and step pair.',
  }),
  startAttempt: defineCommand('startAttempt', {
    schema: type({
      kind: "'startAttempt'",
      ...step,
      'at?': 'number',
      'executorPersonId?': 'string',
      'reference?': 'string',
      'note?': 'string',
    }),
    scope: 'project',
    description:
      'Start the next attempt at one step node, numbered its highest plus one. at is epoch ms, absent means now. Refused node_done on a node stated done, attempt_running while one runs, attempt_in_future after now, budget_exhausted (409) when a strict budget of the work item or an ancestor has nothing left, would go below zero with this attempt’s holdPerAttempt, or cannot be read across two rate cards (blocked, remaining null); the refusal names workItemId, measure, remaining and hold. Advisory and derived budgets never refuse. reference is a URL or label. Accepts stepNodeId in place of the work-item and step pair.',
  }),
  endAttempt: defineCommand('endAttempt', {
    schema: type({
      kind: "'endAttempt'",
      ...step,
      outcome: "'succeeded' | 'failed' | 'cancelled'",
      'at?': 'number',
      'reference?': 'string',
      'note?': 'string',
    }),
    scope: 'project',
    description:
      'End the running attempt at one step node with an outcome. at is epoch ms, absent means now. Refused no_running_attempt, attempt_in_future, or attempt_ends_before_start. Accepts stepNodeId in place of the work-item and step pair.',
  }),
  removeAttempt: defineCommand('removeAttempt', {
    schema: type({ kind: "'removeAttempt'", ...step, attemptNumber: 'number' }),
    scope: 'project',
    description:
      'Remove one attempt at a step node by its number, as a correction; refused unknown_attempt. A removed number is never reused. Accepts stepNodeId in place of the work-item and step pair.',
  }),
  setStatus: defineCommand('setStatus', {
    schema: type({
      kind: "'setStatus'",
      ...target,
      status: "'draft' | 'ready' | 'in_progress' | 'on_hold' | 'blocked' | 'done' | 'unknown'",
      'on?': 'string',
      'factStart?': 'string',
    }),
    scope: 'project',
    description:
      'Set a work item status; on a parent it acts on the leaves beneath. done marks every step done (on = the day it finished, YYYY-MM-DD, absent means today; factStart fills an empty fact start). unknown takes every statement, readiness and hold back and clears both facts of a row that read done. ready/draft set readiness (refused readiness_after_progress once a step has spoken). on_hold/blocked set a hold (refused cannot_hold_done on a done row); on_hold takes the work out of the schedule. in_progress starts the first silent step (on a parent, one leaf), or reopens a done row. blocked_by_proxy is derived and cannot be set.',
  }),
  setMeasure: defineCommand('setMeasure', {
    schema: type({
      kind: "'setMeasure'",
      ...step,
      metric: 'string',
      value: 'number',
      'rateCardDigest?': 'string',
    }),
    scope: 'project',
    description:
      'Record a fact in one measure for one step of a work item. metric is a measure definition key of the organization (tokens, hours, cost or a defined one; token_actual and hours_actual still name tokens and hours, token_estimate the legacy token estimate). value is in that measure’s unit and scale as getApiMeasures lists them (tokens whole tokens, hours real hours, cost whole micro-units of its currency), at or above 0 (invalid_measure otherwise); 0 records that the work cost nothing, clearMeasure removes the fact. rateCardDigest names the rate card a money fact (cost) was priced with: required there (rate_card_required), refused on any other measure (rate_card_forbidden). Refused unknown_measure, derived_measure (agent_minutes is read from attempts), scheduling_measure_fact (the fact of time is the actual days, set with setActual) or scale_mismatch (a fraction on an integer measure). Accepts stepNodeId in place of the work-item and step pair.',
  }),
  clearMeasure: defineCommand('clearMeasure', {
    schema: type({ kind: "'clearMeasure'", ...step, metric: 'string' }),
    scope: 'project',
    description:
      'Remove one fact in one measure (metric as for setMeasure). Refused unknown_measure, derived_measure or scheduling_measure_fact as setMeasure is; needs no rateCardDigest. Accepts stepNodeId in place of the work-item and step pair.',
  }),
  setMeasureEstimate: defineCommand('setMeasureEstimate', {
    schema: type({
      kind: "'setMeasureEstimate'",
      ...step,
      measure: 'string',
      estimate: { optimistic: 'number', realistic: 'number', pessimistic: 'number' },
      'rateCardDigest?': 'string',
    }),
    scope: 'project',
    description:
      'Set the three-point estimate in one measure other than time (tokens, cost or a defined one) on a leaf work item, in that measure’s unit and scale, each point at or above 0 and ordered optimistic <= realistic <= pessimistic (invalid_estimate otherwise). measure is the definition key; the read shows the expected value (the project’s PERT weights) and, beside a fact, the variance. rateCardDigest as for setMeasure: required on a money measure, refused elsewhere. Refused unknown_measure, scheduling_measure_estimate (the time estimate is setEstimate), three_point_forbidden (hours, agent_minutes) scale_mismatch (a fraction on an integer measure) or rolled_up (a work item with children). Accepts stepNodeId in place of the work-item and step pair.',
  }),
  clearMeasureEstimate: defineCommand('clearMeasureEstimate', {
    schema: type({ kind: "'clearMeasureEstimate'", ...step, measure: 'string' }),
    scope: 'project',
    description:
      'Remove one step’s three-point estimate in one measure (measure as for setMeasureEstimate). Refused unknown_measure or scheduling_measure_estimate; a trio stored before its definition stopped allowing three points can still be cleared. Accepts stepNodeId in place of the work-item and step pair.',
  }),
  setBudget: defineCommand('setBudget', {
    schema: type({
      kind: "'setBudget'",
      ...target,
      measure: 'string',
      cap: 'number',
      policy: "'strict' | 'advisory'",
      'holdPerAttempt?': 'number | null',
    }),
    scope: 'project',
    description:
      'State the budget of a work item (leaf or parent) in one measure: cap, at or above 0 in that measure’s unit and scale (cost in micro-units of its currency), bounds the summed facts of the whole subtree on every step. policy strict makes startAttempt refuse budget_exhausted once nothing remains or the next attempt’s hold would not fit; advisory only reports. holdPerAttempt, when given (same unit), is held against the remainder for every running attempt in the subtree whose usage is not yet recorded. measure is the definition key; agent_minutes may hold a budget. Read the remainders with getApiProjectsByIdBudget-headroom. A stated budget replaces the one derived from the pessimistic estimate. Refused unknown_measure, scheduling_measure_budget (time), invalid_budget (400: a negative cap or hold, or another policy) or scale_mismatch (a fraction on an integer measure).',
  }),
  clearBudget: defineCommand('clearBudget', {
    schema: type({ kind: "'clearBudget'", ...target, measure: 'string' }),
    scope: 'project',
    description:
      'Remove the stated budget of a work item in one measure (measure as for setBudget); the derived budget, if any, shows again. Refused unknown_measure or scheduling_measure_budget; clearing an absent budget changes nothing.',
  }),
  setAssignee: defineCommand('setAssignee', {
    schema: type({
      kind: "'setAssignee'",
      ...step,
      'personId?': 'string | null',
      'personRef?': 'string',
    }),
    scope: 'project',
    description:
      'Name who does one step of a work item, or null to unassign. Accepts stepNodeId in place of the work-item and step pair.',
  }),
  assignSubtree: defineCommand('assignSubtree', {
    schema: type({
      kind: "'assignSubtree'",
      ...target,
      stepId: 'string',
      'personId?': 'string | null',
      'personRef?': 'string',
    }),
    scope: 'project',
    description:
      'Name who does one step on every leaf under a work item (the item itself when it is a leaf), or null to unassign them all. One undo restores each leaf’s previous assignee. Team labels are not read and no claim refuses it; the result lists reassignedClaimedSteps in tree order, each leaf step whose assignee changed while another person holds the claim on that step (a subtree claim or a claim on another step does not count), as of this command in its batch: workItemId, stepId, previousPersonId (null when unassigned) and holder (claimId, personId, runId). A step given to its own holder is not listed; a redo does not list again. Refused unknown_step and unknown_person as for setAssignee.',
  }),
  claimWorkItem: defineCommand('claimWorkItem', {
    schema: type({
      kind: "'claimWorkItem'",
      ...target,
      ...person,
      'steps?': 'string[]',
      'runId?': 'string',
      'parentClaim?': 'string',
      'assign?': 'boolean',
      'resources?': type({ resourceId: 'string', units: 'number' }).array(),
    }),
    scope: 'project',
    description:
      'Claim steps of a leaf, or a whole subtree of a non-leaf, for a person so nobody else picks them up. steps are step ids; absent claims every step not done. runId is the agent run (at most 256 characters); parentClaim names the subtree claim this is delegated under. All or none; a claimed step with no progress becomes in_progress; assignments are untouched unless assign is true, which also makes the person the assignee of every step this claim writes (a subtree claim writes no step), undone with the claim; the result lists them as assignedStepIds. The first claim on a leaf holds the leaf’s declared resource demand, or resources [{ resourceId, units }] when given (each at least the declared units; may add a resource), against the project’s stated capacity minus what other leaves’ claims hold; an unstated capacity never refuses; a later claim on a held leaf holds the same units, or raises them to its resources (never below what the leaf holds), acquiring only the difference against the same free units; the last release frees them, and the result lists what was acquired. Repeating a held claim answers alreadyHeld. Refused, first match: person_not_bound, credential_not_for_person, parent_claim_unknown, parent_claim_foreign, parent_claim_not_ancestor, steps_on_subtree, resources_on_subtree, item_done, no_steps, not_startable (blocked, on_hold, blocked_by_proxy), step_done, already_claimed (names holders), below_declared_demand, below_held_occupancy, resources_exhausted (names the first short resource, asked, free and holders, and lists every short resource the same way in resources), inside_subtree_claim, overlaps_subtree_claim, and last claim_limit (names cap and current: the organization already holds its cap of bound claims, one per work item, person and run; a claim adding none, such as a further step under the same person and run, is never refused by it). A claim an agent takes for itself with its own credential carries a 15-minute lease: every committed batch of that agent renews it, postApiClaimsRenew renews it while idle, and the coordinator releases a claim whose lease ran out, or whose agent lost its last credential.',
  }),
  releaseWorkItem: defineCommand('releaseWorkItem', {
    schema: type({ kind: "'releaseWorkItem'", ...target, ...person, 'steps?': 'string[]' }),
    scope: 'project',
    description:
      'Release a person’s claims: on a leaf the named steps or every step; on a non-leaf the subtree claim and every claim delegated under it. Progress is untouched. Refused not_claimed_by when the person holds none, and person_not_bound or credential_not_for_person as for claimWorkItem.',
  }),
  addDependency: defineCommand('addDependency', {
    schema: type({ kind: "'addDependency'", ...predecessor }),
    scope: 'project',
    description: 'Make a work item wait for another.',
  }),
  removeDependency: defineCommand('removeDependency', {
    schema: type({ kind: "'removeDependency'", ...predecessor }),
    scope: 'project',
    description: 'Stop a work item waiting for another.',
  }),
  addTypedDependency: defineCommand('addTypedDependency', {
    schema: type({
      kind: "'addTypedDependency'",
      predecessor: dependencyEndpoint,
      successor: dependencyEndpoint,
      // Proof: accepting string made the mounted unsupported-type test receive 422
      // instead of the input-boundary 400; watched 2026-09-28.
      type: "'FS' | 'SS' | 'FF'",
    }),
    scope: 'project',
    description:
      'Add a typed FS, SS or FF dependency. Each endpoint is whole work item, leaf step node, or one step across all descendant leaves. Returns a stable relationship id. Omitted projectId keeps owner-local IDs or workItemRef batch aliases. Explicit projectId requires nonempty stable IDs without surrounding whitespace (or sn1 node ID), never workItemRef. The successor project must own the batch. External authoring may refuse external_dependencies_inactive.',
  }),
  updateTypedDependency: defineCommand('updateTypedDependency', {
    schema: type({
      kind: "'updateTypedDependency'",
      dependencyId: 'string',
      predecessor: dependencyEndpoint,
      successor: dependencyEndpoint,
      // Proof: accepting string made the mounted unsupported-update test receive
      // 422 instead of the input-boundary 400; watched 2026-09-28.
      type: "'FS' | 'SS' | 'FF'",
    }),
    scope: 'project',
    description:
      'Change both endpoints and FS, SS or FF type of a typed relationship by its stable dependencyId. Omitted projectId keeps owner-local IDs or workItemRef batch aliases. Explicit projectId requires nonempty stable IDs without surrounding whitespace (or sn1 node ID), never workItemRef. The successor project must own the batch. External authoring may refuse external_dependencies_inactive.',
  }),
  removeTypedDependency: defineCommand('removeTypedDependency', {
    schema: type({ kind: "'removeTypedDependency'", dependencyId: 'string' }),
    scope: 'project',
    description: 'Remove a typed relationship by dependencyId.',
  }),
  arrangeBySchedule: defineCommand('arrangeBySchedule', {
    schema: type({ kind: "'arrangeBySchedule'" }),
    scope: 'project',
    description: 'Put every sibling group in the order its bars start.',
  }),
  freezeProject: defineCommand('freezeProject', {
    schema: type({ kind: "'freezeProject'" }),
    scope: 'project',
    description: 'Freeze every work item number as it stands.',
  }),
  unfreezeProject: defineCommand('unfreezeProject', {
    schema: type({ kind: "'unfreezeProject'" }),
    scope: 'project',
    description: 'Let every number follow the tree again.',
  }),
  unfreezeWorkItem: defineCommand('unfreezeWorkItem', {
    schema: type({ kind: "'unfreezeWorkItem'", ...target }),
    scope: 'project',
    description: 'Let one work item’s number follow the tree again.',
  }),
  setCapacity: defineCommand('setCapacity', {
    schema: type({ kind: "'setCapacity'", ...team, size: 'number | null' }),
    scope: 'project',
    description: 'How many of a team may be at work at once on this project; null means unstated.',
  }),
  setResourceCapacity: defineCommand('setResourceCapacity', {
    schema: type({ kind: "'setResourceCapacity'", ...resource, units: 'number | null' }),
    scope: 'project',
    description:
      'How many units of a resource this project’s plan may use: a whole number from 0; null means unstated and constrains nothing. Not journalled, like setCapacity. Raising a statement so that the organization’s projects would state more units of this resource than its cap allows is refused capacity_limit, naming resourceId, cap, declared (the units its other projects state) and asked; the whole batch writes nothing. Clearing, restating or lowering never is.',
  }),
  setDemand: defineCommand('setDemand', {
    schema: type({ kind: "'setDemand'", ...target, ...resource, units: 'number | null' }),
    scope: 'project',
    description:
      'State the units of a resource one work item needs while any of its steps runs: a whole number from 1, exactly 1 on an exclusive resource (else exclusive_demand_is_one); null removes the demand. Not inherited down the tree. One undo.',
  }),
  setStepAllowance: defineCommand('setStepAllowance', {
    schema: type({ kind: "'setStepAllowance'", stepId: 'string', allowancePercent: 'number' }),
    scope: 'project',
    description:
      'Set one project step’s estimate allowance: a percentage from 0 to 1000 with at most ' +
      'two decimal places, applied to every estimate for that step before rounding. One undo.',
  }),
  setPriorityBands: defineCommand('setPriorityBands', {
    schema: type({
      kind: "'setPriorityBands'",
      bands: type({ startsAt: 'number', defaultValue: 'number', label: 'string' }).array(),
    }),
    scope: 'project',
    description: 'Replace this project’s priority ladder.',
  }),
  createTeam: defineCommand('createTeam', {
    schema: type({ kind: "'createTeam'", ...named }),
    scope: 'directory',
    description: 'Add a team to the directory.',
  }),
  patchTeam: defineCommand('patchTeam', {
    schema: type({
      kind: "'patchTeam'",
      ...team,
      patch: { 'name?': 'string', 'serviceIds?': 'string[]' },
    }),
    scope: 'directory',
    description: 'Rename a team or change the services it owns.',
  }),
  deleteTeam: defineCommand('deleteTeam', {
    schema: type({ kind: "'deleteTeam'", ...team, 'cascade?': 'boolean' }),
    scope: 'directory',
    description: 'Remove a team from the directory.',
  }),
  createPerson: defineCommand('createPerson', {
    schema: type({
      kind: "'createPerson'",
      ...named,
      'teamIds?': 'string[]',
      'teamRefs?': 'string[]',
      // `kind` is the command's discriminator, so the person's kind has its own name.
      'personKind?': 'string',
    }),
    scope: 'directory',
    description:
      'Add a person to the directory. personKind is person (the default) or agent; any other value is refused invalid_kind. Adding an agent past the organization’s cap on agent persons is refused agent_person_limit, naming cap, current and added; the whole batch writes nothing. A name the organization already holds joins that person to the teams and keeps its own kind, which the answer names.',
  }),
  patchPerson: defineCommand('patchPerson', {
    schema: type({
      kind: "'patchPerson'",
      ...person,
      patch: {
        'name?': 'string',
        'teamIds?': 'string[]',
        'kind?': 'string',
        'accountId?': 'string | null',
      },
    }),
    scope: 'directory',
    description:
      'Rename a person, change their teams or their kind, or bind them to the account that may act as them (accountId; null unbinds; organization admins only). Making a person an agent past the organization’s cap on agent persons is refused agent_person_limit, naming cap, current and added; the whole batch writes nothing. Changing an agent back to a person, renaming or re-teaming never is.',
  }),
  deletePerson: defineCommand('deletePerson', {
    schema: type({ kind: "'deletePerson'", ...person, 'cascade?': 'boolean' }),
    scope: 'directory',
    description: 'Remove a person from the directory.',
  }),
  createTag: defineCommand('createTag', {
    schema: type({ kind: "'createTag'", ...named }),
    scope: 'directory',
    description: 'Add a tag to the directory.',
  }),
  patchTag: defineCommand('patchTag', {
    schema: type({ kind: "'patchTag'", ...tag, name: 'string' }),
    scope: 'directory',
    description: 'Rename a tag.',
  }),
  deleteTag: defineCommand('deleteTag', {
    schema: type({ kind: "'deleteTag'", ...tag, 'cascade?': 'boolean' }),
    scope: 'directory',
    description: 'Remove a tag from the directory.',
  }),
  createService: defineCommand('createService', {
    schema: type({ kind: "'createService'", ...named }),
    scope: 'directory',
    description: 'Add a service to the directory.',
  }),
  patchService: defineCommand('patchService', {
    schema: type({ kind: "'patchService'", ...service, name: 'string' }),
    scope: 'directory',
    description: 'Rename a service.',
  }),
  deleteService: defineCommand('deleteService', {
    schema: type({ kind: "'deleteService'", ...service, 'cascade?': 'boolean' }),
    scope: 'directory',
    description: 'Remove a service from the directory.',
  }),
  createWorkItemType: defineCommand('createWorkItemType', {
    schema: type({ kind: "'createWorkItemType'", ...named }),
    scope: 'directory',
    description: 'Add a work item type to the directory.',
  }),
  patchWorkItemType: defineCommand('patchWorkItemType', {
    schema: type({ kind: "'patchWorkItemType'", ...workItemType, name: 'string' }),
    scope: 'directory',
    description: 'Rename a work item type.',
  }),
  deleteWorkItemType: defineCommand('deleteWorkItemType', {
    schema: type({ kind: "'deleteWorkItemType'", ...workItemType, 'cascade?': 'boolean' }),
    scope: 'directory',
    description: 'Remove a work item type from the directory.',
  }),
  createResource: defineCommand('createResource', {
    schema: type({
      kind: "'createResource'",
      ...named,
      resourceKind: "'exclusive' | 'divisible'",
      unitLabel: 'string',
    }),
    scope: 'directory',
    description:
      'Add a resource to the directory: a host’s RAM, a staging environment, agent slots. resourceKind is exclusive (identical units, demanded one at a time) or divisible (demanded k at a time) and never changes; unitLabel is shown beside every number of it. A name the directory already holds is refused taken.',
  }),
  patchResource: defineCommand('patchResource', {
    schema: type({
      kind: "'patchResource'",
      ...resource,
      patch: {
        'name?': 'string',
        'unitLabel?': 'string',
        'resourceKind?': 'unknown',
        'providerId?': 'string | null',
      },
    }),
    scope: 'directory',
    description:
      'Rename a resource, change its unit label, or name the compute provider instance that fulfils it (providerId; null clears it). Its kind is immutable: a patch naming resourceKind is refused kind_is_immutable. A providerId naming no instance is refused unknown_provider, one of another organization provider_not_in_organization. The reference is shown beside capacity and never changes a schedule or a claim.',
  }),
  deleteResource: defineCommand('deleteResource', {
    schema: type({ kind: "'deleteResource'", ...resource, 'cascade?': 'boolean' }),
    scope: 'directory',
    description:
      'Remove a resource from the directory. Refused in_use with the counts of demands, capacities and occupancies naming it unless cascade, which removes them in the same transaction.',
  }),
  createMeasure: defineCommand('createMeasure', {
    schema: type({
      kind: "'createMeasure'",
      ...reference,
      key: 'string',
      name: 'string',
      unit: 'string',
      measureKind: "'duration' | 'count' | 'money'",
      scale: "'integer' | 'real'",
      'threePoint?': 'boolean',
      'showByDefault?': 'boolean',
      'schedulesWork?': 'boolean',
      'order?': 'number',
      'currency?': 'string | null',
    }),
    scope: 'directory',
    description:
      'Define a measure for the organization (organization admins and super-admins only; anyone else is refused forbidden): key is a lowercase slug (letter first, then letters, digits or _, at most 40) that never changes; unit is the label beside every figure (empty is refused unit_required); measureKind (duration, count, money) and scale (integer, real) never change; money needs a three-letter currency and nothing else may name one (currency_required, currency_forbidden). threePoint and showByDefault default false; order defaults to after every held definition. Refused measure_key_taken for a key the organization holds and second_scheduling_measure for schedulesWork while time holds it. Under legacy access the legacy organization owns it, refused organization_required when none exists.',
  }),
  patchMeasure: defineCommand('patchMeasure', {
    schema: type({
      kind: "'patchMeasure'",
      ...measure,
      patch: {
        'key?': 'string',
        'name?': 'string',
        'unit?': 'string',
        'measureKind?': 'string',
        'scale?': 'string',
        'threePoint?': 'boolean',
        'showByDefault?': 'boolean',
        'schedulesWork?': 'boolean',
        'order?': 'number',
        'currency?': 'string | null',
      },
    }),
    scope: 'directory',
    description:
      'Change a measure definition (organization admins and super-admins only; anyone else is refused forbidden): name, unit, threePoint, showByDefault, order or a money measure’s currency. Naming another key is refused measure_key_immutable, another measureKind or scale measure_shape_immutable; schedulesWork true on any but the scheduling measure is refused second_scheduling_measure and false on it scheduling_measure_fixed.',
  }),
  deleteMeasure: defineCommand('deleteMeasure', {
    schema: type({ kind: "'deleteMeasure'", ...measure }),
    scope: 'directory',
    description:
      'Remove a measure definition the organization defined (organization admins and super-admins only; anyone else is refused forbidden). The five seeded definitions (time, tokens, hours, cost, agent_minutes) and any definition a fact, three-point estimate or budget references are refused measure_in_use.',
  }),
} as const;

type DefinedCommand = (typeof commandDefinitions)[keyof typeof commandDefinitions];

export type PlanCommandWire = DefinedCommand['schema']['infer'];
export type PlanCommandKind = keyof typeof commandDefinitions;

// Object.keys is bounded by the owned commandDefinitions literal above.
export const PLAN_COMMAND_KINDS = Object.keys(commandDefinitions) as readonly PlanCommandKind[];
