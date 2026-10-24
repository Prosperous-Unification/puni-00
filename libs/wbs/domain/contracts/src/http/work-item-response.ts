import { type } from 'arktype';

import { stepShape } from './step-shapes';

const scheduled = type({
  duration: 'number',
  estimated: 'boolean',
  earliestStart: 'number',
  earliestFinish: 'number',
  latestStart: 'number',
  latestFinish: 'number',
  float: 'number',
  critical: 'boolean',
});
const triple = type({ optimistic: 'number', realistic: 'number', pessimistic: 'number' });
const numbers = type({ '[string]': 'number' });
const named = type({ id: 'string', name: 'string' });
const typedEndpoint = type({
  scope: "'whole' | 'node' | 'descendant-step'",
  workItemId: 'string',
  'stepId?': 'string',
  // Proof: widening this to unknown made `tree boundary refuses missing core producer
  // fields while allowing additive metadata` accept a numeric node ID; watched 2026-09-27.
  'stepNodeId?': 'string',
});
/**
 * One attempt at a step node as the work-item read answers it
 * (`step-node-attempts` D4): instants in epoch milliseconds, UTC; end and
 * outcome both null while it runs.
 */
export const attemptShape = type({
  attemptNumber: 'number',
  startedAt: 'number',
  endedAt: 'number | null',
  outcome: "'succeeded' | 'failed' | 'cancelled' | null",
  executorPersonId: 'string | null',
  reference: 'string | null',
  note: 'string | null',
});
/** First start to last end of some attempts, the end null while one runs. */
export const spanShape = type({ start: 'number', end: 'number | null' });
/** Additive live resources; discriminated provenance keeps unknown assignment/team states invalid. */
export const nodeResourcesShape = type({
  nodeId: 'string',
  assignment: type({ kind: "'unassigned'" })
    .or({ kind: "'explicit'", personId: 'string' })
    .or({ kind: "'assumed'", personId: 'string', fromStepId: 'string' }),
  teams: type({ kind: "'unstated'" }).or({
    kind: "'stated'",
    fromWorkItemId: 'string',
    entries: type({ teamId: 'string', capacity: 'number | null' }).array(),
  }),
  maxParallel: 'number',
  width: 'number',
});
/** A money figure's basis on the wire: currency and rate card digest (design D43). */
export const moneyBasis = type({ currency: 'string', rateCardDigest: 'string' });

/** The two bases a mix is named by, null for an unpriced figure (design D44). */
export const mixedBases = type([moneyBasis.or('null'), moneyBasis.or('null')]);

