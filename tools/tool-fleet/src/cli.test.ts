import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { describe, expect, test } from 'bun:test';

const root = join(import.meta.dir, '../../..');

async function createPlanFixture() {
  const directory = await scratchAsync('tool-fleet-plan-cli-');
  const observation = join(directory, 'observation.json');
  const output = join(directory, 'operation.json');
  await writeFile(
    observation,
    `${JSON.stringify({
      schemaVersion: 1,
      observedAt: '2026-09-17T09:00:00.000Z',
      digest: 'a'.repeat(64),
      complete: true,
    })}\n`,
  );
  return {
    directory,
    fleet: join(root, 'infra/fleet/examples/local.yaml'),
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

test('the production plan command writes JSON and a human summary', async () => {
  const fixture = await createPlanFixture();
  const invocation = invokePlan([
    ...buildBaseArguments(fixture),
    '--operation',
    'retire',
    '--node',
    'workers-agent-a',
  ]);
  expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);
  expect(invocation.stdout.toString()).toContain('retire workers-agent-a');
  const plan = JSON.parse(await readFile(fixture.output, 'utf8')) as Record<string, unknown>;
  expect(plan['planSha256']).toMatch(/^[0-9a-f]{64}$/);
  expect(plan['desiredRevision']).toBe('local-v1');
});

describe('production plan input boundary', () => {
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
        ],
        diagnostic: 'Duplicate fleet plan flag: --node',
      },
      {
        argv: [...buildBaseArguments(fixture), '--operation'],
        diagnostic: 'Fleet plan flag has no value: --operation',
      },
      {
        argv: [
          ...buildBaseArguments(fixture),
          '--operation',
          'retire',
          '--node',
          'workers-agent-a',
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
    ]);
    expect(invocation.exitCode).not.toBe(0);
    expect(invocation.stderr.toString()).toContain('Cannot create new operation plan');
    expect(await readFile(fixture.output, 'utf8')).toBe('reviewed-plan-bytes\n');
  });
});
