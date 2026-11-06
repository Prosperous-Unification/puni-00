import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  statfsSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { Writable } from 'node:stream';

import { parseSecretsOrThrow, type } from '@shared/validation';
import {
  hostJobRunRecordAbsence,
  hostJobRunRecordLocator,
  resourceCleanupRequest,
  type ResourceRuntimeAdmission,
  resourceRuntimeAdmission,
  resourceRuntimeAdmissionReceipt,
  type ResourceRuntimeEvent as ResourceEvent,
  resourceRuntimeEvent,
  type ResourceRuntimeHostJobUse,
} from '@wbs/contracts';
import { Database } from 'bun:sqlite';

import type { WallClock } from '../clock';
import { ApiKey, type McpEndpoint, mcpEndpointOf } from '../mcp/machine-token';
import { type ToolAnswer, type WbsTools, WbsUnreachable } from '../mcp/wbs-tools';
import {
  chooseWaiter,
  EXCLUSIVE_ID,
  type JobTypeDescriptor,
  jobTypeDescriptor,
  POOL_DIMENSIONS,
  type PoolVector,
  TICKET_RECLAIM_AFTER_MS,
  vectorFits,
} from './host-pool';
import { readRunRecordStart, runRecordDigestOf } from './run-record-file';

const Identifier = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const Configuration = type({
  schemaVersion: '3',
  root: 'string',
  authorityId: Identifier,
  epoch: Identifier,
  providerId: Identifier,
  mcpResource: 'string',
  credential: 'string > 0',
  diskUnitBytes: 'number.integer > 0',
  diskBudgetUnits: 'number.integer > 0',
  workspaceSlots: 'number.integer > 0',
  headroomBytes: 'number.integer >= 0',
  cpuCores: 'number.integer > 0',
  memoryGib: 'number.integer > 0',
  headroom: type({
    cpuCores: 'number.integer >= 0',
    memoryGib: 'number.integer >= 0',
  }).onUndeclaredKey('reject'),
  exclusiveUnits: 'Record<string, string[]>',
  enrollmentId: Identifier,
  /**
   * The checkouts whose launchers run heavy jobs on this host (J12): `ops pool switch-mode
   * concurrent` verifies each carries `run_heavy_job` at HEAD. Not pinned by the binding: the
   * operator adds a checkout as the host gains one.
   */
  'launcherCheckouts?': 'string[]',
  /**
   * The job types that may run beside another host job in concurrent mode (J12, PR #816
   * review): a job is admitted beside unreleased compute only when its type and every running
   * type are listed; otherwise it waits, serialised as in observe mode. Absent means none.
   */
  'concurrencyEligible?': 'string[]',
}).onUndeclaredKey('reject');
export type ResourceConfiguration = Omit<
  typeof Configuration.infer,
  'credential' | 'mcpResource'
> & {
  /** WBS's MCP endpoint (`wbs-mcp-agent-surface` M9, M12): the runtime calls its tools. */
  endpoint: McpEndpoint;
  credential: ApiKey;
};

/** The three runtime routes as mcp-01's tools (`resource-runtime-shapes.ts`). */
const ADMISSION_TOOL = 'putApiResourceAuthoritiesByAuthorityIdAdmissions';
const EVENT_TOOL = 'putApiResourceAuthoritiesByAuthorityIdEvents';
const CLEANUP_REQUESTS_TOOL = 'getApiResourceAuthoritiesByAuthorityIdCleanupRequests';
/** mcp-01's reasons for an uncompleted call that a retry cannot change: the credential's. */
const REFUSING_REASONS = new Set(['machine_credential_refused', 'insufficient_scope']);

/**
 * WBS did not answer a runtime call, refused it `429`, or mcp-01 left it uncompleted for a
 * reason a retry may change: the durable outbox keeps the work, and `watch` retries.
 */
export class ResourceWbsUnavailable extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ResourceWbsUnavailable';
  }
}

/** WBS answered a runtime call with a refusal a retry cannot change by itself: `status` says which. */
export class ResourceWbsRefusal extends Error {
  public constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ResourceWbsRefusal';
  }
}

/**
 * How long a host-job event refused `400` stays a retry (S5-A20): an outgoing WBS without the
 * `resourceRuntimeUse` v2 union refuses it during a blue/green window, and every later outbox
 * event waits behind it, so the refusal is retried this long before it stops `watch`.
 */
export const HOST_JOB_REFUSAL_RETRY_MS = 30 * 60_000;

/**
 * The body of `tool`'s 2xx answer. `what` names the call in every refusal.
 * @throws ResourceWbsUnavailable when WBS did not answer, answered `429`, or mcp-01 left the call
 * uncompleted for a transient reason; {@link ResourceWbsRefusal} for any other refused answer,
 * which a retry cannot change by itself; a plain error for a refused credential and for an
 * answer that cannot be attributed.
 */
async function answeredBody(
  tools: WbsTools,
  tool: string,
  input: Readonly<Record<string, unknown>>,
  what: string,
): Promise<unknown> {
  let answer: ToolAnswer;
  try {
    answer = await tools.call(tool, input);
  } catch (cause) {
    if (cause instanceof WbsUnreachable)
      throw new ResourceWbsUnavailable(`${what}: WBS unreachable`, { cause });
    throw cause;
  }
  if (answer.kind === 'answered') return answer.body;
  if (answer.kind === 'refused') {
    const message = `${what} HTTP ${String(answer.status)}${answer.error === null ? '' : ` ${answer.error}`}`;
    if (answer.status === 429) throw new ResourceWbsUnavailable(message);
    throw new ResourceWbsRefusal(message, answer.status);
  }
  // Proof: retrying every uncompleted call made `stops on a refused credential`
  // (runtime-wbs.test.ts) answer ResourceWbsUnavailable; watched 2026-10-29.
  if (REFUSING_REASONS.has(answer.reason)) throw new Error(`${what} refused: ${answer.reason}`);
  throw new ResourceWbsUnavailable(`${what} not completed: ${answer.reason}`);
}
const Attribution = type({
  projectId: Identifier,
  resourceId: Identifier,
  workItemId: Identifier,
  agentRun: Identifier,
  responsiblePersonId: Identifier,
  units: 'number.integer > 0',
  'stepId?': Identifier,
  'attemptNumber?': 'number.integer > 0',
});
const Creation = type({
  '...': Attribution,
  kind: "'temporary_directory' | 'git_worktree'",
  diskUnits: 'number.integer > 0',
  'source?': 'string',
  'dependencies?': 'string[]',
  'parentId?': Identifier,
  'disposablePaths?': type(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/).array(),
}).onUndeclaredKey('reject');
export type CreationRequest = typeof Creation.infer;
export type ResourceState = 'creating' | 'active' | 'pending' | 'blocked' | 'retained' | 'released';
/** Linux boot and process start identity; numeric PIDs alone never establish ownership. */
interface ProcessIdentity {
  pid: number;
  boot: string;
  start: string;
}
/** Immutable identity and separately persisted execution, cleanup, and reservation evidence. */
export interface ResourceUse {
  id: string;
  incarnation: string;
  revision: number;
  state: ResourceState;
  locator: string;
  request: CreationRequest;
  dev: number | null;
  ino: number | null;
  creator: ProcessIdentity;
  process: ProcessIdentity | null;
  descendants: ProcessIdentity[];
  drainRequestedAt: number | null;
  launchDeadline: number | null;
  startedAt: number | null;
  endedAt: number | null;
  outcome: 'succeeded' | 'failed' | 'cancelled' | 'lost' | null;
  deleteIntent: boolean;
  sealed: boolean;
  cleanupAttempts: number;
  cleanupGeneration: number;
  nextRetryAt: number | null;
  reason: string;
  requestId?: number;
  retentionReviewAt?: number;
  releasedDiskUnits: number;
  releasedWorkspaceUnits: number;
  evidence: string | null;
  admission?: ResourceRuntimeAdmission;
}
const ProcessIdentityShape = type({
  pid: 'number.integer > 0',
  boot: 'string > 0',
  start: 'string > 0',
});
const ResourceUseShape = type({
  id: Identifier,
  incarnation: Identifier,
  revision: 'number.integer >= 0',
  state: "'creating'|'active'|'pending'|'blocked'|'retained'|'released'",
  locator: 'string > 0',
  request: Creation,
  dev: 'number | null',
  ino: 'number | null',
  creator: ProcessIdentityShape,
  process: ProcessIdentityShape.or('null'),
  descendants: ProcessIdentityShape.array(),
  drainRequestedAt: 'number | null',
  launchDeadline: 'number | null',
  startedAt: 'number | null',
  endedAt: 'number | null',
  outcome: "'succeeded'|'failed'|'cancelled'|'lost'|null",
  deleteIntent: 'boolean',
  sealed: 'boolean',
  cleanupAttempts: 'number.integer >= 0',
  cleanupGeneration: 'number.integer >= 0',
  nextRetryAt: 'number | null',
  reason: 'string',
  'requestId?': 'number.integer > 0',
  'retentionReviewAt?': 'number.integer > 0',
  releasedDiskUnits: 'number.integer >= 0',
  releasedWorkspaceUnits: 'number.integer >= 0',
  evidence: 'string | null',
  'admission?': resourceRuntimeAdmission,
}).onUndeclaredKey('reject');
export type { ResourceRuntimeEvent as ResourceEvent } from '@wbs/contracts';
export type { ProcessIdentity };

/**
 * One reservation entry of a host job (J2'): `held` while its evidence is outstanding,
 * `unknown` while the launcher is gone and the evidence is not yet terminal, `blocked` when the
 * evidence was read and refuses release, `released` once its terminal evidence committed.
 */
export interface HostJobEntry {
  state: 'held' | 'unknown' | 'blocked' | 'released';
  reason: string;
}
/** An exclusive unit held by a host job, with the commit its tree must rest at to return. */
export interface HostJobUnit extends HostJobEntry {
  exclusiveId: string;
  path: string;
  restingCommit: string;
}
/**
 * A use of kind `host_job` (J4): admitted host-locally from this ledger with no WBS call,
 * reserving its declared envelope; each entry settles on its own terminal evidence (J2').
 * `state` summarizes the entries: `starting` admitted but not launched, `held` launched,
 * `unknown` launcher gone with evidence outstanding, `blocked` an entry refused release.
 */
export interface HostJob {
  id: string;
  incarnation: string;
  revision: number;
  kind: 'host_job';
  descriptor: JobTypeDescriptor;
  label: string;
  state: 'starting' | 'held' | 'unknown' | 'blocked' | 'released';
  diskUnits: number;
  launcher: ProcessIdentity;
  process: ProcessIdentity | null;
  descendants: ProcessIdentity[];
  locator: string;
  dev: number | null;
  ino: number | null;
  /**
   * The random token {@link ResourceRuntime.prepareHostJob} wrote to {@link TMP_MARKER} in the
   * tmp directory: `rmdir` then `mkdir` can hand the same inode back, so device and inode alone
   * do not prove the directory is the one prepared (task 2.4, S6E-A1). Absent on a row
   * prepared before markers, which settles on device and inode as it always did (S6E-A2).
   */
  tmpMarker?: string;
  tmpDeleteIntent: boolean;
  admittedAt: number;
  launchDeadline: number;
  startedAt: number | null;
  endedAt: number | null;
  exitCode: number | null;
  /** Why the payload never ran though a launch was recorded; absent when it ran or is running. */
  launchFailure?: string;
  /**
   * Present on a calibration run (J9): it reserves the whole `allocatable` vector and every
   * exclusive unit of the pool, not its envelope, until each entry settles.
   */
  calibration?: true;
  /**
   * Present when the singleton guard's holder died while this job's compute was unreleased
   * (review H5): concurrent mode's guarantee against a stale launcher did not hold for it.
   */
  guardLost?: { at: number; holderPid: number | null };
  /**
   * What this job reserves while its entries are outstanding (J4, J9): cores and memory until
   * `compute` settles, disk units and slots until `tmpDisk` settles. The envelope, its tmp disk
   * and one slot for a run; the whole `allocatable` vector at admission for a calibration.
   * A ledger row written before slice 4's review fix has none and reads it from its descriptor.
   * `tmpDiskGib` is the disk charge in the GiB WBS is told (`resourceRuntimeUse` v2, S4-A18):
   * the envelope's for a run, the whole disk budget rounded down to GiB for a calibration.
   */
  reserved: HostJobReservation;
  compute: HostJobEntry;
  tmpDisk: HostJobEntry;
  units: HostJobUnit[];
  /** Consecutive settlements that ended `blocked`; the retry backoff counts from it. */
  settleAttempts: number;
  /** While `blocked`, the instant before which settlement re-reads no evidence. */
  nextSettleAt: number | null;
}
const HostJobEntryShape = type({
  state: "'held'|'unknown'|'blocked'|'released'",
  reason: 'string',
});
const HostJobShape = type({
  id: Identifier,
  incarnation: Identifier,
  revision: 'number.integer > 0',
  kind: "'host_job'",
  descriptor: jobTypeDescriptor,
  label: 'string > 0',
  state: "'starting'|'held'|'unknown'|'blocked'|'released'",
  diskUnits: 'number.integer >= 0',
  launcher: ProcessIdentityShape,
  process: ProcessIdentityShape.or('null'),
  descendants: ProcessIdentityShape.array(),
  locator: 'string > 0',
  dev: 'number | null',
  ino: 'number | null',
  'tmpMarker?': /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  tmpDeleteIntent: 'boolean',
  admittedAt: 'number',
  launchDeadline: 'number',
  startedAt: 'number | null',
  endedAt: 'number | null',
  exitCode: 'number.integer | null',
  'launchFailure?': 'string > 0',
  'calibration?': 'true',
  'guardLost?': type({ at: 'number', holderPid: 'number.integer > 0 | null' }).onUndeclaredKey(
    'reject',
  ),
  'reserved?': type({
    cpuCores: 'number.integer >= 0',
    memoryGib: 'number.integer >= 0',
    diskUnits: 'number.integer >= 0',
    workspaceSlots: 'number.integer >= 0',
    tmpDiskGib: 'number.integer >= 0',
  }).onUndeclaredKey('reject'),
  compute: HostJobEntryShape,
  tmpDisk: HostJobEntryShape,
  units: type({
    '...': HostJobEntryShape,
    exclusiveId: type(EXCLUSIVE_ID),
    path: 'string > 0',
    restingCommit: /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/,
  }).array(),
  settleAttempts: 'number.integer >= 0',
  nextSettleAt: 'number | null',
}).onUndeclaredKey('reject');

/** What a caller asks the host pool for; `descriptor` arrives through the catalogue port. */
export interface HostJobRequest {
  descriptor: JobTypeDescriptor;
  label: string;
  /** Seconds this caller waits for room; 0 refuses while any live ticket is ahead (J6). */
  waitSeconds: number;
  /**
   * A calibration run (J9): admitted only once the pool has drained (nothing reserved, no unit
   * of its type's ids held), then holding the whole `allocatable` vector and every
   * exclusive unit; the envelope's own size is not checked against `allocatable`.
   */
  calibration?: true;
}
const HostJobRequestShape = type({
  descriptor: jobTypeDescriptor,
  label: /^[ -~]{1,200}$/,
  waitSeconds: 'number.integer >= 0',
  'calibration?': 'true',
});
/** A waiting ticket as `status` and refusals name it. */
export interface HostJobTicket {
  sequence: number;
  label: string;
  type: string;
  pid: number;
  arrivedAt: number;
  deadline: number;
  overtakes: number;
  /** A calibration's ticket (J9), which waits for the pool to drain. */
  calibration: boolean;
}
/**
 * One poll's outcome. `refused` carries the exit code the delivery command returns: 73 for an
 * envelope the pool can never hold (no ticket was written), 75 for a spent wait budget, a
 * wait-zero caller with a live ticket ahead, or a ticket someone else reclaimed.
 */
export type HostJobAdmission =
  | { kind: 'admitted'; job: HostJob }
  | {
      kind: 'waiting';
      ahead: HostJobTicket[];
      /** Free units that cannot be handed out now: dirty, deleted or unreadable trees. */
      unavailableUnits: { path: string; reason: string }[];
      /** Present while concurrent mode waits for the singleton guard (J12), not for room. */
      awaiting?: 'singleton guard';
    }
  | { kind: 'refused'; exitCode: 73 | 75; reason: string };

/**
 * Whether every container a job declared is gone (J16): slice 3 reads Docker for it. Throws
 * when the reading is unavailable, which keeps the compute entry charged.
 */
export interface ContainerEvidence {
  containersGone(job: HostJob): boolean;
}
/**
 * The only container evidence the watch loop has before slice 3: a job that declared
 * `containers: none` has none to wait for; a declared bound stays charged until a reading.
 */
export const declaredContainersOnly: ContainerEvidence = {
  containersGone: (job) => job.descriptor.containers === 'none',
};

/** The two mechanisms a pool runs under (J12): the legacy queue as well, or the pool alone. */
export type HostPoolModeName = 'observe' | 'concurrent';

/** The label the singleton guard's legacy holder records in the shell lock (J12). */
export const GUARD_LABEL = 'dash-singleton';

/**
 * How long past its own deadline a ticket waits for the singleton guard in concurrent mode
 * (S6B-A5): `watch` takes the guard on its next tick once a ticket is queued, so a wait-zero
 * caller is not refused for the instant it takes the guard to arrive.
 */
export const GUARD_WAIT_MS = 15_000;

/**
 * The legacy holder through which the `resources watch` singleton holds the canonical flock in
 * concurrent mode (J12): its process identity, the lock path its holder record lives beside and
 * when it was recorded.
 */
export interface GuardHolder extends ProcessIdentity {
  lockPath: string;
  since: number;
}
const GuardHolderShape = type({
  '...': ProcessIdentityShape,
  lockPath: 'string > 0',
  since: 'number',
}).onUndeclaredKey('reject');

/** A `switch-mode` in progress: its process, target and operator; intake stays stopped while it lives. */
export interface ModeSwitch extends ProcessIdentity {
  target: HostPoolModeName;
  operator: string;
  since: number;
}
const ModeSwitchShape = type({
  '...': ProcessIdentityShape,
  target: "'observe'|'concurrent'",
  operator: 'string > 0',
  since: 'number',
}).onUndeclaredKey('reject');

/** One operator record of the pool's mode (J12): who, when, from and to, and what was verified. */
export interface ModeRecord {
  sequence: number;
  at: number;
  operator: string;
  account: string;
  action: 'switch' | 'release-guard';
  from: string;
  to: string;
  evidence: string[];
}
const ModeRecordShape = type({
  at: 'number',
  operator: 'string > 0',
  account: 'string > 0',
  action: "'switch'|'release-guard'",
  from: 'string > 0',
  to: 'string > 0',
  evidence: 'string[]',
}).onUndeclaredKey('reject');

/** Text with at least one non-space character: a drop's operator and reason. */
const NonBlank = /\S/;

/**
 * The last WBS refusal of one host-job outbox event (task 6.8a), kept durably beside the S5-A20
 * retry bound: which bytes (`digest`, the SHA-256 of the stored event), the status and message,
 * when it was first and last refused, how often. A publication WBS accepts deletes it.
 */
export interface OutboxRefusal {
  eventId: string;
  sequence: number;
  digest: string;
  status: number;
  error: string;
  firstRefusedAt: number;
  lastRefusedAt: number;
  refusals: number;
}

/**
 * One operator drop of a refused outbox event (task 6.8a): who and when, why, the event's
 * stored bytes and their SHA-256, the refusal that justified it, the event next in line and
 * how many later events took one sequence less.
 */
export interface OutboxDrop {
  sequence: number;
  at: number;
  operator: string;
  account: string;
  reason: string;
  eventId: string;
  eventSequence: number;
  useId: string;
  kind: string;
  digest: string;
  bytes: string;
  refusal: Omit<OutboxRefusal, 'eventId' | 'sequence' | 'digest'>;
  next: { eventId: string; sequence: number } | null;
  renumbered: number;
}
const OutboxDropShape = type({
  at: 'number',
  operator: NonBlank,
  account: 'string > 0',
  reason: NonBlank,
  eventId: 'string > 0',
  eventSequence: 'number.integer > 0',
  useId: 'string > 0',
  kind: 'string > 0',
  digest: /^[a-f0-9]{64}$/,
  bytes: 'string > 0',
  refusal: type({
    status: 'number.integer',
    error: 'string',
    firstRefusedAt: 'number',
    lastRefusedAt: 'number',
    refusals: 'number.integer > 0',
  }).onUndeclaredKey('reject'),
  next: type({ eventId: 'string > 0', sequence: 'number.integer > 0' })
    .onUndeclaredKey('reject')
    .or('null'),
  renumbered: 'number.integer >= 0',
}).onUndeclaredKey('reject');

/**
 * An outbox drop the ledger refuses (task 6.8a), before it changes anything: the event is not
 * in the outbox, not its head, not a host job's, carries no refusal of its current bytes, or a
 * later event of its own use still waits.
 */
export class OutboxDropRefusal extends Error {
  override readonly name = 'OutboxDropRefusal';
}

/** The pool's transition state as status shows it; `live` says whether the process still runs. */
export interface HostPoolTransition {
  mode: HostPoolModeName;
  guard: 'on' | 'released';
  /** A file in the legacy hold directory Dash did not write, or null (review H7). */
  holdCorruption: string | null;
  guardHolder: (GuardHolder & { live: boolean }) | null;
  switching: (ModeSwitch & { live: boolean }) | null;
}

/**
 * A mode change the pool refuses (J12): 64 a switch to the mode it is in or a guard already
 * released, 75 another switch in progress or a pool not drained.
 */
export class HostPoolModeRefusal extends Error {
  override readonly name = 'HostPoolModeRefusal';
  constructor(
    readonly exitCode: 64 | 75,
    message: string,
  ) {
    super(message);
  }
}

/** The host pool as `ops job status` reads it: mode, budget, reservations, jobs and waiters. */
export interface HostPoolStatus extends HostPoolTransition {
  enrollmentId: string;
  allocatable: PoolVector;
  reserved: PoolVector;
  units: { exclusiveId: string; path: string; heldBy: string | null }[];
  jobs: HostJob[];
  waiters: HostJobTicket[];
  modeRecords: ModeRecord[];
}

/** What one host job reserves (J4, J9): the pool vector, and its disk charge in GiB for WBS. */
export interface HostJobReservation extends PoolVector {
  tmpDiskGib: number;
}

/** The fields of a `host_job_events` row its move to the authority outbox reads. */
const HostJobChangeShape = type({
  jobId: Identifier,
  revision: 'number.integer > 0',
  kind: "'admitted'|'launched'|'settlement'",
  observedAt: 'number.integer >= 0',
  state: "'starting'|'held'|'unknown'|'blocked'|'released'",
});

/**
 * A host job as WBS sees it (`resourceRuntimeUse` v2, J10): no planning link, since the pool
 * admitted it alone; one reservation entry per dimension of the declared envelope, an exclusive
 * id once per unit it names; the pool's enrollment as its host. The launcher records no payload
 * checkout HEAD on the job yet, so `launcherSha` is null. Built from immutable fields, so `registered` and
 * `release_verified` carry the same declaration.
 */
function hostJobDeclaration(job: HostJob, host: string): ResourceRuntimeHostJobUse {
  // What the job reserved, persisted at admission, not its envelope: a calibration charges the
  // whole pool and every unit of its type's ids (S4-A18). Both are immutable per job, so
  // `registered` and `release_verified` still carry one declaration.
  // Proof: reading the envelope here made `a calibration projects the whole allocatable
  // vector` (host-job-publication.test.ts) declare the build's 2 cores (2026-11-02, Slice 4).
  const { reserved } = job;
  const exclusive = new Map<string, number>();
  for (const unit of job.units)
    exclusive.set(unit.exclusiveId, (exclusive.get(unit.exclusiveId) ?? 0) + 1);
  return {
    kind: 'host_job',
    type: job.descriptor.id,
    label: job.label,
    host,
    launcherSha: null,
    reservations: [
      { dimension: 'cpuCores', units: reserved.cpuCores },
      { dimension: 'memoryGib', units: reserved.memoryGib },
      { dimension: 'tmpDiskGib', units: reserved.tmpDiskGib },
      ...[...exclusive].map(([dimension, units]) => ({ dimension, units })),
    ],
  };
}

