import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { DependencyReach } from '@wbs/domain/dependency-reach';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { StepView } from '@/lib/wbs-api';

import { StepsPanel } from './steps-panel';
import type * as TableFrame from './table-frame';
import { foldedTableMinWidth, type FrameLayoutState, INITIAL_HIDDEN_COLUMNS } from './table-frame';

/**
 * The width module with its folded-minimum function watched.
 *
 * Spied rather than replaced — the real arithmetic still runs, and every other
 * assertion here still reads the real number. The one thing a spy adds is the
 * only thing nothing else can see: **which ids** the panel resolved against.
 * `<stepId>-final` is 96px whatever the step is called, so a stand-in id and a
 * real one produce the same figure and no rendered output can tell them apart.
 */
vi.mock('./table-frame', async (importOriginal) => {
  const actual = await importOriginal<typeof TableFrame>();
  return { ...actual, foldedTableMinWidth: vi.fn(actual.foldedTableMinWidth) };
});

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

afterEach(cleanup);

const DEV: StepView = {
  estimateUnit: 'workdays' as const,
  id: 'step-dev',
  name: 'Dev',
  allowancePercent: 0,
};
const QA: StepView = {
  estimateUnit: 'workdays' as const,
  id: 'step-qa',
  name: 'QA',
  allowancePercent: 0,
};

/** A plan where no row sets an earliest start, which is what a fresh work package is. */
const UNDATED: FrameLayoutState = {
  hasAnyNotBefore: false,
  deepestDepth: 0,
  numberingFrozen: false,
  widestDependencyChip: null,
  waitsForSeveral: false,
};
/** And one where somebody has, which is 28px wider. */
const DATED: FrameLayoutState = {
  hasAnyNotBefore: true,
  deepestDepth: 0,
  numberingFrozen: false,
  widestDependencyChip: null,
  waitsForSeveral: false,
};

/**
 * Everything the panel is given, with each call recorded.
 *
 * Rendered bare, without the modal around it: this suite is about what the
 * section sends and says, and `work-package-settings-modal.test.tsx` is about the
 * shell — who opens it, who closes it, what it refuses to close over and where
 * the focus goes afterwards. Two cases that used to live here, `gives the focus
 * back to the button that opened it` and `leaves no half-answered confirmation
 * behind`, were about the shell and moved there with it.
 */
function stubbed(overrides: Partial<Parameters<typeof StepsPanel>[0]> = {}) {
  const setStepAllowance = vi.fn(() => Promise.resolve({ ...QA, allowancePercent: 30 }));
  const setDepReach = vi.fn(() => Promise.resolve());
  const onChanged = vi.fn(() => Promise.resolve());
  const onDirtyChange = vi.fn();
  const props = {
    steps: [DEV, QA],
    estimateCounts: { 'step-dev': 0, 'step-qa': 0 },
    setStepUnit: vi.fn(() => Promise.resolve(QA)),
    depReach: 'whole-item' as DependencyReach,
    setDepReach,
    frameState: UNDATED,
    // The table's own default, so every figure below is the default table's.
    hiddenColumnIds: INITIAL_HIDDEN_COLUMNS,
    setStepAllowance,
    onChanged,
    onDirtyChange,
    ...overrides,
  };
  render(<StepsPanel {...props} />);
  return {
    setStepAllowance,
    setDepReach,
    onChanged,
    onDirtyChange,
    props,
  };
}

