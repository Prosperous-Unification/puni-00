import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

for (const state of [
  'missing',
  'unreadable',
  'malformed',
  'failed',
  'different-sha',
  'passing',
] as const) {
  test(`full host entry ${state === 'passing' ? 'reaches the fake inference transport with' : 'refuses before inference with'} a ${state} pilot receipt`, () => {
    const directory = mkdtempSync(join(tmpdir(), 'puni-eval-pilot-'));
    try {
      const git = (args: string[]) => {
        const execution = Bun.spawnSync(['git', ...args], { cwd: directory });
        if (execution.exitCode !== 0) throw new Error(execution.stderr.toString());
        return execution.stdout.toString().trim();
      };
      git(['init', '--quiet']);
      git([
        '-c',
        'user.name=Evaluation fixture',
        '-c',
        'user.email=fixture@example.test',
        'commit',
        '--quiet',
        '--allow-empty',
        '-m',
        'Fixture identity',
      ]);
      const sha = git(['rev-parse', 'HEAD']);
      const receipts = join(directory, '.superpowers/evaluation-private');
      mkdirSync(receipts, { recursive: true });
      const pilotPath = join(receipts, 'pilot.json');
      if (state === 'unreadable') mkdirSync(pilotPath);
      else if (state !== 'missing')
        writeFileSync(
          pilotPath,
          state === 'malformed'
            ? '{'
            : JSON.stringify({
                sha: state === 'different-sha' ? 'different' : sha,
                passed: state !== 'failed',
              }),
        );
      const environmentPath = join(directory, 'runtime.env');
      writeFileSync(
        environmentPath,
        'OPENROUTER_API_KEY=fixture\nOPENROUTER_MODEL=openai/gpt-6-luna\nOPENROUTER_PROVIDER=azure/eu\nOPENROUTER_INPUT_USD_PER_MILLION=0.11\nOPENROUTER_OUTPUT_USD_PER_MILLION=0.55\nOPENROUTER_REASONING_EFFORT=low\nOPENROUTER_MAX_COMPLETION_TOKENS=700',
      );
      const callsPath = join(directory, 'inference-calls');
      const preloadPath = join(directory, 'preload.ts');
      writeFileSync(
        preloadPath,
        `
import { appendFileSync } from 'node:fs';
const network = globalThis.fetch;
globalThis.fetch = Object.assign(async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.hostname === '127.0.0.1') return network(input, init);
  if (url.origin !== 'https://openrouter.ai') throw new Error('Unexpected external transport');
  if (url.pathname === '/api/v1/key') return Response.json({ data: { limit: 50, limit_reset: 'monthly', limit_remaining: 49, usage: 1 } });
  if (url.pathname === '/api/v1/models/openai/gpt-6-luna/endpoints') return Response.json({ data: { endpoints: [{ tag: 'azure/eu', provider_name: 'Azure', pricing: { prompt: '0.00000011', completion: '0.00000055' }, supported_parameters: ['response_format', 'structured_outputs', 'reasoning', 'max_completion_tokens'] }] } });
  if (url.pathname !== '/api/v1/chat/completions') throw new Error('Unexpected provider path');
  appendFileSync(${JSON.stringify(callsPath)}, 'attempted\\n');
  return Response.json({ error: { message: 'Scripted failure stops the fixture', code: 503 } }, { status: 503 });
}, { preconnect: network.preconnect });
`,
      );
      const execution = Bun.spawnSync(
        [
          process.execPath,
          '--preload',
          preloadPath,
          join(import.meta.dir, 'eval-host.ts'),
          'full',
          environmentPath,
        ],
        { cwd: directory, env: { PATH: process.env['PATH'] ?? '' }, timeout: 15000 },
      );
      if (state === 'passing') {
        expect(execution.exitCode).toBe(1);
        expect(readFileSync(callsPath, 'utf8')).toBe('attempted\n');
      } else {
        expect(existsSync(callsPath)).toBe(false);
        expect(execution.exitCode).toBe(2);
        expect(execution.stdout.toString()).not.toContain('session:');
        if (state === 'failed' || state === 'different-sha')
          expect(execution.stderr.toString()).toContain('passing pilot for this SHA');
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
