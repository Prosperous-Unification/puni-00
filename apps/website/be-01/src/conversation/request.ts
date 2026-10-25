import {
  briefCloseMarker,
  briefOpenMarker,
  type ConversationReplyStage,
  parseScopingAnswerRequest,
  resolveScopingAnswer,
} from '@website/contracts';
import type { ConversationContext } from '@website/store-sqlite';

import { scopingReplySchema } from './scoping-reply';
import type { ChatMessage, ProviderRates } from './stream';
import { composeScopingSystemText, composeSystemText } from './system-prompt';

/**
 * Completion tokens per conversation reply when `OPENROUTER_MAX_COMPLETION_TOKENS` is unset. A
 * reasoning model spends part of the cap on hidden reasoning tokens, so it needs a larger cap.
 */
export const defaultConversationReplyTokens = 400;

/** Characters of saved history sent with one reply. */
export const historyCharacterLimit = 12_000;

/** Legacy visitor message length after the Home request; version 1 validates raw text at 2,000. */
export const visitorMessageLimit = 1_500;

/**
 * Validates raw explanations and catalogue IDs independently of the current durable revision.
 * Admission compares that revision after replay lookup under its write lock, before pricing.
 * The resolved bound is 2,000 raw characters plus the longest catalogue label and two newlines;
 * the complete resolved text is priced and persisted without truncation.
 */
export function parseConversationAnswer(input: Record<string, unknown>) {
  const request = parseScopingAnswerRequest(input);
  if (request.kind !== 'valid') return request;
  const selected = request.value.selected;
  const answer = resolveScopingAnswer(request.value, {
    questionId: selected?.questionId ?? null,
    revision: selected?.revision ?? 0,
  });
  if (answer.kind !== 'valid') return answer;
  return { kind: 'valid' as const, value: { ...answer.value, request: request.value } };
}

export interface ConversationRequest {
  system: string;
  messages: ChatMessage[];
  schema?: typeof scopingReplySchema;
}

/**
 * Keeps the Home request (the first turn) and the newest turns within
 * {@link historyCharacterLimit}, dropping the oldest turns after the Home request first.
 */
export function trimHistory(history: ChatMessage[]): ChatMessage[] {
  if (history.length === 0) return [];
  const [home, ...rest] = history;
  const kept = [...rest];
  const size = () =>
    home.content.length + kept.reduce((total, turn) => total + turn.content.length, 0);
  while (kept.length > 0 && size() > historyCharacterLimit) kept.shift();
  return [home, ...kept];
}

/**
 * The outbound request of one reply: exactly one system message (the shipped prompt and the
 * stage hint), the trimmed history, then the visitor message as the last user message. Visitor
 * text never reaches the system text.
 */
export function composeConversationRequest(
  history: ChatMessage[],
  message: string,
  stage: ConversationReplyStage,
  context?: ConversationContext,
): ConversationRequest {
  if (context?.scoping.version === 1)
    return {
      system: composeScopingSystemText(context.visitorTurns === 7),
      messages: [
        ...trimHistory(history),
        { role: 'user', content: `Untrusted current scoping context: ${JSON.stringify(context)}` },
        { role: 'user', content: message },
      ],
      schema: scopingReplySchema,
    };
  return {
    system: composeSystemText(stage),
    messages: [...trimHistory(history), { role: 'user', content: message }],
  };
}

/**
 * A conservative reservation in micro-USD: every UTF-8 byte of the serialized request counted as
 * one input token, 2,000 tokens for message framing, and the full reply token cap, which bounds
 * reasoning and visible tokens together.
 */
export function priceConversationRequest(
  request: ConversationRequest,
  rates: ProviderRates,
  replyTokens: number,
): number {
  // Proof: omitting schema bytes failed structured admission snapshot against the captured outbound schema.
  const inputTokensBound =
    Buffer.byteLength(
      JSON.stringify([{ role: 'system', content: request.system }, ...request.messages]),
      'utf8',
    ) +
    (request.schema ? Buffer.byteLength(JSON.stringify(request.schema), 'utf8') : 0) +
    2_000;
  return Math.ceil(
    inputTokensBound * rates.inputUsdPerMillion + replyTokens * rates.outputUsdPerMillion,
  );
}

/** Canned loopback-demo replies, labelled as simulated, one per stage. */
export function simulateReply(stage: ConversationReplyStage, description: string): string {
  if (stage === 'clarify')
    return 'Simulated reply, no AI involved: who will use this first, and what do they do today?';
  if (stage === 'brief')
    return [
      'Simulated brief, no AI involved:',
      briefOpenMarker,
      description.slice(0, 200),
      '- Users: to confirm',
      '- Problem: to confirm',
      '- First release: to confirm',
      briefCloseMarker,
      'Is this right?',
    ].join('\n');
  return 'Simulated reply, no AI involved: a person at PUNI reads every request and replies by email. Which email should they use? You can also press "Request a proposal" below.';
}
