import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseSalesCorpus, readEvaluationProvider, runSalesEvaluation } from './eval-cli';
import { isRecord } from './eval-scoping';
import { providerRouting } from './stream';

const environmentKeys = [
  'OPENROUTER_API_KEY',
  'OPENROUTER_MODEL',
  'OPENROUTER_PROVIDER',
  'OPENROUTER_INPUT_USD_PER_MILLION',
  'OPENROUTER_OUTPUT_USD_PER_MILLION',
  'OPENROUTER_REASONING_EFFORT',
  'OPENROUTER_MAX_COMPLETION_TOKENS',
];
/** Reads only explicit provider assignments as inert text; never evaluates shell syntax or reports values on failure. */
export function readEvaluationEnvironment(source: string): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const line of source.split('\n')) {
    const match = /^(OPENROUTER_[A-Z_]+)=(.*)$/.exec(line.trim());
    if (!match || !environmentKeys.includes(match[1])) continue;
    const name = match[1];
    // Proof: removing duplicate refusal failed the host env boundary test.
    if (Object.hasOwn(environment, name)) throw new Error(`Evaluation env duplicate ${name}`);
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      value = value.slice(1, -1);
    // Proof: removing inert-assignment validation admitted shell substitution in the host env test.
    if (!value || /[\s$`\\"']/.test(value))
      throw new Error(`Evaluation env invalid assignment ${name}`);
    environment[name] = value;
  }
  // Proof: removing missing-key refusal failed the host env boundary test.
  for (const name of environmentKeys)
    if (!Object.hasOwn(environment, name)) throw new Error(`Evaluation env missing ${name}`);
  return environment;
}
/** The existing fifty-dollar monthly cap is immutable; missing spend evidence blocks paid requests. */
export function readKeyBudget(payload: unknown, maximumUsd: number) {
  const key = isRecord(payload) ? payload['data'] : undefined;
  // Proof: independently removing cap, remaining or monthly-reset checks failed paid preflight tests.
  if (
    !isRecord(key) ||
    key['limit'] !== 50 ||
    key['limit_reset'] !== 'monthly' ||
    typeof key['limit_remaining'] !== 'number' ||
    !Number.isFinite(key['limit_remaining']) ||
    key['limit_remaining'] < maximumUsd ||
    typeof key['usage'] !== 'number' ||
    !Number.isFinite(key['usage']) ||
    key['usage'] < 0
  )
    throw new Error('Evaluation key budget missing, changed or insufficient');
  return {
    limit: key['limit'],
    remaining: key['limit_remaining'],
    usage: key['usage'],
    reset: key['limit_reset'],
  };
}
/** Exact endpoint capability and prices are metadata evidence, separate from real acceptance. */
export function validateEndpoint(
  payload: unknown,
  pin: string,
  inputRate: number,
  outputRate: number,
) {
  const model = isRecord(payload) ? payload['data'] : undefined;
  const endpoints = isRecord(model) ? model['endpoints'] : undefined;
  const endpoint: unknown = Array.isArray(endpoints)
    ? endpoints.find((candidate: unknown) => isRecord(candidate) && candidate['tag'] === pin)
    : undefined;
  if (
    !isRecord(endpoint) ||
    !isRecord(endpoint['pricing']) ||
    typeof endpoint['provider_name'] !== 'string' ||
    !Array.isArray(endpoint['supported_parameters'])
  )
    throw new Error('Evaluation endpoint metadata missing');
  const parameters = endpoint['supported_parameters'];
  // Proof: removing endpoint price comparison failed the changed-rate preflight fixture.
  if (
    !['response_format', 'structured_outputs', 'reasoning'].every((parameter) =>
      parameters.includes(parameter),
    ) ||
    !(parameters.includes('max_tokens') || parameters.includes('max_completion_tokens')) ||
    Math.abs(Number(endpoint['pricing']['prompt']) * 1_000_000 - inputRate) > 1e-10 ||
    Math.abs(Number(endpoint['pricing']['completion']) * 1_000_000 - outputRate) > 1e-10 ||
    !Number.isFinite(Number(endpoint['pricing']['prompt'])) ||
    !Number.isFinite(Number(endpoint['pricing']['completion']))
  )
    throw new Error('Evaluation endpoint capabilities or rates differ');
  return { provider: endpoint['provider_name'], pin, inputRate, outputRate, parameters };
}

if (import.meta.main) {
  try {
    const mode = Bun.argv[2];
    const envPath = Bun.argv[3];
    if ((mode !== 'pilot' && mode !== 'full') || !envPath)
      throw new Error('Usage: eval-host.ts pilot|full /host/runtime.env');
    const identity = Bun.spawnSync(['git', 'rev-parse', 'HEAD']);
    if (identity.exitCode !== 0) throw new Error('Evaluation requires a committed Git identity');
    const sha = identity.stdout.toString().trim();
    const dirty = Bun.spawnSync(['git', 'status', '--porcelain', '--untracked-files=no']);
    if (dirty.exitCode !== 0 || dirty.stdout.toString().trim())
      throw new Error('Evaluation tracked checkout must be clean');
    const environment = readEvaluationEnvironment(readFileSync(envPath, 'utf8'));
    const provider = readEvaluationProvider(environment);
    const key = environment['OPENROUTER_API_KEY'];
    const model = environment['OPENROUTER_MODEL'];
    const pin = environment['OPENROUTER_PROVIDER'];
    const inputRate = Number(environment['OPENROUTER_INPUT_USD_PER_MILLION']);
    const outputRate = Number(environment['OPENROUTER_OUTPUT_USD_PER_MILLION']);
    const maximumUsd = mode === 'pilot' ? 0.05 : 0.5;
    const get = async (path: string): Promise<unknown> => {
      const response = await fetch(`https://openrouter.ai/api/v1/${path}`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!response.ok)
        throw new Error(
          `Evaluation metadata ${path === 'key' ? 'key' : 'endpoint'} HTTP ${String(response.status)}`,
        );
      return response.json();
    };
    const budget = readKeyBudget(await get('key'), maximumUsd);
    const endpoint = validateEndpoint(
      await get(`models/${model}/endpoints`),
      pin,
      inputRate,
      outputRate,
    );
    const directory = join(process.cwd(), '.superpowers/evaluation-private');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    // Proof: bypassing this gate made missing, unreadable, malformed, failed and different-SHA
    // receipts reach fake inference in the full host-entry tests; the passing receipt is a positive control.
    if (mode === 'full') {
      const pilot: unknown = JSON.parse(readFileSync(join(directory, 'pilot.json'), 'utf8'));
      if (!isRecord(pilot) || pilot['sha'] !== sha || pilot['passed'] !== true)
        throw new Error('Full evaluation requires a passing pilot for this SHA');
    }
    const corpus = parseSalesCorpus(
      readFileSync(join(import.meta.dir, '../../eval/sales-corpus.json'), 'utf8'),
    );
    const eligible = corpus.filter(
      (script) => script.protocol !== 'scoping' || script.transportFault === undefined,
    );
    const scripts =
      mode === 'pilot'
        ? eligible.filter((script) => ['click-improve', 'mixed-improve'].includes(script.name))
        : eligible;
    const path = join(directory, `${mode}-${String(Date.now())}.log`);
    const receipt = {
      sha,
      mode,
      model,
      pin,
      reasoning: provider.openRouterReasoningEffort,
      maxCompletionTokens: provider.openRouterMaxCompletionTokens,
      maximumUsd,
      endpoint,
      budget,
      routing: providerRouting(pin, {
        inputUsdPerMillion: inputRate,
        outputUsdPerMillion: outputRate,
      }),
      scenarios: scripts.map((script) => script.name),
      scriptedOnly: corpus
        .filter((script) => script.protocol === 'scoping' && script.transportFault !== undefined)
        .map((script) => script.name),
    };
    writeFileSync(path, JSON.stringify(receipt) + '\n', { mode: 0o600 });
    console.log(JSON.stringify(receipt));
    const evaluation = await runSalesEvaluation({
      scripts,
      provider,
      show: true,
      stopOnFailure: true,
      maximumMicroUsd: maximumUsd * 1_000_000,
      write: (line) => {
        appendFileSync(path, line + '\n');
        if (line.startsWith('session:') || line.startsWith('FAIL ') || line.startsWith('result:'))
          console.log(line);
      },
      pause: (milliseconds) => Bun.sleep(milliseconds),
    });
    const after = readKeyBudget(await get('key'), 0);
    const summary = {
      ...evaluation,
      sha,
      mode,
      before: budget,
      after,
      accountDeltaUsd: after.usage - budget.usage,
      accountDeltaLimit:
        'May include concurrent use of this existing key; not generation-specific debit.',
      transcriptPath: path,
    };
    writeFileSync(join(directory, `${mode}.json`), JSON.stringify(summary, null, 2) + '\n', {
      mode: 0o600,
    });
    console.log(
      JSON.stringify({
        sha,
        passed: evaluation.passed,
        completedScenarios: evaluation.sessions.length,
        knownMicroUsd: evaluation.knownMicroUsd,
        unknownReservedMicroUsd: evaluation.unknownReservedMicroUsd,
        accountDeltaUsd: summary.accountDeltaUsd,
        after,
        transcriptPath: path,
      }),
    );
    process.exitCode = evaluation.passed ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Evaluation failed');
    process.exitCode = 2;
  }
}
