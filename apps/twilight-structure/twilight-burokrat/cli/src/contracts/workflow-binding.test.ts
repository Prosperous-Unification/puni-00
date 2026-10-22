import { expect, test } from 'bun:test';

import { checkWorkflowBinding, selectActivityClass } from './validate-workflow-binding';
import { decodeWorkflowBinding, WorkflowBindingError } from './workflow-binding';

const steps = ['api', 'harness', 'acp', 'tool', 'human'];
function fixture() {
  return {
    version: 1,
    types: {
      default: {
        api: { class: 'api' },
        harness: { class: 'harness' },
        acp: { class: 'acp' },
        tool: { class: 'tool' },
        human: { class: 'human' },
      },
    },
    classes: {
      api: {
        executor: 'api-model',
        model: 'openrouter:openai/gpt-6-sol',
        prompt: '.twilight/api.md',
        tools: [] as string[],
        limits: { maxSteps: 2, maxOutputTokens: 80 },
      },
      harness: {
        executor: 'cli-harness',
        harness: 'codex',
        permissionMode: 'read-only',
        prompt: '.twilight/harness.md',
      },
      acp: {
        executor: 'acp',
        agent: 'review-agent',
        prompt: '.twilight/acp.md',
        tools: [] as string[],
      },
      tool: { executor: 'tool', command: 'bin/h2puni-gate.sh' },
      human: { executor: 'human', prompt: '.twilight/human.md' },
    },
  };
}

test('selects a whole default type without claiming acceptance', () => {
  const checked = checkWorkflowBinding(decodeWorkflowBinding(fixture()), steps);
  expect(selectActivityClass(checked, 'change', 'tool')).toEqual({
    requestedType: 'change',
    matchedType: 'default',
    stepCode: 'tool',
    className: 'tool',
    settings: { executor: 'tool', command: 'bin/h2puni-gate.sh' },
  });
  expect(Object.hasOwn(checked, 'bindingDigest')).toBe(false);
  expect(checked.projectSteps).toEqual(['acp', 'api', 'harness', 'human', 'tool']);
});

test('selects all five valid classes and keeps slash-qualified models', () => {
  const checked = checkWorkflowBinding(decodeWorkflowBinding(fixture()), steps);
  expect(
    steps.map((step) => selectActivityClass(checked, 'default', step).settings.executor),
  ).toEqual(['api-model', 'cli-harness', 'acp', 'tool', 'human']);
  expect(selectActivityClass(checked, 'default', 'api').settings).toMatchObject({
    model: 'openrouter:openai/gpt-6-sol',
  });
});

test('selects an exact explicit type as a whole', () => {
  const candidate = fixture();
  Object.assign(candidate.types, {
    Change: { ...candidate.types.default, api: { class: 'human' } },
  });
  const checked = checkWorkflowBinding(decodeWorkflowBinding(candidate), steps);
  expect(selectActivityClass(checked, 'Change', 'api')).toEqual({
    requestedType: 'Change',
    matchedType: 'Change',
    stepCode: 'api',
    className: 'human',
    settings: { executor: 'human', prompt: '.twilight/human.md' },
  });
});

test('refuses an unknown mapped step through the production checker', () => {
  const candidate = fixture();
  Object.assign(candidate.types.default, { qa: { class: 'api' } });
  expect(() => checkWorkflowBinding(decodeWorkflowBinding(candidate), steps)).toThrow(
    'unknown_step',
  );
});

test('does not fill an incomplete explicit type from default', () => {
  const candidate = fixture();
  Object.assign(candidate.types, { change: { api: { class: 'api' } } });
  expect(() => checkWorkflowBinding(decodeWorkflowBinding(candidate), steps)).toThrow(
    'missing_step',
  );
});

test('refuses the original sample dangling class', () => {
  const candidate = fixture();
  candidate.types.default.api.class = 'review';
  expect(() => checkWorkflowBinding(decodeWorkflowBinding(candidate), steps)).toThrow(
    'unknown_class',
  );
});

