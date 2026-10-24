import type { Attempt } from './attempt';
import { type MeasureDefinition, SEEDED_MEASURE_DEFINITIONS } from './measure-definition';
import type { StoredMeasure } from './step-values';
import { MEASURE_METRICS, type MeasureMetric } from './stored-vocabularies';

/**
 * The legacy metric each pre-definition fact key is stored and answered under
 * for one release (`wbs-measure-budgets` D4, design D18): blue and green share
 * one SQLite file, one command journal and one export shape, and the outgoing
 * release reads only these names. `token_estimate` is absent: it is an
 * estimate, not a fact, and slice 3 turns it into a single-point trio.
 */
export const LEGACY_FACT_METRICS = {
  tokens: 'token_actual',
  hours: 'hours_actual',
} as const satisfies Record<string, MeasureMetric>;

/** The metric a fact on `key` is addressed by: the legacy name for `tokens` and `hours`, else the key. */
export function factMetricOf(key: string): string {
  if (key === 'tokens') return LEGACY_FACT_METRICS.tokens;
  if (key === 'hours') return LEGACY_FACT_METRICS.hours;
  return key;
}

/** Whether `metric` is one of the three names the `step_measure.metric` column holds. */
export function isLegacyMetric(metric: string): metric is MeasureMetric {
  return (MEASURE_METRICS as readonly string[]).includes(metric);
}

/**
 * The measure definition key a stored or requested metric names: `tokens` for
 * `token_actual`, `hours` for `hours_actual`, null for `token_estimate` (an
 * estimate, keyed by no definition until slice 3), and the metric itself
 * otherwise.
 */
export function definitionKeyOf(metric: string): string | null {
  if (metric === LEGACY_FACT_METRICS.tokens) return 'tokens';
  if (metric === LEGACY_FACT_METRICS.hours) return 'hours';
  if (metric === 'token_estimate') return null;
  return metric;
}

/**
 * The definitions a project owned by no organization answers facts against:
 * the seeded `tokens` and `hours`, the two facts that existed before
 * definitions did, the derived `agent_minutes`, which its row read shows all
 * the same, and the scheduling measure `time`, whose days it records with
 * `setActual` (design D19). Such a project holds no `measure` rows, so any
 * other key is unknown there.
 */
const UNOWNED_PROJECT_DEFINITIONS: readonly MeasureDefinition[] = SEEDED_MEASURE_DEFINITIONS.filter(
  (each) => ['time', 'tokens', 'hours', 'agent_minutes'].includes(each.key),
).map((each) => ({ ...each, id: `unowned:${each.key}` }));

/**
 * The definitions a figure in a project is decided against: its organization's
 * `definitions`, or, when no organization owns the project (null), the seeded
 * four an unowned project answers (design D19).
 */
export function definitionsOrUnowned(
  definitions: readonly MeasureDefinition[] | null,
): readonly MeasureDefinition[] {
  return definitions ?? UNOWNED_PROJECT_DEFINITIONS;
}

/**
 * Why a fact cannot be written or cleared in a measure (`wbs-measure-budgets`
 * D4, spec "Estimates and facts exist per measure"):
 *
 * - `unknown_measure` (404): the key names no definition of the project's
 *   organization;
 * - `derived_measure` (409): the definition is computed on read
 *   (`agent_minutes`), so nobody types it;
 * - `scheduling_measure_fact` (409): the definition schedules work (`time`),
 *   whose fact is the actual days recorded with `setActual`; a second fact
 *   here would be a second truth beside `actual.days`;
 * - `scale_mismatch` (409): a fraction on an integer-scale definition.
 */
export type MeasureFactRefusal =
  'unknown_measure' | 'derived_measure' | 'scheduling_measure_fact' | 'scale_mismatch';

/** {@link decideMeasureFact}'s answer: the metric to store and journal under, or why not. */
export type MeasureFactDecision =
  { ok: true; metric: string } | { ok: false; reason: MeasureFactRefusal };

/**
 * Whether a fact in `requested` may be written with `value`, or cleared when
 * `value` is null, on a project whose organization holds `definitions` (null
 * when no organization owns the project). Checked in the order unknown,
 * derived, scheduling, scale, so one request answers one reason.
 *
 * `requested` may be a definition key or a legacy name: `token_actual` and
 * `hours_actual` are aliases of `tokens` and `hours` for one release, and the
 * answer's `metric` is always the legacy name for those two
 * ({@link factMetricOf}). `token_estimate` passes unchecked, exactly as before
 * definitions existed.
 */
