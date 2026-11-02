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
  resourceCleanupRequest,
  type ResourceRuntimeAdmission,
  resourceRuntimeAdmission,
  resourceRuntimeAdmissionReceipt,
  type ResourceRuntimeEvent as ResourceEvent,
  resourceRuntimeEvent,
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
  type PoolVector,
  TICKET_RECLAIM_AFTER_MS,
  vectorFits,
} from './host-pool';

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

/**
 * The body of `tool`'s 2xx answer. `what` names the call in every refusal.
 * @throws ResourceWbsUnavailable when WBS did not answer, answered `429`, or mcp-01 left the call
 * uncompleted for a transient reason; a plain error for any other refusal, which a retry cannot
 * change, and for an answer that cannot be attributed.
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
    throw new Error(message);
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
  tmpDeleteIntent: boolean;
  admittedAt: number;
  launchDeadline: number;
  startedAt: number | null;
  endedAt: number | null;
  exitCode: number | null;
  /** Why the payload never ran though a launch was recorded; absent when it ran or is running. */
  launchFailure?: string;
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
  tmpDeleteIntent: 'boolean',
  admittedAt: 'number',
  launchDeadline: 'number',
  startedAt: 'number | null',
  endedAt: 'number | null',
  exitCode: 'number.integer | null',
  'launchFailure?': 'string > 0',
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
}
const HostJobRequestShape = type({
  descriptor: jobTypeDescriptor,
  label: /^[ -~]{1,200}$/,
  waitSeconds: 'number.integer >= 0',
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

/** The host pool as `ops job status` reads it: mode, budget, reservations, jobs and waiters. */
export interface HostPoolStatus {
  mode: 'observe' | 'concurrent';
  enrollmentId: string;
  allocatable: PoolVector;
  reserved: PoolVector;
  units: { exclusiveId: string; path: string; heldBy: string | null }[];
  jobs: HostJob[];
  waiters: HostJobTicket[];
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

/** The ledger schema this Dash writes; {@link ResourceRuntime.open} steps 0 forward to it. */
const LEDGER_VERSION = 1;
const LEDGER_V0_TABLES = ['binding', 'cursor', 'events', 'sqlite_sequence', 'uses'];
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
      inspectHolds(path);
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
function identifyProcess(pid: number): ProcessIdentity | null {
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
function isMissing(cause: unknown): boolean {
  return (
    cause instanceof Error && 'code' in cause && (cause.code === 'ENOENT' || cause.code === 'ESRCH')
  );
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
 * A host job's scope for hold inspection (`dash-host-jobs` slice 3 review F1): the transient unit
 * its payload ran in, and the same-user processes whose descriptors could not be read but that
 * live outside that unit, collected as evidence.
 */
interface JobScope {
  unit: string;
  outside: { pid: number; comm: string }[];
}

/** The scope of host job `id`: its unit is the one `ops job run` names `dash-job-<id>`. */
function jobScopeOf(id: string): JobScope {
  return { unit: `dash-job-${id}.scope`, outside: [] };
}

/** `; uninspectable_outside_scope: <pid> (<comm>), …` for evidence text, or nothing. */
function outsideNote(scope: JobScope): string {
  if (scope.outside.length === 0) return '';
  const seen = new Map(scope.outside.map((process) => [process.pid, process]));
  return `; uninspectable_outside_scope: ${[...seen.values()].map((process) => `${String(process.pid)} (${process.comm})`).join(', ')}`;
}

/**
 * Whether a same-user process whose descriptors are unreadable stands outside the job's scope.
 * Such a process changed credentials (`(sd-pam)`, `sshd-session`) and is not dumpable; a payload's
 * descendants stay dumpable and inside the scope cgroup until it is collected, so an unreadable
 * process inside the scope remains an unknown holder.
 * @throws Error when its cgroup cannot be read, which keeps the entry charged.
 */
function outsideScope(pid: string, scope: JobScope): boolean {
  let membership: string;
  try {
    membership = readFileSync(`/proc/${pid}/cgroup`, 'utf8');
  } catch (cause) {
    throw new Error(`cannot read the cgroup of uninspectable PID ${pid}`, { cause });
  }
  const unified = membership.split('\n').find((line) => line.startsWith('0::'));
  if (unified === undefined)
    throw new Error(`uninspectable PID ${pid} has no cgroup v2 membership`);
  return !unified.slice(3).split('/').includes(scope.unit);
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
 * With a host job's `scope`, a same-user process whose descriptors are access-denied and that is
 * outside the scope is recorded in `scope.outside` instead of refusing; without one (worktree
 * uses, pool init) every uninspectable process refuses, as before.
 */
function inspectHolds(locator: string, scope?: JobScope): void {
  // Proof: returning without inspection released a live writer's directory (live-holds.log)
  // and the protected-process target in `existing account runs work` (2026-10-25).
  const mounts = readFileSync('/proc/self/mountinfo', 'utf8').split('\n');
  for (const mount of mounts) {
    const target = mount.split(' ')[4]?.replace(/\\040/g, ' ');
    if (target && samePath(target, locator)) throw new Error('mounted target remains charged');
  }
  for (const pid of readdirSync('/proc').filter((name) => /^\d+$/.test(name))) {
    try {
      if (
        statSync(`/proc/${pid}`).uid !== process.getuid?.() ||
        identifyProcess(Number(pid)) === null
      )
        continue;
      for (const link of [
        `/proc/${pid}/cwd`,
        ...readdirSync(`/proc/${pid}/fd`).map((fd) => `/proc/${pid}/fd/${fd}`),
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
      for (const mapping of readFileSync(`/proc/${pid}/maps`, 'utf8').split('\n')) {
        const target = /\s(\/.*)$/.exec(mapping)?.[1];
        if (target && samePath(target.replace(/ \(deleted\)$/, ''), locator))
          throw new Error('mapped file hold remains charged');
      }
    } catch (cause) {
      if (isMissing(cause) || identifyProcess(Number(pid)) === null) continue;
      if (cause instanceof Error && cause.message.includes('remains charged')) throw cause;
      // Proof: without this branch `a non-dumpable process outside the job's scope does not hold
      // its tmp directory` (host-job-holds.test.ts) saw tmp `blocked` "cannot inspect process
      // PID"; without the `outsideScope` test `a non-dumpable process inside the job's scope
      // still holds` saw it `released` (2026-11-02, Slice 3 review F1).
      if (scope !== undefined && isAccessDenied(cause) && outsideScope(pid, scope)) {
        scope.outside.push({ pid: Number(pid), comm: commOf(pid) });
        continue;
      }
      throw new Error(
        `cannot inspect process PID ${pid} for resource cleanup; resolve process access and retry cleanup`,
        { cause },
      );
    }
  }
}

/** Descriptor-relative removal never follows a symlink, crosses a mount, or accepts a replacement inode. */
const removeDirectory = String.raw`
import os,sys,stat
root,name,dev,ino=sys.argv[1:5]
remove=len(sys.argv)<6 or sys.argv[5]!="inspect"
flags=os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW
parent=os.open(root,flags)
fd=os.open(name,flags,dir_fd=parent)
s=os.fstat(fd)
if (s.st_dev,s.st_ino)!=(int(dev),int(ino)): raise RuntimeError('identity changed')
def erase(directory):
 for name in os.listdir(directory):
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
      `PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE binding (identity TEXT NOT NULL); CREATE TABLE uses (id TEXT PRIMARY KEY, snapshot TEXT NOT NULL); CREATE TABLE events (sequence INTEGER PRIMARY KEY AUTOINCREMENT, event TEXT NOT NULL, published INTEGER NOT NULL DEFAULT 0); CREATE TABLE cursor (id INTEGER PRIMARY KEY CHECK(id=1), value INTEGER NOT NULL); INSERT INTO cursor VALUES (1,0); ${HOST_POOL_SCHEMA}; PRAGMA user_version=${String(LEDGER_VERSION)}`,
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
  /** Opening validates the root and binding before any reservation or provider effect. */
  static open(configuration: ResourceConfiguration, clock: WallClock): ResourceRuntime {
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
   * configuration's version-0 binding. A version this Dash does not know is refused: it may be a
   * newer schema, and nothing here can step it back.
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
      .transaction((): boolean => {
        const found = version();
        if (found === LEDGER_VERSION) return false;
        // Proof: without it, `refuses a ledger version it does not know` (host-jobs.test.ts)
        // treated version 9 as version 0 and refused only on its tables (2026-11-01, Slice 2).
        if (found !== 0)
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
        // (host-jobs.test.ts) migrated a ledger it did not write (2026-11-01, verify.md Slice 2).
        if (JSON.stringify(tables) !== JSON.stringify(LEDGER_V0_TABLES))
          throw new Error(`resource ledger version 0 has unexpected tables: ${tables.join(', ')}`);
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
        db.run(`PRAGMA user_version=${String(LEDGER_VERSION)}`);
        return true;
      })
      .immediate();
    // `open` has no report sink and this happens once per ledger: say it on stderr.
    if (migrated)
      process.stderr.write(
        `resources: migrated ledger ${join(configuration.root, '.dash', 'resources.sqlite')} from version 0 to ${String(LEDGER_VERSION)} (host pool)\n`,
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
  private declaration(use: ResourceUse): ResourceEvent['use'] {
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
        inspectHolds(use.locator);
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
        if (ownedProcessesAlive(use)) throw new Error('owned command remains live');
        inspectHolds(use.locator);
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
        inspectHolds(use.locator);
        use.state = 'released';
        use.reason = 'provider absence and file holds verified';
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
  /** Ordered publication retries exact bytes; request acceptance and cursor advancement share one SQLite transaction. */
  async synchronize(tools: WbsTools): Promise<void> {
    const authorityId = this.configuration.authorityId;
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
      }).assert(
        await answeredBody(tools, EVENT_TOOL, { authorityId, ...event }, 'resource publication'),
      );
      if (
        acknowledgment.acceptedSequence !== event.sequence ||
        acknowledgment.useId !== event.useId ||
        acknowledgment.revision !== event.revision
      )
        throw new Error('resource publication acknowledgment mismatch');
      this.transaction(() => {
        this.db
          .query('UPDATE events SET published=1 WHERE sequence=? AND event=?')
          .run(event.sequence, JSON.stringify(event));
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
      if (job.compute.state !== 'released') {
        vector.cpuCores += job.descriptor.envelope.cpuCores;
        vector.memoryGib += job.descriptor.envelope.memoryGib;
      }
      if (job.tmpDisk.state !== 'released') {
        vector.diskUnits += job.diskUnits;
        vector.workspaceSlots += 1;
      }
      for (const unit of job.units) if (unit.state !== 'released') units.set(unit.path, job.id);
    }
    return { vector, units };
  }
  /** Measured free bytes cover every reservation growing to its full size, plus headroom. */
  private freeSpaceCovers(diskUnits: number): boolean {
    const available = statfsSync(this.configuration.root);
    return (
      diskUnits * this.configuration.diskUnitBytes + this.configuration.headroomBytes <=
      available.bavail * available.bsize
    );
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
    // Only this class writes the owner-only ledger; malformed JSON throws rather than defaulting.
    return HostJobShape.assert(JSON.parse(row.snapshot));
  }
  /** Every host job, released history included, oldest admission first. */
  listHostJobs(): HostJob[] {
    return this.db
      .query<{ snapshot: string }, []>('SELECT snapshot FROM host_jobs ORDER BY rowid')
      .all()
      .map((row) => HostJobShape.assert(JSON.parse(row.snapshot)));
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
  /** Unpublished host-job events, oldest first: the payloads slice 5 maps to WBS. */
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
  private oversize(descriptor: JobTypeDescriptor): string | null {
    const allocatable = this.allocatable();
    const name = `host job ${descriptor.id} refused`;
    for (const dimension of ['cpuCores', 'memoryGib'] as const)
      if (descriptor.envelope[dimension] > allocatable[dimension])
        return `${name}: ${dimension} ${String(descriptor.envelope[dimension])} exceeds allocatable ${String(allocatable[dimension])}`;
    if (this.diskUnitsOf(descriptor) > allocatable.diskUnits)
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
  ): { kind: 'queued'; ticket: string } | { kind: 'refused'; exitCode: 73; reason: string } {
    const request = HostJobRequestShape.assert(input);
    const exclusive = request.descriptor.envelope.exclusive;
    // Proof: without it `the host-job seams refuse out-of-order calls` (host-jobs.test.ts)
    // queued a gate naming gate_tree twice (2026-11-01, verify.md Slice 2).
    if (new Set(exclusive).size !== exclusive.length)
      throw new Error(`host job ${request.descriptor.id} names an exclusive id twice`);
    const oversize = this.oversize(request.descriptor);
    // Proof: without it, `refuses an envelope larger than the host, exit 73 without a ticket`
    // (host-jobs.test.ts) queued the 14 GiB gate (2026-11-01, verify.md Slice 2).
    if (oversize !== null) return { kind: 'refused', exitCode: 73, reason: oversize };
    const waiter = identifyProcess(waiterPid);
    if (waiter === null) throw new Error('host job waiter identity unavailable');
    return this.transaction(() => {
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
      for (const row of this.tickets()) {
        if (row.id === ticket) continue;
        const gone = !alive({ pid: row.pid, boot: row.boot, start: row.start });
        // Proof: skipping this reclaim left `dead tickets are reclaimed by whoever sees them,
        // named on stderr` (host-jobs.test.ts) with no line and both tickets (2026-11-01).
        if (!gone && now - row.deadline <= TICKET_RECLAIM_AFTER_MS) continue;
        this.db.query('DELETE FROM host_job_tickets WHERE id=?').run(row.id);
        reclaimed.push(
          `host pool: removing ticket ${row.label} (pid ${String(row.pid)}): ${gone ? 'its process is gone' : 'its wait budget ended over a minute ago'}`,
        );
      }
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
      const unavailable = (): string => {
        const named = [...readiness].flatMap(([path, verdict]) =>
          'reason' in verdict ? [`${path} (${verdict.reason})`] : [],
        );
        return named.length === 0 ? '' : `; units not free: ${named.join(', ')}`;
      };
      const fits = (row: TicketRow): boolean => {
        const { descriptor } = this.ticketRequest(row);
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
            `${named}: no room within its wait budget of ${String(request.waitSeconds)}s; ahead: ${aheadText()}${unavailable()}`,
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
      const units = request.descriptor.envelope.exclusive.map((exclusiveId): HostJobUnit => {
        const path = freeUnit(exclusiveId);
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
      });
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
      mkdirSync(job.locator, { mode: 0o700 });
      const identity = lstatSync(job.locator);
      job.dev = identity.dev;
      job.ino = identity.ino;
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
  private unitEvidence(unit: HostJobUnit, jobId: string): HostJobEntry {
    const scope = jobScopeOf(jobId);
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
          reason: `tree ${unit.path} is at ${head}, not its resting commit ${unit.restingCommit}`,
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
        job.units[index] = { ...unit, ...(excluded ? this.unitEvidence(unit, job.id) : waiting) };
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
      const scope = jobScopeOf(job.id);
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
      if (present) inspectHolds(job.locator, jobScopeOf(job.id));
      job.tmpDeleteIntent = true;
      return { state: 'held', reason: 'tmp directory removal intended' };
    } catch (cause) {
      return {
        state: 'blocked',
        reason: `tmp directory unverified: ${cause instanceof Error ? cause.message : 'unknown'}`,
      };
    }
  }
  /** What the host is doing: mode, budget, reservations, units, unreleased jobs, waiters. */
  hostPoolStatus(): HostPoolStatus {
    const mode = this.db.query<{ mode: string }, []>('SELECT mode FROM host_pool WHERE id=1').get();
    // Proof: without it `status refuses an unreadable pool mode` (host-jobs.test.ts) threw a
    // bare TypeError on the missing row instead of naming it (2026-11-01, verify.md Slice 2).
    if (mode?.mode !== 'observe' && mode?.mode !== 'concurrent')
      throw new Error('host pool mode unreadable');
    const { vector, units } = this.reservations();
    return {
      mode: mode.mode,
      enrollmentId: this.configuration.enrollmentId,
      allocatable: this.allocatable(),
      reserved: vector,
      units: Object.entries(this.configuration.exclusiveUnits).flatMap(([exclusiveId, paths]) =>
        paths.map((path) => ({ exclusiveId, path, heldBy: units.get(path) ?? null })),
      ),
      jobs: this.listHostJobs().filter((job) => job.state !== 'released'),
      waiters: this.tickets().map((row) => this.ticketView(row)),
    };
  }
}
