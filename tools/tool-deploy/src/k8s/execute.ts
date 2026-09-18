import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { isTerminal, type JournalRecord, type ReleaseJournal } from './journal';
import {
  admittedBackendImages,
  assertDownMigrationsUnchanged,
  assertMigratedSet,
  assertObservedCluster,
  assertRequest,
  assertRestoredSet,
  completeStep,
  decideLease,
  failStep,
  type FluxUnit,
  initialState,
  K8S_TIERS,
  type K8sTier,
  type MigrationCapture,
  type ObservedCluster,
  type ObservedLease,
  planRelease,
  type ReleaseIdentity,
  releaseIdOf,
  type ReleaseRequest,
  type ReleaseState,
  type ReleaseStep,
  settleInterrupted,
  type Snapshot,
  type StepKind,
  type StepOutcome,
} from './release';

/**
 * Every Kubernetes effect the transaction performs. Each call is bounded and either completes
 * its observable postcondition or throws; none of them decides what happens next.
 */
export interface ReleaseEffects {
  observeCluster(request: ReleaseRequest): Promise<ObservedCluster>;
  /** The release Lease with its optimistic-concurrency version, or `null` when absent. */
  readLease(): Promise<(ObservedLease & { version: string }) | null>;
  /** Creates the Lease; throws if another process created it first. */
  createLease(holder: string, journalPath: string): Promise<void>;
  /** Replaces the Lease at `version` with `holder`; throws if it changed since it was read. */
  takeoverLease(holder: string, version: string, journalPath: string): Promise<void>;
  /** Heartbeat: renews the Lease, and throws unless `holder` still holds it. */
  renewLease(holder: string): Promise<void>;
  /** Marks the Lease held with no live process, at a terminal phase an operator must resolve. */
  parkLease(holder: string, phase: string): Promise<void>;
  /** Deletes the Lease only if `holder` holds it. */
  releaseLease(holder: string): Promise<void>;
  /**
   * Writes F6's `solverImages` admission list and reads it back; admission then accepts exactly
   * these backend digests in `wbs-solver`.
   */
  admitBackendImages(images: readonly string[]): Promise<void>;
  /** Returns once Flux reports the unit suspended. */
  suspendFlux(unit: FluxUnit): Promise<void>;
  /** The revision the unit's GitRepository artifact currently serves. */
  fluxSourceRevision(unit: FluxUnit): Promise<string>;
  /** Verifies the source is at `revision`, resumes, and waits for Flux to apply it. */
  resumeFlux(unit: FluxUnit, revision: string): Promise<void>;
  /** Exact command that resumes the unit once the deploy repository serves `revision`. */
  manualFluxResumeCommand(unit: FluxUnit, revision: string): string;
  closeWrites(): Promise<void>;
  reopenWrites(): Promise<void>;
  drainGateway(): Promise<void>;
  /** Scales the backend to zero and proves no writer Pod of any kind remains. */
  stopWriter(): Promise<void>;
  capture(
    releaseId: string,
    backendImage: string,
  ): Promise<{ capture: MigrationCapture; snapshot: Snapshot }>;
  /** Runs the release's single migration Job; returns the applied set it then observes. */
  migrate(releaseId: string, backendImage: string): Promise<readonly string[]>;
  observeDownMigrations(
    releaseId: string,
    backendImage: string,
  ): Promise<readonly { name: string; downSha256: string }[]>;
  /** Reverses migrations after `baseline`; returns the applied set it then observes. */
  rollbackSchema(
    releaseId: string,
    backendImage: string,
    baseline: string,
  ): Promise<readonly string[]>;
  /** Exact command an operator runs to finish the schema rollback by hand. */
  manualSchemaCommand(releaseId: string, backendImage: string, baseline: string): string;
  /**
   * Exact commands that reopen writes and release the Lease, for an operator who has restored
   * and verified the previous release by hand after any other rollback step failed.
   */
  manualReopenCommand(releaseId: string): string;
  rolloutBackend(image: string): Promise<void>;
  rolloutTiers(identity: ReleaseIdentity): Promise<void>;
  smoke(releaseId: string, identity: ReleaseIdentity): Promise<void>;
  persistRelease(identity: ReleaseIdentity): Promise<void>;
  /**
   * Flux mode: moves the deploy branch to `flux.desiredRevision` while the WBS unit is
   * suspended and waits for the source to serve it. Runs in `persist-release`, before writes
   * reopen, so a failed push still rolls back (or ends `flux-revert-required`).
   */
  publishDesired(request: ReleaseRequest): Promise<void>;
  reconcileDesired(request: ReleaseRequest): Promise<void>;
}

/** A release that ended anywhere but `lease-released`; carries the operator report. */
export class ReleaseFailedError extends Error {
  constructor(
    readonly state: ReleaseState,
    readonly journalPath: string,
  ) {
    super(reportOf(state, journalPath));
    this.name = 'ReleaseFailedError';
  }
}

export function reportOf(state: ReleaseState, journalPath: string): string {
  const lines = [
    `release ${state.releaseId} ended at ${state.phase}`,
    `journal: ${journalPath}`,
    `failed step: ${state.failure?.step ?? '(none)'}: ${state.failure?.message ?? '(none)'}`,
    `captured migration set: ${
      state.capture === null
        ? '(not captured)'
        : `baseline ${state.capture.baseline}; applied [${state.capture.applied
            .map((m) => m.name)
            .join(', ')}]; pending [${state.capture.pending.map((m) => m.name).join(', ')}]`
    }`,
    `snapshot: ${state.snapshot === null ? '(none)' : `${state.snapshot.path} sha256 ${state.snapshot.sha256}`}`,
  ];
  if (state.phase === 'rollback-failed') {
    lines.push('writes remain fenced and the Lease stays held');
    lines.push(`manual command: ${state.failure?.manualCommand ?? '(none recorded)'}`);
  }
  if (state.phase === 'flux-revert-required') {
    lines.push(
      'the previous release is restored and serving with writes open; Flux stays suspended',
    );
    lines.push(`manual command: ${state.failure?.manualCommand ?? '(none recorded)'}`);
  }
  if (state.phase === 'recovery-required') {
    lines.push(
      'writes were reopened on the new release; submit a recovery request with ' +
        `--recovers=${state.releaseId} (a fresh capture, never this release's snapshot)`,
    );
  }
  return lines.join('\n');
}

/** The rollback succeeded except that Flux cannot safely resume: see `flux-revert-required`. */
export class FluxRevertRequiredError extends Error {}

/** Another process holds, or took, the Lease; this one must stop without touching anything. */
export class LeaseLostError extends Error {}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function requireCapture(state: ReleaseState): MigrationCapture {
  if (state.capture === null) throw new Error(`${state.phase} requires a captured migration set`);
  return state.capture;
}

