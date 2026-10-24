import { createHash, randomUUID } from 'node:crypto';

import { assertParticipantRestorationContext } from './complete-dependency-exclusion';
import { assertParticipantImage } from './dependency-participant-images';
import type { ParticipantListener } from './dependency-participant-listener';
import type { FinalizedParticipantRestorationContext } from './dependency-participant-preparation';
import type { ParticipantSnapshot } from './dependency-participant-transition';
import {
  assertParticipantTransition,
  readParticipantSnapshot,
} from './dependency-participant-transition';
import type {
  HostMember,
  Namespaces,
  ProcessIdentityProjection,
} from './dependency-product-validation';
import {
  assertHostCgroupReadback,
  assertHostMappings,
  assertHostStartReadback,
  assertHostStatusReadback,
  assertRoster,
  decodeHostCgroup,
  decodeHostStatus,
  decodePasses,
  inspectInnerProfile,
  readStart,
  updateReceiptHash,
} from './dependency-product-validation';
import { ProductMetadataCleanupUnproved, readProductMetadata } from './docker-product-metadata';
import { ownerDockerHashed } from './edge-ownership';
import type { HostProcessIdentity } from './installed-authorities';
import { assertSame, readFields } from './managed-cohort';
import { GROUP_PROGRAM, SUPERVISOR_PROGRAM } from './mount-exec-program';
import { readProductHostProc } from './product-host-proc';

type ProductRole = 'backend' | 'gateway';
type DeepReadonly<Value> = Value extends readonly (infer Member)[]
  ? readonly DeepReadonly<Member>[]
  : Value extends object
    ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
    : Value;

/** Private actual process evidence. The accepted first roster stays module private and cannot be replaced. */
export interface ProductProcessObservation {
  readonly process: DeepReadonly<HostProcessIdentity>;
  readonly runtime: DeepReadonly<ParticipantSnapshot>;
  readonly namespaces: Namespaces;
  readonly listeners: readonly ParticipantListener[];
  readonly localAddresses: readonly string[];
}

interface ProcessBinding {
  readonly application: HostProcessIdentity;
  readonly roster: readonly HostMember[];
  readonly innerRoster: readonly ProcessIdentityProjection[];
  readonly listeners: readonly ParticipantListener[];
  readonly namespaces: Namespaces;
  readonly localAddresses: readonly string[];
}

const OBSERVER_PROGRAM = String.raw`nonce=$1
shift
emit() { printf '%s\000' "$@"; }
pass() {
 emit PASS "$1"
 shift
 for pid in "$@"; do
  case "$pid" in ''|*[!0-9]*) exit 70;; esac
  [ "$pid" -gt 0 ] && [ "$pid" -le 4194304 ] || exit 70
  root="/proc/$pid"
  before=$(/bin/busybox cat "$root/stat") || exit 71
  status=$(/bin/busybox cat "$root/status") || exit 72
  argv=$(/bin/busybox base64 "$root/cmdline" | /bin/busybox tr -d '\n') || exit 73
  cwd=$(/bin/busybox readlink "$root/cwd") || exit 74
  executable=$(/bin/busybox readlink "$root/exe") || exit 75
  metadata=$(/bin/busybox stat -L -c '%d:%i:%s|%y|%z' "$root/exe") || exit 76
  size=\${metadata#*:*:}; size=\${size%%|*}
  [ "$size" -gt 0 ] && [ "$size" -le 134217728 ] || exit 77
  digest=$(/bin/busybox sha256sum "$root/exe") || exit 78
  digest=\${digest%% *}
  pidns=$(/bin/busybox readlink "$root/ns/pid") || exit 79
  netns=$(/bin/busybox readlink "$root/ns/net") || exit 79
  mntns=$(/bin/busybox readlink "$root/ns/mnt") || exit 79
  after=$(/bin/busybox cat "$root/stat") || exit 71
  final=$(/bin/busybox stat -L -c '%d:%i:%s|%y|%z' "$root/exe") || exit 76
  beforefields=\${before##*) }; set -- $beforefields; shift 19; beforestart=$1
  afterfields=\${after##*) }; set -- $afterfields; shift 19; afterstart=$1
  [ "$beforestart" = "$afterstart" ] && [ "$metadata" = "$final" ] || exit 80
  emit PROC "$pid" "$before" "$status" "$argv" "$cwd" "$executable" "$metadata" "$digest" "$pidns" "$netns" "$mntns"
  count=0
  for descriptor in "$root"/fd/*; do
   [ -L "$descriptor" ] || exit 81
   link=$(/bin/busybox readlink "$descriptor") || exit 82
   emit FD "$pid" "\${descriptor##*/}" "$link"
   count=$((count + 1)); [ "$count" -le 4096 ] || exit 83
  done
 done
 tcp4=$(/bin/busybox cat /proc/1/net/tcp) || exit 84
 tcp6=$(/bin/busybox cat /proc/1/net/tcp6) || exit 84
 addresses=$(/bin/busybox ip -o addr show) || exit 85
  selfpid=$(/bin/busybox readlink /proc/self/ns/pid) || exit 86
  selfnet=$(/bin/busybox readlink /proc/self/ns/net) || exit 86
  selfmnt=$(/bin/busybox readlink /proc/self/ns/mnt) || exit 86
  emit SELF "$selfpid" "$selfnet" "$selfmnt"
 emit TCP 4 "$tcp4" TCP 6 "$tcp6" ADDR "$addresses"
}
pass before "$@" || exit "$?"
pass after "$@" || exit "$?"
emit DONE "$nonce" 2
`.replaceAll('\\${', '${');

