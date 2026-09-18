import { createHash, randomBytes } from 'node:crypto';

/** One of the four WBS Deployments the release moves. */
export type K8sTier = 'backend' | 'gateway' | 'frontend' | 'mcp';

/** Rollout order after the backend: the tiers that only read through it. */
export const K8S_TIERS: readonly K8sTier[] = ['backend', 'gateway', 'frontend', 'mcp'];

export type Environment = 'local' | 'staging' | 'prod';

/** The exact bytes a release runs: a source commit and one digest-pinned image per tier. */
export interface ReleaseIdentity {
  sourceSha: string;
  images: Readonly<Record<K8sTier, string>>;
}

/**
 * The cluster a request was written for. `uid` is the `kube-system` namespace UID, which a
 * recreated or different cluster cannot share even under the same context name.
 */
export interface ClusterIdentity {
  context: string;
  uid: string;
}

/** The named Flux unit the transaction suspends; platform reconciliation stays active. */
export interface FluxUnit {
  namespace: string;
  kustomization: string;
  gitRepository: string;
  /** The deploy-repository commit whose manifests pin {@link ReleaseRequest.release}. */
  desiredRevision: string;
  /**
   * The deploy-repository commit whose manifests pin {@link ReleaseRequest.expectedCurrent}.
   * Rollback resumes Flux only onto a source at this revision; resuming onto
   * `desiredRevision` would re-roll the failed release over the restored one.
   */
  previousRevision: string;
}

export interface ReleaseRequest {
  environment: Environment;
  cluster: ClusterIdentity;
  namespaces: { app: string; backend: string };
  release: ReleaseIdentity;
  /** `null` is refused: a first install is the F11 cutover, not a release transaction. */
  expectedCurrent: ReleaseIdentity;
  /** P5 package and activation admission identities from the release descriptor. */
  admission: { package: string; activation: string };
  /** `null` only for `local`, where the coordinator applies the rendered overlay itself. */
  flux: FluxUnit | null;
  /** Names the `recovery-required` release this request replaces; never a normal release. */
  recovers: string | null;
}

/** Forward durable phases, in the only order a release may take them. */
export const FORWARD_PHASES = [
  'requested',
  'validated',
  'lease-acquired',
  'intent-persisted',
  'images-admitted',
  'flux-suspended',
  'writes-closed',
  'gateway-drained',
  'writer-stopped',
  'state-captured',
  'migrated',
  'backend-ready',
  'tiers-ready',
  'smoke-passed',
  'release-persisted',
  'writes-reopened',
  'desired-reconciled',
  'flux-resumed',
  'lease-released',
] as const;

export const ROLLBACK_PHASES = [
  'rollback-started',
  'rollback-writer-stopped',
  'rollback-schema-restored',
  'rollback-tiers-restored',
  'rollback-verified',
  'rollback-writes-reopened',
  'rollback-flux-resumed',
  'rolled-back',
] as const;

/** Phases that end a run: the executor stops and reports rather than planning further. */
export const TERMINAL_PHASES = [
  'lease-released',
  'rolled-back',
  'rollback-failed',
  'recovery-required',
  'flux-revert-required',
] as const;

export type ForwardPhase = (typeof FORWARD_PHASES)[number];
export type RollbackPhase = (typeof ROLLBACK_PHASES)[number];
/**
 * `flux-revert-required`: the previous release is restored, verified and serving with writes
 * open, but the WBS Flux source is not at `previousRevision`, so Flux stays suspended until an
 * operator reverts the deploy repository and resumes it.
 */
export type ReleasePhase =
  ForwardPhase | RollbackPhase | 'rollback-failed' | 'recovery-required' | 'flux-revert-required';

const ALL_PHASES: ReadonlySet<string> = new Set<string>([
  ...FORWARD_PHASES,
  ...ROLLBACK_PHASES,
  'rollback-failed',
  'recovery-required',
  'flux-revert-required',
]);

