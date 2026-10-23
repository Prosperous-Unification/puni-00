import { MEASURE_METRICS, type MeasureKind, type MeasureScale } from './stored-vocabularies';

/**
 * One thing an organization estimates and records (`wbs-measure-budgets` D1):
 * the CONTEXT.md **measure definition**. Scoped to one organization, which
 * every read and write names, so the definition itself carries no owner.
 *
 * - `key` is the **metric** a figure is addressed by: a lowercase slug, unique
 *   in its organization and never changed (see {@link isMeasureKey}).
 * - `kind` and `scale` are fixed at creation: a fact recorded as a count means
 *   nothing as money, and a real figure cannot be read as an integer.
 * - `schedulesWork` marks the one **scheduling measure** (D2), `time`; the
 *   solver reads the time trio's own table and nothing else.
 * - `derived` figures are computed on read and never typed (`agent_minutes`
 *   from attempt spans, D4); no command sets it.
 * - `currency` is present exactly when `kind` is `money`; money figures are
 *   integers in micro-units of it.
 * - `order` places the definition in every list; ties fall back to `key`.
 */
export interface MeasureDefinition {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly unit: string;
  readonly kind: MeasureKind;
  readonly scale: MeasureScale;
  readonly threePoint: boolean;
  readonly showByDefault: boolean;
  readonly schedulesWork: boolean;
  readonly derived: boolean;
  readonly order: number;
  readonly currency: string | null;
}

/** A definition before it has an id: what a create decides on and the seed lists. */
export type MeasureDefinitionFields = Omit<MeasureDefinition, 'id'>;

/**
 * What a patch may name. `key`, `kind` and `scale` are admitted so that naming
 * them unchanged is harmless and naming them changed is refused by
 * {@link decideMeasurePatch} rather than silently ignored; `derived` is absent
 * because no caller may set it.
 */
export interface MeasureDefinitionPatch {
  readonly key?: string;
  readonly name?: string;
  readonly unit?: string;
  readonly kind?: MeasureKind;
  readonly scale?: MeasureScale;
  readonly threePoint?: boolean;
  readonly showByDefault?: boolean;
  readonly schedulesWork?: boolean;
  readonly order?: number;
  readonly currency?: string | null;
}

/**
 * The five definitions every organization holds from its first moment
 * (`wbs-measure-budgets` D1), in their list order. The SQLite migration
 * `20261023140000_add_measure` seeds the same rows for existing organizations
 * and its organization trigger for new ones; `measure-schema.db.test.ts` holds
 * the two to this list.
 */
export const SEEDED_MEASURE_DEFINITIONS: readonly MeasureDefinitionFields[] = [
  {
    key: 'time',
    name: 'Time',
    unit: 'days',
    kind: 'duration',
    scale: 'real',
    threePoint: true,
    showByDefault: true,
    schedulesWork: true,
    derived: false,
    order: 1,
    currency: null,
  },
  {
    key: 'tokens',
    name: 'Tokens',
    unit: 'tokens',
    kind: 'count',
    scale: 'integer',
    threePoint: true,
    showByDefault: false,
    schedulesWork: false,
    derived: false,
    order: 2,
    currency: null,
  },
  {
    key: 'hours',
    name: 'Hours',
    unit: 'hours',
    kind: 'duration',
    scale: 'real',
    threePoint: false,
    showByDefault: false,
    schedulesWork: false,
    derived: false,
    order: 3,
    currency: null,
  },
  {
    key: 'cost',
    name: 'Cost',
    unit: 'micro-USD',
    kind: 'money',
    scale: 'integer',
    threePoint: true,
    showByDefault: false,
    schedulesWork: false,
    derived: false,
    order: 4,
    currency: 'USD',
  },
  {
    key: 'agent_minutes',
    name: 'Agent minutes',
    unit: 'minutes',
    kind: 'duration',
    scale: 'integer',
    threePoint: false,
    showByDefault: false,
    schedulesWork: false,
    derived: true,
    order: 5,
    currency: null,
  },
];

/** The most characters a measure key may carry. */
export const LONGEST_MEASURE_KEY = 40;

/** The largest `order` a definition may take; a bound, not a meaning. */
export const MOST_MEASURE_ORDER = 1_000_000;

/**
 * Whether `value` is a measure key: a lowercase letter, then lowercase
 * letters, digits or underscores, at most {@link LONGEST_MEASURE_KEY} long. The
 * key names a metric in commands, columns and exports, so it stays ASCII and
 * case-free.
 */
export function isMeasureKey(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= LONGEST_MEASURE_KEY &&
    /^[a-z][a-z0-9_]*$/.test(value)
  );
}

/** Whether `value` is shaped like an ISO 4217 code: three capital letters. */
export function isCurrencyCode(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z]{3}$/.test(value);
}

/**
 * Whether `key` is one of {@link SEEDED_MEASURE_DEFINITIONS}. A seeded
 * definition is never removed: every later slice's estimates, facts and
 * budgets may name it, and the migration's rollback tells seeded rows from
 * defined ones by this same key set.
 */
export function isSeededMeasureKey(key: string): boolean {
  return SEEDED_MEASURE_DEFINITIONS.some((each) => each.key === key);
}

/** The order a new definition takes when its create names none: after every held one. */
export function nextMeasureOrder(held: readonly MeasureDefinition[]): number {
  return held.reduce((highest, each) => Math.max(highest, each.order), 0) + 1;
}

