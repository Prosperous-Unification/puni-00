import { expect, test } from 'bun:test';

import { canonicalJson } from './canonical';
import { acceptWorkflowBinding, checkWorkflowBinding } from './validate-workflow-binding';
import * as workflow from './workflow-binding';
import {
  decodeWorkflowBinding,
  WorkflowBindingError,
  type WorkflowBindingErrorCode,
} from './workflow-binding';

function snapshot() {
  return {
    schemaVersion: 1 as const,
    binding: {
      version: 1 as const,
      types: { default: { plan: { class: 'plan' }, build: { class: 'tool' } } },
      classes: {
        plan: { executor: 'human' as const, prompt: 'prompts/plan.md' },
        tool: { executor: 'tool' as const, command: 'build' },
        unused: { executor: 'human' as const, prompt: 'nested/unused.md' },
      },
    },
    projectSteps: ['build', 'plan'],
    prompts: [
      { path: 'nested/unused.md', sha256: 'a'.repeat(64) },
      { path: 'prompts/plan.md', sha256: 'b'.repeat(64) },
    ],
  };
}

function refuses(input: unknown, code: WorkflowBindingErrorCode) {
  expect(() => workflow.decodeWorkflowAcceptance(input)).toThrow(WorkflowBindingError);
  try {
    workflow.decodeWorkflowAcceptance(input);
  } catch (failure) {
    expect(failure).toBeInstanceOf(WorkflowBindingError);
    expect((failure as WorkflowBindingError).code).toBe(code);
  }
}

test('decodes complete tool and human descriptors including nested unused paths', () => {
  const supplied = snapshot();
  expect(workflow.decodeWorkflowAcceptance(supplied)).toEqual(supplied);
});

test('round trips original BOM byte acceptance through the owned decoder', () => {
  const binding = decodeWorkflowBinding({
    version: 1 as const,
    types: { default: { plan: { class: 'plan' } } },
    classes: { plan: { executor: 'human' as const, prompt: 'prompts/plan.md' } },
  });
  const checked = checkWorkflowBinding(binding, ['plan']);
  const accepted = acceptWorkflowBinding(checked, [
    { path: 'prompts/plan.md', bytes: new Uint8Array([239, 187, 191, 112, 10]) },
  ]);
  expect(workflow.decodeWorkflowAcceptance(JSON.parse(canonicalJson(accepted.snapshot)))).toEqual(
    accepted.snapshot,
  );
});

