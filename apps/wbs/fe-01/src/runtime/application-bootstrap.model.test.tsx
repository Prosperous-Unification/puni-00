import { DiBag } from 'di-bag';
import fc from 'fast-check';
import { isValidElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LifetimeFault } from '@/components/chrome/lifetime-fault';
import { fakeBrowserStorage } from '@/modules/preferences/fake-browser-storage';

import { bootstrapApplication } from './application-bootstrap';
import { type ApplicationServices, installApplicationRuntime } from './application-runtime';
import { type Acquire, createLifetimeSlot, type LifetimeSlot } from './lifetime-slot';

/** What the page was asked to draw, and what the slot held at that instant. */
interface Rendered {
  /** True for the sanitized fatal page, false for the app. */
  readonly fatal: boolean;
  readonly status: string;
  /** The services the slot published then, or null when it published none. */
  readonly services: ApplicationServices | null;
}

/** How a generated runtime's bounded close behaves once something retires it. */
type Disposal = 'settles' | 'rejects' | 'never';

/** A generated event against one page's bootstrap. */
type Command =
  | { readonly kind: 'bootstrap'; readonly disposal: Disposal }
  | { readonly kind: 'retire' }
  | { readonly kind: 'replace'; readonly disposal: Disposal }
  | { readonly kind: 'retireFromListener' }
  | { readonly kind: 'settle' }
  | { readonly kind: 'pagehide' }
  | { readonly kind: 'pageshow'; readonly persisted: boolean }
  /** The drawn app signs a reader in: its region's session will end its retirement this way. */
  | { readonly kind: 'session'; readonly disposal: Disposal };

const disposalArb: fc.Arbitrary<Disposal> = fc.constantFrom('settles', 'rejects', 'never');

const commandArb: fc.Arbitrary<Command> = fc.oneof(
  {
    arbitrary: fc.record({ kind: fc.constant('bootstrap' as const), disposal: disposalArb }),
    weight: 3,
  },
  { arbitrary: fc.constant<Command>({ kind: 'retire' }), weight: 2 },
  {
    arbitrary: fc.record({ kind: fc.constant('replace' as const), disposal: disposalArb }),
    weight: 2,
  },
  { arbitrary: fc.constant<Command>({ kind: 'retireFromListener' }), weight: 2 },
  { arbitrary: fc.constant<Command>({ kind: 'settle' }), weight: 2 },
  { arbitrary: fc.constant<Command>({ kind: 'pagehide' }), weight: 2 },
  {
    arbitrary: fc.record({ kind: fc.constant('pageshow' as const), persisted: fc.boolean() }),
    weight: 2,
  },
  {
    arbitrary: fc.record({ kind: fc.constant('session' as const), disposal: disposalArb }),
    weight: 3,
  },
);

/** A session retirement a region's cleanup handed to the application, and how it went. */
interface JoinedSession {
  /** The application runtime it was handed to. */
  readonly runtime: ApplicationServices;
  readonly disposal: Disposal;
  settled: boolean;
}

const FakeApp = (): null => null;

/** A `pageshow` carrying the bfcache-restoration flag, for the `pageshow` command. */
function pageShowEvent(persisted: boolean): Event {
  const event = new Event('pageshow');
  Object.defineProperty(event, 'persisted', { value: persisted });
  return event;
}

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
 * that retires from inside a notification, a `pagehide`, a persisted `pageshow`.
 * Two named examples cannot cover that, so the orders are `fc.scheduler()`'s to
 * choose and the invariants are stated over **what the page was drawn from**
 * rather than over a sequence somebody predicted.
 *
 * The slot is the real one, the installer is the production one over a fake browser
 * store, and the root records instead of committing: what is under test is which
 * tree is rendered and against which published runtime. `pagehide` and `pageshow`
 * are driven through the same injected `eventTarget` every production bootstrap
 * takes, never through a global `window`.
 *
 * Every `retire`/`replace` this property issues — whether from its own explicit
 * `'retire'`/`'replace'` commands or triggered indirectly by dispatching
 * `pagehide`/`pageshow` — is captured into `pending` through {@link trackedSlot},
 * so `await Promise.all(pending)` genuinely waits for an event-triggered
 * transition (including a `'never'` disposal's own real, DI-Bag-enforced budget
 * timeout) before the property reads any invariant.
 */