export function isReleasePhase(value: unknown): value is ReleasePhase {
  return typeof value === 'string' && ALL_PHASES.has(value);
}

/** One applied row of `__drizzle_migrations`, as the capture Job reported it. */
export interface AppliedMigration {
  name: string;
  hash: string;
}

/**
 * The schema facts rollback depends on, captured by the new backend image while no writer runs.
 * `pending` is what this release's migration Job will apply, each with the SHA-256 of the
 * `down.sql` that must reverse it.
 */
export interface MigrationCapture {
  /** Newest applied migration before this release, or `none`, as `migrate-down-cli --to=` takes. */
  baseline: string;
  applied: readonly AppliedMigration[];
  pending: readonly { name: string; downSha256: string }[];
}

/** A `VACUUM INTO` copy on the data volume that passed `PRAGMA integrity_check`. */
export interface Snapshot {
  path: string;
  sha256: string;
}

export interface ReleaseFailure {
  step: StepKind;
  message: string;
  /** Exact command an operator runs to finish a failed rollback by hand. */
  manualCommand: string | null;
}

export interface ReleaseState {
  releaseId: string;
  /**
   * One attempt at `releaseId`, named into every Job and snapshot. A resumed attempt reuses
   * its own Jobs; a later attempt at the same bytes must never read an earlier one's results.
   */
  transactionId: string;
  phase: ReleasePhase;
  /** Forward phase the release had reached when rollback began; drives what rollback undoes. */
  rollbackFrom: ForwardPhase | null;
  capture: MigrationCapture | null;
  previous: ReleaseIdentity;
  snapshot: Snapshot | null;
  fluxSuspendedByUs: boolean;
  writesReopened: boolean;
  failure: ReleaseFailure | null;
}

export type StepKind =
  | 'validate'
  | 'acquire-lease'
  | 'persist-intent'
  | 'admit-images'
  | 'suspend-flux'
  | 'close-writes'
  | 'drain-gateway'
  | 'stop-writer'
  | 'capture-state'
  | 'migrate'
  | 'rollout-backend'
  | 'rollout-tiers'
  | 'smoke'
  | 'persist-release'
  | 'reopen-writes'
  | 'reconcile-desired'
  | 'resume-flux'
  | 'release-lease'
  | 'rollback-stop-writer'
  | 'rollback-schema'
  | 'rollback-tiers'
  | 'rollback-verify'
  | 'rollback-reopen-writes'
  | 'rollback-resume-flux'
  | 'rollback-release-lease';

export interface ReleaseStep {
  kind: StepKind;
  /** The durable phase recorded once this step has completed. */
  reaches: ReleasePhase;
}

const FORWARD_STEPS: readonly ReleaseStep[] = [
  { kind: 'validate', reaches: 'validated' },
  { kind: 'acquire-lease', reaches: 'lease-acquired' },
  { kind: 'persist-intent', reaches: 'intent-persisted' },
  { kind: 'admit-images', reaches: 'images-admitted' },
  { kind: 'suspend-flux', reaches: 'flux-suspended' },
  { kind: 'close-writes', reaches: 'writes-closed' },
  { kind: 'drain-gateway', reaches: 'gateway-drained' },
  { kind: 'stop-writer', reaches: 'writer-stopped' },
  { kind: 'capture-state', reaches: 'state-captured' },
  { kind: 'migrate', reaches: 'migrated' },
  { kind: 'rollout-backend', reaches: 'backend-ready' },
  { kind: 'rollout-tiers', reaches: 'tiers-ready' },
  { kind: 'smoke', reaches: 'smoke-passed' },
  { kind: 'persist-release', reaches: 'release-persisted' },
  { kind: 'reopen-writes', reaches: 'writes-reopened' },
  { kind: 'reconcile-desired', reaches: 'desired-reconciled' },
  { kind: 'resume-flux', reaches: 'flux-resumed' },
  { kind: 'release-lease', reaches: 'lease-released' },
];

function forwardIndex(phase: ForwardPhase): number {
  return FORWARD_PHASES.indexOf(phase);
}

