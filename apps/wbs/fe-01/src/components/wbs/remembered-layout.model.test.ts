import { DiBag, DiBagCloseCancelledError } from 'di-bag';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { remembered, type RuntimeRemembered } from '@/lib/remembered';
import type { BrowserStorage } from '@/modules/preferences/contract';
import {
  fakeBrowserStorage,
  type HeldByFake,
  writeRefusingBrowserStorage,
} from '@/modules/preferences/fake-browser-storage';
import { MERMAID_SECTION_MODE_KEY } from '@/modules/preferences/preference-keys';
import { type ApplicationServices, installApplicationRuntime } from '@/runtime/application-runtime';
import { createLifetimeSlot, type LifetimeSlot } from '@/runtime/lifetime-slot';

import { isSectionMode, SECTION_MODES, type SectionMode } from './plan-mermaid';

/**
 * The bounded wait the generated slot gives a disposal, in milliseconds.
 *
 * Only a `'never'` disposal ever spends it: every controlled wait this file adds
 * happens **before** `RetirableRuntime.close` forwards `options` to DI Bag, so the
 * budget covers the bag's own close alone. Large enough that a disposal which
 * does settle cannot outrun it on a loaded host.
 */
const DISPOSAL_BUDGET_MS = 40;

/** The one storage failure the refusing store raises, retained so identity can be asserted. */
const WRITE_DENIED = new Error('write denied');

/** The three stores a generated runtime can be installed over. */
type StoreName = 'A' | 'B' | 'denied';

const STORE_NAMES: readonly StoreName[] = ['A', 'B', 'denied'];

/** How a published runtime's own disposal behaves when something withdraws it. */
type Disposal = 'settles' | 'never';

/** What one access through the handle is asked to do. */
type Access = { readonly kind: 'read' } | { readonly kind: 'write'; readonly mode: SectionMode };

/**
 * How many times each command actually ran, across the **whole pinned run** — a
 * property whose commands were all skipped by their own preconditions proves
 * nothing, so every counter is asserted non-zero once `fc.assert` returns.
 */
const ran: Record<string, number> = {};

function note(kind: string): void {
  ran[kind] = (ran[kind] ?? 0) + 1;
}

const COMMAND_KINDS: readonly string[] = [
  'replace',
  'retire',
  'access',
  'tamper',
  'accessWhileRetiring',
  'accessFromNotification',
  'accessWhileAcquiring',
];

/** Counts, additionally, the interleavings the invariants are actually about. */
const reached = {
  droppedRefusal: 0,
  deniedWrite: 0,
  expiredDisposal: 0,
  accessWithNothingLive: 0,
  accessAfterReplacement: 0,
};

/**
 * The handle's state machine as a reference implementation that shares nothing
 * with the production stores.
 *
 * `bytes` is the model's **own** record of what each store holds for the one key.
 * It is never read back out of the fakes, which is what makes the storage
 * assertion an oracle rather than a tautology.
 */
interface HandleModel {
  /** The store of the runtime the slot publishes, or `null` while none is live. */
  live: StoreName | null;
  liveDisposal: Disposal;
  /** True once a disposal outran its budget: the slot is fatal and publishes nothing again. */
  terminal: boolean;
  /** How many runtimes have been published, so a replacement can be told from a first. */
  published: number;
  bytes: Map<StoreName, string>;
}

/** A disposal this run can hold open, independently of the scheduler. */
interface DisposalGate {
  armed: boolean;
  wait: () => Promise<void>;
  release: () => void;
}

function createDisposalGate(): DisposalGate {
  let release = (): void => undefined;
  let blocking: Promise<void> | null = null;
  const gate: DisposalGate = {
    armed: false,
    wait: async () => {
      if (!gate.armed) return;
      blocking ??= new Promise<void>((resolve) => {
        release = resolve;
      });
      await blocking;
    },
    release: () => {
      gate.armed = false;
      release();
      blocking = null;
      release = (): void => undefined;
    },
  };
  return gate;
}

