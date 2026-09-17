import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { chmod, open, readFile, stat, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { ApplyDependencies, ApplyObservation, OperationLease } from './apply';
import { decodeFleetNode, readToolchain } from './contracts';
import type { OperationPlan } from './plan';
import {
  decodeTerraformPlan,
  decodeTerraformStateIdentity,
  type ProvisioningInstance,
  provisioningTerraformAddresses,
  reconcileProvisioningOwnership,
  type TerraformProvisioningExpectation,
} from './terraform';

const commandTimeoutMs = 120_000;
const leaseDurationSeconds = 300;

export interface TerraformPlanEvidence {
  readonly terraformPlanSha256: string;
  readonly terraformBackendEvidenceSha256: string;
  readonly terraformStateLineage: string;
  readonly terraformStateSerial: number;
}

export interface CommandRequest {
  readonly executable: string;
  readonly arguments: readonly string[];
  readonly cwd?: string;
  readonly stdin?: string;
}

export interface CommandResponse {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type RunCommand = (request: CommandRequest) => Promise<CommandResponse>;
export type ObserveProviderOwnership = () => Promise<readonly ProvisioningInstance[]>;

interface KubernetesLeaseDocument {
  readonly resourceVersion: string;
  readonly holder: string;
  readonly renewedAt: string;
  readonly durationSeconds: number;
}

function requireRecord(input: unknown, context: string): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error(`${context} is not an object`);
  }
  return input as Record<string, unknown>;
}

function parseJson(source: string, context: string): unknown {
  try {
    return JSON.parse(source) as unknown;
  } catch (cause) {
    throw new Error(`${context} returned malformed JSON`, { cause });
  }
}

async function readBackendEvidence(
  path: string,
  expectedSha256: string,
  cloudAccount: string,
  enforceEnvironment: boolean,
): Promise<void> {
  const source = await readFile(path);
  if (createHash('sha256').update(source).digest('hex') !== expectedSha256) {
    // Proof: changing one backend-evidence byte makes the production apply negative stop before
    // Terraform init or any provider mutation.
    throw new Error('Terraform backend evidence differs from the reviewed SHA-256');
  }
  if (((await stat(path)).mode & 0o077) !== 0) {
    throw new Error('Terraform backend evidence must be owner-only');
  }
  const evidence = requireRecord(
    parseJson(source.toString('utf8'), 'Terraform backend evidence'),
    'Terraform backend evidence',
  );
  const exactKeys = [
    'schemaVersion',
    'cloudAccount',
    'address',
    'lockAddress',
    'unlockAddress',
    'encryptedAtRest',
    'accessControlled',
    'versioned',
    'verifiedAt',
  ];
  if (
    Object.keys(evidence).sort().join('\0') !== [...exactKeys].sort().join('\0') ||
    evidence['schemaVersion'] !== 1 ||
    evidence['cloudAccount'] !== cloudAccount ||
    evidence['encryptedAtRest'] !== true ||
    evidence['accessControlled'] !== true ||
    evidence['versioned'] !== true
  ) {
    throw new Error('Terraform backend evidence is incomplete or names another cloud account');
  }
  const address = evidence['address'];
  const lockAddress = evidence['lockAddress'];
  const unlockAddress = evidence['unlockAddress'];
  const verifiedAt = evidence['verifiedAt'];
  if (
    typeof address !== 'string' ||
    typeof lockAddress !== 'string' ||
    typeof unlockAddress !== 'string' ||
    ![address, lockAddress, unlockAddress].every((url) => url.startsWith('https://')) ||
    typeof verifiedAt !== 'string' ||
    !Number.isFinite(Date.parse(verifiedAt)) ||
    new Date(Date.parse(verifiedAt)).toISOString() !== verifiedAt
  ) {
    throw new Error('Terraform backend evidence lacks exact TLS endpoints or verification time');
  }
  if (
    enforceEnvironment &&
    (process.env['TF_HTTP_ADDRESS'] !== address ||
      process.env['TF_HTTP_LOCK_ADDRESS'] !== lockAddress ||
      process.env['TF_HTTP_UNLOCK_ADDRESS'] !== unlockAddress ||
      !process.env['TF_HTTP_USERNAME'] ||
      !process.env['TF_HTTP_PASSWORD'])
  ) {
    throw new Error('Terraform HTTP backend environment differs from verified evidence');
  }
}

