import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { solveBrowserCheck } from '@website/contracts';
import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';

import {
  parseSalesCorpus,
  readConfirmedReply,
  runSalesEvaluation,
  streamMatchesStored,
} from './eval-cli';

const delayedMilliseconds = 12_500;
const message = 'A focused review can start with the reported payment path.';
const envelope = JSON.stringify({
  version: 1,
  message,
  nextQuestionId: null,
  brief: 'Goal: accept payments. Recurring payment failures; cause remains unknown.',
});
const wire =
  [
    {
      id: 'synthetic-delayed-reply',
      model: 'openai/gpt-6-luna',
      choices: [{ index: 0, delta: { role: 'assistant', content: envelope }, finish_reason: null }],
    },
    {
      id: 'synthetic-delayed-reply',
      model: 'openai/gpt-6-luna',
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, cost: 0.0001 },
    },
  ]
    .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
    .join('') + 'data: [DONE]\n\n';

const provider = {
  openRouterKey: 'synthetic-only',
  openRouterModel: 'openai/gpt-6-luna',
  openRouterProvider: 'azure/eu',
  openRouterInputUsdPerMillion: 0.11,
  openRouterOutputUsdPerMillion: 0.55,
  openRouterInputCeilingUsdPerMillion: 0.275,
  openRouterOutputCeilingUsdPerMillion: 0.825,
  openRouterMaxCompletionTokens: 700,
  openRouterReasoningEffort: 'low' as const,
};

test('evaluation HTTP delivers a structured reply after the default idle window', async () => {
  let calls = 0;
  const evaluation = await runSalesEvaluation({
    scripts: parseSalesCorpus(
      JSON.stringify({
        scripts: [
          {
            name: 'delayed-improve',
            protocol: 'scoping',
            startingChoice: 'improve',
            turns: [{ message: 'The goal is accepting payments.' }],
            assertions: [{ kind: 'noPrice' }],
          },
        ],
      }),
    ),
    provider,
    providerFetch: async () => {
      calls += 1;
      await Bun.sleep(delayedMilliseconds);
      return new Response(wire, { headers: { 'content-type': 'text/event-stream' } });
    },
    show: false,
    write: () => undefined,
    pause: () => Promise.resolve(),
  });
  expect(evaluation.passed).toBe(true);
  expect(evaluation.results).toContainEqual({
    script: 'delayed-improve',
    assertion: 'streamEqualsStored',
    passed: true,
  });
  expect(calls).toBe(1);
  expect(evaluation.sessions[0]?.operations).toHaveLength(1);
  expect(evaluation.sessions[0]?.promptVersion).toBe('puni-scoping-v6');
  expect(evaluation.unknownReservedMicroUsd).toBe(0);
  expect(evaluation.knownMicroUsd).toBe(100);
}, 20_000);