describe("the page's bootstrap, under generated interleavings", () => {
  it('only ever draws the page from the runtime the slot publishes', async () => {
    /**
     * Coverage over the **whole pinned run**, not one iteration: a property
     * whose commands are generated but never actually reach the state they
     * claim to exercise proves nothing about it. Declared outside the
     * property body so every run's own counts accumulate, and asserted once
     * `fc.assert` returns that each of the new events fired at least once,
     * and that at least one of them retired a runtime that was genuinely
     * `live` at the instant it fired.
     */
    let pagehideCount = 0;
    /** Sessions a region handed over whose runtime then retired, and that settled first. */
    let sessionsHeldThenReleased = 0;
    /** Sessions that failed or hung, whose application runtime ended the run terminally fatal. */
    let failedSessionsMadeFatal = 0;
    let pageshowPersistedCount = 0;
    let pageshowNonPersistedCount = 0;
    let triggeredWhileLive = 0;

    await fc.assert(
      fc.asyncProperty(
        fc.scheduler(),
        // Half the sequences open on a bootstrap, so a page is drawn often enough for a
        // reader to sign in and for a page hide to take their region down.
        fc
          .tuple(fc.boolean(), disposalArb, fc.array(commandArb, { minLength: 2, maxLength: 8 }))
          .map(([opensOnBootstrap, disposal, rest]): Command[] =>
            opensOnBootstrap ? [{ kind: 'bootstrap', disposal }, ...rest] : rest,
          ),
        async (scheduler, commands) => {
          // 20ms rather than 1ms: a joined session's scheduled settlement has to be able to
          // arrive inside the application's retirement budget, or no run could show a
          // retirement held by a session and then released.
          const slot: LifetimeSlot<ApplicationServices> =
            createLifetimeSlot<ApplicationServices>(20);
          /** Every session a region's cleanup handed to the application, in order. */
          const joined: JoinedSession[] = [];
          /** How each runtime this run built disposes of itself. */
          const runtimeDisposal = new Map<ApplicationServices, Disposal>();
          /** The session the drawn app's region holds, or `null` while nobody is signed in. */
          let regionSession: Disposal | null = null;
          // 6. A retirement a region handed over holds the application's retirement: no
          //    runtime it was handed to is replaced by an empty slot or another live one
          //    until the session has settled.
          const heldViolations: string[] = [];
          slot.subscribe(() => {
            const state = slot.snapshot();
            if (state.status !== 'empty' && state.status !== 'live') return;
            for (const session of joined) {
              if (state.status === 'live' && state.services === session.runtime) continue;
              if (!session.settled) {
                heldViolations.push(
                  `the slot went ${state.status} before a joined session settled`,
                );
              } else if (session.disposal === 'settles') {
                sessionsHeldThenReleased += 1;
              }
            }
          });
          const rendered: Rendered[] = [];
          /** The status the slot held each time a root was created, in order. */
          const mounted: string[] = [];
          const pending: Promise<unknown>[] = [];
          const bootstrapOutcomes: string[] = [];
          let listenerRetires = false;
          slot.subscribe(() => {
            if (!listenerRetires) return;
            listenerRetires = false;
            pending.push(slot.retire().then(undefined, () => undefined));
          });

          /**
           * The slot every `bootstrapApplication` call in this run is given —
           * never `slot` itself — so a `retire`/`replace` this property
           * triggers only *indirectly*, by dispatching a `pagehide`/
           * `pageshow` event, is captured into `pending` exactly as one this
           * property calls directly already is. Without this, the property
           * could return and read its own invariants while an event-triggered
           * transition — a `'never'` disposal's own real budget timeout among
           * them — was still settling underneath it.
           */
          const trackedSlot: LifetimeSlot<ApplicationServices> = {
            subscribe: (listener) => slot.subscribe(listener),
            snapshot: () => slot.snapshot(),
            retire: () => {
              const outcome = slot.retire();
              pending.push(outcome.then(undefined, () => undefined));
              return outcome;
            },
            replace: (acquire) => {
              const outcome = slot.replace(acquire);
              pending.push(outcome.then(undefined, () => undefined));
              return outcome;
            },
            lateCleanup: () => slot.lateCleanup(),
            lateOutcome: () => slot.lateOutcome(),
          };

          /**
           * Every `bootstrap` command shares one event target, exactly as the
           * production module load does — this is what lets a `pagehide`/
           * `pageshow` command reach every bootstrap this run has started so
           * far.
           */
          const eventTarget = new EventTarget();

          /**
           * A generated runtime whose bounded close settles, rejects or never
           * settles, under the scheduler — the same three shapes
           * `lifetime-slot.model.test.ts` generates, so a `pagehide` command
           * here can retire into any of DI Bag's own real outcomes.
           */
          const buildAcquire = (disposal: Disposal): Acquire<ApplicationServices> => {
            if (disposal === 'settles') {
              // The real production graph: its own disposers are a synchronous
              // store revocation and the retirement join, which waits only for
              // the sessions a region handed it — exactly as
              // `lifetime-slot.model.test.ts`'s own `buildInstalled` relies on.
              return () => {
                const installed = installApplicationRuntime({ openStore: fakeBrowserStorage });
                runtimeDisposal.set(installed.services, 'settles');
                return installed;
              };
            }
            // A generated graph whose own DI Bag disposer rejects or never
            // settles, under the scheduler. DI Bag's own bounded `close()` is
            // what enforces the slot's 1ms budget here — never a raw promise
            // this file races itself, which is exactly the bug a first draft
            // had: a close that ignored `options.timeoutMs` hung every 'never'
            // run past this test's own 120s timeout.
            return () => {
              const installed = installApplicationRuntime({ openStore: fakeBrowserStorage });
              const bag = DiBag.createBuilder()
                .withServices({
                  owned: DiBag.providerWithDisposal({
                    provider: DiBag.createProvider((): ApplicationServices => installed.services, {
                      factoryReturnKind: 'sync-value',
                    }),
                    disposeService: async () => {
                      if (disposal === 'never') return new Promise<void>(() => undefined);
                      // Rejected once the scheduler releases it, never before: a rejection
                      // built eagerly is unhandled whenever DI Bag's budget gives up on
                      // this disposer first.
                      await scheduler.schedule(Promise.resolve(), 'dispose the page runtime');
                      throw new Error('the page runtime refused to dispose');
                    },
                  }),
                })
                .buildContainer();
              const services = bag.resolve('owned');
              runtimeDisposal.set(services, disposal);
              return {
                services,
                close: (options) => bag.close({ waitTimeoutMs: options.timeoutMs }),
              };
            };
          };

          /**
           * A session's retirement, settling, rejecting or never settling under
           * the scheduler — what `SignedInApp`'s cleanup hands the application.
           */
          const sessionRetirement = (disposal: Disposal): Promise<void> => {
            if (disposal === 'never') return new Promise<void>(() => undefined);
            return scheduler.schedule(Promise.resolve(), 'give the session back').then(() => {
              if (disposal === 'rejects') throw new Error('the session could not be given back');
            });
          };

          const mount = () => {
            mounted.push(slot.snapshot().status);
            /** Whether this root's last draw was the app, whose region a cleanup would run. */
            let drawsApp = false;
            return {
              render: (tree: ReactNode) => {
                const held = slot.snapshot();
                const fatal = isValidElement(tree) && tree.type === LifetimeFault;
                drawsApp = !fatal;
                rendered.push({
                  fatal,
                  status: held.status,
                  services: held.status === 'live' ? held.services : null,
                });
              },
              /**
               * The tree's own cleanup, run inside the unmount as React runs it:
               * a signed-in region hands its session's retirement to the live
               * application through the same join `useRetirementJoin` reaches.
               */
              unmount: () => {
                if (!drawsApp || regionSession === null) return;
                const held = slot.snapshot();
                if (held.status !== 'live') return;
                const session: JoinedSession = {
                  runtime: held.services,
                  disposal: regionSession,
                  settled: false,
                };
                regionSession = null;
                joined.push(session);
                const settle = () => {
                  session.settled = true;
                };
                const retirement = sessionRetirement(session.disposal);
                retirement.then(settle, settle);
                held.services.retirements.join(retirement);
              },
            };
          };

          /**
           * What was live just before a `pagehide` command fires, so the
           * property can assert afterward that it did not stay live — this
           * file's own `'a runtime live before a pagehide trigger was still
           * the one live at the end'` invariant's own record.
           */
          const preTriggerLive: ApplicationServices[] = [];
          /**
           * Whether a `bootstrap` command has run yet in this sequence —
           * `pagehide`/`pageshow` only have a listener to reach once one has:
           * a bare `slot.replace()` with no bootstrap registers nothing, so a
           * runtime it published staying live across a `pagehide` is correct,
           * not a finding (measured: without this guard, the shrunk
           * counterexample `[{"kind":"replace","disposal":"settles"},
           * {"kind":"settle"},{"kind":"pagehide"}]` failed invariant 5 on
           * exactly that non-scenario).
           */
          let hasBootstrapped = false;
          const noteTrigger = (): void => {
            if (!hasBootstrapped) return;
            const state = slot.snapshot();
            if (state.status !== 'live') return;
            triggeredWhileLive += 1;
            preTriggerLive.push(state.services);
          };

          for (const command of commands) {
            if (command.kind === 'bootstrap') {
              hasBootstrapped = true;
              pending.push(
                bootstrapApplication(globalThis.document.createElement('div'), {
                  acquire: buildAcquire(command.disposal),
                  slot: trackedSlot,
                  mount,
                  app: FakeApp,
                  eventTarget,
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
              pending.push(
                slot.replace(buildAcquire(command.disposal)).then(undefined, () => undefined),
              );
            } else if (command.kind === 'retireFromListener') {
              listenerRetires = true;
            } else if (command.kind === 'pagehide') {
              pagehideCount += 1;
              noteTrigger();
              eventTarget.dispatchEvent(new Event('pagehide'));
            } else if (command.kind === 'pageshow') {
              if (command.persisted) pageshowPersistedCount += 1;
              else pageshowNonPersistedCount += 1;
              eventTarget.dispatchEvent(pageShowEvent(command.persisted));
            } else if (command.kind === 'session') {
              // A reader signs in to a page already drawn: let a bootstrap still settling
              // draw first, as a real sign-in waits for the form to be on screen.
              await new Promise((resolve) => setTimeout(resolve, 0));
              regionSession = command.disposal;
            } else if (scheduler.count() > 0) {
              await scheduler.waitNext(1);
            } else {
              // Building a fresh runtime touches no scheduled promise at all
              // (`Acquire<S>` is synchronous; only a disposal calls
              // `scheduler.schedule`), so a `settle` command with nothing yet
              // scheduled still has to yield once, or an initial `bootstrap`
              // never advances past its own single microtask hop before a
              // later command in the same sequence reads the slot's status —
              // exactly why `triggeredWhileLive` read 0 on every one of 300
              // runs before this `else` existed.
              await Promise.resolve();
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
          // 5. A runtime that was live the instant a `pagehide` command fired is
          //    not the runtime still live once every command has drained: the
          //    trigger retired it (and, if the slot rebuilt, a later
          //    `bootstrap`/`replace`/`pageshow` published a fresh one in its
          //    place), it never just sat there unaffected.
          const finalState = slot.snapshot();
          if (finalState.status === 'live') {
            expect(
              preTriggerLive,
              'a runtime live before a pagehide trigger was still the one live at the end',
            ).not.toContain(finalState.services);
          }
          // 6. (recorded by the subscriber above)
          expect(heldViolations, 'a joined session did not hold the application').toEqual([]);
          // 7. A session that failed or never settled fails the application runtime it was
          //    handed to: that runtime never gives way to an empty slot or another live one,
          //    and the slot ends terminally fatal.
          for (const session of joined) {
            if (session.disposal === 'settles') continue;
            if (runtimeDisposal.get(session.runtime) !== 'settles') continue;
            expect(
              finalState.status === 'fatal' && finalState.terminal,
              `a session that ${session.disposal === 'never' ? 'never settled' : 'failed'} left the slot ${finalState.status}`,
            ).toBe(true);
            failedSessionsMadeFatal += 1;
          }
        },
      ),
      { seed: 20260924, numRuns: 300 },
    );

    expect(pagehideCount, 'the pinned run never issued a pagehide').toBeGreaterThan(0);
    expect(
      pageshowPersistedCount,
      'the pinned run never issued a persisted pageshow',
    ).toBeGreaterThan(0);
    expect(
      pageshowNonPersistedCount,
      'the pinned run never issued a non-persisted pageshow',
    ).toBeGreaterThan(0);
    expect(
      triggeredWhileLive,
      'the pinned run never fired a pagehide while a runtime was genuinely live',
    ).toBeGreaterThan(0);
    expect(
      sessionsHeldThenReleased,
      'the pinned run never released an application retirement a session had held',
    ).toBeGreaterThan(0);
    expect(
      failedSessionsMadeFatal,
      'the pinned run never failed an application retirement through its session',
    ).toBeGreaterThan(0);
  }, 120_000);
});