/** Lets the two awaits every change makes — the call, then the reread — settle. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resume) => setTimeout(resume, 0));
  });
}

const type = (label: string, value: string): void => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

describe('the steps a work package holds', () => {
  itDom('commits a changed allowance and rereads the plan', async () => {
    const stub = stubbed();
    type('QA allowance (%)', '30');
    fireEvent.keyDown(screen.getByLabelText('QA allowance (%)'), { key: 'Enter' });
    await settle();
    expect(stub.setStepAllowance).toHaveBeenCalledWith('step-qa', 30);
    expect(stub.onChanged).toHaveBeenCalled();
  });

  itDom('refuses a fractional hundredth overflow locally', async () => {
    const stub = stubbed();
    type('QA allowance (%)', '30.001');
    fireEvent.blur(screen.getByLabelText('QA allowance (%)'));
    await settle();
    expect(stub.setStepAllowance).not.toHaveBeenCalled();
    expect(screen.getByText(/invalid allowance/i)).toBeInTheDocument();
  });

  itDom.each(['', '-1', '1000.01', '30.001', 'Infinity'])(
    'refuses %s without sending it',
    async (typed) => {
      const stub = stubbed();
      type('QA allowance (%)', typed);
      fireEvent.blur(screen.getByLabelText('QA allowance (%)'));
      await settle();
      expect(screen.getByText(/invalid allowance/i)).toBeInTheDocument();
      expect(stub.setStepAllowance).not.toHaveBeenCalled();
    },
  );

  itDom('shows a server allowance refusal on the settings surface', async () => {
    const stub = stubbed({
      setStepAllowance: vi.fn(() => Promise.reject(new Error('invalid_allowance'))),
    });
    type('QA allowance (%)', '30');
    fireEvent.blur(screen.getByLabelText('QA allowance (%)'));
    await settle();
    expect(screen.getByText(/invalid allowance/i)).toBeInTheDocument();
    expect(stub.onChanged).not.toHaveBeenCalled();
  });

  itDom('says why an allowance past the calendar was refused', async () => {
    const stub = stubbed({
      setStepAllowance: vi.fn(() => Promise.reject(new Error('calendar_range'))),
    });
    type('QA allowance (%)', '1000');
    fireEvent.blur(screen.getByLabelText('QA allowance (%)'));
    await settle();
    expect(screen.getByText(/past the last date the calendar supports/i)).toBeInTheDocument();
    expect(stub.onChanged).not.toHaveBeenCalled();
  });

  itDom('does not send an unchanged allowance', async () => {
    const stub = stubbed();
    type('QA allowance (%)', '0.00');
    expect(stub.onDirtyChange).toHaveBeenLastCalledWith(true);
    fireEvent.blur(screen.getByLabelText('QA allowance (%)'));
    await settle();
    expect(stub.setStepAllowance).not.toHaveBeenCalled();
    expect(stub.onDirtyChange).toHaveBeenLastCalledWith(false);
  });
  itDom('quotes the folded width of the columns actually on screen', () => {
    // `configurable-columns`: a reader who has hidden Depends on is 86px
    // narrower than the default table, and the sentence has to say so — the
    // spy is what sees **which** hidden list the figure was resolved against,
    // since a stand-in list and the real one print the same kind of number.
    stubbed({ hiddenColumnIds: ['depends'] });
    const spy = vi.mocked(foldedTableMinWidth);
    expect(spy).toHaveBeenLastCalledWith(['step-dev', 'step-qa'], UNDATED, ['depends']);
    const quoted = String(foldedTableMinWidth(['step-dev', 'step-qa'], UNDATED, ['depends']));
    expect(screen.getByText(new RegExp(`≥\\s*${quoted}px`))).toBeInTheDocument();
    // Proof: `hiddenColumnIds` not passed through to `foldedTableMinWidth`,
    // this failed on `expected "vi.fn" to be called with arguments: [ [ 'step-
    // dev', 'step-qa' ], …, [ 'depends' ] ]`. Watched, 2026-08-28.
  });

  itDom('says nothing on this panel that reads Phase or Role', () => {
    // The panel's own surface. What it is *called* is the settings modal's tab,
    // asserted in `work-package-settings-modal.test.tsx` — this panel renders no
    // title of its own since `work-package-config-modal` split it out of the dialog
    // it used to be. `Phase` was the word on every control here until
    // `steps-not-phases`, and `Role` was the same thing below.
    stubbed();

    const drawn = document.body.textContent;
    expect(drawn).not.toMatch(/phase|role/i);
    // Non-vacuous: the panel really drew its controls, so an empty match is a
    // reading rather than an empty page.
    expect(screen.getByRole('radio', { name: 'Dev minutes' })).toBeDefined();
    expect(drawn).toContain('Dev');
  });

  itDom('lists every step with its immutable name and package-local values', () => {
    stubbed();
    expect(screen.getByText('Dev')).toBeDefined();
    expect(screen.getByText('QA')).toBeDefined();
    expect(screen.queryByRole('textbox', { name: 'QA' })).toBeNull();
    expect(screen.getByLabelText('QA allowance (%)')).toBeDefined();
  });

  itDom('Escape in an allowance box forgets what was typed and sends nothing (F-162)', async () => {
    const stub = stubbed();
    type('QA allowance (%)', '30');
    fireEvent.keyDown(screen.getByLabelText('QA allowance (%)'), { key: 'Escape' });
    await settle();
    expect(screen.getByLabelText<HTMLInputElement>('QA allowance (%)').value).toBe('0');
    expect(stub.onDirtyChange).toHaveBeenLastCalledWith(false);
    fireEvent.blur(screen.getByLabelText('QA allowance (%)'));
    await settle();
    expect(stub.setStepAllowance).not.toHaveBeenCalled();
  });
});

describe('how far a dependency reaches', () => {
  const WHOLE = 'The whole work item';
  const ANCHOR = 'The first estimated step';

  itDom('the reach is chosen and written', async () => {
    // Two options and a sentence each, in the section about the steps — a
    // dependency's reach is a statement about how steps chain. The work package's
    // stored value is what is checked; picking the other one writes it and
    // re-reads the plan, because every date on the table may move on it.
    //
    // Proof: the `setDepReach(...)` call dropped from the handler — the choice
    // left as a rendered radio nobody wrote — and this failed on
    // `expected "spy" to be called with arguments: [ 'anchor-slice' ] /
    // Received: / Number of calls: 0`, taking the two cases below with it.
    // Watched 2026-08-29.
    const { setDepReach, onChanged } = stubbed();

    expect(screen.getByRole('radio', { name: new RegExp(WHOLE) })).toBeChecked();
    expect(screen.getByRole('radio', { name: new RegExp(ANCHOR) })).not.toBeChecked();

    fireEvent.click(screen.getByRole('radio', { name: new RegExp(ANCHOR) }));

    expect(setDepReach).toHaveBeenCalledWith('anchor-slice');
    // After the write, not beside it: the plan is re-read because the reach
    // decided every date in it.
    await settle();
    expect(onChanged).toHaveBeenCalled();
  });

  itDom('shows the work package’s own reach, not the one it was last shown', () => {
    // The dialog holds nothing about the reach: what is checked is be-01's
    // answer, arriving as a prop, exactly as the step names beside it do.
    stubbed({ depReach: 'anchor-slice' });

    expect(screen.getByRole('radio', { name: new RegExp(ANCHOR) })).toBeChecked();
    expect(screen.getByRole('radio', { name: new RegExp(WHOLE) })).not.toBeChecked();
  });

  itDom('does not move the choice while the write is still in flight', () => {
    // The window the fault lives in. A dialog that kept the choice in a
    // `useState` of its own would tick the other option the instant it was
    // clicked and go on showing it whatever be-01 said — so the assertion is
    // made **while the request is unanswered**, which is the only moment an
    // optimistic dialog and a patient one look different.
    //
    // Proof: a local `useState` mirror added, set in the handler before the
    // request and read by `checked` — and this failed on
    // `expect(element).toBeChecked() / Received element is not checked:
    // <input checked="" class="mt-1" name="dep-reach" type="radio" …`, the
    // whole-item option unticked against a work package be-01 had not answered for.
    // Watched 2026-08-29.
    const held = vi.fn(() => new Promise<void>(() => undefined));
    stubbed({ setDepReach: held });

    fireEvent.click(screen.getByRole('radio', { name: new RegExp(ANCHOR) }));

    expect(held).toHaveBeenCalledWith('anchor-slice');
    expect(screen.getByRole('radio', { name: new RegExp(WHOLE) })).toBeChecked();
    expect(screen.getByRole('radio', { name: new RegExp(ANCHOR) })).not.toBeChecked();
  });

  itDom('says what a refused reach was refused for, on the surface', async () => {
    // The dialog's own rule: refusals are sentences on this surface rather
    // than codes in a toast over the page it covers.
    stubbed({ setDepReach: vi.fn(() => Promise.reject(new Error('forbidden'))) });

    fireEvent.click(screen.getByRole('radio', { name: new RegExp(ANCHOR) }));
    await settle();

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

describe('how wide the steps make the table', () => {
  itDom('says the width, from the table’s own columns', () => {
    stubbed({ steps: [DEV, QA] });

    // 855px of fixed columns on a plan nobody has dated, 200 for Name, 96 each
    // for two folded steps (827 → 839 → 879 in `number-column-widen` and then
    // `external-refs`, and 879 → 855 on 2026-08-31 when `depends` paid for that
    // column, 110 → 86). That was 1247 against the 1248px frame a 1280 laptop
    // gives it — one pixel inside. Contextual Links then removed its 40px from
    // the initial layout (1247 → 1207), and the narrower drag column removes
    // the current 8px (1207 → 1199). Renderer-neutral wording: this dialog
    // opens from the phone's toolbar sheet too, and the sentence used to
    // describe a table that reader has never seen.
    expect(document.body.textContent).toContain(
      '2 steps need ≥1140px of width to sit side by side',
    );
    expect(document.body.textContent).toContain(
      'under 768px wide or 500px tall the plan is drawn as cards instead',
    );
    expect(document.body.textContent).not.toContain('before the table scrolls sideways');
  });

  itDom('quotes the table’s own arithmetic, not a sum of its own', () => {
    // The number moves with every width the table declares, including the ones
    // that depend on the plan: the same two steps are 28px wider once
    // somebody sets an earliest start anywhere in the work package.
    //
    // Proof: `minWidth` in `steps-panel.tsx` replaced by the hand-written
    // `952 + steps.length * 96` this sentence used to quote, this failed on
    // `expected '…≥1144px…' to contain '≥1123px'` for the undated plan and on
    // `≥1151px` for the dated one — one number where the table lays out two.
    // Watched, 2026-08-09, when those two figures were the table's; they were
    // 1219 and 1247 since `priority-column`, 1231 and 1259 since
    // `number-column-widen`, 1271 and 1299 for the hours `external-refs` sat
    // unpaid for, and 1247 and 1275 since 2026-08-31 — the assertions below
    // read them from the layout rather than repeating them.
    cleanup();
    stubbed({ steps: [DEV, QA], frameState: UNDATED });
    expect(document.body.textContent).toContain(
      `≥${String(foldedTableMinWidth(['step-dev', 'step-qa'], UNDATED))}px`,
    );

    cleanup();
    stubbed({ steps: [DEV, QA], frameState: DATED });
    expect(document.body.textContent).toContain(
      `≥${String(foldedTableMinWidth(['step-dev', 'step-qa'], DATED))}px`,
    );
    expect(
      foldedTableMinWidth(['step-dev', 'step-qa'], DATED) -
        foldedTableMinWidth(['step-dev', 'step-qa'], UNDATED),
    ).toBe(24);
  });

  itDom('resolves the work package’s own step ids, not stand-ins for the count', () => {
    // A width can be resolved per column id now, which is what makes an id a
    // fact rather than a placeholder: `T1 column-widths-drag` stores a
    // reader's override under the exact column id, and a `step0-final`
    // invented here could never carry one. The two resolve to the same 96 px
    // today, so nothing measurable tells them apart — the call is what says
    // which was asked about.
    //
    // Proof: `steps.map((step) => step.id)` replaced by the
    // `Array.from({ length: steps.length }, (_, at) => \`step${at}\`)` this
    // used to be, this failed on `expected [ 'step0', 'step1' ] to deeply
    // equal [ 'step-dev', 'step-qa' ]`. Watched, 2026-08-09.
    stubbed({ steps: [DEV, QA] });

    expect(vi.mocked(foldedTableMinWidth).mock.calls.at(-1)?.[0]).toEqual(['step-dev', 'step-qa']);
  });

  itDom('quotes a step’s dragged width, because it resolved that step’s own column', () => {
    // The half of "real ids, not stand-ins" that has a number attached to it.
    // A reader who drags the Dev column wider is looking at a wider table, and
    // the figure that says how much width the steps need has to be that
    // table's. It can only be, because the override is stored under
    // `step-dev-final` — the id the table renders that column by — and this
    // panel resolves the work package's own step ids.
    //
    // Proof: `steps.map((step) => step.id)` replaced by the stand-in
    // `Array.from({ length: steps.length }, (_, at) => \`step${at}\`)`, this
    // failed on `expected 'StepsStepsThe steps every work ite…' to contain
    // '≥1167px'` — the dialog, as it then was,
    // quoting the default 96px column while the table lays out the dragged
    // 140px one. Watched, 2026-08-09.
    const dragged: FrameLayoutState = {
      hasAnyNotBefore: false,
      deepestDepth: 0,
      numberingFrozen: false,
      widestDependencyChip: null,
      waitsForSeveral: false,
      columnWidthOverrides: new Map([['step-dev-final', 140]]),
    };
    stubbed({ steps: [DEV, QA], frameState: dragged });

    const quoted = foldedTableMinWidth(['step-dev', 'step-qa'], dragged);
    expect(document.body.textContent).toContain(`≥${String(quoted)}px`);
    // And it really moved: a figure that ignored the override would be the
    // undated default, which is what a stand-in id resolves to.
    expect(quoted).toBe(foldedTableMinWidth(['step-dev', 'step-qa'], UNDATED) + (140 - 104));
  });

  itDom('counts one step as one, and says so in the singular throughout', () => {
    // The noun and the **verb**. This asserted `'1 step need'` until
    // 2026-08-14: it was written about `count`'s singular noun and swept the
    // plural verb beside it up in the same `toContain`, so the sentence a
    // single-step plan really showed — `1 step need ≥1123px` — was pinned by
    // the test that was meant to be checking it. The whole clause is asserted
    // now, which is the only spelling that can see the verb.
    //
    // Proof: the verb put back to a flat `need`, this failed on
    // `expected 'StepsStepsThe steps every work ite…' to contain
    // '1 step needs ≥1123px of width to sit…'`. Watched on h2puni, 2026-08-14 (fault F5).
    stubbed({ steps: [DEV] });

    // 1123 → 1135 → 1175 in `number-column-widen` (93 → 105 in
    // `COLUMN_WIDTHS`) and then `external-refs` (the 40px `refs` column), and
    // 1175 → 1151 on 2026-08-31 when `depends` paid for it (110 → 86),
    // then 1151 → 1111 when Links joined the initial hide-list and 1111 →
    // 1103 when the drag column narrowed by 8px.
    expect(document.body.textContent).toContain('1 step needs ≥1036px of width to sit side by');
    expect(document.body.textContent).not.toContain('1 step need ≥');
  });

  itDom('keeps the plural where there is more than one step', () => {
    // The other arm, and it is here so the fix above cannot be "never say
    // `need`" — a singular-only expression satisfies the test above and reads
    // `2 steps needs` on every real plan.
    //
    // Proof: the plural arm made to say `needs` as well, this failed on
    // `expected 'StepsStepsThe steps every work ite…' to contain
    // '2 steps need ≥1219px of width to sit…'`. Watched on h2puni, 2026-08-14 (fault F6).
    stubbed({ steps: [DEV, QA] });

    // 1219 → 1231 → 1271 in `number-column-widen` (93 → 105 in
    // `COLUMN_WIDTHS`) and then `external-refs` (the 40px `refs` column), and
    // 1271 → 1247 on 2026-08-31 when `depends` paid for it (110 → 86),
    // then 1247 → 1207 when Links joined the initial hide-list and 1207 →
    // 1199 when the drag column narrowed by 8px.
    expect(document.body.textContent).toContain('2 steps need ≥1140px of width to sit side by');
    expect(document.body.textContent).not.toContain('2 steps needs');
  });
});

itDom(
  'blocks the unit control over estimates and changes an empty step with an explicit unit',
  async () => {
    const setStepUnit = vi.fn(() => Promise.resolve({ ...QA, estimateUnit: 'minutes' as const }));
    stubbed({ estimateCounts: { 'step-dev': 2, 'step-qa': 0 }, setStepUnit });
    expect(screen.getByRole('radio', { name: 'Dev minutes' })).toBeDisabled();
    // Said on the row, not in a hover title (ui-review F-118). Proof: on 3e06eb5a4 this
    // failed with `Unable to find an element with the text: fixed by 2 estimates`.
    expect(screen.getByText('fixed by 2 estimates')).toBeVisible();
    expect(screen.getByRole('group', { name: 'Dev estimate unit' })).toHaveAccessibleDescription(
      'fixed by 2 estimates',
    );
    // A step nothing is estimated against says nothing beside its live radios.
    expect(
      screen.getByRole('group', { name: 'QA estimate unit' }),
    ).not.toHaveAccessibleDescription();
    fireEvent.click(screen.getByRole('radio', { name: 'QA minutes' }));
    await settle();
    expect(setStepUnit).toHaveBeenCalledWith('step-qa', 'minutes');
  },
);

itDom('refuses a trusted step list with an absent estimate count', () => {
  expect(() => stubbed({ estimateCounts: {} })).toThrow('no estimate count for step step-dev');
});
