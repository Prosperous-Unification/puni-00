import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Usage, UsageTerm } from '@optique/core';
import { afterAll, describe, expect, test } from 'bun:test';

import { openAuthority } from './authority/authority-store';
import { acquireClaims } from './authority/claims';
import {
  type DashDependencies,
  dashHandlers,
  type DispatchedCommand,
  runDash,
  runDashArguments,
} from './cli';
import {
  dashParser,
  parseDashCommand,
  parseDashRequest,
  readDashInvocation,
  UsageRefusal,
} from './cli-parser';
import { type OpsCommand, opsHandlers, runOps } from './ops/commands';
import { linuxScopeTelemetry } from './ops/scope';

const scratchRoots: string[] = [];

afterAll(() => {
  for (const root of scratchRoots) rmSync(root, { force: true, recursive: true });
});

const FIXED_CLOCK = { read: () => 1_000 };
const FIXED_MONOTONIC = { now: () => 0 };

function dependencies(planEnrollment: DashDependencies['planEnrollment']): DashDependencies {
  return {
    clock: FIXED_CLOCK,
    monotonic: FIXED_MONOTONIC,
    planEnrollment,
    stdout: {
      write: () => {
        throw new Error('this dispatcher case writes nothing');
      },
    },
  };
}

const enrollmentFlags = [
  '--fleet',
  'fleet.yaml',
  '--observation',
  'observation.json',
  '--output',
  'plan.json',
  '--node',
  'node-1',
  '--cluster',
  'lab-1',
  '--inventory-sha256',
  'a'.repeat(64),
  '--ansible-variables-sha256',
  'b'.repeat(64),
  '--known-hosts-sha256',
  'c'.repeat(64),
] as const;

const planUsage = 'usage: twilight-dash plan-enrollment --fleet PATH --observation PATH';

function observePlanner() {
  const calls: string[][] = [];
  return {
    calls,
    run: (argv: readonly string[]) =>
      Promise.resolve().then(() => {
        calls.push([...argv]);
      }),
  };
}

async function expectRefusal(
  argv: readonly string[],
  planner: ReturnType<typeof observePlanner>,
  pattern: RegExp,
) {
  let refusal: unknown;
  try {
    await runDashArguments(argv, dependencies(planner.run));
  } catch (cause) {
    refusal = cause;
  }
  expect(refusal).toBeInstanceOf(Error);
  if (!(refusal instanceof Error)) throw new Error('Dash did not return an Error');
  expect(refusal.message).toMatch(pattern);
  expect(planner.calls).toEqual([]);
}

describe('Dash enrollment planning dispatcher', () => {
  test('the installed entrypoint refuses an apply command', () => {
    const execution = Bun.spawnSync({
      cmd: [process.execPath, join(import.meta.dir, 'entrypoint.ts'), 'apply', ...enrollmentFlags],
    });
    expect(execution.exitCode).toBe(1);
    expect(execution.stdout.toString('utf8')).toBe('');
    expect(execution.stderr.toString('utf8')).toBe('error: Unsupported Dash command: apply\n');
  });

  test('the installed entrypoint refuses a valueless flag with the command usage', () => {
    const execution = Bun.spawnSync({
      cmd: [process.execPath, join(import.meta.dir, 'entrypoint.ts'), 'plan-enrollment', '--fleet'],
    });
    expect(execution.exitCode).toBe(1);
    expect(execution.stdout.toString('utf8')).toBe('');
    const stderr = execution.stderr.toString('utf8');
    expect(stderr).toMatch(
      /^error: usage: twilight-dash plan-enrollment --fleet PATH .*\(Dash flag has no value: --fleet\)\n$/,
    );
    expect(stderr.split('\n')).toHaveLength(2);
  });

  test('delegates only the reviewed enrollment operation and named arguments', async () => {
    const planner = observePlanner();
    await runDashArguments(
      ['plan-enrollment', ...enrollmentFlags.slice(8), ...enrollmentFlags.slice(0, 8)],
      dependencies(planner.run),
    );
    expect(planner.calls).toEqual([['--operation', 'enroll', ...enrollmentFlags]]);
  });

  test('accepts the --flag=value spelling and plans the same arguments', async () => {
    const planner = observePlanner();
    await runDashArguments(
      ['plan-enrollment', `--fleet=${enrollmentFlags[1]}`, ...enrollmentFlags.slice(2)],
      dependencies(planner.run),
    );
    expect(planner.calls).toEqual([['--operation', 'enroll', ...enrollmentFlags]]);
  });

  test.each(['apply', 'discover', 'build', 'deploy', 'plan', ''])(
    'refuses unsupported command %s before planning',
    async (command) => {
      const planner = observePlanner();
      await expectRefusal(
        [command, ...enrollmentFlags],
        planner,
        new RegExp(`^Unsupported Dash command: ${command}$`),
      );
    },
  );

  test.each(['--operation', '--executable', '--adapter', '--arbitrary'])(
    'refuses unsupported flag %s before planning',
    async (flag) => {
      const planner = observePlanner();
      await expectRefusal(
        ['plan-enrollment', ...enrollmentFlags, flag, 'apply'],
        planner,
        new RegExp(`^${planUsage}.*\\(Unexpected option or subcommand: \`${flag}\`\\.\\)$`),
      );
    },
  );

  test.each([
    '--fleet',
    '--observation',
    '--output',
    '--node',
    '--cluster',
    '--inventory-sha256',
    '--ansible-variables-sha256',
    '--known-hosts-sha256',
  ])('refuses missing %s before planning', async (flag) => {
    const planner = observePlanner();
    const position = enrollmentFlags.indexOf(flag);
    const argv = enrollmentFlags.filter((_, index) => index !== position && index !== position + 1);
    await expectRefusal(
      ['plan-enrollment', ...argv],
      planner,
      new RegExp(`^${planUsage}.*\\(Missing required Dash flag: ${flag}\\)$`),
    );
  });

  test('refuses duplicate flags before planning', async () => {
    const planner = observePlanner();
    await expectRefusal(
      ['plan-enrollment', ...enrollmentFlags, '--node', 'node-2'],
      planner,
      new RegExp(`^${planUsage}.*\\(Duplicate Dash flag: --node\\)$`),
    );
  });

  test('refuses a valueless or empty flag before planning', async () => {
    const planner = observePlanner();
    await expectRefusal(
      ['plan-enrollment', ...enrollmentFlags.slice(0, -1)],
      planner,
      new RegExp(`^${planUsage}.*\\(Dash flag has no value: --known-hosts-sha256\\)$`),
    );
    await expectRefusal(
      ['plan-enrollment', ...enrollmentFlags.slice(0, -1), ''],
      planner,
      new RegExp(`^${planUsage}.*\\(Dash flag has no value: --known-hosts-sha256\\)$`),
    );
  });
});

