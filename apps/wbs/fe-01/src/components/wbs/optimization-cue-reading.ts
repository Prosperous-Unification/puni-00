import { withinDrift } from '@wbs/domain/workday';

import type {
  ConnectedPlanOptimizationView,
  PlanOptimizationView,
  ScheduleObjectiveView,
} from '@/lib/wbs-api';

import {
  comparisonWords,
  days,
  FAST_LABEL,
  OBJECTIVE_LABEL,
  OBJECTIVE_SENTENCE,
  STALE_WORDS,
  variantStateWords,
} from './optimization-words';

/** The two objectives, in the order the cue lists them under Fast. */
const OBJECTIVES: readonly ScheduleObjectiveView[] = ['pri', 'time'];

/** Which schedule a row of the cue is about. */
export type CueSchedule = 'fast' | ScheduleObjectiveView;

/** One schedule, as the cue reads it. */
export interface CueRow {
  readonly which: CueSchedule;
  /** Captured scope and evidence, preserved even when figures are stale. */
  readonly details: readonly string[];
  /** `Fast`, `PRI`, `Time` — what fits on a control. */
  readonly label: string;
  /** The project finish this schedule reaches, or `null` while it has none. */
  readonly finishDays: number | null;
  /**
   * How this schedule compares with Fast, or `null` for Fast itself and for a
   * schedule with no finish to compare.
   *
   * Against **Fast** rather than against the active schedule, so the three rows
   * are read against one reference. Which of them is worth *switching* to is
   * {@link CueReading.suggestion}'s question, and that one is decided against
   * the schedule on screen.
   */
  readonly comparedWithFast: string | null;
  /**
   * What this variant's own state says about itself, or `null` when the state
   * is not news — `Optimizing…`, `Optimization unavailable`, `Plan infeasible ·
   * N Work item deadlines`.
   *
   * Separate from {@link CueRow.refusedBecause} because the two are read in
   * different places: this belongs in the row's **words**, where a reader looks
   * for what the optimizer is doing, and the refusal is the control's own
   * reason for being unavailable.
   */
  readonly stateWords: string | null;
  /** Why this schedule cannot be chosen right now, or `null` when it can. */
  readonly refusedBecause: string | null;
  /** Whether this schedule's own state is one an explicit Retry may recover. */
  readonly retryable: boolean;
  /** The work item deadlines this variant proved unmeetable, or `null`. */
  readonly unmeetable: readonly UnmeetableDeadline[] | null;
}

/** One work item deadline a `plan-infeasible` certificate names. */
export interface UnmeetableDeadline {
  readonly ownerWorkItemId: string;
  readonly boundWorkItemId: string;
  readonly effectiveDeadlineOffset: number;
}

export interface CueReading {
  /** The captured question boundary, qualified when this read may be stale. */
  readonly scopeWords: string | null;
  /** The schedule the project is on — what the rows are placed by. */
  readonly active: CueSchedule;
  /** What the active schedule is called on the pill: `Fast`, `PRI` or `Time`. */
  readonly activeLabel: string;
  /** Fast first, then each objective, always all three. */
  readonly rows: readonly CueRow[];
  /**
   * The variants an explicit Retry may recover — `failed` and `corrupt`, and
   * neither `plan-infeasible` (a same-input solve returns the same certificate,
   * and the route answers 409 for it) nor `idle` (the cold read admits that).
   */
  readonly retryable: readonly ScheduleObjectiveView[];
  /**
   * The variant worth switching to, or `null` when none is.
   *
   * The rule, in one place (tasks.md 8b.7): a variant is suggested only when it
   * is `ready` and finishes earlier than **the active schedule** by more than
   * the workday drift. Reaching the same finish in a different order is a
   * preference rather than a gain, and a later finish is neither, so both are
   * readable on the rows and neither is urged here. Earlier than the *active*
   * schedule rather than than Fast, because the reader is being asked to change
   * what is on their screen: with PRI displayed and finishing three days before
   * Fast, a Time variant one day before Fast is a **regression**, and suggesting
   * it against Fast's figure would be this cue talking about a schedule nobody
   * is looking at.
   */
  readonly suggestion: ScheduleObjectiveView | null;
  /** The saving {@link CueReading.suggestion} is worth, in the pill's own words. */
  readonly suggestionWords: string | null;
  /** One sentence naming the active schedule and everything else worth saying. */
  readonly sentence: string;
  /**
   * How the two optimized variants compare with **each other**, or `null` when
   * fewer than two of them have an answer to compare.
   *
   * Its own line on the card because it is the comparison a reader actually
   * chooses between — Fast is the reference every figure is measured against,
   * but the decision is Pri or Time (Dany, 2026-09-08).
   *
   * The order half is derived from the two relations against Fast and says only
   * what those two can support: if both keep Fast's order they keep each
   * other's; if exactly one of them reorders, they differ from each other; if
   * **both** reorder, this cannot tell whether they reorder the same way, and
   * says so rather than guessing.
   */
  readonly variantContrast: string | null;
  /**
   * Whether this reading is of a plan that may have moved under it.
   *
   * Carried rather than left to the caller's own copy of the flag, because it
   * is what says the figures above are **absent on purpose**: a reader of
   * `rows` cannot otherwise tell a suppressed comparison from a variant that
   * has not solved.
   */
  readonly stale: boolean;
}

