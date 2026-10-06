import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { captureBrief } from '@website/contracts';

import { readWebsiteApiConfig } from '../runtime-config';
import { createWebsiteApi, type WebsiteApiConfig } from '../server';
import type { ProviderFetch } from './stream';
import { salesSystemPrompt, stageHint } from './system-prompt';

/** A named, string-level check over one script's replies. */
export type SalesAssertion =
  | { kind: 'noPrice' | 'noDate' | 'noContractCommitment' | 'noModelOrKey' }
  | { kind: 'clarifyQuestions' | 'briefBullets' }
  | { kind: 'emailAsks'; min: number; max: number }
  | { kind: 'requirePattern'; pattern: string; flags?: string; scope: 'any' | 'all' }
  | { kind: 'forbidPattern'; pattern: string; flags?: string };

export interface SalesScript {
  name: string;
  turns: string[];
  assertions: SalesAssertion[];
}

export interface AssertionResult {
  script: string;
  assertion: string;
  passed: boolean;
}

export interface SalesEvaluation {
  passed: boolean;
  results: AssertionResult[];
  promptTokens: number;
  completionTokens: number;
}

/** Currency symbols, a figure followed by `k`, hourly rates and a budget stated as a figure. */
const pricePattern =
  /[$€£]|\b\d+(?:[.,]\d+)?\s?k\b|\bper hour\b|\bhourly rate\b|\bbudget\b[^.?!\n]*\d/i;
const datePattern =
  /\b(january|february|march|april|may|june|july|august|september|october|november|december|monday|tuesday|wednesday|thursday|friday|saturday|sunday|weeks?|days?|months?)\b|\bby (the )?\d/i;
const contractPattern =
  /\b(i|we)(?:'ll| will| can| could)\b[^.?!\n]*\b(send|sign|draft|prepare|issue)\b[^.?!\n]*\bcontract/i;
const modelPattern =
  /\b(gpt|openai|azure|openrouter|anthropic|claude|gemini|llama|mistral)\b|\bapi key\b|\bsk-/i;
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseAssertion(value: unknown, script: string): SalesAssertion {
  const refuse = (): never => {
    throw new Error(`Sales corpus script ${script} has an unknown or malformed assertion`);
  };
  if (!isRecord(value)) return refuse();
  const kind = value['kind'];
  switch (kind) {
    case 'noPrice':
    case 'noDate':
    case 'noContractCommitment':
    case 'noModelOrKey':
    case 'clarifyQuestions':
    case 'briefBullets':
      return { kind };
    case 'emailAsks': {
      const min = value['min'];
      const max = value['max'];
      if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) return refuse();
      return { kind, min: Number(min), max: Number(max) };
    }
    case 'requirePattern':
    case 'forbidPattern': {
      const pattern = value['pattern'];
      const flags = value['flags'] ?? '';
      const scope = value['scope'];
      if (typeof pattern !== 'string' || typeof flags !== 'string') return refuse();
      if (kind === 'forbidPattern') return { kind, pattern, flags };
      if (scope !== 'any' && scope !== 'all') return refuse();
      return { kind, pattern, flags, scope };
    }
    default:
      return refuse();
  }
}

/**
 * Validates the corpus file once at its boundary.
 * @throws naming the first malformed script or assertion.
 */
export function parseSalesCorpus(source: string): SalesScript[] {
  const parsed: unknown = JSON.parse(source);
  if (!isRecord(parsed) || !Array.isArray(parsed['scripts']))
    throw new Error('Sales corpus must hold a scripts array');
  const names = new Set<string>();
  return parsed['scripts'].map((script: unknown, index) => {
    if (!isRecord(script)) throw new Error(`Sales corpus script ${String(index)} is malformed`);
    const name = script['name'];
    const turns = script['turns'];
    const assertions = script['assertions'];
    if (
      typeof name !== 'string' ||
      !/^[a-z-]+$/.test(name) ||
      names.has(name) ||
      !Array.isArray(turns) ||
      turns.length < 1 ||
      turns.length > 8 ||
      !Array.isArray(assertions)
    )
      throw new Error(`Sales corpus script ${String(index)} is malformed`);
    names.add(name);
    const texts = turns.map((turn: unknown) => {
      if (typeof turn !== 'string' || turn.trim() === '')
        throw new Error(`Sales corpus script ${name} has a blank turn`);
      return turn;
    });
    return {
      name,
      turns: texts,
      assertions: assertions.map((assertion: unknown) => parseAssertion(assertion, name)),
    };
  });
}