for (const ending of ['completed', 'deadline'] as const)
  test(
    `source main HTTP preserves the delayed structured ${ending} outcome`,
    async () => {
      const directory = mkdtempSync(join(tmpdir(), 'puni-http-idle-'));
      const databasePath = join(directory, 'website.sqlite');
      const callsPath = join(directory, 'provider-calls');
      const abortPath = join(directory, 'provider-abort');
      const preloadPath = join(directory, 'provider.ts');
      writeFileSync(
        preloadPath,
        `import { appendFileSync, writeFileSync } from 'node:fs';
const network = globalThis.fetch;
globalThis.fetch = Object.assign(async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.href !== 'https://openrouter.ai/api/v1/chat/completions') throw new Error('Unexpected network request');
  appendFileSync(${JSON.stringify(callsPath)}, 'called\\n');
  await new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ${String(ending === 'completed' ? delayedMilliseconds : 31_000)});
    init.signal.addEventListener('abort', () => {
      clearTimeout(timer);
      writeFileSync(${JSON.stringify(abortPath)}, 'aborted');
      reject(new DOMException('Synthetic provider aborted', 'AbortError'));
    }, { once: true });
  });
  return new Response(${JSON.stringify(wire)}, { headers: { 'content-type': 'text/event-stream' } });
}, { preconnect: network.preconnect });
`,
      );
      const available = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() });
      const port = available.port;
      await available.stop(true);
      const entrypoint = Bun.spawn(
        [process.execPath, '--preload', preloadPath, join(import.meta.dir, '../main.ts')],
        {
          env: {
            PATH: process.env['PATH'] ?? '',
            WEBSITE_API_HOST: '127.0.0.1',
            WEBSITE_API_PORT: String(port),
            WEBSITE_DATABASE_PATH: databasePath,
            RETENTION_JOURNAL: 'disabled',
            PUBLIC_ORIGIN: 'http://localhost:4321',
            APP_ORIGIN: 'http://localhost:4201',
            OPENROUTER_API_KEY: 'synthetic-only',
            OPENROUTER_ENABLED: '1',
            OPENROUTER_PRIVACY_VERIFIED: '1',
            OPENROUTER_MODEL: 'openai/gpt-6-luna',
            OPENROUTER_PROVIDER: 'azure/eu',
            OPENROUTER_INPUT_USD_PER_MILLION: '0.11',
            OPENROUTER_OUTPUT_USD_PER_MILLION: '0.55',
            OPENROUTER_INPUT_CEILING_USD_PER_MILLION: '0.275',
            OPENROUTER_OUTPUT_CEILING_USD_PER_MILLION: '0.825',
            OPENROUTER_MAX_COMPLETION_TOKENS: '700',
            OPENROUTER_REASONING_EFFORT: 'low',
          },
          stdout: 'pipe',
          stderr: 'pipe',
        },
      );
      const diagnostics = new Response(entrypoint.stderr).text();
      try {
        const reader = entrypoint.stdout.getReader();
        const started = await reader.read();
        reader.releaseLock();
        if (started.done)
          throw new Error(`Entrypoint exited before listening: ${await diagnostics}`);
        expect(new TextDecoder().decode(started.value)).toContain('Website API listening');
        const base = `http://127.0.0.1:${String(port)}`;
        const intake = await fetch(`${base}/intakes`, {
          method: 'POST',
          headers: { origin: 'http://localhost:4321', 'content-type': 'application/json' },
          body: JSON.stringify({ startConversation: true, startingChoice: 'improve' }),
        });
        expect(intake.status).toBe(201);
        const cookie = intake.headers.get('set-cookie')?.split(';')[0];
        if (!cookie) throw new Error('No draft cookie');
        const headers = { origin: 'http://localhost:4201', cookie };
        const view = (await (await fetch(`${base}/conversation`, { headers })).json()) as {
          csrfToken: string;
          initialOperation: { idempotencyKey: string };
          challenge: { salt: string; challenge: string; signature: string; maxnumber: number };
        };
        const send = () =>
          fetch(`${base}/conversation/stream`, {
            method: 'POST',
            headers: {
              ...headers,
              'content-type': 'application/json',
              'x-puni-csrf': view.csrfToken,
            },
            body: JSON.stringify({
              initial: true,
              idempotencyKey: view.initialOperation.idempotencyKey,
              check: {
                ...view.challenge,
                number: solveBrowserCheck(
                  view.challenge.salt,
                  view.challenge.challenge,
                  view.challenge.maxnumber,
                ),
              },
            }),
          });
        const response = await send();
        expect(response.status).toBe(200);
        const received = await response.text();
        const stored: unknown = await (await fetch(`${base}/conversation`, { headers })).json();
        const database = new Database(databasePath, { readonly: true });
        try {
          const operations = database
            .query<
              {
                state: string;
                settlement: string;
                reserved_micro_usd: number;
                settled_micro_usd: number;
                prompt_version: string;
              },
              []
            >(
              'SELECT state, settlement, reserved_micro_usd, settled_micro_usd, prompt_version FROM conversation_operation',
            )
            .all();
          expect(operations).toHaveLength(1);
          expect(operations[0]?.prompt_version).toBe('puni-scoping-v6');
          if (ending === 'completed') {
            expect(readConfirmedReply(received)).toBe(message);
            expect(streamMatchesStored([message], stored)).toBe(true);
            expect(operations[0]).toMatchObject({
              state: 'completed',
              settlement: 'usage',
              settled_micro_usd: 100,
            });
            const replay = await send();
            expect(replay.status).toBe(200);
            const replayed = await replay.text();
            expect(replayed).toContain(message);
            expect(replayed).toContain('"type":"text-end"');
            expect(replayed).not.toContain('"type":"error"');
          } else {
            expect(received).toContain('"type":"error"');
            expect(readConfirmedReply(received)).toBeNull();
            expect(operations[0]).toMatchObject({
              state: 'unknown',
              settlement: 'reserved_ceiling',
            });
            expect(operations[0]?.reserved_micro_usd).toBeGreaterThan(0);
            expect(operations[0]?.settled_micro_usd).toBe(operations[0]?.reserved_micro_usd);
            expect(readFileSync(abortPath, 'utf8')).toBe('aborted');
            expect(stored).toMatchObject({ scoping: { candidateBrief: null, questionId: null } });
          }
        } finally {
          database.close();
        }
        expect(readFileSync(callsPath, 'utf8')).toBe('called\n');
      } catch (error) {
        entrypoint.kill();
        await entrypoint.exited;
        throw new Error(`${String(error)}\n${await diagnostics}`, { cause: error });
      } finally {
        entrypoint.kill();
        await entrypoint.exited;
        rmSync(directory, { recursive: true, force: true });
      }
    },
    ending === 'completed' ? 20_000 : 40_000,
  );
