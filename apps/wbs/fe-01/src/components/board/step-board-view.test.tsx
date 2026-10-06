import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppFaultBoundary } from '@/components/chrome/app-fault';
import type { PlanFeedDelivery } from '@/modules/plan-feed/contract';
import {
  createDeliveredPlan,
  type DeliveredPlanStore,
} from '@/modules/plan-feed/delivered-plan-store';
import type { ProjectRuntime } from '@/modules/project/contract';
import { planRead, workItemView } from '@/testing/views';

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
      staleResources: [],
      treeFailure: null,
      ...delivery,
    });
  });
}

function runtime(plan: DeliveredPlanStore) {
  const reread = vi.fn(() => Promise.resolve(true));
  const project: Pick<ProjectRuntime, 'projectId' | 'plan' | 'isCurrent' | 'reread'> = {
    projectId: 'p1',
    plan,
    isCurrent: () => true,
    reread,
  };
  return { project, reread };
}

describe('StepBoardView', () => {
  it('loads, then draws cards from the selected runtime plan', () => {
    const plan = createDeliveredPlan();
    const { project } = runtime(plan);
    render(<StepBoardView project={project} onReturnToPlan={vi.fn()} />);
    expect(screen.getByText('Loading board…')).toBeDefined();

    publish(plan, {
      tree: {
        generation: 1,
        value: planRead({
          workItems: [
            workItemView({ id: 'leaf', number: '020', name: 'Build', status: 'on_hold' }),
          ],
          steps: [{ id: 'qa', name: 'QA', allowancePercent: 0 }],
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
    const { project } = runtime(plan);
    render(<StepBoardView project={project} onReturnToPlan={vi.fn()} />);
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
            { id: 'qa', name: 'QA', allowancePercent: 0 },
            { id: 'dev', name: 'Development', allowancePercent: 0 },
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
        .getAllByRole('listitem')
        .map((card) => card.textContent),
    ).toEqual(['010 Review QA Status: Unknown', '010 Review Development Status: Unknown']);
    expect(within(done).getByText('Status: On hold')).toBeDefined();
    expect(within(inProgress).getByText('Status: On hold')).toBeDefined();
  });

  it('shows a first tree failure and retries through the current runtime', () => {
    const plan = createDeliveredPlan();
    const { project, reread } = runtime(plan);
    render(<StepBoardView project={project} onReturnToPlan={vi.fn()} />);
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
    const { project } = runtime(plan);
    render(<StepBoardView project={project} onReturnToPlan={vi.fn()} />);
    publish(plan, { staleResources: ['tree'] });
    expect(screen.getByRole('alert').textContent).toContain(
      'This plan may be out of date — the last refresh failed.',
    );
    expect(screen.queryByText('Loading board…')).toBeNull();
  });

  it('distinguishes an empty project from work with no project steps', () => {
    const plan = createDeliveredPlan();
    const { project } = runtime(plan);
    const onReturnToPlan = vi.fn();
    render(<StepBoardView project={project} onReturnToPlan={onReturnToPlan} />);
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
    const { project, reread } = runtime(plan);
    render(<StepBoardView project={project} onReturnToPlan={vi.fn()} />);
    publish(plan, {
      tree: {
        generation: 1,
        value: planRead({
          workItems: [workItemView({ id: 'leaf', name: 'Build' })],
          steps: [{ id: 'qa', name: 'QA', allowancePercent: 0 }],
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
          steps: [{ id: 'qa', name: 'QA', allowancePercent: 0 }],
        }),
      },
    });
    expect(screen.getByText('Built')).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Reconnecting');
  });

  it('does not combine separately delivered newer steps with an older tree', () => {
    const plan = createDeliveredPlan();
    const { project } = runtime(plan);
    render(<StepBoardView project={project} onReturnToPlan={vi.fn()} />);
    const leaf = workItemView({ id: 'leaf', name: 'Build' });
    publish(plan, {
      tree: {
        generation: 1,
        value: planRead({
          workItems: [leaf],
          steps: [{ id: 'qa', name: 'QA', allowancePercent: 0 }],
        }),
      },
      steps: [{ id: 'qa', name: 'QA', allowancePercent: 0 }],
    });
    expect(screen.getByText('QA')).toBeDefined();

    publish(plan, { steps: [{ id: 'dev', name: 'Development', allowancePercent: 0 }] });
    expect(screen.getByText('QA')).toBeDefined();
    expect(screen.queryByText('Development')).toBeNull();

    publish(plan, {
      tree: {
        generation: 2,
        value: planRead({
          workItems: [leaf],
          steps: [{ id: 'dev', name: 'Development', allowancePercent: 0 }],
        }),
      },
    });
    expect(screen.queryByText('QA')).toBeNull();
    expect(screen.getByText('Development')).toBeDefined();
  });

  it('sends invalid delivered progress to the visible app error boundary', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const plan = createDeliveredPlan();
    const { project } = runtime(plan);
    render(
      <AppFaultBoundary>
        <StepBoardView project={project} onReturnToPlan={vi.fn()} />
      </AppFaultBoundary>,
    );
    publish(plan, {
      tree: {
        generation: 1,
        value: planRead({
          workItems: [workItemView({ id: 'leaf', progress: { qa: 'blocked' as 'done' } })],
          steps: [{ id: 'qa', name: 'QA', allowancePercent: 0 }],
        }),
      },
    });
    expect(screen.getByRole('alert').hasAttribute('data-app-fault')).toBe(true);
    expect(screen.queryByRole('region', { name: 'Unknown' })).toBeNull();
  });
});
