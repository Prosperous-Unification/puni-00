import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { ProjectApi } from '@/lib/wbs-api';
import { fakeDirectoryApi } from '@/modules/directory/fake-directory-api';
import { installProjectRuntime } from '@/runtime/project-runtime';
import { installSessionRuntime, type SessionRuntime } from '@/runtime/session-runtime';
import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
import { refusingApi } from '@/testing/refusing-api';

import { AppRouter } from './app-router';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

publishApplicationRuntimeForEachTest();

/**
 * A `ProjectApi` with an empty deployment behind it.
 *
 * Only the four reads `ProjectPage` makes on arrival answer; everything else
 * rejects, because a route test that quietly succeeded at a write would be
 * asserting about the wrong page.
 */
function emptyProjects(): ProjectApi {
  const notHere = () => Promise.reject(new Error('not_in_these_tests'));
  return refusingApi({
    listProjects: () => Promise.resolve([]),
    openProject: notHere,
    createProject: notHere,
    renameProject: notHere,
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
    // double that stands in for a project has to answer it: unstated, this api
    // refuses on purpose and the refusal arrives as a toast over every case in
    // this file. Empty is what these projects have.
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
    freezeProject: notHere,
    unfreezeProject: notHere,
    unfreezeWorkItem: notHere,
    addDependency: notHere,
    removeDependency: notHere,
    undo: notHere,
    redo: notHere,
  });
}

/**
 * A signed-in session's runtime over a fake directory, never withdrawn: these
 * cases are about routing, and the session owner has its own suites.
 */
const signedIn = (): SessionRuntime =>
  installSessionRuntime({
    userId: 'u1',
    directoryApi: fakeDirectoryApi(),
    isCurrent: () => true,
    installProject: installProjectRuntime,
    budgetMs: 1_000,
  }).services;

/** The signed-in region entered at one address, the way a reload enters it. */
const regionAt = (path: string) =>
  render(
    <AppRouter
      session={signedIn()}
      token="t"
      presence={() => null}
      account={<span>account menu</span>}
      projectApi={emptyProjects()}
      history={createMemoryHistory({ initialEntries: [path] })}
    />,
  );

const directoryShowing = () => screen.queryByRole('heading', { name: 'Directory' }) !== null;
const projectShowing = () => screen.queryByRole('combobox', { name: 'Project' }) !== null;

afterEach(() => {
  cleanup();
});

describe('the signed-in region, routed', () => {
  itDom('draws the project at /', async () => {
    regionAt('/');

    await waitFor(() => {
      expect(projectShowing()).toBe(true);
    });
    expect(directoryShowing()).toBe(false);
  });

  itDom('draws the directory at /directory', async () => {
    regionAt('/directory');

    await waitFor(() => {
      expect(directoryShowing()).toBe(true);
    });
    expect(projectShowing()).toBe(false);
  });

  /**
   * The reload, which is the whole reason the page has an address.
   *
   * A fresh region entered at `/directory` a second time — a new router, a new
   * history, nothing carried over — is exactly what a browser does on F5. A
   * page held in a state variable in `app.tsx` would draw the project here.
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
    expect(projectShowing()).toBe(false);
  });

  /**
   * The header contract task 1.1 pins, read off both routes.
   *
   * Each route renders its own `AppHeader`: the account and the navigation are
   * on both, and the project controls are on the project alone — absent off it
   * rather than drawn dead.
   */
  itDom(
    'gives each page its own header, with the project controls on the project alone',
    async () => {
      const project = regionAt('/');
      await waitFor(() => {
        expect(projectShowing()).toBe(true);
      });
      const projectBar = screen.getByRole('banner');
      expect(projectBar.textContent).toContain('account menu');
      expect(screen.getByRole('navigation', { name: 'Pages' })).toBeDefined();
      expect(screen.getByRole('link', { name: 'Directory' })).toBeDefined();
      project.unmount();

      regionAt('/directory');
      await waitFor(() => {
        expect(directoryShowing()).toBe(true);
      });
      const directoryBar = screen.getByRole('banner');
      expect(directoryBar.textContent).toContain('account menu');
      expect(screen.getByRole('navigation', { name: 'Pages' })).toBeDefined();
      expect(screen.queryByRole('combobox', { name: 'Project' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Rename project' })).toBeNull();
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
    const project = regionAt('/');
    await waitFor(() => {
      expect(projectShowing()).toBe(true);
    });
    expect(screen.getByRole('link', { name: 'Plan' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Directory' }).getAttribute('aria-current')).toBeNull();
    project.unmount();

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
   * The project page opens its project through the session's own owner, which
   * is what lets the session's retirement retire the project first.
   */
  itDom(
    'opens the selected project through the signed-in session’s own project owner',
    async () => {
      const session = signedIn();
      const oneProject = emptyProjects();
      oneProject.listProjects = () =>
        Promise.resolve([
          {
            id: 'p1',
            name: 'Rewire the shed',
            restricted: false,
            startDate: null,
            lastOpenedAt: null,
            ownerName: 'kat',
            createdAt: 0,
          },
        ]);
      oneProject.openProject = () => Promise.resolve();
      render(
        <AppRouter
          session={session}
          token="t"
          presence={() => null}
          account={<span>account menu</span>}
          projectApi={oneProject}
          history={createMemoryHistory({ initialEntries: ['/'] })}
        />,
      );

      await waitFor(() => {
        const opened = session.projects.snapshot();
        expect(opened.status === 'live' ? opened.services.projectId : opened.status).toBe('p1');
      });
    },
  );
});
