import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { chmod, mkdir, open, readFile, stat, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { ApplyDependencies, ApplyObservation, OperationLease } from './apply';
import { decodeFleetNode, readToolchain } from './contracts';
import type { OperationPlan } from './plan';
import {
  decodeTerraformDestroyPlan,
  decodeTerraformPlan,
  decodeTerraformStateIdentity,
  type ProvisioningInstance,
  provisioningTerraformAddresses,
  reconcileProvisioningOwnership,
  type TerraformProvisioningExpectation,
} from './terraform';
import { buildTerragruntRequest, lockTerragruntRequest, readTerragruntConfig } from './terragrunt';

const commandTimeoutMs = 120_000;
const leaseDurationSeconds = 300;

export interface TerraformPlanEvidence {
  readonly terragruntConfigSha256: string;
  readonly terraformPlanSha256: string;
  readonly terraformVariablesSha256: string;
  readonly terraformBackendEvidenceSha256: string;
  readonly terraformStateLineage: string;
  readonly terraformStateSerial: number;
}

export interface CommandRequest {
  readonly executable: string;
  readonly arguments: readonly string[];
  readonly cwd?: string;
  readonly stdin?: string;
  readonly environment?: Readonly<Record<string, string | undefined>>;
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
  // This cast is safe at the parsed-JSON boundary because the checks above exclude null and arrays.
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
    env: request.environment,
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
    if (request.executable === 'terragrunt') {
      return runBoundedCommand(await lockTerragruntRequest(root, request));
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
export async function prepareTerragruntPlan(
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
  const terragruntConfigSha256 = await readTerragruntConfig(root);
  const candidatePath = `${outputPath}.${randomBytes(8).toString('hex')}.new`;
  const reviewedVariablesPath = outputPath.endsWith('.tfplan')
    ? `${outputPath.slice(0, -'.tfplan'.length)}.tfvars.json`
    : `${outputPath}.tfvars.json`;
  let wroteReviewedVariables = false;
  const runTerraform = async (arguments_: readonly string[]) =>
    requireCommand(
      commandRunner,
      await buildTerragruntRequest(root, arguments_, terragruntConfigSha256),
      'Terraform planning command',
    );
  try {
    const variables = await readFile(variablesPath);
    const variablesDestination = await open(reviewedVariablesPath, 'wx', 0o600);
    try {
      await variablesDestination.writeFile(variables);
      await variablesDestination.sync();
    } finally {
      await variablesDestination.close();
    }
    wroteReviewedVariables = true;
    await runTerraform(['init', '-input=false', '-lockfile=readonly']);
    const validation = requireRecord(
      parseJson(await runTerraform(['validate', '-json']), 'Terraform validation'),
      'Terraform validation',
    );
    if (validation['valid'] !== true) {
      // Proof: the invalid-validation production adapter negative stops before Terraform plan.
      throw new Error(`Terraform validation failed: ${JSON.stringify(validation['diagnostics'])}`);
    }
    await runTerraform([
      'plan',
      '-input=false',
      '-lock=true',
      `-var-file=${reviewedVariablesPath}`,
      `-out=${candidatePath}`,
    ]);
    const shown = parseJson(
      await runTerraform(['show', '-json', candidatePath]),
      'Terraform saved plan',
    );
    decodeTerraformPlan(
      shown,
      provisioningTerraformAddresses(expected.nodeId, expected.clusterId),
      expected,
    );
    const state = decodeTerraformState(
      await runTerraform(['state', 'pull']),
      expected.nodeId,
    ).identity;
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
      terragruntConfigSha256,
      terraformPlanSha256: createHash('sha256').update(savedPlan).digest('hex'),
      terraformVariablesSha256: createHash('sha256').update(variables).digest('hex'),
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

/** Create a saved destroy plan that can delete only one retired server and its attachment edges. */
export async function prepareTerragruntDestroyPlan(
  root: string,
  nodeId: string,
  providerIdentity: string,
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
  const terragruntConfigSha256 = await readTerragruntConfig(root);
  const candidatePath = `${outputPath}.${randomBytes(8).toString('hex')}.new`;
  const reviewedVariablesPath = outputPath.endsWith('.tfplan')
    ? `${outputPath.slice(0, -'.tfplan'.length)}.tfvars.json`
    : `${outputPath}.tfvars.json`;
  let wroteReviewedVariables = false;
  const runTerraform = async (arguments_: readonly string[]) =>
    requireCommand(
      commandRunner,
      await buildTerragruntRequest(root, arguments_, terragruntConfigSha256),
      'Terraform destroy planning command',
    );
  try {
    const variables = await readFile(variablesPath);
    const variablesDestination = await open(reviewedVariablesPath, 'wx', 0o600);
    try {
      await variablesDestination.writeFile(variables);
      await variablesDestination.sync();
    } finally {
      await variablesDestination.close();
    }
    wroteReviewedVariables = true;
    await runTerraform(['init', '-input=false', '-lockfile=readonly']);
    const validation = requireRecord(
      parseJson(await runTerraform(['validate', '-json']), 'Terraform destroy validation'),
      'Terraform destroy validation',
    );
    if (validation['valid'] !== true) {
      throw new Error(
        `Terraform destroy validation failed: ${JSON.stringify(validation['diagnostics'])}`,
      );
    }
    const stateSource = await runTerraform(['state', 'pull']);
    const state = decodeTerraformState(stateSource, nodeId);
    if (state.managedInstance?.instanceId !== providerIdentity) {
      throw new Error('Terraform state does not own the exact provider destroy target');
    }
    await runTerraform([
      'plan',
      '-input=false',
      '-lock=true',
      `-var-file=${reviewedVariablesPath}`,
      `-out=${candidatePath}`,
    ]);
    decodeTerraformDestroyPlan(
      parseJson(
        await runTerraform(['show', '-json', candidatePath]),
        'Terraform destroy saved plan',
      ),
      nodeId,
    );
    const savedPlan = await readFile(candidatePath);
    const destination = await open(outputPath, 'wx', 0o600);
    try {
      await destination.writeFile(savedPlan);
      await destination.sync();
    } finally {
      await destination.close();
    }
    await chmod(outputPath, 0o600);
    await removePlanCandidate(candidatePath);
    return {
      terragruntConfigSha256,
      terraformPlanSha256: createHash('sha256').update(savedPlan).digest('hex'),
      terraformVariablesSha256: createHash('sha256').update(variables).digest('hex'),
      terraformBackendEvidenceSha256,
      terraformStateLineage: state.identity.lineage,
      terraformStateSerial: state.identity.serial,
    };
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
  expectedMachineId?: string,
): Promise<void> {
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
    (expectedMachineId === undefined
      ? 'puni_machine_id' in variables
      : variables['puni_machine_id'] !== expectedMachineId) ||
    !Array.isArray(capabilities) ||
    !capabilities.every((capability) => typeof capability === 'string') ||
    [...capabilities].sort().join('\0') !== [...expected.capabilities].sort().join('\0')
  ) {
    throw new Error('Ansible enrollment variables differ from reviewed node identity');
  }
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
      (state !== 'running' && state !== 'off' && state !== 'pending-deletion')
    ) {
      // Proof: the malformed direct-provider production negative cannot authorize Terraform from
      // Terraform's own expected labels or a display name.
      throw new Error(`hcloud inventory host ${hostname} lacks exact ownership evidence`);
    }
    return { instanceId, nodeId, operationId, state };
  });
}

interface EnrollmentInventory {
  readonly displayName: string;
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
  return { displayName: nodeId, address, machineId, providerIdentity };
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

function requireMachineFact(
  stdout: string,
  inventory: Omit<EnrollmentInventory, 'machineId'> & { readonly machineId?: string },
): string {
  requireAnsibleRecap(stdout);
  const marker = /PUNI_MACHINE_FACT=(\{(?:\\.|[^}\r\n])+\})/.exec(stdout);
  if (marker?.[1] === undefined) throw new Error('Controlled SSH fact document is absent');
  const fact = requireRecord(
    parseJson(marker[1].replaceAll('\\"', '"'), 'Controlled SSH fact'),
    'Controlled SSH fact',
  );
  if (
    Object.keys(fact).sort().join('\0') !== ['address', 'machineId', 'name'].join('\0') ||
    fact['name'] !== inventory.displayName ||
    typeof fact['machineId'] !== 'string' ||
    !/^[0-9a-f]{32}$/.test(fact['machineId']) ||
    (inventory.machineId !== undefined && fact['machineId'] !== inventory.machineId) ||
    fact['address'] !== inventory.address
  ) {
    // Proof: a containing machine ID or address in unrelated SSH output no longer satisfies the
    // exact controlled fact document used at the enrollment boundary.
    throw new Error('Controlled SSH fact differs from reviewed machine identity');
  }
  return fact['machineId'];
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
    await requireEnrollmentAllowed(root, request.nodeId);
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
      inventory.machineId,
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

function requirePlanIdentity(plan: OperationPlan, prefix: string): string {
  const matches = plan.targetIdentities.filter((identity) => identity.startsWith(prefix));
  const identity = matches.at(0);
  if (matches.length !== 1 || identity === undefined) {
    throw new Error(`Operation plan requires one ${prefix} identity`);
  }
  return identity.slice(prefix.length);
}

function retirementExclusionPath(root: string, nodeId: string): string {
  const nodeSha256 = createHash('sha256').update(nodeId).digest('hex');
  return join(root, '.puni/fleet/retired', `${nodeSha256}.json`);
}

async function requireEnrollmentAllowed(root: string, nodeId: string): Promise<void> {
  const path = retirementExclusionPath(root, nodeId);
  try {
    const exclusion = requireRecord(
      parseJson(await readFile(path, 'utf8'), 'Retired membership exclusion'),
      'Retired membership exclusion',
    );
    if (
      exclusion['schemaVersion'] !== 1 ||
      exclusion['nodeId'] !== nodeId ||
      typeof exclusion['providerIdentity'] !== 'string' ||
      exclusion['state'] !== 'retired'
    ) {
      throw new Error('Retired membership exclusion is malformed or names another identity');
    }
    // Proof: the production re-enrollment negative persists an exact retirement exclusion and
    // reaches neither discovery nor host configuration for that logical membership.
    throw new Error(`Enrollment of retired membership ${nodeId} requires replacement transition`);
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return;
    throw cause;
  }
}

async function requireReplacementProvisioningAuthorization(
  root: string,
  plan: OperationPlan,
  request: Extract<OperationPlan['request'], { kind: 'provision' }>,
  planPath: string,
  run: RunCommand,
): Promise<void> {
  const expectedSha256 = request.replacementAuthorizationSha256;
  if (expectedSha256 === undefined) return;
  const oldNodeId = requirePlanIdentity(plan, 'replacement-of:');
  const oldProviderIdentity = requirePlanIdentity(plan, 'replaced-provider:');
  const path = `${planPath}.replacement-authorization.json`;
  const source = await readFile(path);
  if (createHash('sha256').update(source).digest('hex') !== expectedSha256) {
    throw new Error('Replacement authorization differs from the reviewed SHA-256');
  }
  if (((await stat(path)).mode & 0o077) !== 0) {
    throw new Error('Replacement authorization must be owner-only');
  }
  const authorization = requireRecord(
    parseJson(source.toString('utf8'), 'Replacement authorization'),
    'Replacement authorization',
  );
  const fenceState = authorization['fenceState'];
  if (
    Object.keys(authorization).sort().join('\0') !==
      [
        'fenceId',
        'fenceState',
        'nodeId',
        'planSha256',
        'providerIdentity',
        'schemaVersion',
        'state',
      ]
        .sort()
        .join('\0') ||
    authorization['schemaVersion'] !== 1 ||
    authorization['nodeId'] !== oldNodeId ||
    authorization['providerIdentity'] !== oldProviderIdentity ||
    authorization['state'] !== 'replacement-authorized' ||
    typeof authorization['fenceId'] !== 'string' ||
    authorization['fenceId'].length === 0 ||
    typeof authorization['planSha256'] !== 'string' ||
    !/^[0-9a-f]{64}$/.test(authorization['planSha256']) ||
    (fenceState !== 'powered-off' && fenceState !== 'deleted')
  ) {
    throw new Error('Replacement authorization differs from reviewed replacement identity');
  }
  const exclusion = requireRecord(
    parseJson(
      await readFile(retirementExclusionPath(root, oldNodeId), 'utf8'),
      'Replaced membership exclusion',
    ),
    'Replaced membership exclusion',
  );
  if (
    exclusion['schemaVersion'] !== 1 ||
    exclusion['nodeId'] !== oldNodeId ||
    exclusion['providerIdentity'] !== oldProviderIdentity ||
    exclusion['state'] !== 'retired'
  ) {
    throw new Error('Replacement requires the exact retired membership exclusion');
  }
  if (oldProviderIdentity.startsWith('hcloud:')) {
    const cluster = requirePlanIdentity(plan, 'cluster:');
    const inventory = requireRecord(
      parseJson(
        await requireCommand(
          run,
          {
            executable: 'ansible-inventory',
            arguments: [
              '--inventory',
              join(root, `infra/ansible/inventory/${cluster}.hcloud.yml`),
              '--list',
            ],
            cwd: join(root, 'infra/ansible'),
          },
          'Recheck replacement fence before provisioning',
        ),
        'Replacement provisioning inventory',
      ),
      'Replacement provisioning inventory',
    );
    const meta = requireRecord(inventory['_meta'], 'Replacement provisioning inventory _meta');
    const hosts = requireRecord(meta['hostvars'], 'Replacement provisioning inventory hosts');
    const matches = Object.values(hosts)
      .map((host) => requireRecord(host, 'Replacement provisioning host'))
      .filter((host) => host['puni_logical_node'] === oldNodeId);
    const oldInstanceId = oldProviderIdentity.slice('hcloud:'.length);
    if (
      (fenceState === 'deleted' && matches.length !== 0) ||
      (fenceState === 'powered-off' &&
        (matches.length !== 1 ||
          matches[0]?.['puni_instance_id'] !== oldInstanceId ||
          matches[0]?.['puni_provider_state'] !== 'off'))
    ) {
      // Proof: changing an authorized old instance from off/absent to running stops replacement
      // provisioning before Terraform/Terragrunt can create the new writer.
      throw new Error('Replacement fence no longer holds for the old provider identity');
    }
  }
}

function createRetirementApplyDependencies(
  root: string,
  plan: OperationPlan,
  request: Extract<OperationPlan['request'], { kind: 'retire' }>,
  planPath: string,
  run: RunCommand,
  now: () => Date,
  executionOwner: string,
): ApplyDependencies {
  const cluster = requirePlanIdentity(plan, 'cluster:');
  const apiEndpoint = requirePlanIdentity(plan, 'api-endpoint:');
  const minimumControlPlanes = Number(requirePlanIdentity(plan, 'minimum-control-planes:'));
  if (!Number.isSafeInteger(minimumControlPlanes) || minimumControlPlanes < 1) {
    throw new Error('Retirement plan has invalid surviving control-plane policy');
  }
  const kubernetesNodeUid = requirePlanIdentity(plan, 'kubernetes:');
  const capabilityFloors = Object.fromEntries(
    plan.targetIdentities
      .filter((identity) => identity.startsWith('capability-floor:'))
      .map((identity) => {
        const match = /^capability-floor:([^:]+):(\d+)$/.exec(identity);
        if (match === null || Number(match[2]) < 1) {
          throw new Error(`Retirement plan has invalid capability floor identity: ${identity}`);
        }
        return [match[1], Number(match[2])];
      }),
  );
  const providerIdentity = plan.targetIdentities.find(
    (identity) => identity.startsWith('hcloud:') || identity.startsWith('ssh:'),
  );
  if (providerIdentity === undefined) throw new Error('Retirement plan has no provider identity');
  const reviewedProviderIdentity: string = providerIdentity;
  const inventoryPath = `${planPath}.inventory.json`;
  const knownHostsPath = `${planPath}.known_hosts`;
  const backupReceiptPath = `${planPath}.backup-receipt.json`;
  const providerInventoryPath = join(root, `infra/ansible/inventory/${cluster}.hcloud.yml`);
  const etcdRemovalPath = `${planPath}.etcd-removal.json`;
  const retiredNodePath = retirementExclusionPath(root, request.nodeId);
  const receiptPath = `${planPath}.retirement-receipt.json`;
  const playbookTags = new Map<string, string>([
    ['verify replacement capacity, storage topology, and backup status', 'preflight'],
    ['cordon node', 'cordon'],
    ['evict workloads respecting disruption budgets', 'drain'],
    ['wait for workload rescheduling and volume detach', 'detach'],
    ['verify no unmanaged or local-state workload remains', 'preflight'],
    ['stop and disable k3s service', 'deconfigure'],
    ['remove enrollment configuration and node credentials', 'deconfigure'],
    ['verify retired node cannot re-register', 'verify'],
    ['remove embedded etcd membership', 'etcd-membership'],
    ['remove Kubernetes membership', 'kubernetes-membership'],
  ]);
  const retirementVariables = {
    puni_api_endpoint_host: new URL(apiEndpoint).hostname,
    puni_backup_receipt: request.backupReceipt,
    puni_control_plane_target: plan.affectedCapabilities.includes('control-plane'),
    puni_kube_context: cluster,
    puni_kubernetes_node_uid: kubernetesNodeUid,
    puni_kubernetes_provider_id: reviewedProviderIdentity.startsWith('hcloud:')
      ? `hcloud://${reviewedProviderIdentity.slice('hcloud:'.length)}`
      : '',
    puni_minimum_surviving_control_planes: minimumControlPlanes,
    puni_required_capability_floors: capabilityFloors,
    puni_node_name: request.nodeId,
    puni_provider_identity: reviewedProviderIdentity.startsWith('hcloud:')
      ? `hcloud://${reviewedProviderIdentity.slice('hcloud:'.length)}`
      : reviewedProviderIdentity,
  };

  const play = (tag: string, etcdMembershipRemoved = false): CommandRequest => ({
    executable: 'ansible-playbook',
    arguments: [
      '--inventory',
      inventoryPath,
      '--inventory',
      providerInventoryPath,
      '--limit',
      request.nodeId,
      '--tags',
      tag,
      '--extra-vars',
      JSON.stringify({
        ...retirementVariables,
        puni_etcd_membership_removed: etcdMembershipRemoved,
      }),
      join(root, 'infra/ansible/playbooks/retire.yml'),
    ],
    cwd: join(root, 'infra/ansible'),
  });

  async function inspect(): Promise<boolean> {
    const backupSource = await readFile(backupReceiptPath);
    if (createHash('sha256').update(backupSource).digest('hex') !== request.backupReceiptSha256) {
      // Proof: the changed-backup-receipt production negative stops before identity observation or
      // any retirement mutation.
      throw new Error('Retirement backup receipt differs from the reviewed SHA-256');
    }
    if (((await stat(backupReceiptPath)).mode & 0o077) !== 0) {
      throw new Error('Retirement backup receipt must be owner-only');
    }
    const backup = requireRecord(
      parseJson(backupSource.toString('utf8'), 'Retirement backup receipt'),
      'Retirement backup receipt',
    );
    if (
      Object.keys(backup).sort().join('\0') !==
        [
          'nodeId',
          'providerIdentity',
          'receiptId',
          'schemaVersion',
          'snapshotId',
          'state',
          'verifiedAt',
        ]
          .sort()
          .join('\0') ||
      backup['schemaVersion'] !== 1 ||
      backup['receiptId'] !== request.backupReceipt ||
      backup['nodeId'] !== request.nodeId ||
      backup['providerIdentity'] !== reviewedProviderIdentity ||
      backup['state'] !== 'complete' ||
      typeof backup['snapshotId'] !== 'string' ||
      backup['snapshotId'].length === 0 ||
      typeof backup['verifiedAt'] !== 'string' ||
      !Number.isFinite(Date.parse(backup['verifiedAt'])) ||
      new Date(Date.parse(backup['verifiedAt'])).toISOString() !== backup['verifiedAt'] ||
      Date.parse(backup['verifiedAt']) > Date.parse(plan.observedAt)
    ) {
      throw new Error('Retirement backup receipt is incomplete or names another target');
    }
    const inventory = await readEnrollmentInventory(
      inventoryPath,
      request.inventorySha256,
      knownHostsPath,
      request.nodeId,
    );
    await readKnownHosts(knownHostsPath, request.knownHostsSha256, inventory.address);
    const nodeResponse = await run({
      executable: 'kubectl',
      arguments: ['--context', cluster, 'get', 'node', request.nodeId, '-o', 'json'],
    });
    if (nodeResponse.exitCode !== 0) {
      if (!/notfound/i.test(nodeResponse.stderr)) {
        throw new Error(`Retirement Kubernetes observation failed: ${nodeResponse.stderr}`);
      }
      await requirePersistedState(etcdRemovalPath, 'etcd-removed');
      return false;
    }
    const node = requireRecord(
      parseJson(nodeResponse.stdout, 'Retirement Kubernetes node'),
      'Retirement Kubernetes node',
    );
    const metadata = requireRecord(node['metadata'], 'Retirement Kubernetes node metadata');
    const spec = requireRecord(node['spec'], 'Retirement Kubernetes node spec');
    if (
      metadata['uid'] !== kubernetesNodeUid ||
      (reviewedProviderIdentity.startsWith('hcloud:') &&
        spec['providerID'] !== `hcloud://${reviewedProviderIdentity.slice('hcloud:'.length)}`)
    ) {
      // Proof: the same-name Kubernetes-node production negative refuses before cordon, drain, or
      // membership deletion can address the replacement Node object.
      throw new Error('Live Kubernetes identity differs from reviewed retirement target');
    }
    const fact = await requireCommand(
      run,
      {
        executable: 'ansible-playbook',
        arguments: [
          '--inventory',
          inventoryPath,
          '--inventory',
          providerInventoryPath,
          '--limit',
          request.nodeId,
          '--extra-vars',
          `puni_node_name=${request.nodeId}`,
          join(root, 'infra/ansible/playbooks/discover.yml'),
        ],
        cwd: join(root, 'infra/ansible'),
      },
      `Verify retirement identity of ${request.nodeId}`,
    );
    requireMachineFact(fact, inventory);
    if (
      (reviewedProviderIdentity.startsWith('ssh:') &&
        reviewedProviderIdentity !== `ssh:${inventory.machineId}`) ||
      (reviewedProviderIdentity.startsWith('hcloud:') &&
        reviewedProviderIdentity !== `hcloud:${inventory.providerIdentity}`)
    ) {
      throw new Error('Retirement inventory differs from reviewed provider identity');
    }
    if (reviewedProviderIdentity.startsWith('hcloud:')) {
      const expectedInstanceId = reviewedProviderIdentity.slice('hcloud:'.length);
      const live = decodeProviderOwnership(
        await requireCommand(
          run,
          {
            executable: 'ansible-inventory',
            arguments: ['--inventory', providerInventoryPath, '--list'],
            cwd: join(root, 'infra/ansible'),
          },
          'Observe retirement provider identity',
        ),
      ).filter((instance) => instance.nodeId === request.nodeId);
      if (
        live.length !== 1 ||
        live[0]?.instanceId !== expectedInstanceId ||
        live[0].state !== 'running'
      ) {
        // Proof: the same-name replacement retirement negative reaches no playbook when the live
        // provider identity differs from the reviewed instance.
        throw new Error('Live hcloud identity differs from reviewed retirement target');
      }
    }
    const etcdMembershipRemoved = await persistedStateExists(etcdRemovalPath, 'etcd-removed');
    const preflight = await requireCommand(
      run,
      play('preflight', etcdMembershipRemoved),
      `Refresh retirement capacity and storage safety for ${request.nodeId}`,
    );
    requireAnsibleRecap(preflight, request.nodeId);
    return true;
  }

  async function persist(path: string, state: string): Promise<void> {
    const source = `${JSON.stringify({
      schemaVersion: 1,
      nodeId: request.nodeId,
      providerIdentity: reviewedProviderIdentity,
      kubernetesNodeUid,
      backupReceipt: request.backupReceipt,
      planSha256: plan.planSha256,
      state,
    })}\n`;
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    try {
      const destination = await open(path, 'wx', 0o600);
      try {
        await destination.writeFile(source);
        await destination.sync();
      } finally {
        await destination.close();
      }
    } catch (cause) {
      if (
        !(cause instanceof Error && 'code' in cause && cause.code === 'EEXIST') ||
        (await readFile(path, 'utf8')) !== source
      ) {
        throw new Error(`Cannot persist exact retirement ${state}`, { cause });
      }
    }
  }

  async function requirePersistedState(path: string, state: string): Promise<void> {
    let source: string;
    try {
      source = await readFile(path, 'utf8');
    } catch (cause) {
      throw new Error(`Required retirement ${state} evidence is absent`, { cause });
    }
    const record = requireRecord(parseJson(source, `Retirement ${state}`), `Retirement ${state}`);
    if (
      Object.keys(record).sort().join('\0') !==
        [
          'backupReceipt',
          'kubernetesNodeUid',
          'nodeId',
          'planSha256',
          'providerIdentity',
          'schemaVersion',
          'state',
        ]
          .sort()
          .join('\0') ||
      record['schemaVersion'] !== 1 ||
      record['nodeId'] !== request.nodeId ||
      record['providerIdentity'] !== reviewedProviderIdentity ||
      record['kubernetesNodeUid'] !== kubernetesNodeUid ||
      record['backupReceipt'] !== request.backupReceipt ||
      record['planSha256'] !== plan.planSha256 ||
      record['state'] !== state
    ) {
      throw new Error(`Required retirement ${state} evidence differs from reviewed identity`);
    }
  }

  async function persistedStateExists(path: string, state: string): Promise<boolean> {
    try {
      await stat(path);
    } catch (cause) {
      if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return false;
      throw new Error(`Cannot inspect retirement ${state} evidence`, { cause });
    }
    await requirePersistedState(path, state);
    return true;
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
      const nodePresent = await inspect();
      // Proof: the response-lost membership test removes the Node after the etcd receipt; this
      // branch completes recovery without issuing a second deletion against a future same-name Node.
      if (effect === 'remove Kubernetes membership' && !nodePresent) return {};
      const tag = playbookTags.get(effect);
      if (tag !== undefined) {
        const etcdMembershipRemoved = await persistedStateExists(etcdRemovalPath, 'etcd-removed');
        await beforeMutation();
        const stdout = await requireCommand(
          run,
          play(tag, etcdMembershipRemoved),
          `Retirement ${tag} for ${request.nodeId}`,
        );
        requireAnsibleRecap(stdout, request.nodeId);
        if (effect === 'remove embedded etcd membership') {
          await persist(etcdRemovalPath, 'etcd-removed');
        }
        if (effect === 'remove Kubernetes membership') {
          const removed = await run({
            executable: 'kubectl',
            arguments: ['--context', cluster, 'get', 'node', request.nodeId, '-o', 'json'],
          });
          if (removed.exitCode === 0 || !/notfound/i.test(removed.stderr)) {
            // Proof: the false-success membership production negative returns a successful Ansible
            // recap while retaining the exact Node; the adapter refuses before exclusion/receipt.
            throw new Error('Retirement did not remove exact Kubernetes membership');
          }
        }
        return {};
      }
      if (effect === 'record etcd membership removal') {
        await beforeMutation();
        await persist(etcdRemovalPath, 'etcd-removed');
        return {};
      }
      if (effect === 'persist authoritative enrollment exclusion') {
        await beforeMutation();
        await persist(retiredNodePath, 'retired');
        return {};
      }
      if (effect === 'record auditable retirement receipt') {
        await requirePersistedState(retiredNodePath, 'retired');
        await beforeMutation();
        await persist(receiptPath, 'retired');
        return {};
      }
      throw new Error(`Unsupported retirement effect: ${effect}`);
    },
  };
}

function createReplacementApplyDependencies(
  root: string,
  plan: OperationPlan,
  request: Extract<OperationPlan['request'], { kind: 'replace' }>,
  planPath: string,
  run: RunCommand,
  now: () => Date,
  executionOwner: string,
): ApplyDependencies {
  const cluster = requirePlanIdentity(plan, 'cluster:');
  const providerIdentity = plan.targetIdentities.find(
    (identity) => identity.startsWith('hcloud:') || identity.startsWith('ssh:'),
  );
  if (providerIdentity === undefined) throw new Error('Replacement plan has no provider identity');
  const reviewedProviderIdentity: string = providerIdentity;
  const fenceId = requirePlanIdentity(plan, 'fence:');
  const fencePath = `${planPath}.fence-receipt.json`;
  const exclusionPath = retirementExclusionPath(root, request.nodeId);
  const authorizationPath = `${planPath}.replacement-authorization.json`;

  async function readFence(): Promise<'powered-off' | 'deleted'> {
    const source = await readFile(fencePath);
    if (createHash('sha256').update(source).digest('hex') !== request.fenceReceiptSha256) {
      throw new Error('External fence receipt differs from the reviewed SHA-256');
    }
    if (((await stat(fencePath)).mode & 0o077) !== 0) {
      throw new Error('External fence receipt must be owner-only');
    }
    const receipt = requireRecord(
      parseJson(source.toString('utf8'), 'External fence receipt'),
      'External fence receipt',
    );
    const state = receipt['state'];
    if (
      Object.keys(receipt).sort().join('\0') !==
        ['fenceId', 'nodeId', 'providerIdentity', 'schemaVersion', 'state', 'verifiedAt']
          .sort()
          .join('\0') ||
      receipt['schemaVersion'] !== 1 ||
      receipt['nodeId'] !== request.nodeId ||
      receipt['providerIdentity'] !== reviewedProviderIdentity ||
      receipt['fenceId'] !== fenceId ||
      (state !== 'powered-off' && state !== 'deleted') ||
      typeof receipt['verifiedAt'] !== 'string' ||
      !Number.isFinite(Date.parse(receipt['verifiedAt'])) ||
      new Date(Date.parse(receipt['verifiedAt'])).toISOString() !== receipt['verifiedAt'] ||
      Date.parse(receipt['verifiedAt']) > Date.parse(plan.observedAt)
    ) {
      throw new Error('External fence receipt differs from reviewed replacement identity');
    }
    if (reviewedProviderIdentity.startsWith('hcloud:')) {
      const inventory = requireRecord(
        parseJson(
          await requireCommand(
            run,
            {
              executable: 'ansible-inventory',
              arguments: [
                '--inventory',
                join(root, `infra/ansible/inventory/${cluster}.hcloud.yml`),
                '--list',
              ],
              cwd: join(root, 'infra/ansible'),
            },
            'Observe fenced replacement provider identity',
          ),
          'Replacement provider inventory',
        ),
        'Replacement provider inventory',
      );
      const meta = requireRecord(inventory['_meta'], 'Replacement provider inventory _meta');
      const hostvars = requireRecord(meta['hostvars'], 'Replacement provider inventory hosts');
      const matches = Object.values(hostvars)
        .map((host) => requireRecord(host, 'Replacement provider host'))
        .filter((host) => host['puni_logical_node'] === request.nodeId);
      const expectedId = reviewedProviderIdentity.slice('hcloud:'.length);
      if (
        (state === 'deleted' && matches.length !== 0) ||
        (state === 'powered-off' &&
          (matches.length !== 1 ||
            matches[0]?.['puni_instance_id'] !== expectedId ||
            matches[0]?.['puni_provider_state'] !== 'off'))
      ) {
        // Proof: the running-or-replaced-provider production negative refuses replacement
        // authorization even when a stale receipt claims a completed fence.
        throw new Error('Live provider does not confirm the reviewed external fence');
      }
    }
    return state;
  }

  async function persist(
    path: string,
    state: string,
    fenceState?: 'powered-off' | 'deleted',
  ): Promise<void> {
    const source = `${JSON.stringify({
      schemaVersion: 1,
      nodeId: request.nodeId,
      providerIdentity: reviewedProviderIdentity,
      fenceId,
      planSha256: plan.planSha256,
      state,
      ...(fenceState === undefined ? {} : { fenceState }),
    })}\n`;
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    try {
      const destination = await open(path, 'wx', 0o600);
      try {
        await destination.writeFile(source);
        await destination.sync();
      } finally {
        await destination.close();
      }
    } catch (cause) {
      if (
        !(cause instanceof Error && 'code' in cause && cause.code === 'EEXIST') ||
        (await readFile(path, 'utf8')) !== source
      ) {
        throw new Error(`Cannot persist exact replacement ${state}`, { cause });
      }
    }
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
      await readFence();
      return {
        digest: plan.observationDigest,
        targetIdentities: plan.targetIdentities,
        providerState: 'ready',
      };
    },
    applyEffect: async (_operationPlan, effect, _stepId, beforeMutation) => {
      const fenceState = await readFence();
      if (effect === 'record verified external fence') return {};
      if (effect === 'persist authoritative enrollment exclusion') {
        await beforeMutation();
        await persist(exclusionPath, 'retired');
        return {};
      }
      if (effect === 'record replacement authorization for a distinct provisioning plan') {
        await beforeMutation();
        await persist(authorizationPath, 'replacement-authorized', fenceState);
        return {};
      }
      throw new Error(`Unsupported replacement effect: ${effect}`);
    },
  };
}

function createUpgradeApplyDependencies(
  root: string,
  plan: OperationPlan,
  request: Extract<OperationPlan['request'], { kind: 'upgrade' }>,
  planPath: string,
  run: RunCommand,
  now: () => Date,
  executionOwner: string,
): ApplyDependencies {
  const cluster = requirePlanIdentity(plan, 'cluster:');
  const kubernetesNodeUid = requirePlanIdentity(plan, 'kubernetes:');
  const reviewedProviderIdentity = plan.targetIdentities.find(
    (identity) => identity.startsWith('hcloud:') || identity.startsWith('ssh:'),
  );
  if (reviewedProviderIdentity === undefined)
    throw new Error('Upgrade plan has no provider identity');
  const upgradeProviderIdentity: string = reviewedProviderIdentity;
  const inventoryPath = `${planPath}.inventory.json`;
  const knownHostsPath = `${planPath}.known_hosts`;
  const evidencePath = `${planPath}.upgrade-evidence.json`;
  const providerInventoryPath = join(root, `infra/ansible/inventory/${cluster}.hcloud.yml`);
  const role = plan.affectedCapabilities.includes('control-plane') ? 'server' : 'agent';

  async function evidence(): Promise<{
    readonly fromVersion: string;
    readonly snapshotId: string;
    readonly recoveryTokenSha256: string;
  }> {
    const source = await readFile(evidencePath);
    if (createHash('sha256').update(source).digest('hex') !== request.upgradeEvidenceSha256) {
      throw new Error('Upgrade evidence differs from the reviewed SHA-256');
    }
    if (((await stat(evidencePath)).mode & 0o077) !== 0) {
      throw new Error('Upgrade evidence must be owner-only');
    }
    const document = requireRecord(
      parseJson(source.toString('utf8'), 'Upgrade evidence'),
      'Upgrade evidence',
    );
    if (
      Object.keys(document).sort().join('\0') !==
      ['installedVersions', 'recoveryTokenSha256s', 'schemaVersion', 'snapshotIds']
        .sort()
        .join('\0')
    ) {
      throw new Error('Upgrade evidence contains unreviewed fields');
    }
    const installedVersions = requireRecord(
      document['installedVersions'],
      'Upgrade installed versions',
    );
    const snapshotIds = requireRecord(document['snapshotIds'], 'Upgrade snapshot receipts');
    const recoveryTokenSha256s = requireRecord(
      document['recoveryTokenSha256s'],
      'Upgrade retained recovery tokens',
    );
    const fromVersion = installedVersions[request.nodeId];
    const snapshotId = role === 'server' ? snapshotIds[cluster] : 'not-applicable';
    const recoveryTokenSha256 =
      role === 'server' ? recoveryTokenSha256s[cluster] : 'not-applicable';
    if (
      document['schemaVersion'] !== 1 ||
      Object.values(installedVersions).some(
        (version) => typeof version !== 'string' || !/^v\d+\.\d+\.\d+\+k3s\d+$/.test(version),
      ) ||
      Object.values(snapshotIds).some(
        (snapshot) => typeof snapshot !== 'string' || snapshot.length === 0,
      ) ||
      Object.values(recoveryTokenSha256s).some(
        (sha256) => typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256),
      ) ||
      typeof fromVersion !== 'string' ||
      !/^v\d+\.\d+\.\d+\+k3s\d+$/.test(fromVersion) ||
      typeof snapshotId !== 'string' ||
      snapshotId.length === 0 ||
      typeof recoveryTokenSha256 !== 'string' ||
      (role === 'server' && !/^[0-9a-f]{64}$/.test(recoveryTokenSha256))
    ) {
      throw new Error(
        'Upgrade evidence lacks exact node version, server snapshot, or retained recovery token',
      );
    }
    if (role === 'server') {
      const tokenPath = `${planPath}.recovery-token`;
      let token: Buffer;
      try {
        token = await readFile(tokenPath);
      } catch (cause) {
        throw new Error(`Cannot read required upgrade recovery token at ${tokenPath}`, { cause });
      }
      if (
        createHash('sha256').update(token).digest('hex') !== recoveryTokenSha256 ||
        ((await stat(tokenPath)).mode & 0o077) !== 0 ||
        token.length === 0
      ) {
        // Proof: changing or exposing the retained recovery token stops before drain or upgrade.
        throw new Error('Upgrade retained recovery token differs from reviewed private evidence');
      }
    }
    return { fromVersion, snapshotId, recoveryTokenSha256 };
  }

  async function inspect(): Promise<string> {
    const recovery = await evidence();
    const toolchain = await readToolchain(join(root, 'infra/versions/toolchain.json'));
    if (toolchain.binaries.k3s.version !== request.version) {
      throw new Error('Upgrade target differs from the committed k3s lock');
    }
    const inventory = await readEnrollmentInventory(
      inventoryPath,
      request.inventorySha256,
      knownHostsPath,
      request.nodeId,
    );
    await readKnownHosts(knownHostsPath, request.knownHostsSha256, inventory.address);
    const discovery = await requireCommand(
      run,
      {
        executable: 'ansible-playbook',
        arguments: [
          '--inventory',
          inventoryPath,
          '--inventory',
          providerInventoryPath,
          '--limit',
          request.nodeId,
          '--extra-vars',
          `puni_node_name=${request.nodeId}`,
          join(root, 'infra/ansible/playbooks/discover.yml'),
        ],
        cwd: join(root, 'infra/ansible'),
      },
      `Verify upgrade identity of ${request.nodeId}`,
    );
    requireMachineFact(discovery, inventory);
    if (
      (upgradeProviderIdentity.startsWith('ssh:') &&
        upgradeProviderIdentity !== `ssh:${inventory.machineId}`) ||
      (upgradeProviderIdentity.startsWith('hcloud:') &&
        upgradeProviderIdentity !== `hcloud:${inventory.providerIdentity}`)
    ) {
      throw new Error('Upgrade inventory differs from reviewed provider identity');
    }
    if (upgradeProviderIdentity.startsWith('hcloud:')) {
      const live = decodeProviderOwnership(
        await requireCommand(
          run,
          {
            executable: 'ansible-inventory',
            arguments: ['--inventory', providerInventoryPath, '--list'],
            cwd: join(root, 'infra/ansible'),
          },
          'Observe upgrade provider identity',
        ),
      ).filter((instance) => instance.nodeId === request.nodeId);
      if (
        live.length !== 1 ||
        live[0]?.instanceId !== upgradeProviderIdentity.slice('hcloud:'.length) ||
        live[0].state !== 'running'
      ) {
        throw new Error('Live hcloud identity differs from reviewed upgrade target');
      }
    }
    const nodeSource = await requireCommand(
      run,
      {
        executable: 'kubectl',
        arguments: ['--context', cluster, 'get', 'node', request.nodeId, '-o', 'json'],
      },
      `Observe upgrade Kubernetes identity of ${request.nodeId}`,
    );
    const node = requireRecord(
      parseJson(nodeSource, 'Upgrade Kubernetes node'),
      'Upgrade Kubernetes node',
    );
    const metadata = requireRecord(node['metadata'], 'Upgrade Kubernetes metadata');
    const status = requireRecord(node['status'], 'Upgrade Kubernetes status');
    const conditions = status['conditions'];
    if (
      metadata['uid'] !== kubernetesNodeUid ||
      !Array.isArray(conditions) ||
      !conditions.some((condition: unknown) => {
        const record = requireRecord(condition, 'Upgrade Kubernetes condition');
        return record['type'] === 'Ready' && record['status'] === 'True';
      })
    ) {
      throw new Error('Upgrade target Kubernetes identity is not exact and Ready');
    }
    const variables = JSON.stringify({
      puni_node_name: request.nodeId,
      puni_kube_context: cluster,
      puni_k3s_version: request.version,
      puni_k3s_from_version: recovery.fromVersion,
      puni_k3s_download_url: toolchain.binaries.k3s.url,
      puni_k3s_sha256: toolchain.binaries.k3s.sha256,
      puni_k3s_role: role,
      puni_etcd_snapshot_receipt: recovery.snapshotId,
      puni_recovery_token_sha256: recovery.recoveryTokenSha256,
    });
    const versionOutput = await requireCommand(
      run,
      {
        executable: 'ansible-playbook',
        arguments: [
          '--inventory',
          inventoryPath,
          '--inventory',
          providerInventoryPath,
          '--limit',
          request.nodeId,
          '--tags',
          'version',
          '--extra-vars',
          variables,
          join(root, 'infra/ansible/playbooks/upgrade.yml'),
        ],
        cwd: join(root, 'infra/ansible'),
      },
      `Observe installed k3s version on ${request.nodeId}`,
    );
    requireAnsibleRecap(versionOutput, request.nodeId);
    const installed = /PUNI_K3S_VERSION=(v\d+\.\d+\.\d+\+k3s\d+)/.exec(versionOutput)?.[1];
    if (installed !== recovery.fromVersion && installed !== request.version) {
      throw new Error('Installed k3s version differs from reviewed upgrade transition');
    }
    return installed;
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
    applyEffect: async (_operationPlan, effect, _stepId, beforeMutation, recoveringActiveStep) => {
      const installed = await inspect();
      if (effect !== plan.effects[0]) throw new Error(`Unsupported upgrade effect: ${effect}`);
      if (installed === request.version && !recoveringActiveStep) {
        // Proof: an already-changed target cannot turn a fresh reviewed operation into a no-op.
        throw new Error('Upgrade target version changed outside the reviewed operation');
      }
      const recovery = await evidence();
      const toolchain = await readToolchain(join(root, 'infra/versions/toolchain.json'));
      await beforeMutation();
      const stdout = await requireCommand(
        run,
        {
          executable: 'ansible-playbook',
          arguments: [
            '--inventory',
            inventoryPath,
            '--inventory',
            providerInventoryPath,
            '--limit',
            request.nodeId,
            '--extra-vars',
            JSON.stringify({
              puni_node_name: request.nodeId,
              puni_kube_context: cluster,
              puni_k3s_version: request.version,
              puni_k3s_from_version: recovery.fromVersion,
              puni_k3s_download_url: toolchain.binaries.k3s.url,
              puni_k3s_sha256: toolchain.binaries.k3s.sha256,
              puni_k3s_role: role,
              puni_etcd_snapshot_receipt: recovery.snapshotId,
              puni_recovery_token_sha256: recovery.recoveryTokenSha256,
            }),
            join(root, 'infra/ansible/playbooks/upgrade.yml'),
          ],
          cwd: join(root, 'infra/ansible'),
        },
        `Upgrade ${request.nodeId}`,
      );
      requireAnsibleRecap(stdout, request.nodeId);
      const verifiedVersion = await inspect();
      if (verifiedVersion !== request.version) {
        // Proof: the successful-play-with-old-version production negative remains recoverable and
        // cannot produce a completion receipt for an upgrade that did not install the target.
        throw new Error(`Upgrade did not install reviewed k3s version ${request.version}`);
      }
      return {};
    },
  };
}

