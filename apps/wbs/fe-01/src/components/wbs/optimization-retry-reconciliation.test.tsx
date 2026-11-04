import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { type ConnectedPlanOptimizationView, WbsRequestError } from '@/lib/wbs-api';
import { fakeProjectApi } from '@/testing/fake-project-api';
import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
import { projectServicesOf } from '@/testing/project-services-of';
import { WbsTableOverClient } from '@/testing/wbs-table-over-client';

import type { SubscriptionHandlers } from './wbs-table';

publishApplicationRuntimeForEachTest();
afterEach(cleanup);

/** Internal API fixture: exercises runtime reconciliation, not the public HTTP decoder. */
const FAILED: ConnectedPlanOptimizationView = {
  enabled: true,
  engine: 'optimized',
  objective: 'pri',
  inputHash: 'q1',
  generation: 1,
  contractVersion: 'test',
  budgetMs: 60000,
  displayed: 'fast',
  variants: { pri: { state: 'failed', reason: 'timeout' }, time: { state: 'idle' } },
  finishDays: { fast: 10 },
  sameOrderAsFast: {},
  scope: {
    kind: 'connected-stage',
    projectId: 'p1',
    originOrdinal: 0,
    mode: 'isolated',
    quantum: 48,
    wireVersion: 1,
    boundary: { format: 'wbs-connected-stage', version: 1, canonical: 'q1-stage' },
    fixed: [
      {
        projectId: 'foreign',
        projectName: 'Old boundary',
        projectAbbreviation: 'OLD',
        workItemId: 'fixed',
        workItemName: 'Captured work',
        stepId: null,
        stepName: null,
        start: 2,
        finish: 8,
      },
    ],
  },
};

function nextQuestion(
  state: 'failed' | 'corrupt' | 'ready' | 'boundary-infeasible',
): ConnectedPlanOptimizationView {
  return {
    ...FAILED,
    inputHash: 'q2',
    contractVersion: 'changed-contract',
    budgetMs: 30000,
    scope: {
      ...FAILED.scope,
      boundary: { ...FAILED.scope.boundary, canonical: 'q2-stage' },
      fixed: [{ ...FAILED.scope.fixed[0], projectName: 'New boundary', start: 4, finish: 12 }],
    },
    variants: {
      pri:
        state === 'ready'
          ? { state, proof: 'proven' }
          : state === 'corrupt'
            ? { state, message: 'Stored response is malformed' }
            : state === 'failed'
              ? { state, reason: 'timeout' }
              : {
                  state,
                  certificate: {
                    kind: 'boundary-infeasible',
                    evidence: 'contradictory-bounds',
                    question: {
                      projectId: 'p1',
                      inputHash: 'q2',
                      questionHash: 'q2-question',
                      objective: 'pri',
                      contractVersion: 'changed-contract',
                      budgetMs: 30000,
                      quantum: 48,
                      wireVersion: 1,
                      stageBytes: 'q2-stage',
                    },
                  },
                },
      time: { state: 'idle' },
    },
    finishDays: state === 'ready' ? { fast: 10, pri: 7 } : { fast: 10 },
    sameOrderAsFast: state === 'ready' ? { pri: false } : {},
  };
}

function cueFact(): string | null {
  return screen.getByRole('button', { name: /is the active schedule/ }).getAttribute('data-fact');
}

function openCue(): void {
  fireEvent.click(screen.getByRole('button', { name: /is the active schedule/ }));
}

function terminalRefusal(): WbsRequestError {
  return new WbsRequestError({
    kind: 'refusal',
    operation: 'postApiProjectsByIdOptimizationRetry',
    refusal: { code: 'not-retryable', state: 'boundary-infeasible' },
  });
}

