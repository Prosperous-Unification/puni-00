import {
  type DependencyReach,
  type EstimateMethod,
  type EstimateRounding,
  isDependencyReach,
  isEstimateMethod,
  isEstimateRounding,
  type PertWeights,
} from '@wbs/domain';

import { withoutAuditColumns } from './audit';
import { isScheduleEngine, isSolverObjective, unknownStoredValue } from './optimizer-rows';
import {
  type ScheduleEngine,
  type SolverObjectiveName,
  workPackage,
  workPackageAbbreviation,
  workPackageOrganization,
  workPackageSolution,
} from './schema';
import { PACKAGE_SETTING_PROJECTION } from './settings';
import { decodeWorkPackageAbbreviation } from './work-package-abbreviation';

/**
 * One {@link PertWeights} as the three columns that hold it.
 *
 * Written once and used by both the insert and the update, so a work package created
 * with weights and a work package patched to them cannot land in different columns.
 */
// Historical pre-lift format conversion; current repository writes setting_value instead.
export function weightColumns(weights: PertWeights): {
  pertWeightOptimistic: number;
  pertWeightRealistic: number;
  pertWeightPessimistic: number;
} {
  return {
    pertWeightOptimistic: weights.optimistic,
    pertWeightRealistic: weights.realistic,
    pertWeightPessimistic: weights.pessimistic,
  };
}

/**
 * A stored row as a {@link WorkPackage}, checking the two columns SQLite cannot
 * constrain.
 *
 * `estimate_method` is text, so the database will hold `median` as happily as
 * `pert`. Reading one is malformed trusted data and it throws rather than
 * falling back to PERT: a work package silently planned by a method nobody chose is
 * a wrong answer delivered confidently, and R5 exists to stop exactly that.
 *
 * `dep_reach` is the same shape of column and the same refusal. Its two values
 * differ by every date behind a multi-step predecessor, so reading an
 * unrecognised one as `whole-item` would schedule a plan by a rule nobody
 * chose and say nothing about it. The case is not hypothetical: an older colour
 * reading a value a newer release wrote arrives here mid-swap.
 *
 * `estimate_rounding` and the three `pert_weight_*` columns are the same
 * refusal a third and fourth time, and the weights are checked as a **triple**
 * rather than one column at a time: a single weight says nothing on its own,
 * and what makes a set of them unusable is a property of all three — they must
 * sum to a finite number above zero to divide by. `PertWeights`'s own narrow is
 * that rule, so this boundary and the PATCH boundary refuse the same triples
 * without either restating the arithmetic.
 *
 * Proof: with the two guards replaced by casts, `refuses a stored rounding it
 * does not know` failed on `expected [Function] to throw` — a work package rounding
 * by `nearest` read back happily, and `roundDays` then charged every step by
 * `ceil` because that is its last branch; watched 2026-08-30, with `refuses
 * stored weights that cannot average a triple` failing beside it on the same
 * assertion.
 */
/**
 * Columns of `workPackage` that are stored and never published.
 *
 * `optimizationDeletePendingAt` is the optimizer drain's cross-process fence
 * (tasks.md 3.1b): internal state, not a field of a work package, and no boundary
 * returns it. `timezone` is read and written through
 * {@link WorkPackageRepository.timezoneOf} and {@link WorkPackageRepository.setTimezone}
 * until the timezone route publishes it (`step-node-attempts` slice 4).
 */
const INTERNAL_WORK_PACKAGE_COLUMNS = ['optimizationDeletePendingAt'] as const;

/**
 * What a work package created without stating its settings gets — the same three
 * values `20260904140000_add_work_package_settings` writes into its `ADD COLUMN`
 * defaults (tasks.md 3b.1, 3b.2).
 *
 * Two statements of one fact, which is a drift risk and is therefore proved
 * rather than trusted: `create` writes these explicitly instead of omitting the
 * columns, and `a workPackage created without settings agrees with the columns'
 * own defaults` in `work-package.db.test.ts` inserts a row **around** this constant
 * and reads both back. If the migration and this list ever disagree, that case
 * is the one that says so.
 *
 * OFF, `fast` and `pri` are not arbitrary: OFF is what makes an existing
 * work package spend no solver time on deploy, and `fast`/`pri` are the engine and
 * the order every plan already had, so a work package created today schedules
 * exactly as it did yesterday.
 */
