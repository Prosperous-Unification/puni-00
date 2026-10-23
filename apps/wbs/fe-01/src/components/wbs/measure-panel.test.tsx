import { act, fireEvent, renderHook, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type MeasureDirectory,
  type WbsProblem,
  WbsRequestError,
  type WorkItemView,
} from '@/lib/wbs-api';
import { DEV, fakeProjectApi } from '@/testing/fake-project-api';
import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
import { CARD_A, CARD_B, RICH_MEASURES, SEEDED_MEASURES } from '@/testing/measure-fixtures';
import { projectServicesOf } from '@/testing/project-services-of';
import { WbsTableOverClient } from '@/testing/wbs-table-over-client';

import { MeasurePanel, type MeasureWrites } from './measure-panel';
import { refusalSentence } from './plan-refusal';
import { useMeasureDefinitions } from './use-measure-definitions';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

publishApplicationRuntimeForEachTest();

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  window.innerWidth = 1440;
});

/** A plan of one leaf, `extra` written onto its row, over the fake's model of be-01. */
async function planOfOne(extra: Partial<WorkItemView> = {}) {
  const api = fakeProjectApi();
  const made = await api.createWorkItem('p1', { parentId: null, afterId: null, name: 'Strip' });
  const row = api.rows.find((each) => each.id === made.id);
  if (row === undefined) throw new Error('the fake made no row');
  Object.assign(row, extra);
  return { api, row };
}

function drawTable(api: ReturnType<typeof fakeProjectApi>, projectId = 'p1') {
  return render(
    <WbsTableOverClient projectId={projectId} projectServices={projectServicesOf(api)} />,
  );
}

const headings = (): string[] =>
  [...document.querySelectorAll('th[data-column]')].map(
    (node) => node.getAttribute('data-column') ?? '',
  );

function openColumns(): HTMLElement {
  const summary = screen.getByText('Columns', { selector: 'summary' });
  fireEvent.click(summary);
  const panel = document.querySelector<HTMLElement>('[data-columns-panel]');
  if (panel === null) throw new Error('the Columns panel is not drawn');
  return panel;
}

async function openPanel(number = '010'): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole('button', { name: `Actions for ${number}` }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Measures…' }));
  return screen.findByRole('dialog', { name: `Measures for ${number}` });
}

