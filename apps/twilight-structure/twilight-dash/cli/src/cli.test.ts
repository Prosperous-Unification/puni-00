import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, test } from 'bun:test';

import { openAuthority } from './authority/authority-store';
import { acquireClaims } from './authority/claims';
import { type DashDependencies, runDash } from './cli';

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
    await runDash(argv, dependencies(planner.run));
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
    expect(execution.exitCode).not.toBe(0);
    expect(new TextDecoder().decode(execution.stderr)).toContain('Unsupported Dash command: apply');
  });

  test('delegates only the reviewed enrollment operation and named arguments', async () => {
    const planner = observePlanner();
    await runDash(
      ['plan-enrollment', ...enrollmentFlags.slice(8), ...enrollmentFlags.slice(0, 8)],
      dependencies(planner.run),
    );
    expect(planner.calls).toEqual([['--operation', 'enroll', ...enrollmentFlags]]);
  });

  test.each(['apply', 'discover', 'build', 'deploy', 'plan', ''])(
    'refuses unsupported command %s before planning',
    async (command) => {
      const planner = observePlanner();
      await expectRefusal([command, ...enrollmentFlags], planner, /command/i);
    },
  );

  test.each(['--operation', '--executable', '--adapter', '--arbitrary'])(
    'refuses unsupported flag %s before planning',
    async (flag) => {
      const planner = observePlanner();
      await expectRefusal(['plan-enrollment', ...enrollmentFlags, flag, 'apply'], planner, /flag/i);
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
    await expectRefusal(['plan-enrollment', ...argv], planner, new RegExp(flag));
  });

  test('refuses duplicate flags before planning', async () => {
    const planner = observePlanner();
    await expectRefusal(
      ['plan-enrollment', ...enrollmentFlags, '--node', 'node-2'],
      planner,
      /duplicate.*--node/i,
    );
  });

  test('refuses a valueless or empty flag before planning', async () => {
    const planner = observePlanner();
    await expectRefusal(['plan-enrollment', ...enrollmentFlags.slice(0, -1)], planner, /value/i);
    await expectRefusal(
      ['plan-enrollment', ...enrollmentFlags.slice(0, -1), ''],
      planner,
      /--known-hosts-sha256/,
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
    await runDash(['plan-enrollment', ...enrollmentFlags], deps);
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
    await runDash(argv, deps);
  } catch (cause) {
    if (cause instanceof Error) return cause.message;
    throw new Error('Dash did not return an Error', { cause });
  }
  throw new Error(`Dash accepted ${argv.join(' ')}`);
}

test('bootstrap-authority creates the store once and refuses the second time', async () => {
  const root = scratchRepository();
  const first = capturingDependencies();
  await runDash(['bootstrap-authority', root], first.deps);
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

  await runDash(['bootstrap-authority', root], capturingDependencies().deps);
  const store = openAuthority(root, { clock: FIXED_CLOCK });
  acquireClaims(store, {
    conflictGroups: [],
    owner: { sessionId: 'session-a', worktreePath: root },
    paths: [{ access: 'write', path: 'src' }],
  });
  const state = store.inspect();
  store.close();

  const whole = capturingDependencies();
  await runDash(['inspect-authority', root], whole.deps);
  expect(JSON.parse(whole.output.join(''))).toEqual(JSON.parse(JSON.stringify(state)));

  const session = capturingDependencies();
  await runDash(['inspect-authority', root, '--session', 'session-a'], session.deps);
  expect(JSON.parse(session.output.join(''))).toEqual(
    JSON.parse(JSON.stringify({ generations: state.generations, sessionId: 'session-a' })),
  );
  const unknown = capturingDependencies();
  await runDash(['inspect-authority', root, '--session', 'session-z'], unknown.deps);
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
});
