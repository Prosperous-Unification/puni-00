import { existsSync, mkdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { parseOrThrow } from '@shared/validation';
import {
  type CheckRun,
  type CheckRunAuthority,
  checkRunDigest,
  checkRunLayout,
  CheckRunLedger,
  type CheckRunPlan,
  hashBytes,
  planCandidateCheckRuns,
  serializeCanonical,
} from '@twilight-burokrat/judge';

import type { WallClock } from '../clock';

/** The recorder name every ledger this command writes carries; Burokrat's preparers expect it. */
export const activationCheckAuthority: CheckRunAuthority = {
  product: 'twilight-dash',
  command: 'run-activation-checks',
};

/** One process a check run starts: its argv, its absolute directory and the environment it declares. */
export interface CheckInvocation {
  readonly command: readonly string[];
  readonly cwd: string;
  /** Only what the candidate's declaration adds; the executor supplies the inherited rest. */
  readonly env: Readonly<Record<string, string>>;
}

/** What a finished check process left: its exit status and both streams, whole. */
export interface CheckExecution {
  readonly exitCode: number;
  readonly stdout: Uint8Array;
  readonly stderr: Uint8Array;
}

export type ExecuteCheck = (invocation: CheckInvocation) => CheckExecution;

/** What `run-activation-checks` reaches besides its arguments, composed by `runDash`. */
export interface CheckRunDependencies {
  readonly clock: WallClock;
  readonly execute: ExecuteCheck;
  readonly write: (text: string) => void;
}

/** A recorded ledger and the stream bytes its digests name, before anything is written. */
export interface RecordedCheckRuns {
  readonly ledger: CheckRunLedger;
  readonly streams: ReadonlyMap<string, Uint8Array>;
}

const usage =
  'usage: twilight-dash run-activation-checks --candidate-repository <checkout> ' +
  '--candidate-sha <40-hex sha> --candidate-policy <committed path> --check-runs <new directory>';
const flags = [
  '--candidate-repository',
  '--candidate-sha',
  '--candidate-policy',
  '--check-runs',
] as const;
type Flag = (typeof flags)[number];

function readFlags(argv: readonly string[]): Record<Flag, string> {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv.at(index + 1);
    // Proof (2026-10-12): deleting this refusal let `--candidate-revision` pass unread and the
    // command reach the executor; `refuses grammar faults and unusable directories before any
    // effect` expected `unknown --candidate-revision` and received `this case must not run a
    // check`.
    if (!(flags as readonly string[]).includes(flag)) throw new Error(`${usage} (unknown ${flag})`);
    if (values.has(flag)) throw new Error(`${usage} (repeated ${flag})`);
    if (value === undefined || value.length === 0 || value.startsWith('--')) {
      throw new Error(`${usage} (${flag} has no value)`);
    }
    values.set(flag, value);
  }
  // The loop below assigns every member of `flags` or throws, and `flags` is this record's key
  // set, so the cast is discharged before the value escapes this function.
  const resolved = {} as Record<Flag, string>;
  for (const flag of flags) {
    const value = values.get(flag);
    if (value === undefined) throw new Error(`${usage} (missing ${flag})`);
    resolved[flag] = value;
  }
  if (!/^[0-9a-f]{40}$/.test(resolved['--candidate-sha'])) {
    throw new Error(`${usage} (--candidate-sha is not a 40-hex sha)`);
  }
  return resolved;
}

function git(repository: string, argv: readonly string[]): string {
  const shown = Bun.spawnSync(['git', '-C', repository, ...argv], {
    stderr: 'pipe',
    stdout: 'pipe',
  });
  if (shown.exitCode !== 0) {
    throw new Error(
      `git ${argv.join(' ')} failed in ${repository}: ${shown.stderr.toString().trim()}`,
    );
  }
  return shown.stdout.toString();
}

/**
 * The checks run in the working tree, so it must be the committed candidate the receipts will
 * name: HEAD at the candidate revision and nothing modified or untracked.
 * @throws `Error` naming HEAD or the first dirty paths.
 */
