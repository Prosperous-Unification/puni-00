import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AttemptView, WorkItemView } from '@/lib/wbs-api';
import { DEV, fakeProjectApi, QA } from '@/testing/fake-project-api';
import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
import { projectServicesOf } from '@/testing/project-services-of';
import { WbsTableOverClient } from '@/testing/wbs-table-over-client';

import { refusalSentence } from './plan-refusal';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

publishApplicationRuntimeForEachTest();

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  window.innerWidth = 1024;
});

const toastTexts = (): string[] =>
  [...document.querySelectorAll('[data-toast-text]')].map((node) => node.textContent);

/**
 * A plan whose one leaf's Dev node holds `attempts`, read in `Europe/Kyiv`,
 * through a fake whose three attempt commands write the row the next read
 * returns — be-01's answer, in the fake's terms — and record what was sent.
 */
async function planWithAttempts(
  attempts: AttemptView[],
  options: { olderRead?: boolean; phone?: boolean } = {},
) {
  const api = fakeProjectApi();
  const made = await api.createWorkItem('p1', { parentId: null, afterId: null, name: 'Strip' });
  const row = api.rows.find((each) => each.id === made.id);
  if (row === undefined) throw new Error('the fake made no row');
  const leaf: WorkItemView = row;
  leaf.attempts = { [DEV.id]: [...attempts] };
  leaf.nodeReadings = { [DEV.id]: 'in_progress', [QA.id]: 'unknown' };
  const readTree = api.tree.bind(api);
  api.tree = async (projectId) => ({
    ...(await readTree(projectId)),
    ...(options.olderRead ? {} : { timezone: 'Europe/Kyiv' }),
    stepNodes: [
      { id: 'sn.dev', workItemId: leaf.id, stepId: DEV.id, reference: '010.dev' },
      { id: 'sn.qa', workItemId: leaf.id, stepId: QA.id, reference: '010.qa' },
    ],
  });
  const devAttempts = (): AttemptView[] => leaf.attempts?.[DEV.id] ?? [];
  const start = vi.fn<(id: string, stepId: string) => Promise<void>>(() => {
    const next = Math.max(0, ...devAttempts().map((each) => each.attemptNumber)) + 1;
    leaf.attempts = {
      [DEV.id]: [
        ...devAttempts(),
        {
          attemptNumber: next,
          startedAt: Date.parse('2026-10-12T07:00:00Z'),
          endedAt: null,
          outcome: null,
          executorPersonId: null,
          reference: null,
          note: null,
        },
      ],
    };
    return Promise.resolve();
  });
  const end = vi.fn(
    (_id: string, _stepId: string, outcome: AttemptView['outcome'], reference?: string) => {
      leaf.attempts = {
        [DEV.id]: devAttempts().map((each) =>
          each.outcome === null
            ? {
                ...each,
                endedAt: Date.parse('2026-10-12T07:40:00Z'),
                outcome,
                reference: reference ?? null,
              }
            : each,
        ),
      };
      return Promise.resolve();
    },
  );
  const remove = vi.fn((_id: string, _stepId: string, attemptNumber: number) => {
    leaf.attempts = {
      [DEV.id]: devAttempts().filter((each) => each.attemptNumber !== attemptNumber),
    };
    return Promise.resolve();
  });
  api.startAttempt = start;
  api.endAttempt = end;
  api.removeAttempt = remove;
  if (options.phone) window.innerWidth = 390;
  render(<WbsTableOverClient projectId="p1" projectServices={projectServicesOf(api)} />);
  const estimate = await screen.findByLabelText('Dev estimate for 010');
  fireEvent.focus(estimate);
  return { api, leaf, start, end, remove };
}

const FAILED_ONE: AttemptView = {
  attemptNumber: 1,
  startedAt: Date.parse('2026-10-11T08:00:00Z'),
  endedAt: Date.parse('2026-10-11T08:40:00Z'),
  outcome: 'failed',
  executorPersonId: null,
  reference: null,
  note: null,
};

