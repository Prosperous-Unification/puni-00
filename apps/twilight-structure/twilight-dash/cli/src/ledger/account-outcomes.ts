import { closeSync, mkdirSync, openSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { canonicalJson } from '@twilight-burokrat/contracts';

import { listAcceptedOutcomes, readRepositorySlug } from './accepted-outcomes';
import { buildEfficiencyBreakdown, renderEfficiencyBreakdown } from './efficiency-breakdown';
import { importHarnessUsage } from './harness-usage';
import { loadRateCard } from './rate-card';

const singleFlags = ['--repository', '--since', '--until', '--rate-card', '--output'] as const;
const repeatedFlags = ['--claude-projects', '--codex-sessions'] as const;
type SingleFlag = (typeof singleFlags)[number];
type RepeatedFlag = (typeof repeatedFlags)[number];

export const usage =
  'usage: dash account-outcomes --repository <path> --since <instant> --until <instant> --rate-card <path> --output <new-dir> [--claude-projects <dir>]... [--codex-sessions <dir>]...';

interface Invocation {
  readonly single: (flag: SingleFlag) => string;
  readonly repeated: (flag: RepeatedFlag) => readonly string[];
}

const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/** The whole grammar is resolved before any directory, repository or card is touched. */
function parseInvocation(argv: readonly string[]): Invocation {
  const single = new Map<SingleFlag, string>();
  const repeated = new Map<RepeatedFlag, string[]>();
  for (let position = 0; position < argv.length; position += 2) {
    const flag = argv.at(position);
    const value = argv.at(position + 1);
    // Proof: removing value rejection let `--output` swallow the next flag in
    // `a valueless flag refuses before reading` (2026-10-22).
    if (
      flag === undefined ||
      value === undefined ||
      value.trim().length === 0 ||
      value.startsWith('--')
    ) {
      throw new Error(usage);
    }
    if ((singleFlags as readonly string[]).includes(flag)) {
      // Proof: removing duplicate rejection let the second `--since` win silently.
      if (single.has(flag as SingleFlag)) throw new Error(usage);
      single.set(flag as SingleFlag, value);
      continue;
    }
    if ((repeatedFlags as readonly string[]).includes(flag)) {
      repeated.set(flag as RepeatedFlag, [...(repeated.get(flag as RepeatedFlag) ?? []), value]);
      continue;
    }
    // Proof: removing the allowlist reached the repository with an unknown flag in
    // `unknown flags refuse before reading`.
    throw new Error(usage);
  }
  for (const flag of singleFlags) if (!single.has(flag)) throw new Error(usage);
  if (
    (repeated.get('--claude-projects')?.length ?? 0) +
      (repeated.get('--codex-sessions')?.length ?? 0) ===
    0
  ) {
    throw new Error(usage);
  }
  const since = requireFlag(single, '--since');
  const until = requireFlag(single, '--until');
  if (!INSTANT.test(since) || !INSTANT.test(until)) {
    throw new Error('period bounds must be UTC instants like 2026-10-15T00:00:00Z');
  }
  // Proof: dropping this check made an empty period print a breakdown of nothing.
  if (!(until > since)) throw new Error('--until must be after --since');
  return {
    single: (flag) => requireFlag(single, flag),
    repeated: (flag) => repeated.get(flag) ?? [],
  };
}

function requireFlag(values: ReadonlyMap<SingleFlag, string>, flag: SingleFlag): string {
  const value = values.get(flag);
  if (value === undefined) throw new Error(usage);
  return value;
}

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
 * clock here; the period is the caller's statement.
 *
 * @throws on invalid invocation, an existing output path, an absent or malformed input, or a
 * repository without `main` or an `origin` on GitHub. Nothing is written before every input
 * has been read and folded.
 */
export function accountOutcomes(argv: readonly string[], write: (text: string) => unknown): void {
  const invocation = parseInvocation(argv);
  const output = invocation.single('--output');
  const repository = invocation.single('--repository');
  const period = { since: invocation.single('--since'), until: invocation.single('--until') };
  const rateCard = loadRateCard(invocation.single('--rate-card'));
  const slug = readRepositorySlug(repository);
  const outcomes = listAcceptedOutcomes(repository, period);
  const usage = importHarnessUsage({
    claudeProjects: invocation.repeated('--claude-projects'),
    codexSessions: invocation.repeated('--codex-sessions'),
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
