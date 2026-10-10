export type EntryStatus =
  { available: true; reason: null } | { available: false; reason: 'missing' | 'expired' };

export interface ChatMessageInput {
  role: string;
  parts: readonly { type: string; text?: string }[];
}

export interface PendingOperation {
  requestId: string;
  message: string;
  idempotencyKey: string;
  initial: boolean;
  turnCount: number;
  createdAt: number;
}

export function parsePendingOperation(
  raw: string | null,
  requestId: string,
  now: number,
): PendingOperation | null {
  if (raw === null) return null;
  const parsed: unknown = JSON.parse(raw);
  // Proof: deleting this shape rejection let an incomplete stored record pass; the malformed-state test failed.
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    !('requestId' in parsed) ||
    typeof parsed.requestId !== 'string' ||
    !('message' in parsed) ||
    typeof parsed.message !== 'string' ||
    parsed.message.length > 4000 ||
    !('idempotencyKey' in parsed) ||
    typeof parsed.idempotencyKey !== 'string' ||
    parsed.idempotencyKey.length < 1 ||
    parsed.idempotencyKey.length > 128 ||
    !('initial' in parsed) ||
    typeof parsed.initial !== 'boolean' ||
    !('turnCount' in parsed) ||
    !Number.isSafeInteger(parsed.turnCount) ||
    Number(parsed.turnCount) < 0 ||
    !('createdAt' in parsed) ||
    !Number.isSafeInteger(parsed.createdAt)
  ) {
    throw new Error('Stored pending chat operation is malformed');
  }
  if (parsed.requestId !== requestId || now - Number(parsed.createdAt) > 24 * 60 * 60 * 1000)
    return null;
  // The boundary checks above make these numeric conversions exact safe integers.
  return {
    requestId: parsed.requestId,
    message: parsed.message,
    idempotencyKey: parsed.idempotencyKey,
    initial: parsed.initial,
    turnCount: Number(parsed.turnCount),
    createdAt: Number(parsed.createdAt),
  };
}

export function savedOperationCompleted(
  pending: PendingOperation,
  turns: readonly { role: 'user' | 'assistant'; content: string }[],
): boolean {
  if (turns.length < pending.turnCount + 2) return false;
  const user = turns.at(-2);
  const assistant = turns.at(-1);
  return (
    user?.role === 'user' && user.content === pending.message && assistant?.role === 'assistant'
  );
}

/** A retry may regenerate only the pending user turn added after the saved server history. */
export function shouldRegeneratePending(
  messages: readonly ChatMessageInput[],
  pending: PendingOperation,
): boolean {
  const latestUserIndex = messages.findLastIndex((message) => message.role === 'user');
  // Proof: ignoring the saved-turn boundary regenerated an earlier identical question; the retry test failed.
  if (latestUserIndex < pending.turnCount) return false;
  return (
    chatRequestBody(messages, pending.idempotencyKey, pending.initial).message ===
    (pending.initial ? '' : pending.message)
  );
}

/** Records the actual chat turn boundary, including a completed initial turn after mount. */
export function countPriorTurns(
  messages: readonly ChatMessageInput[],
  initial: boolean,
  savedTurnCount: number,
): number {
  if (initial) return savedTurnCount;
  const latestUserIndex = messages.findLastIndex((message) => message.role === 'user');
  if (latestUserIndex < 0) throw new Error('Chat requires the latest user message');
  // Proof: returning the mount-time saved count (0) missed a completed first reply; the turn-count test failed.
  return latestUserIndex;
}

export function parseEntry(response: unknown): EntryStatus {
  if (typeof response !== 'object' || response === null || Array.isArray(response)) {
    throw new Error('Invalid entry response');
  }
  if (!('available' in response) || !('reason' in response)) {
    throw new Error('Invalid entry response');
  }
  const available = response.available;
  const reason = response.reason;
  if (available === true && reason === null) return { available: true, reason: null };
  // Proof: accepting every unavailable reason as missing failed the contradictory/expired entry tests.
  if (available === false && reason === 'missing') return { available: false, reason: 'missing' };
  if (available === false && reason === 'expired') return { available: false, reason: 'expired' };
  throw new Error('Invalid entry response');
}