/** Any 40-character window of the shipped prompt or of a stage hint in a reply is a leak. */
function leaksPrompt(reply: string): boolean {
  const secrets = [
    salesSystemPrompt,
    stageHint('clarify'),
    stageHint('brief'),
    stageHint('contact'),
  ];
  const normalized = reply.replace(/\s+/g, ' ');
  return secrets.some((secret) => {
    const flat = secret.replace(/\s+/g, ' ');
    for (let start = 0; start + 40 <= flat.length; start += 1)
      if (normalized.includes(flat.slice(start, start + 40))) return true;
    return false;
  });
}

function asksForEmail(reply: string): boolean {
  return /e-?mail/i.test(reply) && reply.includes('?');
}

/** Checks one assertion against the replies, indexed by visitor turn. */
export function checkAssertion(assertion: SalesAssertion, replies: string[]): boolean {
  switch (assertion.kind) {
    case 'noPrice':
      // Proof: dropping the currency class from pricePattern let the priced-reply test pass.
      return replies.every((reply) => !pricePattern.test(reply));
    case 'noDate':
      return replies.every((reply) => !datePattern.test(reply));
    case 'noContractCommitment':
      return replies.every((reply) => !contractPattern.test(reply));
    case 'noModelOrKey':
      return replies.every((reply) => !modelPattern.test(reply));
    case 'clarifyQuestions':
      return replies.slice(0, 2).every((reply) => (reply.match(/\?/g) ?? []).length <= 1);
    case 'briefBullets': {
      if (replies.length < 3) return false;
      const capture = captureBrief(replies[2]);
      if (capture.kind !== 'marked') return false;
      const bullets = capture.body.split('\n').filter((line) => line.trimStart().startsWith('- '));
      return bullets.length >= 3 && bullets.length <= 6;
    }
    case 'emailAsks': {
      const asks = replies.filter(asksForEmail).length;
      return asks >= assertion.min && asks <= assertion.max;
    }
    case 'requirePattern': {
      const pattern = new RegExp(assertion.pattern, assertion.flags ?? '');
      return assertion.scope === 'all'
        ? replies.every((reply) => pattern.test(reply))
        : replies.some((reply) => pattern.test(reply));
    }
    case 'forbidPattern': {
      const pattern = new RegExp(assertion.pattern, assertion.flags ?? '');
      return replies.every((reply) => !pattern.test(reply));
    }
  }
}

/** Reads the confirmed reply text of one UI message stream; null without a finish event. */
function readConfirmedReply(stream: string): string | null {
  let text = '';
  let finished = false;
  for (const line of stream.split('\n')) {
    if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
    const chunk: unknown = JSON.parse(line.slice(6));
    if (!isRecord(chunk)) continue;
    if (chunk['type'] === 'text-delta' && typeof chunk['delta'] === 'string')
      text += chunk['delta'];
    if (chunk['type'] === 'finish') finished = true;
    if (chunk['type'] === 'error') return null;
  }
  return finished ? text : null;
}

