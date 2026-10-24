import type { Hash } from 'node:crypto';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

import type { ParticipantListener } from './dependency-participant-listener';
import type { HostProcessIdentity } from './installed-authorities';
import { assertSame, readFields, readString } from './managed-cohort';

export type Namespaces = Readonly<Record<'pid' | 'net' | 'mnt', string>>;
export interface HostMember {
  readonly pid: number;
  readonly parent: number;
  readonly start: string;
  readonly namespacePid: number;
  readonly uid: number;
  readonly uids: readonly number[];
  readonly cgroup: string;
}

export type ProcessIdentityProjection = Pick<
  InnerProcess,
  | 'pid'
  | 'start'
  | 'uid'
  | 'uids'
  | 'argv'
  | 'argvSha256'
  | 'cwd'
  | 'executablePath'
  | 'executable'
  | 'namespaces'
>;

export interface InnerProcess {
  readonly pid: number;
  readonly start: string;
  readonly uid: number;
  readonly uids: readonly number[];
  readonly argv: readonly string[];
  readonly argvSha256: string;
  readonly cwd: string;
  readonly executablePath: string;
  readonly executable: NonNullable<HostProcessIdentity['executable']>;
  readonly namespaces: Namespaces;
  readonly sockets: Readonly<Record<string, readonly number[]>>;
}

export interface InnerPass {
  readonly processes: readonly InnerProcess[];
  readonly tcp4: string;
  readonly tcp6: string;
  readonly addresses: string;
}

function decodeBase64(encoded: string, maximum: number): Buffer {
  if (
    encoded.length > Math.ceil(maximum / 3) * 4 + 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)
  )
    throw new Error('product binary receipt malformed');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length > maximum || bytes.toString('base64') !== encoded)
    throw new Error('product binary receipt noncanonical');
  return bytes;
}

/** Decodes one bounded proc receipt, preserving executable object, argv and namespace evidence; throws on unsupported fields. */
export function decodeInnerProcess(
  fields: readonly string[],
  sockets: Readonly<Record<string, readonly number[]>>,
): InnerProcess {
  const [
    pidText,
    stat,
    status,
    command,
    cwd,
    executablePath,
    metadata,
    digest,
    pidns,
    netns,
    mntns,
  ] = fields;
  if (fields.length !== 11 || !/^[1-9][0-9]*$/.test(pidText))
    throw new Error('product process receipt malformed');
  const pid = Number(pidText);
  if (
    !Number.isSafeInteger(pid) ||
    pid > 4194304 ||
    Buffer.byteLength(stat) > 65536 ||
    Buffer.byteLength(status) > 65536
  )
    throw new Error('product process receipt bound exceeded');
  const start = readStart(stat, pid);
  const uidLines = status.split('\n').filter((line) => line.startsWith('Uid:'));
  const pidLines = status.split('\n').filter((line) => line.startsWith('NSpid:'));
  const tgidLines = status.split('\n').filter((line) => line.startsWith('Tgid:'));
  const uids = uidLines.at(0)?.trim().split(/\s+/).slice(1);
  const mapped = pidLines.at(0)?.trim().split(/\s+/).slice(1);
  // Proof: inner-status: two-level inner NSpid was accepted after omitting this guard; inner refuses inner-status failed.
  if (
    uidLines.length !== 1 ||
    uids?.length !== 4 ||
    uids.some((uid) => !/^[0-9]+$/.test(uid)) ||
    pidLines.length !== 1 ||
    mapped?.length !== 1 ||
    mapped[0] !== pidText ||
    tgidLines.length !== 1 ||
    tgidLines[0]?.trim().split(/\s+/)[1] !== pidText
  )
    throw new Error('product inner status unsupported');
  const uid = Number(uids[1]);
  const tuple = uids.map(Number);
  // Proof: inner-uid-range: UID 4294967296 was accepted by decoding after omission; inner refuses inner-uid-range failed.
  if (tuple.some((value) => !Number.isSafeInteger(value) || value < 0 || value > 4294967295))
    throw new Error('product inner UID unsupported');
  const commandBytes = decodeBase64(command, 1024 * 1024);
  if (commandBytes.length === 0 || commandBytes.at(-1) !== 0)
    throw new Error('product argv absent');
  const argv = new TextDecoder('utf-8', { fatal: true })
    .decode(commandBytes.subarray(0, -1))
    .split('\0');
  if (argv.length === 0 || argv.length > 128 || argv.some((argument) => argument.length > 65536))
    throw new Error('product argv unsupported');
  const attributes = /^([0-9]+):([1-9][0-9]*):([1-9][0-9]*)\|([^\n|]+)\|([^\n|]+)$/.exec(metadata);
  const timestamp = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{9} [+-]\d{4}$/;
  // Proof: inner-executable: oversized executable metadata was decoded after omission; inner refuses executable failed.

  if (
    attributes === null ||
    Number(attributes[3]) > 128 * 1024 * 1024 ||
    !timestamp.test(attributes[4]) ||
    !timestamp.test(attributes[5]) ||
    !/^[a-f0-9]{64}$/.test(digest) ||
    !cwd.startsWith('/') ||
    cwd.endsWith(' (deleted)') ||
    !executablePath.startsWith('/') ||
    executablePath.endsWith(' (deleted)')
  )
    throw new Error('product executable receipt unsupported');
  const namespaces = { pid: pidns, net: netns, mnt: mntns };
  for (const [name, value] of Object.entries(namespaces))
    // Proof: inner-namespace: mnt:[] was decoded after omission; inner refuses namespace-syntax failed.
    if (!new RegExp(`^${name}:\\[[1-9][0-9]*\\]$`).test(value))
      throw new Error('product namespace receipt malformed');
  return {
    pid,
    start,
    uid,
    uids: tuple,
    argv,
    argvSha256: createHash('sha256').update(commandBytes).digest('hex'),
    cwd,
    executablePath,
    executable: { device: attributes[1], inode: attributes[2], sha256: digest },
    namespaces,
    sockets,
  };
}