test('the fleet planner alias exposes only runPlan', async () => {
  // Proof: pointing `@tools/fleet-plan` in tsconfig.base.json back at tools/tool-fleet/src/cli.ts
  // failed this test with `runApply` and the other fleet commands in the export list (2026-10-11).
  expect(Object.keys(await import('@tools/fleet-plan'))).toEqual(['runPlan']);
});

async function refusalOf(deps: DashDependencies): Promise<string> {
  try {
    await runDashArguments(['plan-enrollment', ...enrollmentFlags], deps);
  } catch (cause) {
    if (cause instanceof Error) return cause.message;
    throw new Error('Dash did not return an Error', { cause });
  }
  throw new Error('Dash accepted incomplete dependencies');
}

test('runDash refuses missing dependencies', async () => {
  const planner = observePlanner();
  const complete = dependencies(planner.run);
  // Proof: dropping `monotonic` from runDash's required-dependency list failed this test with
  // `error: Dash accepted incomplete dependencies` (2026-10-12).
  for (const name of ['planEnrollment', 'clock', 'monotonic', 'stdout'] as const) {
    // The computed key widens to every dependency, so this models a JavaScript caller's omission.
    const partial = { ...complete, [name]: undefined };
    expect(await refusalOf(partial)).toBe(`Dash dependency is required: ${name}`);
  }
  expect(await refusalOf(undefined as unknown as DashDependencies)).toBe(
    'Dash dependency is required: planEnrollment',
  );
  expect(planner.calls).toEqual([]);
});

function scratchRepository(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'dash-authority-cli-')));
  scratchRoots.push(root);
  const init = Bun.spawnSync(['git', 'init', '--quiet', root], { stderr: 'pipe' });
  if (init.exitCode !== 0) throw new Error(init.stderr.toString('utf8'));
  return root;
}

function capturingDependencies(): { deps: DashDependencies; output: string[] } {
  const output: string[] = [];
  return {
    deps: {
      clock: FIXED_CLOCK,
      monotonic: FIXED_MONOTONIC,
      planEnrollment: () => Promise.reject(new Error('this case plans nothing')),
      stdout: { write: (text: string) => output.push(text) },
    },
    output,
  };
}

async function refusalMessage(argv: readonly string[], deps: DashDependencies): Promise<string> {
  try {
    await runDashArguments(argv, deps);
  } catch (cause) {
    if (cause instanceof Error) return cause.message;
    throw new Error('Dash did not return an Error', { cause });
  }
  throw new Error(`Dash accepted ${argv.join(' ')}`);
}

