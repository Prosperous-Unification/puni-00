import { createHash, randomBytes } from 'node:crypto';
import { chmod, open, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import type { ApplyDependencies, ApplyObservation, OperationLease } from './apply';
import type { OperationPlan } from './plan';
import {
  decodeTerraformPlan,
  decodeTerraformStateIdentity,
  provisioningTerraformAddresses,
} from './terraform';

const commandTimeoutMs = 120_000;
const leaseDurationSeconds = 300;

export interface TerraformPlanEvidence {
  readonly terraformPlanSha256: string;
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

async function runBoundedCommand(request: CommandRequest): Promise<CommandResponse> {
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
      reject(new Error(`${request.executable} timed out after ${String(commandTimeoutMs)}ms`));
    }, commandTimeoutMs);
  });
  try {
    return await Promise.race([completed, expired]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
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
  nodeId: string,
  clusterId: string,
  providerOwnershipId: string,
  variablesPath: string,
  outputPath: string,
  run: RunCommand = runBoundedCommand,
): Promise<TerraformPlanEvidence> {
  const terraformRoot = join(root, 'infra/terraform');
  const candidatePath = `${outputPath}.${randomBytes(8).toString('hex')}.new`;
  const terraform = (arguments_: readonly string[]) =>
    requireCommand(
      run,
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
    decodeTerraformPlan(shown, provisioningTerraformAddresses(nodeId, clusterId), {
      nodeId,
      operationId: providerOwnershipId,
    });
    const state = decodeTerraformState(await terraform(['state', 'pull']), nodeId).identity;
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
      terraformStateLineage: state.lineage,
      terraformStateSerial: state.serial,
    };
    await removePlanCandidate(candidatePath);
    return evidence;
  } catch (cause) {
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

function leaseManifest(plan: OperationPlan, renewedAt: string, resourceVersion?: string): string {
  return JSON.stringify({
    apiVersion: 'coordination.k8s.io/v1',
    kind: 'Lease',
    metadata: {
      name: leaseName(plan),
      namespace: 'puni-system',
      ...(resourceVersion === undefined ? {} : { resourceVersion }),
    },
    spec: {
      holderIdentity: plan.planSha256,
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
  now: Date,
): Promise<OperationLease> {
  const existing = await readLease(run, plan);
  if (
    existing !== undefined &&
    existing.holder !== plan.planSha256 &&
    now.getTime() < Date.parse(leaseExpiresAt(existing))
  ) {
    // Proof: the concurrent-operation production adapter negative supplies an unexpired Lease for
    // another digest and observes no create/replace request.
    throw new Error(`Cluster ${clusterId(plan)} has an active operation Lease`);
  }
  const renewedAt = now.toISOString();
  const manifest = leaseManifest(plan, renewedAt, existing?.resourceVersion);
  const verb = existing === undefined ? 'create' : 'replace';
  const source = await requireCommand(
    run,
    kubectlLeaseRequest(plan, verb, manifest),
    `Acquire operation Lease for ${clusterId(plan)}`,
  );
  const acquired = decodeLease(source);
  if (acquired.holder !== plan.planSha256) {
    throw new Error('Kubernetes returned a Lease for a different operation');
  }
  return { owner: acquired.holder, expiresAt: leaseExpiresAt(acquired) };
}

function decodeTerraformState(
  source: string,
  nodeId: string,
): {
  readonly identity: { readonly lineage: string; readonly serial: number };
  readonly providerState: 'ready' | 'pending-deletion';
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
  return {
    identity,
    providerState: attributes['status'] === 'deleting' ? 'pending-deletion' : 'ready',
  };
}

function outputInstanceId(source: string, nodeId: string): string {
  const document = requireRecord(parseJson(source, 'Terraform output'), 'Terraform output');
  const output = requireRecord(document['node_identities'], 'Terraform node_identities output');
  const identities = requireRecord(output['value'], 'Terraform node identities');
  const node = requireRecord(identities[nodeId], `Terraform identity ${nodeId}`);
  const instanceId = node['instance_id'];
  if (typeof instanceId !== 'string' || instanceId.length === 0) {
    throw new Error(`Terraform identity ${nodeId} has no provider instance ID`);
  }
  return instanceId;
}

/** Build the fixed production adapters used by the persisted-plan apply CLI. */
export function createProductionApplyDependencies(
  root: string,
  plan: OperationPlan,
  planPath: string,
  run: RunCommand = runBoundedCommand,
  now: () => Date = () => new Date(),
): ApplyDependencies {
  if (plan.request.kind !== 'provision') {
    throw new Error(
      `Production apply for ${plan.request.kind} is introduced by its lifecycle task`,
    );
  }
  const request = plan.request;
  const terraformRoot = join(root, 'infra/terraform');
  const savedPlanPath = `${planPath}.tfplan`;
  const terraform = (arguments_: readonly string[]) =>
    requireCommand(
      run,
      { executable: 'terraform', arguments: arguments_, cwd: terraformRoot },
      'Terraform provisioning command',
    );

  async function observe(): Promise<ApplyObservation> {
    const savedPlan = await readFile(savedPlanPath);
    const digest = createHash('sha256').update(savedPlan).digest('hex');
    if (digest !== request.terraformPlanSha256) {
      // Proof: the saved-plan digest production adapter negative replaces the artifact bytes and
      // reaches neither Terraform apply nor Ansible enrollment.
      throw new Error('Saved Terraform plan differs from the reviewed SHA-256');
    }
    await terraform(['init', '-input=false', '-lockfile=readonly']);
    const state = decodeTerraformState(await terraform(['state', 'pull']), request.nodeId);
    return {
      digest: plan.observationDigest,
      targetIdentities: plan.targetIdentities,
      providerState: state.providerState,
      terraformState: state.identity,
    };
  }

  return {
    now,
    acquireLease: (operationPlan) => acquireLease(run, operationPlan, now()),
    ownsLease: async (lease) => {
      const current = await readLease(run, plan);
      return (
        current?.holder === lease.owner && now().getTime() < Date.parse(leaseExpiresAt(current))
      );
    },
    observe: () => observe(),
    applyEffect: async (_operationPlan, effect) => {
      if (effect === 'create provider instance') {
        const shown = parseJson(
          await terraform(['show', '-json', savedPlanPath]),
          'Terraform saved plan',
        );
        decodeTerraformPlan(
          shown,
          provisioningTerraformAddresses(request.nodeId, request.clusterId),
          { nodeId: request.nodeId, operationId: request.providerOwnershipId },
        );
        await terraform(['apply', '-input=false', '-lock=true', savedPlanPath]);
        const instanceId = outputInstanceId(
          await terraform(['output', '-json', 'node_identities']),
          request.nodeId,
        );
        return { externalResourceId: instanceId };
      }
      if (effect === 'record provider identity') {
        const instanceId = outputInstanceId(
          await terraform(['output', '-json', 'node_identities']),
          request.nodeId,
        );
        return { externalResourceId: instanceId };
      }
      if (effect === 'enroll configured host') {
        await requireCommand(
          run,
          {
            executable: 'ansible-playbook',
            arguments: [
              '--inventory',
              join(root, `infra/ansible/inventory/${request.clusterId}.hcloud.yml`),
              '--limit',
              request.nodeId,
              join(root, 'infra/ansible/playbooks/join.yml'),
            ],
            cwd: join(root, 'infra/ansible'),
          },
          `Enroll ${request.nodeId}`,
        );
        return {};
      }
      throw new Error(`Unsupported provisioning effect: ${effect}`);
    },
  };
}
