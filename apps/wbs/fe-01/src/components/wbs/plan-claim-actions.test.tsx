import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppFaultBoundary } from '@/components/chrome/app-fault';
import { type WbsProblem, WbsRequestError } from '@/lib/wbs-api';
import { claimedPlan } from '@/testing/claims-fixture';
import { fakeProjectApi } from '@/testing/fake-project-api';
import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
import { projectServicesOf } from '@/testing/project-services-of';
import { WbsTableOverClient } from '@/testing/wbs-table-over-client';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

publishApplicationRuntimeForEachTest();

const ACCOUNT = 'account-dany';
const LAPTOP = 1280;
const PHONE = 390;

function widthIs(width: number): void {
  (window as unknown as { innerWidth: number }).innerWidth = width;
}

beforeEach(() => {
  localStorage.clear();
  widthIs(LAPTOP);
});

afterEach(() => {
  widthIs(LAPTOP);
});

type Api = ReturnType<typeof fakeProjectApi>;

/** Draws the plan signed in as `viewerAccountId`, or for no account at all with null. */
function drawTable(api: Api, viewerAccountId: string | null = ACCOUNT) {
  return render(
    <AppFaultBoundary>
      <WbsTableOverClient
        projectId="p1"
        projectServices={projectServicesOf(api)}
        {...(viewerAccountId === null ? {} : { viewerAccountId })}
      />
    </AppFaultBoundary>,
  );
}

/** Two rows, `dany` bound to the signed-in account and an agent bound to it too. */
async function twoRows() {
  const api = fakeProjectApi();
  const fence = await api.createWorkItem('p1', { parentId: null, afterId: null, name: 'Fence' });
  const gate = await api.createWorkItem('p1', { parentId: null, afterId: fence.id, name: 'Gate' });
  const dany = await api.addPerson('dany', []);
  const agent = await api.addPerson('claude-code', []);
  api.bindAccount(dany.id, ACCOUNT);
  // An agent the account runs is the account's, not the account: Claim names dany.
  api.bindAccount(agent.id, ACCOUNT);
  const listPeople = api.listPeople.bind(api);
  api.listPeople = async () =>
    (await listPeople()).map((person) =>
      person.id === agent.id ? { ...person, kind: 'agent' as const } : person,
    );
  return { api, ids: { fence: fence.id, gate: gate.id }, dany: dany.id };
}

const openRowMenu = async (number: string): Promise<void> => {
  fireEvent.click(await screen.findByRole('button', { name: `Actions for ${number}` }));
};

const itemLabels = (): (string | null)[] =>
  screen.getAllByRole('menuitem').map((item) => item.textContent);

const toastTexts = (): (string | null)[] =>
  [...document.querySelectorAll('[data-toast-text]')].map((node) => node.textContent);

const rowFor = (number: string): HTMLElement => {
  const found = screen
    .getAllByRole('row')
    .find((tr) => tr.querySelector('[data-number]')?.textContent === number);
  if (found === undefined) throw new Error(`no row numbered ${number}`);
  return found;
};

