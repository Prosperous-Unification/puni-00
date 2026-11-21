import { deepStrictEqual, ok, rejects } from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { constants, writeSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { isIPv4 } from 'node:net';
import * as os from 'node:os';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  openRegistryPressureSource,
  type RegistryPressureSource,
} from './registry-pressure-source';
import type {
  RegistryStatusEnrollment,
  RegistryStatusReply,
} from './registry-pressure-source-contract';

interface NativeArguments {
  readonly sshd: string;
  readonly listen: string;
  readonly source: string;
}

interface ToolProfile {
  readonly packageVersion: string;
  readonly sourceUrl: string;
  readonly archiveSha256: string;
  readonly executableSha256: string;
  readonly version: string;
}

const cleanEnv = { HOME: '/', LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin' };
const profilePath = fileURLToPath(
  new URL('./registry-pressure-source-tools.json', import.meta.url),
);

function exactFields<Key extends string>(
  input: unknown,
  fields: readonly Key[],
): input is Record<Key, unknown> {
  // Proof: Allowing extra keys broke the unknown argument and trusted-profile field tests.
  return (
    typeof input === 'object' &&
    input !== null &&
    Reflect.ownKeys(input).length === fields.length &&
    fields.every((field) => Object.hasOwn(input, field))
  );
}

function canonicalPath(path: unknown): path is string {
  // Proof: Removing the absolute or dot-segment check broke the matching native argument test.
  return (
    typeof path === 'string' &&
    path.startsWith('/') &&
    path
      .slice(1)
      .split('/')
      .every(
        (segment) =>
          segment.length > 0 &&
          !/[^A-Za-z0-9._-]/.test(segment) &&
          segment !== '.' &&
          segment !== '..',
      )
  );
}

function privateAddress(address: unknown): address is string {
  // Proof: Dropping canonical IPv4 or the private prefix check broke its address refusals.
  return (
    typeof address === 'string' &&
    isIPv4(address) &&
    /^(?:10\.|172\.(?:1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(address)
  );
}

function parseArguments(input: unknown): NativeArguments {
  if (
    !exactFields(input, ['sshd', 'listen', 'source']) ||
    !canonicalPath(input.sshd) ||
    !privateAddress(input.listen) ||
    !privateAddress(input.source)
  )
    throw new Error('invalid registry status native arguments');
  return { sshd: input.sshd, listen: input.listen, source: input.source };
}

function failureCode(cause: unknown): string | undefined {
  if (cause instanceof Error && 'code' in cause && typeof cause.code === 'string')
    return cause.code;
  return undefined;
}

/** Reads one regular file without following its final symlink or growing past the declared limit. */
async function readBounded(path: string, limit: number, label: string): Promise<Buffer> {
  // Proof: Removing no-follow admitted the symlink. Removing nonblocking hung on a real FIFO until the test watchdog.
  const file = await fs
    .open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    .catch((cause: unknown) => {
      const code = failureCode(cause);
      // Proof: Omitting either classification broke the missing or unreadable executable test.
      if (code === 'ENOENT') throw new Error(`${label} is missing`);
      if (code === 'ELOOP') throw new Error(`${label} is not a readable regular file`);
      throw new Error(`${label} is unreadable`);
    });
  try {
    const stat = await file.stat();
    // Proof: Removing either check broke the directory or oversized executable refusal.
    if (!stat.isFile()) throw new Error(`${label} is not a readable regular file`);
    if (stat.size > limit) throw new Error(`${label} exceeds its bound`);
    const bytes = Buffer.alloc(stat.size + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset !== stat.size) throw new Error(`${label} changed during admission`);
    return bytes.subarray(0, offset);
  } finally {
    await file.close();
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Loads the exact checked-in extraction profile.
 * Prepare the tool using apt-get download openssh-server=<packageVersion>, verify archiveSha256,
 * and run dpkg-deb --extract into an owned private staging directory. The harness never downloads.
 */
async function readProfile(): Promise<ToolProfile> {
  const bytes = await readBounded(profilePath, 4096, 'native tool profile');
  let profile: unknown;
  // Proof: Dropping the malformed-profile diagnostic broke the malformed trusted JSON test.
  try {
    profile = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new Error('invalid native tool profile');
  }
  const hex = /^[a-f0-9]{64}$/;
  if (
    !exactFields(profile, [
      'packageVersion',
      'sourceUrl',
      'archiveSha256',
      'executableSha256',
      'version',
    ]) ||
    typeof profile.packageVersion !== 'string' ||
    profile.packageVersion.length === 0 ||
    typeof profile.sourceUrl !== 'string' ||
    !/^https?:\/\/[^\s]+\.deb$/.test(profile.sourceUrl) ||
    typeof profile.archiveSha256 !== 'string' ||
    !hex.test(profile.archiveSha256) ||
    typeof profile.executableSha256 !== 'string' ||
    !hex.test(profile.executableSha256) ||
    typeof profile.version !== 'string' ||
    !/^[ -~]+$/.test(profile.version)
  )
    throw new Error('invalid native tool profile');
  return {
    packageVersion: profile.packageVersion,
    sourceUrl: profile.sourceUrl,
    archiveSha256: profile.archiveSha256,
    executableSha256: profile.executableSha256,
    version: profile.version,
  };
}

/** Only a byte-exact extracted binary runs the bounded version probe. */
async function verifyTool(sshd: string): Promise<void> {
  const profile = await readProfile();
  const bytes = await readBounded(sshd, 2 * 1024 * 1024, 'native sshd');
  // Proof: Removing the digest comparison broke the wrong-bytes test before version admission.
  if (sha256(bytes) !== profile.executableSha256) throw new Error('native sshd hash differs');
  const version = Bun.spawnSync([sshd, '-V'], {
    cwd: '/',
    env: cleanEnv,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 2000,
    maxBuffer: 1024,
  });
  // Proof: Removing the comparison broke the exact-version test. A changed profile pin refused the real tool.
  if (
    !version.success ||
    version.stdout.length !== 0 ||
    version.stderr.toString() !== profile.version + '\n'
  )
    throw new Error('native sshd version differs');
}

/** Uses the effective account home and checks each component without following symlinks or chmod. */
async function admitHome(account: os.UserInfo<string>): Promise<void> {
  // Proof: Removing UID zero refusal broke the root-account admission test.
  if (account.uid <= 0 || !canonicalPath(account.homedir))
    throw new Error('native fixture requires a non-root account with a canonical home');
  for (let path = account.homedir; ; path = dirname(path)) {
    const stat = await fs.lstat(path);
    const owner = path === account.homedir ? account.uid : 0;
    // Proof: Dropping type, ownership or write-mode admission broke the corresponding home tests.
    if (
      !stat.isDirectory() ||
      (stat.uid !== account.uid && stat.uid !== owner) ||
      (stat.mode & 0o022) !== 0
    )
      throw new Error('unsafe native fixture home ancestry');
    if (path === '/') break;
  }
}

/** Admits the exact native arguments, pinned sshd and safe account home without starting a server. */
export async function validateRegistrySourceNative(input: unknown): Promise<void> {
  const { sshd } = parseArguments(input);
  await verifyTool(sshd);
  await admitHome(os.userInfo());
}

const frame = Buffer.from('{"fixture":"résumé","sequence":1}\r\n');
const unavailable = {
  state: 'unavailable',
  reason: 'source-command-failed',
  code: 'ssh-exit',
} as const;
const deadlineReply = { state: 'unavailable', reason: 'source-timeout', code: 'deadline' } as const;
const abortReply = {
  state: 'cancelled',
  name: 'AbortError',
  message: 'registry status read cancelled',
} as const;
const received = { state: 'received', bytes: new Uint8Array(frame) } as const;

type ObservedReply =
  | RegistryStatusReply
  | { readonly state: 'cancelled'; readonly name: string; readonly message: string };

interface NativeCase {
  readonly name: string;
  readonly mode: 'frame' | 'refuse' | 'prefix' | 'stdout' | 'stderr' | 'hold' | 'expire';
  readonly reply: ObservedReply;
  readonly output: readonly [stdout: number, stderr: number];
  readonly host?: 'wrong';
  readonly client?: 'wrong';
  readonly dispatcherExit?: number;
  readonly interrupt?: 'abort' | 'busy';
}

const cases: readonly NativeCase[] = [
  { name: 'exact-frame', mode: 'frame', reply: received, output: [37, 0], dispatcherExit: 0 },
  { name: 'wrong-client-key', mode: 'frame', reply: unavailable, output: [0, 0], client: 'wrong' },
  { name: 'wrong-host-key', mode: 'frame', reply: unavailable, output: [0, 0], host: 'wrong' },
  {
    name: 'wrong-verb',
    mode: 'refuse',
    reply: { state: 'unavailable', reason: 'source-refused', code: 'refused' },
    output: [0, 0],
    dispatcherExit: 77,
  },
  {
    name: 'valid-prefix-exit-1',
    mode: 'prefix',
    reply: unavailable,
    output: [37, 0],
    dispatcherExit: 1,
  },
  {
    name: 'stdout-overflow',
    mode: 'stdout',
    reply: { state: 'invalid-status', code: 'status-too-large' },
    output: [65538, 0],
    dispatcherExit: 0,
  },
  {
    name: 'stderr-overflow',
    mode: 'stderr',
    reply: { state: 'unavailable', reason: 'source-command-failed', code: 'stderr-too-large' },
    output: [0, 4097],
    dispatcherExit: 0,
  },
  {
    name: 'absolute-timeout',
    mode: 'expire',
    reply: deadlineReply,
    output: [1, 0],
    dispatcherExit: 124,
  },
  {
    name: 'mid-read-abort',
    mode: 'hold',
    reply: abortReply,
    output: [1, 0],
    dispatcherExit: 0,
    interrupt: 'abort',
  },
  {
    name: 'concurrent-read-and-close',
    mode: 'hold',
    reply: abortReply,
    output: [1, 0],
    dispatcherExit: 0,
    interrupt: 'busy',
  },
  { name: 'repeat-1', mode: 'frame', reply: received, output: [37, 0], dispatcherExit: 0 },
  { name: 'repeat-2', mode: 'frame', reply: received, output: [37, 0], dispatcherExit: 0 },
];

type OwnedServer = ReturnType<typeof startServer>;

const serverBudget = 6500;
const commandSeconds = 5;
const killAfterSeconds = 1;
const fixtureShell = `#!/bin/bash
set -euo pipefail
umask 077
fixture=$1
verb=$2
IFS= read -r mode < "$fixture/mode"
printf '%s\\n' "$PPID" > "$fixture/supervisor"
printf '%s\\n' "$$" > "$fixture/started"
trap 'printf "%s\\n" "$?" > "$fixture/ended"' EXIT
trap 'exit 124' TERM
expected=registry-pressure-status-v1
if [ "$mode" = refuse ]; then expected=fixture-wrong-verb; fi
if [ "$verb" != "$expected" ]; then exit 77; fi
exec 3>&1 4>&2
send() {
  local wire=$1 marker=$2 counter fifo="$fixture/witness"
  shift 2
  /usr/bin/mkfifo "$fifo"
  /usr/bin/wc -c < "$fifo" > "$fixture/$marker" &
  counter=$!
  "$@" | /usr/bin/tee "$fifo" >&"$wire"
  wait "$counter"
  /usr/bin/rm -- "$fifo"
}
case "$mode" in
  frame) send 3 written_stdout /usr/bin/cat "$fixture/frame" ;;
  prefix) send 3 written_stdout /usr/bin/cat "$fixture/frame"; exit 1 ;;
  stdout) send 3 written_stdout /usr/bin/head -c 65538 /dev/zero ;;
  stderr) send 4 written_stderr /usr/bin/head -c 4097 /dev/zero ;;
  hold|expire)
    send 3 written_stdout printf '{'
    printf '%s\\n' "$$" > "$fixture/partial"
    if [ "$mode" = expire ]; then
      # Proof: Without this redirection the remote shell disappeared at timeout without its exit marker.
      exec 2>/dev/null
      /usr/bin/sleep 8
    else
      /usr/bin/sleep 3
    fi
    ;;
  *) exit 78 ;;
esac
`;

function checkAddresses(args: NativeArguments): void {
  const interfaces = Object.values(os.networkInterfaces()).flatMap((addresses) => addresses ?? []);
  // Proof: Omitting source ownership let an unassigned address reach the real SSH exchange.
  for (const address of [args.listen, args.source]) {
    ok(
      interfaces.some(
        (iface) => iface.family === 'IPv4' && !iface.internal && iface.address === address,
      ),
      'native listen and source must belong to local private IPv4 interfaces',
    );
  }
}

/** Keeps the verifier's own waits finite even when the reader or a probe never settles. */
async function before<Value>(
  work: Promise<Value>,
  deadline: number,
  label: string,
): Promise<Value> {
  const expired = new Error(label + ' did not settle within its bound');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const watchdog = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => {
          reject(expired);
        },
        Math.max(0, deadline - performance.now()),
      );
    });
    const value = await Promise.race([work, watchdog]);
    if (performance.now() >= deadline) throw expired;
    return value;
  } finally {
    clearTimeout(timer);
  }
}

async function poll<Value>(
  inspect: () => Value | undefined | Promise<Value | undefined>,
  deadline: number,
  label: string,
): Promise<Value> {
  while (performance.now() < deadline) {
    const observed = await before(Promise.resolve(inspect()), deadline, label);
    if (observed !== undefined) return observed;
    await Bun.sleep(10);
  }
  throw new Error(label + ' did not settle within its bound');
}

class FixtureFailure extends Error {
  constructor(readonly failures: readonly string[]) {
    super(failures.join(' | '));
  }
}

function describeFailure(cause: unknown): string {
  if (!(cause instanceof Error)) return 'unexpected native fixture failure';
  return cause.message.split('\n', 1).join('').slice(0, 384);
}

/** Preserves the first failed stage and every later bounded teardown diagnostic. */
async function attempt<Value>(
  failures: string[],
  work: () => Promise<Value>,
): Promise<Value | undefined> {
  try {
    return await work();
  } catch (cause) {
    if (cause instanceof FixtureFailure) failures.push(...cause.failures);
    else failures.push(describeFailure(cause));
    return undefined;
  }
}

interface NativeFixture {
  readonly directory: string;
  readonly uid: number;
  readonly dev: number;
  readonly ino: number;
}

/**
 * Admits the freshly generated fixture before credentials are written.
 * A rejected fixture is released only when its unchanged ownership and emptiness can be established.
 */
export async function createNativeFixture(homedir: string, uid: number): Promise<NativeFixture> {
  const directory = await fs.mkdtemp(homedir + '/.puni-registry-native-');
  const retained = 'native fixture retained at ' + directory;
  const failures: string[] = [];
  const identity = await attempt(failures, () =>
    before(fs.lstat(directory), performance.now() + 500, 'native fixture admission identity'),
  );
  // Proof: Omitting the retained path broke the injected unreadable-identity test.
  if (identity === undefined) throw new FixtureFailure([...failures, retained]);

  const owned = identity.isDirectory() && identity.uid === uid;
  const fixture = { directory, uid, dev: identity.dev, ino: identity.ino };
  // Proof: Removing mode or owner admission broke its actual generated-directory test.
  if (owned && (identity.mode & 0o7777) === 0o700) return fixture;

  const refusal = 'native fixture directory is not private and owned';
  // Proof: Omitting retention reporting broke the generated-owner refusal test.
  if (!owned) throw new FixtureFailure([refusal, retained]);
  const removed = await attempt(failures, async () => {
    const deadline = performance.now() + 500;
    // Proof: Without this recheck an empty replacement was treated as the rejected directory.
    await before(requireFixtureIdentity(fixture), deadline, 'rejected native fixture identity');
    // Proof: Omitting rmdir leaked mode 000. Recursive removal broke the nonempty refusal.
    await before(fs.rmdir(directory), deadline, 'rejected native fixture removal');
    return true;
  });
  if (removed === true) throw new Error(refusal);
  // Proof: Omitting the initiating error broke the nonempty fixture diagnostic test.
  throw new FixtureFailure([refusal, ...failures, retained]);
}

async function requireFixtureIdentity(fixture: NativeFixture): Promise<void> {
  const current = await fs.lstat(fixture.directory);
  // Proof: Removing inode equality let the real replacement be deleted and broke the cleanup test.
  ok(
    current.isDirectory() &&
      current.uid === fixture.uid &&
      current.dev === fixture.dev &&
      current.ino === fixture.ino,
    'native fixture directory identity changed',
  );
}

/** Deletes only the original fixture after its work has been independently settled. */
export async function removeNativeFixture(fixture: NativeFixture): Promise<void> {
  await requireFixtureIdentity(fixture);
  await fs.rm(fixture.directory, { recursive: true });
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await fs.readFile(path, 'utf8');
  } catch (cause) {
    if (failureCode(cause) !== 'ENOENT') throw cause;
    return undefined;
  }
}