it.each([
  ['failed', 'failed'],
  ['failed', 'corrupt'],
  ['failed', 'ready'],
  ['failed', 'boundary-infeasible'],
  ['corrupt', 'failed'],
  ['corrupt', 'corrupt'],
  ['corrupt', 'ready'],
  ['corrupt', 'boundary-infeasible'],
] as const)(
  'a connected Q1 %s terminal Retry refusal reconciles Q2 %s only through its tree',
  async (initialState, state) => {
    const api = fakeProjectApi();
    await api.createWorkItem('p1', { parentId: null, afterId: null, name: 'Launch' });
    const readTree = api.tree.bind(api);
    let current: ConnectedPlanOptimizationView = {
      ...FAILED,
      variants: {
        pri:
          initialState === 'failed'
            ? { state: 'failed', reason: 'timeout' }
            : { state: 'corrupt', message: 'Malformed Q1' },
        time: { state: 'idle' },
      },
    };
    let readCount = 0;
    let releaseRead: () => void = () => {
      throw new Error('no held read');
    };
    let holdRead = false;
    api.tree = async (projectId) => {
      readCount += 1;
      if (holdRead)
        await new Promise<void>((resolve) => {
          releaseRead = resolve;
        });
      return { ...(await readTree(projectId)), optimization: current };
    };
    let rejectRetry: () => void = () => {
      throw new Error('no pending Retry');
    };
    const retry = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectRetry = () => {
            reject(terminalRefusal());
          };
        }),
    );
    api.retryOptimization = retry;
    let notify: () => void = () => {
      throw new Error('No stream subscriber');
    };
    const subscribe = (_projectId: string, handlers: SubscriptionHandlers) => {
      notify = handlers.onChange;
      return { seen: () => undefined, unsubscribe: () => undefined };
    };
    render(
      <WbsTableOverClient
        projectId="p1"
        projectServices={projectServicesOf(api)}
        subscribe={subscribe}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: /is the active schedule/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Retry Pri' }));
    await waitFor(() => {
      expect(retry).toHaveBeenCalledWith('p1', 'pri', 'q1');
    });
    const before = readCount;
    current = nextQuestion(state);
    holdRead = true;
    await act(async () => {
      rejectRetry();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(readCount).toBe(before + 1);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Optimization unavailable');
    expect(screen.getByRole('status')).not.toHaveTextContent('cannot fit');
    expect(screen.getByRole('status')).not.toHaveTextContent('earlier');
    expect(cueFact()).not.toContain('q2-question');
    expect(cueFact()).not.toContain('New boundary');
    expect(cueFact()).toContain('Old boundary');
    expect(retry).toHaveBeenCalledTimes(1);
    await act(async () => {
      releaseRead();
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /is the active schedule/ })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: /is the active schedule/ }));
    expect(cueFact()).toContain('New boundary');
    expect(cueFact()).not.toContain('Old boundary');
    if (state === 'ready' || state === 'boundary-infeasible') {
      expect(screen.queryByRole('menuitem', { name: 'Retry Pri' })).toBeNull();
      if (state === 'boundary-infeasible') {
        expect(screen.getByRole('menuitem', { name: /^Pri/ })).toHaveAttribute(
          'aria-disabled',
          'true',
        );
        expect(cueFact()).toContain('Question hash q2-question');
      }
      openCue();
      openCue();
      expect(screen.queryByRole('menuitem', { name: 'Retry Pri' })).toBeNull();
      expect(retry).toHaveBeenCalledTimes(1);
      openCue();
      holdRead = false;
      act(() => {
        notify();
      });
      await waitFor(() => {
        expect(readCount).toBe(before + 2);
      });
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /is the active schedule/ })).toBeEnabled(),
      );
      openCue();
      expect(screen.queryByRole('menuitem', { name: 'Retry Pri' })).toBeNull();
      expect(retry).toHaveBeenCalledTimes(1);
    } else {
      expect(screen.getByRole('menuitem', { name: 'Retry Pri' })).toBeEnabled();
      fireEvent.click(screen.getByRole('menuitem', { name: 'Retry Pri' }));
      await waitFor(() => {
        expect(retry).toHaveBeenLastCalledWith('p1', 'pri', 'q2');
      });
    }
    expect(document.querySelector('[data-cue-active]')?.textContent).toBe('Fast');
  },
);

