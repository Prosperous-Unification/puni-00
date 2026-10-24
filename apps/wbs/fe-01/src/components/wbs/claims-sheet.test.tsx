import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { AppFaultBoundary } from '@/components/chrome/app-fault';
import type { ClaimHistoryEventView } from '@/lib/wbs-api';
import type { OpenProjectStream, ProjectStreamHandlers } from '@/modules/project/contract';
import { CLAIMED_AT, claimedPlan } from '@/testing/claims-fixture';
import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
import { projectServicesOf } from '@/testing/project-services-of';
import { WbsTableOverClient } from '@/testing/wbs-table-over-client';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

publishApplicationRuntimeForEachTest();

beforeEach(() => {
  localStorage.clear();
});

type Fixture = Awaited<ReturnType<typeof claimedPlan>>;

/** The table over the fixture, with the stream's handlers handed back to the case. */
function drawTable(api: Fixture['api']): { stream: () => ProjectStreamHandlers } {
  let handlers: ProjectStreamHandlers | null = null;
  const subscribe: OpenProjectStream = (_projectId, given) => {
    handlers = given;
    return { seen: () => undefined, unsubscribe: () => undefined };
  };
  render(
    <AppFaultBoundary>
      <WbsTableOverClient
        projectId="p1"
        projectServices={projectServicesOf(api)}
        subscribe={subscribe}
      />
    </AppFaultBoundary>,
  );
  return {
    stream: () => {
      if (handlers === null) throw new Error('the plan never subscribed');
      return handlers;
    },
  };
}

const claimsButton = (): HTMLElement | null => screen.queryByRole('button', { name: /^Claims/ });

async function openTheSheet(): Promise<HTMLElement> {
  const button = await waitFor(() => {
    const found = claimsButton();
    if (found === null) throw new Error('no Claims button yet');
    return found;
  });
  fireEvent.click(button);
  return screen.findByRole('dialog', { name: 'Claims' });
}

/** The held list as the sheet groups it: holder, then run, then each claim's words. */
function heldIn(sheet: HTMLElement): { holder: string; runs: { run: string; rows: string[] }[] }[] {
  return [...sheet.querySelectorAll<HTMLElement>('[data-claims-holder]')].map((holder) => ({
    holder: holder.getAttribute('data-claims-holder') ?? '',
    runs: [...holder.querySelectorAll<HTMLElement>('[data-claims-run]')].map((run) => ({
      run: run.getAttribute('data-claims-run') ?? '',
      rows: [...run.querySelectorAll<HTMLElement>('[data-held-claim]')].map(
        (row) => row.textContent,
      ),
    })),
  }));
}

const historyRows = (sheet: HTMLElement): string[] =>
  [...sheet.querySelectorAll<HTMLElement>('[data-claim-history-event]')].map(
    (row) => row.textContent,
  );

const MINUTE = 60_000;

function event(
  eventId: string,
  at: number,
  kind: ClaimHistoryEventView['kind'],
  reason: ClaimHistoryEventView['reason'],
  claims: ClaimHistoryEventView['claims'],
): ClaimHistoryEventView {
  return { eventId, act: 0, at, kind, reason, claims };
}