/** Decodes both complete passes and joins each process namespace to PID1 and the observer; throws on incomplete receipts. */
export function decodePasses(
  frames: readonly (readonly string[])[],
  roster: readonly HostMember[],
): readonly InnerPass[] {
  const passes: InnerPass[] = [];
  let label: string | null = null;
  let processes: InnerProcess[] = [];
  let pending: string[] | null = null;
  let sockets: Record<string, number[]> = {};
  let tcp4: string | null = null;
  let tcp6: string | null = null;
  let addresses: string | null = null;
  let self: Namespaces | null = null;
  const flush = () => {
    if (label === null) return;
    if (
      pending !== null ||
      processes.length !== roster.length ||
      tcp4 === null ||
      tcp6 === null ||
      addresses === null ||
      self === null
    )
      throw new Error('product receipt pass incomplete');
    const root = processes.find((process) => process.pid === 1);
    if (
      root?.namespaces.pid !== self.pid ||
      root.namespaces.net !== self.net ||
      root.namespaces.mnt !== self.mnt
    )
      throw new Error('product observer namespace differs');
    // Proof: inner-pidns/netns/mntns predicate omissions each admitted the changed namespace; corresponding fast negatives failed.
    // Proof: omitting the roster mount join accepted a first application in mnt:[999]; the modeled first-observation negative failed with Missing expected rejection.
    if (
      processes.some(
        (process) =>
          process.namespaces.pid !== root.namespaces.pid ||
          process.namespaces.net !== root.namespaces.net ||
          process.namespaces.mnt !== root.namespaces.mnt,
      )
    )
      throw new Error('product process namespace differs');
    passes.push({ processes, tcp4, tcp6, addresses });
  };
  for (const frame of frames) {
    const [tag, ...fields] = frame;
    if (tag !== 'FD' && pending !== null) {
      processes.push(decodeInnerProcess(pending, sockets));
      pending = null;
    }
    if (tag === 'PASS') {
      if (
        fields.length !== 1 ||
        fields[0] !== (label === null ? 'before' : 'after') ||
        passes.length > 0
      )
        throw new Error('product receipt pass order malformed');
      flush();
      label = fields[0];
      processes = [];
      pending = null;
      sockets = {};
      tcp4 = null;
      tcp6 = null;
      addresses = null;
      self = null;
    } else if (tag === 'PROC') {
      if (label === null || pending !== null || processes.length >= roster.length)
        throw new Error('product process count malformed');
      pending = fields;
      sockets = {};
    } else if (tag === 'FD') {
      const [pid, descriptor, link] = fields;
      if (
        pending?.[0] !== pid ||
        !/^(0|[1-9][0-9]*)$/.test(descriptor) ||
        Number(descriptor) > 4096
      )
        throw new Error('product FD receipt malformed');
      const match = /^socket:\[([1-9][0-9]*)\]$/.exec(link);
      if (match !== null) {
        const inode = match[1];
        sockets[inode] ??= [];
        sockets[inode].push(Number(descriptor));
      }
    } else if (tag === 'SELF') {
      if (
        fields.length !== 3 ||
        fields.some((field) => !/^[a-z]+:\[[1-9][0-9]*\]$/.test(field)) ||
        self !== null
      )
        throw new Error('product observer namespace malformed');
      self = { pid: fields[0], net: fields[1], mnt: fields[2] };
    } else if (tag === 'TCP') {
      if (fields.length !== 2 || Buffer.byteLength(fields[1]) > 4 * 1024 * 1024)
        throw new Error('product TCP receipt bound exceeded');
      if (fields[0] === '4' && tcp4 === null) tcp4 = fields[1];
      else if (fields[0] === '6' && tcp6 === null) tcp6 = fields[1];
      else throw new Error('product TCP receipt duplicate');
    } else if (tag === 'ADDR') {
      if (fields.length !== 1 || addresses !== null || Buffer.byteLength(fields[0]) > 65536)
        throw new Error('product address receipt malformed');
      addresses = fields[0];
    } else throw new Error('product receipt frame malformed');
  }
  if (pending !== null) processes.push(decodeInnerProcess(pending, sockets));
  flush();
  if (passes.length !== 2) throw new Error('product receipt passes absent');
  return passes;
}

