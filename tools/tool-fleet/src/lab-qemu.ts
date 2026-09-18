import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { chmod, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';

/**
 * Rootless QEMU/KVM provider for the disposable fleet VM lab.
 *
 * It exists because the lab host grants no root: Multipass and libvirt need a privileged daemon,
 * while QEMU runs as the operator with only `/dev/kvm` access. Each machine gets a user-mode
 * (slirp) NIC for outbound installs plus SSH on a lab-unique loopback address, and a `dgram` NIC
 * attached to the lab's {@link ./lab-hub.ts} hub for the private node network. Machine identity
 * is the exact derived name recorded in the QEMU command line and pid file inside the lab state
 * directory; nothing outside that directory is ever signalled or deleted.
 */

const QemuLockSchema = type({
  schemaVersion: '1',
  qemu: {
    package: 'string>0',
    systemVersionLine: 'string>0',
    imageToolVersionLine: 'string>0',
    isoToolVersionLine: 'string>0',
    debs: type({ name: 'string>0', sha256: /^[0-9a-f]{64}$/ })
      .array()
      .atLeastLength(1),
    '+': 'reject',
  },
  image: {
    release: /^\d{8}$/,
    url: 'string.url',
    sha256: /^[0-9a-f]{64}$/,
    file: /^[a-z0-9.-]+\.img$/,
    '+': 'reject',
  },
  '+': 'reject',
});

export type QemuLock = typeof QemuLockSchema.infer;

/** Network and process identity derived from one exact lab machine name. */
export interface QemuMachinePlan {
  readonly name: string;
  readonly index: number;
  readonly privateAddress: string;
  readonly sshHost: string;
  readonly sshPort: number;
  readonly dgramPort: number;
  readonly hubPort: number;
  readonly apiPort: number;
  readonly directory: string;
}

interface QemuOutcome {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Executes one bounded subprocess; the lab passes {@link runLabCommand}. */
export type RunQemuCommand = (
  executable: string,
  arguments_: readonly string[],
  environment?: Readonly<Record<string, string>>,
) => Promise<QemuOutcome>;

const MACHINE_INDEX: ReadonlyMap<string, number> = new Map([
  ['server-1', 1],
  ['agent-1', 2],
  ['agent-2', 3],
  ['spare-1', 4],
]);
const SSH_PORT = 2222;
const IMAGE_DOWNLOAD_TIMEOUT_MS = 15 * 60 * 1000;

/** Decode the committed QEMU and cloud-image lock; absence or any unknown key refuses. */
export async function readQemuLock(root: string): Promise<QemuLock> {
  const path = join(root, 'infra/local/qemu-lab.lock.json');
  let source: string;
  try {
    source = await readFile(path, 'utf8');
  } catch (cause) {
    throw new Error(`QEMU lab lock is required at ${path}`, { cause });
  }
  let input: unknown;
  try {
    input = JSON.parse(source);
  } catch (cause) {
    throw new Error('QEMU lab lock is malformed JSON', { cause });
  }
  const lock = QemuLockSchema(input);
  if (lock instanceof type.errors) {
    // Proof: disabling this schema refusal made `refuses an absent, malformed, or checksum-free
    // lock` resolve a lock with no image SHA-256.
    throw new Error(`QEMU lab lock is invalid: ${lock.summary}`);
  }
  return lock;
}

/**
 * Derive every address and port for one machine from the lab prefix. Two labs can hash onto the
 * same slot; QEMU then fails to bind the forward or hub port, so a collision refuses rather than
 * joining another lab's network.
 */
export function planQemuMachine(
  stateDirectory: string,
  prefix: string,
  name: string,
): QemuMachinePlan {
  if (!name.startsWith(prefix)) {
    throw new Error(`QEMU machine ${name} is outside lab prefix ${prefix}`);
  }
  const index = MACHINE_INDEX.get(name.slice(prefix.length));
  if (index === undefined) {
    // Proof: defaulting the index made `derives distinct network identities only for lab roles`
    // give `...-db-1` a private address instead of refusing it.
    throw new Error(`QEMU machine ${name} has no derived lab role`);
  }
  const slot = createHash('sha256').update(prefix).digest();
  const first = slot.readUInt8(0);
  const second = slot.readUInt8(1);
  const portSlot = slot.readUInt16BE(2) % 2400;
  const hubPort = 40_000 + portSlot * 10;
  return {
    name,
    index,
    privateAddress: `10.55.0.${String(10 + index)}`,
    sshHost: `127.${String(32 + (first % 192))}.${String(1 + (second % 254))}.${String(10 + index)}`,
    sshPort: SSH_PORT,
    dgramPort: hubPort + index,
    hubPort,
    apiPort: hubPort + 9,
    directory: join(stateDirectory, 'qemu', name),
  };
}

/** Hub peer ports for every machine role a lab may own. */
export function hubPeerPorts(stateDirectory: string, prefix: string): readonly number[] {
  return [...MACHINE_INDEX.keys()].map(
    (role) => planQemuMachine(stateDirectory, prefix, `${prefix}${role}`).dgramPort,
  );
}

function environmentFor(qemuPrefix: string): Readonly<Record<string, string>> {
  return { LD_LIBRARY_PATH: join(qemuPrefix, 'usr/lib/x86_64-linux-gnu') };
}

function binary(qemuPrefix: string, name: string): string {
  return join(qemuPrefix, 'usr/bin', name);
}

/** Require the exact locked QEMU, qemu-img, and ISO tool builds under the rootless prefix. */
export async function requireQemuInstallation(
  lock: QemuLock,
  qemuPrefix: string,
  run: RunQemuCommand,
): Promise<void> {
  for (const [name, expected] of [
    ['qemu-system-x86_64', lock.qemu.systemVersionLine],
    ['qemu-img', lock.qemu.imageToolVersionLine],
    ['genisoimage', lock.qemu.isoToolVersionLine],
  ] as const) {
    const outcome = await run(binary(qemuPrefix, name), ['--version'], environmentFor(qemuPrefix));
    const firstLine = `${outcome.stdout}${outcome.stderr}`.split('\n').at(0)?.trim();
    if (outcome.exitCode !== 0 || firstLine !== expected) {
      // Proof: comparing only the exit code made `refuses a QEMU build other than the locked one`
      // accept QEMU 9.0.0.
      throw new Error(`${name} ${expected} is required: ${firstLine ?? 'no output'}`);
    }
  }
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of Bun.file(path).stream()) hash.update(chunk);
  return hash.digest('hex');
}

/**
 * Return the checksum-verified cached cloud image, downloading it once when absent. A present
 * image with other bytes refuses; the operator removes it deliberately.
 */
export async function requireBaseImage(root: string, lock: QemuLock): Promise<string> {
  const directory = join(root, '.puni/fleet-labs/images');
  const path = join(directory, lock.image.file);
  let present = true;
  try {
    await stat(path);
  } catch (cause) {
    if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) {
      throw new Error(`Cannot inspect cached QEMU lab image ${path}`, { cause });
    }
    present = false;
  }
  if (!present) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const partial = `${path}.partial`;
    const response = await fetch(lock.image.url, {
      signal: AbortSignal.timeout(IMAGE_DOWNLOAD_TIMEOUT_MS),
    });
    if (!response.ok || response.body === null) {
      throw new Error(`QEMU lab image download failed with HTTP ${String(response.status)}`);
    }
    const output = createWriteStream(partial, { mode: 0o600 });
    for await (const chunk of response.body) output.write(chunk);
    await new Promise<void>((resolve, reject) => {
      output.end((cause?: Error | null) => {
        if (cause) reject(cause);
        else resolve();
      });
    });
    const downloaded = await sha256File(partial);
    if (downloaded !== lock.image.sha256) {
      await rm(partial, { force: true });
      throw new Error(`Downloaded QEMU lab image has SHA-256 ${downloaded}`);
    }
    await rename(partial, path);
  }
  const actual = await sha256File(path);
  if (actual !== lock.image.sha256) {
    // Proof: disabling this comparison made `refuses a cached cloud image whose bytes differ from
    // the lock` resolve, and the production `up` then reached QEMU launch.
    throw new Error(
      `QEMU lab image ${path} has SHA-256 ${actual}; the lock requires ${lock.image.sha256}`,
    );
  }
  return path;
}

