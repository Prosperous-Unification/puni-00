import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type } from '@shared/validation';

import { type CheckRun, CheckRunLedger } from '../contracts/records';
import { hashBytes, hashCanonical, serializeCanonical } from '../evidence/content-manifest';
import { readCandidate } from '../inventory/read-candidate';
import { extractNxRelationships } from '../relationships/nx';
import {
  type CandidateFile,
  type CheckPlan,
  planCandidateChecks,
  readRelocationPolicy,
  type RecordedCheck,
  resolveSkipProbe,
  type SkipProbeInvocation,
} from './check-plan';
import { writeBytes } from './trusted-modules';

/** Who recorded a check run: a product and the command of it that measured. */
export interface CheckRunAuthority {
  readonly product: string;
  readonly command: string;
}

/** Where a check-run directory keeps its ledger and its digest-named stream files. */
export const checkRunLayout = { ledger: 'check-runs.json', streams: 'streams' } as const;

/**
 * Why a preparer refused the check runs it was given, one reason per broken rule:
 * `absent` and `unreadable` ledger; `malformed` JSON or schema; `broken-chain` when a sequence
 * number, `previous` link or `head` seal disagrees with the runs; `foreign-authority` for a
 * recorder other than the expected {@link CheckRunAuthority}; `mismatched-candidate` for another
 * revision or tree identity; `missing-check` for a planned check with no run; `mismatched-check` for a run
 * whose id, order, argv or skip probe is not the planned one, or a run nobody planned;
 * `out-of-order` for a run that ends before it starts; `overlapping` for a run that starts before
 * the previous one ended; `missing-stream` and `stream-mismatch` for stream bytes that are absent
 * or are not the bytes the run's digest names.
 */
export type CheckRunRefusalReason =
  | 'absent'
  | 'unreadable'
  | 'malformed'
  | 'broken-chain'
  | 'foreign-authority'
  | 'mismatched-candidate'
  | 'missing-check'
  | 'mismatched-check'
  | 'out-of-order'
  | 'overlapping'
  | 'missing-stream'
  | 'stream-mismatch';

export class CheckRunRefusal extends Error {
  constructor(
    readonly reason: CheckRunRefusalReason,
    message: string,
    options?: ErrorOptions,
  ) {
    super(`check runs refused (${reason}): ${message}`, options);
    this.name = 'CheckRunRefusal';
  }
}

/** One check a preparer expects Dash to have run, with the skip probe it must run after a pass. */
export interface PlannedCheckRun {
  readonly checkId: string;
  readonly command: readonly string[];
  readonly skipProbe: SkipProbeInvocation | null;
}

/** The candidate every run must bind and the checks, in order, it must have run. */
export interface CheckRunPlan {
  readonly candidate: { readonly revision: string; readonly identity: string };
  readonly checks: readonly PlannedCheckRun[];
}

/** The identity the next run's `previous` and the ledger's `head` name. */
export function checkRunDigest(run: CheckRun): string {
  return hashCanonical(run);
}

/** Resolves every planned command's skip probe against the candidate's Nx projects. */
export function planCheckRuns(
  revision: string,
  plan: CheckPlan,
  projects: readonly { name: string; root: string }[],
): CheckRunPlan {
  return {
    candidate: { revision, identity: plan.candidateIdentity },
    checks: plan.checks.map((check) => ({
      checkId: check.checkId,
      command: check.command,
      skipProbe: resolveSkipProbe(check, projects) ?? null,
    })),
  };
}

function showCommitted(repository: string, revision: string, path: string): Uint8Array {
  const shown = Bun.spawnSync(['git', '-C', repository, 'show', `${revision}:${path}`], {
    stderr: 'pipe',
    stdout: 'pipe',
  });
  if (shown.exitCode !== 0) {
    throw new Error(`candidate file is absent at ${revision}: ${path}`);
  }
  return shown.stdout;
}

/**
 * The checks a candidate's committed policy selects, as Twilight Dash must run them: the same
 * derivation the preparers judge against ({@link planCandidateChecks}, {@link planCheckRuns}).
 * Reads the policy and its declarations at `revision` and the Nx projects from the checkout.
 * @throws {@link RelocationRefusal} `R15` for a check with no executable target or an unresolved
 * skip probe project, and `Error` for a file absent at `revision`.
 */
