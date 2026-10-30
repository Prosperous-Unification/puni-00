import { randomUUID } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { posix } from 'node:path';

import { assertDigestPinnedRef } from './docker';
import { type RunDocker, runDockerBefore } from './docker-deadline';
import { type DockerExec, runDockerExec } from './docker-exec';
import {
  CENSUS_PROGRAM,
  GROUP_PROGRAM,
  SNAPSHOT_PROGRAM,
  SUPERVISOR_PROGRAM,
} from './mount-exec-program';

interface NamespaceIdentity {
  identity: string;
  pid: number;
  startedAt: string;
  restarts: number;
  running: boolean;
  init: boolean | null;
}
interface MountedPath {
  point: string;
  device: string;
  writable: boolean;
}
interface FamilyFile {
  suffix: string;
  device: bigint;
  inode: bigint;
}
interface Session {
  pid: string;
  ticks: string;
}

/** Bounds include startup/streaming/inspection and reserved initialized-group cleanup. */
export interface AuditBounds {
  totalMs: number;
  cleanupMs: number;
}
const BOUNDS: AuditBounds = { totalMs: 45000, cleanupMs: 20000 };

function readField(value: unknown, key: string): unknown {
  return value !== null && typeof value === 'object' ? Reflect.get(value, key) : undefined;
}
function readNamespaceIdentity(container: unknown): NamespaceIdentity {
  const identity = readField(container, 'Id');
  const state = readField(container, 'State');
  const pid = readField(state, 'Pid');
  const running = readField(state, 'Running');
  const startedAt = readField(state, 'StartedAt');
  const restarts = readField(container, 'RestartCount');
  const hostConfig = readField(container, 'HostConfig');
  const init = readField(hostConfig, 'Init');
  if (
    typeof identity !== 'string' ||
    !/^[a-f0-9]{64}$/.test(identity) ||
    typeof pid !== 'number' ||
    !Number.isSafeInteger(pid) ||
    pid < 0 ||
    typeof running !== 'boolean' ||
    (running ? pid <= 0 : pid !== 0) ||
    typeof startedAt !== 'string' ||
    startedAt.length === 0 ||
    typeof restarts !== 'number' ||
    !Number.isSafeInteger(restarts) ||
    restarts < 0 ||
    readField(hostConfig, 'PidMode') !== ''
  )
    throw new Error('actual container ID/PID/private namespace identity is unavailable');
  if (init !== null && typeof init !== 'boolean')
    throw new Error('Docker init metadata is missing or malformed');
  // Proof: missing init refuses before any exec; real default-image forced descendant tests require init to remove zombies.
  if (running && init !== true)
    throw new Error(
      `container ${identity} requires attended init:true recreation before namespace audit; no container was restarted`,
    );
  const added = readField(hostConfig, 'CapAdd');
  // Proof: privileged/SYS_ADMIN target negatives admitted when this policy was omitted.
  if (
    running &&
    (readField(hostConfig, 'Privileged') !== false ||
      !(added === null || (Array.isArray(added) && added.length === 0)))
  )
    throw new Error(
      `container ${identity} requires unprivileged default capabilities for metadata audit`,
    );
  return { identity, pid, startedAt, restarts, running, init };
}
function assertSameNamespace(expected: NamespaceIdentity, container: unknown): void {
  // Proof: omitting pre/post identity checks admitted the exact-ID PID-restart race.
  if (JSON.stringify(readNamespaceIdentity(container)) !== JSON.stringify(expected))
    throw new Error(
      `container ${expected.identity} ID/PID/start identity changed during namespace audit`,
    );
}
function readMounts(text: string, destinations: readonly string[]): MountedPath[] {
  const mounts = text.split('\n').map((line): MountedPath => {
    const fields = line.split(' ');
    const separator = fields.indexOf('-');
    const point = fields.at(4);
    const device = fields.at(2);
    const flags = fields.at(5)?.split(',');
    if (
      separator < 6 ||
      fields.length < separator + 4 ||
      typeof point !== 'string' ||
      !/^\/[A-Za-z0-9_./-]*$/.test(point) ||
      posix.normalize(point) !== point ||
      typeof device !== 'string' ||
      !/^[0-9]+:[0-9]+$/.test(device) ||
      flags === undefined ||
      flags.includes('rw') === flags.includes('ro')
    )
      throw new Error('actual mountinfo is malformed or has unsupported escaped paths');
    return { point, device, writable: flags.includes('rw') };
  });
  // Proof: stacked-destination negative failed with this ambiguity refusal omitted.
  if (new Set(mounts.map((mount) => mount.point)).size !== mounts.length)
    throw new Error('actual mount namespace has ambiguous stacked destinations');
  // Proof: omitting root/declared membership admitted both missing-mount negatives.
  if (
    !mounts.some((mount) => mount.point === '/') ||
    destinations.some((path) => !mounts.some((mount) => mount.point === path))
  )
    throw new Error('actual mountinfo lacks root or declared mount');
  return mounts;
}
function deviceOf(device: bigint): string {
  return (
    (((device & 0xfff00n) >> 8n) | ((device & 0xfffff00000000000n) >> 32n)).toString() +
    ':' +
    ((device & 0xffn) | ((device & 0xffffff00000n) >> 12n)).toString()
  );
}
async function readFamily(path: string): Promise<FamilyFile[]> {
  const family: FamilyFile[] = [];
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    try {
      const identity = await lstat(`${path}${suffix}`, { bigint: true });
      // Proof: omitting regularity admitted the main-file symlink negative.
      if (!identity.isFile()) throw new Error('trusted SQLite family is not regular');
      family.push({ suffix, device: identity.dev, inode: identity.ino });
    } catch (cause) {
      // Proof: accepting required absence/unreadability admitted missing-main and EACCES negatives.
      if (suffix !== '' && cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')
        continue;
      throw cause;
    }
  }
  return family;
}
async function readFamilyDirectory(path: string): Promise<{ device: bigint; inode: bigint }> {
  const directory = await lstat(posix.dirname(path), { bigint: true });
  if (!directory.isDirectory()) throw new Error('trusted SQLite family directory is not regular');
  return { device: directory.dev, inode: directory.ino };
}
function directoryIdentity(directory: { device: bigint; inode: bigint }): string {
  return `${directory.device.toString()}:${directory.inode.toString()}`;
}
function requireMounts(mounts: string | null): string {
  if (mounts === null) throw new Error('required mount snapshot is absent');
  return mounts;
}
function familyIdentity(family: readonly FamilyFile[]): string {
  return family
    .map((file) => `${file.suffix}:${file.device.toString()}:${file.inode.toString()}`)
    .join(',');
}

