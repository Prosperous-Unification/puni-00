import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import type { PlanOptimizationView, ProjectOptimizationPatch } from '@/lib/wbs-api';

import { OptimizationCue } from './optimization-cue';

const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

afterEach(cleanup);

/** Fast on screen, PRI three workdays ahead of it, Time still solving. */
const SUGGESTING: PlanOptimizationView = {
  enabled: true,
  engine: 'fast',
  objective: 'pri',
  inputHash: 'hash-a',
  generation: 7,
  contractVersion: '1.5+test',
  budgetMs: 60_000,
  displayed: 'fast',
  variants: { pri: { state: 'ready' }, time: { state: 'pending' } },
  finishDays: { fast: 10, pri: 7 },
  sameOrderAsFast: { pri: true },
};

/**
 * The cue with its menu state held for it, the way the table holds it.
 *
 * A controlled menu driven through a controller rather than by re-rendering
 * with new props: "one menu open at a time" is the table's rule, and this is
 * the smallest thing that keeps it while a case really opens and closes one.
 */
function Harness({
  optimization,
  stale = false,
  onChoose,
  onRetry,
  busy = false,
}: {
  optimization: PlanOptimizationView;
  stale?: boolean;
  onChoose?: (patch: ProjectOptimizationPatch) => void;
  onRetry?: (objective: 'pri' | 'time', inputHash: string) => void;
  busy?: boolean;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <OptimizationCue
      optimization={optimization}
      stale={stale}
      projectStart="2026-09-07"
      today={new Date(2026, 8, 7)}
      workItemName={(id) => (id === 'parent' ? 'Launch' : id === 'leaf' ? 'Migration' : null)}
      menuOpen={open}
      onMenuOpen={() => {
        setOpen(true);
      }}
      onMenuClose={() => {
        setOpen(false);
      }}
      busy={busy}
      {...(onChoose === undefined ? {} : { onChoose })}
      {...(onRetry === undefined ? {} : { onRetry })}
    />
  );
}

const pill = () => screen.getByRole('button', { name: /is the active schedule/ });
const items = () => screen.getAllByRole('menuitem').map((item) => item.textContent);

