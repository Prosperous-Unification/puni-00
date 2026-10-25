/**
 * The four closed sets a stored row is validated against, and the types they
 * name.
 *
 * They lived in `schema.ts` beside the columns that hold them, which is where
 * they were written and not where they belong: a person's **kind**, a measure's
 * **unit**, which **engine** planned a project and which **objective** it was
 * planned for are facts about the domain, and the `CHECK` constraint that
 * enforces one is the adapter's way of storing a fact it did not invent.
 *
 * Moving them is what lets the store ports live in the application ring at all
 * (`docs/2026-09-05-ports-and-adapters-plan.md` §2): a port that named these
 * would have had to import the drizzle schema to say what a person is.
 *
 * The membership is what matters and the order is what does not: each list is
 * the one a migration's `CHECK (… IN (…))` enumerates, and a value in one and
 * not the other is a row the database accepts and the read refuses, or the
 * reverse. `schema.ts` re-exports all four, so the columns and the vocabulary
 * cannot drift apart by being imported from two places.
 */

/**
 * The two engines {@link project.scheduleEngine} may name (tasks.md 3b.8).
 *
 * Declared here rather than beside {@link SOLVER_OBJECTIVES} because it is a
 * project vocabulary and not an optimizer-table one: no row in the four
 * optimizer tables stores an engine. The objective deliberately has no twin —
 * `project.schedule_objective` stores the same `'pri' | 'time'`
 * {@link SOLVER_OBJECTIVES} already names, so it is a fourth validated column
 * rather than a second vocabulary, and {@link isSolverObjective} reads it.
 *
 * The order matters to nothing and the membership matters to everything: it is
 * the list the migration's `CHECK (schedule_engine IN ('fast','optimized'))`
 * enumerates, and a value in one and not the other is a row the database
 * accepts and the read refuses, or the reverse.
 */
export const SCHEDULE_ENGINES = ['fast', 'optimized'] as const;
export type ScheduleEngine = (typeof SCHEDULE_ENGINES)[number];

/**
 * The closed set of units a {@link stepMeasure} can be in.
 *
 * Exported because every read and write path takes one of these as a parameter
 * rather than defaulting it — the cost of a discriminated table, paid on
 * purpose. `openspec/changes/token-tracking/design.md` D1.
 */
export const MEASURE_METRICS = ['token_estimate', 'token_actual', 'hours_actual'] as const;

export type MeasureMetric = (typeof MEASURE_METRICS)[number];

/**
 * The closed set of things a {@link person} row can be.
 *
 * Exported for the same reason {@link MEASURE_METRICS} is: the directory route
 * and the card take one of these as a value rather than a boolean, so the day a
 * third kind arrives it is a value added here and not a schema change.
 * `openspec/changes/token-tracking/design.md` D6.
 */
export const PERSON_KINDS = ['person', 'agent'] as const;

export type PersonKind = (typeof PERSON_KINDS)[number];

/**
 * The closed set of scheduling problems a resource row can be (`wbs-resources` R1):
 * `exclusive` units are identical and demanded one at a time, `divisible` units are
 * demanded k at a time. `renewable` is deliberately absent; neither engine can level it.
 */
export const RESOURCE_KINDS = ['exclusive', 'divisible'] as const;

export type ResourceKind = (typeof RESOURCE_KINDS)[number];

/**
 * `#/$defs/request.properties.objective` — the two independently solved runs,
 * and a key column of three of the four tables below.
 */
export const SOLVER_OBJECTIVES = ['pri', 'time'] as const;

export type SolverObjectiveName = (typeof SOLVER_OBJECTIVES)[number];

/** Every modeled failure stored for an optimization attempt. */
export const SOLVER_FAILURE_REASONS = [
  'timeout',
  'invalid-output',
  'no-solution',
  'internal-error',
  'oom',
  'horizon-overflow',
  'objective-overflow',
] as const;

export type SolverFailureReason = (typeof SOLVER_FAILURE_REASONS)[number];