/** Linux children observed independently of promises from the reader and daemon. */
async function childPids(pid: number): Promise<number[]> {
  const children = await readOptional(`/proc/${String(pid)}/task/${String(pid)}/children`);
  if (children === undefined) {
    ok(!(await exists(`/proc/${String(pid)}`)), 'live native process has no observable child list');
    return [];
  }
  const pids = children.trim().split(/\s+/).filter(Boolean).map(Number);
  ok(
    pids.every((child) => Number.isSafeInteger(child) && child > 1),
    'invalid native process child list',
  );
  return pids;
}

interface OwnedWork {
  readonly processes: Set<number>;
  readonly groups: Set<number>;
}

async function trackChildren(pid: number, seen: Set<number>): Promise<void> {
  for (const child of await childPids(pid)) {
    seen.add(child);
    await trackChildren(child, seen);
  }
}

async function trackWork(directory: string, server: OwnedServer, owned: OwnedWork): Promise<void> {
  for (const child of await childPids(process.pid)) {
    if (child === server.pid) continue;
    owned.processes.add(child);
    // The fixed reader launches ssh in a process group whose ID equals its child PID.
    owned.groups.add(child);
    await trackChildren(child, owned.processes);
  }
  await trackChildren(server.pid, owned.processes);
  const dispatcher = await readMarker(directory + '/started');
  const supervisor = await readMarker(directory + '/supervisor');
  if (dispatcher !== undefined) {
    ok(
      dispatcher > 1 && supervisor !== undefined,
      'native fixture dispatcher has no supervisor witness',
    );
    owned.processes.add(dispatcher);
  }
  if (supervisor !== undefined) {
    // The fixture's timeout is a separate group leader. Check for descendants after reparenting.
    owned.processes.add(supervisor);
    owned.groups.add(supervisor);
  }
}