/** The finish of the schedule the project is on, which is Fast unless a variant displaced it. */
function activeFinish(optimization: PlanOptimizationView): number {
  if (optimization.displayed === 'fast') return optimization.finishDays.fast;
  const finish = optimization.finishDays[optimization.displayed];
  // Proof: restoring the Fast fallback failed the displayed connected objective missing-finish case (2026-10-22).
  if (optimization.scope !== undefined && finish === undefined) {
    throw new Error('Displayed connected schedule has no finish');
  }
  return finish ?? optimization.finishDays.fast;
}

/** Fast's own row: always present, never refused, nothing to compare itself with. */
function fastRow(optimization: PlanOptimizationView): CueRow {
  return {
    which: 'fast',
    details: connectedDetails(optimization, null),
    label: FAST_LABEL,
    finishDays: optimization.finishDays.fast,
    comparedWithFast: null,
    stateWords: null,
    refusedBecause:
      optimization.displayed === 'fast' ? 'Fast is already the active schedule' : null,
    retryable: false,
    unmeetable: null,
  };
}

function variantRow(optimization: PlanOptimizationView, objective: ScheduleObjectiveView): CueRow {
  const state = optimization.variants[objective];
  const finish = optimization.finishDays[objective];
  const sameOrder = optimization.sameOrderAsFast[objective];
  const stateWords = variantStateWords(
    state,
    optimization.generation !== null,
    optimization.scope !== undefined,
  );
  return {
    which: objective,
    details: connectedDetails(optimization, objective),
    label: OBJECTIVE_LABEL[objective],
    finishDays: finish ?? null,
    // Both halves or neither: the plan read sends a variant's finish and its
    // order relation together, and half a comparison is not one.
    comparedWithFast:
      finish === undefined || sameOrder === undefined
        ? null
        : qualifyComparison(
            optimization,
            comparisonWords(finish - optimization.finishDays.fast, sameOrder),
          ),
    stateWords,
    // Proof: replacing the non-ready refusal with null failed both terminal selection cases (2026-10-22).
    refusedBecause:
      optimization.displayed === objective
        ? `${OBJECTIVE_SENTENCE[objective]} is already the active schedule`
        : state.state === 'ready'
          ? null
          : // A schedule that does not exist cannot be displayed, and the state
            // is why. This is the one place the cue's menu gets its reasons from,
            // so an item is never removed from a menu somebody is reading.
            (stateWords ??
            (finish === undefined ? 'No optimized schedule for this plan yet' : null)),
    retryable: state.state === 'failed' || state.state === 'corrupt',
    unmeetable: state.state === 'plan-infeasible' ? state.items : null,
  };
}

/**
 * What the cue knows, from one plan read.
 *
 * Pure and separate from the component, because everything worth arguing about
 * here is arithmetic over three numbers: which schedule is on screen, which of
 * the other two is worth moving to, and what each of them is called. The
 * component below it places a pill, a menu and a card and decides nothing.
 */