export const numberedWorkItem = type({
  id: 'string',
  projectId: 'string',
  parentId: 'string | null',
  position: 'number',
  name: 'string',
  notes: 'string',
  frozenNumber: 'string | null',
  startNoEarlierThan: 'string | null',
  startNoEarlierThanReason: 'string | null',
  // Proof: widening deadline admitted false,200 instead of500 in the mounted tree case.
  deadline: 'string | null',
  factStart: 'string | null',
  factEnd: 'string | null',
  readiness: "'draft' | 'ready' | null",
  hold: "'on_hold' | 'blocked' | null",
  priority: 'number | null',
  serviceTeamId: 'string | null',
  serviceId: 'string | null',
  maxParallel: 'number',
  revision: 'number',
  teamIds: type('string[]').readonly(),
  tagIds: type('string[]').readonly(),
  serviceIds: type('string[]').readonly(),
  typeIds: type('string[]').readonly(),
  // Proof: removing id made the direct production-client boundary test resolve a tree
  // containing numeric external-reference ids instead of rejecting.
  externalRefs: type({ id: 'string', systemId: 'string', url: 'string', name: 'string' })
    .array()
    .readonly(),
  number: 'string',
  estimates: type({ '[string]': triple }),
  rolledUp: 'boolean',
  actuals: numbers,
  progress: type({ '[string]': "'in_progress' | 'done'" }),
  status:
    "'unknown' | 'draft' | 'ready' | 'in_progress' | 'blocked_by_proxy' | 'on_hold' | 'blocked' | 'done'",
  measures: type({ '[string]': numbers }),
  // Estimates per measure other than time by definition key, then step id
  // (`wbs-measure-budgets` D3): the summed trio, whether every trio in it is
  // single-point, the expected measure and, when a fact sits beside it, the
  // variance. Absent when no measure holds an estimate on the row, and from
  // an older be-01 mid-swap.
  'measureEstimates?': type({
    '[string]': type({
      '[string]': type({
        optimistic: 'number',
        realistic: 'number',
        pessimistic: 'number',
        singlePoint: 'boolean',
        expected: 'number',
        'variance?': 'number',
      }),
    }),
  }),
  // Budgets by definition key (`wbs-measure-budgets` D5, design D39): stated
  // or derived from the pessimistic points, with what remains after the
  // subtree's facts and holds (negative past the cap) and whether the facts
  // crossed it; `held` and `holdPerAttempt` only where the budget states a hold. Absent when the
  // row has none, and from an older be-01 mid-swap.
  'budgets?': type({
    '[string]': type({
      cap: 'number',
      policy: "'strict' | 'advisory'",
      source: "'stated' | 'derived'",
      remaining: 'number',
      exceeded: 'boolean',
      'held?': 'number',
      // The stated hold per running attempt, beside `held`, only where the
      // budget states one (design D60): what an editor would otherwise drop.
      'holdPerAttempt?': 'number',
    }),
  }),
  // Money keys whose figures in the subtree are priced under two bases, per
  // kind, with the first two (null: unpriced). Facts and trios fold apart: a
  // key mixing facts is left out of `measures` and `budgets`, one mixing trios
  // out of `measureEstimates` (design D44).
  'mixedRateCards?': type({
    '[string]': type({ 'facts?': mixedBases, 'estimates?': mixedBases }),
  }),
  // The one priced basis a money key's figures in the subtree are in, per
  // kind (`wbs-measure-budgets` D49): what the row's sums in that key are
  // priced with. A mixing kind is in `mixedRateCards` instead; unpriced
  // figures name none. Absent when no key has one, and from an older be-01.
  'moneyBases?': type({
    '[string]': type({ 'facts?': moneyBasis, 'estimates?': moneyBasis }),
  }),
  dependsOn: 'string[]',
  finalDays: numbers,
  // Absent only from a backend that predates estimate units during swap or rollback.
  'charged?': type({
    '[string]': type.or(
      type({ unit: "'workdays'", days: 'number' }),
      // Proof: weakening minutes to number admitted fractional/negative charges; weakening unit to string admitted hours (work-item-response.test.ts).
      type({ unit: "'minutes'", minutes: 'number%1>=0' }),
    ),
  }),
  finalTotal: 'number',
  schedule: scheduled.or('null'),
  dates: type({ startsOn: 'string', endsOn: 'string' }).or('null'),
  assignees: type({ '[string]': 'string' }),
  doesEveryStep: 'string | null',
  // A leaf's attempts by step id, ascending number, and the spans derived from
  // them per node and for the leaf; each absent when there are none. Optional
  // because an older be-01 answers neither during a blue/green swap.
  'attempts?': type({ '[string]': attemptShape.array() }),
  'spans?': type({ '[string]': spanShape }),
  'span?': spanShape,
  // Derived resources of every retained leaf step; absent on parents and older producers.
  // Proof: widening this field to unknown let both mounted malformed-present
  // producer cases return 200 instead of 500; older absence still reads 200.
  // Watched 2026-10-15, step-node-resources.controller.db.test.ts.
  'nodeResources?': type({ '[string]': nodeResourcesShape }),
  // A leaf's node readings by step id (`step-node-readings` D3); absent on a
  // parent and from an older be-01 mid-swap. `skipped` is in the union before
  // anything produces it, so a later reader never meets a word it cannot name.
  // Proof: the union loosened to `'string'`, and fe-01's `renders the
  // query-failure state for an unknown reading word` failed on a null
  // `[data-stale-tree]` banner while the Dev cell drew a blank corner glyph
  // with `Reading: undefined`; watched 2026-10-12.
  'nodeReadings?': type({
    '[string]':
      "'skipped' | 'done' | 'on_hold' | 'blocked' | 'in_progress' | 'blocked_by_proxy' | 'waiting' | 'unknown'",
  }),
  // Additive live metadata: older be-01 versions omit these fields mid-swap.
  'blockages?': type({ '[string]': type({ blockedAt: 'number' }) }),
  'blockageCauses?': type({
    '[string]': type({ kind: "'step'", nodeId: 'string' })
      .or(type({ kind: "'work-item'", workItemId: 'string' }))
      .array()
      .readonly(),
  }),
});
export const workItemSlice = scheduled.and({
  id: 'string',
  workItemId: 'string',
  stepId: 'string | null',
  personId: 'string | null',
  boundBy:
    "'projectStart' | 'predecessor' | 'stepOrder' | 'notBefore' | 'person' | 'elsewhere' | 'capacity' | 'optimizer'",
  resourcePredecessorId: 'string | null',
  capacityPredecessorIds: 'string[]',
  capacityTeamId: 'string | null',
  // Present exactly when `boundBy` is `'capacity'` and a resource's pool bound
  // the start, with `capacityTeamId` null (`wbs-resources` R5). Additive: an
  // older be-01 never sends it.
  'capacityResource?': type({ resourceId: 'string', units: 'number' }),
  // Present exactly when `boundBy` is `'elsewhere'` (`share-people-across-projects`).
  'elsewhereHolder?': type({ projectId: 'string', workItemId: 'string' }),
  // Proof: widening lateBy admitted text,200 instead of500 in the mounted tree case.
  width: 'number',
  effort: 'number',
  lateBy: 'number | null',
});
const optimizationVariant = type({ state: "'pending' | 'retrying' | 'idle'" })
  .or({
    state: "'ready'",
    proof: "'proven' | 'incomplete' | 'quantisation-floor'",
  })
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
const optimization = type({
  enabled: 'boolean',
  engine: "'fast' | 'optimized'",
  objective: "'pri' | 'time'",
  inputHash: 'string',
  generation: 'number | null',
  contractVersion: 'string',
  budgetMs: 'number',
  displayed: "'fast' | 'pri' | 'time'",
  variants: { pri: optimizationVariant, time: optimizationVariant },
  // Absolute finishes rather than one delta, and one entry per schedule the
  // read computed: the cue names Fast, PRI and Time together, every difference
  // is taken against Fast, and the delta is that subtraction through the shared
  // workday drift the client already applies. `fast` is required because a
  // read that carries this object at all has computed Fast — it is the
  // schedule the rows are placed by unless a variant displaces it.
  finishDays: { fast: 'number', 'pri?': 'number', 'time?': 'number' },
  // One boolean per variant that has a finish above, server-side per tasks.md
  // 8.7: the order relation is the half of the comparison a client cannot
  // derive from these numbers, and two implementations would disagree about
  // the same pair.
  sameOrderAsFast: { 'pri?': 'boolean', 'time?': 'boolean' },
});