function groupExists(group: number): boolean {
  ok(Number.isSafeInteger(group) && group > 1, 'invalid native fixture process group');
  try {
    process.kill(-group, 0);
    return true;
  } catch (cause) {
    if (failureCode(cause) !== 'ESRCH') throw cause;
    return false;
  }
}

async function workSettled(
  directory: string,
  server: OwnedServer,
  owned: OwnedWork,
): Promise<true | undefined> {
  await trackWork(directory, server, owned);
  for (const pid of owned.processes) {
    if (await exists(`/proc/${String(pid)}`)) return undefined;
  }
  for (const group of owned.groups) {
    if (groupExists(group)) return undefined;
  }
  return true;
}

async function exists(path: string): Promise<boolean> {
  try {
    await fs.lstat(path);
    return true;
  } catch (cause) {
    if (failureCode(cause) !== 'ENOENT') throw cause;
    return false;
  }
}

async function readMarker(path: string): Promise<number | undefined> {
  const mark = await readOptional(path);
  if (mark === undefined || mark.length === 0) return undefined;
  ok(/^(?:0|[1-9][0-9]{0,9})\n$/.test(mark), 'invalid native dispatcher process marker');
  return Number(mark.trim());
}

/** Chooses an ephemeral port on only the admitted address. sshd must independently prove ownership. */
function reservePort(address: string): number {
  const socket = Bun.listen({
    hostname: address,
    port: 0,
    socket: {
      data() {
        throw new Error('unexpected connection to native port reservation');
      },
    },
  });
  try {
    return socket.port;
  } finally {
    socket.stop(true);
  }
}