function decodeAddress(hex: string, family: 'ipv4' | 'ipv6'): string {
  if (family === 'ipv4') {
    if (!/^[A-F0-9]{8}$/.test(hex)) throw new Error('product IPv4 listener malformed');
    return Buffer.from(hex, 'hex').reverse().join('.');
  }
  if (!/^[A-F0-9]{32}$/.test(hex)) throw new Error('product IPv6 listener malformed');
  let network = '';
  for (let offset = 0; offset < 32; offset += 8)
    network += Buffer.from(hex.slice(offset, offset + 8), 'hex')
      .reverse()
      .toString('hex');
  const groups = network.match(/.{4}/g);
  if (groups === null) throw new Error('product IPv6 groups absent');
  const address = new URL(`http://[${groups.join(':')}]`).hostname.slice(1, -1);

  if (address.startsWith('::ffff:')) throw new Error('product IPv6 mapped listener unsupported');
  return address;
}

function decodeListeners(
  pass: InnerPass,
  port: number,
): readonly (ParticipantListener & { readonly owner: number })[] {
  const listeners: (ParticipantListener & { readonly owner: number })[] = [];
  const seen = new Set<string>();
  for (const [table, family] of [
    [pass.tcp4, 'ipv4'],
    [pass.tcp6, 'ipv6'],
  ] as const) {
    const lines = table.trim().split('\n');
    if (!lines[0]?.includes('local_address') || lines.length > 32769)
      throw new Error('product TCP table malformed');
    for (const line of lines.slice(1)) {
      const fields = line.trim().split(/\s+/);
      if (fields.length < 10) throw new Error('product TCP entry malformed');
      const endpoint = /^([A-F0-9]+):([A-F0-9]{4})$/.exec(fields[1] ?? '');
      const host = endpoint?.[1];
      const encodedPort = endpoint?.[2];
      const inode = fields[9];
      if (host === undefined || encodedPort === undefined)
        throw new Error('product TCP endpoint malformed');
      if (fields[3] !== '0A' || Number.parseInt(encodedPort, 16) !== port) continue;
      // Proof: listener-inode: a shared inode across IPv4/IPv6 was admitted after omission; listener refuses shared inode failed.
      if (!/^[1-9][0-9]*$/.test(inode) || seen.has(inode))
        throw new Error('product listener inode ambiguous');
      seen.add(inode);
      const owners = pass.processes.flatMap((process) =>
        (process.sockets[inode] ?? []).map((descriptor) => ({ pid: process.pid, descriptor })),
      );
      // Proof: listener-owner: duplicate FDs and shared process owners were admitted after omission; duplicate-fd/shared-owner negatives failed.
      if (owners.length !== 1) throw new Error('product listener owner absent or competing');
      listeners.push({
        family,
        address: decodeAddress(host, family),
        port,
        inode,
        descriptor: owners[0].descriptor,
        owner: owners[0].pid,
      });
    }
  }
  // Proof: listener-set: two distinct same-family listening sockets were admitted after omission; two independently owned sockets negative failed.
  if (
    listeners.length < 1 ||
    listeners.length > 2 ||
    new Set(listeners.map((listener) => listener.family)).size !== listeners.length
  )
    throw new Error('product listener set unsupported');
  return listeners.sort((left, right) => left.family.localeCompare(right.family));
}

