import { randomBytes } from 'node:crypto';
import { access, chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { parse, stringify } from 'yaml';

import { readToolchain } from './contracts';
import {
  deleteQemuMachine,
  ensureQemuHub,
  launchQemuMachine,
  listQemuMachines,
  planQemuMachine,
  qemuAnsibleSshExtraArguments,
  type QemuMachinePlan,
  qemuSshArguments,
  readQemuLock,
  requireBaseImage,
  requireQemuInstallation,
  startQemuMachine,
  stopQemuHub,
  stopQemuMachine,
  waitForQemuMachine,
  writeQemuFenceEvidence,
} from './lab-qemu';

type LabAction = 'up' | 'down' | 'status' | 'spare' | 'fence' | 'tunnel';
type LabProfile = 'platform' | 'workers';
type LabProviderKind = 'multipass' | 'qemu';

export interface LabRequest {
  readonly action: LabAction;
  readonly labId: string;
  readonly profile: LabProfile;
  readonly provider: LabProviderKind;
  readonly sshPublicKey?: string;
  readonly sshPrivateKey?: string;
  readonly qemuPrefix?: string;
  readonly member?: string;
}

export interface LabMachine {
  readonly name: string;
  readonly state: string;
  readonly ipv4: readonly string[];
}

interface LabCommand {
  readonly executable: LabProviderKind;
  readonly arguments: readonly string[];
}

export interface LabOperation {
  readonly prefix: string;
  readonly commands: readonly LabCommand[];
}

interface CommandOutcome {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface LabBootstrap {
  readonly stateDirectory: string;
  readonly cloudInitPath: string;
  readonly privateKeyPath: string;
  readonly publicKey: string;
}

interface K3sEnrollmentTokens {
  readonly server: string;
  readonly agent: string;
}

/**
 * One VM provider behind the lab lifecycle. Every method addresses an exact derived machine name;
 * `list` reports every machine the provider can see so ownership is checked by the planner.
 * Multipass needs a privileged daemon; QEMU ({@link ./lab-qemu.ts}) runs rootless.
 */
interface LabProvider {
  readonly kind: LabProviderKind;
  list(): Promise<readonly LabMachine[]>;
  execute(command: LabCommand, cloudInitPath: string | undefined): Promise<void>;
  exec(name: string, argv: readonly string[]): Promise<CommandOutcome>;
  hostKey(name: string): Promise<string>;
  waitReady(name: string): Promise<void>;
  ensureNetwork(): Promise<void>;
  sshArguments(name: string): readonly string[];
  ansibleSshExtraArguments(name: string): string | undefined;
}

const LAB_ID = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
const LAB_MEMBER = /^(?:server-1|agent-[12]|spare-1)$/;
const MULTIPASS_VERSION = '1.16.4';
const COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
const CLOUD_INIT_ARGUMENT = '__PUNI_CLOUD_INIT__';
const IPV4 = /^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const LAB_FLAGS = [
  '--lab-id',
  '--profile',
  '--provider',
  '--ssh-public-key',
  '--ssh-private-key',
  '--qemu-prefix',
  '--member',
];

function takeFlag(arguments_: readonly string[], position: number): string {
  const value = arguments_.at(position + 1);
  if (value === undefined || value.startsWith('--')) {
    // Proof: accepting a valueless flag shifted the next option into a path or identity value in
    // the production parser negative.
    throw new Error(`Fleet lab flag ${arguments_[position]} has no value`);
  }
  return value;
}

/** Decode the bounded VM-lab command. Machine names are always derived, never accepted. */
export function parseLabRequest(arguments_: readonly string[]): LabRequest {
  const action = arguments_.at(0);
  if (
    action !== 'up' &&
    action !== 'down' &&
    action !== 'status' &&
    action !== 'spare' &&
    action !== 'fence' &&
    action !== 'tunnel'
  ) {
    // Proof: accepting an unknown lifecycle verb let an unreviewed action reach provider setup in
    // the production parser negative.
    throw new Error(
      `Fleet lab action must be up, down, status, spare, fence, or tunnel: ${action ?? 'missing'}`,
    );
  }
  const flags = new Map<string, string>();
  for (let position = 1; position < arguments_.length; position += 2) {
    const flag = arguments_.at(position);
    if (!flag?.startsWith('--')) {
      // Proof: accepting a positional machine name let a down request target a host outside its
      // derived ownership prefix in the production parser negative.
      throw new Error(`Unexpected fleet lab argument at position ${String(position)}`);
    }
    if (!LAB_FLAGS.includes(flag)) {
      // Proof: accepting an unknown flag let caller intent escape the bounded lab contract.
      throw new Error(`Unexpected fleet lab flag: ${flag}`);
    }
    if (flags.has(flag)) {
      // Proof: accepting duplicate flags made ownership depend on map overwrite order.
      throw new Error(`Duplicate fleet lab flag: ${flag}`);
    }
    flags.set(flag, takeFlag(arguments_, position));
  }
  const labId = flags.get('--lab-id');
  if (labId === undefined || !LAB_ID.test(labId)) {
    // Proof: widening this boundary let `../prod` escape the lab state directory and ownership
    // prefix in the production parser negative.
    throw new Error(`Fleet lab id is invalid: ${labId ?? 'missing'}`);
  }
  const profile = flags.get('--profile');
  if (profile !== 'platform' && profile !== 'workers') {
    // Proof: accepting an unknown profile left machine count and cluster role undefined.
    throw new Error(`Fleet lab profile must be platform or workers: ${profile ?? 'missing'}`);
  }
  const provider = flags.get('--provider') ?? 'multipass';
  if (provider !== 'multipass' && provider !== 'qemu') {
    // Proof: disabling this refusal made `decodes qemu requests only with their exact required
    // inputs` accept `--provider libvirt`.
    throw new Error(`Fleet lab provider must be multipass or qemu: ${provider}`);
  }
  const creates = action === 'up' || action === 'spare';
  const sshPublicKey = flags.get('--ssh-public-key');
  const sshPrivateKey = flags.get('--ssh-private-key');
  if (creates && (sshPublicKey === undefined || sshPrivateKey === undefined)) {
    // Proof: accepting an up request without both key paths created machines that strict SSH could
    // not authenticate to in the production parser negative.
    throw new Error(`Fleet lab ${action} requires --ssh-public-key and --ssh-private-key`);
  }
  if (!creates && (sshPublicKey !== undefined || sshPrivateKey !== undefined)) {
    // Proof: accepting unrelated key flags on status/down made read/delete operations consume
    // secret-bearing input without purpose.
    throw new Error(`Fleet lab ${action} does not accept SSH key flags`);
  }
  const qemuPrefix = flags.get('--qemu-prefix');
  if ((provider === 'qemu' && creates) !== (qemuPrefix !== undefined)) {
    // Proof: disabling this refusal made the qemu request-decoding test accept `up` without a
    // prefix and `status` with one.
    throw new Error('Fleet lab --qemu-prefix is required exactly for qemu up and spare');
  }
  const member = flags.get('--member');
  if ((action === 'fence') !== (member !== undefined)) {
    // Proof: disabling this refusal made the qemu request-decoding test accept a member-less fence
    // and a member on `down`.
    throw new Error('Fleet lab --member is required exactly for fence');
  }
  if (member !== undefined && !LAB_MEMBER.test(member)) {
    // Proof: disabling this refusal made the qemu request-decoding test accept `--member prod-db`.
    throw new Error(`Fleet lab member is invalid: ${member}`);
  }
  if (action === 'fence' && provider !== 'qemu') {
    // Only the provider that observes its process exit may issue power-off evidence.
    // Proof: disabling this refusal made the qemu request-decoding test accept a Multipass fence.
    throw new Error('Fleet lab fence is supported only by the qemu provider');
  }
  return {
    action,
    labId,
    profile,
    provider,
    ...(sshPublicKey === undefined ? {} : { sshPublicKey: resolve(sshPublicKey) }),
    ...(sshPrivateKey === undefined ? {} : { sshPrivateKey: resolve(sshPrivateKey) }),
    ...(qemuPrefix === undefined ? {} : { qemuPrefix: resolve(qemuPrefix) }),
    ...(member === undefined ? {} : { member }),
  };
}

function labPrefix(request: LabRequest): string {
  return request.provider === 'qemu'
    ? `puni-vm-${request.labId}-${request.profile}-`
    : `puni-fleet-${request.labId}-${request.profile}-`;
}

function expectedNames(prefix: string, profile: LabProfile): readonly string[] {
  const agents = profile === 'platform' ? 1 : 2;
  return [
    `${prefix}server-1`,
    ...Array.from({ length: agents }, (_, position) => `${prefix}agent-${String(position + 1)}`),
  ];
}

function spareName(prefix: string): string {
  return `${prefix}spare-1`;
}

function launchCommand(provider: LabProviderKind, name: string): LabCommand {
  if (provider === 'qemu') return { executable: 'qemu', arguments: ['launch', name] };
  return {
    executable: 'multipass',
    arguments: [
      'launch',
      '24.04',
      '--name',
      name,
      '--cpus',
      '2',
      '--memory',
      name.includes('-server-') ? '3G' : '2G',
      '--disk',
      '16G',
      '--cloud-init',
      CLOUD_INIT_ARGUMENT,
    ],
  };
}

/** Plan lifecycle commands only for names inside the exact lab ownership prefix. */
export function planLabOperation(
  request: LabRequest,
  machines: readonly LabMachine[],
): LabOperation {
  const prefix = labPrefix(request);
  const profileNames = expectedNames(prefix, request.profile);
  const owned = machines.filter(({ name }) => name.startsWith(prefix));
  for (const machine of owned) {
    if (!profileNames.includes(machine.name) && machine.name !== spareName(prefix)) {
      // Proof: accepting prefix-only ownership let a same-prefix arbitrary machine enter the delete
      // set in the production planner negative.
      throw new Error(`Fleet lab found unexpected owned machine ${machine.name}`);
    }
  }
  if (request.action === 'status' || request.action === 'fence' || request.action === 'tunnel') {
    return { prefix, commands: [] };
  }
  if (request.action === 'down') {
    const names = owned.map(({ name }) => name).sort();
    return {
      prefix,
      commands:
        names.length === 0
          ? []
          : [
              {
                executable: request.provider,
                arguments:
                  request.provider === 'qemu'
                    ? ['delete', ...names]
                    : ['delete', '--purge', ...names],
              },
            ],
    };
  }
  const expected = request.action === 'spare' ? [spareName(prefix)] : profileNames;
  const relevant = owned.filter(({ name }) => expected.includes(name));
  const existing = new Set(relevant.map(({ name }) => name));
  const starts: LabCommand[] = relevant
    .filter(({ state }) => state !== 'Running')
    .map(({ name }) => ({ executable: request.provider, arguments: ['start', name] }));
  return {
    prefix,
    commands: [
      ...starts,
      ...expected
        .filter((name) => !existing.has(name))
        .map((name) => launchCommand(request.provider, name)),
    ],
  };
}

/** Decode the exact provider list used to authorize lab lifecycle operations. */
export function decodeMachineList(stdout: string): readonly LabMachine[] {
  let input: unknown;
  try {
    input = JSON.parse(stdout);
  } catch (cause) {
    // Proof: accepting malformed provider bytes would leave ownership unknown before delete; the
    // production decoder negative requires this contextual refusal.
    throw new Error('Multipass list returned malformed JSON', { cause });
  }
  if (!isRecord(input) || !Array.isArray(input['list'])) {
    // Proof: treating a missing list as empty made the production decoder authorize a false empty
    // status and skip owned machines.
    throw new Error('Multipass list is missing its machine list');
  }
  return input['list'].map((machineInput, position) => {
    if (!isRecord(machineInput)) {
      // Proof: accepting a scalar machine made the decoder lose the provider identity boundary.
      throw new Error(`Multipass machine ${String(position)} is malformed`);
    }
    const addresses = machineInput['ipv4'];
    if (
      typeof machineInput['name'] !== 'string' ||
      typeof machineInput['state'] !== 'string' ||
      !Array.isArray(addresses) ||
      !addresses.every(
        (address): address is string => typeof address === 'string' && IPV4.test(address),
      )
    ) {
      // Proof: accepting incomplete machine identity/state/address made lifecycle ownership depend
      // on undefined provider fields.
      throw new Error(`Multipass machine ${String(position)} is incomplete`);
    }
    return {
      name: machineInput['name'],
      state: machineInput['state'],
      ipv4: addresses,
    };
  });
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

/** Run a bounded lab subprocess and kill it when its deadline expires. */
export async function runLabCommand(
  executable: string,
  arguments_: readonly string[],
  timeoutMs = COMMAND_TIMEOUT_MS,
  environment?: Readonly<Record<string, string>>,
): Promise<CommandOutcome> {
  const child = Bun.spawn([executable, ...arguments_], {
    detached: true,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    ...(environment === undefined ? {} : { env: { ...process.env, ...environment } }),
  });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      try {
        // Proof: killing only the direct process let its descendant write a mutation sentinel after
        // the production lab command reported its injected timeout.
        process.kill(-child.pid, 'SIGKILL');
      } catch (cause) {
        reject(
          new Error(`${executable} timed out and its process group could not be killed`, { cause }),
        );
        return;
      }
      reject(new Error(`${executable} timed out after ${String(timeoutMs)}ms`));
    }, timeoutMs);
  });
  const stdout = new Response(child.stdout).text();
  const stderr = new Response(child.stderr).text();
  const completed = (async (): Promise<CommandOutcome> => {
    const [exitCode, stdoutText, stderrText] = await Promise.all([child.exited, stdout, stderr]);
    return { exitCode, stdout: stdoutText, stderr: stderrText };
  })();
  try {
    return await Promise.race([completed, timedOut]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function requireOutcome(
  description: string,
  outcome: CommandOutcome,
  arguments_: readonly string[],
): CommandOutcome {
  if (outcome.exitCode !== 0) {
    // Proof: accepting a fake Multipass exit 42 made the production status command report success
    // without provider inventory.
    throw new Error(
      `${description} ${arguments_.join(' ')} failed with exit ${String(outcome.exitCode)}: ${outcome.stderr}\n${outcome.stdout.slice(-4000)}`,
    );
  }
  return outcome;
}

async function requireSuccess(
  executable: string,
  arguments_: readonly string[],
): Promise<CommandOutcome> {
  return requireOutcome(executable, await runLabCommand(executable, arguments_), arguments_);
}

/** Verify the installed provider is the version pinned by the fleet contract. */
export function requireMultipassVersion(stdout: string): void {
  if (
    !new RegExp(`^multipass ${MULTIPASS_VERSION.replaceAll('.', '\\.')}(?:\\r)?$`, 'm').test(stdout)
  ) {
    // Proof: accepting a different provider version let an unreviewed VM lifecycle implementation
    // enter the production lab command.
    throw new Error(`Multipass ${MULTIPASS_VERSION} is required: ${stdout.trim()}`);
  }
}

/** Refuse a partial Ansible checkout before creating disposable machines. */
export async function requireAnsibleLayout(root: string): Promise<void> {
  for (const relativePath of [
    'infra/ansible/ansible.cfg',
    'infra/ansible/playbooks/bootstrap.yml',
    'infra/ansible/playbooks/join.yml',
    'infra/ansible/playbooks/validate-enrollment.yml',
  ]) {
    try {
      await access(join(root, relativePath));
    } catch (cause) {
      // Proof: removing this preflight let VM creation begin with the bootstrap playbook absent in
      // the production-path layout negative.
      throw new Error(`${relativePath} is required before fleet lab creation`, { cause });
    }
  }
}

function stateDirectoryFor(root: string, request: LabRequest): string {
  return join(root, '.puni/fleet-labs', `${request.labId}-${request.profile}`);
}

async function createMultipassProvider(root: string): Promise<LabProvider> {
  const toolchain = await readToolchain(join(root, 'infra/versions/toolchain.json'));
  if (toolchain.binaries.multipass.version !== `1.16.4+snap.18737`) {
    throw new Error(`Unsupported Multipass lock ${toolchain.binaries.multipass.version}`);
  }
  const version = await requireSuccess('multipass', ['version']);
  requireMultipassVersion(version.stdout);
  const exec = (name: string, argv: readonly string[]): Promise<CommandOutcome> =>
    runLabCommand('multipass', ['exec', name, '--', ...argv]);
  return {
    kind: 'multipass',
    list: async () =>
      decodeMachineList((await requireSuccess('multipass', ['list', '--format', 'json'])).stdout),
    execute: async (command, cloudInitPath) => {
      await requireSuccess(
        command.executable,
        command.arguments.map((argument) => {
          if (argument !== CLOUD_INIT_ARGUMENT) return argument;
          if (cloudInitPath === undefined) throw new Error('Multipass launch lost its cloud-init');
          return cloudInitPath;
        }),
      );
    },
    exec,
    hostKey: async (name) => {
      const argv = ['cat', '/etc/ssh/ssh_host_ed25519_key.pub'];
      return requireOutcome(`Fleet lab ${name}`, await exec(name, argv), argv).stdout;
    },
    waitReady: async () => {
      // Multipass launch returns only after cloud-init and SSH are ready.
    },
    ensureNetwork: async () => {
      // Multipass owns its bridged network.
    },
    sshArguments: () => {
      throw new Error('Fleet lab tunnel is implemented for the qemu provider only');
    },
    ansibleSshExtraArguments: () => undefined,
  };
}

async function createQemuProvider(
  root: string,
  request: LabRequest,
  stateDirectory: string,
): Promise<LabProvider> {
  const prefix = labPrefix(request);
  const machine = (name: string): QemuMachinePlan => planQemuMachine(stateDirectory, prefix, name);
  const privateKeyPath = join(stateDirectory, 'id_fleet_lab');
  const knownHostsPath = join(stateDirectory, 'known_hosts');
  const run = (
    executable: string,
    arguments_: readonly string[],
    environment?: Readonly<Record<string, string>>,
  ): Promise<CommandOutcome> =>
    runLabCommand(executable, arguments_, COMMAND_TIMEOUT_MS, environment);
  let baseImage: string | undefined;
  if (request.qemuPrefix !== undefined) {
    const lock = await readQemuLock(root);
    await requireQemuInstallation(lock, request.qemuPrefix, run);
    baseImage = await requireBaseImage(root, lock);
  }
  const exec = (name: string, argv: readonly string[]): Promise<CommandOutcome> =>
    runLabCommand('ssh', [
      ...qemuSshArguments(machine(name), privateKeyPath, knownHostsPath),
      '--',
      ...argv,
    ]);
  return {
    kind: 'qemu',
    list: () => listQemuMachines(stateDirectory, prefix),
    execute: async (command, cloudInitPath) => {
      const verb = command.arguments.at(0);
      const names = command.arguments.slice(1);
      if (verb === 'delete') {
        for (const name of names) await deleteQemuMachine(machine(name));
        if ((await listQemuMachines(stateDirectory, prefix)).length === 0) {
          await stopQemuHub(stateDirectory);
        }
        return;
      }
      const qemuPrefix = request.qemuPrefix;
      if (qemuPrefix === undefined || baseImage === undefined) {
        throw new Error(`QEMU ${verb ?? 'command'} requires the verified prefix and image`);
      }
      const name = names.at(0);
      if (name === undefined || names.length !== 1) throw new Error('QEMU command lost its name');
      await ensureQemuHub(root, stateDirectory, prefix);
      if (verb === 'start') {
        await startQemuMachine(machine(name), qemuPrefix, run);
        return;
      }
      if (verb !== 'launch' || cloudInitPath === undefined) {
        throw new Error(`Unsupported QEMU lab command ${verb ?? 'missing'}`);
      }
      await launchQemuMachine(
        machine(name),
        qemuPrefix,
        baseImage,
        await readFile(cloudInitPath, 'utf8'),
        run,
      );
    },
    exec,
    hostKey: (name) => readFile(join(machine(name).directory, 'ssh_host_ed25519_key.pub'), 'utf8'),
    waitReady: (name) => waitForQemuMachine(machine(name), (argv) => exec(name, ['sudo', ...argv])),
    // Proof: `up` on already-running machines skipped the hub start, and the live bootstrap MTU
    // probe then failed between all three VMs because the private segment had no hub.
    ensureNetwork: () => ensureQemuHub(root, stateDirectory, prefix),
    sshArguments: (name) => qemuSshArguments(machine(name), privateKeyPath, knownHostsPath),
    ansibleSshExtraArguments: (name) => qemuAnsibleSshExtraArguments(machine(name)),
  };
}

async function prepareLabBootstrap(root: string, request: LabRequest): Promise<LabBootstrap> {
  const stateDirectory = stateDirectoryFor(root, request);
  await mkdir(stateDirectory, { recursive: true, mode: 0o700 });
  await chmod(stateDirectory, 0o700);
  const publicKeyPath = request.sshPublicKey;
  const sourcePrivateKeyPath = request.sshPrivateKey;
  if (publicKeyPath === undefined || sourcePrivateKeyPath === undefined) {
    throw new Error('Fleet lab up lost its required SSH key paths');
  }
  const publicKey = (await readFile(publicKeyPath, 'utf8')).trim();
  requireSshPublicKey(publicKey);
  const privateKey = await readFile(sourcePrivateKeyPath);
  requireSshPrivateKey(privateKey);
  const privateKeyPath = join(stateDirectory, 'id_fleet_lab');
  await writeFile(privateKeyPath, privateKey, { mode: 0o600 });
  await chmod(privateKeyPath, 0o600);
  const cloudInitTemplate = await readFile(join(root, 'infra/local/cloud-init.yaml'), 'utf8');
  const cloudInitPath = join(stateDirectory, 'cloud-init.yaml');
  await writeFile(cloudInitPath, renderCloudInit(cloudInitTemplate, publicKey), {
    mode: 0o600,
  });
  await chmod(cloudInitPath, 0o600);
  return { stateDirectory, cloudInitPath, privateKeyPath, publicKey };
}

/** Render exactly one validated public-key slot in the lab cloud-init document. */
export function renderCloudInit(template: string, publicKey: string): string {
  const slots = template.match(/__PUNI_SSH_PUBLIC_KEY__/g)?.length ?? 0;
  if (slots !== 1) {
    // Proof: accepting zero or duplicate slots either omitted authentication or copied key material
    // into an unintended cloud-init field in production rendering negatives.
    throw new Error(
      `Fleet lab cloud-init must contain exactly one SSH public-key slot; found ${String(slots)}`,
    );
  }
  return template.replace('__PUNI_SSH_PUBLIC_KEY__', publicKey);
}

/** Refuse multiline or non-OpenSSH public-key material before cloud-init rendering. */
export function requireSshPublicKey(publicKey: string): void {
  if (!/^(?:(?:ssh|ecdsa|sk)-\S+) [A-Za-z0-9+/=]+(?: [A-Za-z0-9._@+-]+)?$/.test(publicKey)) {
    // Proof: accepting a newline in the public key let caller-controlled YAML enter cloud-init in
    // the production key-boundary negative.
    throw new Error('Fleet lab SSH public key is malformed');
  }
}

/** Refuse empty or unrelated secret bytes before copying the private key into owner-only state. */
export function requireSshPrivateKey(privateKey: Uint8Array): void {
  const encoded = new TextDecoder().decode(privateKey);
  if (!/^-----BEGIN (?:OPENSSH |RSA |EC )?PRIVATE KEY-----\r?\n/.test(encoded)) {
    // Proof: accepting arbitrary bytes deferred authentication failure until after VM creation in
    // the production key-boundary negative.
    throw new Error('Fleet lab SSH private key is malformed');
  }
}

async function execSuccess(
  provider: LabProvider,
  name: string,
  argv: readonly string[],
): Promise<CommandOutcome> {
  return requireOutcome(`Fleet lab ${name}`, await provider.exec(name, argv), argv);
}

async function observeInterfaces(
  provider: LabProvider,
  machines: readonly LabMachine[],
): Promise<ReadonlyMap<string, string>> {
  const interfaces = new Map<string, string>();
  for (const machine of machines) {
    const peer = machines.find(({ name }) => name !== machine.name)?.ipv4[0];
    if (peer === undefined) throw new Error(`Fleet lab ${machine.name} has no MTU probe peer`);
    const route = await execSuccess(provider, machine.name, ['ip', '-j', 'route', 'get', peer]);
    let routeInput: unknown;
    try {
      routeInput = JSON.parse(route.stdout);
    } catch (cause) {
      throw new Error(`Fleet lab ${machine.name} returned malformed route JSON`, { cause });
    }
    const routes: unknown[] = Array.isArray(routeInput) ? routeInput : [];
    const firstRoute: unknown = routes.at(0);
    if (!isRecord(firstRoute) || typeof firstRoute['dev'] !== 'string') {
      throw new Error(`Fleet lab ${machine.name} route lacks a private interface`);
    }
    interfaces.set(machine.name, firstRoute['dev']);
  }
  return interfaces;
}

/** Decode the independently observed Linux machine identity used for enrollment matching. */
export function decodeMachineId(stdout: string, machineName: string): string {
  const machineId = stdout.trim();
  if (!/^[0-9a-f]{32}$/.test(machineId)) {
    // Proof: accepting malformed provider-observed identity let a different Kubernetes machine
    // satisfy enrollment validation under the expected node name.
    throw new Error(`Fleet lab ${machineName} returned an invalid machine identity`);
  }
  return machineId;
}

/** Decode a k3s token that binds the expected enrollment principal to the cluster CA. */
export function decodeSecureK3sToken(stdout: string, principal: 'node' | 'server'): string {
  const token = stdout.trim();
  const pattern = new RegExp(`^K10[0-9a-f]{64}::${principal}:[0-9a-f]{64}$`);
  if (!pattern.test(token)) {
    // Proof: accepting the retained 64-hex bootstrap credential made a live agent join warn that
    // the cluster CA was not trusted; the production decoder negative requires the CA-bound form.
    throw new Error(`Fleet lab did not receive a CA-bound ${principal} enrollment token`);
  }
  return token;
}

async function observeMachineIds(
  provider: LabProvider,
  machines: readonly LabMachine[],
): Promise<ReadonlyMap<string, string>> {
  const machineIds = new Map<string, string>();
  for (const machine of machines) {
    const identity = await execSuccess(provider, machine.name, ['cat', '/etc/machine-id']);
    machineIds.set(machine.name, decodeMachineId(identity.stdout, machine.name));
  }
  return machineIds;
}

async function observeK3sEnrollmentTokens(
  provider: LabProvider,
  serverName: string,
): Promise<K3sEnrollmentTokens> {
  const serverToken = await execSuccess(provider, serverName, [
    'sudo',
    'cat',
    '/var/lib/rancher/k3s/server/node-token',
  ]);
  const agentToken = await execSuccess(provider, serverName, [
    'sudo',
    'cat',
    '/var/lib/rancher/k3s/server/agent-token',
  ]);
  return {
    server: decodeSecureK3sToken(serverToken.stdout, 'server'),
    agent: decodeSecureK3sToken(agentToken.stdout, 'node'),
  };
}

async function writeKnownHosts(
  provider: LabProvider,
  stateDirectory: string,
  machines: readonly LabMachine[],
): Promise<void> {
  const lines: string[] = [];
  for (const machine of machines) {
    const address = primaryAddress(machine);
    const { kind, encoded } = decodeSshHostKey(await provider.hostKey(machine.name), machine.name);
    lines.push(`${address} ${kind} ${encoded}`);
  }
  const knownHostsPath = join(stateDirectory, 'known_hosts');
  await writeFile(knownHostsPath, `${lines.join('\n')}\n`, { mode: 0o600 });
  await chmod(knownHostsPath, 0o600);
}

/**
 * Write the secret-free inventory the `lab` discovery provider uses for controlled SSH facts: one
 * host per running lab machine, with the lab key and pinned host keys.
 */
async function writeDiscoveryInventory(
  provider: LabProvider,
  stateDirectory: string,
  machines: readonly LabMachine[],
): Promise<void> {
  const hosts: Record<string, Record<string, string>> = {};
  for (const machine of machines) {
    const sshExtraArguments = provider.ansibleSshExtraArguments(machine.name);
    hosts[machine.name] = {
      ansible_host: primaryAddress(machine),
      ...(sshExtraArguments === undefined ? {} : { ansible_ssh_extra_args: sshExtraArguments }),
    };
  }
  const inventory = {
    all: {
      vars: {
        ansible_user: 'puni',
        ansible_ssh_private_key_file: join(stateDirectory, 'id_fleet_lab'),
        ansible_ssh_common_args: `-o StrictHostKeyChecking=yes -o UserKnownHostsFile=${join(stateDirectory, 'known_hosts')}`,
      },
      hosts,
    },
  };
  const path = join(stateDirectory, 'discovery-inventory.json');
  await writeFile(path, `${JSON.stringify(inventory, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}

/** Decode only the provider-observed Ed25519 host key used by strict lab SSH. */
export function decodeSshHostKey(
  stdout: string,
  machineName: string,
): { readonly kind: 'ssh-ed25519'; readonly encoded: string } {
  const fields = stdout.trim().split(/\s+/);
  const kind = fields.at(0);
  const encoded = fields.at(1);
  if (kind !== 'ssh-ed25519' || encoded === undefined || !/^[A-Za-z0-9+/=]+$/.test(encoded)) {
    // Proof: accepting a missing provider-observed host key would turn strict SSH checking into
    // an unusable or silently weaker lab boundary.
    throw new Error(`Fleet lab ${machineName} returned an invalid SSH host key`);
  }
  return { kind, encoded };
}

/** Read the retained cluster token, creating it only before a lab owns any machine. */
export async function readOrCreateClusterToken(
  stateDirectory: string,
  allowCreate: boolean,
): Promise<string> {
  const tokenPath = join(stateDirectory, 'cluster-token');
  try {
    const token = (await readFile(tokenPath, 'utf8')).trim();
    if (!/^[0-9a-f]{64}$/.test(token)) {
      // Proof: accepting a malformed retained token deferred the failure until k3s enrollment and
      // obscured the corrupt trusted state in the production token reader.
      throw new Error('Fleet lab cluster token is malformed');
    }
    return token;
  } catch (cause) {
    if (!isRecord(cause) || cause['code'] !== 'ENOENT') throw cause;
    if (!allowCreate) {
      // Proof: generating a replacement token for an existing lab would restart its server with a
      // credential that enrolled agents do not possess; the retained-state negative must refuse.
      throw new Error('Fleet lab cluster token is missing for existing machines', { cause });
    }
    const token = randomBytes(32).toString('hex');
    await writeFile(tokenPath, `${token}\n`, { mode: 0o600 });
    await chmod(tokenPath, 0o600);
    return token;
  }
}

function primaryAddress(machine: LabMachine): string {
  const address = machine.ipv4.at(0);
  if (address === undefined)
    throw new Error(`Fleet lab machine ${machine.name} has no IPv4 address`);
  return address;
}

async function writeLabState(
  root: string,
  request: LabRequest,
  provider: LabProvider,
  machines: readonly LabMachine[],
  bootstrap: LabBootstrap,
  allowTokenCreate: boolean,
  enrollmentTokens?: K3sEnrollmentTokens,
): Promise<string> {
  const toolchain = await readToolchain(join(root, 'infra/versions/toolchain.json'));
  const token = await readOrCreateClusterToken(bootstrap.stateDirectory, allowTokenCreate);
  const server = machines.find(({ name }) => name.endsWith('-server-1'));
  if (server === undefined) throw new Error('Fleet lab server is absent');
  const serverAddress = primaryAddress(server);
  const enrolledAddresses = machines.map(primaryAddress);
  const interfaces = await observeInterfaces(provider, machines);
  const machineIds = await observeMachineIds(provider, machines);
  const hosts: Record<string, unknown> = {};
  for (const machine of machines) {
    const privateInterface = interfaces.get(machine.name);
    if (privateInterface === undefined) {
      throw new Error(`Fleet lab ${machine.name} has no observed private interface`);
    }
    const machineId = machineIds.get(machine.name);
    if (machineId === undefined) {
      throw new Error(`Fleet lab ${machine.name} has no observed machine identity`);
    }
    const sshExtraArguments = provider.ansibleSshExtraArguments(machine.name);
    hosts[machine.name] = {
      ansible_host: primaryAddress(machine),
      ...(sshExtraArguments === undefined ? {} : { ansible_ssh_extra_args: sshExtraArguments }),
      puni_node_name: machine.name,
      puni_node_ip: primaryAddress(machine),
      puni_machine_id: machineId,
      puni_private_interface: privateInterface,
      puni_node_capabilities: machine.name.includes('-server-')
        ? request.profile === 'workers'
          ? ['control-plane']
          : ['control-plane', 'product', 'ingress']
        : request.profile === 'workers'
          ? ['execution']
          : ['observability'],
    };
  }
  const serverName = server.name;
  const agentNames = machines
    .filter(({ name }) => name.includes('-agent-'))
    .map(({ name }) => name);
  const inventory = {
    all: {
      vars: {
        ansible_user: 'puni',
        ansible_ssh_private_key_file: bootstrap.privateKeyPath,
        ansible_ssh_common_args: `-o StrictHostKeyChecking=yes -o UserKnownHostsFile=${join(bootstrap.stateDirectory, 'known_hosts')}`,
        puni_cluster_id: request.profile,
        puni_operator_name: 'puni',
        puni_operator_authorized_keys: [bootstrap.publicKey],
        puni_swap_enabled: false,
        puni_private_mtu: 1400,
        puni_cluster_cidr: '10.42.0.0/16',
        puni_service_cidr: '10.43.0.0/16',
        puni_enrolled_private_addresses: enrolledAddresses,
        puni_required_mounts: [{ path: '/', minimum_bytes: 8_000_000_000 }],
        puni_k3s_version: toolchain.binaries.k3s.version,
        puni_k3s_url: toolchain.binaries.k3s.url,
        puni_k3s_sha256: toolchain.binaries.k3s.sha256,
        puni_validation_image: `${toolchain.runtimeImages.k3dNode.name}@${toolchain.runtimeImages.k3dNode.digest}`,
        puni_k3s_server_credential: token,
        puni_k3s_agent_credential: token,
        ...(enrollmentTokens === undefined
          ? {}
          : {
              puni_k3s_server_token: enrollmentTokens.server,
              puni_k3s_agent_token: enrollmentTokens.agent,
            }),
        puni_registration_url: `https://${serverAddress}:6443`,
        puni_registration_host: serverName,
        puni_tls_sans: [serverAddress],
        puni_disable_cloud_controller: false,
      },
      children: {
        k3s_bootstrap_servers: { hosts: { [serverName]: hosts[serverName] } },
        k3s_join_servers: { hosts: {} },
        k3s_agents: {
          hosts: Object.fromEntries(agentNames.map((name) => [name, hosts[name]])),
        },
      },
    },
  };
  const inventoryPath = join(bootstrap.stateDirectory, 'inventory.json');
  await writeFile(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`, { mode: 0o600 });
  await chmod(inventoryPath, 0o600);
  return inventoryPath;
}

/** Require complete expected-host recaps and only the explicitly modeled probe mutations. */
export function requireStableRecap(
  stdout: string,
  expectedHosts: readonly string[],
  expectedChanges: number,
): void {
  const marker = stdout.indexOf('PLAY RECAP');
  if (marker < 0) {
    // Proof: accepting output with no recap made a truncated production Ansible run look stable.
    throw new Error('Ansible output is missing PLAY RECAP');
  }
  const recaps = new Map<string, { changed: number; unreachable: number; failed: number }>();
  const pattern =
    /^(\S+)\s*:\s+ok=\d+\s+changed=(\d+)\s+unreachable=(\d+)\s+failed=(\d+)(?:\s|$)/gm;
  for (const match of stdout.slice(marker).matchAll(pattern)) {
    const host = match[1];
    const changed = match[2];
    const unreachable = match[3];
    const failed = match[4];
    recaps.set(host, {
      changed: Number.parseInt(changed, 10),
      unreachable: Number.parseInt(unreachable, 10),
      failed: Number.parseInt(failed, 10),
    });
  }
  if (recaps.size !== expectedHosts.length || expectedHosts.some((host) => !recaps.has(host))) {
    // Proof: accepting an empty or partial recap certified convergence without every expected host.
    throw new Error('Ansible PLAY RECAP does not contain every expected host');
  }
  for (const [host, recap] of recaps) {
    if (recap.unreachable !== 0 || recap.failed !== 0) {
      // Proof: accepting `failed=1` made the second-convergence production decoder report a broken
      // host as stable.
      throw new Error(`Ansible recap reports an unreachable or failed host: ${host}`);
    }
    if (recap.changed !== expectedChanges) {
      // Proof: accepting an unmodeled change made the second-convergence production decoder report
      // stable host configuration despite unexplained mutation.
      throw new Error(`Ansible second convergence changed host state unexpectedly: ${host}`);
    }
  }
}

async function converge(
  root: string,
  inventoryPath: string,
  profile: LabProfile,
  machines: readonly LabMachine[],
  requireStable: boolean,
  playbooks: readonly ('bootstrap.yml' | 'join.yml' | 'validate-enrollment.yml')[],
): Promise<void> {
  const toolchain = await readToolchain(join(root, 'infra/versions/toolchain.json'));
  const image = `${toolchain.controller.image}@${toolchain.controller.digest}`;
  const serverNames = machines
    .filter(({ name }) => name.endsWith('-server-1'))
    .map(({ name }) => name);
  const agentNames = machines
    .filter(({ name }) => name.includes('-agent-'))
    .map(({ name }) => name);
  const validationRunId = randomBytes(8).toString('hex');
  for (const playbook of playbooks) {
    const expectedHosts = playbook === 'join.yml' ? agentNames : serverNames;
    const expectedChanges =
      playbook === 'validate-enrollment.yml' ? (profile === 'workers' ? 2 : 1) : 0;
    const outcome = await requireSuccess('docker', [
      'run',
      '--rm',
      '--network',
      'host',
      '--env',
      `ANSIBLE_CONFIG=${join(root, 'infra/ansible/ansible.cfg')}`,
      '--volume',
      `${root}:${root}:ro`,
      '--workdir',
      root,
      image,
      'timeout',
      '--signal=TERM',
      // Proof: removing the container-side kill deadline made the locked-controller invocation
      // contract test fail, leaving a disconnected Docker workload able to continue mutation.
      '--kill-after=0.1s',
      `${String(COMMAND_TIMEOUT_MS / 1000)}s`,
      'ansible-playbook',
      '--inventory',
      inventoryPath,
      ...(playbook === 'validate-enrollment.yml'
        ? ['--extra-vars', JSON.stringify({ puni_validation_run_id: validationRunId })]
        : []),
      join(root, 'infra/ansible/playbooks', playbook),
    ]);
    if (/failed=[1-9]/.test(outcome.stdout)) {
      throw new Error(`Ansible ${playbook} reported a failed host`);
    }
    if (requireStable) requireStableRecap(outcome.stdout, expectedHosts, expectedChanges);
  }
}

/** Rewrite the server's admin kubeconfig to the lab tunnel endpoint and the cluster context. */
export function renderLabKubeconfig(source: string, contextName: string, apiPort: number): string {
  const document: unknown = parse(source);
  if (!isRecord(document)) throw new Error('k3s kubeconfig is not a mapping');
  const clusters = document['clusters'];
  const users = document['users'];
  const contexts = document['contexts'];
  const cluster: unknown = Array.isArray(clusters) ? clusters.at(0) : undefined;
  const user: unknown = Array.isArray(users) ? users.at(0) : undefined;
  const clusterBody = isRecord(cluster) ? cluster['cluster'] : undefined;
  const userBody = isRecord(user) ? user['user'] : undefined;
  if (
    !Array.isArray(clusters) ||
    clusters.length !== 1 ||
    !Array.isArray(users) ||
    users.length !== 1 ||
    !Array.isArray(contexts) ||
    contexts.length !== 1 ||
    !isRecord(clusterBody) ||
    clusterBody['server'] !== 'https://127.0.0.1:6443' ||
    typeof clusterBody['certificate-authority-data'] !== 'string' ||
    !isRecord(userBody)
  ) {
    // Proof: dropping the server comparison made `refuses a kubeconfig that does not address the
    // local admin endpoint` rewrite https://10.0.0.9:6443 onto the tunnel.
    throw new Error('k3s kubeconfig does not have the single local admin shape');
  }
  return stringify({
    apiVersion: 'v1',
    kind: 'Config',
    clusters: [
      {
        name: contextName,
        cluster: {
          'certificate-authority-data': clusterBody['certificate-authority-data'],
          server: `https://127.0.0.1:${String(apiPort)}`,
        },
      },
    ],
    users: [{ name: contextName, user: userBody }],
    contexts: [{ name: contextName, context: { cluster: contextName, user: contextName } }],
    'current-context': contextName,
  });
}