test('bootstrap-authority creates the store once and refuses the second time', async () => {
  const root = scratchRepository();
  const first = capturingDependencies();
  await runDashArguments(['bootstrap-authority', root], first.deps);
  const databasePath = join(root, '.git', 'module-wiki', 'authority.sqlite');
  expect(first.output).toEqual([
    `${JSON.stringify({ path: databasePath, status: 'bootstrapped' })}\n`,
  ]);
  const second = capturingDependencies();
  expect(await refusalMessage(['bootstrap-authority', root], second.deps)).toContain(
    `authority already exists: ${databasePath}`,
  );
  expect(second.output).toEqual([]);
});

test('inspect-authority prints the state and refuses an absent store', async () => {
  const root = scratchRepository();
  const absent = capturingDependencies();
  expect(await refusalMessage(['inspect-authority', root], absent.deps)).toContain(
    'twilight-dash bootstrap-authority <repository>',
  );
  expect(existsSync(join(root, '.git', 'module-wiki'))).toBe(false);

  await runDashArguments(['bootstrap-authority', root], capturingDependencies().deps);
  const store = openAuthority(root, { clock: FIXED_CLOCK });
  acquireClaims(store, {
    conflictGroups: [],
    owner: { sessionId: 'session-a', worktreePath: root },
    paths: [{ access: 'write', path: 'src' }],
  });
  const state = store.inspect();
  store.close();

  const whole = capturingDependencies();
  await runDashArguments(['inspect-authority', root], whole.deps);
  expect(JSON.parse(whole.output.join(''))).toEqual(JSON.parse(JSON.stringify(state)));

  const session = capturingDependencies();
  await runDashArguments(['inspect-authority', root, '--session', 'session-a'], session.deps);
  expect(JSON.parse(session.output.join(''))).toEqual(
    JSON.parse(JSON.stringify({ generations: state.generations, sessionId: 'session-a' })),
  );
  const unknown = capturingDependencies();
  await runDashArguments(['inspect-authority', root, '--session', 'session-z'], unknown.deps);
  expect(JSON.parse(unknown.output.join(''))).toEqual({ generations: [], sessionId: 'session-z' });
});

test('unknown commands and flags refuse before any store open', async () => {
  const root = scratchRepository();
  const cases: readonly (readonly string[])[] = [
    ['bootstrap-authority'],
    ['bootstrap-authority', root, 'extra'],
    ['bootstrap-authority', root, '--force', 'yes'],
    ['inspect-authority'],
    ['inspect-authority', root, '--sessions', 'a'],
    ['inspect-authority', root, '--session'],
    ['inspect-authority', root, '--session', 'a', '--session', 'b'],
    ['inspect-authority', root, 'extra'],
    ['recover-publication', root],
    ['recover-publication', root, '--integration-id'],
    ['recover-publication', root, '--id', 'x'],
    ['recover-publication', root, '--integration-id', 'x', 'extra'],
    ['acquire-claims', root],
    ['publish', root],
  ];
  for (const argv of cases) {
    const refused = capturingDependencies();
    // Proof: loosening bootstrap's grammar to `argv.length === 0` made Dash accept and execute
    // `bootstrap-authority <root> extra`; routing unknown commands to bootstrap made Dash accept
    // `acquire-claims <root>`; both failed this canary (2026-10-11).
    expect(await refusalMessage(argv, refused.deps), argv.join(' ')).toMatch(
      /^(?:usage: twilight-dash |Unsupported Dash command: )/,
    );
    expect(refused.output, argv.join(' ')).toEqual([]);
    expect(existsSync(join(root, '.git', 'module-wiki')), argv.join(' ')).toBe(false);
  }
});

// Spawns the entrypoint, which loads the whole command graph: 5 s idle on the laptop, so the
// 5 s Bun default timed it out under load (docs/test-budgets.md: 3 x idle, rounded up).
test('a refused command prints one line on stderr and exits 1', () => {
  const root = scratchRepository();
  const execution = Bun.spawnSync({
    cmd: [process.execPath, join(import.meta.dir, 'entrypoint.ts'), 'inspect-authority', root],
    stderr: 'pipe',
    stdout: 'pipe',
  });
  // Proof: letting the rejection escape the entrypoint printed Bun's source excerpt and stack
  // frames, failing the exact one-line assertion (2026-10-11).
  expect(execution.exitCode).toBe(1);
  expect(execution.stdout.toString('utf8')).toBe('');
  expect(execution.stderr.toString('utf8')).toBe(
    `error: authority absent: ${join(root, '.git', 'module-wiki')}; run \`twilight-dash bootstrap-authority <repository>\` to create it [ENOENT]\n`,
  );
}, 20_000);

test('runDash refuses a command no handler takes', async () => {
  const planner = observePlanner();
  // A JavaScript caller bypassing the parser; the type admits only dispatched commands.
  const bypass = { command: 'apply' } as unknown as DispatchedCommand;
  let refusal: unknown;
  try {
    await runDash(bypass, dependencies(planner.run));
  } catch (cause) {
    refusal = cause;
  }
  expect(refusal).toBeInstanceOf(Error);
  expect(refusal instanceof Error && refusal.message).toBe('Unsupported Dash command: apply');
  expect(planner.calls).toEqual([]);
});

