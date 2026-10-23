import { readFile, stat } from 'node:fs/promises';

/** A pinned intermediate host reached before every target. */
export interface SshJump {
  readonly user: string;
  readonly address: string;
}

/**
 * How production discovery reaches SSH nodes: the remote user, the reviewed `known_hosts` that
 * pins every target (and the jump), and the forwarded agent that holds the key. There is no
 * default for any field and no free-form SSH option; {@link readSshTransport} is the only
 * constructor that production uses, and every rendered flag comes from this record.
 */
export interface SshTransport {
  readonly user: string;
  readonly knownHostsFile: string;
  readonly agentSocket: string;
  readonly jump?: SshJump;
}

export type SshTransportRefusalReason =
  | 'transport-required'
  | 'transport-conflict'
  | 'transport-unreadable'
  | 'transport-malformed'
  | 'insecure-permissions'
  | 'user-invalid'
  | 'jump-invalid'
  | 'known-hosts-unreadable'
  | 'known-hosts-malformed'
  | 'host-unpinned'
  | 'agent-unavailable';

/** Discovery cannot reach SSH nodes safely; nothing was sent to any host. */
export class SshTransportRefusal extends Error {
  public constructor(
    public readonly reason: SshTransportRefusalReason,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SshTransportRefusal';
  }
}

// Rendered values reach ssh's argv through Ansible's shlex split, a ProxyCommand shell, and Docker
// volume specs; these alphabets exclude whitespace, quotes, `:` and a leading `-`.
const USER_PATTERN = /^[a-z_][a-z0-9_-]{0,31}$/;
const ADDRESS_PATTERN = /^[A-Za-z0-9][A-Za-z0-9.-]{0,252}$/;
const PATH_PATTERN = /^\/[A-Za-z0-9._/-]+$/;

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

async function readOwnerOnly(
  path: string,
  label: string,
  unreadable: 'transport-unreadable' | 'known-hosts-unreadable',
): Promise<string> {
  let source: string;
  try {
    source = await readFile(path, 'utf8');
  } catch (cause) {
    // Proof: swallowing the read error made the absent transport and absent known_hosts
    // negatives surface a raw ENOENT from `stat` instead of this typed refusal.
    throw new SshTransportRefusal(unreadable, `Cannot read ${label} at ${path}`, { cause });
  }
  if (((await stat(path)).mode & 0o077) !== 0) {
    // Proof: skipping this check made the 0644 transport negative return a transport; another
    // local user could then re-pin the targets.
    throw new SshTransportRefusal('insecure-permissions', `${label} ${path} must be owner-only`);
  }
  return source;
}

function readUser(input: unknown, label: string, reason: 'user-invalid' | 'jump-invalid'): string {
  if (typeof input !== 'string' || !USER_PATTERN.test(input)) {
    // Proof: dropping the pattern made the `-oProxyCommand=sh` user negative return a transport;
    // dropping the whole check made the missing-user negative return one too.
    throw new SshTransportRefusal(reason, `${label} must be a login name, got ${String(input)}`);
  }
  return input;
}

function readJump(input: unknown): SshJump | undefined {
  if (input === undefined) return undefined;
  if (!isRecord(input) || Object.keys(input).some((key) => key !== 'user' && key !== 'address')) {
    // Proof: checking only the record made the `port: 2222` jump negative return a transport
    // that silently ignored the operator's port.
    throw new SshTransportRefusal('jump-invalid', 'SSH transport jump must be {user, address}');
  }
  const user = readUser(input['user'], 'SSH transport jump user', 'jump-invalid');
  const address = input['address'];
  if (typeof address !== 'string' || !ADDRESS_PATTERN.test(address)) {
    // Proof: dropping the pattern let the `-oProxyCommand=sh` jump address through to the
    // known_hosts lookup, which refused it as `host-unpinned` instead of `jump-invalid`.
    throw new SshTransportRefusal(
      'jump-invalid',
      `SSH transport jump address must be a host name or IPv4 address, got ${String(address)}`,
    );
  }
  return { user, address };
}

/**
 * Host patterns that `known_hosts` pins to a key. A marker line (`@revoked`, `@cert-authority`)
 * pins nothing; hashed patterns cannot be matched to an address and so never count.
 * @throws SshTransportRefusal `known-hosts-malformed` for a truncated line or no key at all.
 */
function readPinnedHosts(source: string, path: string): ReadonlySet<string> {
  const pinned = new Set<string>();
  let keys = 0;
  for (const [index, rawLine] of source.split('\n').entries()) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    const fields = line.split(/\s+/);
    const marked = fields[0].startsWith('@');
    if (fields.length < (marked ? 4 : 3)) {
      // Proof: skipping this check made the truncated-line negative return a transport whose
      // third line ssh would reject only at connect time.
      throw new SshTransportRefusal(
        'known-hosts-malformed',
        `known_hosts ${path} line ${String(index + 1)} has no host key`,
      );
    }
    keys += 1;
    // Proof: pinning a marker line's hosts made the revoked-only negative return a transport for
    // a target whose only line revokes its key.
    if (marked) continue;
    for (const pattern of fields[0].split(',')) pinned.add(pattern);
  }
  if (keys === 0) {
    // Proof: removing this refusal made the comment-only negative report `host-unpinned` for
    // 10.1.0.4 instead of naming the empty file.
    throw new SshTransportRefusal('known-hosts-malformed', `known_hosts ${path} has no host key`);
  }
  return pinned;
}

