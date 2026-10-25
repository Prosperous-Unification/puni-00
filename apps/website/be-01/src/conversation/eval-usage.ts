import { isRecord } from './eval-scoping';
import { type ProviderFetch, readFinalUsage } from './stream';

export interface OperationMeasure {
  promptTokens: number | null;
  completionTokens: number | null;
  reasoningTokens: number | null;
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
  rates: { input: number; output: number },
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
    const ceiling = Math.ceil(
      (Buffer.byteLength(init.body, 'utf8') + 2000) * rates.input +
        request['max_completion_tokens'] * rates.output,
    );
    // Proof: removing this bound purchased the forbidden operation in eval-scoping.test.
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
        // Proof: missing raw usage in eval-scoping.test remains a positive reserved ceiling, not zero.
        if (usage === null) return;
        operation.promptTokens = usage.promptTokens;
        operation.completionTokens = usage.completionTokens;
        operation.knownMicroUsd = Math.ceil(
          usage.promptTokens * rates.input + usage.completionTokens * rates.output,
        );
        operation.unknownReservedMicroUsd = 0;
        if (isRecord(finalUsage)) {
          const details = finalUsage['completion_tokens_details'];
          const reasoning = isRecord(details) ? details['reasoning_tokens'] : undefined;
          if (
            typeof reasoning === 'number' &&
            Number.isSafeInteger(reasoning) &&
            reasoning >= 0 &&
            reasoning <= usage.completionTokens
          )
            operation.reasoningTokens = reasoning;
          if (
            typeof finalUsage['cost'] === 'number' &&
            Number.isFinite(finalUsage['cost']) &&
            finalUsage['cost'] >= 0
          )
            operation.reportedCostUsd = finalUsage['cost'];
        }
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
        totals.unknownUsageOperations + (operation.promptTokens === null ? 1 : 0),
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
