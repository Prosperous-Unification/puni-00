import { describe, expect, it } from 'bun:test';

import { readInvocation, UsageRefusal } from './cli-parser';

function readRequest(args: readonly string[]) {
  const invocation = readInvocation(['b', ...args], () => {
    throw new Error('an operation request unexpectedly printed discovery');
  });
  if (invocation.kind !== 'command' || invocation.command.tool !== 'burokrat')
    throw new Error('the Burokrat namespace did not select its operation');
  return invocation.command.request;
}

describe('typed Burokrat policy requests', () => {
  it('check types all optional flags together and keeps now optional', () => {
    const base = ['check', 'working', '/absent/repository', 'HEAD', '/absent/policy.json'];
    expect(readRequest(base)).toMatchObject({
      command: 'check',
      kind: 'working',
      repository: '/absent/repository',
      revision: 'HEAD',
      rulePolicy: '/absent/policy.json',
    });
    expect(readRequest(base)).not.toHaveProperty('argv');
    expect(
      readRequest([
        ...base,
        '--rule',
        'SPEC-SCENARIOS',
        '--performance-evidence',
        '/absent/perf.json',
        '--now',
        '2026-11-09T00:00:00.000Z',
      ]),
    ).toMatchObject({
      rule: 'SPEC-SCENARIOS',
      performanceEvidence: '/absent/perf.json',
      now: '2026-11-09T00:00:00.000Z',
    });
  });

  it('explain retains either an absent or complete policy selection', () => {
    expect(readRequest(['explain', 'SPEC-SCENARIOS'])).toMatchObject({
      command: 'explain',
      rule: 'SPEC-SCENARIOS',
    });
    expect(
      readRequest(['explain', 'SPEC-SCENARIOS', '/absent/repository', '/absent/policy.json']),
    ).toMatchObject({
      command: 'explain',
      rule: 'SPEC-SCENARIOS',
      policy: { repository: '/absent/repository', rulePolicy: '/absent/policy.json' },
    });
    expect(readRequest(['explain', 'SPEC-SCENARIOS'])).not.toHaveProperty('argv');
  });

  it('scenario allocation alone accepts a predecessor', () => {
    expect(
      readRequest([
        'scenario',
        'allocate',
        '/absent/repository',
        'openspec/specs/example/spec.md',
        '--predecessor',
        'EXAMPLE-001',
      ]),
    ).toMatchObject({
      command: 'scenario',
      action: 'allocate',
      repository: '/absent/repository',
      source: 'openspec/specs/example/spec.md',
      predecessor: 'EXAMPLE-001',
    });
  });

  it('template operations carry typed subcommands', () => {
    expect(readRequest(['template', 'list'])).toEqual({ command: 'template', action: 'list' });
    expect(readRequest(['template', 'show', 'service'])).toEqual({
      command: 'template',
      action: 'show',
      template: 'service',
    });
    expect(
      readRequest([
        'template',
        'verify',
        'service',
        'committed',
        '/absent/repository',
        'HEAD',
        'libs/example',
      ]),
    ).toEqual({
      command: 'template',
      action: 'verify',
      template: 'service',
      kind: 'committed',
      repository: '/absent/repository',
      revision: 'HEAD',
      subject: 'libs/example',
    });
  });

  it('workflow binding splits and validates the step catalogue before reading a file', () => {
    expect(
      readRequest([
        'validate',
        'workflow-binding',
        '/absent/binding.json',
        '--steps',
        'design,build',
      ]),
    ).toEqual({
      command: 'validate workflow-binding',
      file: '/absent/binding.json',
      steps: ['design', 'build'],
    });
  });

  const activationFlags = [
    '--candidate-repository',
    '/absent/repository',
    '--candidate-sha',
    'a'.repeat(40),
    '--candidate-policy',
    'docs/policy.json',
    '--review-record',
    '/absent/review.json',
    '--destination',
    '/absent/destination',
    '--work',
    '/absent/work',
    '--resource-lane',
    'test',
    '--cwd-identity',
    'b'.repeat(64),
    '--check-runs',
    '/absent/checks',
  ];

  for (const operation of [
    {
      command: 'prepare-activation',
      args: [
        ...activationFlags,
        '--candidate-mapping',
        'docs/mapping.json',
        '--audit-strata',
        '/absent/strata.json',
      ],
      optional: [],
    },
    {
      command: 'prepare-relocation-activation',
      args: [...activationFlags, '--base-activation', '/absent/base'],
      optional: ['--candidate-policy'],
    },
  ]) {
    for (let index = 0; index < operation.args.length; index += 2) {
      const flag = operation.args.at(index);
      if (flag === undefined) throw new Error('activation test has no flag at an operand boundary');
      if (operation.optional.includes(flag)) continue;
      const incomplete = [...operation.args.slice(0, index), ...operation.args.slice(index + 2)];
      it(operation.command + ' requires ' + flag + ' before IO', () => {
        expect(() => readRequest([operation.command, ...incomplete])).toThrow(UsageRefusal);
      });
    }
  }

  it('toolkit activation has typed flags and an optional installed toolkit selection', () => {
    const request = readRequest([
      'prepare-activation',
      ...activationFlags,
      '--candidate-mapping',
      'docs/mapping.json',
      '--audit-strata',
      '/absent/strata.json',
    ]);
    expect(request).toMatchObject({
      command: 'prepare-activation',
      candidateRepository: '/absent/repository',
      candidateSha: 'a'.repeat(40),
      resourceLane: 'test',
      cwdIdentity: 'b'.repeat(64),
    });
    expect(request).not.toHaveProperty('argv');
  });

  it('relocation activation has typed optional candidate paths', () => {
    const request = readRequest([
      'prepare-relocation-activation',
      ...activationFlags,
      '--base-activation',
      '/absent/base',
      '--candidate-launcher',
      'bin/launcher.ts',
      '--validator-entry',
      'src/validator.ts',
    ]);
    expect(request).toMatchObject({
      command: 'prepare-relocation-activation',
      baseActivation: '/absent/base',
      candidateLauncher: 'bin/launcher.ts',
      validatorEntry: 'src/validator.ts',
    });
    expect(request).not.toHaveProperty('argv');
  });

  for (const args of [
    ['check', 'working', '/absent/repository', 'HEAD', '/absent/policy.json', '--unknown', 'x'],
    ['check', 'working', '/absent/repository', 'HEAD', '/absent/policy.json', '--now'],
    ['check', 'working', '/absent/repository', 'HEAD', '/absent/policy.json', '--now', 'tomorrow'],
    [
      'check',
      'working',
      '/absent/repository',
      'HEAD',
      '/absent/policy.json',
      '--rule',
      'a',
      '--rule',
      'b',
    ],
    ['check', 'working', ' \t ', 'HEAD', '/absent/policy.json'],
    ['check', 'working', '/absent/repository', 'HEAD', '/absent/policy.json', '--rule', ' \t '],
    ['explain', 'SPEC-SCENARIOS', '/absent/repository'],
    [
      'scenario',
      'import',
      '/absent/repository',
      'openspec/specs/example/spec.md',
      '--predecessor',
      'EXAMPLE-001',
    ],
    ['scenario', 'allocate', '/absent/repository', '../outside.md'],
    ['template', 'verify', 'service', 'bogus', '/absent/repository', 'HEAD', 'libs/example'],
    ['template', 'verify', 'service', 'committed', '/absent/repository', 'HEAD'],
    ['validate', 'workflow-binding', '/absent/binding.json'],
    ['validate', 'workflow-binding', '/absent/binding.json', '--steps', '--steps'],
    ['validate', 'workflow-binding', '--steps', '--steps', 'approve'],
    [
      'check',
      'working',
      '/absent/repository',
      'HEAD',
      '/absent/policy.json',
      '--now',
      '2026-02-30T00:00:00.000Z',
    ],
    ['validate', 'workflow-binding', '/absent/binding.json', '--steps', 'design,design'],
    ['validate', 'workflow-binding', '/absent/binding.json', '--steps', 'design, build'],
    ['prepare-activation', ...activationFlags],
    [
      'prepare-relocation-activation',
      ...activationFlags,
      '--base-activation',
      '/absent/base',
      '--unknown',
      'x',
    ],
  ]) {
    it(args.join(' ') + ' refuses before any operation IO', () => {
      expect(() => readRequest(args)).toThrow(UsageRefusal);
    });
  }
});