test('detaches without freezing caller-owned input', () => {
  const candidate = fixture();
  const suppliedSteps = [...steps];
  const checked = checkWorkflowBinding(decodeWorkflowBinding(candidate), suppliedSteps);
  expect(Object.isFrozen(candidate)).toBe(false);
  expect(Reflect.set(candidate.classes.api, 'model', 'openai:changed-model')).toBe(true);
  expect(candidate.classes.api.model).toBe('openai:changed-model');
  expect(Reflect.set(candidate.classes.api.tools, '0', 'new-tool')).toBe(true);
  suppliedSteps.push('qa');
  expect(suppliedSteps).toContain('qa');
  expect(checked.projectSteps).not.toContain('qa');
  expect(checked.binding.classes['api']).toMatchObject({
    model: 'openrouter:openai/gpt-6-sol',
    tools: [],
  });
  expect(Reflect.set(checked.binding.classes['api'], 'model', 'openai:changed-model')).toBe(false);
});

test('freezes decoded and selected nested values', () => {
  const binding = decodeWorkflowBinding(fixture());
  const checked = checkWorkflowBinding(binding, steps);
  const selected = selectActivityClass(checked, 'Change', 'api');
  expect(checked.binding).toBe(binding);
  expect(Reflect.set(selected, 'className', 'human')).toBe(false);
  expect(Reflect.set(selected.settings, 'model', 'openai:changed')).toBe(false);
  expect(Reflect.set(checked, 'projectSteps', [])).toBe(false);
  expect(Reflect.set(checked.projectSteps, '0', 'qa')).toBe(false);
  expect(Reflect.set(binding.types['default']['api'], 'class', 'human')).toBe(false);
  const api = binding.classes['api'];
  if (api.executor !== 'api-model') throw new Error('expected API class');
  expect(Reflect.set(api.tools, '0', 'shell')).toBe(false);
  expect(Reflect.set(api.limits, 'maxSteps', 100)).toBe(false);
});

