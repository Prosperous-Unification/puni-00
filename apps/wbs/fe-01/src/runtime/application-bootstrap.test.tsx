import { DiBag } from 'di-bag';
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
}

/**
 * A root that records instead of committing.
 *
 * The success path renders the whole `App`, whose first effect fetches the signed-in
 * identity; committing it here would test the app rather than the bootstrap. What is
 * under test is **which** tree is rendered and **when** — after the runtime is live,
 * never before.
 */
function recordingRoot(slot: LifetimeSlot<ApplicationServices>): RecordedRoot {
  const options: unknown[] = [];
  const trees: ReactNode[] = [];
  const statuses: string[] = [];
  const mountStatuses: string[] = [];
  return {
    options: () => options,
    trees: () => trees,
    statuses: () => statuses,
    mountStatuses: () => mountStatuses,
    mount: (_host, rootOptions) => {
      options.push(rootOptions);
      mountStatuses.push(slot.snapshot().status);
      return {
        render: (tree) => {
          trees.push(tree);
          statuses.push(slot.snapshot().status);
        },
      };
    },
  };
}

/** The element a recorded render was given, as a typed element or null. */
const elementType = (tree: ReactNode): unknown => (isValidElement(tree) ? tree.type : null);

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
