import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { StepState } from '@wbs/domain/progress';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppFaultBoundary } from '@/components/chrome/app-fault';
import type { PlanRefresh } from '@/lib/plan-refresh';
import { createChannel } from '@/modules/channel';
import type { PlanFeedDelivery } from '@/modules/plan-feed/contract';
import {
  createDeliveredPlan,
  type DeliveredPlanStore,
} from '@/modules/plan-feed/delivered-plan-store';
import { createBusy } from '@/modules/plan-writer/busy-store';
import { createPlanWriter } from '@/modules/plan-writer/plan-writer.feature';
import type { ProjectRuntime } from '@/modules/project/contract';
import { planRead, workItemView } from '@/testing/views';

import { createStepBoardAction } from './step-board-action';
import { StepBoardView } from './step-board-view';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function publish(plan: DeliveredPlanStore, delivery: Partial<PlanFeedDelivery>): void {
  act(() => {
    plan.deliver({
      tree: null,
      steps: null,
      directory: null,
      markers: null,
      claims: null,
      staleResources: [],
      treeFailure: null,
      ...delivery,
    });
  });
}

function runtime(plan: DeliveredPlanStore) {
  const reread = vi.fn(() => Promise.resolve(true));
  const owner = refreshOwner();
  const project: Pick<ProjectRuntime, 'projectId' | 'plan' | 'isCurrent' | 'reread'> = {
    projectId: 'p1',
    plan,
    isCurrent: () => true,
    reread,
  };
  const writer = createPlanWriter({
    readRefreshOwner: () => owner,
    rereadResources: reread,
    busy: createBusy(),
    commandsIssued: createChannel<undefined>(),
    refusals: createChannel<{ sentence: string }>(),
  });
  const action = createStepBoardAction({
    plan,
    isCurrent: project.isCurrent,
    writer,
    commands: {
      setProgress: () => Promise.resolve(),
      clearProgress: () => Promise.resolve(),
    },
  });
  return { project, reread, action };
}

function refreshOwner(): PlanRefresh {
  const unused = (): never => {
    throw new Error('refresh owner identity only');
  };
  return {
    initialize: unused,
    invalidate: unused,
    getSnapshot: unused,
    subscribe: unused,
    dispose: unused,
  };
}

function deferred<T>() {
  let resolve: (answer: T) => void = () => {
    throw new Error('deferred unresolved');
  };
  const promise = new Promise<T>((release) => {
    resolve = release;
  });
  return { promise, resolve };
}

function writableRuntime(initialProgress: Record<string, StepState> = { qa: 'done' }) {
  const plan = createDeliveredPlan();
  let progress = { ...initialProgress };
  let generation = 0;
  let request: Promise<void> = Promise.resolve();
  const calls: unknown[][] = [];
  const steps = [
    { estimateUnit: 'workdays' as const, id: 'dev', name: 'Development', allowancePercent: 0 },
    { estimateUnit: 'workdays' as const, id: 'qa', name: 'QA', allowancePercent: 0 },
  ];
  const deliverTree = (): void => {
    generation += 1;
    publish(plan, {
      tree: {
        generation,
        value: planRead({
          workItems: [
            workItemView({
              id: 'leaf',
              number: '010',
              name: 'Build',
              progress: { ...progress },
              status:
                progress['dev'] === 'done' && progress['qa'] === 'done'
                  ? 'done'
                  : progress['dev'] === 'in_progress'
                    ? 'in_progress'
                    : 'unknown',
            }),
            workItemView({ id: 'other', number: '020', name: 'Build' }),
          ],
          steps,
        }),
      },
    });
  };
  const reread = vi.fn(() => {
    deliverTree();
    return Promise.resolve(true);
  });
  const owner = refreshOwner();
  const writer = createPlanWriter({
    readRefreshOwner: () => owner,
    rereadResources: reread,
    busy: createBusy(),
    commandsIssued: createChannel<undefined>(),
    refusals: createChannel<{ sentence: string }>(),
  });
  const commands = {
    setProgress: (workItemId: string, stepId: string, state: StepState) => {
      calls.push(['setProgress', workItemId, stepId, state]);
      return request.then(() => {
        progress = { ...progress, [stepId]: state };
      });
    },
    clearProgress: (workItemId: string, stepId: string) => {
      calls.push(['clearProgress', workItemId, stepId]);
      return request.then(() => {
        progress = Object.fromEntries(Object.entries(progress).filter(([key]) => key !== stepId));
      });
    },
  };
  const action = createStepBoardAction({ plan, isCurrent: () => true, writer, commands });
  const project = { projectId: 'p1', plan, isCurrent: () => true, reread };
  deliverTree();
  return {
    project,
    action,
    calls,
    plan,
    holdRequest: (pending: Promise<void>) => {
      request = pending;
    },
    deliverPeer: (next: Record<string, StepState>) => {
      progress = { ...next };
      deliverTree();
    },
  };
}