/** What one generated run drives: one slot, three stores, and the one handle. */
interface HandleWorld {
  readonly slot: LifetimeSlot<ApplicationServices>;
  readonly stores: Record<StoreName, BrowserStorage & HeldByFake>;
  /**
   * Built once, before any runtime is published, and kept for the whole run —
   * exactly how `remembered-layout.ts` builds `storedMermaidSectionMode` when the
   * module loads.
   */
  readonly handle: RuntimeRemembered<SectionMode>;
  readonly issued: { readonly label: string; readonly outcome: Promise<unknown> }[];
  readonly gate: DisposalGate;
  readonly scheduler: fc.Scheduler;
  /** Refusals already verified by identity; teardown suppresses only these. */
  readonly verifiedRefusals: Set<unknown>;
  /** Whether the runtime published now will outrun its budget when teardown retires it. */
  readonly liveDisposalHangs: { yes: boolean };
}

/**
 * The runtime a generated `replace` publishes: the **production** installer over
 * one of this run's stores, with the liveness predicate `acquireApplicationRuntime`
 * wires in production.
 *
 * Its close waits on {@link DisposalGate}, then on a scheduled task — so the
 * instant a disposal completes is the scheduler's to order — and `'never'` adds a
 * real DI Bag disposer that never settles, so the bag's own bounded close raises
 * `DiBagCloseCancelledError`: a controlled timeout out of DI Bag's own budget.
 */
function acquireOver(world: HandleWorld, target: StoreName, disposal: Disposal) {
  return () => {
    const installed = installApplicationRuntime({
      openStore: () => world.stores[target],
      isLive: () => world.slot.snapshot().status === 'live',
    });
    const hanging =
      disposal === 'never'
        ? DiBag.createBuilder()
            .register({
              held: DiBag.withDisposal(
                DiBag.fromSyncFactory(() => target),
                async () => new Promise<void>(() => undefined),
              ),
            })
            .build()
        : null;
    hanging?.resolve('held');
    return {
      services: installed.services,
      close: async (options: { timeoutMs: number }) => {
        await world.gate.wait();
        await world.scheduler.schedule(Promise.resolve(), `dispose ${target}`);
        if (hanging !== null) await hanging.close(options);
        await installed.close(options);
      },
    };
  };
}

/** What the model says one access returns, and what it does to the model's bytes. */
function expectedAccess(model: HandleModel, access: Access): unknown {
  if (model.live === null) {
    return access.kind === 'read' ? { value: null, persists: false } : false;
  }
  const live = model.live;
  if (access.kind === 'write') {
    if (live === 'denied') return WRITE_DENIED;
    model.bytes.set(live, JSON.stringify(access.mode));
    return true;
  }
  const stored = model.bytes.get(live);
  if (stored === undefined) return { value: null, persists: true };
  let parsed: unknown = undefined;
  try {
    parsed = JSON.parse(stored);
  } catch {
    // A hand-edited value that is not JSON at all: refused, exactly as one that
    // parses to something other than a mode is.
  }
  if (isSectionMode(parsed)) return { value: parsed, persists: true };
  model.bytes.delete(live);
  reached.droppedRefusal += 1;
  return { value: null, persists: true };
}

/**
 * Runs one access through the handle and reports what came back — a value, or
 * the failure it threw. Nothing is caught and dropped: the thrown value is the
 * outcome, compared by identity.
 */
function perform(world: HandleWorld, access: Access): unknown {
  try {
    return access.kind === 'read' ? world.handle.readAndDrop() : world.handle.write(access.mode);
  } catch (thrown) {
    return thrown;
  }
}

/** Asserts one access's outcome against the model's, by identity for a failure. */
function assertAccess(
  model: HandleModel,
  observed: unknown,
  expected: unknown,
  what: string,
): void {
  if (expected === WRITE_DENIED) {
    reached.deniedWrite += 1;
    expect(observed, `${what}: an ordinary storage failure did not propagate unchanged`).toBe(
      WRITE_DENIED,
    );
    return;
  }
  if (model.live === null) reached.accessWithNothingLive += 1;
  else if (model.published > 1) reached.accessAfterReplacement += 1;
  expect(observed, `${what}: what the handle answered`).toEqual(expected);
}