async function readPid(path: string): Promise<number | undefined> {
  let source: string;
  try {
    source = await readFile(path, 'utf8');
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return undefined;
    throw new Error(`Cannot read QEMU lab pid file ${path}`, { cause });
  }
  const pid = Number(source.trim());
  if (!Number.isSafeInteger(pid) || pid <= 1) {
    throw new Error(`QEMU lab pid file ${path} is malformed`);
  }
  return pid;
}

async function processArguments(pid: number): Promise<readonly string[] | undefined> {
  try {
    return (await readFile(`/proc/${String(pid)}/cmdline`, 'utf8')).split('\0');
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return undefined;
    throw new Error(`Cannot inspect process ${String(pid)}`, { cause });
  }
}

function hasFlagValue(arguments_: readonly string[], flag: string, value: string): boolean {
  return arguments_.some(
    (argument, position) => argument === flag && arguments_[position + 1] === value,
  );
}

/**
 * Return the pid only when its live command line names this exact machine and pid file. A reused
 * pid or a same-named process started elsewhere is not the lab's machine.
 */
export async function ownedQemuPid(machine: QemuMachinePlan): Promise<number | undefined> {
  const pidPath = join(machine.directory, 'qemu.pid');
  const pid = await readPid(pidPath);
  if (pid === undefined) return undefined;
  const arguments_ = await processArguments(pid);
  if (
    arguments_ === undefined ||
    !hasFlagValue(arguments_, '-name', machine.name) ||
    !hasFlagValue(arguments_, '-pidfile', pidPath)
  ) {
    // Proof: trusting the pid file alone made `creates, converges, fences, and deletes only exact
    // owned machines` fail: `down` signalled the bystander process named by a planted pid file.
    return undefined;
  }
  return pid;
}

