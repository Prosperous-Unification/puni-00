import { act, cleanup, renderHook } from '@testing-library/react';
import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';

import { fakeBrowserStorage } from '@/modules/preferences/fake-browser-storage';

import {
  type ApplicationServices,
  applicationSlot,
  installApplicationRuntime,
} from './application-runtime';
import {
  ApplicationServicesProvider,
  type ApplicationServicesState,
  applicationServicesStateFor,
  useApplicationServicesState,
} from './application-services-context';
import { createLifetimeSlot, type LifetimeSlot, TransitionSupersededError } from './lifetime-slot';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

afterEach(() => {
  cleanup();
});

/** A slot already `live` over the production installer and a fake store. */
function liveSlot(): LifetimeSlot<ApplicationServices> {
  const slot = createLifetimeSlot<ApplicationServices>(50);
  void slot.replace(() => installApplicationRuntime({ openStore: fakeBrowserStorage }));
  return slot;
}

/** A hook run that never throws, wrapped so a thrown message is comparable data. */
function safely<T>(read: () => T): { threw: string | null; value: T | null } {
  try {
    return { threw: null, value: read() };
  } catch (failure) {
    return { threw: failure instanceof Error ? failure.message : 'not an Error', value: null };
  }
}

const REVOKED = 'the preferences store was revoked with its runtime';

/**
 * Asserts `state` is `live` and hands back the narrowed value, as a function
 * boundary — not a repeated `if (x.status !== 'live') throw` inline, which
 * this checkout's installed TypeScript 7.0.2 sometimes misreads as
 * unreachable on a getter-backed ref's second access in one scope.
 */
function expectLive(
  state: ApplicationServicesState,
): Extract<ApplicationServicesState, { status: 'live' }> {
  if (state.status !== 'live') throw new Error('expected live');
  return state;
}

/**
 * Releases a disposal gate a test armed, or throws if it was never armed --
 * a function boundary for the same reason `expectLive` above is one: this
 * checkout's TypeScript 7.0.2 sometimes narrows a `let` reassigned only
 * inside a `Promise` executor back to its initializer's literal type at the
 * next read in the same scope.
 */
function releaseGate(release: (() => void) | null): void {
  if (release === null) throw new Error('setup: the gate was never armed');
  release();
}

describe('applicationServicesStateFor', () => {
  it('is withdrawn for every status but live', () => {
    const empty = createLifetimeSlot<ApplicationServices>(50);
    expect(applicationServicesStateFor(empty)).toEqual({ status: 'withdrawn' });
  });

  it("is live with the slot's own published remembered, by reference, once live", async () => {
    const slot = createLifetimeSlot<ApplicationServices>(50);
    const acquire = () => installApplicationRuntime({ openStore: fakeBrowserStorage });
    await slot.replace(acquire);
    const state = slot.snapshot();
    if (state.status !== 'live') throw new Error('setup: expected live');
    expect(applicationServicesStateFor(slot)).toEqual({
      status: 'live',
      remembered: state.services.remembered,
    });
  });

  it('is withdrawn the instant a retirement is accepted, before any disposer runs', async () => {
    const slot = liveSlot();
    await Promise.resolve();
    if (slot.snapshot().status !== 'live') throw new Error('setup: expected live');
    const retiring = slot.retire();
    expect(applicationServicesStateFor(slot)).toEqual({ status: 'withdrawn' });
    await retiring;
  });
});