function apiPortFor(stateDirectory: string, prefix: string): number {
  return planQemuMachine(stateDirectory, prefix, `${prefix}server-1`).apiPort;
}

async function writeKubeconfig(
  provider: LabProvider,
  request: LabRequest,
  stateDirectory: string,
  prefix: string,
): Promise<void> {
  const source = await execSuccess(provider, `${prefix}server-1`, [
    'sudo',
    'cat',
    '/etc/rancher/k3s/k3s.yaml',
  ]);
  const path = join(stateDirectory, 'kubeconfig');
  await writeFile(
    path,
    renderLabKubeconfig(source.stdout, request.profile, apiPortFor(stateDirectory, prefix)),
    { mode: 0o600 },
  );
  await chmod(path, 0o600);
}

/** Forward the lab API to loopback until the operator stops it; it never returns successfully. */
async function runLabTunnel(
  provider: LabProvider,
  stateDirectory: string,
  prefix: string,
): Promise<void> {
  const apiPort = apiPortFor(stateDirectory, prefix);
  const sshArguments = provider.sshArguments(`${prefix}server-1`);
  process.stdout.write(`fleet lab API tunnel: https://127.0.0.1:${String(apiPort)}\n`);
  const child = Bun.spawn(
    [
      'ssh',
      '-N',
      '-o',
      'ExitOnForwardFailure=yes',
      '-o',
      'ServerAliveInterval=15',
      '-L',
      `127.0.0.1:${String(apiPort)}:127.0.0.1:6443`,
      ...sshArguments,
    ],
    { stdin: 'ignore', stdout: 'inherit', stderr: 'inherit' },
  );
  const exitCode = await child.exited;
  throw new Error(`Fleet lab API tunnel exited with ${String(exitCode)}`);
}

