import { migrationIdentityOf, sha256Of } from './migration-capture';
import { FORWARD_PHASES, type ReleaseRequest, type ReleaseState, ROLLBACK_PHASES } from './release';
import type { ReplayCapabilities } from './replay-capability';

export interface ReplayCount {
  kind: string;
  count: number;
}

/** Immutable admission evidence, pinned to a fenced transaction and both backend digests. */
export interface ReplayReceipt {
  target: string;
  attempt: string;
  direction: 'forward' | 'rollback';
  inventory: readonly ReplayCount[];
  candidate: ReplayCapabilities;
  previous: ReplayCapabilities;
  bytes: string;
  sha256: string;
}

function requireRecord(value: unknown): Record<string, unknown> {
  // Proof: bypassing object refusal loses the replay diagnostic for missing resume receipts.
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('replay receipt is missing or malformed');
  // Boundary: non-null object and array exclusion establish indexable unknown fields.
  return value as Record<string, unknown>;
}

/** Validate external inventory once; zero counts are omitted by the independent traversal. */
export function assertReplayInventory(value: unknown): asserts value is readonly ReplayCount[] {
  // Proof: array-shape omission admits null/object transport in `refuses invalid inventory transport`.
  if (!Array.isArray(value)) throw new Error('replay inventory is malformed');
  const kinds = new Set<string>();
  for (const raw of value) {
    const row = requireRecord(raw);
    // Proof: count/kind/uniqueness omissions admit zero, fractional, unknown or repeated inventory transport.
    if (
      (row['kind'] !== 'replace_blockage' && row['kind'] !== 'move_progress_v1') ||
      typeof row['count'] !== 'number' ||
      !Number.isSafeInteger(row['count']) ||
      row['count'] <= 0 ||
      kinds.has(row['kind'])
    )
      throw new Error('replay inventory has unknown, duplicate or malformed counts');
    kinds.add(row['kind']);
  }
}

function assertCapabilities(value: unknown, image: string): asserts value is ReplayCapabilities {
  const observation = requireRecord(value);
  const kinds = observation['capabilities'];
  // Proof: image/shape omissions admit foreign digest, null, numeric, empty or repeated capability output.
  if (
    observation['image'] !== image ||
    !/^[^\s@]+@sha256:[0-9a-f]{64}$/.test(image) ||
    !Array.isArray(kinds) ||
    kinds.some((kind: unknown) => typeof kind !== 'string' || kind === '') ||
    new Set(kinds).size !== kinds.length
  )
    throw new Error('replay capability receipt is malformed or belongs to another image');
}

function assertSupported(inventory: readonly ReplayCount[], observation: ReplayCapabilities): void {
  for (const row of inventory) {
    // Proof: skipping support comparison promotes unsupported nested inverse/precondition history.
    if (!observation.capabilities.includes(row.kind))
      throw new Error(
        `replay ${row.kind} (${String(row.count)}) unsupported by ${observation.image}`,
      );
  }
}

/** Seal only successful admission; failures propagate into the coordinator's guarded abort. */
export function sealReplayReceipt(
  request: ReleaseRequest,
  attempt: string,
  direction: ReplayReceipt['direction'],
  inventory: readonly ReplayCount[],
  candidate: ReplayCapabilities,
  previous: ReplayCapabilities,
): ReplayReceipt {
  assertReplayInventory(inventory);
  assertCapabilities(candidate, request.release.images.backend);
  assertCapabilities(previous, request.expectedCurrent.images.backend);
  assertSupported(inventory, previous);
  if (direction === 'forward') assertSupported(inventory, candidate);
  const payload = {
    target: migrationIdentityOf(request, attempt).target,
    attempt,
    direction,
    inventory,
    candidate,
    previous,
  };
  const bytes = JSON.stringify(payload);
  return { ...payload, bytes, sha256: sha256Of(bytes) };
}

/** Refuse missing, altered or foreign durable receipts before cluster mutation or reopening. */
export function assertReplayReceipt(
  raw: unknown,
  request: ReleaseRequest,
  attempt: string,
  direction: ReplayReceipt['direction'],
): asserts raw is ReplayReceipt {
  const envelope = requireRecord(raw);
  // Proof: digest omission admits changed/malformed replay progress on resume.
  if (
    typeof envelope['bytes'] !== 'string' ||
    typeof envelope['sha256'] !== 'string' ||
    sha256Of(envelope['bytes']) !== envelope['sha256']
  )
    throw new Error('replay receipt differs from its original SHA-256');
  let parsed: unknown;
  // Proof: resealed invalid JSON refuses before resume effects in the corrupted-byte fixture.
  try {
    parsed = JSON.parse(envelope['bytes']);
  } catch (cause) {
    throw new Error('replay receipt bytes are malformed', { cause });
  }
  const payload = requireRecord(parsed);
  // Proof: target/attempt/direction omissions admit resealed foreign receipt identities on resume.
  if (
    payload['target'] !== migrationIdentityOf(request, attempt).target ||
    payload['attempt'] !== attempt ||
    payload['direction'] !== direction
  )
    throw new Error('replay receipt belongs to another target, attempt or direction');
  assertReplayInventory(payload['inventory']);
  assertCapabilities(payload['candidate'], request.release.images.backend);
  assertCapabilities(payload['previous'], request.expectedCurrent.images.backend);
  assertSupported(payload['inventory'], payload['previous']);
  if (direction === 'forward') assertSupported(payload['inventory'], payload['candidate']);
  const { bytes: _bytes, sha256: _sha256, ...projection } = envelope;
  // Proof: skipping envelope comparison admits changed inventory or foreign image projections on resume.
  if (JSON.stringify(projection) !== JSON.stringify(payload))
    throw new Error('replay receipt envelope differs from original bytes');
}

/** Journal phases prove admission happened, never imply missing evidence can be recreated. */
export function assertReplayProgress(state: ReleaseState, request: ReleaseRequest): void {
  const forward: readonly string[] = FORWARD_PHASES;
  const rollback: readonly string[] = ROLLBACK_PHASES;
  // Proof: omitting recovery-required admits null prior forward evidence at disk parse and
  // permits parked-Lease takeover after post-reopen failure in the recovery refusal fixture.
  const needsForward =
    state.phase === 'recovery-required' ||
    forward.indexOf(state.phase) >= forward.indexOf('replay-checked') ||
    (state.rollbackFrom !== null &&
      forward.indexOf(state.rollbackFrom) >= forward.indexOf('replay-checked'));
  const needsRollback =
    rollback.indexOf(state.phase) >= rollback.indexOf('rollback-replay-checked') &&
    state.rollbackFrom !== null &&
    forward.indexOf(state.rollbackFrom) >= forward.indexOf('flux-suspended');
  // Proof: dropping phase requirements admits missing forward/rollback receipts before resume mutations.
  if (needsForward || state.replayForward !== null)
    assertReplayReceipt(state.replayForward, request, state.transactionId, 'forward');
  if (needsRollback || state.replayRollback !== null)
    assertReplayReceipt(state.replayRollback, request, state.transactionId, 'rollback');
}
