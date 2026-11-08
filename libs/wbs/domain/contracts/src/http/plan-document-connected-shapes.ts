import { type } from 'arktype';

const finite = type('number').atLeast(-Number.MAX_VALUE).atMost(Number.MAX_VALUE);
const nullableFinite = finite.or('null');

const identity = type({ projectId: 'string', workItemId: 'string', scope: "'whole'" }).or({
  projectId: 'string',
  workItemId: 'string',
  scope: "'node' | 'descendant-step'",
  stepId: 'string',
});
const question = type({
  projectId: 'string',
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
const candidate = type({ question, starts: type({ sliceId: 'string', start: finite }).array() }).or(
  'null',
);
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
  scope: { kind: "'connected-stage'", projectId: 'string' },
  chosen: "'optimized' | 'baseline'",
  values,
  optimizedValues: values,
  baselineValues: values,
}).or('null');
const stage = type({
  projectId: 'string',
  engine: "'fast' | 'optimized'",
  objective: "'pri' | 'time'",
  boundary: { format: "'wbs-connected-stage'", version: '1', canonical: 'string' },
  optimization,
  decisions: { pri: decision, time: decision },
  chosen: decision,
});
const position = type({
  projectId: 'string',
  workItemId: 'string',
  stepId: 'string | null',
  start: finite,
  finish: finite,
});
const placement = type({
  kind: "'dependency_calendar_missing'",
  projects: type({ projectId: 'string', abbreviation: 'string', name: 'string' }).array(),
})
  .or({
    kind: "'engine_unavailable'",
    engine: "'optimized'",
    projects: 'string[]',
    reason: "'adapter_missing' | 'connected_optimization_not_supported'",
  })
  .or({ kind: "'unavailable'", reason: "'cycle' | 'calendar_range'" })
  .or({
    kind: "'scheduled'",
    originOrdinal: nullableFinite,
    baseline: position.array(),
    selected: position.array(),
    stages: stage.array(),
    idleProjects: 'string[]',
  });

/** Detached historical evidence; import discards it and never treats it as current authority. */
export const documentConnected = type({
  kind: "'connected'",
  projectId: 'string',
  mode: "'isolated' | 'shared'",
  projects: type({
    projectId: 'string',
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
    projectId: 'string',
    predecessor: identity,
    successor: identity,
    type: "'FS' | 'SS' | 'FF'",
  }).array(),
  placement,
});
export type DocumentConnected = (typeof documentConnected)['infer'];