function assertCommittedCheckout(repository: string, revision: string): void {
  const head = git(repository, ['rev-parse', 'HEAD']).trim();
  // Proof (2026-10-12): disabling this refusal reached the executor in a checkout at the base
  // revision, about to record runs naming the candidate; `runs only the committed candidate`
  // expected `is not at the candidate revision` and received `this case must not run a check`.
  if (head !== revision) {
    throw new Error(
      `candidate checkout is not at the candidate revision: HEAD ${head} != ${revision}`,
    );
  }
  // Untrimmed: each porcelain line starts with a two-column status that may begin with a space.
  const dirty = git(repository, ['status', '--porcelain'])
    .split('\n')
    .filter((line) => line.length > 0);
  // Proof (2026-10-12): disabling this refusal reached the executor over an edited `nx.json`;
  // the same test expected `candidate checkout is dirty: nx.json`. A trimmed porcelain line once
  // reported `x.json` here, which is why `git` returns stdout untrimmed.
  if (dirty.length > 0) {
    throw new Error(
      `candidate checkout is dirty: ${dirty
        .slice(0, 3)
        .map((line) => line.slice(3))
        .join(', ')}`,
    );
  }
}

/**
 * The ledger directory is new and outside the candidate: writing into the candidate would make the
 * checkout dirty for the preparer that reads it, and reusing a directory would mix two runs.
 */
function assertFreshOutside(repository: string, directory: string): string {
  const resolved = resolve(directory);
  // Proof (2026-10-12): deleting this refusal reached the executor with an existing directory;
  // `refuses grammar faults and unusable directories before any effect` expected
  // `already exists`.
  if (existsSync(resolved)) throw new Error(`check-run directory already exists: ${resolved}`);
  let ancestor = dirname(resolved);
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  const offset = relative(repository, join(realpathSync(ancestor), relative(ancestor, resolved)));
  // Proof (2026-10-12): disabling this refusal reached the executor with the directory inside
  // the candidate, which the preparer would then read as dirty; the same test expected
  // `outside the candidate repository`.
  if (offset === '' || (!offset.startsWith(`..${sep}`) && offset !== '..' && !isAbsolute(offset))) {
    throw new Error(`check-run directory must be outside the candidate repository: ${resolved}`);
  }
  return resolved;
}

function stamp(clock: WallClock): string {
  return new Date(clock.read()).toISOString();
}

/**
 * Runs every planned check in plan order and records it: the wall-clock instant before the
 * check, the check, then the planned `bun test` skip probe only if the check passed, then the
 * instant after. Each run links the digest of the one before it and the ledger's `head` seals the
 * last. A failing check is recorded, never refused here: the preparer refuses it (`R16`).
 */
export function recordCheckRuns(
  plan: CheckRunPlan,
  repository: string,
  deps: Pick<CheckRunDependencies, 'clock' | 'execute'>,
): RecordedCheckRuns {
  const streams = new Map<string, Uint8Array>();
  const store = (bytes: Uint8Array): string => {
    const digest = hashBytes(bytes);
    streams.set(digest, bytes);
    return digest;
  };
  const runs: CheckRun[] = [];
  for (const planned of plan.checks) {
    const startedAt = stamp(deps.clock);
    const check = deps.execute({ command: planned.command, cwd: repository, env: {} });
    // Proof (2026-10-12): dropping `check.exitCode === 0` probed after a failed check;
    // `probes a bun test check only after it passed` received two executor calls.
    const probe =
      planned.skipProbe !== null && check.exitCode === 0
        ? {
            planned: planned.skipProbe,
            measured: deps.execute({
              ...planned.skipProbe,
              cwd: resolve(repository, planned.skipProbe.cwd),
            }),
          }
        : undefined;
    const endedAt = stamp(deps.clock);
    const previous = runs.at(-1);
    runs.push({
      schemaVersion: 1,
      recordKind: 'check-run',
      sequence: runs.length,
      previous: previous === undefined ? null : checkRunDigest(previous),
      authority: { ...activationCheckAuthority },
      candidate: { ...plan.candidate },
      checkId: planned.checkId,
      startedAt,
      endedAt,
      check: {
        command: [...planned.command],
        exitCode: check.exitCode,
        stdout: store(check.stdout),
        stderr: store(check.stderr),
      },
      skipProbe:
        probe === undefined
          ? null
          : {
              command: [...probe.planned.command],
              cwd: probe.planned.cwd,
              env: { ...probe.planned.env },
              exitCode: probe.measured.exitCode,
              stdout: store(probe.measured.stdout),
              stderr: store(probe.measured.stderr),
            },
    });
  }
  const last = runs.at(-1);
  const ledger = parseOrThrow(CheckRunLedger, {
    schemaVersion: 1,
    recordKind: 'check-run-ledger',
    runs,
    head: last === undefined ? null : checkRunDigest(last),
  });
  return { ledger, streams };
}

