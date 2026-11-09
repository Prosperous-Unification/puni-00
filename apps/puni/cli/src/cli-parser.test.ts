import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'bun:test';

import { readInvocation, UsageRefusal } from './cli-parser';

function parseArguments(args: readonly string[]) {
  const chunks: string[] = [];
  const invocation = readInvocation(args, (chunk) => chunks.push(chunk));
  return { invocation, output: chunks.join('') };
}

function runProbe(args: readonly string[], preload?: string, environment?: Record<string, string>) {
  return Bun.spawnSync(
    [
      process.execPath,
      ...(preload === undefined
        ? []
        : ['--preload', fileURLToPath(new URL(preload, import.meta.url))]),
      fileURLToPath(new URL('./testing/parser-process.fixture.ts', import.meta.url)),
      ...args,
    ],
    { stdout: 'pipe', stderr: 'pipe', env: { ...process.env, ...environment } },
  );
}

describe('PUNI namespace composition', () => {
  for (const namespace of ['navigator', 'nav', 'n']) {
    it(`${namespace} selects the same typed planning request`, () => {
      expect(
        parseArguments([
          namespace,
          'receipt-to-commands',
          '--receipt',
          '/absent/receipt.json',
          '--plan-reference',
          '/absent/plan.json',
          '--tasks',
          '/absent/tasks.json',
          '--output',
          '/absent/batch.json',
        ]),
      ).toEqual({
        invocation: {
          kind: 'command',
          command: {
            tool: 'navigator',
            request: {
              command: 'receipt-to-commands',
              receipt: '/absent/receipt.json',
              planReference: '/absent/plan.json',
              tasks: '/absent/tasks.json',
              output: '/absent/batch.json',
            },
          },
        },
        output: '',
      });
    });
  }

  for (const namespace of ['burokrat', 'bur', 'b']) {
    it(`${namespace} selects the installed rule grammar`, () => {
      expect(
        parseArguments([namespace, 'validate-record', 'plan-reference', '/absent.json']),
      ).toEqual({
        invocation: {
          kind: 'command',
          command: {
            tool: 'burokrat',
            request: {
              command: 'validate-record',
              kind: 'plan-reference',
              record: '/absent.json',
            },
          },
        },
        output: '',
      });
    });
  }

  for (const namespace of ['dash', 'd']) {
    it(`${namespace} selects the typed execution request`, () => {
      expect(parseArguments([namespace, 'bootstrap-authority', '/absent repository'])).toEqual({
        invocation: {
          kind: 'command',
          command: {
            tool: 'dash',
            request: { command: 'bootstrap-authority', repository: '/absent repository' },
          },
        },
        output: '',
      });
    });
  }
});

describe('composed leaf argument boundaries', () => {
  for (const leaf of [
    {
      words: ['receipt-to-commands'],
      flags: ['--receipt', '--plan-reference', '--tasks', '--output'],
    },
    {
      words: ['admit-progress'],
      flags: ['--receipt', '--plan-reference', '--tasks', '--accepted-reference', '--output'],
    },
    {
      words: ['plan-reference'],
      flags: [
        '--export',
        '--repository',
        '--change',
        '--planning-commit',
        '--source-base',
        '--requirements',
        '--output',
      ],
    },
  ]) {
    const valid = leaf.flags.flatMap((flag) => [flag, '/absent/value']);
    for (const flag of leaf.flags) {
      it(leaf.words.join(' ') + ' refuses whitespace-only ' + flag + ' before IO', () => {
        const args = leaf.flags.flatMap((name) => [name, name === flag ? ' \t ' : '/absent/value']);
        expect(() => parseArguments(['n', ...leaf.words, ...args])).toThrow(UsageRefusal);
      });
      it(leaf.words.join(' ') + ' refuses duplicate ' + flag + ' before IO', () => {
        expect(() => parseArguments(['nav', ...leaf.words, ...valid, flag, '/other'])).toThrow(
          UsageRefusal,
        );
      });
    }
  }
  for (const args of [
    ['b', 'validate-record', 'plan-reference', ' \t '],
    ['bur', 'read-candidate', 'committed', ' \t ', 'HEAD'],
    ['burokrat', 'validate-plan-tasks', ' \t ', '/absent/tasks.json'],
  ]) {
    it(args.join(' ') + ' refuses blank inputs before IO', () => {
      expect(() => parseArguments(args)).toThrow(UsageRefusal);
    });
  }
});