describe('useApplicationServicesState', () => {
  itDom('throws when read below no provider', () => {
    const { result: hook } = renderHook(() => safely(() => useApplicationServicesState()));
    expect(hook.current.threw).toBe(
      'useApplicationServicesState must be read below ApplicationServicesProvider',
    );
  });

  itDom('is withdrawn when the slot it reads has never published a runtime', () => {
    const slot = createLifetimeSlot<ApplicationServices>(50);
    const { result: hook } = renderHook(() => useApplicationServicesState(), {
      wrapper: ({ children }) => (
        <ApplicationServicesProvider slot={slot}>{children}</ApplicationServicesProvider>
      ),
    });
    expect(hook.current).toEqual({ status: 'withdrawn' });
  });

  itDom(
    "is live with the slot's own remembered, by reference — no wrapper stands between them",
    async () => {
      const slot = liveSlot();
      await Promise.resolve();
      const state = slot.snapshot();
      if (state.status !== 'live') throw new Error('setup: expected live');
      const { result: hook } = renderHook(() => useApplicationServicesState(), {
        wrapper: ({ children }) => (
          <ApplicationServicesProvider slot={slot}>{children}</ApplicationServicesProvider>
        ),
      });
      expect(expectLive(hook.current).remembered).toBe(state.services.remembered);
    },
  );

  itDom(
    'mounting during retirement reads withdrawn immediately, from the first render',
    async () => {
      const slot = liveSlot();
      await Promise.resolve();
      if (slot.snapshot().status !== 'live') throw new Error('setup: expected live');
      const retiring = slot.retire();
      const { result: hook } = renderHook(() => useApplicationServicesState(), {
        wrapper: ({ children }) => (
          <ApplicationServicesProvider slot={slot}>{children}</ApplicationServicesProvider>
        ),
      });
      expect(hook.current).toEqual({ status: 'withdrawn' });
      await act(async () => {
        await retiring;
      });
      expect(hook.current).toEqual({ status: 'withdrawn' });
    },
  );

  itDom(
    'holds a mounted consumer withdrawn once its notification is flushed, even while disposal is still pending',
    async () => {
      // The gap review 5 found: the property (below) only checked the mounted
      // consumer once every transition had FULLY settled, which cannot tell
      // "renders withdrawn because the notification was processed" apart from
      // "renders withdrawn because disposal, coincidentally, also finished by
      // then." This test separates the two: disposal is held open on a gate
      // this test alone controls, so the only thing that can make the hook
      // read `withdrawn` at the observation point is React having processed
      // the slot's own notification -- claim (a) in this packet's own plan
      // document, section 4, checked on its own terms.
      const slot = createLifetimeSlot<ApplicationServices>(50);
      let releaseDisposal: (() => void) | null = null;
      const disposalGate = new Promise<void>((resolve) => {
        releaseDisposal = resolve;
      });
      await slot.replace(() => {
        const installed = installApplicationRuntime({ openStore: fakeBrowserStorage });
        return {
          services: installed.services,
          close: async (options: { timeoutMs: number }) => {
            await disposalGate;
            await installed.close(options);
          },
        };
      });

      const { result: hook } = renderHook(() => useApplicationServicesState(), {
        wrapper: ({ children }) => (
          <ApplicationServicesProvider slot={slot}>{children}</ApplicationServicesProvider>
        ),
      });

      const retiring = slot.retire();
      // Flush React's own microtask notification WITHOUT releasing the
      // disposal gate: `scheduler.waitIdle()`/`Promise.all(pending)`, which
      // the property below uses, would block on this same gate, so this
      // example is the only place this specific window is observed.
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(slot.snapshot().status, 'setup: the retirement had not settled').toBe('retiring');
      expect(hook.current, 'the notification was processed; disposal has not run yet').toEqual({
        status: 'withdrawn',
      });

      releaseGate(releaseDisposal);
      await act(async () => {
        await retiring;
      });
    },
  );

  itDom(
    'once a replacement has fully settled, the old remembered throws -- disposal, not withdrawal, is what revokes it',
    async () => {
      // `lifetime-slot.ts`'s own `transition()` awaits `disposeWithdrawn()` for
      // the OUTGOING runtime before the incoming one is ever published
      // (`await disposeWithdrawn();`, ahead of the `ordinal !== newest` fence
      // and the `built = request.acquire()` call) -- so once `slot.replace()`
      // has been fully awaited, the first runtime's own disposer (packet b's
      // `module.ts`, `store.revoke()`) has already run. This is true with no
      // withdrawal-at-the-source hook at all: see this packet's own plan
      // document, section 4, for the narrower claim this packet makes and the
      // window (before a transition settles) where this is NOT yet true.
      const slot = liveSlot();
      await Promise.resolve();
      const first = slot.snapshot();
      if (first.status !== 'live') throw new Error('setup: expected live');
      const { result: hook } = renderHook(() => useApplicationServicesState(), {
        wrapper: ({ children }) => (
          <ApplicationServicesProvider slot={slot}>{children}</ApplicationServicesProvider>
        ),
      });
      const firstRemembered = expectLive(hook.current).remembered;

      await act(async () => {
        await slot.replace(() => installApplicationRuntime({ openStore: fakeBrowserStorage }));
      });
      const second = slot.snapshot();
      if (second.status !== 'live') throw new Error('setup: expected live');
      const afterReplace = expectLive(hook.current);
      expect(afterReplace.remembered).not.toBe(firstRemembered);
      expect(() => firstRemembered.ganttDetail.read()).toThrow(REVOKED);
    },
  );

  itDom('a retirement that fails leaves the hook withdrawn, never live again', async () => {
    const slot = liveSlot();
    await Promise.resolve();
    if (slot.snapshot().status !== 'live') throw new Error('setup: expected live');
    const { result: hook } = renderHook(() => useApplicationServicesState(), {
      wrapper: ({ children }) => (
        <ApplicationServicesProvider slot={slot}>{children}</ApplicationServicesProvider>
      ),
    });
    expectLive(hook.current);

    // A disposer that rejects makes the retirement -- and the slot -- terminal:
    // the same shape `application-bootstrap.test.tsx`'s own fatal-retirement
    // case uses. `applicationServicesStateFor` maps `fatal` to `withdrawn` the
    // same as any other non-live status.
    await act(async () => {
      await slot.replace(() => {
        const installed = installApplicationRuntime({ openStore: fakeBrowserStorage });
        return {
          services: installed.services,
          close: async () => {
            await Promise.reject(new Error('disposal refused'));
          },
        };
      });
    });
    await act(async () => {
      await expect(slot.retire()).rejects.toThrow('disposal refused');
    });
    expect(slot.snapshot().status).toBe('fatal');
    expect(hook.current).toEqual({ status: 'withdrawn' });
  });

  itDom(
    'defaults to the page-wide slot: installs there, is read there, and is withdrawn again on cleanup',
    async () => {
      const installed = await applicationSlot.replace(() =>
        installApplicationRuntime({ openStore: fakeBrowserStorage }),
      );
      try {
        const { result: hook } = renderHook(() => useApplicationServicesState(), {
          wrapper: ({ children }) => (
            <ApplicationServicesProvider>{children}</ApplicationServicesProvider>
          ),
        });
        // No slot prop was passed: this identifies the default is really
        // `applicationSlot` and not merely "some slot with no provider error".
        expect(expectLive(hook.current).remembered).toBe(installed.remembered);
      } finally {
        await applicationSlot.retire();
      }
      expect(applicationSlot.snapshot().status).toBe('empty');
    },
  );
});