async function perform(
  step: ReleaseStep,
  request: ReleaseRequest,
  state: ReleaseState,
  effects: ReleaseEffects,
  lease: { claim: () => Promise<void>; holder: string },
): Promise<StepOutcome> {
  const flux = request.flux;
  switch (step.kind) {
    case 'validate':
      assertObservedCluster(request, await effects.observeCluster(request));
      return {};
    case 'acquire-lease':
      await lease.claim();
      return {};
    case 'persist-intent':
      return {};
    case 'admit-images':
      // Proof: skipping this write failed `admits the candidate and rollback digests before any
      // backend pod starts`: the fake admission denied the candidate's capture Job.
      await effects.admitBackendImages(admittedBackendImages(request));
      return {};
    case 'suspend-flux':
      if (flux !== null) await effects.suspendFlux(flux);
      return {};
    case 'close-writes':
      await effects.closeWrites();
      return {};
    case 'drain-gateway':
      await effects.drainGateway();
      return {};
    case 'stop-writer':
    case 'rollback-stop-writer':
      await effects.stopWriter();
      return {};
    case 'capture-state':
      return effects.capture(state.transactionId, request.release.images.backend);
    case 'migrate': {
      const applied = await effects.migrate(state.transactionId, request.release.images.backend);
      assertMigratedSet(requireCapture(state), applied);
      return {};
    }
    case 'rollout-backend':
      await effects.rolloutBackend(request.release.images.backend);
      return {};
    case 'rollout-tiers':
      await effects.rolloutTiers(request.release);
      return {};
    case 'smoke':
      await effects.smoke(state.transactionId, request.release);
      return {};
    case 'persist-release':
      // Proof: execute.test.ts `publishes the desired revision before writes reopen, and rolls
      // back when the push fails`; with the publish moved back into reconcile-desired it ran
      // after reopenWrites (call 29 vs 27), where a failed push leaves recovery-required.
      if (flux !== null) await effects.publishDesired(request);
      await effects.persistRelease(request.release);
      return {};
    case 'reopen-writes':
    case 'rollback-reopen-writes':
      await effects.reopenWrites();
      return {};
    case 'reconcile-desired':
      await effects.reconcileDesired(request);
      return {};
    case 'resume-flux':
      if (flux !== null) await effects.resumeFlux(flux, flux.desiredRevision);
      return {};
    case 'rollback-resume-flux': {
      if (flux === null) return {};
      const source = await effects.fluxSourceRevision(flux);
      // Proof: without this guard `keeps Flux suspended when the source already serves the
      // failed release` saw Flux re-apply the failed digests over the restored release;
      // resuming onto `desiredRevision` failed `rolls back with Flux onto the previous revision
      // only`.
      if (!source.endsWith(flux.previousRevision)) {
        throw new FluxRevertRequiredError(
          `WBS Flux source ${flux.namespace}/${flux.gitRepository} serves ${source}, not the ` +
            `previous release's ${flux.previousRevision}; resuming would re-apply the failed release`,
        );
      }
      await effects.resumeFlux(flux, flux.previousRevision);
      return {};
    }
    case 'release-lease':
    case 'rollback-release-lease':
      await effects.releaseLease(lease.holder);
      return {};
    case 'rollback-schema': {
      const capture = requireCapture(state);
      const image = request.release.images.backend;
      assertDownMigrationsUnchanged(
        capture,
        await effects.observeDownMigrations(state.transactionId, image),
      );
      assertRestoredSet(
        capture,
        await effects.rollbackSchema(state.transactionId, image, capture.baseline),
      );
      return {};
    }
    case 'rollback-tiers':
      await effects.rolloutTiers(state.previous);
      return {};
    case 'rollback-verify':
      await effects.smoke(`${state.transactionId}-rollback`, state.previous);
      return {};
  }
}

function manualCommandFor(
  step: StepKind,
  request: ReleaseRequest,
  state: ReleaseState,
  effects: ReleaseEffects,
): string | null {
  if (step === 'rollback-schema' && state.capture !== null) {
    return effects.manualSchemaCommand(
      state.transactionId,
      request.release.images.backend,
      state.capture.baseline,
    );
  }
  if (step.startsWith('rollback-')) return effects.manualReopenCommand(state.releaseId);
  return null;
}

/** Reads the journal and decides which state this invocation continues from. */
function startingState(request: ReleaseRequest, journal: ReleaseJournal): ReleaseState {
  const existing = journal.read();
  if (existing === null) return initialState(request);
  const requestedId = releaseIdOf(request.release);
  if (existing.state.phase === 'recovery-required' || isTerminal(existing.state)) {
    // Proof: without this check `stops at recovery-required ... recovers with a fresh capture` started a fresh
    // release over the promoted one until recovery required an explicit `recovers` name.
    if (
      existing.state.phase === 'recovery-required' &&
      request.recovers !== existing.state.releaseId
    ) {
      throw new Error(
        `journal ${journal.path} holds release ${existing.state.releaseId} at recovery-required; ` +
          `only a request with recovers=${existing.state.releaseId} may proceed`,
      );
    }
    // Returned as-is so planning refuses with the recorded manual command.
    if (
      existing.state.phase === 'rollback-failed' ||
      existing.state.phase === 'flux-revert-required'
    ) {
      return existing.state;
    }
    return initialState(request);
  }
  if (existing.state.releaseId !== requestedId) {
    throw new Error(
      `journal ${journal.path} holds unfinished release ${existing.state.releaseId}; ` +
        `refusing to start ${requestedId} until it finishes or rolls back`,
    );
  }
  if (JSON.stringify(existing.request) !== JSON.stringify(request)) {
    throw new Error(`journal ${journal.path} was written for a different request`);
  }
  return settleInterrupted(existing.state);
}

export interface ExecuteOptions {
  clock?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Heartbeat period; the effects' Lease duration must be several of these. */
  heartbeatMs?: number;
}

const PARKED_PHASES: ReadonlySet<string> = new Set([
  'rollback-failed',
  'recovery-required',
  'flux-revert-required',
]);

/**
 * Runs or resumes one release transaction to a terminal phase, writing the journal after every
 * step. A journal write that throws propagates immediately: the durable record is then the last
 * successful write, exactly as if the process had died, and the next run resumes from it.
 *
 * The Lease holder is `<transactionId>#<run>`, unique to this process. A resumed run claims
 * the Lease before its first journal write or mutation, every step first renews it, and a
 * background heartbeat keeps it renewed while a step runs; losing it throws
 * {@link LeaseLostError} with nothing journaled, like a crash.
 */