describe('StepBoardView', () => {
  it('loads, then draws cards from the selected runtime plan', () => {
    const plan = createDeliveredPlan();
    const { project, action } = runtime(plan);
    render(<StepBoardView project={project} action={action} onReturnToPlan={vi.fn()} />);
    expect(screen.getByText('Loading board…')).toBeDefined();

    publish(plan, {
      tree: {
        generation: 1,
        value: planRead({
          workItems: [
            workItemView({ id: 'leaf', number: '020', name: 'Build', status: 'on_hold' }),
          ],
          steps: [{ estimateUnit: 'workdays' as const, id: 'qa', name: 'QA', allowancePercent: 0 }],
        }),
      },
    });

    const unknown = screen.getByRole('region', { name: 'Unknown' });
    expect(within(unknown).getByRole('heading', { name: 'Unknown (1)' })).toBeDefined();
    expect(within(unknown).getByText('020')).toBeDefined();
    expect(within(unknown).getByText('Build')).toBeDefined();
    expect(within(unknown).getByText('QA')).toBeDefined();
    expect(within(unknown).getByText('Status: On hold')).toBeDefined();
  });

  it('renders all three columns in order with counts and separate work-item status', () => {
    const plan = createDeliveredPlan();
    const { project, action } = runtime(plan);
    render(<StepBoardView project={project} action={action} onReturnToPlan={vi.fn()} />);
    publish(plan, {
      tree: {
        generation: 1,
        value: planRead({
          workItems: [
            workItemView({
              id: 'z-leaf',
              number: '020',
              name: 'Build',
              status: 'on_hold',
              progress: { qa: 'done', dev: 'in_progress' },
            }),
            workItemView({ id: 'a-leaf', number: '010', name: 'Review' }),
          ],
          steps: [
            { estimateUnit: 'workdays' as const, id: 'qa', name: 'QA', allowancePercent: 0 },
            {
              estimateUnit: 'workdays' as const,
              id: 'dev',
              name: 'Development',
              allowancePercent: 0,
            },
          ],
        }),
      },
    });

    const regions = screen
      .getAllByRole('region')
      .filter((region) =>
        ['Unknown', 'In progress', 'Done'].includes(region.getAttribute('aria-label') ?? ''),
      );
    expect(regions.map((region) => region.getAttribute('aria-label'))).toEqual([
      'Unknown',
      'In progress',
      'Done',
    ]);
    expect(regions.map((region) => within(region).getAllByRole('listitem').length)).toEqual([
      2, 1, 1,
    ]);
    const unknown = screen.getByRole('region', { name: 'Unknown' });
    const inProgress = screen.getByRole('region', { name: 'In progress' });
    const done = screen.getByRole('region', { name: 'Done' });
    expect(within(unknown).getByRole('heading').textContent).toBe('Unknown (2)');
    expect(within(inProgress).getByRole('heading').textContent).toBe('In progress (1)');
    expect(within(done).getByRole('heading').textContent).toBe('Done (1)');
    expect(
      within(unknown)
        .getAllByRole('button', { name: /^Drag / })
        .map((card) => card.textContent),
    ).toEqual(['010 Review QA Status: Unknown', '010 Review Development Status: Unknown']);
    expect(within(done).getByText('Status: On hold')).toBeDefined();
    expect(within(inProgress).getByText('Status: On hold')).toBeDefined();
  });

  it('shows a first tree failure and retries through the current runtime', () => {
    const plan = createDeliveredPlan();
    const { project, reread, action } = runtime(plan);
    render(<StepBoardView project={project} action={action} onReturnToPlan={vi.fn()} />);
    publish(plan, {
      staleResources: ['tree'],
      treeFailure: { cause: new Error('engine_unavailable') },
    });

    expect(screen.getByRole('alert').textContent).toContain(
      'Optimized scheduling is unavailable in this runtime.',
    );
    expect(screen.queryByText('No work items')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(reread).toHaveBeenCalledExactlyOnceWith(['tree']);
  });

  it('shows a stale warning when the feed marks tree stale without a failure cause', () => {
    const plan = createDeliveredPlan();
    const { project, action } = runtime(plan);
    render(<StepBoardView project={project} action={action} onReturnToPlan={vi.fn()} />);
    publish(plan, { staleResources: ['tree'] });
    expect(screen.getByRole('alert').textContent).toContain(
      'This plan may be out of date — the last refresh failed.',
    );
    expect(screen.queryByText('Loading board…')).toBeNull();
  });

  it('distinguishes an empty project from work with no project steps', () => {
    const plan = createDeliveredPlan();
    const { project, action } = runtime(plan);
    const onReturnToPlan = vi.fn();
    render(<StepBoardView project={project} action={action} onReturnToPlan={onReturnToPlan} />);
    publish(plan, { tree: { generation: 1, value: planRead() } });
    expect(screen.getByText('No work items')).toBeDefined();
    expect(screen.queryByText('No project steps')).toBeNull();

    publish(plan, {
      tree: {
        generation: 2,
        value: planRead({ workItems: [workItemView({ id: 'leaf', name: 'Build' })] }),
      },
    });
    expect(screen.getByText('No project steps')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Return to Plan' }));
    expect(onReturnToPlan).toHaveBeenCalledOnce();
  });

  it('keeps last delivered cards visibly stale after a failed read and shows disconnection', () => {
    const plan = createDeliveredPlan();
    const { project, reread, action } = runtime(plan);
    render(<StepBoardView project={project} action={action} onReturnToPlan={vi.fn()} />);
    publish(plan, {
      tree: {
        generation: 1,
        value: planRead({
          workItems: [workItemView({ id: 'leaf', name: 'Build' })],
          steps: [{ estimateUnit: 'workdays' as const, id: 'qa', name: 'QA', allowancePercent: 0 }],
        }),
      },
    });
    expect(screen.getByText('Build')).toBeDefined();

    publish(plan, {
      staleResources: ['tree'],
      treeFailure: { cause: new Error('engine_unavailable') },
    });
    expect(screen.getByText('Build')).toBeDefined();
    expect(screen.getByRole('alert').textContent).toContain(
      'Showing the last delivered board; it may be out of date.',
    );
    expect(screen.getByRole('alert').textContent).toContain(
      'Optimized scheduling is unavailable in this runtime.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(reread).toHaveBeenCalledExactlyOnceWith(['tree']);

    act(() => {
      plan.reportConnection(false);
    });
    expect(screen.getByRole('status').textContent).toContain('Reconnecting');
    publish(plan, {
      tree: {
        generation: 2,
        value: planRead({
          workItems: [workItemView({ id: 'leaf', name: 'Built' })],
          steps: [{ estimateUnit: 'workdays' as const, id: 'qa', name: 'QA', allowancePercent: 0 }],
        }),
      },
    });
    expect(screen.getByText('Built')).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Reconnecting');
  });

  it('does not combine separately delivered newer steps with an older tree', () => {
    const plan = createDeliveredPlan();
    const { project, action } = runtime(plan);
    render(<StepBoardView project={project} action={action} onReturnToPlan={vi.fn()} />);
    const leaf = workItemView({ id: 'leaf', name: 'Build' });
    publish(plan, {
      tree: {
        generation: 1,
        value: planRead({
          workItems: [leaf],
          steps: [{ estimateUnit: 'workdays' as const, id: 'qa', name: 'QA', allowancePercent: 0 }],
        }),
      },
      steps: [{ estimateUnit: 'workdays' as const, id: 'qa', name: 'QA', allowancePercent: 0 }],
    });
    expect(screen.getByText('QA')).toBeDefined();

    publish(plan, {
      steps: [
        { estimateUnit: 'workdays' as const, id: 'dev', name: 'Development', allowancePercent: 0 },
      ],
    });
    expect(screen.getByText('QA')).toBeDefined();
    expect(screen.queryByText('Development')).toBeNull();

    publish(plan, {
      tree: {
        generation: 2,
        value: planRead({
          workItems: [leaf],
          steps: [
            {
              estimateUnit: 'workdays' as const,
              id: 'dev',
              name: 'Development',
              allowancePercent: 0,
            },
          ],
        }),
      },
    });
    expect(screen.queryByText('QA')).toBeNull();
    expect(screen.getByText('Development')).toBeDefined();
  });

  it('sends invalid delivered progress to the visible app error boundary', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const plan = createDeliveredPlan();
    const { project, action } = runtime(plan);
    render(
      <AppFaultBoundary>
        <StepBoardView project={project} action={action} onReturnToPlan={vi.fn()} />
      </AppFaultBoundary>,
    );
    publish(plan, {
      tree: {
        generation: 1,
        value: planRead({
          workItems: [workItemView({ id: 'leaf', progress: { qa: 'blocked' as 'done' } })],
          steps: [{ estimateUnit: 'workdays' as const, id: 'qa', name: 'QA', allowancePercent: 0 }],
        }),
      },
    });
    expect(screen.getByRole('alert').hasAttribute('data-app-fault')).toBe(true);
    expect(screen.queryByRole('region', { name: 'Unknown' })).toBeNull();
  });
});

describe('writable StepBoardView with one real action', () => {
  it('names duplicate titles by number, moves delivered progress, preserves the other step and clears to absence', async () => {
    const at = writableRuntime();
    render(<StepBoardView project={at.project} action={at.action} onReturnToPlan={vi.fn()} />);
    const move = screen.getByRole('button', { name: 'Move 010 Build / Development to Done' });
    expect(move.className).toContain('min-h-11');
    fireEvent.keyDown(screen.getByRole('button', { name: 'Drag 010 Build / Development' }), {
      key: 'Enter',
    });
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Move 010 Build / Development to In progress' }),
    );
    expect(
      screen.getByRole('button', { name: 'Move 020 Build / Development to Done' }),
    ).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'Clear progress for 010 Build / QA (move to Unknown)' }),
    ).toBeDefined();
    fireEvent.click(move);
    await waitFor(() => {
      expect(
        within(screen.getByRole('region', { name: 'Done' })).getByRole('button', {
          name: 'Drag 010 Build / Development',
        }),
      ).toBeDefined();
    });
    expect(at.calls).toEqual([['setProgress', 'leaf', 'dev', 'done']]);
    expect(
      within(screen.getByRole('region', { name: 'Done' })).getAllByText('Status: Done'),
    ).toHaveLength(2);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Clear progress for 010 Build / Development (move to Unknown)',
      }),
    );
    await waitFor(() => {
      expect(
        within(screen.getByRole('region', { name: 'Unknown' })).getByRole('button', {
          name: 'Drag 010 Build / Development',
        }),
      ).toBeDefined();
    });
    expect(at.calls).toEqual([
      ['setProgress', 'leaf', 'dev', 'done'],
      ['clearProgress', 'leaf', 'dev'],
    ]);
    expect(within(screen.getByRole('region', { name: 'Done' })).getByText('QA')).toBeDefined();
  });

  it('keeps pending and delivered placement distinct, then focuses the moved card', async () => {
    const at = writableRuntime();
    const request = deferred<undefined>();
    at.holdRequest(request.promise);
    render(<StepBoardView project={at.project} action={at.action} onReturnToPlan={vi.fn()} />);
    const move = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Move 010 Build / Development to Done',
    });
    act(() => {
      move.focus();
    });
    fireEvent.click(move);
    expect(screen.getByRole('status').textContent).toContain('Updating step progress');
    expect(move.disabled).toBe(true);
    expect(
      within(screen.getByRole('region', { name: 'Unknown' })).getByRole('button', {
        name: 'Drag 010 Build / Development',
      }),
    ).toBeDefined();
    expect(
      within(screen.getByRole('region', { name: 'Done' })).queryByRole('button', {
        name: 'Drag 010 Build / Development',
      }),
    ).toBeNull();
    await act(async () => {
      request.resolve(undefined);
      await Promise.resolve();
    });
    const moved = await within(screen.getByRole('region', { name: 'Done' })).findByRole('button', {
      name: 'Drag 010 Build / Development',
    });
    expect(document.activeElement).toBe(moved);
    expect(at.calls).toEqual([['setProgress', 'leaf', 'dev', 'done']]);
  });

  it('sends a missing delivered focus surface to the app fault boundary', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const at = writableRuntime();
    const request = deferred<undefined>();
    at.holdRequest(request.promise);
    render(
      <AppFaultBoundary>
        <StepBoardView project={at.project} action={at.action} onReturnToPlan={vi.fn()} />
      </AppFaultBoundary>,
    );
    const move = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Move 010 Build / Development to Done',
    });
    act(() => {
      move.focus();
    });
    fireEvent.click(move);
    // The original native method receives its Map receiver explicitly below.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const register = Map.prototype.set;
    vi.spyOn(Map.prototype, 'set').mockImplementation(function (
      this: Map<unknown, unknown>,
      key,
      value,
    ) {
      if (
        value instanceof HTMLElement &&
        value.getAttribute('aria-label') === 'Drag 010 Build / Development'
      )
        return this;
      return register.call(this, key, value);
    });
    await act(async () => {
      request.resolve(undefined);
      await Promise.resolve();
    });
    expect(at.calls).toEqual([['setProgress', 'leaf', 'dev', 'done']]);
    expect(screen.getByRole('alert').hasAttribute('data-app-fault')).toBe(true);
  });

  it('exposes missing adjacent move controls from click and Enter without moving focus', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const at = writableRuntime();
    render(<StepBoardView project={at.project} action={at.action} onReturnToPlan={vi.fn()} />);
    const card = screen.getByRole('button', { name: 'Drag 010 Build / Development' });
    const parent = card.parentElement;
    if (parent === null) throw new Error('Step card parent missing in test');
    const controls = [...parent.querySelectorAll('button')];
    expect(controls).toHaveLength(2);
    controls.forEach((control) => {
      control.remove();
    });
    const errors: string[] = [];
    const recordError = (event: ErrorEvent): void => {
      errors.push(event.message);
      event.preventDefault();
    };
    window.addEventListener('error', recordError);
    try {
      act(() => {
        card.focus();
      });
      fireEvent.click(card);
      expect(document.activeElement).toBe(card);
      fireEvent.keyDown(card, { key: 'Enter' });
      expect(document.activeElement).toBe(card);
      expect(errors).toEqual([
        'Step card move control is missing',
        'Step card move control is missing',
      ]);
      expect(at.calls).toEqual([]);
    } finally {
      window.removeEventListener('error', recordError);
      card.after(...controls);
    }
  });

  it('does not move focus back after the user focuses another control', async () => {
    const at = writableRuntime();
    const request = deferred<undefined>();
    at.holdRequest(request.promise);
    render(<StepBoardView project={at.project} action={at.action} onReturnToPlan={vi.fn()} />);
    const move = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Move 010 Build / Development to Done',
    });
    act(() => {
      move.focus();
    });
    fireEvent.click(move);
    const returnToPlan = screen.getByRole('button', { name: 'Return to Plan' });
    act(() => {
      returnToPlan.focus();
    });
    await act(async () => {
      request.resolve(undefined);
      await Promise.resolve();
    });
    await within(screen.getByRole('region', { name: 'Done' })).findByRole('button', {
      name: 'Drag 010 Build / Development',
    });
    expect(document.activeElement).toBe(returnToPlan);
  });

  it('does not restore an old action focus into a replacement runtime with the same card identity', async () => {
    const old = writableRuntime();
    const request = deferred<undefined>();
    old.holdRequest(request.promise);
    const { rerender } = render(
      <StepBoardView project={old.project} action={old.action} onReturnToPlan={vi.fn()} />,
    );
    const move = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Move 010 Build / Development to Done',
    });
    act(() => {
      move.focus();
    });
    fireEvent.click(move);
    const replacement = writableRuntime({ dev: 'done', qa: 'done' });
    rerender(
      <StepBoardView
        project={replacement.project}
        action={replacement.action}
        onReturnToPlan={vi.fn()}
      />,
    );
    const newCard = within(screen.getByRole('region', { name: 'Done' })).getByRole('button', {
      name: 'Drag 010 Build / Development',
    });
    expect(document.activeElement).not.toBe(newCard);
    await act(async () => {
      request.resolve(undefined);
      await Promise.resolve();
    });
    expect(document.activeElement).not.toBe(newCard);
  });

  it('accepts only a local card drag, ignores repeated and outside drops, and keeps pending through dragend', async () => {
    const at = writableRuntime();
    const request = deferred<undefined>();
    at.holdRequest(request.promise);
    render(<StepBoardView project={at.project} action={at.action} onReturnToPlan={vi.fn()} />);
    const source = screen.getByRole('button', { name: 'Drag 010 Build / Development' });
    const unknown = screen.getByRole('region', { name: 'Unknown' });
    const done = screen.getByRole('region', { name: 'Done' });
    const inProgress = screen.getByRole('region', { name: 'In progress' });
    const forged = { getData: vi.fn(() => 'leaf:dev'), setData: vi.fn(), effectAllowed: 'move' };
    fireEvent.drop(done, { dataTransfer: forged });
    expect(at.calls).toEqual([]);
    fireEvent.dragStart(source, { dataTransfer: forged });
    fireEvent.drop(unknown, { dataTransfer: forged });
    fireEvent.dragEnd(source);
    expect(at.calls).toEqual([]);
    fireEvent.dragStart(source, { dataTransfer: forged });
    fireEvent.drop(document.body, { dataTransfer: forged });
    fireEvent.dragEnd(source);
    expect(at.calls).toEqual([]);
    fireEvent.dragStart(source, { dataTransfer: forged });
    fireEvent.keyDown(source, { key: 'Escape' });
    fireEvent.drop(done, { dataTransfer: forged });
    expect(at.calls).toEqual([]);
    fireEvent.dragStart(source, { dataTransfer: forged });
    fireEvent.dragOver(done, { dataTransfer: forged });
    fireEvent.drop(done, { dataTransfer: forged });
    fireEvent.dragEnd(source);
    fireEvent.drop(inProgress, { dataTransfer: forged });
    expect(at.calls).toEqual([['setProgress', 'leaf', 'dev', 'done']]);
    expect(at.action.snapshot().kind).toBe('pending');
    await act(async () => {
      request.resolve(undefined);
      await Promise.resolve();
    });
    await within(done).findByRole('button', { name: 'Drag 010 Build / Development' });
    expect(at.calls).toHaveLength(1);
  });

  it('rejects a captured drag after a peer changes its progress before drop', () => {
    const at = writableRuntime();
    render(<StepBoardView project={at.project} action={at.action} onReturnToPlan={vi.fn()} />);
    const source = screen.getByRole('button', { name: 'Drag 010 Build / Development' });
    fireEvent.dragStart(source, { dataTransfer: { setData: vi.fn() } });
    at.deliverPeer({ qa: 'done', dev: 'done' });
    fireEvent.drop(screen.getByRole('region', { name: 'In progress' }));
    expect(at.calls).toEqual([]);
    expect(screen.getByRole('status').textContent).toContain('step progress changed');
    expect(
      within(screen.getByRole('region', { name: 'Done' })).getByRole('button', {
        name: 'Drag 010 Build / Development',
      }),
    ).toBeDefined();
  });
});
