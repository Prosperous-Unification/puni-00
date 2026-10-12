import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { AttemptView } from '@/lib/wbs-api';

import { FoldedStepCard, type FoldedStepCardProps } from './folded-step-card';

/** A card with no step node: these cases are about the estimate lines alone. */
const UNADDRESSED = {
  estimateUnit: 'workdays' as const,
  projectId: 'project',
  stepNode: null,
  onExitActions: () => undefined,
  onPointerArrives: () => undefined,
  pushToast: () => undefined,
  node: null,
  attemptActions: null,
};

describe('folded step estimate detail', () => {
  it('keeps the existing final line for zero allowance', () => {
    render(
      <FoldedStepCard
        stepName="QA"
        number="010"
        id="qa-card"
        points={[{ point: 'realistic', days: '2' }]}
        estimate={{ optimistic: 2, realistic: 2, pessimistic: 2 }}
        final="2"
        allowancePercent={0}
        rule={{
          method: 'pert',
          pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
          rounding: 'ceil',
        }}
        doing={null}
        problem={null}
        {...UNADDRESSED}
      />,
    );
    expect(screen.getByText('Final 2 days')).toBeInTheDocument();
    expect(screen.queryByText(/Charged/)).toBeNull();
  });

  it('shows no charged figure for an unknown estimate', () => {
    render(
      <FoldedStepCard
        stepName="QA"
        number="010"
        id="qa-card"
        points={[{ point: 'realistic', days: '' }]}
        final=""
        allowancePercent={30}
        rule={{
          method: 'pert',
          pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
          rounding: 'ceil',
        }}
        doing={null}
        problem={null}
        {...UNADDRESSED}
      />,
    );
    expect(screen.getByText('No estimate yet')).toBeInTheDocument();
    expect(screen.queryByText(/Charged/)).toBeNull();
  });
  it('explains the base, allowance, before-rounding and charged days', () => {
    render(
      <FoldedStepCard
        stepName="QA"
        number="010"
        id="qa-card"
        points={[
          { point: 'optimistic', days: '2' },
          { point: 'realistic', days: '2' },
          { point: 'pessimistic', days: '2' },
        ]}
        estimate={{ optimistic: 2, realistic: 2, pessimistic: 2 }}
        final="3"
        allowancePercent={30}
        rule={{
          method: 'pert',
          pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
          rounding: 'ceil',
        }}
        doing={null}
        problem={null}
        {...UNADDRESSED}
      />,
    );
    expect(screen.getByText('Base estimate 2 days')).toBeInTheDocument();
    expect(screen.getByText('Allowance +30%')).toBeInTheDocument();
    expect(screen.getByText('Before rounding 2.6 days')).toBeInTheDocument();
    expect(screen.getByText('Charged 3 days')).toBeInTheDocument();
  });

  it('shows the fraction a tiny allowance leaves before rounding', () => {
    render(
      <FoldedStepCard
        stepName="QA"
        number="010"
        id="qa-card"
        points={[
          { point: 'optimistic', days: '2' },
          { point: 'realistic', days: '2' },
          { point: 'pessimistic', days: '2' },
        ]}
        estimate={{ optimistic: 2, realistic: 2, pessimistic: 2 }}
        final="3"
        allowancePercent={0.01}
        rule={{
          method: 'pert',
          pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
          rounding: 'ceil',
        }}
        doing={null}
        problem={null}
        {...UNADDRESSED}
      />,
    );
    expect(screen.getByText('Before rounding 2.0002 days')).toBeInTheDocument();
    expect(screen.getByText('Charged 3 days')).toBeInTheDocument();
  });
});

/** One ended attempt; `n` is its number and its start in days from the epoch. */
const ended = (
  n: number,
  outcome: 'succeeded' | 'failed' | 'cancelled',
  executorPersonId: string | null = 'p-ada',
  reference: string | null = null,
): AttemptView => ({
  attemptNumber: n,
  startedAt: n * 86_400_000,
  endedAt: n * 86_400_000 + 3_600_000,
  outcome,
  executorPersonId,
  reference,
  note: null,
});

/** The fields of a node reading these cases leave alone. */
const NAMED = { executorNames: new Map<number, string | null>(), timezone: 'UTC' };

