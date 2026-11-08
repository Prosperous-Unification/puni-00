import { expect, test } from 'bun:test';

import { arrangeInSlots } from './arrange-siblings';

const row = (id: string, position: number, parentId: string | null = null) => ({
  id,
  position,
  parentId,
});
const starts = new Map([
  ['early', { earliestStart: 0 }],
  ['late', { earliestStart: 1 }],
]);

test.each([-Number.MAX_VALUE, Number.MAX_VALUE])(
  'slot allocator never emits a nonfinite position beside %s',
  (anchor) => {
    const held = row(anchor > 0 ? 'a-held' : 'z-held', anchor);
    const late = row('late', anchor);
    const early = row('early', anchor);
    const rows = anchor > 0 ? [held, early, late] : [early, late, held];
    expect(
      arrangeInSlots(
        rows,
        [early, late],
        new Map([
          ['early', { earliestStart: 1 }],
          ['late', { earliestStart: 0 }],
        ]),
      ),
    ).toEqual({ ok: false });
  },
);

test('slot allocator preserves held child slots at every depth', () => {
  const parent = row('parent', 10);
  const late = row('late', 100, 'parent');
  const held = row('held', 200, 'parent');
  const early = row('early', 300, 'parent');
  const allocated = arrangeInSlots(
    [parent, late, held, early],
    [parent, late, early],
    new Map([...starts, ['parent', { earliestStart: 0 }]]),
  );
  expect(allocated).toEqual({
    ok: true,
    arrangement: {
      placements: [row('early', 100, 'parent'), row('late', 300, 'parent')],
      moved: ['early', 'late'],
    },
  });
});