for (const [name, mutate, code] of [
  [
    'unsupported version',
    (value: ReturnType<typeof snapshot>) => {
      Reflect.set(value, 'schemaVersion', 2);
    },
    'unsupported_version',
  ],
  [
    'absent version',
    (value: ReturnType<typeof snapshot>) => {
      Reflect.deleteProperty(value, 'schemaVersion');
    },
    'invalid_binding',
  ],
  [
    'extra envelope field',
    (value: ReturnType<typeof snapshot>) => {
      Reflect.set(value, 'extra', true);
    },
    'invalid_binding',
  ],
  [
    'extra descriptor field',
    (value: ReturnType<typeof snapshot>) => {
      Reflect.set(value.prompts[0], 'extra', true);
    },
    'invalid_binding',
  ],
  [
    'uppercase SHA',
    (value: ReturnType<typeof snapshot>) => {
      value.prompts[0].sha256 = 'A'.repeat(64);
    },
    'invalid_binding',
  ],
  [
    'short SHA',
    (value: ReturnType<typeof snapshot>) => {
      value.prompts[0].sha256 = 'a';
    },
    'invalid_binding',
  ],
  [
    'invalid descriptor path',
    (value: ReturnType<typeof snapshot>) => {
      value.prompts[0].path = '../unused.md';
    },
    'invalid_binding',
  ],
  [
    'drive descriptor path',
    (value: ReturnType<typeof snapshot>) => {
      value.prompts[0].path = 'C:unused.md';
    },
    'invalid_binding',
  ],
  [
    'duplicate descriptors',
    (value: ReturnType<typeof snapshot>) => {
      value.prompts[1] = value.prompts[0];
    },
    'invalid_prompt_sources',
  ],
  [
    'unsorted descriptors',
    (value: ReturnType<typeof snapshot>) => {
      value.prompts.reverse();
    },
    'invalid_prompt_sources',
  ],
  [
    'missing unused descriptor',
    (value: ReturnType<typeof snapshot>) => {
      value.prompts.shift();
    },
    'invalid_prompt_sources',
  ],
  [
    'missing trailing descriptor',
    (value: ReturnType<typeof snapshot>) => {
      value.prompts.pop();
    },
    'invalid_prompt_sources',
  ],
  [
    'extra descriptor',
    (value: ReturnType<typeof snapshot>) => {
      value.prompts.push({ path: 'z.md', sha256: 'a'.repeat(64) });
    },
    'invalid_prompt_sources',
  ],
  [
    'nested invalid executor',
    (value: ReturnType<typeof snapshot>) => {
      Reflect.set(value.binding.classes.unused, 'executor', 'other');
    },
    'unknown_executor',
  ],
  [
    'nonstring project step',
    (value: ReturnType<typeof snapshot>) => {
      Reflect.set(value.projectSteps, '0', 4);
    },
    'invalid_binding',
  ],
  [
    'non-JSON value',
    (value: ReturnType<typeof snapshot>) => {
      Reflect.set(value, 'projectSteps', undefined);
    },
    'invalid_binding',
  ],
  [
    'accessor',
    (value: ReturnType<typeof snapshot>) => {
      Object.defineProperty(value, 'projectSteps', { enumerable: true, get: () => ['plan'] });
    },
    'invalid_binding',
  ],
  [
    'sparse array',
    (value: ReturnType<typeof snapshot>) => {
      Reflect.deleteProperty(value.projectSteps, '0');
    },
    'invalid_binding',
  ],
  [
    'decorated array',
    (value: ReturnType<typeof snapshot>) => {
      Reflect.set(value.projectSteps, 'extra', 1);
    },
    'invalid_binding',
  ],
  [
    'cyclic input',
    (value: ReturnType<typeof snapshot>) => {
      Reflect.set(value, 'binding', value);
    },
    'invalid_binding',
  ],
] as const)
  test(`refuses acceptance ${name}`, () => {
    const supplied = snapshot();
    mutate(supplied);
    refuses(supplied, code);
  });

test('leaves project-step semantics to the existing coverage checker', () => {
  for (const projectSteps of [[], [''], ['plan', 'plan'], ['wrong']]) {
    const decoded = workflow.decodeWorkflowAcceptance({ ...snapshot(), projectSteps });
    expect(() => checkWorkflowBinding(decoded.binding, decoded.projectSteps)).toThrow(
      WorkflowBindingError,
    );
  }
});

test('detaches and deeply freezes acceptance without freezing caller input', () => {
  const supplied = snapshot();
  const decoded = workflow.decodeWorkflowAcceptance(supplied);
  expect(Reflect.set(supplied.binding.classes.plan, 'prompt', 'changed.md')).toBe(true);
  expect(Reflect.set(supplied.prompts[0], 'sha256', 'c'.repeat(64))).toBe(true);
  expect(decoded.binding.classes['plan']).toEqual({
    executor: 'human' as const,
    prompt: 'prompts/plan.md',
  });
  for (const frozen of [
    decoded,
    decoded.binding,
    decoded.binding.types,
    decoded.binding.types['default'],
    decoded.binding.types['default']['plan'],
    decoded.binding.classes,
    decoded.binding.classes['plan'],
    decoded.projectSteps,
    decoded.prompts,
    decoded.prompts[0],
  ])
    expect(Reflect.set(frozen, 'changed', true)).toBe(false);
});
