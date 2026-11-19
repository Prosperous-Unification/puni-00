import { type } from 'arktype';

import { createLegacyDocumentDependency12 } from './legacy-document-leaves12';
import { createLegacyDocumentConnected12 } from './legacy-plan-document-connected12';

/** Frozen published11 work-item/step/availability fields; no current response schema is a dependency. */
function createLegacyWorkItemShapes11() {
  const stepShape = type({
    id: 'string',
    projectId: 'string',
    name: 'string',
    position: 'number',
    'code?': 'string | null',
    'allowancePercent?': 'number',
    // Proof: requiring this field refused the pre-unit backend fixture; malformed present hours remains refused (step-shapes.test.ts, 2026-10-12).
    // An older backend predates units and can only answer workday steps.
    'estimateUnit?': "'workdays' | 'minutes'",
  });
  const scheduleError = type("'calendar_range' | 'cycle' | null")
    .or(
      type({
        kind: "'dependency_calendar_missing'",
        projects: type({ projectId: 'string', abbreviation: 'string', name: 'string' })
          .array()
          .atLeastLength(1)
          .readonly(),
      }),
    )
    .or(
      type({
        kind: "'engine_unavailable'",
        engine: "'optimized'",
        projects: type('string').array().atLeastLength(1).readonly(),
        reason: "'adapter_missing' | 'connected_optimization_not_supported'",
      }),
    );
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
  const connectedEndpoint = type({
    // Proof: widening projectId to unknown made the mounted malformed captured
    // navigation identity test answer 200 instead of 500 (2026-10-22).
    endpoint: typedEndpoint.and({ projectId: 'string' }),
    isLeaf: 'boolean',
    revision: 'number',
    name: 'string',
    projectAbbreviation: 'string',
    workItemNumber: 'string',
    step: type({ id: 'string', name: 'string', code: 'string | null', position: 'number' }).or(
      'null',
    ),
    qualifiedReference: 'string | null',
    stepReference: 'string | null',
    stepNodeId: 'string | null',
  });
  const attemptShape = type({
    attemptNumber: 'number',
    startedAt: 'number',
    endedAt: 'number | null',
    outcome: "'succeeded' | 'failed' | 'cancelled' | null",
    executorPersonId: 'string | null',
    reference: 'string | null',
    note: 'string | null',
  });
  const spanShape = type({ start: 'number', end: 'number | null' });
  const nodeResourcesShape = type({
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
  const moneyBasis = type({ currency: 'string', rateCardDigest: 'string' });
  const mixedBases = type([moneyBasis.or('null'), moneyBasis.or('null')]);
  const numberedWorkItem = type({
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
  const workItemSlice = scheduled.and({
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
  const optimizationBase = type({
    enabled: 'boolean',
    engine: "'fast' | 'optimized'",
    objective: "'pri' | 'time'",
    inputHash: 'string',
    generation: 'number | null',
    contractVersion: 'string',
    budgetMs: 'number',
    displayed: "'fast' | 'pri' | 'time'",
    // Absolute finishes rather than one delta, and one entry per schedule the
    // read retains: the cue names Fast, PRI and Time together, every difference
    // is taken against the reference through the client's shared workday drift.
    // `fast` is local Fast for a local read and the exact retained pre-selection
    // reference for a connected stage, never a newly scheduled unpinned project.
    finishDays: { fast: 'number', 'pri?': 'number', 'time?': 'number' },
    // One boolean per variant that has a finish above, server-side per tasks.md
    // 8.7: the order relation is the half of the comparison a client cannot
    // derive from these numbers, and two implementations would disagree about
    // the same pair.
    sameOrderAsFast: { 'pri?': 'boolean', 'time?': 'boolean' },
  });
  const connectedVariant = optimizationVariant.or({
    state: "'boundary-infeasible'",
    certificate: {
      kind: "'boundary-infeasible'",
      question: {
        projectId: 'string',
        inputHash: 'string',
        questionHash: 'string',
        objective: "'pri' | 'time'",
        contractVersion: 'string',
        budgetMs: 'number',
        quantum: 'number',
        wireVersion: 'number',
        stageBytes: 'string',
      },
      evidence: "'contradictory-bounds' | 'initial-model-infeasible'",
    },
  });
  const connectedScope = type({
    kind: "'connected-stage'",
    projectId: 'string',
    originOrdinal: 'number',
    mode: "'isolated' | 'shared'",
    quantum: 'number',
    wireVersion: 'number',
    boundary: { format: "'wbs-connected-stage'", version: '1', canonical: 'string' },
    fixed: type({
      projectId: 'string',
      projectName: 'string',
      projectAbbreviation: 'string',
      workItemId: 'string',
      workItemName: 'string',
      stepId: 'string | null',
      stepName: 'string | null',
      start: 'number',
      finish: 'number',
    })
      .array()
      .readonly(),
  });
  const optimization = optimizationBase
    .and({
      // Proof: removing never admitted malformed connected scope as a local ready
      // payload; widening local variants admitted an unscoped terminal certificate.
      'scope?': 'never',
      variants: { pri: optimizationVariant, time: optimizationVariant },
    })
    .or(
      optimizationBase.and({
        scope: connectedScope,
        variants: { pri: connectedVariant, time: connectedVariant },
      }),
    );
  const workItemTree = type({
    workItems: numberedWorkItem.array(),
    'connectedDependencies?': type({
      id: 'string',
      projectId: 'string',
      type: "'FS' | 'SS' | 'FF'",
      predecessor: connectedEndpoint,
      successor: connectedEndpoint,
    }).array(),
    'typedDependencies?': type({
      id: 'string',
      predecessor: typedEndpoint,
      successor: typedEndpoint,
      type: 'string',
    }).array(),
    // Proof: omitting this known shape admitted malformed kind, absent identity and null label at the generated HTTP decoder (2026-10-23).
    'remoteBlockageLabels?': type({
      root: type({ kind: "'step'", nodeId: 'string' }).or(
        type({ kind: "'work-item'", workItemId: 'string' }),
      ),
      label: 'string',
    }).array(),
    seq: 'number',
    scheduleError,
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
    // Both present exactly when a work item of the project states a demand
    // (`wbs-resources` 1.5): each demand in work-item then resource-id order, and
    // one entry per resource a demand names, under the caller's directory names.
    // The tree read alone carries them; an export writes its own file-local lists.
    'demands?': type({ workItemId: 'string', resourceId: 'string', units: 'number' }).array(),
    'demandedResources?': type({
      id: 'string',
      name: 'string',
      kind: "'exclusive' | 'divisible'",
      unitLabel: 'string',
    }).array(),
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
  return { workItemTree, numberedWorkItem, moneyBasis };
}

/** Frozen11 embedded project metadata, including its historical optional budget factor. */
function createLegacyProjectShape11() {
  const storedProject = type({
    id: 'string',
    name: 'string',
    ownerId: 'string',
    restricted: 'boolean',
    estimateMethod: "'pert' | 'optimistic' | 'realistic' | 'pessimistic'",
    depReach: "'whole-item' | 'anchor-slice'",
    pertWeights: { optimistic: 'number', realistic: 'number', pessimistic: 'number' },
    estimateRounding: "'exact' | 'floor' | 'round' | 'ceil'",
    startDate: 'string | null',
    solutionRef: type({ slug: 'string', url: 'string' }).or('null'),
    revision: 'number',
    createdAt: 'number',
    optimizationEnabled: 'boolean',
    scheduleEngine: "'fast' | 'optimized'",
    scheduleObjective: "'pri' | 'time'",
    /**
     * What derived budgets multiply the pessimistic point by
     * (`wbs-measure-budgets` D38). Optional on the wire only so a newer client
     * can read an older be-01 mid-swap.
     */
    'budgetFactor?': 'number',
    /**
     * The IANA zone every day derived from an instant is read in
     * (`step-node-attempts` D3). Optional on the wire only so a newer client can
     * read an older be-01 mid-swap; every be-01 that knows it sends it.
     */
    'timezone?': 'string',
  });
  const documentProject = storedProject.and({
    'abbreviation?': type('string').matching(/^[A-Z][A-Z0-9_-]{0,19}$/),
  });
  return documentProject;
}

/**
 * Construct only the requested historical11 response at its actual consumer.
 * Exact published7b declarations retain old project fields; eager boot compiles only current13/14.
 * Navigator7–11 and the strict10 consumer deliberately own this compatibility vocabulary.
 */
export function createLegacyPlanDocumentV11() {
  const { workItemTree, numberedWorkItem, moneyBasis } = createLegacyWorkItemShapes11();
  const documentProject = createLegacyProjectShape11();
  const planHeader = type({
    format: "'wbs-plan'",
    version: '11',
    exportedAt: 'string',
  });
  const planSettings = type({
    name: 'string',
    restricted: 'boolean',
    estimateMethod: "'pert' | 'optimistic' | 'realistic' | 'pessimistic'",
    depReach: "'whole-item' | 'anchor-slice'",
    pertWeights: { optimistic: 'number', realistic: 'number', pessimistic: 'number' },
    estimateRounding: "'exact' | 'floor' | 'round' | 'ceil'",
    startDate: 'string | null',
    // Non-empty, as a PATCH requires: a scoped import stores the link under
    // `project_solution`'s length checks.
    // Proof: accepting empty strings made `refuses an empty solution slug or url
    // as input, importing nothing` in
    // `import-export-organization.controller.db.test.ts` answer 500 instead of
    // 400; watched 2026-09-28.
    solutionRef: type({ slug: 'string > 0', url: 'string > 0' }).or('null'),
    optimizationEnabled: 'boolean',
    scheduleEngine: "'fast' | 'optimized'",
    scheduleObjective: "'pri' | 'time'",
    /** The IANA zone the project reads instants as days in; `UTC` before version 7. */
    timezone: 'string',
    /** What a derived budget multiplies the pessimistic point by (design D63, D71). */
    budgetFactor: 'number',
  });
  const named = type({ id: 'string', name: 'string' });
  const directory = type({
    teams: type({ id: 'string', name: 'string', serviceIds: 'string[]' }).array(),
    people: type({
      id: 'string',
      name: 'string',
      kind: "'person' | 'agent'",
      teamIds: 'string[]',
    }).array(),
    tags: named.array(),
    services: named.array(),
    types: named.array(),
    externalSystems: named.array(),
  });
  const documentResource = type({
    id: 'string',
    name: 'string',
    kind: "'exclusive' | 'divisible'",
    unitLabel: 'string',
  });
  const documentResourceCapacity = type({ resourceId: 'string', units: 'number' });
  const documentDemand = type({ workItemId: 'string', resourceId: 'string', units: 'number' });
  const documentMeasureDefinition = type({
    key: 'string',
    name: 'string',
    unit: 'string',
    kind: "'duration' | 'count' | 'money'",
    scale: "'integer' | 'real'",
    threePoint: 'boolean',
    showByDefault: 'boolean',
    schedulesWork: 'boolean',
    derived: 'boolean',
    order: 'number',
    currency: 'string | null',
  });
  const documentMeasureFact = type({
    workItemId: 'string',
    stepId: 'string',
    measure: 'string',
    value: 'number',
    basis: moneyBasis.or('null'),
  });
  const documentMeasureEstimate = type({
    workItemId: 'string',
    stepId: 'string',
    measure: 'string',
    optimistic: 'number',
    realistic: 'number',
    pessimistic: 'number',
    basis: moneyBasis.or('null'),
  });
  const documentBudget = type({
    workItemId: 'string',
    measure: 'string',
    cap: 'number',
    policy: "'strict' | 'advisory'",
    holdPerAttempt: 'number | null',
  });
  const authoredMarker = type({
    id: 'string',
    date: 'string',
    name: 'string',
    color: 'string | null',
  });
  const documentEndpoint = type({ scope: "'whole'", workItem: 'string' })
    .or({ scope: "'node'", workItem: 'string', step: 'string' })
    .or({ scope: "'descendant-step'", workItem: 'string', step: 'string' });
  const documentTypedDependency = type({
    id: 'string',
    predecessor: documentEndpoint,
    successor: documentEndpoint,
    // Proof: making type optional let the mounted v5 import accept a missing
    // type with HTTP 204 instead of refusing it with 400 (2026-09-28).
    type: "'FS' | 'SS' | 'FF'",
  });
  const documentAttempt = type({
    number: 'number',
    startedAt: 'string',
    endedAt: 'string | null',
    // Proof: widened to 'string | null', the unknown-outcome case of `refuses an
    // unknown zone, an unknown outcome, …` (`step-node-attempt.controller.db`)
    // answered 500 (`CHECK constraint failed: step_node_attempt_outcome`)
    // instead of 400; watched 2026-10-12.
    outcome: "'succeeded' | 'failed' | 'cancelled' | null",
    executor: 'string | null',
    reference: 'string | null',
    note: 'string | null',
  });
  const documentWorkItem = numberedWorkItem
    .omit(
      'attempts',
      'spans',
      'span',
      'blockages',
      'blockageCauses',
      'nodeResources',
      'measureEstimates',
      'budgets',
      'mixedRateCards',
      'moneyBases',
    )
    .and({ 'attempts?': type({ '[string]': documentAttempt.array() }) });
  const planDocumentV11 = workItemTree
    .omit('typedDependencies', 'workItems', 'demands', 'demandedResources')
    .and({
      workItems: documentWorkItem.array(),
      stepBlockages: type({
        workItemId: 'string',
        stepId: 'string',
        blockedAt: 'number.integer',
      }).array(),
      typedDependencies: documentTypedDependency.array(),
      steps: type({ code: 'string', estimateUnit: "'workdays' | 'minutes'" }).array(),
      stepNodes: type({
        id: 'string',
        workItemId: 'string',
        stepId: 'string',
        reference: 'string',
      }).array(),
      project: documentProject,
      document: planHeader,
      settings: planSettings,
      capacity: type({ teamId: 'string', size: 'number' }).array(),
      resourceCapacities: documentResourceCapacity.array(),
      demands: documentDemand.array(),
      calendarMarkers: authoredMarker.array(),
      directory: directory.and({ resources: documentResource.array() }),
      // Always written, empty when the plan holds none (design D63, D71).
      measureDefinitions: documentMeasureDefinition.array(),
      measureFacts: documentMeasureFact.array(),
      measureEstimates: documentMeasureEstimate.array(),
      budgets: documentBudget.array(),
    });
  return planDocumentV11;
}
export type PlanDocumentV11 = ReturnType<typeof createLegacyPlanDocumentV11>['infer'];

/** Construct resource-era10 only from frozen11 fields, never from a renamed current response. */
export function createPlanDocumentV10() {
  const published = createLegacyPlanDocumentV11();
  return published
    .omit(
      'project',
      'document',
      'settings',
      'measureDefinitions',
      'measureFacts',
      'measureEstimates',
      'budgets',
    )
    .and({
      project: published.get('project').omit('budgetFactor'),
      document: published.get('document').omit('version').and({ version: '10' }),
      settings: published.get('settings').omit('budgetFactor'),
    });
}
export type PlanDocumentV10 = ReturnType<typeof createPlanDocumentV10>['infer'];

/**
 * Complete published12 declaration, including old project history and boundary1.
 * JSON consumers wrap it in requestSchema and use validateSchema: descriptor validation
 * also rejects arrays where ArkType alone accepts empty object-valued dictionaries.
 * No import projection or defaulting occurs.
 */
export function createLegacyPlanDocumentV12() {
  const published = createLegacyPlanDocumentV11();
  return published
    .omit('document', 'typedDependencies')
    .and({
      document: published.get('document').omit('version').and({ version: '12' }),
      typedDependencies: createLegacyDocumentDependency12().array(),
      // Proof: F02 made connected history optional: missing-history12 exited 0 instead of 1
      // (plan-reference-current.test.ts).
      connected: createLegacyDocumentConnected12(),
    })
    .onDeepUndeclaredKey('reject');
}
export type PlanDocumentV12 = ReturnType<typeof createLegacyPlanDocumentV12>['infer'];
