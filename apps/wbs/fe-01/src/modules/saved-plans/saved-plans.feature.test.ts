import { describe, expect, it, vi } from 'vitest';

import type { SavedPlanListEntryView, SavedPlanListReply } from '@/lib/saved-plan-api';

import { type SavedPlanRoutes, SavedPlansWithdrawnError } from './contract';
import { openSavedPlans, readShelf, watchShelf } from './saved-plans.feature';

const ROW: SavedPlanListEntryView = {
  id: 'sp1',
  name: 'before the re-plan',
  createdBy: 'ada',
  createdAt: 1_788_501_600_000,
  inputBytes: 4096,
  scheduleBytes: 2048,
  scheduleAbsentReason: null,
};

const listReply = (rows: readonly SavedPlanListEntryView[]) =>
  Promise.resolve({
    kind: 'success' as const,
    representation: 'json' as const,
    status: 200 as const,
    headers: new Headers(),
    body: { savedPlans: [...rows] },
  });

describe('reading a project’s shelf', () => {
  it('does not ask for a list a node cannot answer', async () => {
    // **The case that closes 6.4.** The probe and the sentence were both written
    // before this function, and each is asserted against its own input — so a
    // build where the probe is never invoked passed all of them. This is the
    // assertion neither of them can make: the answer is *used*.
    // Negative, MEASURED on h2puni at b9940187 and reverted with dirty=0
    // re-asserted: delete the `if (!available)` line and this file is 4 pass /
    // 1 fail, the one being this case. It reddens on the *returned state* —
    // `{ kind: 'ready', rows: [ROW] }` where `{ kind: 'unavailable' }` was
    // expected — so `resolves.toEqual` throws and the spy assertion below never
    // runs. Stated because the obvious guess is the other way round. The spy is
    // still not redundant: it is the only thing that would catch a build that
    // answered `unavailable` and asked for the list anyway, which is a shape no
    // assertion on the return value can see.
    const list = vi.fn(() => listReply([ROW]));
    await expect(
      readShelf({ available: () => Promise.resolve(false), list }, 'p1'),
    ).resolves.toEqual({ kind: 'unavailable' });
    expect(list).not.toHaveBeenCalled();
  });

  it('reads the rows once the node says it has the routes', async () => {
    const list = vi.fn(() => listReply([ROW]));
    await expect(
      readShelf({ available: () => Promise.resolve(true), list }, 'p1'),
    ).resolves.toEqual({ kind: 'ready', rows: [ROW] });
    expect(list).toHaveBeenCalledWith('p1');
  });

  it('separates a refused probe from a probe that answered no', async () => {
    // A document that could not be read is a fault to report; a document that
    // was read and lacked the paths is a node to upgrade. One try block covering
    // both would collapse them, and the reader would be told to upgrade a server
    // that is merely behind a broken proxy.
    await expect(
      readShelf(
        { available: () => Promise.reject(new Error('http_500')), list: () => listReply([]) },
        'p1',
      ),
    ).resolves.toEqual({ kind: 'error', code: 'http_500' });
  });

  it('carries be-01’s own code out of a failed read', async () => {
    await expect(
      readShelf(
        {
          available: () => Promise.resolve(true),
          list: () => Promise.reject(new Error('not_found')),
        },
        'p1',
      ),
    ).resolves.toEqual({ kind: 'error', code: 'not_found' });
  });

  it('reads a modeled list refusal through its shared discriminant', async () => {
    await expect(
      readShelf(
        {
          available: () => Promise.resolve(true),
          list: () =>
            Promise.resolve({
              kind: 'refusal',
              representation: 'json',
              status: 404,
              headers: new Headers(),
              body: { error: 'not_found' },
            }),
        },
        'p1',
      ),
    ).resolves.toEqual({ kind: 'error', code: 'not_found' });
  });

  it('shows whatever was thrown when something throws a non-Error', async () => {
    // Every throw in the API layer is an Error carrying be-01's code. On the day
    // one is not, showing what arrived beats erasing it behind 'unknown'.
    // Negative, MEASURED and reverted with dirty=0 re-asserted: `String(fault)`
    // replaced by the literal `'unknown'` is 4 pass / 1 fail, the one being this
    // case. The arm is load-bearing rather than defensive decoration.
    await expect(
      readShelf(
        {
          available: () => Promise.resolve(true),
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- rejecting with a non-Error is the branch under test, and the rule is right about the production code it is aimed at: this is the one place the shape has to be written down literally, because the fault has to arrive as a bare string for `codeOf`'s `String(fault)` arm to be reached at all.
          list: () => Promise.reject('a bare string'),
        },
        'p1',
      ),
    ).resolves.toEqual({ kind: 'error', code: 'a bare string' });
  });
});