async function readAgentSocket(env: Readonly<Record<string, string | undefined>>): Promise<string> {
  const socket = env['SSH_AUTH_SOCK'];
  if (socket === undefined || !PATH_PATTERN.test(socket)) {
    // Proof: removing this refusal made the `agent:1.sock` negative return a transport whose
    // `:` would split Docker's volume specification.
    throw new SshTransportRefusal(
      'agent-unavailable',
      `SSH_AUTH_SOCK must name the forwarded agent socket, got ${String(socket)}`,
    );
  }
  let isSocket: boolean;
  try {
    isSocket = (await stat(socket)).isSocket();
  } catch (cause) {
    throw new SshTransportRefusal('agent-unavailable', `SSH_AUTH_SOCK ${socket} is absent`, {
      cause,
    });
  }
  if (!isSocket) {
    // Proof: skipping the type check made the regular-file SSH_AUTH_SOCK negative return a
    // transport.
    throw new SshTransportRefusal('agent-unavailable', `SSH_AUTH_SOCK ${socket} is not a socket`);
  }
  return socket;
}

/**
 * Read and validate the operator's transport file (`{user, knownHostsFile, jump?}`, owner-only
 * JSON) and the forwarded agent. Every target address and the jump address must have a plain
 * key line in the owner-only `known_hosts`.
 * @throws SshTransportRefusal naming the first unusable input; nothing is defaulted.
 */
export async function readSshTransport(
  path: string,
  env: Readonly<Record<string, string | undefined>>,
  targetAddresses: readonly string[],
): Promise<SshTransport> {
  const source = await readOwnerOnly(path, 'SSH transport', 'transport-unreadable');
  let input: unknown;
  try {
    input = JSON.parse(source);
  } catch (cause) {
    throw new SshTransportRefusal(
      'transport-malformed',
      `SSH transport ${path} is malformed JSON`,
      {
        cause,
      },
    );
  }
  if (!isRecord(input)) {
    // Proof: removing this refusal made the `[]` negative report `user-invalid` instead.
    throw new SshTransportRefusal('transport-malformed', `SSH transport ${path} is not an object`);
  }
  const unexpected = Object.keys(input).find(
    (key) => key !== 'user' && key !== 'knownHostsFile' && key !== 'jump',
  );
  if (unexpected !== undefined) {
    // Proof: ignoring unknown fields made the `sshArgs: -o StrictHostKeyChecking=no` negative
    // return a transport, so a reader could believe the file loosened host-key checking.
    throw new SshTransportRefusal(
      'transport-malformed',
      `SSH transport ${path} has unexpected field ${unexpected}`,
    );
  }
  const user = readUser(input['user'], 'SSH transport user', 'user-invalid');
  const knownHostsFile = input['knownHostsFile'];
  if (typeof knownHostsFile !== 'string' || !PATH_PATTERN.test(knownHostsFile)) {
    // Proof: dropping the pattern made the relative `known_hosts` negative read a path relative
    // to the working directory and report `known-hosts-unreadable`.
    throw new SshTransportRefusal(
      'transport-malformed',
      `SSH transport knownHostsFile must be an absolute path, got ${String(knownHostsFile)}`,
    );
  }
  const jump = readJump(input['jump']);
  const pinned = readPinnedHosts(
    await readOwnerOnly(knownHostsFile, 'known_hosts', 'known-hosts-unreadable'),
    knownHostsFile,
  );
  for (const address of [...targetAddresses, ...(jump === undefined ? [] : [jump.address])]) {
    if (!pinned.has(address)) {
      // Proof: skipping this refusal made the unpinned-target negative return a transport; ssh
      // would then refuse only after discovery had started.
      throw new SshTransportRefusal(
        'host-unpinned',
        `known_hosts ${knownHostsFile} pins no key for ${address}`,
      );
    }
  }
  const agentSocket = await readAgentSocket(env);
  return { user, knownHostsFile, agentSocket, ...(jump === undefined ? {} : { jump }) };
}

function strictHostKeyOptions(transport: SshTransport): readonly string[] {
  // Proof: removing each option in turn failed `pins the user and exactly the reviewed host keys`,
  // the jump test and the production discover CLI test. GlobalKnownHostsFile=/dev/null keeps an
  // image-wide file from pinning other keys.
  return [
    '-o',
    `UserKnownHostsFile=${transport.knownHostsFile}`,
    '-o',
    'GlobalKnownHostsFile=/dev/null',
    '-o',
    'StrictHostKeyChecking=yes',
    '-o',
    'BatchMode=yes',
  ];
}

