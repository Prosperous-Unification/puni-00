import { waitFor } from '@testing-library/react';
import { DiBag, DiBagCleanupError } from 'di-bag';
import { act, isValidElement, type ReactNode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LifetimeFault } from '@/components/chrome/lifetime-fault';
import { ROOT_FAULT_OPTIONS } from '@/components/chrome/root-fault-options';
import type { RememberedPreferences } from '@/modules/preferences/contract';
import { fakeBrowserStorage } from '@/modules/preferences/fake-browser-storage';

import { bootstrapApplication, type BootstrapDependencies } from './application-bootstrap';
import { type ApplicationServices, installApplicationRuntime } from './application-runtime';
import {
  type ApplicationServicesState,
  useApplicationServicesState,
} from './application-services-context';
import {
  createLifetimeSlot,
  type LifetimeSlot,
  PartialAcquisitionError,
  type RetirableRuntime,
} from './lifetime-slot';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

/**
 * The tree these tests draw. A recording root never actually mounts it — see
 * {@link recordingRoot} — so this stands in for the real `App`, whose own auth
 * and router machinery has no place in a bootstrap-only test.
 */
const FakeApp = (): null => null;

/** What the recorded root was asked to render, and with which options it was made. */
interface RecordedRoot {
  readonly mount: BootstrapDependencies['mount'];
  readonly options: () => readonly unknown[];
  readonly trees: () => readonly ReactNode[];
  /** The status the slot held each time a tree was rendered, in order. */
  readonly statuses: () => readonly string[];
  /**
   * The status the slot held each time a **root was created**, in order.
   *
   * Recorded as well as the render statuses, because the design's ordering is about
   * `createRoot` and not about `render`: a root built while the runtime is still
   * being acquired is a root something can draw into before there is anything true
   * to draw. Without this the prescribed implementation could violate the contract
   * and every assertion would still pass.
   */
  readonly mountStatuses: () => readonly string[];
  /** How many times a root this fixture built was later invalidated. */
  readonly unmounts: () => number;
}

/**
 * A root that records instead of committing.
 *
 * The success path renders the whole `App`, whose first effect fetches the signed-in
 * identity; committing it here would test the app rather than the bootstrap. What is
 * under test is **which** tree is rendered and **when** — after the runtime is live,
 * never before — and, since restoration must invalidate and remount rather than
 * reuse (map: "unmounts/invalidates the React root"), **how many separate roots**
 * were built and taken down.
 */
function recordingRoot(slot: LifetimeSlot<ApplicationServices>): RecordedRoot {
  const options: unknown[] = [];
  const trees: ReactNode[] = [];
  const statuses: string[] = [];
  const mountStatuses: string[] = [];
  let unmounts = 0;
  return {
    options: () => options,
    trees: () => trees,
    statuses: () => statuses,
    mountStatuses: () => mountStatuses,
    unmounts: () => unmounts,
    mount: (_host, rootOptions) => {
      options.push(rootOptions);
      mountStatuses.push(slot.snapshot().status);
      return {
        render: (tree) => {
          trees.push(tree);
          statuses.push(slot.snapshot().status);
        },
        unmount: () => {
          unmounts += 1;
        },
      };
    },
  };
}

/** The element a recorded render was given, as a typed element or null. */
const elementType = (tree: ReactNode | undefined): unknown =>
  isValidElement(tree) ? tree.type : null;

/** A refusal carrying exactly what must never reach a reader or a console. */
const SECRET = 'alice@example.com';

/** A construction that acquires one owned resource and then refuses, as DI Bag leaves it. */
function refusingAcquisition(): () => RetirableRuntime<ApplicationServices> {
  return () => {
    const bag = DiBag.createBuilder()
      .register({
        owned: DiBag.withDisposal(
          DiBag.fromSyncFactory((): string => 'the store it took'),
          async () => {
            await Promise.resolve();
          },
        ),
      })
      .build();
    bag.resolve('owned');
    throw new PartialAcquisitionError(
      new Error(`the page for ${SECRET} could not be composed`),
      (options) => bag.close(options),
    );
  };
}

/**
 * The console, muted and recorded.
 *
 * A named helper rather than `ReturnType<typeof vi.spyOn>`: that type is `any` for
 * a two-argument `spyOn`, and every read of `.mock` under it is an
 * `@typescript-eslint/no-unsafe-member-access` error (observed 2026-09-22).
 */
