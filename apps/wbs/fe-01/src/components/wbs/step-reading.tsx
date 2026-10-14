import type { AttemptView, NodeReadingView, PersonView } from '@/lib/wbs-api';

import { NODE_READING_GLYPH, readingWords } from './status-cell';
import { NODE_READING_TOKEN } from './status-palette';
import { stepBlockageOf, type StepBlockageReading } from './step-blockage';
import type { TreeRow } from './wbs-rows';

/**
 * One leaf node's reading and what its step card says about its attempts
 * (`step-node-readings` D4). Absent — `null` on the estimate reading — for a
 * parent, and for a read from a be-01 that sends no `nodeReadings`.
 */
export interface StepNodeReadings {
  reading: NodeReadingView;
  blockage?: StepBlockageReading | null;
  /** Ascending attempt number, as the read sends them; empty when nobody has attempted the node. */
  attempts: readonly AttemptView[];
  /**
   * The latest attempt's executor by directory name: `null` when there is no
   * attempt or it names nobody, `(unknown)` for a person the directory has not
   * got — {@link usePlanAssignments}'s word for an assignee it cannot name.
   */
  executorName: string | null;
  /** Each attempt's executor by the same rule, by attempt number. */
  executorNames: ReadonlyMap<number, string | null>;
  /**
   * The project's IANA zone the attempts are printed in
   * (`step-node-attempts` D3). `null` from a be-01 whose tree read predates
   * the zone: the card then leaves its attempt list and actions out rather
   * than print instants in a zone nobody chose ({@link AttemptsSection}).
   */
  timezone: string | null;
}

/**
 * One leaf node's reading word alone: `null` for a parent, and for a read from
 * a be-01 that sends no `nodeReadings`.
 *
 * @throws Error when the leaf carries readings but none for this step, for
 * {@link stepNodeReadingsOf}'s reason.
 */
export function nodeReadingOf(row: TreeRow, stepId: string): NodeReadingView | null {
  if (row.rolledUp || row.nodeReadings === undefined) return null;
  const reading = row.nodeReadings[stepId];
  if (reading === undefined) {
    throw new Error(`Missing node reading for leaf ${row.id} and step ${stepId}`);
  }
  return reading;
}

/**
 * The reading of one leaf's node on one step, off the row the read delivered.
 *
 * @throws Error when the leaf carries readings but none for this step: be-01
 * reads every node of a leaf, so a gap is a malformed read, routed to the
 * Error Boundary like a missing step node. Supported blockage metadata also
 * requires readings; only a genuinely older read may omit all three collections.
 */
export function stepNodeReadingsOf(
  row: TreeRow,
  stepId: string,
  peopleById: ReadonlyMap<string, PersonView>,
  timezone: string | null,
  causeLabels: ReadonlyMap<string, string> = new Map(),
): StepNodeReadings | null {
  // Proof: validating after the null return made `rejects supported blockage metadata without node readings through the public projection` not throw, and the preview browser `supported blockage facts without node readings reach the Error Boundary` render unknown instead (2026-10-14).
  const blockage = stepBlockageOf(row, stepId, causeLabels);
  const reading = nodeReadingOf(row, stepId);
  if (reading === null) return null;
  const attempts = row.attempts?.[stepId] ?? [];
  const nameOf = (executor: string | null): string | null =>
    executor === null ? null : (peopleById.get(executor)?.name ?? '(unknown)');
  return {
    reading,
    blockage,
    attempts,
    executorName: nameOf(attempts.at(-1)?.executorPersonId ?? null),
    executorNames: new Map(
      attempts.map((attempt) => [attempt.attemptNumber, nameOf(attempt.executorPersonId)]),
    ),
    timezone,
  };
}

/** The outcome word a card's attempt line ends on. */
const OUTCOME_WORD: Readonly<Record<NonNullable<AttemptView['outcome']>, string>> = {
  succeeded: 'succeeded',
  failed: 'failed',
  cancelled: 'cancelled',
};

/**
 * The card's attempt line: `3 attempts, last cancelled`, `1 attempt, last
 * failed`, `2 attempts, one running`; `null` with no attempts, so the line is
 * left out rather than saying "0 attempts".
 */
export function attemptsLine(attempts: readonly AttemptView[]): string | null {
  const last = attempts.at(-1);
  if (last === undefined) return null;
  const count = `${String(attempts.length)} ${attempts.length === 1 ? 'attempt' : 'attempts'}`;
  return last.outcome === null
    ? `${count}, one running`
    : `${count}, last ${OUTCOME_WORD[last.outcome]}`;
}

