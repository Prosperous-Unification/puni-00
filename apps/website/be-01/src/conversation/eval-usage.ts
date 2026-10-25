import { isRecord } from './eval-scoping';
import { type ProviderFetch, readFinalCharge, readFinalUsage } from './stream';

export interface OperationMeasure {
  promptTokens: number | null;
  completionTokens: number | null;
  reasoningTokens: number | null;
  ratedMicroUsd: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  knownMicroUsd: number;
  unknownReservedMicroUsd: number;
  reportedCostUsd: number | null;
  latencyMilliseconds: number;
  provider: string | null;
  model: string | null;
  finishReason: string | null;
}
/** Tees only visible metadata. Final cumulative usage replaces earlier observations; reasoning is a completion subset. */
export function meterUsage(
  base: ProviderFetch,
  rates: { input: number; output: number; inputCeiling: number; outputCeiling: number },
  maximumMicroUsd?: number,
) {
  const operations: OperationMeasure[] = [];
  const pending: Promise<void>[] = [];
  const providerFetch: ProviderFetch = async (input, init) => {
    if (typeof init.body !== 'string') throw new Error('Evaluation provider body must be JSON');
    const request: unknown = JSON.parse(init.body);
    if (!isRecord(request) || typeof request['max_completion_tokens'] !== 'number')
      throw new Error('Evaluation provider completion bound is missing');
    // A conservative evaluation ceiling includes the entire wire body, exceeding the app's messages/schema reservation.
    // Proof: substituting base input rates failed all unknown-charge effective-ceiling tests.
    const ceiling = Math.ceil(
      (Buffer.byteLength(init.body, 'utf8') + 2000) * rates.inputCeiling +
        request['max_completion_tokens'] * rates.outputCeiling,
    );
    // Proof: removing this guard reached transport in evaluation unsafe-reservation refusal.
    if (!Number.isSafeInteger(ceiling) || ceiling <= 0)
      throw new Error('Evaluation reservation exceeds safe micro-USD');
    // Proof: removing this bound purchased the forbidden operation in eval-scoping.test and the reported-surcharge budget case.
    if (
      maximumMicroUsd !== undefined &&
      operations.reduce(
        (sum, previous) => sum + previous.knownMicroUsd + previous.unknownReservedMicroUsd,
        0,
      ) +
        ceiling >
        maximumMicroUsd
    )
      throw new Error('Evaluation spend bound reached before provider request');
    const operation: OperationMeasure = {
      promptTokens: null,
      completionTokens: null,
      reasoningTokens: null,
      ratedMicroUsd: null,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      knownMicroUsd: 0,
      unknownReservedMicroUsd: ceiling,
      reportedCostUsd: null,
      latencyMilliseconds: 0,
      provider: null,
      model: null,
      finishReason: null,
    };
    operations.push(operation);
    const started = performance.now();
    const response = await base(input, init);
    if (!response.body) {
      operation.latencyMilliseconds = performance.now() - started;
      return response;
    }
    const [forApi, forMeter] = response.body.tee();
    pending.push(
      (async () => {
        const source = await new Response(forMeter).text();
        let finalUsage: unknown;
        for (const line of source.split('\n')) {
          if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
          const chunk: unknown = JSON.parse(line.slice(6));
          if (!isRecord(chunk)) continue;
          // Proof: replacing this assignment with accumulation doubled eval-scoping.test's cumulative fixture.
          if (chunk['usage'] !== undefined && chunk['usage'] !== null) finalUsage = chunk['usage'];
          if (typeof chunk['provider'] === 'string') operation.provider = chunk['provider'];
          if (typeof chunk['model'] === 'string') operation.model = chunk['model'];
          if (Array.isArray(chunk['choices']))
            for (const choice of chunk['choices'])
              if (isRecord(choice) && typeof choice['finish_reason'] === 'string')
                operation.finishReason = choice['finish_reason'];
        }
        operation.latencyMilliseconds = Math.round(performance.now() - started);
        const usage = readFinalUsage(finalUsage);
        if (usage !== null) {
          operation.promptTokens = usage.promptTokens;
          operation.completionTokens = usage.completionTokens;
          if (isRecord(finalUsage)) {
            const completion = finalUsage['completion_tokens_details'];
            const prompt = finalUsage['prompt_tokens_details'];
            // Proof: removing the subset bound exposed impossible reasoning; bypassing the combined-cache guard exposed overlapping counts.
            const boundedCount = (value: unknown, maximum: number): number | null =>
              typeof value === 'number' &&
              Number.isSafeInteger(value) &&
              value >= 0 &&
              value <= maximum
                ? value
                : null;
            operation.reasoningTokens = boundedCount(
              isRecord(completion) ? completion['reasoning_tokens'] : undefined,
              usage.completionTokens,
            );
            operation.cacheReadTokens = boundedCount(
              isRecord(prompt) ? prompt['cached_tokens'] : undefined,
              usage.promptTokens,
            );
            operation.cacheWriteTokens = boundedCount(
              isRecord(prompt) ? prompt['cache_write_tokens'] : undefined,
              usage.promptTokens,
            );
            if (
              operation.cacheReadTokens !== null &&
              operation.cacheWriteTokens !== null &&
              operation.cacheReadTokens + operation.cacheWriteTokens > usage.promptTokens
            ) {
              operation.cacheReadTokens = null;
              operation.cacheWriteTokens = null;
            }
          }
        }
        const charge = readFinalCharge(finalUsage, {
          inputUsdPerMillion: rates.input,
          outputUsdPerMillion: rates.output,
        });
        // Missing/malformed charge retains the complete effective-rate reservation even when tokens are known.
        if (charge === null) return;
        operation.ratedMicroUsd = charge.ratedMicroUsd;
        operation.knownMicroUsd = charge.accountedMicroUsd;
        operation.reportedCostUsd = charge.reportedCostUsd;
        operation.unknownReservedMicroUsd = 0;
      })(),
    );
    return new Response(forApi, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
  return { providerFetch, operations, settle: () => Promise.all(pending) };
}
export function totalUsage(operations: OperationMeasure[]) {
  return operations.reduce(
    (totals, operation) => ({
      promptTokens: totals.promptTokens + (operation.promptTokens ?? 0),
      completionTokens: totals.completionTokens + (operation.completionTokens ?? 0),
      reasoningTokens: totals.reasoningTokens + (operation.reasoningTokens ?? 0),
      knownMicroUsd: totals.knownMicroUsd + operation.knownMicroUsd,
      unknownReservedMicroUsd: totals.unknownReservedMicroUsd + operation.unknownReservedMicroUsd,
      unknownUsageOperations:
        totals.unknownUsageOperations + (operation.unknownReservedMicroUsd > 0 ? 1 : 0),
      unknownReasoningOperations:
        totals.unknownReasoningOperations + (operation.reasoningTokens === null ? 1 : 0),
    }),
    {
      promptTokens: 0,
      completionTokens: 0,
      reasoningTokens: 0,
      knownMicroUsd: 0,
      unknownReservedMicroUsd: 0,
      unknownUsageOperations: 0,
      unknownReasoningOperations: 0,
    },
  );
}
