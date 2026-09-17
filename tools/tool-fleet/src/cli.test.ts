import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { describe, expect, test } from 'bun:test';
import { parse } from 'yaml';

import { decodeFleet } from './contracts';
import { observationFixture } from './testing/fleet';

const root = join(import.meta.dir, '../../..');

async function createPlanFixture() {
  const directory = await scratchAsync('tool-fleet-plan-cli-');
  const observation = join(directory, 'observation.json');
  const output = join(directory, 'operation.json');
  const fleetPath = join(directory, 'fleet.yaml');
  const fleetInput = parse(
    await readFile(join(root, 'infra/fleet/examples/local.yaml'), 'utf8'),
  ) as { clusters: { id: string; requiredCapabilities: Record<string, number> }[] };
  const workers = fleetInput.clusters.find(({ id }) => id === 'workers');
  if (workers === undefined) throw new Error('CLI fixture has no workers cluster');
  workers.requiredCapabilities['execution'] = 1;
  await writeFile(fleetPath, `${JSON.stringify(fleetInput)}\n`);
  const fleet = decodeFleet(fleetInput);
  await writeFile(observation, `${JSON.stringify(observationFixture(fleet))}\n`);
  return {
    directory,
    fleet: fleetPath,
    observation,
    output,
  };
}