describe('the Claims toolbar button (wbs-claim-display 9.1, C16)', () => {
  itDom('reads the number of claims held', async () => {
    const { api } = await claimedPlan();
    drawTable(api);

    await waitFor(() => {
      expect(claimsButton()?.getAttribute('aria-label')).toBe('Claims, 5 held');
    });
    expect(claimsButton()?.textContent).toBe('Claims5');
  });

  itDom('is not drawn while no claim is held, so an unclaimed plan pays nothing', async () => {
    const { api, claimsReads } = await claimedPlan([]);
    drawTable(api);

    await screen.findByLabelText('Name of 010');
    await waitFor(() => {
      expect(claimsReads()).toBeGreaterThan(0);
    });
    expect(claimsButton()).toBeNull();
  });

  itDom('stays open with no number when the last claim goes while it is open', async () => {
    const fixture = await claimedPlan(['c-dana']);
    const { stream } = drawTable(fixture.api);
    const sheet = await openTheSheet();
    expect(heldIn(sheet).map((group) => group.holder)).toEqual(['dana']);

    // dana's claim is released: the next claims read lists nothing.
    fixture.api.readClaims = () => Promise.resolve({ readAt: Date.now(), claims: [] });
    act(() => {
      stream().onClaims();
    });

    await waitFor(() => {
      expect(heldIn(sheet)).toEqual([]);
    });
    expect(within(sheet).getByText('No claims are held.')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Claims' })).toBe(sheet);
    // Its trigger stays, hidden from the reader behind the open sheet, with no number.
    const trigger = document.querySelector(
      '[data-toolbar] [aria-haspopup="dialog"][aria-label^="Claims"]',
    );
    expect(trigger?.getAttribute('aria-label')).toBe('Claims');
    expect(trigger?.querySelector('[data-claims-count]')).toBeNull();
  });
});

describe('the Claims sheet (wbs-claim-display 9.1)', () => {
  itDom('groups the held claims by holder, then run, each with its lease text', async () => {
    const { api, extra, ids } = await claimedPlan(['c-codex', 'c-claire', 'c-codex-qa', 'c-dana']);
    extra.push({
      claimId: 'c-codex-qa',
      workItemId: ids.prime,
      stepId: 'step-qa',
      holder: { personId: 'person-codex', name: 'codex' },
      runId: 'r-8',
      parentClaimId: null,
      claimedAt: CLAIMED_AT + MINUTE,
      leaseExpiresAt: null,
      leaseRevokedAt: null,
    });
    drawTable(api);

    const sheet = await openTheSheet();

    expect(heldIn(sheet)).toEqual([
      {
        holder: 'claire',
        runs: [{ run: 'agent:claire:main', rows: ['010Strip · subtree14msince 24 Oct 10:42'] }],
      },
      {
        holder: 'codex',
        runs: [
          { run: 'r-7', rows: ['010.1Paint · Dev14msince 24 Oct 10:42'] },
          { run: 'r-8', rows: ['030Prime · QAsince 24 Oct 10:43'] },
        ],
      },
      { holder: 'dana', runs: [{ run: '', rows: ['030Prime · Devsince 24 Oct 10:42'] }] },
    ]);
  });

  itDom('lists a claim on a row the tree does not hold yet, by its read’s own words', async () => {
    const { api, extra } = await claimedPlan(['c-ghost']);
    extra.push({
      claimId: 'c-ghost',
      workItemId: 'w-not-yet',
      stepId: 'step-dev',
      holder: { personId: 'person-gil', name: 'gil' },
      runId: null,
      parentClaimId: null,
      claimedAt: CLAIMED_AT,
      leaseExpiresAt: null,
      leaseRevokedAt: null,
    });
    drawTable(api);

    const sheet = await openTheSheet();

    // The fixture names an absent row `999 Gone`: the claims read's own words.
    expect(heldIn(sheet)).toEqual([
      { holder: 'gil', runs: [{ run: '', rows: ['999Gone · Devsince 24 Oct 10:42'] }] },
    ]);
    // And the table draws nothing for it (C11).
    expect(document.querySelectorAll('[data-claim-chip="c-ghost"]')).toHaveLength(0);
  });

  itDom('lists the recent claims and releases, newest first, with why each went', async () => {
    const { api, history, ids } = await claimedPlan(['c-dana']);
    const codex = { personId: 'person-codex', name: 'codex' };
    const paint = { number: '010.1', numberIsFrozen: false, name: 'Paint' };
    history.push(
      event('e4', CLAIMED_AT + 4 * MINUTE, 'release', 'lease_expired', [
        {
          claimId: 'c-1',
          workItemId: ids.paint,
          stepId: 'step-dev',
          runId: 'r-7',
          holder: codex,
          item: paint,
        },
      ]),
      event('e3', CLAIMED_AT + 3 * MINUTE, 'release', 'credential_revoked', [
        {
          claimId: 'c-2',
          workItemId: ids.sand,
          stepId: 'step-qa',
          runId: 'r-11',
          holder: { personId: 'person-finn', name: 'finn' },
          item: { number: '020', numberIsFrozen: false, name: 'Sand' },
        },
      ]),
      event('e2', CLAIMED_AT + 2 * MINUTE, 'release', 'released', [
        {
          claimId: 'c-3',
          workItemId: 'w-gone',
          stepId: null,
          runId: null,
          holder: { personId: 'person-gone', name: null },
          item: null,
        },
      ]),
      event('e1', CLAIMED_AT, 'claim', 'claimed', [
        {
          claimId: 'c-1',
          workItemId: ids.paint,
          stepId: 'step-dev',
          runId: 'r-7',
          holder: codex,
          item: paint,
        },
      ]),
    );
    drawTable(api);

    const sheet = await openTheSheet();

    await waitFor(() => {
      expect(historyRows(sheet)).toEqual([
        '24 Oct 10:46codex released010.1 Paint · Devlease expired',
        '24 Oct 10:45finn released020 Sand · QAcredential revoked',
        '24 Oct 10:44a deleted person releaseda deleted item',
        '24 Oct 10:42codex claimed010.1 Paint · Dev',
      ]);
    });
  });

  itDom('says the history could not be read in place, and keeps the held list', async () => {
    const { api, history, historyReads } = await claimedPlan(['c-dana']);
    const read = api.readClaimHistory.bind(api);
    let failing = true;
    api.readClaimHistory = (projectId) =>
      failing ? Promise.reject(new Error('http_404')) : read(projectId);
    drawTable(api);

    const sheet = await openTheSheet();

    await within(sheet).findByText('Claim history could not be read.');
    expect(heldIn(sheet).map((group) => group.holder)).toEqual(['dana']);
    // Not the plan's failure, and not the claims read's.
    expect(document.querySelector('[data-stale-tree]')).toBeNull();
    expect(document.querySelector('[data-stale-claims]')).toBeNull();

    failing = false;
    history.push(
      event('e1', CLAIMED_AT, 'claim', 'claimed', [
        {
          claimId: 'c-dana',
          workItemId: 'w',
          stepId: null,
          runId: null,
          holder: { personId: 'person-dana', name: 'dana' },
          item: { number: '030', numberIsFrozen: false, name: 'Prime' },
        },
      ]),
    );
    const before = historyReads();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Retry history' }));

    await waitFor(() => {
      expect(historyRows(sheet)).toEqual(['24 Oct 10:42dana claimed030 Prime · subtree']);
    });
    expect(historyReads()).toBe(before + 1);
    expect(within(sheet).queryByText('Claim history could not be read.')).toBeNull();
  });

  itDom('says a failed claims read in place, over the last claims read', async () => {
    const fixture = await claimedPlan(['c-dana']);
    const { stream } = drawTable(fixture.api);
    const sheet = await openTheSheet();
    expect(sheet.querySelector('[data-claims-sheet-stale]')).toBeNull();

    fixture.api.readClaims = () => Promise.reject(new Error('http_500'));
    act(() => {
      stream().onClaims();
    });

    await waitFor(() => {
      expect(sheet.querySelector('[data-claims-sheet-stale]')?.textContent).toBe(
        'Claims could not be read. These are the last ones read.',
      );
    });
    expect(heldIn(sheet).map((group) => group.holder)).toEqual(['dana']);
  });

  itDom('rereads the history on a tree change while open, and not on claims_changed', async () => {
    const { api, claimsReads, historyReads } = await claimedPlan();
    const { stream } = drawTable(api);
    await waitFor(() => {
      expect(claimsButton()).not.toBeNull();
    });

    // Closed, the sheet reads nothing.
    act(() => {
      stream().onChange('tree_replaced');
    });
    await waitFor(() => {
      expect(claimsReads()).toBeGreaterThan(1);
    });
    expect(historyReads()).toBe(0);

    await openTheSheet();
    await waitFor(() => {
      expect(historyReads()).toBe(1);
    });

    // A heartbeat moves a lease: claims are read again, the history is not.
    const claimsBefore = claimsReads();
    act(() => {
      stream().onClaims();
    });
    await waitFor(() => {
      expect(claimsReads()).toBe(claimsBefore + 1);
    });
    // Let the installed claims render before counting.
    await act(async () => {
      await Promise.resolve();
    });
    expect(historyReads()).toBe(1);

    // A claim, release or reap announces the tree: the history follows it.
    act(() => {
      stream().onChange('tree_replaced');
    });
    await waitFor(() => {
      expect(historyReads()).toBe(2);
    });
  });

  itDom('offers no claim or release control', async () => {
    const { api } = await claimedPlan();
    drawTable(api);

    const sheet = await openTheSheet();
    await waitFor(() => {
      expect(within(sheet).getByText('No claims or releases yet.')).toBeInTheDocument();
    });

    expect(
      within(sheet)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['✕']);
    expect(within(sheet).queryByRole('button', { name: /claim|release/i })).toBeNull();
  });
});