type Candidate = ReturnType<typeof fixture>;
const invalidDocuments: readonly [string, (candidate: Candidate) => void, string][] = [
  [
    'unsupported version',
    (candidate) => {
      candidate.version = 2;
    },
    'unsupported_version',
  ],
  [
    'missing version',
    (candidate) => {
      Reflect.deleteProperty(candidate, 'version');
    },
    'invalid_binding',
  ],
  [
    'unknown executor',
    (candidate) => {
      candidate.classes.api.executor = 'other';
    },
    'unknown_executor',
  ],
  [
    'missing executor',
    (candidate) => {
      Reflect.deleteProperty(candidate.classes.api, 'executor');
    },
    'invalid_binding',
  ],
  [
    'non-string executor',
    (candidate) => {
      Object.assign(candidate.classes.api, { executor: 2 });
    },
    'invalid_binding',
  ],
  [
    'extra document field',
    (candidate) => {
      Object.assign(candidate, { extra: true });
    },
    'invalid_binding',
  ],
  [
    'extra API field',
    (candidate) => {
      Object.assign(candidate.classes.api, { extra: true });
    },
    'invalid_binding',
  ],
  [
    'extra harness field',
    (candidate) => {
      Object.assign(candidate.classes.harness, { extra: true });
    },
    'invalid_binding',
  ],
  [
    'extra ACP field',
    (candidate) => {
      Object.assign(candidate.classes.acp, { extra: true });
    },
    'invalid_binding',
  ],
  [
    'extra tool field',
    (candidate) => {
      Object.assign(candidate.classes.tool, { extra: true });
    },
    'invalid_binding',
  ],
  [
    'extra class field',
    (candidate) => {
      Object.assign(candidate.classes.human, { model: 'openai:model' });
    },
    'invalid_binding',
  ],
  [
    'extra nested field',
    (candidate) => {
      Object.assign(candidate.classes.api.limits, { timeout: 5 });
    },
    'invalid_binding',
  ],
  [
    'extra mapping field',
    (candidate) => {
      Object.assign(candidate.types.default.api, { prompt: 'extra.md' });
    },
    'invalid_binding',
  ],
  [
    'missing limit',
    (candidate) => {
      Reflect.deleteProperty(candidate.classes.api.limits, 'maxSteps');
    },
    'invalid_binding',
  ],
  [
    'zero limit',
    (candidate) => {
      candidate.classes.api.limits.maxSteps = 0;
    },
    'invalid_binding',
  ],
  [
    'unsafe limit',
    (candidate) => {
      candidate.classes.api.limits.maxOutputTokens = Number.MAX_SAFE_INTEGER + 1;
    },
    'invalid_binding',
  ],
  [
    'fractional limit',
    (candidate) => {
      candidate.classes.api.limits.maxSteps = 1.5;
    },
    'invalid_binding',
  ],
  [
    'string limit',
    (candidate) => {
      Object.assign(candidate.classes.api.limits, { maxSteps: '2' });
    },
    'invalid_binding',
  ],
  [
    'bare model',
    (candidate) => {
      candidate.classes.api.model = 'gpt-6-sol';
    },
    'unpinned_model',
  ],
  [
    'unknown provider',
    (candidate) => {
      candidate.classes.api.model = 'vendor:model';
    },
    'unknown_provider',
  ],
  [
    'empty model suffix',
    (candidate) => {
      candidate.classes.api.model = 'openai:';
    },
    'invalid_binding',
  ],
  [
    'whitespace model suffix',
    (candidate) => {
      candidate.classes.api.model = 'openai:a b';
    },
    'invalid_binding',
  ],
  [
    'duplicate tools',
    (candidate) => {
      candidate.classes.api.tools.push('read', 'read');
    },
    'invalid_binding',
  ],
  [
    'invalid tool reference',
    (candidate) => {
      candidate.classes.acp.tools.push('read file');
    },
    'invalid_binding',
  ],
  [
    'blank agent',
    (candidate) => {
      candidate.classes.acp.agent = '';
    },
    'invalid_binding',
  ],
  [
    'shell command',
    (candidate) => {
      candidate.classes.tool.command = 'echo hello';
    },
    'invalid_binding',
  ],
  [
    'unknown harness',
    (candidate) => {
      candidate.classes.harness.harness = 'other';
    },
    'invalid_binding',
  ],
  [
    'unknown permission',
    (candidate) => {
      candidate.classes.harness.permissionMode = 'bypass';
    },
    'invalid_binding',
  ],
  [
    'empty types',
    (candidate) => {
      candidate.types = {} as Candidate['types'];
    },
    'invalid_binding',
  ],
  [
    'empty classes',
    (candidate) => {
      candidate.classes = {} as Candidate['classes'];
    },
    'invalid_binding',
  ],
  [
    'empty mapping',
    (candidate) => {
      candidate.types.default = {} as Candidate['types']['default'];
    },
    'invalid_binding',
  ],
  [
    'whitespace key',
    (candidate) => {
      Object.assign(candidate.types, { 'type code': candidate.types.default });
    },
    'invalid_binding',
  ],
  [
    'reserved constructor key',
    (candidate) => {
      Object.defineProperty(candidate.classes, 'constructor', {
        value: candidate.classes.human,
        enumerable: true,
      });
    },
    'invalid_binding',
  ],
  [
    'reserved prototype key',
    (candidate) => {
      Object.assign(candidate.types.default, { prototype: { class: 'api' } });
    },
    'invalid_binding',
  ],
  [
    'reserved proto key',
    (candidate) => {
      Object.defineProperty(candidate.types, '__proto__', {
        value: candidate.types.default,
        enumerable: true,
      });
    },
    'invalid_binding',
  ],
  [
    'blank class reference',
    (candidate) => {
      candidate.types.default.api.class = '';
    },
    'invalid_binding',
  ],
  [
    'unused invalid class',
    (candidate) => {
      Object.assign(candidate.classes, { unused: { executor: 'other' } });
    },
    'unknown_executor',
  ],
];
for (const [name, change, code] of invalidDocuments) {
  test(`refuses ${name}`, () => {
    const candidate = fixture();
    change(candidate);
    expect(() => decodeWorkflowBinding(candidate)).toThrow(code);
  });
}

for (const path of [
  '/absolute.md',
  'C:relative.md',
  'C:/absolute.md',
  './prompt.md',
  'a/../b.md',
  'a//b.md',
  'a\\b.md',
  'a/*.md',
  'a\u0000.md',
  '',
]) {
  test(`refuses prompt path ${JSON.stringify(path)}`, () => {
    const candidate = fixture();
    candidate.classes.human.prompt = path;
    expect(() => decodeWorkflowBinding(candidate)).toThrow('invalid_prompt_path');
  });
}