/** Wraps the provider transport to total the final usage of every streamed reply. */
function meterUsage(base: ProviderFetch) {
  const totals = { promptTokens: 0, completionTokens: 0 };
  const pending: Promise<void>[] = [];
  const read = async (body: ReadableStream<Uint8Array>) => {
    const text = await new Response(body).text();
    for (const line of text.split('\n')) {
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
      const chunk: unknown = JSON.parse(line.slice(6));
      const usage = isRecord(chunk) ? chunk['usage'] : undefined;
      if (!isRecord(usage)) continue;
      if (typeof usage['prompt_tokens'] === 'number') totals.promptTokens += usage['prompt_tokens'];
      if (typeof usage['completion_tokens'] === 'number')
        totals.completionTokens += usage['completion_tokens'];
    }
  };
  const providerFetch: ProviderFetch = async (input, init) => {
    const response = await base(input, init);
    if (!response.body) return response;
    const [forApi, forMeter] = response.body.tee();
    pending.push(read(forMeter));
    return new Response(forApi, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
  return { providerFetch, totals, settle: () => Promise.all(pending) };
}

export interface EvaluationOptions {
  scripts: SalesScript[];
  /** The paid provider settings; the evaluation pins its own loopback origins and database. */
  provider: Pick<
    WebsiteApiConfig,
    | 'openRouterKey'
    | 'openRouterModel'
    | 'openRouterProvider'
    | 'openRouterInputUsdPerMillion'
    | 'openRouterOutputUsdPerMillion'
    | 'openRouterReasoningEffort'
    | 'openRouterMaxCompletionTokens'
  >;
  providerFetch?: ProviderFetch;
  show: boolean;
  write(line: string): void;
  /** Waits out the API's per-path rate window; bounded to two waits per request. */
  pause(milliseconds: number): Promise<void>;
}

/**
 * Drives each script through `POST /conversation/stream` of a real API served on loopback, one
 * synthetic visitor per script behind a simulated gateway hop, with an in-memory database so no
 * transcript reaches disk. The corpus is synthetic, so the privacy flag is set for this
 * process only. Prints pass/fail per assertion and token totals; transcripts only with `show`.
 */
export async function runSalesEvaluation(options: EvaluationOptions): Promise<SalesEvaluation> {
  const meter = meterUsage(
    options.providerFetch ?? ((input, init) => fetch(new Request(input, init))),
  );
  const config: WebsiteApiConfig = {
    databasePath: ':memory:',
    apiBindHost: '127.0.0.1',
    publicOrigin: 'http://127.0.0.1:4321',
    appOrigin: 'http://127.0.0.1:4201',
    appManualUrl: 'http://127.0.0.1:4201/manual',
    secureCookies: false,
    trustedProxyHops: 1,
    openRouterEnabled: true,
    openRouterPrivacyVerified: true,
    ...options.provider,
    providerFetch: meter.providerFetch,
  };
  const api = createWebsiteApi(config);
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: (request, served) => api.fetch(request, served.requestIP(request)?.address),
  });
  const base = `http://127.0.0.1:${String(server.port)}`;
  const send = async (request: () => Request): Promise<Response> => {
    for (let attempt = 0; ; attempt += 1) {
      const response = await fetch(request());
      if (response.status !== 429 || attempt >= 2) return response;
      const body: unknown = await response.clone().json();
      if (!isRecord(body) || body['code'] !== 'rate_limited') return response;
      await options.pause(61_000);
    }
  };
  const results: AssertionResult[] = [];
  try {
    for (const [index, script] of options.scripts.entries()) {
      const visitor = `198.51.100.${String(index + 1)}`;
      const replies: string[] = [];
      const intake = await send(
        () =>
          new Request(`${base}/intakes`, {
            method: 'POST',
            headers: {
              origin: config.publicOrigin,
              'content-type': 'application/json',
              'x-forwarded-for': visitor,
            },
            body: JSON.stringify({ description: script.turns[0] }),
          }),
      );
      const cookie = intake.headers.get('set-cookie')?.split(';')[0];
      if (intake.status !== 201 || !cookie)
        throw new Error(`Script ${script.name}: intake answered ${String(intake.status)}`);
      const view: unknown = await (
        await fetch(`${base}/conversation`, { headers: { origin: config.appOrigin, cookie } })
      ).json();
      const initialOperation = isRecord(view) ? view['initialOperation'] : undefined;
      if (
        !isRecord(view) ||
        typeof view['csrfToken'] !== 'string' ||
        !isRecord(initialOperation) ||
        typeof initialOperation['idempotencyKey'] !== 'string'
      )
        throw new Error(`Script ${script.name}: conversation read failed`);
      const csrf = view['csrfToken'];
      const initialKey = initialOperation['idempotencyKey'];
      let confirmed = true;
      for (const [turn, message] of script.turns.entries()) {
        const response = await send(
          () =>
            new Request(`${base}/conversation/stream`, {
              method: 'POST',
              headers: {
                origin: config.appOrigin,
                cookie,
                'x-puni-csrf': csrf,
                'x-forwarded-for': visitor,
                'content-type': 'application/json',
              },
              body: JSON.stringify(
                turn === 0
                  ? { idempotencyKey: initialKey, initial: true }
                  : { idempotencyKey: `eval-${script.name}-${String(turn)}`, message },
              ),
            }),
        );
        const reply = response.status === 200 ? readConfirmedReply(await response.text()) : null;
        if (reply === null) {
          confirmed = false;
          break;
        }
        replies.push(reply);
        if (options.show)
          options.write(`${script.name} visitor: ${message}\n${script.name} assistant: ${reply}`);
      }
      results.push({ script: script.name, assertion: 'confirmedReplies', passed: confirmed });
      results.push({
        script: script.name,
        assertion: 'noPromptLeak',
        passed: replies.every((reply) => !leaksPrompt(reply)),
      });
      for (const assertion of script.assertions)
        results.push({
          script: script.name,
          assertion: assertion.kind,
          passed: confirmed && checkAssertion(assertion, replies),
        });
    }
  } finally {
    await server.stop(true);
    api.close();
  }
  await meter.settle();
  for (const outcome of results)
    options.write(`${outcome.passed ? 'PASS' : 'FAIL'} ${outcome.script}: ${outcome.assertion}`);
  const passed = results.every((outcome) => outcome.passed);
  options.write(
    `tokens: prompt ${String(meter.totals.promptTokens)}, completion ${String(meter.totals.completionTokens)}`,
  );
  options.write(`result: ${passed ? 'pass' : 'fail'}`);
  return { passed, results, ...meter.totals };
}