describe('the schedule cue', () => {
  itDom('says nothing at all while optimization is off', () => {
    render(<Harness optimization={{ ...SUGGESTING, enabled: false }} onChoose={() => undefined} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  itDom('is a pill and not a banner, on the row of controls', () => {
    render(<Harness optimization={SUGGESTING} onChoose={() => undefined} />);
    // The one thing the banner it replaced could not be: a control whose own
    // box is the width of its words. The measurement is a browser fact
    // (`e2e/optimization-cue.spec.ts`); what is asserted here is that there is
    // exactly one of them and it is not a region of its own.
    expect(document.querySelectorAll('[data-optimization-cue]')).toHaveLength(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.querySelector('[data-cue-active]')?.textContent).toBe('Fast');
  });

  /**
   * Proof: with `suggestionWords` returned for every difference rather than
   * for an earlier finish alone — the reading's `finish < onScreen` replaced by
   * "outside the drift or reordered" — the two cases below failed on `expected
   * <span …(2)></span> to be null`. The rule itself is proven where it is
   * decided (`optimization-cue-reading.test.ts`); this is the half that says
   * the pill really wears it. Watched 2026-09-08.
   */
  itDom('wears the saving when a variant would land the plan earlier', () => {
    render(<Harness optimization={SUGGESTING} onChoose={() => undefined} />);
    expect(document.querySelector('[data-cue-suggestion]')?.textContent).toBe(
      '· PRI 3 days earlier',
    );
    expect(document.querySelector('[data-optimization-cue]')).toHaveAttribute(
      'data-cue-suggesting',
      'pri',
    );
  });

  itDom.each([
    ['the same project deadline in a different order', { fast: 10, pri: 10 }, { pri: false }],
    ['a later project deadline', { fast: 10, pri: 12 }, { pri: true }],
  ] as const)('wears nothing for %s', (_what, finishDays, sameOrderAsFast) => {
    render(
      <Harness
        optimization={{ ...SUGGESTING, finishDays, sameOrderAsFast }}
        onChoose={() => undefined}
      />,
    );
    expect(document.querySelector('[data-cue-suggestion]')).toBeNull();
    expect(document.querySelector('[data-optimization-cue]')).not.toHaveAttribute(
      'data-cue-suggesting',
    );
  });

  itDom('lists all three schedules with their figures, and refuses the active one', () => {
    render(<Harness optimization={SUGGESTING} onChoose={() => undefined} />);
    fireEvent.click(pill());
    expect(items()).toEqual([
      'Fast · 10 days',
      'PRI · 7 days · Earlier project deadline by 3 days',
      'Time · Optimizing…',
    ]);
    // Present and refused rather than absent: a control that leaves a menu
    // somebody is reading takes its own explanation with it.
    expect(screen.getByRole('menuitem', { name: 'Fast · 10 days' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('menuitem', { name: 'Fast · 10 days' })).toHaveAttribute(
      'data-fact',
      'Fast is already the active schedule',
    );
    expect(screen.getByRole('menuitem', { name: /^Time/ })).toHaveAttribute(
      'data-fact',
      'Optimizing…',
    );
  });

  itDom('switches the project onto the variant it suggested', () => {
    const asked: ProjectOptimizationPatch[] = [];
    render(
      <Harness
        optimization={SUGGESTING}
        onChoose={(patch) => {
          asked.push(patch);
        }}
      />,
    );
    fireEvent.click(pill());
    fireEvent.click(screen.getByRole('menuitem', { name: /^PRI/ }));
    expect(asked).toEqual([{ scheduleEngine: 'optimized', scheduleObjective: 'pri' }]);
  });

  itDom('switches back to Fast from a displayed variant', () => {
    const asked: ProjectOptimizationPatch[] = [];
    render(
      <Harness
        optimization={{ ...SUGGESTING, engine: 'optimized', displayed: 'pri' }}
        onChoose={(patch) => {
          asked.push(patch);
        }}
      />,
    );
    fireEvent.click(pill());
    fireEvent.click(screen.getByRole('menuitem', { name: /^Fast/ }));
    expect(asked).toEqual([{ scheduleEngine: 'fast' }]);
  });

  itDom('takes nothing from the item that says why it cannot be taken', () => {
    const asked: ProjectOptimizationPatch[] = [];
    render(
      <Harness
        optimization={SUGGESTING}
        onChoose={(patch) => {
          asked.push(patch);
        }}
      />,
    );
    fireEvent.click(pill());
    fireEvent.click(screen.getByRole('menuitem', { name: /^Time/ }));
    expect(asked).toEqual([]);
  });

  /**
   * The window the fault lives in (R5, `estimate-triple-visible`).
   *
   * The plan is re-read after every write, so an optimistic pill and a patient
   * one land on the same screen: the only moment they differ is while the
   * patch is in flight. The fake holds it there and the assertion is made in
   * that window.
   *
   * Proof: with the pill's face rendering an optimistic label instead of the
   * read's own — `reading.activeLabel` replaced by a constant `'PRI'`, which is
   * what an optimistic switch would put there — this failed on `Expected:
   * "Fast" · Received: "PRI"`. Watched 2026-09-08.
   */
  itDom('leaves the active schedule alone until a plan read moves it', () => {
    const asked: ProjectOptimizationPatch[] = [];
    const view = render(
      <Harness
        optimization={SUGGESTING}
        onChoose={(patch) => {
          asked.push(patch);
        }}
      />,
    );
    fireEvent.click(pill());
    fireEvent.click(screen.getByRole('menuitem', { name: /^PRI/ }));

    // The window: the switch has been asked for and no plan read has answered.
    // `onChoose` returns nothing, so this **is** the in-flight state — the
    // caller's `run` has the request and this component has the same props it
    // had a moment ago.
    expect(asked).toHaveLength(1);
    expect(document.querySelector('[data-cue-active]')?.textContent).toBe('Fast');

    // And a refusal is the same picture from here: the props do not change, so
    // neither does the pill.
    view.rerender(<Harness optimization={SUGGESTING} onChoose={() => undefined} />);
    expect(document.querySelector('[data-cue-active]')?.textContent).toBe('Fast');

    // Only the read that carries the new `displayed` moves it.
    view.rerender(
      <Harness
        optimization={{ ...SUGGESTING, engine: 'optimized', displayed: 'pri' }}
        onChoose={() => undefined}
      />,
    );
    expect(document.querySelector('[data-cue-active]')?.textContent).toBe('PRI');
  });

  itDom('shows the items unavailable while a write is in flight', () => {
    const asked: ProjectOptimizationPatch[] = [];
    render(
      <Harness
        optimization={SUGGESTING}
        busy
        onChoose={(patch) => {
          asked.push(patch);
        }}
      />,
    );
    fireEvent.click(pill());
    expect(screen.getByRole('menuitem', { name: /^PRI/ })).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByRole('menuitem', { name: /^PRI/ }));
    expect(asked).toEqual([]);
  });

  itDom.each([
    ['failed', { state: 'failed', reason: 'timeout' } as const],
    ['corrupt', { state: 'corrupt', message: 'bad dto' } as const],
  ])('offers a Retry for a %s variant, naming the plan it was pressed against', (_what, state) => {
    const asked: { objective: string; inputHash: string }[] = [];
    render(
      <Harness
        optimization={{ ...SUGGESTING, variants: { ...SUGGESTING.variants, time: state } }}
        onChoose={() => undefined}
        onRetry={(objective, inputHash) => {
          asked.push({ objective, inputHash });
        }}
      />,
    );
    fireEvent.click(pill());
    fireEvent.click(screen.getByRole('menuitem', { name: 'Retry Time' }));
    expect(asked).toEqual([{ objective: 'time', inputHash: 'hash-a' }]);
  });

  itDom.each([
    ['plan-infeasible', { state: 'plan-infeasible', items: [] } as const],
    ['pending', { state: 'pending' } as const],
    ['ready', { state: 'ready' } as const],
  ])('offers no Retry for a %s variant', (_what, state) => {
    render(
      <Harness
        optimization={{ ...SUGGESTING, variants: { ...SUGGESTING.variants, time: state } }}
        onChoose={() => undefined}
        onRetry={() => undefined}
      />,
    );
    fireEvent.click(pill());
    // The menu really is open — three schedules — and the Retry is absent from
    // it. Without the first assertion this case would pass against a menu that
    // never opened.
    expect(items()).toHaveLength(3);
    expect(screen.queryByRole('menuitem', { name: /retry/i })).toBeNull();
  });

  itDom('reads without offering a switch when there is no writer', () => {
    render(<Harness optimization={SUGGESTING} />);
    // The pill is still there and still says everything: what a reader without
    // the project's settings loses is the ability to act, not the reading.
    const disclosure = screen.getByRole('button', { name: /is the active schedule/ });
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('status')).toHaveTextContent('Priority-first finishes 3 days earlier');
    fireEvent.click(disclosure);
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0);
  });

  itDom('opens its reading on focus, and points the pill at it', () => {
    render(<Harness optimization={SUGGESTING} onChoose={() => undefined} />);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focus(pill());
    const card = screen.getByRole('tooltip');
    expect(pill()).toHaveAttribute('aria-describedby', card.id);
    expect(card.textContent).toContain('Fast · 10 days · Fast is already the active schedule');
    expect(card.textContent).toContain('PRI · 7 days · Earlier project deadline by 3 days');
    fireEvent.blur(pill());
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  itDom('lists the work item deadlines an infeasible variant proved unmeetable', () => {
    render(
      <Harness
        optimization={{
          ...SUGGESTING,
          variants: {
            ...SUGGESTING.variants,
            time: {
              state: 'plan-infeasible',
              items: [
                { ownerWorkItemId: 'parent', boundWorkItemId: 'leaf', effectiveDeadlineOffset: 4 },
                { ownerWorkItemId: 'leaf', boundWorkItemId: 'leaf', effectiveDeadlineOffset: -1 },
                { ownerWorkItemId: 'gone', boundWorkItemId: 'gone', effectiveDeadlineOffset: 4 },
              ],
            },
          },
        }}
        onChoose={() => undefined}
      />,
    );
    fireEvent.focus(pill());
    // Scoped to the lines themselves: a bare text query matches every ancestor
    // that contains the words too — the card's own row, and the sentence.
    const lines = [...document.querySelectorAll('[data-cue-unmeetable]')].map(
      (line) => line.textContent,
    );
    expect(lines).toEqual([
      'Launch → Migration · Work item deadline 11 Sep',
      // The same row on both ends of the binding is named once.
      "Migration · Work item deadline before the project's first working day",
      // A row that has left the plan is named, never its raw id.
      'Work item no longer in this plan · Work item deadline 11 Sep',
    ]);
    expect(screen.queryByText(/gone/)).toBeNull();
  });

  itDom('keeps one live region while the optimizer state changes under it', () => {
    const view = render(<Harness optimization={SUGGESTING} onChoose={() => undefined} />);
    const live = screen.getByRole('status');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveAttribute('aria-atomic', 'true');

    view.rerender(
      <Harness
        optimization={{
          ...SUGGESTING,
          variants: { pri: { state: 'failed', reason: 'oom' }, time: { state: 'ready' } },
          finishDays: { fast: 10, time: 10 },
          sameOrderAsFast: { time: true },
        }}
        onChoose={() => undefined}
      />,
    );
    expect(screen.getByRole('status')).toBe(live);
    expect(live).toHaveTextContent('Priority-first: Optimization unavailable');
  });

  itDom('drops the comparison, and the suggestion, while the plan may be stale', () => {
    render(<Harness optimization={SUGGESTING} stale onChoose={() => undefined} />);
    expect(document.querySelector('[data-cue-suggestion]')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Schedule comparison unavailable while this plan may be stale',
    );
    fireEvent.click(pill());
    expect(items()).toEqual(['Fast', 'PRI', 'Time · Optimizing…']);
  });
});
