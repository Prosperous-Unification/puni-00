import { Buffer } from 'node:buffer';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  CheckRunLedger,
  type CheckRunPlan,
  planCandidateCheckRuns,
  readCheckRuns,
  serializeCanonical,
} from '@twilight-burokrat/judge';
import { afterAll, describe, expect, test } from 'bun:test';

import { runDashArguments } from '../cli';
import type { WallClock } from '../clock';
import {
  activationCheckAuthority,
  type CheckExecution,
  type CheckInvocation,
  recordCheckRuns,
  runActivationChecksCommand,
  writeCheckRuns,
} from './run-activation-checks';

const burokrat = join(import.meta.dir, '../../../../twilight-burokrat/cli');
const goldens = join(burokrat, 'fixtures/check-runs');
const scratchRoots: string[] = [];

function scratch(): string {
  const root = mkdtempSync(join(tmpdir(), 'dash-check-runs-'));
  scratchRoots.push(root);
  return root;
}

afterAll(() => {
  for (const root of scratchRoots.splice(0)) rmSync(root, { force: true, recursive: true });
});

interface Candidate {
  workspace: string;
  repository: string;
  baseRevision: string;
  candidateRevision: string;
}

/**
 * Burokrat's reproducible relocation candidate, built by its fixture command as a process: a Dash
 * test reaches Burokrat only through the judge alias, a file read or a process.
 */
function candidate(options: { skipping?: boolean } = {}): Candidate {
  const built = Bun.spawnSync(
    [
      process.execPath,
      join(burokrat, 'src/policy/relocation-fixture-cli.ts'),
      ...(options.skipping === true ? ['--skipping-check'] : []),
    ],
    { stderr: 'pipe', stdout: 'pipe' },
  );
  if (built.exitCode !== 0) throw new Error(`fixture command failed: ${built.stderr.toString()}`);
  // The fixture command's own output; the fields below are read as strings and nothing else.
  const fixture = JSON.parse(built.stdout.toString()) as Candidate;
  scratchRoots.push(fixture.workspace);
  return fixture;
}

/** A wall clock that reads the given instants in order and refuses to be read once more. */
function scriptedClock(instants: readonly string[]): WallClock & { reads: () => number } {
  let next = 0;
  return {
    read: () => {
      const instant = instants.at(next);
      if (instant === undefined) throw new Error('scripted clock read past its script');
      next += 1;
      return Date.parse(instant);
    },
    reads: () => next,
  };
}

/** A wall clock that advances 5 ms on every read from a fixed origin. */
function steppingClock(): WallClock {
  let instant = Date.parse('2026-10-12T09:00:00.000Z');
  return {
    read: () => {
      instant += 5;
      return instant;
    },
  };
}

function command(
  argv: readonly string[],
  deps: Partial<Parameters<typeof runActivationChecksCommand>[1]> = {},
): { output: string; error: unknown } {
  let output = '';
  try {
    runActivationChecksCommand(argv, {
      clock: steppingClock(),
      execute: () => {
        throw new Error('this case must not run a check');
      },
      write: (text) => {
        output += text;
      },
      ...deps,
    });
    return { output, error: undefined };
  } catch (error) {
    return { output, error };
  }
}

function argvFor(fixture: Candidate, checkRuns: string, revision = fixture.candidateRevision) {
  return [
    '--candidate-repository',
    fixture.repository,
    '--candidate-sha',
    revision,
    '--candidate-policy',
    'docs/wiki-policy/policy.json',
    '--check-runs',
    checkRuns,
  ];
}

