import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import {
  invalidScopingReplyText,
  readScopingReply,
  type ReplyFailure,
  replyReplacePart,
  type ScopingReply,
  scopingReplyText,
} from '@website/contracts';
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  defaultSettingsMiddleware,
  streamText,
  toUIMessageStream,
  type UIMessageChunk,
  wrapLanguageModel,
} from 'ai';

import { parseProviderScopingReply, scopingReplySchema } from './scoping-reply';

export type ProviderFetch = (input: string, init: RequestInit) => Response | Promise<Response>;

export interface ProviderRates {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}

/** The OpenRouter reasoning efforts an operator may configure; higher efforts are refused. */
export const reasoningEfforts = ['none', 'minimal', 'low', 'medium'] as const;

export type ReasoningEffort = (typeof reasoningEfforts)[number];

export function isReasoningEffort(value: string): value is ReasoningEffort {
  return reasoningEfforts.some((effort) => effort === value);
}

/**
 * OpenRouter's unified reasoning block for one paid call. `exclude: true` keeps reasoning text out
 * of the response, so it is never streamed, stored or shown. An unset effort sends no field, which
 * a non-reasoning endpoint needs: with `require_parameters: true`, an endpoint that does not list
 * `reasoning` is filtered out and the call fails. Reasoning tokens bill as completion tokens and
 * count against `max_completion_tokens`.
 */
export function reasoningRequest(
  effort: ReasoningEffort | undefined,
): { reasoning: { effort: ReasoningEffort; exclude: true } } | Record<string, never> {
  return effort === undefined ? {} : { reasoning: { effort, exclude: true } };
}