/** List every machine directory of this lab with its live state; unknown names still list. */
export async function listQemuMachines(
  stateDirectory: string,
  prefix: string,
): Promise<readonly { name: string; state: string; ipv4: readonly string[] }[]> {
  const root = join(stateDirectory, 'qemu');
  let names: string[];
  try {
    names = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return [];
    throw new Error(`Cannot list QEMU lab machines in ${root}`, { cause });
  }
  const machines: { name: string; state: string; ipv4: readonly string[] }[] = [];
  for (const name of names.sort()) {
    if (!(name.startsWith(prefix) && MACHINE_INDEX.has(name.slice(prefix.length)))) {
      machines.push({ name, state: 'Unknown', ipv4: [] });
      continue;
    }
    const machine = planQemuMachine(stateDirectory, prefix, name);
    const pid = await ownedQemuPid(machine);
    machines.push({
      name,
      state: pid === undefined ? 'Stopped' : 'Running',
      ipv4: [machine.privateAddress],
    });
  }
  return machines;
}

async function waitFor(
  predicate: () => Promise<boolean>,
  deadlineMs: number,
  description: string,
  intervalMs = 500,
): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  while (!(await predicate())) {
    if (Date.now() >= deadline) {
      // Bounded by design; not fault-injected (see openspec/changes/k3s-fleet/verify.md).
      throw new Error(`${description} did not happen within ${String(deadlineMs)}ms`);
    }
    await Bun.sleep(intervalMs);
  }
}

/** Start the lab hub unless an exact owned hub is already running. */
export async function ensureQemuHub(
  root: string,
  stateDirectory: string,
  prefix: string,
): Promise<void> {
  const pidPath = join(stateDirectory, 'qemu-hub.pid');
  if ((await ownedHubPid(stateDirectory)) !== undefined) return;
  await rm(pidPath, { force: true });
  const hubPort = planQemuMachine(stateDirectory, prefix, `${prefix}server-1`).hubPort;
  const log = join(stateDirectory, 'qemu-hub.log');
  const child = Bun.spawn(
    [
      process.execPath,
      join(root, 'tools/tool-fleet/src/lab-hub.ts'),
      '--port',
      String(hubPort),
      '--peers',
      hubPeerPorts(stateDirectory, prefix).join(','),
      '--pid-file',
      pidPath,
    ],
    { detached: true, stdin: 'ignore', stdout: Bun.file(log), stderr: Bun.file(log) },
  );
  child.unref();
  await waitFor(
    async () => (await ownedHubPid(stateDirectory)) !== undefined,
    10_000,
    'QEMU lab hub start',
  );
}