export const DEFAULT_WORK_PACKAGE_SETTINGS = {
  enabled: false,
  engine: 'fast',
  objective: 'pri',
} as const satisfies { enabled: boolean; engine: ScheduleEngine; objective: SolverObjectiveName };

/**
 * A row with {@link INTERNAL_WORK_PACKAGE_COLUMNS} taken off, for
 * {@link withoutAuditColumns}' reason and by its method.
 *
 * {@link toWorkPackage} is generic over its row and spreads whatever is left of it,
 * so a column added to `workPackage` is published **by default** and has to be
 * taken off deliberately — the trap `createdBy` sprang on 2026-09-02, caught
 * both times by the same guard in `work-package.db.test.ts`.
 */
function withoutInternalColumns<T extends object>(
  row: T,
): Omit<T, (typeof INTERNAL_WORK_PACKAGE_COLUMNS)[number]> {
  const dropped = new Set<string>(INTERNAL_WORK_PACKAGE_COLUMNS);
  return Object.fromEntries(Object.entries(row).filter(([name]) => !dropped.has(name))) as Omit<
    T,
    (typeof INTERNAL_WORK_PACKAGE_COLUMNS)[number]
  >;
}

/** The stored columns {@link toWorkPackage} turns into a `WorkPackage`'s fields. */
interface WorkPackageColumns {
  estimateMethod: string;
  depReach: string;
  estimateRounding: string;
  solutionSlug: string | null;
  solutionUrl: string | null;
  scheduleEngine: string;
  scheduleObjective: string;
  optimizationDeletePendingAt?: number | null;
}

/** A work package read beside its `work_package_solution` link, if it has one. */
export const WITH_SOLUTION = {
  settingsProjection: PACKAGE_SETTING_PROJECTION,
  workPackage,
  solution: workPackageSolution,
  address: workPackageAbbreviation,
  organization: workPackageOrganization,
};

/** A row read through {@link WITH_SOLUTION}, decoded. */
export function fromJoined(
  row: {
    workPackage: typeof workPackage.$inferSelect;
    solution: typeof workPackageSolution.$inferSelect | null;
    address: typeof workPackageAbbreviation.$inferSelect | null;
    organization: typeof workPackageOrganization.$inferSelect | null;
  },
  settings: { readonly pertWeights: PertWeights; readonly budgetFactor: number },
) {
  const address = decodeWorkPackageAbbreviation({
    workPackageId: row.workPackage.id,
    abbreviation: row.address?.abbreviation ?? null,
    namespace: row.address?.namespace ?? null,
    organizationId: row.organization?.organizationId ?? null,
  });
  return toWorkPackage(
    { ...row.workPackage, abbreviation: address.abbreviation },
    row.solution === null ? null : { slug: row.solution.slug, url: row.solution.url },
    settings,
  );
}

/** A `work_package_solution` row as a LEFT JOIN answers it: absent, or whole. */
type ScopedSolutionRow = { slug: string; url: string } | null;

/**
 * A LEFT JOIN's two nullable `work_package_solution` columns as one link.
 *
 * @throws when only one of them is null, which the table's `NOT NULL`s forbid.
 */
export function scopedSolution(slug: string | null, url: string | null): ScopedSolutionRow {
  if (slug === null && url === null) return null;
  if (slug === null || url === null) throw new Error('work_package_solution has a partial link');
  return { slug, url };
}

