import type { AttemptView, NodeReadingView, PersonView } from '@/lib/wbs-api';

import { NODE_READING_GLYPH, readingWords } from './status-cell';
import { NODE_READING_TOKEN } from './status-palette';
import type { TreeRow } from './wbs-rows';

/**
 * One leaf node's reading and what its step card says about its attempts
 * (`step-node-readings` D4). Absent — `null` on the estimate reading — for a
 * parent, and for a read from a be-01 that sends no `nodeReadings`.
 */
export interface StepNodeReadings {
  reading: NodeReadingView;
  /** Ascending attempt number, as the read sends them; empty when nobody has attempted the node. */
  attempts: readonly AttemptView[];
  /**
   * The latest attempt's executor by directory name: `null` when there is no
   * attempt or it names nobody, `(unknown)` for a person the directory has not
   * got — {@link usePlanAssignments}'s word for an assignee it cannot name.
   */
  executorName: string | null;
}

/**
 * The reading of one leaf's node on one step, off the row the read delivered.
 *
 * @throws Error when the leaf carries readings but none for this step: be-01
 * reads every node of a leaf, so a gap is a malformed read, routed to the
 * Error Boundary like a missing step node.
 */
export function stepNodeReadingsOf(
  row: TreeRow,
  stepId: string,
  peopleById: ReadonlyMap<string, PersonView>,
): StepNodeReadings | null {
  if (row.rolledUp || row.nodeReadings === undefined) return null;
  const reading = row.nodeReadings[stepId];
  if (reading === undefined) {
    throw new Error(`Missing node reading for leaf ${row.id} and step ${stepId}`);
  }
  const attempts = row.attempts?.[stepId] ?? [];
  const executor = attempts.at(-1)?.executorPersonId ?? null;
  return {
    reading,
    attempts,
    executorName: executor === null ? null : (peopleById.get(executor)?.name ?? '(unknown)'),
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

/** The 10px of the corner glyph, and the room the cell keeps for it on its right. */
export const READING_CORNER_PX = 10;

/**
 * A step cell's node reading, in its top-right corner: the glyph in the
 * reading's palette token, and its words for assistive tech under `id`, which
 * the cell's box points `aria-describedby` at.
 *
 * Absolutely placed and pointer-transparent, so it takes no width from the
 * figure, no click from the box and no stop in the keyboard grid; the cell
 * keeps {@link READING_CORNER_PX} of right padding so it never sits over a
 * number or the assignee's initials.
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
        lineHeight: 1,
        fontWeight: 400,
        pointerEvents: 'none',
        color: NODE_READING_TOKEN[reading] ?? 'var(--muted-foreground)',
      }}
    >
      <span aria-hidden="true">{NODE_READING_GLYPH[reading]}</span>
      <span id={id} className="sr-only">
        {readingWords(reading)}
      </span>
    </span>
  );
}