async function hasListener(pid: number, address: string, port: number): Promise<boolean> {
  const ipHex = Buffer.from(address.split('.').map(Number).reverse()).toString('hex').toUpperCase();
  const socket = ipHex + ':' + port.toString(16).toUpperCase().padStart(4, '0');
  const tcp = await fs.readFile('/proc/net/tcp', 'ascii');
  const entry = tcp
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .find((fields) => fields[1] === socket && fields[3] === '0A');
  const inode = entry?.[9];
  if (inode === undefined) return false;
  const descriptors = await fs.readdir(`/proc/${String(pid)}/fd`);
  for (const fd of descriptors) {
    try {
      if ((await fs.readlink(`/proc/${String(pid)}/fd/${fd}`)) === `socket:[${inode}]`) return true;
    } catch (cause) {
      if (failureCode(cause) !== 'ENOENT') throw cause;
    }
  }
  return false;
}

async function generateKey(directory: string, name: string) {
  const path = directory + '/' + name;
  const keygen = Bun.spawnSync(
    ['/usr/bin/ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-C', 'fixture', '-f', path],
    {
      cwd: directory,
      env: { ...cleanEnv, HOME: directory },
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'ignore',
      timeout: 2000,
    },
  );
  ok(keygen.success, 'native fixture key generation failed');
  const raw = await before(
    readBounded(path + '.pub', 512, 'native fixture public key'),
    performance.now() + 500,
    'native key inspection',
  );
  const parts = raw.toString().trimEnd().split(' ');
  const algorithm = parts.at(0);
  const wire = parts.at(1);
  ok(
    algorithm === 'ssh-ed25519' && wire !== undefined && /^[A-Za-z0-9+/]{68}$/.test(wire),
    'native fixture did not generate an Ed25519 public key',
  );
  const publicKey = `${algorithm} ${wire}`;
  return { path, publicKey };
}

