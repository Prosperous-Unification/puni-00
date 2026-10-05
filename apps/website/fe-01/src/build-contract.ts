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
export type ConversationProvider = 'openrouter' | 'demo' | 'disabled';
export type ConversationExhaustedReason =
  'turns' | 'conversation_spend' | 'source_spend' | 'site_spend' | 'unsettled';

export interface ConversationOperation {
  state: 'not-started' | 'inflight' | 'completed' | 'unknown';
  idempotencyKey: string;
  truncated: boolean;
}

/** The `GET /conversation` body: the anonymous conversation bound to this browser's draft. */
export interface Conversation {
  stage: ConversationStage;
  turns: { role: 'user' | 'assistant'; content: string }[];
  visitorTurnsRemaining: number;
  provider: ConversationProvider;
  brief: string;
  description: string;
  csrfToken: string;
  initialOperation: ConversationOperation | null;
  latestOperation: (ConversationOperation & { message: string }) | null;
  exhaustedReason: ConversationExhaustedReason | null;
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
const providers: readonly ConversationProvider[] = ['openrouter', 'demo', 'disabled'];
const exhaustedReasons: readonly ConversationExhaustedReason[] = [
  'turns',
  'conversation_spend',
  'source_spend',
  'site_spend',
  'unsettled',
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
  return {
    stage,
    turns,
    visitorTurnsRemaining: Number(value.visitorTurnsRemaining),
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
  | { kind: 'disabled'; conversation: Conversation };

/**
 * Maps the entry status and the `GET /conversation` body to the anonymous harness state.
 * `entry` is null while it loads; an unavailable entry redirects to Home with its reason.
 * @throws InvalidConversation when the body breaks the contract.
 * @throws Error for a live provider: the claim-bound stream does not exist yet, so the API
 * reports only `disabled` and any other value is a contract break.
 */
export function resolveAnonymousHarness(
  siteOrigin: string,
  entry: EntryStatus | null,
  conversation: unknown,
): AnonymousHarness {
  if (entry === null) return { kind: 'loading' };
  if (!entry.available) return { kind: 'redirect', url: buildReturnUrl(siteOrigin, entry.reason) };
  const parsed = parseConversation(conversation);
  if (parsed.provider !== 'disabled')
    throw new Error(`Anonymous ${parsed.provider} conversation is not available in this release`);
  return { kind: 'disabled', conversation: parsed };
}

/** Where Start over lands: the site's Home prompt, empty once the draft cookie is expired. */
export function startOverUrl(siteOrigin: string): string {
  const home = new URL(siteOrigin);
  home.pathname = '/';
  home.search = '';
  home.hash = '#request';
  return home.toString();
}