const bindings = new WeakMap<
  FinalizedParticipantRestorationContext,
  Partial<Record<ProductRole, ProcessBinding>>
>();
const observing = new WeakMap<FinalizedParticipantRestorationContext, Set<ProductRole>>();
const terminal = new WeakSet<FinalizedParticipantRestorationContext>();

interface ExecSession {
  readonly pid: string;
  readonly ticks: string;
}

async function runSession(
  context: FinalizedParticipantRestorationContext,
  id: string,
  program: string,
  arguments_: readonly string[],
  deadline: number,
  mode: 'observe' | 'cleanup',
  roster?: readonly HostMember[],
): Promise<{
  readonly session: ExecSession | null;
  readonly frames: readonly (readonly string[])[];
  readonly failure: unknown;
}> {
  checkDeadline(deadline, 15000);
  const nonce = randomUUID();
  let session: ExecSession | null = null;
  let tag: string | null = null;
  let fields: string[] = [];
  let done = false;
  let reaped = false;
  const receiptHash = createHash('sha256');
  // Proof: omitting REAPED from completion accepted the modeled lost-reap receipt; its negative failed with Missing expected rejection.
  const isComplete = () => tag === null && done && reaped;
  const frames: string[][] = [];
  const arity: Readonly<Record<string, number>> = {
    SESSION: 5,
    PASS: 1,
    PROC: 11,
    FD: 3,
    SELF: 3,
    TCP: 2,
    ADDR: 1,
    MEMBER: 3,
    DONE: 2,
    REAPED: 1,
  };
  const consume = (token: string): boolean => {
    if (Buffer.byteLength(token) > 4 * 1024 * 1024 || frames.length > 40000)
      throw new Error('product receipt bound exceeded');
    // Proof: hash-call omission changed the actual owner readback hash; genuine raw IO success audit comparison failed.
    updateReceiptHash(receiptHash, token);
    if (tag === null) {
      if (!Object.hasOwn(arity, token) || (done && token !== 'REAPED'))
        throw new Error('product receipt tag unsupported');
      tag = token;
      fields = [];
      return false;
    }
    fields.push(token);
    if (fields.length < arity[tag]) return false;
    const frame = tag;
    tag = null;
    if (frame === 'SESSION') {
      const [attempt, pid, group, sid, ticks] = fields;
      if (
        session !== null ||
        frames.length !== 0 ||
        attempt !== nonce ||
        !/^[1-9][0-9]*$/.test(pid) ||
        group !== pid ||
        sid !== pid ||
        !/^[1-9][0-9]*$/.test(ticks)
      )
        throw new Error('product private session malformed');
      session = { pid, ticks };
      return false;
    }
    if (session === null) throw new Error('product receipt lacks private session');
    if (frame === 'DONE') {
      if (
        done ||
        fields[0] !== nonce ||
        (mode === 'observe'
          ? fields[1] !== '2'
          : !/^[0-9]+$/.test(fields[1]) || Number(fields[1]) > 10000)
      )
        throw new Error('product completion malformed');
      if (mode === 'observe') {
        if (roster === undefined) throw new Error('product expected process roster absent');
        decodePasses(frames, roster);
      }
      done = true;
      return true;
    }
    if (frame === 'REAPED') {
      if (!done || reaped || fields[0] !== nonce) throw new Error('product reap malformed');
      reaped = true;
      return false;
    }
    if (done || (mode === 'observe') === (frame === 'MEMBER'))
      throw new Error('product receipt frame unsupported');
    frames.push([frame, ...fields]);
    return false;
  };
  const controller = new AbortController();
  const timer = setTimeout(
    () => {
      controller.abort();
    },
    Math.min(15000, deadline - performance.now() - 10000),
  );
  try {
    const args = [
      '--host',
      'unix:///var/run/docker.sock',
      'exec',
      '-i',
      '--user',
      '0:0',
      '--workdir',
      '/',
      id,
      '/bin/busybox',
      'env',
      '-i',
      'PATH=/bin:/usr/bin',
      'LC_ALL=C',
      '/bin/busybox',
      'sh',
      '-c',
      SUPERVISOR_PROGRAM,
      '--',
      nonce,
      program,
      ...arguments_,
    ];
    const audit = ownerDockerHashed(
      context.owner,
      context.layouts.prod,
      async (_command, signal) => {
        await context.ports.execDocker(args, nonce, consume, signal);
        if (signal?.aborted || !isComplete())
          throw new Error('product receipt complete/reap absent');
        return JSON.stringify({
          nonce,
          session,
          done,
          reaped,
          receiptSha256: receiptHash.digest('hex'),
        });
      },
    );
    await audit(
      ['exec', 'product-process-observer', 'unix:///var/run/docker.sock', id, nonce, mode],
      controller.signal,
    );
    if (controller.signal.aborted || !isComplete())
      throw new Error('product receipt complete/reap absent');
    return { session, frames, failure: null };
  } catch (cause) {
    return { session, frames, failure: cause };
  } finally {
    clearTimeout(timer);
  }
}

