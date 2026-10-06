import { expect, test } from 'bun:test';

import { reasoningEfforts } from './conversation/stream';
import { readWebsiteApiConfig } from './runtime-config';

test('the reasoning effort is unset or one of the four allowed efforts', () => {
  expect(readWebsiteApiConfig({}).openRouterReasoningEffort).toBeUndefined();
  expect(
    readWebsiteApiConfig({ OPENROUTER_REASONING_EFFORT: '' }).openRouterReasoningEffort,
  ).toBeUndefined();
  expect(reasoningEfforts).toEqual(['none', 'minimal', 'low', 'medium']);
  for (const effort of reasoningEfforts)
    expect(
      readWebsiteApiConfig({ OPENROUTER_REASONING_EFFORT: effort }).openRouterReasoningEffort,
    ).toBe(effort);
  // Proof: accepting any string in readReasoningEffort let 'high' through and failed this.
  for (const effort of ['high', 'xhigh', 'LOW', ' low'])
    expect(() => readWebsiteApiConfig({ OPENROUTER_REASONING_EFFORT: effort })).toThrow(
      'OPENROUTER_REASONING_EFFORT',
    );
});

test('the conversation completion cap defaults to 400 and accepts integers from 100 to 2000', () => {
  expect(readWebsiteApiConfig({}).openRouterMaxCompletionTokens).toBe(400);
  expect(
    readWebsiteApiConfig({ OPENROUTER_MAX_COMPLETION_TOKENS: '' }).openRouterMaxCompletionTokens,
  ).toBe(400);
  for (const tokens of ['100', '700', '2000'])
    expect(
      readWebsiteApiConfig({ OPENROUTER_MAX_COMPLETION_TOKENS: tokens })
        .openRouterMaxCompletionTokens,
    ).toBe(Number(tokens));
  // Proof: dropping the range check in readMaxCompletionTokens let '99' and '2001' through.
  for (const tokens of ['99', '2001', '0', '7e2', '700.5', '-700', 'many'])
    expect(() => readWebsiteApiConfig({ OPENROUTER_MAX_COMPLETION_TOKENS: tokens })).toThrow(
      'OPENROUTER_MAX_COMPLETION_TOKENS',
    );
});