/**
 * The token in a tmp directory's {@link TMP_MARKER}, or null when it is absent, a symlink, not a
 * regular file or hard-linked: each of those means the directory is not the one prepared.
 * @throws on any other read failure, which is not evidence of replacement.
 */
function readTmpMarker(directory: string): string | null {
  let descriptor;
  try {
    descriptor = openSync(
      join(directory, TMP_MARKER),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
  } catch (cause) {
    if (isMissing(cause) || (cause instanceof Error && 'code' in cause && cause.code === 'ELOOP'))
      return null;
    throw cause;
  }
  try {
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.nlink !== 1 || opened.size > 64) return null;
    return readFileSync(descriptor, 'utf8');
  } finally {
    closeSync(descriptor);
  }
}

/** What a settlement event reports: entries, state and the evidence identities. */
function settlementOf(job: HostJob): string {
  return JSON.stringify([
    job.state,
    job.compute,
    job.tmpDisk,
    job.units,
    job.process,
    job.descendants,
    job.tmpDeleteIntent,
  ]);
}

/** The ledger schema this Dash writes; {@link ResourceRuntime.open} steps 0, 1 and 2 forward to it. */
const LEDGER_VERSION = 3;
const LEDGER_V0_TABLES = ['binding', 'cursor', 'events', 'sqlite_sequence', 'uses'];
const LEDGER_V1_TABLES = [
  'binding',
  'cursor',
  'events',
  'host_job_events',
  'host_job_tickets',
  'host_jobs',
  'host_pool',
  'sqlite_sequence',
  'uses',
];
/** What each version step adds, by the version it starts from; the migration line names them. */
const LEDGER_STEPS = ['host pool', 'mode lifecycle', 'outbox refusals and drop journal'];
const LEDGER_V2_TABLES = [...LEDGER_V1_TABLES, 'host_pool_mode_records'].sort();
/**
 * Version 3 (`dash-host-jobs` task 6.8a): the last WBS refusal of each host-job outbox event
 * (S5-A20) and the operator's journal of dropped events ({@link ResourceRuntime.dropRefusedEvent}).
 */
const OUTBOX_REPAIR_SCHEMA =
  'CREATE TABLE event_refusals (event_id TEXT PRIMARY KEY, sequence INTEGER NOT NULL, digest TEXT NOT NULL, status INTEGER NOT NULL, error TEXT NOT NULL, first_refused_at INTEGER NOT NULL, last_refused_at INTEGER NOT NULL, refusals INTEGER NOT NULL); CREATE TABLE dropped_events (sequence INTEGER PRIMARY KEY AUTOINCREMENT, record TEXT NOT NULL)';
/**
 * Version 2 (`dash-host-jobs` J12): the singleton guard's state and holder, the fence of a
 * `switch-mode` in progress, and the operator's mode records. A ledger reaching version 2 from
 * observe mode keeps it; the guard starts on, so the first flip to concurrent holds it.
 */
const HOST_POOL_TRANSITION_SCHEMA =
  "ALTER TABLE host_pool ADD COLUMN guard TEXT NOT NULL DEFAULT 'on' CHECK(guard IN ('on','released')); ALTER TABLE host_pool ADD COLUMN guard_holder TEXT; ALTER TABLE host_pool ADD COLUMN switching TEXT; ALTER TABLE host_pool ADD COLUMN hold_corruption TEXT; CREATE TABLE host_pool_mode_records (sequence INTEGER PRIMARY KEY AUTOINCREMENT, record TEXT NOT NULL)";
const HOST_POOL_SCHEMA =
  "CREATE TABLE host_jobs (id TEXT PRIMARY KEY, snapshot TEXT NOT NULL); CREATE TABLE host_job_tickets (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, label TEXT NOT NULL, request TEXT NOT NULL, pid INTEGER NOT NULL, boot TEXT NOT NULL, start TEXT NOT NULL, arrived_at INTEGER NOT NULL, deadline INTEGER NOT NULL, overtakes INTEGER NOT NULL DEFAULT 0); CREATE TABLE host_job_events (sequence INTEGER PRIMARY KEY AUTOINCREMENT, event TEXT NOT NULL, published INTEGER NOT NULL DEFAULT 0); CREATE TABLE host_pool (id INTEGER PRIMARY KEY CHECK(id=1), mode TEXT NOT NULL CHECK(mode IN ('observe','concurrent'))); INSERT INTO host_pool VALUES (1,'observe')";
interface TicketRow {
  sequence: number;
  id: string;
  label: string;
  request: string;
  pid: number;
  boot: string;
  start: string;
  arrived_at: number;
  deadline: number;
  overtakes: number;
}
const GIB = 1073741824;
/** Read trusted credentials without following links, exposing JSON parser excerpts, or defaulting missing state. */
export function loadResourceConfiguration(path: string): ResourceConfiguration {
  const descriptor = openSync(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  let source: string;
  try {
    const opened = fstatSync(descriptor);
    // Proof: bypassing ownership/mode validation failed `configuration is owner-only` (runtime-mutations/owner-only-config.log).
    if (!opened.isFile() || opened.uid !== process.getuid?.() || (opened.mode & 0o077) !== 0)
      throw new Error('resource configuration must be an owner-only regular file');
    if (opened.size > 65536) throw new Error('resource configuration too large');
    source = readFileSync(descriptor, 'utf8');
  } finally {
    closeSync(descriptor);
  }
  let input: unknown;
  try {
    input = JSON.parse(source);
  } catch {
    // No cause: a JSON syntax error quotes the bytes around it, which may be the credential.
    throw new Error('resource configuration malformed: not JSON');
  }
  // Schema 1 named a `wbsOrigin` for `/api`, which refuses machine bearers since
  // `wbs-mcp-agent-surface` M9; its owner needs to know what to write instead.
  // Proof: without it, `refuses schema 1, saying what to write instead` (runtime-wbs.test.ts)
  // saw only the field list (2026-10-30).
  if (
    typeof input === 'object' &&
    input !== null &&
    'schemaVersion' in input &&
    input.schemaVersion === 1
  )
    throw new Error(
      "resource configuration malformed: schemaVersion 1 is retired; write schemaVersion 3 with mcpResource (WBS's MCP endpoint) in place of wbsOrigin and the host pool fields",
    );
  // Schema 2 had no host pool (`dash-host-jobs` J4): refused, not defaulted, because a pool's
  // budgets and units are the owner's statement about the host and the ledger pins them.
  // Proof: without it, `refuses schema 2, naming the host pool fields` (host-jobs.test.ts)
  // saw only `Validation failed for schemaVersion` (2026-11-01, verify.md Slice 2).
  if (
    typeof input === 'object' &&
    input !== null &&
    'schemaVersion' in input &&
    input.schemaVersion === 2
  )
    throw new Error(
      'resource configuration malformed: schemaVersion 2 has no host pool; write schemaVersion 3 adding cpuCores, memoryGib, headroom {cpuCores, memoryGib}, exclusiveUnits and enrollmentId',
    );
  let parsed: typeof Configuration.infer;
  try {
    parsed = parseSecretsOrThrow(Configuration, input);
  } catch (cause) {
    // `parseSecretsOrThrow` names the failing field paths, never a value, so its error is safe
    // to keep as the cause.
    // Proof: a bare `malformed` made `names the failing fields, never the credential` fail
    // (2026-10-30).
    const fields = cause instanceof Error ? cause.message : 'the value itself';
    throw new Error(`resource configuration malformed: ${fields}`, { cause });
  }
  let resource: URL;
  try {
    resource = new URL(parsed.mcpResource);
  } catch {
    throw new Error('resource MCP endpoint malformed');
  }
  if (
    (resource.protocol !== 'https:' &&
      !(
        resource.protocol === 'http:' &&
        ['127.0.0.1', 'localhost', '[::1]'].includes(resource.hostname)
      )) ||
    resource.username ||
    resource.password ||
    resource.search ||
    resource.hash
  )
    throw new Error(
      'resource MCP endpoint must be HTTPS or loopback HTTP without credentials, query or fragment',
    );
  if (!Number.isSafeInteger(parsed.diskUnitBytes * parsed.diskBudgetUnits))
    throw new Error('resource budget exceeds safe integer range');
  checkRoot(parsed.root);
  checkPoolShape(parsed);
  const { mcpResource, credential, ...settings } = parsed;
  return {
    ...settings,
    endpoint: mcpEndpointOf(mcpResource),
    credential: ApiKey.of(credential, 'resource configuration credential'),
  };
}

/**
 * The host pool's statement without touching the host: headroom below each budget, exclusive
 * ids as {@link EXCLUSIVE_ID}, each unit an absolute normalized path outside the managed root,
 * no path named twice across all ids. {@link checkHostFacts} checks the host at init.
 */
function checkPoolShape(parsed: typeof Configuration.infer): void {
  // Proof: each refusal in this function, removed, let its row of `the pool shape refuses each
  // malformed statement` (host-jobs.test.ts) load (2026-11-01, verify.md Slice 2).
  if (parsed.headroom.cpuCores >= parsed.cpuCores || parsed.headroom.memoryGib >= parsed.memoryGib)
    throw new Error('host pool headroom must leave at least one core and one GiB allocatable');
  const seen = new Set<string>();
  for (const [id, paths] of Object.entries(parsed.exclusiveUnits)) {
    if (!EXCLUSIVE_ID.test(id)) throw new Error(`host pool exclusive id ${id} malformed`);
    if (paths.length === 0)
      throw new Error(`host pool exclusive id ${id} names no unit; name one or omit the id`);
    for (const path of paths) {
      if (!isAbsolute(path) || resolve(path) !== path)
        throw new Error(`host pool unit ${path} must be an absolute normalized path`);
      if (samePath(path, parsed.root) || samePath(parsed.root, path))
        throw new Error(`host pool unit ${path} overlaps the managed root`);
      // Proof: without it, `init refuses duplicate unit paths, by name and by alias`
      // (host-jobs.test.ts) loaded a pool naming one tree twice (2026-11-01, verify.md Slice 2).
      if (seen.has(path)) throw new Error(`host pool unit ${path} is named twice`);
      seen.add(path);
    }
  }
  const eligible = new Set<string>();
  for (const id of parsed.concurrencyEligible ?? []) {
    // Proof: without either refusal `the pool shape refuses each malformed statement`
    // (host-jobs.test.ts) loaded its concurrency-eligibility row (2026-11-02, Slice 6b).
    if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(id))
      throw new Error(`host pool concurrency-eligible type ${id} is not a job type id`);
    if (eligible.has(id))
      throw new Error(`host pool concurrency-eligible type ${id} is named twice`);
    eligible.add(id);
  }
  const launchers = new Set<string>();
  for (const path of parsed.launcherCheckouts ?? []) {
    // Proof: without either refusal `the pool shape refuses each malformed statement`
    // (host-jobs.test.ts) loaded its launcher-checkout row (2026-11-02, Slice 6b).
    if (!isAbsolute(path) || resolve(path) !== path)
      throw new Error(`host pool launcher checkout ${path} must be an absolute normalized path`);
    if (launchers.has(path)) throw new Error(`host pool launcher checkout ${path} is named twice`);
    launchers.add(path);
  }
}

/** What init checks a host pool's budgets against; {@link linuxHostFacts} reads the machine. */
export interface HostFacts {
  /** The cores this process may run on (`nproc`). */
  cpuCores(): number;
  /** `MemTotal` in GiB. */
  memoryGib(): number;
}
/** `nproc` and `/proc/meminfo`; an unreadable or malformed `MemTotal` throws. */
export const linuxHostFacts: HostFacts = {
  cpuCores: () => availableParallelism(),
  memoryGib: () => {
    const line = /^MemTotal:\s+(\d+) kB$/m.exec(readFileSync('/proc/meminfo', 'utf8'));
    if (!line?.[1]) throw new Error('host memory unreadable: /proc/meminfo has no MemTotal');
    return Number(line[1]) / 1048576;
  },
};

/**
 * The pool against the machine, at init: budgets within `nproc` and `MemTotal`, and every unit
 * a canonical, distinct directory that is the top of a Git work tree. Settlement can verify
 * only a Git tree's resting commit (J2'); a unit of another kind has no evidence and is refused.
 */
function checkHostFacts(configuration: ResourceConfiguration, host: HostFacts): void {
  const cores = host.cpuCores();
  // Proof: without these, `init refuses a budget above MemTotal and nproc` (host-jobs.test.ts)
  // initialized a ledger promising 1048576 GiB (2026-11-01, verify.md Slice 2).
  if (configuration.cpuCores > cores)
    throw new Error(
      `host pool cpuCores ${String(configuration.cpuCores)} exceeds this host's ${String(cores)}`,
    );
  const memory = host.memoryGib();
  if (configuration.memoryGib > memory)
    throw new Error(
      `host pool memoryGib ${String(configuration.memoryGib)} exceeds this host's MemTotal ${memory.toFixed(1)} GiB`,
    );
  const identities = new Set<string>();
  for (const path of Object.values(configuration.exclusiveUnits).flat()) {
    if (realpathSync(path) !== path) throw new Error(`host pool unit ${path} is not canonical`);
    const identity = statSync(path);
    // Proof: removed, the not-a-directory refusal fell through to "not the top of a Git work
    // tree", and the inode-duplicate refusal to the bind mount's "held: mounted target" in
    // `init refuses each unit the host cannot hand out` (host-jobs.test.ts); both still refuse
    // by a second guard, these name the fault (2026-11-01, verify.md Slice 2).
    if (!identity.isDirectory()) throw new Error(`host pool unit ${path} is not a directory`);
    const key = `${String(identity.dev)}:${String(identity.ino)}`;
    if (identities.has(key)) throw new Error(`host pool unit ${path} is named twice`);
    identities.add(key);
    let top: string;
    try {
      top = git(['-C', path, 'rev-parse', '--show-toplevel']);
    } catch (cause) {
      throw new Error(`host pool unit ${path} is not the top of a Git work tree`, { cause });
    }
    if (top !== path) throw new Error(`host pool unit ${path} is not the top of a Git work tree`);
    // A unit enters the pool at rest: clean and held by no process, as settlement returns it.
    // Proof: without these, `init refuses each unit the host cannot hand out`
    // (host-jobs.test.ts) enrolled a tree with stray.txt and one a live process worked in
    // (2026-11-01, verify.md Slice 2).
    if (git(['-C', path, 'status', '--porcelain', '--untracked-files=all']) !== '')
      throw new Error(`host pool unit ${path} is not clean`);
    try {
      // Proof: inspecting with no initializer scope made `pool init succeeds beside a non-dumpable
      // process that predates it` (resource-holds.test.ts) refuse "cannot inspect process PID"
      // (2026-11-02, J19).
      inspectHolds(path, initScopeOf(path));
    } catch (cause) {
      throw new Error(
        `host pool unit ${path} is held: ${cause instanceof Error ? cause.message : 'unreadable'}`,
        {
          cause,
        },
      );
    }
  }
}

/** Dedicated canonical directory required; broad host roots and symlink aliases cannot become managed pools. */
function checkRoot(root: string): void {
  if (process.platform !== 'linux') throw new Error('resources require Linux procfs');
  if (
    !isAbsolute(root) ||
    realpathSync(root) !== root ||
    root.split('/').filter(Boolean).length < 2 ||
    ['/tmp', '/home', '/var', '/usr', '/etc', '/run', process.env['HOME']].includes(root)
  )
    throw new Error('resource root must be a dedicated canonical directory');
  const identity = lstatSync(root);
  if (
    !identity.isDirectory() ||
    identity.uid !== process.getuid?.() ||
    (identity.mode & 0o077) !== 0
  )
    throw new Error('resource root must be owner-only');
}

/** Missing processes are expected; inaccessible or malformed procfs evidence is a refusal. */
export function identifyProcess(pid: number): ProcessIdentity | null {
  let source: string;
  try {
    source = readFileSync(`/proc/${String(pid)}/stat`, 'utf8');
  } catch (cause) {
    if (isMissing(cause)) return null;
    throw new Error('process identity inspection unavailable', { cause });
  }
  const fields = source.slice(source.lastIndexOf(')') + 2).split(' ');
  const start = fields[19];
  if (!start) throw new Error('process identity malformed');
  if (fields[0] === 'Z') return null;
  return { pid, boot: readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim(), start };
}
/** The kernel's `PF_EXITING` task flag, field 9 of `/proc/<pid>/stat`. */
const PF_EXITING = 0x4;

/**
 * Whether the process `pid` holds nothing any more because it is leaving: its `/proc` entry is
 * gone, it is dead (`X`), or it is a zombie (`Z`) or in `do_exit` (`PF_EXITING`) with no other
 * thread in its group. Such a process has dropped or is dropping its memory, and the kernel then
 * refuses its `fd` directory (EACCES) and its `cwd` link, so without this J19 counts it as an
 * uninspectable holder (slice 6c: `cannot inspect process PID 571 (wc)` in CI). A group leader
 * that exited while other threads run is a zombie too, and those threads still hold its
 * descriptors: it is not gone.
 * @throws Error when its state or thread list is unreadable for a reason other than its exit.
 */
export function processGone(pid: string): boolean {
  return inspectionRoot(pid) === null;
}

/**
 * Where to read the process `pid`'s cwd, descriptors and maps, or null when it is gone
 * ({@link processGone}). While its leader runs, `/proc/<pid>`. While the leader is leaving
 * beside a live thread, that thread's `/proc/<pid>/task/<tid>`: the descriptor table, cwd and
 * memory belong to the whole group, and the leaving leader's are refused (EACCES), unreadable or
 * empty. So the live thread's view is a real inspection where the leader's would be a guess
 * (review P1 of 63a070156: an `exit_group` leaves siblings running for a moment).
 * @throws Error when a state or the thread list is unreadable for a reason other than an exit.
 */
export function inspectionRoot(pid: string): string | null {
  const own = taskLeaving(`/proc/${pid}/stat`);
  if (own === 'gone') return null;
  if (own === 'live') return `/proc/${pid}`;
  let tasks: string[];
  try {
    tasks = readdirSync(`/proc/${pid}/task`);
  } catch (cause) {
    if (isMissing(cause)) return null;
    throw new Error(`thread inspection unavailable for PID ${pid}`, { cause });
  }
  // A group exit takes every thread down; a leader that called `pthread_exit` leaves live ones.
  // Proof: answering null here for every leaving leader made `a group leader that exited beside
  // a live thread still holds` (resource-holds.test.ts) see it gone (verify.md Slice 6c,
  // 6c-F19); answering the leader's own path made `a leaving leader is inspected through its
  // live thread` (leaving-holds.test.ts) refuse `cannot inspect process` (6c-F20).
  const live = tasks.find(
    (task) => task !== pid && taskLeaving(`/proc/${pid}/task/${task}/stat`) === 'live',
  );
  return live === undefined ? null : `/proc/${pid}/task/${live}`;
}

/**
 * One task's state from its `stat` file: `gone` (missing or `X`), `leaving` (`Z`, or `PF_EXITING`
 * set by `do_exit`) or `live`.
 * @throws Error when the file is unreadable for another reason or malformed.
 */
function taskLeaving(path: string): 'gone' | 'leaving' | 'live' {
  let stat: string;
  try {
    stat = readFileSync(path, 'utf8');
  } catch (cause) {
    if (isMissing(cause)) return 'gone';
    throw new Error(`process state inspection unavailable at ${path}`, { cause });
  }
  const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
  const state = fields[0];
  const flags = Number(fields[6]);
  if (!state || !Number.isSafeInteger(flags)) throw new Error(`process state at ${path} malformed`);
  if (state === 'X') return 'gone';
  // Proof: with zombie and exit detection removed (`'live'` for every state but `X`),
  // `an unreaped zombie holds nothing` (resource-holds.test.ts) saw it hold (verify.md Slice 6c,
  // 6c-F18).
  return state === 'Z' || (flags & PF_EXITING) !== 0 ? 'leaving' : 'live';
}

/**
 * `pid`'s identity from its `stat` whatever its state, zombie included, or null once it is gone.
 * @throws Error when the file is unreadable for another reason or malformed.
 */
function statIdentity(pid: string): ProcessIdentity | null {
  let source: string;
  try {
    source = readFileSync(`/proc/${pid}/stat`, 'utf8');
  } catch (cause) {
    if (isMissing(cause)) return null;
    throw new Error('process identity inspection unavailable', { cause });
  }
  const start = source.slice(source.lastIndexOf(')') + 2).split(' ')[19];
  if (!start) throw new Error('process identity malformed');
  return {
    pid: Number(pid),
    boot: readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim(),
    start,
  };
}