/**
 * How an **attempt** ended (`CONTEXT.md`): absent while it runs, so there is no
 * `running` here — a null outcome beside a null end is running, and the
 * migration's two `CHECK`s make any other pairing unstorable
 * (`openspec/changes/step-node-attempts/design.md` D1). The list the
 * migration's `CHECK (outcome IN (…))` enumerates and the one the swap compares
 * stored outcomes against.
 */
export const ATTEMPT_OUTCOMES = ['succeeded', 'failed', 'cancelled'] as const;

export type AttemptOutcome = (typeof ATTEMPT_OUTCOMES)[number];

/** Whether a stored or posted value is one of the three attempt outcomes. */
export function isAttemptOutcome(value: unknown): value is AttemptOutcome {
  // Proof: reduced to `typeof value === 'string'` and `admits exactly the three
  // attempt outcomes` failed on `running`; watched 2026-10-12.
  return typeof value === 'string' && (ATTEMPT_OUTCOMES as readonly string[]).includes(value);
}

/**
 * The four organization roles, strongest first. The role matrix in
 * `organization-ownership-and-access/specs/organization-access` is what each
 * may do; `super_admin` is organization-scoped and never platform-wide.
 */
export const ORGANIZATION_ROLES = ['super_admin', 'admin', 'member', 'viewer'] as const;

export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

/** The roles an invitation may offer: every role except `super_admin`. */
export const INVITABLE_ROLES = ['admin', 'member', 'viewer'] as const;

export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export const JOIN_REQUEST_STATUSES = ['pending', 'approved', 'denied'] as const;

export type JoinRequestStatus = (typeof JOIN_REQUEST_STATUSES)[number];

/**
 * A domain claim's lifecycle. `verified` and `suspended` both hold the unique
 * ownership; only `verified` routes signup.
 */
export const DOMAIN_CLAIM_STATUSES = ['pending', 'verified', 'suspended'] as const;

export type DomainClaimStatus = (typeof DOMAIN_CLAIM_STATUSES)[number];

/** Stored organization encoding can describe either capacity mode before runtime activation. */
export type CapacityMode = 'isolated' | 'shared';

/**
 * Release capability, not SQLite's encoding vocabulary. This intermediate release has no shared
 * runtime/cache/UI activation and must refuse shared restore and blue/green swaps over shared rows.
 * Proof: advertising shared fails the physical incoming-release isolated-only capability test.
 */
export const SUPPORTED_CAPACITY_MODES: readonly CapacityMode[] = ['isolated'];

/** A step's estimate units, independent of its executor kind (ADR 0042). */
export const ESTIMATE_UNITS = ['workdays', 'minutes'] as const;
export type EstimateUnit = (typeof ESTIMATE_UNITS)[number];

/** Admits the two stored and posted estimate units described in ADR 0042. */
export function isEstimateUnit(value: unknown): value is EstimateUnit {
  // Proof: accepting every string reached SQLite's CHECK and returned 500 instead of 422 for hours in step.controller.db.test.ts (2026-10-12).
  return typeof value === 'string' && (ESTIMATE_UNITS as readonly string[]).includes(value);
}

/**
 * What a measure definition counts (`wbs-measure-budgets` D1): a span of time,
 * a number of things, or an amount of money. Fixed at creation, because a fact
 * recorded under one kind means nothing under another.
 */
export const MEASURE_KINDS = ['duration', 'count', 'money'] as const;
export type MeasureKind = (typeof MEASURE_KINDS)[number];

/** Whether a stored or posted value is one of the three measure kinds. */
export function isMeasureKind(value: unknown): value is MeasureKind {
  return typeof value === 'string' && (MEASURE_KINDS as readonly string[]).includes(value);
}

/**
 * Whether a measure's figures are whole numbers or may carry a fraction
 * (`wbs-measure-budgets` D1); money is `integer`, in micro-units of its currency.
 */
export const MEASURE_SCALES = ['integer', 'real'] as const;
export type MeasureScale = (typeof MEASURE_SCALES)[number];

/** Whether a stored or posted value is one of the two measure scales. */
export function isMeasureScale(value: unknown): value is MeasureScale {
  return typeof value === 'string' && (MEASURE_SCALES as readonly string[]).includes(value);
}
