import fc from 'fast-check';
import { isValidElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LifetimeFault } from '@/components/chrome/lifetime-fault';
import { fakeBrowserStorage } from '@/modules/preferences/fake-browser-storage';

import { bootstrapApplication } from './application-bootstrap';
import { type ApplicationServices, installApplicationRuntime } from './application-runtime';
import { createLifetimeSlot, type LifetimeSlot } from './lifetime-slot';

/** What the page was asked to draw, and what the slot held at that instant. */
interface Rendered {
  /** True for the sanitized fatal page, false for the app. */
  readonly fatal: boolean;
  readonly status: string;
  /** The services the slot published then, or null when it published none. */
  readonly services: ApplicationServices | null;
}

/** A generated event against one page's bootstrap. */
type Command =
  | { readonly kind: 'bootstrap' }
  | { readonly kind: 'retire' }
  | { readonly kind: 'replace' }
  | { readonly kind: 'retireFromListener' }
  | { readonly kind: 'settle' };

const commandArb: fc.Arbitrary<Command> = fc.oneof(
  { arbitrary: fc.constant<Command>({ kind: 'bootstrap' }), weight: 3 },
  { arbitrary: fc.constant<Command>({ kind: 'retire' }), weight: 2 },
  { arbitrary: fc.constant<Command>({ kind: 'replace' }), weight: 2 },
  { arbitrary: fc.constant<Command>({ kind: 'retireFromListener' }), weight: 2 },
  { arbitrary: fc.constant<Command>({ kind: 'settle' }), weight: 2 },
);

/** React writes nothing here, but the bootstrap logs every fatal state it shows. */
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

/**
 * The bootstrap's own interleavings, generated rather than imagined.
 *
 * The bootstrap is lifecycle code: it awaits a transition and then renders, and
 * anything can happen in between — a retirement, another replacement, a subscriber
 * that retires from inside a notification. Two named examples cannot cover that, so
 * the orders are `fc.scheduler()`'s to choose and the invariants are stated over
 * **what the page was drawn from** rather than over a sequence somebody predicted.
 *
 * The slot is the real one, the installer is the production one over a fake browser
 * store, and the root records instead of committing: what is under test is which
 * tree is rendered and against which published runtime.
 */
describe("the page's bootstrap, under generated interleavings", () => {
  it('only ever draws the page from the runtime the slot publishes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.scheduler(),
        fc.array(commandArb, { minLength: 2, maxLength: 6 }),
        async (scheduler, commands) => {
          const slot: LifetimeSlot<ApplicationServices> =
            createLifetimeSlot<ApplicationServices>(1);
          const rendered: Rendered[] = [];
          /** The status the slot held each time a root was created, in order. */
          const mounted: string[] = [];
          const pending: Promise<unknown>[] = [];
          /**
           * What each bootstrap ended as.
           *
           * Recorded rather than swallowed: a bootstrap that **rejects** is a finding —
           * supersession and a fatal state are outcomes it handles — and a test that
           * discarded every rejection could not tell a handled cancellation from an
           * unhandled one.
           */
          const bootstrapOutcomes: string[] = [];
          /** Set when a listener should retire what is current, once. */
          let listenerRetires = false;
          slot.subscribe(() => {
            if (!listenerRetires) return;
            listenerRetires = false;
            pending.push(slot.retire().then(undefined, () => undefined));
          });

          const acquire = () => {
            const installed = installApplicationRuntime({ openStore: fakeBrowserStorage });
            return {
              services: installed.services,
              close: async (options: { timeoutMs: number }) => {
                await scheduler.schedule(Promise.resolve(), 'dispose the page runtime');
                await installed.close(options);
              },
            };
          };

          const mount = () => {
            mounted.push(slot.snapshot().status);
            return {
              render: (tree: ReactNode) => {
                const held = slot.snapshot();
                rendered.push({
                  fatal: isValidElement(tree) && tree.type === LifetimeFault,
                  status: held.status,
                  services: held.status === 'live' ? held.services : null,
                });
              },
            };
          };

          for (const command of commands) {
            if (command.kind === 'bootstrap') {
              pending.push(
                bootstrapApplication(globalThis.document.createElement('div'), {
                  acquire,
                  slot,
                  mount,
                }).then(
                  () => {
                    bootstrapOutcomes.push('resolved');
                  },
                  (refusal: unknown) => {
                    bootstrapOutcomes.push(refusal instanceof Error ? refusal.message : 'refused');
                  },
                ),
              );
            } else if (command.kind === 'retire') {
              pending.push(slot.retire().then(undefined, () => undefined));
            } else if (command.kind === 'replace') {
              pending.push(slot.replace(acquire).then(undefined, () => undefined));
            } else if (command.kind === 'retireFromListener') {
              listenerRetires = true;
            } else if (scheduler.count() > 0) {
              await scheduler.waitNext(1);
            }
          }

          await scheduler.waitIdle();
          await Promise.all(pending);
          await scheduler.waitIdle();

          // 1. The page is only ever drawn from the runtime the slot publishes.
          for (const draw of rendered) {
            if (draw.fatal) continue;
            expect(draw.status, `the app was drawn while the slot was ${draw.status}`).toBe('live');
            expect(draw.services, 'the app was drawn from no services').not.toBe(null);
          }
          // 2. The fatal page is only ever drawn from a fatal slot.
          for (const draw of rendered) {
            if (!draw.fatal) continue;
            expect(draw.status, `the fatal page was drawn while the slot was ${draw.status}`).toBe(
              'fatal',
            );
          }
          // 3. A bootstrap never rejects. Supersession is cancellation it handles and a
          //    fatal state is a page it draws; anything else escaping is a defect.
          expect(
            bootstrapOutcomes.filter((outcome) => outcome !== 'resolved'),
            'a bootstrap rejected instead of handling its outcome',
          ).toEqual([]);
          // 4. No root is created before its transition has settled: the design's
          //    "await the installation before createRoot".
          for (const status of mounted) {
            expect(status, `a root was created while the slot was ${status}`).not.toBe('empty');
            expect(status, `a root was created while the slot was ${status}`).not.toBe(
              'constructing',
            );
          }
        },
      ),
      { seed: 20260924, numRuns: 200 },
    );
  }, 120_000);
});