/**
 * A generated event against one slot under interleaving. `settle` steps the
 * scheduler by exactly one pending disposal tick; `replace` and `retire` are
 * issued without waiting for anything, so several can be in flight -- one's
 * disposal still pending when the next is requested.
 */
type Command =
  { readonly kind: 'replace' } | { readonly kind: 'retire' } | { readonly kind: 'settle' };

const commandArb: fc.Arbitrary<Command> = fc.oneof(
  { arbitrary: fc.constant<Command>({ kind: 'replace' }), weight: 3 },
  { arbitrary: fc.constant<Command>({ kind: 'retire' }), weight: 2 },
  { arbitrary: fc.constant<Command>({ kind: 'settle' }), weight: 3 },
);

describe('the context, under generated interleavings', () => {
  /**
   * **Starts from an awaited `live` runtime, deliberately.** The slot's own
   * `accept()` only withdraws a runtime that is genuinely `held`; every
   * `replace`/`retire` issued before anything is held finds nothing to
   * withdraw and schedules no disposal.
   *
   * **Tests exactly what this packet's own plan document, section 4, claims
   * and nothing else, at TWO observation points per command, not only at the
   * end of a drained run:** immediately after each command is issued and
   * React's own notification has had a chance to flush (but disposal has
   * NOT been forced to finish -- `scheduler.waitNext` only steps a `settle`
   * command's own tick), the mounted consumer must already agree with the
   * slot's own status for `live`-vs-not; and, once every generated command
   * has fully drained, both consumer and identity are compared against
   * `slot.snapshot()` itself -- an independently maintained ground truth
   * this packet does not implement, not the selector under test. It does
   * **not** claim a withdrawn handle is refused before disposal: see the
   * dedicated example above for what is true once a transition has settled,
   * and this packet's own plan document, section 4, for the window before
   * it has.
   */
  itDom(
    "the mounted consumer never renders live once the slot has left live, and converges to the slot's own truth once notifications are flushed",
    async () => {
      let totalCloses = 0;
      let totalExecuted = 0;
      await fc.assert(
        fc.asyncProperty(
          fc.scheduler(),
          fc
            .array(commandArb, { minLength: 2, maxLength: 6 })
            .filter((commands) => commands.some((command) => command.kind !== 'settle')),
          async (scheduler, commands) => {
            const slot = createLifetimeSlot<ApplicationServices>(50);
            const pending: Promise<unknown>[] = [];
            let closes = 0;
            const acquire = () => {
              const installed = installApplicationRuntime({ openStore: fakeBrowserStorage });
              return {
                services: installed.services,
                close: async (options: { timeoutMs: number }) => {
                  closes += 1;
                  await scheduler.schedule(Promise.resolve(), 'dispose the runtime');
                  await installed.close(options);
                },
              };
            };

            await slot.replace(acquire);

            const { result: hook, unmount } = renderHook(() => useApplicationServicesState(), {
              wrapper: ({ children }) => (
                <ApplicationServicesProvider slot={slot}>{children}</ApplicationServicesProvider>
              ),
            });

            const expectOnlySuperseded = (failure: unknown): void => {
              expect(failure).toBeInstanceOf(TransitionSupersededError);
            };

            for (const command of commands) {
              if (command.kind === 'replace') {
                pending.push(slot.replace(acquire).then(() => undefined, expectOnlySuperseded));
              } else if (command.kind === 'retire') {
                pending.push(slot.retire().then(() => undefined, expectOnlySuperseded));
              } else if (scheduler.count() > 0) {
                await act(async () => {
                  await scheduler.waitNext(1);
                });
              }

              // Observation point 1, per command: flush React's own
              // microtask notification, without forcing any disposal to
              // complete, and require the mounted consumer to already agree
              // with the slot on whether it is live right now -- the exact
              // window review 5's own mutation and probe exposed.
              await act(async () => {
                await Promise.resolve();
                await Promise.resolve();
              });
              expect(hook.current.status === 'live').toBe(slot.snapshot().status === 'live');
            }

            await act(async () => {
              await scheduler.waitIdle();
            });
            await Promise.all(pending);
            await act(async () => {
              await scheduler.waitIdle();
            });
            // One more flush for React's own microtask notification: every
            // transition above is settled, but `useSyncExternalStore`'s
            // subscriber still fires from a microtask (`lifetime-slot.ts`'s
            // own JSDoc, "notifies from a microtask, coalescing").
            await act(async () => {
              await Promise.resolve();
              await Promise.resolve();
            });

            // Observation point 2: the independently maintained expected
            // state, once everything has drained -- the slot's own
            // snapshot, read directly -- never through
            // `applicationServicesStateFor`, which is the selector this
            // property exists to check.
            const expected = slot.snapshot();
            if (expected.status === 'live') {
              const rendered = expectLive(hook.current);
              expect(rendered.remembered).toBe(expected.services.remembered);
              // Exercise the current handle successfully: a real write/read
              // round trip through the rendered facade, never inferred.
              rendered.remembered.ganttDetail.write(true);
              expect(rendered.remembered.ganttDetail.read()).toBe(true);
            } else {
              expect(hook.current).toEqual({ status: 'withdrawn' });
            }

            totalCloses += closes;
            totalExecuted += scheduler
              .report()
              .filter((task: { status: string }) => task.status === 'resolved').length;
            unmount();
          },
        ),
        { seed: 20260929, numRuns: 200 },
      );
      expect(totalCloses, 'no generated run scheduled a real disposal').toBeGreaterThan(0);
      expect(totalExecuted, 'the scheduler never executed a scheduled task').toBeGreaterThan(0);
    },
    60_000,
  );
});
