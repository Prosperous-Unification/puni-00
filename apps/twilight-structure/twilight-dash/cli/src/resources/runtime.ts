import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
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
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { Writable } from 'node:stream';

import { parseSecretsOrThrow, type } from '@shared/validation';
import {
  resourceCleanupRequest,
  type ResourceRuntimeEvent as ResourceEvent,
  resourceRuntimeEvent,
} from '@wbs/contracts';
import { Database } from 'bun:sqlite';

import type { WallClock } from '../clock';
import { WbsCredential } from '../compute/configuration';

const Identifier = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const Configuration = type({
  schemaVersion: '1',
  root: 'string',
  authorityId: Identifier,
  epoch: Identifier,
  providerId: Identifier,
  wbsOrigin: 'string',
  credential: 'string > 0',
  diskUnitBytes: 'number.integer > 0',
  diskBudgetUnits: 'number.integer > 0',
  workspaceSlots: 'number.integer > 0',
  headroomBytes: 'number.integer >= 0',
}).onUndeclaredKey('reject');
export type ResourceConfiguration = Omit<typeof Configuration.infer, 'credential'> & {
  credential: WbsCredential;
};
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
}).onUndeclaredKey('reject');
export type { ResourceRuntimeEvent as ResourceEvent } from '@wbs/contracts';
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
  let parsed: typeof Configuration.infer;
  try {
    parsed = parseSecretsOrThrow(Configuration, JSON.parse(source));
  } catch {
    throw new Error('resource configuration malformed');
  }
  let origin: URL;
  try {
    origin = new URL(parsed.wbsOrigin);
  } catch {
    throw new Error('resource WBS origin malformed');
  }
  if (
    (origin.protocol !== 'https:' &&
      !(
        origin.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)
      )) ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  )
    throw new Error(
      'resource WBS origin must be HTTPS or loopback HTTP without credentials or path',
    );
  if (!Number.isSafeInteger(parsed.diskUnitBytes * parsed.diskBudgetUnits))
    throw new Error('resource budget exceeds safe integer range');
  checkRoot(parsed.root);
  return { ...parsed, wbsOrigin: origin.origin, credential: new WbsCredential(parsed.credential) };
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
/** Signal only a leader whose boot/start identity still matches; exit races are harmless. */
function signalOwnedGroup(identity: ProcessIdentity, signal: NodeJS.Signals): void {
  if (!alive(identity)) return;
  try {
    process.kill(-identity.pid, signal);
  } catch (cause) {
    if (!isMissing(cause)) throw new Error('owned process signal refused', { cause });
  }
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
  if (execution.exitCode !== 0) throw new Error('Git provider operation refused');
  return execution.stdout.toString().trim();
}

/** Same-user cwd, descriptors and mapped files are required evidence, including deleted-open files. */
function inspectHolds(locator: string): void {
  // Proof: returning without inspection released a live writer's directory (live-holds.log).
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
      throw new Error('required same-user process inspection unavailable', { cause });
    }
  }
}

