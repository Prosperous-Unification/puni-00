import { expect, test } from 'bun:test';

import { digestOf } from './canonical';
import { PlanTasks } from './plan-tasks';
import { validatePlanTasks } from './validate-plan-tasks';
export function tasks3() {
  return {
    schemaVersion: 3,
    kind: 'plan-tasks',
    plan: 'local',
    steps: [{ id: 'step', code: 'build', name: 'Build' }],
    tasks: [
      {
        id: 'leaf',
        number: '1',
        name: 'Leaf',
        ancestors: ['Parent'],
        estimates: [
          { stepCode: 'build', unit: 'minutes', optimistic: 1, realistic: 2, pessimistic: 3 },
        ],
        dependsOn: [],
      },
    ],
    typedDependencies: [
      {
        id: 'edge',
        type: 'FS',
        predecessor: {
          kind: 'external',
          scope: 'whole',
          workPackageId: 'remote',
          workItemId: 'leaf',
          display: {
            workPackageName: 'Remote',
            abbreviation: 'R',
            workItemName: 'Remote leaf',
            address: 'R.1',
          },
        },
        successor: { kind: 'internal', scope: 'whole', workItem: 'parent' },
      },
    ],
  };
}
function reference(version: number, tasks: unknown) {
  const body = {
    schemaVersion: 1,
    kind: 'plan-reference',
    planRef: {
      repository: 'repo',
      plan: 'local',
      change: 'change',
      planningCommit: '1'.repeat(40),
      sourceBaseCommit: '2'.repeat(40),
      requirementsDigest: 'a'.repeat(64),
    },
    planDocumentVersion: version,
    exportDigest: 'b'.repeat(64),
    tasksDigest: digestOf(tasks),
    taskCount: 1,
    createdAt: '2026-11-11T00:00:00.000Z',
  };
  return { ...body, referenceDigest: digestOf(body) };
}
test.each([12, 13, 14, 15, 16])(
  'schema3 pairs with document%i including parent successor and external collision',
  (version) => {
    const tasks = tasks3();
    expect(PlanTasks.allows(tasks)).toBe(true);
    expect(validatePlanTasks(reference(version, tasks), tasks).plan).toBe('local');
  },
);
test.each([6, 7, 8, 9, 10, 11])('schema3 refuses redigested document%i', (version) => {
  const tasks = tasks3();
  expect(() => validatePlanTasks(reference(version, tasks), tasks)).toThrow('schema pairing');
});
test.each([12, 13, 14, 15, 16])('old schema refuses redigested document%i', (version) => {
  const { typedDependencies, ...tasks } = tasks3();
  const old = {
    ...tasks,
    schemaVersion: 2,
    tasks: tasks.tasks.map((task) => ({ ...task, typedDependencies: [] })),
  };
  expect(() => validatePlanTasks(reference(version, old), old)).toThrow('schema pairing');
});
test.each(['node', 'descendant-step'])(
  'schema3 retains external%s step identity and required display',
  (scope) => {
    const tasks = tasks3();
    Reflect.set(tasks.typedDependencies[0], 'predecessor', {
      ...tasks.typedDependencies[0].predecessor,
      scope,
      stepId: 'foreign-step',
      display: { ...tasks.typedDependencies[0].predecessor.display, stepName: 'Build' },
    });
    expect(PlanTasks.allows(tasks)).toBe(true);
    Reflect.deleteProperty(tasks.typedDependencies[0].predecessor.display, 'stepName');
    expect(PlanTasks.allows(tasks)).toBe(false);
  },
);
test.each([
  'old owner',
  'mixed display',
  'external successor',
  'unknown endpoint',
  'unknown root',
  'per-task edges',
  'missing edges',
  'whole step',
])('schema3 refuses %s', (fault) => {
  const tasks = tasks3();
  const edge = tasks.typedDependencies[0];
  if (fault === 'old owner') Reflect.set(edge.predecessor, 'projectId', 'remote');
  if (fault === 'mixed display') Reflect.set(edge.predecessor.display, 'projectName', 'Remote');
  if (fault === 'external successor') Reflect.set(edge, 'successor', edge.predecessor);
  if (fault === 'unknown endpoint') Reflect.set(edge.predecessor, 'extra', true);
  if (fault === 'unknown root') Reflect.set(tasks, 'extra', true);
  if (fault === 'per-task edges') Reflect.set(tasks.tasks[0], 'typedDependencies', []);
  if (fault === 'missing edges') Reflect.deleteProperty(tasks, 'typedDependencies');
  if (fault === 'whole step') Reflect.set(edge.predecessor, 'stepId', 'foreign');
  expect(PlanTasks.allows(tasks)).toBe(false);
});