describe('PUNI discovery and refusal', () => {
  it('root help names canonical namespaces and their aliases', () => {
    const printed = parseArguments(['--help']);
    expect(printed.invocation).toEqual({ kind: 'printed' });
    expect(printed.output).toContain('puni');
    for (const word of ['navigator', 'nav', 'burokrat', 'bur', 'dash'])
      expect(printed.output).toContain(word);
    expect(printed.output).toContain('nav, n');
    expect(printed.output).toContain('bur, b');
    expect(printed.output).toContain('alias: d');
  });

  it('nested alias help describes the actual leaf flags', () => {
    const printed = parseArguments(['n', 'plan-reference', '--help']);
    expect(printed.invocation).toEqual({ kind: 'printed' });
    for (const flag of [
      '--export',
      '--repository',
      '--change',
      '--planning-commit',
      '--source-base',
      '--requirements',
      '--output',
    ])
      expect(printed.output).toContain(flag);
    expect(printed.output).toContain('puni navigator plan-reference');
  });

  it('installed Burokrat help excludes source-only validators', () => {
    const printed = parseArguments(['b', '--help']);
    expect(printed.invocation).toEqual({ kind: 'printed' });
    expect(printed.output).toContain('lint');
    expect(printed.output).not.toContain('candidate-identity');
  });

  for (const shell of ['bash', 'zsh', 'fish']) {
    it(`${shell} completion belongs to the unified executable`, () => {
      const printed = parseArguments(['completion', shell]);
      expect(printed.invocation).toEqual({ kind: 'printed' });
      expect(printed.output).toContain('puni');
      expect(printed.output).not.toContain('twib');
      expect(printed.output).not.toContain('twilight-dash');
    });
  }

  for (const [args, code] of [
    [['unknown'], 2],
    [['n', 'unknown'], 2],
    [['b', 'unknown'], 1],
    [['d', 'unknown'], 1],
    [['d', 'ops', 'unknown'], 64],
    [['d', 'ops', 'release', 'unknown'], 1],
    [['help', 'd', 'ops', 'unknown'], 64],
    [['help', 'b', 'unknown'], 1],
    [['n', 'receipt-to-commands', '--unknown', 'private-input'], 2],
    [['n', 'receipt-to-commands'], 2],
    [['d', 'bootstrap-authority', ' '], 1],
  ] as const) {
    it(`${args.join(' ')} refuses before an operation`, () => {
      const chunks: string[] = [];
      let refusal: unknown;
      try {
        readInvocation(args, (chunk) => chunks.push(chunk));
      } catch (cause) {
        refusal = cause;
      }
      expect(refusal).toBeInstanceOf(UsageRefusal);
      if (!(refusal instanceof UsageRefusal)) throw new Error('expected a usage refusal');
      expect(refusal.exitCode).toBe(code);
      expect(refusal.message).toMatch(/^usage: puni /u);
      expect(refusal.message).not.toMatch(/[\n\r]/u);
      expect(refusal.message).not.toContain(String.fromCharCode(27));
      expect(refusal.message).not.toContain('private-input');
      expect(chunks).toEqual([]);
    });
  }
});