function isForward(phase: ReleasePhase): phase is ForwardPhase {
  return (FORWARD_PHASES as readonly string[]).includes(phase);
}

function reached(phase: ForwardPhase, milestone: ForwardPhase): boolean {
  return forwardIndex(phase) >= forwardIndex(milestone);
}

const DIGEST_REF = /^[a-z0-9][a-z0-9.\-/:]*@sha256:[0-9a-f]{64}$/;
const SHA = /^[0-9a-f]{40}$/;

/**
 * A stable name for one target identity, used as the Lease holder and every per-release object
 * name. Two requests for the same bytes share it, so a restarted coordinator recognises its own
 * Lease; any different digest or commit gets a different one.
 */
export function releaseIdOf(identity: ReleaseIdentity): string {
  const digest = createHash('sha256')
    .update(K8S_TIERS.map((tier) => `${tier}=${identity.images[tier]}`).join('\n'))
    .digest('hex');
  return `${identity.sourceSha.slice(0, 12)}-${digest.slice(0, 12)}`;
}

function assertIdentity(label: string, identity: ReleaseIdentity): void {
  // Proof: dropping this check let `refuses an abbreviated source sha` plan a release for `abc`.
  if (!SHA.test(identity.sourceSha)) {
    throw new Error(`${label}.sourceSha must be a full 40-hex commit, got ${identity.sourceSha}`);
  }
  for (const tier of K8S_TIERS) {
    const image = identity.images[tier];
    // Proof: a tag-only ref (`wbs-be-01:latest`) was accepted until `refuses a tag without a
    // digest` observed this refusal.
    if (!DIGEST_REF.test(image)) {
      throw new Error(`${label}.images.${tier} must be a digest-pinned ref, got ${image}`);
    }
  }
}

/** Static request checks; everything needing the live cluster happens in {@link assertObservedCluster}. */
export function assertRequest(request: ReleaseRequest): void {
  assertIdentity('release', request.release);
  assertIdentity('expectedCurrent', request.expectedCurrent);
  if (request.admission.package === '' || request.admission.activation === '') {
    throw new Error('admission evidence must name both the package and activation identities');
  }
  // Proof: removing this check let `refuses staging without a named Flux unit` plan a release
  // that would roll out while Flux still owned the Deployments.
  if (request.environment !== 'local' && request.flux === null) {
    throw new Error(`${request.environment} releases must name the WBS Flux unit to suspend`);
  }
  if (request.flux !== null && !SHA.test(request.flux.desiredRevision)) {
    throw new Error('flux.desiredRevision must be a full 40-hex commit');
  }
  if (request.flux !== null && !SHA.test(request.flux.previousRevision)) {
    throw new Error('flux.previousRevision must be a full 40-hex commit');
  }
}

export interface ObservedCluster {
  uid: string;
  current: ReleaseIdentity | null;
  /** The images F6's trusted-workload admission currently approves for `wbs-solver`. */
  approvedBackendImages: readonly string[];
}

/** Validates the request against what the cluster actually is and runs. */
export function assertObservedCluster(request: ReleaseRequest, observed: ObservedCluster): void {
  // Proof: `refuses a different cluster behind the same context` planned a release against
  // uid-other until this comparison existed.
  if (observed.uid !== request.cluster.uid) {
    throw new Error(
      `context ${request.cluster.context} reaches cluster ${observed.uid}, not ${request.cluster.uid}`,
    );
  }
  if (observed.current === null) {
    throw new Error('the cluster records no current WBS release; a first install is the cutover');
  }
  // Proof: `refuses when the running release differs from expectedCurrent` passed a stale
  // descriptor without this check.
  if (releaseIdOf(observed.current) !== releaseIdOf(request.expectedCurrent)) {
    throw new Error(
      `cluster runs release ${releaseIdOf(observed.current)}, the request expected ` +
        releaseIdOf(request.expectedCurrent),
    );
  }
  // Proof: `refuses admission parameters that do not approve the running backend` reached the
  // admit-images write before this check; now it refuses before any mutation.
  if (!observed.approvedBackendImages.includes(request.expectedCurrent.images.backend)) {
    throw new Error(
      `trusted-workload admission does not approve the running backend ` +
        `${request.expectedCurrent.images.backend}; these admission parameters belong to ` +
        'some other deployment',
    );
  }
}