export function cueReading(optimization: PlanOptimizationView, stale = false): CueReading {
  const measured = [fastRow(optimization), ...OBJECTIVES.map((o) => variantRow(optimization, o))];
  // A comparison against a plan that may have moved is a wrong number, and a
  // wrong number is worse than none: the shipped indicator suppressed it and
  // said so, and this keeps that decision (spec: "a stale plan qualifies the
  // selected state and any affected-item list rather than presenting either as
  // current"). The states and the affected items survive — they are facts about
  // a solve, and only their currency is in doubt.
  const rows: readonly CueRow[] = stale
    ? measured.map((row) => ({ ...row, comparedWithFast: null, finishDays: null }))
    : measured;
  const active = optimization.displayed;
  const onScreen = activeFinish(optimization);

  const better = OBJECTIVES.filter((objective) => {
    // Nothing is suggested off a comparison this read is not prepared to show.
    if (stale) return false;
    if (objective === active) return false;
    if (optimization.variants[objective].state !== 'ready') return false;
    const finish = optimization.finishDays[objective];
    if (finish === undefined) return false;
    return !withinDrift(finish - onScreen, 0) && finish < onScreen;
  }).sort((first, second) => finishOf(optimization, first) - finishOf(optimization, second));
  // The candidate and its saving together, because they are one fact: a
  // suggestion with no figure and a figure with nothing to suggest are both
  // states this cue has no words for.
  // `.at`, so the check below is a check: a plain index is typed non-optional
  // under this workspace's compiler options.
  const best = better.at(0);
  const suggested =
    best === undefined
      ? null
      : { objective: best, saving: finishOf(optimization, best) - onScreen };

  return {
    active,
    scopeWords: scopeWords(optimization, stale),
    activeLabel: active === 'fast' ? FAST_LABEL : OBJECTIVE_LABEL[active],
    rows,
    // Proof: adding boundary-infeasible here failed both terminal Retry absence cases (2026-10-22).
    retryable: OBJECTIVES.filter((objective) => {
      const state = optimization.variants[objective].state;
      return state === 'failed' || state === 'corrupt';
    }),
    stale,
    variantContrast: qualifyComparison(optimization, contrastWords(optimization, stale)),
    suggestion: suggested?.objective ?? null,
    suggestionWords:
      suggested === null
        ? null
        : `${OBJECTIVE_LABEL[suggested.objective]} ${days(suggested.saving)} earlier`,
    sentence: sentenceOf(optimization, rows, suggested, stale),
  };
}

/**
 * Pri against Time: the day difference between them, and whether they place the
 * shared slices the same way.
 *
 * `null` unless both are `ready` with a finish, because there is nothing to
 * contrast otherwise, and `null` while the plan may be stale, for the reason
 * every other comparison is suppressed there.
 */
function contrastWords(optimization: PlanOptimizationView, stale: boolean): string | null {
  if (stale) return null;
  const pri = optimization.finishDays.pri;
  const time = optimization.finishDays.time;
  if (pri === undefined || time === undefined) return null;
  if (optimization.variants.pri.state !== 'ready' || optimization.variants.time.state !== 'ready') {
    return null;
  }
  const gap = withinDrift(pri - time, 0)
    ? 'the same project deadline'
    : pri < time
      ? `Pri ${days(pri - time)} earlier`
      : `Time ${days(time - pri)} earlier`;
  const priKeepsOrder = optimization.sameOrderAsFast.pri;
  const timeKeepsOrder = optimization.sameOrderAsFast.time;
  const order =
    priKeepsOrder === undefined || timeKeepsOrder === undefined
      ? 'their order against each other is unknown'
      : priKeepsOrder && timeKeepsOrder
        ? 'in the same order as each other'
        : priKeepsOrder === timeKeepsOrder
          ? // Both reorder Fast, and two reorderings of one plan need not be the
            // same reordering: the wire carries each variant's relation to Fast
            // and nothing about the pair, so this says what it knows.
            'each in an order of its own'
          : 'in a different order from each other';
  return `Pri against Time: ${gap}, ${order}.`;
}

/**
 * A variant's project finish, where the caller has already established that it
 * has one.
 *
 * @throws Error when it does not. R5: every caller here has read the figure
 * through the same `finishDays` a line earlier, so an absent one is this
 * module contradicting itself rather than a state to model.
 */
function finishOf(optimization: PlanOptimizationView, objective: ScheduleObjectiveView): number {
  const finish = optimization.finishDays[objective];
  if (finish === undefined) throw new Error(`${objective} was compared without a finish`);
  return finish;
}

/**
 * The cue's one sentence: what is on screen, what is worth moving to, and what
 * is wrong.
 *
 * It is the pill's accessible name **and** the text of the cue's live region,
 * from this one function, because the two have to say the same thing: the pill
 * is a terse `Fast · PRI 3 days earlier` and a reader who cannot see it gets
 * this instead.
 */