/**
 * Writes the streams under `streams/<sha256>` and then the ledger, renamed into place last, so a
 * reader never sees a ledger whose streams are still missing.
 * @returns the ledger path and the SHA-256 of its bytes.
 */
export function writeCheckRuns(
  directory: string,
  recorded: RecordedCheckRuns,
): { path: string; digest: string } {
  mkdirSync(join(directory, checkRunLayout.streams), { recursive: true });
  for (const [digest, bytes] of recorded.streams) {
    writeFileSync(join(directory, checkRunLayout.streams, digest), bytes);
  }
  const bytes = serializeCanonical(recorded.ledger);
  const path = join(directory, checkRunLayout.ledger);
  writeFileSync(`${path}.partial`, bytes);
  renameSync(`${path}.partial`, path);
  return { path, digest: hashBytes(bytes) };
}

/**
 * The production executor: `Bun.spawnSync` with the operator's environment, the declaration's
 * additions, and Nx's daemon, plugin isolation and cloud off.
 */
export const spawnCheck: ExecuteCheck = (invocation) => {
  // Proof (inherited from Burokrat's runner): inheriting a neutral environment unchanged made the
  // standalone package test fail with Nx plugin workers exiting before their sandbox-denied
  // sockets could connect.
  const spawned = Bun.spawnSync([...invocation.command], {
    cwd: invocation.cwd,
    env: {
      ...process.env,
      ...invocation.env,
      NX_DAEMON: 'false',
      NX_ISOLATE_PLUGINS: 'false',
      NX_NO_CLOUD: 'true',
    },
    stderr: 'pipe',
    stdout: 'pipe',
  });
  return { exitCode: spawned.exitCode, stdout: spawned.stdout, stderr: spawned.stderr };
};

/**
 * `twilight-dash run-activation-checks`: plans the candidate's checks through the judge
 * (`planCandidateCheckRuns`), refuses a checkout that is not the committed candidate and a ledger
 * directory that exists or sits inside the candidate, runs each check on the injected executor and
 * wall clock, and writes the ledger both Burokrat preparers take as `--check-runs`. Stateless: no
 * store, no lock, no network of its own; it shares only `clock.ts` with Dash's two authorities.
 * @throws `Error` for a grammar fault, an unusable checkout or directory, or a refused plan.
 */
export function runActivationChecksCommand(
  argv: readonly string[],
  deps: CheckRunDependencies,
): void {
  const options = readFlags(argv);
  const repository = realpathSync(resolve(options['--candidate-repository']));
  const revision = options['--candidate-sha'];
  const directory = assertFreshOutside(repository, options['--check-runs']);
  assertCommittedCheckout(repository, revision);
  const plan = planCandidateCheckRuns(repository, revision, options['--candidate-policy']);
  const recorded = recordCheckRuns(plan, repository, deps);
  const written = writeCheckRuns(directory, recorded);
  const lines = [
    `check runs: ${revision}`,
    ...recorded.ledger.runs.map(
      (run) =>
        `${run.checkId} exit ${String(run.skipProbe?.exitCode ?? run.check.exitCode)} ${String(Date.parse(run.endedAt) - Date.parse(run.startedAt))}ms`,
    ),
    `ledger: ${written.path} sha256: ${written.digest}`,
  ];
  deps.write(`${lines.join('\n')}\n`);
}