function createDestroyApplyDependencies(
  root: string,
  plan: OperationPlan,
  request: Extract<OperationPlan['request'], { kind: 'destroy' }>,
  planPath: string,
  run: RunCommand,
  now: () => Date,
  executionOwner: string,
  enforceBackendEnvironment: boolean,
): ApplyDependencies {
  const cluster = requirePlanIdentity(plan, 'cluster:');
  const providerIdentity = requirePlanIdentity(plan, 'hcloud:');
  const receiptPath = `${planPath}.retirement-receipt.json`;
  const savedPlanPath = `${planPath}.tfplan`;
  const variablesPath = `${planPath}.tfvars.json`;
  const backendEvidencePath = `${planPath}.backend.json`;
  const terragruntConfigSha256 = request.terragruntConfigSha256;
  const providerInventoryPath = join(root, `infra/ansible/inventory/${cluster}.hcloud.yml`);
  const runTerraform = async (arguments_: readonly string[]) =>
    requireCommand(
      run,
      await buildTerragruntRequest(root, arguments_, terragruntConfigSha256),
      'Terraform destroy command',
    );

  async function requireReceipt(): Promise<void> {
    const source = await readFile(receiptPath);
    if (createHash('sha256').update(source).digest('hex') !== request.retirementReceiptSha256) {
      throw new Error('Retirement receipt differs from the reviewed SHA-256');
    }
    if (((await stat(receiptPath)).mode & 0o077) !== 0) {
      throw new Error('Retirement receipt must be owner-only');
    }
    const receipt = requireRecord(
      parseJson(source.toString('utf8'), 'Retirement receipt'),
      'Retirement receipt',
    );
    if (
      Object.keys(receipt).sort().join('\0') !==
        [
          'backupReceipt',
          'kubernetesNodeUid',
          'nodeId',
          'planSha256',
          'providerIdentity',
          'schemaVersion',
          'state',
        ]
          .sort()
          .join('\0') ||
      receipt['schemaVersion'] !== 1 ||
      receipt['nodeId'] !== request.nodeId ||
      receipt['providerIdentity'] !== `hcloud:${providerIdentity}` ||
      receipt['state'] !== 'retired' ||
      typeof receipt['planSha256'] !== 'string' ||
      !/^[0-9a-f]{64}$/.test(receipt['planSha256'])
    ) {
      throw new Error('Retirement receipt does not authorize this exact provider destroy');
    }
  }

  async function inspect(): Promise<{
    readonly providerPresent: boolean;
    readonly terraformState: { readonly lineage: string; readonly serial: number };
  }> {
    await requireReceipt();
    const savedPlan = await readFile(savedPlanPath);
    const variables = await readFile(variablesPath);
    if (
      createHash('sha256').update(savedPlan).digest('hex') !== request.terraformPlanSha256 ||
      createHash('sha256').update(variables).digest('hex') !== request.terraformVariablesSha256
    ) {
      // Proof: changing either reviewed destroy artifact stops before Terraform init or apply.
      throw new Error('Terraform destroy artifacts differ from their reviewed SHA-256');
    }
    if (
      ((await stat(savedPlanPath)).mode & 0o077) !== 0 ||
      ((await stat(variablesPath)).mode & 0o077) !== 0
    ) {
      throw new Error('Terraform destroy artifacts must be owner-only');
    }
    await readBackendEvidence(
      backendEvidencePath,
      request.terraformBackendEvidenceSha256,
      request.cloudAccount,
      enforceBackendEnvironment,
    );
    await runTerraform(['init', '-input=false', '-lockfile=readonly']);
    decodeTerraformDestroyPlan(
      parseJson(
        await runTerraform(['show', '-json', savedPlanPath]),
        'Terraform destroy saved plan',
      ),
      request.nodeId,
    );
    const stateSource = await runTerraform(['state', 'pull']);
    const stateInput = parseJson(stateSource, 'Terraform destroy state');
    const terraformState = decodeTerraformStateIdentity(stateInput);
    if (
      terraformState.lineage !== request.terraformStateLineage ||
      terraformState.serial < request.terraformStateSerial
    ) {
      throw new Error('Terraform destroy state lineage or serial differs from review');
    }
    const live = decodeProviderOwnership(
      await requireCommand(
        run,
        {
          executable: 'ansible-inventory',
          arguments: ['--inventory', providerInventoryPath, '--list'],
          cwd: join(root, 'infra/ansible'),
        },
        'Observe destroy provider identity',
      ),
    ).filter((instance) => instance.nodeId === request.nodeId);
    if (
      live.length > 1 ||
      (live.length === 1 &&
        (live[0]?.instanceId !== providerIdentity || live[0].state !== 'running'))
    ) {
      // Proof: a same-name replacement provider refuses the saved destroy plan before apply.
      throw new Error('Live provider identity differs from reviewed destroy target');
    }
    if (live.length === 1) {
      const state = decodeTerraformState(stateSource, request.nodeId);
      if (state.managedInstance?.instanceId !== providerIdentity) {
        throw new Error('Terraform state differs from reviewed destroy target');
      }
    }
    return { providerPresent: live.length === 1, terraformState };
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
      const live = await inspect();
      return {
        digest: live.providerPresent
          ? plan.observationDigest
          : createHash('sha256').update(`destroyed:hcloud:${providerIdentity}`).digest('hex'),
        targetIdentities: plan.targetIdentities,
        providerState: 'ready',
        terraformState: live.terraformState,
      };
    },
    applyEffect: async (_operationPlan, effect, _stepId, beforeMutation, recoveringActiveStep) => {
      const live = await inspect();
      if (effect === 'require completed retirement receipt') {
        if (!live.providerPresent)
          throw new Error('Provider instance was already absent before destroy');
        return {};
      }
      if (effect === 'destroy provider instance') {
        if (!live.providerPresent) {
          if (recoveringActiveStep) return {};
          throw new Error('Provider instance disappeared outside the reviewed destroy effect');
        }
        await beforeMutation();
        await runTerraform(['apply', '-input=false', '-lock=true', savedPlanPath]);
        const after = await inspect();
        if (after.providerPresent || after.terraformState.serial <= live.terraformState.serial) {
          // Proof: a false-success Terraform apply cannot complete while the exact provider still
          // exists or the remote state serial has not advanced.
          throw new Error('Terraform destroy did not remove the exact provider instance');
        }
        return { externalResourceId: providerIdentity };
      }
      throw new Error(`Unsupported destroy effect: ${effect}`);
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
  if (plan.request.kind === 'retire') {
    return createRetirementApplyDependencies(
      root,
      plan,
      plan.request,
      planPath,
      commandRunner,
      now,
      executionOwner,
    );
  }
  if (plan.request.kind === 'replace') {
    return createReplacementApplyDependencies(
      root,
      plan,
      plan.request,
      planPath,
      commandRunner,
      now,
      executionOwner,
    );
  }
  if (plan.request.kind === 'upgrade') {
    return createUpgradeApplyDependencies(
      root,
      plan,
      plan.request,
      planPath,
      commandRunner,
      now,
      executionOwner,
    );
  }
  if (plan.request.kind === 'destroy') {
    return createDestroyApplyDependencies(
      root,
      plan,
      plan.request,
      planPath,
      commandRunner,
      now,
      executionOwner,
      run === undefined,
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
  const terragruntConfigSha256 = request.terragruntConfigSha256;
  const savedPlanPath = `${planPath}.tfplan`;
  const terraformVariablesPath = `${planPath}.tfvars.json`;
  const backendEvidencePath = `${planPath}.backend.json`;
  const ansibleVariablesPath = `${planPath}.ansible-vars.json`;
  const desiredNodePath = `${planPath}.desired-node.json`;
  const machineIdentityPath = `${planPath}.machine-id`;
  const runTerraform = async (arguments_: readonly string[]) =>
    requireCommand(
      commandRunner,
      await buildTerragruntRequest(root, arguments_, terragruntConfigSha256),
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
    await requireReplacementProvisioningAuthorization(root, plan, request, planPath, commandRunner);
    await requireEnrollmentAllowed(root, request.nodeId);
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
    await runTerraform(['init', '-input=false', '-lockfile=readonly']);
    const state = decodeTerraformState(await runTerraform(['state', 'pull']), request.nodeId);
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
    applyEffect: async (_operationPlan, effect, _stepId, beforeMutation, recoveringActiveStep) => {
      if (effect === 'create provider instance') {
        const ownership = reconcileProvisioningOwnership(
          request.nodeId,
          request.providerOwnershipId,
          await providerOwnership(),
        );
        if (ownership.kind === 'import') {
          const state = decodeTerraformState(await runTerraform(['state', 'pull']), request.nodeId);
          if (state.managedInstance === undefined) {
            const variables = await readFile(terraformVariablesPath);
            if (
              createHash('sha256').update(variables).digest('hex') !==
              request.terraformVariablesSha256
            ) {
              // Proof: changing the preparation-produced variable bytes makes response-lost
              // recovery stop before Terraform import can mutate state.
              throw new Error('Terraform import variables differ from the reviewed SHA-256');
            }
            if (((await stat(terraformVariablesPath)).mode & 0o077) !== 0) {
              // Proof: the valid-byte mode-0644 recovery negative stops before Terraform import;
              // reviewed variables must remain private trusted state.
              throw new Error('Terraform import variables must be owner-only');
            }
            await beforeMutation();
            await runTerraform([
              'import',
              '-input=false',
              `-var-file=${terraformVariablesPath}`,
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
          await runTerraform(['show', '-json', savedPlanPath]),
          'Terraform saved plan',
        );
        decodeTerraformPlan(
          shown,
          provisioningTerraformAddresses(request.nodeId, request.clusterId),
          terraformExpectation,
        );
        await beforeMutation();
        await runTerraform(['apply', '-input=false', '-lock=true', savedPlanPath]);
        const { instanceId } = outputNodeIdentity(
          await runTerraform(['output', '-json', 'node_identities']),
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
          await runTerraform(['output', '-json', 'node_identities']),
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
          await runTerraform(['output', '-json', 'node_identities']),
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
          await runTerraform(['output', '-json', 'node_identities']),
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
        await readAnsibleVariables(
          ansibleVariablesPath,
          request.ansibleVariablesSha256,
          request,
          privateAddress,
        );
        if (recoveringActiveStep) {
          try {
            await readFile(machineIdentityPath, 'utf8');
          } catch (cause) {
            // Proof: deleting the trusted identity after a lost enrollment response used to let a
            // different machine be adopted; recovery now fails closed on the missing sidecar.
            throw new Error('Cannot resume without persisted observed machine identity', { cause });
          }
        }
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
        const machineId = requireMachineFact(discoveryOutput, {
          displayName: request.nodeId,
          address: privateAddress,
          providerIdentity: instanceId,
        });
        try {
          const destination = await open(machineIdentityPath, 'wx', 0o600);
          try {
            await destination.writeFile(`${machineId}\n`);
            await destination.sync();
          } finally {
            await destination.close();
          }
        } catch (cause) {
          if (
            !(cause instanceof Error && 'code' in cause && cause.code === 'EEXIST') ||
            (await readFile(machineIdentityPath, 'utf8')) !== `${machineId}\n`
          ) {
            // Proof: changing the persisted post-purchase machine identity makes a resumed
            // enrollment stop before configuring the replacement host.
            throw new Error('Cannot persist exact observed machine identity', { cause });
          }
        }
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
              '--extra-vars',
              `puni_machine_id=${machineId}`,
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
              '--extra-vars',
              `puni_machine_id=${machineId}`,
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
