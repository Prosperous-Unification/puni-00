import { randomBytes } from 'node:crypto';
import { access, chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { readToolchain } from './contracts';

type LabAction = 'up' | 'down' | 'status';
type LabProfile = 'platform' | 'workers';

export interface LabRequest {
  readonly action: LabAction;
  readonly labId: string;
  readonly profile: LabProfile;
  readonly sshPublicKey?: string;
  readonly sshPrivateKey?: string;
}

export interface LabMachine {
  readonly name: string;
  readonly state: string;
  readonly ipv4: readonly string[];
}

interface LabCommand {
  readonly executable: 'multipass';
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

const LAB_ID = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
const MULTIPASS_VERSION = '1.16.4';
const COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
const CLOUD_INIT_ARGUMENT = '__PUNI_CLOUD_INIT__';
const IPV4 = /^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

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
  if (action !== 'up' && action !== 'down' && action !== 'status') {
    // Proof: accepting an unknown lifecycle verb let an unreviewed action reach provider setup in
    // the production parser negative.
    throw new Error(`Fleet lab action must be up, down, or status: ${action ?? 'missing'}`);
  }
  const flags = new Map<string, string>();
  for (let position = 1; position < arguments_.length; position += 2) {
    const flag = arguments_.at(position);
    if (!flag?.startsWith('--')) {
      // Proof: accepting a positional machine name let a down request target a host outside its
      // derived ownership prefix in the production parser negative.
      throw new Error(`Unexpected fleet lab argument at position ${String(position)}`);
    }
    if (!['--lab-id', '--profile', '--ssh-public-key', '--ssh-private-key'].includes(flag)) {
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
  const sshPublicKey = flags.get('--ssh-public-key');
  const sshPrivateKey = flags.get('--ssh-private-key');
  if (action === 'up' && (sshPublicKey === undefined || sshPrivateKey === undefined)) {
    // Proof: accepting an up request without both key paths created machines that strict SSH could
    // not authenticate to in the production parser negative.
    throw new Error('Fleet lab up requires --ssh-public-key and --ssh-private-key');
  }
  if (action !== 'up' && (sshPublicKey !== undefined || sshPrivateKey !== undefined)) {
    // Proof: accepting unrelated key flags on status/down made read/delete operations consume
    // secret-bearing input without purpose.
    throw new Error(`Fleet lab ${action} does not accept SSH key flags`);
  }
  return {
    action,
    labId,
    profile,
    ...(sshPublicKey === undefined ? {} : { sshPublicKey: resolve(sshPublicKey) }),
    ...(sshPrivateKey === undefined ? {} : { sshPrivateKey: resolve(sshPrivateKey) }),
  };
}

function expectedNames(prefix: string, profile: LabProfile): readonly string[] {
  const agents = profile === 'platform' ? 1 : 2;
  return [
    `${prefix}server-1`,
    ...Array.from({ length: agents }, (_, position) => `${prefix}agent-${String(position + 1)}`),
  ];
}

/** Plan lifecycle commands only for names inside the exact lab ownership prefix. */
export function planLabOperation(
  request: LabRequest,
  machines: readonly LabMachine[],
): LabOperation {
  const prefix = `puni-fleet-${request.labId}-${request.profile}-`;
  const expected = expectedNames(prefix, request.profile);
  const owned = machines.filter(({ name }) => name.startsWith(prefix));
  for (const machine of owned) {
    if (!expected.includes(machine.name)) {
      // Proof: accepting prefix-only ownership let a same-prefix arbitrary machine enter the delete
      // set in the production planner negative.
      throw new Error(`Fleet lab found unexpected owned machine ${machine.name}`);
    }
  }
  if (request.action === 'status') return { prefix, commands: [] };
  if (request.action === 'down') {
    const names = owned.map(({ name }) => name).sort();
    return {
      prefix,
      commands:
        names.length === 0
          ? []
          : [{ executable: 'multipass', arguments: ['delete', '--purge', ...names] }],
    };
  }
  const existing = new Set(owned.map(({ name }) => name));
  const starts: LabCommand[] = owned
    .filter(({ state }) => state !== 'Running')
    .map(({ name }) => ({ executable: 'multipass', arguments: ['start', name] }));
  return {
    prefix,
    commands: [
      ...starts,
      ...expected
        .filter((name) => !existing.has(name))
        .map((name) => ({
          executable: 'multipass' as const,
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
        })),
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
): Promise<CommandOutcome> {
  const child = Bun.spawn([executable, ...arguments_], {
    detached: true,
    stdout: 'pipe',
    stderr: 'pipe',
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

async function requireSuccess(
  executable: string,
  arguments_: readonly string[],
): Promise<CommandOutcome> {
  const outcome = await runLabCommand(executable, arguments_);
  if (outcome.exitCode !== 0) {
    // Proof: accepting a fake Multipass exit 42 made the production status command report success
    // without provider inventory.
    throw new Error(
      `${executable} ${arguments_.join(' ')} failed with exit ${String(outcome.exitCode)}: ${outcome.stderr}`,
    );
  }
  return outcome;
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

async function listMachines(): Promise<readonly LabMachine[]> {
  const listing = await requireSuccess('multipass', ['list', '--format', 'json']);
  return decodeMachineList(listing.stdout);
}

function stateDirectoryFor(root: string, request: LabRequest): string {
  return join(root, '.puni/fleet-labs', `${request.labId}-${request.profile}`);
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

async function observeInterfaces(
  machines: readonly LabMachine[],
): Promise<ReadonlyMap<string, string>> {
  const interfaces = new Map<string, string>();
  for (const machine of machines) {
    const peer = machines.find(({ name }) => name !== machine.name)?.ipv4[0];
    if (peer === undefined) throw new Error(`Fleet lab ${machine.name} has no MTU probe peer`);
    const route = await requireSuccess('multipass', [
      'exec',
      machine.name,
      '--',
      'ip',
      '-j',
      'route',
      'get',
      peer,
    ]);
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
  machines: readonly LabMachine[],
): Promise<ReadonlyMap<string, string>> {
  const machineIds = new Map<string, string>();
  for (const machine of machines) {
    const identity = await requireSuccess('multipass', [
      'exec',
      machine.name,
      '--',
      'cat',
      '/etc/machine-id',
    ]);
    machineIds.set(machine.name, decodeMachineId(identity.stdout, machine.name));
  }
  return machineIds;
}

async function observeK3sEnrollmentTokens(serverName: string): Promise<K3sEnrollmentTokens> {
  const serverToken = await requireSuccess('multipass', [
    'exec',
    serverName,
    '--',
    'sudo',
    'cat',
    '/var/lib/rancher/k3s/server/node-token',
  ]);
  const agentToken = await requireSuccess('multipass', [
    'exec',
    serverName,
    '--',
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
  bootstrap: LabBootstrap,
  machines: readonly LabMachine[],
): Promise<void> {
  const lines: string[] = [];
  for (const machine of machines) {
    const address = primaryAddress(machine);
    const hostKey = await requireSuccess('multipass', [
      'exec',
      machine.name,
      '--',
      'cat',
      '/etc/ssh/ssh_host_ed25519_key.pub',
    ]);
    const { kind, encoded } = decodeSshHostKey(hostKey.stdout, machine.name);
    lines.push(`${address} ${kind} ${encoded}`);
  }
  const knownHostsPath = join(bootstrap.stateDirectory, 'known_hosts');
  await writeFile(knownHostsPath, `${lines.join('\n')}\n`, { mode: 0o600 });
  await chmod(knownHostsPath, 0o600);
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
  const interfaces = await observeInterfaces(machines);
  const machineIds = await observeMachineIds(machines);
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
    hosts[machine.name] = {
      ansible_host: primaryAddress(machine),
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

/** Create, inspect, converge, or delete only this lab's disposable Multipass machines. */
export async function runVmLab(arguments_: readonly string[], root: string): Promise<void> {
  const request = parseLabRequest(arguments_);
  if (request.action === 'up') await requireAnsibleLayout(root);
  const toolchain = await readToolchain(join(root, 'infra/versions/toolchain.json'));
  if (toolchain.binaries.multipass.version !== `1.16.4+snap.18737`) {
    throw new Error(`Unsupported Multipass lock ${toolchain.binaries.multipass.version}`);
  }
  const version = await requireSuccess('multipass', ['version']);
  requireMultipassVersion(version.stdout);
  const before = await listMachines();
  const operation = planLabOperation(request, before);
  const ownedBefore = before.filter(({ name }) => name.startsWith(operation.prefix));
  const bootstrap = request.action === 'up' ? await prepareLabBootstrap(root, request) : undefined;
  for (const command of operation.commands) {
    const commandArguments =
      request.action === 'up'
        ? command.arguments.map((argument) =>
            argument === CLOUD_INIT_ARGUMENT && bootstrap !== undefined
              ? bootstrap.cloudInitPath
              : argument,
          )
        : command.arguments;
    await requireSuccess(command.executable, commandArguments);
  }
  if (request.action === 'status') {
    const owned = before.filter(({ name }) => name.startsWith(operation.prefix));
    process.stdout.write(`${JSON.stringify({ labId: request.labId, machines: owned })}\n`);
    return;
  }
  if (request.action === 'down') return;
  const expected = new Set(expectedNames(operation.prefix, request.profile));
  const after = (await listMachines()).filter(({ name }) => expected.has(name));
  if (after.length !== expected.size) throw new Error('Multipass did not create the complete lab');
  if (after.some(({ state }) => state !== 'Running')) {
    // Proof: accepting a stopped expected VM advanced into SSH/key capture and obscured the
    // incomplete provider convergence in the production lab state negative.
    throw new Error('Multipass did not start every expected lab machine');
  }
  if (bootstrap === undefined) throw new Error('Fleet lab up lost its bootstrap state');
  const serverName = `${operation.prefix}-server-1`;
  await writeKnownHosts(bootstrap, after);
  let inventoryPath = await writeLabState(
    root,
    request,
    after,
    bootstrap,
    ownedBefore.length === 0,
  );
  await converge(root, inventoryPath, request.profile, after, false, ['bootstrap.yml']);
  let enrollmentTokens = await observeK3sEnrollmentTokens(serverName);
  inventoryPath = await writeLabState(root, request, after, bootstrap, false, enrollmentTokens);
  await converge(root, inventoryPath, request.profile, after, false, [
    'join.yml',
    'validate-enrollment.yml',
  ]);
  await converge(root, inventoryPath, request.profile, after, true, ['bootstrap.yml']);
  enrollmentTokens = await observeK3sEnrollmentTokens(serverName);
  inventoryPath = await writeLabState(root, request, after, bootstrap, false, enrollmentTokens);
  await converge(root, inventoryPath, request.profile, after, true, [
    'join.yml',
    'validate-enrollment.yml',
  ]);
}