function decodeLocalAddresses(text: string): readonly string[] {
  const addresses = new Set<string>();
  const lines = text.trim().split('\n');

  if (lines.length < 1 || lines.length > 256)
    throw new Error('product local address roster malformed');
  for (const line of lines) {
    const match = /\sinet6?\s([^\s/]+)\/([0-9]+)\s/.exec(line);
    if (match === null) throw new Error('product local address line malformed');
    const address = match[1];
    if (address.includes('%') || isIP(address) === 0 || address.toLowerCase().startsWith('::ffff:'))
      throw new Error('product local address unsupported');
    const canonical =
      isIP(address) === 4
        ? address
            .split('.')
            .map((part) => String(Number(part)))
            .join('.')
        : new URL(`http://[${address}]`).hostname.slice(1, -1);
    // Proof: local-address: expanded IPv6 was admitted after omission; address-noncanonical negative failed.
    if (canonical !== address.toLowerCase()) throw new Error('product local address noncanonical');
    addresses.add(canonical);
  }
  if (addresses.size === 0 || addresses.size > 64)
    throw new Error('product local addresses absent or oversized');
  return [...addresses].sort();
}

/** Reads a live process start tick from a bounded proc stat record; throws on unsupported state or identity. */
export function readStart(stat: string, pid: number): string {
  const closing = stat.lastIndexOf(') ');
  const fields = stat
    .slice(closing + 2)
    .trim()
    .split(/\s+/);
  const start = fields.at(19);
  // Proof: host-stat omission decoded another PID's stat record; host stat refuses pid missed its rejection.
  if (
    closing < 2 ||
    !stat.startsWith(`${String(pid)} (`) ||
    !['R', 'S', 'D', 'I'].includes(fields.at(0) ?? '') ||
    start === undefined ||
    !/^[1-9][0-9]*$/.test(start)
  )
    throw new Error('product process stat malformed');
  return start;
}

/** Requires an ordinary two-level host NSpid and exact four-member UID tuple; throws on unsupported mappings. */
export function decodeHostStatus(
  pid: number,
  status: string,
): Pick<HostMember, 'namespacePid' | 'uid' | 'uids'> {
  const uidLines = status.split('\n').filter((line) => line.startsWith('Uid:'));
  const pidLines = status.split('\n').filter((line) => line.startsWith('NSpid:'));
  const tgidLines = status.split('\n').filter((line) => line.startsWith('Tgid:'));
  const uid = uidLines.at(0)?.trim().split(/\s+/).slice(1);
  const hierarchy = pidLines.at(0)?.trim().split(/\s+/).slice(1);
  const tgid = tgidLines.at(0)?.trim().split(/\s+/).at(1);
  // Proof: host-status: wrong root/Tgid, truncated UID tuple and duplicate NSpid were decoded after omission; corresponding host negatives failed.
  if (
    uidLines.length !== 1 ||
    uid?.length !== 4 ||
    uid.some((field) => !/^[0-9]+$/.test(field)) ||
    pidLines.length !== 1 ||
    hierarchy?.length !== 2 ||
    hierarchy.at(0) !== String(pid) ||
    hierarchy.at(1) === undefined ||
    !/^[1-9][0-9]*$/.test(hierarchy[1]) ||
    tgidLines.length !== 1 ||
    tgid !== String(pid)
  )
    throw new Error('product host status unsupported');
  const effectiveUid = Number(uid[1]);
  const uidTuple = uid.map(Number);
  const namespacePid = Number(hierarchy[1]);
  // Proof: host-uid-range: UID 4294967296 was decoded after omission; host refuses uid-range failed.
  if (
    uidTuple.some((value) => !Number.isSafeInteger(value) || value < 0 || value > 4294967295) ||
    !Number.isSafeInteger(namespacePid)
  )
    throw new Error('product host mapping unsupported');
  return { namespacePid, uid: effectiveUid, uids: uidTuple };
}

