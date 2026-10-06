import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { stripVTControlCharacters } from 'node:util';

import { afterEach, describe, expect, test } from 'bun:test';

const root = resolve(import.meta.dir, '../../../../..');
const dash = join(import.meta.dir, 'entrypoint.ts');
const fleet = join(root, 'tools/tool-fleet/src/entrypoint.ts');
const directories: string[] = [];
const tools = [
  'ssh',
  'scp',
  'ansible-playbook',
  'kubectl',
  'hcloud',
  'terragrunt',
  'terraform',
  'docker',
  'dagger',
  'git',
];
const fleetSource = `${JSON.stringify({
  schemaVersion: 1,
  revision: 'dash-fixture-1',
  clusters: [
    {
      id: 'fixture',
      purpose: 'workers',
      apiEndpoint: 'https://fixture.test.invalid:6443',
      controlPlane: 'single',
      bootstrap: 'complete',
      requiredCapabilities: { execution: 1 },
    },
  ],
  nodes: [
    {
      id: 'fixture-server',
      cluster: 'fixture',
      capabilities: ['control-plane'],
      lifecycle: 'present',
      provider: { kind: 'ssh', machineId: 'fixture-server-machine', address: '192.0.2.11' },
    },
    {
      id: 'fixture-agent',
      cluster: 'fixture',
      capabilities: ['execution'],
      lifecycle: 'present',
      provider: { kind: 'ssh', machineId: 'fixture-machine', address: '192.0.2.10' },
    },
  ],
})}\n`;