/** The namespaced commands `entrypoint.ts` dispatches before it loads `cli.ts`, as two words. */
const entrypointWords = ['mcp token', 'pool import'];
const entrypointCommands = entrypointWords.map((words) => words.split(' ')[0]);

function printedBy(args: readonly string[]): string {
  let stdout = '';
  const invocation = readDashInvocation(args, (text) => {
    stdout += text;
  });
  expect(invocation).toEqual({ kind: 'printed' });
  return stdout;
}

/**
 * The first word after `twilight-dash` in each usage entry of a help page. The usage block ends
 * at the first blank line; entries are matched across line breaks, so wrapping cannot hide one.
 */
function helpCommands(help: string): string[] {
  const [usageBlock] = help.split('\n\n');
  const named = new Set(
    [...usageBlock.matchAll(/twilight-dash\s+(\S+)/gu)].map((match) => match[1]),
  );
  for (const generated of ['help', 'completion', '--help']) named.delete(generated);
  return [...named].sort();
}

/** The command words of each top-level branch the root parser declares, through nested `or`s. */
function parserCommands(usage: Usage = dashParser.usage): string[][] {
  return usage.flatMap((term) =>
    term.type === 'exclusive'
      ? term.terms.flatMap((branch) => {
          const [first] = branch;
          if (first.type === 'exclusive') return parserCommands([first]);
          const words = branch.flatMap((part) => (part.type === 'command' ? [part.name] : []));
          return words.length === 0 ? [] : [words];
        })
      : [],
  );
}

const dispatched = [...Object.keys(dashHandlers), ...entrypointCommands].sort();

/** Every command path under `ops` the parser declares, as its words after `ops`. */
function opsParserWords(): string[] {
  const paths = (terms: readonly UsageTerm[], prefix: readonly string[]): string[] => {
    const first = terms.at(0);
    const second = terms.at(1);
    if (first?.type === 'exclusive') return first.terms.flatMap((branch) => paths(branch, prefix));
    if (first?.type !== 'command') return [];
    const words = [...prefix, first.name];
    // A namespace with one command (`ops outbox drop`) nests it directly, without an `or`.
    if (second?.type === 'command') return paths(terms.slice(1), words);
    return second?.type === 'exclusive' ? paths([second], words) : [words.join(' ')];
  };
  const branches = dashParser.usage.flatMap((term) =>
    term.type === 'exclusive' ? term.terms : [],
  );
  const ops = branches.find(([first]) => first.type === 'command' && first.name === 'ops');
  if (ops === undefined) throw new Error('the parser declares no ops namespace');
  return paths(ops.slice(1), []).sort();
}

describe('the ops namespace (dash-host-jobs J17)', () => {
  test('every ops command the parser declares has a handler, and every handler a command', () => {
    // Proof: adding `ops job audit` to the parser and not to `opsHandlers` failed this
    // assertion with `+ "job audit"` (2026-11-01, Slice 3).
    expect(opsParserWords()).toEqual(
      [...Object.keys(opsHandlers), 'release plan', 'release run'].sort(),
    );
    expect(opsParserWords()).toEqual([
      'job admission',
      'job audit',
      'job calibrate',
      'job propose',
      'job render-audit-units',
      'job run',
      'job status',
      'outbox drop',
      'pool init',
      'pool inspect',
      'pool switch-mode',
      'release plan',
      'release run',
    ]);
  });

  test('runOps refuses ops words no handler takes', async () => {
    // A JavaScript caller bypassing the parser; the type admits only declared words.
    const bypass = {
      command: 'ops',
      words: 'pool teleport',
      config: 'x',
    } as unknown as OpsCommand;
    let refusal: unknown;
    try {
      await runOps(bypass, {
        clock: FIXED_CLOCK,
        monotonic: FIXED_MONOTONIC,
        environment: {},
        cwd: '/',
        stdout: () => undefined,
        stderr: () => undefined,
        telemetry: linuxScopeTelemetry(),
        host: { cpuCores: () => 1, memoryGib: () => 1 },
        user: 'nobody',
        legacyLock: () => {
          throw new Error('no ops command ran');
        },
        connect: () => {
          throw new Error('no ops command ran');
        },
      });
    } catch (cause) {
      refusal = cause;
    }
    expect(refusal instanceof Error && refusal.message).toBe(
      'Unsupported Dash command: ops pool teleport',
    );
  });

  test('an ops usage refusal exits 64; other commands still exit 1', () => {
    for (const [args, code] of [
      [['ops', 'job', 'run', '--type', 'gate', '--', 'true'], 64],
      [
        [
          'ops',
          'job',
          'run',
          '--config',
          'c',
          '--type',
          'gate',
          '--poll-seconds',
          '0',
          '--',
          'true',
        ],
        64,
      ],
      [['inspect-authority'], 1],
    ] as const) {
      const execution = Bun.spawnSync({
        cmd: [process.execPath, join(import.meta.dir, 'entrypoint.ts'), ...args],
        stderr: 'pipe',
        stdout: 'pipe',
      });
      expect(execution.exitCode, args.join(' ')).toBe(code);
      const stderr = execution.stderr.toString('utf8');
      expect(stderr.split('\n').length, args.join(' ')).toBe(2);
      expect(stderr, args.join(' ')).toStartWith('error: ');
    }
    // All three are grammar refusals: none loads `cli.ts`'s command graph (about 7 s, measured
    // 2026-11-03 with `inspect-authority <absent repository>`). Each run took 104–117 ms idle on
    // the laptop (2026-11-03); three runs at 3 x idle (docs/test-budgets.md) need under 2 s, and
    // 30 s leaves room for a cold Bun start on a loaded gate host.
  }, 30000);
});