/** What every store holds for the key, against the model's own record. */
function assertBytes(model: HandleModel, world: HandleWorld): void {
  for (const name of STORE_NAMES) {
    expect(world.stores[name].held()[MERMAID_SECTION_MODE_KEY], `stored bytes in ${name}`).toBe(
      model.bytes.get(name),
    );
  }
  // The page's own store is never a fallback for a runtime that is not there.
  expect(localStorage.getItem(MERMAID_SECTION_MODE_KEY), 'the page’s own store').toBeNull();
}

function expectsRefusal(model: HandleModel): boolean {
  return model.terminal || (model.live !== null && model.liveDisposal === 'never');
}

/**
 * Whether a refusal is the slot's own **budget expiry** and nothing else — the
 * class, `reason: 'timeout'` and the retained cleanup promise that
 * `lifetime-slot.ts`'s own `lateCleanupOf` reads.
 */
function isDisposalExpiry(refusal: unknown): refusal is DiBagCloseCancelledError {
  return (
    // Proof: on 2026-09-24, `acquireOver`'s bounded close replaced by a thrown
    // `Error('unexpected cleanup corruption')` failed this test after 2 runs on
    // `replace(A): the disposal did not expire the way the slot's budget expires;
    // it failed some other way: Error: unexpected cleanup corruption`.
    refusal instanceof DiBagCloseCancelledError &&
    refusal.reason === 'timeout' &&
    refusal.cleanupPromise instanceof Promise
  );
}

/** Asserts a transition refused exactly when, and why, the model says it must. */
function assertRefusal(
  model: HandleModel,
  world: HandleWorld,
  refusal: unknown,
  what: string,
): void {
  if (!expectsRefusal(model)) {
    expect(refusal, `${what}: a transition refused unexpectedly`).toBeNull();
    return;
  }
  expect(refusal, `${what}: an expiring or terminal transition did not refuse`).not.toBeNull();
  if (model.terminal) {
    expect(
      world.verifiedRefusals.has(refusal),
      `${what}: a terminal slot refused with a failure nothing had verified: ${String(refusal)}`,
    ).toBe(true);
    return;
  }
  expect(
    isDisposalExpiry(refusal),
    `${what}: the disposal did not expire the way the slot's budget expires; it failed some other way: ${String(refusal)}`,
  ).toBe(true);
  world.verifiedRefusals.add(refusal);
  reached.expiredDisposal += 1;
}

/** Awaits one issued transition, through the scheduler, and returns what it refused with. */
async function settle(
  world: HandleWorld,
  label: string,
  outcome: Promise<unknown>,
): Promise<unknown> {
  world.issued.push({ label, outcome });
  let refusal: unknown = null;
  try {
    await world.scheduler.waitFor(outcome);
  } catch (caught) {
    refusal = caught;
  }
  await world.scheduler.waitIdle();
  return refusal;
}

function applyWithdrawn(model: HandleModel): void {
  model.live = null;
  model.liveDisposal = 'settles';
}

function applyPublished(model: HandleModel, target: StoreName, disposal: Disposal): void {
  model.live = target;
  model.liveDisposal = disposal;
  model.published += 1;
}

type HandleCommand = fc.AsyncCommand<HandleModel, HandleWorld>;

const describeAccess = (access: Access): string =>
  access.kind === 'read' ? 'read' : `write(${access.mode})`;

/** Replacement by a runtime over `target`, disposing the named way when withdrawn. */
class Replace implements HandleCommand {
  constructor(
    readonly target: StoreName,
    readonly disposal: Disposal,
  ) {}
  check(model: HandleModel): boolean {
    return !model.terminal;
  }
  async run(model: HandleModel, world: HandleWorld): Promise<void> {
    note('replace');
    const expiring = expectsRefusal(model);
    const refusal = await settle(
      world,
      `replace(${this.target})`,
      world.slot.replace(acquireOver(world, this.target, this.disposal)),
    );
    assertRefusal(model, world, refusal, `replace(${this.target})`);
    if (expiring) {
      model.terminal = true;
      applyWithdrawn(model);
    } else {
      applyPublished(model, this.target, this.disposal);
    }
    world.liveDisposalHangs.yes = model.live !== null && model.liveDisposal === 'never';
    assertBytes(model, world);
  }
  toString(): string {
    return `replace(${this.target}, ${this.disposal})`;
  }
}

