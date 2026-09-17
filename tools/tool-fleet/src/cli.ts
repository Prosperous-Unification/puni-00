import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';

import { parse } from 'yaml';

import { type ApplyDependencies, applyOperation } from './apply';
import {
  type Capability,
  decodeFleet,
  decodeFleetObservation,
  decodeObservation,
} from './contracts';
import {
  decodeOperationPlan,
  type OperationPlan,
  type OperationRequest,
  planOperation,
  sealOperationPlan,
} from './plan';
import { prepareTerraformPlan } from './production-apply';
import { planRetirement } from './retire';

function readFlags(argv: readonly string[]): ReadonlyMap<string, string> {
  const flags = new Map<string, string>();
  for (let position = 0; position < argv.length; position += 2) {
    if (position + 1 >= argv.length) {
      // Proof: removing this refusal made the valueless-flag production CLI negative advance with
      // an undefined value instead of naming the incomplete argument.
      throw new Error(`Fleet plan flag has no value: ${argv[position]}`);
    }
    const flag = argv[position];
    const value = argv[position + 1];
    if (!flag.startsWith('--')) {
      // Proof: disabling this refusal made the positional-argument production CLI negative reach
      // the operation allowlist and lose the exact location of the malformed input.
      throw new Error(`Invalid fleet plan argument at position ${String(position + 1)}`);
    }
    if (flags.has(flag)) {
      // Proof: removing this refusal made the production CLI duplicate-flag negative fail by
      // silently replacing the reviewed target with the last occurrence.
      throw new Error(`Duplicate fleet plan flag: ${flag}`);
    }
    flags.set(flag, value);
  }
  return flags;
}

function requireFlag(flags: ReadonlyMap<string, string>, name: string): string {
  const value = flags.get(name);
  if (value === undefined || value.length === 0) {
    // Proof: removing this refusal made the missing-target production CLI negative proceed without
    // an explicit node identity.
    throw new Error(`Missing required ${name}`);
  }
  return value;
}

const commonFlags = ['--fleet', '--observation', '--operation', '--node', '--output'] as const;

function requireExactFlags(
  flags: ReadonlyMap<string, string>,
  operationFlags: readonly string[],
): void {
  const allowed = new Set<string>([...commonFlags, ...operationFlags]);
  for (const flag of flags.keys()) {
    if (!allowed.has(flag)) {
      // Proof: removing this refusal made unknown and operation-inapplicable production CLI flags
      // disappear while an exit-zero plan was persisted.
      throw new Error(`Unexpected fleet plan flag: ${flag}`);
    }
  }
}

function decodeBooleanFlag(flags: ReadonlyMap<string, string>, name: string): boolean {
  const value = requireFlag(flags, name);
  if (value !== 'true' && value !== 'false') {
    // Proof: replacing this refusal with `value === 'true'` made `tru` silently become false in the
    // production CLI negative and changed the persisted storage request.
    throw new Error(`${name} must be true or false`);
  }
  return value === 'true';
}

function decodeCapabilities(source: string): readonly Capability[] {
  return source.split(',').map((capability) => {
    switch (capability) {
      case 'control-plane':
      case 'product':
      case 'ingress':
      case 'observability':
      case 'forge':
      case 'execution':
        return capability;
      default:
        throw new Error(`Unknown provision capability: ${capability}`);
    }
  });
}

