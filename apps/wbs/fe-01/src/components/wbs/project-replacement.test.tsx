import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Roster } from '@/components/presence/presence-panel';
import type { ProjectStreamDeps, SocketHandlers } from '@/lib/project-stream';
import type { ProjectListEntry, UndoResult } from '@/lib/wbs-api';
import type { ProjectRuntime } from '@/modules/project/contract';
import {
  createProjectOwner,
  installProjectRuntime,
  type ProjectOwner,
} from '@/runtime/project-runtime';
import { fakeProjectApi } from '@/testing/fake-project-api';
import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';

import { ProjectPage } from './project-page';
import type { SavedPlansPanelDeps } from './saved-plans-panel';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

publishApplicationRuntimeForEachTest();

const entry = (id: string, name: string): ProjectListEntry => ({
  id,
  name,
  restricted: false,
  startDate: null,
  lastOpenedAt: null,
  ownerName: 'kat',
  createdAt: 1_780_000_000_000,
});

/** A node without saved plans: the shelf is task 10's, and not what these cases replace. */
const NO_SHELF: SavedPlansPanelDeps = {
  available: () => Promise.resolve(false),
  list: () => Promise.reject(new Error('no saved plans on this node')),
  subscribe: () => ({ unsubscribe: () => undefined }),
  save: () => Promise.reject(new Error('no saved plans on this node')),
  compare: () => Promise.reject(new Error('no saved plans on this node')),
  rename: () => Promise.reject(new Error('no saved plans on this node')),
};

/**
 * Two projects over the plan fixture, with something to undo, and every undo
 * held until the case answers it — so a project can be left while its answer
 * is still on the way.
 */
function twoProjects() {
  const api = fakeProjectApi();
  api.stack.undoable = true;
  api.listProjects = () =>
    Promise.resolve([entry('p1', 'Rewire the shed'), entry('p2', 'Paint the fence')]);
  const undos: { answer: (outcome: UndoResult) => void; refuse: (cause: Error) => void }[] = [];
  api.undo = () =>
    new Promise<UndoResult>((answer, refuse) => {
      undos.push({ answer, refuse });
    });
  return { api, undos };
}

/** A socket per project the page subscribes to, and how many of them were closed. */
function recordedSockets() {
  const opened: SocketHandlers[] = [];
  let closed = 0;
  const streamDeps: ProjectStreamDeps = {
    openSocket: (_url, handlers) => {
      opened.push(handlers);
      return {
        send: () => undefined,
        close: () => {
          closed += 1;
        },
      };
    },
    schedule: () => 0,
    cancel: () => undefined,
    random: () => 0,
  };
  return { opened, closed: () => closed, streamDeps };
}

/**
 * The production owner over the production installer, recording each runtime
 * it builds and holding each retirement until the case lets it go.
 */
function recordingOwner({ hold = false }: { hold?: boolean } = {}) {
  const built: ProjectRuntime[] = [];
  const given: string[] = [];
  const releases: (() => void)[] = [];
  const owner: ProjectOwner = createProjectOwner({
    install: (dependencies) => {
      const installed = installProjectRuntime(dependencies);
      built.push(installed.services);
      return {
        services: installed.services,
        close: async (options) => {
          if (hold) await new Promise<void>((release) => releases.push(release));
          await installed.close(options);
          given.push(installed.services.projectId);
        },
      };
    },
    budgetMs: 1_000,
  });
  return { owner, built, given, releases };
}

async function selectProject(id: string) {
  await waitFor(() => {
    expect(screen.getByLabelText('Project')).toBeDefined();
  });
  fireEvent.focus(screen.getByLabelText('Project'));
  await waitFor(() => {
    expect(document.getElementById(`project-option-${id}`)).not.toBeNull();
  });
  const option = document.getElementById(`project-option-${id}`);
  if (option === null) throw new Error(`no option for ${id}`);
  fireEvent.click(option);
}

const liveProject = (owner: ProjectOwner): string => {
  const state = owner.snapshot();
  return state.status === 'live' ? state.services.projectId : state.status;
};

const tableDrawn = () =>
  waitFor(() => {
    const grid = document.querySelector('[data-grid]');
    if (grid === null) throw new Error('no table drawn yet');
    return grid;
  });

const toastTexts = (): string[] =>
  [...document.querySelectorAll('[data-toast-text]')].map((node) => node.textContent);

/** Opens `p1`, asks it for an undo, and moves to `p2` while that undo is still unanswered. */
async function leaveMidUndo(owner: ProjectOwner, undos: unknown[]) {
  await selectProject('p1');
  await tableDrawn();
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Undo' }).hasAttribute('disabled')).toBe(false);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  await waitFor(() => {
    expect(undos).toHaveLength(1);
  });
  await selectProject('p2');
  await waitFor(() => {
    expect(liveProject(owner)).toBe('p2');
  });
  await tableDrawn();
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Undo' }).hasAttribute('disabled')).toBe(false);
  });
}

/** The first of `list`, which the case has already waited for, or a loud failure. */
function firstOf<T>(list: readonly T[], what: string): T {
  const first = list.at(0);
  if (first === undefined) throw new Error(`no ${what} yet`);
  return first;
}

/** Lets every answer already on its way arrive, and React draw what it changed. */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

beforeEach(() => {
  localStorage.clear();
});

/**
 * Task 11: a project switch, and Strict Mode's re-entry, each replace all of
 * the selected project's ownership, and nothing a left project still has on
 * its way changes what the next one shows.
 */