describe('attempt actions on the step card (step-node-attempts D7)', () => {
  itDom('keeps the attempt count on a phone when an older read has no timezone', async () => {
    await planWithAttempts([FAILED_ONE], { phone: true, olderRead: true });
    expect(screen.getByText('Attempts (1)')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Attempts at 010.dev' })).toBeNull();
  });

  itDom('starts an attempt through the batch and lists it running', async () => {
    const { leaf, start } = await planWithAttempts([FAILED_ONE]);
    fireEvent.click(screen.getByRole('button', { name: 'Start attempt' }));
    await waitFor(() => {
      expect(start).toHaveBeenCalledWith(leaf.id, DEV.id);
    });
    const list = await screen.findByRole('list', { name: 'Attempts at 010.dev' });
    await waitFor(() => {
      expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent(
        '#2 running · 12 Oct 10:00 – now',
      );
    });
    expect(screen.getByRole('button', { name: 'End attempt 2…' })).toBeInTheDocument();
  });

  itDom('ends it succeeded with a reference and offers Start again', async () => {
    const { leaf, end } = await planWithAttempts([
      FAILED_ONE,
      { ...FAILED_ONE, attemptNumber: 2, endedAt: null, outcome: null },
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'End attempt 2…' }));
    const dialog = await screen.findByRole('dialog', { name: 'End attempt 2 of 010.dev' });
    const confirm = within(dialog).getByRole('button', { name: 'End attempt' });
    expect(confirm).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('radio', { name: /Succeeded/ }));
    fireEvent.change(within(dialog).getByLabelText('Reference'), {
      target: { value: '  PR #12 ' },
    });
    fireEvent.click(confirm);
    await waitFor(() => {
      expect(end).toHaveBeenCalledWith(leaf.id, DEV.id, 'succeeded', 'PR #12');
    });
    expect(screen.queryByRole('dialog', { name: 'End attempt 2 of 010.dev' })).toBeNull();
    fireEvent.focus(screen.getByLabelText('Dev estimate for 010'));
    const list = await screen.findByRole('list', { name: 'Attempts at 010.dev' });
    await waitFor(() => {
      expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent(
        /#2 succeeded · .* · PR #12/,
      );
    });
    expect(screen.getByRole('button', { name: 'Start attempt' })).toBeInTheDocument();
  });

  itDom('cancelling the End dialog sends nothing', async () => {
    const { end } = await planWithAttempts([{ ...FAILED_ONE, endedAt: null, outcome: null }]);
    fireEvent.click(screen.getByRole('button', { name: 'End attempt 1…' }));
    const dialog = await screen.findByRole('dialog', { name: 'End attempt 1 of 010.dev' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(end).not.toHaveBeenCalled();
  });

  itDom('removes an attempt and says Undo puts it back', async () => {
    const { leaf, remove } = await planWithAttempts([FAILED_ONE]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove attempt 1 of 010.dev' }));
    await waitFor(() => {
      expect(remove).toHaveBeenCalledWith(leaf.id, DEV.id, 1);
    });
    await waitFor(() => {
      expect(toastTexts()).toContain('Removed attempt 1 of 010.dev. Undo puts it back.');
    });
  });

  itDom('words a refused start in a toast', async () => {
    const { api } = await planWithAttempts([FAILED_ONE]);
    api.startAttempt = () => Promise.reject(new Error('attempt_running'));
    fireEvent.click(screen.getByRole('button', { name: 'Start attempt' }));
    await waitFor(() => {
      expect(toastTexts()).toContain(
        'An attempt at this step is already running — end it before starting another. Nothing was changed.',
      );
    });
  });
});

describe('attempt refusal words', () => {
  it('words each attempt refusal rather than naming its code', () => {
    for (const code of [
      'node_done',
      'attempt_running',
      'budget_exhausted',
      'no_running_attempt',
      'attempt_in_future',
      'attempt_ends_before_start',
      'unknown_attempt',
    ]) {
      expect(refusalSentence(new Error(code)), code).not.toContain(code);
    }
  });
});