/**
 * Inspect the actual target namespace using immutable metadata-only shell code.
 * No capabilities are added. Running audited targets must already have Docker
 * init enabled; applying that prerequisite is an attended maintenance operation.
 * {@link verifyContainerNamespace} implements ADR 0054's initialized metadata sessions.
 * Source traversal is code-read-only, not filesystem-enforced read-only.
 * Static exclusion assumes trusted, nonadversarial quiescence: no transient
 * alias/mount ABA or already-open deleted SQLite aliases. It proves the observed
 * persistent namespace and full SQLite family, not arbitrary hostile processes.
 * Managed database-path mode additionally binds the mounted parent directory and
 * existing family to captured host inodes, with host identity readback after census.
 * Every remote scanner has a verified private group and an independent 15s EOF/
 * ACK deadline. Init reaps forced descendants; uncertainty refuses with exact
 * container/session context. No writer is stopped or restarted here.
 */
export function verifyContainerNamespace(
  container: unknown,
  destinations: readonly string[],
  databaseHostPath: string,
  image: string,
  runDocker: RunDocker,
  databasePath: string | null = null,
  bounds: AuditBounds = BOUNDS,
  execDocker: DockerExec = runDockerExec,
): Promise<void> {
  return verifyContainerAccessExclusion(
    'writers',
    container,
    destinations,
    databaseHostPath,
    image,
    runDocker,
    databasePath,
    bounds,
    execDocker,
  );
}

/**
 * Excludes unmanaged readers as well as writers from the actual SQLite family.
 * Scans readonly roots without pruning and requires a native entry for every selected root.
 * Uses the same initialized namespace, bounded session, acknowledgement and cleanup protocol.
 */
export function verifyContainerReaderExclusion(
  container: unknown,
  destinations: readonly string[],
  databaseHostPath: string,
  image: string,
  runDocker: RunDocker,
  bounds: AuditBounds = BOUNDS,
  execDocker: DockerExec = runDockerExec,
): Promise<void> {
  return verifyContainerAccessExclusion(
    'readers-and-writers',
    container,
    destinations,
    databaseHostPath,
    image,
    runDocker,
    null,
    bounds,
    execDocker,
  );
}