/**
 * Why a definition write is refused (`wbs-measure-budgets` D1, D2), each a
 * 409: the organization's state, not the request's shape, stands in the way.
 *
 * - `measure_key_taken`: the organization already holds the key.
 * - `measure_key_immutable`: a patch names a different key.
 * - `measure_shape_immutable`: a patch names a different kind or scale.
 * - `second_scheduling_measure`: another definition already schedules work.
 * - `scheduling_measure_fixed`: a patch would take the flag off the
 *   scheduling measure, leaving the solver's input named by nothing.
 * - `currency_required` / `currency_forbidden`: money without a currency, or
 *   anything else with one.
 * - `unit_required`: a unit label that is empty or only whitespace; every
 *   figure is shown beside it.
 */
export type MeasureDefinitionRefusal =
  | 'measure_key_taken'
  | 'measure_key_immutable'
  | 'measure_shape_immutable'
  | 'second_scheduling_measure'
  | 'scheduling_measure_fixed'
  | 'currency_required'
  | 'currency_forbidden'
  | 'unit_required';

function refuseCurrency(
  fields: Pick<MeasureDefinition, 'kind' | 'currency'>,
): 'currency_required' | 'currency_forbidden' | null {
  if (fields.kind === 'money') return fields.currency === null ? 'currency_required' : null;
  return fields.currency === null ? null : 'currency_forbidden';
}

/**
 * Why `fields` cannot join an organization holding `held`, or null when it can.
 * The fields have passed the boundary (key shape, bounded order, currency
 * shape); this is what the organization's own definitions add.
 */
export function decideMeasureCreate(
  held: readonly MeasureDefinition[],
  fields: MeasureDefinitionFields,
): MeasureDefinitionRefusal | null {
  // The three legacy metric names stay taken while facts are answered under
  // them (design D18): a definition keyed `token_actual` would be a second
  // name for the tokens fact on every read and journal entry.
  // Proof: with this test removed, `refuses a key that is a legacy metric
  // name` (measure-definition.test.ts) answered null; watched 2026-10-23.
  if ((MEASURE_METRICS as readonly string[]).includes(fields.key)) return 'measure_key_taken';
  if (held.some((each) => each.key === fields.key)) return 'measure_key_taken';
  if (fields.schedulesWork && held.some((each) => each.schedulesWork))
    return 'second_scheduling_measure';
  if (fields.unit.trim() === '') return 'unit_required';
  return refuseCurrency(fields);
}

/** {@link decideMeasurePatch}'s answer: the definition as it would be stored, or why not. */
export type MeasurePatchDecision =
  { ok: true; next: MeasureDefinition } | { ok: false; reason: MeasureDefinitionRefusal };

/**
 * `target` with `patch` applied, or why the organization holding `held` (which
 * includes `target`) refuses it. Checked in a fixed order — key, shape,
 * scheduling, unit, currency — so one patch always answers one reason.
 */
export function decideMeasurePatch(
  held: readonly MeasureDefinition[],
  target: MeasureDefinition,
  patch: MeasureDefinitionPatch,
): MeasurePatchDecision {
  if (patch.key !== undefined && patch.key !== target.key)
    return { ok: false, reason: 'measure_key_immutable' };
  if (
    (patch.kind !== undefined && patch.kind !== target.kind) ||
    (patch.scale !== undefined && patch.scale !== target.scale)
  )
    return { ok: false, reason: 'measure_shape_immutable' };
  if (target.schedulesWork && patch.schedulesWork === false)
    return { ok: false, reason: 'scheduling_measure_fixed' };
  if (
    !target.schedulesWork &&
    patch.schedulesWork === true &&
    held.some((each) => each.schedulesWork && each.id !== target.id)
  )
    return { ok: false, reason: 'second_scheduling_measure' };
  const next: MeasureDefinition = {
    ...target,
    ...(patch.name === undefined ? {} : { name: patch.name }),
    ...(patch.unit === undefined ? {} : { unit: patch.unit }),
    ...(patch.threePoint === undefined ? {} : { threePoint: patch.threePoint }),
    ...(patch.showByDefault === undefined ? {} : { showByDefault: patch.showByDefault }),
    ...(patch.schedulesWork === undefined ? {} : { schedulesWork: patch.schedulesWork }),
    ...(patch.order === undefined ? {} : { order: patch.order }),
    ...(patch.currency === undefined ? {} : { currency: patch.currency }),
  };
  if (next.unit.trim() === '') return { ok: false, reason: 'unit_required' };
  const currency = refuseCurrency(next);
  return currency === null ? { ok: true, next } : { ok: false, reason: currency };
}

/**
 * What references one definition: the facts keyed by it
 * (`step_measure.measure_id`, slice 2), and once they exist the later slices'
 * `measure_estimate` and `work_item_budget` rows. The hook is the store's
 * `usageOfMeasure`, which those slices extend.
 */
export interface MeasureUsage {
  readonly references: number;
}

/**
 * Why `target` cannot be removed, or null when it can: `measure_in_use` for a
 * seeded definition ({@link isSeededMeasureKey}) or one anything references.
 * Cascading a removal (D1) is not offered yet: directory commands have no undo
 * (design D11), so a cascade would discard facts for good (design D21).
 */
export function refuseMeasureRemoval(
  target: MeasureDefinition,
  usage: MeasureUsage,
): 'measure_in_use' | null {
  if (isSeededMeasureKey(target.key)) return 'measure_in_use';
  return usage.references > 0 ? 'measure_in_use' : null;
}