async function ownedHubPid(stateDirectory: string): Promise<number | undefined> {
  const pidPath = join(stateDirectory, 'qemu-hub.pid');
  const pid = await readPid(pidPath);
  if (pid === undefined) return undefined;
  const arguments_ = await processArguments(pid);
  if (arguments_ === undefined || !hasFlagValue(arguments_, '--pid-file', pidPath)) {
    return undefined;
  }
  return pid;
}

/** Stop the owned hub after its last machine; no other process is signalled. */
export async function stopQemuHub(stateDirectory: string): Promise<void> {
  const pid = await ownedHubPid(stateDirectory);
  if (pid === undefined) return;
  process.kill(pid, 'SIGTERM');
  await waitFor(
    async () => (await processArguments(pid)) === undefined,
    10_000,
    'QEMU lab hub exit',
  );
  await rm(join(stateDirectory, 'qemu-hub.pid'), { force: true });
}

/** Render the NoCloud seed files for one machine, including its pre-generated host key. */
export function renderQemuSeed(
  cloudInit: string,
  machine: QemuMachinePlan,
  hostPrivateKey: string,
  hostPublicKey: string,
): { readonly userData: string; readonly metaData: string; readonly networkConfig: string } {
  if (!/^ssh-ed25519 [A-Za-z0-9+/=]+(?: \S+)?$/.test(hostPublicKey.trim())) {
    throw new Error(`QEMU lab host key for ${machine.name} is malformed`);
  }
  const indentedPrivateKey = hostPrivateKey
    .trimEnd()
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
  const mac = (network: number): string =>
    `52:54:00:${String(network)}:00:${machine.index.toString(16).padStart(2, '0')}`;
  return {
    userData: `${cloudInit.trimEnd()}
ssh_deletekeys: true
ssh_genkeytypes: [ed25519]
ssh_keys:
  ed25519_private: |
${indentedPrivateKey}
  ed25519_public: ${hostPublicKey.trim()}
`,
    metaData: `instance-id: ${machine.name}\nlocal-hostname: ${machine.name}\n`,
    networkConfig: `version: 2
ethernets:
  wan:
    match:
      macaddress: '${mac(10)}'
    set-name: ens3
    dhcp4: true
  private:
    match:
      macaddress: '${mac(20)}'
    set-name: ens4
    addresses: [${machine.privateAddress}/24]
`,
  };
}

/** The QEMU command line for one machine; its `-name` and `-pidfile` are the ownership proof. */
export function qemuMachineArguments(
  qemuPrefix: string,
  machine: QemuMachinePlan,
): readonly string[] {
  const mac = (network: number): string =>
    `52:54:00:${String(network)}:00:${machine.index.toString(16).padStart(2, '0')}`;
  return [
    '-name',
    machine.name,
    '-machine',
    'accel=kvm,type=q35',
    '-cpu',
    'host',
    '-smp',
    '2',
    '-m',
    '2048',
    '-bios',
    join(qemuPrefix, 'usr/share/seabios/bios-256k.bin'),
    '-L',
    join(qemuPrefix, 'usr/share/qemu'),
    '-vga',
    'none',
    '-display',
    'none',
    '-drive',
    `file=${join(machine.directory, 'disk.qcow2')},if=virtio,format=qcow2,cache=none`,
    '-drive',
    `file=${join(machine.directory, 'seed.iso')},if=virtio,format=raw,readonly=on`,
    '-netdev',
    `user,id=wan,hostfwd=tcp:${machine.sshHost}:${String(machine.sshPort)}-:22`,
    '-device',
    `virtio-net-pci,netdev=wan,mac=${mac(10)},romfile=`,
    '-netdev',
    `dgram,id=private,local.type=inet,local.host=127.0.0.1,local.port=${String(machine.dgramPort)},remote.type=inet,remote.host=127.0.0.1,remote.port=${String(machine.hubPort)}`,
    '-device',
    `virtio-net-pci,netdev=private,mac=${mac(20)},romfile=`,
    '-serial',
    `file:${join(machine.directory, 'console.log')}`,
    '-pidfile',
    join(machine.directory, 'qemu.pid'),
    '-daemonize',
  ];
}

