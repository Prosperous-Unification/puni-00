import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppFaultBoundary } from '@/components/chrome/app-fault';
import { claimedPlan } from '@/testing/claims-fixture';
import { fakeProjectApi as fakeApi } from '@/testing/fake-project-api';
import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
import { projectServicesOf } from '@/testing/project-services-of';
import { WbsTableOverClient } from '@/testing/wbs-table-over-client';

import { CLAIM_SLOT_PX } from './claim-chip';
import { LEASE_TICK_MS } from './lease-clock';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

publishApplicationRuntimeForEachTest();

beforeEach(() => {
  // The plan remembers its collapse per project, and every case here is `p1`.
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  setVisibility('visible');
});

const rowFor = (number: string): HTMLElement => {
  const found = screen
    .getAllByRole('row')
    .find((tr) => tr.querySelector('[data-number]')?.textContent === number);
  if (found === undefined) throw new Error(`no row numbered ${number}`);
  return found;
};

const numbersOnScreen = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.querySelector('[data-number]')?.textContent ?? '');

/** The chips one row draws, by holder initials, in document order. */
const chipsIn = (scope: Element): string[] =>
  [...scope.querySelectorAll('[data-claim-chip]')].map((chip) => chip.textContent);

const PAINT_SENTENCE =
  "Claimed by codex since 24 Oct 10:42, run r-7, under claire's claim on 010; lease 14 min left";

/** Every `<col>`'s declared width, which is what the table's column widths are. */
const columnWidths = (): string[] =>
  [...document.querySelectorAll('col')].map((col) => (col as HTMLElement).style.width);

function drawTable(api: Parameters<typeof projectServicesOf>[0]) {
  return render(
    <AppFaultBoundary>
      <WbsTableOverClient projectId="p1" projectServices={projectServicesOf(api)} />
    </AppFaultBoundary>,
  );
}

let visibility: DocumentVisibilityState = 'visible';
function setVisibility(state: DocumentVisibilityState): void {
  visibility = state;
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  });
}

