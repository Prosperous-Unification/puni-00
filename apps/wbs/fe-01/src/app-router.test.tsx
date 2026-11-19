import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { WorkPackageApi } from '@/lib/wbs-api';
import { fakeDirectoryApi } from '@/modules/directory/fake-directory-api';
import { workPackageSourceOver } from '@/modules/work-package/composition';
import { installSessionRuntime, type SessionRuntime } from '@/runtime/session-runtime';
import { installWorkPackageRuntime } from '@/runtime/work-package-runtime';
import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
import { createRefusingAddressApi } from '@/testing/refusing-address-api';
import { refusingApi } from '@/testing/refusing-api';
import { answerJson, stubServer } from '@/testing/stub-server';

import { AppRouter } from './app-router';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

publishApplicationRuntimeForEachTest();

/**
 * A `WorkPackageApi` with an empty deployment behind it.
 *
 * Only the four reads `WorkPackagePage` makes on arrival answer; everything else
 * rejects, because a route test that quietly succeeded at a write would be
 * asserting about the wrong page.
 */
function emptyWorkPackages(): WorkPackageApi {
  const notHere = () => Promise.reject(new Error('not_in_these_tests'));
  return refusingApi(
    {
      listWorkPackages: () => Promise.resolve([]),
      listProjects: () => Promise.resolve([]),
      openWorkPackage: notHere,
      createWorkPackage: notHere,
      renameWorkPackage: notHere,
      setAbbreviation: (_id, abbreviation) => Promise.resolve(abbreviation.toUpperCase()),
      tree: notHere,
      setEstimateMethod: notHere,
      setStartDate: notHere,
      listTeams: () => Promise.resolve([]),
      listTags: () => Promise.resolve([]),
      listWorkItemTypes: () => Promise.resolve([]),
      listExternalSystems: () => Promise.resolve([]),
      listServices: () => Promise.resolve([]),
      addTeam: notHere,
      listPeople: () => Promise.resolve([]),
      // The table reads the calendar markers on mount, alongside the plan, so a
      // double that stands in for a work package has to answer it: unstated, this api
      // refuses on purpose and the refusal arrives as a toast over every case in
      // this file. Empty is what these work packages have.
      listCalendarMarkers: () => Promise.resolve([]),
      addPerson: notHere,
      assignPerson: notHere,
      steps: () => Promise.resolve([]),
      addStep: notHere,
      renameStep: notHere,
      removeStep: notHere,
      createWorkItem: notHere,
      patchWorkItem: notHere,
      moveWorkItem: notHere,
      duplicateWorkItem: notHere,
      removeWorkItem: notHere,
      setEstimate: notHere,
      clearEstimate: notHere,
      freezeWorkPackage: notHere,
      unfreezeWorkPackage: notHere,
      unfreezeWorkItem: notHere,
      addDependency: notHere,
      removeDependency: notHere,
      undo: notHere,
      redo: notHere,
    },
    { projectIdOf: (_id: string) => 'fixture-project' },
  );
}

/**
 * A signed-in session's runtime over a fake directory, never withdrawn: these
 * cases are about routing, and the session owner has its own suites.
 */
const signedIn = (workPackages: WorkPackageApi = emptyWorkPackages()): SessionRuntime => {
  const source = workPackageSourceOver(workPackages, createRefusingAddressApi());
  return installSessionRuntime({
    userId: 'u1',
    directoryApi: fakeDirectoryApi(),
    catalogRoutes: workPackages,
    workPackageSourceFor: () => source,
    isCurrent: () => true,
    installWorkPackage: installWorkPackageRuntime,
    budgetMs: 1_000,
  }).services;
};

/** The signed-in region entered at one address, the way a reload enters it. */
const regionAt = (path: string) =>
  render(
    <AppRouter
      session={signedIn()}
      presence={() => null}
      account={<span>account menu</span>}
      history={createMemoryHistory({ initialEntries: [path] })}
    />,
  );

