import type {
  BudgetView,
  MeasureDefinitionView,
  MixedBasesView,
  MoneyBasisView,
  WorkItemView,
} from '@/lib/wbs-api';

/**
 * The three figures a measure column can show, in the order they render.
 *
 * `fact` is what was recorded, `estimate` the expected figure folded from the
 * trio by the project's PERT weights, `variance` the fact less the expected.
 */
export const MEASURE_FACETS = ['estimate', 'fact', 'variance'] as const;
export type MeasureFacet = (typeof MEASURE_FACETS)[number];

/** The id prefix every measure column carries; a definition key holds no hyphen. */
const MEASURE_COLUMN_PREFIX = 'measure-';

/**
 * The address a definition's facts are read under in the row's `measures`.
 *
 * `tokens` and `hours` keep their legacy metric names on every shared surface
 * for one release (design D18); every other definition is its own key.
 */
export function factKeyOf(key: string): string {
  if (key === 'tokens') return 'token_actual';
  if (key === 'hours') return 'hours_actual';
  return key;
}

/** The column id of one facet of one definition: `measure-tokens-fact`. */
export function measureColumnId(key: string, facet: MeasureFacet): string {
  return `${MEASURE_COLUMN_PREFIX}${key}-${facet}`;
}

/** Whether a column id names a measure column at all. */
export function isMeasureColumnId(columnId: string): boolean {
  return columnId.startsWith(MEASURE_COLUMN_PREFIX);
}

/** The facet a measure column id names, or null for any other id. */
export function facetOfColumn(columnId: string): MeasureFacet | null {
  if (!isMeasureColumnId(columnId)) return null;
  const facet = columnId.slice(columnId.lastIndexOf('-') + 1);
  return MEASURE_FACETS.find((each) => each === facet) ?? null;
}

/**
 * The facets a definition can ever fill (design D52).
 *
 * A definition without three points holds no trio, so its estimate and its
 * variance would be a column of dashes for ever: only its fact is offered.
 */
export function facetsOf(definition: MeasureDefinitionView): readonly MeasureFacet[] {
  return definition.threePoint ? MEASURE_FACETS : ['fact'];
}

/**
 * The definitions that get columns of their own: every one but the scheduling
 * measure, whose columns are the existing step estimate columns and Days
 * (`wbs-measure-budgets` D7; the brief's "do not duplicate them").
 */
export function columnedDefinitions(
  definitions: readonly MeasureDefinitionView[],
): readonly MeasureDefinitionView[] {
  return definitions.filter((definition) => !definition.schedulesWork);
}

/** A reader's per-measure answers, by definition key: shown or hidden. */
export type MeasureToggles = Readonly<Record<string, boolean>>;

/**
 * Whether one definition's columns are on this reader's table: what the reader
 * said, or the definition's `showByDefault` where they have said nothing.
 *
 * Proof: answering `toggles[key] ?? true` (the default filter dropped), `a
 * fresh reader sees no measure column but time` in measure-reading.test.ts
 * failed with every seeded measure shown (3 of 18 failed; watched 2026-10-23).
 */
export function isMeasureShown(
  definition: MeasureDefinitionView,
  toggles: MeasureToggles,
): boolean {
  return toggles[definition.key] ?? definition.showByDefault;
}

/** The definitions whose columns this reader has on the table, in list order. */
export function shownDefinitions(
  definitions: readonly MeasureDefinitionView[],
  toggles: MeasureToggles,
): readonly MeasureDefinitionView[] {
  return columnedDefinitions(definitions).filter((definition) =>
    isMeasureShown(definition, toggles),
  );
}

/** Whether a value read back out of storage is a toggle record this table can use. */
export function isMeasureToggles(value: unknown): value is MeasureToggles {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value).every((shown) => typeof shown === 'boolean');
}

/**
 * One figure as a cell or the panel shows it.
 *
 * `absent` is not zero: nothing was estimated or recorded, and it renders as a
 * dash. `mixed` is a money sum be-01 refused to add across rate cards (design
 * D44); it names the bases and never a total.
 */
export type MeasureFigure =
  | { kind: 'absent' }
  | { kind: 'mixed'; bases: MixedBasesView }
  | { kind: 'value'; value: number; singlePoint: boolean; basis: MoneyBasisView | null };

const ABSENT: MeasureFigure = { kind: 'absent' };

/** The sum of a per-step record's values, or null when it holds none. */
function sumOf(byStep: Readonly<Record<string, number>> | undefined): number | null {
  if (byStep === undefined) return null;
  const values = Object.values(byStep);
  return values.length === 0 ? null : values.reduce((total, value) => total + value, 0);
}

/**
 * The row's three figures in one measure, folded over its steps exactly as the
 * read states them (design D29): the expected figures summed, the facts summed,
 * and the variances summed where a step holds one. A variance is never worked
 * out here as fact minus expected: a step with a fact and no trio has none, and
 * the read is the one place that decides it (design D52).
 */