async function verifyContainerAccessExclusion(
  access: 'writers' | 'readers-and-writers',
  container: unknown,
  destinations: readonly string[],
  databaseHostPath: string,
  image: string,
  runDocker: RunDocker,
  databasePath: string | null,
  bounds: AuditBounds,
  execDocker: DockerExec,
): Promise<void> {
  const subject = readNamespaceIdentity(container);
  if (!subject.running) {
    if (databasePath !== null) return;
    throw new Error(
      `unmanaged container ${subject.identity} has mounts but no running namespace; review/remove the stopped container before retrying`,
    );
  }
  assertDigestPinnedRef(image, 'be');
  if (
    destinations.some(
      (path) => !/^\/[A-Za-z0-9_./-]*$/.test(path) || posix.normalize(path) !== path,
    ) ||
    !/^\/[A-Za-z0-9_./-]+$/.test(databaseHostPath) ||
    posix.normalize(databaseHostPath) !== databaseHostPath ||
    (databasePath !== null &&
      (!/^\/[A-Za-z0-9_./-]+$/.test(databasePath) ||
        posix.normalize(databasePath) !== databasePath))
  )
    throw new Error('namespace audit paths are malformed');
  if (
    !Number.isFinite(bounds.totalMs) ||
    !Number.isFinite(bounds.cleanupMs) ||
    bounds.cleanupMs <= 0 ||
    bounds.totalMs <= bounds.cleanupMs
  )
    throw new Error('namespace audit bounds are malformed');
  const end = performance.now() + bounds.totalMs;
  const workEnd = end - bounds.cleanupMs;
  const family = await readFamily(databaseHostPath);
  const directory = databasePath === null ? null : await readFamilyDirectory(databaseHostPath);
  let seenDirectory = false;
  const inspect = async (): Promise<unknown> =>
    JSON.parse(
      await runDockerBefore(
        ['inspect', '--format', '{{json .}}', subject.identity],
        runDocker,
        workEnd,
      ),
    );
  const installedImage = (
    await runDockerBefore(['image', 'inspect', '--format', '{{.Id}}', image], runDocker, workEnd)
  ).trim();
  // Proof: missing image-inspect identity admitted when this validation was omitted.
  if (!/^sha256:[a-f0-9]{64}$/.test(installedImage))
    throw new Error('candidate image inspect identity is absent or malformed');
  assertSameNamespace(subject, await inspect());

  async function protocol(
    program: string,
    args: string[],
    mode: 'snapshot' | 'census' | 'cleanup',
    deadline: number,
    expectedMounts: string | null = null,
  ): Promise<{ mounts: string; members: string[] }> {
    const nonce = randomUUID();
    const state: {
      session: Session | null;
      tag: string | null;
      fields: string[];
      before: string | null;
      after: string | null;
      done: boolean;
      reaped: boolean;
      entries: number;
    } = {
      session: null,
      tag: null,
      fields: [],
      before: null,
      after: null,
      done: false,
      reaped: false,
      entries: 0,
    };
    const members: string[] = [];
    const seen = new Set<string>();
    const selectedRoots =
      access === 'readers-and-writers' && mode === 'census' ? args.slice(1) : [];
    const seenRoots = new Set<string>();
    let failure: unknown = null;
    const arities: Readonly<Record<string, number>> = {
      SESSION: 5,
      BEFORE: 1,
      AFTER: 1,
      ENTRY: 2,
      MEMBER: 3,
      DONE: 2,
      REAPED: 1,
    };
    const consume = (token: string): boolean => {
      if (state.tag === null) {
        if (!Object.prototype.hasOwnProperty.call(arities, token))
          throw new Error('exec receipt tag is malformed');
        state.tag = token;
        state.fields = [];
        return false;
      }
      state.fields.push(token);
      if (state.fields.length !== arities[state.tag]) return false;
      const frame = state.tag;
      state.tag = null;
      if (frame === 'SESSION') {
        const attempt = state.fields.at(0);
        const pid = state.fields.at(1);
        const group = state.fields.at(2);
        const sid = state.fields.at(3);
        const ticks = state.fields.at(4);
        // Proof: omitting PID=PGID=SID admitted the forged-session negative.
        if (
          state.session !== null ||
          state.before !== null ||
          attempt !== nonce ||
          pid === undefined ||
          !/^[1-9][0-9]*$/.test(pid) ||
          group !== pid ||
          sid !== pid ||
          ticks === undefined ||
          !/^[1-9][0-9]*$/.test(ticks)
        )
          throw new Error('exec private session identity is malformed');
        state.session = { pid, ticks };
      } else if (state.session === null) throw new Error('exec receipt precedes session identity');
      else if (frame === 'BEFORE') {
        const text = state.fields.at(0);
        if (mode === 'cleanup' || state.before !== null || state.done || text === undefined)
          throw new Error('exec mount snapshot is malformed');
        state.before = text;
        readMounts(text, destinations);
        if (expectedMounts !== null && state.before !== expectedMounts)
          throw new Error('actual mount namespace changed before census');
      } else if (frame === 'AFTER') {
        const text = state.fields.at(0);
        // Proof: removing before/after equality admitted the injected mountinfo race.
        if (
          state.before === null ||
          state.after !== null ||
          text === undefined ||
          text !== state.before ||
          state.done
        )
          throw new Error('actual mount namespace changed during census');
        state.after = text;
      } else if (frame === 'ENTRY') {
        const path = state.fields.at(0);
        const metadata = state.fields.at(1);
        if (
          mode !== 'census' ||
          state.before === null ||
          state.done ||
          path === undefined ||
          metadata === undefined ||
          !path.startsWith('/') ||
          path.split('/').includes('..')
        )
          throw new Error('exec entry receipt is malformed');
        if (selectedRoots.includes(path)) seenRoots.add(path);
        const parsed = /^([0-9]+):([1-9][0-9]*):([a-f0-9]+)$/.exec(metadata);
        const device = parsed?.at(1);
        const inode = parsed?.at(2);
        const rawMode = parsed?.at(3);
        if (device === undefined || inode === undefined || rawMode === undefined)
          throw new Error('exec entry metadata is malformed');
        state.entries += 1;
        if (state.entries > 100000) throw new Error('exec entry bound exceeded');
        const kind = BigInt(`0x${rawMode}`) & 0xf000n;
        const mount = readMounts(state.before, destinations)
          .filter(
            (mounted) =>
              mounted.point === '/' ||
              path === mounted.point ||
              path.startsWith(`${mounted.point}/`),
          )
          .sort((left, right) => right.point.length - left.point.length)
          .at(0);
        if (mount === undefined) throw new Error('exec entry effective mount is unavailable');
        if (databasePath !== null) {
          if (path === posix.dirname(databasePath)) {
            // Proof: an all-hardlinked family under a rebound Source passed file-only census; directory mismatch regression fails without this equality.
            if (
              directory === null ||
              kind !== 0x4000n ||
              BigInt(device) !== directory.device ||
              BigInt(inode) !== directory.inode
            )
              throw new Error('managed actual mounted SQLite directory differs');
            seenDirectory = true;
          }
          const suffix = ['', '-wal', '-shm', '-journal'].find(
            (ending) => path === `${databasePath}${ending}`,
          );
          if (suffix !== undefined) {
            const expected = family.find((file) => file.suffix === suffix);
            // Proof: omitted dev/inode/family equality admitted wrong mounted main/WAL/SHM/journal.
            if (
              expected === undefined ||
              kind !== 0x8000n ||
              BigInt(device) !== expected.device ||
              BigInt(inode) !== expected.inode
            )
              throw new Error('managed actual mounted SQLite family differs');
            seen.add(suffix);
          }
          // Proof: restoring writable-only classification admitted an actual RO SQLite hardlink; readonly-reader negative failed.
        } else if (access === 'readers-and-writers' || mount.writable) {
          // Proof: omitting this refusal admitted the symlink alias negative.
          if (kind !== 0x8000n && kind !== 0x4000n)
            throw new Error('actual namespace cannot exclude symbolic/special aliases');
          // Proof: omitting equality admitted replaced-source and all family hardlink negatives.
          if (
            kind === 0x8000n &&
            family.some((file) => file.device === BigInt(device) && file.inode === BigInt(inode))
          )
            throw new Error('actual mounted namespace SQLite family hardlink');
        }
      } else if (frame === 'MEMBER') {
        if (mode !== 'cleanup' || state.done) throw new Error('exec cleanup receipt is malformed');
        members.push(state.fields.join(':'));
      } else if (frame === 'DONE') {
        const attempt = state.fields.at(0);
        const count = state.fields.at(1);
        // Proof: omitting nonce/count validation admitted forged and count-mismatch receipts.
        if (
          state.done ||
          attempt !== nonce ||
          count === undefined ||
          !/^[0-9]+$/.test(count) ||
          (mode !== 'cleanup' && (state.after === null || Number(count) !== state.entries)) ||
          Number(count) > (mode === 'cleanup' ? 10000 : 100000)
        )
          throw new Error('exec complete receipt is malformed');
        // Proof: omitting directory membership admits the missing-directory receipt negative (exit 1).
        if (
          databasePath !== null &&
          mode === 'census' &&
          (!seenDirectory || family.some((file) => !seen.has(file.suffix)))
        )
          throw new Error('managed actual mounted SQLite family is incomplete');
        // Proof: omitting root coverage admitted a valid-count downgraded writer census; selected-root negative failed.
        if (selectedRoots.some((root) => !seenRoots.has(root)))
          throw new Error('strong namespace census omitted a selected root');
        state.done = true;
        return true;
      } else if (frame === 'REAPED') {
        if (!state.done || state.reaped || state.fields.at(0) !== nonce)
          throw new Error('exec reap receipt is malformed');
        state.reaped = true;
      }
      return false;
    };
    try {
      await runDockerBefore(
        [],
        async (_args, signal) => {
          await execDocker(
            [
              'exec',
              '-i',
              '--user',
              '0:0',
              subject.identity,
              // Proof: restoring Debian /bin/sh failed the actual backend image rehearsal.
              '/bin/busybox',
              'sh',
              '-c',
              SUPERVISOR_PROGRAM,
              '--',
              nonce,
              program,
              ...args,
            ],
            nonce,
            consume,
            signal,
          );
          return '';
        },
        deadline,
      );
      // Proof: omitting mandatory reap admitted the missing-reap production-path negative.
      if (state.tag !== null || !state.done || !state.reaped)
        throw new Error('exec complete/reap receipt is absent');
    } catch (cause) {
      failure = cause;
    }
    if (mode !== 'cleanup') {
      if (state.session === null)
        throw new AggregateError(
          failure === null ? [] : [failure],
          `exec creation/cleanup unproved; inspect container ${subject.identity} attempt ${nonce}`,
        );
      const owned: Session = state.session;
      let cleared = false;
      try {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const checked = await protocol(GROUP_PROGRAM, [owned.pid], 'cleanup', end);
          if (checked.members.length === 0) {
            cleared = true;
            break;
          }
          await new Promise<void>((resolve) => setTimeout(resolve, 25));
        }
        // Proof: omitting convergence refusal admitted retained zombie-group metadata.
        if (!cleared) throw new Error(`owned exec group ${owned.pid} retains processes`);
      } catch (cause) {
        throw new AggregateError(
          failure === null ? [cause] : [failure, cause],
          `exec cleanup unproved for container ${subject.identity}, group ${owned.pid}, start ${owned.ticks}`,
          { cause },
        );
      }
    }
    if (failure instanceof Error) throw failure;
    if (failure !== null)
      throw new Error('exec protocol failed with non-error cause', { cause: failure });
    return { mounts: mode === 'cleanup' ? '' : requireMounts(state.before), members };
  }

  const snapshot = await protocol(SNAPSHOT_PROGRAM, [], 'snapshot', workEnd);
  const mounts = readMounts(snapshot.mounts, destinations);
  // Proof: trusting Docker top-level RO or skipping hidden/nested RW misses actual namespace alias fixtures.
  const roots =
    databasePath === null
      ? mounts
          .filter(
            (mount) =>
              // Proof: writable-only roots omitted the real RO hardlink; readonly-reader negative failed.
              (access === 'readers-and-writers' || mount.writable) &&
              (destinations.some(
                (path) => mount.point === path || mount.point.startsWith(`${path}/`),
              ) ||
                family.some((file) => deviceOf(file.device) === mount.device)),
          )
          .map((mount) => mount.point)
      : [posix.dirname(databasePath)];
  // Proof: allowing ordinary RO pruning changed the actual strong census request; initialized-namespace protocol assertion failed.
  const readonly =
    databasePath === null && access === 'writers'
      ? mounts
          .filter(
            (mount) =>
              !mount.writable &&
              !roots.some((root) => root === mount.point || root.startsWith(`${mount.point}/`)),
          )
          .map((mount) => mount.point)
          .join(' ')
      : '';
  await protocol(CENSUS_PROGRAM, [readonly, ...roots], 'census', workEnd, snapshot.mounts);
  // Proof: omitting host identity readback admitted the held-old-file replacement negative.
  if (familyIdentity(await readFamily(databaseHostPath)) !== familyIdentity(family))
    throw new Error('trusted host SQLite family changed during namespace admission');
  // Proof: deleting this readback admits host-directory-race despite identical hardlinked file inodes (exit 1).
  if (
    directory !== null &&
    directoryIdentity(await readFamilyDirectory(databaseHostPath)) !== directoryIdentity(directory)
  )
    throw new Error('trusted host SQLite directory changed during namespace admission');
  assertSameNamespace(subject, await inspect());
}