describe('a claimed step’s chip (wbs-claim-display 4.1)', () => {
  itDom('draws the holder’s initials beside the assignee in a folded cell', async () => {
    const { api } = await claimedPlan();
    drawTable(api);

    await waitFor(() => {
      expect(chipsIn(rowFor('010.1'))).toEqual(['CO']);
    });
    const cell = rowFor('010.1').querySelector('[data-final="step-dev"]');
    const assignee = cell?.querySelector('[data-folded-assignee="step-dev"]');
    const slot = cell?.querySelector('[data-folded-claim-slot="step-dev"]');
    expect(assignee?.textContent).toBe('· AD');
    expect(slot?.querySelector('[data-claim-chip="c-codex"]')).not.toBeNull();
    // Beside the assignee, after it: the figure, the person, then who holds it.
    expect(
      assignee !== null &&
        assignee !== undefined &&
        slot !== null &&
        slot !== undefined &&
        assignee.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // The folded chip shows no minutes: the cell's width goes to the figure.
    expect(slot?.querySelector('[data-claim-lease]')).toBeNull();
  });

  itDom('names the claim in full as the chip’s accessible name', async () => {
    const { api } = await claimedPlan();
    drawTable(api);

    const chip = await screen.findByRole('img', { name: PAINT_SENTENCE });
    expect(chip.getAttribute('data-claim-chip')).toBe('c-codex');
    // Display only: no tab stop, no action.
    expect(chip.getAttribute('tabindex')).toBeNull();
    expect(chip.closest('button')).toBeNull();
  });

  itDom('says holder, run and instant on the step card', async () => {
    const { api } = await claimedPlan();
    drawTable(api);
    await waitFor(() => {
      expect(chipsIn(rowFor('010.1'))).toEqual(['CO']);
    });

    fireEvent.mouseEnter(rowFor('010.1').querySelector('[data-final="step-dev"]')!);

    const line = screen.getByRole('tooltip').querySelector('[data-card-claim="c-codex"]');
    expect(line?.textContent).toBe(PAINT_SENTENCE);
  });

  itDom('draws the chip after the picker, with the lease, once the step unfolds', async () => {
    const { api } = await claimedPlan();
    drawTable(api);
    await waitFor(() => {
      expect(chipsIn(rowFor('010.1'))).toEqual(['CO']);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Unfold Dev estimates' }));

    const by = rowFor('010.1').querySelector('td[data-column="step-dev-assignee"]');
    const picker = by?.querySelector('input');
    const chip = by?.querySelector('[data-claim-chip="c-codex"]');
    expect(chip?.textContent).toBe('CO14m');
    expect(chip?.getAttribute('data-fact')).toBe(PAINT_SENTENCE);
    expect(
      picker !== null &&
        picker !== undefined &&
        chip !== null &&
        chip !== undefined &&
        picker.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  itDom('reserves no claim slot in a column nobody holds a claim in', async () => {
    // Claire's subtree claim holds no step: Dev is claimed, QA is not.
    const { api } = await claimedPlan(['c-claire', 'c-codex']);
    drawTable(api);
    await waitFor(() => {
      expect(chipsIn(rowFor('010.1'))).toEqual(['CO']);
    });

    expect(document.querySelector('[data-folded-claim-slot="step-qa"]')).toBeNull();
    // Every row of the claimed column gives up the same slot, empty where unclaimed.
    const empty = rowFor('020').querySelector<HTMLElement>('[data-folded-claim-slot="step-dev"]');
    expect(empty?.getAttribute('aria-hidden')).toBe('true');
    expect(empty?.style.width).toBe(`${String(CLAIM_SLOT_PX - 3)}px`);
  });

  itDom('leaves an unclaimed plan exactly as it was: no slot, the same columns', async () => {
    const claimed = await claimedPlan();
    drawTable(claimed.api);
    await waitFor(() => {
      expect(chipsIn(rowFor('010.1'))).toEqual(['CO']);
    });
    const claimedWidths = columnWidths();
    cleanup();

    const { api } = await claimedPlan([]);
    drawTable(api);
    await screen.findByLabelText('Name of 030');

    expect(document.querySelector('[data-folded-claim-slot]')).toBeNull();
    expect(document.querySelector('[data-subtree-claim]')).toBeNull();
    expect(columnWidths()).toEqual(claimedWidths);
  });
});

describe('a claim the tree does not hold (wbs-claim-display 4.2)', () => {
  itDom(
    'draws nothing for a claim on a row or step the tree lacks, and does not throw',
    async () => {
      // Only the intervals: a leased claim the tree lacks must not start the ticker either.
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
      // Dana's claim is drawable; the other three name what the tree lacks.
      const { api, extra, ids } = await claimedPlan(['c-dana', 'c-row', 'c-step', 'c-sub']);
      const absent = {
        runId: null,
        parentClaimId: null,
        claimedAt: 0,
        leaseExpiresAt: Date.now() + 10 * 60_000,
        leaseRevokedAt: null,
        holder: { personId: 'person-gil', name: 'gil' },
      };
      extra.push(
        { ...absent, claimId: 'c-row', workItemId: 'w-not-yet', stepId: 'step-dev' },
        { ...absent, claimId: 'c-step', workItemId: ids.sand, stepId: 'step-not-yet' },
        { ...absent, claimId: 'c-sub', workItemId: 'w-gone', stepId: null },
      );
      drawTable(api);

      // Dana's chip is the read installed; the others came with it.
      await waitFor(() => {
        expect(chipsIn(rowFor('030'))).toEqual(['DA']);
      });
      expect(numbersOnScreen()).toEqual(['010', '010.1', '020', '030']);
      expect(chipsIn(document.body)).toEqual(['DA']);
      expect(document.querySelector('[data-subtree-claim]')).toBeNull();
      // Dana's claim has no lease, so nothing drawn needs the ticker.
      expect(vi.getTimerCount()).toBe(0);
      expect(document.querySelector('[data-app-fault]')).toBeNull();
    },
  );
});

describe('a subtree claim’s chip (wbs-claim-display 5.1)', () => {
  itDom('sits in its own row’s Name cell and on no leaf under it', async () => {
    const { api } = await claimedPlan(['c-claire', 'c-codex']);
    drawTable(api);

    await waitFor(() => {
      expect(document.querySelector('[data-subtree-claim-chip]')).not.toBeNull();
    });
    const strip = rowFor('010').querySelector('td[data-column="name"]');
    expect(chipsIn(strip!)).toEqual(['CL14m']);
    expect(strip?.querySelector('[data-subtree-claim]')).not.toBeNull();
    const paint = rowFor('010.1').querySelector('td[data-column="name"]');
    expect(chipsIn(paint!)).toEqual([]);
    expect(paint?.querySelector('[data-subtree-claim]')).toBeNull();
    // The delegated claim's card names its parent's holder and number.
    expect(screen.getByRole('img', { name: PAINT_SENTENCE }).getAttribute('data-claim-chip')).toBe(
      'c-codex',
    );
  });

  itDom('gathers nothing onto a collapsed parent', async () => {
    const { api } = await claimedPlan(['c-claire', 'c-codex']);
    drawTable(api);
    await waitFor(() => {
      expect(chipsIn(rowFor('010.1'))).toEqual(['CO']);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));

    expect(numbersOnScreen()).toEqual(['010', '020', '030']);
    // Its own chip and none of the hidden leaf's.
    expect(chipsIn(rowFor('010'))).toEqual(['CL14m']);
  });
});

describe('the lease ticker (wbs-claim-display 6.2)', () => {
  /** Only the interval timers and the monotonic clock: `waitFor` keeps real timeouts. */
  const fakeTheTicker = () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  };

  itDom('runs one timer for every leased chip, and counts down on it', async () => {
    fakeTheTicker();
    const { api } = await claimedPlan();
    drawTable(api);
    await waitFor(() => {
      expect(chipsIn(rowFor('010.1'))).toEqual(['CO']);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Unfold Dev estimates' }));
    const by = () => rowFor('010.1').querySelector('td[data-column="step-dev-assignee"]');
    expect(by()?.textContent).toContain('14m');

    // Three leases in force are drawn (claire, codex, eve): one timer.
    expect(vi.getTimerCount()).toBe(1);

    act(() => {
      vi.advanceTimersByTime(2 * 60_000);
    });
    expect(by()?.textContent).toContain('12m');
    // Eve's thirty seconds ran out on the same timer.
    expect(
      rowFor('020').querySelector('td[data-column="step-dev-assignee"]')?.textContent,
    ).toContain('releasing');
    expect(LEASE_TICK_MS).toBe(15_000);
  });

  itDom('stops the ticker while the page is hidden, and resumes when it shows', async () => {
    fakeTheTicker();
    const { api } = await claimedPlan(['c-claire', 'c-codex']);
    drawTable(api);
    await waitFor(() => {
      expect(chipsIn(rowFor('010.1'))).toEqual(['CO']);
    });
    expect(vi.getTimerCount()).toBe(1);

    act(() => {
      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(vi.getTimerCount()).toBe(0);

    act(() => {
      setVisibility('visible');
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(vi.getTimerCount()).toBe(1);
  });

  itDom('runs no timer while no drawn claim holds a lease in force', async () => {
    fakeTheTicker();
    // Dana's has no lease and finn's credential is revoked.
    const { api } = await claimedPlan(['c-dana', 'c-finn']);
    drawTable(api);
    await waitFor(() => {
      expect(chipsIn(rowFor('030'))).toEqual(['DA']);
    });
    expect(chipsIn(rowFor('020'))).toEqual(['FI']);

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('an unclaimed plan', () => {
  itDom('runs no lease timer and draws no chip', async () => {
    const api = fakeApi();
    await api.createWorkItem('p1', { parentId: null, afterId: null, name: 'Strip' });
    drawTable(api);
    await screen.findByLabelText('Name of 010');

    expect(document.querySelector('[data-claim-chip]')).toBeNull();
  });
});