function decodeRequest(flags: ReadonlyMap<string, string>): OperationRequest {
  const kind = requireFlag(flags, '--operation');
  const nodeId = requireFlag(flags, '--node');
  switch (kind) {
    case 'enroll': {
      requireExactFlags(flags, [
        '--cluster',
        '--inventory-sha256',
        '--ansible-variables-sha256',
        '--known-hosts-sha256',
      ]);
      return {
        kind,
        nodeId,
        clusterId: requireFlag(flags, '--cluster'),
        inventorySha256: requireFlag(flags, '--inventory-sha256'),
        ansibleVariablesSha256: requireFlag(flags, '--ansible-variables-sha256'),
        knownHostsSha256: requireFlag(flags, '--known-hosts-sha256'),
      };
    }
    case 'replace': {
      requireExactFlags(flags, []);
      return { kind, nodeId };
    }
    case 'destroy': {
      requireExactFlags(flags, ['--retirement-receipt', '--retirement-receipt-sha256']);
      requireFlag(flags, '--retirement-receipt');
      return {
        kind,
        nodeId,
        retirementReceiptSha256: requireFlag(flags, '--retirement-receipt-sha256'),
      };
    }
    case 'retire': {
      requireExactFlags(flags, ['--backup-receipt', '--inventory-sha256', '--known-hosts-sha256']);
      return {
        kind,
        nodeId,
        backupReceipt: requireFlag(flags, '--backup-receipt'),
        inventorySha256: requireFlag(flags, '--inventory-sha256'),
        knownHostsSha256: requireFlag(flags, '--known-hosts-sha256'),
      };
    }
    case 'upgrade': {
      requireExactFlags(flags, ['--version']);
      return { kind, nodeId, version: requireFlag(flags, '--version') };
    }
    case 'provision': {
      requireExactFlags(flags, [
        '--budget-cap-eur',
        '--cloud-account',
        '--cluster',
        '--image',
        '--machine-type',
        '--network',
        '--provider-ownership-id',
        '--region',
        '--retained-storage',
        '--k3s-role',
        '--capabilities',
        '--ssh-key-ids',
        '--terraform-plan-sha256',
        '--terraform-variables-sha256',
        '--terraform-backend-evidence-sha256',
        '--ansible-variables-sha256',
        '--terraform-state-lineage',
        '--terraform-state-serial',
      ]);
      const keySource = requireFlag(flags, '--ssh-key-ids');
      const sshKeyIds = keySource.split(',');
      if (sshKeyIds.some((key) => key.length === 0)) {
        // Proof: filtering empty entries made `admin-primary,,` produce an exit-zero plan; the
        // production CLI negative now keeps malformed identity lists visible.
        throw new Error('--ssh-key-ids contains an empty identity');
      }
      const budgetCapEur = Number(requireFlag(flags, '--budget-cap-eur'));
      return {
        kind,
        nodeId,
        clusterId: requireFlag(flags, '--cluster'),
        cloudAccount: requireFlag(flags, '--cloud-account'),
        region: requireFlag(flags, '--region'),
        machineType: requireFlag(flags, '--machine-type'),
        image: requireFlag(flags, '--image'),
        network: requireFlag(flags, '--network'),
        sshKeyIds,
        retainedStorage: decodeBooleanFlag(flags, '--retained-storage'),
        k3sRole: (() => {
          const role = requireFlag(flags, '--k3s-role');
          if (role !== 'server' && role !== 'agent') throw new Error('--k3s-role is invalid');
          return role;
        })(),
        capabilities: decodeCapabilities(requireFlag(flags, '--capabilities')),
        budgetCapEur,
        providerOwnershipId: requireFlag(flags, '--provider-ownership-id'),
        terraformPlanSha256: requireFlag(flags, '--terraform-plan-sha256'),
        terraformVariablesSha256: requireFlag(flags, '--terraform-variables-sha256'),
        terraformBackendEvidenceSha256: requireFlag(flags, '--terraform-backend-evidence-sha256'),
        ansibleVariablesSha256: requireFlag(flags, '--ansible-variables-sha256'),
        terraformStateLineage: requireFlag(flags, '--terraform-state-lineage'),
        terraformStateSerial: Number(requireFlag(flags, '--terraform-state-serial')),
      };
    }
    default:
      // Proof: removing this refusal made the unknown-operation production CLI negative reach the
      // planner with an undefined request instead of naming the unsupported operation.
      throw new Error(`Unknown fleet operation: ${kind}`);
  }
}

async function readRequiredState(path: string, label: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (cause) {
    // Proof: removing this context made the absent/unreadable fleet and observation production CLI
    // negatives expose raw ENOENT/EISDIR instead of naming the required state boundary.
    throw new Error(`Cannot read required ${label} at ${path}`, { cause });
  }
}