export function buildReturnUrl(origin: string, reason: 'missing' | 'expired'): string {
  const home = new URL(origin);
  if (!['http:', 'https:'].includes(home.protocol) || home.username || home.password) {
    throw new Error('Invalid configured site origin');
  }
  home.pathname = '/';
  home.search = `?entry=${reason}`;
  home.hash = '#request';
  return home.toString();
}

export function chatRequestBody(
  messages: readonly ChatMessageInput[],
  idempotencyKey: string,
  initial = false,
): { message: string; idempotencyKey: string; initial?: true } {
  if (!idempotencyKey) throw new Error('Chat operation identity is missing');
  if (initial) return { message: '', idempotencyKey, initial: true };
  const latest = messages.findLast((candidate) => candidate.role === 'user');
  if (latest === undefined || latest.parts.length === 0) {
    throw new Error('Chat requires the latest user message');
  }
  if (latest.parts.some((part) => part.type !== 'text' || typeof part.text !== 'string')) {
    throw new Error('Chat is text-only');
  }
  const message = latest.parts
    .map((part) => part.text)
    .join('\n')
    .trim();
  if (!message) throw new Error('Chat message is empty');
  return { message, idempotencyKey };
}

export type ConversationStage = 'clarify' | 'brief' | 'contact' | 'exhausted' | 'handed_off';
/** `paused`: paid inference is paused until an operator resumes it; the manual path stays open. */
export type ConversationProvider = 'openrouter' | 'demo' | 'disabled' | 'paused';
export type ConversationExhaustedReason =
  'turns' | 'conversation_spend' | 'source_spend' | 'site_spend';

export interface ConversationOperation {
  state: 'not-started' | 'inflight' | 'completed' | 'unknown';
  idempotencyKey: string;
  truncated: boolean;
}

/** The signed browser check `GET /conversation` offers before the first paid reply. */
export interface BrowserChallenge {
  salt: string;
  challenge: string;
  signature: string;
  maxnumber: number;
  /** Epoch milliseconds after which the API refuses the solution. */
  expiresAt: number;
}

/** The `GET /conversation` body: the anonymous conversation bound to this browser's draft. */
export interface Conversation {
  stage: ConversationStage;
  turns: { role: 'user' | 'assistant'; content: string }[];
  visitorTurnsRemaining: number;
  /** Server-owned visitor turns per conversation, the Home request included. */
  visitorTurnLimit: number;
  provider: ConversationProvider;
  brief: string;
  description: string;
  csrfToken: string;
  initialOperation: ConversationOperation | null;
  latestOperation: (ConversationOperation & { message: string }) | null;
  exhaustedReason: ConversationExhaustedReason | null;
  challenge: BrowserChallenge | null;
}

/** The `GET /conversation` body did not match the API contract. */
export class InvalidConversation extends Error {
  constructor(field: string) {
    super(`Invalid conversation response: ${field}`);
  }
}

const stages: readonly ConversationStage[] = [
  'clarify',
  'brief',
  'contact',
  'exhausted',
  'handed_off',
];
const providers: readonly ConversationProvider[] = ['openrouter', 'demo', 'disabled', 'paused'];
const exhaustedReasons: readonly ConversationExhaustedReason[] = [
  'turns',
  'conversation_spend',
  'source_spend',
  'site_spend',
];
const operationStates: readonly ConversationOperation['state'][] = [
  'not-started',
  'inflight',
  'completed',
  'unknown',
];

function pickOne<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined) throw new InvalidConversation(field);
  return match;
}