describe('composed validation and process isolation', () => {
  it('keeps discovery bytes stable across terminal width and color requests', () => {
    const ordinary = runProbe(['--help'], undefined, {
      COLUMNS: '120',
      FORCE_COLOR: '',
      NO_COLOR: '1',
    });
    const narrow = runProbe(['--help'], undefined, {
      COLUMNS: '30',
      FORCE_COLOR: '1',
      NO_COLOR: '',
    });
    expect(ordinary.exitCode).toBe(0);
    expect(narrow.exitCode).toBe(0);
    expect(narrow.stdout.toString()).toBe(ordinary.stdout.toString());
    expect(narrow.stderr.toString()).toBe('');
  });

  it('retains the production development-only profile refusal', () => {
    expect(() =>
      parseArguments([
        'd',
        'ops',
        'release',
        'run',
        'website',
        '--config',
        '/absent/config.json',
        '--environment',
        'production',
        '--profile',
        'dev-fast',
      ]),
    ).toThrow(/dev-fast is development-only/u);
  });

  it('retains the account-outcomes log-source requirement', () => {
    expect(() =>
      parseArguments([
        'dash',
        'account-outcomes',
        '--repository',
        '/absent/repository',
        '--since',
        '2026-11-01T00:00:00.000Z',
        '--until',
        '2026-11-02T00:00:00.000Z',
        '--rate-card',
        '/absent/rates.json',
        '--output',
        '/absent/output',
      ]),
    ).toThrow(/at least one --claude-projects or --codex-sessions/u);
  });

  it('retains the account-outcomes period ordering refusal', () => {
    expect(() =>
      parseArguments([
        'd',
        'account-outcomes',
        '--repository',
        '/absent/repository',
        '--since',
        '2026-11-02T00:00:00.000Z',
        '--until',
        '2026-11-01T00:00:00.000Z',
        '--rate-card',
        '/absent/rates.json',
        '--output',
        '/absent/output',
        '--claude-projects',
        '/absent/logs',
      ]),
    ).toThrow(/--until must be after --since/u);
  });

  it('owns the one-line process refusal instead of allowing Optique to terminate silently', () => {
    const child = runProbe(['b', 'unknown']);
    expect(child.exitCode).toBe(1);
    expect(child.stderr.toString()).toMatch(/^error: usage: puni burokrat [^\n]*\n$/u);
    expect(child.stdout.toString()).toBe('');
  });

  it('does not echo an inline option value from a provider diagnostic', () => {
    const child = runProbe(['n', 'receipt-to-commands', '--unknown=SECRET_PUNI_INLINE_9z7']);
    expect(child.exitCode).toBe(2);
    expect(child.stderr.toString()).toContain('usage: puni navigator');
    expect(child.stderr.toString()).not.toContain('SECRET_PUNI_INLINE_9z7');
  });

  it('redacts multiline inline operands before normalizing diagnostic whitespace', () => {
    const child = runProbe(['n', 'receipt-to-commands', '--unknown=SECRET MULTI\nLINE']);
    expect(child.exitCode).toBe(2);
    expect(child.stderr.toString()).not.toContain('SECRET');
    expect(child.stderr.toString()).toMatch(/^error: usage: puni navigator [^\n]*\n$/u);
  });

  it('redacts an operand containing the diagnostic marker before selecting the reason', () => {
    const child = runProbe(['n', 'receipt-to-commands', '--unknown=Error: SECRET_PUNI_9z7']);
    expect(child.exitCode).toBe(2);
    expect(child.stderr.toString()).not.toContain('SECRET_PUNI_9z7');
  });

  it('does not emit terminal controls from an unknown flag', () => {
    const child = runProbe(['n', 'receipt-to-commands', '--bad' + String.fromCharCode(27) + '[2J']);
    expect(child.exitCode).toBe(2);
    expect(child.stderr.toString()).not.toContain(String.fromCharCode(27));
    expect(child.stderr.toString()).toMatch(/^error: usage: puni navigator [^\n]*\n$/u);
  });

  it('redacts overlapping operands from the original diagnostic in one pass', () => {
    const child = runProbe(['n', 'receipt-to-commands', "--unknown=SECRET_'n'"]);
    expect(child.exitCode).toBe(2);
    expect(child.stderr.toString()).not.toContain('SECRET_');
  });

  for (const tail of [['--unknown=SECRET_PUNI_UNQUOTED'], ['SECRET_PUNI_POSITIONAL']]) {
    it('redacts unquoted provider operands after complete required options ' + tail[0], () => {
      const child = runProbe([
        'n',
        'receipt-to-commands',
        '--receipt',
        '/absent/receipt.json',
        '--plan-reference',
        '/absent/plan.json',
        '--tasks',
        '/absent/tasks.json',
        '--output',
        '/absent/output.json',
        ...tail,
      ]);
      expect(child.exitCode).toBe(2);
      expect(child.stderr.toString()).not.toContain('SECRET_PUNI');
    });
  }

  it('throws when the parser exits without its required diagnostic', () => {
    const child = runProbe(['b', 'unknown'], './testing/broken-runner.fixture.ts');
    expect(child.exitCode).toBe(1);
    expect(child.stderr.toString()).toContain('the CLI parser refused without a diagnostic');
    expect(child.stderr.toString()).not.toContain('error: usage:');
  });

  for (const args of [['--help'], ['n', 'plan-reference', '--help'], ['completion', 'fish']]) {
    it(`${args.join(' ')} loads no provider runtime, clock or network`, () => {
      const child = runProbe(args, './testing/refuse-effects.fixture.ts');
      expect(child.exitCode).toBe(0);
      expect(child.stderr.toString()).toBe('');
      expect(child.stdout.toString().length).toBeGreaterThan(0);
    });
  }
});