async function verifySessionCleared(
  context: FinalizedParticipantRestorationContext,
  id: string,
  session: ExecSession,
): Promise<void> {
  const receipt = await runSession(
    context,
    id,
    GROUP_PROGRAM,
    [session.pid],
    context.deadline,
    'cleanup',
  );
  // Proof: omitting the empty-group census check accepted a modeled retained supervisor member; the negative failed with Missing expected rejection.
  if (receipt.failure !== null || receipt.session === null || receipt.frames.length !== 0)
    throw new Error('product observer group remains');
}

async function observeInner(
  context: FinalizedParticipantRestorationContext,
  id: string,
  roster: readonly HostMember[],
): Promise<readonly (readonly string[])[]> {
  const receipt = await runSession(
    context,
    id,
    OBSERVER_PROGRAM,
    roster.map((member) => String(member.namespacePid)),
    context.deadline - 20000,
    'observe',
    roster,
  );
  if (receipt.session === null) throw new Error('product observer creation or session unproved');
  try {
    await verifySessionCleared(context, id, receipt.session);
  } catch {
    throw new Error('product observer cleanup unproved');
  }
  if (receipt.failure !== null) throw new Error('product observer receipt refused');
  return receipt.frames;
}

function freezeDeep<Value>(value: Value): DeepReadonly<Value> {
  if (value !== null && typeof value === 'object') {
    for (const member of Object.values(value)) freezeDeep(member);
    Object.freeze(value);
  }
  // Object.freeze recursively protects this locally constructed, structured-cloned evidence tree.
  return value as DeepReadonly<Value>;
}

function checkDeadline(deadline: number, reserve = 0): void {
  if (
    !Number.isFinite(deadline) ||
    deadline - performance.now() <= reserve ||
    deadline - performance.now() > 600000
  )
    throw new Error('product process deadline exhausted');
}