describe('watching a project’s shelf', () => {
  /** Resolves once everything already queued as a microtask has run. */
  const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

  const fakeStream = () => {
    let fire: (() => void) | undefined;
    const unsubscribe = vi.fn();
    return {
      unsubscribe,
      broadcast: () => fire?.(),
      subscribe: vi.fn((_projectId: string, onChange: () => void) => {
        fire = onChange;
        return { unsubscribe };
      }),
    };
  };

  it('emits the first read and subscribes once', async () => {
    const stream = fakeStream();
    const onState = vi.fn();
    watchShelf(
      {
        available: () => Promise.resolve(true),
        list: () => listReply([ROW]),
        subscribe: stream.subscribe,
      },
      'p1',
      onState,
    );
    await settled();
    expect(onState).toHaveBeenCalledTimes(1);
    expect(onState).toHaveBeenCalledWith({ kind: 'ready', rows: [ROW] });
    expect(stream.subscribe).toHaveBeenCalledTimes(1);
    expect(stream.subscribe).toHaveBeenCalledWith('p1', expect.any(Function));
  });

  it('re-reads and emits again when the project changes', async () => {
    // The payload is ignored on purpose, exactly as subscribeToProject ignores
    // it: a saved plan is immutable but the *list* is not, and re-reading is one
    // request and always right.
    const stream = fakeStream();
    const onState = vi.fn();
    const list = vi.fn(() => listReply([ROW]));
    watchShelf(
      { available: () => Promise.resolve(true), list, subscribe: stream.subscribe },
      'p1',
      onState,
    );
    await settled();
    stream.broadcast();
    await settled();
    expect(list).toHaveBeenCalledTimes(2);
    expect(onState).toHaveBeenCalledTimes(2);
    // Still one subscription. A re-read that resubscribed would double the
    // fan-out on every edit, and the second socket would be invisible from here.
    expect(stream.subscribe).toHaveBeenCalledTimes(1);
  });

  it('never subscribes to a node that cannot answer the question', async () => {
    // 6.4's reasoning one level up. There is nothing to listen for: the list has
    // no route on this node, so a socket opened here is a reconnect loop behind
    // a surface that can never render rows.
    // Negative: drop the `if (state.kind === 'unavailable') return;` line and
    // this reddens on subscribe having been called once.
    const stream = fakeStream();
    const onState = vi.fn();
    watchShelf(
      {
        available: () => Promise.resolve(false),
        list: () => listReply([ROW]),
        subscribe: stream.subscribe,
      },
      'p1',
      onState,
    );
    await settled();
    expect(onState).toHaveBeenCalledTimes(1);
    expect(onState).toHaveBeenCalledWith({ kind: 'unavailable' });
    expect(stream.subscribe).not.toHaveBeenCalled();
  });

  it('emits nothing after the caller stops, including from a read in flight', async () => {
    // The trap project-stream.ts names in its own unsubscribe: the loop that
    // outlived its subscriber. Stopping between the request and its answer is
    // the ordinary case for a component that unmounts, not a rare one.
    const stream = fakeStream();
    const onState = vi.fn();
    const { stop } = watchShelf(
      {
        available: () => Promise.resolve(true),
        list: () => listReply([ROW]),
        subscribe: stream.subscribe,
      },
      'p1',
      onState,
    );
    stop();
    await settled();
    expect(onState).not.toHaveBeenCalled();
    expect(stream.subscribe).not.toHaveBeenCalled();
  });

  it('unsubscribes the stream it opened when the caller stops', async () => {
    const stream = fakeStream();
    const { stop } = watchShelf(
      {
        available: () => Promise.resolve(true),
        list: () => listReply([ROW]),
        subscribe: stream.subscribe,
      },
      'p1',
      vi.fn(),
    );
    await settled();
    stop();
    expect(stream.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('re-reads on a caller’s refresh, which no broadcast would have caused', async () => {
    // **The hole this exists to fill.** `saved-plan.controller.ts` publishes
    // `saved_plans_changed` on save, rename and delete (TASK-255), so a
    // collaborator's mutation does reach this watch. The hole `refresh` fills is
    // on the actor's own side of the round trip: without a caller-driven read
    // the saver waits for their own event to go out to gw-01 and come back
    // before the row they just created appears. The assertion is on `list` being asked
    // a second time with no broadcast fired at all: a build whose refresh did
    // nothing would still pass every other case in this `describe` block: every
    // other case that expects a second read gets it from the stream, and the one
    // that also calls `refresh` expects no read at all. The hook's
    // refresh-identity case is the only other guard against it anywhere in the
    // file.
    const stream = fakeStream();
    const list = vi.fn(() => listReply([ROW]));
    const watch = watchShelf(
      { available: () => Promise.resolve(true), list, subscribe: stream.subscribe },
      'p1',
      vi.fn(),
    );
    await settled();
    expect(list).toHaveBeenCalledTimes(1);

    watch.refresh();
    await settled();
    expect(list).toHaveBeenCalledTimes(2);
    // And it re-used the subscription rather than opening a second one: the
    // `stream ??=` in `read` is what makes a refresh cheap.
    expect(stream.subscribe).toHaveBeenCalledTimes(1);
  });

  it('asks nothing at all when a stopped watch is refreshed', async () => {
    // A `refresh` handed to a component outlives that component by as long as
    // its last save takes, so this is the ordinary path and not a rare one. The
    // state guards in `read` already make it unobservable; what they do not do
    // is stop the two requests. Negative: drop the `if (!stopped)` and this
    // reddens on `available`, with the probe and the list both asked on behalf
    // of a reader who has gone.
    const stream = fakeStream();
    const available = vi.fn(() => Promise.resolve(true));
    const list = vi.fn(() => listReply([ROW]));
    const watch = watchShelf({ available, list, subscribe: stream.subscribe }, 'p1', vi.fn());
    await settled();
    watch.stop();

    watch.refresh();
    await settled();
    expect(available).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('does not let a slow read overwrite the answer to a newer question', async () => {
    // Two broadcasts in quick succession leave two reads in flight, and whichever
    // resolves LAST wins unless the older one is dropped. That is roughly a coin
    // flip in the wild, and losing it shows the reader a list from before the
    // change that prompted the refresh — AC #4's "collaboration updates do not
    // replace the user's active comparison unexpectedly", one surface down.
    // Negative: drop `mine !== generation` from the guard and this reddens with
    // the stale rows as the last emission.
    //
    // Reachable only from the second read onwards, which is why the first one is
    // released first: reads after the first start from the subscription, and the
    // subscription does not exist until a read has resolved.
    const stream = fakeStream();
    const onState = vi.fn();
    const stale: SavedPlanListEntryView = { ...ROW, id: 'stale', name: 'before the refresh' };
    const pending: ((reply: SavedPlanListReply) => void)[] = [];
    const release = (rows: SavedPlanListEntryView[]) => {
      const next = pending.shift();
      if (!next) throw new Error('no read was in flight');
      void listReply(rows).then(next);
    };
    const list = vi.fn(() => new Promise<SavedPlanListReply>((resolve) => pending.push(resolve)));
    watchShelf(
      { available: () => Promise.resolve(true), list, subscribe: stream.subscribe },
      'p1',
      onState,
    );
    await settled();
    release([ROW]);
    await settled();

    stream.broadcast();
    await settled();
    stream.broadcast();
    await settled();
    expect(pending).toHaveLength(2);

    // The newer question is answered first, the older one second.
    const newer = pending.pop();
    if (!newer) throw new Error('the second refresh never asked');
    await listReply([ROW]).then(newer);
    await settled();
    release([stale]);
    await settled();

    expect(onState).toHaveBeenLastCalledWith({ kind: 'ready', rows: [ROW] });
  });
});

/**
 * Task 10: the shelf's watch belongs to one project runtime, and nothing of a
 * runtime that has been withdrawn reaches the page.
 */
describe('one project’s saved plans', () => {
  /** Resolves once everything already queued as a microtask has run. */
  const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

  /** Routes that record every request, with each list read held until the case answers it. */
  const heldRoutes = () => {
    const sent: string[] = [];
    const reads: ((reply: Awaited<ReturnType<SavedPlanRoutes['list']>>) => void)[] = [];
    let fire: (() => void) | undefined;
    const unsubscribe = vi.fn(() => {
      fire = undefined;
    });
    const refused = () => Promise.reject(new Error('not answered in this case'));
    const routes: SavedPlanRoutes = {
      available: () => Promise.resolve(true),
      list: (projectId) => {
        sent.push(`list:${projectId}`);
        return new Promise((answer) => reads.push(answer));
      },
      save: (projectId) => {
        sent.push(`save:${projectId}`);
        return refused();
      },
      rename: (savedPlanId, name) => {
        sent.push(`rename:${savedPlanId}:${name}`);
        return refused();
      },
      compare: (projectId) => {
        sent.push(`compare:${projectId}`);
        return refused();
      },
      subscribe: (_projectId, onChange) => {
        fire = onChange;
        return { unsubscribe };
      },
    };
    return { routes, sent, reads, unsubscribe, broadcast: () => fire?.() };
  };

  it('starts from loading and shows the rows its first read answered', async () => {
    const held = heldRoutes();
    const opened = openSavedPlans({ projectId: 'p1', routes: held.routes, isCurrent: () => true });
    expect(opened.savedPlans.shelf.snapshot()).toEqual({ kind: 'loading' });
    const told = vi.fn();
    opened.savedPlans.shelf.subscribe(told);

    await settled();
    await listReply([ROW]).then(held.reads[0]);
    await settled();

    expect(opened.savedPlans.shelf.snapshot()).toEqual({ kind: 'ready', rows: [ROW] });
    expect(told).toHaveBeenCalledTimes(1);
  });

  it('changes nothing once its runtime is withdrawn, not even with the read it had in flight', async () => {
    const held = heldRoutes();
    let current = true;
    const opened = openSavedPlans({
      projectId: 'p1',
      routes: held.routes,
      isCurrent: () => current,
    });
    await settled();

    current = false;
    await listReply([ROW]).then(held.reads[0]);
    await settled();

    expect(opened.savedPlans.shelf.snapshot()).toEqual({ kind: 'loading' });
  });

  it('sends nothing once its runtime is withdrawn, and says so', async () => {
    const held = heldRoutes();
    let current = true;
    const { savedPlans } = openSavedPlans({
      projectId: 'p1',
      routes: held.routes,
      isCurrent: () => current,
    });
    await settled();
    held.sent.length = 0;

    current = false;
    const asked = [
      savedPlans.save(),
      savedPlans.rename('sp1', 'Kept'),
      savedPlans.compare({ saved: 'sp1' }, 'current'),
    ];

    for (const request of asked) {
      await expect(request).rejects.toBeInstanceOf(SavedPlansWithdrawnError);
    }
    expect(held.sent).toEqual([]);
  });

  it('asks each request of its own project while current', async () => {
    const held = heldRoutes();
    const { savedPlans } = openSavedPlans({
      projectId: 'p1',
      routes: held.routes,
      isCurrent: () => true,
    });
    await settled();
    held.sent.length = 0;

    await Promise.allSettled([
      savedPlans.save(),
      savedPlans.rename('sp1', 'Kept'),
      savedPlans.compare({ saved: 'sp1' }, 'current'),
    ]);

    expect(held.sent).toEqual(['save:p1', 'rename:sp1:Kept', 'compare:p1']);
  });

  it('stops watching when it is closed', async () => {
    const held = heldRoutes();
    const opened = openSavedPlans({ projectId: 'p1', routes: held.routes, isCurrent: () => true });
    await settled();
    await listReply([ROW]).then(held.reads[0]);
    await settled();
    expect(held.unsubscribe).not.toHaveBeenCalled();

    opened.close();
    held.broadcast();
    opened.savedPlans.refresh();
    await settled();

    expect(held.unsubscribe).toHaveBeenCalledTimes(1);
    expect(held.sent).toEqual(['list:p1']);
  });

  it('throws what its stream threw when it is closed', async () => {
    const held = heldRoutes();
    const opened = openSavedPlans({
      projectId: 'p1',
      routes: {
        ...held.routes,
        subscribe: () => ({
          unsubscribe: () => {
            throw new Error('the socket would not close');
          },
        }),
      },
      isCurrent: () => true,
    });
    await settled();
    await listReply([ROW]).then(held.reads[0]);
    await settled();

    expect(() => {
      opened.close();
    }).toThrow('the socket would not close');
  });
});