const directoryShowing = () => screen.queryByRole('heading', { name: 'Directory' }) !== null;
const workPackageShowing = () => screen.queryByRole('combobox', { name: 'Work package' }) !== null;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the signed-in region, routed', () => {
  itDom('draws the work package at /', async () => {
    regionAt('/');

    await waitFor(() => {
      expect(workPackageShowing()).toBe(true);
    });
    expect(directoryShowing()).toBe(false);
  });

  itDom('draws the directory at /directory', async () => {
    regionAt('/directory');

    await waitFor(() => {
      expect(directoryShowing()).toBe(true);
    });
    expect(workPackageShowing()).toBe(false);
  });

  itDom('draws the spaces list at /spaces', async () => {
    const sent = stubServer({
      'GET /api/spaces': [() => answerJson(200, { spaces: [], writable: false })],
    });
    regionAt('/spaces');

    expect(await screen.findByText('No spaces yet.')).toBeDefined();
    expect(sent.map((call) => call.route)).toContain('GET /api/spaces');
    expect(workPackageShowing()).toBe(false);
  });

  itDom('draws one space at /spaces/:spaceId', async () => {
    const sent = stubServer({
      'GET /api/spaces/s': [
        () =>
          answerJson(200, {
            space: {
              id: 's',
              name: 'Q3',
              virtual: false,
              workPackageCount: 0,
              revision: 1,
              createdById: 'u1',
              createdAt: 1,
            },
            writable: false,
            rows: [],
          }),
      ],
      'GET /api/spaces/s/roll-ups': [() => answerJson(200, { rollUps: {} })],
    });
    regionAt('/spaces/s');

    expect(await screen.findByRole('heading', { name: 'Q3' })).toBeDefined();
    expect(await screen.findByText('No work packages in this space yet.')).toBeDefined();
    expect(sent.map((call) => call.route)).toContain('GET /api/spaces/s');
    expect(workPackageShowing()).toBe(false);
  });

  itDom('draws a person’s load at /people/:personId/load, reading that person', async () => {
    const sent = stubServer({
      'GET /api/people/pe-a/load': [
        () =>
          answerJson(200, {
            person: { id: 'pe-a', name: 'Ana' },
            workPackages: [],
            overlaps: [],
            undated: [],
            unavailable: [],
          }),
      ],
    });
    regionAt('/people/pe-a/load');

    expect(await screen.findByText('Nothing booked in these weeks.')).toBeDefined();
    expect(sent.map((call) => call.route)).toContain('GET /api/people/pe-a/load');
    expect(workPackageShowing()).toBe(false);
  });

  itDom('draws organization administration at /organization', async () => {
    stubServer({
      'GET /api/organization/invitations': [() => answerJson(200, { invitations: [] })],
      'GET /api/organization/join-requests': [() => answerJson(200, { requests: [] })],
      'GET /api/organization/domains': [() => answerJson(200, { domains: [] })],
      'GET /api/organization/members': [() => answerJson(200, { members: [] })],
    });
    regionAt('/organization');

    expect(await screen.findByRole('heading', { name: 'Organization' })).toBeDefined();
    expect(await screen.findByText('No invitations yet.')).toBeDefined();
    expect(workPackageShowing()).toBe(false);
    expect(directoryShowing()).toBe(false);
  });

  /**
   * The reload, which is the whole reason the page has an address.
   *
   * A fresh region entered at `/directory` a second time — a new router, a new
   * history, nothing carried over — is exactly what a browser does on F5. A
   * page held in a state variable in `app.tsx` would draw the work package here.
   */
  itDom('draws the directory again when it is re-entered at /directory', async () => {
    const first = regionAt('/directory');
    await waitFor(() => {
      expect(directoryShowing()).toBe(true);
    });
    first.unmount();

    regionAt('/directory');
    await waitFor(() => {
      expect(directoryShowing()).toBe(true);
    });
    expect(workPackageShowing()).toBe(false);
  });

  /**
   * The header contract task 1.1 pins, read off both routes.
   *
   * Each route renders its own `AppHeader`: the account and the navigation are
   * on both, and the work package controls are on the work package alone — absent off it
   * rather than drawn dead.
   */
  itDom(
    'gives each page its own header, with the work package controls on the work package alone',
    async () => {
      const workPackage = regionAt('/');
      await waitFor(() => {
        expect(workPackageShowing()).toBe(true);
      });
      const workPackageBar = screen.getByRole('banner');
      expect(workPackageBar.textContent).toContain('account menu');
      expect(screen.getByRole('navigation', { name: 'Pages' })).toBeDefined();
      expect(screen.getByRole('link', { name: 'Directory' })).toBeDefined();
      workPackage.unmount();

      regionAt('/directory');
      await waitFor(() => {
        expect(directoryShowing()).toBe(true);
      });
      const directoryBar = screen.getByRole('banner');
      expect(directoryBar.textContent).toContain('account menu');
      expect(screen.getByRole('navigation', { name: 'Pages' })).toBeDefined();
      expect(screen.queryByRole('combobox', { name: 'Work package' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Rename work package' })).toBeNull();
    },
  );

  /**
   * The mark on the page that is showing, and the half that can be wrong.
   *
   * Both ends on both pages: a mark on the page that is showing says nothing
   * unless the other page is unmarked at the same moment.
   *
   * Proof: the directory's `Link` replaced by `<a href="/directory">` — the
   * shape somebody reaches for when a nav is "just two links" — and this failed
   * on `expected null to be 'page'` at `/directory`, the mark having come from
   * the router and nowhere else. Watched 2026-08-09. The
   * `activeOptions={{ exact: true }}` that was written first is **not** here:
   * removing it was watched changing nothing, because `/` and `/directory` are
   * siblings rather than parent and child.
   */
  itDom('marks only the page that is showing', async () => {
    const workPackage = regionAt('/');
    await waitFor(() => {
      expect(workPackageShowing()).toBe(true);
    });
    expect(screen.getByRole('link', { name: 'Plan' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Directory' }).getAttribute('aria-current')).toBeNull();
    workPackage.unmount();

    regionAt('/directory');
    await waitFor(() => {
      expect(directoryShowing()).toBe(true);
    });
    expect(screen.getByRole('link', { name: 'Directory' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getByRole('link', { name: 'Plan' }).getAttribute('aria-current')).toBeNull();
  });

  /**
   * The work package page opens its work package through the session's own owner, which
   * is what lets the session's retirement retire the work package first.
   */
  itDom(
    'opens the selected work package through the signed-in session’s own work package owner',
    async () => {
      const oneWorkPackage = emptyWorkPackages();
      oneWorkPackage.listWorkPackages = () =>
        Promise.resolve([
          {
            projectId: 'fixture-project',
            id: 'p1',
            name: 'Rewire the shed',
            restricted: false,
            abbreviation: 'PLAN',
            startDate: null,
            lastOpenedAt: null,
            createdByName: 'kat',
            createdAt: 0,
          },
        ]);
      oneWorkPackage.openWorkPackage = () => Promise.resolve();
      const session = signedIn(oneWorkPackage);
      render(
        <AppRouter
          session={session}
          presence={() => null}
          account={<span>account menu</span>}
          history={createMemoryHistory({ initialEntries: ['/'] })}
        />,
      );

      await waitFor(() => {
        const opened = session.workPackages.snapshot();
        expect(opened.status === 'live' ? opened.services.workPackageId : opened.status).toBe('p1');
      });
    },
  );
});
