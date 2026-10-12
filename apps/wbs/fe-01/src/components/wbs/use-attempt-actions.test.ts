import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { AttemptView, StepView } from '@/lib/wbs-api';
import type { PlanCommands } from '@/modules/plan-commands/contract';

import { useAttemptActions } from './use-attempt-actions';
import type { TreeRow } from './wbs-rows';

const DEV: StepView = { id: 'step-dev', name: 'Dev', allowancePercent: 0 };

const attempt = (overrides: Partial<AttemptView>): AttemptView => ({
  attemptNumber: 1,
  startedAt: 0,
  endedAt: null,
  outcome: null,
  executorPersonId: null,
  reference: null,
  note: null,
  ...overrides,
});

/** The three fields the hook reads off a row; the rest of a tree row is not its business. */
const leaf = (attempts: AttemptView[]): TreeRow =>
  ({
    id: 'w1',
    number: '010',
    attempts: { [DEV.id]: attempts },
    subRows: [],
  }) as unknown as TreeRow;

describe('the End dialog follows the current tree', () => {
  it('closes the End dialog once a peer ends the attempt', () => {
    const host = {
      commands: {} as PlanCommands,
      run: vi.fn(),
      pushToast: vi.fn(),
      steps: [DEV],
      stepNodes: [{ id: 'sn', workItemId: 'w1', stepId: DEV.id, reference: '010.dev' }],
    };
    const { result, rerender } = renderHook(
      ({ rows }: { rows: TreeRow[] }) => useAttemptActions({ ...host, rows }),
      { initialProps: { rows: [leaf([attempt({})])] } },
    );
    act(() => {
      result.current.openEndAttempt('w1', DEV.id);
    });
    expect(result.current.ending).toEqual({
      rowId: 'w1',
      stepId: DEV.id,
      attemptNumber: 1,
      label: '010.dev',
    });
    // A peer's end, arriving as the next read: the node runs nothing now.
    rerender({ rows: [leaf([attempt({ endedAt: 60_000, outcome: 'failed' })])] });
    expect(result.current.ending).toBeNull();
    // A later start on that node must not resurrect the old End dialog.
    rerender({
      rows: [
        leaf([attempt({ endedAt: 60_000, outcome: 'failed' }), attempt({ attemptNumber: 2 })]),
      ],
    });
    expect(result.current.ending).toBeNull();
  });

  it('does not switch an open End dialog to a peer’s replacement attempt', () => {
    const host = {
      commands: {} as PlanCommands,
      run: vi.fn(),
      pushToast: vi.fn(),
      steps: [DEV],
      stepNodes: [{ id: 'sn', workItemId: 'w1', stepId: DEV.id, reference: '010.dev' }],
    };
    const { result, rerender } = renderHook(
      ({ rows }: { rows: TreeRow[] }) => useAttemptActions({ ...host, rows }),
      { initialProps: { rows: [leaf([attempt({})])] } },
    );
    act(() => {
      result.current.openEndAttempt('w1', DEV.id);
    });
    rerender({
      rows: [
        leaf([attempt({ endedAt: 60_000, outcome: 'failed' }), attempt({ attemptNumber: 2 })]),
      ],
    });
    expect(result.current.ending).toBeNull();
  });

  it('names an uncoded node by its step and number', () => {
    const { result } = renderHook(() =>
      useAttemptActions({
        commands: {} as PlanCommands,
        run: vi.fn(),
        pushToast: vi.fn(),
        rows: [leaf([attempt({})])],
        steps: [DEV],
        stepNodes: [{ id: 'sn', workItemId: 'w1', stepId: DEV.id, reference: null }],
      }),
    );
    act(() => {
      result.current.openEndAttempt('w1', DEV.id);
    });
    expect(result.current.ending?.label).toBe('Dev for 010');
  });
});
