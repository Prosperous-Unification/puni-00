import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { type PlanOptimizationView, WbsRequestError } from '@/lib/wbs-api';
import { fakeProjectApi } from '@/testing/fake-project-api';
import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
import { projectServicesOf } from '@/testing/project-services-of';
import { WbsTableOverClient } from '@/testing/wbs-table-over-client';

publishApplicationRuntimeForEachTest();
afterEach(cleanup);

const FAILED: PlanOptimizationView = {
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
};

function terminalRefusal(): WbsRequestError {
  return new WbsRequestError({
    kind: 'refusal',
    operation: 'postApiProjectsByIdOptimizationRetry',
    refusal: { code: 'not-retryable', state: 'boundary-infeasible' },
  });
}

it.each(['failed', 'corrupt', 'ready'] as const)(
  'a Q1 terminal Retry refusal reconciles Q2 %s only through its tree',
  async (state) => {
    const api = fakeProjectApi();
    await api.createWorkItem('p1', { parentId: null, afterId: null, name: 'Launch' });
    const readTree = api.tree.bind(api);
    let current = FAILED;
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
    render(<WbsTableOverClient projectId="p1" projectServices={projectServicesOf(api)} />);
    fireEvent.click(await screen.findByRole('button', { name: /is the active schedule/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Retry Pri' }));
    await waitFor(() => {
      expect(retry).toHaveBeenCalledWith('p1', 'pri', 'q1');
    });
    const before = readCount;
    current = {
      ...FAILED,
      inputHash: 'q2',
      contractVersion: 'changed-contract',
      budgetMs: 30000,
      variants: {
        pri:
          state === 'ready'
            ? { state, proof: 'proven' }
            : state === 'corrupt'
              ? { state, message: 'Stored response is malformed' }
              : { state, reason: 'timeout' },
        time: { state: 'idle' },
      },
    };
    holdRead = true;
    await act(async () => {
      rejectRetry();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(readCount).toBe(before + 1);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Optimization unavailable');
    await act(async () => {
      releaseRead();
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /is the active schedule/ })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: /is the active schedule/ }));
    if (state === 'ready') expect(screen.queryByRole('menuitem', { name: 'Retry Pri' })).toBeNull();
    else {
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
});