function startServer(sshd: string, directory: string) {
  return Bun.spawn([sshd, '-D', '-e', '-f', directory + '/sshd_config'], {
    cwd: directory,
    env: { ...cleanEnv, HOME: directory },
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore',
  });
}

/** Bounds fixture command lifetime independently of the production SSH client's cleanup. */
async function configureServer(
  directory: string,
  args: NativeArguments,
  port: number,
  user: string,
  host: string,
  client: string,
): Promise<void> {
  // Proof: Making authorized_keys world-writable caused real SSH to refuse the exact-frame case.
  const options = [
    'AddressFamily inet',
    `ListenAddress ${args.listen}:${String(port)}`,
    `Port ${String(port)}`,
    `HostKey ${host}`,
    `PidFile ${directory}/sshd.pid`,
    'HostKeyAlgorithms ssh-ed25519',
    `AllowUsers ${user}`,
    `AuthorizedKeysFile ${directory}/authorized_keys`,
    'AuthorizedKeysCommand none',
    'StrictModes yes',
    'UsePAM no',
    'PasswordAuthentication no',
    'KbdInteractiveAuthentication no',
    'HostbasedAuthentication no',
    'GSSAPIAuthentication no',
    'PermitEmptyPasswords no',
    'PermitRootLogin no',
    'AuthenticationMethods publickey',
    'PubkeyAuthentication yes',
    'PubkeyAcceptedAlgorithms ssh-ed25519',
    'PermitTTY no',
    'PermitUserRC no',
    'PermitUserEnvironment no',
    'DisableForwarding yes',
    'PermitTunnel no',
    'PrintMotd no',
    'PrintLastLog no',
    'MaxAuthTries 1',
    'MaxSessions 1',
    'MaxStartups 1',
    'LoginGraceTime 2',
    'ClientAliveInterval 1',
    'ClientAliveCountMax 2',
    `SetEnv HOME=${directory}`,
    // Proof: Shortening the real timeout to two seconds broke the independent settlement-window check.
    `ForceCommand exec /usr/bin/env -i LANG=C LC_ALL=C HOME=${directory} /usr/bin/timeout --kill-after=${String(killAfterSeconds)}s ${String(commandSeconds)}s /bin/bash --noprofile --norc ${directory}/dispatch ${directory} "$SSH_ORIGINAL_COMMAND"`,
  ];
  const files = [
    ['sshd_config', options.join('\n') + '\n'],
    // Proof: With the listen IP supplied as source, removing from= admitted a real connection.
    ['authorized_keys', `restrict,from="${args.source}" ${client}\n`],
    ['dispatch', fixtureShell],
    ['frame', frame],
  ] as const;
  for (const [name, bytes] of files) {
    await fs.writeFile(directory + '/' + name, bytes, { mode: 0o600, flag: 'wx' });
  }
}

