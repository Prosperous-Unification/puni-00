import type { StepState } from './progress';
import type { MeasureMetric } from './stored-vocabularies';

export interface StoredEstimate {
  workItemId: string;
  stepId: string;
  optimistic: number;
  realistic: number;
  pessimistic: number;
}

/**
 * The days one step spent on one work item, and when somebody said so.
 *
 * One number rather than a trio: an estimate is a guess about a range and an
 * actual is a fact about what happened.
 */
export interface StoredActual {
  workItemId: string;
  stepId: string;
  days: number;
  /** When the number was typed, in epoch milliseconds. */
  recordedAt: number;
}

/** One actual row's whole identity: the pair its primary key is. */
export interface ActualKey {
  workItemId: string;
  stepId: string;
}

/**
 * What one step's work on one work item cost in one unit that is not days, and
 * when somebody said so.
 *
 * `metric` is part of the identity rather than a property of it: the same pair
 * holding a token estimate, a token fact and an hours fact is three of these,
 * and each is absent on its own. See {@link stepMeasure} in `schema.ts` and
 * `openspec/changes/token-tracking/design.md` D1.
 */
export interface StoredMeasure {
  workItemId: string;
  stepId: string;
  metric: MeasureMetric;
  /** The figure itself — tokens or hours, in whatever `metric` says. */
  value: number;
  /** When the number was typed, in epoch milliseconds. */
  recordedAt: number;
}

/** One measure row's whole identity: the triple its primary key is. */
export interface MeasureKey {
  workItemId: string;
  stepId: string;
  metric: MeasureMetric;
}

/**
 * Where one step's work on one work item has got to, and when somebody said so.
 *
 * `state` is one of the two a step may be **stored** in. The third state — not
 * started — is the absence of this row, so it has no spelling here and cannot
 * be written by anybody: see {@link StepState} in `@wbs/domain`.
 */
export interface StoredProgress {
  workItemId: string;
  stepId: string;
  state: StepState;
  /** When somebody said so, in epoch milliseconds. */
  statedAt: number;
}

/** One progress row's whole identity: the pair its primary key is. */
export interface ProgressKey {
  workItemId: string;
  stepId: string;
}

/** One estimate row's whole identity: the pair its primary key is. */
export interface EstimateKey {
  workItemId: string;
  stepId: string;
}