/** The jump's ProxyCommand value, carrying the same strict options as the outer ssh. */
function renderProxyCommand(transport: SshTransport): string | undefined {
  if (transport.jump === undefined) return undefined;
  // Proof: rendering the hop without its own strict options failed `pins the jump host`; the
  // command-line options of the outer ssh do not reach a ProxyCommand's ssh.
  return `ProxyCommand=ssh ${strictHostKeyOptions(transport).join(' ')} -l ${transport.jump.user} -W %h:%p ${transport.jump.address}`;
}

/** Ansible connection variables for `discover.yml`, in the shape the playbook procedure uses. */
export function renderSshDiscoveryVariables(transport: SshTransport): {
  readonly ansible_user: string;
  readonly ansible_ssh_common_args: string;
} {
  const proxyCommand = renderProxyCommand(transport);
  // Ansible shlex-splits these arguments; the quotes keep the ProxyCommand one ssh option.
  return {
    ansible_user: transport.user,
    ansible_ssh_common_args: [
      ...strictHostKeyOptions(transport),
      ...(proxyCommand === undefined ? [] : ['-o', `'${proxyCommand}'`]),
    ].join(' '),
  };
}

/**
 * `ssh` arguments for a local forward from controller loopback `localPort` to `remotePort` on
 * the loopback of `host`, pinned exactly like the SSH facts. The local side binds only
 * 127.0.0.1; `ExitOnForwardFailure` makes a refused or occupied forward end ssh.
 * @throws SshTransportRefusal `host-unpinned` when `host` could be read as an ssh option.
 */
export function renderApiForwardArguments(
  transport: SshTransport,
  host: string,
  localPort: number,
  remotePort: number,
): readonly string[] {
  if (!ADDRESS_PATTERN.test(host)) {
    // Proof: removing this refusal made the `-oProxyCommand=sh` forward-host negative render it
    // as ssh's final argument.
    throw new SshTransportRefusal('host-unpinned', `API forward host ${host} is not an address`);
  }
  const proxyCommand = renderProxyCommand(transport);
  // Proof: removing ExitOnForwardFailure, -N or the 127.0.0.1 bind in turn failed `renders a
  // loopback-only pinned forward`.
  return [
    '-N',
    ...strictHostKeyOptions(transport),
    ...(proxyCommand === undefined ? [] : ['-o', proxyCommand]),
    '-o',
    'ExitOnForwardFailure=yes',
    '-l',
    transport.user,
    '-L',
    `127.0.0.1:${String(localPort)}:127.0.0.1:${String(remotePort)}`,
    host,
  ];
}

/** `docker run` arguments that give the controller exactly this transport. */
export function renderControllerTransport(transport: SshTransport): readonly string[] {
  // ANSIBLE_HOST_KEY_CHECKING=True: Ansible puts `StrictHostKeyChecking=no` before the common
  // arguments when this is False, and ssh keeps the first value; an image or config default must
  // not decide it. Proof: removing each of the four in turn failed `mounts known_hosts read-only`
  // and the production discover CLI test.
  return [
    '--volume',
    `${transport.knownHostsFile}:${transport.knownHostsFile}:ro`,
    '--volume',
    `${transport.agentSocket}:${transport.agentSocket}`,
    '--env',
    `SSH_AUTH_SOCK=${transport.agentSocket}`,
    '--env',
    'ANSIBLE_HOST_KEY_CHECKING=True',
  ];
}

/**
 * `ssh` arguments that run one remote command on `host`, pinned exactly like the SSH facts, for
 * Twilight Dash's `ssh_host` compute provider. `-F none` keeps a user `~/.ssh/config` from adding
 * a `ProxyCommand` or loosening host-key checking the record does not say; `ConnectTimeout` bounds
 * the TCP connect and key exchange so an unanswering host becomes ssh's typed timeout. `ssh`
 * joins everything after the host into one remote shell line, so `remoteCommand` must already be
 * quoted for the remote shell.
 * @throws SshTransportRefusal `host-unpinned` when `host` could be read as an ssh option.
 */
export function renderRemoteCommandArguments(
  transport: SshTransport,
  host: string,
  remoteCommand: string,
  connectTimeoutSeconds: number,
): readonly string[] {
  if (!ADDRESS_PATTERN.test(host)) {
    // `--` already ends ssh's options; this keeps a non-address out of argv altogether.
    // Proof: removing this refusal failed `refuses a command host that ssh could read as an
    // option`, which then received an argv ending in `-oProxyCommand=sh` (2026-10-22).
    throw new SshTransportRefusal('host-unpinned', `remote command host ${host} is not an address`);
  }
  const proxyCommand = renderProxyCommand(transport);
  return [
    '-F',
    'none',
    ...strictHostKeyOptions(transport),
    ...(proxyCommand === undefined ? [] : ['-o', proxyCommand]),
    '-o',
    `ConnectTimeout=${String(connectTimeoutSeconds)}`,
    '-l',
    transport.user,
    '--',
    host,
    remoteCommand,
  ];
}
