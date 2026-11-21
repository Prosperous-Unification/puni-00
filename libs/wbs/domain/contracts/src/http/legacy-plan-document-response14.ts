import { type } from 'arktype';

import {
  createLegacyWorkItemShapes14,
  createLegacyWorkPackageShape14,
} from './legacy-document-leaves14';
import { createLegacyDocumentConnected14 } from './legacy-plan-document-connected14';

/** Complete published ordinary13; no live response declaration is its dependency. */
export function createLegacyPlanDocumentV13() {
  const { workItemTree, numberedWorkItem, moneyBasis } = createLegacyWorkItemShapes14();
  const documentWorkPackage = createLegacyWorkPackageShape14();
  const planHeader = type({
    format: "'wbs-plan'",
    version: '13',
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
    // `work_package_solution`'s length checks.
    // Proof: accepting empty strings made `refuses an empty solution slug or url
    // as input, importing nothing` in
    // `import-export-organization.controller.db.test.ts` answer 500 instead of
    // 400; watched 2026-09-28.
    solutionRef: type({ slug: 'string > 0', url: 'string > 0' }).or('null'),
    optimizationEnabled: 'boolean',
    scheduleEngine: "'fast' | 'optimized'",
    scheduleObjective: "'pri' | 'time'",
    /** The IANA zone the work package reads instants as days in; `UTC` before version 7. */
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

  /** A resource as the document writes it (`wbs-resources`): file-local id, name, kind, unit. */
  const documentResource = type({
    id: 'string',
    name: 'string',
    kind: "'exclusive' | 'divisible'",
    unitLabel: 'string',
  });

  /** One stated resource capacity of the exported work package, by file-local resource id. */
  const documentResourceCapacity = type({ resourceId: 'string', units: 'number' });

  /** One work item's demand on one resource, both by file-local id. */
  const documentDemand = type({ workItemId: 'string', resourceId: 'string', units: 'number' });

  /**
   * A measure definition as version 11 writes it (`wbs-measure-budgets` D1,
   * design D63): every field but the organization's id, so an import elsewhere
   * can match it by key or create it.
   */
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

  /**
   * One fact in a defined measure, by file-local work item and step and by
   * definition key, with the basis a money figure was priced under (null when
   * none was recorded). Facts in `tokens` and `hours` stay in the row's legacy
   * `measures` (design D18).
   */
  const documentMeasureFact = type({
    workItemId: 'string',
    stepId: 'string',
    measure: 'string',
    value: 'number',
    basis: moneyBasis.or('null'),
  });

  /**
   * One three-point estimate in a measure other than time. A single-point
   * tokens trio is the row's legacy `token_estimate` and is not repeated here
   * (design D28).
   */
  const documentMeasureEstimate = type({
    workItemId: 'string',
    stepId: 'string',
    measure: 'string',
    optimistic: 'number',
    realistic: 'number',
    pessimistic: 'number',
    basis: moneyBasis.or('null'),
  });

  /** One stated budget; derived budgets are computed again after import (design D38). */
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

  /**
   * Version 5 keeps the established export and carries all typed relationships with
   * file-local work-item and step references, distinct from legacy links.
   *
   * A step's `code` is optional and nullable on the work-item read (an older
   * be-01, an uncoded step); here it is a required string, because the export
   * refuses an uncoded work package rather than write a file without its codes.
   * `stepNodes` spells each leaf's step node beside the structured work-item and
   * step IDs the estimates, facts and assignments are keyed by — `010.s1-dev` for
   * `sn1.<work item>.<step>` — for a reader of the file. It is derived, so import
   * drops it and the new work package's nodes follow its own IDs.
   */
  /**
   * One attempt as the document writes it (`step-node-attempts` D5): instants as
   * ISO-8601 UTC strings for a reader of the file, the executor by the name the
   * file's directory gives that person, end and outcome null while it runs.
   */
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

  /**
   * A work item as the document writes it: the read's row without its derived
   * spans, and with its attempts keyed by step code rather than step id —
   * present only on a leaf that holds any.
   */
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
  return workItemTree.omit('typedDependencies', 'workItems', 'demands', 'demandedResources').and({
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
    workPackage: documentWorkPackage,
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
}
export type LegacyPlanDocumentV13 = ReturnType<typeof createLegacyPlanDocumentV13>['infer'];

/** Complete published connected14, optionally sharing the caller's already-built ordinary13. */
export function createLegacyPlanDocumentV14(planDocumentV13 = createLegacyPlanDocumentV13()) {
  const planHeader = type({
    format: "'wbs-plan'",
    version: '13',
    exportedAt: 'string',
  });
  const internalEndpoint = type({ kind: "'internal'", scope: "'whole'", workItem: 'string' })
    .or({ kind: "'internal'", scope: "'node'", workItem: 'string', step: 'string' })
    .or({ kind: "'internal'", scope: "'descendant-step'", workItem: 'string', step: 'string' });
  const externalDisplay = type({
    workPackageName: 'string',
    abbreviation: 'string',
    workItemName: 'string',
    address: 'string',
    'stepName?': 'string',
  });
  const externalEndpoint = type({
    kind: "'external'",
    scope: "'whole'",
    workPackageId: 'string',
    workItemId: 'string',
    display: externalDisplay,
  }).or({
    kind: "'external'",
    scope: "'node' | 'descendant-step'",
    workPackageId: 'string',
    workItemId: 'string',
    stepId: 'string',
    // Proof: making stepName optional admitted the missing-label classifier test
    // in plan-document.resource.test.ts (2026-10-22).
    display: externalDisplay.and({ stepName: 'string' }),
  });
  /** Authored v11 links belong to the imported successor; labels never bind identity. */
  const documentV14TypedDependency = type({
    id: 'string',
    predecessor: internalEndpoint.or(externalEndpoint),
    successor: internalEndpoint,
    type: "'FS' | 'SS' | 'FF'",
  });
  /** Explicit external predecessor identities; import mappings are never exported. */
  return planDocumentV13.omit('document', 'typedDependencies').and({
    // Proof: replacing the connected version with the ordinary version failed the versioned-response test (2026-10-22).
    document: planHeader.omit('version').and({ version: '14' }),
    typedDependencies: documentV14TypedDependency.array(),
    // Proof: optional-evidence.txt: making this optional made mounted absent-history return 200 instead of 500.
    connected: createLegacyDocumentConnected14(),
  });
}
export type LegacyPlanDocumentV14 = ReturnType<typeof createLegacyPlanDocumentV14>['infer'];
