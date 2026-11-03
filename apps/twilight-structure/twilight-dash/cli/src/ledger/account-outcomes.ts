import { closeSync, mkdirSync, openSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { canonicalJson } from '@twilight-burokrat/contracts';

import type { DashRequest } from '../cli-parser';
import { listAcceptedOutcomes, readRepositorySlug } from './accepted-outcomes';
import { buildEfficiencyBreakdown, renderEfficiencyBreakdown } from './efficiency-breakdown';
import { importHarnessUsage } from './harness-usage';
import { loadRateCard } from './rate-card';

/** Creates one new owner-only file; a write or close failure removes only that file. */
function publish(path: string, bytes: string): void {
  let descriptor: number;
  try {
    descriptor = openSync(path, 'wx', 0o600);
  } catch (cause) {
    throw new Error(`cannot create breakdown file: ${JSON.stringify(path)}`, { cause });
  }
  let closed = false;
  try {
    writeFileSync(descriptor, bytes, 'utf8');
    closed = true;
    closeSync(descriptor);
  } catch (cause) {
    if (!closed) closeSync(descriptor);
    unlinkSync(path);
    throw new Error(`cannot publish breakdown file: ${JSON.stringify(path)}`, { cause });
  }
}

/**
 * Turns one period's harness logs, the repository's merge history and a rate card into an
 * efficiency breakdown: `harness-usage.json`, `efficiency-breakdown.json` and
 * `efficiency-breakdown.md` in a new output directory, then one summary line. Dash reads no
 * clock here; the period is the caller's statement, its bounds and order checked by
 * `cli-parser.ts` before this runs.
 *
 * @throws on an existing output path, an absent or malformed input, or a repository without
 * `main` or an `origin` on GitHub. Nothing is written before every input has been read and
 * folded.
 */
export function accountOutcomes(
  request: DashRequest<'account-outcomes'>,
  write: (text: string) => unknown,
): void {
  const { output, repository } = request;
  const period = { since: request.since, until: request.until };
  const rateCard = loadRateCard(request.rateCard);
  const slug = readRepositorySlug(repository);
  const outcomes = listAcceptedOutcomes(repository, period);
  const usage = importHarnessUsage({
    claudeProjects: request.claudeProjects,
    codexSessions: request.codexSessions,
    period,
    repositorySlug: slug,
  });
  const breakdown = buildEfficiencyBreakdown({
    usage,
    outcomes,
    rateCard,
    period,
    repository: slug,
  });
  try {
    // Proof: `recursive: true` here overwrote into an existing directory and failed
    // `the output already exists` (2026-10-22).
    mkdirSync(output, { mode: 0o700 });
  } catch (cause) {
    throw new Error(
      `output directory must be new inside an existing parent: ${JSON.stringify(output)}`,
      { cause },
    );
  }
  publish(join(output, 'harness-usage.json'), `${canonicalJson({ schemaVersion: 1, ...usage })}\n`);
  publish(join(output, 'efficiency-breakdown.json'), `${canonicalJson(breakdown)}\n`);
  publish(join(output, 'efficiency-breakdown.md'), renderEfficiencyBreakdown(breakdown));
  const unpricedRows = breakdown.unpriced.reduce((sum, group) => sum + group.rows, 0);
  const blended = breakdown.blendedMicrosPerOutcome;
  const priced = `${(breakdown.pricedMicros / 1e6).toFixed(2)} ${breakdown.currency}`;
  const perOutcome =
    blended === null ? 'n/a' : `${(blended / 1e6).toFixed(2)} ${breakdown.currency}`;
  const coverage =
    breakdown.coverage === null ? 'n/a' : `${(breakdown.coverage * 100).toFixed(1)}%`;
  write(
    `account-outcomes: ${String(breakdown.acceptedOutcomes)} accepted outcomes, priced ${priced}, blended ${perOutcome} per outcome, coverage ${coverage}, unpriced rows ${String(unpricedRows)}\n`,
  );
}
