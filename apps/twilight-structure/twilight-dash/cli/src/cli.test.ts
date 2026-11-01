import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Usage, UsageTerm } from '@optique/core';
import { afterAll, describe, expect, test } from 'bun:test';

import {
  bootstrapUsage as bootstrapObservationUsage,
  migrateUsage as migrateObservationUsage,
} from './activation/observation-commands';
import { usage as renderObservationUnitsUsage } from './activation/units/bundle';
import {
  bootstrapUsage as bootstrapAuthorityUsage,
  inspectUsage as inspectAuthorityUsage,
  recoverUsage as recoverPublicationUsage,
} from './authority/authority-commands';
import { openAuthority } from './authority/authority-store';
import { acquireClaims } from './authority/claims';
import { usage as submitAdmissionUsage } from './authority/submit-admission';
import { usage as runActivationChecksUsage } from './check-runs/run-activation-checks';
import {
  type DashDependencies,
  dashHandlers,
  type DispatchedCommand,
  runDash,
  runDashArguments,
} from './cli';
import { dashParser, delegatedGrammars, readDashInvocation, UsageRefusal } from './cli-parser';
import { usage as reportCapacityUsage } from './compute/report-capacity';
import { usage as accountOutcomesUsage } from './ledger/account-outcomes';
import { USAGE as poolImportUsage } from './mcp/pool-import';
import { USAGE as mcpTokenUsage } from './mcp/token-command';
import { type OpsCommand, opsHandlers, runOps } from './ops/commands';
import { linuxScopeTelemetry } from './ops/scope';
import { progressUsage } from './progress/record-progress';
import { runResources } from './resources/command';

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
const entrypointWords = Object.keys(delegatedGrammars).filter((words) => words.includes(' '));
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
    expect(opsParserWords()).toEqual(Object.keys(opsHandlers).sort());
    expect(opsParserWords()).toEqual(['job run', 'job status', 'pool init', 'pool inspect']);
  });

  test('runOps refuses ops words no handler takes', async () => {
    // A JavaScript caller bypassing the parser; the type admits only declared words.
    const bypass = { command: 'ops', words: 'job audit', config: 'x' } as unknown as OpsCommand;
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
      });
    } catch (cause) {
      refusal = cause;
    }
    expect(refusal instanceof Error && refusal.message).toBe(
      'Unsupported Dash command: ops job audit',
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
  });
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

  test('help parity holds under COLUMNS=30', () => {
    const inProcess = printedBy(['--help']);
    for (const columns of ['30', '400']) {
      const execution = Bun.spawnSync({
        cmd: [process.execPath, join(import.meta.dir, 'entrypoint.ts'), '--help'],
        env: { ...process.env, COLUMNS: columns },
        stderr: 'pipe',
        stdout: 'pipe',
      });
      expect(execution.exitCode, columns).toBe(0);
      const help = execution.stdout.toString('utf8');
      expect(helpCommands(help), columns).toEqual(dispatched);
      expect(help, columns).toBe(inProcess);
    }
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

/** Each delegated module's usage line, which its own refusals print. */
const moduleUsages: Readonly<Record<Exclude<keyof typeof delegatedGrammars, 'resources'>, string>> =
  {
    'bootstrap-authority': bootstrapAuthorityUsage,
    'inspect-authority': inspectAuthorityUsage,
    'recover-publication': recoverPublicationUsage,
    'submit-admission': submitAdmissionUsage,
    'render-observation-units': renderObservationUnitsUsage,
    'run-activation-checks': runActivationChecksUsage,
    'bootstrap-observation': bootstrapObservationUsage,
    'migrate-observation': migrateObservationUsage,
    'record-progress': progressUsage(1),
    'record-progress-v2': progressUsage(2),
    'account-outcomes': accountOutcomesUsage,
    'report-capacity': reportCapacityUsage,
    'mcp token': mcpTokenUsage,
    'pool import': poolImportUsage,
  };

describe('help shows each delegated module grammar', () => {
  test.each(Object.entries(moduleUsages))('%s', (words, usage) => {
    // Proof: changing `report-capacity`'s module usage to `--config <file>` failed this test
    // for `report-capacity` (2026-11-01).
    expect(usage).toEndWith(` ${words} ${delegatedGrammars[words as keyof typeof moduleUsages]}`);
  });

  test('resources: the actions its module accepts', async () => {
    const refusal = await runResources(
      [],
      FIXED_CLOCK,
      () => undefined,
      () => {
        throw new Error('resources connected before refusing');
      },
    ).catch((cause: unknown) => (cause instanceof Error ? cause.message : String(cause)));
    const actions = String(refusal)
      .replace(/^resources requires /u, '')
      .split(/, (?:or )?/u);
    expect(delegatedGrammars.resources.split(' ')[0].split('|')).toEqual(actions);
  });
});
