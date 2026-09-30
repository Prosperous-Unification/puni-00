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