/**
 * The `solverImages` list F6's trusted-workload admission reads for this release: the rollback
 * digest and the candidate, one entry when they are the same image.
 */
export function admittedBackendImages(request: ReleaseRequest): readonly string[] {
  const rollback = request.expectedCurrent.images.backend;
  const candidate = request.release.images.backend;
  return rollback === candidate ? [rollback] : [rollback, candidate];
}

export function initialState(request: ReleaseRequest): ReleaseState {
  return {
    releaseId: releaseIdOf(request.release),
    // Proof: with Job names keyed by release id alone, the lab's third transaction at the same
    // bytes reused the second one's completed capture and migration Jobs, promoted without
    // applying its migration, and failed `the additive column exists after promotion`.
    transactionId: `${releaseIdOf(request.release)}-${randomBytes(3).toString('hex')}`,
    phase: 'requested',
    rollbackFrom: null,
    capture: null,
    previous: request.expectedCurrent,
    snapshot: null,
    fluxSuspendedByUs: false,
    writesReopened: false,
    failure: null,
  };
}

/**
 * What a restarted coordinator does with a journal it did not finish. Before `smoke-passed` the
 * candidate is unproven, so the only safe continuation is rollback; from `smoke-passed` on the
 * remaining steps are idempotent completions of a proven release.
 */
export function settleInterrupted(state: ReleaseState): ReleaseState {
  if (!isForward(state.phase)) return state;
  if (state.phase === 'lease-released') return state;
  if (!reached(state.phase, 'intent-persisted')) return state;
  if (reached(state.phase, 'smoke-passed')) return state;
  return {
    ...state,
    phase: 'rollback-started',
    rollbackFrom: state.phase,
    failure: {
      step: FORWARD_STEPS[forwardIndex(state.phase)].kind,
      message: `coordinator restarted with the release interrupted at ${state.phase}`,
      manualCommand: null,
    },
  };
}

/**
 * Undo for a release that failed or was interrupted after `rollbackFrom`. The step after that
 * phase may have run partially, so each undo keys on the phase *before* the step it reverses.
 */
function rollbackSteps(request: ReleaseRequest, state: ReleaseState): ReleaseStep[] {
  const from = state.rollbackFrom;
  if (from === null) throw new Error(`${state.phase} has no recorded rollback origin`);
  const steps: ReleaseStep[] = [];
  const writerMoved = reached(from, 'gateway-drained');
  if (writerMoved) steps.push({ kind: 'rollback-stop-writer', reaches: 'rollback-writer-stopped' });
  // Proof: skipping this left 0002_add applied in `rolls back after a crash following migrated`
  // (and backend-ready, tiers-ready); the crash after state-captured has nothing to undo.
  // A captured set means the migration Job may have started, whatever the journal says of it.
  if (state.capture !== null) {
    steps.push({ kind: 'rollback-schema', reaches: 'rollback-schema-restored' });
  }
  if (writerMoved) {
    steps.push({ kind: 'rollback-tiers', reaches: 'rollback-tiers-restored' });
    steps.push({ kind: 'rollback-verify', reaches: 'rollback-verified' });
  }
  if (reached(from, 'flux-suspended')) {
    steps.push({ kind: 'rollback-reopen-writes', reaches: 'rollback-writes-reopened' });
  }
  if (request.flux !== null && reached(from, 'intent-persisted')) {
    steps.push({ kind: 'rollback-resume-flux', reaches: 'rollback-flux-resumed' });
  }
  steps.push({ kind: 'rollback-release-lease', reaches: 'rolled-back' });
  const done = ROLLBACK_PHASES.indexOf(state.phase as RollbackPhase);
  return steps.filter((step) => ROLLBACK_PHASES.indexOf(step.reaches as RollbackPhase) > done);
}