/**
 * The card's line after it: who made the latest attempt and the reference it
 * carries — `By Ada Lovelace · PR-42` — either half alone, or `null` with
 * neither.
 */
export function lastAttemptLine(node: StepNodeReadings): string | null {
  const reference = node.attempts.at(-1)?.reference ?? null;
  const by = node.executorName === null ? null : `By ${node.executorName}`;
  if (by === null) return reference;
  return reference === null ? by : `${by} · ${reference}`;
}

/** The 10px of the corner's line box, and the room the cell keeps for it on its right. */
export const READING_CORNER_PX = 10;

/**
 * Each reading glyph's font size, chosen so every glyph reads about one size.
 *
 * The rings are drawn small in their fonts: DejaVu Sans, which `sans-serif`
 * resolves to for these on a Linux Chromium (`fc-match`, 2026-10-12), inks `◐` 6×5 and `○` 5×4 at 10px against
 * `◇` 8×9 and `✓` 6×7. At 14px the two rings ink 7×7 and advance 8.5px, inside
 * the {@link READING_CORNER_PX} the cell keeps plus the corner's 2px overhang.
 */
export const READING_GLYPH_PX: Readonly<Record<NodeReadingView, number>> = {
  skipped: READING_CORNER_PX,
  done: READING_CORNER_PX,
  on_hold: READING_CORNER_PX,
  blocked: READING_CORNER_PX,
  in_progress: 14,
  blocked_by_proxy: READING_CORNER_PX,
  waiting: READING_CORNER_PX,
  unknown: 14,
};

/**
 * The glyph and its words: the glyph at {@link READING_GLYPH_PX} — in pixels in
 * a corner, or as a multiple of the surrounding text where the reading sits in
 * a line, so the rings keep the same proportion to `◇` there — and the words
 * said to assistive tech as `Reading: <Word>`, under `id` when the caller
 * points `aria-describedby` at it.
 */
function ReadingMark({
  id,
  reading,
  relative = false,
}: {
  id?: string;
  reading: NodeReadingView;
  blockage?: StepBlockageReading | null;
  relative?: boolean;
}) {
  const size = READING_GLYPH_PX[reading];
  return (
    <>
      <span
        aria-hidden="true"
        style={{ fontSize: relative ? `${String(size / READING_CORNER_PX)}em` : size }}
      >
        {NODE_READING_GLYPH[reading]}
      </span>
      <span id={id} className="sr-only">
        {readingWords(reading)}
      </span>
    </>
  );
}

/**
 * A step cell's node reading, in its top-right corner: the glyph in the
 * reading's palette token, and its words for assistive tech under `id`, which
 * the cell's box points `aria-describedby` at.
 *
 * Absolutely placed and pointer-transparent, so it takes no width from the
 * figure, no click from the box and no stop in the keyboard grid; the cell
 * keeps {@link READING_CORNER_PX} of right padding so it never sits over a
 * number or the assignee's initials. The line box stays
 * {@link READING_CORNER_PX} tall whatever the glyph's size, so a larger ring
 * is centred where a 10px glyph sits instead of pushing the corner down.
 */
export function StepReadingCorner({ id, reading }: { id: string; reading: NodeReadingView }) {
  return (
    <span
      data-node-reading={reading}
      style={{
        position: 'absolute',
        top: -1,
        right: -2,
        fontSize: READING_CORNER_PX,
        lineHeight: `${String(READING_CORNER_PX)}px`,
        fontWeight: 400,
        pointerEvents: 'none',
        color: NODE_READING_TOKEN[reading] ?? 'var(--muted-foreground)',
      }}
    >
      <ReadingMark id={id} reading={reading} />
    </span>
  );
}

/**
 * A step line's node reading on a phone card (`step-node-readings` D4): the
 * corner's glyph and words, in line after the step's estimate, since the card
 * lists the steps one per line and has no corner to spare.
 */
export function StepReadingInline({ reading }: { reading: NodeReadingView }) {
  return (
    <span
      data-card-reading={reading}
      className="shrink-0 text-sm"
      style={{ color: NODE_READING_TOKEN[reading] ?? 'var(--muted-foreground)' }}
    >
      <ReadingMark reading={reading} relative />
    </span>
  );
}