function parseChallenge(value: unknown): BrowserChallenge | null {
  if (value === null) return null;
  if (
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !('salt' in value) ||
    typeof value.salt !== 'string' ||
    !('challenge' in value) ||
    typeof value.challenge !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.challenge) ||
    !('signature' in value) ||
    typeof value.signature !== 'string' ||
    !('maxnumber' in value) ||
    !Number.isSafeInteger(value.maxnumber) ||
    Number(value.maxnumber) < 0 ||
    !('expiresAt' in value) ||
    typeof value.expiresAt !== 'string' ||
    Number.isNaN(Date.parse(value.expiresAt))
  )
    throw new InvalidConversation('challenge');
  return {
    salt: value.salt,
    challenge: value.challenge,
    signature: value.signature,
    maxnumber: Number(value.maxnumber),
    expiresAt: Date.parse(value.expiresAt),
  };
}

function parseOperation(value: unknown, field: string): ConversationOperation | null {
  if (value === null) return null;
  if (
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !('state' in value) ||
    !('idempotencyKey' in value) ||
    typeof value.idempotencyKey !== 'string' ||
    !value.idempotencyKey ||
    !('truncated' in value) ||
    typeof value.truncated !== 'boolean'
  )
    throw new InvalidConversation(field);
  return {
    state: pickOne(value.state, operationStates, field),
    idempotencyKey: value.idempotencyKey,
    truncated: value.truncated,
  };
}

/**
 * Validates the `GET /conversation` body at the API boundary.
 * @throws InvalidConversation when any field is absent or outside the contract, including an
 * `exhausted` stage without its reason.
 */
export function parseConversation(value: unknown): Conversation {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new InvalidConversation('body');
  if (!('provider' in value)) throw new InvalidConversation('provider');
  // Proof: defaulting an absent provider to 'disabled' made the build-page.test.ts
  // missing-provider and malformed-harness cases stop throwing.
  const provider = pickOne(value.provider, providers, 'provider');
  const stage = pickOne('stage' in value ? value.stage : undefined, stages, 'stage');
  if (
    !('visitorTurnsRemaining' in value) ||
    !Number.isSafeInteger(value.visitorTurnsRemaining) ||
    Number(value.visitorTurnsRemaining) < 0
  )
    throw new InvalidConversation('visitorTurnsRemaining');
  // Proof: defaulting an absent visitorTurnLimit to 8 made build-contract.test.ts "a conversation
  // without visitorTurnLimit is malformed" stop throwing.
  if (
    !('visitorTurnLimit' in value) ||
    !Number.isSafeInteger(value.visitorTurnLimit) ||
    Number(value.visitorTurnLimit) < 1 ||
    Number(value.visitorTurnsRemaining) > Number(value.visitorTurnLimit)
  )
    throw new InvalidConversation('visitorTurnLimit');
  if (!('turns' in value) || !Array.isArray(value.turns)) throw new InvalidConversation('turns');
  const turns = value.turns.map((turn: unknown) => {
    if (
      typeof turn !== 'object' ||
      turn === null ||
      !('role' in turn) ||
      (turn.role !== 'user' && turn.role !== 'assistant') ||
      !('content' in turn) ||
      typeof turn.content !== 'string'
    )
      throw new InvalidConversation('turns');
    const role: 'user' | 'assistant' = turn.role === 'user' ? 'user' : 'assistant';
    return { role, content: turn.content };
  });
  const brief = 'brief' in value && typeof value.brief === 'string' ? value.brief : null;
  if (brief === null) throw new InvalidConversation('brief');
  const description =
    'description' in value && typeof value.description === 'string' ? value.description : null;
  if (description === null) throw new InvalidConversation('description');
  const csrfToken =
    'csrfToken' in value && typeof value.csrfToken === 'string' ? value.csrfToken : '';
  if (!csrfToken) throw new InvalidConversation('csrfToken');
  const exhaustedReason =
    'exhaustedReason' in value && value.exhaustedReason !== null
      ? pickOne(value.exhaustedReason, exhaustedReasons, 'exhaustedReason')
      : null;
  if ((stage === 'exhausted') !== (exhaustedReason !== null))
    throw new InvalidConversation('exhaustedReason');
  const initialOperation = parseOperation(
    'initialOperation' in value ? value.initialOperation : undefined,
    'initialOperation',
  );
  const latestRaw = 'latestOperation' in value ? value.latestOperation : undefined;
  const latest = parseOperation(latestRaw, 'latestOperation');
  let latestOperation: Conversation['latestOperation'] = null;
  if (latest !== null) {
    const message =
      typeof latestRaw === 'object' && latestRaw !== null && 'message' in latestRaw
        ? latestRaw.message
        : undefined;
    if (typeof message !== 'string') throw new InvalidConversation('latestOperation');
    latestOperation = { ...latest, message };
  }
  // Proof: defaulting an absent challenge to null made the missing-challenge contract case pass.
  if (!('challenge' in value)) throw new InvalidConversation('challenge');
  const challenge = parseChallenge(value.challenge);
  return {
    challenge,
    stage,
    turns,
    visitorTurnsRemaining: Number(value.visitorTurnsRemaining),
    visitorTurnLimit: Number(value.visitorTurnLimit),
    provider,
    brief,
    description,
    csrfToken,
    initialOperation,
    latestOperation,
    exhaustedReason,
  };
}

