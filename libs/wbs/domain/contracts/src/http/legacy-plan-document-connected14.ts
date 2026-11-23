import { type } from 'arktype';

/** Published connected14 evidence, independent of later live exports. */
export function createLegacyDocumentConnected14() {
  const finite = type('number').atLeast(-Number.MAX_VALUE).atMost(Number.MAX_VALUE);
  const nullableFinite = finite.or('null');

  const identity = type({ workPackageId: 'string', workItemId: 'string', scope: "'whole'" }).or({
    workPackageId: 'string',
    workItemId: 'string',
    scope: "'node' | 'descendant-step'",
    stepId: 'string',
  });
  const question = type({
    workPackageId: 'string',
    inputHash: 'string',
    questionHash: 'string',
    objective: "'pri' | 'time'",
    contractVersion: 'string',
    budgetMs: finite,
    quantum: finite,
    wireVersion: finite,
    stageBytes: 'string',
  });
  const variant = type({ state: "'pending' | 'retrying' | 'idle'" })
    .or({ state: "'ready'", proof: "'proven' | 'incomplete' | 'quantisation-floor'" })
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
        effectiveDeadlineOffset: finite,
      }).array(),
    })
    .or({
      state: "'boundary-infeasible'",
      certificate: {
        kind: "'boundary-infeasible'",
        question,
        evidence: "'contradictory-bounds' | 'initial-model-infeasible'",
      },
    });
  const candidate = type({
    question,
    starts: type({ sliceId: 'string', start: finite }).array(),
  }).or('null');
  const optimization = type({
    inputHash: 'string',
    generation: nullableFinite,
    contractVersion: 'string',
    budgetMs: finite,
    quantum: finite,
    wireVersion: finite,
    variants: { pri: variant, time: variant },
    candidates: { pri: candidate, time: candidate },
  }).or('null');
  const values = type({ makespan: finite, priority: finite, movement: finite });
  const decision = type({
    scope: { kind: "'connected-stage'", workPackageId: 'string' },
    chosen: "'optimized' | 'baseline'",
    values,
    optimizedValues: values,
    baselineValues: values,
  }).or('null');
  const stage = type({
    workPackageId: 'string',
    engine: "'fast' | 'optimized'",
    objective: "'pri' | 'time'",
    // Proof: F14 widened boundary2: an injected boundary1 export14 exited 0 instead of 1
    // (plan-reference-current.test.ts).
    boundary: { format: "'wbs-connected-stage'", version: '2', canonical: 'string' },
    optimization,
    decisions: { pri: decision, time: decision },
    chosen: decision,
  });
  const position = type({
    workPackageId: 'string',
    workItemId: 'string',
    stepId: 'string | null',
    start: finite,
    finish: finite,
  });
  const placement = type({
    kind: "'dependency_calendar_missing'",
    workPackages: type({ workPackageId: 'string', abbreviation: 'string', name: 'string' }).array(),
  })
    .or({
      kind: "'engine_unavailable'",
      engine: "'optimized'",
      workPackages: 'string[]',
      reason: "'adapter_missing' | 'connected_optimization_not_supported'",
    })
    .or({ kind: "'unavailable'", reason: "'cycle' | 'calendar_range'" })
    .or({
      kind: "'scheduled'",
      originOrdinal: nullableFinite,
      baseline: position.array(),
      selected: position.array(),
      stages: stage.array(),
      idleWorkPackages: 'string[]',
    });

  /** Detached historical evidence; import discards it and never treats it as current authority. */
  const documentConnected = type({
    kind: "'connected'",
    workPackageId: 'string',
    mode: "'isolated' | 'shared'",
    workPackages: type({
      workPackageId: 'string',
      name: 'string',
      abbreviation: 'string',
      rank: finite,
      startDate: 'string | null',
      timezone: 'string',
      revision: finite,
      seq: finite,
    }).array(),
    relationships: type({
      id: 'string',
      workPackageId: 'string',
      predecessor: identity,
      successor: identity,
      type: "'FS' | 'SS' | 'FF'",
    }).array(),
    placement,
  });

  return documentConnected;
}
