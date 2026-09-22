import { DiBag } from 'di-bag';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { fakeBrowserStorage } from '@/modules/preferences/fake-browser-storage';

import { installApplicationRuntime } from './application-runtime';
import {
  createLifetimeSlot,
  type LifetimeSlot,
  PartialAcquisitionError,
  type RetirableRuntime,
} from './lifetime-slot';

/** What one generated runtime is, and what the world did to it. */
interface Tracked {
  readonly name: string;
  /** How many times a factory handed this runtime out. */
  acquisitions: number;
  /** How many times its bounded close was **invoked** — attempted, not completed. */
  closeCalls: number;
  /** How many of those completed, either way. */
  closeSettles: number;
  /**
   * Whether the production graph behind this runtime was really closed.
   *
   * Only an `installed` runtime has one; `null` for the generated graphs. It is
   * what the store-revocation invariant is stated against, because a close that
   * was refused before it reached the bag revokes nothing.
   */
  graphClosed: boolean;
  /** Answers whether the installed store has been revoked, or `null` when there is none. */
  probeRevoked: (() => boolean) | null;
}

/**
 * The reference implementation of the ownership rule.
 *
 * Deliberately not a simulator of the slot's schedule: which of several
 * overtaking requests reaches its factory depends on timing, and a model that
 * predicted that would be the implementation twice. It records what happened
 * instead and states the rule as invariants that must hold at every observation
 * point, including inside callbacks.
 */
class Ownership {
  readonly runtimes: Tracked[] = [];
  /** Names published, in order. The last one is what a reader is looking at. */
  readonly published: string[] = [];
  /** How many disposals are running right now; serialization means never two. */
  disposing = 0;
  maxConcurrentDisposals = 0;
  /**
   * For each replace request: its ordinal, how many requests existed when its
   * factory ran, and what it ended up doing.
   *
   * A request whose factory ran while a newer request already existed must not
   * publish — it may have acquired something, because a factory that asks for
   * another replacement itself cannot be stopped before it runs, but then it has
   * to give that runtime back, which invariant 2 checks.
   */
  readonly builds: { readonly ordinal: number; readonly issuedWhenBuilt: number }[] = [];
  /** True once a disposal or a partial release failed: the slot is terminal from then on. */
  terminal = false;
  /** The outcome each issued request is still waiting for. */
  readonly outcomes: { readonly ordinal: number; outcome: 'pending' | 'done' | 'refused' }[] = [];

  track(name: string): Tracked {
    const record: Tracked = {
      name,
      acquisitions: 0,
      closeCalls: 0,
      closeSettles: 0,
      graphClosed: false,
      probeRevoked: null,
    };
    this.runtimes.push(record);
    return record;
  }

  /** Every acquired runtime is either the live one or has had exactly one close attempt. */
  ownershipIsAccountedFor(live: string | null): void {
    for (const runtime of this.runtimes) {
      if (runtime.acquisitions === 0) continue;
      const expected = runtime.name === live ? 0 : 1;
      expect(
        runtime.closeCalls,
        `${runtime.name}: ${String(runtime.acquisitions)} acquisitions, ${String(runtime.closeCalls)} close attempts, live=${String(live)}`,
      ).toBe(expected);
      expect(runtime.acquisitions, `${runtime.name} was acquired twice`).toBe(1);
    }
  }

  /**
   * An installed runtime's store is revoked exactly when its graph was closed.
   *
   * The production half of invariant 2: "the close was attempted" is what the
   * owner controls, and "the store was given back" is what a reader's browser
   * actually observes. A live runtime's store is never revoked, or the page would
   * be holding services that refuse every preference.
   */
  storesFollowTheirGraphs(live: string | null): void {
    for (const runtime of this.runtimes) {
      const probe = runtime.probeRevoked;
      if (probe === null || runtime.acquisitions === 0) continue;
      expect(
        probe(),
        `${runtime.name}: revoked=${String(probe())}, graphClosed=${String(runtime.graphClosed)}, live=${String(live)}`,
      ).toBe(runtime.graphClosed);
      if (runtime.name === live) expect(probe(), `${runtime.name} is live and revoked`).toBe(false);
    }
  }
}

/** A generated request against the slot. */
type Command =
  | {
      readonly kind: 'replace';
      /** How this runtime's disposer behaves when it is eventually retired. */
      readonly disposal: 'settles' | 'rejects' | 'never';
      /** Whether its factory acquires one resource and then throws. */
      readonly partial: boolean;
      /** Whether it asks for another replacement from inside the factory or a listener. */
      readonly reentry: 'none' | 'factory' | 'listener';
      /**
       * Which graph it publishes: a generated one, or the page's **real**
       * application runtime over a fake browser store.
       *
       * The installed flavour is what puts the production installer — the sealed
       * preferences module, its owned revocable store and the transaction around
       * it — inside the generated interleavings, instead of only in named
       * examples.
       */
      readonly graph: 'fake' | 'installed';
    }
  | { readonly kind: 'retire' }
  | { readonly kind: 'settle' };

