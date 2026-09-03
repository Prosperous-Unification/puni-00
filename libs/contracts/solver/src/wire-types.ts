/**
 * The TypeScript binding of `solver-wire.v1.json` (2.1).
 *
 * The schema is the contract and the Python side reads the very same file, so
 * nothing here may be authored independently of it. Every vocabulary below is
 * a `const` array rather than a bare union so that `wire-types.test.ts` can
 * read the schema at run time and fail when the two drift — a union alone is
 * erased before any test can see it.
 */

/** `#/$defs/wireVersion` — a `const`, so the type is the literal. */
export const SOLVER_WIRE_VERSION = 1;
export type SolverWireVersion = typeof SOLVER_WIRE_VERSION;

/**
 * `#/$defs/response.properties.status` — the RUN-OUTCOME vocabulary: whether a
 * schedule is being returned at all and, if not, which of the two reasons
 * applies. `optimal` is deliberately absent; proof strength is per stage.
 */
export const SOLVER_RESPONSE_STATUSES = ['feasible', 'unknown', 'infeasible'] as const;
export type SolverResponseStatus = (typeof SOLVER_RESPONSE_STATUSES)[number];

/**
 * `#/$defs/objective-term.properties.status` — a different question: how
 * strong the proof for one stage is. Overlaps the run-outcome vocabulary in
 * two tokens and is not the same field.
 */
export const SOLVER_STAGE_STATUSES = ['optimal', 'feasible', 'unknown'] as const;
export type SolverStageStatus = (typeof SOLVER_STAGE_STATUSES)[number];

/** `#/$defs/objectiveValues` — every term is required, so this is its key set. */
export const SOLVER_OBJECTIVE_TERMS = ['makespan', 'priority', 'movement'] as const;
export type SolverObjectiveTerm = (typeof SOLVER_OBJECTIVE_TERMS)[number];

/**
 * `#/$defs/offsetMap` — units from day zero, one per slice, keyed by
 * `sliceKey()`'s result. TypeScript cannot express the key-set equality with
 * the request's slices; that invariant is the re-validator's (2.4), not the
 * type's.
 */
export type SolverOffsetMap = Readonly<Record<string, number>>;

/** `#/$defs/objective-term`. All four members are required; two are nullable. */
export interface SolverObjectiveTermValue {
  readonly value: number;
  readonly stageValue: number | null;
  readonly bound: number | null;
  readonly status: SolverStageStatus;
}

export type SolverObjectiveValues = Readonly<
  Record<SolverObjectiveTerm, SolverObjectiveTermValue>
>;

/**
 * `#/$defs/response`, with the schema's `allOf` conditional carried as the
 * discriminant rather than as a runtime check: `feasible` is the only status
 * that publishes, so it is the only one that carries `offsets` and
 * `objectiveValues`, and it carries BOTH. The other two carry NEITHER — and
 * absent rather than `{}`, because an empty map is a well-formed `offsetMap`
 * that would pass the schema and then fail the key-set invariant one layer
 * later, reporting a vocabulary decision as a corrupt payload.
 */
export type SolverResponse =
  | {
      readonly wireVersion: SolverWireVersion;
      readonly status: 'feasible';
      readonly offsets: SolverOffsetMap;
      readonly objectiveValues: SolverObjectiveValues;
    }
  | {
      readonly wireVersion: SolverWireVersion;
      readonly status: Exclude<SolverResponseStatus, 'feasible'>;
      readonly offsets?: undefined;
      readonly objectiveValues?: undefined;
    };

/**
 * The property names `#/$defs/response` admits. The branch is
 * `additionalProperties: false`, so this is the closed set an unknown-key
 * rejection is written against (2.3).
 */
export const SOLVER_RESPONSE_KEYS = [
  'wireVersion',
  'status',
  'offsets',
  'objectiveValues',
] as const;
export type SolverResponseKey = (typeof SOLVER_RESPONSE_KEYS)[number];

/** The members `#/$defs/objective-term` requires — all four of them. */
export const SOLVER_OBJECTIVE_TERM_KEYS = ['value', 'stageValue', 'bound', 'status'] as const;