export function decideMeasureFact(
  definitions: readonly MeasureDefinition[] | null,
  requested: string,
  value: number | null,
): MeasureFactDecision {
  if (requested === 'token_estimate') return { ok: true, metric: requested };
  const key = definitionKeyOf(requested);
  const definition = definitionsOrUnowned(definitions).find((each) => each.key === key);
  // Proof: with this lookup falling back to `cost`, `refuses a key the
  // organization does not define` (measure-fact.test.ts) accepted the key;
  // watched 2026-10-24.
  if (definition === undefined) return { ok: false, reason: 'unknown_measure' };
  // Proof: with this test removed, `refuses a fact, and a clear, on a derived
  // measure` (measure-fact.test.ts) accepted an `agent_minutes` fact; watched 2026-10-24.
  if (definition.derived) return { ok: false, reason: 'derived_measure' };
  // Proof: with this test removed, `refuses a fact, and a clear, in the
  // scheduling measure` (measure-fact.test.ts) accepted a `time` fact;
  // watched 2026-10-23.
  if (definition.schedulesWork) return { ok: false, reason: 'scheduling_measure_fact' };
  if (value !== null && definition.scale === 'integer' && !Number.isInteger(value))
    return { ok: false, reason: 'scale_mismatch' };
  return { ok: true, metric: factMetricOf(definition.key) };
}

/** The key the derived agent-time measure is read under; seeded, never typed. */
export const AGENT_MINUTES = 'agent_minutes';

const MILLISECONDS_PER_MINUTE = 60_000;

/** One attempt where it ran: the step node it belongs to. */
export type NodeAttempt = Attempt & { readonly workItemId: string; readonly stepId: string };

/**
 * The `agent_minutes` fact of every step node holding an ended attempt
 * (`wbs-measure-budgets` D4, task 1.4): the **additive** span of its ended
 * attempts — each attempt's end minus its start, summed, so two attempts that
 * overlap both count — in whole minutes, rounded half up once on the node's
 * total (design D20). Derived on every read and never stored.
 *
 * A running attempt contributes nothing: its duration is not yet a fact. A
 * node whose attempts all run, or that has none, is absent, never zero.
 * `recordedAt` is the latest end among the node's ended attempts, the moment
 * the figure last changed.
 *
 * Proof: with the running-attempt skip removed, `counts ended attempts only;
 * a running one adds nothing` (measure-fact.test.ts) failed (8 pass, 1 fail);
 * watched 2026-10-23.
 */
export function agentMinutesOf(attempts: readonly NodeAttempt[]): StoredMeasure[] {
  const byNode = new Map<string, { workItemId: string; stepId: string; ms: number; at: number }>();
  for (const attempt of attempts) {
    if (attempt.endedAt === null) continue;
    const node = `${attempt.workItemId}\u0000${attempt.stepId}`;
    const held = byNode.get(node) ?? {
      workItemId: attempt.workItemId,
      stepId: attempt.stepId,
      ms: 0,
      at: Number.NEGATIVE_INFINITY,
    };
    held.ms += attempt.endedAt - attempt.startedAt;
    held.at = Math.max(held.at, attempt.endedAt);
    byNode.set(node, held);
  }
  return [...byNode.values()].map(({ workItemId, stepId, ms, at }) => ({
    workItemId,
    stepId,
    metric: AGENT_MINUTES,
    value: Math.round(ms / MILLISECONDS_PER_MINUTE),
    recordedAt: at,
  }));
}

/**
 * Every metric `measures` holds, each once: the legacy names first in
 * {@link MEASURE_METRICS} order, then defined keys by code unit. The order a
 * per-metric fold walks them in, fixed so that a plan holding only legacy
 * figures folds, hands up and journals exactly as it did before definitions.
 */
export function metricsIn(measures: readonly Pick<StoredMeasure, 'metric'>[]): string[] {
  const held = new Set(measures.map(({ metric }) => metric));
  const legacy = MEASURE_METRICS.filter((metric) => held.has(metric));
  const defined = [...held].filter((metric) => !isLegacyMetric(metric)).sort();
  return [...legacy, ...defined];
}