function isMissing(cause: unknown): boolean {
  return (
    cause instanceof Error && 'code' in cause && (cause.code === 'ENOENT' || cause.code === 'ESRCH')
  );
}
/** Whether `identity` (this process's, read now) is the process `recorded` names. */
function sameProcess(identity: ProcessIdentity | null, recorded: ProcessIdentity): boolean {
  return (
    identity?.pid === recorded.pid &&
    identity.boot === recorded.boot &&
    identity.start === recorded.start
  );
}
/** Whether the process `identity` names still runs (pid, boot and start all match). */
export function processAlive(identity: ProcessIdentity): boolean {
  return alive(identity);
}
function alive(identity: ProcessIdentity): boolean {
  const current = identifyProcess(identity.pid);
  return current !== null && current.boot === identity.boot && current.start === identity.start;
}
/** A surviving member of the launched session still owns write capability after its leader exits. */
function ownedGroupAlive(identity: ProcessIdentity): boolean {
  if (alive(identity)) return true;
  if (readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim() !== identity.boot)
    return false;
  for (const pid of readdirSync('/proc').filter((name) => /^\d+$/.test(name))) {
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      if (fields[0] !== 'Z' && fields[3] === String(identity.pid)) return true;
    } catch (cause) {
      if (!isMissing(cause)) throw new Error('owned session inspection unavailable', { cause });
    }
  }
  return false;
}
/** Read one process/session observation without accepting a recycled PID as the stored identity. */
function sessionOf(identity: ProcessIdentity): string | null {
  if (!alive(identity)) return null;
  try {
    const stat = readFileSync(`/proc/${String(identity.pid)}/stat`, 'utf8');
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    return fields[0] !== 'Z' && fields[19] === identity.start ? (fields[3] ?? null) : null;
  } catch (cause) {
    if (isMissing(cause)) return null;
    throw new Error('process session inspection unavailable', { cause });
  }
}
/** A launched process group as both a managed use and a host job record it. */
interface OwnedGroup {
  process: ProcessIdentity | null;
  descendants: ProcessIdentity[];
}
/** Add session members only while an exact previously known identity brackets the observation. */
function captureDescendants(use: OwnedGroup): ProcessIdentity[] {
  const leader = use.process;
  if (leader === null) return use.descendants;
  const witnesses = [leader, ...use.descendants].filter(
    (identity) => sessionOf(identity) === String(leader.pid),
  );
  // Proof: removing both witness checks made the unknown-child regression adopt and kill
  // an identity it could not prove (runtime-review-round1-mutations/session-witness.log).
  if (witnesses.length === 0) return use.descendants;
  const observed: ProcessIdentity[] = [];
  for (const pid of readdirSync('/proc').filter((name) => /^\d+$/.test(name))) {
    try {
      if (statSync(`/proc/${pid}`).uid !== process.getuid?.()) continue;
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      const start = fields[19];
      if (fields[0] !== 'Z' && fields[3] === String(leader.pid) && Number(pid) !== leader.pid) {
        if (!start) throw new Error('descendant identity malformed');
        observed.push({ pid: Number(pid), boot: leader.boot, start });
      }
    } catch (cause) {
      if (!isMissing(cause)) throw new Error('descendant inspection unavailable', { cause });
    }
  }
  if (!witnesses.some((identity) => sessionOf(identity) === String(leader.pid)))
    return use.descendants;
  const unique = new Map(
    [...use.descendants, ...observed].map((identity) => [
      `${identity.boot}:${String(identity.pid)}:${identity.start}`,
      identity,
    ]),
  );
  if (unique.size > 4096)
    throw new Error('owned descendant evidence exceeds bounded inspection budget');
  return [...unique.values()];
}
/** pidfds bind signals to kernel process identities across the final check/send race. */
const signalProcesses = String.raw`
import os,signal,sys,json
identities=json.load(sys.stdin)
boot=open('/proc/sys/kernel/random/boot_id').read().strip()
def matches(identity):
 try:
  stat=open('/proc/'+str(identity['pid'])+'/stat').read()
  fields=stat[stat.rfind(')')+2:].split(' ')
  # Proof: skipping start identity killed the unrelated live-PID canary (pid-start-identity.log).
  return fields[0]!='Z' and fields[19]==identity['start'] and boot==identity['boot']
 except (FileNotFoundError,ProcessLookupError): return False
for identity in identities:
 if not matches(identity): continue
 try: descriptor=os.pidfd_open(identity['pid'])
 except ProcessLookupError: continue
 try:
  if matches(identity):
   try: signal.pidfd_send_signal(descriptor,getattr(signal,sys.argv[1]))
   except ProcessLookupError: pass
 finally: os.close(descriptor)
`;
/** A known survivor or an unknown member of the original session still prevents release. */
function ownedProcessesAlive(use: OwnedGroup): boolean {
  return (use.process !== null && ownedGroupAlive(use.process)) || use.descendants.some(alive);
}
function samePath(path: string, parent: string): boolean {
  return path === parent || path.startsWith(`${parent}/`);
}
function git(arguments_: string[], input?: string): string {
  const execution = Bun.spawnSync(['git', ...arguments_], {
    stdin: input === undefined ? 'ignore' : Buffer.from(input),
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_TERMINAL_PROMPT: '0',
    },
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 30000,
    killSignal: 'SIGKILL',
  });
  if (execution.exitCode !== 0) {
    // Name the tree and subcommand, never stdin or stderr, which may quote file contents.
    const tree = arguments_[0] === '-C' ? ` in ${arguments_[1] ?? '?'}` : '';
    const subcommand = arguments_.find(
      (argument, index) => index > (arguments_[0] === '-C' ? 1 : -1) && !argument.startsWith('-'),
    );
    throw new Error(`Git provider operation refused: git ${subcommand ?? '?'}${tree}`);
  }
  return execution.stdout.toString().trim();
}

/**
 * What a hold inspection compares a same-user process whose descriptors are unreadable with
 * (`dash-host-jobs` slice 3 reviews F1, R1, decision J19): the cgroup components and process
 * sessions that make it Dash-owned, the identity nothing the owner made can predate, what a
 * refusal says may be held and its remedy, and the processes recorded as outside.
 */
export interface HoldScope {
  /** Whether one component of a process's cgroup v2 path is a Dash-owned scope. */
  owns: (component: string) => boolean;
  /** Session ids (leader pids) of Dash-owned process groups. */
  sessions: ReadonlySet<string>;
  before: ProcessIdentity;
  /**
   * The cgroup v2 path of the Dash process that owns this inspection's work, when that work can
   * share its login session (managed uses, pool init); null for a host job, whose payload never
   * runs in a login session (J19 amendment, review G2).
   */
  ownCgroup: string | null;
  /** The object of `which may hold …` in a refusal. */
  held: string;
  remedy: string;
  outside: { pid: number; comm: string; start: bigint }[];
}

/** A Dash host job's transient scope, as `ops job run` names it: `dash-job-<id>.scope`. */
const DASH_JOB_SCOPE = /^dash-job-.+\.scope$/;

/**
 * The scope of `job`: its unit is the one `ops job run` names `dash-job-<id>`; the identity is its
 * leader, or its launcher before a launch.
 */
function jobScopeOf(job: HostJob): HoldScope {
  const unit = `dash-job-${job.id}.scope`;
  return {
    owns: (component) => component === unit,
    sessions: new Set(),
    before: job.process ?? job.launcher,
    ownCgroup: null,
    held: "the job's files",
    remedy: `end it, or stop the job's scope with \`systemctl --user stop ${unit}\`, and settlement retries`,
    outside: [],
  };
}

/**
 * The scope `ops pool init` (and `resources init`) inspects a unit with (J19): no ledger exists
 * yet, so every Dash job scope is owned and the identity is this Dash process itself.
 * @throws Error when this process's own identity cannot be read.
 */
function initScopeOf(path: string): HoldScope {
  const initializer = identifyProcess(process.pid);
  if (initializer === null) throw new Error('pool initializer identity unavailable');
  return {
    owns: (component) => DASH_JOB_SCOPE.test(component),
    sessions: new Set(),
    before: initializer,
    ownCgroup: ownCgroupPath(),
    held: `unit ${path}`,
    remedy: 'end it, then initialize again',
    outside: [],
  };
}

/**
 * This process's cgroup v2 path, from `/proc/self/cgroup`.
 * @throws Error when it is unreadable or names no unified hierarchy, which keeps the entry charged.
 */
function ownCgroupPath(): string {
  const unified = readFileSync('/proc/self/cgroup', 'utf8')
    .split('\n')
    .find((line) => line.startsWith('0::'));
  if (unified === undefined) throw new Error('this Dash process has no cgroup v2 membership');
  return unified.slice(3);
}

/** How many outside-scope processes an entry's reason names before it only counts them. */
const OUTSIDE_NAMED = 3;

/**
 * `; uninspectable_outside_scope: <pid> (<comm>), … and <n> more` for evidence text, or nothing:
 * the most recently started first, at most {@link OUTSIDE_NAMED} named, the rest counted, so snapshots and
 * events stay small.
 */
function outsideNote(scope: HoldScope): string {
  // Most recently started first: the one an operator asks about (pids wrap; start ticks do not).
  const seen = [
    ...new Map(scope.outside.map((uninspectable) => [uninspectable.pid, uninspectable])).values(),
  ].sort((left, right) => (right.start > left.start ? 1 : right.start < left.start ? -1 : 0));
  if (seen.length === 0) return '';
  const named = seen
    .slice(0, OUTSIDE_NAMED)
    .map((uninspectable) => `${String(uninspectable.pid)} (${uninspectable.comm})`)
    .join(', ');
  // Proof: listing every process here made `the outside-scope note names three and counts the
  // rest` (host-job-holds.test.ts) see eleven names on the workstation (2026-11-02, review R5).
  const rest = seen.length - OUTSIDE_NAMED;
  return `; uninspectable_outside_scope: ${named}${rest > 0 ? ` and ${String(rest)} more` : ''}`;
}

/**
 * Whether a same-user process whose descriptors are unreadable provably holds nothing the owner
 * made: no component of its cgroup is an owned scope, its session is no owned process group's,
 * **and** it started before `scope.before` in this boot. A different cgroup alone proves nothing:
 * a payload's descendant can turn non-dumpable (prctl, a setuid helper, ssh-agent, gpg-agent) and
 * leave the scope with `systemd-run --user`. A process that predates the leader cannot have
 * inherited or been handed the owner's files by it. Anything else, including any process of
 * another boot, stays an unknown holder.
 *
 * `gone` when the process exited after the scan listed it: ENOENT or ESRCH on its cgroup, its
 * identity (a zombie included) or its session means it holds nothing. On a real host processes
 * exit during settlement all the time, and counting them as unknown holders blocked units at
 * random (`cannot read the cgroup of uninspectable PID …`, slice 6c's launchers run).
 * Exported for that test.
 * @throws Error when its cgroup, session or identity is unreadable for any other reason
 * (EACCES, EPERM, malformed), which keeps the entry charged.
 */
export function outsideScope(pid: string, scope: HoldScope): 'outside' | 'holds' | 'gone' {
  let membership: string;
  try {
    membership = readFileSync(`/proc/${pid}/cgroup`, 'utf8');
  } catch (cause) {
    // Proof: without this, `a process that exits after the scan listed it holds nothing`
    // (resource-holds.test.ts) threw `cannot read the cgroup of uninspectable PID` (verify.md
    // Slice 6c, 6c-F17).
    if (isMissing(cause)) return 'gone';
    throw new Error(`cannot read the cgroup of uninspectable PID ${pid}`, { cause });
  }
  const unified = membership.split('\n').find((line) => line.startsWith('0::'));
  if (unified === undefined)
    throw new Error(`uninspectable PID ${pid} has no cgroup v2 membership`);
  const cgroup = unified.slice(3);
  if (processGone(pid)) return 'gone';
  if (cgroup.split('/').some(scope.owns)) return 'holds';
  // Read directly, not through `identifyProcess`, which answers null for a zombie by choice: a
  // zombie leader beside live threads still has a start to compare (review P2).
  const identity = statIdentity(pid);
  if (identity === null) return 'gone';
  if (scope.sessions.size > 0) {
    let stat: string;
    try {
      stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    } catch (cause) {
      if (isMissing(cause)) return 'gone';
      throw new Error(`cannot read the session of uninspectable PID ${pid}`, { cause });
    }
    const session = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[3];
    if (!session) throw new Error(`uninspectable PID ${pid} has no session`);
    // Proof: without this, `a non-dumpable process in another use's process group still holds a
    // resource` (resource-holds.test.ts) saw the use released (2026-11-02, J19).
    if (scope.sessions.has(session)) return 'holds';
  }
  // Another login session's processes (`sshd-session`, `(sd-pam)` beside it) are outside Dash-owned
  // work whenever they started (J19 amendment, reviews F1 and G2): a `puni1` ssh login that
  // begins during a job would otherwise hold the gate tree until it logs out. The owner's own
  // login session is not foreign: a managed use's leader is a plain child of Dash, so a
  // descendant that calls `setsid` and turns non-dumpable stays in Dash's session scope.
  // Proof: without this, `pool init succeeds beside a non-dumpable process of another login
  // session` (resource-holds.test.ts) refused and `a non-dumpable login-session process started
  // after the job does not hold` (host-job-holds.test.ts) saw tmp `blocked`; with the owner's
  // session exempted too, `a setsid descendant in Dash's own login session still holds`
  // (resource-holds.test.ts) saw the resource `released` (2026-11-02, reviews F1, G2).
  if (isForeignLoginSession(cgroup, scope.ownCgroup)) return 'outside';
  // Proof: without the start comparison `a non-dumpable process that left for another scope
  // after the job still holds` (host-job-holds.test.ts) saw tmp `released` with the file open
  // (2026-11-02, Slice 3 review R1).
  return identity.boot === scope.before.boot && BigInt(identity.start) < BigInt(scope.before.start)
    ? 'outside'
    : 'holds';
}

/**
 * Whether cgroup v2 path `cgroup` is a logind login session, `/user.slice/user-<uid>.slice/
 * session-<id>.scope`, other than `owner`'s own (null: every login session is foreign). PAM
 * creates session scopes at login and only root may write them. A Dash payload cannot enter one:
 * `systemd-run --user` puts its descendants under `user@<uid>.service`, which this refuses, and
 * the session scope itself is not delegated to the account.
 */
export function isForeignLoginSession(cgroup: string, owner: string | null): boolean {
  const components = cgroup.split('/');
  return (
    cgroup !== owner &&
    components.length === 4 &&
    components[0] === '' &&
    components[1] === 'user.slice' &&
    /^user-\d+\.slice$/.test(components[2] ?? '') &&
    /^session-[A-Za-z0-9]+\.scope$/.test(components[3] ?? '')
  );
}

/** A process's `comm`, or `?` once it is gone or unreadable: evidence text only. */
function commOf(pid: string): string {
  try {
    return readFileSync(`/proc/${pid}/comm`, 'utf8').trim();
  } catch {
    // Evidence text only: the pid itself is the record; a vanished name changes no decision.
    return '?';
  }
}

function isAccessDenied(cause: unknown): boolean {
  return (
    cause instanceof Error && 'code' in cause && (cause.code === 'EACCES' || cause.code === 'EPERM')
  );
}

/**
 * Same-user cwd, descriptors and mapped files are required evidence, including deleted-open files.
 * A same-user process whose descriptors are access-denied and that is outside `scope`
 * ({@link outsideScope}) is recorded in `scope.outside` instead of refusing (J19: host-job
 * settlement, managed-resource cleanup and the unit check at pool init alike); any other
 * uninspectable process refuses, naming its pid, comm and the scope's remedy.
 * Exported for its leaving-process tests (leaving-holds.test.ts).
 */
export function inspectHolds(locator: string, scope: HoldScope): void {
  // Proof: returning without inspection released a live writer's directory (live-holds.log)
  // and the protected-process target in `existing account runs work` (2026-10-25).
  const mounts = readFileSync('/proc/self/mountinfo', 'utf8').split('\n');
  for (const mount of mounts) {
    const target = mount.split(' ')[4]?.replace(/\\040/g, ' ');
    if (target && samePath(target, locator)) throw new Error('mounted target remains charged');
  }
  for (const pid of readdirSync('/proc').filter((name) => /^\d+$/.test(name))) {
    try {
      if (statSync(`/proc/${pid}`).uid !== process.getuid?.()) continue;
      const root = inspectionRoot(pid);
      if (root === null) continue;
      for (const link of [
        `${root}/cwd`,
        ...readdirSync(`${root}/fd`).map((fd) => `${root}/fd/${fd}`),
      ]) {
        let target: string;
        try {
          target = readlinkSync(link);
        } catch (cause) {
          if (isMissing(cause)) continue;
          throw cause;
        }
        if (samePath(target.replace(/ \(deleted\)$/, ''), locator))
          throw new Error('live file hold remains charged');
      }
      for (const mapping of readFileSync(`${root}/maps`, 'utf8').split('\n')) {
        const target = /\s(\/.*)$/.exec(mapping)?.[1];
        if (target && samePath(target.replace(/ \(deleted\)$/, ''), locator))
          throw new Error('mapped file hold remains charged');
      }
    } catch (cause) {
      // Leaving since it was listed (ENOENT or ESRCH, or a zombie or `do_exit` caught mid-read):
      // it holds nothing. Only EACCES and EPERM below mean uninspectable.
      if (isMissing(cause) || processGone(pid)) continue;
      if (cause instanceof Error && cause.message.includes('remains charged')) throw cause;
      // Proof: without this branch `a non-dumpable process outside the job scope does not hold
      // its tmp directory` (host-job-holds.test.ts) saw tmp `blocked` "cannot inspect process
      // PID"; with `outsideScope` always true `a non-dumpable process inside the job scope still
      // holds its tmp directory` saw it `released` (2026-11-02, Slice 3 review F1).
      const verdict = isAccessDenied(cause) ? outsideScope(pid, scope) : 'holds';
      // Exited since the scan listed it: it holds nothing and leaves no evidence.
      if (verdict === 'gone') continue;
      if (verdict === 'outside') {
        scope.outside.push({
          pid: Number(pid),
          comm: commOf(pid),
          // Only orders the evidence text: a process gone since `outsideScope` sorts last.
          start: BigInt(identifyProcess(Number(pid))?.start ?? 0),
        });
        continue;
      }
      // A non-dumpable daemon the payload left behind (ssh-agent, gpg-agent) keeps the entry
      // blocked until it ends; stopping the job's scope ends it.
      // Proof: dropping the remedy made `a non-dumpable process inside the job scope still holds
      // its tmp directory` (host-job-holds.test.ts) miss `systemctl --user stop` (2026-11-02, R8).
      if (isAccessDenied(cause))
        throw new Error(
          `cannot inspect process PID ${pid} (${commOf(pid)}), which may hold ${scope.held}; ${scope.remedy}`,
          { cause },
        );
      throw new Error(
        `cannot inspect process PID ${pid} for resource cleanup; resolve process access and retry cleanup`,
        { cause },
      );
    }
  }
}

/** The file in a host job's tmp directory that holds its {@link HostJob.tmpMarker}. */
const TMP_MARKER = '.dash-tmp-identity';
/**
 * Descriptor-relative removal never follows a symlink, crosses a mount, or accepts a replacement
 * inode. Options after the identity: `inspect` removes nothing; `marker=<token>` also requires
 * {@link TMP_MARKER}, read through the opened directory, to hold that token.
 */
const removeDirectory = String.raw`
import os,sys,stat
root,name,dev,ino=sys.argv[1:5]
options=sys.argv[5:]
remove="inspect" not in options
markers=[o[7:] for o in options if o.startswith("marker=")]
flags=os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW
parent=os.open(root,flags)
fd=os.open(name,flags,dir_fd=parent)
s=os.fstat(fd)
if (s.st_dev,s.st_ino)!=(int(dev),int(ino)): raise RuntimeError('identity changed')
if markers:
 try: m=os.open("${TMP_MARKER}",os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=fd)
 except OSError: raise RuntimeError('identity changed')
 ms=os.fstat(m)
 if not stat.S_ISREG(ms.st_mode) or ms.st_nlink!=1 or os.read(m,64).decode('ascii','replace')!=markers[0]: raise RuntimeError('identity changed')
 os.close(m)
def erase(directory):
 for name in os.listdir(directory):
  if markers and directory==fd and name=="${TMP_MARKER}": continue
  before=os.stat(name,dir_fd=directory,follow_symlinks=False)
  if before.st_dev!=s.st_dev: raise RuntimeError('mount boundary')
  if stat.S_ISDIR(before.st_mode):
   child=os.open(name,flags,dir_fd=directory)
   opened=os.fstat(child)
   if (opened.st_dev,opened.st_ino)!=(before.st_dev,before.st_ino): raise RuntimeError('identity changed')
   erase(child)
   after=os.stat(name,dir_fd=directory,follow_symlinks=False)
   if (after.st_dev,after.st_ino)!=(opened.st_dev,opened.st_ino): raise RuntimeError('identity changed')
   if remove: os.rmdir(name,dir_fd=directory)
   os.close(child)
  else:
   # Proof: bypassing this guard released shared hardlinked storage (shared-hardlink.log).
   if not stat.S_ISLNK(before.st_mode) and before.st_nlink>1: raise RuntimeError('shared hardlink')
   if remove: os.unlink(name,dir_fd=directory)
erase(fd)
# The marker goes last, so a refused removal leaves the directory still provably the original.
# Proof: erasing it with the rest made 'a blocked tmp directory adds no outbox rows' (host-jobs.test.ts)
# see revision 5, not 4: the next pass read the marker gone and changed the reason (Slice 6e).
if markers and remove: os.unlink("${TMP_MARKER}",dir_fd=fd)
after=os.stat(name,dir_fd=parent,follow_symlinks=False)
if (after.st_dev,after.st_ino)!=(s.st_dev,s.st_ino): raise RuntimeError('identity changed')
if remove: os.rmdir(name,dir_fd=parent)
os.close(fd);os.close(parent)
`;

/** Single fixed SQLite ledger per canonical root serializes all projects and persists effects before execution. */
export class ResourceRuntime {
  private constructor(
    private readonly db: Database,
    readonly configuration: ResourceConfiguration,
    private readonly clock: WallClock,
    private readonly rootIdentity: { dev: number; ino: number },
  ) {}
  /**
   * When WBS first refused each host-job event `400`, by event id (S5-A20). In-process only: a
   * restarted `watch` starts the bound again, which the bound's purpose (outlasting a swap
   * window) tolerates.
   */
  private readonly hostJobRefusals = new Map<string, number>();