it('a delayed terminal Retry refusal cannot toast or refresh a replacement runtime', async () => {
  const api = fakeProjectApi();
  await api.createWorkItem('p1', { parentId: null, afterId: null, name: 'Old owner' });
  const readTree = api.tree.bind(api);
  api.tree = async (projectId) => ({ ...(await readTree(projectId)), optimization: FAILED });
  let rejectRetry: () => void = () => {
    throw new Error('no pending Retry');
  };
  const retry = vi.fn(
    () =>
      new Promise<void>((_resolve, reject) => {
        rejectRetry = () => {
          reject(terminalRefusal());
        };
      }),
  );
  api.retryOptimization = retry;
  const oldRead = vi.spyOn(api, 'tree');
  const mounted = render(
    <WbsTableOverClient projectId="p1" projectServices={projectServicesOf(api)} />,
  );
  fireEvent.click(await screen.findByRole('button', { name: /is the active schedule/ }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Retry Pri' }));
  await waitFor(() => {
    expect(retry).toHaveBeenCalledTimes(1);
  });
  const replacement = fakeProjectApi();
  await replacement.createWorkItem('p1', { parentId: null, afterId: null, name: 'New owner' });
  const readReplacement = replacement.tree.bind(replacement);
  replacement.tree = async (projectId) => ({
    ...(await readReplacement(projectId)),
    optimization: nextQuestion('ready'),
  });
  const replacementRead = vi.spyOn(replacement, 'tree');
  mounted.rerender(
    <WbsTableOverClient projectId="p1" projectServices={projectServicesOf(replacement)} />,
  );
  await screen.findByDisplayValue('New owner');
  const oldCount = oldRead.mock.calls.length;
  const newCount = replacementRead.mock.calls.length;
  await act(async () => {
    rejectRetry();
    await Promise.resolve();
  });
  expect(oldRead).toHaveBeenCalledTimes(oldCount);
  expect(replacementRead).toHaveBeenCalledTimes(newCount);
  expect(screen.queryByText(/This captured optimization question cannot fit/)).toBeNull();
  expect(screen.getByRole('status')).toHaveTextContent('finishes 3 days earlier');
  openCue();
  expect(cueFact()).toContain('New boundary');
  expect(cueFact()).not.toContain('Old boundary');
  expect(screen.queryByRole('menuitem', { name: 'Retry Pri' })).toBeNull();
});

it.each(['ready', 'boundary-infeasible'] as const)(
  'a connected %s read retains captured facts but suppresses comparisons after stream refresh failure',
  async (state) => {
    const api = fakeProjectApi();
    await api.createWorkItem('p1', { parentId: null, afterId: null, name: 'Launch' });
    const readTree = api.tree.bind(api);
    const captured: ConnectedPlanOptimizationView =
      state === 'ready'
        ? {
            ...nextQuestion(state),
            variants: {
              pri: { state: 'ready', proof: 'proven' },
              time: { state: 'ready', proof: 'proven' },
            },
            finishDays: { fast: 10, pri: 7, time: 8 },
            sameOrderAsFast: { pri: false, time: true },
          }
        : nextQuestion(state);
    api.tree = async (projectId) => ({ ...(await readTree(projectId)), optimization: captured });
    let notify: () => void = () => {
      throw new Error('No stream subscriber');
    };
    const subscribe = (_projectId: string, handlers: SubscriptionHandlers) => {
      notify = handlers.onChange;
      return { seen: () => undefined, unsubscribe: () => undefined };
    };
    const retry = vi.spyOn(api, 'retryOptimization');
    render(
      <WbsTableOverClient
        projectId="p1"
        projectServices={projectServicesOf(api)}
        subscribe={subscribe}
      />,
    );
    await screen.findByRole('button', { name: /is the active schedule/ });
    expect(cueFact()).toContain('New boundary');
    if (state === 'ready') {
      expect(cueFact()).toContain('Pri against Time');
      expect(document.querySelector('[data-cue-suggestion]')).not.toBeNull();
    }
    api.tree = () => Promise.reject(new Error('offline'));
    act(() => {
      notify();
    });
    await waitFor(() => {
      expect(document.querySelector('[data-stale-tree]')).not.toBeNull();
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'This certificate and captured boundary may be stale',
    );
    expect(cueFact()).toContain('New boundary');
    expect(cueFact()).toContain('start 4, finish 12');
    expect(cueFact()).not.toContain('Pri against Time');
    expect(cueFact()).not.toContain('3 days earlier');
    expect(document.querySelector('[data-cue-suggestion]')).toBeNull();
    openCue();
    expect(screen.getByRole('menuitem', { name: /^✓ Fast/ })).not.toHaveTextContent('10 days');
    expect(screen.getByRole('menuitem', { name: /^Pri/ })).not.toHaveTextContent(
      /7 days|earlier|same order/,
    );
    expect(screen.getByRole('menuitem', { name: /^Time/ })).not.toHaveTextContent(
      /8 days|earlier|same order/,
    );
    expect(screen.queryByRole('menuitem', { name: 'Retry Pri' })).toBeNull();
    if (state === 'boundary-infeasible') expect(cueFact()).toContain('Question hash q2-question');
    openCue();
    const fresh = nextQuestion('failed');
    api.tree = async (projectId) => ({
      ...(await readTree(projectId)),
      optimization: {
        ...fresh,
        inputHash: 'q3',
        scope: {
          ...fresh.scope,
          boundary: { ...fresh.scope.boundary, canonical: 'q3-stage' },
          fixed: [{ ...fresh.scope.fixed[0], projectName: 'Fresh boundary', start: 5, finish: 13 }],
        },
      },
    });
    act(() => {
      notify();
    });
    await waitFor(() => {
      expect(document.querySelector('[data-stale-tree]')).toBeNull();
    });
    expect(screen.getByRole('status')).toHaveTextContent('Optimization unavailable');
    expect(cueFact()).not.toContain('Question hash q2-question');
    openCue();
    expect(screen.getByRole('menuitem', { name: 'Retry Pri' })).toBeEnabled();
    expect(retry).not.toHaveBeenCalled();
    expect(cueFact()).toContain('Fresh boundary');
    expect(cueFact()).toContain('start 5, finish 13');
    expect(cueFact()).not.toContain('New boundary');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Retry Pri' }));
    await waitFor(() => {
      expect(retry).toHaveBeenCalledExactlyOnceWith('p1', 'pri', 'q3');
    });
  },
);

it('a delayed connected Retry refusal cannot refresh or overwrite another project on the same API', async () => {
  const api = fakeProjectApi();
  const readTree = api.tree.bind(api);
  api.tree = async (projectId) => ({
    ...(await readTree(projectId)),
    optimization:
      projectId === 'p1'
        ? FAILED
        : {
            ...nextQuestion('ready'),
            scope: { ...nextQuestion('ready').scope, projectId: 'p2' },
          },
  });
  let rejectRetry: () => void = () => {
    throw new Error('No pending Retry');
  };
  const retry = vi.fn(
    () =>
      new Promise<void>((_resolve, reject) => {
        rejectRetry = () => {
          reject(terminalRefusal());
        };
      }),
  );
  api.retryOptimization = retry;
  const reads = vi.spyOn(api, 'tree');
  const mounted = render(
    <WbsTableOverClient projectId="p1" projectServices={projectServicesOf(api)} />,
  );
  fireEvent.click(await screen.findByRole('button', { name: /is the active schedule/ }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Retry Pri' }));
  await waitFor(() => {
    expect(retry).toHaveBeenCalledWith('p1', 'pri', 'q1');
  });
  mounted.rerender(<WbsTableOverClient projectId="p2" projectServices={projectServicesOf(api)} />);
  await screen.findByRole('button', { name: /Project p2/ });
  const readCount = reads.mock.calls.length;
  await act(async () => {
    rejectRetry();
    await Promise.resolve();
  });
  expect(reads).toHaveBeenCalledTimes(readCount);
  expect(screen.getByRole('status')).toHaveTextContent('Project p2');
  expect(screen.getByRole('status')).toHaveTextContent('finishes 3 days earlier');
  expect(cueFact()).toContain('New boundary');
  expect(cueFact()).not.toContain('Old boundary');
  expect(document.querySelector('[data-toast-text]')).toBeNull();
});