/**
 * The complete project tree shared by reads and exports. Account-specific undo
 * flags are composed by the read endpoint, never required of a project export.
 * Wrap this raw declaration in responseSchema at the endpoint boundary so future
 * additive fields remain readable while every currently known field is checked.
 */
export const workItemTree = type({
  workItems: numberedWorkItem.array(),
  'typedDependencies?': type({
    id: 'string',
    predecessor: typedEndpoint,
    successor: typedEndpoint,
    type: 'string',
  }).array(),
  seq: 'number',
  scheduleError: "'calendar_range' | 'cycle' | null",
  waitingForPerson: 'number',
  waitingForCapacity: 'number',
  // Both present exactly when the displayed schedule was placed around bookings
  // in other projects (`share-people-across-projects`): the engine's count, and
  // one label per holder a slice's `elsewhereHolder` names.
  'waitingElsewhere?': 'number',
  'elsewhereHolders?': type({
    projectId: 'string',
    projectName: 'string',
    workItemId: 'string',
    number: 'string',
    name: 'string',
  }).array(),
  // Present exactly when a slice's `capacityResource` names a resource
  // (`wbs-resources` R5): one label per resource named.
  'resourceLabels?': type({ id: 'string', name: 'string', unitLabel: 'string' }).array(),
  slices: workItemSlice.array(),
  steps: stepShape.array(),
  assignedPeople: named.array(),
  teamCapacities: type({ serviceTeamId: 'string', size: 'number' }).array(),
  priorityBands: type({ startsAt: 'number', defaultValue: 'number', label: 'string' }).array(),
  estimateMethod: "'pert' | 'optimistic' | 'realistic' | 'pessimistic'",
  pertWeights: triple,
  estimateRounding: "'exact' | 'floor' | 'round' | 'ceil'",
  depReach: "'whole-item' | 'anchor-slice'",
  // Proof: making projectRevision optional admitted a missing producer field,200 instead of500 in the mounted tree case.
  startDate: 'string | null',
  projectRevision: 'number',
  // Proof: leaving this known response field unmodeled made the production-client
  // boundary test fail on `promise resolved … instead of rejecting` for `failed/unknown`.
  'optimization?': optimization,
});

/** The existing complete project-tree response, retained unchanged inside a plan document. */
export type WorkItemTree = (typeof workItemTree)['infer'];