describe('replacing the selected project', () => {
  /**
   * The toasts are the page's, handed to the table, so they outlive it: an
   * answer to an undo asked in `p1` lands in the page that now shows `p2`
   * unless the undo stack asks its own runtime first.
   */
  itDom(
    'says nothing in the next project when an undo asked of the last one succeeds',
    async () => {
      const { api, undos } = twoProjects();
      const { owner } = recordingOwner();
      render(<ProjectPage token="t" api={api} projectOwner={owner} savedPlansDeps={NO_SHELF} />);
      await leaveMidUndo(owner, undos);

      firstOf(undos, 'undo').answer({ ok: true, done: 'rename “Strip”', detail: null });
      await settle();

      expect(toastTexts()).toEqual([]);
      expect(screen.getByRole('button', { name: 'Undo' }).hasAttribute('disabled')).toBe(false);
    },
  );

  itDom(
    'says nothing in the next project when an undo asked of the last one is refused',
    async () => {
      const { api, undos } = twoProjects();
      const { owner } = recordingOwner();
      render(<ProjectPage token="t" api={api} projectOwner={owner} savedPlansDeps={NO_SHELF} />);
      await leaveMidUndo(owner, undos);

      firstOf(undos, 'undo').refuse(new Error('forbidden'));
      await settle();

      expect(toastTexts()).toEqual([]);
      expect(screen.getByRole('button', { name: 'Undo' }).hasAttribute('disabled')).toBe(false);
    },
  );

  /**
   * The interval between the withdrawal and the next runtime's publication,
   * held open: the old project's retirement waits for the case. Nothing of
   * either project is drawn in it, and a frame the old stream still delivers
   * changes nothing on screen.
   */
  itDom('draws no table and hands the header nobody while the last project lets go', async () => {
    const { api } = twoProjects();
    const { owner, releases, given } = recordingOwner({ hold: true });
    const sockets = recordedSockets();
    const asked: Roster[] = [];
    render(
      <ProjectPage
        token="t"
        api={api}
        projectOwner={owner}
        savedPlansDeps={NO_SHELF}
        streamDeps={sockets.streamDeps}
        presence={(roster) => {
          asked.push(roster);
          return null;
        }}
      />,
    );
    await selectProject('p1');
    await tableDrawn();
    await waitFor(() => {
      expect(sockets.opened).toHaveLength(1);
    });
    const first = firstOf(sockets.opened, 'socket for p1');
    act(() => {
      first.onOpen();
      first.onMessage(JSON.stringify({ type: 'presence', users: ['kat', 'lee'] }));
      first.onMessage(JSON.stringify({ type: 'resume_ack', replayed: { 'project:p1': 0 } }));
    });
    expect(asked.at(-1)).toEqual({ users: ['kat', 'lee'], connected: true });

    await selectProject('p2');
    await waitFor(() => {
      expect(releases).toHaveLength(1);
    });
    act(() => {
      first.onMessage(JSON.stringify({ type: 'presence', users: ['zed'] }));
    });
    await settle();

    expect(owner.snapshot().status).toBe('retiring');
    expect(document.querySelector('[data-grid]')).toBeNull();
    expect(asked.at(-1)).toEqual({ users: [], connected: false });

    await act(async () => {
      firstOf(releases, 'retirement')();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(liveProject(owner)).toBe('p2');
    });
    await tableDrawn();
    expect(given).toEqual(['p1']);
    expect(sockets.closed()).toBe(1);
  });

  /**
   * A new runtime is a new reader, and so a new table: nothing the last
   * project's table held — rows, drafts, focus — is carried into the next. The
   * table is drawn only while a runtime is published, and every replacement
   * withdraws the old one before the next is built, so the page draws the
   * interval between them and the next table mounts afresh.
   */
  itDom('draws the next project in a table of its own', async () => {
    const { api } = twoProjects();
    const { owner } = recordingOwner();
    render(<ProjectPage token="t" api={api} projectOwner={owner} savedPlansDeps={NO_SHELF} />);
    await selectProject('p1');
    const first = await tableDrawn();

    await selectProject('p2');
    await waitFor(() => {
      expect(liveProject(owner)).toBe('p2');
    });
    const next = await tableDrawn();

    expect(next).not.toBe(first);
    expect(first.isConnected).toBe(false);
  });

  /**
   * Strict Mode runs the page's render twice and its mount effects twice. The
   * page mounts with nothing selected, so its re-entry opens nothing; what it
   * must not do is open a project from a render, which Strict Mode's second
   * render would open again.
   */
  itDom('opens one runtime per pick under Strict Mode, and gives each back once', async () => {
    const { api } = twoProjects();
    const { owner, built, given } = recordingOwner();
    const sockets = recordedSockets();
    const view = render(
      <StrictMode>
        <ProjectPage
          token="t"
          api={api}
          projectOwner={owner}
          savedPlansDeps={NO_SHELF}
          streamDeps={sockets.streamDeps}
        />
      </StrictMode>,
    );
    await selectProject('p1');
    await tableDrawn();
    await selectProject('p2');
    await waitFor(() => {
      expect(liveProject(owner)).toBe('p2');
    });
    await tableDrawn();
    await settle();

    expect(built.map((runtime) => runtime.projectId)).toEqual(['p1', 'p2']);
    expect(given).toEqual(['p1']);
    expect(sockets.opened).toHaveLength(2);
    expect(sockets.closed()).toBe(1);

    view.unmount();
    await waitFor(() => {
      expect(owner.snapshot().status).toBe('empty');
    });
    expect(given).toEqual(['p1', 'p2']);
    expect(sockets.closed()).toBe(2);
  });
});
