import { expect, test } from 'bun:test';

import { readEvaluationEnvironment, readKeyBudget, validateEndpoint } from './eval-host';

test('host env is parsed as allowlisted assignments, never executed, with missing and duplicate values refused', () => {
  const source =
    'OPENROUTER_API_KEY=fixture\nOPENROUTER_MODEL=openai/gpt-6-luna\nOPENROUTER_PROVIDER=azure/eu\nOPENROUTER_INPUT_USD_PER_MILLION=0.11\nOPENROUTER_OUTPUT_USD_PER_MILLION=0.55\nOPENROUTER_REASONING_EFFORT=low\nOPENROUTER_MAX_COMPLETION_TOKENS=700';
  expect(readEvaluationEnvironment(source)['OPENROUTER_API_KEY']).toBe('fixture');
  expect(() => readEvaluationEnvironment(source + '\nOPENROUTER_API_KEY=second')).toThrow(
    'duplicate',
  );
  expect(() =>
    readEvaluationEnvironment(source.replace('=fixture', '=$(touch /tmp/forbidden)')),
  ).toThrow('assignment');
  expect(() =>
    readEvaluationEnvironment(source.replace('OPENROUTER_PROVIDER=azure/eu', '')),
  ).toThrow('OPENROUTER_PROVIDER');
});

test('paid preflight refuses missing, changed or insufficient monthly cap', () => {
  const budget = { data: { limit: 50, limit_reset: 'monthly', limit_remaining: 49, usage: 1 } };
  expect(readKeyBudget(budget, 1)).toEqual({
    limit: 50,
    remaining: 49,
    usage: 1,
    reset: 'monthly',
  });
  for (const change of [
    { limit: 100 },
    { limit: null },
    { limit_remaining: 0.5 },
    { limit_reset: 'daily' },
    { usage: undefined },
  ])
    expect(() => readKeyBudget({ data: { ...budget.data, ...change } }, 1)).toThrow('budget');
});

test('endpoint preflight refuses unsupported parameters, routing identities and changed rates', () => {
  const endpoint = {
    tag: 'azure/eu',
    provider_name: 'Azure',
    pricing: { prompt: '0.00000011', completion: '0.00000055' },
    supported_parameters: ['response_format', 'structured_outputs', 'reasoning', 'max_tokens'],
  };
  expect(
    validateEndpoint({ data: { endpoints: [endpoint] } }, 'azure/eu', 0.11, 0.55),
  ).toMatchObject({ provider: 'Azure' });
  for (const change of [
    { tag: 'azure/us' },
    { supported_parameters: [] },
    { pricing: { prompt: '1', completion: '1' } },
  ])
    expect(() =>
      validateEndpoint(
        { data: { endpoints: [{ ...endpoint, ...change }] } },
        'azure/eu',
        0.11,
        0.55,
      ),
    ).toThrow('endpoint');
});

test('the former direct CLI refuses paid evaluation outside the host preflight', () => {
  const execution = Bun.spawnSync([process.execPath, `${import.meta.dir}/eval-cli.ts`], {
    env: {},
  });
  expect(execution.exitCode).toBe(2);
  expect(execution.stderr.toString()).toContain('bounded host entry');
});