const muteConsoleError = () =>
  vi.spyOn(console, 'error').mockImplementation(() => {
    return undefined;
  });

let logged: ReturnType<typeof muteConsoleError>;

beforeEach(() => {
  logged = muteConsoleError();
});

afterEach(() => {
  logged.mockRestore();
});

describe('the page’s bootstrap', () => {
  itDom('renders the app only once its runtime is live, with the root fault options', async () => {
    const slot = createLifetimeSlot<ApplicationServices>(50);
    const root = recordingRoot(slot);

    await bootstrapApplication(document.createElement('div'), {
      slot,
      mount: root.mount,
      app: FakeApp,
      acquire: () => installApplicationRuntime({ openStore: fakeBrowserStorage }),
      eventTarget: new EventTarget(),
    });

    expect(root.options()).toEqual([ROOT_FAULT_OPTIONS]);
    // The design's ordering: the runtime is installed before the root exists.
    expect(root.mountStatuses()).toEqual(['live']);
    expect(root.trees()).toHaveLength(1);
    expect(root.statuses()).toEqual(['live']);
    expect(elementType(root.trees()[0])).not.toBe(LifetimeFault);
  });

  itDom('renders the sanitized fatal page when the first runtime cannot be built', async () => {
    const slot = createLifetimeSlot<ApplicationServices>(50);
    const root = recordingRoot(slot);

    await bootstrapApplication(document.createElement('div'), {
      slot,
      mount: root.mount,
      app: FakeApp,
      acquire: refusingAcquisition(),
      eventTarget: new EventTarget(),
    });

    expect(root.trees()).toHaveLength(1);
    expect(elementType(root.trees()[0])).toBe(LifetimeFault);
    expect(root.mountStatuses()).toEqual(['fatal']);
    expect(slot.snapshot().status).toBe('fatal');
  });

  itDom('says nothing raw about a refused start, on the page or in the console', async () => {
    const slot = createLifetimeSlot<ApplicationServices>(50);
    const root = recordingRoot(slot);

    await bootstrapApplication(document.createElement('div'), {
      slot,
      mount: root.mount,
      app: FakeApp,
      acquire: refusingAcquisition(),
      eventTarget: new EventTarget(),
    });

    // Every line, not only the one this code wrote, and the disclosure assertions
    // before the shape ones: a mutation that adds a second line must be read here as
    // what it is — the refusal reaching the console — and not as a count.
    const lines = logged.mock.calls;
    // Only disclosures reach the console, so every argument is a string this code
    // chose. A caught value logged instead is an object here, and `JSON.stringify`
    // would not show it: an `Error` serialises to `{}` and this refusal keeps the
    // marker on its `cause` (watched 2026-09-22, which is why the shape is asserted
    // and not only the text).
    expect(
      lines.flat().filter((argument) => typeof argument !== 'string'),
      'a console line carried a value instead of a disclosure',
    ).toEqual([]);
    expect(lines.flat().map(String).join(' ')).not.toContain(SECRET);
    const shown = root.trees()[0];
    expect(
      JSON.stringify(isValidElement<{ fault: unknown }>(shown) ? shown.props : null),
    ).not.toContain(SECRET);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveLength(4);
  });

  /**
   * A newer request wins while this bootstrap is settling: controlled cancellation.
   *
   * The loser draws **nothing** — not the app, which is not its runtime any more, and
   * not a fatal page, for which it has no fault. It does not reject either: the slot
   * models supersession, so a page that lost a race is not a failure to report.
   */
  itDom('draws nothing at all when a newer request wins the slot', async () => {
    const slot = createLifetimeSlot<ApplicationServices>(50);
    const root = recordingRoot(slot);
    const acquire = () => installApplicationRuntime({ openStore: fakeBrowserStorage });

    const booting = bootstrapApplication(document.createElement('div'), {
      slot,
      mount: root.mount,
      app: FakeApp,
      acquire,
      eventTarget: new EventTarget(),
    });
    const winner = slot.replace(acquire);

    await expect(booting).resolves.toBe(undefined);
    await expect(winner).resolves.toHaveProperty('remembered');
    expect(root.mountStatuses()).toEqual([]);
    expect(root.trees()).toEqual([]);
    expect(logged.mock.calls).toEqual([]);
    expect(slot.snapshot().status).toBe('live');
  });

  itDom('shows the fatal page when a retirement fails, without republishing anything', async () => {
    const slot = createLifetimeSlot<ApplicationServices>(50);
    const root = recordingRoot(slot);
    await bootstrapApplication(document.createElement('div'), {
      slot,
      mount: root.mount,
      app: FakeApp,
      acquire: () => {
        const installed = installApplicationRuntime({ openStore: fakeBrowserStorage });
        return {
          services: installed.services,
          close: async () => {
            await Promise.reject(new Error(`the store of ${SECRET} would not let go`));
          },
        };
      },
      eventTarget: new EventTarget(),
    });

    await expect(slot.retire()).rejects.toThrow('would not let go');
    await Promise.resolve();

    expect(root.trees()).toHaveLength(2);
    expect(elementType(root.trees()[1])).toBe(LifetimeFault);
    // One root for the page's whole life: the fatal page replaces the app inside the
    // root that is already there, rather than mounting a second one over it.
    expect(root.mountStatuses()).toEqual(['live']);
    expect(JSON.stringify(logged.mock.calls)).not.toContain(SECRET);
  });
});

