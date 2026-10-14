/**
 * What an undated Start or End cell says about its figure: which day of the
 * plan it is, and the one thing that turns it into a date (review of PR #409,
 * F-032). `day 6` alone read as a figure with no cue that a start date is
 * missing; the header hint was the only place that said so.
 *
 * `null` for a cell that is dated, or that has no schedule to count (`—`).
 * Read by the End cell's fact and the Start cell's sentence
 * ({@link readStartSentence}).
 */
export function undatedDayWords(printed: { text: string; iso: string | null }): string | null {
  // `day …` with no day in full is exactly the undated case: a schedule that
  // could not be computed prints `—`, and a dated one carries its `iso`.
  if (printed.iso !== null || !printed.text.startsWith('day ')) return null;
  return `Day ${printed.text.slice('day '.length)} of the plan, in workdays. Set Starts in the toolbar to see a date.`;
}

/** What the `?` after an End means, said where the `?` is. */
export const UNESTIMATED_END_WORDS =
  'No estimate yet: the ? marks an end worked out without one, so it will move once somebody estimates.';