/**
 * The remaining steps from `state`, in order. Forward phases continue the release; rollback
 * phases continue the undo recorded by `rollbackFrom`. Terminal phases plan nothing, except
 * that `rollback-failed` refuses outright: its writes stay fenced until an operator finishes
 * the recorded manual command.
 */
export function planRelease(request: ReleaseRequest, state: ReleaseState): readonly ReleaseStep[] {
  if (!isReleasePhase(state.phase))
    throw new Error(`unknown release phase: ${String(state.phase)}`);
  if (releaseIdOf(request.release) !== state.releaseId) {
    throw new Error(
      `journal belongs to release ${state.releaseId}; this request is ${releaseIdOf(request.release)}`,
    );
  }
  if (state.phase === 'rollback-failed') {
    throw new Error(
      `release ${state.releaseId} failed its rollback; writes stay fenced. ` +
        `Finish it by hand: ${state.failure?.manualCommand ?? '(no command recorded)'}`,
    );
  }
  if (state.phase === 'flux-revert-required') {
    throw new Error(
      `release ${state.releaseId} rolled back but WBS Flux stays suspended until the deploy ` +
        `repository is reverted: ${state.failure?.manualCommand ?? '(no command recorded)'}`,
    );
  }
  if (state.phase === 'recovery-required' || state.phase === 'lease-released') return [];
  if (state.phase === 'rolled-back') return [];
  if (isForward(state.phase)) {
    return FORWARD_STEPS.slice(forwardIndex(state.phase));
  }
  return rollbackSteps(request, state);
}

/**
 * The state after `step` failed. Before writes reopen the release rolls back to the captured
 * schema and previous digests; after, a blind old-image rollout would discard acknowledged
 * writes, so the release stops at `recovery-required`. A failure while rolling back leaves
 * writes fenced at `rollback-failed`.
 */
export function failStep(
  state: ReleaseState,
  step: ReleaseStep,
  message: string,
  manualCommand: string | null,
): ReleaseState {
  const failure: ReleaseFailure = { step: step.kind, message, manualCommand };
  if (!isForward(state.phase)) {
    return { ...state, phase: 'rollback-failed', failure };
  }
  if (state.writesReopened) return { ...state, phase: 'recovery-required', failure };
  return { ...state, phase: 'rollback-started', rollbackFrom: state.phase, failure };
}

/** Recorded outcomes a completed step contributes to the next durable state. */
export interface StepOutcome {
  capture?: MigrationCapture;
  snapshot?: Snapshot;
}

export function completeStep(
  state: ReleaseState,
  step: ReleaseStep,
  outcome: StepOutcome,
): ReleaseState {
  const next: ReleaseState = { ...state, phase: step.reaches };
  if (outcome.capture !== undefined) next.capture = outcome.capture;
  if (outcome.snapshot !== undefined) next.snapshot = outcome.snapshot;
  if (step.kind === 'suspend-flux') next.fluxSuspendedByUs = true;
  if (step.kind === 'resume-flux' || step.kind === 'rollback-resume-flux') {
    next.fluxSuspendedByUs = false;
  }
  if (step.kind === 'reopen-writes') next.writesReopened = true;
  return next;
}

/**
 * Refuses a rollback whose `down.sql` differs from what capture recorded for the migration it
 * reverses: an edited down script describes some other forward migration.
 */
export function assertDownMigrationsUnchanged(
  capture: MigrationCapture,
  observed: readonly { name: string; downSha256: string }[],
): void {
  const seen = new Map(observed.map((entry) => [entry.name, entry.downSha256]));
  for (const pending of capture.pending) {
    const now = seen.get(pending.name);
    // Proof: `refuses an edited down migration` rolled back with a changed down.sql hash until
    // this comparison existed.
    if (now !== pending.downSha256) {
      throw new Error(
        `${pending.name}/down.sql is ${now ?? 'missing'} but capture recorded ` +
          `${pending.downSha256}; refusing to reverse it with a different script`,
      );
    }
  }
}