export async function runBoundedCommand(
  request: CommandRequest,
  timeoutMs: number = commandTimeoutMs,
): Promise<CommandResponse> {
  const child = Bun.spawn([request.executable, ...request.arguments], {
    ...(request.cwd === undefined ? {} : { cwd: request.cwd }),
    stdin: request.stdin === undefined ? 'ignore' : new Blob([request.stdin]),
    stdout: 'pipe',
    stderr: 'pipe',
    detached: true,
  });
  const completed = Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]).then(([exitCode, stdout, stderr]) => ({ exitCode, stdout, stderr }));
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch (cause) {
        reject(new Error(`Cannot terminate timed-out ${request.executable}`, { cause }));
        return;
      }
      // Proof: the production command-runner negative leaves a signal-ignoring descendant alive
      // when this process-group kill is disabled.
      reject(new Error(`${request.executable} timed out after ${String(timeoutMs)}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([completed, expired]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

export function controllerRequest(
  root: string,
  image: string,
  digest: string,
  request: CommandRequest,
): CommandRequest {
  const arguments_: string[] = [
    'run',
    '--rm',
    ...(request.stdin === undefined ? [] : ['--interactive']),
    '--network',
    'host',
    '--volume',
    `${root}:${root}:ro`,
    '--workdir',
    request.cwd ?? root,
  ];
  const mounted = new Set<string>([root]);
  for (const name of ['HCLOUD_TOKEN', 'KUBECONFIG', 'SSH_AUTH_SOCK'] as const) {
    const value = process.env[name];
    if (!value) continue;
    arguments_.push('--env', name);
    if (name === 'KUBECONFIG') {
      for (const path of value.split(':')) {
        if (!mounted.has(path)) arguments_.push('--volume', `${path}:${path}:ro`);
        mounted.add(path);
      }
    }
    if (name === 'SSH_AUTH_SOCK' && !mounted.has(value)) {
      arguments_.push('--volume', `${value}:${value}`);
      mounted.add(value);
    }
  }
  for (const argument of request.arguments) {
    const path = argument.startsWith('@')
      ? argument.slice(1)
      : argument.startsWith('/')
        ? argument
        : undefined;
    if (path !== undefined && path.startsWith('/') && !path.startsWith(`${root}/`)) {
      const directory = dirname(path);
      if (!mounted.has(directory)) arguments_.push('--volume', `${directory}:${directory}:ro`);
      mounted.add(directory);
    }
  }
  arguments_.push(
    `${image}@${digest}`,
    'timeout',
    '--signal=TERM',
    '--kill-after=0.1s',
    `${String(commandTimeoutMs / 1000)}s`,
    request.executable,
    ...request.arguments,
  );
  return { executable: 'docker', arguments: arguments_, stdin: request.stdin };
}

function createProductionCommandRunner(root: string): RunCommand {
  return async (request) => {
    const toolchain = await readToolchain(join(root, 'infra/versions/toolchain.json'));
    if (request.executable === 'terraform') {
      const executable = Bun.which('terraform');
      if (executable === null) throw new Error('Locked Terraform executable is unavailable');
      const digest = createHash('sha256')
        .update(await readFile(executable))
        .digest('hex');
      if (digest !== toolchain.binaries.terraform.executableSha256) {
        // Proof: the wrong-Terraform-binary production negative reaches no init, plan, or apply.
        throw new Error('Terraform executable differs from the locked SHA-256');
      }
      return runBoundedCommand({ ...request, executable });
    }
    return runBoundedCommand(
      controllerRequest(root, toolchain.controller.image, toolchain.controller.digest, request),
    );
  };
}

async function requireCommand(
  run: RunCommand,
  request: CommandRequest,
  context: string,
): Promise<string> {
  let response: CommandResponse;
  try {
    response = await run(request);
  } catch (cause) {
    throw new Error(`${context} could not start ${request.executable}`, { cause });
  }
  if (response.exitCode !== 0) {
    throw new Error(`${context} failed with exit ${String(response.exitCode)}: ${response.stderr}`);
  }
  if (request.executable === 'ansible-inventory' && response.stderr.trim().length > 0) {
    // Proof: the exit-zero inventory-warning production negative cannot turn a failed provider
    // plugin into an empty list that would authorize another machine purchase.
    throw new Error(`${context} reported inventory diagnostics: ${response.stderr}`);
  }
  return response.stdout;
}

async function removePlanCandidate(path: string, prior?: unknown): Promise<void> {
  try {
    await unlink(path);
  } catch (cleanupCause) {
    if (cleanupCause instanceof Error && 'code' in cleanupCause && cleanupCause.code === 'ENOENT') {
      return;
    }
    if (prior !== undefined) {
      throw new AggregateError([prior, cleanupCause], `Cannot clean Terraform plan candidate`, {
        cause: cleanupCause,
      });
    }
    throw cleanupCause;
  }
}

/** Create and inspect the saved plan later bound into an immutable fleet operation plan. */
export async function prepareTerraformPlan(
  root: string,
  expected: TerraformProvisioningExpectation,
  cloudAccount: string,
  backendEvidencePath: string,
  variablesPath: string,
  outputPath: string,
  run?: RunCommand,
): Promise<TerraformPlanEvidence> {
  const commandRunner = run ?? createProductionCommandRunner(root);
  const backendSource = await readFile(backendEvidencePath);
  const terraformBackendEvidenceSha256 = createHash('sha256').update(backendSource).digest('hex');
  await readBackendEvidence(
    backendEvidencePath,
    terraformBackendEvidenceSha256,
    cloudAccount,
    run === undefined,
  );
  const terraformRoot = join(root, 'infra/terraform');
  const candidatePath = `${outputPath}.${randomBytes(8).toString('hex')}.new`;
  const reviewedVariablesPath = `${outputPath}.tfvars.json`;
  let wroteReviewedVariables = false;
  const terraform = (arguments_: readonly string[]) =>
    requireCommand(
      commandRunner,
      { executable: 'terraform', arguments: arguments_, cwd: terraformRoot },
      'Terraform planning command',
    );
  try {
    await terraform(['init', '-input=false', '-lockfile=readonly']);
    const validation = requireRecord(
      parseJson(await terraform(['validate', '-json']), 'Terraform validation'),
      'Terraform validation',
    );
    if (validation['valid'] !== true) {
      // Proof: the invalid-validation production adapter negative stops before Terraform plan.
      throw new Error(`Terraform validation failed: ${JSON.stringify(validation['diagnostics'])}`);
    }
    await terraform([
      'plan',
      '-input=false',
      '-lock=true',
      `-var-file=${variablesPath}`,
      `-out=${candidatePath}`,
    ]);
    const shown = parseJson(
      await terraform(['show', '-json', candidatePath]),
      'Terraform saved plan',
    );
    decodeTerraformPlan(
      shown,
      provisioningTerraformAddresses(expected.nodeId, expected.clusterId),
      expected,
    );
    const state = decodeTerraformState(
      await terraform(['state', 'pull']),
      expected.nodeId,
    ).identity;
    const variables = await readFile(variablesPath);
    const variablesDestination = await open(reviewedVariablesPath, 'wx', 0o600);
    try {
      await variablesDestination.writeFile(variables);
      await variablesDestination.sync();
    } finally {
      await variablesDestination.close();
    }
    wroteReviewedVariables = true;
    const savedPlan = await readFile(candidatePath);
    const destination = await open(outputPath, 'wx', 0o600);
    try {
      await destination.writeFile(savedPlan);
      await destination.sync();
    } finally {
      await destination.close();
    }
    await chmod(outputPath, 0o600);
    const evidence = {
      terraformPlanSha256: createHash('sha256').update(savedPlan).digest('hex'),
      terraformBackendEvidenceSha256,
      terraformStateLineage: state.lineage,
      terraformStateSerial: state.serial,
    };
    await removePlanCandidate(candidatePath);
    return evidence;
  } catch (cause) {
    if (wroteReviewedVariables) await unlink(reviewedVariablesPath);
    await removePlanCandidate(candidatePath, cause);
    throw cause;
  }
}

function clusterId(plan: OperationPlan): string {
  if (plan.request.kind === 'provision' || plan.request.kind === 'enroll') {
    return plan.request.clusterId;
  }
  const identity = plan.targetIdentities.find((candidate) => candidate.startsWith('cluster:'));
  if (identity === undefined) throw new Error('Operation plan has no cluster identity');
  return identity.slice('cluster:'.length);
}

function leaseName(plan: OperationPlan): string {
  return `puni-fleet-${clusterId(plan)}`;
}

function decodeLease(source: string): KubernetesLeaseDocument {
  const document = requireRecord(parseJson(source, 'Kubernetes Lease'), 'Kubernetes Lease');
  const metadata = requireRecord(document['metadata'], 'Kubernetes Lease metadata');
  const spec = requireRecord(document['spec'], 'Kubernetes Lease spec');
  const resourceVersion = metadata['resourceVersion'];
  const holder = spec['holderIdentity'];
  const renewedAt = spec['renewTime'];
  const durationSeconds = spec['leaseDurationSeconds'];
  if (
    typeof resourceVersion !== 'string' ||
    typeof holder !== 'string' ||
    typeof renewedAt !== 'string' ||
    typeof durationSeconds !== 'number' ||
    !Number.isSafeInteger(durationSeconds) ||
    durationSeconds <= 0 ||
    !Number.isFinite(Date.parse(renewedAt))
  ) {
    throw new Error('Kubernetes Lease is missing exact ownership fields');
  }
  return { resourceVersion, holder, renewedAt, durationSeconds };
}

function leaseExpiresAt(lease: KubernetesLeaseDocument): string {
  return new Date(Date.parse(lease.renewedAt) + lease.durationSeconds * 1000).toISOString();
}

function leaseManifest(
  plan: OperationPlan,
  holder: string,
  renewedAt: string,
  resourceVersion?: string,
): string {
  return JSON.stringify({
    apiVersion: 'coordination.k8s.io/v1',
    kind: 'Lease',
    metadata: {
      name: leaseName(plan),
      namespace: 'puni-system',
      ...(resourceVersion === undefined ? {} : { resourceVersion }),
    },
    spec: {
      holderIdentity: holder,
      leaseDurationSeconds,
      acquireTime: renewedAt,
      renewTime: renewedAt,
    },
  });
}

function kubectlLeaseRequest(
  plan: OperationPlan,
  verb: 'get' | 'create' | 'replace',
  stdin?: string,
): CommandRequest {
  const common = ['--context', clusterId(plan), '--namespace', 'puni-system'];
  return verb === 'get'
    ? {
        executable: 'kubectl',
        arguments: [...common, 'get', 'lease', leaseName(plan), '-o', 'json'],
      }
    : {
        executable: 'kubectl',
        arguments: [...common, verb, '-f', '-', '-o', 'json'],
        stdin,
      };
}

async function readLease(
  run: RunCommand,
  plan: OperationPlan,
): Promise<KubernetesLeaseDocument | undefined> {
  const response = await run(kubectlLeaseRequest(plan, 'get'));
  if (response.exitCode === 0) return decodeLease(response.stdout);
  if (/\bNotFound\b|\bnot found\b/i.test(response.stderr)) return undefined;
  throw new Error(`Cannot read operation Lease: ${response.stderr}`);
}

async function acquireLease(
  run: RunCommand,
  plan: OperationPlan,
  holder: string,
  now: Date,
): Promise<OperationLease> {
  const existing = await readLease(run, plan);
  if (
    existing !== undefined &&
    existing.holder !== holder &&
    now.getTime() < Date.parse(leaseExpiresAt(existing))
  ) {
    // Proof: the concurrent-operation production adapter negative supplies an unexpired Lease for
    // another digest and observes no create/replace request.
    throw new Error(`Cluster ${clusterId(plan)} has an active operation Lease`);
  }
  const renewedAt = now.toISOString();
  const manifest = leaseManifest(plan, holder, renewedAt, existing?.resourceVersion);
  const verb = existing === undefined ? 'create' : 'replace';
  const source = await requireCommand(
    run,
    kubectlLeaseRequest(plan, verb, manifest),
    `Acquire operation Lease for ${clusterId(plan)}`,
  );
  const acquired = decodeLease(source);
  if (acquired.holder !== holder) {
    throw new Error('Kubernetes returned a Lease for a different operation');
  }
  return { owner: acquired.holder, expiresAt: leaseExpiresAt(acquired) };
}

async function renewLease(
  run: RunCommand,
  plan: OperationPlan,
  lease: OperationLease,
  now: Date,
): Promise<OperationLease> {
  const current = await readLease(run, plan);
  if (current?.holder !== lease.owner) {
    throw new Error('Operation Lease cannot be renewed because ownership changed');
  }
  const manifest = leaseManifest(plan, lease.owner, now.toISOString(), current.resourceVersion);
  const source = await requireCommand(
    run,
    kubectlLeaseRequest(plan, 'replace', manifest),
    `Renew operation Lease for ${clusterId(plan)}`,
  );
  const renewed = decodeLease(source);
  if (renewed.holder !== lease.owner) throw new Error('Renewed Lease has a different owner');
  return { owner: renewed.holder, expiresAt: leaseExpiresAt(renewed) };
}

async function releaseLease(
  run: RunCommand,
  plan: OperationPlan,
  lease: OperationLease,
): Promise<void> {
  const current = await readLease(run, plan);
  if (current === undefined) return;
  if (current.holder !== lease.owner) {
    throw new Error('Operation Lease ownership changed before release');
  }
  const releasedAt = new Date(0).toISOString();
  const source = await requireCommand(
    run,
    kubectlLeaseRequest(
      plan,
      'replace',
      leaseManifest(plan, lease.owner, releasedAt, current.resourceVersion),
    ),
    `Release operation Lease for ${clusterId(plan)}`,
  );
  const released = decodeLease(source);
  if (released.holder !== lease.owner || Date.parse(leaseExpiresAt(released)) > Date.now()) {
    throw new Error('Kubernetes did not persist the released Lease state');
  }
}

function decodeTerraformState(
  source: string,
  nodeId: string,
): {
  readonly identity: { readonly lineage: string; readonly serial: number };
  readonly providerState: 'ready' | 'pending-deletion';
  readonly managedInstance?: {
    readonly instanceId: string;
    readonly nodeId: string;
    readonly operationId: string;
  };
} {
  const state = requireRecord(parseJson(source, 'Terraform state'), 'Terraform state');
  const identity = decodeTerraformStateIdentity({
    lineage: state['lineage'],
    serial: state['serial'],
  });
  if (!Array.isArray(state['resources'])) throw new Error('Terraform state has no resources array');
  const matches: Record<string, unknown>[] = [];
  for (const resourceInput of state['resources']) {
    const resource = requireRecord(resourceInput, 'Terraform resource');
    if (resource['type'] !== 'hcloud_server' || resource['name'] !== 'node') continue;
    if (!Array.isArray(resource['instances'])) {
      throw new Error('Terraform hcloud_server.node has no instances array');
    }
    for (const instanceInput of resource['instances']) {
      const instance = requireRecord(instanceInput, 'Terraform server instance');
      if (instance['index_key'] === nodeId) matches.push(instance);
    }
  }
  if (matches.length > 1) {
    throw new Error(`Terraform state has duplicate instances for logical node ${nodeId}`);
  }
  const instance = matches.at(0);
  if (instance === undefined) return { identity, providerState: 'ready' };
  const attributes = requireRecord(instance['attributes'], 'Terraform server attributes');
  const labels = requireRecord(attributes['labels'], 'Terraform server state labels');
  const instanceId = attributes['id'];
  const logicalNode = labels['puni-logical-node'];
  const operationId = labels['puni-operation'];
  if (
    typeof instanceId !== 'string' ||
    instanceId.length === 0 ||
    logicalNode !== nodeId ||
    typeof operationId !== 'string' ||
    operationId.length === 0
  ) {
    // Proof: the wrong-instance Terraform-state production negative stops before provider apply.
    throw new Error(`Terraform state lacks exact ownership for logical node ${nodeId}`);
  }
  return {
    identity,
    providerState: attributes['status'] === 'deleting' ? 'pending-deletion' : 'ready',
    managedInstance: { instanceId, nodeId, operationId },
  };
}

function outputNodeIdentity(
  source: string,
  nodeId: string,
): { readonly instanceId: string; readonly privateAddress: string } {
  const identities = requireRecord(
    parseJson(source, 'Terraform node_identities output'),
    'Terraform node identities',
  );
  const node = requireRecord(identities[nodeId], `Terraform identity ${nodeId}`);
  const instanceId = node['instance_id'];
  const privateAddress = node['private_ip'];
  if (
    typeof instanceId !== 'string' ||
    instanceId.length === 0 ||
    typeof privateAddress !== 'string' ||
    privateAddress.length === 0
  ) {
    throw new Error(`Terraform identity ${nodeId} lacks provider ID or private address`);
  }
  return { instanceId, privateAddress };
}

async function readAnsibleVariables(
  path: string,
  expectedSha256: string,
  expected: {
    readonly nodeId: string;
    readonly clusterId: string;
    readonly capabilities: readonly string[];
  },
  expectedAddress: string,
): Promise<string> {
  const source = await readFile(path);
  if (createHash('sha256').update(source).digest('hex') !== expectedSha256) {
    // Proof: changing one enrollment-variable byte makes the production apply negative reach no
    // Ansible playbook, including when the changed byte is a secret.
    throw new Error('Ansible enrollment variables differ from the reviewed SHA-256');
  }
  if (((await stat(path)).mode & 0o077) !== 0) {
    throw new Error('Ansible enrollment variables must be owner-only');
  }
  const variables = requireRecord(
    parseJson(source.toString('utf8'), 'Ansible enrollment variables'),
    'Ansible enrollment variables',
  );
  const capabilities = variables['puni_node_capabilities'];
  if (
    variables['puni_node_name'] !== expected.nodeId ||
    variables['puni_cluster_id'] !== expected.clusterId ||
    variables['puni_node_ip'] !== expectedAddress ||
    typeof variables['puni_machine_id'] !== 'string' ||
    !/^[0-9a-f]{32}$/.test(variables['puni_machine_id']) ||
    !Array.isArray(capabilities) ||
    !capabilities.every((capability) => typeof capability === 'string') ||
    [...capabilities].sort().join('\0') !== [...expected.capabilities].sort().join('\0')
  ) {
    throw new Error('Ansible enrollment variables differ from reviewed node identity');
  }
  return variables['puni_machine_id'];
}

function requireAnsibleRecap(stdout: string, expectedHost?: string): void {
  if (/no hosts matched/i.test(stdout) || !stdout.includes('PLAY RECAP')) {
    // Proof: the zero-host Ansible production negative exits zero but cannot advance enrollment.
    throw new Error('Ansible completed without a controlled host recap');
  }
  if (
    expectedHost !== undefined &&
    !new RegExp(`^${expectedHost.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:.*failed=0`, 'm').test(
      stdout,
    )
  ) {
    throw new Error(`Ansible did not successfully configure ${expectedHost}`);
  }
}

function decodeProviderOwnership(source: string): readonly ProvisioningInstance[] {
  const document = requireRecord(parseJson(source, 'hcloud inventory'), 'hcloud inventory');
  const meta = requireRecord(document['_meta'], 'hcloud inventory _meta');
  const hostvars = requireRecord(meta['hostvars'], 'hcloud inventory hostvars');
  return Object.entries(hostvars).map(([hostname, hostInput]) => {
    const host = requireRecord(hostInput, `hcloud inventory host ${hostname}`);
    const instanceId = host['puni_instance_id'];
    const nodeId = host['puni_logical_node'];
    const operationId = host['puni_operation_id'];
    const state = host['puni_provider_state'];
    if (
      typeof instanceId !== 'string' ||
      instanceId.length === 0 ||
      typeof nodeId !== 'string' ||
      nodeId.length === 0 ||
      typeof operationId !== 'string' ||
      operationId.length === 0 ||
      (state !== 'running' && state !== 'pending-deletion')
    ) {
      // Proof: the malformed direct-provider production negative cannot authorize Terraform from
      // Terraform's own expected labels or a display name.
      throw new Error(`hcloud inventory host ${hostname} lacks exact ownership evidence`);
    }
    return { instanceId, nodeId, operationId, state };
  });
}

interface EnrollmentInventory {
  readonly address: string;
  readonly machineId: string;
  readonly providerIdentity: string;
}

async function readEnrollmentInventory(
  path: string,
  expectedSha256: string,
  knownHostsPath: string,
  nodeId: string,
): Promise<EnrollmentInventory> {
  const source = await readFile(path);
  if (createHash('sha256').update(source).digest('hex') !== expectedSha256) {
    throw new Error('Enrollment inventory differs from the reviewed SHA-256');
  }
  if (((await stat(path)).mode & 0o077) !== 0) {
    throw new Error('Enrollment inventory must be owner-only');
  }
  const document = requireRecord(
    parseJson(source.toString('utf8'), 'Enrollment inventory'),
    'Enrollment inventory',
  );
  const all = requireRecord(document['all'], 'Enrollment inventory all group');
  const children = requireRecord(all['children'], 'Enrollment inventory child groups');
  const agentGroup = requireRecord(children['k3s_agents'], 'Enrollment inventory k3s_agents');
  const serverGroup = requireRecord(
    children['k3s_join_servers'],
    'Enrollment inventory k3s_join_servers',
  );
  const agentHosts = requireRecord(agentGroup['hosts'], 'Enrollment inventory agent hosts');
  const serverHosts = requireRecord(serverGroup['hosts'], 'Enrollment inventory server hosts');
  const candidates = [agentHosts[nodeId], serverHosts[nodeId]].filter(
    (candidate) => candidate !== undefined,
  );
  const host = requireRecord(candidates[0], `Enrollment inventory host ${nodeId}`);
  const address = host['ansible_host'];
  const machineId = host['puni_machine_id'];
  const providerIdentity = host['puni_provider_identity'];
  const sshArguments = host['ansible_ssh_common_args'];
  if (
    Object.keys(agentHosts).length + Object.keys(serverHosts).length !== 1 ||
    candidates.length !== 1 ||
    typeof address !== 'string' ||
    address.length === 0 ||
    typeof machineId !== 'string' ||
    !/^[0-9a-f]{32}$/.test(machineId) ||
    typeof providerIdentity !== 'string' ||
    providerIdentity.length === 0 ||
    sshArguments !== `-o UserKnownHostsFile=${knownHostsPath} -o StrictHostKeyChecking=yes`
  ) {
    // Proof: a changed machine ID, address, provider identity, or host-key path in the reviewed
    // inventory stops the existing-host enrollment path before SSH configuration.
    throw new Error('Enrollment inventory lacks exact host identity or SSH host-key policy');
  }
  return { address, machineId, providerIdentity };
}

async function readKnownHosts(
  path: string,
  expectedSha256: string,
  expectedAddress: string,
): Promise<void> {
  const source = await readFile(path);
  if (
    createHash('sha256').update(source).digest('hex') !== expectedSha256 ||
    !source
      .toString('utf8')
      .split('\n')
      .some((line) => line.startsWith(`${expectedAddress} `))
  ) {
    // Proof: changing the pinned SSH host key or binding it to another address makes existing-host
    // enrollment reach no Ansible mutation.
    throw new Error('SSH known-hosts evidence differs from the reviewed identity');
  }
  if (((await stat(path)).mode & 0o077) !== 0)
    throw new Error('SSH known hosts must be owner-only');
}

function requireMachineFact(stdout: string, inventory: EnrollmentInventory): void {
  requireAnsibleRecap(stdout);
  const marker = /PUNI_MACHINE_FACT=(\{(?:\\.|[^}\r\n])+\})/.exec(stdout);
  if (marker?.[1] === undefined) throw new Error('Controlled SSH fact document is absent');
  const fact = requireRecord(
    parseJson(marker[1].replaceAll('\\"', '"'), 'Controlled SSH fact'),
    'Controlled SSH fact',
  );
  if (
    Object.keys(fact).sort().join('\0') !== ['address', 'machineId'].join('\0') ||
    fact['machineId'] !== inventory.machineId ||
    fact['address'] !== inventory.address
  ) {
    // Proof: a containing machine ID or address in unrelated SSH output no longer satisfies the
    // exact controlled fact document used at the enrollment boundary.
    throw new Error('Controlled SSH fact differs from reviewed machine identity');
  }
}

function createEnrollmentApplyDependencies(
  root: string,
  plan: OperationPlan,
  request: Extract<OperationPlan['request'], { kind: 'enroll' }>,
  planPath: string,
  run: RunCommand,
  now: () => Date,
  executionOwner: string,
): ApplyDependencies {
  const inventoryPath = `${planPath}.inventory.json`;
  const variablesPath = `${planPath}.ansible-vars.json`;
  const knownHostsPath = `${planPath}.known_hosts`;
  const playbook = (name: string, limit = true) => ({
    executable: 'ansible-playbook',
    arguments: [
      '--inventory',
      inventoryPath,
      '--inventory',
      join(root, `infra/ansible/inventory/${request.clusterId}.hcloud.yml`),
      ...(limit ? ['--limit', request.nodeId] : []),
      '--extra-vars',
      `@${variablesPath}`,
      join(root, `infra/ansible/playbooks/${name}.yml`),
    ],
    cwd: join(root, 'infra/ansible'),
  });

  async function inspect(): Promise<EnrollmentInventory> {
    const inventory = await readEnrollmentInventory(
      inventoryPath,
      request.inventorySha256,
      knownHostsPath,
      request.nodeId,
    );
    await readKnownHosts(knownHostsPath, request.knownHostsSha256, inventory.address);
    await readAnsibleVariables(
      variablesPath,
      request.ansibleVariablesSha256,
      {
        nodeId: request.nodeId,
        clusterId: request.clusterId,
        capabilities: plan.affectedCapabilities,
      },
      inventory.address,
    );
    const fact = await requireCommand(
      run,
      playbook('discover'),
      `Verify identity of ${request.nodeId}`,
    );
    requireMachineFact(fact, inventory);
    if (
      !plan.targetIdentities.includes(`ssh:${inventory.machineId}`) &&
      !plan.targetIdentities.includes(`hcloud:${inventory.providerIdentity}`)
    ) {
      throw new Error('Enrollment provider identity differs from the reviewed plan');
    }
    if (plan.targetIdentities.includes(`hcloud:${inventory.providerIdentity}`)) {
      const live = decodeProviderOwnership(
        await requireCommand(
          run,
          {
            executable: 'ansible-inventory',
            arguments: [
              '--inventory',
              join(root, `infra/ansible/inventory/${request.clusterId}.hcloud.yml`),
              '--list',
            ],
            cwd: join(root, 'infra/ansible'),
          },
          'Observe enrollment provider identity',
        ),
      ).filter((instance) => instance.nodeId === request.nodeId);
      if (
        live.length !== 1 ||
        live[0]?.instanceId !== inventory.providerIdentity ||
        live[0].state !== 'running'
      ) {
        // Proof: the same-name replacement enrollment negative reaches no host configuration when
        // live hcloud identity differs from the reviewed inventory and desired instance ID.
        throw new Error('Live hcloud identity differs from reviewed enrollment target');
      }
    }
    return inventory;
  }

  return {
    now,
    acquireLease: (operationPlan) => acquireLease(run, operationPlan, executionOwner, now()),
    ownsLease: async (lease) => {
      const current = await readLease(run, plan);
      return (
        current?.holder === lease.owner && now().getTime() < Date.parse(leaseExpiresAt(current))
      );
    },
    renewLease: (operationPlan, lease) => renewLease(run, operationPlan, lease, now()),
    releaseLease: (operationPlan, lease) => releaseLease(run, operationPlan, lease),
    observe: async () => {
      await inspect();
      return {
        digest: plan.observationDigest,
        targetIdentities: plan.targetIdentities,
        providerState: 'ready',
      };
    },
    applyEffect: async (_operationPlan, effect, _stepId, beforeMutation) => {
      await inspect();
      if (effect === 'verify provider identity') return {};
      if (effect === 'configure host') {
        await beforeMutation();
        const stdout = await requireCommand(run, playbook('join'), `Configure ${request.nodeId}`);
        requireAnsibleRecap(stdout, request.nodeId);
        return {};
      }
      if (effect === 'join cluster') {
        await beforeMutation();
        const stdout = await requireCommand(
          run,
          playbook('validate-enrollment', false),
          `Validate enrollment of ${request.nodeId}`,
        );
        requireAnsibleRecap(stdout);
        return {};
      }
      throw new Error(`Unsupported enrollment effect: ${effect}`);
    },
  };
}

/** Build the fixed production adapters used by the persisted-plan apply CLI. */
export function createProductionApplyDependencies(
  root: string,
  plan: OperationPlan,
  planPath: string,
  run?: RunCommand,
  now: () => Date = () => new Date(),
  executionOwner: string = randomUUID(),
  observeProvider?: ObserveProviderOwnership,
): ApplyDependencies {
  const commandRunner = run ?? createProductionCommandRunner(root);
  if (plan.request.kind === 'enroll') {
    return createEnrollmentApplyDependencies(
      root,
      plan,
      plan.request,
      planPath,
      commandRunner,
      now,
      executionOwner,
    );
  }
  if (plan.request.kind !== 'provision') {
    throw new Error(
      `Production apply for ${plan.request.kind} is introduced by its lifecycle task`,
    );
  }
  const request = plan.request;
  const terraformExpectation: TerraformProvisioningExpectation = {
    nodeId: request.nodeId,
    operationId: request.providerOwnershipId,
    clusterId: request.clusterId,
    region: request.region,
    machineType: request.machineType,
    image: request.image,
    network: request.network,
    sshKeyIds: request.sshKeyIds,
    retainedStorage: request.retainedStorage,
    k3sRole: request.k3sRole,
    budgetCapEur: request.budgetCapEur,
  };
  const terraformRoot = join(root, 'infra/terraform');
  const savedPlanPath = `${planPath}.tfplan`;
  const backendEvidencePath = `${planPath}.backend.json`;
  const ansibleVariablesPath = `${planPath}.ansible-vars.json`;
  const desiredNodePath = `${planPath}.desired-node.json`;
  const terraform = (arguments_: readonly string[]) =>
    requireCommand(
      commandRunner,
      { executable: 'terraform', arguments: arguments_, cwd: terraformRoot },
      'Terraform provisioning command',
    );
  const providerOwnership =
    observeProvider ??
    (async () =>
      decodeProviderOwnership(
        await requireCommand(
          commandRunner,
          {
            executable: 'ansible-inventory',
            arguments: [
              '--inventory',
              join(root, `infra/ansible/inventory/${request.clusterId}.hcloud.yml`),
              '--list',
            ],
            cwd: join(root, 'infra/ansible'),
          },
          'Observe direct hcloud ownership',
        ),
      ));

  async function observe(): Promise<ApplyObservation> {
    const savedPlan = await readFile(savedPlanPath);
    const digest = createHash('sha256').update(savedPlan).digest('hex');
    if (digest !== request.terraformPlanSha256) {
      // Proof: the saved-plan digest production adapter negative replaces the artifact bytes and
      // reaches neither Terraform apply nor Ansible enrollment.
      throw new Error('Saved Terraform plan differs from the reviewed SHA-256');
    }
    await readBackendEvidence(
      backendEvidencePath,
      request.terraformBackendEvidenceSha256,
      request.cloudAccount,
      run === undefined,
    );
    await terraform(['init', '-input=false', '-lockfile=readonly']);
    const state = decodeTerraformState(await terraform(['state', 'pull']), request.nodeId);
    const ownership = reconcileProvisioningOwnership(
      request.nodeId,
      request.providerOwnershipId,
      await providerOwnership(),
    );
    if (
      state.providerState === 'ready' &&
      state.managedInstance !== undefined &&
      (state.managedInstance.operationId !== request.providerOwnershipId ||
        ownership.kind !== 'import' ||
        state.managedInstance.instanceId !== ownership.instanceId)
    ) {
      throw new Error('Terraform state differs from direct provider ownership evidence');
    }
    return {
      digest:
        ownership.kind === 'create'
          ? plan.observationDigest
          : createHash('sha256').update(`hcloud:${ownership.instanceId}`).digest('hex'),
      targetIdentities:
        ownership.kind === 'create'
          ? [`pending:${request.nodeId}`, `cluster:${request.clusterId}`]
          : [`hcloud:${ownership.instanceId}`, `cluster:${request.clusterId}`],
      providerState: state.providerState,
      terraformState: state.identity,
    };
  }

  return {
    now,
    acquireLease: (operationPlan) =>
      acquireLease(commandRunner, operationPlan, executionOwner, now()),
    ownsLease: async (lease) => {
      const current = await readLease(commandRunner, plan);
      return (
        current?.holder === lease.owner && now().getTime() < Date.parse(leaseExpiresAt(current))
      );
    },
    renewLease: (operationPlan, lease) => renewLease(commandRunner, operationPlan, lease, now()),
    releaseLease: (operationPlan, lease) => releaseLease(commandRunner, operationPlan, lease),
    observe: () => observe(),
    applyEffect: async (_operationPlan, effect, _stepId, beforeMutation) => {
      if (effect === 'create provider instance') {
        const ownership = reconcileProvisioningOwnership(
          request.nodeId,
          request.providerOwnershipId,
          await providerOwnership(),
        );
        if (ownership.kind === 'import') {
          const state = decodeTerraformState(await terraform(['state', 'pull']), request.nodeId);
          if (state.managedInstance === undefined) {
            await beforeMutation();
            await terraform([
              'import',
              '-input=false',
              `-var-file=${planPath}.tfvars.json`,
              `hcloud_server.node[${JSON.stringify(request.nodeId)}]`,
              ownership.instanceId,
            ]);
            // Proof: the response-lost production negative imports the exact operation-owned server
            // and refuses the stale saved create plan before a second purchase.
            throw new Error(
              `Imported operation-owned provider instance ${ownership.instanceId}; create and review a fresh Terraform plan`,
            );
          }
          if (
            state.managedInstance.instanceId !== ownership.instanceId ||
            state.managedInstance.operationId !== request.providerOwnershipId
          ) {
            throw new Error('Terraform state differs from the operation-owned provider instance');
          }
        }
        const shown = parseJson(
          await terraform(['show', '-json', savedPlanPath]),
          'Terraform saved plan',
        );
        decodeTerraformPlan(
          shown,
          provisioningTerraformAddresses(request.nodeId, request.clusterId),
          terraformExpectation,
        );
        await beforeMutation();
        await terraform(['apply', '-input=false', '-lock=true', savedPlanPath]);
        const { instanceId } = outputNodeIdentity(
          await terraform(['output', '-json', 'node_identities']),
          request.nodeId,
        );
        const observed = reconcileProvisioningOwnership(
          request.nodeId,
          request.providerOwnershipId,
          await providerOwnership(),
        );
        if (observed.kind !== 'import' || observed.instanceId !== instanceId) {
          throw new Error('Terraform output differs from direct provider ownership evidence');
        }
        return { externalResourceId: instanceId };
      }
      if (effect === 'record provider identity') {
        const { instanceId } = outputNodeIdentity(
          await terraform(['output', '-json', 'node_identities']),
          request.nodeId,
        );
        const observed = reconcileProvisioningOwnership(
          request.nodeId,
          request.providerOwnershipId,
          await providerOwnership(),
        );
        if (observed.kind !== 'import' || observed.instanceId !== instanceId) {
          throw new Error('Recorded provider identity lacks matching direct provider evidence');
        }
        return { externalResourceId: instanceId };
      }
      if (effect === 'record desired membership') {
        const { instanceId } = outputNodeIdentity(
          await terraform(['output', '-json', 'node_identities']),
          request.nodeId,
        );
        const source = `${JSON.stringify(
          {
            id: request.nodeId,
            cluster: request.clusterId,
            capabilities: [...request.capabilities].sort(),
            lifecycle: 'present',
            provider: { kind: 'hcloud', instanceId },
          },
          undefined,
          2,
        )}\n`;
        await beforeMutation();
        try {
          const destination = await open(desiredNodePath, 'wx', 0o600);
          try {
            await destination.writeFile(source);
            await destination.sync();
          } finally {
            await destination.close();
          }
        } catch (cause) {
          if (
            !(cause instanceof Error && 'code' in cause && cause.code === 'EEXIST') ||
            (await readFile(desiredNodePath, 'utf8')) !== source
          ) {
            throw new Error('Cannot persist exact desired membership candidate', { cause });
          }
        }
        return { externalResourceId: instanceId };
      }
      if (effect === 'enroll configured host') {
        const { instanceId, privateAddress } = outputNodeIdentity(
          await terraform(['output', '-json', 'node_identities']),
          request.nodeId,
        );
        const desiredNode = decodeFleetNode(
          parseJson(await readFile(desiredNodePath, 'utf8'), 'Desired membership'),
        );
        if (
          desiredNode.id !== request.nodeId ||
          desiredNode.cluster !== request.clusterId ||
          desiredNode.lifecycle !== 'present' ||
          JSON.stringify(desiredNode.capabilities) !==
            JSON.stringify([...request.capabilities].sort()) ||
          desiredNode.provider.kind !== 'hcloud' ||
          desiredNode.provider.instanceId !== instanceId
        ) {
          // Proof: changing the durable desired membership after it is recorded stops enrollment
          // before Ansible can configure the host.
          throw new Error('Durable desired membership differs from provisioned identity');
        }
        const machineId = await readAnsibleVariables(
          ansibleVariablesPath,
          request.ansibleVariablesSha256,
          request,
          privateAddress,
        );
        const discoveryOutput = await requireCommand(
          commandRunner,
          {
            executable: 'ansible-playbook',
            arguments: [
              '--inventory',
              join(root, `infra/ansible/inventory/${request.clusterId}.hcloud.yml`),
              '--limit',
              request.nodeId,
              '--extra-vars',
              `@${ansibleVariablesPath}`,
              join(root, 'infra/ansible/playbooks/discover.yml'),
            ],
            cwd: join(root, 'infra/ansible'),
          },
          `Observe machine identity of ${request.nodeId}`,
        );
        requireMachineFact(discoveryOutput, {
          address: privateAddress,
          machineId,
          providerIdentity: instanceId,
        });
        await beforeMutation();
        const joinOutput = await requireCommand(
          commandRunner,
          {
            executable: 'ansible-playbook',
            arguments: [
              '--inventory',
              join(root, `infra/ansible/inventory/${request.clusterId}.hcloud.yml`),
              '--limit',
              request.nodeId,
              '--extra-vars',
              `@${ansibleVariablesPath}`,
              join(root, 'infra/ansible/playbooks/join.yml'),
            ],
            cwd: join(root, 'infra/ansible'),
          },
          `Enroll ${request.nodeId}`,
        );
        requireAnsibleRecap(joinOutput, request.nodeId);
        await beforeMutation();
        const validationOutput = await requireCommand(
          commandRunner,
          {
            executable: 'ansible-playbook',
            arguments: [
              '--inventory',
              join(root, `infra/ansible/inventory/${request.clusterId}.hcloud.yml`),
              '--extra-vars',
              `@${ansibleVariablesPath}`,
              join(root, 'infra/ansible/playbooks/validate-enrollment.yml'),
            ],
            cwd: join(root, 'infra/ansible'),
          },
          `Validate enrollment of ${request.nodeId}`,
        );
        requireAnsibleRecap(validationOutput);
        return {};
      }
      throw new Error(`Unsupported provisioning effect: ${effect}`);
    },
  };
}
