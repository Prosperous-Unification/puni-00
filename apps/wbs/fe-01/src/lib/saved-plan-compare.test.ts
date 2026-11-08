import { describe, expect, it } from 'vitest';

import type { PlanDifferenceView, PlanDiffView, SavedPlanSideRef } from './saved-plan-api';
import {
  CATEGORY_ORDER,
  COMPARE_SAME_SIDE,
  compareRefusal,
  diffIsEmpty,
  diffValueWords,
  groupByCategory,
  sameSide,
} from './saved-plan-compare';

const SAVED: SavedPlanSideRef = { saved: 'sp1' };
const diff = (
  schedule: PlanDifferenceView[] = [],
  input: PlanDifferenceView[] = [],
): PlanDiffView => ({ input, schedule });
const dates = (path: string, left: unknown, right: unknown): PlanDifferenceView => ({
  category: 'dates',
  path,
  left,
  right,
});

describe('what the pickers may ask for', () => {
  it('refuses two sides that name the same plan', () => {
    expect(compareRefusal('current', 'current')).toBe('same_side');
    expect(compareRefusal(SAVED, { saved: 'sp1' })).toBe('same_side');
    expect(COMPARE_SAME_SIDE).toContain('two different');
  });

  it('allows a saved plan against the live one, in either order', () => {
    expect(compareRefusal(SAVED, 'current')).toBeNull();
    expect(compareRefusal('current', SAVED)).toBeNull();
    expect(compareRefusal(SAVED, { saved: 'sp2' })).toBeNull();
    expect(sameSide(SAVED, 'current')).toBe(false);
  });
});

describe('the diff, by category', () => {
  it('covers every category be-01 can emit, exactly once', () => {
    // A ratchet, like the schema checks upstream: the count moves only when
    // somebody means it to. `CATEGORY_RANK` is a `Record` over the union, so a
    // category added in `libs/wbs/domain/domain` is a typecheck failure here rather than a
    // difference that silently sorts to the end.
    expect(CATEGORY_ORDER).toHaveLength(27);
    expect(new Set(CATEGORY_ORDER).size).toBe(27);
    expect(CATEGORY_ORDER[0]).toBe('added');
    expect(CATEGORY_ORDER.at(-1)).toBe('other');
  });

  it('renders in category order and drops the categories nothing landed in', () => {
    const notes: PlanDifferenceView = { category: 'notes', path: 'a', left: 1, right: 2 };
    const added: PlanDifferenceView = { category: 'added', path: 'b', left: null, right: {} };
    const groups = groupByCategory([notes, added]);
    expect(groups.map((group) => group.category)).toEqual(['added', 'notes']);
    expect(groups).toHaveLength(2);
  });

  it('keeps the diff’s own order inside a group', () => {
    const first: PlanDifferenceView = { category: 'estimates', path: 'w1', left: 1, right: 2 };
    const second: PlanDifferenceView = { category: 'estimates', path: 'w2', left: 3, right: 4 };
    expect(groupByCategory([first, second])[0]?.differences).toEqual([first, second]);
  });

  it('files an unrecognised category under other rather than ahead of everything', () => {
    // Unreachable through be-01, which emits the union. It is asserted because
    // the natural implementation — rank lookup with `?? -1` — sorts an unknown
    // category to the FRONT of the list, which is the loudest possible place
    // for the one heading this build cannot explain.
    //
    // Negative, MEASURED on h2puni at c48466ce and reverted with dirty=0
    // re-asserted: keep `difference.category` unmapped and sort the observed
    // keys by `CATEGORY_RANK[c] ?? -1`, and this file is 14 pass / 1 fail —
    // this case, `[ 'sideways', 'notes' ]` where `[ 'notes', 'other' ]` was
    // expected. The rogue heading led the list, exactly as predicted.
    const rogue = {
      category: 'sideways',
      path: 'x',
      left: 1,
      right: 2,
    } as unknown as PlanDifferenceView;
    const known: PlanDifferenceView = { category: 'notes', path: 'y', left: 1, right: 2 };
    expect(groupByCategory([rogue, known]).map((group) => group.category)).toEqual([
      'notes',
      'other',
    ]);
  });

  it('reports an empty comparison from both halves, not one', () => {
    expect(diffIsEmpty(diff())).toBe(true);
    expect(diffIsEmpty(diff([dates('schedule.present', true, false)]))).toBe(false);
    expect(diffIsEmpty(diff([], [{ category: 'notes', path: 'a', left: 1, right: 2 }]))).toBe(
      false,
    );
  });
});

describe('how one side of a difference reads', () => {
  it('gives a scalar back exactly, because the scalar IS the change', () => {
    // The whole point of I6: a rename is only worth a line if the line carries
    // the two names. A number is not quoted and a string is, so `"12"` on a
    // renamed field is distinguishable from `12` on a changed estimate.
    expect(diffValueWords('Design')).toBe('"Design"');
    expect(diffValueWords('')).toBe('""');
    expect(diffValueWords(12)).toBe('12');
    expect(diffValueWords(0)).toBe('0');
    expect(diffValueWords(-1.5)).toBe('-1.5');
    expect(diffValueWords(true)).toBe('true');
    expect(diffValueWords(false)).toBe('false');
  });

  it('keeps a missing field and an emptied field apart', () => {
    // Two different facts. `undefined` is the counterpart side of an added or
    // removed row, and every field one side never carried; `null` is a field
    // the side carries with nothing in it, which is what `scheduleAbsentReason`
    // stores on a plan that scheduled cleanly. One word for both would report a
    // deleted field and a cleared field as the same change.
    expect(diffValueWords(undefined)).toBe('absent');
    expect(diffValueWords(null)).toBe('none');
  });

  it('renders a composite by shape and never by its JSON', () => {
    // An added work item arrives here as the whole row. Serialised it is longer
    // than the panel; clipped mid-object it looks like data and parses as none.
    expect(diffValueWords({ id: 'w1', name: 'Design' })).toBe('2 fields');
    expect(diffValueWords({ id: 'w1' })).toBe('1 field');
    expect(diffValueWords({})).toBe('no fields');
    expect(diffValueWords(['a', 'b', 'c'])).toBe('3 entries');
    expect(diffValueWords(['a'])).toBe('1 entry');
    expect(diffValueWords([])).toBe('no entries');
  });

  it('clips a long string inside its own quotes', () => {
    // Inside, so a clipped note cannot be read as the whole stored note: the
    // closing quote is the promise that the value ended, and an ellipsis
    // outside it would break that promise silently.
    const long = 'x'.repeat(200);
    const words = diffValueWords(long);
    expect(words).toBe(`"${'x'.repeat(80)}…"`);
    expect(words.endsWith('…"')).toBe(true);
    // A string that exactly fills the budget is NOT clipped — an off-by-one
    // here would put an ellipsis on a value that is whole.
    expect(diffValueWords('y'.repeat(80))).toBe(`"${'y'.repeat(80)}"`);
  });

  it('says something rather than throwing on a value JSON cannot hold', () => {
    // Unreachable from be-01, which answers JSON. It exists because the
    // alternative to a sentence here is an exception inside a `.map()`, which
    // takes down every other difference in the panel.
    expect(diffValueWords(() => 1)).toBe('a value');
  });
});
