import { assertMigrationCapture, migrationIdentityOf } from './migration-capture';
import { isReleasePhase, type ReleaseRequest, type ReleaseState } from './release';

/** Complete pre-controller progress carried verbatim by independent codecs; current controller authority is validated only by the active owner. */
export type JournalProgress = Omit<ReleaseState, 'controllers'>;

/** Validated common request/state/history, without asserting controller or replay authority. */
export interface JournalState {
  request: ReleaseRequest;
  state: JournalProgress;
  history: readonly { phase: string; at: string }[];
}

export function isJournalObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validate common shape and migration-capture identity after schema selection. Owning codecs validate their own controller/family and replay evidence in order. */
export function parseJournalState(path: string, parsed: Record<string, unknown>): JournalState {
  const state = parsed['state'];
  const request = parsed['request'];
  const history = parsed['history'];
  if (!isJournalObject(state) || !isJournalObject(request) || !Array.isArray(history)) {
    throw new Error(`release journal ${path} is missing its request, state or history`);
  }
  // Proof: `rejects an unknown phase` resumed from `half-migrated` as a forward phase until
  // this check refused it.
  if (!isReleasePhase(state['phase'])) {
    throw new Error(`release journal ${path} records unknown phase ${String(state['phase'])}`);
  }
  if (typeof state['releaseId'] !== 'string' || state['releaseId'] === '') {
    throw new Error(`release journal ${path} names no release`);
  }
  if (typeof state['transactionId'] !== 'string' || state['transactionId'] === '') {
    throw new Error(`release journal ${path} names no transaction`);
  }
  if (state['capture'] !== null && state['capture'] !== undefined) {
    const source = request['release'];
    const cluster = request['cluster'];
    const namespaces = request['namespaces'];
    if (
      !isJournalObject(source) ||
      !isJournalObject(source['images']) ||
      !isJournalObject(cluster) ||
      !isJournalObject(namespaces) ||
      typeof source['images']['backend'] !== 'string' ||
      typeof cluster['uid'] !== 'string' ||
      typeof namespaces['backend'] !== 'string'
    ) {
      throw new Error(`release journal ${path} has no capture request identity`);
    }
    // Boundary: the discriminated request fields above supply only the identity projection.
    // Proof: bypassing this disk parser check made `rejects a changed capture from disk before
    // returning a journal record` read altered bytes as a valid durable transaction.
    assertMigrationCapture(
      state['capture'],
      migrationIdentityOf(request as unknown as ReleaseRequest, state['transactionId']),
    );
  }
  // Boundary: the record was produced by `JSON.stringify` of these same types in `write`, and
  // the discriminating fields above were checked; the rest is carried verbatim.
  const record = parsed as unknown as JournalState;
  return record;
}