export async function executeRelease(
  request: ReleaseRequest,
  journal: ReleaseJournal,
  effects: ReleaseEffects,
  log: (line: string) => void,
  options: ExecuteOptions = {},
): Promise<ReleaseState> {
  const clock = options.clock ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => Bun.sleep(ms));
  const heartbeatMs = options.heartbeatMs ?? 5000;
  assertRequest(request);
  const existing = journal.read();
  let state = startingState(request, journal);
  planRelease(request, state);
  const holder = `${state.transactionId}#${randomBytes(4).toString('hex')}`;
  const held = { value: false, lost: null as unknown };

  const claim = async (): Promise<void> => {
    let waited = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      const observed = await effects.readLease();
      const decision = decideLease(
        observed,
        {
          holder,
          journalTransaction: existing?.state.transactionId ?? null,
          journalPath: journal.path,
        },
        clock(),
      );
      if (decision.kind === 'wait') {
        if (waited || observed === null) {
          throw new LeaseLostError(
            `Lease is still renewed by ${observed?.holder ?? '(none)'}; another coordinator ` +
              'runs this transaction',
          );
        }
        waited = true;
        log(
          `[k3s-release ${state.releaseId}] waiting ${String(decision.ms)}ms for ${observed.holder} to lapse`,
        );
        await sleep(decision.ms + 1000);
        continue;
      }
      try {
        if (decision.kind === 'create') await effects.createLease(holder, journal.path);
        if (decision.kind === 'takeover' && observed !== null) {
          await effects.takeoverLease(holder, observed.version, journal.path);
        }
      } catch (e: unknown) {
        // Another process created or replaced the Lease between our read and write; re-read.
        log(`[k3s-release ${state.releaseId}] Lease write lost a race: ${messageOf(e)}`);
        continue;
      }
      held.value = true;
      return;
    }
    throw new LeaseLostError('the Lease kept changing under this coordinator; refusing to run');
  };

  const history: { phase: string; at: string }[] = [...(existing?.history ?? [])];
  const record = (next: ReleaseState): void => {
    history.push({ phase: next.phase, at: new Date(clock()).toISOString() });
    const entry: JournalRecord = { schemaVersion: 1, request, state: next, history };
    journal.write(entry);
  };
  // Proof: recording before claiming let `refuses to resume a transaction whose live
  // coordinator still renews the Lease` overwrite the live coordinator's journal.
  if (state.phase !== 'requested') await claim();
  if (state.phase !== 'requested' && history.at(-1)?.phase !== state.phase) record(state);

  const heartbeat = setInterval(() => {
    if (!held.value) return;
    effects.renewLease(holder).catch((e: unknown) => {
      held.lost = e;
    });
  }, heartbeatMs);
  try {
    for (;;) {
      if (isTerminal(state)) break;
      const steps = planRelease(request, state);
      if (steps.length === 0) break;
      const step = steps[0];
      if (held.value) {
        if (held.lost !== null) throw new LeaseLostError(`Lease lost: ${messageOf(held.lost)}`);
        // Proof: without this renewal `stops when another process takes the Lease` kept mutating
        // after its Lease was taken over.
        try {
          await effects.renewLease(holder);
        } catch (e: unknown) {
          throw new LeaseLostError(`Lease lost before ${step.kind}: ${messageOf(e)}`);
        }
      }
      log(`[k3s-release ${state.releaseId}] ${step.kind}`);
      let outcome: StepOutcome;
      try {
        outcome = await perform(step, request, state, effects, { claim, holder });
      } catch (e: unknown) {
        // Nothing is durable before intent: validation and Lease failures change no state.
        if (state.phase === 'requested' || state.phase === 'validated') throw e;
        if (e instanceof LeaseLostError) throw e;
        log(`[k3s-release ${state.releaseId}] ${step.kind} failed: ${messageOf(e)}`);
        if (e instanceof FluxRevertRequiredError && request.flux !== null) {
          state = {
            ...state,
            phase: 'flux-revert-required',
            failure: {
              step: step.kind,
              message: e.message,
              manualCommand: effects.manualFluxResumeCommand(
                request.flux,
                request.flux.previousRevision,
              ),
            },
          };
        } else {
          state = failStep(
            state,
            step,
            messageOf(e),
            manualCommandFor(step.kind, request, state, effects),
          );
        }
        record(state);
        continue;
      }
      if (held.lost !== null)
        throw new LeaseLostError(`Lease lost during ${step.kind}: ${messageOf(held.lost)}`);
      state = completeStep(state, step, outcome);
      if (step.kind === 'release-lease' || step.kind === 'rollback-release-lease')
        held.value = false;
      // `validated` and `lease-acquired` precede the intent record by design; the Lease itself is
      // the durable evidence of the second, and its journal annotation lets a restart reclaim it.
      if (step.kind !== 'validate' && step.kind !== 'acquire-lease') record(state);
    }
    if (held.value && PARKED_PHASES.has(state.phase)) await effects.parkLease(holder, state.phase);
  } finally {
    clearInterval(heartbeat);
  }
  if (state.phase !== 'lease-released') throw new ReleaseFailedError(state, journal.path);
  return state;
}

// ---------------------------------------------------------------------------------------------
// kubectl adapter

/** Names every object the transaction touches; the manifests in deploy/k8s/wbs use the same. */
export const OBJECTS = {
  deployments: {
    backend: 'wbs-backend',
    gateway: 'wbs-gateway',
    frontend: 'wbs-frontend',
    mcp: 'wbs-mcp',
  } satisfies Record<K8sTier, string>,
  lease: 'wbs-release',
  releaseRecord: 'wbs-release',
  writersPolicy: 'wbs-backend-writers',
  admissionParams: 'puni-trusted-workload',
  pvc: 'wbs-data',
  backendServiceAccount: 'wbs-backend',
  /** deploy/k8s/wbs/base/backup.yaml; it runs the backend image, so it moves with it. */
  backupCronJob: 'sqlite-backup',
} as const;

export interface KubectlSettings {
  kubectl: string;
  /** `null` uses kubectl's own resolution (`KUBECONFIG` or `~/.kube/config`). */
  kubeconfig: string | null;
  context: string;
  namespaces: { app: string; backend: string };
  /** Directory beside the journal where rendered Job manifests are kept for manual commands. */
  stateDir: string;
  /** Overlay the local profile applies when reconciling desired state. */
  overlay: string;
  /** Expected answer from an unauthenticated `GET /api/projects`: 200 local, 401 OIDC. */
  anonymousProjectsStatus: 200 | 401;
  rolloutTimeoutSeconds: number;
  jobTimeoutSeconds: number;
  drainTimeoutMs: number;
  /** Lease lifetime without renewal; the executor's heartbeat must be several times shorter. */
  leaseDurationSeconds: number;
  /**
   * Clone of the deploy repository the WBS GitRepository serves. `reconcile-desired` pushes
   * `flux.desiredRevision` to it, and only while the WBS unit is suspended. Absent or `null`,
   * a Flux release requires the source to be at the desired revision already.
   */
  deployRepository?: DeployRepository | null;
  log: (line: string) => void;
}

/** A local clone holding the prepared desired commit, and where Flux reads it from. */
export interface DeployRepository {
  path: string;
  remote: string;
  branch: string;
}

/** The effects the CLI also uses to build a request from the live cluster. */
export interface ClusterReader {
  /** The `kube-system` namespace UID. */
  clusterUid(): Promise<string>;
  /** The release record the last promotion persisted, verified against the running tiers. */
  currentRelease(): Promise<ReleaseIdentity | null>;
}