/** Isolates the ganttDetail write behind a function boundary. */
function writeGanttDetail(remembered: RememberedPreferences, value: boolean): void {
  remembered.ganttDetail.write(value);
}

/** Isolates the ganttDetail read behind a function boundary. */
function readGanttDetail(remembered: RememberedPreferences): boolean | null {
  return remembered.ganttDetail.read();
}

describe('the context this bootstrap publishes', () => {
  itDom(
    'a component under the tree reads the runtime this bootstrap installed, on the slot it was given',
    async () => {
      const slot = createLifetimeSlot<ApplicationServices>(50);
      const host = document.createElement('div');
      const installed: { remembered: RememberedPreferences | null } = { remembered: null };
      const acquire = () => {
        const built = installApplicationRuntime({ openStore: fakeBrowserStorage });
        installed.remembered = built.services.remembered;
        return built;
      };
      const captured: { state: ApplicationServicesState | null } = { state: null };
      const Probe = (): null => {
        const state = useApplicationServicesState();
        // Recorded in an effect, not during render: reassigning an outer
        // variable while rendering is impure and this file's own lint config
        // refuses it (react-hooks/globals, observed 2026-09-22).
        useEffect(() => {
          captured.state = state;
        });
        return null;
      };

      await act(async () => {
        await bootstrapApplication(host, {
          slot,
          acquire,
          mount: (element, options) => createRoot(element, options),
          app: Probe,
          eventTarget: new EventTarget(),
        });
      });

      if (installed.remembered === null) throw new Error('setup: acquire never ran');
      const finalState = captured.state;
      if (finalState === null) throw new Error('probe never ran at all');
      if (finalState.status !== 'live') throw new Error('probe never saw a live state');
      writeGanttDetail(finalState.remembered, true);
      expect(readGanttDetail(installed.remembered)).toBe(true);
    },
  );
});

/** A `pageshow` carrying the bfcache-restoration flag this file's own tests need. */
function pageShowEvent(persisted: boolean): Event {
  const event = new Event('pageshow');
  Object.defineProperty(event, 'persisted', { value: persisted });
  return event;
}

/** A `pagehide`, optionally carrying the flag the design says this trigger ignores. */
function pageHideEvent(persisted: boolean): Event {
  const event = new Event('pagehide');
  Object.defineProperty(event, 'persisted', { value: persisted });
  return event;
}