/**
 * The applied set must equal capture's applied plus pending after the migration Job, whether
 * that Job's pod ran once or twice. Job completion alone is not evidence.
 */
export function assertMigratedSet(capture: MigrationCapture, applied: readonly string[]): void {
  const expected = [...capture.applied.map((m) => m.name), ...capture.pending.map((m) => m.name)];
  const sorted = [...applied].sort();
  // Proof: `refuses a migration Job that completed without applying the captured set` reached
  // backend rollout on a Job completion alone before this check.
  if (JSON.stringify([...expected].sort()) !== JSON.stringify(sorted)) {
    throw new Error(
      `after migration the database records [${sorted.join(', ')}]; ` +
        `the captured plan was [${expected.join(', ')}]`,
    );
  }
}

/** After schema rollback the database must record exactly the captured applied set. */
export function assertRestoredSet(capture: MigrationCapture, applied: readonly string[]): void {
  const expected = capture.applied.map((m) => m.name).sort();
  const sorted = [...applied].sort();
  if (JSON.stringify(expected) !== JSON.stringify(sorted)) {
    throw new Error(
      `after rollback the database records [${sorted.join(', ')}]; ` +
        `capture recorded [${expected.join(', ')}]`,
    );
  }
}

/** The coordination Lease as the cluster reports it. */
export interface ObservedLease {
  /** `<transactionId>#<run>`: the transaction and the one process that holds it. */
  holder: string;
  renewedAtMs: number;
  durationSeconds: number;
  /** Terminal phase that parked the Lease with no live holder, or `null` while one runs. */
  parked: string | null;
  /** Journal path the holder recorded when it created the Lease. */
  journal: string | null;
}

/** What one coordinator process asks of the Lease. */
export interface LeaseClaim {
  holder: string;
  /** Transaction recorded in this process's journal, or `null` when no journal exists yet. */
  journalTransaction: string | null;
  journalPath: string;
}

export type LeaseDecision =
  { kind: 'create' } | { kind: 'held' } | { kind: 'takeover' } | { kind: 'wait'; ms: number };

export function transactionOf(holder: string): string {
  return holder.split('#')[0];
}

/**
 * Whether this process may hold the Lease. A live holder (renewed within its duration and not
 * parked) is never displaced: a second process for the same transaction waits once for it to
 * expire, anything else is refused. A lapsed Lease is taken over only by the transaction it
 * belongs to, or, when no journal exists yet, by a coordinator using the journal the dead
 * holder named (it died before persisting intent, so it changed nothing).
 */
export function decideLease(
  observed: ObservedLease | null,
  claim: LeaseClaim,
  nowMs: number,
): LeaseDecision {
  if (observed === null) return { kind: 'create' };
  if (observed.holder === claim.holder) return { kind: 'held' };
  const holderTransaction = transactionOf(observed.holder);
  const remainingMs = observed.renewedAtMs + observed.durationSeconds * 1000 - nowMs;
  const live = observed.parked === null && remainingMs > 0;
  const ours =
    holderTransaction === claim.journalTransaction ||
    (claim.journalTransaction === null && observed.journal === claim.journalPath);
  // Proof: accepting any holder of the same release let `refuses a second live coordinator for
  // the same request` run two interleaved coordinators until liveness was required here.
  if (live) {
    if (ours) return { kind: 'wait', ms: remainingMs };
    throw new Error(
      `Lease is held by live coordinator ${observed.holder} (journal ${String(observed.journal)}); ` +
        `it expires in ${String(Math.ceil(remainingMs / 1000))}s unless renewed`,
    );
  }
  if (ours) return { kind: 'takeover' };
  throw new Error(
    `Lease is held by ${observed.holder} (${observed.parked ?? 'expired'}, journal ` +
      `${String(observed.journal)}); inspect that journal and delete the Lease by hand`,
  );
}