const commandArb: fc.Arbitrary<Command> = fc.oneof(
  { arbitrary: fc.constant<Command>({ kind: 'retire' }), weight: 1 },
  { arbitrary: fc.constant<Command>({ kind: 'settle' }), weight: 2 },
  {
    arbitrary: fc.record({
      kind: fc.constant('replace' as const),
      disposal: fc.constantFrom('settles' as const, 'rejects' as const, 'never' as const),
      partial: fc.boolean(),
      reentry: fc.constantFrom('none' as const, 'factory' as const, 'listener' as const),
      graph: fc.constantFrom('fake' as const, 'installed' as const),
    }),
    weight: 4,
  },
);

/**
 * The ownership rule, under generated command sequences and scheduled promises.
 *
 * The budget is 1 ms and a `never` disposer therefore always times out: the
 * instant is not controlled, but the **outcome** is, and it is DI Bag's own
 * `DiBagCloseCancelledError` rather than a hand-made rejection. Everything else
 * that settles goes through `fc.scheduler()`, so the order of disposals,
 * re-entrant requests and notifications is fast-check's to choose.
 */
describe('the ownership rule, under generated interleavings', () => {
  it('holds every invariant it claims', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.scheduler(),
        fc.array(commandArb, { minLength: 2, maxLength: 7 }),
        async (scheduler, commands) => {
          const world = new Ownership();
          const slot: LifetimeSlot<Tracked> = createLifetimeSlot<Tracked>(1);
          const pending: Promise<unknown>[] = [];
          let issued = 0;
          /** What a listener should do the next time it is notified, if anything. */
          let listenerRequest: (() => void) | null = null;
          slot.subscribe(() => {
            const asked = listenerRequest;
            if (asked === null) return;
            listenerRequest = null;
            asked();
          });

          /** A real DI Bag runtime whose disposal settles when the scheduler says so. */
          const buildRuntime = (
            record: Tracked,
            disposal: Extract<Command, { kind: 'replace' }>['disposal'],
          ): RetirableRuntime<Tracked> => {
            const bag = DiBag.createBuilder()
              .register({
                owned: DiBag.withDisposal(
                  DiBag.fromSyncFactory((): Tracked => {
                    record.acquisitions += 1;
                    return record;
                  }),
                  async () => {
                    if (disposal === 'never') return new Promise<void>(() => undefined);
                    await scheduler.schedule(
                      disposal === 'settles'
                        ? Promise.resolve()
                        : Promise.reject(new Error(`${record.name} refused to dispose`)),
                      `dispose ${record.name}`,
                    );
                    return undefined;
                  },
                ),
              })
              .build();
            const services = bag.resolve('owned');
            return {
              services,
              close: async (options) => {
                record.closeCalls += 1;
                world.disposing += 1;
                world.maxConcurrentDisposals = Math.max(
                  world.maxConcurrentDisposals,
                  world.disposing,
                );
                try {
                  await bag.close(options);
                } finally {
                  world.disposing -= 1;
                  record.closeSettles += 1;
                }
              },
            };
          };

          /**
           * The page's real runtime, published as this generated runtime.
           *
           * `installApplicationRuntime` is the production function, over a fake
           * browser store: real acquisition, the real sealed module and its real
           * revocation on close, with the **timing** of that close left to the
           * scheduler.
           *
           * The chosen disposal mode decides only when the close runs, never
           * whether it fails, and that is a fact about the graph rather than a
           * convenience: the page's application graph has exactly one disposer, a
           * synchronous revocation that can neither reject nor hang. The rejecting
           * and never-settling flavours therefore stay with the generated graphs
           * above, which is where a socket or a timer will be modelled.
           */
          const buildInstalled = (record: Tracked): RetirableRuntime<Tracked> => {
            const installed = installApplicationRuntime({ openStore: fakeBrowserStorage });
            record.acquisitions += 1;
            record.probeRevoked = () => {
              try {
                installed.services.remembered.ganttDetail.read();
                return false;
              } catch {
                return true;
              }
            };
            return {
              services: record,
              close: async (options) => {
                record.closeCalls += 1;
                world.disposing += 1;
                world.maxConcurrentDisposals = Math.max(
                  world.maxConcurrentDisposals,
                  world.disposing,
                );
                try {
                  await scheduler.schedule(Promise.resolve(), `dispose ${record.name}`);
                  await installed.close(options);
                  record.graphClosed = true;
                } finally {
                  world.disposing -= 1;
                  record.closeSettles += 1;
                }
              },
            };
          };

          /** A construction that acquires one resource and then throws, transactionally. */
          const buildPartial = (record: Tracked): never => {
            const bag = DiBag.createBuilder()
              .register({
                owned: DiBag.withDisposal(
                  DiBag.fromSyncFactory((): Tracked => {
                    record.acquisitions += 1;
                    return record;
                  }),
                  async () => {
                    await scheduler.schedule(Promise.resolve(), `release ${record.name}`);
                    return undefined;
                  },
                ),
              })
              .build();
            bag.resolve('owned');
            throw new PartialAcquisitionError(
              new Error(`${record.name} could not finish building`),
              async (options) => {
                record.closeCalls += 1;
                world.disposing += 1;
                world.maxConcurrentDisposals = Math.max(
                  world.maxConcurrentDisposals,
                  world.disposing,
                );
                try {
                  await bag.close(options);
                } finally {
                  world.disposing -= 1;
                  record.closeSettles += 1;
                }
              },
            );
          };

          const issueReplace = (command: Extract<Command, { kind: 'replace' }>): void => {
            issued += 1;
            const ordinal = issued;
            const record = world.track(`r${String(ordinal)}`);
            const entry = { ordinal, outcome: 'pending' as 'pending' | 'done' | 'refused' };
            world.outcomes.push(entry);
            if (command.reentry === 'listener') {
              listenerRequest = () => {
                issueReplace({
                  kind: 'replace',
                  disposal: 'settles',
                  partial: false,
                  reentry: 'none',
                  graph: 'fake',
                });
              };
            }
            pending.push(
              slot
                .replace(() => {
                  if (command.reentry === 'factory') {
                    issueReplace({
                      kind: 'replace',
                      disposal: 'settles',
                      partial: false,
                      reentry: 'none',
                      graph: 'fake',
                    });
                  }
                  world.builds.push({ ordinal, issuedWhenBuilt: issued });
                  if (command.partial) return buildPartial(record);
                  if (command.graph === 'installed') return buildInstalled(record);
                  return buildRuntime(record, command.disposal);
                })
                .then(
                  () => {
                    entry.outcome = 'done';
                    world.published.push(record.name);
                  },
                  () => {
                    entry.outcome = 'refused';
                  },
                ),
            );
          };

          for (const command of commands) {
            if (command.kind === 'replace') {
              issueReplace(command);
            } else if (command.kind === 'retire') {
              issued += 1;
              const entry = {
                ordinal: issued,
                outcome: 'pending' as 'pending' | 'done' | 'refused',
              };
              world.outcomes.push(entry);
              pending.push(
                slot.retire().then(
                  () => {
                    entry.outcome = 'done';
                  },
                  () => {
                    entry.outcome = 'refused';
                  },
                ),
              );
            } else if (scheduler.count() > 0) {
              await scheduler.waitNext(1);
            }
          }

          await scheduler.waitIdle();
          await Promise.all(pending);
          await scheduler.waitIdle();

          const held = slot.snapshot();
          const live = held.status === 'live' ? held.services.name : null;

          // 1. One live runtime at most, and it is the last thing published.
          if (live !== null) expect(world.published.at(-1)).toBe(live);
          // 2. Ownership is accounted for, in every state including fatal, and an
          //    installed runtime's store followed its own graph.
          world.ownershipIsAccountedFor(live);
          world.storesFollowTheirGraphs(live);
          // 3. Disposals never overlap: that is what the queue is for.
          expect(world.maxConcurrentDisposals, 'two disposals overlapped').toBeLessThanOrEqual(1);
          // 4. A request that was already superseded when its factory ran never
          //    published. This is the fence, stated as an outcome.
          for (const { ordinal, issuedWhenBuilt } of world.builds) {
            if (issuedWhenBuilt <= ordinal) continue;
            const entry = world.outcomes.find((candidate) => candidate.ordinal === ordinal);
            expect(entry?.outcome, `request ${String(ordinal)} published while superseded`).toBe(
              'refused',
            );
          }
          // 5. The latest request wins: unless the slot is fatal, the last request
          //    issued got what it asked for, and no request is still pending.
          expect(
            world.outcomes.filter(({ outcome }) => outcome === 'pending'),
            'a request never settled',
          ).toEqual([]);
          const fatal = held.status === 'fatal';
          const last = world.outcomes.at(-1);
          if (!fatal && last !== undefined) {
            expect(last.outcome, 'the latest request did not win').not.toBe('refused');
          }
          // 6. A fatal slot holds nothing and publishes nothing after it.
          if (fatal) expect(live).toBe(null);
        },
      ),
      { seed: 20260923, numRuns: 300 },
    );
  }, 120_000);
});