/** Refuses changed UID, NSpid or Tgid fields across the actual host-read bracket. */
export function assertHostStatusReadback(status: string, finalStatus: string): void {
  for (const prefix of ['Uid:', 'NSpid:', 'Tgid:']) {
    const first = status.split('\n').filter((line) => line.startsWith(prefix));
    const last = finalStatus.split('\n').filter((line) => line.startsWith(prefix));
    // Proof: host-status-readback omission admitted changed Uid/NSpid/Tgid; all three readback negatives failed.
    assertSame(first, last, 'product host status readback');
  }
}

/** Requires the admitted unified-cgroup raw format and preserves its complete path. */
export function decodeHostCgroup(cgroupText: string): string {
  const cgroup = cgroupText.trim();
  // Proof: host-cgroup: a legacy controller cgroup was decoded after omission; malformed cgroup negative failed.
  if (!/^0::\/[A-Za-z0-9_./-]*$/.test(cgroup)) throw new Error('product host cgroup unsupported');
  return cgroup;
}

/** Refuses nonidentity user or group namespace mappings. */
export function assertHostMappings(uidMapText: string, gidMapText: string): void {
  const uidMap = uidMapText.trim();
  const gidMap = gidMapText.trim();
  // Proof: host-uid-map/gid-map: independently omitting each identity-map predicate admitted its changed mapping; both map negatives failed.
  if (!/^0\s+0\s+4294967295$/.test(uidMap) || !/^0\s+0\s+4294967295$/.test(gidMap))
    throw new Error('product user namespace mapping unsupported');
}

/** Joins the original start tick to either actual stat readback; throws on drift. */
export function assertHostStartReadback(
  start: string,
  stat: string,
  pid: number,
  final: boolean,
): void {
  // Proof: host-start-readback omission admitted changed start ticks at both brackets; final=false/true negatives failed.
  assertSame(
    start,
    readStart(stat, pid),
    final ? 'product host final PID readback' : 'product host PID readback',
  );
}

/** Joins exact unified-cgroup membership across the host readback. */
export function assertHostCgroupReadback(cgroup: string, finalCgroup: string): void {
  // Proof: host-cgroup-readback omission admitted changed membership; changed cgroup negative failed.
  assertSame(cgroup, finalCgroup.trim(), 'product host cgroup readback');
}

/** Refuses duplicate host/inner PIDs, wrong PID1 mapping and parents outside the observed roster. */
export function assertRoster(roster: readonly HostMember[], rootPid: number): void {
  // Proof: top-root-mapping/top-host-unique/top-inner-unique: each independent predicate omission admitted its corresponding malformed roster; root/duplicate-host/duplicate-inner negatives failed.
  if (
    new Set(roster.map((member) => member.pid)).size !== roster.length ||
    new Set(roster.map((member) => member.namespacePid)).size !== roster.length ||
    roster.filter((member) => member.pid === rootPid && member.namespacePid === 1).length !== 1
  )
    throw new Error('product top mapping unsupported');
  const memberIds = new Set(roster.map((member) => member.pid));
  // Proof: top-parent: an escaped PPID was admitted after omission; roster refuses parent failed.
  if (roster.some((member) => member.pid !== rootPid && !memberIds.has(member.parent)))
    throw new Error('product process parent escapes roster');
}

