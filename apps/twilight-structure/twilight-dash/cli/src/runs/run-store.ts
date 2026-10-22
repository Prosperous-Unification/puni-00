import type {
  Admission,
  Attempt,
  AttemptId,
  CommandReceipt,
  Completion,
  Decision,
  DecisionId,
  Epoch,
  ExecutionCommand,
  Manifest,
  ManifestDigest,
  OwnerId,
  Ownership,
  Revision,
  Run,
  RunId,
  RunSnapshot,
} from './records';
import type {
  RuntimeAcceptance,
  RuntimeAcceptanceInput,
  RuntimeGuard,
  RuntimeIntent,
  RuntimePin,
  RuntimeScope,
  RuntimeScopeSnapshot,
} from './runtime-records';

export type StoreRefusal =
  | 'owner_busy'
  | 'owner_stale'
  | 'revision_conflict'
  | 'identity_conflict'
  | 'capacity_full'
  | 'retry_exhausted'
  | 'attempt_active'
  | 'state_conflict'
  | 'authority_conflict'
  | 'decision_conflict';
export type StoreReply<T> =
  | { readonly kind: 'applied'; readonly value: T }
  | { readonly kind: 'duplicate'; readonly value: T }
  | { readonly kind: 'refused'; readonly reason: StoreRefusal };
export interface RunGuard {
  readonly ownership: Ownership;
  readonly runId: RunId;
  readonly expectedRevision: Revision;
}
export interface AttemptGuard extends RunGuard {
  readonly attemptId: AttemptId;
  readonly expectedAttemptRevision: Revision;
}
/** Async semantic persistence boundary; conflicts refuse, missing/corrupt trusted state throws. */
export interface RunStore {
  /** Pins one complete receiver scope insert-or-identical under current live local ownership. */
  pinRuntimeScope(ownership: Ownership, pin: RuntimePin): Promise<StoreReply<RuntimePin>>;
  /** Ownership-free local integrity inspection. Caller must verify all independent receipt artifacts before trusting acceptance content. */
  readRuntimeScope(scope: RuntimeScope): Promise<RuntimeScopeSnapshot>;
  /** Retains authority-acquisition bytes before future dispatch; conveys no permission to dispatch. */
  stageRuntimeRequest(
    guard: RuntimeGuard,
    canonicalRequest: string,
  ): Promise<StoreReply<RuntimeIntent>>;
  /** Trusted persistence: caller already verified exact complete receipt artifact bytes and correspondence. No authentication or current receiver authority is inferred. */
  recordRuntimeAcceptance(
    guard: RuntimeGuard,
    input: RuntimeAcceptanceInput,
  ): Promise<StoreReply<RuntimeAcceptance>>;
  /** Allocates the next epoch only after the persisted lease expires. */
  acquireOwnership(ownerId: OwnerId, expectedEpoch: Epoch): Promise<StoreReply<Ownership>>;
  /** Refreshes exact current authority using the store clock, never a supplied expiry. */
  renewOwnership(ownership: Ownership): Promise<StoreReply<Ownership>>;
  /** Retains immutable insert-or-identical content. Caller must verify every referenced artifact in this exact manifest first; hash/identity corruption throws. */
  retainManifest(ownership: Ownership, manifest: Manifest): Promise<StoreReply<Manifest>>;
  /** Reads and validates retained content; an absent manifest or invalid identity/hash throws. */
  readManifest(digest: ManifestDigest): Promise<Manifest>;
  /** Freezes initial run identity and retry budget against a retained manifest. */
  createRun(ownership: Ownership, run: Run): Promise<StoreReply<Run>>;
  /** Reads one consistent run, complete attempt provenance, inbox/outbox and global reservation count without ownership; missing or inconsistent trusted records throw. */
  readRun(runId: RunId): Promise<RunSnapshot>;
  /** Atomically admits an occurrence, reserving capacity; retries require determinate interrupted or failed terminal evidence. */
  admitAttempt(guard: RunGuard, admission: Admission): Promise<StoreReply<Attempt>>;
  /** Trusted persistence: caller has verified every artifact in this exact fact. Facts do not establish the truth of executor quiescence. */
  recordExecution(guard: AttemptGuard, command: ExecutionCommand): Promise<StoreReply<Attempt>>;
  /** Trusted persistence: caller has verified every artifact in this exact completion. Atomically records outcome, pending command and settled capacity release. */
  commitOutcome(guard: AttemptGuard, completion: Completion): Promise<StoreReply<Attempt>>;
  /** Retains a global decision identity insert-or-identical, including after consumption. Caller verified the complete authorization artifact before persistence. */
  receiveDecision(ownership: Ownership, decision: Decision): Promise<StoreReply<Decision>>;
  /** Atomically retains the original continuation reply, consumes one wait and reacquires capacity; capacity refusal leaves the decision unconsumed. */
  consumeDecision(guard: AttemptGuard, decisionId: DecisionId): Promise<StoreReply<Attempt>>;
  /** Trusted receipt: caller verified evidence bytes; exact matching does not authenticate WBS acceptance. */
  reconcileReceipt(guard: AttemptGuard, receipt: CommandReceipt): Promise<StoreReply<Attempt>>;
}
