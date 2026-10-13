import { type } from '@shared/validation';

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

/**
 * Both persisted task versions decode without transformation so their canonical digest still
 * binds the original value. Schema 1 estimates are workdays; schema 2 names every native unit.
 */
// Proof: dropping HistoricalPlanTasks failed historical receipt conversion (2026-10-13).
export const PlanTasks = HistoricalPlanTasks.or(NativePlanTasks);
export type PlanTasks = typeof PlanTasks.infer;
