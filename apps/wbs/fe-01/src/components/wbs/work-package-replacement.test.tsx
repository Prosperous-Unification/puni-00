import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Roster } from '@/components/presence/presence-panel';
import type { SavedPlanListEntryView, SavedPlanListReply } from '@/lib/saved-plan-api';
import type { UndoResult, WorkPackageListEntry } from '@/lib/wbs-api';
import type { SocketHandlers, WorkPackageStreamDeps } from '@/lib/work-package-stream';
import type { SavedPlanRoutes } from '@/modules/saved-plans/contract';
import type { WorkPackageRuntime } from '@/modules/work-package/contract';
import {
  createWorkPackageOwner,
  installWorkPackageRuntime,
  type WorkPackageOwner,
} from '@/runtime/work-package-runtime';
import { fakeWorkPackageApi } from '@/testing/fake-work-package-api';
import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
import { NO_SAVED_PLANS } from '@/testing/no-saved-plans';
import { pageWiring } from '@/testing/work-package-page-over-owner';

import { WorkPackagePage } from './work-package-page';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

publishApplicationRuntimeForEachTest();

const entry = (id: string, name: string): WorkPackageListEntry => ({
  projectId: 'fixture-project',
  id,
  name,
  restricted: false,
  abbreviation: 'PLAN',
  startDate: null,
  lastOpenedAt: null,
  createdByName: 'kat',
  createdAt: 1_780_000_000_000,
});

/**
 * Two work packages over the plan fixture, with something to undo, and every undo
 * held until the case answers it — so a work package can be left while its answer
 * is still on the way.
 */
function twoWorkPackages() {
  const api = fakeWorkPackageApi();
  api.stack.undoable = true;
  api.listWorkPackages = () =>
    Promise.resolve([entry('p1', 'Rewire the shed'), entry('p2', 'Paint the fence')]);
  const undos: { answer: (outcome: UndoResult) => void; refuse: (cause: Error) => void }[] = [];
  api.undo = () =>
    new Promise<UndoResult>((answer, refuse) => {
      undos.push({ answer, refuse });
    });
  return { api, undos };
}