async function settleDispatcher(
  directory: string,
  server: OwnedServer,
  owned: OwnedWork,
  deadline: number,
  entered: boolean,
) {
  return await poll(
    async () => {
      if (!(await workSettled(directory, server, owned))) return undefined;
      const pid = await readMarker(directory + '/started');
      if (pid === undefined && entered) return undefined;
      const exit = await readMarker(directory + '/ended');
      if (pid !== undefined && exit === undefined) return undefined;
      const stdout = await readMarker(directory + '/written_stdout');
      const stderr = await readMarker(directory + '/written_stderr');
      return { exit, stdout, stderr };
    },
    deadline,
    'native fixture command and server children',
  );
}

async function clearExchange(directory: string): Promise<void> {
  for (const name of [
    'started',
    'supervisor',
    'ended',
    'partial',
    'mode',
    'written_stdout',
    'written_stderr',
  ]) {
    await fs.unlink(directory + '/' + name).catch((cause: unknown) => {
      if (failureCode(cause) !== 'ENOENT' || name === 'mode') throw cause;
    });
  }
}

async function observeReply(work: Promise<RegistryStatusReply>): Promise<ObservedReply> {
  try {
    return await work;
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError')
      return { state: 'cancelled', name: cause.name, message: cause.message };
    throw cause;
  }
}

async function qualifyCase(
  directory: string,
  server: OwnedServer,
  actor: RegistryPressureSource,
  fixtureCase: NativeCase,
  owned: OwnedWork,
) {
  await before(
    fs.writeFile(directory + '/mode', fixtureCase.mode + '\n', { flag: 'wx', mode: 0o600 }),
    performance.now() + 500,
    fixtureCase.name + ' native case setup',
  );
  const controller = new AbortController();
  const started = performance.now();
  const pending = fixtureCase.mode === 'hold' || fixtureCase.mode === 'expire';
  const budget = pending ? 2500 : 5000;
  const deadline = started + budget;
  const work = observeReply(actor.read(controller.signal, deadline));
  let completed: PromiseSettledResult<ObservedReply> | undefined;
  // Proof: The stalled real read adapter exercised both the original deadline and independent cleanup watchdog.
  const exchange = work.then(
    (value) => {
      completed = { status: 'fulfilled', value };
    },
    (reason: unknown) => {
      completed = { status: 'rejected', reason };
    },
  );
  const failures: string[] = [];
  let sshPid: number | undefined;
  const reply = await attempt(failures, async () => {
    if (pending) {
      await poll(
        async () => {
          await trackWork(directory, server, owned);
          return await readMarker(directory + '/partial');
        },
        started + 1200,
        'native partial frame',
      );
      const children = (
        await before(childPids(process.pid), deadline, 'native client observation')
      ).filter((pid) => pid !== server.pid);
      deepStrictEqual(children.length, 1, 'expected one real SSH client during the pending read');
      sshPid = children.at(0);
      ok(
        sshPid !== undefined &&
          (await before(
            fs.readlink(`/proc/${String(sshPid)}/exe`),
            deadline,
            'native client identity',
          )) === '/usr/bin/ssh',
        'pending reader did not own the expected /usr/bin/ssh child',
      );
    }
    if (fixtureCase.interrupt === 'busy') {
      await before(
        rejects(actor.read(controller.signal, deadline), /registry status source is busy/),
        deadline,
        'native overlapping read',
      );
      await before(
        rejects(actor.close(), /registry status source is busy/),
        deadline,
        'native overlapping close',
      );
    }
    if (fixtureCase.interrupt !== undefined) controller.abort('synthetic unsurfaced cancellation');
    const receipt = await poll(
      async () => {
        await trackWork(directory, server, owned);
        return completed;
      },
      deadline,
      'native reader',
    );
    if (receipt.status === 'rejected') throw receipt.reason;
    const observed = receipt.value;
    const elapsed = Math.ceil(performance.now() - started);
    ok(elapsed <= budget, 'native reader exceeded its original deadline');
    if (fixtureCase.name === 'absolute-timeout')
      ok(elapsed >= 1450, 'reader timed out before acquisition cutoff');
    deepStrictEqual(observed, fixtureCase.reply, 'reply mismatch');
    if (observed.state === 'received')
      deepStrictEqual(observed.bytes.length, fixtureCase.output[0]);
    if (sshPid !== undefined)
      ok(
        !(await before(
          exists(`/proc/${String(sshPid)}`),
          deadline,
          'native client reap observation',
        )),
        'owned SSH child remained after reader return',
      );
    deepStrictEqual(
      await before(childPids(process.pid), deadline, 'native child settlement'),
      [server.pid],
      'reader left a local child',
    );
    return { observed, elapsed };
  });
  controller.abort();
  if (completed === undefined) {
    await attempt(failures, () => before(exchange, performance.now() + 250, 'native read cleanup'));
  }
  // Proof: A wrong reply and an omitted exit marker produced both case diagnostics.
  const remote = await attempt(failures, () =>
    settleDispatcher(
      directory,
      server,
      owned,
      started + serverBudget,
      fixtureCase.dispatcherExit !== undefined,
    ),
  );
  if (failures.length > 0)
    throw new FixtureFailure(failures.map((message) => fixtureCase.name + ': ' + message));
  ok(reply !== undefined && remote !== undefined, 'native case receipt unavailable');
  const { observed, elapsed } = reply;
  deepStrictEqual(remote.exit, fixtureCase.dispatcherExit, fixtureCase.name + ' fixture exit');
  const stdout = remote.stdout ?? 0;
  const stderr = remote.stderr ?? 0;
  // Proof: Omitted and shortened writes still exited 1 but failed the checked count.
  deepStrictEqual([stdout, stderr], fixtureCase.output, fixtureCase.name + ' fixture write count');
  const serverElapsed = Math.ceil(performance.now() - started);
  if (fixtureCase.mode === 'expire')
    ok(serverElapsed >= commandSeconds * 1000, 'native fixture timeout settled prematurely');
  await before(clearExchange(directory), performance.now() + 500, 'native exchange marker cleanup');
  owned.processes.clear();
  owned.groups.clear();
  return {
    name: fixtureCase.name,
    reply: observed.state === 'received' ? { state: 'received' } : observed,
    fixtureStdoutBytes: stdout,
    fixtureStderrBytes: stderr,
    receivedBytes: observed.state === 'received' ? observed.bytes.length : null,
    elapsedMs: elapsed,
    originalBudgetMs: budget,
    localClientReaped: true,
    observedInFlightClient: sshPid !== undefined,
    dispatcherExit: remote.exit ?? null,
    serverChildrenSettled: true,
    serverSettlementMs: serverElapsed,
  };
}

