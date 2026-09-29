import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DirectorySnapshot } from '@/modules/directory-management/contract';
import { answerJson as answer, stubServer } from '@/testing/stub-server';

import { loadWindowFrom } from './load-window';
import { PersonLoadSummary, usePeopleLoad } from './people-load-summary';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const WINDOW = loadWindowFrom('2026-10-05');
const ROUTE = 'GET /api/people/load';

/** A directory store whose snapshot the test moves, the way a read or a write does. */
function fakeDirectory() {
  const listeners = new Set<() => void>();
  let snapshot = { busy: false } as DirectorySnapshot;
  return {
    subscribe: (onChange: () => void) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    snapshot: () => snapshot,
    move(busy: boolean) {
      snapshot = { busy } as DirectorySnapshot;
      for (const listener of listeners) listener();
    },
  };
}

function renderRows(directory = fakeDirectory()) {
  function Rows() {
    const view = usePeopleLoad(WINDOW, directory);
    return (
      <>
        <PersonLoadSummary view={view} personId="pe-a" personName="Ana" />
        <PersonLoadSummary view={view} personId="pe-new" personName="Nia" />
      </>
    );
  }
  const root = createRootRoute();
  const rows = createRoute({ getParentRoute: () => root, path: '/', component: Rows });
  const load = createRoute({ getParentRoute: () => root, path: '/people/$personId/load' });
  const router = createRouter({
    routeTree: root.addChildren([rows, load]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  render(<RouterProvider router={router} />);
  return directory;
}

const organization = (
  weeks: { weekOf: string; booked: number; overlapping: number }[],
  unavailable: unknown[] = [],
) => ({ people: [{ id: 'pe-a', name: 'Ana', weeks }], undated: [], unavailable });

describe('the directory load line', () => {
  it('sums each person’s weeks into a link whose name carries the figures', async () => {
    const sent = stubServer({
      [ROUTE]: [
        () =>
          answer(
            200,
            organization([
              { weekOf: '2026-10-05', booked: 3, overlapping: 2 },
              { weekOf: '2026-10-12', booked: 1.5, overlapping: 0 },
            ]),
          ),
      ],
    });
    renderRows();
    const ana = await screen.findByRole('link', {
      name: 'Load of Ana: 4.5 d booked, 2 d overlapping',
    });
    expect(ana.getAttribute('href')).toBe('/people/pe-a/load');
    expect(screen.getByRole('link', { name: 'Load of Nia: Load not read yet' })).toBeDefined();
    expect(sent.map((call) => [call.route, call.search])).toEqual([
      [ROUTE, '?from=2026-10-05&to=2026-11-27'],
    ]);
  });

  it('says the load is partly unknown when a project could not be read', async () => {
    stubServer({
      [ROUTE]: [
        () =>
          answer(
            200,
            organization([], [{ projectId: 'p', name: 'Loop', reason: 'engine_unavailable' }]),
          ),
      ],
    });
    renderRows();
    expect(
      await screen.findByRole('link', {
        name: 'Load of Ana: 0 d booked, 0 d overlapping; partly unknown: 1 project unavailable',
      }),
    ).toBeDefined();
  });

  it('reads the load again when the directory reads again, and not mid-write', async () => {
    const sent = stubServer({
      [ROUTE]: [
        () => answer(200, organization([{ weekOf: '2026-10-05', booked: 3, overlapping: 0 }])),
        () => answer(200, organization([{ weekOf: '2026-10-05', booked: 1, overlapping: 0 }])),
      ],
    });
    const directory = renderRows();
    await screen.findByRole('link', { name: 'Load of Ana: 3 d booked, 0 d overlapping' });
    act(() => {
      directory.move(true);
    });
    expect(sent).toHaveLength(1);
    act(() => {
      directory.move(false);
    });
    await screen.findByRole('link', { name: 'Load of Ana: 1 d booked, 0 d overlapping' });
    await waitFor(() => {
      expect(sent).toHaveLength(2);
    });
  });

  it('names an organization refusal as the person page does', async () => {
    stubServer({ [ROUTE]: [() => answer(403, { error: 'not_a_member' })] });
    renderRows();
    expect(
      (
        await screen.findAllByText(
          'Load unavailable: You are no longer a member of this organization.',
        )
      ).length,
    ).toBe(2);
  });

  it('says the load is unavailable when the read fails', async () => {
    stubServer({});
    renderRows();
    expect(
      (await screen.findAllByText('Load unavailable: Could not reach the server. Try again.'))
        .length,
    ).toBe(2);
  });
});
