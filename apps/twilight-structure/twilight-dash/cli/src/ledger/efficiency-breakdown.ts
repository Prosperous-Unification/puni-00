import type { AcceptedOutcome } from './accepted-outcomes';
import { attributeRow, type UnattributedReason } from './attribution';
import {
  addTokens,
  emptyTokens,
  type HarnessUsage,
  type HarnessUsageRow,
  type UsagePeriod,
  type UsageTokens,
} from './harness-usage';
import { type LoadedRateCard, priceTokens, type UnpricedReason } from './rate-card';

export interface OutcomeCharge {
  readonly pullRequest: number | null;
  readonly headBranch: string | null;
  readonly memberBranches: readonly string[];
  readonly nestedPullRequests: readonly number[];
  readonly mergedAt: string;
  readonly mergeSha: string;
  readonly subject: string;
  readonly micros: number;
  readonly tokens: UsageTokens;
  readonly rows: number;
  readonly sessions: readonly string[];
  readonly harnesses: readonly string[];
  readonly models: readonly string[];
  readonly rules: { readonly 'pull-request-reference': number; readonly branch: number };
}

export interface UnpricedGroup {
  readonly harness: string;
  readonly model: string;
  readonly reason: UnpricedReason;
  readonly rows: number;
  readonly tokens: UsageTokens;
}

export interface HarnessModelTotal {
  readonly harness: string;
  readonly model: string;
  readonly rows: number;
  readonly tokens: UsageTokens;
  readonly micros: number | null;
}

/** The reconciled explanation of the period's cost per accepted outcome (CONTEXT.md). */
export interface EfficiencyBreakdown {
  readonly schemaVersion: 1;
  readonly period: UsagePeriod;
  readonly repository: string;
  readonly currency: string;
  readonly rateCardDigest: string;
  readonly acceptedOutcomes: number;
  readonly pricedMicros: number;
  readonly attributedMicros: number;
  /** Attributed over priced, four decimals; null when nothing was priced. */
  readonly coverage: number | null;
  /** Priced micros over accepted outcomes; null when the period accepted nothing. */
  readonly blendedMicrosPerOutcome: number | null;
  readonly unattributedMicrosByReason: Readonly<Record<UnattributedReason, number>>;
  readonly unpriced: readonly UnpricedGroup[];
  readonly byHarnessModel: readonly HarnessModelTotal[];
  readonly outcomes: readonly OutcomeCharge[];
  readonly rows: number;
  /** Transcript lines skipped as unparseable; a non-zero count is a stated gap in the evidence. */
  readonly unreadableLines: number;
}

interface MutableCharge {
  micros: number;
  tokens: UsageTokens;
  rows: number;
  sessions: Set<string>;
  harnesses: Set<string>;
  models: Set<string>;
  rules: { 'pull-request-reference': number; branch: number };
}

function sorted(values: Set<string>): string[] {
  return [...values].sort();
}