describe('the page-lifecycle retirement trigger', () => {
  itDom.each([true, false])(
    'retires the runtime and invalidates the root when pagehide fires (persisted=%s, a flag this trigger never reads)',
    async (persisted) => {
      const slot = createLifetimeSlot<ApplicationServices>(50);
      const root = recordingRoot(slot);
      const eventTarget = new EventTarget();

      await bootstrapApplication(document.createElement('div'), {
        slot,
        mount: root.mount,
        app: FakeApp,
        acquire: () => installApplicationRuntime({ openStore: fakeBrowserStorage }),
        eventTarget,
      });
      expect(slot.snapshot().status).toBe('live');

      eventTarget.dispatchEvent(pageHideEvent(persisted));

      await waitFor(() => {
        expect(slot.snapshot().status).toBe('empty');
      });
      expect(root.unmounts(), 'pagehide did not invalidate the mounted root').toBe(1);
    },
  );

  itDom('a non-persisted pageshow does not rebuild', async () => {
    const slot = createLifetimeSlot<ApplicationServices>(50);
    const root = recordingRoot(slot);
    const eventTarget = new EventTarget();
    let builds = 0;
    const acquire = () => {
      builds += 1;
      return installApplicationRuntime({ openStore: fakeBrowserStorage });
    };

    await bootstrapApplication(document.createElement('div'), {
      slot,
      mount: root.mount,
      app: FakeApp,
      acquire,
      eventTarget,
    });

    eventTarget.dispatchEvent(new Event('pagehide'));
    await waitFor(() => {
      expect(slot.snapshot().status).toBe('empty');
    });
    eventTarget.dispatchEvent(pageShowEvent(false));
    // A real macrotask, not a fixed count of microtask turns: nothing here
    // blocks a wrongly-triggered rebuild the way the deferred-close tests
    // below do, so only draining the whole queue tells "did not rebuild"
    // apart from "rebuilt, but this assertion ran first" (watched: a
    // two-microtask wait passed on a mutant that always rebuilt).
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(builds).toBe(1);
    expect(slot.snapshot().status).toBe('empty');
    expect(root.trees()).toHaveLength(1);
  });

  itDom(
    'a persisted pageshow joins the pending retirement before rebuilding, into a fresh root',
    async () => {
      const slot = createLifetimeSlot<ApplicationServices>(50);
      const root = recordingRoot(slot);
      const eventTarget = new EventTarget();
      let builds = 0;
      const closeRelease: { current: (() => void) | null } = { current: null };
      const acquire = (): RetirableRuntime<ApplicationServices> => {
        builds += 1;
        const installed = installApplicationRuntime({ openStore: fakeBrowserStorage });
        if (builds > 1) return installed;
        return {
          services: installed.services,
          close: () =>
            new Promise<void>((resolve) => {
              // A readonly-typed outer holder with a mutable field, not a bare
              // `let`: TypeScript infers a `let` reassigned from inside this
              // closure as `never` at every later narrowed read (reproduced
              // in isolation, `microsoft/TypeScript`-known), so this test
              // reads and writes `closeRelease.current` instead.
              closeRelease.current = resolve;
            }),
        };
      };

      await bootstrapApplication(document.createElement('div'), {
        slot,
        mount: root.mount,
        app: FakeApp,
        acquire,
        eventTarget,
      });
      expect(builds).toBe(1);
      expect(root.mountStatuses()).toEqual(['live']);

      eventTarget.dispatchEvent(new Event('pagehide'));
      await waitFor(() => {
        expect(slot.snapshot().status).toBe('retiring');
      });
      expect(root.unmounts(), 'pagehide did not invalidate the root').toBe(1);

      eventTarget.dispatchEvent(pageShowEvent(true));
      // The join has to sit behind the still-open close: two turns of the
      // microtask queue are enough for a bootstrap that skipped the join to
      // have already rebuilt, and not enough for the real one to have moved.
      await Promise.resolve();
      await Promise.resolve();
      expect(builds, 'rebuilt before the pending retirement had settled').toBe(1);
      expect(
        root.mountStatuses(),
        'mounted a second root before the retirement had settled',
      ).toEqual(['live']);

      if (closeRelease.current === null) throw new Error('setup: the first close was never called');
      const release = closeRelease.current;
      release();

      await waitFor(() => {
        expect(slot.snapshot().status).toBe('live');
      });
      expect(builds).toBe(2);
      // A genuinely fresh root, not the invalidated one — two mounts, never
      // a render into a root `pagehide` already took down.
      expect(root.mountStatuses()).toEqual(['live', 'live']);
      expect(root.trees()).toHaveLength(2);
      expect(elementType(root.trees()[1])).not.toBe(LifetimeFault);
    },
  );

  itDom(
    'a persisted pageshow queued behind a pagehide retirement is refused, with no rebuild acquisition, when that retirement rejects',
    async () => {
      const slot = createLifetimeSlot<ApplicationServices>(50);
      const root = recordingRoot(slot);
      const eventTarget = new EventTarget();
      let builds = 0;
      const closeRelease: { current: ((error: Error) => void) | null } = { current: null };
      const acquire = (): RetirableRuntime<ApplicationServices> => {
        builds += 1;
        const installed = installApplicationRuntime({ openStore: fakeBrowserStorage });
        if (builds > 1) return installed;
        return {
          services: installed.services,
          close: () =>
            new Promise<void>((_resolve, reject) => {
              closeRelease.current = reject;
            }),
        };
      };

      await bootstrapApplication(document.createElement('div'), {
        slot,
        mount: root.mount,
        app: FakeApp,
        acquire,
        eventTarget,
      });
      expect(builds).toBe(1);

      eventTarget.dispatchEvent(new Event('pagehide'));
      await waitFor(() => {
        expect(slot.snapshot().status).toBe('retiring');
      });

      // Queued while the retirement is still pending — the "then rejection"
      // case, not a `pageshow` arriving after the slot is already fatal.
      eventTarget.dispatchEvent(pageShowEvent(true));
      await Promise.resolve();
      await Promise.resolve();
      expect(builds, 'the queued rebuild acquired before the retirement even settled').toBe(1);

      if (closeRelease.current === null) throw new Error('setup: the first close was never called');
      const reject = closeRelease.current;
      reject(new Error(`the store of ${SECRET} would not let go`));

      await waitFor(() => {
        expect(slot.snapshot().status).toBe('fatal');
      });
      expect(builds, 'the queued rebuild acquired after the retirement rejected').toBe(1);
      expect(elementType(root.trees().at(-1))).toBe(LifetimeFault);
      expect(logged.mock.calls.length, 'more than one report reached the console').toBe(1);
      expect(JSON.stringify(logged.mock.calls)).not.toContain(SECRET);
    },
  );

  itDom(
    'a persisted pageshow queued behind a pagehide retirement is refused when that retirement times out, and its late completion is observed without reviving anything',
    async () => {
      const slot = createLifetimeSlot<ApplicationServices>(20);
      const root = recordingRoot(slot);
      const eventTarget = new EventTarget();
      let builds = 0;
      const closeRelease: { current: (() => void) | null } = { current: null };
      const acquire = (): RetirableRuntime<ApplicationServices> => {
        builds += 1;
        const installed = installApplicationRuntime({ openStore: fakeBrowserStorage });
        if (builds > 1) return installed;
        // A real DI Bag graph, not a raw promise this test races itself: the
        // slot's own `disposeWithdrawn` calls `close({ timeoutMs })` directly
        // and trusts the callee to enforce it — only DI Bag's own bounded
        // `close()` actually does, and only its own `DiBagCloseCancelledError`
        // is what `lifetime-slot.ts`'s `lateCleanupOf` recognises, which is
        // what makes `slot.lateOutcome()` observable at all.
        const bag = DiBag.createBuilder()
          .register({
            owned: DiBag.withDisposal(
              DiBag.fromSyncFactory((): ApplicationServices => installed.services),
              () =>
                new Promise<void>((resolve) => {
                  closeRelease.current = resolve;
                }),
            ),
          })
          .build();
        const services = bag.resolve('owned');
        return { services, close: (options) => bag.close(options) };
      };

      await bootstrapApplication(document.createElement('div'), {
        slot,
        mount: root.mount,
        app: FakeApp,
        acquire,
        eventTarget,
      });
      expect(builds).toBe(1);

      eventTarget.dispatchEvent(new Event('pagehide'));
      await waitFor(() => {
        expect(slot.snapshot().status).toBe('retiring');
      });

      eventTarget.dispatchEvent(pageShowEvent(true));
      await Promise.resolve();
      await Promise.resolve();
      expect(builds, 'the queued rebuild acquired before the budget expired').toBe(1);

      await waitFor(() => {
        expect(slot.snapshot().status).toBe('fatal');
      });
      expect(builds, 'the queued rebuild acquired after the budget expired').toBe(1);
      expect(elementType(root.trees().at(-1))).toBe(LifetimeFault);
      expect(logged.mock.calls.length).toBe(1);
      expect(slot.lateOutcome()).toBe('pending');

      if (closeRelease.current === null) {
        throw new Error('setup: the never-settling close was never called');
      }
      const release = closeRelease.current;
      release();

      await waitFor(() => {
        expect(slot.lateOutcome()).toBe('settled');
      });
      // Late completion is observed, never silently resumed: still fatal,
      // still exactly one runtime ever acquired, still one report.
      expect(slot.snapshot().status).toBe('fatal');
      expect(builds).toBe(1);
      expect(logged.mock.calls.length, 'late completion re-reported or rebuilt').toBe(1);
    },
  );

  itDom(
    'a pagehide retirement failure is visible even though another owned disposer still ran',
    async () => {
      // The map's own test 4, through the page-hide path specifically: one
      // owned disposer rejects while another records completion, and the DI
      // Bag cleanup failure, the other disposer's own completion, and one
      // correlated occurrence are all asserted — not only that *a* failure
      // reached the console.
      //
      // `completing` is resolved *before* `rejecting`: DI Bag disposes in
      // **reverse** resolve order (`node_modules/di-bag/dist/acquisition.js`),
      // so this makes `rejecting`'s own disposer run first and `completing`'s
      // own disposer run second — after the rejection, not before it. With
      // the order reversed (`rejecting` resolved first), a cleanup that
      // stopped at the first failure would still have already run
      // `completing`'s own disposer, and this test would not have noticed —
      // exactly the gap review 6 found, and the shape the watched fault below
      // reproduces.
      const slot = createLifetimeSlot<ApplicationServices>(50);
      const root = recordingRoot(slot);
      const eventTarget = new EventTarget();
      const otherDisposerRan: { current: boolean } = { current: false };
      const closeOutcome: { current: Promise<void> | null } = { current: null };
      const acquire = (): RetirableRuntime<ApplicationServices> => {
        const installed = installApplicationRuntime({ openStore: fakeBrowserStorage });
        const bag = DiBag.createBuilder()
          .register({
            completing: DiBag.withDisposal(
              DiBag.fromSyncFactory((): ApplicationServices => installed.services),
              () => {
                otherDisposerRan.current = true;
                return Promise.resolve();
              },
            ),
            rejecting: DiBag.withDisposal(
              DiBag.fromSyncFactory((): string => 'the store it took'),
              () => Promise.reject(new Error(`the store of ${SECRET} would not let go`)),
            ),
          })
          .build();
        const services = bag.resolve('completing');
        bag.resolve('rejecting');
        return {
          services,
          // The real production `close`, captured on its own way out so this
          // test can assert on the exact promise `retire()` awaits — not a
          // second, parallel call to `bag.close()`, which would run the
          // disposers twice.
          close: (options) => {
            const outcome = bag.close(options);
            closeOutcome.current = outcome;
            return outcome;
          },
        };
      };

      await bootstrapApplication(document.createElement('div'), {
        slot,
        mount: root.mount,
        app: FakeApp,
        acquire,
        eventTarget,
      });

      eventTarget.dispatchEvent(new Event('pagehide'));
      await waitFor(() => {
        expect(slot.snapshot().status).toBe('fatal');
      });

      if (closeOutcome.current === null) throw new Error('setup: close() was never called');
      await expect(closeOutcome.current).rejects.toBeInstanceOf(DiBagCleanupError);
      // Proof: on 2026-09-23, replacing `close` with a hand-rolled version
      // that rejects without ever calling `completing`'s own disposer (a
      // cleanup that stops at the first failure, the exact defect the
      // resolve-order comment above exists to catch) failed exactly this
      // assertion: `the other owned disposer never ran: expected false to be
      // true`.
      expect(otherDisposerRan.current, 'the other owned disposer never ran').toBe(true);

      const state = slot.snapshot();
      if (state.status !== 'fatal') throw new Error('unreachable: just waited for fatal');
      expect(elementType(root.trees().at(-1))).toBe(LifetimeFault);
      expect(
        logged.mock.calls.length,
        'more than one correlated occurrence reached the console',
      ).toBe(1);
      // One correlated occurrence, not merely one console call: the same
      // fault the slot itself now holds is the one the console reported.
      expect(logged.mock.calls[0]?.[2]).toBe(state.fault.occurrenceId);
      expect(JSON.stringify(logged.mock.calls)).not.toContain(SECRET);
    },
  );

  itDom(
    'shows the fatal page in a fresh root when a pagehide retirement fails, and refuses to rebuild on the next persisted pageshow',
    async () => {
      const slot = createLifetimeSlot<ApplicationServices>(50);
      const root = recordingRoot(slot);
      const eventTarget = new EventTarget();
      let builds = 0;
      const acquire = (): RetirableRuntime<ApplicationServices> => {
        builds += 1;
        const installed = installApplicationRuntime({ openStore: fakeBrowserStorage });
        return {
          services: installed.services,
          close: async () => {
            await Promise.reject(new Error(`the store of ${SECRET} would not let go`));
          },
        };
      };

      await bootstrapApplication(document.createElement('div'), {
        slot,
        mount: root.mount,
        app: FakeApp,
        acquire,
        eventTarget,
      });
      expect(builds).toBe(1);

      eventTarget.dispatchEvent(new Event('pagehide'));
      await waitFor(() => {
        expect(slot.snapshot().status).toBe('fatal');
      });
      expect(
        root.unmounts(),
        'pagehide did not invalidate the root before the retirement failed',
      ).toBe(1);
      expect(root.trees()).toHaveLength(2);
      expect(elementType(root.trees()[1])).toBe(LifetimeFault);
      // A fresh root for the fatal page: `pagehide` already invalidated the
      // first one before this retirement even settled.
      expect(root.mountStatuses()).toEqual(['live', 'fatal']);
      expect(JSON.stringify(logged.mock.calls)).not.toContain(SECRET);

      eventTarget.dispatchEvent(pageShowEvent(true));
      // A real macrotask: see the comment on the same wait in 'a non-persisted
      // pageshow does not rebuild'.
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(builds, 'rebuilt into a slot a failed retirement had already left fatal').toBe(1);
      expect(root.trees()).toHaveLength(2);
    },
  );

  itDom(
    'a persisted pageshow rebuilds into a genuinely fresh root: the old tree unmounts, the new one mounts fresh',
    async () => {
      const slot = createLifetimeSlot<ApplicationServices>(50);
      const host = document.createElement('div');
      document.body.append(host);
      const counts = { mounts: 0, unmounts: 0 };
      const Probe = (): null => {
        useEffect(() => {
          counts.mounts += 1;
          return () => {
            counts.unmounts += 1;
          };
        }, []);
        return null;
      };
      const eventTarget = new EventTarget();
      const acquire = () => installApplicationRuntime({ openStore: fakeBrowserStorage });

      await act(async () => {
        await bootstrapApplication(host, {
          slot,
          acquire,
          mount: (element, options) => createRoot(element, options),
          app: Probe,
          eventTarget,
        });
      });
      // `<StrictMode>` double-invokes a mount effect in development (setup,
      // cleanup, setup again), so the first bootstrap's own count is not
      // necessarily 1 — it is whatever one real mount produces, and this
      // test's own signal is that a *second* real mount doubles it again,
      // not the literal number. `application-bootstrap.strictmode.test.tsx`
      // is the file that pins the count for one mount on its own.
      const mountsAfterFirstBoot = counts.mounts;
      expect(mountsAfterFirstBoot, 'the first bootstrap never mounted anything').toBeGreaterThan(0);
      expect(
        counts.unmounts,
        'the first bootstrap already ran a cleanup with nothing torn down',
      ).toBe(mountsAfterFirstBoot - 1);

      act(() => {
        eventTarget.dispatchEvent(new Event('pagehide'));
      });
      // The tree's own cleanup ran the instant the root was invalidated —
      // synchronously with `unmount()`, not deferred to a later render. This
      // is what a reused root cannot do: React does not remount a tree it is
      // only asked to render again, so `App`'s own `fetchMe` effect (an
      // empty-dependency `useEffect`) would never rerun without this.
      expect(counts.unmounts, 'pagehide did not unmount the old tree').toBe(mountsAfterFirstBoot);

      await waitFor(() => {
        expect(slot.snapshot().status).toBe('empty');
      });

      act(() => {
        eventTarget.dispatchEvent(pageShowEvent(true));
      });
      await waitFor(() => {
        expect(slot.snapshot().status).toBe('live');
      });

      // A genuinely fresh mount: the effect ran again from zero a second
      // time (StrictMode's own setup/cleanup/setup doubling it again, exactly
      // as the first bootstrap's own mount did), which is exactly what a
      // reused, merely re-rendered root could never produce.
      expect(counts.mounts, 'the rebuilt tree was not a fresh mount').toBe(
        2 * mountsAfterFirstBoot,
      );
      document.body.removeChild(host);
    },
  );

  itDom(
    'hiding and restoring an already-fatal page redraws the same fault once, without reporting it twice',
    async () => {
      const slot = createLifetimeSlot<ApplicationServices>(50);
      const root = recordingRoot(slot);
      const eventTarget = new EventTarget();
      const acquire = (): RetirableRuntime<ApplicationServices> => {
        const installed = installApplicationRuntime({ openStore: fakeBrowserStorage });
        return {
          services: installed.services,
          close: async () => {
            await Promise.reject(new Error(`the store of ${SECRET} would not let go`));
          },
        };
      };

      await bootstrapApplication(document.createElement('div'), {
        slot,
        mount: root.mount,
        app: FakeApp,
        acquire,
        eventTarget,
      });

      // The first pagehide: retirement fails, the page goes fatal — the
      // usual two renders (the initial app, then the fatal page) in the one
      // root this bootstrap had so far.
      eventTarget.dispatchEvent(new Event('pagehide'));
      await waitFor(() => {
        expect(slot.snapshot().status).toBe('fatal');
      });
      expect(root.trees()).toHaveLength(2);
      expect(elementType(root.trees()[1])).toBe(LifetimeFault);
      expect(root.unmounts(), 'the first pagehide did not invalidate the live root').toBe(1);

      // A second pagehide — the browser hides the already-broken page again,
      // an ordinary sequence with no HMR involved (tab hidden, restored to the
      // same fault, hidden again). The slot is already terminally fatal, so
      // this `retire()` is refused immediately — through `startRetirement`'s
      // own catch, not a subscription notification for a *new* transition —
      // but it still invalidates the root that was showing the fault, and its
      // own refusal redraws that same fault into a fresh one: nothing here
      // waits for a persisted `pageshow` to do that.
      eventTarget.dispatchEvent(new Event('pagehide'));
      await waitFor(() => {
        expect(root.unmounts(), 'the second pagehide did not invalidate the fatal root').toBe(2);
      });
      await waitFor(() => {
        expect(root.trees()).toHaveLength(3);
      });
      expect(elementType(root.trees()[2])).toBe(LifetimeFault);

      // A persisted pageshow: refused immediately too (the slot is still
      // terminally fatal), and finds the fault already redrawn — no further
      // render, and no further report.
      eventTarget.dispatchEvent(pageShowEvent(true));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(root.trees()).toHaveLength(3);
      expect(root.mountStatuses()).toEqual(['live', 'fatal', 'fatal']);
      // Reported once, not three times, across the whole sequence.
      expect(logged.mock.calls.length, 'restoring the fatal page reported it again').toBe(1);
      expect(JSON.stringify(logged.mock.calls)).not.toContain(SECRET);
    },
  );

  itDom(
    'a retirement refusal that leaves the slot anywhere but fatal is not silently swallowed',
    async () => {
      // The real slot's own contract (`lifetime-slot.ts`) never produces this
      // shape: `retire()` rejects only into a terminally fatal slot. This fake
      // one rejects while its own `snapshot()` still reads `live`, to exercise
      // `startRetirement`'s own "not a modelled outcome" branch directly,
      // rather than trying to coax the real slot into an unreachable state.
      const fakeServices = installApplicationRuntime({ openStore: fakeBrowserStorage }).services;
      const fakeSlot: LifetimeSlot<ApplicationServices> = {
        subscribe: () => () => undefined,
        snapshot: () => ({ status: 'live', services: fakeServices }),
        replace: () => Promise.resolve(fakeServices),
        retire: () => Promise.reject(new Error('an unmodelled retirement failure')),
        lateCleanup: () => null,
        lateOutcome: () => 'none',
      };
      // A `process`-level listener, not `window`'s own `unhandledrejection`:
      // this rejection is thrown from inside a `.catch()` callback running on
      // Node's own microtask queue, not from anything jsdom's own event loop
      // ever sees — reproduced directly (watched 2026-09-23): the same
      // scenario against `window.addEventListener('unhandledrejection', …)`
      // left that listener silent while Vitest's own top-level reporter still
      // printed the rejection as an "Unhandled Error", attributed to this
      // test by name. Registering here, and only here, keeps this test the
      // one thing that observes it — nothing is left registered for another
      // test to trip over.
      const seen: unknown[] = [];
      const onRejection = (reason: unknown): void => {
        seen.push(reason);
      };
      process.on('unhandledRejection', onRejection);
      try {
        const eventTarget = new EventTarget();
        await bootstrapApplication(document.createElement('div'), {
          slot: fakeSlot,
          mount: () => ({ render: () => undefined, unmount: () => undefined }),
          app: FakeApp,
          acquire: () => {
            throw new Error('unreachable: the fake slot never calls acquire');
          },
          eventTarget,
        });
        eventTarget.dispatchEvent(new Event('pagehide'));
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(seen, 'the unexpected refusal never surfaced').toHaveLength(1);
        const surfaced = seen[0];
        expect(surfaced).toBeInstanceOf(Error);
        expect(String(surfaced)).toContain(
          "pagehide's own retirement was refused and the slot is live",
        );
        expect(String((surfaced as Error).cause)).toContain('an unmodelled retirement failure');
      } finally {
        process.removeListener('unhandledRejection', onRejection);
      }
    },
  );
});