interface Invocation {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Runs one bounded subprocess. `timeoutMs` kills it and reports rather than waiting forever. */
export async function run(
  cmd: readonly string[],
  stdin: string | null,
  timeoutMs: number,
): Promise<Invocation> {
  const child = Bun.spawn({
    cmd: [...cmd],
    stdin: stdin === null ? 'ignore' : new Blob([stdin]),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const deadline = { passed: false };
  const timer = setTimeout(() => {
    deadline.passed = true;
    child.kill('SIGKILL');
  }, timeoutMs);
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  clearTimeout(timer);
  // Proof: `run` kills a command past its deadline and reports it; with the timer removed
  // `kills a subprocess past its deadline` waited the full sleep and saw exit 0.
  if (deadline.passed)
    throw new Error(`${cmd.join(' ')} exceeded ${String(timeoutMs)}ms and was killed`);
  return { stdout, stderr, exitCode };
}

const JOB_MARKER = 'PUNI_RESULT ';

/**
 * The backend-image script every schema Job runs from `/app/apps/wbs/be-01`: `capture`
 * snapshots and lists, `migrate` and `rollback` run the app's own CLIs, and each then reports
 * the applied set and the on-disk down scripts as one marked JSON line.
 */
export const BACKEND_TASK_SCRIPT = String.raw`
const { Database } = require('bun:sqlite');
const fs = require('node:fs');
const crypto = require('node:crypto');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const dbPath = process.env.DB_PATH;
const mode = process.env.PUNI_TASK;
if (!dbPath || !mode) throw new Error('DB_PATH and PUNI_TASK are required');
if (!fs.existsSync(dbPath)) throw new Error('database ' + dbPath + ' does not exist');
const cli = (args) => {
  const child = Bun.spawnSync(['bun', 'run', ...args], { stdout: 'inherit', stderr: 'inherit' });
  if (child.exitCode !== 0) throw new Error(args.join(' ') + ' exited ' + child.exitCode);
};
if (mode === 'migrate') cli(['src/migrate-cli.ts']);
if (mode === 'rollback') cli(['src/migrate-down-cli.ts', '--to=' + process.env.PUNI_BASELINE]);
const db = new Database(dbPath, { readwrite: true, create: false });
const table = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'").get();
const applied = table === null ? [] : db.query('SELECT name, hash, created_at FROM __drizzle_migrations ORDER BY created_at').all();
const folders = fs.readdirSync('./drizzle', { withFileTypes: true })
  .filter((e) => e.isDirectory() && fs.existsSync('./drizzle/' + e.name + '/migration.sql'))
  .map((e) => e.name).sort()
  .map((name) => ({
    name,
    hash: sha(fs.readFileSync('./drizzle/' + name + '/migration.sql').toString()),
    downSha256: fs.existsSync('./drizzle/' + name + '/down.sql') ? sha(fs.readFileSync('./drizzle/' + name + '/down.sql')) : null,
  }));
let snapshot = null;
if (mode === 'capture') {
  const dir = process.env.PUNI_SNAPSHOT_DIR;
  fs.mkdirSync(dir, { recursive: true });
  const path = dir + '/' + process.env.PUNI_RELEASE + '.sqlite';
  fs.rmSync(path, { force: true });
  db.run("VACUUM INTO '" + path + "'");
  const copy = new Database(path, { readonly: true });
  const integrity = copy.query('PRAGMA integrity_check').all();
  copy.close();
  if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') {
    throw new Error('snapshot integrity_check failed: ' + JSON.stringify(integrity));
  }
  snapshot = { path, sha256: sha(fs.readFileSync(path)) };
}
db.close();
console.log('${JOB_MARKER}' + JSON.stringify({ applied, folders, snapshot }));
`;

export interface BackendTaskReport {
  applied: { name: string; hash: string }[];
  folders: { name: string; hash: string; downSha256: string | null }[];
  snapshot: Snapshot | null;
}

/** Parses the one marked line a schema Job prints; any other shape is a failed Job. */
export function parseTaskReport(logs: string): BackendTaskReport {
  const lines = logs.split('\n').filter((line) => line.startsWith(JOB_MARKER));
  if (lines.length !== 1) {
    throw new Error(
      `schema Job printed ${String(lines.length)} result lines; expected exactly one`,
    );
  }
  const parsed: unknown = JSON.parse(lines[0].slice(JOB_MARKER.length));
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('applied' in parsed) ||
    !Array.isArray(parsed.applied) ||
    !('folders' in parsed) ||
    !Array.isArray(parsed.folders) ||
    !('snapshot' in parsed)
  ) {
    throw new Error('schema Job result is missing applied, folders or snapshot');
  }
  // Boundary: shape checked above; the script that printed it is BACKEND_TASK_SCRIPT.
  return parsed as BackendTaskReport;
}

/**
 * Derives capture facts from a capture Job's report. Every applied migration must exist in the
 * candidate image with the same hash, or its rollback script would describe something else.
 */
export function captureFromReport(report: BackendTaskReport): {
  capture: MigrationCapture;
  snapshot: Snapshot;
} {
  if (report.snapshot === null) throw new Error('capture Job reported no snapshot');
  const folders = new Map(report.folders.map((folder) => [folder.name, folder]));
  for (const row of report.applied) {
    const folder = folders.get(row.name);
    // Proof: `refuses a capture whose applied migration the candidate edited` accepted a
    // changed migration.sql until this comparison existed.
    if (folder?.hash !== row.hash) {
      throw new Error(
        `${row.name} is applied but the candidate image carries a different migration`,
      );
    }
  }
  const appliedNames = new Set(report.applied.map((row) => row.name));
  const pending = report.folders
    .filter((folder) => !appliedNames.has(folder.name))
    .map((folder) => {
      if (folder.downSha256 === null) throw new Error(`${folder.name} has no down.sql`);
      return { name: folder.name, downSha256: folder.downSha256 };
    });
  return {
    capture: {
      baseline: report.applied.at(-1)?.name ?? 'none',
      applied: report.applied.map((row) => ({ name: row.name, hash: row.hash })),
      pending,
    },
    snapshot: report.snapshot,
  };
}

const SECURITY_CONTEXT = {
  allowPrivilegeEscalation: false,
  runAsNonRoot: true,
  seccompProfile: { type: 'RuntimeDefault' },
  capabilities: { drop: ['ALL'] },
  readOnlyRootFilesystem: true,
};

/**
 * One schema Job in the backend namespace. It satisfies F6's trusted admission (approved image,
 * service account, controller label, product node, no token) and runs at most one pod ever:
 * `backoffLimit: 0` and `podReplacementPolicy: Failed` forbid a replacement while one lives.
 */
export function backendTaskJob(
  settings: Pick<KubectlSettings, 'namespaces'>,
  name: string,
  image: string,
  env: Record<string, string>,
): Record<string, unknown> {
  const labels = {
    'app.kubernetes.io/part-of': 'wbs',
    'puni.dev/controller': 'wbs-backend',
    'puni.dev/writer': 'true',
  };
  return {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: { name, namespace: settings.namespaces.backend, labels },
    spec: {
      backoffLimit: 0,
      podReplacementPolicy: 'Failed',
      ttlSecondsAfterFinished: 86_400,
      template: {
        metadata: { labels },
        spec: {
          restartPolicy: 'Never',
          serviceAccountName: OBJECTS.backendServiceAccount,
          automountServiceAccountToken: false,
          nodeSelector: { 'puni.dev/capability-product': 'true' },
          securityContext: {
            runAsUser: 10001,
            runAsGroup: 10001,
            fsGroup: 10001,
            runAsNonRoot: true,
            seccompProfile: { type: 'RuntimeDefault' },
          },
          containers: [
            {
              name: 'task',
              image,
              command: ['bun', '-e', BACKEND_TASK_SCRIPT],
              env: [
                { name: 'DB_PATH', value: '/data/wbs.sqlite' },
                { name: 'HOME', value: '/tmp' },
                ...Object.entries(env).map(([key, value]) => ({ name: key, value })),
              ],
              resources: {
                requests: { cpu: '50m', memory: '128Mi' },
                limits: { memory: '512Mi' },
              },
              securityContext: SECURITY_CONTEXT,
              volumeMounts: [
                { name: 'data', mountPath: '/data' },
                { name: 'tmp', mountPath: '/tmp' },
              ],
            },
          ],
          volumes: [
            { name: 'data', persistentVolumeClaim: { claimName: OBJECTS.pvc } },
            { name: 'tmp', emptyDir: { sizeLimit: '256Mi' } },
          ],
        },
      },
    },
  };
}

/** Script the smoke Job runs with the gateway image against every tier's Service. */
export const SMOKE_SCRIPT = String.raw`
const expectAnonymous = Number(process.env.EXPECT_ANONYMOUS_PROJECTS);
const checks = [
  ['backend health', process.env.BACKEND_URL + '/health', (r) => r.status === 200],
  ['backend auth', process.env.BACKEND_URL + '/api/projects', (r) => r.status === expectAnonymous],
  ['gateway health', process.env.GATEWAY_URL + '/health', (r) => r.status === 200],
  ['frontend index', process.env.FRONTEND_URL + '/', (r, body) => r.status === 200 && body.includes('<div id="root"')],
  ['mcp readiness', process.env.MCP_URL + '/health/readiness', (r) => r.status === 200],
];
// A new pod's NetworkPolicy allowances converge a few seconds after it starts, so each check
// gets bounded retries; the last attempt's answer is the verdict.
let failed = 0;
for (const [name, url, ok] of checks) {
  let verdict = 'not attempted';
  let pass = false;
  for (let attempt = 1; attempt <= 15 && !pass; attempt++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const body = await r.text();
      pass = ok(r, body);
      verdict = String(r.status);
    } catch (e) {
      verdict = e.message;
    }
    if (!pass) await Bun.sleep(2000);
  }
  if (!pass) failed++;
  console.log((pass ? 'ok   ' : 'FAIL ') + name + ' ' + verdict);
}
if (failed > 0) process.exit(1);
`;

export function smokeJob(
  settings: Pick<KubectlSettings, 'namespaces' | 'anonymousProjectsStatus'>,
  name: string,
  image: string,
): Record<string, unknown> {
  const { app, backend } = settings.namespaces;
  const labels = { 'app.kubernetes.io/part-of': 'wbs', 'puni.dev/workload': 'release-smoke' };
  return {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: { name, namespace: app, labels },
    spec: {
      backoffLimit: 0,
      ttlSecondsAfterFinished: 86_400,
      template: {
        metadata: { labels },
        spec: {
          restartPolicy: 'Never',
          automountServiceAccountToken: false,
          securityContext: {
            runAsUser: 10001,
            runAsGroup: 10001,
            runAsNonRoot: true,
            seccompProfile: { type: 'RuntimeDefault' },
          },
          containers: [
            {
              name: 'smoke',
              image,
              command: ['bun', '-e', SMOKE_SCRIPT],
              env: [
                { name: 'HOME', value: '/tmp' },
                {
                  name: 'BACKEND_URL',
                  value: `http://wbs-backend.${backend}.svc.cluster.local:3100`,
                },
                { name: 'GATEWAY_URL', value: `http://wbs-gateway.${app}.svc.cluster.local:3200` },
                { name: 'FRONTEND_URL', value: `http://wbs-frontend.${app}.svc.cluster.local:80` },
                { name: 'MCP_URL', value: `http://wbs-mcp.${app}.svc.cluster.local:3300` },
                {
                  name: 'EXPECT_ANONYMOUS_PROJECTS',
                  value: String(settings.anonymousProjectsStatus),
                },
              ],
              resources: { requests: { cpu: '20m', memory: '64Mi' }, limits: { memory: '256Mi' } },
              securityContext: SECURITY_CONTEXT,
              volumeMounts: [{ name: 'tmp', mountPath: '/tmp' }],
            },
          ],
          volumes: [{ name: 'tmp', emptyDir: { sizeLimit: '64Mi' } }],
        },
      },
    },
  };
}

/** A Kubernetes object name derived from a release id and purpose, within the 63-byte limit. */
export function jobName(purpose: string, releaseId: string): string {
  return `wbs-${purpose}-${releaseId}`.slice(0, 63).replace(/-+$/, '');
}

/** Parses `kubectl get lease -o json`; a Lease without holder or renew time is malformed state. */
export function parseLease(json: string): ObservedLease & { version: string } {
  const lease = JSON.parse(json) as {
    metadata?: { resourceVersion?: string; annotations?: Partial<Record<string, string>> };
    spec?: { holderIdentity?: string; renewTime?: string; leaseDurationSeconds?: number };
  };
  const holder = lease.spec?.holderIdentity;
  const renewTime = lease.spec?.renewTime;
  const duration = lease.spec?.leaseDurationSeconds;
  const version = lease.metadata?.resourceVersion;
  if (
    holder === undefined ||
    renewTime === undefined ||
    duration === undefined ||
    version === undefined
  ) {
    throw new Error(
      'the release Lease lacks holderIdentity, renewTime, leaseDurationSeconds or resourceVersion',
    );
  }
  const renewedAtMs = Date.parse(renewTime);
  if (Number.isNaN(renewedAtMs))
    throw new Error(`the release Lease renewTime ${renewTime} is not a time`);
  return {
    holder,
    renewedAtMs,
    durationSeconds: duration,
    parked: lease.metadata?.annotations?.['puni.dev/parked'] ?? null,
    journal: lease.metadata?.annotations?.['puni.dev/journal'] ?? null,
    version,
  };
}

/** Real effects over kubectl. Every wait has an explicit ceiling from `settings`. */
export function kubectlEffects(settings: KubectlSettings): ReleaseEffects & ClusterReader {
  const { app, backend } = settings.namespaces;
  const base = [
    settings.kubectl,
    ...(settings.kubeconfig === null ? [] : ['--kubeconfig', settings.kubeconfig]),
    '--context',
    settings.context,
  ];
  const callMs = 60_000;

  async function kubectl(
    args: readonly string[],
    stdin: string | null = null,
    ms = callMs,
  ): Promise<string> {
    const invocation = await run([...base, ...args], stdin, ms);
    if (invocation.exitCode !== 0) {
      throw new Error(
        `kubectl ${args.join(' ')} exited ${String(invocation.exitCode)}: ${invocation.stderr.trim()}`,
      );
    }
    return invocation.stdout;
  }

  async function jsonOf(args: readonly string[]): Promise<unknown> {
    return JSON.parse(await kubectl([...args, '-o', 'json'])) as unknown;
  }

  async function pollUntil(
    label: string,
    deadlineMs: number,
    check: () => Promise<boolean>,
  ): Promise<void> {
    const start = Date.now();
    for (;;) {
      if (await check()) return;
      if (Date.now() - start > deadlineMs)
        throw new Error(`${label} did not happen within ${String(deadlineMs)}ms`);
      await Bun.sleep(1000);
    }
  }

  async function writerPods(): Promise<string[]> {
    // Finished Job pods keep the label; only pods that can still run count as writers.
    const names = await kubectl([
      '-n',
      backend,
      'get',
      'pods',
      '-l',
      'puni.dev/writer=true',
      '--field-selector=status.phase!=Succeeded,status.phase!=Failed',
      '-o',
      'name',
    ]);
    return names.split('\n').filter((line) => line !== '');
  }

  /** Runs one Job to completion (or reuses the same-named Job a crashed run created). */
  async function runJob(
    name: string,
    namespace: string,
    manifest: Record<string, unknown>,
  ): Promise<string> {
    writeFileSync(
      join(settings.stateDir, `${name}.json`),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    const existing = await run(
      [...base, '-n', namespace, 'get', 'job', name, '-o', 'name'],
      null,
      callMs,
    );
    if (existing.exitCode !== 0) {
      if (!existing.stderr.includes('NotFound')) {
        throw new Error(`reading job ${name} failed: ${existing.stderr.trim()}`);
      }
      // Proof: removing this guard let `refuses every schema Job while a writer runs` create the
      // migrate, downs, rollback and capture Jobs beside a running backend pod.
      if (namespace === backend) {
        const writers = await writerPods();
        if (writers.length > 0) {
          throw new Error(`writer pods exist (${writers.join(', ')}); refusing to start ${name}`);
        }
      }
      await kubectl(['create', '-f', '-'], JSON.stringify(manifest));
    }
    const observed: { outcome: 'complete' | 'failed' | null } = { outcome: null };
    await pollUntil(`job ${name} completion`, settings.jobTimeoutSeconds * 1000, async () => {
      const status = (await jsonOf(['-n', namespace, 'get', 'job', name])) as {
        status?: { succeeded?: number; failed?: number };
      };
      if ((status.status?.succeeded ?? 0) > 0) observed.outcome = 'complete';
      else if ((status.status?.failed ?? 0) > 0) observed.outcome = 'failed';
      return observed.outcome !== null;
    });
    const logs = await kubectl(['-n', namespace, 'logs', `job/${name}`, '--all-containers']);
    if (observed.outcome !== 'complete') throw new Error(`job ${name} failed:\n${logs.trim()}`);
    return logs;
  }

  async function backendTask(
    purpose: string,
    releaseId: string,
    image: string,
    env: Record<string, string>,
  ): Promise<BackendTaskReport> {
    const name = jobName(purpose, releaseId);
    const logs = await runJob(name, backend, backendTaskJob(settings, name, image, env));
    return parseTaskReport(logs);
  }

  /** The SQLite backup CronJob's image; F6 admits its pods only with a backend digest. */
  async function backupImage(): Promise<string> {
    return (
      await kubectl([
        '-n',
        backend,
        'get',
        'cronjob',
        OBJECTS.backupCronJob,
        '-o',
        'jsonpath={.spec.jobTemplate.spec.template.spec.containers[?(@.name=="backup")].image}',
      ])
    ).trim();
  }

  async function rollout(namespace: string, tier: K8sTier, image: string): Promise<void> {
    const deployment = OBJECTS.deployments[tier];
    if (tier === 'backend') {
      // Proof: execute-adapter.test.ts `moves the backup CronJob with every backend rollout`
      // saw no cronjob patch with this block removed; its next run would then use a digest the
      // coordinator may already have dropped from solverImages, and admission would deny it.
      const cronPatch = {
        spec: {
          jobTemplate: {
            spec: { template: { spec: { containers: [{ name: 'backup', image }] } } },
          },
        },
      };
      await kubectl([
        '-n',
        namespace,
        'patch',
        'cronjob',
        OBJECTS.backupCronJob,
        '--type=strategic',
        '-p',
        JSON.stringify(cronPatch),
      ]);
    }
    const patch = {
      spec: { replicas: 1, template: { spec: { containers: [{ name: tier, image }] } } },
    };
    await kubectl([
      '-n',
      namespace,
      'patch',
      'deployment',
      deployment,
      '--type=strategic',
      '-p',
      JSON.stringify(patch),
    ]);
    await kubectl(
      [
        '-n',
        namespace,
        'rollout',
        'status',
        `deployment/${deployment}`,
        `--timeout=${String(settings.rolloutTimeoutSeconds)}s`,
      ],
      null,
      settings.rolloutTimeoutSeconds * 1000 + callMs,
    );
  }

  async function currentRelease(): Promise<ReleaseIdentity | null> {
    const found = await run(
      [...base, '-n', backend, 'get', 'configmap', OBJECTS.releaseRecord, '-o', 'json'],
      null,
      callMs,
    );
    if (found.exitCode !== 0) {
      if (found.stderr.includes('NotFound')) return null;
      throw new Error(`reading the release record failed: ${found.stderr.trim()}`);
    }
    const data =
      (JSON.parse(found.stdout) as { data?: Partial<Record<string, string>> }).data ?? {};
    const sourceSha = data['sourceSha'];
    const images = data['images'];
    if (sourceSha === undefined || images === undefined) {
      throw new Error(`configmap ${OBJECTS.releaseRecord} lacks sourceSha or images`);
    }
    // Boundary: written by persistRelease below from a validated ReleaseIdentity.
    const identity: ReleaseIdentity = {
      sourceSha,
      images: JSON.parse(images) as ReleaseIdentity['images'],
    };
    for (const tier of K8S_TIERS) {
      const namespace = tier === 'backend' ? backend : app;
      const running = (
        await kubectl([
          '-n',
          namespace,
          'get',
          'deployment',
          OBJECTS.deployments[tier],
          '-o',
          `jsonpath={.spec.template.spec.containers[?(@.name=="${tier}")].image}`,
        ])
      ).trim();
      // A hand-edited image means the record no longer names what runs; refuse to plan on it.
      if (running !== identity.images[tier]) {
        throw new Error(
          `${tier} runs ${running} but the release record says ${identity.images[tier]}`,
        );
      }
    }
    const backup = await backupImage();
    if (backup !== identity.images.backend) {
      throw new Error(
        `CronJob ${OBJECTS.backupCronJob} runs ${backup} but the release record says ` +
          identity.images.backend,
      );
    }
    return identity;
  }

  async function sourceRevision(unit: FluxUnit): Promise<string> {
    return (
      await kubectl([
        '-n',
        unit.namespace,
        'get',
        `gitrepositories.source.toolkit.fluxcd.io/${unit.gitRepository}`,
        '-o',
        'jsonpath={.status.artifact.revision}',
      ])
    ).trim();
  }

  async function fluxSuspended(unit: FluxUnit): Promise<boolean> {
    const value = await kubectl([
      '-n',
      unit.namespace,
      'get',
      `kustomizations.kustomize.toolkit.fluxcd.io/${unit.kustomization}`,
      '-o',
      'jsonpath={.spec.suspend}',
    ]);
    return value.trim() === 'true';
  }

  // Proof: a merge patch back to the writers selector left `puni.dev/writes: fenced` in
  // matchLabels on the live lab NetworkPolicy (writes stayed fenced after "reopen"); replacing
  // the whole selector restored exactly `app.kubernetes.io/name: wbs-backend` (verify.md).
  const selectorPatch = (selector: object): string =>
    JSON.stringify([{ op: 'replace', path: '/spec/podSelector', value: selector }]);
  const leaseManifest = (
    holder: string,
    journalPath: string,
    version: string | null,
    parked: string | null,
  ): Record<string, unknown> => {
    const now = new Date().toISOString().replace(/\.(\d{3})Z$/, '.$1000Z');
    return {
      apiVersion: 'coordination.k8s.io/v1',
      kind: 'Lease',
      metadata: {
        name: OBJECTS.lease,
        namespace: backend,
        ...(version === null ? {} : { resourceVersion: version }),
        annotations: {
          'puni.dev/journal': journalPath,
          ...(parked === null ? {} : { 'puni.dev/parked': parked }),
        },
      },
      spec: {
        holderIdentity: holder,
        leaseDurationSeconds: settings.leaseDurationSeconds,
        acquireTime: now,
        renewTime: now,
      },
    };
  };
  const writersSelector = { matchLabels: { 'app.kubernetes.io/name': 'wbs-backend' } };
  const fencedSelector = { matchLabels: { 'puni.dev/writes': 'fenced' } };

  return {
    currentRelease,
    async clusterUid() {
      return (
        await kubectl(['get', 'namespace', 'kube-system', '-o', 'jsonpath={.metadata.uid}'])
      ).trim();
    },
    async observeCluster(request) {
      const uid = (
        await kubectl(['get', 'namespace', 'kube-system', '-o', 'jsonpath={.metadata.uid}'])
      ).trim();
      const params = (await jsonOf([
        '-n',
        backend,
        'get',
        'configmap',
        OBJECTS.admissionParams,
      ])) as {
        data?: Record<string, string>;
      };
      const approved = params.data?.['solverImages'];
      if (approved === undefined)
        throw new Error(`${OBJECTS.admissionParams} approves no backend image`);
      // A recovery request inherits the suspension of the release it recovers.
      if (
        request.flux !== null &&
        request.recovers === null &&
        (await fluxSuspended(request.flux))
      ) {
        throw new Error(
          `Flux unit ${request.flux.kustomization} is already suspended by someone else`,
        );
      }
      return { uid, current: await currentRelease(), approvedBackendImages: approved.split(',') };
    },
    async readLease() {
      const found = await run(
        [...base, '-n', backend, 'get', 'lease', OBJECTS.lease, '-o', 'json'],
        null,
        callMs,
      );
      if (found.exitCode !== 0) {
        if (found.stderr.includes('NotFound')) return null;
        throw new Error(`reading the Lease failed: ${found.stderr.trim()}`);
      }
      return parseLease(found.stdout);
    },
    async createLease(holder, journalPath) {
      await kubectl(
        ['create', '-f', '-'],
        JSON.stringify(leaseManifest(holder, journalPath, null, null)),
      );
    },
    async takeoverLease(holder, version, journalPath) {
      await kubectl(
        ['replace', '-f', '-'],
        JSON.stringify(leaseManifest(holder, journalPath, version, null)),
      );
    },
    async renewLease(holder) {
      const observed = await this.readLease();
      if (observed?.holder !== holder) {
        throw new LeaseLostError(`Lease is held by ${observed?.holder ?? 'nobody'}, not ${holder}`);
      }
      await kubectl(
        ['replace', '-f', '-'],
        JSON.stringify(leaseManifest(holder, observed.journal ?? '', observed.version, null)),
      );
    },
    async parkLease(holder, phase) {
      const observed = await this.readLease();
      if (observed?.holder !== holder) return;
      await kubectl(
        ['replace', '-f', '-'],
        JSON.stringify(leaseManifest(holder, observed.journal ?? '', observed.version, phase)),
      );
    },
    async releaseLease(holder) {
      const observed = await this.readLease();
      if (observed === null) return;
      if (observed.holder !== holder) {
        throw new Error(`Lease is held by ${observed.holder}, not this coordinator; leaving it`);
      }
      await kubectl(['-n', backend, 'delete', 'lease', OBJECTS.lease]);
    },
    async fluxSourceRevision(unit) {
      return (
        await kubectl([
          '-n',
          unit.namespace,
          'get',
          `gitrepositories.source.toolkit.fluxcd.io/${unit.gitRepository}`,
          '-o',
          'jsonpath={.status.artifact.revision}',
        ])
      ).trim();
    },
    manualFluxResumeCommand(unit, revision) {
      const prefix = base.join(' ');
      return (
        `revert the deploy repository until GitRepository ${unit.namespace}/${unit.gitRepository} ` +
        `serves ${revision}, then: ${prefix} -n ${unit.namespace} patch ` +
        `kustomizations.kustomize.toolkit.fluxcd.io/${unit.kustomization} --type=merge ` +
        `-p '{"spec":{"suspend":false}}' && ${prefix} -n ${backend} delete lease ${OBJECTS.lease}`
      );
    },
    async admitBackendImages(images) {
      const value = images.join(',');
      await kubectl([
        '-n',
        backend,
        'patch',
        'configmap',
        OBJECTS.admissionParams,
        '--type=merge',
        '-p',
        JSON.stringify({ data: { solverImages: value } }),
      ]);
      const written = await kubectl([
        '-n',
        backend,
        'get',
        'configmap',
        OBJECTS.admissionParams,
        '-o',
        'jsonpath={.data.solverImages}',
      ]);
      if (written.trim() !== value) {
        throw new Error(`${OBJECTS.admissionParams} reads back ${written.trim()}, not ${value}`);
      }
    },
    async suspendFlux(unit) {
      await kubectl([
        '-n',
        unit.namespace,
        'patch',
        `kustomizations.kustomize.toolkit.fluxcd.io/${unit.kustomization}`,
        '--type=merge',
        '-p',
        '{"spec":{"suspend":true}}',
      ]);
      if (!(await fluxSuspended(unit)))
        throw new Error(`Flux unit ${unit.kustomization} did not report suspended`);
    },
    async resumeFlux(unit, revision) {
      const source = await this.fluxSourceRevision(unit);
      // Resuming onto any other source would let Flux apply digests this step did not choose.
      if (!source.endsWith(revision)) {
        throw new Error(`Flux source is at ${source}, not ${revision}`);
      }
      await kubectl([
        '-n',
        unit.namespace,
        'patch',
        `kustomizations.kustomize.toolkit.fluxcd.io/${unit.kustomization}`,
        '--type=merge',
        '-p',
        '{"spec":{"suspend":false}}',
      ]);
      await pollUntil(
        `Flux unit ${unit.kustomization} applying ${revision}`,
        settings.rolloutTimeoutSeconds * 1000,
        async () => {
          const applied = await kubectl([
            '-n',
            unit.namespace,
            'get',
            `kustomizations.kustomize.toolkit.fluxcd.io/${unit.kustomization}`,
            '-o',
            'jsonpath={.status.lastAppliedRevision}',
          ]);
          return applied.trim().endsWith(revision);
        },
      );
    },
    async closeWrites() {
      await kubectl([
        '-n',
        backend,
        'patch',
        'networkpolicy',
        OBJECTS.writersPolicy,
        '--type=json',
        '-p',
        selectorPatch(fencedSelector),
      ]);
    },
    async reopenWrites() {
      await kubectl([
        '-n',
        backend,
        'patch',
        'networkpolicy',
        OBJECTS.writersPolicy,
        '--type=json',
        '-p',
        selectorPatch(writersSelector),
      ]);
    },
    async drainGateway() {
      const start = Date.now();
      for (;;) {
        const probe = await run(
          [
            ...base,
            '-n',
            app,
            'exec',
            `deployment/${OBJECTS.deployments.gateway}`,
            '--',
            'wget',
            '-qO-',
            'http://127.0.0.1:3200/metrics/snapshot',
          ],
          null,
          callMs,
        );
        // An unreadable count is "cannot determine, keep draining", as in the swap's drain.
        const active =
          probe.exitCode === 0
            ? ((JSON.parse(probe.stdout) as { activeConnections?: number }).activeConnections ??
              Infinity)
            : Infinity;
        if (active <= 0) return;
        if (Date.now() - start > settings.drainTimeoutMs) {
          settings.log(
            `[k3s-release] gateway drain timed out with ${String(active)} sockets; they reconnect and replay`,
          );
          return;
        }
        await Bun.sleep(2000);
      }
    },
    async stopWriter() {
      await kubectl([
        '-n',
        backend,
        'scale',
        'deployment',
        OBJECTS.deployments.backend,
        '--replicas=0',
      ]);
      // Terminating pods still hold the database open; only an empty writer list proves none.
      await pollUntil(
        'every backend writer pod to exit',
        settings.rolloutTimeoutSeconds * 1000,
        async () => (await writerPods()).length === 0,
      );
    },
    async capture(releaseId, image) {
      return captureFromReport(
        await backendTask('capture', releaseId, image, {
          PUNI_TASK: 'capture',
          PUNI_RELEASE: releaseId,
          PUNI_SNAPSHOT_DIR: '/data/snapshots',
        }),
      );
    },
    async migrate(releaseId, image) {
      const report = await backendTask('migrate', releaseId, image, { PUNI_TASK: 'migrate' });
      return report.applied.map((row) => row.name);
    },
    async observeDownMigrations(releaseId, image) {
      const report = await backendTask('downs', releaseId, image, { PUNI_TASK: 'status' });
      return report.folders.flatMap((folder) =>
        folder.downSha256 === null ? [] : [{ name: folder.name, downSha256: folder.downSha256 }],
      );
    },
    async rollbackSchema(releaseId, image, baseline) {
      const report = await backendTask('rollback', releaseId, image, {
        PUNI_TASK: 'rollback',
        PUNI_BASELINE: baseline,
      });
      return report.applied.map((row) => row.name);
    },
    manualReopenCommand(releaseId) {
      const prefix = base.join(' ');
      return (
        `${prefix} -n ${backend} patch networkpolicy ${OBJECTS.writersPolicy} --type=json ` +
        `-p '${selectorPatch(writersSelector)}' && ${prefix} -n ${backend} delete lease ` +
        `${OBJECTS.lease} # only after the previous release is restored and verified; release ${releaseId}`
      );
    },
    manualSchemaCommand(releaseId, image, baseline) {
      const name = jobName('manual-rollback', releaseId);
      const path = join(settings.stateDir, `${name}.json`);
      writeFileSync(
        path,
        `${JSON.stringify(backendTaskJob(settings, name, image, { PUNI_TASK: 'rollback', PUNI_BASELINE: baseline }), null, 2)}\n`,
      );
      return `${settings.kubectl} --context ${settings.context} create -f ${path}`;
    },
    async rolloutBackend(image) {
      const writers = await writerPods();
      if (writers.length > 0) throw new Error(`writer pods still exist: ${writers.join(', ')}`);
      await rollout(backend, 'backend', image);
    },
    async rolloutTiers(identity) {
      await rollout(backend, 'backend', identity.images.backend);
      for (const tier of ['gateway', 'frontend', 'mcp'] as const)
        await rollout(app, tier, identity.images[tier]);
    },
    async smoke(releaseId, identity) {
      const name = jobName('smoke', releaseId);
      const logs = await runJob(name, app, smokeJob(settings, name, identity.images.gateway)).catch(
        (e: unknown) => {
          throw new Error(`smoke failed: ${messageOf(e)}`);
        },
      );
      settings.log(logs.trim());
    },
    async persistRelease(identity) {
      const record = releaseRecord(identity, backend);
      await kubectl(['apply', '-f', '-'], JSON.stringify(record));
    },
    async publishDesired(request) {
      const unit = request.flux;
      if (unit === null) return;
      const revision = await sourceRevision(unit);
      if (revision.endsWith(unit.desiredRevision)) return;
      const repository = settings.deployRepository ?? null;
      if (repository === null) {
        throw new Error(
          `Flux source is at ${revision}, not ${unit.desiredRevision}, and no deploy ` +
            'repository is configured to publish it',
        );
      }
      // Proof: deploy-repo.test.ts `refuses to publish the desired revision while the WBS unit
      // is not suspended`; with this guard removed the bare remote's branch moved to the
      // desired commit while Flux was live.
      if (!(await fluxSuspended(unit))) {
        throw new Error(
          `refusing to publish ${unit.desiredRevision}: Flux unit ${unit.kustomization} is ` +
            'not suspended, so it would apply the new release outside the transaction',
        );
      }
      await publishRevision(repository, unit.desiredRevision, unit.previousRevision);
      await kubectl([
        '-n',
        unit.namespace,
        'annotate',
        '--overwrite',
        `gitrepositories.source.toolkit.fluxcd.io/${unit.gitRepository}`,
        `reconcile.fluxcd.io/requestedAt=${new Date().toISOString()}`,
      ]);
      await pollUntil(
        `Flux source ${unit.gitRepository} serving ${unit.desiredRevision}`,
        settings.rolloutTimeoutSeconds * 1000,
        async () => (await sourceRevision(unit)).endsWith(unit.desiredRevision),
      );
    },
    async reconcileDesired(request) {
      if (request.flux !== null) {
        // Flux mode: persist-release published the release; resume-flux applies it.
        const revision = await sourceRevision(request.flux);
        if (!revision.endsWith(request.flux.desiredRevision)) {
          throw new Error(`Flux source is at ${revision}, not ${request.flux.desiredRevision}`);
        }
        return;
      }
      await kubectl(['apply', '-f', '-'], await renderOverlay(settings, request.release));
    },
  };
}

/** Renders `settings.overlay` with the release's digests substituted for the placeholder names. */
export async function renderOverlay(
  settings: Pick<KubectlSettings, 'kubectl' | 'overlay'>,
  identity: ReleaseIdentity,
): Promise<string> {
  const scratch = mkdtempSync(join(tmpdir(), 'wbs-k3s-render-'));
  try {
    const images = K8S_TIERS.map((tier) => {
      const [name, digest] = identity.images[tier].split('@');
      return `  - name: wbs-${tier}\n    newName: ${name}\n    digest: ${digest}\n`;
    }).join('');
    writeFileSync(
      join(scratch, 'kustomization.yaml'),
      `apiVersion: kustomize.config.k8s.io/v1beta1\nkind: Kustomization\nresources:\n  - ${relative(scratch, settings.overlay)}\nimages:\n${images}`,
    );
    const rendered = await run([settings.kubectl, 'kustomize', scratch], null, 60_000);
    if (rendered.exitCode !== 0) throw new Error(`kustomize failed: ${rendered.stderr.trim()}`);
    return rendered.stdout;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * Moves the deploy branch from `previous` to `desired`, and only from there. A branch already at
 * `desired` (a resumed run) is left alone; one anywhere else means someone else changed what
 * Flux will apply, and the push is refused rather than overwriting it.
 */
export async function publishRevision(
  repository: DeployRepository,
  desired: string,
  previous: string,
): Promise<void> {
  const git = (args: readonly string[]): Promise<Invocation> =>
    run(['git', '-C', repository.path, ...args], null, 120_000);
  const listed = await git(['ls-remote', repository.remote, `refs/heads/${repository.branch}`]);
  if (listed.exitCode !== 0) {
    throw new Error(`git ls-remote ${repository.remote} failed: ${listed.stderr.trim()}`);
  }
  const head = listed.stdout.trim().split(/\s+/)[0] ?? '';
  if (head === desired) return;
  // Proof: deploy-repo.test.ts `refuses to move a deploy branch someone else moved`; with this
  // comparison removed only the lease push refused, with an error naming neither commit.
  if (head !== previous) {
    throw new Error(
      `deploy branch ${repository.remote}/${repository.branch} is at ${head || '(absent)'}, ` +
        `not the previous release ${previous}; refusing to publish ${desired}`,
    );
  }
  const pushed = await git([
    'push',
    `--force-with-lease=refs/heads/${repository.branch}:${previous}`,
    repository.remote,
    `${desired}:refs/heads/${repository.branch}`,
  ]);
  if (pushed.exitCode !== 0) {
    throw new Error(`publishing ${desired} failed: ${pushed.stderr.trim()}`);
  }
}

/**
 * The `wbs-release` ConfigMap `persistRelease` writes: what later releases take as the running
 * release, and whose `sourceSha` the backup CronJob records. The cutover writes it once by hand.
 */
export function releaseRecord(
  identity: ReleaseIdentity,
  namespace = 'wbs-solver',
): Record<string, unknown> {
  return {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: { name: OBJECTS.releaseRecord, namespace },
    data: {
      releaseId: releaseIdOf(identity),
      sourceSha: identity.sourceSha,
      images: JSON.stringify(identity.images),
    },
  };
}