async function requireSuccess(
  run: RunQemuCommand,
  executable: string,
  arguments_: readonly string[],
  environment?: Readonly<Record<string, string>>,
): Promise<string> {
  const outcome = await run(executable, arguments_, environment);
  if (outcome.exitCode !== 0) {
    throw new Error(
      `${executable} ${arguments_.join(' ')} failed with exit ${String(outcome.exitCode)}: ${outcome.stderr}`,
    );
  }
  return outcome.stdout;
}

/** Create the disk, seed, and host key of a new machine, then boot it. */
export async function launchQemuMachine(
  machine: QemuMachinePlan,
  qemuPrefix: string,
  baseImage: string,
  cloudInit: string,
  run: RunQemuCommand,
): Promise<void> {
  await mkdir(machine.directory, { recursive: true, mode: 0o700 });
  await chmod(machine.directory, 0o700);
  const hostKeyPath = join(machine.directory, 'ssh_host_ed25519_key');
  await rm(hostKeyPath, { force: true });
  await rm(`${hostKeyPath}.pub`, { force: true });
  await requireSuccess(run, 'ssh-keygen', [
    '-q',
    '-t',
    'ed25519',
    '-N',
    '',
    '-C',
    machine.name,
    '-f',
    hostKeyPath,
  ]);
  const seed = renderQemuSeed(
    cloudInit,
    machine,
    await readFile(hostKeyPath, 'utf8'),
    await readFile(`${hostKeyPath}.pub`, 'utf8'),
  );
  const seedDirectory = join(machine.directory, 'seed');
  await mkdir(seedDirectory, { recursive: true, mode: 0o700 });
  for (const [file, content] of [
    ['user-data', seed.userData],
    ['meta-data', seed.metaData],
    ['network-config', seed.networkConfig],
  ] as const) {
    await writeFile(join(seedDirectory, file), content, { mode: 0o600 });
  }
  const environment = environmentFor(qemuPrefix);
  await requireSuccess(
    run,
    binary(qemuPrefix, 'genisoimage'),
    [
      '-quiet',
      '-output',
      join(machine.directory, 'seed.iso'),
      '-volid',
      'cidata',
      '-joliet',
      '-rock',
      join(seedDirectory, 'user-data'),
      join(seedDirectory, 'meta-data'),
      join(seedDirectory, 'network-config'),
    ],
    environment,
  );
  await requireSuccess(
    run,
    binary(qemuPrefix, 'qemu-img'),
    [
      'create',
      '-q',
      '-f',
      'qcow2',
      '-F',
      'qcow2',
      '-b',
      baseImage,
      join(machine.directory, 'disk.qcow2'),
      '16G',
    ],
    environment,
  );
  await startQemuMachine(machine, qemuPrefix, run);
}

/** Boot an existing stopped machine from its retained disk and seed. */
export async function startQemuMachine(
  machine: QemuMachinePlan,
  qemuPrefix: string,
  run: RunQemuCommand,
): Promise<void> {
  if ((await ownedQemuPid(machine)) !== undefined) return;
  await rm(join(machine.directory, 'qemu.pid'), { force: true });
  await requireSuccess(
    run,
    binary(qemuPrefix, 'qemu-system-x86_64'),
    qemuMachineArguments(qemuPrefix, machine),
    environmentFor(qemuPrefix),
  );
  if ((await ownedQemuPid(machine)) === undefined) {
    // QEMU's daemonize exit alone does not prove the machine stayed up; not fault-injected.
    throw new Error(`QEMU did not leave ${machine.name} running`);
  }
}