async function runSpare(
  request: LabRequest,
  provider: LabProvider,
  operation: LabOperation,
  bootstrap: LabBootstrap,
): Promise<void> {
  const name = spareName(operation.prefix);
  for (const command of operation.commands) {
    await provider.execute(command, bootstrap.cloudInitPath);
  }
  const running = (await provider.list()).filter(
    (machine) => machine.name.startsWith(operation.prefix) && machine.state === 'Running',
  );
  const spare = running.find((machine) => machine.name === name);
  if (spare === undefined) throw new Error(`Fleet lab did not start ${name}`);
  await provider.ensureNetwork();
  await writeKnownHosts(provider, bootstrap.stateDirectory, running);
  await writeDiscoveryInventory(provider, bootstrap.stateDirectory, running);
  await provider.waitReady(name);
  const machineId = decodeMachineId(
    (await execSuccess(provider, name, ['cat', '/etc/machine-id'])).stdout,
    name,
  );
  const sparePath = join(bootstrap.stateDirectory, 'spare.json');
  const sshExtraArguments = provider.ansibleSshExtraArguments(name);
  await writeFile(
    sparePath,
    `${JSON.stringify({
      name,
      privateAddress: primaryAddress(spare),
      machineId,
      ...(sshExtraArguments === undefined ? {} : { ansibleSshExtraArguments: sshExtraArguments }),
    })}\n`,
    { mode: 0o600 },
  );
  await chmod(sparePath, 0o600);
  process.stdout.write(`${JSON.stringify({ labId: request.labId, spare: name, machineId })}\n`);
}