describe('twilight-dash run-activation-checks', () => {
  test('reproduces each golden ledger byte for byte from what it measured', () => {
    for (const name of ['passing', 'skipping'] as const) {
      const directory = join(goldens, name);
      const bytes = readFileSync(join(directory, 'check-runs.json'));
      const golden = CheckRunLedger.assert(JSON.parse(bytes.toString('utf8')));
      const plan: CheckRunPlan = {
        candidate: golden.runs[0].candidate,
        checks: golden.runs.map((run) => ({
          checkId: run.checkId,
          command: run.check.command,
          skipProbe:
            run.skipProbe === null
              ? null
              : { command: run.skipProbe.command, cwd: run.skipProbe.cwd, env: run.skipProbe.env },
        })),
      };
      const stream = (digest: string) => readFileSync(join(directory, 'streams', digest));
      const executions: CheckExecution[] = golden.runs.flatMap((run) => [
        {
          exitCode: run.check.exitCode,
          stdout: stream(run.check.stdout),
          stderr: stream(run.check.stderr),
        },
        ...(run.skipProbe === null
          ? []
          : [
              {
                exitCode: run.skipProbe.exitCode,
                stdout: stream(run.skipProbe.stdout),
                stderr: stream(run.skipProbe.stderr),
              },
            ]),
      ]);
      const recorded = recordCheckRuns(plan, '/candidate', {
        clock: scriptedClock(golden.runs.flatMap((run) => [run.startedAt, run.endedAt])),
        execute: () => {
          const execution = executions.shift();
          if (execution === undefined) throw new Error(`${name}: executed past the golden runs`);
          return execution;
        },
      });
      // Proof (2026-10-12): renaming the authority's `command` to `run-checks` failed here on the
      // first ledger's bytes.
      expect(serializeCanonical(recorded.ledger), name).toBe(bytes.toString('utf8'));
      const out = join(scratch(), name);
      writeCheckRuns(out, recorded);
      expect(readdirSync(join(out, 'streams')).sort(), name).toEqual(
        readdirSync(join(directory, 'streams')).sort(),
      );
      expect(readFileSync(join(out, 'check-runs.json')).equals(bytes), name).toBe(true);
    }
  });

  test('runs the candidate checks for real and writes a ledger the judge accepts', async () => {
    for (const skipping of [false, true]) {
      const fixture = candidate({ skipping });
      const checkRuns = join(scratch(), 'check-runs');
      let output = '';
      await runDashArguments(['run-activation-checks', ...argvFor(fixture, checkRuns)], {
        clock: steppingClock(),
        monotonic: { now: () => 0 },
        planEnrollment: () => Promise.reject(new Error('no enrollment here')),
        stdout: {
          write: (text: string) => {
            output += text;
          },
        },
      });
      expect(output).toContain(`check runs: ${fixture.candidateRevision}\n`);
      expect(output).toContain('check.fixture.module exit 0 5ms\n');
      const plan = planCandidateCheckRuns(
        fixture.repository,
        fixture.candidateRevision,
        'docs/wiki-policy/policy.json',
      );
      const [run] = readCheckRuns(checkRuns, plan, activationCheckAuthority);
      expect([run.startedAt, run.endedAt]).toEqual([
        '2026-10-12T09:00:00.005Z',
        '2026-10-12T09:00:00.010Z',
      ]);
      // Under Nx, Bun colours its summary; the escape is built from its code point, as Burokrat's
      // skip measurement does, because a literal one in a regex is a lint error.
      const measured = Buffer.concat([run.measured.stdout, run.measured.stderr])
        .toString('utf8')
        .replaceAll(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '');
      // The probe really ran `bun test` in the declared directory and measured its one skip; the
      // passing candidate's Nx target printed its own line.
      expect(measured).toContain(skipping ? ' 1 skip' : 'relocation fixture check');
      expect(
        Bun.spawnSync(['git', '-C', fixture.repository, 'status', '--porcelain']).stdout.toString(),
      ).toBe('');
    }
  }, 120_000);

  test('probes a bun test check only after it passed', () => {
    const plan: CheckRunPlan = {
      candidate: { revision: 'a'.repeat(40), identity: 'b'.repeat(64) },
      checks: [
        {
          checkId: 'check.skipping',
          command: ['bunx', 'nx', 'run', 'fixture:skip'],
          skipProbe: { command: ['bash', '-c', 'bun test'], cwd: 'src/new', env: { CI: '1' } },
        },
      ],
    };
    const calls: CheckInvocation[] = [];
    const recorded = recordCheckRuns(plan, '/candidate', {
      clock: steppingClock(),
      execute: (invocation) => {
        calls.push(invocation);
        return { exitCode: 1, stdout: new Uint8Array(), stderr: Buffer.from('failed\n') };
      },
    });
    // Proof (2026-10-12): dropping the `exitCode === 0` condition ran the probe after the failed
    // check and this assertion received two calls.
    expect(calls.map((call) => [call.command.join(' '), call.cwd])).toEqual([
      ['bunx nx run fixture:skip', '/candidate'],
    ]);
    expect(recorded.ledger.runs[0].skipProbe).toBeNull();
    expect(recorded.ledger.runs[0].check.exitCode).toBe(1);
    const passing = recordCheckRuns(plan, '/candidate', {
      clock: steppingClock(),
      execute: (invocation) => {
        calls.push(invocation);
        return { exitCode: 0, stdout: new Uint8Array(), stderr: new Uint8Array() };
      },
    });
    expect(calls.slice(1).map((call) => [call.command.join(' '), call.cwd, call.env])).toEqual([
      ['bunx nx run fixture:skip', '/candidate', {}],
      ['bash -c bun test', '/candidate/src/new', { CI: '1' }],
    ]);
    expect(passing.ledger.runs[0].skipProbe?.cwd).toBe('src/new');
  });

  test('refuses grammar faults and unusable directories before any effect', () => {
    const fixture = candidate();
    const fresh = join(scratch(), 'check-runs');
    const complete = argvFor(fixture, fresh);
    const faults: [readonly string[], string][] = [
      [[...complete, '--candidate-revision', 'x'], 'unknown --candidate-revision'],
      [[...complete, '--check-runs', fresh], 'repeated --check-runs'],
      [complete.slice(0, 6), 'missing --check-runs'],
      [[...complete.slice(0, 7), '--candidate-sha'], '--check-runs has no value'],
      [argvFor(fixture, fresh, 'HEAD'), '--candidate-sha is not a 40-hex sha'],
    ];
    for (const [argv, reason] of faults) {
      const { error } = command(argv);
      expect(error instanceof Error ? error.message : error).toContain(reason);
    }
    const existing = scratch();
    expect(String(command(argvFor(fixture, existing)).error)).toContain(
      `check-run directory already exists: ${existing}`,
    );
    const inside = join(fixture.repository, 'check-runs');
    expect(String(command(argvFor(fixture, inside)).error)).toContain(
      'check-run directory must be outside the candidate repository',
    );
    expect(existsSync(fresh)).toBe(false);
    expect(existsSync(inside)).toBe(false);
  }, 60_000);

  test('runs only the committed candidate', () => {
    const fixture = candidate();
    const atBase = Bun.spawnSync(
      ['git', '-C', fixture.repository, 'checkout', '--quiet', fixture.baseRevision],
      { stderr: 'pipe' },
    );
    expect(atBase.exitCode, atBase.stderr.toString()).toBe(0);
    expect(String(command(argvFor(fixture, join(scratch(), 'runs'))).error)).toContain(
      `candidate checkout is not at the candidate revision: HEAD ${fixture.baseRevision}`,
    );
    Bun.spawnSync([
      'git',
      '-C',
      fixture.repository,
      'checkout',
      '--quiet',
      fixture.candidateRevision,
    ]);
    writeFileSync(join(fixture.repository, 'nx.json'), '{}\n');
    expect(String(command(argvFor(fixture, join(scratch(), 'runs'))).error)).toContain(
      'candidate checkout is dirty: nx.json',
    );
  }, 60_000);

  test('stamps every instant from the injected clock and never reads it again', () => {
    const fixture = candidate();
    const clock = scriptedClock(['2026-10-12T10:00:00.000Z', '2026-10-12T10:00:00.000Z']);
    const checkRuns = join(scratch(), 'runs');
    const { error, output } = command(argvFor(fixture, checkRuns), {
      clock,
      execute: () => ({ exitCode: 0, stdout: Buffer.from('ok\n'), stderr: new Uint8Array() }),
    });
    expect(error).toBeUndefined();
    expect(output).toContain('check.fixture.module exit 0 0ms');
    expect(clock.reads()).toBe(2);
    const ledger = CheckRunLedger.assert(
      JSON.parse(readFileSync(join(checkRuns, 'check-runs.json'), 'utf8')),
    );
    expect([ledger.runs[0].startedAt, ledger.runs[0].endedAt]).toEqual([
      '2026-10-12T10:00:00.000Z',
      '2026-10-12T10:00:00.000Z',
    ]);
  }, 60_000);
});