function invokePlan(argv: readonly string[]) {
  return Bun.spawnSync([process.execPath, 'tools/tool-fleet/src/entrypoint.ts', 'plan', ...argv], {
    cwd: root,
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

function buildBaseArguments(fixture: Awaited<ReturnType<typeof createPlanFixture>>): string[] {
  return [
    '--fleet',
    fixture.fleet,
    '--observation',
    fixture.observation,
    '--output',
    fixture.output,
  ];
}

function retirementEvidenceArguments(): string[] {
  return [
    '--backup-receipt',
    'backup-workers-1',
    '--inventory-sha256',
    'e'.repeat(64),
    '--known-hosts-sha256',
    'f'.repeat(64),
  ];
}

test('the production plan command writes JSON and a human summary', async () => {
  const fixture = await createPlanFixture();
  const invocation = invokePlan([
    ...buildBaseArguments(fixture),
    '--operation',
    'retire',
    '--node',
    'workers-agent-a',
    ...retirementEvidenceArguments(),
  ]);
  expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);
  expect(invocation.stdout.toString()).toContain('retire workers-agent-a');
  const plan = JSON.parse(await readFile(fixture.output, 'utf8')) as Record<string, unknown>;
  expect(plan['planSha256']).toMatch(/^[0-9a-f]{64}$/);
  expect(plan['desiredRevision']).toBe('local-v1');
});

describe('production plan input boundary', () => {
  test('binds destroy to an owner-only completed retirement receipt for the exact provider', async () => {
    const fixture = await createPlanFixture();
    const fleet = decodeFleet(parse(await readFile(fixture.fleet, 'utf8')) as unknown);
    const target = fleet.nodes.find(({ id }) => id === 'workers-agent-a');
    if (target === undefined) throw new Error('CLI fixture destroy target is absent');
    const providerIdentity =
      target.provider.kind === 'hcloud'
        ? `hcloud:${target.provider.instanceId}`
        : `ssh:${target.provider.machineId}`;
    const receiptPath = join(fixture.directory, 'retirement-receipt.json');
    const receipt = `${JSON.stringify({
      schemaVersion: 1,
      nodeId: target.id,
      providerIdentity,
      kubernetesNodeUid: 'uid-workers-agent-a',
      backupReceipt: 'backup-workers-1',
      planSha256: 'a'.repeat(64),
      state: 'retired',
    })}\n`;
    await writeFile(receiptPath, receipt, { mode: 0o600 });
    const receiptSha256 = createHash('sha256').update(receipt).digest('hex');
    const invocation = invokePlan([
      ...buildBaseArguments(fixture),
      '--operation',
      'destroy',
      '--node',
      target.id,
      '--retirement-receipt',
      receiptPath,
      '--retirement-receipt-sha256',
      receiptSha256,
    ]);
    expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);

    const changedFixture = await createPlanFixture();
    await writeFile(receiptPath, receipt.replace(target.id, 'another-node'), { mode: 0o600 });
    const changed = invokePlan([
      ...buildBaseArguments(changedFixture),
      '--operation',
      'destroy',
      '--node',
      target.id,
      '--retirement-receipt',
      receiptPath,
      '--retirement-receipt-sha256',
      receiptSha256,
    ]);
    expect(changed.exitCode).not.toBe(0);
    expect(changed.stderr.toString()).toContain('differs from its reviewed SHA-256');

    const wrongIdentityFixture = await createPlanFixture();
    const wrongIdentityReceipt = receipt.replace(target.id, 'another-node');
    const wrongIdentitySha256 = createHash('sha256').update(wrongIdentityReceipt).digest('hex');
    const wrongIdentity = invokePlan([
      ...buildBaseArguments(wrongIdentityFixture),
      '--operation',
      'destroy',
      '--node',
      target.id,
      '--retirement-receipt',
      receiptPath,
      '--retirement-receipt-sha256',
      wrongIdentitySha256,
    ]);
    expect(wrongIdentity.exitCode).not.toBe(0);
    expect(wrongIdentity.stderr.toString()).toContain('exact provider identity');
  });

  test('refuses missing, duplicate, valueless, unknown, and operation-inapplicable flags', async () => {
    const fixture = await createPlanFixture();
    const cases = [
      {
        argv: [...buildBaseArguments(fixture), '--operation', 'retire'],
        diagnostic: 'Missing required --node',
      },
      {
        argv: [
          ...buildBaseArguments(fixture),
          '--operation',
          'retire',
          '--node',
          'workers-agent-a',
          '--node',
          'workers-agent-b',
          ...retirementEvidenceArguments(),
        ],
        diagnostic: 'Duplicate fleet plan flag: --node',
      },
      {
        argv: [...buildBaseArguments(fixture), '--operation'],
        diagnostic: 'Fleet plan flag has no value: --operation',
      },
      {
        argv: [
          'fleet',
          fixture.fleet,
          '--observation',
          fixture.observation,
          '--output',
          fixture.output,
          '--operation',
          'retire',
          '--node',
          'workers-agent-a',
        ],
        diagnostic: 'Invalid fleet plan argument at position 1',
      },
      {
        argv: [
          ...buildBaseArguments(fixture),
          '--operation',
          'reconcile',
          '--node',
          'workers-agent-a',
        ],
        diagnostic: 'Unknown fleet operation: reconcile',
      },
      {
        argv: [
          ...buildBaseArguments(fixture),
          '--operation',
          'retire',
          '--node',
          'workers-agent-a',
          ...retirementEvidenceArguments(),
          '--unknown-flag',
          'ignored',
        ],
        diagnostic: 'Unexpected fleet plan flag: --unknown-flag',
      },
      {
        argv: [
          ...buildBaseArguments(fixture),
          '--operation',
          'retire',
          '--node',
          'workers-agent-a',
          ...retirementEvidenceArguments(),
          '--version',
          'v1.36.5+k3s1',
        ],
        diagnostic: 'Unexpected fleet plan flag: --version',
      },
    ];
    for (const boundaryCase of cases) {
      const invocation = invokePlan(boundaryCase.argv);
      expect(invocation.exitCode).not.toBe(0);
      expect(invocation.stderr.toString()).toContain(boundaryCase.diagnostic);
    }
  });

  test('refuses malformed provisioning booleans and SSH key lists', async () => {
    const fixture = await createPlanFixture();
    const provision = [
      ...buildBaseArguments(fixture),
      '--operation',
      'provision',
      '--node',
      'workers-c',
      '--cluster',
      'workers',
      '--cloud-account',
      'puni-production',
      '--region',
      'fsn1',
      '--machine-type',
      'cx33',
      '--image',
      'ubuntu-24.04',
      '--network',
      'puni-private',
      '--ssh-key-ids',
      'admin-primary',
      '--retained-storage',
      'false',
      '--budget-cap-eur',
      '20',
      '--provider-ownership-id',
      'provision-workers-c-20260917',
      '--terraform-plan-sha256',
      'f'.repeat(64),
      '--terraform-state-lineage',
      'lineage-1',
      '--terraform-state-serial',
      '7',
    ];
    const invalidBoolean = [...provision];
    invalidBoolean[invalidBoolean.indexOf('false')] = 'tru';
    const booleanInvocation = invokePlan(invalidBoolean);
    expect(booleanInvocation.exitCode).not.toBe(0);
    expect(booleanInvocation.stderr.toString()).toContain(
      '--retained-storage must be true or false',
    );

    const invalidKeys = [...provision];
    invalidKeys[invalidKeys.indexOf('admin-primary')] = 'admin-primary,,';
    const keysInvocation = invokePlan(invalidKeys);
    expect(keysInvocation.exitCode).not.toBe(0);
    expect(keysInvocation.stderr.toString()).toContain('--ssh-key-ids contains an empty identity');
  });

  test('refuses absent, unreadable, and malformed required fleet and observation state', async () => {
    const fixture = await createPlanFixture();
    const missing = join(fixture.directory, 'missing');
    const unreadable = join(fixture.directory, 'unreadable');
    await mkdir(unreadable);
    const malformedFleet = join(fixture.directory, 'malformed.yaml');
    const malformedObservation = join(fixture.directory, 'malformed.json');
    await writeFile(malformedFleet, '[\n');
    await writeFile(malformedObservation, '{');
    const pairs = [
      {
        fleet: missing,
        observation: fixture.observation,
        diagnostic: 'Cannot read required fleet',
      },
      {
        fleet: unreadable,
        observation: fixture.observation,
        diagnostic: 'Cannot read required fleet',
      },
      {
        fleet: malformedFleet,
        observation: fixture.observation,
        diagnostic: 'malformed YAML',
      },
      {
        fleet: fixture.fleet,
        observation: missing,
        diagnostic: 'Cannot read required observation',
      },
      {
        fleet: fixture.fleet,
        observation: unreadable,
        diagnostic: 'Cannot read required observation',
      },
      {
        fleet: fixture.fleet,
        observation: malformedObservation,
        diagnostic: 'malformed JSON',
      },
    ];
    for (const pair of pairs) {
      const invocation = invokePlan([
        '--fleet',
        pair.fleet,
        '--observation',
        pair.observation,
        '--output',
        fixture.output,
        '--operation',
        'retire',
        '--node',
        'workers-agent-a',
        ...retirementEvidenceArguments(),
      ]);
      expect(invocation.exitCode).not.toBe(0);
      expect(invocation.stderr.toString()).toContain(pair.diagnostic);
    }
  });

  test('refuses an occupied output without changing its bytes', async () => {
    const fixture = await createPlanFixture();
    await writeFile(fixture.output, 'reviewed-plan-bytes\n');
    const invocation = invokePlan([
      ...buildBaseArguments(fixture),
      '--operation',
      'retire',
      '--node',
      'workers-agent-a',
      ...retirementEvidenceArguments(),
    ]);
    expect(invocation.exitCode).not.toBe(0);
    expect(invocation.stderr.toString()).toContain('Cannot create new operation plan');
    expect(await readFile(fixture.output, 'utf8')).toBe('reviewed-plan-bytes\n');
  });
});