export function measureFiguresOf(
  row: Pick<WorkItemView, 'measures' | 'measureEstimates' | 'mixedRateCards' | 'moneyBases'>,
  definition: MeasureDefinitionView,
): Readonly<Record<MeasureFacet, MeasureFigure>> {
  const mixed = row.mixedRateCards?.[definition.key];
  const bases = row.moneyBases?.[definition.key];
  const trios = row.measureEstimates?.[definition.key];
  const factSum = sumOf(row.measures?.[factKeyOf(definition.key)]);
  const estimate: MeasureFigure =
    mixed?.estimates !== undefined
      ? { kind: 'mixed', bases: mixed.estimates }
      : trios === undefined || Object.keys(trios).length === 0
        ? ABSENT
        : {
            kind: 'value',
            value: Object.values(trios).reduce((total, trio) => total + trio.expected, 0),
            singlePoint: Object.values(trios).every((trio) => trio.singlePoint),
            basis: bases?.estimates ?? null,
          };
  const fact: MeasureFigure =
    mixed?.facts !== undefined
      ? { kind: 'mixed', bases: mixed.facts }
      : factSum === null
        ? ABSENT
        : { kind: 'value', value: factSum, singlePoint: false, basis: bases?.facts ?? null };
  const varianceSum =
    trios === undefined
      ? null
      : sumOf(
          Object.fromEntries(
            Object.entries(trios).flatMap(([stepId, trio]) =>
              trio.variance === undefined ? [] : [[stepId, trio.variance]],
            ),
          ),
        );
  const mixedVariance = mixed?.facts ?? mixed?.estimates;
  const variance: MeasureFigure =
    mixedVariance !== undefined
      ? { kind: 'mixed', bases: mixedVariance }
      : varianceSum === null
        ? ABSENT
        : { kind: 'value', value: varianceSum, singlePoint: false, basis: null };
  return { estimate, fact, variance };
}

/**
 * Whether a definition's figures are written in micro-units of its currency
 * (the seeded `cost`, design D15), so they read as currency once divided.
 */
function isMicroCurrency(definition: MeasureDefinitionView): boolean {
  return definition.currency !== null && definition.unit === `micro-${definition.currency}`;
}

/**
 * A figure in a definition's own unit, as a reader reads it.
 *
 * Money in micro-units of its currency reads as that currency
 * (`1500000 micro-USD` → `$1.50`): a change of scale, not a conversion, so
 * nothing about the figure's basis is touched (design D52). Every other
 * figure is grouped, and a real scale keeps at most two decimals.
 *
 * @param value the figure in the definition's stored unit.
 * @param definition the measure it is in.
 * @param signed prefix a `+` on a positive figure (a variance).
 */
export function formatMeasureValue(
  value: number,
  definition: MeasureDefinitionView,
  signed = false,
): string {
  const sign = signed && value > 0 ? '+' : '';
  if (isMicroCurrency(definition) && definition.currency !== null) {
    return `${sign}${new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: definition.currency,
    }).format(value / 1_000_000)}`;
  }
  const text = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: definition.scale === 'integer' ? 0 : 2,
  }).format(value);
  return `${sign}${text}`;
}

/**
 * The unit a heading carries: the currency for money read as currency, the
 * definition's own unit label otherwise.
 */
export function unitLabelOf(definition: MeasureDefinitionView): string {
  if (isMicroCurrency(definition) && definition.currency !== null) return definition.currency;
  return definition.unit;
}

/**
 * What a figure typed into the panel means in the definition's stored unit:
 * currency back to micro-units, everything else as typed. `null` for anything
 * that is not a figure at all; scale and sign are be-01's to refuse
 * (`scale_mismatch`, `invalid_measure`), so this keeps no copy of either rule.
 */
export function storedValueOf(typed: string, definition: MeasureDefinitionView): number | null {
  const trimmed = typed.trim().replace(/[,\s]/g, '');
  if (trimmed === '' || !/^-?\d*\.?\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  return isMicroCurrency(definition) ? Math.round(value * 1_000_000) : value;
}

/** A figure in its stored unit as the panel prefills it: the inverse of {@link storedValueOf}. */
export function typedValueOf(value: number, definition: MeasureDefinitionView): string {
  return isMicroCurrency(definition) ? String(value / 1_000_000) : String(value);
}

/** How a basis is named to a reader: its currency and a short digest. */
export function basisWords(basis: MoneyBasisView | null): string {
  if (basis === null) return 'unpriced';
  const digest =
    basis.rateCardDigest.length > 12
      ? `${basis.rateCardDigest.slice(0, 12)}…`
      : basis.rateCardDigest;
  return `${basis.currency} · card ${digest}`;
}

/** The sentence a mixed sum's marker carries: both bases, and why there is no total. */
export function mixedSentence(bases: MixedBasesView): string {
  return `Mixed rate cards: ${basisWords(bases[0])} and ${basisWords(bases[1])} — WBS adds no figures priced on different cards.`;
}

/**
 * A budget as the panel draws it.
 *
 * `blocked` is a budget be-01 could not read because the subtree's facts mix
 * money bases (design D44): the budget is unknown, not unbounded. `spent` is
 * worked back from the read's own figures (cap less remaining less held),
 * which is exactly the subtree's facts (design D39).
 */
export type BudgetReading =
  | { kind: 'none' }
  | { kind: 'blocked'; bases: MixedBasesView }
  | {
      kind: 'budget';
      policy: BudgetView['policy'];
      source: BudgetView['source'];
      cap: number;
      spent: number;
      held: number;
      remaining: number;
      exceeded: boolean;
      /** Spent over cap, clamped to [0, 1], for the bar. */
      fill: number;
    };

/** The budget reading of one row in one measure. */
export function budgetReadingOf(
  row: Pick<WorkItemView, 'budgets' | 'mixedRateCards'>,
  key: string,
): BudgetReading {
  const budget = row.budgets?.[key];
  if (budget === undefined) {
    const mixed = row.mixedRateCards?.[key]?.facts;
    return mixed === undefined ? { kind: 'none' } : { kind: 'blocked', bases: mixed };
  }
  const held = budget.held ?? 0;
  const spent = budget.cap - budget.remaining - held;
  return {
    kind: 'budget',
    policy: budget.policy,
    source: budget.source,
    cap: budget.cap,
    spent,
    held,
    remaining: budget.remaining,
    exceeded: budget.exceeded,
    fill: budget.cap <= 0 ? (spent > 0 ? 1 : 0) : Math.min(1, Math.max(0, spent / budget.cap)),
  };
}