class Retire implements HandleCommand {
  check(model: HandleModel): boolean {
    return model.live !== null && !model.terminal;
  }
  async run(model: HandleModel, world: HandleWorld): Promise<void> {
    note('retire');
    const expiring = expectsRefusal(model);
    const refusal = await settle(world, 'retire', world.slot.retire());
    assertRefusal(model, world, refusal, 'retire');
    if (expiring) model.terminal = true;
    applyWithdrawn(model);
    world.liveDisposalHangs.yes = false;
    assertBytes(model, world);
  }
  toString(): string {
    return 'retire';
  }
}

/** One access through the handle, at whatever the slot is publishing now. */
class AccessNow implements HandleCommand {
  constructor(readonly access: Access) {}
  check(): boolean {
    return true;
  }
  async run(model: HandleModel, world: HandleWorld): Promise<void> {
    note('access');
    const observed = perform(world, this.access);
    assertAccess(model, observed, expectedAccess(model, this.access), describeAccess(this.access));
    await Promise.resolve();
    assertBytes(model, world);
  }
  toString(): string {
    return describeAccess(this.access);
  }
}

/**
 * A hand-edited value, written straight into one of the two ordinary stores —
 * never through the handle. The refusing store takes no writes by design.
 */
class Tamper implements HandleCommand {
  constructor(
    readonly target: 'A' | 'B',
    readonly raw: string,
  ) {}
  check(): boolean {
    return true;
  }
  async run(model: HandleModel, world: HandleWorld): Promise<void> {
    note('tamper');
    world.stores[this.target].write(MERMAID_SECTION_MODE_KEY, this.raw);
    model.bytes.set(this.target, this.raw);
    await Promise.resolve();
    assertBytes(model, world);
  }
  toString(): string {
    return `tamper(${this.target}, ${this.raw})`;
  }
}

/**
 * An access while a retirement's **disposal is held open**: the slot has
 * withdrawn publication and the runtime has not let go yet — the window a handle
 * that remembered the last live store would still write into.
 */
class AccessWhileRetiring implements HandleCommand {
  constructor(readonly access: Access) {}
  check(model: HandleModel): boolean {
    return model.live !== null && model.liveDisposal === 'settles' && !model.terminal;
  }
  async run(model: HandleModel, world: HandleWorld): Promise<void> {
    note('accessWhileRetiring');
    world.gate.armed = true;
    const outcome = world.slot.retire();
    world.issued.push({ label: 'retire holding disposal', outcome });
    applyWithdrawn(model);
    let refusal: unknown = null;
    try {
      const observed = perform(world, this.access);
      assertAccess(
        model,
        observed,
        expectedAccess(model, this.access),
        `${describeAccess(this.access)} while retiring`,
      );
      assertBytes(model, world);
    } finally {
      world.gate.release();
      try {
        await world.scheduler.waitFor(outcome);
      } catch (caught) {
        refusal = caught;
      }
      await world.scheduler.waitIdle();
    }
    expect(refusal, 'a held-open retirement refused once released').toBeNull();
    world.liveDisposalHangs.yes = false;
    assertBytes(model, world);
  }
  toString(): string {
    return `accessWhileRetiring(${describeAccess(this.access)})`;
  }
}

/**
 * An access issued from **inside** the slot's own notification of a retirement —
 * re-entrant, and delivered when the scheduler says: before the old runtime has
 * finished letting go, or after.
 */
