import { readFile, writeFile } from 'node:fs/promises';

import { parse } from 'yaml';

import { decodeFleet, decodeObservation } from './contracts';
import { type OperationRequest, planOperation } from './plan';

function flagsOf(argv: readonly string[]): ReadonlyMap<string, string> {
  const flags = new Map<string, string>();
  for (let position = 0; position < argv.length; position += 2) {
    if (position + 1 >= argv.length) {
      throw new Error(`Fleet plan flag has no value: ${argv[position]}`);
    }
    const flag = argv[position];
    const value = argv[position + 1];
    if (!flag.startsWith('--')) {
      throw new Error(`Invalid fleet plan argument at position ${String(position + 1)}`);
    }
    if (flags.has(flag)) throw new Error(`Duplicate fleet plan flag: ${flag}`);
    flags.set(flag, value);
  }
  return flags;
}

function required(flags: ReadonlyMap<string, string>, name: string): string {
  const value = flags.get(name);
  if (value === undefined || value.length === 0) throw new Error(`Missing required ${name}`);
  return value;
}

function requestOf(flags: ReadonlyMap<string, string>): OperationRequest {
  const kind = required(flags, '--operation');
  const nodeId = required(flags, '--node');
  switch (kind) {
    case 'enroll':
      return { kind, nodeId, clusterId: required(flags, '--cluster') };
    case 'retire':
    case 'replace':
    case 'destroy':
      return { kind, nodeId };
    case 'upgrade':
      return { kind, nodeId, version: required(flags, '--version') };
    case 'provision': {
      const budgetCapEur = Number(required(flags, '--budget-cap-eur'));
      return {
        kind,
        nodeId,
        clusterId: required(flags, '--cluster'),
        cloudAccount: required(flags, '--cloud-account'),
        region: required(flags, '--region'),
        machineType: required(flags, '--machine-type'),
        image: required(flags, '--image'),
        network: required(flags, '--network'),
        sshKeyIds: required(flags, '--ssh-key-ids')
          .split(',')
          .filter((key) => key.length > 0),
        retainedStorage: required(flags, '--retained-storage') === 'true',
        budgetCapEur,
      };
    }
    default:
      throw new Error(`Unknown fleet operation: ${kind}`);
  }
}

async function readRequired(path: string, label: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (cause) {
    throw new Error(`Cannot read required ${label} at ${path}`, { cause });
  }
}

/** Run the fleet planning command and persist the exact digest-bearing JSON. */
export async function runPlan(argv: readonly string[]): Promise<void> {
  const flags = flagsOf(argv);
  const request = requestOf(flags);
  const fleetPath = required(flags, '--fleet');
  const observationPath = required(flags, '--observation');
  const outputPath = required(flags, '--output');
  const fleetSource = await readRequired(fleetPath, 'fleet');
  const observationSource = await readRequired(observationPath, 'observation');
  let fleetInput: unknown;
  let observationInput: unknown;
  try {
    fleetInput = parse(fleetSource) as unknown;
  } catch (cause) {
    throw new Error(`Required fleet at ${fleetPath} is malformed YAML`, { cause });
  }
  try {
    observationInput = JSON.parse(observationSource) as unknown;
  } catch (cause) {
    throw new Error(`Required observation at ${observationPath} is malformed JSON`, { cause });
  }
  const plan = planOperation(decodeFleet(fleetInput), decodeObservation(observationInput), request);
  await writeFile(outputPath, `${JSON.stringify(plan, undefined, 2)}\n`, {
    flag: 'wx',
    mode: 0o600,
  });
  process.stdout.write(`${plan.summary}\nplan sha256: ${plan.planSha256}\n`);
}