  /** Explicit bootstrap refuses existing or nonempty roots; normal opens never recreate missing trusted state. */
  static initialize(
    configuration: ResourceConfiguration,
    clock: WallClock,
    host: HostFacts,
  ): ResourceRuntime {
    checkRoot(configuration.root);
    if (readdirSync(configuration.root).length !== 0)
      throw new Error('resource initialization requires an empty root');
    checkHostFacts(configuration, host);
    const state = join(configuration.root, '.dash');
    mkdirSync(state, { mode: 0o700 });
    const path = join(state, 'resources.sqlite');
    writeFileSync(path, '', { flag: 'wx', mode: 0o600 });
    const db = new Database(path);
    db.run(
      `PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE binding (identity TEXT NOT NULL); CREATE TABLE uses (id TEXT PRIMARY KEY, snapshot TEXT NOT NULL); CREATE TABLE events (sequence INTEGER PRIMARY KEY AUTOINCREMENT, event TEXT NOT NULL, published INTEGER NOT NULL DEFAULT 0); CREATE TABLE cursor (id INTEGER PRIMARY KEY CHECK(id=1), value INTEGER NOT NULL); INSERT INTO cursor VALUES (1,0); ${HOST_POOL_SCHEMA}; ${HOST_POOL_TRANSITION_SCHEMA}; ${OUTBOX_REPAIR_SCHEMA}; PRAGMA user_version=${String(LEDGER_VERSION)}`,
    );
    const root = lstatSync(configuration.root);
    db.query('INSERT INTO binding VALUES (?)').run(
      JSON.stringify(ResourceRuntime.binding(configuration, root)),
    );
    db.close();
    return ResourceRuntime.open(configuration, clock);
  }
  /**
   * The pinned identity: version 0's eleven fields, then the host pool's budgets, headroom,
   * units and enrollment identity, so another configuration cannot silently change the pool.
   */
  private static binding(
    configuration: ResourceConfiguration,
    root: { dev: number; ino: number },
  ): string[] {
    return [
      ...ResourceRuntime.legacyBinding(configuration, root),
      String(configuration.cpuCores),
      String(configuration.memoryGib),
      String(configuration.headroom.cpuCores),
      String(configuration.headroom.memoryGib),
      JSON.stringify(
        Object.entries(configuration.exclusiveUnits).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
      configuration.enrollmentId,
    ];
  }
  /** Version 0's binding, which a migration must find before it extends it. */
  private static legacyBinding(
    configuration: ResourceConfiguration,
    root: { dev: number; ino: number },
  ): string[] {
    return [
      configuration.root,
      String(root.dev),
      String(root.ino),
      configuration.authorityId,
      configuration.epoch,
      configuration.providerId,
      String(configuration.diskUnitBytes),
      String(configuration.diskBudgetUnits),
      String(configuration.workspaceSlots),
      String(configuration.headroomBytes),
      readFileSync('/etc/machine-id', 'utf8').trim(),
    ];
  }
  /** The ledger path under `configuration.root`, refused unless it and its directory are owner-only. */
  private static trustedLedgerPath(configuration: ResourceConfiguration): string {
    checkRoot(configuration.root);
    const path = join(configuration.root, '.dash', 'resources.sqlite');
    for (const trusted of [dirname(path), path]) {
      const identity = lstatSync(trusted);
      if (
        // Proof: removing inode comparisons here and in the provider deleted a replacement (identity.log).
        identity.isSymbolicLink() ||
        identity.uid !== process.getuid?.() ||
        (identity.mode & 0o077) !== 0
      )
        throw new Error('resource ledger must be owner-only without symlinks');
    }
    return path;
  }
  /**
   * Open the ledger for reading only (`dash-host-jobs` task 6.10a, review of #876 F1): SQLite
   * `readonly`, no migration, no eligibility check, the binding still compared. A nested
   * launcher's admission query runs the Dash of the caller's own checkout, which inside a gate is
   * the candidate commit, against the production configuration; that Dash must never step the
   * production ledger's schema.
   * @throws when the ledger's `user_version` is not {@link LEDGER_VERSION}, naming both, or
   * when the binding differs.
   */
  static openReadOnly(configuration: ResourceConfiguration, clock: WallClock): ResourceRuntime {
    const path = ResourceRuntime.trustedLedgerPath(configuration);
    const db = new Database(path, { readonly: true, strict: true });
    try {
      db.run('PRAGMA busy_timeout=10000');
      const row = db.query<{ user_version: number }, []>('PRAGMA user_version').get();
      if (row === null) throw new Error('resource ledger version unreadable');
      // Proof: calling `migrate` here instead made `a read-only open refuses a ledger of
      // another version and leaves it as it was` (host-jobs.test.ts) receive only SQLite's
      // `attempt to write a readonly database`; with `readonly` dropped as well, the open
      // migrated the ledger and did not throw (2026-11-05, Slice 6e review F1).
      if (row.user_version !== LEDGER_VERSION)
        throw new Error(
          `resource ledger version ${String(row.user_version)} is not ${String(LEDGER_VERSION)}, the version this Dash reads; a read-only open migrates nothing`,
        );
      const root = lstatSync(configuration.root);
      const binding = db.query<{ identity: string }, []>('SELECT identity FROM binding').get();
      if (binding?.identity !== JSON.stringify(ResourceRuntime.binding(configuration, root)))
        throw new Error('resource authority binding mismatch');
      return new ResourceRuntime(db, configuration, clock, root);
    } catch (cause) {
      db.close();
      throw cause;
    }
  }
  /** Opening validates the root and binding before any reservation or provider effect. */
  static open(configuration: ResourceConfiguration, clock: WallClock): ResourceRuntime {
    const path = ResourceRuntime.trustedLedgerPath(configuration);
    const db = new Database(path, { create: false, strict: true });
    db.run('PRAGMA busy_timeout=10000; PRAGMA synchronous=FULL');
    const root = lstatSync(configuration.root);
    try {
      ResourceRuntime.migrate(db, configuration, root);
    } catch (cause) {
      db.close();
      throw cause;
    }
    const binding = db.query<{ identity: string }, []>('SELECT identity FROM binding').get();
    // Proof: bypassing binding comparison admitted a competing authority and failed `reopening a ledger` (binding.log).
    if (binding?.identity !== JSON.stringify(ResourceRuntime.binding(configuration, root))) {
      db.close();
      throw new Error('resource authority binding mismatch');
    }
    return new ResourceRuntime(db, configuration, clock, root);
  }
  /**
   * Step the ledger forward to {@link LEDGER_VERSION} in one `BEGIN IMMEDIATE`, or refuse.
   * Version 0 (no `user_version`, the four `dash-resource-cleanup` tables) gains the host pool
   * tables in mode `observe` and the extended binding, only when its binding is exactly this
   * configuration's version-0 binding; version 1 (those tables) gains the transition state of
   * J12, only when its tables are exactly version 1's; version 2 gains the outbox refusals and
   * the drop journal (task 6.8a), only when its tables are exactly version 2's. A version this
   * Dash does not know is
   * refused: it may be a newer schema, and nothing here can step it back.
   */
  private static migrate(
    db: Database,
    configuration: ResourceConfiguration,
    root: { dev: number; ino: number },
  ): void {
    const version = (): number => {
      const row = db.query<{ user_version: number }, []>('PRAGMA user_version').get();
      if (row === null) throw new Error('resource ledger version unreadable');
      return row.user_version;
    };
    if (version() === LEDGER_VERSION) return;
    const migrated = db
      .transaction((): number | null => {
        const found = version();
        if (found === LEDGER_VERSION) return null;
        // Proof: without it, `refuses a ledger version it does not know` (host-jobs.test.ts)
        // treated version 9 as version 0 and refused only on its tables (2026-11-01, Slice 2).
        if (found !== 0 && found !== 1 && found !== 2)
          throw new Error(
            `resource ledger version ${String(found)} is unknown to this Dash; refusing to guess its schema`,
          );
        const tables = db
          .query<{ name: string }, []>(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
          )
          .all()
          .map((table) => table.name);
        // Proof: without it `refuses a version-0 ledger with unexpected tables`
        // (host-jobs.test.ts) migrated a ledger it did not write (2026-11-01, verify.md Slice 2);
        // for version 1, `refuses a version-1 ledger with unexpected tables` (2026-11-02, Slice 6b);
        // for version 2, `refuses a version-2 ledger with unexpected tables` (2026-11-05, Slice 6g).
        const expected =
          found === 0 ? LEDGER_V0_TABLES : found === 1 ? LEDGER_V1_TABLES : LEDGER_V2_TABLES;
        if (JSON.stringify(tables) !== JSON.stringify(expected))
          throw new Error(
            `resource ledger version ${String(found)} has unexpected tables: ${tables.join(', ')}`,
          );
        if (found === 0) {
          const binding = db.query<{ identity: string }, []>('SELECT identity FROM binding').get();
          // Proof: without it, `migrates a version-0 ledger forward, only under its own binding`
          // (host-jobs.test.ts) rebound another authority's ledger (2026-11-01, verify.md Slice 2).
          if (
            binding?.identity !== JSON.stringify(ResourceRuntime.legacyBinding(configuration, root))
          )
            throw new Error('resource authority binding mismatch');
          db.run(HOST_POOL_SCHEMA);
          db.query('UPDATE binding SET identity=?').run(
            JSON.stringify(ResourceRuntime.binding(configuration, root)),
          );
        }
        if (found !== 2) db.run(HOST_POOL_TRANSITION_SCHEMA);
        db.run(OUTBOX_REPAIR_SCHEMA);
        db.run(`PRAGMA user_version=${String(LEDGER_VERSION)}`);
        return found;
      })
      .immediate();
    // `open` has no report sink and this happens once per ledger: say it on stderr.
    if (migrated !== null)
      process.stderr.write(
        `resources: migrated ledger ${join(configuration.root, '.dash', 'resources.sqlite')} from version ${String(migrated)} to ${String(LEDGER_VERSION)} (${LEDGER_STEPS.slice(migrated).join(', ')})\n`,
      );
  }
  /** Close this connection without altering durable obligations. */
  close(): void {
    this.db.close();
  }
  private transaction<T>(effect: () => T): T {
    return this.db
      .transaction(() => {
        this.checkIdentity();
        return effect();
      })
      .immediate();
  }
  private checkIdentity(): void {
    checkRoot(this.configuration.root);
    const current = lstatSync(this.configuration.root);
    if (current.dev !== this.rootIdentity.dev || current.ino !== this.rootIdentity.ino)
      throw new Error('managed root identity changed');
  }
  /** Persisted snapshots are trusted local state; corruption throws instead of implying absence. */
  inspect(id: string): ResourceUse {
    const row = this.db
      .query<{ snapshot: string }, [string]>('SELECT snapshot FROM uses WHERE id=?')
      .get(id);
    if (!row) throw new Error('resource use not found');
    // Only this class writes the owner-only ledger; malformed JSON throws rather than defaulting.
    return ResourceUseShape.assert(JSON.parse(row.snapshot));
  }
  /** Inspect all local uses, including released history and charged blockers. */
  list(): ResourceUse[] {
    return this.db
      .query<{ id: string }, []>('SELECT id FROM uses ORDER BY id')
      .all()
      .map((row) => this.inspect(row.id));
  }
  /** Ordered unpublished events, retaining the original immutable retry identity. */
  outbox(): ResourceEvent[] {
    return this.db
      .query<{ event: string }, []>('SELECT event FROM events WHERE published=0 ORDER BY sequence')
      .all()
      .map((row) => resourceRuntimeEvent.assert(JSON.parse(row.event)));
  }
  private save(use: ResourceUse): void {
    this.db
      .query(
        'INSERT INTO uses VALUES (?,?) ON CONFLICT(id) DO UPDATE SET snapshot=excluded.snapshot',
      )
      .run(use.id, JSON.stringify(use));
  }
  private event(use: ResourceUse, kind: ResourceEvent['kind']): void {
    use.revision += 1;
    const sequence = this.db
      .query<{ sequence: number }, []>('SELECT COALESCE(MAX(sequence),0)+1 AS sequence FROM events')
      .get();
    if (!sequence) throw new Error('resource event sequence unavailable');
    const attribution = use.request;
    const admission = kind === 'registered' ? use.admission : undefined;
    const event: ResourceEvent = {
      eventId: admission?.eventId ?? randomUUID(),
      epoch: this.configuration.epoch,
      sequence: sequence.sequence,
      useId: use.id,
      incarnation: use.incarnation,
      revision: use.revision,
      kind,
      observedAt: admission?.observedAt ?? this.clock.read(),
      reason: admission?.reason ?? use.reason,
      ...(use.requestId === undefined || kind === 'registered' ? {} : { requestId: use.requestId }),
      use: this.declaration(use),
    };
    if (kind === 'release_verified') {
      const proof = JSON.stringify({
        dev: use.dev,
        ino: use.ino,
        incarnation: use.incarnation,
        absent: true,
        holds: 'none',
        boundary: 'linux-cooperating-owner',
        reclaimedBytes: null,
      });
      const recorded = this.db
        .query<{ event: string }, [string]>(
          "SELECT event FROM events WHERE json_extract(event,'$.useId')=? AND json_extract(event,'$.kind')='release_verified' ORDER BY sequence LIMIT 1",
        )
        .get(use.id);
      if (recorded !== null) {
        const original = resourceRuntimeEvent.assert(JSON.parse(recorded.event));
        if (original.evidence === undefined) throw new Error('terminal release evidence missing');
        // Proof: regenerating the locator failed the real terminal-race smoke after restart (2026-10-25).
        event.evidence = original.evidence;
      } else {
        if (use.evidence !== null) throw new Error('terminal release envelope missing');
        use.evidence = proof;
        event.evidence = {
          digest: createHash('sha256').update(proof).digest('hex'),
          locator: `dash-resource://${this.configuration.authorityId}/${use.id}/${String(use.revision)}`,
          disposition: use.dev === null ? 'not_created' : 'removed',
          reclaimedBytes: null,
        };
      }
    }
    if (kind === 'retained')
      event.retention = {
        ownerPersonId: attribution.responsiblePersonId,
        reviewAt: use.retentionReviewAt ?? this.clock.read(),
      };
    resourceRuntimeEvent.assert(event);
    this.save(use);
    this.db
      .query('INSERT INTO events(sequence,event) VALUES (?,?)')
      .run(event.sequence, JSON.stringify(event));
  }
  private declaration(use: ResourceUse): ResourceRuntimeAdmission['use'] {
    const attribution = use.request;
    return {
      projectId: attribution.projectId,
      resourceId: attribution.resourceId,
      workItemId: attribution.workItemId,
      agentRun: attribution.agentRun,
      responsiblePersonId: attribution.responsiblePersonId,
      units: attribution.units,
      locator: use.locator,
      kind: attribution.kind,
      reservedDiskUnits: attribution.diskUnits,
      reservedWorkspaceUnits: 1,
      ...(attribution.stepId === undefined ? {} : { stepId: attribution.stepId }),
      ...(attribution.attemptNumber === undefined
        ? {}
        : { attemptNumber: attribution.attemptNumber }),
    };
  }
  /** Persist an exact authorized admission before allocating a source sequence or creating a path. */
  private async admit(id: string, tools: WbsTools): Promise<ResourceUse> {
    const use = this.inspect(id);
    if (use.revision > 0) return use;
    if (use.admission === undefined) throw new Error('resource admission intent missing');
    const receipt = resourceRuntimeAdmissionReceipt.assert(
      await answeredBody(
        tools,
        ADMISSION_TOOL,
        { authorityId: this.configuration.authorityId, ...use.admission },
        'resource admission',
      ),
    );
    // Proof: bypassing receipt identity made the exact-receipt fixture create a path (final-fix-mutations/admission-receipt.log).
    if (
      receipt.eventId !== use.admission.eventId ||
      receipt.useId !== use.id ||
      receipt.incarnation !== use.incarnation
    )
      throw new Error('resource admission acknowledgment mismatch');
    return this.transaction(() => {
      const current = this.inspect(id);
      if (current.revision === 0) {
        this.event(current, 'registered');
        // Proof: parent sealing during admission otherwise stranded a creating child (2026-10-25).
        if (current.sealed)
          this.enqueue(current, current.revision, current.incarnation, current.reason);
      }
      return current;
    });
  }
  /**
   * Reserve locally, obtain durable WBS authorization, then create; failures remain charged for admission replay.
   * Whole-account process visibility is required at cleanup, not creation: an unrelated protected process
   * may block release without preventing work under the existing account.
   */
  async create(input: CreationRequest, tools: WbsTools): Promise<ResourceUse> {
    const request = Creation.assert(input);
    if ((request.kind === 'git_worktree') !== (request.source !== undefined))
      throw new Error('worktree requires a stable source repository');
    if (
      request.source !== undefined &&
      (samePath(realpathSync(request.source), this.configuration.root) ||
        !isAbsolute(request.source))
    )
      throw new Error('worktree source must be outside managed root');
    const creator = identifyProcess(process.pid);
    if (!creator) throw new Error('creator identity unavailable');
    const intent = this.transaction(() => {
      // Proof: charging only active uses failed the replacement-path capacity assertion (held-capacity.log).
      // Host jobs reserve from the same vector (J4): their unreleased tmp entries count here.
      const { vector: charged } = this.reservations();
      if (
        !vectorFits(
          { cpuCores: 0, memoryGib: 0, diskUnits: request.diskUnits, workspaceSlots: 1 },
          charged,
          this.allocatable(),
        ) ||
        !this.freeSpaceCovers(charged.diskUnits + request.diskUnits)
      )
        throw new Error('resource capacity unavailable');
      if (request.parentId !== undefined) {
        const parent = this.inspect(request.parentId);
        // Proof: removing this fence admitted a child after parent sealing (manifest-fence.log).
        if (
          parent.sealed ||
          parent.state !== 'active' ||
          (!alive(parent.creator) && (parent.process === null || !alive(parent.process)))
        )
          throw new Error('parent manifest is sealed');
      }
      for (const dependency of request.dependencies ?? [])
        if (this.inspect(dependency).state === 'released')
          throw new Error('dependency already released');
      const id = randomUUID();
      const reserved: ResourceUse = {
        id,
        incarnation: randomUUID(),
        revision: 0,
        state: 'creating',
        locator: join(this.configuration.root, id),
        request,
        dev: null,
        ino: null,
        creator,
        process: null,
        descendants: [],
        drainRequestedAt: null,
        launchDeadline: this.clock.read() + 60000,
        startedAt: null,
        endedAt: null,
        outcome: null,
        deleteIntent: false,
        sealed: false,
        cleanupAttempts: 0,
        cleanupGeneration: 0,
        nextRetryAt: null,
        reason: 'creation reserved',
        releasedDiskUnits: 0,
        releasedWorkspaceUnits: 0,
        evidence: null,
      };
      reserved.admission = {
        eventId: randomUUID(),
        epoch: this.configuration.epoch,
        useId: reserved.id,
        incarnation: reserved.incarnation,
        observedAt: this.clock.read(),
        reason: reserved.reason,
        use: this.declaration(reserved),
      };
      this.save(reserved);
      return reserved;
    });
    let use: ResourceUse;
    try {
      // Proof: bypassing admission stranded first publication after real deleteWorkItem (admission-before-effects.log).
      use = await this.admit(intent.id, tools);
    } catch (cause) {
      this.transaction(() => {
        const pending = this.inspect(intent.id);
        pending.sealed = true;
        pending.reason = 'WBS admission unresolved; retry before verified noncreation';
        this.save(pending);
      });
      throw cause;
    }
    this.transaction(() => {
      const current = this.inspect(use.id);
      if (current.state !== 'creating' || current.sealed || current.revision !== use.revision)
        throw new Error('creation became stale');
      mkdirSync(use.locator, { mode: 0o700 });
      const identity = lstatSync(use.locator);
      use.dev = identity.dev;
      use.ino = identity.ino;
      this.save(use);
    });
    this.transaction(() => {
      const current = this.inspect(use.id);
      if (current.state !== 'creating' || current.sealed || current.revision !== use.revision)
        throw new Error('creation became stale');
      if (request.source !== undefined)
        git([
          '-C',
          request.source,
          '-c',
          'core.hooksPath=/dev/null',
          'worktree',
          'add',
          '--detach',
          use.locator,
          'HEAD',
        ]);
      use.state = 'active';
      use.reason = 'managed creation observed';
      this.save(use);
    });
    return use;
  }
  /** Revision and incarnation guards fence stale requests; released uses are never resurrected. */
  requestCleanup(id: string, revision: number, incarnation: string, reason: string): ResourceUse {
    return this.transaction(() => {
      const use = this.inspect(id);
      this.enqueue(use, revision, incarnation, reason);
      return use;
    });
  }
  private enqueue(use: ResourceUse, revision: number, incarnation: string, reason: string): void {
    // Proof: removing freshness checks failed both stale request refusals (stale-generation.log).
    if (use.revision !== revision || use.incarnation !== incarnation)
      throw new Error('stale resource revision or incarnation');
    if (use.state === 'released') return;
    use.sealed = true;
    use.cleanupAttempts = 0;
    use.nextRetryAt = null;
    use.reason = reason;
    // Proof: removing this fence emitted pending/release before registration (unadmitted-source-fence.log).
    if (use.revision === 0) {
      // No source event exists until durable admission succeeds; uncertain obligations stay charged.
      this.save(use);
      return;
    }
    use.state = 'pending';
    this.event(use, 'cleanup_pending');
    for (const child of this.list().filter(
      (candidate) => candidate.request.parentId === use.id && candidate.state !== 'released',
    ))
      this.enqueue(child, child.revision, child.incarnation, 'parent manifest sealed');
  }
  private checkTarget(use: ResourceUse): boolean {
    let identity;
    try {
      identity = lstatSync(use.locator);
    } catch (cause) {
      if (isMissing(cause)) return false;
      throw cause;
    }
    if (
      // Proof: removing inode comparisons here and in the provider deleted a replacement (identity.log).
      identity.isSymbolicLink() ||
      !identity.isDirectory() ||
      identity.dev !== use.dev ||
      identity.ino !== use.ino ||
      use.locator !== join(this.configuration.root, use.id)
    )
      throw new Error('resource target identity changed');
    return true;
  }
  private checkDependencies(use: ResourceUse): void {
    for (const other of this.list().filter(
      (candidate) => candidate.id !== use.id && candidate.state !== 'released',
    )) {
      if (other.request.dependencies?.includes(use.id))
        throw new Error('registered dependency remains charged');
      if (!this.checkTarget(other)) continue;
      const scan = (path: string): void => {
        for (const entry of readdirSync(path, { withFileTypes: true })) {
          const child = join(path, entry.name);
          if (entry.isSymbolicLink()) {
            let target = resolve(dirname(child), readlinkSync(child));
            try {
              target = realpathSync(child);
            } catch (cause) {
              if (!isMissing(cause))
                throw new Error('dependency link inspection unavailable', { cause });
            }
            if (samePath(target, use.locator))
              throw new Error('symlink dependency remains charged');
          } else if (entry.isDirectory()) scan(child);
          else if (entry.name === 'alternates') {
            for (const line of readFileSync(child, 'utf8').split('\n').filter(Boolean))
              if (samePath(resolve(dirname(dirname(child)), line), use.locator))
                throw new Error('Git alternate dependency remains charged');
          }
        }
      };
      scan(other.locator);
      if (other.request.source !== undefined) {
        const common = resolve(
          other.locator,
          git(['-C', other.locator, 'rev-parse', '--git-common-dir']),
        );
        const alternates = join(common, 'objects', 'info', 'alternates');
        let contents: string;
        try {
          contents = readFileSync(alternates, 'utf8');
        } catch (cause) {
          if (isMissing(cause)) continue;
          throw new Error('Git alternates inspection unavailable', { cause });
        }
        for (const line of contents.split('\n').filter(Boolean))
          if (samePath(resolve(common, 'objects', line), use.locator))
            throw new Error('Git alternate dependency remains charged');
      }
    }
  }
  /** Reconcile dead creators and retry pending/blocked cleanup; retention requires an explicit retry. */
  sweep(): ResourceUse[] {
    for (const snapshot of this.list()) {
      if (snapshot.state === 'released' || snapshot.revision === 0) continue;
      this.transaction(() => {
        const use = this.inspect(snapshot.id);
        const parent =
          use.request.parentId === undefined ? null : this.inspect(use.request.parentId);
        const parentOwns =
          parent !== null &&
          !parent.sealed &&
          (alive(parent.creator) || (parent.process !== null && ownedGroupAlive(parent.process)));
        if (
          (use.state === 'active' || use.state === 'creating') &&
          !alive(use.creator) &&
          !parentOwns &&
          (use.launchDeadline === null || use.launchDeadline <= this.clock.read())
        ) {
          use.outcome = 'lost';
          use.endedAt = this.clock.read();
          this.enqueue(use, use.revision, use.incarnation, 'owner process ended');
        }
      });
      const current = this.inspect(snapshot.id);
      if (
        current.state === 'retained' &&
        current.retentionReviewAt !== undefined &&
        current.retentionReviewAt <= this.clock.read()
      )
        this.requestCleanup(
          current.id,
          current.revision,
          current.incarnation,
          'retention review deadline reached',
        );
      const retry = this.inspect(current.id);
      if (
        retry.state === 'pending' ||
        (retry.state === 'blocked' &&
          retry.nextRetryAt !== null &&
          retry.nextRetryAt <= this.clock.read())
      )
        this.cleanup(current.id);
    }
    for (const job of this.listHostJobs())
      if (job.state !== 'released') this.settleHostJob(job.id, declaredContainersOnly);
    return this.list();
  }
  /** Record a bounded retry obligation without returning any reservation capacity. */
  private block(use: ResourceUse, cause: unknown): void {
    use.state = 'blocked';
    use.reason = cause instanceof Error ? cause.message : 'provider inspection failed';
    use.nextRetryAt =
      use.cleanupAttempts >= 6
        ? null
        : this.clock.read() + Math.min(60000, 1000 * 2 ** (use.cleanupAttempts - 1));
    if (use.nextRetryAt !== null && use.drainRequestedAt !== null)
      use.nextRetryAt = Math.min(use.nextRetryAt, use.drainRequestedAt + 5000);
    if (use.nextRetryAt === null)
      use.reason += '; automatic retry budget exhausted; operator retry required';
    this.event(use, 'blocked');
  }
  /** Preserve durable commit reachability; dirty, untracked and ignored files stay in their charged worktree. */
  private preserve(use: ResourceUse): boolean {
    if (use.request.source === undefined) return true;
    const tracked = git(['-C', use.locator, 'ls-files', '-v', '-z']).split('\0');
    // Proof: without this guard both real index-flag fixtures released unique modified bytes (2026-10-25).
    if (tracked.some((entry) => /^[a-zS] /.test(entry))) {
      use.state = 'retained';
      use.deleteIntent = false;
      use.reason = 'Git index has assume-unchanged or skip-worktree entries; owner review required';
      use.retentionReviewAt = this.clock.read() + 86400000;
      this.event(use, 'retained');
      return false;
    }
    for (const name of use.request.disposablePaths ?? []) {
      // Proof: bypassing tracked-source inspection removed protected source (tracked-generated-source.log).
      if (git(['-C', use.locator, 'ls-files', '--', name]) !== '')
        throw new Error('disposable output contains tracked source');
      const path = join(use.locator, name);
      let identity;
      try {
        identity = lstatSync(path);
      } catch (cause) {
        if (isMissing(cause)) continue;
        throw cause;
      }
      if (identity.isSymbolicLink()) {
        unlinkSync(path);
        continue;
      }
      if (!identity.isDirectory()) throw new Error('disposable output must be a directory');
      const removal = Bun.spawnSync(
        [
          'python3',
          '-c',
          removeDirectory,
          use.locator,
          name,
          String(identity.dev),
          String(identity.ino),
        ],
        { stdout: 'pipe', stderr: 'pipe', timeout: 30000, killSignal: 'SIGKILL' },
      );
      if (removal.exitCode !== 0)
        throw new Error('disposable output removal refused; shared hardlinks remain charged');
    }
    const status = git([
      '-C',
      use.locator,
      'status',
      '--porcelain',
      '--untracked-files=all',
      '--ignored',
    ]);
    if (status !== '') {
      use.state = 'retained';
      use.deleteIntent = false;
      use.reason = 'Git worktree contains dirty, untracked, or ignored work';
      use.retentionReviewAt = this.clock.read() + 86400000;
      this.event(use, 'retained');
      return false;
    }
    const commit = git(['-C', use.locator, 'rev-parse', 'HEAD']);
    // Per-worktree refs and logs disappear during worktree removal. Preserve their reachable
    // objects too; common repository refs/logs alone cannot recover detached reset commits.
    // Proof: without these refs, `worktree-only reflog and private-ref commits remain
    // recoverable after source pruning` failed git show with exit 128 after real gc --prune=now.
    const orphaned = git([
      '-C',
      use.locator,
      'rev-list',
      '--max-count=1025',
      '--reflog',
      '--single-worktree',
      '--not',
      '--all',
    ])
      .split('\n')
      .filter(Boolean);
    const privateRefs = git([
      '-C',
      use.locator,
      'for-each-ref',
      '--count=1025',
      '--format=%(objectname)',
      'refs/worktree/',
      'refs/bisect/',
      'refs/rewritten/',
    ])
      .split('\n')
      .filter(Boolean);
    if (orphaned.length >= 1025 || privateRefs.length >= 1025)
      throw new Error(
        'worktree preservation exceeds bounded history budget; owner review required',
      );
    const objects = [...new Set([commit, ...orphaned, ...privateRefs])];
    if (objects.some((object) => !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(object)))
      throw new Error('Git preservation object identity malformed');
    const refs = objects.map((object) => ({
      name: `refs/dash-recovery/${use.id}-${object}`,
      object,
    }));
    refs.push({ name: `refs/dash-recovery/${use.id}`, object: commit });
    git(
      ['-C', use.request.source, '-c', 'core.hooksPath=/dev/null', 'update-ref', '--stdin'],
      `start\n${refs.map((ref) => `update ${ref.name} ${ref.object}`).join('\n')}\nprepare\ncommit\n`,
    );
    const verified = git([
      '-C',
      use.request.source,
      'rev-parse',
      ...refs.map((ref) => ref.name),
    ]).split('\n');
    if (
      verified.length !== refs.length ||
      refs.some((ref, index) => verified[index] !== ref.object)
    )
      throw new Error('Git preservation verification failed');
    return true;
  }
  /** Every provider must prove storage is unshared, including clean tracked Git files. */
  private checkStorage(use: ResourceUse): void {
    // Proof: without this universal preflight, `clean tracked Git hardlinks keep the worktree
    // and capacity charged` observed released reservations while the outside hardlink survived.
    const inspection = Bun.spawnSync(
      [
        'python3',
        '-c',
        removeDirectory,
        this.configuration.root,
        use.id,
        String(use.dev),
        String(use.ino),
        'inspect',
      ],
      { stdout: 'pipe', stderr: 'pipe', timeout: 30000, killSignal: 'SIGKILL' },
    );
    if (inspection.exitCode !== 0)
      throw new Error(
        'shared storage inspection refused; hardlinks, mounts or unreadable entries remain charged',
      );
  }
  /** Persist exact child identities before signaling; never signal an unproven numeric group ID. */
  private beginDrain(id: string, signal: 'SIGTERM' | 'SIGKILL'): void {
    const use = this.transaction(() => {
      const current = this.inspect(id);
      current.descendants = captureDescendants(current);
      current.drainRequestedAt ??= this.clock.read();
      this.save(current);
      return current;
    });
    const identities = use.process === null ? use.descendants : [use.process, ...use.descendants];
    const delivery = Bun.spawnSync(['python3', '-c', signalProcesses, signal], {
      stdin: Buffer.from(JSON.stringify(identities)),
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 30000,
      killSignal: 'SIGKILL',
    });
    if (delivery.exitCode !== 0)
      throw new Error('owned process pidfd signaling refused; processes remain charged');
  }
  /** Cancellation waits for the entire proven tree, keeping escalation alive after leader exit. */
  private async finishDrain(id: string): Promise<void> {
    // Proof: returning at leader completion stranded the TERM-ignoring child and failed
    // cancellation cleanup (runtime-review-round1-mutations/leader-exit-escalation.log).
    const deadline = new AbortController();
    const timer = setTimeout(() => {
      deadline.abort();
    }, 5000);
    try {
      while (!deadline.signal.aborted && ownedProcessesAlive(this.inspect(id))) await Bun.sleep(25);
      if (ownedProcessesAlive(this.inspect(id))) {
        this.beginDrain(id, 'SIGKILL');
        await Bun.sleep(100);
      }
    } finally {
      clearTimeout(timer);
    }
  }
  /**
   * The scope a managed resource's cleanup inspects with (J19): every Dash job scope and the
   * process group of every unreleased use and host job are owned, and the identity is the use's
   * owned process-group leader, or its creator when it never ran a command.
   */
  private useScope(use: ResourceUse): HoldScope {
    const sessions = new Set<string>();
    for (const other of this.list())
      if (other.state !== 'released' && other.process !== null)
        sessions.add(String(other.process.pid));
    for (const job of this.listHostJobs())
      if (job.state !== 'released' && job.process !== null) sessions.add(String(job.process.pid));
    return {
      owns: (component) => DASH_JOB_SCOPE.test(component),
      sessions,
      before: use.process ?? use.creator,
      ownCgroup: ownCgroupPath(),
      held: `resource ${use.id}`,
      remedy: 'end it, and cleanup retries',
      outside: [],
    };
  }
  private cleanup(id: string): void {
    const snapshot = this.inspect(id);
    if (
      snapshot.process !== null &&
      (!alive(snapshot.creator) || snapshot.drainRequestedAt !== null)
    ) {
      try {
        this.beginDrain(
          id,
          snapshot.drainRequestedAt !== null &&
            this.clock.read() - snapshot.drainRequestedAt >= 5000
            ? 'SIGKILL'
            : 'SIGTERM',
        );
      } catch (cause) {
        this.transaction(() => {
          const use = this.inspect(id);
          use.cleanupAttempts += 1;
          this.block(use, cause);
        });
        return;
      }
    }
    // Only a complete preservation/ownership preflight may commit an effect intent.
    const generation = this.transaction(() => {
      const use = this.inspect(id);
      if (use.state === 'released') return null;
      use.cleanupAttempts += 1;
      use.cleanupGeneration += 1;
      try {
        if (ownedProcessesAlive(use)) throw new Error('owned command remains live');
        inspectHolds(use.locator, this.useScope(use));
        this.checkDependencies(use);
        const present = this.checkTarget(use);
        // Proof: bypassing absence provenance released a moved resource (unproven-absence.log).
        if (!present && use.dev !== null && !use.deleteIntent)
          throw new Error('resource absence has no persisted deletion intent');
        if (present) {
          this.checkStorage(use);
          if (!this.preserve(use)) return null;
          use.deleteIntent = true;
        }
        this.save(use);
        return use.cleanupGeneration;
      } catch (cause) {
        this.block(use, cause);
        return null;
      }
    });
    if (generation === null) return;
    this.transaction(() => {
      const use = this.inspect(id);
      if (use.state === 'released' || use.cleanupGeneration !== generation) return;
      try {
        const scope = this.useScope(use);
        if (ownedProcessesAlive(use)) throw new Error('owned command remains live');
        inspectHolds(use.locator, scope);
        this.checkDependencies(use);
        const present = this.checkTarget(use);
        // Proof: bypassing absence provenance released a moved resource (unproven-absence.log).
        if (!present && use.dev !== null && !use.deleteIntent)
          throw new Error('resource absence has no persisted deletion intent');
        if (present) this.checkStorage(use);
        if (present && use.request.source !== undefined) {
          if (!this.preserve(use)) return;
          this.checkTarget(use);
          git([
            '-C',
            use.request.source,
            '-c',
            'core.hooksPath=/dev/null',
            'worktree',
            'remove',
            use.locator,
          ]);
        } else if (present) {
          const execution = Bun.spawnSync(
            [
              'python3',
              '-c',
              removeDirectory,
              this.configuration.root,
              use.id,
              String(use.dev),
              String(use.ino),
            ],
            { stdout: 'pipe', stderr: 'pipe', timeout: 30000, killSignal: 'SIGKILL' },
          );
          if (execution.exitCode !== 0) throw new Error('descriptor-relative removal refused');
        }
        if (this.checkTarget(use)) throw new Error('provider still contains resource');
        inspectHolds(use.locator, scope);
        use.state = 'released';
        use.reason = `provider absence and file holds verified${outsideNote(scope)}`;
        use.releasedDiskUnits = use.request.diskUnits;
        use.releasedWorkspaceUnits = 1;
        this.event(use, 'release_verified');
      } catch (cause) {
        this.block(use, cause);
      }
    });
  }
  /** Launch an owned process group behind a startup gate; outcome and cleanup are independent. */
  async run(id: string, command: readonly string[], signal?: AbortSignal): Promise<number> {
    if (command.length === 0) throw new Error('resource run requires a command');
    const use = this.inspect(id);
    if (use.state !== 'active' || use.process !== null)
      throw new Error('resource is not available for execution');
    this.checkTarget(use);
    const child = spawn(
      '/bin/sh',
      ['-c', 'read gate <&3 || exit 125; exec 3<&-; exec "$@"', 'dash-resource', ...command],
      {
        cwd: use.locator,
        detached: true,
        stdio: ['inherit', 'inherit', 'inherit', 'pipe'],
        env: {
          ...process.env,
          DASH_RESOURCE_USE_ID: use.id,
          DASH_RESOURCE_ROOT: this.configuration.root,
        },
      },
    );
    const completion = new Promise<number>((resolveExit, rejectExit) => {
      child.once('error', rejectExit);
      child.once('exit', (code, killed) => {
        resolveExit(killed ? 128 : (code ?? 1));
      });
    });
    if (!child.pid) throw new Error('owned command did not start');
    const identity = identifyProcess(child.pid);
    if (!identity) throw new Error('owned command identity unavailable');
    this.transaction(() => {
      const current = this.inspect(id);
      if (
        current.revision !== use.revision ||
        current.state !== 'active' ||
        current.process !== null
      )
        throw new Error('resource execution became stale');
      current.process = identity;
      current.launchDeadline = null;
      current.startedAt = this.clock.read();
      const owner = identifyProcess(process.pid);
      if (owner === null) throw new Error('command owner identity unavailable');
      current.creator = owner;
      this.save(current);
    });
    const gate = child.stdio[3];
    if (!(gate instanceof Writable)) throw new Error('owned command gate unavailable');
    let cancelled = false;
    gate.on('error', (cause) => {
      if (!cancelled) child.emit('error', cause);
    });
    const cancellation: { draining: Promise<void> | null } = { draining: null };
    const cancel = (): void => {
      cancelled = true;
      this.beginDrain(id, 'SIGTERM');
      cancellation.draining = this.finishDrain(id);
    };
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    gate.end('start\n');
    try {
      const code = await completion;
      this.transaction(() => {
        const current = this.inspect(id);
        current.outcome = cancelled ? 'cancelled' : code === 0 ? 'succeeded' : 'failed';
        current.endedAt = this.clock.read();
        this.enqueue(current, current.revision, current.incarnation, 'owned command ended');
      });
      if (cancellation.draining !== null) await cancellation.draining;
      this.sweep();
      return code;
    } finally {
      signal?.removeEventListener('abort', cancel);
    }
  }
  /** The last request cursor committed with its local intent; never inferred from an HTTP acknowledgment. */
  requestCursor(): number {
    const cursor = this.db
      .query<{ value: number }, []>('SELECT value FROM cursor WHERE id=1')
      .get();
    if (!cursor) throw new Error('resource request cursor missing');
    return cursor.value;
  }
  /**
   * Ordered publication retries exact bytes; request acceptance and cursor advancement share one
   * SQLite transaction. Host-job changes join the outbox first ({@link moveHostJobEvents}), so a
   * WBS that answers nothing only delays them and they publish in order on the next tick it does.
   */
  async synchronize(tools: WbsTools): Promise<void> {
    const authorityId = this.configuration.authorityId;
    this.moveHostJobEvents();
    let admissionFailure: Error | undefined;
    // Proof: recovering a live in-flight admission failed the watcher/creator race fixture (2026-10-25).
    for (const pending of this.list().filter(
      (use) => use.revision === 0 && (use.sealed || !alive(use.creator)),
    )) {
      try {
        await this.admit(pending.id, tools);
        this.transaction(() => {
          const admitted = this.inspect(pending.id);
          if (admitted.state === 'creating')
            this.enqueue(
              admitted,
              admitted.revision,
              admitted.incarnation,
              'admission recovered without physical creation',
            );
        });
      } catch (cause) {
        // Admission failure must not block publication or cleanup of independently admitted uses.
        admissionFailure ??=
          cause instanceof Error ? cause : new Error('resource admission failed', { cause });
      }
    }

    for (const event of this.outbox()) {
      const acknowledgment = type({
        acceptedSequence: 'number.integer > 0',
        useId: 'string',
        revision: 'number.integer > 0',
      }).assert(await this.publishEvent(tools, event));
      if (
        acknowledgment.acceptedSequence !== event.sequence ||
        acknowledgment.useId !== event.useId ||
        acknowledgment.revision !== event.revision
      )
        throw new Error('resource publication acknowledgment mismatch');
      this.transaction(() => {
        const marked = this.db
          .query('UPDATE events SET published=1 WHERE sequence=? AND event=?')
          .run(event.sequence, JSON.stringify(event));
        // An operator's drop (task 6.8a) can remove or renumber the row while WBS answers: the
        // outbox then no longer holds what WBS accepted, and publishing on would reuse its sequence.
        // Proof: without it `a drop racing the publication of the same event stops the
        // publication` (outbox-drop.test.ts) saw it resolve `synchronized` (2026-11-05, Slice 6g).
        if (marked.changes !== 1)
          throw new Error(
            `resource outbox event ${event.eventId} (sequence ${String(event.sequence)}) changed while it was published; another process dropped or rewrote it`,
          );
        this.db.query('DELETE FROM event_refusals WHERE event_id=?').run(event.eventId);
      });
    }
    const page = type({
      requests: resourceCleanupRequest.array(),
      nextCursor: 'string | null',
    }).assert(
      await answeredBody(
        tools,
        CLEANUP_REQUESTS_TOOL,
        { authorityId, after: String(this.requestCursor()), limit: '100' },
        'resource request read',
      ),
    );
    this.transaction(() => {
      let cursor = this.requestCursor();
      for (const request of page.requests) {
        if (!Number.isSafeInteger(request.requestId) || request.requestId < 1)
          throw new Error('resource request cursor malformed');
        if (request.requestId <= cursor) continue;
        const use = this.inspect(request.useId);
        use.requestId = request.requestId;
        if (request.incarnation !== use.incarnation || request.expectedRevision > use.revision)
          throw new Error('stale resource request identity');
        if (use.state === 'released') {
          use.reason = 'already released; cleanup request acknowledged';
          this.event(use, 'release_verified');
        } else this.enqueue(use, use.revision, use.incarnation, request.reason);
        cursor = request.requestId;
      }
      if (page.nextCursor !== null && Number(page.nextCursor) !== cursor)
        throw new Error('resource request cursor mismatch');
      this.db.query('UPDATE cursor SET value=? WHERE id=1').run(cursor);
    });
    if (admissionFailure !== undefined) throw admissionFailure;
  }
  /**
   * One outbox event through the events tool. A host-job event refused `400` is retried, named
   * on stderr, for {@link HOST_JOB_REFUSAL_RETRY_MS} from its first refusal (bounded
   * convergence, S5-A20): an outgoing WBS without v2 refuses it mid-swap.
   * @throws ResourceWbsUnavailable while that bound lasts, so `watch` keeps the outbox; the
   * refusal itself once it is spent, and every other refusal as {@link answeredBody} does.
   */
  private async publishEvent(tools: WbsTools, event: ResourceEvent): Promise<unknown> {
    const input = { authorityId: this.configuration.authorityId, ...event };
    try {
      const body = await answeredBody(tools, EVENT_TOOL, input, 'resource publication');
      this.hostJobRefusals.delete(event.eventId);
      return body;
    } catch (cause) {
      if (
        !(cause instanceof ResourceWbsRefusal) ||
        cause.status !== 400 ||
        event.use.kind !== 'host_job'
      )
        throw cause;
      const now = this.clock.read();
      const first = this.hostJobRefusals.get(event.eventId) ?? now;
      this.hostJobRefusals.set(event.eventId, first);
      // Proof: without it `a refused event is dropped, journalled, and the next one publishes`
      // (outbox-drop.test.ts) found no refusal record (2026-11-05, verify.md Slice 6g).
      this.recordRefusal(event, cause, now);
      // Proof: with the bound check made `true`, `a host-job event refused past the bound stops
      // watch` (host-job-publication.test.ts) kept retrying, ResourceWbsUnavailable for the
      // refusal (2026-11-02, verify.md Slice 5 review fixes).
      if (now - first >= HOST_JOB_REFUSAL_RETRY_MS) throw cause;
      process.stderr.write(
        `resources: WBS refused host-job event ${event.eventId} (sequence ${String(event.sequence)}) with HTTP 400; retrying until ${new Date(first + HOST_JOB_REFUSAL_RETRY_MS).toISOString()}\n`,
      );
      // Proof: rethrowing the refusal here made `a host-job event refused 400 twice publishes in
      // order once WBS accepts it` (host-job-publication.test.ts) stop at the first refusal
      // (2026-11-02, verify.md Slice 5 review fixes).
      throw new ResourceWbsUnavailable(`${cause.message}; retried as a host-job event`, { cause });
    }
  }
  /**
   * Keep `cause` as `event`'s last refusal (task 6.8a), keyed by event id and the SHA-256 of its
   * stored bytes; a refusal of other bytes under the same id starts the record again.
   */
  private recordRefusal(event: ResourceEvent, cause: ResourceWbsRefusal, at: number): void {
    const bytes = JSON.stringify(event);
    const digest = createHash('sha256').update(bytes).digest('hex');
    this.transaction(() => {
      // An operator's drop may have removed or renumbered the event while WBS answered: a row
      // for it then names nothing, or the sequence the next event now holds (review of #878 F2).
      // Proof: without it `a refusal answered after a drop records no ghost row`
      // (outbox-drop.test.ts) kept a row for the dropped event (2026-11-06, Slice 6g review).
      const present = this.db
        .query<{ sequence: number }, [number, string]>(
          'SELECT sequence FROM events WHERE sequence=? AND event=? AND published=0',
        )
        .get(event.sequence, bytes);
      if (present === null) return;
      this.db
        .query(
          'INSERT INTO event_refusals VALUES (?,?,?,?,?,?,?,1) ON CONFLICT(event_id) DO UPDATE SET sequence=excluded.sequence, status=excluded.status, error=excluded.error, last_refused_at=excluded.last_refused_at, first_refused_at=CASE WHEN digest=excluded.digest THEN first_refused_at ELSE excluded.first_refused_at END, refusals=CASE WHEN digest=excluded.digest THEN refusals+1 ELSE 1 END, digest=excluded.digest',
        )
        .run(event.eventId, event.sequence, digest, cause.status, cause.message, at, at);
    });
  }
  /** Every recorded refusal of an outbox event, by sequence ({@link recordRefusal}). */
  outboxRefusals(): OutboxRefusal[] {
    return this.db
      .query<
        {
          event_id: string;
          sequence: number;
          digest: string;
          status: number;
          error: string;
          first_refused_at: number;
          last_refused_at: number;
          refusals: number;
        },
        []
      >('SELECT * FROM event_refusals ORDER BY sequence')
      .all()
      .map((row) => ({
        eventId: row.event_id,
        sequence: row.sequence,
        digest: row.digest,
        status: row.status,
        error: row.error,
        firstRefusedAt: row.first_refused_at,
        lastRefusedAt: row.last_refused_at,
        refusals: row.refusals,
      }));
  }
  /** Every operator drop of an outbox event, oldest first ({@link dropRefusedEvent}). */
  outboxDrops(): OutboxDrop[] {
    return this.db
      .query<{ sequence: number; record: string }, []>(
        'SELECT sequence, record FROM dropped_events ORDER BY sequence',
      )
      .all()
      .map((row) => ({
        sequence: row.sequence,
        ...OutboxDropShape.assert(JSON.parse(row.record)),
      }));
  }
  /**
   * Drop the host-job event at the head of the authority outbox that WBS refused `400` and will
   * keep refusing (task 6.8a, S6F-A4), in one transaction: delete it, give every later event one
   * sequence less (WBS takes only the authority's next sequence), forget its refusal and journal
   * the drop. The dropped event never reaches WBS: WBS keeps the use as its last accepted event
   * left it.
   * @throws OutboxDropRefusal, changing nothing, when the event is not in the outbox, is not its
   * head, is not a host job's, has no recorded `400` of its current bytes, or a later outbox
   * event of the same use waits behind it (that one's revision would never be accepted), or,
   * in concurrent mode with the guard on, while the singleton guard's holder is live.
   * @throws Error when a published event follows the head: only this class writes the ledger.
   */
  dropRefusedEvent(
    eventId: string,
    attribution: { operator: string; account: string; reason: string },
  ): OutboxDrop {
    return this.transaction(() => {
      const pool = this.poolRow();
      // The guard's holder lives while `watch` serves demand in concurrent mode; observe mode and
      // a released guard have no such signal (review of #878 F1).
      // Proof: without it `a live singleton guard refuses the drop` (host-pool-mode.test.ts)
      // went past the guard to `is not in the outbox` (2026-11-06, Slice 6g review).
      if (pool.mode === 'concurrent' && pool.guard === 'on' && this.guardHeld(pool.guardHolder))
        throw new OutboxDropRefusal(
          `the singleton guard's holder (pid ${String(pool.guardHolder?.pid)}) is live in concurrent mode, so resources watch may be publishing; stop dash-resources-watch.service, end that holder if it outlives watch, and retry`,
        );
      const authority = this.configuration.authorityId;
      const target = this.db
        .query<{ sequence: number; event: string; published: number }, [string]>(
          "SELECT sequence, event, published FROM events WHERE json_extract(event,'$.eventId')=? ORDER BY sequence",
        )
        .all(eventId);
      // Proof: without it `an id not in the outbox is not dropped` (outbox-drop.test.ts)
      // threw a TypeError reading the absent row (2026-11-05, verify.md Slice 6g).
      const row = target.at(0);
      if (row === undefined || target.length !== 1)
        throw new OutboxDropRefusal(
          target.length > 1
            ? `event ${eventId} names ${String(target.length)} outbox rows`
            : `event ${eventId} is not in the outbox of authority ${authority}`,
        );
      const at = `event ${eventId} (sequence ${String(row.sequence)})`;
      if (row.published !== 0)
        throw new OutboxDropRefusal(
          `event ${eventId} was published (sequence ${String(row.sequence)}); nothing to drop`,
        );
      const event = resourceRuntimeEvent.assert(JSON.parse(row.event));
      const pending = this.outbox();
      if (pending.at(0)?.eventId !== eventId)
        throw new OutboxDropRefusal(
          `${at} is not the head of the outbox; only the event blocking it can be dropped`,
        );
      if (event.use.kind !== 'host_job')
        throw new OutboxDropRefusal(
          `${at} is a ${event.use.kind} use's; only a host job's event can be dropped`,
        );
      const digest = createHash('sha256').update(row.event).digest('hex');
      const refusal = this.outboxRefusals().find((recorded) => recorded.eventId === eventId);
      // Proof: with an absent record defaulted to a `400` of these bytes, `an event WBS has not
      // refused is not dropped` (outbox-drop.test.ts) exited 0 and emptied the outbox; with this
      // check passing an absent record it threw a TypeError, not 64 (2026-11-05, Slice 6g).
      if (refusal?.status !== 400 || refusal.digest !== digest)
        throw new OutboxDropRefusal(
          `${at} has no recorded WBS refusal; only an event WBS refused 400 can be dropped`,
        );
      const sameUse = pending.slice(1).find((later) => later.useId === event.useId);
      // Proof: with this check removed, `a refused event its own use still follows is not
      // dropped` (outbox-drop.test.ts) exited 0 (2026-11-05, verify.md Slice 6g).
      if (sameUse !== undefined)
        throw new OutboxDropRefusal(
          `${at} is followed by event ${sameUse.eventId} (sequence ${String(sameUse.sequence)}) of the same use ${event.useId}; dropping it would strand that use's later revisions`,
        );
      const published = this.db
        .query<{ count: number }, [number]>(
          'SELECT COUNT(*) AS count FROM events WHERE published=1 AND sequence>?',
        )
        .get(row.sequence);
      if (published?.count !== 0)
        throw new Error(`resource outbox publishes past its head ${String(row.sequence)}`);
      this.db.query('DELETE FROM events WHERE sequence=?').run(row.sequence);
      // Proof: with the later events left at their sequences, `a refused event is dropped,
      // journalled, and the next one publishes` (outbox-drop.test.ts) stopped on the fake
      // be-01's `409 conflict` for sequence 3 after 1 (2026-11-05, verify.md Slice 6g).
      for (const later of pending.slice(1)) {
        const renumbered = resourceRuntimeEvent.assert({ ...later, sequence: later.sequence - 1 });
        this.db
          .query('UPDATE events SET sequence=?, event=? WHERE sequence=?')
          .run(renumbered.sequence, JSON.stringify(renumbered), later.sequence);
      }
      // Also any row a refusal left for an event no longer waiting (review of #878 F2).
      // It is the only delete here, the dropped event's own row included. Proof: without it
      // `a drop purges refusal rows of events no longer waiting` and the happy-path test
      // (outbox-drop.test.ts) kept rows (2026-11-06, Slice 6g review).
      this.db
        .query(
          "DELETE FROM event_refusals WHERE event_id NOT IN (SELECT json_extract(event,'$.eventId') FROM events WHERE published=0)",
        )
        .run();
      const following = pending.at(1);
      const record: Omit<OutboxDrop, 'sequence'> = {
        at: this.clock.read(),
        ...attribution,
        eventId,
        eventSequence: row.sequence,
        useId: event.useId,
        kind: event.kind,
        digest,
        bytes: row.event,
        refusal: {
          status: refusal.status,
          error: refusal.error,
          firstRefusedAt: refusal.firstRefusedAt,
          lastRefusedAt: refusal.lastRefusedAt,
          refusals: refusal.refusals,
        },
        next:
          following === undefined
            ? null
            : { eventId: following.eventId, sequence: following.sequence - 1 },
        renumbered: pending.length - 1,
      };
      const inserted = this.db
        .query<{ sequence: number }, [string]>(
          'INSERT INTO dropped_events(record) VALUES (?) RETURNING sequence',
        )
        .get(JSON.stringify(OutboxDropShape.assert(record)));
      if (inserted === null) throw new Error('resource outbox drop record unwritten');
      return { sequence: inserted.sequence, ...record };
    });
  }
  /** What a calibration reserves: all of `allocatable`, its disk budget also in whole GiB. */
  private wholePool(): HostJobReservation {
    const allocatable = this.allocatable();
    return {
      ...allocatable,
      tmpDiskGib: Math.floor((allocatable.diskUnits * this.configuration.diskUnitBytes) / GIB),
    };
  }
  /** `allocatable[d] = budget[d] − headroom[d]` (J5); disk and slots have no headroom here. */
  private allocatable(): PoolVector {
    const configuration = this.configuration;
    return {
      cpuCores: configuration.cpuCores - configuration.headroom.cpuCores,
      memoryGib: configuration.memoryGib - configuration.headroom.memoryGib,
      diskUnits: configuration.diskBudgetUnits,
      workspaceSlots: configuration.workspaceSlots,
    };
  }
  /**
   * Every non-released use's reservation in one vector (J4, J5): a worktree or directory use
   * whole, a host job per unreleased entry, so a settled compute entry stops charging cores and
   * memory while its tmp directory or tree is still outstanding. `units` maps each held unit
   * path to its job.
   */
  private reservations(): { vector: PoolVector; units: Map<string, string> } {
    const vector: PoolVector = { cpuCores: 0, memoryGib: 0, diskUnits: 0, workspaceSlots: 0 };
    const units = new Map<string, string>();
    for (const use of this.list()) {
      if (use.state === 'released') continue;
      vector.diskUnits += use.request.diskUnits;
      vector.workspaceSlots += 1;
    }
    for (const job of this.listHostJobs()) {
      // Each job charges what it persisted at admission; a calibration persisted `allocatable`.
      // Proof: summing the envelope here made `a calibration holds the whole allocatable
      // vector` (calibrate.test.ts) reserve the gate's 4 cores, not the 8 allocatable
      // (2026-11-02, Slice 4 review A3).
      if (job.compute.state !== 'released') {
        vector.cpuCores += job.reserved.cpuCores;
        vector.memoryGib += job.reserved.memoryGib;
      }
      if (job.tmpDisk.state !== 'released') {
        vector.diskUnits += job.reserved.diskUnits;
        vector.workspaceSlots += job.reserved.workspaceSlots;
      }
      for (const unit of job.units) if (unit.state !== 'released') units.set(unit.path, job.id);
    }
    return { vector, units };
  }
  /** Measured free bytes cover every reservation growing to its full size, plus headroom. */
  private freeSpaceCovers(diskUnits: number): boolean {
    return this.freeSpaceShortfall(diskUnits) === null;
  }
  /** Why measured free bytes do not cover `diskUnits` plus headroom, with both figures, or null. */
  private freeSpaceShortfall(diskUnits: number): string | null {
    const available = statfsSync(this.configuration.root);
    const needed = diskUnits * this.configuration.diskUnitBytes + this.configuration.headroomBytes;
    const free = available.bavail * available.bsize;
    return needed <= free
      ? null
      : `free space ${String(free)} bytes under ${this.configuration.root} is below the ${String(needed)} needed (${String(diskUnits)} disk units plus ${String(this.configuration.headroomBytes)} bytes headroom)`;
  }
  /**
   * A persisted host-job snapshot. Only this class writes the owner-only ledger, so malformed
   * JSON throws rather than defaulting. A row from before `reserved` was persisted (slice 4
   * review A3) reads it from its descriptor, as `reservations()` computed it then; a calibration
   * row without one cannot exist (calibration and `reserved` landed in one slice), so it throws.
   */
  private hostJobOf(snapshot: string): HostJob {
    const parsed = HostJobShape.assert(JSON.parse(snapshot));
    // Proof: dropping the fallback made `a ledger row written before `reserved` was persisted
    // reads it from its descriptor` (calibrate.test.ts) read no reservation (2026-11-02, A3).
    if (parsed.reserved !== undefined) return { ...parsed, reserved: parsed.reserved };
    // Proof: deriving it from `wholePool()` again made `a calibration row without its
    // reservation is refused` (calibrate.test.ts) read the row (2026-11-02, Slice 6b, S3 follow-up b).
    if (parsed.calibration === true)
      throw new Error(`host job ${parsed.id} is a calibration with no persisted reservation`);
    const reserved = {
      cpuCores: parsed.descriptor.envelope.cpuCores,
      memoryGib: parsed.descriptor.envelope.memoryGib,
      diskUnits: parsed.diskUnits,
      workspaceSlots: 1,
      tmpDiskGib: parsed.descriptor.envelope.tmpDiskGib,
    };
    return { ...parsed, reserved };
  }
  private diskUnitsOf(descriptor: JobTypeDescriptor): number {
    return Math.ceil((descriptor.envelope.tmpDiskGib * GIB) / this.configuration.diskUnitBytes);
  }
  /** Persisted host jobs are trusted local state; corruption throws instead of implying absence. */
  inspectHostJob(id: string): HostJob {
    const row = this.db
      .query<{ snapshot: string }, [string]>('SELECT snapshot FROM host_jobs WHERE id=?')
      .get(id);
    if (!row) throw new Error('host job not found');
    return this.hostJobOf(row.snapshot);
  }
  /**
   * Whether host job `id`'s payload runs now, for a nested launcher's admission check
   * (`dash-host-jobs` task 6.10a): launched (`held`), no exit or launch failure recorded, and
   * its process group leader still the process recorded at launch. `state` is null for an id
   * this ledger never admitted. Reads only: no sweep, no settlement, no lock.
   */
  hostJobRunning(id: string): { state: HostJob['state'] | null; running: boolean } {
    const row = this.db
      .query<{ snapshot: string }, [string]>('SELECT snapshot FROM host_jobs WHERE id=?')
      .get(id);
    if (!row) return { state: null, running: false };
    const job = this.hostJobOf(row.snapshot);
    // Proof: with only the `held` comparison, `a job whose payload exited, or whose process is
    // gone, is not running` (admission.test.ts) read the exited job as running; with the
    // liveness check alone dropped, the killed payload's job (2026-11-05, verify.md Slice 6e).
    const running =
      job.state === 'held' &&
      job.exitCode === null &&
      job.launchFailure === undefined &&
      job.process !== null &&
      alive(job.process);
    return { state: job.state, running };
  }
  /** Every host job, released history included, oldest admission first. */
  listHostJobs(): HostJob[] {
    return this.db
      .query<{ snapshot: string }, []>('SELECT snapshot FROM host_jobs ORDER BY rowid')
      .all()
      .map((row) => this.hostJobOf(row.snapshot));
  }
  /**
   * Record a host job's change with the reservation it leaves, in the caller's transaction:
   * the local outbox `host_job_events`, which slice 5 publishes to WBS as `resourceRuntimeUse`
   * v2 (J10). Its `reserved` is read after the change, so the history replays the pool.
   */
  private hostJobEvent(job: HostJob, kind: 'admitted' | 'launched' | 'settlement'): void {
    job.revision += 1;
    this.db
      .query(
        'INSERT INTO host_jobs VALUES (?,?) ON CONFLICT(id) DO UPDATE SET snapshot=excluded.snapshot',
      )
      .run(job.id, JSON.stringify(HostJobShape.assert(job)));
    const { vector } = this.reservations();
    this.db.query('INSERT INTO host_job_events(event) VALUES (?)').run(
      JSON.stringify({
        jobId: job.id,
        incarnation: job.incarnation,
        revision: job.revision,
        kind,
        observedAt: this.clock.read(),
        type: job.descriptor.id,
        label: job.label,
        state: job.state,
        compute: job.compute,
        tmpDisk: job.tmpDisk,
        units: job.units,
        reserved: vector,
        allocatable: this.allocatable(),
      }),
    );
  }
  private saveHostJob(job: HostJob): void {
    this.db
      .query('UPDATE host_jobs SET snapshot=? WHERE id=?')
      .run(JSON.stringify(HostJobShape.assert(job)), job.id);
  }
  /**
   * Moves the unmoved `host_job_events` rows into the authority outbox `events` as
   * `resourceRuntimeUse` v2 (`dash-host-jobs` J10), oldest first and in one transaction, so they
   * take the authority's one sequence beside the worktree uses' events: `admitted` becomes
   * `registered`; the settlement that leaves every entry released becomes `release_verified`
   * with its evidence (J2', {@link settlementEvidence}): the run record's locator and the SHA-256
   * of its gate entry, `returned`, or `not_created` for a job whose gate never opened. A launch,
   * a partial settlement or a blocked retry stays local. A moved row is
   * `published=1`; from there its delivery is the outbox's. The host pool admitted the job
   * already, so nothing here waits on WBS.
   * @throws when a row or its job is malformed: only this class writes the owner-only ledger;
   * or when the run records cannot be read, which leaves every row unmoved.
   */
  private moveHostJobEvents(): void {
    this.transaction(() => {
      const rows = this.db
        .query<{ sequence: number; event: string }, []>(
          'SELECT sequence, event FROM host_job_events WHERE published=0 ORDER BY sequence',
        )
        .all();
      // Proof: moving the rows newest first made `a gate run while WBS is down publishes
      // registered then returned, in order` (host-job-publication.test.ts) find release_verified
      // ahead of registered in the outbox (2026-11-01, verify.md Slice 5).
      for (const row of rows) {
        const change = HostJobChangeShape.assert(JSON.parse(row.event));
        const kind =
          change.kind === 'admitted'
            ? 'registered'
            : change.kind === 'settlement' && change.state === 'released'
              ? 'release_verified'
              : null;
        if (kind !== null) {
          const job = this.inspectHostJob(change.jobId);
          const next = this.db
            .query<{ sequence: number }, []>(
              'SELECT COALESCE(MAX(sequence),0)+1 AS sequence FROM events',
            )
            .get();
          if (!next) throw new Error('resource event sequence unavailable');
          const event: ResourceEvent = {
            eventId: randomUUID(),
            epoch: this.configuration.epoch,
            sequence: next.sequence,
            useId: job.id,
            incarnation: job.incarnation,
            revision: kind === 'registered' ? 1 : 2,
            kind,
            observedAt: change.observedAt,
            reason:
              kind === 'registered'
                ? `admitted by host pool ${this.configuration.enrollmentId}`
                : 'every reservation entry returned on its terminal evidence',
            use: hostJobDeclaration(job, this.configuration.enrollmentId),
            ...(kind === 'release_verified'
              ? {
                  evidence: this.settlementEvidence(job.id),
                }
              : {}),
          };
          this.db
            .query('INSERT INTO events(sequence,event) VALUES (?,?)')
            .run(event.sequence, JSON.stringify(resourceRuntimeEvent.assert(event)));
        }
        this.db.query('UPDATE host_job_events SET published=1 WHERE sequence=?').run(row.sequence);
      }
    });
  }
  /**
   * The settlement evidence of a returned host job (`dash-host-jobs` task 6.8, S6F-A1): its run
   * record's locator ({@link hostJobRunRecordLocator}, this pool's `enrollmentId` as host) and
   * the SHA-256 of that record's gate entry, disposition `returned`. A job with no run
   * record (its launcher never wrote the gate entry) is `not_created`, digesting
   * {@link hostJobRunRecordAbsence}; a job refused after `begin` (a late SIGINT) has one and is
   * `returned`. The gate
   * entry is written before the payload runs and the gated shell cannot exit before it, so a
   * released job without one never ran its payload. One window is admitted: a scope killed from
   * outside after the gate sample and before `begin` can be settled and moved by `watch` as
   * `not_created` while `begin` then writes `start`, so WBS holds `not_created` for a record that
   * exists; it is a few milliseconds long and loses no state.
   * @throws when the run records are missing, a link, not owner-only or of another schema.
   */
  private settlementEvidence(jobId: string): NonNullable<ResourceEvent['evidence']> {
    const locator = hostJobRunRecordLocator(this.configuration.enrollmentId, jobId);
    const start = readRunRecordStart(this.configuration.root, jobId);
    // Proof: with the gate entry treated as absent, `a gate run while WBS is down publishes
    // registered then returned, in order` (host-job-publication.test.ts) and `a returned gate
    // digests its run record's gate entry…` (job-run.test.ts) received `not_created` and the
    // absence digest for the run record's (2026-11-05, task 6.8).
    return start === null
      ? {
          digest: createHash('sha256').update(hostJobRunRecordAbsence(locator)).digest('hex'),
          locator,
          disposition: 'not_created',
          reclaimedBytes: null,
        }
      : {
          digest: runRecordDigestOf(start),
          locator,
          disposition: 'returned',
          reclaimedBytes: null,
        };
  }
  /** Host-job events not yet moved to the authority outbox, oldest first ({@link moveHostJobEvents}). */
  hostJobOutbox(): { sequence: number; event: unknown }[] {
    return this.db
      .query<{ sequence: number; event: string }, []>(
        'SELECT sequence, event FROM host_job_events WHERE published=0 ORDER BY sequence',
      )
      .all()
      .map((row) => ({ sequence: row.sequence, event: JSON.parse(row.event) as unknown }));
  }
  private tickets(): TicketRow[] {
    return this.db.query<TicketRow, []>('SELECT * FROM host_job_tickets ORDER BY sequence').all();
  }
  private ticketView(row: TicketRow): HostJobTicket {
    return {
      sequence: row.sequence,
      label: row.label,
      type: this.ticketRequest(row).descriptor.id,
      pid: row.pid,
      arrivedAt: row.arrived_at,
      deadline: row.deadline,
      overtakes: row.overtakes,
      calibration: this.ticketRequest(row).calibration === true,
    };
  }
  private ticketRequest(row: TicketRow): HostJobRequest {
    // Only this class writes tickets; a malformed request throws rather than defaulting.
    return HostJobRequestShape.assert(JSON.parse(row.request));
  }
  /**
   * The refusal for an envelope this pool can never hold (J5, exit 73), naming the dimension
   * and both figures, or null.
   */
  private oversize(descriptor: JobTypeDescriptor, calibration: boolean): string | null {
    const allocatable = this.allocatable();
    const name = `host job ${descriptor.id} refused`;
    // A calibration holds the whole vector whatever its envelope says: it is how an envelope
    // too large for this pool is measured (slice 4 assumption S4-A3).
    if (!calibration)
      for (const dimension of ['cpuCores', 'memoryGib'] as const)
        if (descriptor.envelope[dimension] > allocatable[dimension])
          return `${name}: ${dimension} ${String(descriptor.envelope[dimension])} exceeds allocatable ${String(allocatable[dimension])}`;
    if (!calibration && this.diskUnitsOf(descriptor) > allocatable.diskUnits)
      return `${name}: tmpDiskGib ${String(descriptor.envelope.tmpDiskGib)} exceeds allocatable ${String(Math.floor((allocatable.diskUnits * this.configuration.diskUnitBytes) / GIB))}`;
    for (const id of descriptor.envelope.exclusive)
      if ((this.configuration.exclusiveUnits[id] ?? []).length === 0)
        return `${name}: exclusive ${id} has 0 units in this pool`;
    return null;
  }
  /**
   * Queue a host job for `waiterPid`, the process that polls the ticket and launches the job:
   * the ticket dies with that process identity (J6). An envelope the pool can never hold is
   * refused 73 at once and writes no ticket. Arrival order is the ticket's sequence, assigned
   * under the ledger's write lock; deadlines are epoch milliseconds because other processes
   * read them, as the shell lock's tickets carry epoch seconds.
   * @throws when the request is malformed, names an exclusive id twice, or the waiter's
   * identity cannot be read.
   */
  enqueueHostJob(
    input: HostJobRequest,
    waiterPid: number,
  ): { kind: 'queued'; ticket: string } | { kind: 'refused'; exitCode: 73 | 75; reason: string } {
    const request = HostJobRequestShape.assert(input);
    const exclusive = request.descriptor.envelope.exclusive;
    // Proof: without it `the host-job seams refuse out-of-order calls` (host-jobs.test.ts)
    // queued a gate naming gate_tree twice (2026-11-01, verify.md Slice 2).
    if (new Set(exclusive).size !== exclusive.length)
      throw new Error(`host job ${request.descriptor.id} names an exclusive id twice`);
    const oversize = this.oversize(request.descriptor, request.calibration === true);
    // Proof: without it, `refuses an envelope larger than the host, exit 73 without a ticket`
    // (host-jobs.test.ts) queued the 14 GiB gate (2026-11-01, verify.md Slice 2).
    if (oversize !== null) return { kind: 'refused', exitCode: 73, reason: oversize };
    const waiter = identifyProcess(waiterPid);
    if (waiter === null) throw new Error('host job waiter identity unavailable');
    return this.transaction(() => {
      // A switch-mode in progress stops intake (J12, S6B-A16): new tickets are refused 75;
      // tickets already queued keep their budget and their place, and the switch waits for them.
      const fence = this.liveSwitch();
      // Proof: without it `switch-mode stops intake; queued waiters keep their place`
      // (host-pool-mode.test.ts) queued the late job during the drain (2026-11-02, review H4).
      if (fence !== null)
        return {
          kind: 'refused' as const,
          exitCode: 75 as const,
          reason: `host job ${request.descriptor.id} ${request.label} refused: intake stopped while ops pool switch-mode ${fence.target} by ${fence.operator} (pid ${String(fence.pid)}) drains the pool; retry once it ends`,
        };
      const ticket = randomUUID();
      const now = this.clock.read();
      this.db
        .query(
          'INSERT INTO host_job_tickets(id,label,request,pid,boot,start,arrived_at,deadline) VALUES (?,?,?,?,?,?,?,?)',
        )
        .run(
          ticket,
          request.label,
          JSON.stringify(request),
          waiter.pid,
          waiter.boot,
          waiter.start,
          now,
          now + request.waitSeconds * 1000,
        );
      return { kind: 'queued' as const, ticket };
    });
  }
  /** Remove a waiter's own ticket: cancellation leaves scheduling at once. */
  withdrawHostJob(ticket: string): void {
    this.transaction(() => {
      this.db.query('DELETE FROM host_job_tickets WHERE id=?').run(ticket);
    });
  }
  /**
   * One scheduling decision for `ticket`, in one `BEGIN IMMEDIATE` (J5, J6): remove tickets
   * whose process is gone or whose budget ended over a minute ago, naming each through
   * `report`; refuse 75 a waiter past its budget, or a wait-zero waiter with a live ticket
   * ahead; otherwise admit when this waiter is the one {@link chooseWaiter} serves against every
   * non-released reservation, counting one overtake on every older live waiter it passes.
   * Admission reserves the envelope, the tmp disk, one workspace slot and one free unit per
   * exclusive id, recording each unit's resting commit. No WBS call is made (J4).
   */
  pollHostJob(ticket: string, report: (line: string) => void): HostJobAdmission {
    // Reclaim lines are reported only after the transaction commits: a rolled-back delete
    // removed nothing and must not be announced.
    const reclaimed: string[] = [];
    // Proof: reading the reservations before this transaction let `launcher processes racing
    // one ledger file never overcommit` (host-jobs.model.test.ts) replay a tree held by two
    // jobs; a deferred one crashed contenders SQLITE_BUSY and SQLITE_BUSY_SNAPSHOT (2026-11-01).
    const outcome = this.transaction((): HostJobAdmission => {
      const now = this.clock.read();
      const mine = this.tickets().find((row) => row.id === ticket);
      if (mine === undefined)
        return {
          kind: 'refused',
          exitCode: 75,
          reason: 'host job ticket is no longer queued: it was withdrawn or reclaimed',
        };
      // Proof: skipping this reclaim left `dead tickets are reclaimed by whoever sees them,
      // named on stderr` (host-jobs.test.ts) with no line and both tickets (2026-11-01).
      reclaimed.push(...this.removeDeadTickets(now, ticket));
      // A ticket past its budget has left scheduling even before anyone reclaims it.
      const live = this.tickets().filter((row) => row.id === ticket || now <= row.deadline);
      const ahead = live.filter((row) => row.sequence < mine.sequence);
      const request = this.ticketRequest(mine);
      const named = `host job ${request.descriptor.id} ${request.label} refused`;
      const aheadText = (): string => {
        const holders = [
          ...ahead.map((row) => `${row.label} (pid ${String(row.pid)}, waiting)`),
          ...this.listHostJobs()
            .filter((job) => job.state !== 'released')
            .map((job) => `${job.label} (${job.state})`),
        ];
        return holders.length === 0 ? 'nobody' : holders.join(', ');
      };
      const refuse = (reason: string): HostJobAdmission => {
        this.db.query('DELETE FROM host_job_tickets WHERE id=?').run(ticket);
        return { kind: 'refused', exitCode: 75, reason };
      };
      // A wait-zero ticket is never "spent": its deadline is its arrival, which the enqueue's
      // fsync already put in the past; it is decided once, below.
      // Proof: without the `waitSeconds > 0` guard, `a wait-zero caller on an empty pool is
      // admitted under an advancing clock` (host-jobs.test.ts) was refused 75 "wait budget of 0s
      // spent"; without the deadline check, `a waiter past its budget is refused 75` waited on
      // (2026-11-01, verify.md Slice 2).
      if (request.waitSeconds > 0 && now > mine.deadline)
        return refuse(
          `${named}: wait budget of ${String(request.waitSeconds)}s spent; ahead: ${aheadText()}`,
        );
      // Proof: without it `a wait-zero caller is refused 75 while a live ticket is ahead, even
      // with room` (host-jobs.test.ts) was admitted (2026-11-01, verify.md Slice 2).
      if (request.waitSeconds === 0 && ahead.length > 0)
        return refuse(`${named}: wait budget 0 with live tickets ahead: ${aheadText()}`);
      // Concurrent mode under the guard admits only while the `watch` singleton holds the
      // canonical flock (J12), so a stale launcher's `flock` path queues behind every host job.
      const pool = this.poolRow();
      // Proof: without it `a stray file in the legacy hold directory stops concurrent admission`
      // (host-pool-mode.test.ts) admitted beside it (2026-11-02, review H7).
      if (pool.mode === 'concurrent' && pool.holdCorruption !== null)
        return refuse(
          `${named}: the legacy hold directory holds ${pool.holdCorruption}, which Dash did not write; check and remove it, then run resources sweep`,
        );
      // Proof: without it `without the guard a job waits, then is refused 75`
      // (host-pool-mode.test.ts) saw the job admitted with no guard holding the flock (2026-11-02, Slice 6b).
      if (pool.mode === 'concurrent' && pool.guard === 'on' && !this.guardHeld(pool.guardHolder)) {
        if (now >= Math.max(mine.deadline, mine.arrived_at + GUARD_WAIT_MS))
          return refuse(
            `${named}: the singleton guard is not held (resources watch holds the canonical flock as ${GUARD_LABEL} while host jobs run; is it running?); ahead: ${aheadText()}`,
          );
        return {
          kind: 'waiting',
          ahead: ahead.map((row) => this.ticketView(row)),
          unavailableUnits: [],
          awaiting: 'singleton guard',
        };
      }
      const { vector: reserved, units: held } = this.reservations();
      const allocatable = this.allocatable();
      // A free unit must also be ready: readable, clean, its HEAD known. Read once per poll.
      const readiness = new Map<string, { commit: string } | { reason: string }>();
      const ready = (path: string): { commit: string } | { reason: string } => {
        const known = readiness.get(path);
        if (known !== undefined) return known;
        const verdict = this.unitReadiness(path);
        readiness.set(path, verdict);
        return verdict;
      };
      const freeUnit = (exclusiveId: string): string | undefined =>
        (this.configuration.exclusiveUnits[exclusiveId] ?? []).find(
          (path) => !held.has(path) && 'commit' in ready(path),
        );
      const unitsOf = (descriptor: JobTypeDescriptor): string[] =>
        descriptor.envelope.exclusive.flatMap((id) => this.configuration.exclusiveUnits[id] ?? []);
      /** This waiter's free-space shortfall for its refusal, with both figures, or nothing. */
      const shortfall = (): string => {
        const own =
          request.calibration === true
            ? allocatable.diskUnits
            : reserved.diskUnits + this.diskUnitsOf(request.descriptor);
        const short = this.freeSpaceShortfall(own);
        return short === null ? '' : `; ${short}`;
      };
      const unavailable = (): string => {
        const named = [...readiness].flatMap(([path, verdict]) =>
          'reason' in verdict ? [`${path} (${verdict.reason})`] : [],
        );
        return named.length === 0 ? '' : `; units not free: ${named.join(', ')}`;
      };
      /**
       * Whether a calibration of `descriptor` may start: nothing reserved in any dimension (a
       * starting or held job always reserves a workspace slot, since its tmp entry settles only
       * after its compute), free space for the whole disk budget, and every unit of every id
       * the type names neither held nor unready. Units of other ids are not its
       * concern (S4-A14).
       */
      const drained = (descriptor: JobTypeDescriptor): boolean =>
        POOL_DIMENSIONS.every((dimension) => reserved[dimension] === 0) &&
        // Proof: without it `a calibration waits for free space for the whole disk budget,
        // naming the shortfall` (calibrate.test.ts) admitted it (2026-11-02, Slice 4 review A13).
        this.freeSpaceCovers(allocatable.diskUnits) &&
        // Proof: without the readiness check `a calibration waits while a unit of its type is
        // dirty` (calibrate.test.ts) threw `host pool unit vanished during admission`; checking every unit of
        // the pool made `… naming no unit holds none and ignores a dirty tree` refuse it 75
        // (2026-11-02, review A5, A13).
        unitsOf(descriptor).every((path) => !held.has(path) && 'commit' in ready(path));
      const eligible = new Set(this.configuration.concurrencyEligible ?? []);
      const running = this.listHostJobs().filter((job) => job.compute.state !== 'released');
      /**
       * Concurrent mode overlaps only eligible types (J12): beside any unreleased compute, both
       * the newcomer's type and every running type must be listed; observe mode serialises
       * through the shell lock already.
       */
      const mayOverlap = (descriptor: JobTypeDescriptor): boolean =>
        pool.mode !== 'concurrent' ||
        running.length === 0 ||
        (eligible.has(descriptor.id) && running.every((job) => eligible.has(job.descriptor.id)));
      const fits = (row: TicketRow): boolean => {
        const { descriptor, calibration } = this.ticketRequest(row);
        // Proof: without it `an ineligible type beside an eligible one is serialised`
        // (host-pool-mode.test.ts) admitted the second job beside the first (2026-11-02, Slice 6b).
        if (!mayOverlap(descriptor)) return false;
        // Proof: admitting a calibration on the envelope fit made `a calibration waits for
        // the pool to drain` (calibrate.test.ts) admit it beside a held gate (2026-11-02, Slice 4).
        if (calibration === true) return drained(descriptor);
        const diskUnits = this.diskUnitsOf(descriptor);
        return (
          vectorFits(
            {
              cpuCores: descriptor.envelope.cpuCores,
              memoryGib: descriptor.envelope.memoryGib,
              diskUnits,
              workspaceSlots: 1,
            },
            reserved,
            allocatable,
          ) &&
          this.freeSpaceCovers(reserved.diskUnits + diskUnits) &&
          // Proof: without it the model in host-jobs.model.test.ts admitted a third gate onto
          // a held tree where it expected `waiting` (2026-11-01, verify.md Slice 2).
          descriptor.envelope.exclusive.every((id) => freeUnit(id) !== undefined)
        );
      };
      const chosen = chooseWaiter(live, fits);
      if (chosen?.id !== ticket) {
        if (now >= mine.deadline)
          return refuse(
            `${named}: no room within its wait budget of ${String(request.waitSeconds)}s; ahead: ${aheadText()}${unavailable()}${shortfall()}`,
          );
        return {
          kind: 'waiting',
          ahead: ahead.map((row) => this.ticketView(row)),
          unavailableUnits: [...readiness].flatMap(([path, verdict]) =>
            'reason' in verdict ? [{ path, reason: verdict.reason }] : [],
          ),
        };
      }
      for (const row of ahead)
        this.db.query('UPDATE host_job_tickets SET overtakes=overtakes+1 WHERE id=?').run(row.id);
      this.db.query('DELETE FROM host_job_tickets WHERE id=?').run(ticket);
      const id = randomUUID();
      const claim = (exclusiveId: string, path: string | undefined): HostJobUnit => {
        const verdict = path === undefined ? undefined : ready(path);
        if (path === undefined || verdict === undefined || !('commit' in verdict))
          throw new Error('host pool unit vanished during admission');
        held.set(path, id);
        return {
          exclusiveId,
          path,
          restingCommit: verdict.commit,
          state: 'held',
          reason: 'admitted',
        };
      };
      // A calibration holds every unit of each id its type names, in the pool's order (J9,
      // S4-A14); units of other ids stay free.
      // Proof: claiming none of its ids' units made `a calibration of a gate holds every gate
      // tree` and `a calibration holds the whole allocatable vector` (calibrate.test.ts) see
      // neither tree held (2026-11-02, Slice 4 review A5).
      const units =
        request.calibration === true
          ? request.descriptor.envelope.exclusive.flatMap((exclusiveId) =>
              (this.configuration.exclusiveUnits[exclusiveId] ?? []).map((path) =>
                claim(exclusiveId, path),
              ),
            )
          : request.descriptor.envelope.exclusive.map((exclusiveId) =>
              claim(exclusiveId, freeUnit(exclusiveId)),
            );
      const job: HostJob = {
        id,
        incarnation: randomUUID(),
        revision: 0,
        kind: 'host_job',
        descriptor: request.descriptor,
        label: request.label,
        state: 'starting',
        diskUnits: this.diskUnitsOf(request.descriptor),
        launcher: { pid: mine.pid, boot: mine.boot, start: mine.start },
        process: null,
        descendants: [],
        locator: join(this.configuration.root, id),
        dev: null,
        ino: null,
        tmpDeleteIntent: false,
        admittedAt: now,
        launchDeadline: now + 60000,
        startedAt: null,
        endedAt: null,
        exitCode: null,
        compute: { state: 'held', reason: 'admitted' },
        tmpDisk: { state: 'held', reason: 'admitted' },
        units,
        settleAttempts: 0,
        nextSettleAt: null,
        // Proof: persisting the envelope for a calibration made `a calibration holds the whole
        // allocatable vector` and `a calibration waits for the pool to drain` (calibrate.test.ts)
        // persist the gate's envelope, not the 8 allocatable cores (2026-11-02, review A3).
        reserved:
          request.calibration === true
            ? this.wholePool()
            : {
                cpuCores: request.descriptor.envelope.cpuCores,
                memoryGib: request.descriptor.envelope.memoryGib,
                diskUnits: this.diskUnitsOf(request.descriptor),
                workspaceSlots: 1,
                tmpDiskGib: request.descriptor.envelope.tmpDiskGib,
              },
        ...(request.calibration === true ? { calibration: true as const } : {}),
      };
      this.hostJobEvent(job, 'admitted');
      return { kind: 'admitted', job };
    });
    for (const line of reclaimed) report(line);
    return outcome;
  }
  /**
   * Whether a free unit can be handed out: its tree readable and clean, with the HEAD that
   * becomes its resting commit. A deleted or broken tree is not free, never fatal: the waiter
   * keeps waiting or is refused 75 naming it.
   */
  private unitReadiness(path: string): { commit: string } | { reason: string } {
    try {
      const status = git(['-C', path, 'status', '--porcelain', '--untracked-files=all']);
      // Proof: without it `a dirty free unit is not free, named` (host-jobs.test.ts) admitted a
      // gate onto a tree with stray.txt (2026-11-01, verify.md Slice 2).
      if (status !== '') return { reason: `dirty: ${status.split('\n').slice(0, 3).join('; ')}` };
      return { commit: git(['-C', path, 'rev-parse', 'HEAD']) };
    } catch (cause) {
      return { reason: cause instanceof Error ? cause.message : 'unreadable' };
    }
  }
  /**
   * Queue and wait until admitted, refused or cancelled, polling every `pollMs`: the blocking
   * form slice 3's `ops job run` calls for its own process. Cancellation withdraws the ticket.
   */
  async admitHostJob(
    input: HostJobRequest,
    options: { pollMs: number; signal: AbortSignal; report: (line: string) => void },
  ): Promise<HostJobAdmission | { kind: 'cancelled' }> {
    // Proof: an MCP admission call here made `admits a host job with no WBS call while WBS
    // refuses everything` (host-jobs.test.ts) fail on the refusing fixture (2026-11-01).
    const queued = this.enqueueHostJob(input, process.pid);
    if (queued.kind === 'refused') return queued;
    try {
      for (;;) {
        if (options.signal.aborted) {
          this.withdrawHostJob(queued.ticket);
          return { kind: 'cancelled' };
        }
        const outcome = this.pollHostJob(queued.ticket, options.report);
        if (outcome.kind !== 'waiting') return outcome;
        await Bun.sleep(options.pollMs);
      }
    } catch (cause) {
      this.withdrawHostJob(queued.ticket);
      throw cause;
    }
  }
  /** Create the job-private tmp directory under the managed root and pin its identity. */
  prepareHostJob(id: string): HostJob {
    return this.transaction(() => {
      const job = this.inspectHostJob(id);
      // Proof: each of these three seam guards, removed, failed `the host-job seams refuse
      // out-of-order calls` (host-jobs.test.ts): launch unprepared and an exit before launch
      // were accepted; a second prepare failed only on mkdir EEXIST (2026-11-01, Slice 2).
      if (job.state !== 'starting' || job.dev !== null)
        throw new Error('host job is not awaiting preparation');
      // The guard admitted this job; it must still hold before anything is created (review H5).
      const pool = this.poolRow();
      // Proof: without it `a guard lost between admission and launch refuses 75`
      // (host-pool-mode.test.ts) prepared and launched the job (2026-11-02, review H5).
      if (pool.mode === 'concurrent' && pool.guard === 'on' && !this.guardHeld(pool.guardHolder))
        throw new HostPoolModeRefusal(
          75,
          `host job ${job.id} ${job.label}: the singleton guard was lost between admission and launch`,
        );
      mkdirSync(job.locator, { mode: 0o700 });
      const identity = lstatSync(job.locator);
      const marker = randomUUID();
      writeFileSync(join(job.locator, TMP_MARKER), marker, { mode: 0o600, flag: 'wx' });
      job.dev = identity.dev;
      job.ino = identity.ino;
      job.tmpMarker = marker;
      this.saveHostJob(job);
      return job;
    });
  }
  /**
   * Persist the launched process group's leader identity, which slice 3's FD gate requires
   * before it lets the payload exec; until then no payload can have run (J2').
   */
  recordHostJobLaunch(id: string, pid: number): HostJob {
    return this.transaction(() => {
      const job = this.inspectHostJob(id);
      if (job.state !== 'starting' || job.process !== null || job.dev === null)
        throw new Error('host job is not awaiting launch');
      const identity = identifyProcess(pid);
      if (identity === null) throw new Error('host job process identity unavailable');
      job.process = identity;
      job.startedAt = this.clock.read();
      job.state = 'held';
      this.hostJobEvent(job, 'launched');
      return job;
    });
  }
  /** The payload's exit status as its launcher saw it: outcome only, never settlement (J2'). */
  recordHostJobExit(id: string, exitCode: number): HostJob {
    return this.transaction(() => {
      const job = this.inspectHostJob(id);
      // Proof: accepting an exit after a launch failure made the model in host-jobs.model.test.ts
      // fail its `LaunchFailure` command (2026-11-02, Slice 3 review R4).
      if (job.process === null || job.exitCode !== null || job.launchFailure !== undefined)
        throw new Error('host job has no running payload to record');
      job.exitCode = exitCode;
      job.endedAt = this.clock.read();
      this.saveHostJob(job);
      return job;
    });
  }
  /**
   * A launch whose gate never opened (`dash-host-jobs` slice 3 review F5): the leader's identity
   * was recorded but the payload did not run, so the job keeps a null exit code and names why,
   * never a status a payload could have returned. Settlement is unchanged.
   */
  recordHostJobLaunchFailure(id: string, reason: string): HostJob {
    return this.transaction(() => {
      const job = this.inspectHostJob(id);
      // Proof: without it `a job whose payload never ran says so` (status.test.ts)
      // accepted a second record after the first (2026-11-02, Slice 3 review F5).
      if (job.process === null || job.exitCode !== null || job.launchFailure !== undefined)
        throw new Error('host job has no unopened launch to record');
      job.launchFailure = reason;
      job.endedAt = this.clock.read();
      this.saveHostJob(job);
      return job;
    });
  }
  /**
   * The compute entry's evidence (J2'): the owned process group terminal through the same
   * `/proc` session inspection worktree cleanup uses, and every declared container gone. A job
   * never launched is terminal only once its launcher is gone and the launch grace has passed:
   * the gate opens after the identity is persisted, so no identity means no payload ran.
   * Launcher death alone releases nothing.
   */
  private computeEvidence(job: HostJob, containers: ContainerEvidence): HostJobEntry {
    const launcherAlive = alive(job.launcher);
    // Proof: releasing here on launcher death, or on a recorded exit code, let `surviving
    // children keep the charge` (host-jobs.test.ts) admit a 10 GiB job over the surviving
    // child; launcher death also broke the model's expected `unknown` (2026-11-01, Slice 2).
    const pending = launcherAlive ? ('held' as const) : ('unknown' as const);
    if (job.process === null) {
      if (launcherAlive) return { state: 'held', reason: 'admitted; launch outstanding' };
      if (this.clock.read() < job.launchDeadline)
        return { state: 'unknown', reason: 'launcher ended before launch; launch grace running' };
    } else {
      job.descendants = captureDescendants(job);
      if (ownedProcessesAlive(job)) {
        const pids = [job.process, ...job.descendants].filter(alive).map((each) => each.pid);
        return {
          state: pending,
          reason: `owned process group of session ${String(job.process.pid)} alive; known live pids ${pids.length === 0 ? 'none (unknown session members)' : pids.join(', ')}`,
        };
      }
    }
    let gone: boolean;
    try {
      gone = containers.containersGone(job);
    } catch (cause) {
      return {
        state: pending,
        reason: `container evidence unavailable: ${cause instanceof Error ? cause.message : 'unreadable'}`,
      };
    }
    if (!gone) return { state: pending, reason: 'declared containers not verified gone' };
    return {
      state: 'released',
      reason:
        job.process === null
          ? 'never launched: launcher gone and launch grace passed'
          : 'owned process group terminal and declared containers gone',
    };
  }
  /**
   * A unit's evidence once writers are excluded (J2'): no live hold on the tree, its HEAD the
   * resting commit recorded at admission and `git status --porcelain` empty. Ignored files are
   * the tree's caches and do not block.
   */
  private unitEvidence(unit: HostJobUnit, job: HostJob): HostJobEntry {
    const scope = jobScopeOf(job);
    try {
      inspectHolds(unit.path, scope);
      const head = git(['-C', unit.path, 'rev-parse', 'HEAD']);
      const status = git(['-C', unit.path, 'status', '--porcelain', '--untracked-files=all']);
      // Proof: without it `a dirty tree is not returned` (host-jobs.test.ts) saw the unit
      // `released` with stray.txt in the tree (2026-11-01, verify.md Slice 2).
      if (status !== '')
        return {
          state: 'blocked',
          reason: `tree ${unit.path} is not clean: ${status.split('\n').slice(0, 5).join('; ')}`,
        };
      // Proof: without it `a dirty tree is not returned` (host-jobs.test.ts) released a tree
      // moved to another commit (2026-11-01, verify.md Slice 2).
      if (head !== unit.restingCommit)
        return {
          state: 'blocked',
          // A payload killed before it restored its tree (SIGKILL, `cap`'s MemoryMax) leaves it
          // here for good; the remedy is the operator's, once no job runs in it (review F8).
          // Proof: dropping the remedy failed `a dirty tree is not returned` (host-jobs.test.ts)
          // on its `git -C … checkout` expectation (2026-11-02, review F8).
          reason: `tree ${unit.path} is at ${head}, not its resting commit ${unit.restingCommit}; once no job runs in it, restore it with \`git -C ${unit.path} checkout --detach ${unit.restingCommit}\` and settlement retries`,
        };
      return {
        state: 'released',
        reason: `tree clean at its resting commit${outsideNote(scope)}`,
      };
    } catch (cause) {
      return {
        state: 'blocked',
        reason: `tree ${unit.path} unverified: ${cause instanceof Error ? cause.message : 'inspection failed'}`,
      };
    }
  }
  /** Summarize the entries into the job's state. */
  private summarize(job: HostJob): void {
    const entries = [job.compute, job.tmpDisk, ...job.units];
    job.state = entries.every((entry) => entry.state === 'released')
      ? 'released'
      : entries.some((entry) => entry.state === 'blocked')
        ? 'blocked'
        : entries.some((entry) => entry.state === 'unknown')
          ? 'unknown'
          : job.process === null
            ? 'starting'
            : 'held';
  }
  /**
   * Settle each outstanding reservation entry of a host job on its own terminal evidence
   * (J2'): compute after {@link computeEvidence}; then each unit after {@link unitEvidence};
   * then the tmp directory after the runtime's descriptor-relative removal under a persisted
   * deletion intent. Each release commits with its event in one transaction; anything not
   * proven stays charged, `unknown` while the launcher is gone, `blocked` when evidence refuses.
   */
  settleHostJob(id: string, containers: ContainerEvidence): HostJob {
    const current = this.inspectHostJob(id);
    // A blocked job waits for an operator; re-reading Git and /proc for it every tick inside
    // the write lock would only repeat the refusal. Unknown and held jobs are read every tick.
    // Proof: without it, `a blocked job backs off its evidence reads` (host-jobs.test.ts) saw
    // the second sweep re-read and re-save the job (2026-11-01, verify.md Slice 2).
    if (
      current.state === 'blocked' &&
      current.nextSettleAt !== null &&
      this.clock.read() < current.nextSettleAt
    )
      return current;
    const removing = this.transaction(() => {
      const job = this.inspectHostJob(id);
      if (job.state === 'released') return false;
      const before = settlementOf(job);
      if (job.compute.state !== 'released') job.compute = this.computeEvidence(job, containers);
      const excluded = job.compute.state === 'released';
      const waiting: HostJobEntry = {
        state: job.compute.state === 'unknown' ? 'unknown' : 'held',
        reason: 'writers not yet excluded',
      };
      for (const [index, unit] of job.units.entries()) {
        if (unit.state === 'released') continue;
        job.units[index] = { ...unit, ...(excluded ? this.unitEvidence(unit, job) : waiting) };
      }
      if (job.tmpDisk.state !== 'released') job.tmpDisk = excluded ? this.tmpIntent(job) : waiting;
      this.summarize(job);
      const removal = job.tmpDisk.state !== 'released' && job.tmpDeleteIntent;
      // The removal transaction below schedules the retry when it runs.
      if (!removal) this.scheduleSettlement(job);
      this.recordSettlement(job, before);
      return removal;
    });
    if (!removing) return this.inspectHostJob(id);
    return this.transaction(() => {
      const job = this.inspectHostJob(id);
      if (job.tmpDisk.state === 'released' || !job.tmpDeleteIntent) return job;
      const before = settlementOf(job);
      const scope = jobScopeOf(job);
      try {
        if (this.hostJobTmpPresent(job)) {
          inspectHolds(job.locator, scope);
          const removal = Bun.spawnSync(
            [
              'python3',
              '-c',
              removeDirectory,
              this.configuration.root,
              job.id,
              String(job.dev),
              String(job.ino),
              // Proof: dropping this option, with the TypeScript marker check also dropped, let
              // `a replacement directory that reuses the inode stays charged and untouched`
              // (host-jobs.test.ts) remove the replacement: `released` (2026-11-05, Slice 6e).
              ...(job.tmpMarker === undefined ? [] : [`marker=${job.tmpMarker}`]),
            ],
            { stdout: 'pipe', stderr: 'pipe', timeout: 30000, killSignal: 'SIGKILL' },
          );
          // Proof: this exit-code check and the presence re-check below each hold alone;
          // removing both let `a failed cleanup leaves the tmp reservation charged`
          // (host-jobs.test.ts) see the entry `released` beside the outside hard link
          // (2026-11-01, verify.md Slice 2).
          if (removal.exitCode !== 0) throw new Error('descriptor-relative removal refused');
        }
        if (this.hostJobTmpPresent(job)) throw new Error('tmp directory still present');
        inspectHolds(job.locator, scope);
        job.tmpDisk = {
          state: 'released',
          reason: `tmp directory removed and holds verified${outsideNote(scope)}`,
        };
      } catch (cause) {
        job.tmpDisk = {
          state: 'blocked',
          reason: `tmp directory cleanup failed: ${cause instanceof Error ? cause.message : 'unknown'}`,
        };
      }
      this.summarize(job);
      this.scheduleSettlement(job);
      this.recordSettlement(job, before);
      return job;
    });
  }
  /**
   * The worktree cleanup's retry delays for a blocked job (one second doubling to a one-minute
   * cap), without its six-attempt exhaustion: a blocked tree is resolved by an operator, and no
   * retry command exists before slice 3, so exhaustion would strand a resolved tree.
   */
  private scheduleSettlement(job: HostJob): void {
    if (job.state !== 'blocked') {
      job.settleAttempts = 0;
      job.nextSettleAt = null;
      return;
    }
    job.settleAttempts += 1;
    job.nextSettleAt = this.clock.read() + Math.min(60000, 1000 * 2 ** (job.settleAttempts - 1));
  }
  /**
   * Persist a settlement pass: an event with the reservation it leaves only when an entry,
   * the state or the evidence identities changed, so a job that stays blocked or unknown adds
   * no outbox rows tick after tick; otherwise only the retry schedule is saved.
   */
  private recordSettlement(job: HostJob, before: string): void {
    // Proof: emitting on every pass grew `host_job_events` by two rows per sweep in `a blocked
    // tmp directory adds no outbox rows` (host-jobs.test.ts), 2026-11-01, verify.md Slice 2.
    if (settlementOf(job) !== before) this.hostJobEvent(job, 'settlement');
    else this.saveHostJob(job);
  }
  /** Whether the job's tmp directory exists as the identity recorded at preparation. */
  private hostJobTmpPresent(job: HostJob): boolean {
    let identity;
    try {
      identity = lstatSync(job.locator);
    } catch (cause) {
      if (isMissing(cause)) return false;
      throw cause;
    }
    // Proof: without it `a replaced tmp directory or symlink stays charged and untouched`
    // (host-jobs.test.ts) removed the replacement (2026-11-01, verify.md Slice 2).
    if (
      identity.isSymbolicLink() ||
      !identity.isDirectory() ||
      identity.dev !== job.dev ||
      identity.ino !== job.ino
    )
      throw new Error('host job tmp directory identity changed');
    // Proof: without the marker comparison `a replacement directory that reuses the inode stays
    // charged and untouched` and `a tmp directory whose marker the payload removed stays
    // charged` (host-jobs.test.ts) were refused only by the removal script, reason `cleanup
    // failed: descriptor-relative removal refused`; requiring a marker of a row without one made
    // `a row prepared before markers settles on device and inode` stay `blocked` (2026-11-05,
    // verify.md Slice 6e).
    if (job.tmpMarker !== undefined && readTmpMarker(job.locator) !== job.tmpMarker)
      throw new Error('host job tmp directory identity changed: content marker differs');
    return true;
  }
  /**
   * The tmp entry before removal: a directory never prepared is released when absent; one
   * prepared gains a persisted deletion intent once no live hold remains, so a crash after
   * removal reconciles as absent-with-intent rather than an unexplained absence.
   */
  private tmpIntent(job: HostJob): HostJobEntry {
    try {
      if (job.dev === null) {
        // Proof: without it `a tmp directory nobody recorded stays charged` (host-jobs.test.ts)
        // released the reservation over an unknown directory (2026-11-01, verify.md Slice 2).
        if (existsSync(job.locator))
          return { state: 'blocked', reason: 'tmp directory present without a recorded identity' };
        return { state: 'released', reason: 'tmp directory never created' };
      }
      // A removal already intended and refused stays blocked until the removal succeeds.
      // Proof: returning `held` here flipped the entry held↔blocked on every sweep in `a blocked
      // tmp directory adds no outbox rows` (host-jobs.test.ts), 2026-11-01, verify.md Slice 2.
      if (job.tmpDeleteIntent && job.tmpDisk.state === 'blocked') return job.tmpDisk;
      const present = this.hostJobTmpPresent(job);
      // Proof: without it `a tmp directory removed behind the runtime stays charged`
      // (host-jobs.test.ts) released an absence nobody intended (2026-11-01, Slice 2).
      if (!present && !job.tmpDeleteIntent)
        return { state: 'blocked', reason: 'tmp directory absent without a deletion intent' };
      if (present) inspectHolds(job.locator, jobScopeOf(job));
      job.tmpDeleteIntent = true;
      return { state: 'held', reason: 'tmp directory removal intended' };
    } catch (cause) {
      return {
        state: 'blocked',
        reason: `tmp directory unverified: ${cause instanceof Error ? cause.message : 'unknown'}`,
      };
    }
  }
  /** What the host is doing: mode, guard, budget, reservations, units, unreleased jobs, waiters. */
  hostPoolStatus(): HostPoolStatus {
    const { vector, units } = this.reservations();
    return {
      ...this.hostPoolTransition(),
      enrollmentId: this.configuration.enrollmentId,
      allocatable: this.allocatable(),
      reserved: vector,
      units: Object.entries(this.configuration.exclusiveUnits).flatMap(([exclusiveId, paths]) =>
        paths.map((path) => ({ exclusiveId, path, heldBy: units.get(path) ?? null })),
      ),
      jobs: this.listHostJobs().filter((job) => job.state !== 'released'),
      waiters: this.tickets().map((row) => this.ticketView(row)),
      modeRecords: this.modeRecords(),
    };
  }
  /** The pool's mode, guard and fence, each holder named with whether it still runs. */
  hostPoolTransition(): HostPoolTransition {
    const pool = this.poolRow();
    return {
      mode: pool.mode,
      guard: pool.guard,
      holdCorruption: pool.holdCorruption,
      guardHolder:
        pool.guardHolder === null ? null : { ...pool.guardHolder, live: alive(pool.guardHolder) },
      switching:
        pool.switching === null ? null : { ...pool.switching, live: alive(pool.switching) },
    };
  }
  /** Every operator mode record, oldest first. */
  modeRecords(): ModeRecord[] {
    return this.db
      .query<{ sequence: number; record: string }, []>(
        'SELECT sequence, record FROM host_pool_mode_records ORDER BY sequence',
      )
      .all()
      .map((row) => ({
        sequence: row.sequence,
        ...ModeRecordShape.assert(JSON.parse(row.record)),
      }));
  }
  /**
   * The pool row. Only this class writes the owner-only ledger, so a mode, guard or holder it
   * cannot read throws rather than defaulting.
   */
  private poolRow(): {
    mode: HostPoolModeName;
    guard: 'on' | 'released';
    guardHolder: GuardHolder | null;
    switching: ModeSwitch | null;
    holdCorruption: string | null;
  } {
    const row = this.db
      .query<
        {
          mode: string;
          guard: string;
          guard_holder: string | null;
          switching: string | null;
          hold_corruption: string | null;
        },
        []
      >('SELECT mode, guard, guard_holder, switching, hold_corruption FROM host_pool WHERE id=1')
      .get();
    // Proof: without it `status refuses an unreadable pool mode` (host-jobs.test.ts) threw a
    // bare TypeError on the missing row instead of naming it (2026-11-01, verify.md Slice 2).
    if (row === null || (row.mode !== 'observe' && row.mode !== 'concurrent'))
      throw new Error('host pool mode unreadable');
    if (row.guard !== 'on' && row.guard !== 'released')
      throw new Error('host pool guard state unreadable');
    return {
      mode: row.mode,
      guard: row.guard,
      guardHolder:
        row.guard_holder === null ? null : GuardHolderShape.assert(JSON.parse(row.guard_holder)),
      switching: row.switching === null ? null : ModeSwitchShape.assert(JSON.parse(row.switching)),
      holdCorruption: row.hold_corruption,
    };
  }
  /**
   * Record what in the legacy hold directory Dash did not write (`watch` or `sweep` found it), or
   * clear it with null (review H7): while set, the guard releases nothing and concurrent-mode
   * admission refuses 75 naming it, so nobody runs beside a hold nobody can account for.
   */
  recordHoldCorruption(found: string | null): void {
    this.transaction(() => {
      this.db.query('UPDATE host_pool SET hold_corruption=? WHERE id=1').run(found);
    });
  }
  /**
   * Mark every host job whose compute is unreleased as having run while the singleton guard was
   * lost (review H5): its holder died, the kernel released the canonical flock, and a stale
   * launcher may have run beside it. Returns the job ids marked now; a job already marked stays
   * marked with its first instant.
   */
  recordGuardLost(holderPid: number): string[] {
    return this.transaction(() => {
      const marked: string[] = [];
      for (const job of this.listHostJobs()) {
        if (job.compute.state === 'released' || job.guardLost !== undefined) continue;
        job.guardLost = { at: this.clock.read(), holderPid };
        this.saveHostJob(job);
        marked.push(job.id);
      }
      return marked;
    });
  }
  /**
   * Whether `holder` holds the canonical flock now: its process runs, and the shell lock's
   * holder record names its pid with the guard's label. The lock library removes that record
   * before it closes the flock (`release_heavy_lock` in `bin/heavy-lock-lib.sh`), so a record naming the guard proves the flock is still held.
   * @throws when the record is present but unreadable: unknown, never "not held" or "held".
   */
  private guardHeld(holder: GuardHolder | null): boolean {
    if (holder === null || !alive(holder)) return false;
    const recorded = (name: string): string | null => {
      try {
        return readFileSync(join(`${holder.lockPath}.d`, name), 'utf8').trim();
      } catch (cause) {
        if (isMissing(cause)) return null;
        throw new Error(`singleton guard record ${holder.lockPath}.d/${name} unreadable`, {
          cause,
        });
      }
    };
    // Proof: trusting the identity alone made `a guard whose holder record names another pid
    // is not held` (host-pool-mode.test.ts) admit a job (2026-11-02, Slice 6b).
    return recorded('holder') === String(holder.pid) && recorded('label') === GUARD_LABEL;
  }
  /** The live fence of a `switch-mode` in progress, or null; a dead switcher's fence is void. */
  private liveSwitch(): ModeSwitch | null {
    const { switching } = this.poolRow();
    return switching !== null && alive(switching) ? switching : null;
  }
  /** What keeps the pool from being drained of host jobs: queued tickets and unreleased compute. */
  /**
   * Why ticket `row` no longer counts at `now`: its process is gone (pid, boot and start
   * identity), or its wait budget ended over {@link TICKET_RECLAIM_AFTER_MS} ago; null while it
   * still waits.
   */
  private deadTicketReason(row: TicketRow, now: number): string | null {
    if (!alive({ pid: row.pid, boot: row.boot, start: row.start })) return 'its process is gone';
    if (now - row.deadline > TICKET_RECLAIM_AFTER_MS)
      return 'its wait budget ended over a minute ago';
    return null;
  }
  /** Delete every dead ticket but `except`, in the caller's transaction; one line per ticket. */
  private removeDeadTickets(now: number, except: string | null): string[] {
    const lines: string[] = [];
    for (const row of this.tickets()) {
      if (row.id === except) continue;
      const reason = this.deadTicketReason(row, now);
      if (reason === null) continue;
      this.db.query('DELETE FROM host_job_tickets WHERE id=?').run(row.id);
      lines.push(`host pool: removing ticket ${row.label} (pid ${String(row.pid)}): ${reason}`);
    }
    return lines;
  }
  /**
   * Reclaim dead tickets outside any poll (review K3 of #818): `watch`'s tick and `resources
   * sweep` call it, so a launcher SIGKILLed while queued holds neither a switch's drain nor the
   * guard's demand. Each removal is reported after the transaction commits.
   */
  reclaimDeadTickets(report: (line: string) => void): void {
    const lines = this.transaction(() => this.removeDeadTickets(this.clock.read(), null));
    for (const line of lines) report(line);
  }
  /**
   * Whether the singleton guard still holds for work admitted under it (review K4): true outside
   * concurrent mode or with the guard released; otherwise the recorded holder runs and the shell
   * lock's record names it. `ops job run` re-checks this at its payload's exit.
   * @throws as the guard check does when the record is present but unreadable.
   */
  guardStillHeld(): boolean {
    const pool = this.poolRow();
    if (pool.mode !== 'concurrent' || pool.guard !== 'on') return true;
    return this.guardHeld(pool.guardHolder);
  }
  /**
   * Mark host job `id` as run while the guard was lost (review K4), naming the recorded holder's
   * pid when one is recorded; a job already marked keeps its first mark.
   */
  recordGuardLostFor(id: string): HostJob {
    return this.transaction(() => {
      const job = this.inspectHostJob(id);
      if (job.guardLost !== undefined) return job;
      job.guardLost = { at: this.clock.read(), holderPid: this.poolRow().guardHolder?.pid ?? null };
      this.saveHostJob(job);
      return job;
    });
  }
  private undrained(): string[] {
    const now = this.clock.read();
    return [
      // A dead ticket waits for nothing (review K3).
      // Proof: counting it made `a ticket of a dead launcher holds neither the switch nor the
      // guard` (host-pool-mode.test.ts) wait out the switch's budget (2026-11-02, review K3).
      ...this.tickets()
        .filter((row) => this.deadTicketReason(row, now) === null)
        .map((row) => `${row.label} (pid ${String(row.pid)}, waiting)`),
      ...this.listHostJobs()
        .filter((job) => job.compute.state !== 'released')
        .map((job) => `${job.label} (${job.state}, compute ${job.compute.state})`),
    ];
  }
  /**
   * The singleton guard's obligation now (J12): `required` in concurrent mode while the guard is
   * on; `demand` while any ticket is queued or any host job's compute is unreleased, the span in
   * which a host job may be starting or running; the recorded holder, with whether it runs.
   */
  guardObligation(): {
    required: boolean;
    demand: boolean;
    holder: (GuardHolder & { live: boolean }) | null;
  } {
    const transition = this.hostPoolTransition();
    return {
      required: transition.mode === 'concurrent' && transition.guard === 'on',
      demand: this.undrained().length > 0,
      holder: transition.guardHolder,
    };
  }
  /**
   * Record `pid`, whose shell holder now holds the flock at `lockPath` as {@link GUARD_LABEL},
   * as the singleton guard. Returns false, recording nothing, when the guard is no longer
   * required or a live holder is already recorded; the caller then releases its hold.
   * @throws when `pid` has no readable identity.
   */
  recordGuardHolder(pid: number, lockPath: string): boolean {
    const identity = identifyProcess(pid);
    if (identity === null) throw new Error(`singleton guard holder ${String(pid)} is gone`);
    return this.transaction(() => {
      const pool = this.poolRow();
      if (pool.mode !== 'concurrent' || pool.guard !== 'on') return false;
      if (pool.guardHolder !== null && alive(pool.guardHolder)) return false;
      const holder: GuardHolder = { ...identity, lockPath, since: this.clock.read() };
      this.db
        .query('UPDATE host_pool SET guard_holder=? WHERE id=1')
        .run(JSON.stringify(GuardHolderShape.assert(holder)));
      return true;
    });
  }
  /**
   * Forget the recorded guard holder once nothing needs it: always outside concurrent mode or
   * with the guard released, otherwise only while no ticket is queued and no compute is held.
   * Returns false, keeping the record, while demand remains; the caller releases the flock only
   * after this commits, so admission never sees a guard the flock no longer backs.
   */
  clearGuardHolder(): boolean {
    return this.transaction(() => {
      const pool = this.poolRow();
      const required = pool.mode === 'concurrent' && pool.guard === 'on';
      // The guard asks only once it saw no demand; this re-check closes the race with a ticket
      // queued since. Proof: without it `the guard record is not cleared while a ticket is
      // queued or compute is held` (host-pool-mode.test.ts) cleared it (2026-11-02, Slice 6b).
      if (required && this.undrained().length > 0) return false;
      this.db.query('UPDATE host_pool SET guard_holder=NULL WHERE id=1').run();
      return true;
    });
  }
  /**
   * Stop intake for a switch of the pool to `target` (J12): from here every poll refuses 75
   * until this process ends or {@link abandonModeSwitch}/{@link completeModeSwitch} clears it.
   * @throws HostPoolModeRefusal 64 when the pool is in `target` already, 75 while another live
   * `switch-mode` holds the fence.
   */
  beginModeSwitch(target: HostPoolModeName, operator: string): ModeSwitch {
    const identity = identifyProcess(process.pid);
    if (identity === null) throw new Error('switch-mode process identity unavailable');
    return this.transaction(() => {
      const pool = this.poolRow();
      const other = pool.switching !== null && alive(pool.switching) ? pool.switching : null;
      // Proof: without it `stops intake, queued waiters included, and refuses a
      // second switch while the first drains`
      // (host-pool-mode.test.ts) took the fence over (2026-11-02, Slice 6b).
      if (other !== null)
        throw new HostPoolModeRefusal(
          75,
          `host pool ${this.configuration.enrollmentId}: switch-mode ${other.target} by ${other.operator} (pid ${String(other.pid)}) is in progress`,
        );
      if (pool.mode === target)
        throw new HostPoolModeRefusal(
          64,
          `host pool ${this.configuration.enrollmentId} is in ${target} mode already`,
        );
      const fence: ModeSwitch = { ...identity, target, operator, since: this.clock.read() };
      this.db
        .query('UPDATE host_pool SET switching=? WHERE id=1')
        .run(JSON.stringify(ModeSwitchShape.assert(fence)));
      return fence;
    });
  }
  /** Reopen intake after a refused switch: clears the fence when it is this process's. */
  abandonModeSwitch(): void {
    const identity = identifyProcess(process.pid);
    this.transaction(() => {
      const { switching } = this.poolRow();
      if (switching !== null && sameProcess(identity, switching))
        this.db.query('UPDATE host_pool SET switching=NULL WHERE id=1').run();
    });
  }
  /** What keeps the pool from being drained of host jobs, or nothing (J12). */
  modeDrain(): string[] {
    return this.undrained();
  }
  /**
   * Flip the pool to `target` in one transaction (J12): the fence must be this process's, the
   * pool drained of tickets and unreleased compute, and the record of who, when, from, to and
   * `evidence` is written beside the flip. The guard is on after every flip, so concurrent mode
   * starts guarded and a rollback leaves the next flip guarded.
   * @throws HostPoolModeRefusal 75 when the pool is not drained or the fence is not this
   * process's (another switch, or none).
   */
  completeModeSwitch(
    target: HostPoolModeName,
    operator: string,
    account: string,
    evidence: string[],
  ): ModeRecord {
    const identity = identifyProcess(process.pid);
    return this.transaction(() => {
      const pool = this.poolRow();
      const fence = pool.switching;
      if (fence === null || !sameProcess(identity, fence) || fence.target !== target)
        throw new HostPoolModeRefusal(
          75,
          `host pool ${this.configuration.enrollmentId}: this switch-mode no longer holds the intake fence`,
        );
      const ahead = this.undrained();
      // The switch drains first (S6B-A16); this is the method-level last check under the fence.
      // Proof: without it `switch-mode concurrent refuses while a host job is admitted`
      // (host-pool-mode.test.ts) saw the flip succeed beside an admitted job (2026-11-02, H4).
      if (ahead.length > 0)
        throw new HostPoolModeRefusal(
          75,
          `host pool ${this.configuration.enrollmentId} is not drained of host jobs: ${ahead.join(', ')}`,
        );
      this.db
        .query("UPDATE host_pool SET mode=?, guard='on', switching=NULL WHERE id=1")
        .run(target);
      return this.modeRecord({
        at: this.clock.read(),
        operator,
        account,
        action: 'switch',
        from: pool.mode,
        to: target,
        evidence,
      });
    });
  }
  /**
   * The operator's record that no stale checkout can execute (J12): the guard is released and
   * concurrent mode runs on the pool alone; `watch` lets go of the flock on its next tick.
   * @throws HostPoolModeRefusal 64 outside concurrent mode or with the guard already released,
   * 75 while a `switch-mode` holds the fence.
   */
  releaseGuard(operator: string, account: string, evidence: string[]): ModeRecord {
    return this.transaction(() => {
      const pool = this.poolRow();
      const fence = pool.switching !== null && alive(pool.switching) ? pool.switching : null;
      if (fence !== null)
        throw new HostPoolModeRefusal(
          75,
          `host pool ${this.configuration.enrollmentId}: switch-mode ${fence.target} by ${fence.operator} (pid ${String(fence.pid)}) is in progress`,
        );
      if (pool.mode !== 'concurrent' || pool.guard !== 'on')
        throw new HostPoolModeRefusal(
          64,
          `host pool ${this.configuration.enrollmentId} has no guard to release: mode ${pool.mode}, guard ${pool.guard}`,
        );
      this.db.query("UPDATE host_pool SET guard='released' WHERE id=1").run();
      return this.modeRecord({
        at: this.clock.read(),
        operator,
        account,
        action: 'release-guard',
        from: 'concurrent guarded',
        to: 'concurrent unguarded',
        evidence,
      });
    });
  }
  private modeRecord(record: Omit<ModeRecord, 'sequence'>): ModeRecord {
    const inserted = this.db
      .query<{ sequence: number }, [string]>(
        'INSERT INTO host_pool_mode_records(record) VALUES (?) RETURNING sequence',
      )
      .get(JSON.stringify(ModeRecordShape.assert(record)));
    if (inserted === null) throw new Error('host pool mode record unwritten');
    return { sequence: inserted.sequence, ...record };
  }
  /**
   * Release every entry of a host job its own launcher admitted and never launched or prepared
   * (J12): the legacy queue refused it, or the launcher was interrupted while queueing there.
   * The launcher is this process and no payload, directory or tree write can have happened, so
   * nothing waits for the launch grace; each unit still returns only on its own evidence.
   * @throws when the job was prepared, launched, is not starting, or another process launched it.
   */
  withdrawUnlaunchedHostJob(id: string, reason: string): HostJob {
    const identity = identifyProcess(process.pid);
    return this.transaction(() => {
      const job = this.inspectHostJob(id);
      // Proof: without it `a withdrawal of a prepared job is refused` (host-pool-mode.test.ts)
      // released a job whose tmp directory exists (2026-11-02, Slice 6b).
      if (job.state !== 'starting' || job.process !== null || job.dev !== null)
        throw new Error(`host job ${id} is not an unprepared admission`);
      if (!sameProcess(identity, job.launcher))
        throw new Error(`host job ${id} was admitted for another launcher`);
      const before = settlementOf(job);
      job.compute = { state: 'released', reason: `never launched: ${reason}` };
      job.tmpDisk = this.tmpIntent(job);
      job.units = job.units.map((unit) => ({ ...unit, ...this.unitEvidence(unit, job) }));
      job.launchFailure = `payload did not run: ${reason}`;
      job.endedAt = this.clock.read();
      this.summarize(job);
      this.scheduleSettlement(job);
      this.recordSettlement(job, before);
      return job;
    });
  }
}