/**
 * The two settings columns that are stored as text and refused on the way out
 * (tasks.md 3b.2, 3b.8).
 *
 * `optimization_enabled` is not among them and needs no validator: drizzle
 * reads it through `{ mode: 'boolean' }`, so the only values it can produce are
 * `true` and `false`. Its `CHECK (optimization_enabled IN (0,1))` is what keeps
 * a `2` out of the column in the first place, and `refuses a value outside each
 * column vocabulary` in `work-package-settings.db.test.ts` proves that half.
 *
 * `scoped` is the work package's `work_package_solution` link, read beside the row; it
 * becomes `solutionRef` in place of the legacy pair.
 *
 * Proof: answering the legacy pair when both were present made `refuses a
 * workPackage holding both a legacy and a scoped reference` in
 * `work-package-solution.db.test.ts` read the work package instead of throwing;
 * watched 2026-09-28.
 *
 * @throws when the work package holds both a legacy pair and a scoped link.
 */
export function toWorkPackage<T extends WorkPackageColumns>(
  row: T,
  scoped: ScopedSolutionRow,
  settings: { readonly pertWeights: PertWeights; readonly budgetFactor: number },
  // Nested rather than one union of keys, because that is what the body
  // produces and TypeScript does not prove `Omit<Omit<T, A>, B>` equals
  // `Omit<T, A | B>` for a generic `T`.
): Omit<
  Omit<
    Omit<
      T,
      | 'estimateMethod'
      | 'depReach'
      | 'estimateRounding'
      | 'solutionSlug'
      | 'solutionUrl'
      | 'scheduleEngine'
      | 'scheduleObjective'
    >,
    'createdBy' | 'updatedAt' | 'updatedBy'
  >,
  // The list rather than the one name it held until run 33, so a column added
  // to {@link INTERNAL_WORK_PACKAGE_COLUMNS} is a column this signature stops
  // declaring — the body already stopped returning it.
  (typeof INTERNAL_WORK_PACKAGE_COLUMNS)[number]
> & {
  estimateMethod: EstimateMethod;
  depReach: DependencyReach;
  estimateRounding: EstimateRounding;
  pertWeights: PertWeights;
  budgetFactor: number;
  solutionRef: { slug: string; url: string } | null;
  scheduleEngine: ScheduleEngine;
  scheduleObjective: SolverObjectiveName;
} {
  const {
    estimateMethod,
    depReach,
    estimateRounding,
    solutionSlug,
    solutionUrl,
    scheduleEngine,
    scheduleObjective,
    ...rest
  } = row;
  if (!isEstimateMethod(estimateMethod)) {
    throw new Error(`unknown estimate method in the database: ${estimateMethod}`);
  }
  if (!isDependencyReach(depReach)) {
    throw new Error(`unknown dependency reach in the database: ${depReach}`);
  }
  if (!isEstimateRounding(estimateRounding)) {
    throw new Error(`unknown estimate rounding in the database: ${estimateRounding}`);
  }
  // Historical stored-weight proof above predates setting_value; resolveSetting now owns that validation.
  if ((solutionSlug === null) !== (solutionUrl === null)) {
    throw new Error('work package has a partial solution reference');
  }
  if (scoped !== null && solutionSlug !== null) {
    throw new Error('work package has both a legacy and a scoped solution reference');
  }
  if (!isScheduleEngine(scheduleEngine)) {
    throw unknownStoredValue('work_package', 'schedule_engine', scheduleEngine);
  }
  if (!isSolverObjective(scheduleObjective)) {
    throw unknownStoredValue('work_package', 'schedule_objective', scheduleObjective);
  }
  return {
    // Named by {@link withoutAuditColumns} rather than spread whole: this
    // mapper is generic over its row, so it has no column list of its own, and
    // `...rest` published `createdBy` and `updatedAt` until 2026-09-02.
    ...withoutInternalColumns(withoutAuditColumns(rest)),
    estimateMethod,
    depReach,
    estimateRounding,
    pertWeights: settings.pertWeights,
    budgetFactor: settings.budgetFactor,
    solutionRef:
      scoped ??
      (solutionSlug === null || solutionUrl === null
        ? null
        : { slug: solutionSlug, url: solutionUrl }),
    scheduleEngine,
    scheduleObjective,
  };
}