/**
 * Stop one owned machine: SIGTERM for an orderly `down`, SIGKILL to model sudden power loss.
 * @throws Error when the exact process survives its bounded deadline.
 */
export async function stopQemuMachine(
  machine: QemuMachinePlan,
  signal: 'SIGTERM' | 'SIGKILL',
): Promise<number | undefined> {
  const pid = await ownedQemuPid(machine);
  if (pid === undefined) return undefined;
  process.kill(pid, signal);
  const exited = async (): Promise<boolean> => (await processArguments(pid)) === undefined;
  try {
    await waitFor(exited, 30_000, `QEMU machine ${machine.name} exit`);
  } catch (cause) {
    if (signal === 'SIGKILL') throw cause;
    process.kill(pid, 'SIGKILL');
    await waitFor(exited, 10_000, `QEMU machine ${machine.name} forced exit`);
  }
  return pid;
}

/** Delete exactly one machine's state directory after its process has stopped. */
export async function deleteQemuMachine(machine: QemuMachinePlan): Promise<void> {
  await stopQemuMachine(machine, 'SIGTERM');
  if ((await ownedQemuPid(machine)) !== undefined) {
    throw new Error(`QEMU machine ${machine.name} is still running; refusing to delete its disk`);
  }
  await rm(machine.directory, { recursive: true, force: true });
}

/** Wait until strict SSH works and cloud-init finished, within bounded deadlines. */
export async function waitForQemuMachine(
  machine: QemuMachinePlan,
  exec: (argv: readonly string[]) => Promise<QemuOutcome>,
): Promise<void> {
  await waitFor(
    async () => (await exec(['true'])).exitCode === 0,
    5 * 60 * 1000,
    `SSH on ${machine.name}`,
    3000,
  );
  const status = await exec(['cloud-init', 'status', '--wait']);
  if (status.exitCode !== 0) {
    // Proof: the first live QEMU lab run stopped here on exit 2 (`ssh_genkeytypes: []` failed
    // cloud-init schema validation) instead of converging a degraded host.
    throw new Error(
      `cloud-init on ${machine.name} failed with exit ${String(status.exitCode)}: ${status.stdout}${status.stderr}`,
    );
  }
}

/** Host-side strict SSH arguments that reach a machine through its loopback forward. */
export function qemuSshArguments(
  machine: QemuMachinePlan,
  privateKeyPath: string,
  knownHostsPath: string,
): readonly string[] {
  return [
    '-F',
    '/dev/null',
    '-i',
    privateKeyPath,
    '-o',
    'IdentitiesOnly=yes',
    '-o',
    'BatchMode=yes',
    '-o',
    'ConnectTimeout=10',
    '-o',
    'StrictHostKeyChecking=yes',
    '-o',
    `UserKnownHostsFile=${knownHostsPath}`,
    '-o',
    `HostKeyAlias=${machine.privateAddress}`,
    '-p',
    String(machine.sshPort),
    `puni@${machine.sshHost}`,
  ];
}

/**
 * Ansible reaches the machine by its private address (the enrolled node identity) while the TCP
 * connection goes to the loopback forward. `HostKeyAlias` keeps strict host-key lookup on the
 * private address, so known-hosts evidence has the same shape as for a directly routed host.
 */
export function qemuAnsibleSshExtraArguments(machine: QemuMachinePlan): string {
  return `-o HostName=${machine.sshHost} -o Port=${String(machine.sshPort)} -o HostKeyAlias=${machine.privateAddress}`;
}

/** Persist provider-observed power-off evidence for one fenced machine. */
export async function writeQemuFenceEvidence(
  stateDirectory: string,
  machine: QemuMachinePlan,
  pid: number,
  fencedAt: string,
): Promise<string> {
  const path = join(stateDirectory, `fence-${machine.name}.json`);
  await writeFile(
    path,
    `${JSON.stringify({ schemaVersion: 1, machine: machine.name, state: 'powered-off', pid, fencedAt })}\n`,
    { mode: 0o600, flag: 'wx' },
  );
  return path;
}
