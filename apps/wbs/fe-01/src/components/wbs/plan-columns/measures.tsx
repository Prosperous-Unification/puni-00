import type { MeasureDefinitionView } from '@/lib/wbs-api';

import {
  basisWords,
  facetsOf,
  formatMeasureValue,
  measureColumnId,
  type MeasureFacet,
  type MeasureFigure,
  measureFiguresOf,
  mixedSentence,
  unitLabelOf,
} from '../measure-reading';
import { column } from './column';

/** The short word each facet is headed by, under the measure's name. */
const FACET_WORDS: Readonly<Record<MeasureFacet, string>> = {
  estimate: 'expected',
  fact: 'fact',
  variance: 'variance',
};

/** What a dash stands for, per facet: absence said out loud, never zero. */
const ABSENT_WORDS: Readonly<Record<MeasureFacet, string>> = {
  estimate: 'No estimate in this measure.',
  fact: 'Nothing recorded in this measure.',
  variance: 'No variance: no step holds both a fact and an estimate in this measure.',
};

/**
 * One measure figure in a cell.
 *
 * Absent is a dash with its reason on the hover, as the Slack column draws a
 * row with nothing to show. A mixed money sum is a marker naming its bases and
 * never a number (design D44). A legacy single figure carries a dot. A money
 * figure on one basis names it on the hover.
 */
export function MeasureFigureText({
  figure,
  definition,
  facet,
}: {
  figure: MeasureFigure;
  definition: MeasureDefinitionView;
  facet: MeasureFacet;
}) {
  switch (figure.kind) {
    case 'absent':
      return (
        <span
          data-measure-figure="absent"
          data-fact={ABSENT_WORDS[facet]}
          className="text-quiet-ink"
        >
          —
        </span>
      );
    case 'mixed':
      return (
        <span
          data-measure-figure="mixed"
          data-fact={mixedSentence(figure.bases)}
          className="rounded-sm border border-dashed px-1 text-[0.6875rem] font-medium"
          style={{ borderColor: 'var(--status-in-progress)', color: 'var(--status-in-progress)' }}
        >
          mixed cards
        </span>
      );
    case 'value': {
      const text = formatMeasureValue(figure.value, definition, facet === 'variance');
      const said = [
        facet === 'fact' && definition.derived ? 'Derived from ended attempts; never typed.' : null,
        figure.singlePoint ? 'A single legacy figure, not three points.' : null,
        figure.basis === null ? null : `Priced on ${basisWords(figure.basis)}.`,
      ].filter((sentence) => sentence !== null);
      return (
        <span
          data-measure-figure="value"
          data-fact={said.length === 0 ? undefined : said.join(' ')}
          className="tabular-nums"
          style={
            facet === 'variance' && figure.value !== 0
              ? {
                  color: figure.value > 0 ? 'var(--status-blocked)' : 'var(--status-done)',
                }
              : undefined
          }
        >
          {text}
          {figure.singlePoint && (
            <>
              <span data-single-point aria-hidden="true" className="text-quiet-ink ml-0.5">
                ·
              </span>
              <span className="sr-only"> (a single legacy figure)</span>
            </>
          )}
        </span>
      );
    }
  }
}

/**
 * The columns of the measures this reader has on the table, each definition's
 * facets in order (`wbs-measure-budgets` D7).
 *
 * Display columns: a figure here is read, never typed, because one cell sums a
 * row's steps and a step's trio, fact or budget is edited in the Measures panel
 * where its step is named. The heading carries the measure's name over its
 * facet and unit; money's unit is its currency.
 */
export function createMeasureColumns(definitions: readonly MeasureDefinitionView[]) {
  return definitions.flatMap((definition) =>
    facetsOf(definition).map((facet) =>
      column.display({
        id: measureColumnId(definition.key, facet),
        meta: {
          spokenHeading: `${definition.name} ${FACET_WORDS[facet]} (${unitLabelOf(definition)})`,
        },
        header: () => (
          <span data-measure-heading className="flex flex-col items-end text-right leading-tight">
            <span className="truncate font-medium">{definition.name}</span>
            <span className="text-quiet-ink truncate text-[0.6875rem] font-normal">
              {FACET_WORDS[facet]} · {unitLabelOf(definition)}
            </span>
          </span>
        ),
        // Right-aligned with tabular numerals, so figures compare down a column.
        cell: ({ row }) => (
          <span data-measure-cell className="block text-right tabular-nums">
            <MeasureFigureText
              figure={measureFiguresOf(row.original, definition)[facet]}
              definition={definition}
              facet={facet}
            />
          </span>
        ),
      }),
    ),
  );
}