function serializeFixture(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(serializeFixture).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${serializeFixture(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function buildObservationSource(
  change: 'valid' | 'incomplete' | 'wrong-target' | 'enrolled' | 'lab' = 'valid',
): string {
  const observedAt = '2026-09-17T09:00:00.000Z';
  const provider = change === 'lab' ? 'lab-provider:fixture' : 'provider:fixture';
  const body = {
    schemaVersion: 1,
    desiredRevision: 'dash-fixture-1',
    observedAt,
    complete: change !== 'incomplete',
    sources: [
      provider,
      'kubernetes-nodes:fixture',
      'kubernetes-pvcs:fixture',
      'kubernetes-pvs:fixture',
      'kubernetes-volumeattachments:fixture',
      'ssh-facts:fixture/fixture-agent',
      'ssh-facts:fixture/fixture-server',
    ].map((name) => ({ name, observedAt })),
    clusters: [{ id: 'fixture', state: 'ready' }],
    storage: [{ clusterId: 'fixture', claims: [], volumes: [], attachments: [] }],
    nodes: [
      {
        clusterId: 'fixture',
        desiredNodeId: 'fixture-server',
        displayName: 'fixture-server',
        providerIdentity: 'ssh:fixture-server-machine',
        identitySource: 'ssh-facts:fixture/fixture-server',
        privateAddress: '192.0.2.11',
        machineId: 'fixture-server-machine',
        kubernetesNodeUid: 'fixture-server-uid',
        capabilities: ['control-plane'],
        capabilitiesObserved: true,
        states: ['enrolled', 'ready'],
        storageAttachments: [],
      },
      {
        clusterId: 'fixture',
        desiredNodeId: 'fixture-agent',
        displayName: 'fixture-agent',
        providerIdentity: change === 'wrong-target' ? 'ssh:another-machine' : 'ssh:fixture-machine',
        identitySource: 'ssh-facts:fixture/fixture-agent',
        privateAddress: '192.0.2.10',
        machineId: change === 'wrong-target' ? 'another-machine' : 'fixture-machine',
        capabilities: ['execution'],
        capabilitiesObserved: true,
        ...(change === 'enrolled' ? { kubernetesNodeUid: 'fixture-agent-uid' } : {}),
        states: [change === 'enrolled' ? 'enrolled' : 'discovered-unenrolled'],
        storageAttachments: [],
      },
    ],
  };
  return `${JSON.stringify({ ...body, digest: createHash('sha256').update(serializeFixture(body)).digest('hex') })}\n`;
}

function createFixture(change: Parameters<typeof buildObservationSource>[0] = 'valid') {
  const directory = join(tmpdir(), `dash-enrollment-${crypto.randomUUID()}`);
  directories.push(directory);
  mkdirSync(directory);
  const git = Bun.spawnSync(['git', 'init', '--quiet', directory]);
  if (git.exitCode !== 0) throw new Error(git.stderr.toString());
  const inputs = join(directory, 'inputs');
  const outputs = join(directory, 'outputs');
  const bin = join(directory, 'bin');
  mkdirSync(inputs);
  mkdirSync(outputs);
  mkdirSync(bin);
  const fleetPath = join(inputs, 'fleet.yaml');
  const observation = join(inputs, 'observation.json');
  writeFileSync(fleetPath, fleetSource);
  writeFileSync(observation, buildObservationSource(change));
  const canaries = join(directory, 'mutations.log');
  for (const executable of tools) {
    const path = join(bin, executable);
    writeFileSync(
      path,
      `#!/bin/sh\nprintf '%s\\n' '${executable}' >> "$DASH_MUTATION_LOG"\nexit 97\n`,
    );
    chmodSync(path, 0o700);
  }
  return { directory, fleet: fleetPath, observation, outputs, bin, canaries };
}

function buildArguments(fixture: ReturnType<typeof createFixture>, output: string): string[] {
  return [
    '--fleet',
    fixture.fleet,
    '--observation',
    fixture.observation,
    '--output',
    output,
    '--node',
    'fixture-agent',
    '--cluster',
    'fixture',
    '--inventory-sha256',
    'a'.repeat(64),
    '--ansible-variables-sha256',
    'b'.repeat(64),
    '--known-hosts-sha256',
    'c'.repeat(64),
  ];
}

function invokeEntrypoint(
  fixture: ReturnType<typeof createFixture>,
  command: 'dash' | 'fleet',
  arguments_: readonly string[],
) {
  const commandPath = process.env['PATH'];
  if (commandPath === undefined) throw new Error('PATH is required for the mutation-canary test');
  return Bun.spawnSync({
    cmd: [
      process.execPath,
      command === 'dash' ? dash : fleet,
      command === 'dash' ? 'plan-enrollment' : 'plan',
      ...(command === 'fleet' ? ['--operation', 'enroll'] : []),
      ...arguments_,
    ],
    cwd: fixture.directory,
    env: {
      ...process.env,
      PATH: `${fixture.bin}:${commandPath}`,
      DASH_MUTATION_LOG: fixture.canaries,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

function assertNoAuthority(fixture: ReturnType<typeof createFixture>) {
  expect(existsSync(fixture.canaries)).toBe(false);
  expect(existsSync(join(fixture.directory, '.git', 'module-wiki'))).toBe(false);
  expect(existsSync(join(fixture.directory, '.git', 'wbs-wiki'))).toBe(false);
  expect(existsSync(join(fixture.directory, '.puni'))).toBe(false);
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('Dash real enrollment planning', () => {
  test('matches direct fleet bytes, digest and summary without mutation or authority', () => {
    const fixture = createFixture();
    const inputs = [readFileSync(fixture.fleet), readFileSync(fixture.observation)];
    const dashOutput = join(fixture.outputs, 'dash.json');
    const fleetOutput = join(fixture.outputs, 'fleet.json');
    const planned = invokeEntrypoint(fixture, 'dash', buildArguments(fixture, dashOutput));
    expect(planned.exitCode, planned.stderr.toString()).toBe(0);
    const direct = invokeEntrypoint(fixture, 'fleet', buildArguments(fixture, fleetOutput));
    expect(direct.exitCode, direct.stderr.toString()).toBe(0);
    expect(existsSync(dashOutput)).toBe(true);
    expect(existsSync(fleetOutput)).toBe(true);
    expect(statSync(dashOutput).mode & 0o777).toBe(0o600);
    const bytes = readFileSync(dashOutput);
    expect(bytes).toEqual(readFileSync(fleetOutput));
    expect(planned.stdout.toString()).toBe(direct.stdout.toString());
    const plan = JSON.parse(bytes.toString()) as {
      planSha256: string;
      summary: string;
    };
    expect(plan.planSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(planned.stdout.toString()).toBe(`${plan.summary}\nplan sha256: ${plan.planSha256}\n`);
    expect(plan.summary).toContain('enroll fixture-agent');
    expect(readFileSync(fixture.fleet)).toEqual(inputs[0]);
    expect(readFileSync(fixture.observation)).toEqual(inputs[1]);
    expect(readdirSync(fixture.outputs).sort()).toEqual(['dash.json', 'fleet.json']);
    assertNoAuthority(fixture);
  });

  for (const boundary of [
    'incomplete',
    'wrong-target',
    'enrolled',
    'unresolved',
    'digest',
    'wrong-cluster',
    'lab',
  ] as const) {
    test(`retains fleet refusal for ${boundary} through Dash`, () => {
      const fixture = createFixture(
        ['incomplete', 'wrong-target', 'enrolled', 'lab'].includes(boundary)
          ? (boundary as 'incomplete' | 'wrong-target' | 'enrolled' | 'lab')
          : 'valid',
      );
      if (boundary === 'unresolved')
        writeFileSync(
          fixture.fleet,
          fleetSource.replace('fixture-machine', 'operator-input:fixture-machine'),
        );
      const output = join(fixture.outputs, 'dash.json');
      const arguments_ = buildArguments(fixture, output);
      if (boundary === 'digest')
        arguments_[arguments_.indexOf('--inventory-sha256') + 1] = 'malformed';
      if (boundary === 'wrong-cluster') arguments_[arguments_.indexOf('--cluster') + 1] = 'other';
      const inputs = [readFileSync(fixture.fleet), readFileSync(fixture.observation)];
      const refusal = invokeEntrypoint(fixture, 'dash', arguments_);
      expect(refusal.exitCode).not.toBe(0);
      const diagnostics = {
        incomplete: /complete observation|complete must be true/,
        'wrong-target': /not observed unenrolled/,
        enrolled: /not observed unenrolled/,
        unresolved: /unresolved operator input/,
        digest: /lacks reviewed inventory/,
        'wrong-cluster': /cluster differs/,
        lab: /lab provider is never selectable/,
      };
      expect(
        stripVTControlCharacters(refusal.stderr.toString())
          .split('\n')
          .filter((line) => line.startsWith('error: '))
          .join('\n'),
      ).toMatch(diagnostics[boundary]);
      expect(refusal.stdout.toString()).toBe('');
      expect(readdirSync(fixture.outputs)).toEqual([]);
      expect(readFileSync(fixture.fleet)).toEqual(inputs[0]);
      expect(readFileSync(fixture.observation)).toEqual(inputs[1]);
      assertNoAuthority(fixture);
    });
  }
});

describe('Dash required files and exclusive output', () => {
  for (const state of ['fleet', 'observation'] as const) {
    for (const fault of ['absent', 'unreadable', 'malformed'] as const) {
      test(`refuses ${fault} required ${state} without success or input mutation`, () => {
        const fixture = createFixture();
        const path = fixture[state];
        if (fault === 'absent') rmSync(path);
        if (fault === 'malformed') writeFileSync(path, state === 'fleet' ? 'nodes: [\n' : '{');
        const expected = [fixture.fleet, fixture.observation].map((input) =>
          existsSync(input) ? readFileSync(input) : undefined,
        );
        if (fault === 'unreadable') {
          if (process.getuid?.() === undefined || process.getuid() === 0)
            throw new Error('Unreadability proof requires a non-privileged invoking process');
          chmodSync(path, 0o000);
        }
        try {
          const refusal = invokeEntrypoint(
            fixture,
            'dash',
            buildArguments(fixture, join(fixture.outputs, 'dash.json')),
          );
          expect(refusal.exitCode).not.toBe(0);
          const diagnostic = stripVTControlCharacters(refusal.stderr.toString())
            .split('\n')
            .filter((line) => line.startsWith('error: '))
            .join('\n');
          expect(diagnostic).toContain(
            fault === 'malformed'
              ? `Required ${state} at ${path} is malformed`
              : `Cannot read required ${state} at ${path}`,
          );
          if (fault === 'absent') expect(refusal.stderr.toString()).toContain('ENOENT');
          if (fault === 'unreadable') expect(refusal.stderr.toString()).toContain('EACCES');
          expect(refusal.stdout.toString()).toBe('');
          expect(readdirSync(fixture.outputs)).toEqual([]);
          assertNoAuthority(fixture);
        } finally {
          if (fault === 'unreadable') chmodSync(path, 0o600);
        }
        for (const [index, input] of [fixture.fleet, fixture.observation].entries()) {
          if (expected[index] === undefined) expect(existsSync(input)).toBe(false);
          else expect(readFileSync(input)).toEqual(expected[index]);
        }
      });
    }
  }

  test('preserves occupied output bytes and refuses without success text', () => {
    const fixture = createFixture();
    const output = join(fixture.outputs, 'reviewed.json');
    const reviewed = Buffer.from('reviewed synthetic plan bytes\n');
    writeFileSync(output, reviewed, { mode: 0o600 });
    const inputs = [readFileSync(fixture.fleet), readFileSync(fixture.observation)];
    const refusal = invokeEntrypoint(fixture, 'dash', buildArguments(fixture, output));
    expect(readFileSync(output)).toEqual(reviewed);
    expect(refusal.exitCode).not.toBe(0);
    expect(stripVTControlCharacters(refusal.stderr.toString())).toContain(
      `Cannot create new operation plan at ${output}`,
    );
    expect(refusal.stdout.toString()).toBe('');
    expect(readdirSync(fixture.outputs)).toEqual(['reviewed.json']);
    expect(readFileSync(fixture.fleet)).toEqual(inputs[0]);
    expect(readFileSync(fixture.observation)).toEqual(inputs[1]);
    assertNoAuthority(fixture);
  });

  test('refuses unwritable output without success text or input mutation', () => {
    const fixture = createFixture();
    const inputs = [readFileSync(fixture.fleet), readFileSync(fixture.observation)];
    if (process.getuid?.() === undefined || process.getuid() === 0)
      throw new Error('Unwritable output proof requires a non-privileged invoking process');
    chmodSync(fixture.outputs, 0o500);
    try {
      const output = join(fixture.outputs, 'dash.json');
      const refusal = invokeEntrypoint(fixture, 'dash', buildArguments(fixture, output));
      expect(refusal.exitCode).not.toBe(0);
      expect(stripVTControlCharacters(refusal.stderr.toString())).toContain(
        `Cannot create new operation plan at ${output}`,
      );
      expect(refusal.stderr.toString()).toContain('EACCES');
      expect(refusal.stdout.toString()).toBe('');
      expect(readdirSync(fixture.outputs)).toEqual([]);
      expect(readFileSync(fixture.fleet)).toEqual(inputs[0]);
      expect(readFileSync(fixture.observation)).toEqual(inputs[1]);
      assertNoAuthority(fixture);
    } finally {
      chmodSync(fixture.outputs, 0o700);
    }
  });
});
