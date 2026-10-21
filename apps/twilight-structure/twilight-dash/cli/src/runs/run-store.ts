import type {
  Admission,
  Attempt,
  Epoch,
  Manifest,
  ManifestDigest,
  OwnerId,
  Ownership,
  Revision,
  Run,
  RunId,
  RunSnapshot,
} from './records';

export type StoreRefusal =
  | 'owner_busy'
  | 'owner_stale'
  | 'revision_conflict'
  | 'identity_conflict'
  | 'capacity_full'
  | 'retry_exhausted'
  | 'attempt_active';
export type StoreReply<T> =
  | { readonly kind: 'applied'; readonly value: T }
  | { readonly kind: 'duplicate'; readonly value: T }
  | { readonly kind: 'refused'; readonly reason: StoreRefusal };
export interface RunGuard {
  readonly ownership: Ownership;
  readonly runId: RunId;
  readonly expectedRevision: Revision;
}
/** Async semantic persistence boundary; conflicts refuse, missing/corrupt trusted state throws. */
export interface RunStore {
  /** Allocates the next epoch only after the persisted lease expires. */
  acquireOwnership(ownerId: OwnerId, expectedEpoch: Epoch): Promise<StoreReply<Ownership>>;
  /** Refreshes exact current authority using the store clock, never a supplied expiry. */
  renewOwnership(ownership: Ownership): Promise<StoreReply<Ownership>>;
  /** Retains canonical manifest content; referenced byte verification arrives with ArtifactStore. */
  retainManifest(ownership: Ownership, manifest: Manifest): Promise<StoreReply<Manifest>>;
  readManifest(digest: ManifestDigest): Promise<Manifest>;
  /** Freezes initial run identity and retry budget against a retained manifest. */
  createRun(ownership: Ownership, run: Run): Promise<StoreReply<Run>>;
  /** Reads one consistent run plus global reservation count without acquiring ownership. */
  readRun(runId: RunId): Promise<RunSnapshot>;
  /** Atomically records queued intent and reserves capacity. Queued predecessors remain active; safe retries require later execution evidence. */
  admitAttempt(guard: RunGuard, admission: Admission): Promise<StoreReply<Attempt>>;
}