/** What Build renders for a visitor without an account session. */
export type AnonymousHarness =
  | { kind: 'loading' }
  | { kind: 'redirect'; url: string }
  | { kind: 'disabled'; conversation: Conversation }
  | { kind: 'paused'; conversation: Conversation }
  | { kind: 'live'; conversation: Conversation };

/**
 * Maps the entry status and the `GET /conversation` body to the anonymous harness state.
 * `entry` is null while it loads; an unavailable entry redirects to Home with its reason.
 * `openrouter` and `demo` are the live harness; `disabled` and `paused` have no composer.
 * @throws InvalidConversation when the body breaks the contract.
 */
export function resolveAnonymousHarness(
  siteOrigin: string,
  entry: EntryStatus | null,
  conversation: unknown,
): AnonymousHarness {
  if (entry === null) return { kind: 'loading' };
  if (!entry.available) return { kind: 'redirect', url: buildReturnUrl(siteOrigin, entry.reason) };
  const parsed = parseConversation(conversation);
  if (parsed.provider === 'disabled') return { kind: 'disabled', conversation: parsed };
  if (parsed.provider === 'paused') return { kind: 'paused', conversation: parsed };
  return { kind: 'live', conversation: parsed };
}

/** One operation the visitor can send again under the same identity. */
export interface ConversationAttempt {
  idempotencyKey: string;
  message: string;
  initial: boolean;
}

/** What the live composer offers; see {@link selectComposerMode}. */
export type ComposerMode =
  | { kind: 'initial'; attempt: ConversationAttempt }
  | { kind: 'open' }
  | { kind: 'answering' }
  | { kind: 'closed'; reason: ConversationExhaustedReason };

/**
 * What the live composer offers for a saved conversation: the read-only Home request with Send
 * until the initial operation completes, an open composer, a wait while another tab's reply is
 * still running, or a closed line naming why the conversation ended.
 * @throws Error for a `handed_off` stage, which a live claim cannot reach.
 * @throws InvalidConversation when a live conversation has no initial operation identity.
 */
export function selectComposerMode(conversation: Conversation): ComposerMode {
  if (conversation.stage === 'handed_off')
    throw new Error('A handed-off conversation still has a live claim');
  if (conversation.stage === 'exhausted') {
    if (conversation.exhaustedReason === null) throw new InvalidConversation('exhaustedReason');
    return { kind: 'closed', reason: conversation.exhaustedReason };
  }
  if (conversation.latestOperation?.state === 'inflight') return { kind: 'answering' };
  const initial = conversation.initialOperation;
  if (initial === null) throw new InvalidConversation('initialOperation');
  // Proof: opening the ordinary composer before the initial operation completed failed two
  // build-page.test.ts live-harness cases and conversation.mjs ("not shown read-only before Send").
  if (initial.state !== 'completed')
    return {
      kind: 'initial',
      attempt: {
        idempotencyKey: initial.idempotencyKey,
        message: conversation.description,
        initial: true,
      },
    };
  if (conversation.visitorTurnsRemaining === 0) return { kind: 'closed', reason: 'turns' };
  return { kind: 'open' };
}