async function observeHostMember(
  pid: number,
  parent: number,
  deadline: number,
): Promise<HostMember> {
  if (!Number.isSafeInteger(pid) || pid <= 0 || !Number.isSafeInteger(parent) || parent < 0)
    throw new Error('product top PID malformed');
  const root = `/proc/${String(pid)}`;
  const start = readStart(await readProductHostProc(`${root}/stat`, 65536, deadline), pid);
  const status = await readProductHostProc(`${root}/status`, 65536, deadline);
  const { namespacePid, uid, uids } = decodeHostStatus(pid, status);
  const cgroup = decodeHostCgroup(await readProductHostProc(`${root}/cgroup`, 65536, deadline));
  const uidMap = await readProductHostProc(`${root}/uid_map`, 65536, deadline);
  const gidMap = await readProductHostProc(`${root}/gid_map`, 65536, deadline);
  // Proof: host-mapping-call omission dispatched exec for the changed UID map; genuine pre-exec refusal missed its rejection.
  assertHostMappings(uidMap, gidMap);
  assertHostStartReadback(
    start,
    await readProductHostProc(`${root}/stat`, 65536, deadline),
    pid,
    false,
  );
  const finalStatus = await readProductHostProc(`${root}/status`, 65536, deadline);
  assertHostStatusReadback(status, finalStatus);
  assertHostCgroupReadback(cgroup, await readProductHostProc(`${root}/cgroup`, 65536, deadline));
  assertHostStartReadback(
    start,
    await readProductHostProc(`${root}/stat`, 65536, deadline),
    pid,
    true,
  );
  return {
    pid,
    parent,
    start,
    namespacePid,
    uid,
    uids,
    cgroup: cgroup.slice(3),
  };
}

async function inspectRuntime(
  context: FinalizedParticipantRestorationContext,
  id: string,
): Promise<ParticipantSnapshot> {
  const response = await readProductMetadata(
    context.owner,
    context.layouts.prod,
    context.ports.spawnProductMetadata,
    { kind: 'container', id },
    context.deadline,
  );
  const parsed: unknown = JSON.parse(response);
  const runtime = readParticipantSnapshot(parsed);
  if (runtime.id !== id || runtime.pid <= 0) throw new Error('product selected container changed');
  return runtime;
}

async function observeRoster(
  context: FinalizedParticipantRestorationContext,
  id: string,
  rootPid: number,
): Promise<readonly HostMember[]> {
  const top = await readProductMetadata(
    context.owner,
    context.layouts.prod,
    context.ports.spawnProductMetadata,
    { kind: 'top', id },
    context.deadline,
  );
  const lines = top.trim().split('\n');
  if (lines.shift()?.trim() !== 'PID PPID' || lines.length < 2 || lines.length > 32)
    throw new Error('product top roster unsupported');
  const roster: HostMember[] = [];
  for (const line of lines) {
    const fields = /^\s*([1-9][0-9]*)\s+([0-9]+)\s*$/.exec(line);
    if (fields === null) throw new Error('product top row malformed');
    roster.push(await observeHostMember(Number(fields[1]), Number(fields[2]), context.deadline));
  }
  assertRoster(roster, rootPid);
  return roster.sort((left, right) => left.namespacePid - right.namespacePid);
}