async function requireRetirementReceipt(
  flags: ReadonlyMap<string, string>,
  fleet: ReturnType<typeof decodeFleet>,
  request: Extract<OperationRequest, { kind: 'destroy' }>,
): Promise<void> {
  const path = requireFlag(flags, '--retirement-receipt');
  const source = await readRequiredState(path, 'retirement receipt');
  if (createHash('sha256').update(source).digest('hex') !== request.retirementReceiptSha256) {
    // Proof: the changed-retirement-receipt production CLI negative refuses before persisting a
    // provider destruction plan.
    throw new Error('Retirement receipt differs from its reviewed SHA-256');
  }
  if (((await stat(path)).mode & 0o077) !== 0) {
    throw new Error('Retirement receipt must be owner-only');
  }
  let input: unknown;
  try {
    input = JSON.parse(source) as unknown;
  } catch (cause) {
    throw new Error(`Required retirement receipt at ${path} is malformed JSON`, { cause });
  }
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('Retirement receipt is not an object');
  }
  const receipt: Record<string, unknown> = Object.fromEntries(Object.entries(input));
  const node = fleet.nodes.find(({ id }) => id === request.nodeId);
  if (node === undefined) throw new Error(`Destroy targets unknown fleet node: ${request.nodeId}`);
  const providerIdentity =
    node.provider.kind === 'hcloud'
      ? `hcloud:${node.provider.instanceId}`
      : `ssh:${node.provider.machineId}`;
  if (
    receipt['schemaVersion'] !== 1 ||
    receipt['state'] !== 'retired' ||
    receipt['nodeId'] !== request.nodeId ||
    receipt['providerIdentity'] !== providerIdentity ||
    typeof receipt['planSha256'] !== 'string' ||
    !/^[0-9a-f]{64}$/.test(receipt['planSha256'])
  ) {
    // Proof: the wrong-node and wrong-provider receipt production CLI negatives refuse before a
    // destruction plan can name another provider instance.
    throw new Error('Retirement receipt does not complete this exact provider identity');
  }
}

/** Run the fleet planning command and persist the exact digest-bearing JSON. */
export async function runPlan(argv: readonly string[]): Promise<void> {
  const flags = readFlags(argv);
  const request = decodeRequest(flags);
  const fleetPath = requireFlag(flags, '--fleet');
  const observationPath = requireFlag(flags, '--observation');
  const outputPath = requireFlag(flags, '--output');
  const fleetSource = await readRequiredState(fleetPath, 'fleet');
  const observationSource = await readRequiredState(observationPath, 'observation');
  let fleetInput: unknown;
  let observationInput: unknown;
  try {
    fleetInput = parse(fleetSource) as unknown;
  } catch (cause) {
    // Proof: removing this context made the malformed-YAML production CLI negative expose the
    // parser diagnostic without the required fleet path.
    throw new Error(`Required fleet at ${fleetPath} is malformed YAML`, { cause });
  }
  try {
    observationInput = JSON.parse(observationSource) as unknown;
  } catch (cause) {
    // Proof: removing this context made the malformed-JSON production CLI negative expose a raw
    // parser diagnostic without the required observation path.
    throw new Error(`Required observation at ${observationPath} is malformed JSON`, { cause });
  }
  const fleet = decodeFleet(fleetInput);
  const observation = decodeObservation(observationInput);
  if (request.kind === 'destroy') await requireRetirementReceipt(flags, fleet, request);
  let plan = planOperation(fleet, observation, request);
  if (request.kind === 'retire') {
    const retirement = planRetirement(
      fleet,
      decodeFleetObservation(observationInput),
      request.nodeId,
    );
    const { planSha256: _planSha256, ...body } = plan;
    plan = sealOperationPlan({
      ...body,
      targetIdentities: [
        `node:${retirement.nodeId}`,
        retirement.providerIdentity,
        `kubernetes:${retirement.kubernetesNodeUid}`,
        `cluster:${retirement.clusterId}`,
        `api-endpoint:${retirement.apiEndpoint}`,
        `minimum-control-planes:${String(retirement.minimumSurvivingControlPlanes)}`,
      ],
      effects: retirement.steps,
      affectedCapabilities: retirement.affectedCapabilities,
    });
  }
  try {
    await writeFile(outputPath, `${JSON.stringify(plan, undefined, 2)}\n`, {
      flag: 'wx',
      mode: 0o600,
    });
  } catch (cause) {
    // Proof: replacing exclusive creation with ordinary write made the occupied-output production
    // CLI negative overwrite reviewed bytes; restored boundary preserves the existing plan.
    throw new Error(`Cannot create new operation plan at ${outputPath}`, { cause });
  }
  process.stdout.write(`${plan.summary}\nplan sha256: ${plan.planSha256}\n`);
}