export function planCandidateCheckRuns(
  repository: string,
  revision: string,
  policyPath: string,
): CheckRunPlan {
  const policyBytes = showCommitted(repository, revision, policyPath);
  const declarations: CandidateFile[] = (
    readRelocationPolicy(policyBytes).relationshipRequest?.declarationPaths ?? []
  ).map((path) => ({ path, bytes: showCommitted(repository, revision, path) }));
  return planCheckRuns(
    revision,
    planCandidateChecks({
      policyBytes,
      declarations,
      tree: readCandidate(repository, { kind: 'committed', revision }),
    }),
    extractNxRelationships(repository).relationships.projects,
  );
}

function readLedger(directory: string): CheckRunLedger {
  const path = join(directory, checkRunLayout.ledger);
  let bytes: Uint8Array;
  try {
    bytes = readFileSync(path);
  } catch (cause) {
    // Proof (2026-10-12, through readCheckRuns, the function both preparers call): deleting the
    // `absent` branch failed `refuses an absent ledger and an unreadable one by name`, which
    // expected `absent` and received `unreadable`.
    const code = cause instanceof Error && 'code' in cause ? cause.code : undefined;
    if (code === 'ENOENT') throw new CheckRunRefusal('absent', path, { cause });
    throw new CheckRunRefusal('unreadable', path, { cause });
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch (cause) {
    throw new CheckRunRefusal('malformed', `${path} is not UTF-8 JSON`, { cause });
  }
  const ledger = CheckRunLedger(decoded);
  // Proof (2026-10-12, through readCheckRuns, the function both preparers call): skipping this
  // refusal failed `refuses a ledger that is not JSON or not the schema` on the run carrying an
  // undeclared `signature` key.
  if (ledger instanceof type.errors) {
    throw new CheckRunRefusal('malformed', `${path}: ${ledger.summary}`);
  }
  return ledger;
}

function assertChain(ledger: CheckRunLedger): void {
  ledger.runs.forEach((run, index) => {
    // Proof (2026-10-12, through readCheckRuns, the function both preparers call): disabling this
    // comparison failed `refuses a ledger whose chain or seal no longer covers its runs` on two
    // runs both numbered 0.
    if (run.sequence !== index) {
      throw new CheckRunRefusal(
        'broken-chain',
        `run ${run.checkId} is numbered ${String(run.sequence)} at position ${String(index)}`,
      );
    }
    const expected = index === 0 ? null : checkRunDigest(ledger.runs[index - 1]);
    // Proof (2026-10-12, through readCheckRuns, the function both preparers call): disabling this
    // comparison failed the same test on a first run whose exit code was edited from 3 to 0 after
    // the second run had chained to it.
    if (run.previous !== expected) {
      throw new CheckRunRefusal(
        'broken-chain',
        `run ${run.checkId} links ${String(run.previous)} but the run before it is ${String(expected)}`,
      );
    }
  });
  const last = ledger.runs.at(-1);
  const head = last === undefined ? null : checkRunDigest(last);
  // Proof (2026-10-12, through readCheckRuns, the function both preparers call): disabling this
  // comparison failed the same test on a last run whose exit code was edited after sealing.
  if (ledger.head !== head) {
    throw new CheckRunRefusal(
      'broken-chain',
      `ledger head ${String(ledger.head)} does not seal its last run ${String(head)}`,
    );
  }
}

function sameArgv(left: readonly string[], right: readonly string[]): boolean {
  return serializeCanonical(left) === serializeCanonical(right);
}

function assertPlanned(run: CheckRun, planned: PlannedCheckRun): void {
  // Proof (2026-10-12, through readCheckRuns, the function both preparers call): disabling this
  // comparison failed `refuses a planned check with no run and runs that are not the planned ones`
  // on a run of `check.other`.
  if (run.checkId !== planned.checkId) {
    throw new CheckRunRefusal(
      'mismatched-check',
      `run ${String(run.sequence)} is ${run.checkId}, the plan runs ${planned.checkId} there`,
    );
  }
  // Proof (2026-10-12, through readCheckRuns, the function both preparers call): disabling this
  // comparison failed the same test on a run of `true`.
  if (!sameArgv(run.check.command, planned.command)) {
    throw new CheckRunRefusal(
      'mismatched-check',
      `${run.checkId} ran ${JSON.stringify(run.check.command)}, the plan runs ${JSON.stringify(planned.command)}`,
    );
  }
  // A failed check proves its failure on its own; Dash probes only a passing one.
  const probeRequired = planned.skipProbe !== null && run.check.exitCode === 0;
  if (!probeRequired) {
    // Proof (2026-10-12, through readCheckRuns, the function both preparers call): disabling this
    // check failed `refuses a passing check whose skip probe was skipped, unplanned or moved` on a
    // probe the plan gives `check.first` none.
    if (run.skipProbe !== null) {
      throw new CheckRunRefusal(
        'mismatched-check',
        `${run.checkId} ran a skip probe nobody planned`,
      );
    }
    return;
  }
  const probe = run.skipProbe;
  // Proof (2026-10-12, through readCheckRuns, the function both preparers call): returning here
  // instead failed the same test on a passing `bun test` check whose skip probe was never run, so
  // its skipped tests would have gone unmeasured.
  if (probe === null) {
    throw new CheckRunRefusal('mismatched-check', `${run.checkId} passed without its skip probe`);
  }
  // Proof (2026-10-12, through readCheckRuns, the function both preparers call): disabling this
  // comparison failed the same test on a probe run from `.` instead of the declared directory, with
  // another argv, and with another environment.
  if (
    !sameArgv(probe.command, planned.skipProbe.command) ||
    probe.cwd !== planned.skipProbe.cwd ||
    serializeCanonical(probe.env) !== serializeCanonical(planned.skipProbe.env)
  ) {
    throw new CheckRunRefusal(
      'mismatched-check',
      `${run.checkId} ran a skip probe other than the planned one`,
    );
  }
}

function assertInstants(runs: readonly CheckRun[]): void {
  runs.forEach((run, index) => {
    const started = Date.parse(run.startedAt);
    const ended = Date.parse(run.endedAt);
    // Proof (2026-10-12, through readCheckRuns, the function both preparers call): disabling this
    // comparison failed `a run may end at the instant it starts, never before` on a run ending 1 ms
    // before it started; `<=` failed it on the run ending at its start instant.
    if (ended < started) {
      throw new CheckRunRefusal(
        'out-of-order',
        `${run.checkId} ended at ${run.endedAt} before it started at ${run.startedAt}`,
      );
    }
    const before = index === 0 ? undefined : runs[index - 1];
    // Proof (2026-10-12, through readCheckRuns, the function both preparers call): disabling this
    // comparison failed `a run may start at the instant the previous one ended, never before` on a
    // start 1 ms early; `<=` failed it, and every test of back-to-back runs, on a start at that
    // instant.
    if (before !== undefined && started < Date.parse(before.endedAt)) {
      throw new CheckRunRefusal(
        'overlapping',
        `${run.checkId} started at ${run.startedAt} before ${before.checkId} ended at ${before.endedAt}`,
      );
    }
  });
}

function readStream(directory: string, digest: string, subject: string): Uint8Array {
  const path = join(directory, checkRunLayout.streams, digest);
  let bytes: Uint8Array;
  try {
    bytes = readFileSync(path);
  } catch (cause) {
    throw new CheckRunRefusal('missing-stream', `${subject}: ${path}`, { cause });
  }
  // Proof (2026-10-12, through readCheckRuns, the function both preparers call): disabling this
  // comparison failed `refuses a stream that is absent or is not the bytes its digest names` on
  // stdout edited after recording.
  if (hashBytes(bytes) !== digest) {
    throw new CheckRunRefusal(
      'stream-mismatch',
      `${subject}: ${path} hashes to ${hashBytes(bytes)}`,
    );
  }
  return bytes;
}

/** A judged check run before the preparer retains its streams under `--work`. */
export type JudgedCheckRun = Omit<RecordedCheck, 'stdoutPath' | 'stderrPath'>;

/**
 * Reads the ledger Twilight Dash wrote into `directory` and judges it against `plan`: the chain
 * must be intact, every run must name `authority` (the preparers pass
 * `policy/check-run-authority.ts`; this module never names its recorder), bind the planned
 * candidate and be the planned check in the planned order, and the recorded instants must not run backwards or overlap. Instants are
 * only compared with each other; no clock is read. Returns the runs with their stream bytes, in
 * the shape the receipts are derived from: `stdout`/`stderr` concatenate check and probe, and
 * `measured` is the probe's streams when one ran.
 * @throws {@link CheckRunRefusal} for each {@link CheckRunRefusalReason}.
 */
export function readCheckRuns(
  directory: string,
  plan: CheckRunPlan,
  authority: CheckRunAuthority,
): JudgedCheckRun[] {
  const ledger = readLedger(directory);
  assertChain(ledger);
  for (const run of ledger.runs) {
    // Proof (2026-10-12, through readCheckRuns, the function both preparers call): disabling this
    // comparison failed `refuses runs another recorder wrote` on `product: "hand-written"`.
    if (
      run.authority.product !== authority.product ||
      run.authority.command !== authority.command
    ) {
      throw new CheckRunRefusal(
        'foreign-authority',
        `${run.checkId} was recorded by ${run.authority.product} ${run.authority.command}`,
      );
    }
    // Proof (2026-10-12, through readCheckRuns, the function both preparers call): disabling this
    // comparison failed `refuses runs of another revision or another tree`.
    if (
      run.candidate.revision !== plan.candidate.revision ||
      run.candidate.identity !== plan.candidate.identity
    ) {
      throw new CheckRunRefusal(
        'mismatched-candidate',
        `${run.checkId} ran ${run.candidate.revision} (${run.candidate.identity}), the candidate is ${plan.candidate.revision} (${plan.candidate.identity})`,
      );
    }
  }
  plan.checks.forEach((planned, index) => {
    const run = ledger.runs.at(index);
    // Proof (2026-10-12, through readCheckRuns, the function both preparers call): returning here
    // instead failed `refuses a planned check with no run and runs that are not the planned ones`
    // on a truncated, re-sealed ledger.
    if (run === undefined) {
      throw new CheckRunRefusal('missing-check', `no run of ${planned.checkId}`);
    }
    assertPlanned(run, planned);
  });
  const unplanned = ledger.runs.slice(plan.checks.length);
  // Proof (2026-10-12, through readCheckRuns, the function both preparers call): disabling this
  // check failed the same test on an unplanned third run.
  if (unplanned.length > 0) {
    throw new CheckRunRefusal(
      'mismatched-check',
      `runs nobody planned: ${unplanned.map((run) => run.checkId).join(', ')}`,
    );
  }
  assertInstants(ledger.runs);
  return ledger.runs.map((run) => {
    const check = {
      stdout: readStream(directory, run.check.stdout, `${run.checkId} stdout`),
      stderr: readStream(directory, run.check.stderr, `${run.checkId} stderr`),
    };
    const probe =
      run.skipProbe === null
        ? undefined
        : {
            stdout: readStream(directory, run.skipProbe.stdout, `${run.checkId} probe stdout`),
            stderr: readStream(directory, run.skipProbe.stderr, `${run.checkId} probe stderr`),
          };
    return {
      checkId: run.checkId,
      command: [...run.check.command],
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      exitCode: run.skipProbe?.exitCode ?? run.check.exitCode,
      stdout: Buffer.concat([check.stdout, probe?.stdout ?? new Uint8Array()]),
      stderr: Buffer.concat([check.stderr, probe?.stderr ?? new Uint8Array()]),
      measured: probe ?? check,
    };
  });
}

/** Retains each judged run's streams under `<work>/checks/`, where refusals point the operator. */
export function retainCheckRuns(runs: readonly JudgedCheckRun[], work: string): RecordedCheck[] {
  return runs.map((run) => ({
    ...run,
    stdoutPath: writeBytes(join(work, 'checks', `${run.checkId}.stdout`), run.stdout),
    stderrPath: writeBytes(join(work, 'checks', `${run.checkId}.stderr`), run.stderr),
  }));
}