async function fenceMember(
  request: LabRequest,
  stateDirectory: string,
  operation: LabOperation,
  owned: readonly LabMachine[],
): Promise<void> {
  const name = `${operation.prefix}${request.member ?? ''}`;
  if (!owned.some((machine) => machine.name === name && machine.state === 'Running')) {
    // Proof: disabling this refusal made the exact-owned-machines test's second fence of an already
    // stopped machine succeed and rewrite power-off evidence the provider never observed.
    throw new Error(`Fleet lab fence target ${name} is not a running owned machine`);
  }
  const machine = planQemuMachine(stateDirectory, operation.prefix, name);
  const pid = await stopQemuMachine(machine, 'SIGKILL');
  if (pid === undefined) throw new Error(`Fleet lab fence target ${name} stopped concurrently`);
  const evidence = await writeQemuFenceEvidence(
    stateDirectory,
    machine,
    pid,
    new Date().toISOString(),
  );
  process.stdout.write(`${JSON.stringify({ fenced: name, evidence })}\n`);
}

/** Create, inspect, converge, fence, or delete only this lab's disposable machines. */
export async function runVmLab(arguments_: readonly string[], root: string): Promise<void> {
  const request = parseLabRequest(arguments_);
  if (request.action === 'up') await requireAnsibleLayout(root);
  const stateDirectory = stateDirectoryFor(root, request);
  const provider =
    request.provider === 'qemu'
      ? await createQemuProvider(root, request, stateDirectory)
      : await createMultipassProvider(root);
  const before = await provider.list();
  const operation = planLabOperation(request, before);
  const ownedBefore = before.filter(({ name }) => name.startsWith(operation.prefix));
  if (request.action === 'status') {
    process.stdout.write(`${JSON.stringify({ labId: request.labId, machines: ownedBefore })}\n`);
    return;
  }
  if (request.action === 'tunnel') {
    await runLabTunnel(provider, stateDirectory, operation.prefix);
    return;
  }
  if (request.action === 'fence') {
    await fenceMember(request, stateDirectory, operation, ownedBefore);
    return;
  }
  if (request.action === 'down') {
    for (const command of operation.commands) await provider.execute(command, undefined);
    return;
  }
  const bootstrap = await prepareLabBootstrap(root, request);
  if (request.action === 'spare') {
    await runSpare(request, provider, operation, bootstrap);
    return;
  }
  for (const command of operation.commands) {
    await provider.execute(command, bootstrap.cloudInitPath);
  }
  const expected = new Set(expectedNames(operation.prefix, request.profile));
  const listed = await provider.list();
  const after = listed.filter(({ name }) => expected.has(name));
  if (after.length !== expected.size) throw new Error('Fleet lab provider did not create the lab');
  if (after.some(({ state }) => state !== 'Running')) {
    // Proof: accepting a stopped expected VM advanced into SSH/key capture and obscured the
    // incomplete provider convergence in the production lab state negative.
    throw new Error('Fleet lab provider did not start every expected lab machine');
  }
  const serverName = `${operation.prefix}server-1`;
  const running = listed.filter(
    ({ name, state }) => name.startsWith(operation.prefix) && state === 'Running',
  );
  await writeKnownHosts(provider, bootstrap.stateDirectory, running);
  await writeDiscoveryInventory(provider, bootstrap.stateDirectory, running);
  await provider.ensureNetwork();
  for (const machine of after) await provider.waitReady(machine.name);
  let inventoryPath = await writeLabState(
    root,
    request,
    provider,
    after,
    bootstrap,
    ownedBefore.length === 0,
  );
  await converge(root, inventoryPath, request.profile, after, false, ['bootstrap.yml']);
  let enrollmentTokens = await observeK3sEnrollmentTokens(provider, serverName);
  inventoryPath = await writeLabState(
    root,
    request,
    provider,
    after,
    bootstrap,
    false,
    enrollmentTokens,
  );
  await converge(root, inventoryPath, request.profile, after, false, [
    'join.yml',
    'validate-enrollment.yml',
  ]);
  await converge(root, inventoryPath, request.profile, after, true, ['bootstrap.yml']);
  enrollmentTokens = await observeK3sEnrollmentTokens(provider, serverName);
  inventoryPath = await writeLabState(
    root,
    request,
    provider,
    after,
    bootstrap,
    false,
    enrollmentTokens,
  );
  await converge(root, inventoryPath, request.profile, after, true, [
    'join.yml',
    'validate-enrollment.yml',
  ]);
  await writeKubeconfig(provider, request, bootstrap.stateDirectory, operation.prefix);
}