for (const projectSteps of [[], ['api', 'api'], [''], ['has space']]) {
  test(`refuses invalid project steps ${JSON.stringify(projectSteps)}`, () => {
    expect(() => checkWorkflowBinding(decodeWorkflowBinding(fixture()), projectSteps)).toThrow(
      'invalid_project_steps',
    );
  });
}

test('requires an own type or own default mapping', () => {
  const candidate = fixture();
  Object.assign(candidate.types, { Change: candidate.types.default });
  Reflect.deleteProperty(candidate.types, 'default');
  const checked = checkWorkflowBinding(decodeWorkflowBinding(candidate), steps);
  expect(() => selectActivityClass(checked, 'incident', 'api')).toThrow('unmapped_type');
  expect(() => selectActivityClass(checked, 'toString', 'api')).toThrow('unmapped_type');
});

test('selects a default for an inherited object name', () => {
  const checked = checkWorkflowBinding(decodeWorkflowBinding(fixture()), steps);
  expect(selectActivityClass(checked, 'toString', 'api').matchedType).toBe('default');
});

test('refuses selecting an unchecked step', () => {
  const checked = checkWorkflowBinding(decodeWorkflowBinding(fixture()), steps);
  expect(() => selectActivityClass(checked, 'Change', 'qa')).toThrow('unknown_step');
});

for (const [typeCode, stepCode] of [
  ['', 'api'],
  ['has space', 'api'],
  ['Change', ''],
]) {
  test(`refuses malformed selection ${JSON.stringify([typeCode, stepCode])}`, () => {
    const checked = checkWorkflowBinding(decodeWorkflowBinding(fixture()), steps);
    expect(() => selectActivityClass(checked, typeCode, stepCode)).toThrow('invalid_binding');
  });
}

test('reports a named error and affected logical path', () => {
  const candidate = fixture();
  candidate.classes.api.model = 'bare-model';
  let refusal: unknown;
  try {
    decodeWorkflowBinding(candidate);
  } catch (error) {
    refusal = error;
  }
  expect(refusal).toBeInstanceOf(WorkflowBindingError);
  if (!(refusal instanceof WorkflowBindingError)) throw new Error('expected named error');
  expect(refusal.code).toBe('unpinned_model');
  expect(refusal.path).toBe('classes.api.model');
  expect(refusal.message).toBe('unpinned_model: classes.api.model: expected provider:model');
});

test('refuses non-JSON input shapes instead of cloning class instances', () => {
  class CandidateClass {
    version = 1;
    types = fixture().types;
    classes = fixture().classes;
  }
  for (const candidate of [
    new CandidateClass(),
    undefined,
    null,
    [],
    new Date(),
    { ...fixture(), ignored: undefined },
  ]) {
    expect(() => decodeWorkflowBinding(candidate)).toThrow('invalid_binding');
  }
  const candidate = fixture();
  Object.assign(candidate.classes.api, { tools: new Set() });
  expect(() => decodeWorkflowBinding(candidate)).toThrow('invalid_binding');
});

test('refuses cyclic, accessor and symbol-bearing documents', () => {
  const cyclic = fixture();
  Object.assign(cyclic, { cycle: cyclic });
  const accessor = fixture();
  Object.defineProperty(accessor.classes.api, 'model', {
    get: () => 'openai:model',
    enumerable: true,
  });
  const symbolic = fixture();
  Object.assign(symbolic, { [Symbol('hidden')]: 1 });
  for (const candidate of [cyclic, accessor, symbolic]) {
    expect(() => decodeWorkflowBinding(candidate)).toThrow('invalid_binding');
  }
});

test('checks sorted references before sorted coverage failures', () => {
  const candidate = fixture();
  Object.assign(candidate.types, {
    Z: { qa: { class: 'absent' } },
    A: { qa: { class: 'absent' } },
  });
  let refusal: unknown;
  try {
    checkWorkflowBinding(decodeWorkflowBinding(candidate), steps);
  } catch (error) {
    refusal = error;
  }
  expect(refusal).toBeInstanceOf(WorkflowBindingError);
  if (!(refusal instanceof WorkflowBindingError)) throw new Error('expected named error');
  expect(refusal.code).toBe('unknown_class');
  expect(refusal.path).toBe('types.A.qa.class');
});

