import { act, cleanup, render } from '@testing-library/react';
import { DiBag, DiBagCloseCancelledError } from 'di-bag';
import fc from 'fast-check';
import { type ReactNode, useLayoutEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import type { BrowserStorage } from '../modules/preferences/contract';
import {
  fakeBrowserStorage,
  type HeldByFake,
  writeRefusingBrowserStorage,
} from '../modules/preferences/fake-browser-storage';
import {
  type ApplicationServices,
  installApplicationRuntime,
} from '../runtime/application-runtime';
import { ApplicationServicesProvider } from '../runtime/application-services-context';
import { createLifetimeSlot, type LifetimeSlot } from '../runtime/lifetime-slot';
import { isThemeChoice, type Theme, THEME_KEY, type ThemeChoice, useTheme } from './theme';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

/**
 * The bounded wait the generated slot gives a disposal, in milliseconds.
 *
 * Small on purpose: the `'never'` disposal mode below has to actually expire it,
 * and it can, because every controlled wait this file adds happens **before**
 * `RetirableRuntime.close` forwards `options` to DI Bag — the budget only ever
 * covers the bag's own close.
 */
const DISPOSAL_BUDGET_MS = 5;

/** The one storage failure the refusing store raises, retained so identity can be asserted. */
const WRITE_DENIED = new Error('write denied');

/** The three stores a generated runtime can be installed over. */
type StoreName = 'A' | 'B' | 'denied';

const STORE_NAMES: readonly StoreName[] = ['A', 'B', 'denied'];

/** How a published runtime's own disposal behaves when something withdraws it. */
type Disposal = 'settles' | 'never';

/**
 * How many times each command actually ran, across the **whole pinned run**.
 *
 * A generated property whose commands are all skipped by their own `check`
 * preconditions proves nothing, so every counter is asserted non-zero once
 * `fc.assert` returns — the same guard `application-bootstrap.model.test.tsx` and
 * `lifetime-slot.model.test.ts` both carry.
 */
const ran: Record<string, number> = {};

/** Records that one command kind really executed. */
function note(kind: string): void {
  ran[kind] = (ran[kind] ?? 0) + 1;
}

/** Every command kind, so the coverage assertion below cannot silently miss one. */
const COMMAND_KINDS: readonly string[] = [
  'choose',
  'retire',
  'retireHoldingDisposal',
  'replace',
  'chooseFromNotification',
  'chooseWhileAcquiring',
  'retainChooser',
  'useRetainedChooser',
  'replaceThenRetireFromLayoutEffect',
];

/** Counts, additionally, the interleavings the invariants are actually about. */
const reached = {
  supersededChooser: 0,
  deniedWrite: 0,
  withdrawnFromLayoutEffect: 0,
  expiredDisposal: 0,
};

/**
 * What this hook's state machine is, as a reference implementation that shares
 * nothing with the production stores.
 *
 * `bytes` is the model's **own** record of what each store should hold. It is
 * never read back out of the fakes, which is what makes the storage assertion an
 * oracle rather than a tautology.
 *
 * `storeIdentity` models the **reference** `chooseTheme`'s own superseded guard
 * compares: a fresh number for every publication, and `null` while the hook holds
 * no store. `null` therefore equals `null`, which is the behaviour a first draft
 * of this model got wrong — it counted transitions instead, and so predicted that
 * a chooser retained while withdrawn was superseded once the hook was withdrawn a
 * second time. The implementation compares object identity, and `null === null`.
 */
interface ThemeModel {
  liveStore: StoreName | null;
  /** How the currently published runtime will dispose, once something withdraws it. */
  liveDisposal: Disposal;
  storeIdentity: number | null;
  /** How many store identities have been handed out, so the next one is fresh. */
  identities: number;
  /** True once a disposal outran its budget: the slot is fatal and refuses everything after. */
  terminal: boolean;
  choice: ThemeChoice;
  persists: boolean;
  bytes: Partial<Record<StoreName, string>>;
  /** The store identity a chooser retained by {@link RetainChooser} closed over. */
  retained: { readonly identity: number | null } | null;
}

/** A disposal this run can hold open, independently of the scheduler. */
interface DisposalGate {
  armed: boolean;
  /** Awaited by every close; already resolved unless a command armed the gate. */
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

/** What one generated run drives: one page, one slot, three stores. */
interface ThemeWorld {
  readonly slot: LifetimeSlot<ApplicationServices>;
  readonly stores: Record<StoreName, BrowserStorage & HeldByFake>;
  readonly captured: { theme: Theme | null };
  /** Set to make the observing component retire from its next layout effect. */
  readonly armed: { layoutRetire: boolean };
  /** Every transition this run issued, with what it ended up doing. */
  readonly issued: { readonly label: string; readonly outcome: Promise<unknown> }[];
  /** A chooser retained from an earlier render, once {@link RetainChooser} ran. */
  retained: ((choice: ThemeChoice) => void) | null;
  /** What a chooser called from inside a slot notification threw, if anything. */
  readonly notificationRefusal: { thrown: unknown };
  readonly gate: DisposalGate;
  readonly scheduler: fc.Scheduler;
  /**
   * The refusals this run has already **verified**, by identity.
   *
   * A transition that refuses is accounted for exactly once, by the command that
   * issued it, and only after {@link assertRefusal} has checked that it is DI
   * Bag's own bounded-close cancellation. Teardown suppresses a rejection only
   * when it is one of these very objects — never because some flag said a
   * refusal was plausible. `lifetime-slot.ts` rethrows the refusal it recorded to
   * every later transition, so identity is exactly the right key: the fatal
   * slot's own later refusals *are* the object already verified here.
   */
  readonly verifiedRefusals: Set<unknown>;
  /**
   * Whether the runtime currently published will outrun its disposal budget, so
   * teardown's own final retirement is expected to expire.
   *
   * Recorded by {@link assertAgrees} because teardown runs outside
   * `fc.asyncModelRun` and cannot see the model. It excuses **only** a refusal
   * that {@link isDisposalExpiry} recognises, and every other cleanup rejection is
   * reported whatever this says.
   */
  readonly liveDisposalHangs: { yes: boolean };
  unmount: () => void;
}

/**
 * The page under test: the hook, plus the layout effect that can withdraw the slot
 * before the hook's own passive resync effect for the same commit runs.
 *
 * The layout effect lives in **this** component rather than in a sibling, and that
 * is a measured decision, not a shortcut: React runs every layout effect of a
 * commit before every passive effect of that commit, so the ordering is the same
 * either way — but a sibling that renders no state of its own never re-renders
 * when the slot publishes (`useSyncExternalStore` re-renders only the component
 * that reads it), so its layout effect never ran on the publishing commit at all.
 * A first draft did exactly that and the armed retirement was a no-op on every run.
 */
function ObservesTheme({ world }: { world: ThemeWorld }): null {
  world.captured.theme = useTheme();
  useLayoutEffect(() => {
    if (!world.armed.layoutRetire) return;
    if (world.slot.snapshot().status !== 'live') return;
    world.armed.layoutRetire = false;
    reached.withdrawnFromLayoutEffect += 1;
    world.issued.push({ label: 'retire from layout effect', outcome: world.slot.retire() });
  });
  return null;
}

/**
 * The slot the provider is given: the real one, with **notification delivery**
 * handed to the scheduler.
 *
 * `createLifetimeSlot` already defers its notification to a microtask; that only
 * says notification is not synchronous, not *when* it lands relative to a disposal
 * completing. Routing each listener call through `scheduler.schedule` makes that
 * order fast-check's to choose, so a run can deliver the re-render before the old
 * runtime has finished letting go, or after it. Everything else is delegated
 * unchanged — this proxy publishes nothing and decides nothing.
 */
function slotWithScheduledNotification(
  slot: LifetimeSlot<ApplicationServices>,
  scheduler: fc.Scheduler,
): LifetimeSlot<ApplicationServices> {
  return {
    subscribe: (listener) =>
      slot.subscribe(() => {
        void scheduler.schedule(Promise.resolve(), 'deliver the slot notification').then(listener);
      }),
    snapshot: () => slot.snapshot(),
    retire: () => slot.retire(),
    replace: (acquire) => slot.replace(acquire),
    lateCleanup: () => slot.lateCleanup(),
    lateOutcome: () => slot.lateOutcome(),
  };
}

function Page({ world }: { world: ThemeWorld }): ReactNode {
  return (
    <ApplicationServicesProvider slot={slotWithScheduledNotification(world.slot, world.scheduler)}>
      <ObservesTheme world={world} />
    </ApplicationServicesProvider>
  );
}

/**
 * The runtime the generated `replace` commands publish: the **production**
 * installer over one of this run's stores, with the same liveness predicate
 * `acquireApplicationRuntime` wires in production.
 *
 * Its bounded close waits on {@link DisposalGate} first — so a command can assert
 * the rendered state while the runtime is still letting go — and then on a
 * scheduled task, so the instant it completes is ordered against every pending
 * notification. `disposal: 'never'` adds a real DI Bag disposer that never
 * settles, which makes the bag's own bounded close raise
 * `DiBagCloseCancelledError` once {@link DISPOSAL_BUDGET_MS} has passed: a
 * controlled timeout, out of DI Bag's own budget rather than a promise this file
 * races itself.
 */
function acquireOver(world: ThemeWorld, target: StoreName, disposal: Disposal) {
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

/**
 * What the model says the hook must be showing, and what each store must hold.
 *
 * Also records, for teardown, whether the runtime currently published will outrun
 * its disposal budget — see {@link ThemeWorld.liveDisposalHangs}.
 */
function assertAgrees(model: ThemeModel, world: ThemeWorld): void {
  world.liveDisposalHangs.yes = model.liveStore !== null && model.liveDisposal === 'never';
  const theme = world.captured.theme;
  expect(theme, 'the page rendered no theme at all').not.toBeNull();
  if (theme === null) return;
  expect(theme.choice, 'displayed choice').toBe(model.choice);
  expect(theme.persists, 'persists').toBe(model.persists);
  for (const name of STORE_NAMES) {
    expect(world.stores[name].held()[THEME_KEY], `stored bytes in ${name}`).toBe(model.bytes[name]);
  }
  expect(
    world.notificationRefusal.thrown,
    'a chooser called from inside a slot notification threw',
  ).toBeNull();
}

/** Delivers every notification the scheduler is still holding, inside React's `act`. */
async function deliverNotifications(world: ThemeWorld): Promise<void> {
  await world.scheduler.waitIdle();
}

/**
 * Awaits one issued transition and says whether it refused.
 *
 * No `catch` that discards: the refusal is returned so the caller can assert
 * whether one was expected at all. A transition that rejects where the model says
 * it should not is a finding, and the caller reports it.
 */
async function settle(
  world: ThemeWorld,
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
  await deliverNotifications(world);
  return refusal;
}

/**
 * What withdrawing the currently published runtime does to the model, and whether
 * its transition was expected to refuse.
 *
 * A runtime whose disposal never settles outruns the slot's budget, which makes the
 * slot **fatal and terminal**: the transition rejects, nothing is published again,
 * and every later transition refuses with the same recorded refusal. `fatal` maps
 * to `withdrawn` for a consumer, so the rendered state is the documented default
 * either way.
 */
function expectsRefusal(model: ThemeModel): boolean {
  return model.terminal || (model.liveStore !== null && model.liveDisposal === 'never');
}

/** What the model says the store this hook currently reads should now hold. */
function applyLiveWrite(model: ThemeModel, value: ThemeChoice): void {
  if (model.liveStore === null) {
    model.choice = value;
    model.persists = false;
    return;
  }
  if (model.liveStore === 'denied') {
    // The write raises an ordinary storage failure; invariant 3 says nothing
    // moves and the failure propagates by identity. The caller asserts the throw.
    return;
  }
  model.bytes[model.liveStore] = JSON.stringify(value);
  model.choice = value;
  model.persists = true;
}

/** What the model says the hook shows once the store `target` is published. */
function applyPublished(model: ThemeModel, target: StoreName, disposal: Disposal): void {
  model.liveStore = target;
  model.liveDisposal = disposal;
  model.identities += 1;
  model.storeIdentity = model.identities;
  const stored = model.bytes[target];
  const parsed: unknown = stored === undefined ? undefined : JSON.parse(stored);
  model.choice = isThemeChoice(parsed) ? parsed : 'system';
  model.persists = true;
}

/** What the model says the hook shows once nothing is published any more. */
function applyWithdrawn(model: ThemeModel): void {
  model.liveStore = null;
  model.liveDisposal = 'settles';
  model.storeIdentity = null;
  model.choice = 'system';
  model.persists = false;
}

type ThemeCommand = fc.AsyncCommand<ThemeModel, ThemeWorld>;

/**
 * Whether a refusal is the slot's own **budget expiry** and nothing else.
 *
 * `lifetime-slot.ts`'s `disposeWithdrawn` awaits `close({ timeoutMs })` and hands
 * whatever it threw to `refuse`, and its `lateCleanupOf` reads
 * `DiBagCloseCancelledError.cleanupPromise` — so a genuine expiry is that class,
 * with `reason: 'timeout'` and the still-running cleanup promise the slot keeps
 * watching. Anything else that came out of a disposal is a defect in the graph,
 * not a timeout, and must not be counted as one.
 */
function isDisposalExpiry(refusal: unknown): refusal is DiBagCloseCancelledError {
  return (
    // Proof: on 2026-09-23, substituting an ordinary cleanup Error for the
    // expiry failed at run 9: the disposal did not expire as the budget does.
    refusal instanceof DiBagCloseCancelledError &&
    refusal.reason === 'timeout' &&
    refusal.cleanupPromise instanceof Promise
  );
}

/**
 * Asserts a transition refused exactly when the model says it had to, **and for
 * the reason the model says**, and records the refusal so teardown can tell an
 * accounted-for rejection from a new one.
 *
 * The check on the refusal's own class is the whole point: a first draft counted
 * any non-null rejection as an expiry, so substituting an ordinary error for the
 * hanging disposer left all 300 runs green.
 */
function assertRefusal(model: ThemeModel, world: ThemeWorld, refusal: unknown, what: string): void {
  if (!expectsRefusal(model)) {
    expect(refusal, `${what}: a transition refused unexpectedly`).toBeNull();
    return;
  }
  expect(refusal, `${what}: an expiring or terminal transition did not refuse`).not.toBeNull();
  if (model.terminal) {
    // A terminal slot rethrows the very refusal it recorded, so this must be an
    // object some earlier command already verified. A new failure here is a new
    // failure, not the recorded one.
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

/** A chooser call through the hook's own current return value. */
class Choose implements ThemeCommand {
  constructor(readonly value: ThemeChoice) {}
  check(): boolean {
    return true;
  }
  async run(model: ThemeModel, world: ThemeWorld): Promise<void> {
    note('choose');
    const chooseTheme = world.captured.theme?.chooseTheme;
    expect(chooseTheme, 'the page rendered no chooser').toBeDefined();
    if (chooseTheme === undefined) return;
    await callChooser(model, world, chooseTheme, this.value);
    applyLiveWrite(model, this.value);
    assertAgrees(model, world);
  }
  toString(): string {
    return `choose(${this.value})`;
  }
}

/**
 * Calls a chooser and asserts the one failure it is **not** allowed to hide.
 *
 * Identity, not message text: what has to reach the caller is the very object the
 * store raised. A message comparison would pass for a refusal some layer between
 * rewrapped, which is exactly what invariant 3 forbids.
 */
async function callChooser(
  model: ThemeModel,
  world: ThemeWorld,
  chooseTheme: (choice: ThemeChoice) => void,
  value: ThemeChoice,
): Promise<void> {
  if (model.liveStore === 'denied' && !model.terminal) {
    reached.deniedWrite += 1;
    let refusal: unknown = null;
    try {
      act(() => {
        chooseTheme(value);
      });
    } catch (caught) {
      refusal = caught;
    }
    expect(refusal, 'an ordinary storage failure did not propagate out of the chooser').toBe(
      WRITE_DENIED,
    );
    return;
  }
  await act(async () => {
    chooseTheme(value);
    await Promise.resolve();
  });
  await deliverNotifications(world);
}

/** Retirement, ordinary: the scheduler orders its notification against its disposal. */
class Retire implements ThemeCommand {
  check(model: ThemeModel): boolean {
    return model.liveStore !== null && !model.terminal;
  }
  async run(model: ThemeModel, world: ThemeWorld): Promise<void> {
    note('retire');
    const expiring = expectsRefusal(model);
    const refusal = await settle(world, 'retire', world.slot.retire());
    assertRefusal(model, world, refusal, 'retire');
    if (expiring) model.terminal = true;
    applyWithdrawn(model);
    assertAgrees(model, world);
  }
  toString(): string {
    return 'retire';
  }
}

/**
 * Retirement whose **disposal is held open** while the withdrawn state is read.
 *
 * Notification and disposal are separate events and only one of them is what this
 * hook follows. The gate blocks the close before it ever reaches DI Bag, so the
 * slot's own budget is not spent waiting here.
 */
class RetireHoldingDisposal implements ThemeCommand {
  check(model: ThemeModel): boolean {
    return model.liveStore !== null && model.liveDisposal === 'settles' && !model.terminal;
  }
  async run(model: ThemeModel, world: ThemeWorld): Promise<void> {
    note('retireHoldingDisposal');
    world.gate.armed = true;
    const outcome = world.slot.retire();
    world.issued.push({ label: 'retire holding disposal', outcome });
    // Deliver the re-render while the disposal is still blocked on the gate.
    await deliverNotifications(world);
    applyWithdrawn(model);
    assertAgrees(model, world);
    world.gate.release();
    let refusal: unknown = null;
    try {
      await world.scheduler.waitFor(outcome);
    } catch (caught) {
      refusal = caught;
    }
    await deliverNotifications(world);
    expect(refusal, 'a held-open retirement refused once released').toBeNull();
    assertAgrees(model, world);
  }
  toString(): string {
    return 'retireHoldingDisposal';
  }
}

/** Replacement by a runtime over `target`, disposing the named way when withdrawn. */
class Replace implements ThemeCommand {
  constructor(
    readonly target: StoreName,
    readonly disposal: Disposal,
  ) {}
  check(model: ThemeModel): boolean {
    return !model.terminal;
  }
  async run(model: ThemeModel, world: ThemeWorld): Promise<void> {
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
    assertAgrees(model, world);
  }
  toString(): string {
    return `replace(${this.target}, ${this.disposal})`;
  }
}

/**
 * A chooser call issued from **inside** a slot notification — re-entrancy, the
 * shape lesson 16 names: the callback runs while the slot has already withdrawn
 * publication synchronously but React has not yet re-rendered this hook.
 */
class ChooseFromNotification implements ThemeCommand {
  constructor(readonly value: ThemeChoice) {}
  check(model: ThemeModel): boolean {
    return model.liveStore !== null && model.liveDisposal === 'settles' && !model.terminal;
  }
  async run(model: ThemeModel, world: ThemeWorld): Promise<void> {
    note('chooseFromNotification');
    let armed = true;
    const unsubscribe = world.slot.subscribe(() => {
      if (!armed) return;
      armed = false;
      try {
        world.captured.theme?.chooseTheme(this.value);
      } catch (refusal) {
        world.notificationRefusal.thrown = refusal;
      }
    });
    try {
      const refusal = await settle(world, 'retire from notification', world.slot.retire());
      assertRefusal(model, world, refusal, 'retire from notification');
      applyWithdrawn(model);
      assertAgrees(model, world);
    } finally {
      unsubscribe();
    }
  }
  toString(): string {
    return `chooseFromNotification(${this.value})`;
  }
}

/**
 * A chooser call while a transition has only **partially acquired** its graph: the
 * factory has built the new runtime and not yet returned it, so the slot is
 * mid-transition and the chooser's own closured store is the withdrawn one.
 */
class ChooseWhileAcquiring implements ThemeCommand {
  constructor(
    readonly target: StoreName,
    readonly value: ThemeChoice,
  ) {}
  check(model: ThemeModel): boolean {
    return !model.terminal && model.liveDisposal === 'settles';
  }
  async run(model: ThemeModel, world: ThemeWorld): Promise<void> {
    note('chooseWhileAcquiring');
    const acquire = acquireOver(world, this.target, 'settles');
    const refusal = await settle(
      world,
      `chooseWhileAcquiring(${this.target})`,
      world.slot.replace(() => {
        const acquired = acquire();
        try {
          world.captured.theme?.chooseTheme(this.value);
        } catch (caught) {
          world.notificationRefusal.thrown = caught;
        }
        return acquired;
      }),
    );
    assertRefusal(model, world, refusal, `chooseWhileAcquiring(${this.target})`);
    applyPublished(model, this.target, 'settles');
    assertAgrees(model, world);
  }
  toString(): string {
    return `chooseWhileAcquiring(${this.target}, ${this.value})`;
  }
}

/** Keeps the chooser this render offers, to call again after a later transition. */
class RetainChooser implements ThemeCommand {
  check(): boolean {
    return true;
  }
  async run(model: ThemeModel, world: ThemeWorld): Promise<void> {
    note('retainChooser');
    const chooseTheme = world.captured.theme?.chooseTheme;
    expect(chooseTheme, 'the page rendered no chooser to retain').toBeDefined();
    if (chooseTheme === undefined) return;
    world.retained = chooseTheme;
    model.retained = { identity: model.storeIdentity };
    await Promise.resolve();
    assertAgrees(model, world);
  }
  toString(): string {
    return 'retainChooser';
  }
}

/**
 * The retained chooser, called now. Superseded once the hook has moved to a
 * different store, and then a documented no-op — invariant 2.
 */
class UseRetainedChooser implements ThemeCommand {
  constructor(readonly value: ThemeChoice) {}
  check(model: ThemeModel): boolean {
    return model.retained !== null;
  }
  async run(model: ThemeModel, world: ThemeWorld): Promise<void> {
    note('useRetainedChooser');
    const retained = world.retained;
    expect(retained, 'no chooser was retained').not.toBeNull();
    if (retained === null) return;
    const superseded = model.retained?.identity !== model.storeIdentity;
    if (superseded) {
      reached.supersededChooser += 1;
      await act(async () => {
        retained(this.value);
        await Promise.resolve();
      });
      await deliverNotifications(world);
    } else {
      await callChooser(model, world, retained, this.value);
      applyLiveWrite(model, this.value);
    }
    assertAgrees(model, world);
  }
  toString(): string {
    return `useRetainedChooser(${this.value})`;
  }
}

/**
 * A replacement whose publishing commit is itself withdrawn again by the observing
 * component's layout effect — the resync effect's own access boundary, reached for
 * real, because a layout effect commits before any passive effect of the same
 * commit.
 */
class ReplaceThenRetireFromLayoutEffect implements ThemeCommand {
  constructor(readonly target: StoreName) {}
  check(model: ThemeModel): boolean {
    return !model.terminal && model.liveDisposal === 'settles';
  }
  async run(model: ThemeModel, world: ThemeWorld): Promise<void> {
    note('replaceThenRetireFromLayoutEffect');
    world.armed.layoutRetire = true;
    const refusal = await settle(
      world,
      `replaceThenRetireFromLayoutEffect(${this.target})`,
      world.slot.replace(acquireOver(world, this.target, 'settles')),
    );
    assertRefusal(model, world, refusal, `replaceThenRetireFromLayoutEffect(${this.target})`);
    // The layout effect's own retirement was pushed into `issued`; drain it and
    // its notification before reading the invariants.
    const drained = Promise.all(world.issued.map(({ outcome }) => outcome));
    let cleanupRefusal: unknown = null;
    try {
      await world.scheduler.waitFor(drained);
    } catch (caught) {
      cleanupRefusal = caught;
    }
    await deliverNotifications(world);
    expect(cleanupRefusal, "a layout effect's own retirement refused").toBeNull();
    world.armed.layoutRetire = false;
    applyPublished(model, this.target, 'settles');
    applyWithdrawn(model);
    assertAgrees(model, world);
  }
  toString(): string {
    return `replaceThenRetireFromLayoutEffect(${this.target})`;
  }
}

const choiceArb = fc.constantFrom<ThemeChoice>('system', 'light', 'dark');
const storeArb = fc.constantFrom<StoreName>('A', 'B', 'denied');
const disposalArb = fc.constantFrom<Disposal>('settles', 'never');

const commandsArb = fc.commands<ThemeModel, ThemeWorld, false>(
  [
    choiceArb.map((value) => new Choose(value)),
    fc.constant(new Retire()),
    fc.constant(new RetireHoldingDisposal()),
    fc.tuple(storeArb, disposalArb).map(([target, disposal]) => new Replace(target, disposal)),
    choiceArb.map((value) => new ChooseFromNotification(value)),
    fc.tuple(storeArb, choiceArb).map(([target, value]) => new ChooseWhileAcquiring(target, value)),
    fc.constant(new RetainChooser()),
    choiceArb.map((value) => new UseRetainedChooser(value)),
    storeArb.map((target) => new ReplaceThenRetireFromLayoutEffect(target)),
  ],
  { maxCommands: 12 },
);

/**
 * Gives every runtime and every notification back, and **reports** what refused.
 *
 * Two, and only two, kinds of rejection are suppressed: one this run already
 * verified by identity ({@link ThemeWorld.verifiedRefusals}), and the budget
 * expiry of a runtime the commands knowingly left hanging — recognised by
 * {@link isDisposalExpiry}, never by a flag on its own. Everything else is
 * returned and thrown by the caller, because a cleanup failure nobody reported is
 * a failure of this test, exactly as R5 says.
 */
async function giveEverythingBack(world: ThemeWorld): Promise<Error[]> {
  const unreported: Error[] = [];
  world.unmount();
  world.gate.release();
  world.issued.push({ label: 'teardown retire', outcome: world.slot.retire() });
  for (const { label, outcome } of [...world.issued]) {
    try {
      await world.scheduler.waitFor(outcome);
    } catch (refusal) {
      // Proof: on 2026-09-23, injecting an unrelated final-retirement failure
      // failed at run 1: teardown reported the unverified refusal.
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

afterEach(() => {
  cleanup();
});

/**
 * The theme hook's state machine, run against a reference model.
 *
 * The record this executes is section 3 of
 * `docs/superpowers/plans/2026-09-21-batch-6/050-7-f1-theme-hook-model.md`, and
 * `useTheme`'s own JSDoc names the same four invariants. The slot, the installer
 * and the preferences module are the production ones; only the browser store, the
 * instant a disposal completes and the instant a notification is delivered are
 * this file's — and the last two are the scheduler's to order.
 */
describe("the theme hook's state machine, against a reference model", () => {
  itDom(
    'shows and persists exactly what the model says, under generated interleavings',
    async () => {
      // The counterexamples this file's own packet records were observed under the
      // frozen lockfile's fast-check. A different version reorders generation, so a
      // replay against another one is not the run those counterexamples name.
      expect(fc.__version, 'the pinned counterexamples were recorded under 4.9.0').toBe('4.9.0');

      await fc.assert(
        fc.asyncProperty(
          fc.scheduler({
            act: async (task) => {
              await act(task);
            },
          }),
          commandsArb,
          async (scheduler, commands) => {
            const stores: Record<StoreName, BrowserStorage & HeldByFake> = {
              A: fakeBrowserStorage(),
              B: fakeBrowserStorage(),
              denied: writeRefusingBrowserStorage(WRITE_DENIED),
            };
            const world: ThemeWorld = {
              slot: createLifetimeSlot<ApplicationServices>(DISPOSAL_BUDGET_MS),
              stores,
              captured: { theme: null },
              armed: { layoutRetire: false },
              issued: [],
              retained: null,
              notificationRefusal: { thrown: null },
              gate: createDisposalGate(),
              scheduler,
              verifiedRefusals: new Set<unknown>(),
              liveDisposalHangs: { yes: false },
              unmount: () => undefined,
            };
            const held = render(<Page world={world} />);
            world.unmount = () => {
              held.unmount();
            };

            let failure: Error | null = null;
            try {
              await fc.asyncModelRun<ThemeModel, ThemeWorld, false, ThemeModel>(
                () => ({
                  model: {
                    liveStore: null,
                    liveDisposal: 'settles',
                    storeIdentity: null,
                    identities: 0,
                    terminal: false,
                    choice: 'system',
                    persists: false,
                    bytes: {},
                    retained: null,
                  },
                  real: world,
                }),
                commands,
              );
            } catch (caught) {
              // Kept as an `Error` so it can be rethrown or carried as a `cause`
              // without a cast: `fc.asyncModelRun` propagates the assertion Vitest
              // threw, and anything that is not an `Error` is still reported rather
              // than dropped.
              failure = caught instanceof Error ? caught : new Error(String(caught));
            }
            // Teardown runs whatever happened, and its own refusals are reported
            // rather than discarded — aggregated with an assertion failure so
            // neither hides the other.
            const unreported = await giveEverythingBack(world);
            if (unreported.length === 0) {
              // Nothing to aggregate: rethrow the property's own failure exactly as
              // fast-check threw it, so shrinking reads the real assertion.
              if (failure !== null) throw failure;
              return;
            }
            const refusals = unreported.map((refusal) => String(refusal)).join(' | ');
            if (failure === null) throw new Error(`teardown refused: ${refusals}`);
            // Both failed. Neither may hide the other, so the assertion travels as
            // this error's `cause` and the cleanup refusals as its message.
            throw new Error(`the property failed and its teardown refused: ${refusals}`, {
              cause: failure,
            });
          },
        ),
        { seed: 20260925, numRuns: 300 },
      );

      for (const kind of COMMAND_KINDS) {
        expect(ran[kind] ?? 0, `the pinned run never executed ${kind}`).toBeGreaterThan(0);
      }
      expect(
        reached.supersededChooser,
        'the pinned run never called a superseded chooser',
      ).toBeGreaterThan(0);
      expect(
        reached.deniedWrite,
        'the pinned run never wrote into a store that refuses writes',
      ).toBeGreaterThan(0);
      expect(
        reached.withdrawnFromLayoutEffect,
        "the pinned run never withdrew the slot from a layout effect before the hook's own resync effect",
      ).toBeGreaterThan(0);
      expect(
        reached.expiredDisposal,
        'the pinned run never let a disposal outrun its budget',
      ).toBeGreaterThan(0);
    },
    300_000,
  );
});