describe('Dash help and completion', () => {
  test('help names every dispatched command and no other', () => {
    // Proof: removing `report-capacity` from the parser's command list (not from `dashHandlers`)
    // failed this assertion with `- "report-capacity"` (2026-11-01).
    expect(helpCommands(printedBy(['--help']))).toEqual(dispatched);
    expect(
      parserCommands()
        .map(([first]) => first)
        .sort(),
    ).toEqual(dispatched);
  });

  test('the namespaced commands carry exactly their delegated subcommand', () => {
    const namespaced = parserCommands()
      .filter((words) => words.length > 1)
      .map((words) => words.join(' '))
      .sort();
    expect(namespaced).toEqual([...entrypointWords].sort());
    expect(entrypointWords.sort()).toEqual(['mcp token', 'pool import']);
    expect(helpCommands(printedBy(['help', 'mcp']))).toEqual(['mcp']);
    expect(
      [...printedBy(['help', 'mcp']).matchAll(/twilight-dash mcp (\S+)/gu)].map(
        (match) => match[1],
      ),
    ).toEqual(['token']);
    expect(
      [...printedBy(['help', 'pool']).matchAll(/twilight-dash pool (\S+)/gu)].map(
        (match) => match[1],
      ),
    ).toEqual(['import']);
  });

  test('help parity holds under COLUMNS=30 and FORCE_COLOR=1', () => {
    const inProcess = printedBy(['--help']);
    for (const env of [{ COLUMNS: '30' }, { COLUMNS: '400' }, { FORCE_COLOR: '1' }]) {
      const columns = JSON.stringify(env);
      const execution = Bun.spawnSync({
        cmd: [process.execPath, join(import.meta.dir, 'entrypoint.ts'), '--help'],
        env: { ...process.env, ...env },
        stderr: 'pipe',
        stdout: 'pipe',
      });
      expect(execution.exitCode, columns).toBe(0);
      const help = execution.stdout.toString('utf8');
      expect(helpCommands(help), columns).toEqual(dispatched);
      expect(help, columns).toBe(inProcess);
    }
    // A refusal's usage line stays plain under a colour request too (`usageLine`).
    const refused = Bun.spawnSync({
      cmd: [process.execPath, join(import.meta.dir, 'entrypoint.ts'), 'resources', 'init'],
      env: { ...process.env, FORCE_COLOR: '1' },
      stderr: 'pipe',
      stdout: 'pipe',
    });
    expect(refused.exitCode).toBe(1);
    expect(refused.stderr.toString('utf8')).toBe(
      'error: usage: twilight-dash resources init --config PATH (Missing option `--config`.)\n',
    );
  });

  test('help <command> prints that command on stdout', () => {
    expect(printedBy(['help', 'inspect-authority'])).toContain(
      'Usage: twilight-dash inspect-authority',
    );
    expect(printedBy(['help', 'plan-enrollment'])).toContain('--known-hosts-sha256 SHA256');
  });

  test('completion without a shell refuses in one short line', () => {
    expect(() => readDashInvocation(['completion'], () => undefined)).toThrow(
      new UsageRefusal('usage: twilight-dash completion (Missing shell name for completion.)'),
    );
  });

  test('the installed entrypoint prints help and a zsh completion script, exit 0', () => {
    for (const args of [['--help'], ['help', 'mcp', 'token'], ['completion', 'zsh']]) {
      const execution = Bun.spawnSync({
        cmd: [process.execPath, join(import.meta.dir, 'entrypoint.ts'), ...args],
        stderr: 'pipe',
        stdout: 'pipe',
      });
      expect(execution.exitCode, args.join(' ')).toBe(0);
      expect(execution.stderr.toString('utf8'), args.join(' ')).toBe('');
      const stdout = execution.stdout.toString('utf8');
      if (args[0] === 'completion') expect(stdout).toStartWith('#compdef twilight-dash\n');
      else expect(stdout, args.join(' ')).toContain('Usage: twilight-dash ');
    }
  });
});