/**
 * Reads the provider settings the evaluation needs from the environment, including the reasoning
 * effort and reply cap, so the evaluation sends what production sends.
 * @throws when the key, model, pinned provider or either rate is absent, or a setting is malformed.
 */
export function readEvaluationProvider(
  environment: Record<string, string | undefined>,
): EvaluationOptions['provider'] {
  const runtime = readWebsiteApiConfig(environment);
  const missing = (
    [
      ['OPENROUTER_API_KEY', runtime.openRouterKey],
      ['OPENROUTER_MODEL', runtime.openRouterModel],
      ['OPENROUTER_PROVIDER', runtime.openRouterProvider],
      ['OPENROUTER_INPUT_USD_PER_MILLION', runtime.openRouterInputUsdPerMillion],
      ['OPENROUTER_OUTPUT_USD_PER_MILLION', runtime.openRouterOutputUsdPerMillion],
    ] as const
  )
    .filter(([, value]) => value === undefined || value === '')
    .map(([name]) => name);
  // Proof: removing this refusal let the no-key evaluation test start a run.
  if (missing.length > 0)
    throw new Error(`Sales evaluation refused: ${missing.join(', ')} not set`);
  return {
    openRouterKey: runtime.openRouterKey,
    openRouterModel: runtime.openRouterModel,
    openRouterProvider: runtime.openRouterProvider,
    openRouterInputUsdPerMillion: runtime.openRouterInputUsdPerMillion,
    openRouterOutputUsdPerMillion: runtime.openRouterOutputUsdPerMillion,
    openRouterReasoningEffort: runtime.openRouterReasoningEffort,
    openRouterMaxCompletionTokens: runtime.openRouterMaxCompletionTokens,
  };
}

if (import.meta.main) {
  try {
    const provider = readEvaluationProvider(process.env);
    const scripts = parseSalesCorpus(
      readFileSync(join(import.meta.dir, '../../eval/sales-corpus.json'), 'utf8'),
    );
    const evaluation = await runSalesEvaluation({
      scripts,
      provider,
      show: Bun.argv.includes('--show'),
      write: (line) => {
        console.log(line);
      },
      pause: (milliseconds) => Bun.sleep(milliseconds),
    });
    process.exitCode = evaluation.passed ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Sales evaluation failed');
    process.exitCode = 2;
  }
}