/** A socket per work package the page subscribes to, and how many of them were closed. */
function recordedSockets() {
  const opened: SocketHandlers[] = [];
  let closed = 0;
  const streamDeps: WorkPackageStreamDeps = {
    openSocket: (handlers) => {
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

/** One saved plan, named for the work package and the moment it is answered in. */
const checkpoint = (id: string, name: string): SavedPlanListEntryView => ({
  id,
  name,
  createdBy: 'kat',
  createdAt: 1_788_501_600_000,
  inputBytes: 4096,
  scheduleBytes: null,
  scheduleAbsentReason: 'not_computed',
});

/**
 * Saved plans on every work package, each shelf read held until the case answers it,
 * and a broadcast per work package the case fires by hand.
 */
function heldShelves() {
  const reads: {
    workPackageId: string;
    answer: (rows: readonly SavedPlanListEntryView[]) => void;
  }[] = [];
  const broadcasts = new Map<string, () => void>();
  const unsubscribed: string[] = [];
  const notServed = () => Promise.reject(new Error('not asked in this case'));
  const routes: SavedPlanRoutes = {
    available: () => Promise.resolve(true),
    list: (workPackageId) =>
      new Promise<SavedPlanListReply>((resolve) => {
        reads.push({
          workPackageId,
          answer: (rows) => {
            resolve({
              kind: 'success',
              representation: 'json',
              status: 200,
              headers: new Headers(),
              body: { savedPlans: [...rows] },
            });
          },
        });
      }),
    save: notServed,
    rename: notServed,
    remove: notServed,
    compare: notServed,
    subscribe: (workPackageId, onChange) => {
      broadcasts.set(workPackageId, onChange);
      return {
        unsubscribe: () => {
          unsubscribed.push(workPackageId);
          broadcasts.delete(workPackageId);
        },
      };
    },
  };
  /** The newest read of this work package the case has not answered yet. */
  const pending = (workPackageId: string) => {
    const at = reads.map((candidate) => candidate.workPackageId).lastIndexOf(workPackageId);
    if (at === -1) throw new Error(`no shelf read of ${workPackageId} yet`);
    return reads.splice(at, 1)[0].answer;
  };
  return { routes, reads, broadcasts, unsubscribed, pending };
}

/** The saved-plan names the shelf is drawing, or `null` while no shelf is drawn. */
const shelfNames = (): string[] | null => {
  const shelf = document.querySelector('[data-saved-plans]');
  if (shelf === null) return null;
  return [...shelf.querySelectorAll('li')].map((row) => row.textContent);
};

/**
 * The production owner over the production installer, recording each runtime
 * it builds and holding each retirement until the case lets it go.
 */
function recordingOwner({ hold = false }: { hold?: boolean } = {}) {
  const built: WorkPackageRuntime[] = [];
  const given: string[] = [];
  const releases: (() => void)[] = [];
  const owner: WorkPackageOwner = createWorkPackageOwner({
    install: (dependencies) => {
      const installed = installWorkPackageRuntime(dependencies);
      built.push(installed.services);
      return {
        services: installed.services,
        close: async (options) => {
          if (hold) await new Promise<void>((release) => releases.push(release));
          await installed.close(options);
          given.push(installed.services.workPackageId);
        },
      };
    },
    budgetMs: 1_000,
  });
  return { owner, built, given, releases };
}

async function selectWorkPackage(id: string) {
  await waitFor(() => {
    expect(screen.getByLabelText('Work package')).toBeDefined();
  });
  fireEvent.focus(screen.getByLabelText('Work package'));
  await waitFor(() => {
    expect(document.getElementById(`work-package-option-${id}`)).not.toBeNull();
  });
  const option = document.getElementById(`work-package-option-${id}`);
  if (option === null) throw new Error(`no option for ${id}`);
  fireEvent.click(option);
}

const liveWorkPackage = (owner: WorkPackageOwner): string => {
  const state = owner.snapshot();
  return state.status === 'live' ? state.services.workPackageId : state.status;
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
async function leaveMidUndo(owner: WorkPackageOwner, undos: unknown[]) {
  await selectWorkPackage('p1');
  await tableDrawn();
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Undo' }).hasAttribute('disabled')).toBe(false);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  await waitFor(() => {
    expect(undos).toHaveLength(1);
  });
  await selectWorkPackage('p2');
  await waitFor(() => {
    expect(liveWorkPackage(owner)).toBe('p2');
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
 * Task 11: a work package switch, and Strict Mode's re-entry, each replace all of
 * the selected work package's ownership, and nothing a left work package still has on
 * its way changes what the next one shows.
 */
describe('replacing the selected work package', () => {
  /**
   * The toasts are the page's, handed to the table, so they outlive it: an
   * answer to an undo asked in `p1` lands in the page that now shows `p2`
   * unless the undo stack asks its own runtime first.
   */
  itDom(
    'says nothing in the next work package when an undo asked of the last one succeeds',
    async () => {
      const { api, undos } = twoWorkPackages();
      const { owner } = recordingOwner();
      render(<WorkPackagePage {...pageWiring(owner, api, undefined, NO_SAVED_PLANS)} />);
      await leaveMidUndo(owner, undos);

      firstOf(undos, 'undo').answer({ ok: true, done: 'rename “Strip”', detail: null });
      await settle();

      expect(toastTexts()).toEqual([]);
      expect(screen.getByRole('button', { name: 'Undo' }).hasAttribute('disabled')).toBe(false);
    },
  );

  itDom(
    'says nothing in the next work package when an undo asked of the last one is refused',
    async () => {
      const { api, undos } = twoWorkPackages();
      const { owner } = recordingOwner();
      render(<WorkPackagePage {...pageWiring(owner, api, undefined, NO_SAVED_PLANS)} />);
      await leaveMidUndo(owner, undos);

      firstOf(undos, 'undo').refuse(new Error('forbidden'));
      await settle();

      expect(toastTexts()).toEqual([]);
      expect(screen.getByRole('button', { name: 'Undo' }).hasAttribute('disabled')).toBe(false);
    },
  );

  itDom(
    'says nothing in the next work package when a dependency list asked of the last one is refused',
    async () => {
      const { api } = twoWorkPackages();
      for (const name of ['First', 'Second', 'Successor']) {
        await api.createWorkItem('p1', { parentId: null, afterId: null, name });
      }
      // Every entry of the list is refused, the first only once the case says so.
      const refusals: ((cause: Error) => void)[] = [];
      api.addDependency = () =>
        refusals.length === 0
          ? new Promise<void>((_resolve, refuse) => {
              refusals.push(refuse);
            })
          : Promise.reject(new Error('cycle'));
      const { owner } = recordingOwner();
      render(<WorkPackagePage {...pageWiring(owner, api, undefined, NO_SAVED_PLANS)} />);
      await selectWorkPackage('p1');
      await tableDrawn();
      const list = await screen.findByLabelText('Add a dependency to 030');
      fireEvent.change(list, { target: { value: '010, 020' } });
      fireEvent.keyDown(list, { key: 'Enter' });
      await waitFor(() => {
        expect(refusals).toHaveLength(1);
      });
      await selectWorkPackage('p2');
      await waitFor(() => {
        expect(liveWorkPackage(owner)).toBe('p2');
      });
      await tableDrawn();

      firstOf(refusals, 'dependency')(new Error('cycle'));
      await settle();
      await settle();

      expect(toastTexts()).toEqual([]);
    },
  );

  /**
   * The interval between the withdrawal and the next runtime's publication,
   * held open: the old work package's retirement waits for the case. Nothing of
   * either work package is drawn in it, and a frame the old stream still delivers
   * changes nothing on screen.
   */
  itDom(
    'draws no table and hands the header nobody while the last work package lets go',
    async () => {
      const { api } = twoWorkPackages();
      const { owner, releases, given } = recordingOwner({ hold: true });
      const sockets = recordedSockets();
      const asked: Roster[] = [];
      render(
        <WorkPackagePage
          {...pageWiring(owner, api, sockets.streamDeps, NO_SAVED_PLANS)}
          presence={(roster) => {
            asked.push(roster);
            return null;
          }}
        />,
      );
      await selectWorkPackage('p1');
      await tableDrawn();
      await waitFor(() => {
        expect(sockets.opened).toHaveLength(1);
      });
      const first = firstOf(sockets.opened, 'socket for p1');
      act(() => {
        first.onOpen();
        first.onMessage(JSON.stringify({ type: 'presence', users: ['kat', 'lee'] }));
        first.onMessage(JSON.stringify({ type: 'resume_ack', replayed: { 'work-package:p1': 0 } }));
      });
      expect(asked.at(-1)).toEqual({ users: ['kat', 'lee'], connected: true });

      await selectWorkPackage('p2');
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
        expect(liveWorkPackage(owner)).toBe('p2');
      });
      await tableDrawn();
      expect(given).toEqual(['p1']);
      expect(sockets.closed()).toBe(1);
    },
  );

  /**
   * A new runtime is a new reader, and so a new table: nothing the last
   * work package's table held — rows, drafts, focus — is carried into the next. The
   * table is drawn only while a runtime is published, and every replacement
   * withdraws the old one before the next is built, so the page draws the
   * interval between them and the next table mounts afresh.
   */
  itDom('draws the next work package in a table of its own', async () => {
    const { api } = twoWorkPackages();
    const { owner } = recordingOwner();
    render(<WorkPackagePage {...pageWiring(owner, api, undefined, NO_SAVED_PLANS)} />);
    await selectWorkPackage('p1');
    const first = await tableDrawn();

    await selectWorkPackage('p2');
    await waitFor(() => {
      expect(liveWorkPackage(owner)).toBe('p2');
    });
    const next = await tableDrawn();

    expect(next).not.toBe(first);
    expect(first.isConnected).toBe(false);
  });

  /**
   * Strict Mode runs the page's render twice and its mount effects twice. The
   * page mounts with nothing selected, so its re-entry opens nothing; what it
   * must not do is open a work package from a render, which Strict Mode's second
   * render would open again.
   */
  itDom('opens one runtime per pick under Strict Mode, and gives each back once', async () => {
    const { api } = twoWorkPackages();
    const { owner, built, given } = recordingOwner();
    const sockets = recordedSockets();
    const view = render(
      <StrictMode>
        <WorkPackagePage {...pageWiring(owner, api, sockets.streamDeps, NO_SAVED_PLANS)} />
      </StrictMode>,
    );
    await selectWorkPackage('p1');
    await tableDrawn();
    await selectWorkPackage('p2');
    await waitFor(() => {
      expect(liveWorkPackage(owner)).toBe('p2');
    });
    await tableDrawn();
    await settle();

    expect(built.map((runtime) => runtime.workPackageId)).toEqual(['p1', 'p2']);
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

  /**
   * Task 10: the shelf's watch is the runtime's. A switch draws no shelf until
   * the next runtime is live, a read the left work package still had in flight
   * changes nothing anybody sees, and the left work package's broadcast is
   * unsubscribed with its runtime, once.
   */
  itDom(
    'draws no shelf while the last work package lets go, and the next one’s own rows after',
    async () => {
      const { api } = twoWorkPackages();
      const { owner, releases } = recordingOwner({ hold: true });
      const shelves = heldShelves();
      render(<WorkPackagePage {...pageWiring(owner, api, undefined, shelves.routes)} />);
      await selectWorkPackage('p1');
      await tableDrawn();
      await waitFor(() => {
        expect(shelves.reads.map((read) => read.workPackageId)).toEqual(['p1']);
      });
      act(() => {
        shelves.pending('p1')([checkpoint('sp1', 'Shed, before the rewire')]);
      });
      await waitFor(() => {
        expect(shelfNames()?.join()).toContain('Shed, before the rewire');
      });
      // A collaborator saves in p1: the shelf reads again, and that read is still out.
      act(() => {
        shelves.broadcasts.get('p1')?.();
      });
      await waitFor(() => {
        expect(shelves.reads.map((read) => read.workPackageId)).toEqual(['p1']);
      });

      await selectWorkPackage('p2');
      await waitFor(() => {
        expect(releases).toHaveLength(1);
      });
      act(() => {
        shelves.pending('p1')([checkpoint('sp9', 'Shed, answered late')]);
      });
      await settle();

      expect(shelfNames()).toBeNull();

      await act(async () => {
        firstOf(releases, 'retirement')();
        await Promise.resolve();
      });
      await waitFor(() => {
        expect(liveWorkPackage(owner)).toBe('p2');
      });
      await waitFor(() => {
        expect(shelves.reads.map((read) => read.workPackageId)).toEqual(['p2']);
      });
      act(() => {
        shelves.pending('p2')([checkpoint('sp2', 'Fence, first coat')]);
      });
      await waitFor(() => {
        expect(shelfNames()?.join()).toContain('Fence, first coat');
      });
      expect(shelfNames()?.join()).not.toContain('Shed');
      expect(shelves.unsubscribed).toEqual(['p1']);
    },
  );
});