function sentenceOf(
  optimization: PlanOptimizationView,
  rows: readonly CueRow[],
  suggested: { readonly objective: ScheduleObjectiveView; readonly saving: number } | null,
  stale: boolean,
): string {
  const activeLabel =
    optimization.displayed === 'fast' ? FAST_LABEL : OBJECTIVE_SENTENCE[optimization.displayed];
  const parts = [`${activeLabel} is the active schedule`];
  if (suggested !== null) {
    parts.push(
      `${OBJECTIVE_SENTENCE[suggested.objective]} finishes ${days(suggested.saving)} earlier`,
    );
  }
  for (const objective of OBJECTIVES) {
    const words = variantStateWords(
      optimization.variants[objective],
      optimization.generation !== null,
      optimization.scope !== undefined,
    );
    if (words !== null) parts.push(`${OBJECTIVE_SENTENCE[objective]}: ${words}`);
  }
  // Every row that is neither suggested nor broken still has a comparison worth
  // reading, and the sentence is where a reader who cannot see the menu gets
  // it. Only for a variant that is not the one already named above.
  for (const row of rows) {
    if (row.which === 'fast' || row.which === suggested?.objective) continue;
    if (row.comparedWithFast === null) continue;
    parts.push(`${OBJECTIVE_SENTENCE[row.which]}: ${row.comparedWithFast}`);
  }
  if (stale) {
    // Both sentences are the shipped indicator's own words. The second is only
    // said where there is a list to be stale about.
    parts.push(STALE_WORDS);
    if (rows.some((row) => row.unmeetable !== null)) {
      parts.push('This result and affected-item list may be stale');
    }
  }
  const scope = scopeWords(optimization, stale);
  if (scope !== null) parts.push(scope);
  if (optimization.scope !== undefined && !stale) {
    parts.push(
      optimization.displayed === 'fast'
        ? 'Fast is retained. Fast here is the retained placement at this captured stage'
        : `The selected ${OBJECTIVE_SENTENCE[optimization.displayed]} schedule remains displayed`,
    );
  }
  return `${parts.join('. ')}.`;
}

/** Comparisons apply only to alternatives for the same captured fixed boundary. */
function qualifyComparison(
  optimization: PlanOptimizationView,
  words: string | null,
): string | null {
  return words === null || optimization.scope === undefined
    ? words
    : `${words} · same captured stage with captured fixed positions`;
}

/** Unknown internal scope discriminators must reach the application fault boundary. */
function scopeWords(optimization: PlanOptimizationView, stale: boolean): string | null {
  const scope = optimization.scope;
  if (scope === undefined) return null;
  switch (scope.kind) {
    // Internal render boundary: corrupted runtime discriminators must throw even though the decoded union has one scope kind.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    case 'connected-stage':
      return stale
        ? `Project ${scope.projectId}: This certificate and captured boundary may be stale. The displayed dates are from the last plan read`
        : `Project ${scope.projectId}: comparisons apply to the same captured stage with captured fixed positions only`;
    default: {
      // Proof: returning null admitted an unknown scope in connected captured cue reading (2026-10-22).
      const _exhaustive: never = scope.kind;
      throw new Error(`Unknown optimization scope: ${String(_exhaustive)}`);
    }
  }
}

/** Captured positions retain their full precision and identities; no row numbering is invented. */
function connectedDetails(
  optimization: PlanOptimizationView,
  objective: ScheduleObjectiveView | null,
): readonly string[] {
  const scope = optimization.scope;
  if (scope === undefined) return [];
  const details = [
    `Target project ${scope.projectId}; ${objective === null ? 'Fast retained stage baseline' : OBJECTIVE_SENTENCE[objective]}; captured fixed positions`,
    `Quantum ${String(scope.quantum)}; wire version ${String(scope.wireVersion)}; contract ${optimization.contractVersion}`,
    ...scope.fixed.map(
      (fixed) =>
        `${fixed.projectName} (${fixed.projectAbbreviation}, ${fixed.projectId}) / ${fixed.workItemName} (${fixed.workItemId}) / ${fixed.stepName ?? 'whole work item'} (${fixed.stepId ?? 'whole work item'}): start ${String(fixed.start)}, finish ${String(fixed.finish)} workdays from the captured component origin`,
    ),
  ];
  if (objective !== null) {
    const variant = optimization.variants[objective];
    if (variant.state === 'boundary-infeasible') {
      details.push(evidenceWords(variant.certificate.evidence));
      details.push(`Question hash ${variant.certificate.question.questionHash}`);
    }
  }
  return details;
}

/** Terminal evidence describes only the captured question, never the entire real plan. */
function evidenceWords(
  evidence: Extract<
    ConnectedPlanOptimizationView['variants']['pri'],
    { state: 'boundary-infeasible' }
  >['certificate']['evidence'],
): string {
  switch (evidence) {
    case 'contradictory-bounds':
      return 'The rounded bounds leave no feasible integer window for this captured question';
    case 'initial-model-infeasible':
      return 'The solver reported the initial fixed-boundary model infeasible';
    default: {
      // Proof: returning empty words admitted unknown terminal evidence in connected captured cue reading (2026-10-22).
      const _exhaustive: never = evidence;
      throw new Error(`Unknown optimization evidence: ${String(_exhaustive)}`);
    }
  }
}