class AccessFromNotification implements HandleCommand {
  constructor(readonly access: Access) {}
  check(model: HandleModel): boolean {
    return model.live !== null && model.liveDisposal === 'settles' && !model.terminal;
  }
  async run(model: HandleModel, world: HandleWorld): Promise<void> {
    note('accessFromNotification');
    const heard: { observed: unknown; delivered: boolean } = { observed: null, delivered: false };
    let armed = true;
    const unsubscribe = world.slot.subscribe(() => {
      if (!armed) return;
      armed = false;
      void world.scheduler.schedule(Promise.resolve(), 'deliver the slot notification').then(() => {
        heard.delivered = true;
        heard.observed = perform(world, this.access);
      });
    });
    try {
      const refusal = await settle(world, 'retire from notification', world.slot.retire());
      assertRefusal(model, world, refusal, 'retire from notification');
      applyWithdrawn(model);
      world.liveDisposalHangs.yes = false;
      expect(heard.delivered, 'the notification was never delivered').toBe(true);
      assertAccess(
        model,
        heard.observed,
        expectedAccess(model, this.access),
        `${describeAccess(this.access)} from a notification`,
      );
      assertBytes(model, world);
    } finally {
      unsubscribe();
    }
  }
  toString(): string {
    return `accessFromNotification(${describeAccess(this.access)})`;
  }
}

/**
 * An access while a replacement has only **partially acquired** its graph: the
 * factory has built the new runtime and not returned it, so nothing is live.
 */
class AccessWhileAcquiring implements HandleCommand {
  constructor(
    readonly target: StoreName,
    readonly access: Access,
  ) {}
  check(model: HandleModel): boolean {
    return !model.terminal && model.liveDisposal === 'settles';
  }
  async run(model: HandleModel, world: HandleWorld): Promise<void> {
    note('accessWhileAcquiring');
    const acquire = acquireOver(world, this.target, 'settles');
    const inside: { observed: unknown } = { observed: null };
    const refusal = await settle(
      world,
      `accessWhileAcquiring(${this.target})`,
      world.slot.replace(() => {
        const acquired = acquire();
        inside.observed = perform(world, this.access);
        return acquired;
      }),
    );
    assertRefusal(model, world, refusal, `accessWhileAcquiring(${this.target})`);
    applyWithdrawn(model);
    assertAccess(
      model,
      inside.observed,
      expectedAccess(model, this.access),
      `${describeAccess(this.access)} while acquiring`,
    );
    applyPublished(model, this.target, 'settles');
    world.liveDisposalHangs.yes = false;
    assertBytes(model, world);
  }
  toString(): string {
    return `accessWhileAcquiring(${this.target}, ${describeAccess(this.access)})`;
  }
}

const modeArb = fc.constantFrom<SectionMode>(...SECTION_MODES);
const accessArb: fc.Arbitrary<Access> = fc.oneof(
  fc.constant<Access>({ kind: 'read' }),
  modeArb.map((mode): Access => ({ kind: 'write', mode })),
);
const storeArb = fc.constantFrom<StoreName>('A', 'B', 'denied');
const disposalArb = fc.constantFrom<Disposal>('settles', 'never');
/** A stored value that is a mode, one that parses to something else, and one that does not parse. */
const rawArb = fc.constantFrom('"step"', '"assignees"', '7', '{not json');

const commandsArb = fc.commands<HandleModel, HandleWorld, false>(
  [
    fc.tuple(storeArb, disposalArb).map(([target, disposal]) => new Replace(target, disposal)),
    fc.constant(new Retire()),
    accessArb.map((access) => new AccessNow(access)),
    fc
      .tuple(fc.constantFrom<'A' | 'B'>('A', 'B'), rawArb)
      .map(([target, raw]) => new Tamper(target, raw)),
    accessArb.map((access) => new AccessWhileRetiring(access)),
    accessArb.map((access) => new AccessFromNotification(access)),
    fc
      .tuple(storeArb, accessArb)
      .map(([target, access]) => new AccessWhileAcquiring(target, access)),
  ],
  { maxCommands: 12 },
);

/**
 * Gives every runtime back and **reports** what refused. Only a refusal this run
 * already verified by identity, or the budget expiry of a runtime the commands
 * knowingly left hanging, is suppressed; every other cleanup rejection is
 * returned, because a cleanup failure nobody reported is a failure of this test.
 */