/** Joins decoded host and inner observations to the immutable launch and listener profile; returns evidence, never readiness authority. */
export function inspectInnerProfile(
  before: InnerPass,
  firstRoster: readonly HostMember[],
  role: 'backend' | 'gateway',
  nativeObservation: Readonly<Record<string, unknown>>,
) {
  const root = before.processes.find((process) => process.pid === 1);

  if (
    root === undefined ||
    firstRoster.length !== before.processes.length ||
    firstRoster.length > 3 ||
    firstRoster.length < 2
  )
    throw new Error('product fixed process roster unsupported');
  for (const host of firstRoster) {
    const inner = before.processes.find((process) => process.pid === host.namespacePid);
    // Proof: inner-start/effective-uid/uid-tuple/root-uid/cgroup: each independent join omission admitted its injected mismatch; corresponding inner negatives failed.
    if (
      inner?.start !== host.start ||
      inner.uid !== host.uid ||
      JSON.stringify(inner.uids) !== JSON.stringify(host.uids) ||
      host.uids.some((value) => value !== 0) ||
      host.cgroup !== firstRoster[0]?.cgroup
    )
      throw new Error('product host/inner process join differs');
  }
  const port = role === 'backend' ? 3100 : 3200;
  const owned = decodeListeners(before, port);
  const owners = new Set(owned.map((listener) => listener.owner));
  if (owners.size !== 1) throw new Error('product listeners have multiple applications');
  const applicationPid = owned[0]?.owner;
  const application = before.processes.find((process) => process.pid === applicationPid);
  const hostApplication = firstRoster.find((member) => member.namespacePid === applicationPid);
  if (application === undefined || hostApplication === undefined || applicationPid === 1)
    throw new Error('product listener application absent');
  const cwd = `/app/apps/wbs/${role === 'backend' ? 'be-01' : 'gw-01'}`;
  // Proof: independently omitting application-cwd/exe checks admitted changed cwd/helper; inner refuses cwd/helper failed.
  const isBun = (process: InnerProcess) =>
    process.executablePath === '/usr/local/bin/bun' &&
    process.cwd === cwd &&
    (process.argv[0] === 'bun' || process.argv[0] === '/usr/local/bin/bun');
  const isRun = (process: InnerProcess) =>
    isBun(process) &&
    process.argv.length === 3 &&
    process.argv[1] === 'run' &&
    process.argv[2] === 'src/main.ts';
  const isDirect = (process: InnerProcess) =>
    isBun(process) && process.argv.length === 2 && process.argv[1] === 'src/main.ts';
  const native = readFields(nativeObservation);
  const rawArguments: unknown = native['Args'];
  if (
    !Array.isArray(rawArguments) ||
    rawArguments.some((argument: unknown) => typeof argument !== 'string')
  )
    throw new Error('product fixed launch arguments unsupported');
  const nativeArguments = rawArguments.map((argument: unknown) => readString(argument));
  const initArguments = [root.executablePath, '--', readString(native['Path']), ...nativeArguments];
  // Proof: omitting the admitted Config.WorkingDir comparison admitted the changed PID1 cwd model; its first-observation negative failed with Missing expected rejection. Omitting exact argv separately admitted the init-argv negative.
  const initCwd = readString(readFields(nativeObservation['Config'])['WorkingDir']);
  if (
    !(isRun(application) || isDirect(application)) ||
    root.uid !== 0 ||
    root.cwd !== initCwd ||
    !['/sbin/docker-init', '/usr/bin/docker-init'].includes(root.executablePath) ||
    !root.argv.every((argument, index) => argument === initArguments[index]) ||
    root.argv.length !== initArguments.length
  )
    throw new Error('product fixed launch profile unsupported');
  const others = before.processes.filter(
    (process) => process.pid !== 1 && process.pid !== application.pid,
  );
  // Proof: wrapper: a helper executable was admitted after omission; unsupported wrapper negative failed.

  if (others.length > 1 || others.some((process) => !isRun(process)))
    throw new Error('product wrapper profile unsupported');
  const localAddresses = decodeLocalAddresses(before.addresses);
  for (const listener of owned) {
    const addressFamily = listener.family === 'ipv4' ? 4 : 6;
    // Proof: listener-local: 127.0.0.2 without an observed local address was admitted after omission; nonlocal negative failed.
    if (
      listener.address !== '0.0.0.0' &&
      listener.address !== '::' &&
      (!localAddresses.includes(listener.address) || isIP(listener.address) !== addressFamily)
    )
      throw new Error('product listener address not local');
    // Proof: listener-family: IPv4 wildcard with only IPv6 local addresses was admitted after omission; missing-family negative failed.
    if (!localAddresses.some((address) => isIP(address) === addressFamily))
      throw new Error('product listener has no local family address');
  }
  return { application, hostApplication, owned, localAddresses };
}

/** Adds actual bounded emitted token bytes, including their NUL frame boundary. */
export function updateReceiptHash(hash: Hash, token: string): void {
  // Proof: receipt-content session/DONE-only substitution failed the independent NUL-framed digest and changed accepted proc-content negative.
  hash.update(token).update('\0');
}