/** The pinned OpenRouter endpoint of one paid call; `fetch` is the test transport seam. */
export interface ProviderPin {
  key: string;
  model: string;
  provider: string;
  reasoningEffort?: ReasoningEffort;
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
 * the operation is settled at its full reservation. `completion_tokens` already includes any
 * `completion_tokens_details.reasoning_tokens`, so settlement charges reasoning exactly once.
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

/**
 * Why the provider declined a call: a `content_filter` finish, or an in-stream error whose
 * `metadata.error_type` is `refusal` (OpenRouter sends it inside an HTTP 200 stream).
 */
export type ProviderRefusal = 'content_filter' | 'provider_refusal';

/** True for a raw OpenRouter chunk carrying an error typed `refusal`; any other error is not one. */
export function isRefusalChunk(rawValue: unknown): boolean {
  if (typeof rawValue !== 'object' || rawValue === null) return false;
  const error: unknown = Reflect.get(rawValue, 'error');
  if (typeof error !== 'object' || error === null) return false;
  const metadata: unknown = Reflect.get(error, 'metadata');
  // Proof: accepting any typed error here completed the mounted provider_error stream as a decline.
  return (
    typeof metadata === 'object' &&
    metadata !== null &&
    Reflect.get(metadata, 'error_type') === 'refusal'
  );
}

/**
 * True for the SDK's stream error raised from an OpenRouter refusal chunk: its `data` is the
 * chunk's `error` object. After partial text the SDK reports this error before the raw chunk
 * reaches `onChunk`, so the error itself must be classified.
 */
export function isRefusalError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const data: unknown = Reflect.get(error, 'data');
  return isRefusalChunk({ error: data });
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
export function replayReply(
  reply: string,
  replyVersion: 1 | null = null,
  replyFailure: ReplyFailure | null = null,
): Response {
  const prose = replyVersion === 1 ? scopingReplyText(readScopingReply(reply)) : reply;
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      const id = crypto.randomUUID();
      writer.write({ type: 'text-start', id });
      writer.write({ type: 'text-delta', id, delta: prose });
      writer.write({ type: 'text-end', id });
      if (replyFailure) writer.write({ type: 'data-reply-failure', data: { code: replyFailure } });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

/**
 * The modeled outcome of a provider refusal: a fixed, server-owned reply saved and streamed as a
 * normal assistant turn instead of an interrupted one.
 */
export interface ProviderDecline {
  reply: string;
  /** Commits {@link ProviderDecline.reply} at the provider-reported cost; false marks the operation unknown. */
  complete(refusal: ProviderRefusal, actualMicroUsd: number): boolean;
}

export interface ConfirmedReplyOptions {
  pin: ProviderPin;
  rates: ProviderRates;
  system: string;
  messages: ChatMessage[];
  /**
   * The completion cap, sent only as `max_completion_tokens`. It never reaches the SDK's
   * `maxOutputTokens`, which the OpenRouter provider serializes as `max_tokens`: the pinned
   * endpoint does not list `max_tokens`, so `require_parameters: true` would filter it out.
   */
  maxCompletionTokens: number;
  operationId: string;
  /** Live provider calls by operation id, so a cancel route can abort one. */
  aborts: Map<string, AbortController>;
  /** Commits the reply and settled usage; false leaves the operation to be marked unknown. */
  complete(reply: string, actualMicroUsd: number, truncated: boolean): boolean;
  /** Buffers a version-1 envelope; null settles a known invalid envelope with the fixed manual path. */
  structured?: { complete(reply: ScopingReply | null, actualMicroUsd: number): boolean };
  /** Settles an operation whose final usage is unknown; see the store's ceiling settlement. */
  markUnknown(): void;
  /** Told of each provider failure (5xx, timeout, non-refusal stream error), not of a stop. */
  onProviderFailure(): void;
  /** The user-facing `errorText` when the reply ends without confirmed usage. */
  interruptedText: string;
  /** Completes a provider refusal as a fixed reply instead of an interrupted one. */
  decline: ProviderDecline;
  /** Receives the provider's generation id once, from the first raw chunk that carries one. */
  recordGeneration(generationId: string): void;
  isCompleted(): boolean;
  /** Reads durable ownership and erasure state; false cancels this attempt, including after another process's cleanup. */
  canContinue(): boolean;
}

/**
 * Streams one paid reply through the AI SDK UI protocol; finish is published only after durable
 * settlement. Legacy mode streams text progressively and settles through
 * {@link ConfirmedReplyOptions.complete}.
 * An empty or oversized legacy reply is unknown and settles at its reserved ceiling.
 *
 * Structured mode buffers the entire envelope, validates it and commits through
 * {@link ConfirmedReplyOptions.structured} before publishing readable prose. A malformed,
 * oversized or truncated envelope with valid usage completes accounting at the actual cost and
 * publishes the fixed manual-path reply with `data-reply-failure`; no invalid model content or
 * scoping action is published or saved. A valid envelope publishes only its committed prose.
 *
 * A provider refusal ({@link ProviderRefusal}) with valid usage completes with the server-owned
 * decline at the reported cost. Legacy mode ends open text parts and sends {@link replyReplacePart}
 * to replace any already-streamed partial text; structured mode publishes the decline only after
 * settlement. Both finish with `stop` and suppress the provider refusal's own error chunk.
 * Missing or invalid usage, including refusal usage, always settles at the full reserved ceiling
 * and ends with an error chunk. Explicitly reported zero usage remains distinct from missing usage.
 * Timeout, abort, disconnect, provider/stream errors and rejected completion likewise mark the
 * operation unknown rather than publishing a confirmed reply.
 *
 * Durable cancellation is checked every 50 ms and before forwarding chunks; the store fences
 * completion too. Cleanup in another process aborts an idle provider and suppresses subsequent
 * publication, including queued chunks. Already delivered legacy text cannot be recalled. The
 * watcher and provider deadline are released on every terminal outcome.
 */
export function streamConfirmedReply(options: ConfirmedReplyOptions): Response {
  const abort = new AbortController();
  options.aborts.set(options.operationId, abort);
  const completion = Promise.withResolvers<boolean>();
  const release = () => {
    clearTimeout(deadline);
    clearInterval(cancellation);
    options.aborts.delete(options.operationId);
    completion.resolve(true);
  };
  const deadline = setTimeout(() => {
    options.onProviderFailure();
    options.markUnknown();
    completion.resolve(true);
    abort.abort();
  }, replyDeadlineMilliseconds);
  // Proof: removing this watcher left the provider signal live in the cleanup-process idle-stream test.
  const cancellation = setInterval(() => {
    if (!options.canContinue()) abort.abort();
  }, 50);
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
  let generationRecorded = false;
  const decline = options.decline;
  let refusal: ProviderRefusal | null = null;
  let declined = false;
  let confirmedText: string | null = null;
  let replyFailure: ReplyFailure | null = null;
  /** The last raw usage seen; a refusal's usage can ride the error chunk the SDK does not parse. */
  let rawUsage: unknown = undefined;
  const inputRate = options.rates.inputUsdPerMillion;
  const outputRate = options.rates.outputUsdPerMillion;
  const streamed = streamText({
    model: options.structured
      ? wrapLanguageModel({
          model: openrouter.chat(options.pin.model),
          middleware: defaultSettingsMiddleware({
            settings: {
              responseFormat: { type: 'json', schema: scopingReplySchema, name: 'scoping_reply' },
            },
          }),
        })
      : openrouter.chat(options.pin.model),
    system: options.system,
    messages: options.messages,
    maxRetries: 0,
    abortSignal: abort.signal,
    includeRawChunks: true,
    onChunk: ({ chunk }) => {
      if (chunk.type !== 'raw') return;
      const rawValue: unknown = chunk.rawValue;
      // Proof: dropping this detection turned the mounted 200-with-refusal-error test into an interrupted reply.
      if (isRefusalChunk(rawValue)) refusal = 'provider_refusal';
      const usage: unknown =
        typeof rawValue === 'object' && rawValue !== null ? Reflect.get(rawValue, 'usage') : null;
      if (usage !== undefined && usage !== null) rawUsage = usage;
      if (generationRecorded) return;
      const generationId: unknown =
        typeof rawValue === 'object' && rawValue !== null ? Reflect.get(rawValue, 'id') : null;
      if (typeof generationId !== 'string' || !generationId) return;
      generationRecorded = true;
      // Proof: dropping this call left generation_id null in the mounted cancel test.
      options.recordGeneration(generationId);
    },
    providerOptions: {
      openrouter: {
        ...(options.structured ? { structuredOutputs: { strict: true } } : {}),
        provider: providerRouting(options.pin.provider, options.rates),
        // Proof: raising only this provider cap by 100 failed the mounted structured 700-token contract.
        max_completion_tokens: options.maxCompletionTokens,
        // Proof: removing this spread failed the mounted reasoning-effort conversation test.
        ...reasoningRequest(options.pin.reasoningEffort),
      },
    },
    onFinish: ({ text, finalStep, finishReason }) => {
      try {
        // Proof: dropping this mapping turned the mounted content_filter test into an interrupted reply.
        if (finishReason === 'content-filter') refusal = 'content_filter';
        if (refusal) {
          // Proof: dropping the raw fallback settled 0 in the usage-on-the-error-chunk refusal test.
          const reported = readFinalUsage(finalStep.usage.raw ?? rawUsage);
          // Proof: settling absent refusal usage at zero failed structured accounting refusal missing usage.
          if (!reported) {
            options.markUnknown();
            return;
          }
          const actualMicroUsd = Math.ceil(
            reported.promptTokens * inputRate + reported.completionTokens * outputRate,
          );
          declined = decline.complete(refusal, actualMicroUsd);
          if (!declined) options.markUnknown();
          return;
        }
        const usage = readFinalUsage(finalStep.usage.raw);
        if (options.structured) {
          if (!usage) {
            options.markUnknown();
            return;
          }
          const parsed = parseProviderScopingReply(text, finishReason !== 'stop');
          // Proof: fixed 400-token settlement and subtracting 600 reasoning tokens each failed structured accounting reasoning included once.
          const actualMicroUsd = Math.ceil(
            usage.promptTokens * inputRate + usage.completionTokens * outputRate,
          );
          const reply = parsed.kind === 'valid' ? parsed.value : null;
          if (!options.structured.complete(reply, actualMicroUsd)) {
            options.markUnknown();
            return;
          }
          confirmedText = reply === null ? invalidScopingReplyText : scopingReplyText(reply);
          replyFailure = reply === null ? 'invalid_scoping_reply' : null;
          return;
        }
        if (
          !usage ||
          !['stop', 'length'].includes(finishReason) ||
          !text.trim() ||
          text.length > 8_000
        ) {
          options.markUnknown();
          return;
        }
        // Proof: subtracting reasoning_tokens here settled 502 instead of 1,558 in the reasoning settlement test.
        const actualMicroUsd = Math.ceil(
          usage.promptTokens * inputRate + usage.completionTokens * outputRate,
        );
        if (!options.complete(text.trim(), actualMicroUsd, finishReason === 'length'))
          options.markUnknown();
      } catch (error) {
        // Proof: omitting ceiling settlement left the injected failed-turn operation inflight.
        options.markUnknown();
        throw error;
      } finally {
        release();
      }
    },
    onAbort: () => {
      options.markUnknown();
      release();
    },
    onError: ({ error }) => {
      // Proof: without this classification the mounted refusal-after-partial-text test streamed an
      // `error` and no finish, because the raw refusal chunk reaches onChunk after this callback.
      if (isRefusalError(error)) refusal = 'provider_refusal';
      // A refusal error is followed by the finish, which settles it as a decline.
      // Proof: marking unknown here as before failed the mounted 200-with-refusal-error test.
      if (refusal) return;
      if (!abort.signal.aborted) options.onProviderFailure();
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
        /** Text parts started and not yet ended; a decline ends them before replacing the text. */
        const openTextIds = new Set<string>();
        try {
          for await (const chunk of wire) {
            // Proof: removing this fence published SECRET LATE REPLY in the cleanup-before-polling-tick test.
            if (!options.canContinue()) abort.abort();
            if (abort.signal.aborted) continue;
            // Proof: removing this buffer published SECRET UNCOMMITTED when the turn insert rolled back.
            if (options.structured) {
              if (chunk.type === 'finish') finishChunk = chunk;
              continue;
            }
            if (chunk.type === 'text-start') openTextIds.add(chunk.id);
            else if (chunk.type === 'text-end') openTextIds.delete(chunk.id);
            if (chunk.type === 'finish') finishChunk = chunk;
            // Proof: forwarding this chunk put an `error` beside the decline's `finish` in the refusal tests.
            else if (chunk.type === 'error' && refusal) continue;
            else if (connected) controller.enqueue(chunk);
          }
          await completion.promise;
          if (connected) {
            if (
              options.structured &&
              !abort.signal.aborted &&
              options.canContinue() &&
              options.isCompleted() &&
              (confirmedText !== null || declined)
            ) {
              const id = options.operationId;
              controller.enqueue({ type: 'text-start', id });
              controller.enqueue({
                type: 'text-delta',
                id,
                delta: declined ? decline.reply : String(confirmedText),
              });
              controller.enqueue({ type: 'text-end', id });
              if (replyFailure)
                controller.enqueue({ type: 'data-reply-failure', data: { code: replyFailure } });
              controller.enqueue({ type: 'finish', finishReason: 'stop' });
            } else if (
              !abort.signal.aborted &&
              options.canContinue() &&
              declined &&
              options.isCompleted()
            ) {
              for (const id of openTextIds) controller.enqueue({ type: 'text-end', id });
              // Proof: streaming the decline as appended text deltas instead glued it to the partial
              // reply in the mounted partial-text refusal tests and in the browser regression.
              controller.enqueue({ type: replyReplacePart, data: { text: decline.reply } });
              controller.enqueue({ type: 'finish', finishReason: 'stop' });
            } else if (
              !abort.signal.aborted &&
              options.canContinue() &&
              options.isCompleted() &&
              finishChunk
            )
              controller.enqueue(finishChunk);
            else
              controller.enqueue({
                type: 'error',
                errorText: options.interruptedText,
              });
            controller.close();
          }
        } catch {
          options.markUnknown();
          release();
          if (connected) {
            controller.enqueue({
              type: 'error',
              errorText: options.interruptedText,
            });
            controller.close();
          }
        }
      })();
    },
    cancel() {
      connected = false;
      // Proof: dropping this abort left the provider call running in the mounted disconnect test.
      abort.abort();
    },
  });
  const response = createUIMessageStreamResponse({ stream: confirmed });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