export type CreateApplyDependencies = (plan: OperationPlan, planPath: string) => ApplyDependencies;

/** Run apply from only an exact persisted plan and the operator-reviewed digest. */
export async function runApply(
  argv: readonly string[],
  createDependencies: CreateApplyDependencies,
): Promise<void> {
  const flags = readFlags(argv);
  requireExactFlagsForApply(flags);
  const planPath = requireFlag(flags, '--plan');
  const expectedSha256 = requireFlag(flags, '--expect-sha256');
  const source = await readRequiredState(planPath, 'operation plan');
  let input: unknown;
  try {
    input = JSON.parse(source) as unknown;
  } catch (cause) {
    // Proof: the malformed persisted-plan production CLI negative reaches no dependency factory.
    throw new Error(`Required operation plan at ${planPath} is malformed JSON`, { cause });
  }
  const plan = decodeOperationPlan(input);
  const receipt = await applyOperation({
    plan,
    expectedSha256,
    journalPath: `${planPath}.journal.json`,
    dependencies: createDependencies(plan, planPath),
  });
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

function requireExactFlagsForApply(flags: ReadonlyMap<string, string>): void {
  const allowed = new Set(['--plan', '--expect-sha256']);
  for (const flag of flags.keys()) {
    if (!allowed.has(flag)) {
      // Proof: the apply CLI unknown-flag negative cannot inject a mutable path or precondition.
      throw new Error(`Unexpected fleet apply flag: ${flag}`);
    }
  }
}

/** Prepare the exact saved Terraform artifact and print its immutable operation bindings. */
export async function runTerraformPlan(argv: readonly string[], root: string): Promise<void> {
  const flags = readFlags(argv);
  const allowed = new Set([
    '--node',
    '--cluster',
    '--region',
    '--machine-type',
    '--image',
    '--network',
    '--ssh-key-ids',
    '--retained-storage',
    '--k3s-role',
    '--budget-cap-eur',
    '--provider-ownership-id',
    '--cloud-account',
    '--backend-evidence',
    '--variables',
    '--output',
  ]);
  for (const flag of flags.keys()) {
    if (!allowed.has(flag)) throw new Error(`Unexpected Terraform plan flag: ${flag}`);
  }
  const evidence = await prepareTerraformPlan(
    root,
    {
      nodeId: requireFlag(flags, '--node'),
      clusterId: requireFlag(flags, '--cluster'),
      operationId: requireFlag(flags, '--provider-ownership-id'),
      region: requireFlag(flags, '--region'),
      machineType: requireFlag(flags, '--machine-type'),
      image: requireFlag(flags, '--image'),
      network: requireFlag(flags, '--network'),
      sshKeyIds: requireFlag(flags, '--ssh-key-ids').split(','),
      retainedStorage: decodeBooleanFlag(flags, '--retained-storage'),
      k3sRole: (() => {
        const role = requireFlag(flags, '--k3s-role');
        if (role !== 'server' && role !== 'agent') throw new Error('--k3s-role is invalid');
        return role;
      })(),
      budgetCapEur: Number(requireFlag(flags, '--budget-cap-eur')),
    },
    requireFlag(flags, '--cloud-account'),
    requireFlag(flags, '--backend-evidence'),
    requireFlag(flags, '--variables'),
    requireFlag(flags, '--output'),
  );
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
}
