import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { CheckRun, CheckRunLedger } from '../contracts/records';
import { hashBytes, serializeCanonical } from '../evidence/content-manifest';
import { dashCheckRunAuthority } from './check-run-authority';
import {
  checkRunDigest,
  checkRunLayout,
  type CheckRunPlan,
  planCandidateCheckRuns,
} from './check-runs';

/**
 * `fixtures/check-runs/`: ledgers `twilight-dash run-activation-checks` wrote for the reproducible
 * relocation candidate (`createRelocationCandidate({ reproducible: true })`), whose check passes,
 * and for its `skippingCheck` variant, whose `bun test` probe reports one skip. The packed-package
 * suite prepares from them; `check-run-golden.test.ts` pins their bytes.
 */
export const goldenCheckRuns = {
  passing: join(import.meta.dir, '../../fixtures/check-runs/passing'),
  skipping: join(import.meta.dir, '../../fixtures/check-runs/skipping'),
} as const;

/** What one recorded process printed and how it exited. */
export interface RecordedStreams {
  readonly exitCode?: number;
  readonly stdout?: string;
  readonly stderr?: string;
}

/** A judge test's stand-in for what Dash measured for one check. */
export interface RecordedOutcome extends RecordedStreams {
  /** The probe's streams; `null` records no probe even where the plan has one. */
  readonly probe?: RecordedStreams | null;
}

export interface LedgerOptions {
  /** Per check id; a check absent here passes and prints `fixture check passed`. */
  readonly outcomes?: Readonly<Record<string, RecordedOutcome>>;
  /** The first run's start; each run lasts one second and the next starts when it ends. */
  readonly startedAt?: string;
  /** Rewrites the runs before the chain is sealed, so a test breaks exactly one rule. */
  readonly editRuns?: (runs: CheckRun[]) => CheckRun[];
}

/** Recomputes every `sequence`, `previous` link and the `head` seal over `runs` as given. */
export function sealCheckRuns(runs: readonly CheckRun[]): CheckRunLedger {
  const sealed: CheckRun[] = [];
  for (const [index, run] of runs.entries()) {
    const before = sealed.at(-1);
    sealed.push({
      ...run,
      sequence: index,
      previous: before === undefined ? null : checkRunDigest(before),
    });
  }
  const last = sealed.at(-1);
  return {
    schemaVersion: 1,
    recordKind: 'check-run-ledger',
    runs: sealed,
    head: last === undefined ? null : checkRunDigest(last),
  };
}

/**
 * Builds the ledger Twilight Dash would write for `plan` from fixed instants and the given
 * outcomes, without running anything: the judge's tests supply what Dash measured. Every stream is
 * written under `streams/` by digest, and the ledger last, exactly as Dash lays a directory out.
 */
export function writeCheckRunLedger(
  directory: string,
  plan: CheckRunPlan,
  options: LedgerOptions = {},
): CheckRunLedger {
  const streams = join(directory, checkRunLayout.streams);
  mkdirSync(streams, { recursive: true });
  const store = (text: string): string => {
    const digest = hashBytes(text);
    writeFileSync(join(streams, digest), text);
    return digest;
  };
  let instant = Date.parse(options.startedAt ?? '2026-10-12T08:00:00.000Z');
  const runs = plan.checks.map((planned, index): CheckRun => {
    const outcome = options.outcomes?.[planned.checkId] ?? {};
    const exitCode = outcome.exitCode ?? 0;
    const probe =
      outcome.probe === null || planned.skipProbe === null || exitCode !== 0
        ? null
        : {
            command: [...planned.skipProbe.command],
            cwd: planned.skipProbe.cwd,
            env: { ...planned.skipProbe.env },
            exitCode: outcome.probe?.exitCode ?? 0,
            stdout: store(outcome.probe?.stdout ?? ' 1 pass\n 0 fail\n'),
            stderr: store(outcome.probe?.stderr ?? ''),
          };
    const startedAt = new Date(instant).toISOString();
    instant += 1000;
    return {
      schemaVersion: 1,
      recordKind: 'check-run',
      sequence: index,
      previous: null,
      authority: { ...dashCheckRunAuthority },
      candidate: { ...plan.candidate },
      checkId: planned.checkId,
      startedAt,
      endedAt: new Date(instant).toISOString(),
      check: {
        command: [...planned.command],
        exitCode,
        stdout: store(outcome.stdout ?? 'fixture check passed\n'),
        stderr: store(outcome.stderr ?? ''),
      },
      skipProbe: probe,
    };
  });
  const ledger = sealCheckRuns(options.editRuns === undefined ? runs : options.editRuns(runs));
  writeFileSync(join(directory, checkRunLayout.ledger), serializeCanonical(ledger));
  return ledger;
}

/** Plans `revision`'s checks the way Dash does and writes their ledger into `directory`. */
export function writeCandidateCheckRuns(
  directory: string,
  candidate: { repository: string; revision: string; policyPath: string },
  options: LedgerOptions = {},
): CheckRunLedger {
  return writeCheckRunLedger(
    directory,
    planCandidateCheckRuns(candidate.repository, candidate.revision, candidate.policyPath),
    options,
  );
}