/**
 * Every command path the parser declares, as its words (`resources cleanup`, `ops job run`),
 * through nested `or`s and `command`s.
 */
function commandPaths(
  terms: readonly UsageTerm[] = dashParser.usage,
  prefix: readonly string[] = [],
) {
  const first = terms.at(0);
  if (
    first?.type === 'exclusive' &&
    first.terms.every((branch) => ['command', 'exclusive'].includes(branch.at(0)?.type ?? ''))
  ) {
    return first.terms.flatMap((branch): string[] => commandPaths(branch, prefix));
  }
  if (first?.type === 'command') return commandPaths(terms.slice(1), [...prefix, first.name]);
  return prefix.length === 0 ? [] : [prefix.join(' ')];
}

/** The one refusal line `args` produces in-process, or a failure when it is accepted. */
function refusalLineOf(args: readonly string[]): string {
  try {
    readDashInvocation(args, () => undefined);
  } catch (cause) {
    if (cause instanceof UsageRefusal) return cause.message;
    throw cause;
  }
  throw new Error(`Dash accepted ${args.join(' ')}`);
}

describe('typed command grammars (tasks 1.5–1.9)', () => {
  const paths = commandPaths().sort();

  test('the parser declares every command path, each typed', () => {
    expect(paths).toEqual([
      'account-outcomes',
      'bootstrap-authority',
      'bootstrap-observation',
      'inspect-authority',
      'mcp token',
      'migrate-observation',
      'ops job admission',
      'ops job audit',
      'ops job calibrate',
      'ops job propose',
      'ops job render-audit-units',
      'ops job run',
      'ops job status',
      'ops outbox drop',
      'ops pool init',
      'ops pool inspect',
      'ops pool switch-mode',
      'ops release plan',
      'ops release run',
      'plan-enrollment',
      'pool import',
      'record-progress',
      'record-progress-v2',
      'recover-publication',
      'render-observation-units',
      'report-capacity',
      'resources cleanup',
      'resources create',
      'resources exec',
      'resources init',
      'resources inspect',
      'resources run',
      'resources sweep',
      'resources sync',
      'resources watch',
      'run-activation-checks',
      'submit-admission',
    ]);
  });

  test.each(commandPaths())('%s --help prints that command on stdout', (words) => {
    expect(printedBy([...words.split(' '), '--help'])).toContain(`Usage: twilight-dash ${words} `);
  });

  test.each(commandPaths())('%s refuses an unknown flag in its own usage line', (words) => {
    const line = refusalLineOf([...words.split(' '), '--no-such-flag']);
    expect(line).toStartWith(`usage: twilight-dash ${words} `);
    expect(line).not.toContain('\n');
  });

  test('the installed entrypoint refuses a typed command in one line before loading it', () => {
    const execution = Bun.spawnSync({
      cmd: [
        process.execPath,
        join(import.meta.dir, 'entrypoint.ts'),
        'record-progress',
        '--entries',
      ],
      stderr: 'pipe',
      stdout: 'pipe',
    });
    expect(execution.exitCode).toBe(1);
    expect(execution.stdout.toString('utf8')).toBe('');
    expect(execution.stderr.toString('utf8')).toMatch(
      /^error: usage: twilight-dash record-progress --entries PATH .*\(`--entries` requires `PATH`\.\)\n$/,
    );
  });

  test('--flag=value is accepted and parses as the spaced spelling', () => {
    const sha = 'a'.repeat(40);
    for (const [spaced, joined] of [
      [
        ['inspect-authority', 'r', '--session', 's'],
        ['inspect-authority', 'r', '--session=s'],
      ],
      [
        [
          'record-progress-v2',
          '--entries',
          'e',
          '--plan-reference',
          'p',
          '--tasks',
          't',
          '--output',
          'o',
        ],
        ['record-progress-v2', '--entries=e', '--plan-reference=p', '--tasks=t', '--output=o'],
      ],
      [
        [
          'run-activation-checks',
          '--candidate-repository',
          'c',
          '--candidate-sha',
          sha,
          '--candidate-policy',
          'p',
          '--check-runs',
          'r',
        ],
        [
          'run-activation-checks',
          '--candidate-repository=c',
          `--candidate-sha=${sha}`,
          '--candidate-policy=p',
          '--check-runs=r',
        ],
      ],
      [
        [
          'account-outcomes',
          '--repository',
          'r',
          '--since',
          '2026-10-01T00:00:00Z',
          '--until',
          '2026-10-02T00:00:00Z',
          '--rate-card',
          'c',
          '--output',
          'o',
          '--claude-projects',
          'a',
          '--claude-projects',
          'b',
        ],
        [
          'account-outcomes',
          '--repository=r',
          '--since=2026-10-01T00:00:00Z',
          '--until=2026-10-02T00:00:00Z',
          '--rate-card=c',
          '--output=o',
          '--claude-projects=a',
          '--claude-projects=b',
        ],
      ],
      [
        ['report-capacity', '--config', 'c'],
        ['report-capacity', '--config=c'],
      ],
      [
        [
          'resources',
          'cleanup',
          '--config',
          'c',
          '--use',
          'u',
          '--revision',
          '3',
          '--incarnation',
          'i',
          '--reason',
          'done',
        ],
        [
          'resources',
          'cleanup',
          '--config=c',
          '--use=u',
          '--revision=3',
          '--incarnation=i',
          '--reason=done',
        ],
      ],
      [
        ['mcp', 'token', '--resource', 'https://w/mcp', '--key-file', 'k', '--run', 'r'],
        ['mcp', 'token', '--resource=https://w/mcp', '--key-file=k', '--run=r'],
      ],
      [
        ['pool', 'import', 'f', '--store', 's'],
        ['pool', 'import', 'f', '--store=s'],
      ],
    ] as const) {
      expect(parseDashCommand(joined), joined.join(' ')).toEqual(parseDashCommand(spaced));
    }
    expect(
      parseDashRequest('resources', [
        'resources',
        'cleanup',
        '--config=c',
        '--use=u',
        '--revision=3',
        '--incarnation=i',
        '--reason=r',
      ]),
    ).toMatchObject({ action: 'cleanup', revision: 3 });
  });

  test('repeatable log directories keep their order; a payload after -- reaches the command whole', () => {
    expect(
      parseDashRequest('account-outcomes', [
        'account-outcomes',
        '--codex-sessions',
        'x',
        '--repository',
        'r',
        '--since',
        '2026-10-01T00:00:00Z',
        '--until',
        '2026-10-02T00:00:00Z',
        '--rate-card',
        'c',
        '--output',
        'o',
        '--claude-projects',
        'b',
        '--claude-projects',
        'a',
      ]),
    ).toMatchObject({ claudeProjects: ['b', 'a'], codexSessions: ['x'] });
    expect(
      parseDashRequest('resources', [
        'resources',
        'exec',
        '--config',
        'c',
        '--request',
        'q',
        '--',
        '/bin/sh',
        '-c',
        'exit 7',
        '--config',
      ]),
    ).toMatchObject({ action: 'exec', argv: ['/bin/sh', '-c', 'exit 7', '--config'] });
  });

  test('refuses what no single option can: no log directory, an inverted period', () => {
    const period = ['--repository', 'r', '--rate-card', 'c', '--output', 'o'];
    // Proof: dropping the log-directory check in `incoherenceOf` made this accept the line
    // (2026-11-02).
    expect(
      refusalLineOf([
        'account-outcomes',
        ...period,
        '--since',
        '2026-10-01T00:00:00Z',
        '--until',
        '2026-10-02T00:00:00Z',
      ]),
    ).toMatch(
      /^usage: twilight-dash account-outcomes .*\(at least one --claude-projects or --codex-sessions is required\.\)$/,
    );
    expect(
      refusalLineOf([
        'account-outcomes',
        ...period,
        '--since',
        '2026-10-02T00:00:00Z',
        '--until',
        '2026-10-01T00:00:00Z',
        '--codex-sessions',
        'x',
      ]),
    ).toMatch(/^usage: twilight-dash account-outcomes .*\(--until must be after --since\.\)$/);
  });

  test('refuses two credentials, none, a malformed revision and a blank operand', () => {
    const credential = ['mcp', 'token', '--resource', 'https://w/mcp'];
    expect(
      refusalLineOf([...credential, '--key-file', 'k', '--github-actions-audience', 'a']),
    ).toContain('cannot be used together');
    expect(refusalLineOf(credential)).toContain(
      '(one of --key-file, --assertion-file or --github-actions-audience is required.)',
    );
    for (const revision of ['0', '01', '1.5', '-1']) {
      expect(
        refusalLineOf([
          'resources',
          'cleanup',
          '--config',
          'c',
          '--use',
          'u',
          `--revision=${revision}`,
          '--incarnation',
          'i',
          '--reason',
          'r',
        ]),
        revision,
      ).toContain('(`--revision`: must be a positive integer.)');
    }
  });

  test('refuses a blank operand for every command', () => {
    // Proof: see `operand` in cli-parser.ts.
    for (const args of [
      ['bootstrap-authority', ' '],
      [
        'record-progress',
        '--entries',
        ' ',
        '--plan-reference',
        'p',
        '--tasks',
        't',
        '--output',
        'o',
      ],
      ['report-capacity', '--config', ''],
      ['pool', 'import', 'f', '--store', '\t'],
      ['resources', 'init', '--config', ' '],
      ['mcp', 'token', '--resource', ' ', '--key-file', 'k'],
    ]) {
      expect(refusalLineOf(args), JSON.stringify(args)).toContain(
        'must be a non-blank value that does not begin with --.',
      );
    }
  });

  test('a refusal never quotes an operand', () => {
    const canary = 'wbs_mk_00000000-canary';
    for (const args of [
      [
        'mcp',
        'token',
        '--resource',
        'https://w/mcp',
        '--key-file',
        canary,
        '--assertion-file',
        canary,
      ],
      ['mcp', 'token', '--resource', 'https://w/mcp', '--key-file', 'k', canary],
      ['mcp', 'token', '--resource', 'https://w/mcp', '--key-file', 'k', `--key=${canary}`],
      [
        'record-progress',
        '--entries',
        'e',
        '--plan-reference',
        'p',
        '--tasks',
        't',
        '--output',
        'o',
        canary,
      ],
      ['submit-admission', 'r', 'p', canary, 'x'],
      ['bootstrap-authority', 'r', canary],
      ['pool', 'import', canary, canary],
    ]) {
      const line = refusalLineOf(args);
      expect(line, args.join(' ')).toStartWith('usage: twilight-dash ');
      expect(line, args.join(' ')).not.toContain('canary');
    }
    // An unknown subcommand is named, not redacted.
    expect(refusalLineOf(['resources', 'teleport'])).toContain('`teleport`');
  });

  test('a stray word and a mid-line valueless flag name their position', () => {
    const sha = 'a'.repeat(40);
    // `--candidate-sha` takes `--candidate-policy` as its value, so `p` is the stranded word.
    expect(
      refusalLineOf([
        'run-activation-checks',
        '--candidate-repository',
        'c',
        '--candidate-sha',
        '--candidate-policy',
        'p',
        '--check-runs',
        'r',
      ]),
    ).toEndWith('(Unexpected option or subcommand: `<word 5 after --candidate-policy>`.)');
    expect(refusalLineOf(['report-capacity', '/c'])).toEndWith(
      '(Unexpected option or subcommand: `<word 1>`.)',
    );
    expect(refusalLineOf(['pool', 'import', 'f', '--store', 's', 'extra'])).toEndWith(
      '(Unexpected option or subcommand: `<word 4>`.)',
    );
    expect(
      refusalLineOf([
        'run-activation-checks',
        '--candidate-repository',
        'c',
        `--candidate-sha=${sha}`,
        '--candidate-policy',
        'p',
        '--check-runs',
        'r',
        'extra',
      ]),
    ).toEndWith('(Unexpected option or subcommand: `<word 8>`.)');
  });

  test('refuses an empty payload, an invalid instant and an unknown selection', () => {
    // Proof: dropping `payload()`'s `min: 1` made this accept `resources run … --` (2026-11-03).
    expect(refusalLineOf(['resources', 'run', '--config', 'c', '--use', 'u', '--'])).toEndWith(
      '(a command after -- is required.)',
    );
    expect(
      refusalLineOf([
        'account-outcomes',
        '--repository',
        'r',
        '--since',
        '2026-10-01',
        '--until',
        '2026-10-02T00:00:00Z',
        '--rate-card',
        'c',
        '--output',
        'o',
        '--codex-sessions',
        'x',
      ]),
    ).toEndWith('(`--since`: period bounds must be UTC instants like 2026-10-15T00:00:00Z.)');
    expect(refusalLineOf(['submit-admission', 'r', 'p', 'frozen', 'x'])).toEndWith(
      '(`SELECTION`: Expected one of "staged" and "committed", but got "<word 3>".)',
    );
  });

  test('parseDashRequest refuses a line naming another command', () => {
    expect(() => parseDashRequest('report-capacity', ['bootstrap-authority', 'r'])).toThrow(
      new UsageRefusal('bootstrap-authority r names bootstrap-authority, not report-capacity'),
    );
  });
});

test('runDashArguments refuses lightweight release requests before a heavy handler', async () => {
  const planner = observePlanner();
  let refusal: unknown;
  try {
    await runDashArguments(
      [
        'ops',
        'release',
        'plan',
        'website',
        '--config',
        '/unused/release.json',
        '--environment',
        'development',
        '--profile',
        'full',
      ],
      dependencies(planner.run),
    );
  } catch (cause) {
    refusal = cause;
  }
  expect(refusal).toBeInstanceOf(UsageRefusal);
  expect(refusal instanceof Error && refusal.message).toBe(
    'ops release is dispatched by entrypoint.ts',
  );
  expect(planner.calls).toEqual([]);
});
