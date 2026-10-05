import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessageChunk,
} from 'ai';

export type ProviderFetch = (input: string, init: RequestInit) => Response | Promise<Response>;

export interface ProviderRates {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}

/** The pinned OpenRouter endpoint of one paid call; `fetch` is the test transport seam. */
export interface ProviderPin {
  key: string;
  model: string;
  provider: string;
  fetch?: ProviderFetch;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** The server deadline for one streamed paid reply. */
export const replyDeadlineMilliseconds = 30_000;

/**
 * Reads the provider's raw final usage. Normalized SDK usage reports zeros for an absent value,
 * so only integral, nonnegative raw token counts are trusted; anything else returns null and
 * the reservation stays unsettled.
 */
export function readFinalUsage(
  usage: unknown,
): { promptTokens: number; completionTokens: number } | null {
  if (typeof usage !== 'object' || usage === null || Array.isArray(usage)) return null;
  const promptTokens: unknown = Reflect.get(usage, 'prompt_tokens');
  const completionTokens: unknown = Reflect.get(usage, 'completion_tokens');
  // Proof: the missing-final-usage stream test fails if normalized SDK zeros settle this reservation.
  if (
    typeof promptTokens !== 'number' ||
    typeof completionTokens !== 'number' ||
    !Number.isInteger(promptTokens) ||
    !Number.isInteger(completionTokens) ||
    promptTokens < 0 ||
    completionTokens < 0
  )
    return null;
  return { promptTokens, completionTokens };
}

/** The routing block every paid request carries: the pinned endpoint, privacy flags and price ceilings. */
export function providerRouting(provider: string, rates: ProviderRates) {
  return {
    only: [provider],
    zdr: true,
    data_collection: 'deny',
    // Proof: the mounted SSE payload test fails when either routing flag or price ceiling is removed.
    allow_fallbacks: false,
    require_parameters: true,
    max_price: {
      prompt: rates.inputUsdPerMillion,
      completion: rates.outputUsdPerMillion,
      request: 0,
    },
  };
}

/** Streams a saved reply back as one text part, with no provider call. */
export function replayReply(reply: string): Response {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      const id = crypto.randomUUID();
      writer.write({ type: 'text-start', id });
      writer.write({ type: 'text-delta', id, delta: reply });
      writer.write({ type: 'text-end', id });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

export interface ConfirmedReplyOptions {
  pin: ProviderPin;
  rates: ProviderRates;
  system: string;
  messages: ChatMessage[];
  maxOutputTokens: number;
  /** Extra OpenRouter body fields, merged after the routing block. */
  extraBody?: Record<string, unknown>;
  operationId: string;
  /** Live provider calls by operation id, so a cancel route can abort one. */
  aborts: Map<string, AbortController>;
  /** Abort and mark the operation unknown when the browser disconnects mid-stream. */
  abortOnDisconnect: boolean;
  /** Commits the reply and settled usage; false leaves the operation to be marked unknown. */
  complete(reply: string, actualMicroUsd: number, truncated: boolean): boolean;
  markUnknown(): void;
  isCompleted(): boolean;
}

/**
 * Streams one paid reply as an AI SDK UI message stream and emits the finish event only after
 * {@link ConfirmedReplyOptions.complete} has stored the reply with final provider usage. A
 * timeout, abort, provider or stream error, missing raw usage, an empty or oversized reply, or
 * a refused completion marks the operation unknown and ends the stream with an error chunk.
 */
export function streamConfirmedReply(options: ConfirmedReplyOptions): Response {
  const abort = new AbortController();
  options.aborts.set(options.operationId, abort);
  const completion = Promise.withResolvers<boolean>();
  const release = () => {
    clearTimeout(deadline);
    options.aborts.delete(options.operationId);
    completion.resolve(true);
  };
  const deadline = setTimeout(() => {
    options.markUnknown();
    completion.resolve(true);
    abort.abort();
  }, replyDeadlineMilliseconds);
  const injectedFetch = options.pin.fetch;
  const providerFetch = injectedFetch
    ? Object.assign(
        (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
          if (typeof input !== 'string' || !init)
            throw new Error('OpenRouter provider request shape changed');
          return Promise.resolve(injectedFetch(input, init));
        },
        { preconnect: globalThis.fetch.preconnect },
      )
    : undefined;
  const openrouter = createOpenRouter({
    apiKey: options.pin.key,
    compatibility: 'strict',
    fetch: providerFetch,
  });
  const inputRate = options.rates.inputUsdPerMillion;
  const outputRate = options.rates.outputUsdPerMillion;
  const streamed = streamText({
    model: openrouter.chat(options.pin.model),
    system: options.system,
    messages: options.messages,
    maxOutputTokens: options.maxOutputTokens,
    maxRetries: 0,
    abortSignal: abort.signal,
    providerOptions: {
      openrouter: {
        provider: providerRouting(options.pin.provider, options.rates),
        ...options.extraBody,
      },
    },
    onFinish: ({ text, finalStep, finishReason }) => {
      try {
        const usage = readFinalUsage(finalStep.usage.raw);
        if (
          !usage ||
          !['stop', 'length'].includes(finishReason) ||
          !text.trim() ||
          text.length > 8_000
        ) {
          options.markUnknown();
          return;
        }
        const actualMicroUsd = Math.ceil(
          usage.promptTokens * inputRate + usage.completionTokens * outputRate,
        );
        if (!options.complete(text.trim(), actualMicroUsd, finishReason === 'length'))
          options.markUnknown();
      } finally {
        release();
      }
    },
    onAbort: () => {
      options.markUnknown();
      release();
    },
    onError: () => {
      options.markUnknown();
      release();
    },
  });
  const wire = toUIMessageStream({ stream: streamed.stream });
  let connected = true;
  const confirmed = new ReadableStream<UIMessageChunk>({
    start(controller) {
      // The pump runs on the server after browser disconnect; only settled turns get a finish event.
      void (async () => {
        let finishChunk: UIMessageChunk | null = null;
        try {
          for await (const chunk of wire) {
            if (chunk.type === 'finish') finishChunk = chunk;
            else if (connected) controller.enqueue(chunk);
          }
          await completion.promise;
          if (connected) {
            if (options.isCompleted() && finishChunk) controller.enqueue(finishChunk);
            else
              controller.enqueue({
                type: 'error',
                errorText: 'The response could not be confirmed. Your allowance remains on hold.',
              });
            controller.close();
          }
        } catch {
          options.markUnknown();
          release();
          if (connected) {
            controller.enqueue({
              type: 'error',
              errorText: 'The response stopped before completion. Your allowance remains on hold.',
            });
            controller.close();
          }
        }
      })();
    },
    cancel() {
      connected = false;
      if (options.abortOnDisconnect) abort.abort();
    },
  });
  const response = createUIMessageStreamResponse({ stream: confirmed });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