async function useActor(actor: RegistryPressureSource, run: () => Promise<void>): Promise<void> {
  const failures: string[] = [];
  await attempt(failures, run);
  // Proof: Suppressing the actual actor close completion reached this finite failure.
  await attempt(failures, () =>
    before(actor.close(), performance.now() + 750, 'native actor close'),
  );
  if (failures.length > 0) throw new FixtureFailure(failures);
}

async function stopServer(server: OwnedServer): Promise<number> {
  if (server.exitCode === null && server.signalCode === null) server.kill('SIGTERM');
  try {
    return await before(server.exited, performance.now() + 1500, 'native sshd parent');
  } catch (cause) {
    if (server.exitCode === null && server.signalCode === null) server.kill('SIGKILL');
    const failures = [describeFailure(cause)];
    await attempt(failures, () =>
      before(server.exited, performance.now() + 750, 'native sshd forced reap'),
    );
    throw new FixtureFailure(failures);
  }
}

/** Qualifies the fixed production actor over one owned temporary sshd and cleans the entire fixture. */
export async function rehearseRegistryPressureSource(input: unknown) {
  const args = parseArguments(input);
  await before(validateRegistrySourceNative(args), performance.now() + 5000, 'native admission');
  checkAddresses(args);
  const { homedir, username, uid } = os.userInfo();
  ok(
    /^[a-z_][a-z0-9_-]{0,31}$/.test(username) && username !== 'root',
    'native account is not an admitted principal',
  );
  const fixture = await before(
    createNativeFixture(homedir, uid),
    performance.now() + 2000,
    'native fixture creation',
  );
  const { directory } = fixture;
  let server: OwnedServer | undefined;
  let serverExit: number | undefined;
  let port: number | undefined;
  const receipts: Awaited<ReturnType<typeof qualifyCase>>[] = [];
  const owned: OwnedWork = { processes: new Set(), groups: new Set() };
  const failures: string[] = [];
  await attempt(failures, async () => {
    const host = await generateKey(directory, 'host');
    const wrongHost = await generateKey(directory, 'other-host');
    const client = await generateKey(directory, 'client');
    const wrongClient = await generateKey(directory, 'other-client');
    const listenPort = reservePort(args.listen);
    port = listenPort;
    await before(
      configureServer(directory, args, listenPort, username, host.path, client.publicKey),
      performance.now() + 1000,
      'native server configuration',
    );
    server = startServer(args.sshd, directory);
    const daemon = server;
    await poll(
      async () => {
        ok(
          daemon.exitCode === null && daemon.signalCode === null,
          'native sshd exited before binding its fixture address',
        );
        // Proof: Suppressing the owned listener observation broke native readiness.
        return (await hasListener(daemon.pid, args.listen, listenPort)) ? true : undefined;
      },
      performance.now() + 2000,
      'native owned sshd listener',
    );

    const runtime = directory + '/runtime';
    await before(
      fs.mkdir(runtime, { mode: 0o700 }),
      performance.now() + 500,
      'native runtime directory',
    );
    const enrollment: RegistryStatusEnrollment = {
      schemaVersion: 1,
      protocol: 'registry-pressure-status/1',
      target: {
        machineId: '0'.repeat(32),
        registryId: 'fixture',
        storageId: 'fixture',
        registryPath: '/fixture',
      },
      peer: { address: args.listen, port: listenPort, user: username, hostKey: host.publicKey },
      identity: {
        ...client,
        sha256: sha256(
          await before(
            readBounded(client.path, 4096, 'native fixture identity'),
            performance.now() + 500,
            'native fixture identity verification',
          ),
        ),
      },
    };
    const primary = await before(
      openRegistryPressureSource(enrollment, runtime),
      performance.now() + 1000,
      'native actor open',
    );
    await useActor(primary, async () => {
      for (const fixtureCase of cases) {
        if (fixtureCase.host === undefined && fixtureCase.client === undefined) {
          receipts.push(await qualifyCase(directory, daemon, primary, fixtureCase, owned));
        } else {
          const actor = await before(
            openRegistryPressureSource(
              {
                ...enrollment,
                peer:
                  fixtureCase.host === 'wrong'
                    ? { ...enrollment.peer, hostKey: wrongHost.publicKey }
                    : enrollment.peer,
                identity:
                  fixtureCase.client === 'wrong'
                    ? {
                        ...wrongClient,
                        sha256: sha256(
                          await before(
                            readBounded(wrongClient.path, 4096, 'native fixture identity'),
                            performance.now() + 500,
                            'native fixture identity verification',
                          ),
                        ),
                      }
                    : enrollment.identity,
              },
              await before(
                fs.mkdtemp(directory + '/negative-'),
                performance.now() + 500,
                'native negative actor directory',
              ),
            ),
            performance.now() + 1000,
            'native actor open',
          );
          await useActor(actor, async () => {
            receipts.push(await qualifyCase(directory, daemon, actor, fixtureCase, owned));
          });
        }
      }
    });
    deepStrictEqual(
      await before(fs.readdir(runtime), performance.now() + 500, 'native pin cleanup'),
      [],
      'primary close did not release its owned pin',
    );
  });
  let settled = true;
  if (server !== undefined) {
    const daemon = server;
    // Proof: A real overlong dispatcher remained live beyond master shutdown and forced retention.
    // Keep the master running until its descendants are observed. Recheck after it exits.
    const beforeShutdown = await attempt(failures, () =>
      poll(
        () => workSettled(directory, daemon, owned),
        performance.now() + 2500,
        'native pre-shutdown owned work',
      ),
    );
    serverExit = await attempt(failures, () => stopServer(daemon));
    const afterShutdown = await attempt(failures, () =>
      poll(
        async () => {
          if (await exists(`/proc/${String(daemon.pid)}`)) return undefined;
          return await workSettled(directory, daemon, owned);
        },
        performance.now() + 1500,
        'native post-shutdown owned work',
      ),
    );
    settled = beforeShutdown === true && afterShutdown === true;
  }
  // Proof: Bypassing this gate on a failed ownership observation deleted the protected evidence.
  if (settled) {
    await attempt(failures, () =>
      before(removeNativeFixture(fixture), performance.now() + 1000, 'native fixture removal'),
    );
  } else {
    failures.push('protected native fixture retained at ' + directory);
  }
  if (failures.length > 0) throw new FixtureFailure(failures);
  deepStrictEqual(serverExit, 0, 'native sshd did not stop cleanly');
  ok(
    !(await before(
      exists(directory),
      performance.now() + 500,
      'native fixture removal observation',
    )),
    'native fixture directory remained',
  );
  return {
    state: 'qualified',
    uid,
    listen: args.listen,
    permittedSource: args.source,
    port,
    cases: receipts,
    serverTimeoutMs: commandSeconds * 1000,
    serverKillAfterMs: killAfterSeconds * 1000,
    serverExit,
    serverParentReaped: true,
    fixtureRemoved: true,
  } as const;
}

function parseCli(tokens: readonly string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (const token of tokens) {
    const match = /^--(sshd|listen|source)=(.*)$/.exec(token);
    const key = match?.[1];
    const value = match?.[2];
    // Proof: Removing duplicate detection let duplicate options reach tool acquisition.
    if (key === undefined || value === undefined || Object.hasOwn(args, key))
      throw new Error('invalid registry status native arguments');
    args[key] = value;
  }
  return args;
}

if (import.meta.main) {
  try {
    const receipt = await rehearseRegistryPressureSource(parseCli(process.argv.slice(2)));
    console.log(JSON.stringify(receipt));
  } catch (cause) {
    const message = cause instanceof FixtureFailure ? cause.message : describeFailure(cause);
    writeSync(2, message + '\n');
    process.exit(1);
  }
}