async function giveEverythingBack(world: HandleWorld): Promise<Error[]> {
  const unreported: Error[] = [];
  world.gate.release();
  world.issued.push({ label: 'teardown retire', outcome: world.slot.retire() });
  for (const { label, outcome } of [...world.issued]) {
    try {
      await world.scheduler.waitFor(outcome);
    } catch (refusal) {
      // Proof: on 2026-09-24, the final teardown retirement made to reject with
      // `unrelated teardown failure` failed this test after 1 run, on the empty
      // command list, with `Error: teardown refused: Error: teardown retire refused
      // during teardown with: Error: unrelated teardown failure`.
      if (world.verifiedRefusals.has(refusal)) continue;
      if (world.liveDisposalHangs.yes && isDisposalExpiry(refusal)) {
        world.verifiedRefusals.add(refusal);
        continue;
      }
      unreported.push(new Error(`${label} refused during teardown with: ${String(refusal)}`));
    }
  }
  await world.scheduler.waitIdle();
  return unreported;
}

/**
 * The browser-wide Mermaid lane's handle, run against a reference model.
 *
 * The record this executes is section 3 of
 * `docs/superpowers/plans/2026-09-21-batch-6/050-7-f2-delivery-call-sites.md`.
 * The slot, the installer, the preferences module and `lib/remembered.ts` are the
 * production ones; only the browser stores, the instant a disposal completes and
 * the instant a notification is delivered are this file's — and the last two are
 * the scheduler's to order.
 */
describe('the Mermaid lane’s handle, against a reference model', () => {
  it('answers and stores exactly what the model says, under generated interleavings', async () => {
    // The counterexamples this file's own packet records were observed under the
    // frozen lockfile's fast-check; a different version reorders generation.
    expect(fc.__version, 'the pinned counterexamples were recorded under 4.9.0').toBe('4.9.0');

    await fc.assert(
      fc.asyncProperty(fc.scheduler(), commandsArb, async (scheduler, commands) => {
        const slot = createLifetimeSlot<ApplicationServices>(DISPOSAL_BUDGET_MS);
        const world: HandleWorld = {
          slot,
          stores: {
            A: fakeBrowserStorage(),
            B: fakeBrowserStorage(),
            denied: writeRefusingBrowserStorage(WRITE_DENIED),
          },
          handle: remembered(MERMAID_SECTION_MODE_KEY, isSectionMode, slot),
          issued: [],
          gate: createDisposalGate(),
          scheduler,
          verifiedRefusals: new Set<unknown>(),
          liveDisposalHangs: { yes: false },
        };

        let failure: Error | null = null;
        try {
          await fc.asyncModelRun<HandleModel, HandleWorld, false, HandleModel>(
            () => ({
              model: {
                live: null,
                liveDisposal: 'settles',
                terminal: false,
                published: 0,
                bytes: new Map<StoreName, string>(),
              },
              real: world,
            }),
            commands,
          );
        } catch (caught) {
          // Kept as an `Error` so it can be rethrown or carried as a `cause`
          // without a cast; anything else is still reported rather than dropped.
          failure = caught instanceof Error ? caught : new Error(String(caught));
        }
        // Teardown runs whatever happened, and its own refusals are aggregated with
        // an assertion failure so neither hides the other.
        const unreported = await giveEverythingBack(world);
        if (unreported.length === 0) {
          if (failure !== null) throw failure;
          return;
        }
        const refusals = unreported.map((refusal) => String(refusal)).join(' | ');
        if (failure === null) throw new Error(`teardown refused: ${refusals}`);
        throw new Error(`the property failed and its teardown refused: ${refusals}`, {
          cause: failure,
        });
      }),
      { seed: 20260924, numRuns: 300 },
    );

    for (const kind of COMMAND_KINDS) {
      expect(ran[kind] ?? 0, `the pinned run never executed ${kind}`).toBeGreaterThan(0);
    }
    expect(reached.droppedRefusal, 'the pinned run never dropped a refused value').toBeGreaterThan(
      0,
    );
    expect(
      reached.deniedWrite,
      'the pinned run never wrote into a store that refuses writes',
    ).toBeGreaterThan(0);
    expect(
      reached.expiredDisposal,
      'the pinned run never let a disposal outrun its budget',
    ).toBeGreaterThan(0);
    expect(
      reached.accessWithNothingLive,
      'the pinned run never accessed the handle while nothing was live',
    ).toBeGreaterThan(0);
    expect(
      reached.accessAfterReplacement,
      'the pinned run never accessed the handle after a replacement',
    ).toBeGreaterThan(0);
  }, 300_000);
});
