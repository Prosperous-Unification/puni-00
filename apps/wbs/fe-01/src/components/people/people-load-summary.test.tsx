import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { answerJson as answer, stubServer } from '@/testing/stub-server';

import { loadWindowFrom } from './load-window';
import { PersonLoadSummary, usePeopleLoad } from './people-load-summary';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const WINDOW = loadWindowFrom('2026-10-05');

function Rows() {
  const view = usePeopleLoad(WINDOW);
  return (
    <>
      <PersonLoadSummary view={view} personId="pe-a" personName="Ana" />
      <PersonLoadSummary view={view} personId="pe-new" personName="Nia" />
    </>
  );
}

function renderRows() {
  const root = createRootRoute();
  const rows = createRoute({ getParentRoute: () => root, path: '/', component: Rows });
  const load = createRoute({ getParentRoute: () => root, path: '/people/$personId/load' });
  const router = createRouter({
    routeTree: root.addChildren([rows, load]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  render(<RouterProvider router={router} />);
}

describe('the directory load line', () => {
  it('sums each person’s weeks and links to their load page', async () => {
    const sent = stubServer({
      'GET /api/people/load': [
        () =>
          answer(200, {
            people: [
              {
                id: 'pe-a',
                name: 'Ana',
                weeks: [
                  { weekOf: '2026-10-05', booked: 3, overlapping: 2 },
                  { weekOf: '2026-10-12', booked: 1.5, overlapping: 0 },
                ],
              },
            ],
            undated: [],
            unavailable: [],
          }),
      ],
    });
    renderRows();
    const ana = await screen.findByRole('link', { name: 'Load of Ana' });
    expect(ana.textContent).toBe('4.5 d booked, 2 d overlapping');
    expect(ana.getAttribute('href')).toBe('/people/pe-a/load');
    expect(screen.getByRole('link', { name: 'Load of Nia' }).textContent).toBe('Load not read yet');
    expect(sent.map((call) => call.route)).toEqual(['GET /api/people/load']);
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