describe('claiming from the row menu (wbs-claim-display 11.2)', () => {
  itDom('offers Claim after the statuses, and claims for the bound person', async () => {
    const { api, ids, dany } = await twoRows();
    drawTable(api);

    await openRowMenu('010');
    const labels = itemLabels();
    expect(labels.indexOf('Claim')).toBe(labels.indexOf('Set status to Done') + 1);
    expect(labels.at(labels.indexOf('Claim') + 1)).toBe('Add child');

    fireEvent.click(screen.getByRole('menuitem', { name: 'Claim' }));

    await waitFor(() => {
      expect(api.claimCalls).toEqual([`claim:${ids.fence}:${dany}`]);
    });
    // The claim is read back and drawn: a human's chip with no lease, so no
    // countdown and no ticker.
    // Proof: `perform(['tree'], …)` in `claimRow` (claims not read again) made
    // this fail on `expected to have a length of 2 but got +0`; watched 2026-10-27.
    await waitFor(() => {
      expect(rowFor('010').querySelectorAll('[data-claim-chip]')).toHaveLength(2);
    });
    for (const chip of rowFor('010').querySelectorAll('[data-claim-chip]')) {
      expect(chip.getAttribute('data-lease')).toBe('none');
      expect(chip.textContent).toBe('DA');
      expect(chip.getAttribute('aria-label')).toMatch(/^Claimed by dany$/);
    }
  });

  itDom('offers Release my claim on a row the person holds, and releases it', async () => {
    const { api, ids, dany } = await twoRows();
    await api.claimWorkItem(ids.fence, dany);
    api.claimCalls.length = 0;
    drawTable(api);

    await waitFor(() => {
      expect(rowFor('010').querySelectorAll('[data-claim-chip]')).toHaveLength(2);
    });
    await openRowMenu('010');
    expect(itemLabels()).toContain('Release my claim');
    expect(itemLabels()).not.toContain('Claim');

    fireEvent.click(screen.getByRole('menuitem', { name: 'Release my claim' }));

    await waitFor(() => {
      expect(api.claimCalls).toEqual([`release:${ids.fence}:${dany}`]);
    });
    await waitFor(() => {
      expect(rowFor('010').querySelectorAll('[data-claim-chip]')).toHaveLength(0);
    });
    // The other row was never the person's: it still offers Claim.
    await openRowMenu('020');
    expect(itemLabels()).toContain('Claim');
  });

  itDom('names the holders when somebody else already holds the row', async () => {
    const { api } = await claimedPlan();
    const dany = await api.addPerson('dany', []);
    api.bindAccount(dany.id, ACCOUNT);
    // be-01's refusal as the shared client throws it, holders and all.
    api.claimWorkItem = () =>
      Promise.reject(
        new WbsRequestError({
          kind: 'refusal',
          operation: 'postApiProjectsByIdCommands',
          refusal: {
            at: 0,
            kind: 'claimWorkItem',
            error: 'already_claimed',
            holders: [{ claimId: 'c-eve', personId: 'person-eve', name: 'eve', runId: 'r-9' }],
          },
          // The body is the contract's own arm; the cast spares the
          // operation-indexed union's spelling.
        } as unknown as WbsProblem),
      );
    drawTable(api);

    await openRowMenu('020');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Claim' }));

    await waitFor(() => {
      expect(toastTexts()).toContain('Already claimed by eve (run r-9). Nothing was changed.');
    });
  });

  itDom('names the short resource and its holders when the claim cannot be held', async () => {
    const { api } = await twoRows();
    const gpu = {
      resourceId: 'res-gpu',
      asked: 1,
      free: 0,
      holders: [
        { personId: 'person-w', name: 'claude-code-worker', runId: 'r-2', workItemId: 'w9' },
      ],
    };
    api.claimWorkItem = () =>
      Promise.reject(
        new WbsRequestError({
          kind: 'refusal',
          operation: 'postApiProjectsByIdCommands',
          refusal: {
            at: 0,
            kind: 'claimWorkItem',
            error: 'resources_exhausted',
            ...gpu,
            resources: [gpu],
          },
        } as unknown as WbsProblem),
      );
    drawTable(api);

    await openRowMenu('010');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Claim' }));

    await waitFor(() => {
      expect(toastTexts()).toContain(
        'Not enough free: resource res-gpu needs 1, 0 free, held by claude-code-worker (run r-2). Nothing was changed.',
      );
    });
  });

  itDom('draws Claim refused, pointing at the Directory, for an unbound account', async () => {
    const { api } = await twoRows();
    drawTable(api, 'account-stranger');

    await openRowMenu('010');
    const claim = screen.getByRole('menuitem', { name: 'Claim' });
    expect(claim).toHaveAttribute('aria-disabled', 'true');
    expect(claim.getAttribute('data-fact')).toBe(
      'Your account is not bound to a person — an organization admin binds it in the Directory before you can claim',
    );

    fireEvent.click(claim);
    expect(api.claimCalls).toEqual([]);
  });

  itDom('refuses Claim on a done row', async () => {
    const { api, ids } = await twoRows();
    api.rows.find((row) => row.id === ids.gate)!.status = 'done';
    drawTable(api);

    await openRowMenu('020');
    expect(screen.getByRole('menuitem', { name: 'Claim' }).getAttribute('data-fact')).toBe(
      'Done — there is nothing left to claim',
    );
  });

  itDom('offers nothing about claims on a table drawn for no account', async () => {
    const { api } = await twoRows();
    drawTable(api, null);

    await openRowMenu('010');
    expect(itemLabels()).not.toContain('Claim');
    expect(itemLabels()).not.toContain('Release my claim');
  });

  itDom('offers the same Claim on a phone card', async () => {
    const { api, ids, dany } = await twoRows();
    widthIs(PHONE);
    drawTable(api);

    await screen.findByRole('article', { name: 'Work item 010' });
    fireEvent.click(screen.getByRole('button', { name: 'Actions for 010' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Claim' }));

    await waitFor(() => {
      expect(api.claimCalls).toEqual([`claim:${ids.fence}:${dany}`]);
    });
  });
});