/** Descriptor-relative removal never follows a symlink, crosses a mount, or accepts a replacement inode. */
const removeDirectory = String.raw`
import os,sys,stat
root,name,dev,ino=sys.argv[1:]
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
   os.rmdir(name,dir_fd=directory);os.close(child)
  else:
   # Proof: bypassing this guard released shared hardlinked storage (shared-hardlink.log).
   if not stat.S_ISLNK(before.st_mode) and before.st_nlink>1: raise RuntimeError('shared hardlink')
   os.unlink(name,dir_fd=directory)
erase(fd)
after=os.stat(name,dir_fd=parent,follow_symlinks=False)
if (after.st_dev,after.st_ino)!=(s.st_dev,s.st_ino): raise RuntimeError('identity changed')
os.rmdir(name,dir_fd=parent)
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
  static initialize(configuration: ResourceConfiguration, clock: WallClock): ResourceRuntime {
    checkRoot(configuration.root);
    if (readdirSync(configuration.root).length !== 0)
      throw new Error('resource initialization requires an empty root');
    const state = join(configuration.root, '.dash');
    mkdirSync(state, { mode: 0o700 });
    const path = join(state, 'resources.sqlite');
    writeFileSync(path, '', { flag: 'wx', mode: 0o600 });
    const db = new Database(path);
    db.run(
      'PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE binding (identity TEXT NOT NULL); CREATE TABLE uses (id TEXT PRIMARY KEY, snapshot TEXT NOT NULL); CREATE TABLE events (sequence INTEGER PRIMARY KEY AUTOINCREMENT, event TEXT NOT NULL, published INTEGER NOT NULL DEFAULT 0); CREATE TABLE cursor (id INTEGER PRIMARY KEY CHECK(id=1), value INTEGER NOT NULL); INSERT INTO cursor VALUES (1,0)',
    );
    const root = lstatSync(configuration.root);
    db.query('INSERT INTO binding VALUES (?)').run(
      JSON.stringify(ResourceRuntime.binding(configuration, root)),
    );
    db.close();
    return ResourceRuntime.open(configuration, clock);
  }
  private static binding(
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
    const binding = db.query<{ identity: string }, []>('SELECT identity FROM binding').get();
    // Proof: bypassing binding comparison admitted a competing authority and failed `reopening a ledger` (binding.log).
    if (binding?.identity !== JSON.stringify(ResourceRuntime.binding(configuration, root))) {
      db.close();
      throw new Error('resource authority binding mismatch');
    }
    return new ResourceRuntime(db, configuration, clock, root);
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
    const event: ResourceEvent = {
      eventId: randomUUID(),
      epoch: this.configuration.epoch,
      sequence: sequence.sequence,
      useId: use.id,
      incarnation: use.incarnation,
      revision: use.revision,
      kind,
      observedAt: this.clock.read(),
      reason: use.reason,
      ...(use.requestId === undefined ? {} : { requestId: use.requestId }),
      use: {
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
      },
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
      use.evidence = proof;
      event.evidence = {
        digest: createHash('sha256').update(proof).digest('hex'),
        locator: `dash-resource://${this.configuration.authorityId}/${use.id}/${String(use.revision)}`,
        disposition: use.dev === null ? 'not_created' : 'removed',
        reclaimedBytes: null,
      };
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
  /** Atomic admission charges every unresolved use and conservatively reserves all possible disk growth. */
  create(input: CreationRequest): ResourceUse {
    const request = Creation.assert(input);
    try {
      inspectHolds(join(this.configuration.root, '.dash-inspection'));
    } catch {
      throw new Error(
        'resource startup preflight failed: run under a dedicated runtime user with complete same-user procfs visibility',
      );
    }
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
    const use = this.transaction(() => {
      // Proof: charging only active uses failed the replacement-path capacity assertion (held-capacity.log).
      const held = this.list().filter((existing) => existing.state !== 'released');
      const disk = held.reduce(
        (sum, existing) => sum + existing.request.diskUnits,
        request.diskUnits,
      );
      const available = statfsSync(this.configuration.root);
      if (
        disk > this.configuration.diskBudgetUnits ||
        held.length + 1 > this.configuration.workspaceSlots ||
        disk * this.configuration.diskUnitBytes + this.configuration.headroomBytes >
          available.bavail * available.bsize
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
      this.event(reserved, 'registered');
      return reserved;
    });
    this.transaction(() => {
      const current = this.inspect(use.id);
      if (current.state !== 'creating' || current.revision !== use.revision)
        throw new Error('creation became stale');
      mkdirSync(use.locator, { mode: 0o700 });
      const identity = lstatSync(use.locator);
      use.dev = identity.dev;
      use.ino = identity.ino;
      this.save(use);
    });
    this.transaction(() => {
      const current = this.inspect(use.id);
      if (current.state !== 'creating' || current.revision !== use.revision)
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
    use.state = 'pending';
    use.reason = reason;
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
      if (snapshot.state === 'released') continue;
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
    if (use.nextRetryAt === null)
      use.reason += '; automatic retry budget exhausted; operator retry required';
    this.event(use, 'blocked');
  }
  /** Preserve durable commit reachability; dirty, untracked and ignored files stay in their charged worktree. */
  private preserve(use: ResourceUse): boolean {
    if (use.request.source === undefined) return true;
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
  private cleanup(id: string): void {
    // Only a complete preservation/ownership preflight may commit an effect intent.
    const generation = this.transaction(() => {
      const use = this.inspect(id);
      if (use.state === 'released') return null;
      use.cleanupAttempts += 1;
      use.cleanupGeneration += 1;
      try {
        if (use.process !== null && !alive(use.creator))
          signalOwnedGroup(use.process, use.cleanupAttempts < 2 ? 'SIGTERM' : 'SIGKILL');
        if (use.process !== null && ownedGroupAlive(use.process))
          throw new Error('owned command remains live');
        inspectHolds(use.locator);
        this.checkDependencies(use);
        const present = this.checkTarget(use);
        // Proof: bypassing absence provenance released a moved resource (unproven-absence.log).
        if (!present && use.dev !== null && !use.deleteIntent)
          throw new Error('resource absence has no persisted deletion intent');
        if (present) {
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
        if (use.process !== null && ownedGroupAlive(use.process))
          throw new Error('owned command remains live');
        inspectHolds(use.locator);
        this.checkDependencies(use);
        const present = this.checkTarget(use);
        // Proof: bypassing absence provenance released a moved resource (unproven-absence.log).
        if (!present && use.dev !== null && !use.deleteIntent)
          throw new Error('resource absence has no persisted deletion intent');
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
    let escalation: ReturnType<typeof setTimeout> | undefined;
    const cancel = (): void => {
      cancelled = true;
      signalOwnedGroup(identity, 'SIGTERM');
      escalation = setTimeout(() => {
        signalOwnedGroup(identity, 'SIGKILL');
      }, 5000);
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
      this.sweep();
      return code;
    } finally {
      if (escalation !== undefined) clearTimeout(escalation);
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
  async synchronize(send: (request: Request) => Promise<Response> = fetch): Promise<void> {
    const prefix = `${this.configuration.wbsOrigin}/api/resource-authorities/${encodeURIComponent(this.configuration.authorityId)}`;
    for (const event of this.outbox()) {
      const response = await send(
        new Request(`${prefix}/events`, {
          method: 'PUT',
          redirect: 'error',
          headers: {
            authorization: this.configuration.credential.authorization(),
            'content-type': 'application/json',
          },
          body: JSON.stringify(event),
          signal: AbortSignal.timeout(15000),
        }),
      );
      if (response.status !== 200)
        throw new Error(`resource publication HTTP ${String(response.status)}`);
      const acknowledgment = type({
        acceptedSequence: 'number.integer > 0',
        useId: 'string',
        revision: 'number.integer > 0',
      }).assert(await response.json());
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
    const response = await send(
      new Request(`${prefix}/cleanup-requests?after=${String(this.requestCursor())}&limit=100`, {
        headers: { authorization: this.configuration.credential.authorization() },
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      }),
    );
    if (response.status !== 200)
      throw new Error(`resource request read HTTP ${String(response.status)}`);
    const page = type({
      requests: resourceCleanupRequest.array(),
      nextCursor: 'string | null',
    }).assert(await response.json());
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
  }
}