function nodeCard(node: FoldedStepCardProps['node']) {
  render(
    <FoldedStepCard
      stepName="QA"
      number="010"
      id="qa-card"
      points={[{ point: 'realistic', days: '' }]}
      final=""
      allowancePercent={0}
      rule={{
        method: 'pert',
        pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
        rounding: 'ceil',
      }}
      doing={null}
      problem={null}
      {...UNADDRESSED}
      node={node}
    />,
  );
  return screen.getByRole('tooltip');
}

describe('folded step card node reading (step-node-readings D4)', () => {
  it('reads the reading, the attempts and the last attempt first', () => {
    const card = nodeCard({
      reading: 'waiting',
      attempts: [ended(1, 'failed'), ended(2, 'failed'), ended(3, 'cancelled', 'p-ada', 'PR-42')],
      executorName: 'Ada Lovelace',
      ...NAMED,
    });
    expect(screen.getByText('Waiting')).toBeInTheDocument();
    expect(screen.getByText('3 attempts, last cancelled')).toBeInTheDocument();
    expect(screen.getByText('By Ada Lovelace · PR-42')).toBeInTheDocument();
    expect(card.textContent.indexOf('Waiting')).toBeLessThan(
      card.textContent.indexOf('QA for 010'),
    );
  });

  it('says one attempt in the singular', () => {
    nodeCard({
      reading: 'unknown',
      attempts: [ended(1, 'failed')],
      executorName: 'Ada Lovelace',
      ...NAMED,
    });
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.getByText('1 attempt, last failed')).toBeInTheDocument();
    expect(screen.getByText('By Ada Lovelace')).toBeInTheDocument();
  });

  it('says a running last attempt is running', () => {
    nodeCard({
      reading: 'in_progress',
      attempts: [
        ended(1, 'failed'),
        { ...ended(2, 'failed', null, 'run-7'), endedAt: null, outcome: null },
      ],
      executorName: null,
      ...NAMED,
    });
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('2 attempts, one running')).toBeInTheDocument();
    expect(screen.getByText('run-7')).toBeInTheDocument();
  });

  it('omits the attempt lines for a node nobody has attempted', () => {
    const card = nodeCard({ reading: 'done', attempts: [], executorName: null, ...NAMED });
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(card.textContent).not.toMatch(/attempt/);
  });
});