/** Prices and attributes every row and folds the result into one breakdown. Pure. */
export function buildEfficiencyBreakdown(input: {
  readonly usage: HarnessUsage;
  readonly outcomes: readonly AcceptedOutcome[];
  readonly rateCard: LoadedRateCard;
  readonly period: UsagePeriod;
  readonly repository: string;
}): EfficiencyBreakdown {
  const sessions = new Map(
    input.usage.sessions.map((facts) => [`${facts.harness}:${facts.sessionId}`, facts]),
  );
  const charges = new Map<string, MutableCharge>();
  for (const outcome of input.outcomes) {
    charges.set(outcome.mergeSha, {
      micros: 0,
      tokens: emptyTokens(),
      rows: 0,
      sessions: new Set(),
      harnesses: new Set(),
      models: new Set(),
      rules: { 'pull-request-reference': 0, branch: 0 },
    });
  }
  const unattributed: Record<UnattributedReason, number> = {
    'on-default-branch': 0,
    'no-branch': 0,
    'branch-not-accepted': 0,
    'ambiguous-references': 0,
  };
  const unpriced = new Map<
    string,
    { harness: string; model: string; reason: UnpricedReason; rows: number; tokens: UsageTokens }
  >();
  const byHarnessModel = new Map<
    string,
    { harness: string; model: string; rows: number; tokens: UsageTokens; micros: number | null }
  >();
  let pricedMicros = 0;
  let attributedMicros = 0;
  const fold = (row: HarnessUsageRow, micros: number | null) => {
    const key = `${row.harness}:${row.model}`;
    const total = byHarnessModel.get(key) ?? {
      harness: row.harness,
      model: row.model,
      rows: 0,
      tokens: emptyTokens(),
      micros: 0,
    };
    total.rows += 1;
    addTokens(total.tokens, row.tokens);
    total.micros = micros === null || total.micros === null ? null : total.micros + micros;
    byHarnessModel.set(key, total);
  };
  for (const row of input.usage.rows) {
    const priced = priceTokens(input.rateCard.card, row.model, row.tokens);
    if (priced.kind === 'unpriced') {
      const key = `${row.harness}:${row.model}:${priced.reason}`;
      const group = unpriced.get(key) ?? {
        harness: row.harness,
        model: row.model,
        reason: priced.reason,
        rows: 0,
        tokens: emptyTokens(),
      };
      group.rows += 1;
      addTokens(group.tokens, row.tokens);
      unpriced.set(key, group);
      fold(row, null);
      continue;
    }
    pricedMicros += priced.micros;
    fold(row, priced.micros);
    const attribution = attributeRow(
      row,
      sessions.get(`${row.harness}:${row.sessionId}`),
      input.outcomes,
    );
    if (attribution.kind === 'unattributed') {
      unattributed[attribution.reason] += priced.micros;
      continue;
    }
    const charge = charges.get(attribution.mergeSha);
    if (charge === undefined)
      throw new Error(`attribution named an unknown outcome: ${attribution.mergeSha}`);
    attributedMicros += priced.micros;
    charge.micros += priced.micros;
    addTokens(charge.tokens, row.tokens);
    charge.rows += 1;
    charge.sessions.add(row.sessionId);
    charge.harnesses.add(row.harness);
    charge.models.add(row.model);
    charge.rules[attribution.rule] += 1;
  }
  const outcomes: OutcomeCharge[] = input.outcomes.map((outcome) => {
    const charge = charges.get(outcome.mergeSha);
    if (charge === undefined) throw new Error(`outcome without a charge: ${outcome.mergeSha}`);
    return {
      pullRequest: outcome.pullRequest,
      headBranch: outcome.headBranch,
      memberBranches: outcome.memberBranches,
      nestedPullRequests: outcome.nestedPullRequests,
      mergedAt: outcome.mergedAt,
      mergeSha: outcome.mergeSha,
      subject: outcome.subject,
      micros: charge.micros,
      tokens: charge.tokens,
      rows: charge.rows,
      sessions: sorted(charge.sessions),
      harnesses: sorted(charge.harnesses),
      models: sorted(charge.models),
      rules: charge.rules,
    };
  });
  const count = input.outcomes.length;
  return {
    schemaVersion: 1,
    period: input.period,
    repository: input.repository,
    currency: input.rateCard.card.currency,
    rateCardDigest: input.rateCard.digest,
    acceptedOutcomes: count,
    pricedMicros,
    attributedMicros,
    coverage:
      pricedMicros === 0 ? null : Math.round((attributedMicros / pricedMicros) * 10000) / 10000,
    blendedMicrosPerOutcome: count === 0 ? null : Math.round(pricedMicros / count),
    unattributedMicrosByReason: unattributed,
    unpriced: [...unpriced.values()].sort((left, right) => (left.model < right.model ? -1 : 1)),
    byHarnessModel: [...byHarnessModel.values()].sort((left, right) =>
      `${left.harness}:${left.model}` < `${right.harness}:${right.model}` ? -1 : 1,
    ),
    outcomes,
    rows: input.usage.rows.length,
    unreadableLines: input.usage.unreadableLines.length,
  };
}

