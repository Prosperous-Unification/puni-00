import { readFile, writeFile } from 'node:fs/promises';

import { parse } from 'yaml';

import { decodeFleet, decodeObservation } from './contracts';
import { type OperationRequest, planOperation } from './plan';

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

function decodeRequest(flags: ReadonlyMap<string, string>): OperationRequest {
  const kind = requireFlag(flags, '--operation');
  const nodeId = requireFlag(flags, '--node');
  switch (kind) {
    case 'enroll': {
      requireExactFlags(flags, ['--cluster']);
      return { kind, nodeId, clusterId: requireFlag(flags, '--cluster') };
    }
    case 'retire':
    case 'replace':
    case 'destroy': {
      requireExactFlags(flags, []);
      return { kind, nodeId };
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
        '--region',
        '--retained-storage',
        '--ssh-key-ids',
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
        budgetCapEur,
      };
    }
    default:
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
  const plan = planOperation(decodeFleet(fleetInput), decodeObservation(observationInput), request);
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