describe('measure columns (wbs-measure-budgets task 4.2)', () => {
  itDom(
    'a fresh reader sees time only, and enabling tokens persists for this project alone',
    async () => {
      const { api } = await planOfOne(RICH_MEASURES);
      const drawn = drawTable(api);
      await screen.findByLabelText('Dev estimate for 010');
      const measures = await waitFor(() => {
        const group = document.querySelector<HTMLElement>('[data-measure-choices]');
        if (group?.querySelector('[data-measure-choice]') === null || group === null)
          throw new Error('measures not read yet');
        return group;
      });
      // Proof: with `isMeasureShown`'s default filter dropped, every seeded
      // measure's columns were drawn here and this list failed.
      expect(headings().filter((id) => id.startsWith('measure-'))).toEqual([]);
      expect(headings()).toContain('final-total');

      openColumns();
      const tokens = within(measures).getByLabelText(/Tokens/);
      expect(tokens).not.toBeChecked();
      expect(within(measures).getByLabelText(/Time/)).toBeChecked();
      fireEvent.click(tokens);
      await waitFor(() => {
        expect(headings().filter((id) => id.startsWith('measure-'))).toEqual([
          'measure-tokens-estimate',
          'measure-tokens-fact',
          'measure-tokens-variance',
        ]);
      });
      expect(JSON.parse(localStorage.getItem('wbs.measureColumns.p1') ?? 'null')).toEqual({
        tokens: true,
      });
      expect(localStorage.getItem('wbs.measureColumns.p2')).toBeNull();

      // Read back after a remount: the answer is remembered, not session state.
      drawn.unmount();
      drawTable(api);
      await waitFor(() => {
        expect(headings()).toContain('measure-tokens-fact');
      });
    },
  );

  itDom('draws figures with their unit, absence as a dash and money as its currency', async () => {
    localStorage.setItem(
      'wbs.measureColumns.p1',
      JSON.stringify({ tokens: true, cost: true, agent_minutes: true }),
    );
    const { api } = await planOfOne(RICH_MEASURES);
    drawTable(api);
    await waitFor(() => {
      expect(headings()).toContain('measure-cost-fact');
    });
    const cell = (column: string) => {
      const node =
        document.querySelector(`td[data-column="${column}"]`) ??
        document.querySelector(`[data-cell$="${column}"]`);
      if (node === null) throw new Error(`no cell in ${column}`);
      return node;
    };
    expect(
      screen.getByRole('columnheader', { name: 'Tokens expected (tokens)' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Cost fact (USD)' })).toBeInTheDocument();
    expect(cell('measure-tokens-estimate')).toHaveTextContent('850');
    expect(cell('measure-tokens-variance')).toHaveTextContent('+350');
    expect(cell('measure-cost-fact')).toHaveTextContent('$1.80');
    expect(
      cell('measure-cost-fact').querySelector('[data-fact]')?.getAttribute('data-fact'),
    ).toContain('Priced on USD · card sha256:aaaa1');
    expect(cell('measure-agent_minutes-fact')).toHaveTextContent('95');
    expect(headings()).not.toContain('measure-agent_minutes-estimate');
  });

  itDom('says why there are no measure columns before organization activation', async () => {
    const { api } = await planOfOne();
    api.listMeasures = (): Promise<MeasureDirectory> =>
      Promise.resolve({ kind: 'organization_required' });
    drawTable(api);
    await screen.findByLabelText('Dev estimate for 010');
    openColumns();
    expect(await screen.findByText(/Measure columns need an organization/)).toBeInTheDocument();
    expect(headings().filter((id) => id.startsWith('measure-'))).toEqual([]);
  });

  itDom('the Time choice hides and shows the step columns and Days together', async () => {
    const { api } = await planOfOne();
    drawTable(api);
    await screen.findByLabelText('Dev estimate for 010');
    const group = await waitFor(() => {
      const found = document.querySelector<HTMLElement>('[data-measure-choice="time"]');
      if (found === null) throw new Error('not yet');
      return found;
    });
    openColumns();
    fireEvent.click(within(group).getByRole('checkbox'));
    await waitFor(() => {
      expect(headings()).not.toContain('final-total');
    });
    expect(headings().some((id) => id.startsWith(DEV.id))).toBe(false);
    fireEvent.click(within(group).getByRole('checkbox'));
    await waitFor(() => {
      expect(headings()).toContain('final-total');
    });
  });
});

describe('the measure panel (wbs-measure-budgets task 4.3)', () => {
  itDom(
    'opens from the row menu with an empty state, and a typed estimate updates variance',
    async () => {
      const { api, row } = await planOfOne();
      localStorage.setItem('wbs.measureColumns.p1', JSON.stringify({ tokens: true }));
      const setEstimate = vi.spyOn(api, 'setMeasureEstimate');
      drawTable(api);
      await screen.findByLabelText('Dev estimate for 010');
      const panel = await openPanel();
      expect(
        within(panel).getByText(/Nothing is estimated, recorded or budgeted/),
      ).toBeInTheDocument();

      const tokens = within(panel).getByRole('region', { name: 'Tokens' });
      fireEvent.click(within(tokens).getByRole('button', { name: 'Edit' }));
      fireEvent.change(within(tokens).getByLabelText('Tokens optimistic'), {
        target: { value: '100' },
      });
      fireEvent.change(within(tokens).getByLabelText('Tokens realistic'), {
        target: { value: '200' },
      });
      fireEvent.change(within(tokens).getByLabelText('Tokens pessimistic'), {
        target: { value: '600' },
      });
      fireEvent.click(within(tokens).getByRole('button', { name: 'Save estimate' }));
      await waitFor(() => {
        expect(setEstimate).toHaveBeenCalledWith(
          row.id,
          DEV.id,
          'tokens',
          { optimistic: 100, realistic: 200, pessimistic: 600 },
          undefined,
        );
      });
      fireEvent.change(within(tokens).getByLabelText('Tokens fact'), { target: { value: '300' } });
      fireEvent.click(within(tokens).getByRole('button', { name: 'Save fact' }));
      await waitFor(() => {
        expect(
          document.querySelector('td[data-column="measure-tokens-variance"]'),
        ).toHaveTextContent('+50');
      });
      expect(document.querySelector('td[data-column="measure-tokens-estimate"]')).toHaveTextContent(
        '250',
      );
    },
  );

  itDom('shows a refusal beside the control that asked, in plan-refusal words', async () => {
    const { api } = await planOfOne();
    api.setMeasureEstimate = () => Promise.reject(new Error('scale_mismatch'));
    drawTable(api);
    await screen.findByLabelText('Dev estimate for 010');
    const panel = await openPanel();
    const tokens = within(panel).getByRole('region', { name: 'Tokens' });
    fireEvent.click(within(tokens).getByRole('button', { name: 'Edit' }));
    for (const point of ['optimistic', 'realistic', 'pessimistic'])
      fireEvent.change(within(tokens).getByLabelText(`Tokens ${point}`), {
        target: { value: '1.5' },
      });
    fireEvent.click(within(tokens).getByRole('button', { name: 'Save estimate' }));
    expect(await within(tokens).findByRole('alert')).toHaveTextContent(
      refusalSentence(new Error('scale_mismatch')),
    );
    expect(refusalSentence(new Error('scale_mismatch'))).toBe(
      'This measure counts in whole units — type a whole number. Nothing was changed.',
    );
  });
});

/** Writes that answer nothing: the rendering cases send no request. */
const NO_WRITES: MeasureWrites = {
  setEstimate: () => Promise.resolve(null),
  clearEstimate: () => Promise.resolve(null),
  setFact: () => Promise.resolve(null),
  clearFact: () => Promise.resolve(null),
  setBudget: () => Promise.resolve(null),
  clearBudget: () => Promise.resolve(null),
};

const BASE_ROW = {
  id: 'w1',
  number: '010',
  name: 'Strip',
  rolledUp: false,
  finalTotal: 3,
};

function drawPanel(row: Parameters<typeof MeasurePanel>[0]['row']) {
  return render(
    <MeasurePanel
      row={row}
      steps={[DEV]}
      state={{ kind: 'ready', measures: SEEDED_MEASURES }}
      writes={NO_WRITES}
      onOpenChange={() => undefined}
    />,
  );
}

describe('the measure panel renders each budget by its policy', () => {
  itDom('draws a strict budget as a bar and an advisory one as a marker, and says exceeded', () => {
    drawPanel({ ...BASE_ROW, ...RICH_MEASURES });
    const tokens = screen.getByRole('region', { name: 'Tokens' });
    // Proof: with the strict and advisory arms of `BudgetView` swapped, the
    // meter was drawn in the Cost card and this lookup failed.
    const meter = within(tokens).getByRole('meter', { name: 'Tokens budget spent' });
    expect(meter).toHaveAttribute('aria-valuetext', '1,200 of 1,000, exceeded');
    expect(
      within(tokens).getByText('Exceeded — the coordinator refuses the next attempt here.'),
    ).toBeInTheDocument();
    expect(within(tokens).getByText(/200 over/)).toBeInTheDocument();
    const cost = screen.getByRole('region', { name: 'Cost' });
    expect(within(cost).queryByRole('meter')).toBeNull();
    expect(cost.querySelector('[data-budget="advisory"]')).toHaveTextContent(
      'derived · advisory$1.80 of $3.00 · $1.20 left',
    );
    expect(within(cost).getByText('Facts priced on USD · card sha256:aaaa1…')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Agent minutes' })).toHaveTextContent('derived');
    expect(screen.queryByText(/Nothing is estimated/)).toBeNull();
  });

  itDom('names both bases of a mixed key and reads its budget as unknown, never a sum', () => {
    drawPanel({
      ...BASE_ROW,
      measures: {},
      mixedRateCards: { cost: { facts: [CARD_A, CARD_B] } },
    });
    const cost = screen.getByRole('region', { name: 'Cost' });
    expect(cost.querySelector('[data-budget="blocked"]')).toHaveTextContent(
      'Budget unknown: its facts mix rate cards (USD · card sha256:aaaa1… and USD · card sha256:cccc3…)',
    );
    expect(cost.querySelector('[data-measure-figure="mixed"]')).toHaveTextContent('mixed cards');
    expect(cost).not.toHaveTextContent('$');
  });

  itDom('says the organization is not activated yet, as a state', () => {
    render(
      <MeasurePanel
        row={BASE_ROW}
        steps={[DEV]}
        state={{ kind: 'organization_required' }}
        writes={NO_WRITES}
        onOpenChange={() => undefined}
      />,
    );
    expect(screen.getByText(/does not belong to one yet/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('reading the definitions', () => {
  itDom('shows no project’s definitions against another, nor a late answer', async () => {
    let answerFirst: (directory: MeasureDirectory) => void = () => undefined;
    let answerLate: (directory: MeasureDirectory) => void = () => undefined;
    const commands = {
      listMeasures: vi
        .fn<() => Promise<MeasureDirectory>>()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              answerFirst = resolve;
            }),
        )
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              answerLate = resolve;
            }),
        )
        .mockImplementationOnce(() => new Promise(() => undefined)),
    };
    const { result, rerender } = renderHook(
      ({ projectId }) => useMeasureDefinitions(commands, projectId),
      { initialProps: { projectId: 'p1' } },
    );
    await waitFor(() => {
      expect(commands.listMeasures).toHaveBeenCalledTimes(1);
    });
    answerFirst({ kind: 'ready', measures: [...SEEDED_MEASURES] });
    await waitFor(() => {
      expect(result.current.kind).toBe('ready');
    });
    // The render right after the switch, before p2's read answers, holds p1's
    // definitions in state: they must not be shown.
    rerender({ projectId: 'p2' });
    expect(result.current).toEqual({ kind: 'loading' });
    await waitFor(() => {
      expect(commands.listMeasures).toHaveBeenCalledTimes(2);
    });
    rerender({ projectId: 'p3' });
    await act(async () => {
      answerLate({ kind: 'organization_required' });
      await Promise.resolve();
    });
    expect(result.current).toEqual({ kind: 'loading' });
  });

  itDom('drops the answer of commands it no longer reads through', async () => {
    let answerOld: (directory: MeasureDirectory) => void = () => undefined;
    const old = {
      listMeasures: vi.fn(
        () =>
          new Promise<MeasureDirectory>((resolve) => {
            answerOld = resolve;
          }),
      ),
    };
    const replacement = {
      listMeasures: vi.fn(() =>
        Promise.resolve<MeasureDirectory>({ kind: 'organization_required' }),
      ),
    };
    const { result, rerender } = renderHook(
      ({ commands }) => useMeasureDefinitions(commands, 'p1'),
      { initialProps: { commands: old } },
    );
    await waitFor(() => {
      expect(old.listMeasures).toHaveBeenCalledTimes(1);
    });
    rerender({ commands: replacement });
    await waitFor(() => {
      expect(result.current).toEqual({ kind: 'organization_required' });
    });
    await act(async () => {
      answerOld({ kind: 'ready', measures: [...SEEDED_MEASURES] });
      await Promise.resolve();
    });
    expect(result.current).toEqual({ kind: 'organization_required' });
  });
});

describe('review fixes of PR #680', () => {
  const writesSpy = () => ({
    setEstimate: vi.fn<MeasureWrites['setEstimate']>(() => Promise.resolve(null)),
    clearEstimate: vi.fn<MeasureWrites['clearEstimate']>(() => Promise.resolve(null)),
    setFact: vi.fn<MeasureWrites['setFact']>(() => Promise.resolve(null)),
    clearFact: vi.fn<MeasureWrites['clearFact']>(() => Promise.resolve(null)),
    setBudget: vi.fn<MeasureWrites['setBudget']>(() => Promise.resolve(null)),
    clearBudget: vi.fn<MeasureWrites['clearBudget']>(() => Promise.resolve(null)),
  });
  const panelWith = (
    row: Parameters<typeof MeasurePanel>[0]['row'],
    writes: MeasureWrites = NO_WRITES,
  ) => (
    <MeasurePanel
      row={row}
      steps={[DEV]}
      state={{ kind: 'ready', measures: SEEDED_MEASURES }}
      writes={writes}
      onOpenChange={() => undefined}
    />
  );
  const openCard = (name: string): HTMLElement => {
    const card = screen.getByRole('region', { name });
    fireEvent.click(within(card).getByRole('button', { name: 'Edit' }));
    return card;
  };
  const strictTokens = (remaining: number, exceeded: boolean, held?: number) => ({
    ...BASE_ROW,
    budgets: {
      tokens: {
        cap: 1000,
        policy: 'strict' as const,
        source: 'stated' as const,
        remaining,
        exceeded,
        ...(held === undefined ? {} : { held, holdPerAttempt: held }),
      },
    },
  });

  itDom('keeps a stated hold when a budget is saved, and clears it only when emptied', async () => {
    const writes = writesSpy();
    render(panelWith(strictTokens(700, false, 300), writes));
    const card = openCard('Tokens');
    expect(within(card).getByLabelText('Hold per attempt')).toHaveValue('300');
    fireEvent.change(within(card).getByLabelText('Tokens budget cap'), {
      target: { value: '1,200' },
    });
    fireEvent.click(within(card).getByRole('button', { name: 'Save budget' }));
    await waitFor(() => {
      expect(writes.setBudget).toHaveBeenCalledWith('tokens', {
        cap: 1200,
        policy: 'strict',
        holdPerAttempt: 300,
      });
    });
    fireEvent.change(within(card).getByLabelText('Hold per attempt'), { target: { value: '' } });
    fireEvent.change(within(card).getByRole('combobox', { name: 'Policy' }), {
      target: { value: 'advisory' },
    });
    fireEvent.click(within(card).getByRole('button', { name: 'Save budget' }));
    await waitFor(() => {
      expect(writes.setBudget).toHaveBeenLastCalledWith('tokens', {
        cap: 1200,
        policy: 'advisory',
        holdPerAttempt: null,
      });
    });
  });

  itDom('warns at the cap and on holds, as the coordinator refuses', () => {
    const { rerender } = render(panelWith(strictTokens(0, false)));
    let tokens = screen.getByRole('region', { name: 'Tokens' });
    expect(tokens.querySelector('[data-refusing-sentence]')).toHaveTextContent(
      'Spent to the cap — the coordinator refuses the next attempt here.',
    );
    expect(tokens).toHaveTextContent('1,000 of 1,000 · nothing left');
    expect(within(tokens).queryByText('exceeded')).toBeNull();

    rerender(panelWith(strictTokens(-200, false, 600)));
    tokens = screen.getByRole('region', { name: 'Tokens' });
    expect(tokens.querySelector('[data-refusing-sentence]')).toHaveTextContent(
      'Nothing left once running attempts’ holds are counted — the coordinator refuses the next attempt here.',
    );
    expect(tokens).toHaveTextContent('600 of 1,000 · nothing left · 600 held for running attempts');
    expect(tokens).not.toHaveTextContent('over');

    rerender(panelWith(strictTokens(1, false)));
    tokens = screen.getByRole('region', { name: 'Tokens' });
    expect(tokens.querySelector('[data-refusing-sentence]')).toBeNull();
    expect(tokens.querySelector('[data-budget="strict"]')).toHaveAttribute(
      'data-refusing',
      'false',
    );
  });

  itDom('sends money in micro-units with its rate card, exactly', async () => {
    const writes = writesSpy();
    render(panelWith(BASE_ROW, writes));
    const cost = openCard('Cost');
    fireEvent.change(within(cost).getByLabelText('Rate card digest'), {
      target: { value: 'sha256:card-x' },
    });
    fireEvent.change(within(cost).getByLabelText('Cost fact'), { target: { value: '0.29' } });
    fireEvent.click(within(cost).getByRole('button', { name: 'Save fact' }));
    await waitFor(() => {
      expect(writes.setFact).toHaveBeenCalledWith(DEV.id, 'cost', 290_000, 'sha256:card-x');
    });
    for (const [point, typed] of [
      ['optimistic', '0.1'],
      ['realistic', '0.2'],
      ['pessimistic', '0.7'],
    ] as const)
      fireEvent.change(within(cost).getByLabelText(`Cost ${point}`), { target: { value: typed } });
    fireEvent.click(within(cost).getByRole('button', { name: 'Save estimate' }));
    await waitFor(() => {
      expect(writes.setEstimate).toHaveBeenCalledWith(
        DEV.id,
        'cost',
        { optimistic: 100_000, realistic: 200_000, pessimistic: 700_000 },
        'sha256:card-x',
      );
    });
  });

  itDom('refuses a comma that does not group thousands, sending nothing', () => {
    const writes = writesSpy();
    render(panelWith(BASE_ROW, writes));
    const tokens = openCard('Tokens');
    fireEvent.change(within(tokens).getByLabelText('Tokens fact'), { target: { value: '1,5' } });
    fireEvent.click(within(tokens).getByRole('button', { name: 'Save fact' }));
    expect(within(tokens).getByRole('alert')).toHaveTextContent('commas only between thousands');
    expect(writes.setFact).not.toHaveBeenCalled();
  });

  itDom('clears through the panel, and the boxes follow what is stored', async () => {
    const writes = writesSpy();
    const stored = {
      ...BASE_ROW,
      measures: { token_actual: { [DEV.id]: 300 } },
      measureEstimates: {
        tokens: {
          [DEV.id]: {
            optimistic: 100,
            realistic: 200,
            pessimistic: 600,
            singlePoint: false,
            expected: 250,
            variance: 50,
          },
        },
      },
      budgets: {
        tokens: {
          cap: 1000,
          policy: 'strict' as const,
          source: 'stated' as const,
          remaining: 700,
          exceeded: false,
        },
      },
    };
    const { rerender } = render(panelWith(stored, writes));
    const tokens = openCard('Tokens');
    expect(within(tokens).getByLabelText('Tokens optimistic')).toHaveValue('100');
    fireEvent.click(
      within(within(tokens).getByRole('form', { name: 'Estimate of Tokens' })).getByRole('button', {
        name: 'Clear',
      }),
    );
    fireEvent.click(
      within(within(tokens).getByRole('form', { name: 'Fact of Tokens' })).getByRole('button', {
        name: 'Clear',
      }),
    );
    fireEvent.click(
      within(within(tokens).getByRole('form', { name: 'Budget of Tokens' })).getByRole('button', {
        name: 'Clear',
      }),
    );
    await waitFor(() => {
      expect(writes.clearBudget).toHaveBeenCalledWith('tokens');
    });
    expect(writes.clearEstimate).toHaveBeenCalledWith(DEV.id, 'tokens');
    expect(writes.clearFact).toHaveBeenCalledWith(DEV.id, 'tokens');
    // The read comes back without them: the boxes empty instead of keeping
    // the figures that were cleared.
    // Proof: with the forms keyed on the step alone, this read `100`.
    rerender(panelWith(BASE_ROW, writes));
    const after = screen.getByRole('region', { name: 'Tokens' });
    expect(within(after).getByLabelText('Tokens optimistic')).toHaveValue('');
    expect(within(after).getByLabelText('Tokens fact')).toHaveValue('');
    expect(within(after).getByLabelText('Tokens budget cap')).toHaveValue('');
  });

  itDom('offers a parent only its budgets, and a derived measure no fact', () => {
    render(panelWith({ ...BASE_ROW, rolledUp: true }));
    const tokens = openCard('Tokens');
    expect(within(tokens).queryByRole('form', { name: 'Estimate of Tokens' })).toBeNull();
    expect(within(tokens).queryByRole('form', { name: 'Fact of Tokens' })).toBeNull();
    expect(within(tokens).getByRole('form', { name: 'Budget of Tokens' })).toBeInTheDocument();
    const minutes = openCard('Agent minutes');
    expect(within(minutes).queryByRole('form', { name: 'Fact of Agent minutes' })).toBeNull();
    expect(
      within(minutes).getByRole('form', { name: 'Budget of Agent minutes' }),
    ).toBeInTheDocument();
  });

  itDom('words a refusal that arrives as the shared client’s WbsRequestError', async () => {
    const { api } = await planOfOne();
    api.setMeasureEstimate = () =>
      Promise.reject(
        // The refusal body is the contract's own arm; the cast only spares the
        // test the operation-indexed union's spelling.
        new WbsRequestError({
          kind: 'refusal',
          operation: 'postApiProjectsByIdCommands',
          refusal: { error: 'rate_card_required', index: 0, kind: 'setMeasureEstimate' },
        } as unknown as WbsProblem),
      );
    drawTable(api);
    await screen.findByLabelText('Dev estimate for 010');
    const panel = await openPanel();
    const cost = within(panel).getByRole('region', { name: 'Cost' });
    fireEvent.click(within(cost).getByRole('button', { name: 'Edit' }));
    for (const point of ['optimistic', 'realistic', 'pessimistic'])
      fireEvent.change(within(cost).getByLabelText(`Cost ${point}`), { target: { value: '1' } });
    fireEvent.click(within(cost).getByRole('button', { name: 'Save estimate' }));
    expect(await within(cost).findByRole('alert')).toHaveTextContent(
      'A cost is priced on a rate card: type the card’s digest before saving. Nothing was changed.',
    );
  });

  itDom('Reset layout forgets the measure columns', async () => {
    localStorage.setItem('wbs.measureColumns.p1', JSON.stringify({ tokens: true }));
    const { api } = await planOfOne();
    drawTable(api);
    await waitFor(() => {
      expect(headings()).toContain('measure-tokens-fact');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reset layout' }));
    await waitFor(() => {
      expect(headings().filter((id) => id.startsWith('measure-'))).toEqual([]);
    });
    expect(localStorage.getItem('wbs.measureColumns.p1')).toBeNull();
  });

  itDom('reads another project’s measure columns afresh', async () => {
    localStorage.setItem('wbs.measureColumns.p1', JSON.stringify({ tokens: true }));
    const { api } = await planOfOne();
    const services = projectServicesOf(api);
    const { rerender } = render(<WbsTableOverClient projectId="p1" projectServices={services} />);
    await waitFor(() => {
      expect(headings()).toContain('measure-tokens-fact');
    });
    rerender(<WbsTableOverClient projectId="p2" projectServices={services} />);
    await waitFor(() => {
      expect(headings()).toContain('final-total');
    });
    expect(headings().filter((id) => id.startsWith('measure-'))).toEqual([]);
  });
});