/**
 * The visitor message of the latest attempt whose reply was stopped or failed before its usage
 * was confirmed. It is not a saved turn, so the thread shows it with Retry under its identity.
 */
export function selectStoppedAttempt(conversation: Conversation): ConversationAttempt | null {
  const latest = conversation.latestOperation;
  if (latest?.state !== 'unknown') return null;
  return {
    idempotencyKey: latest.idempotencyKey,
    message: latest.message,
    initial: latest.idempotencyKey === conversation.initialOperation?.idempotencyKey,
  };
}

/**
 * Whether the thread shows the inline proposal card: once the server reaches `contact`, when
 * the conversation is exhausted, or as soon as a brief exists. Never during clarification
 * without a brief, so the card does not interrupt the first questions.
 */
export function offersProposal(conversation: Conversation): boolean {
  // Proof: returning true unconditionally failed the two no-brief rows of the build-page.test.ts card table.
  return (
    conversation.stage === 'contact' ||
    conversation.stage === 'exhausted' ||
    conversation.brief.trim() !== ''
  );
}

/** The one line that replaces the composer when a conversation is exhausted. */
export function describeExhaustion(reason: ConversationExhaustedReason): string {
  const copy: Record<ConversationExhaustedReason, string> = {
    turns: 'This conversation reached its limit. Send your brief to a person.',
    conversation_spend: 'This conversation used its AI allowance. Send your brief to a person.',
    source_spend: 'AI chat reached today’s limit for your connection. Send your brief to a person.',
    site_spend: 'AI chat reached today’s limit. Send your brief to a person.',
  };
  return copy[reason];
}

/** Where Start over lands: the site's Home prompt, empty once the draft cookie is expired. */
export function startOverUrl(siteOrigin: string): string {
  const home = new URL(siteOrigin);
  home.pathname = '/';
  home.search = '';
  home.hash = '#request';
  return home.toString();
}

/** A refusal code the API answers with 429 and `Retry-After` when a window or daily cap is full. */
export type LimitCode =
  | 'rate_limited'
  | 'draft_source_limit'
  | 'draft_site_limit'
  | 'proposal_source_limit'
  | 'proposal_email_limit'
  | 'proposal_site_limit';

const limitCodes: readonly LimitCode[] = [
  'rate_limited',
  'draft_source_limit',
  'draft_site_limit',
  'proposal_source_limit',
  'proposal_email_limit',
  'proposal_site_limit',
];

export function isLimitCode(code: string): code is LimitCode {
  return limitCodes.some((candidate) => candidate === code);
}

/**
 * The visitor-facing line for a window or daily-cap refusal. A minute window names its wait when
 * the API sent `Retry-After`; a daily cap lasts until UTC midnight, so it says tomorrow.
 */
export function describeLimit(code: LimitCode, retryAfterSeconds: number | null): string {
  if (code === 'rate_limited')
    return retryAfterSeconds === null
      ? 'Too many requests right now. Try again in a minute.'
      : `Too many requests right now. Try again in ${String(retryAfterSeconds)} s.`;
  const copy: Record<Exclude<LimitCode, 'rate_limited'>, string> = {
    draft_source_limit: 'Your connection started many requests today. Try again tomorrow.',
    draft_site_limit: 'PUNI received many requests today. Try again tomorrow.',
    proposal_source_limit: 'Your connection sent several briefs today. Try again tomorrow.',
    proposal_email_limit: 'This email address sent several briefs today. Try again tomorrow.',
    proposal_site_limit:
      'PUNI received many briefs today and cannot take more until tomorrow. Try again then.',
  };
  return copy[code];
}
