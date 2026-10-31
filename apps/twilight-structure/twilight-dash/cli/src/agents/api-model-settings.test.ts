import {
  acceptWorkflowBinding,
  checkWorkflowBinding,
  decodeWorkflowBinding,
  type SelectedActivity,
  selectWorkflowActivity,
} from '@twilight-burokrat/contracts';
import { createProviderRegistry, jsonSchema, tool, type ToolSet } from 'ai';
import { MockLanguageModelV4, MockProviderV4 } from 'ai/test';
import { expect, test } from 'bun:test';

import { type ApiModelRegistry, resolveApiModelSettings } from './api-model-settings';

function selection(tools: readonly string[] = [], model = 'openai:fixture') {
  const binding = decodeWorkflowBinding({
    version: 1,
    types: { default: { build: { class: 'api' } } },
    classes: {
      api: {
        executor: 'api-model',
        model,
        prompt: '.twilight/api.md',
        tools,
        limits: { maxSteps: 2, maxOutputTokens: 80 },
      },
    },
  });
  const accepted = acceptWorkflowBinding(checkWorkflowBinding(binding, ['build']), [
    { path: '.twilight/api.md', bytes: new Uint8Array([0xef, 0xbb, 0xbf, 0x48, 0x69]) },
  ]);
  return { accepted, selected: selectWorkflowActivity(accepted, 'change', 'build') };
}

function registry() {
  const model = new MockLanguageModelV4();
  const providers = createProviderRegistry<Record<string, MockProviderV4>, string>({
    openai: new MockProviderV4({ languageModels: { fixture: model } }),
  });
  const models: ApiModelRegistry = {
    languageModel: (id: string) => providers.languageModel<string>(id),
  };
  return { model, models };
}

const read = tool({
  inputSchema: jsonSchema<Record<string, never>>({
    type: 'object',
    properties: {},
    additionalProperties: false,
  }),
  execute: () => 'read',
});

test('accepted BOM prompt config resolves concrete model without stream dispatch', () => {
  const { accepted, selected } = selection();
  const { model, models } = registry();
  const configured = resolveApiModelSettings({ selection: selected, models, tools: {} });
  expect(configured.model).toBe(model);
  expect(configured.instructions).toBe('Hi');
  expect(configured.selection.bindingDigest).toBe(accepted.bindingDigest);
  expect(configured.maxSteps).toBe(2);
  expect(configured.maxOutputTokens).toBe(80);
  expect(model.doStreamCalls).toHaveLength(0);
});

test('settings expose exactly selected own tool capabilities while keeping live tool objects', () => {
  const { selected } = selection(['read']);
  const { models } = registry();
  const supplied = { read, extra: read };
  const configured = resolveApiModelSettings({ selection: selected, models, tools: supplied });
  expect(Object.keys(configured.tools)).toEqual(['read']);
  expect(configured.tools['read']).toBe(read);
  expect(configured.tools).not.toBe(supplied);
  expect(Object.isFrozen(supplied)).toBe(false);
});

test('missing selected tool capability throws', () => {
  const { selected } = selection(['read']);
  expect(() =>
    resolveApiModelSettings({ selection: selected, models: registry().models, tools: {} }),
  ).toThrow('missing selected tool');
});

test('inherited selected tool is not a supplied capability', () => {
  const inherited: ToolSet = {};
  Object.setPrototypeOf(inherited, { read });
  expect(() =>
    resolveApiModelSettings({
      selection: selection(['read']).selected,
      models: registry().models,
      tools: inherited,
    }),
  ).toThrow('missing selected tool');
});

test('own undefined selected tool is not a capability', () => {
  expect(() =>
    resolveApiModelSettings({
      selection: selection(['read']).selected,
      models: registry().models,
      tools: { read: undefined } as unknown as ToolSet,
    }),
  ).toThrow('missing selected tool');
});

test('missing concrete registry model throws before dispatch', () => {
  const { models, model } = registry();
  expect(() =>
    resolveApiModelSettings({
      selection: selection([], 'openai:missing').selected,
      models,
      tools: {},
    }),
  ).toThrow();
  expect(model.doStreamCalls).toHaveLength(0);
});

test('bare model id is refused by actual accepted binding and installed registry boundaries', () => {
  expect(() => selection([], 'fixture')).toThrow();
  const { selected } = selection();
  expect(() =>
    resolveApiModelSettings({
      selection: {
        ...selected,
        settings: { ...selected.settings, model: 'fixture' },
      } as SelectedActivity,
      models: registry().models,
      tools: {},
    }),
  ).toThrow();
});

test('wrong selected executor throws before model lookup', () => {
  const binding = decodeWorkflowBinding({
    version: 1,
    types: { default: { build: { class: 'tool' } } },
    classes: { tool: { executor: 'tool', command: 'build' } },
  });
  const selected = selectWorkflowActivity(
    acceptWorkflowBinding(checkWorkflowBinding(binding, ['build']), []),
    'change',
    'build',
  );
  expect(() =>
    resolveApiModelSettings({ selection: selected, models: registry().models, tools: {} }),
  ).toThrow('api-model');
});

test('corrupted retained prompt or consumed limits throw at settings boundary', () => {
  const { selected } = selection();
  for (const corrupt of [
    { ...selected, settings: { ...selected.settings, executor: 'human' } },
    { ...selected, prompt: null },
    { ...selected, prompt: { ...selected.prompt, text: undefined } },
    { ...selected, prompt: { ...selected.prompt, path: '.twilight/other.md' } },
    {
      ...selected,
      settings: { ...selected.settings, limits: { maxSteps: 0, maxOutputTokens: 80 } },
    },
    {
      ...selected,
      settings: {
        ...selected.settings,
        limits: { maxSteps: 2, maxOutputTokens: Number.MAX_SAFE_INTEGER + 1 },
      },
    },
  ])
    expect(() =>
      resolveApiModelSettings({
        selection: corrupt as SelectedActivity,
        models: registry().models,
        tools: {},
      }),
    ).toThrow();
});

test('own null selected tool is not a capability', () => {
  expect(() =>
    resolveApiModelSettings({
      selection: selection(['read']).selected,
      models: registry().models,
      tools: { read: null } as unknown as ToolSet,
    }),
  ).toThrow('missing selected tool');
});
