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

const PlanTask = type({
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
export type PlanTask = typeof PlanTask.infer;

/**
 * The task export `twin plan-reference` writes beside a plan reference as `tasks.json`: the
 * plan's steps in position order and its leaf work items in export order. A plan reference
 * binds it by `tasksDigest`, the canonical-JSON digest of this whole value.
 */
export const PlanTasks = type({
  schemaVersion: '1',
  kind: "'plan-tasks'",
  plan: 'string>=1',
  steps: type({ id: 'string>=1', code: 'string>=1', name: 'string' })
    .onUndeclaredKey('reject')
    .array(),
  tasks: PlanTask.array(),
}).onUndeclaredKey('reject');
export type PlanTasks = typeof PlanTasks.infer;