describe('folded step card attempts (step-node-attempts D7)', () => {
  const at = (iso: string): number => Date.parse(iso);
  const KYIV_ATTEMPTS: AttemptView[] = [
    {
      attemptNumber: 1,
      startedAt: at('2026-10-11T08:00:00Z'),
      endedAt: at('2026-10-11T08:40:00Z'),
      outcome: 'failed',
      executorPersonId: 'p-kat',
      reference: null,
      note: null,
    },
    {
      attemptNumber: 2,
      startedAt: at('2026-10-11T20:00:00Z'),
      endedAt: at('2026-10-11T23:30:00Z'),
      outcome: 'succeeded',
      executorPersonId: 'p-kat',
      reference: 'PR #12',
      note: null,
    },
  ];

  function attemptCard(
    node: Partial<NonNullable<FoldedStepCardProps['node']>>,
    actions: FoldedStepCardProps['attemptActions'] = {
      start: vi.fn(),
      end: vi.fn(),
      remove: vi.fn(),
    },
  ) {
    render(
      <FoldedStepCard
        estimateUnit="workdays"
        stepName="Dev"
        number="010"
        id="dev-card"
        points={[{ point: 'realistic', days: '' }]}
        final=""
        allowancePercent={0}
        rule={{
          method: 'pert',
          pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
          rounding: 'ceil',
        }}
        doing={null}
        problem={null}
        projectId="project"
        stepNode={{ id: 'sn1', workItemId: 'w1', stepId: 'step-dev', reference: '010.dev' }}
        onExitActions={() => undefined}
        onPointerArrives={() => undefined}
        pushToast={() => undefined}
        node={{
          reading: 'in_progress',
          attempts: KYIV_ATTEMPTS,
          executorName: 'Kat',
          executorNames: new Map([
            [1, 'Kat'],
            [2, 'Kat'],
          ]),
          timezone: 'Europe/Kyiv',
          ...node,
        }}
        attemptActions={actions}
      />,
    );
    return actions;
  }

  it('lists attempts newest first with number, outcome, zoned instants, executor and reference', () => {
    attemptCard({});
    const list = screen.getByRole('list', { name: 'Attempts at 010.dev' });
    const lines = within(list)
      .getAllByRole('listitem')
      .map((each) => each.textContent);
    // 23:30Z is 02:30 the next day in Kyiv: the card's day is 12 Oct for
    // every reader, whatever their browser's zone
    // (`attempt-words.zoned.test.ts` reads it under Pacific/Auckland).
    expect(lines).toEqual([
      '●#2 succeeded · 11 Oct 23:00 – 12 Oct 02:30 · Kat · PR #12Remove',
      '●#1 failed · 11 Oct 11:00–11:40 · KatRemove',
    ]);
  });

  it('offers Start attempt when none runs, and sends it', () => {
    const actions = attemptCard({});
    expect(screen.queryByRole('button', { name: /End attempt/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Start attempt' }));
    expect(actions?.start).toHaveBeenCalledTimes(1);
  });

  it('offers End only while an attempt runs', () => {
    const actions = attemptCard({
      attempts: [
        ...KYIV_ATTEMPTS,
        {
          attemptNumber: 3,
          startedAt: at('2026-10-12T07:00:00Z'),
          endedAt: null,
          outcome: null,
          executorPersonId: null,
          reference: null,
          note: null,
        },
      ],
    });
    expect(screen.queryByRole('button', { name: 'Start attempt' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'End attempt 3…' }));
    expect(actions?.end).toHaveBeenCalledTimes(1);
  });

  it('removes one attempt by its number', () => {
    const actions = attemptCard({});
    fireEvent.click(screen.getByRole('button', { name: 'Remove attempt 1 of 010.dev' }));
    expect(actions?.remove).toHaveBeenCalledWith(1);
  });

  it('says a done node must be reopened instead of offering a start', () => {
    attemptCard({ reading: 'done' });
    expect(screen.queryByRole('button', { name: 'Start attempt' })).toBeNull();
    expect(
      screen.getByText('Done — reopen the step to start another attempt.'),
    ).toBeInTheDocument();
  });

  it('leaves the list and its actions out without the project zone', () => {
    attemptCard({ timezone: null });
    expect(screen.queryByRole('list', { name: 'Attempts at 010.dev' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start attempt' })).toBeNull();
    // The summary lines still say what the attempts came to.
    expect(screen.getByText('2 attempts, last succeeded')).toBeInTheDocument();
  });

  it('walks from the copy actions into the attempt actions with Tab', () => {
    const exits = vi.fn();
    render(
      <FoldedStepCard
        estimateUnit="workdays"
        stepName="Dev"
        number="010"
        id="dev-card"
        points={[{ point: 'realistic', days: '' }]}
        final=""
        allowancePercent={0}
        rule={{
          method: 'pert',
          pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
          rounding: 'ceil',
        }}
        doing={null}
        problem={null}
        projectId="project"
        stepNode={{ id: 'sn1', workItemId: 'w1', stepId: 'step-dev', reference: '010.dev' }}
        onExitActions={exits}
        onPointerArrives={() => undefined}
        pushToast={() => undefined}
        node={{
          reading: 'unknown',
          attempts: [],
          executorName: null,
          executorNames: new Map(),
          timezone: 'UTC',
        }}
        attemptActions={{ start: vi.fn(), end: vi.fn(), remove: vi.fn() }}
      />,
    );
    const link = screen.getByRole('button', { name: 'Copy link' });
    link.focus();
    fireEvent.keyDown(link, { key: 'Tab' });
    const start = screen.getByRole('button', { name: 'Start attempt' });
    expect(start).toHaveFocus();
    fireEvent.keyDown(start, { key: 'Tab' });
    expect(exits).toHaveBeenCalledTimes(1);
  });
});

it('reads native minutes on the folded step card without a day suffix', () => {
  render(
    <FoldedStepCard
      {...UNADDRESSED}
      estimateUnit="minutes"
      stepName="Agent"
      number="010"
      id="minute-card"
      points={[{ point: 'realistic', days: '135' }]}
      estimate={{ optimistic: 135, realistic: 135, pessimistic: 135 }}
      final="2 h 15 min"
      allowancePercent={0}
      rule={{
        method: 'realistic',
        pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
        rounding: 'ceil',
      }}
      doing={null}
      problem={null}
    />,
  );
  expect(screen.getByText('Final 2 h 15 min')).toBeInTheDocument();
  expect(screen.getByText(/Whole minutes as/)).toBeInTheDocument();
});