function money(micros: number | null, currency: string): string {
  if (micros === null) return 'n/a';
  return `${(micros / 1_000_000).toFixed(2)} ${currency}`;
}

function tokenCells(tokens: UsageTokens): string {
  return [
    tokens.input,
    tokens.cacheWrite,
    tokens.cacheWriteExtended,
    tokens.cacheRead,
    tokens.output,
  ]
    .map((value) => value.toLocaleString('en-US'))
    .join(' | ');
}

/** Markdown an operator can hand over: headline figures, the remainder, then every outcome. */
export function renderEfficiencyBreakdown(breakdown: EfficiencyBreakdown): string {
  const lines: string[] = [];
  const currency = breakdown.currency;
  lines.push(`# Efficiency breakdown ${breakdown.period.since} to ${breakdown.period.until}`, '');
  lines.push(
    `Repository \`${breakdown.repository}\`; rate card \`${breakdown.rateCardDigest.slice(0, 12)}\`; ${String(breakdown.rows)} usage rows.`,
    '',
  );
  lines.push('| Figure | Value |', '| --- | --- |');
  lines.push(`| Accepted outcomes | ${String(breakdown.acceptedOutcomes)} |`);
  lines.push(`| Priced cost, API-equivalent | ${money(breakdown.pricedMicros, currency)} |`);
  lines.push(
    `| Blended cost per accepted outcome | ${money(breakdown.blendedMicrosPerOutcome, currency)} |`,
  );
  lines.push(`| Attributed cost | ${money(breakdown.attributedMicros, currency)} |`);
  lines.push(
    `| Coverage | ${breakdown.coverage === null ? 'n/a' : `${(breakdown.coverage * 100).toFixed(1)}%`} |`,
  );
  for (const [reason, micros] of Object.entries(breakdown.unattributedMicrosByReason)) {
    lines.push(`| Unattributed, ${reason} | ${money(micros, currency)} |`);
  }
  lines.push('');
  lines.push('## Unpriced usage', '');
  if (breakdown.unpriced.length === 0) lines.push('None.', '');
  else {
    lines.push(
      '| Harness | Model | Reason | Rows | Input | Cache write | Cache write ext. | Cache read | Output |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    );
    for (const group of breakdown.unpriced) {
      lines.push(
        `| ${group.harness} | ${group.model} | ${group.reason} | ${String(group.rows)} | ${tokenCells(group.tokens)} |`,
      );
    }
    lines.push('');
  }
  lines.push('## By harness and model', '');
  lines.push(
    '| Harness | Model | Rows | Cost | Input | Cache write | Cache write ext. | Cache read | Output |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  );
  for (const total of breakdown.byHarnessModel) {
    lines.push(
      `| ${total.harness} | ${total.model} | ${String(total.rows)} | ${total.micros === null ? 'unpriced' : money(total.micros, currency)} | ${tokenCells(total.tokens)} |`,
    );
  }
  lines.push('');
  lines.push('## Accepted outcomes', '');
  lines.push(
    '| Merged | PR | Branch | Cost | Rows | Sessions | Models |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  );
  for (const outcome of [...breakdown.outcomes].sort((left, right) => right.micros - left.micros)) {
    lines.push(
      `| ${outcome.mergedAt.slice(0, 16)} | ${outcome.pullRequest === null ? '-' : String(outcome.pullRequest)} | ${outcome.headBranch ?? '-'} | ${money(outcome.micros, currency)} | ${String(outcome.rows)} | ${String(outcome.sessions.length)} | ${outcome.models.join(', ')} |`,
    );
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}