for (const model of ['anthropic:claude-model', 'openai:gpt-model']) {
  test(`keeps provider-qualified model ${model}`, () => {
    const candidate = fixture();
    candidate.classes.api.model = model;
    expect(decodeWorkflowBinding(candidate).classes['api']).toMatchObject({ model });
  });
}

test('allows the alternate harness and permission mode with requested tools', () => {
  const candidate = fixture();
  candidate.classes.harness.harness = 'claude-code';
  candidate.classes.harness.permissionMode = 'allow-edits';
  candidate.classes.api.tools.push('read', 'write');
  expect(decodeWorkflowBinding(candidate).classes['harness']).toMatchObject({
    harness: 'claude-code',
    permissionMode: 'allow-edits',
  });
  expect(decodeWorkflowBinding(candidate).classes['api']).toMatchObject({
    tools: ['read', 'write'],
  });
});

test('refuses decorated and sparse JSON tool arrays', () => {
  const decorated = fixture();
  Object.assign(decorated.classes.api.tools, { hidden: 'write' });
  const sparse = fixture();
  sparse.classes.api.tools.length = 1;
  for (const candidate of [decorated, sparse]) {
    expect(() => decodeWorkflowBinding(candidate)).toThrow('invalid_binding');
  }
});

test('refuses array subclass instances at the JSON boundary', () => {
  class Tools extends Array<string> {}
  const candidate = fixture();
  candidate.classes.api.tools = new Tools();
  expect(() => decodeWorkflowBinding(candidate)).toThrow('invalid_binding');
});

test('refuses sparse supplied project-step arrays', () => {
  const projectSteps: string[] = [];
  projectSteps.length = 1;
  expect(() => checkWorkflowBinding(decodeWorkflowBinding(fixture()), projectSteps)).toThrow(
    'invalid_project_steps',
  );
});

test('throws if a supposedly checked mapping loses its selected step', () => {
  const binding = decodeWorkflowBinding(fixture());
  const checked = {
    binding: { ...binding, types: { default: { api: { class: 'api' } } } },
    projectSteps: steps,
  };
  expect(() => selectActivityClass(checked, 'Change', 'tool')).toThrow('invalid_binding');
});

test('throws if a supposedly checked mapping loses its referenced class', () => {
  const binding = decodeWorkflowBinding(fixture());
  const checked = {
    binding: { ...binding, classes: { human: binding.classes['human'] } },
    projectSteps: steps,
  };
  expect(() => selectActivityClass(checked, 'Change', 'api')).toThrow('invalid_binding');
});

test('refuses duplicate codes in a complete project-step set', () => {
  expect(() => checkWorkflowBinding(decodeWorkflowBinding(fixture()), [...steps, 'api'])).toThrow(
    'invalid_project_steps',
  );
});

test('reports the earliest sorted non-JSON class path', () => {
  const candidate = fixture();
  Object.assign(candidate.classes, { Z: new Date(), A: new Date() });
  let refusal: unknown;
  try {
    decodeWorkflowBinding(candidate);
  } catch (error) {
    refusal = error;
  }
  expect(refusal).toBeInstanceOf(WorkflowBindingError);
  if (!(refusal instanceof WorkflowBindingError)) throw new Error('expected named error');
  expect(refusal.code).toBe('invalid_binding');
  expect(refusal.path).toBe('binding.classes.A');
});

for (const [kind, prompt] of [
  ['valid', '.twilight/extra.md'],
  ['invalid', '/absolute.md'],
]) {
  test(`refuses an undeclared tool prompt with ${kind} path`, () => {
    const candidate = fixture();
    Object.assign(candidate.classes.tool, { prompt });
    let refusal: unknown;
    try {
      decodeWorkflowBinding(candidate);
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toBeInstanceOf(WorkflowBindingError);
    if (!(refusal instanceof WorkflowBindingError)) throw new Error('expected named error');
    expect(refusal.code).toBe('invalid_binding');
    expect(refusal.path).toBe('classes.tool.prompt');
  });
}