/** Refuses unproved root-product metadata. All external observations remain private on failure. */
export async function observeSelectedProductRole(
  context: FinalizedParticipantRestorationContext,
  role: ProductRole,
): Promise<ProductProcessObservation> {
  let active = observing.get(context);
  // Proof: disabling this terminal guard let the genuine context dispatch a second raw child after unproved cleanup; the test failed Expected 1 / Received 2.
  // Proof: terminal-transport omission dispatched a later role after actual ACK/EOF/stderr failure; the genuine private-stderr negative missed its rejection.
  if (terminal.has(context)) throw new Error('product process observation refused');
  if (active?.has(role)) throw new Error('product process observation refused');
  if (active === undefined) {
    active = new Set<ProductRole>();
    observing.set(context, active);
  }
  active.add(role);
  let beganExec = false;
  try {
    await assertParticipantRestorationContext(context);
    checkDeadline(context.deadline, 40000);
    const original = context.originals[role];
    const selected = context.participants.selected[role];
    if (original.id !== selected.id) throw new Error('product selected original differs');
    const firstRuntime = await inspectRuntime(context, original.id);
    const parked = context.parkedInventory
      .filter((member) => readFields(member)['Id'] === original.id)
      .map((member) => readParticipantSnapshot(member));
    if (parked.length !== 1) throw new Error('product parked selected member absent');
    assertParticipantTransition(parked[0], firstRuntime.native, 'start');
    const hostConfiguration = readFields(firstRuntime.native['HostConfig']);
    if (
      hostConfiguration['Init'] !== true ||
      hostConfiguration['PidMode'] !== '' ||
      hostConfiguration['Privileged'] !== false ||
      !(
        hostConfiguration['CapAdd'] === null ||
        (Array.isArray(hostConfiguration['CapAdd']) && hostConfiguration['CapAdd'].length === 0)
      )
    )
      throw new Error('product private initialized process profile unsupported');
    const imageResponse = await readProductMetadata(
      context.owner,
      context.layouts.prod,
      context.ports.spawnProductMetadata,
      { kind: 'image', id: selected.imageId },
      context.deadline,
    );
    const image: unknown = JSON.parse(imageResponse);
    assertParticipantImage(firstRuntime, image, {
      role,
      reference: selected.image,
      imageId: selected.imageId,
      sourceSha: context.request.owner.sha,
      backendColor: context.request.prod.backend.color,
      dataDirectory: `${context.layouts.prod.root}/data`,
    });
    const firstRoster = await observeRoster(context, original.id, firstRuntime.pid);
    beganExec = true;
    const passes = decodePasses(await observeInner(context, original.id, firstRoster), firstRoster);
    const before = passes[0];
    const after = passes[1];
    assertSame(before, after, 'product inner receipt readback');
    // Proof: replacing this call with unvalidated receipt projections admitted the init-owned listener; genuine listener refusal missed its rejection.
    const { application, hostApplication, owned, localAddresses } = inspectInnerProfile(
      before,
      firstRoster,
      role,
      firstRuntime.native,
    );
    const lastRoster = await observeRoster(context, original.id, firstRuntime.pid);
    assertSame(firstRoster, lastRoster, 'product host roster readback');
    const lastRuntime = await inspectRuntime(context, original.id);
    assertParticipantTransition(firstRuntime, lastRuntime.native, 'stable');
    const finalImage: unknown = JSON.parse(
      await readProductMetadata(
        context.owner,
        context.layouts.prod,
        context.ports.spawnProductMetadata,
        { kind: 'image', id: selected.imageId },
        context.deadline,
      ),
    );
    assertParticipantImage(lastRuntime, finalImage, {
      role,
      reference: selected.image,
      imageId: selected.imageId,
      sourceSha: context.request.owner.sha,
      backendColor: context.request.prod.backend.color,
      dataDirectory: `${context.layouts.prod.root}/data`,
    });
    await assertParticipantRestorationContext(context);
    const identity: HostProcessIdentity = {
      pid: hostApplication.pid,
      startTime: hostApplication.start,
      uid: hostApplication.uid,
      cgroup: hostApplication.cgroup,
      executable: application.executable,
      argvSha256: application.argvSha256,
      cwd: application.cwd,
    };
    const listeners = owned.map(({ owner: _owner, ...listener }) => listener);
    const binding: ProcessBinding = {
      application: identity,
      roster: firstRoster,
      innerRoster: before.processes.map(
        ({
          pid,
          start,
          uid,
          uids,
          argv,
          argvSha256,
          cwd,
          executablePath,
          executable,
          namespaces,
        }) => ({
          pid,
          start,
          uid,
          uids,
          argv,
          argvSha256,
          cwd,
          executablePath,
          executable,
          namespaces,
        }),
      ),
      listeners,
      namespaces: application.namespaces,
      localAddresses,
    };
    const retained = bindings.get(context) ?? {};
    // Proof: omitting the retained inner roster comparison accepted a same-byte init inode replacement; the modeled binding negative failed with Missing expected rejection.
    if (retained[role] !== undefined)
      assertSame(retained[role], binding, 'product original application binding');
    else {
      retained[role] = structuredClone(binding);
      bindings.set(context, retained);
    }
    return freezeDeep({
      process: structuredClone(identity),
      runtime: structuredClone(lastRuntime),
      namespaces: structuredClone(application.namespaces),
      listeners: structuredClone(listeners),
      localAddresses: [...localAddresses],
    });
  } catch (cause) {
    // A terminal local-child cleanup failure cannot authorize another metadata or exec effect.
    if (beganExec || cause instanceof ProductMetadataCleanupUnproved) terminal.add(context);
  } finally {
    active.delete(role);
  }
  throw new Error('product process observation refused');
}
