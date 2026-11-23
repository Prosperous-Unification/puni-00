import { type } from '@shared/validation';

// Proof: ignoring all undeclared keys made six task-boundary unknown-key CLI cases exit 0
// (plan-tasks.test.ts, 2026-10-13); the reference boundary remains separately strict.
const Endpoint = type({ scope: "'whole'", workItem: 'string>=1' })
  .onUndeclaredKey('reject')
  .or(
    type({
      scope: "'node'|'descendant-step'",
      workItem: 'string>=1',
      step: 'string>=1',
    }).onUndeclaredKey('reject'),
  );

const HistoricalPlanTask = type({
  id: 'string>=1',
  number: 'string',
  name: 'string',
  ancestors: 'string[]',
  estimateDays: type({
    stepCode: 'string>=1',
    optimistic: 'number',
    realistic: 'number',
    pessimistic: 'number',
  })
    .onUndeclaredKey('reject')
    .array(),
  dependsOn: 'string[]',
  typedDependencies: type({
    id: 'string>=1',
    type: "'FS'|'SS'|'FF'",
    predecessor: Endpoint,
    successor: Endpoint,
  })
    .onUndeclaredKey('reject')
    .array(),
}).onUndeclaredKey('reject');

/**
 * The task export `twin plan-reference` writes beside a plan reference as `tasks.json`: the
 * plan's steps in position order and its leaf work items in export order. A plan reference
 * binds it by `tasksDigest`, the canonical-JSON digest of this whole value.
 */
const HistoricalPlanTasks = type({
  schemaVersion: '1',
  kind: "'plan-tasks'",
  plan: 'string>=1',
  steps: type({ id: 'string>=1', code: 'string>=1', name: 'string' })
    .onUndeclaredKey('reject')
    .array(),
  tasks: HistoricalPlanTask.array(),
}).onUndeclaredKey('reject');
/** Native estimates retain their authored values and unit; no scheduling conversion occurs. */
const NativePlanTask = HistoricalPlanTask.onUndeclaredKey('ignore')
  .omit('estimateDays')
  .and({
    estimates: type({
      stepCode: 'string>=1',
      // Proof: making unit optional failed the missing-unit receipt refusal (2026-10-13).
      unit: "'workdays'|'minutes'",
      optimistic: 'number',
      realistic: 'number',
      pessimistic: 'number',
      // Proof: removing rejection failed the unknown estimate-key receipt refusal (2026-10-13).
    })
      .onUndeclaredKey('reject')
      .array(),
  })
  .onUndeclaredKey('reject');
export type PlanTask = typeof NativePlanTask.infer;

/** Schema 2 replaces historical workday estimates with explicitly unit-bearing estimates. */
const NativePlanTasks = HistoricalPlanTasks.onUndeclaredKey('ignore')
  .omit('schemaVersion', 'tasks')
  .and({
    schemaVersion: '2',
    tasks: NativePlanTask.array(),
  })
  .onUndeclaredKey('reject');

/** Internal endpoints preserve authored local references, including parent work items. */
const InternalEndpoint = type({ kind: "'internal'", scope: "'whole'", workItem: 'string>=1' }).or({
  kind: "'internal'",
  scope: "'node'|'descendant-step'",
  workItem: 'string>=1',
  step: 'string>=1',
});
const ExternalDisplay = type({
  workPackageName: 'string',
  abbreviation: 'string',
  workItemName: 'string',
  address: 'string',
  'stepName?': 'string',
});
const ExternalEndpoint = type({
  kind: "'external'",
  scope: "'whole'",
  workPackageId: 'string>=1',
  workItemId: 'string>=1',
  display: ExternalDisplay,
}).or({
  kind: "'external'",
  scope: "'node'|'descendant-step'",
  workPackageId: 'string>=1',
  workItemId: 'string>=1',
  stepId: 'string>=1',
  // Proof: S04 removed required stepName: node and descendant-step missing-name samples became
  // allowed after valid controls (plan-tasks3.test.ts).
  display: ExternalDisplay.and({ stepName: 'string' }),
});
/** Authored edges are retained once, in document order; only predecessors may be external. */
const AuthoredDependency = type({
  id: 'string>=1',
  type: "'FS'|'SS'|'FF'",
  predecessor: InternalEndpoint.or(ExternalEndpoint),
  // Proof: S02 widened the successor union: the external-successor sample became allowed
  // (plan-tasks3.test.ts).
  successor: InternalEndpoint,
});
/** Schema3 preserves complete authored edges separately from local leaf receipt targets. */
const AuthoredPlanTasks = NativePlanTasks.onUndeclaredKey('ignore')
  .omit('schemaVersion', 'tasks')
  .and({
    schemaVersion: '3',
    tasks: NativePlanTask.onUndeclaredKey('ignore').omit('typedDependencies').array(),
    // Proof: S03 made this field optional: the missing document-level edge array became allowed
    // (plan-tasks3.test.ts).
    typedDependencies: AuthoredDependency.array(),
  })
  // Proof: S01 ignored deep unknown keys: endpoint, root and per-task-edge samples became allowed
  // (plan-tasks3.test.ts).
  .onDeepUndeclaredKey('reject');
export type AuthoredPlanTasks = typeof AuthoredPlanTasks.infer;
/** Persisted versions decode without transformation; schemas1/2 retain canonical digest meanings. */
export const PlanTasks = HistoricalPlanTasks.or(NativePlanTasks).or(AuthoredPlanTasks);
export type PlanTasks = typeof PlanTasks.infer;
