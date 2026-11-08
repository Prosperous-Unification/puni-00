import { rejects } from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

import { expect, test } from 'bun:test';

type ReadyEntry = object;
type Owner = object;
interface ObservedOwnership {
  state: string;
  outcome: { kind: string; cause?: unknown; value?: unknown } | undefined;
  ready: Set<{ phase: string; failure: unknown }>;
  diagnosticFailure: unknown;
  preparations: Set<{
    phase: string;
    originals: Set<{ state: string; failure: unknown }>;
    composition: { original: Promise<unknown> | undefined };
  }>;
}
interface ReadyHarness {
  withDependencyOwner: <T>(
    plan: unknown,
    action: (owner: Owner) => Promise<T>,
    directory: string,
  ) => Promise<T>;
  assertDependencyOwner: (owner: Owner, layout: unknown) => Promise<void>;
  enrollReadyCleanup: (owner: Owner, close: () => void) => ReadyEntry;
  transferReadyCleanup: (owner: Owner, entry: ReadyEntry) => void;
  releaseReadyCleanup: (owner: Owner, entry: ReadyEntry) => void;
  enrollDependencyPreparation: (
    owner: Owner,
    binding: { layouts: readonly unknown[]; deadline: number; purpose: 'initial-handoff' },
  ) => object;
  bindPreparationComposition: (preparation: object, original: Promise<unknown>) => Promise<unknown>;
  retainPreparationOriginal: (
    preparation: object,
    acquisition: {
      kind: 'graph';
      role: 'initial-evidence';
      graph: { closeFiles: () => void };
    },
  ) => object;
  inspect: (owner: Owner) => ObservedOwnership | undefined;
}

/** Executes the actual owner lifecycle with inert lock/timer/IO ports; no native resource is acquired. */
async function harness(diagnosticFailure?: Error, readBarrier?: Promise<void>) {
  const source = await readFile(new URL('./edge-ownership.ts', import.meta.url), 'utf8');
  const begin = source.indexOf('const identity: unique symbol');
  const end = source.indexOf('/** Durable per-boundary intent', begin);
  if (begin < 0 || end < 0) throw new Error('actual owner lifecycle source boundary absent');
  const body = new Bun.Transpiler({ loader: 'ts', target: 'bun' }).transformSync(
    source.slice(begin, end).replaceAll('export ', '') +
      '\nreturn {withDependencyOwner,assertDependencyOwner,enrollReadyCleanup,transferReadyCleanup,releaseReadyCleanup,enrollDependencyPreparation,bindPreparationComposition,retainPreparationOriginal,inspect:owner=>owners.get(owner)};',
  );
  const held = new Set<string>();
  const events: string[] = [];
  const records = new Map<string, string>();
  const timers: { callback: () => unknown; cleared: boolean }[] = [];
  const diagnostics: string[] = [];
  const reads = { count: 0 };
  let observeHold: (() => void) | undefined;
  const holdObserved = new Promise<void>((observe) => {
    observeHold = observe;
  });
  let descriptor = 0;
  const lock = async <T>(path: string, action: (descriptor: number) => Promise<T>): Promise<T> => {
    held.add(path);
    events.push(`lock:${path}`);
    try {
      return await action(++descriptor);
    } finally {
      events.push(`unlock:${path}`);
      held.delete(path);
    }
  };
  const ports = {
    isAbsolute,
    join,
    resolve,
    realpath: (path: string) => Promise.resolve(path),
    lstat: () => Promise.resolve({ isFile: () => true, isDirectory: () => true }),
    readdir: () => Promise.resolve([]),
    randomUUID: () => 'actual-model-attempt',
    publishRecord: (path: string, contents: string) => {
      records.set(path, contents);
      return Promise.resolve();
    },
    readRecord: async (path: string) => {
      reads.count++;
      if (readBarrier !== undefined) await readBarrier;
      const contents = records.get(path);
      if (contents === undefined) throw new Error('inert record missing');
      return contents;
    },
    assertInheritedLock: (path: string) => {
      if (!held.has(path)) throw new Error('original lock not retained');
    },
    withCanonicalLock: lock,
    withExistingCanonicalLock: lock,
    withOrdinaryControllerAdmission: async (
      _directory: string,
      _mode: string,
      action: (recheck: () => Promise<void>) => Promise<unknown>,
    ) => action(() => Promise.resolve()),
    edgeStateDirectory: () => '/ready-owner',
    setInterval: (callback: () => unknown) => {
      const timer = { callback, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearInterval: (timer: (typeof timers)[number]) => {
      if (timer.cleared) throw new Error('inert keeper cleared twice');
      timer.cleared = true;
    },
    writeFileSync: (_fd: number, bytes: string | Uint8Array) => {
      diagnostics.push(Buffer.from(bytes).toString());
      if (observeHold === undefined) throw new Error('inert HOLD observer missing');
      observeHold();
      if (diagnosticFailure !== undefined) throw diagnosticFailure;
      return;
    },
    Buffer,
    performance,
  };
  // Boundary: the exact current production source cut runs only against these finite inert lexical ports.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- Actual lifecycle code with fixture-owned inert IO only.
  const construct = new Function(...Object.keys(ports), body) as (
    ...values: unknown[]
  ) => ReadyHarness;
  const owner = construct(...Object.values(ports));
  const root = '/ready-owner';
  const layout = { env: 'prod', root, stateDir: root };
  const plan = { sha: 'a'.repeat(40), layouts: [layout] };
  return { owner, root, layout, plan, held, events, timers, diagnostics, reads, holdObserved };
}

for (const outcome of ['value', 'failure', 'undefined'] as const)
  test(`ready cleanup model closes before unlock and preserves callback ${outcome}`, async () => {
    const fixture = await harness();
    const primary = outcome === 'undefined' ? undefined : new Error('PRIVATE callback failure');
    const value = Object.freeze({ original: 'value' });
    let originalOwner: Owner | undefined;
    let closes = 0;
    let closeObservation: { locks: number; state: string | undefined } | undefined;
    let markClosed: (() => void) | undefined;
    const closeObserved = new Promise<void>((observe) => {
      markClosed = observe;
    });
    const operation = fixture.owner.withDependencyOwner(
      fixture.plan,
      async (owner) => {
        await Promise.resolve();
        originalOwner = owner;
        fixture.owner.enrollReadyCleanup(owner, () => {
          closeObservation = {
            locks: fixture.held.size,
            state: fixture.owner.inspect(owner)?.state,
          };
          closes++;
          if (markClosed === undefined) throw new Error('model close observer missing');
          markClosed();
        });
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- Deliberately models an original callback rejecting undefined.
        if (outcome !== 'value') return Promise.reject(primary);
        return value;
      },
      fixture.root,
    );
    expect(
      await Promise.race([
        closeObserved.then(() => 'closed'),
        fixture.holdObserved.then(() => 'held'),
      ]),
    ).toBe('closed');
    expect(closeObservation).toEqual({ locks: 2, state: 'closing' });
    if (outcome === 'value') expect(await operation).toBe(value);
    else {
      const observed = await operation.then(
        () => ({ returned: true }),
        (cause: unknown) => ({ returned: false, cause }),
      );
      expect(observed).toEqual({ returned: false, cause: primary });
    }
    expect(closes).toBe(1);
    expect(fixture.held.size).toBe(0);
    expect(fixture.timers).toHaveLength(1);
    expect(fixture.timers[0]?.cleared).toBe(true);
    if (originalOwner === undefined) throw new Error('actual model owner absent');
    expect(fixture.owner.inspect(originalOwner)).toBeUndefined();
  });

test('ready cleanup model explicit release discharges exactly once and transfer leaves in-flight work untouched', async () => {
  const fixture = await harness();
  let closes = 0;
  let transferredCloses = 0;
  await fixture.owner.withDependencyOwner(
    fixture.plan,
    async (owner) => {
      await Promise.resolve();
      const explicit = fixture.owner.enrollReadyCleanup(owner, () => {
        closes++;
      });
      fixture.owner.releaseReadyCleanup(owner, explicit);
      const consumed = fixture.owner.enrollReadyCleanup(owner, () => {
        transferredCloses++;
      });
      fixture.owner.transferReadyCleanup(owner, consumed);
    },
    fixture.root,
  );
  expect(closes).toBe(1);
  expect(transferredCloses).toBe(0);
  expect(fixture.held.size).toBe(0);
  expect(fixture.timers[0]?.cleared).toBe(true);
});

for (const mode of ['before', 'after', 'explicit'] as const)
  test(`ready cleanup model retains original UNKNOWN ${mode} without retry or outer unlock`, async () => {
    const diagnosticFailure = new Error('PRIVATE diagnostic failure');
    const fixture = await harness(diagnosticFailure);
    const cleanupFailure = new Error('PRIVATE original close failure');
    const primary = new Error('PRIVATE original callback failure');
    let originalOwner: Owner | undefined;
    let attempts = 0;
    let delegated = 0;
    let siblings = 0;
    let settled = false;
    let markFailure: (() => void) | undefined;
    const failureReached = new Promise<void>((resolveFailure) => {
      markFailure = resolveFailure;
    });
    const operation = fixture.owner.withDependencyOwner(
      fixture.plan,
      async (owner) => {
        await Promise.resolve();
        originalOwner = owner;
        const entry = fixture.owner.enrollReadyCleanup(owner, () => {
          attempts++;
          if (mode === 'after') delegated++;
          if (markFailure === undefined) throw new Error('model failure observer absent');
          markFailure();
          throw cleanupFailure;
        });
        fixture.owner.enrollReadyCleanup(owner, () => {
          siblings++;
        });
        if (mode === 'explicit') {
          try {
            fixture.owner.releaseReadyCleanup(owner, entry);
          } catch (cause) {
            expect(cause).toBe(cleanupFailure);
            expect(fixture.owner.inspect(owner)?.state).toBe('unknown');
            expect(() => {
              fixture.owner.transferReadyCleanup(owner, entry);
            }).toThrow('cannot transfer');
            expect(() => {
              fixture.owner.releaseReadyCleanup(owner, entry);
            }).toThrow('already attempted');
          }
        }
        throw primary;
      },
      fixture.root,
    );
    void operation.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await failureReached;
    // Both registries and retained runtime joins precede the one terminal HOLD.
    expect(
      await Promise.race([
        fixture.holdObserved.then(() => 'held'),
        operation.then(
          () => 'returned',
          () => 'threw',
        ),
      ]),
    ).toBe('held');
    if (originalOwner === undefined) throw new Error('actual held owner absent');
    const ownership = fixture.owner.inspect(originalOwner);
    if (ownership === undefined) throw new Error('UNKNOWN original owner was discarded');
    expect(settled).toBe(false);
    expect(attempts).toBe(1);
    expect(delegated).toBe(mode === 'after' ? 1 : 0);
    expect(siblings).toBe(1);
    expect(ownership.state).toBe('unknown');
    expect(ownership.outcome).toEqual({ kind: 'threw', cause: primary });
    expect(ownership.outcome?.cause).toBe(primary);
    expect([...ownership.ready].map((entry) => entry.failure)).toEqual([cleanupFailure]);
    expect([...ownership.ready][0]?.failure).toBe(cleanupFailure);
    expect(ownership.diagnosticFailure).toBe(diagnosticFailure);
    expect(fixture.held.size).toBe(2);
    expect(fixture.timers[0]?.cleared).toBe(false);
    const retained = fixture.timers[0]?.callback() as {
      owner: unknown;
      ownership: unknown;
      preparations: unknown;
      ready: unknown;
    };
    expect(retained.owner).toBe(originalOwner);
    expect(retained.ownership).toBe(ownership);
    expect(retained.preparations).toBe(ownership.preparations);
    expect(retained.ready).toBe(ownership.ready);
    expect(fixture.diagnostics).toHaveLength(1);
    expect(fixture.diagnostics[0]).not.toContain('PRIVATE');
    const readsBefore = fixture.reads.count;
    await rejects(fixture.owner.assertDependencyOwner(originalOwner, fixture.layout), /not active/);
    expect(fixture.reads.count).toBe(readsBefore);
    const heldOwner = originalOwner;
    expect(() =>
      fixture.owner.enrollReadyCleanup(heldOwner, () => {
        throw new Error('unexpected late enrollment');
      }),
    ).toThrow('not active');
    // These are inert fixture objects, not production settlement or native release receipts.
    fixture.held.clear();
    fixture.timers.length = 0;
  });

test('ready cleanup model rejects foreign entries without touching their original close', async () => {
  const fixture = await harness();
  let closes = 0;
  await fixture.owner.withDependencyOwner(
    fixture.plan,
    async (owner) => {
      await Promise.resolve();
      const entry = fixture.owner.enrollReadyCleanup(owner, () => {
        closes++;
      });
      expect(() => {
        fixture.owner.releaseReadyCleanup({}, entry);
      }).toThrow('not retained');
      expect(() => {
        fixture.owner.transferReadyCleanup({}, entry);
      }).toThrow('not retained');
      expect(closes).toBe(0);
      fixture.owner.releaseReadyCleanup(owner, entry);
      expect(() => {
        fixture.owner.releaseReadyCleanup(owner, entry);
      }).toThrow('not retained');
    },
    fixture.root,
  );
  expect(closes).toBe(1);
});

test('ready cleanup model discharges successful entries before owner exit', async () => {
  const fixture = await harness();
  let closes = 0;
  let count: number | undefined;
  let markReleased: (() => void) | undefined;
  let finishAction: (() => void) | undefined;
  const released = new Promise<void>((observe) => {
    markReleased = observe;
  });
  const action = new Promise<void>((finish) => {
    finishAction = finish;
  });
  const operation = fixture.owner.withDependencyOwner(
    fixture.plan,
    async (owner) => {
      await Promise.resolve();
      const entry = fixture.owner.enrollReadyCleanup(owner, () => {
        closes++;
      });
      fixture.owner.releaseReadyCleanup(owner, entry);
      count = fixture.owner.inspect(owner)?.ready.size;
      if (markReleased === undefined) throw new Error('model release observer absent');
      markReleased();
      await action;
    },
    fixture.root,
  );
  await released;
  if (finishAction === undefined) throw new Error('model action settlement absent');
  const settleAction = finishAction;
  try {
    expect(count).toBe(0);
    expect(closes).toBe(1);
  } finally {
    settleAction();
  }
  await operation;
});

test('ready cleanup model actual consume transfers before its first pending owner observation', async () => {
  const fixture = await harness();
  const complete = await readFile(
    new URL('./complete-dependency-exclusion.ts', import.meta.url),
    'utf8',
  );
  const begin = complete.indexOf('export async function consumePreparedDependencyActivation(');
  const end = complete.indexOf('/** Private composition boundary.', begin);
  if (begin < 0 || end < 0) throw new Error('actual consume source boundary absent');
  const key = Object.freeze({ original: 'prepared' });
  const preparations = new WeakMap<
    object,
    {
      owner: Owner;
      deadline: number;
      layouts: { prod: object; dev: object };
      request: { owner: { sha: string } };
    }
  >();
  const readyPreparations = new WeakMap<object, ReadyEntry>();
  const consumedPreparations = new WeakSet<object>();
  const emitted = new Bun.Transpiler({ loader: 'ts', target: 'bun' }).transformSync(
    complete.slice(begin, end).replaceAll('export ', '') +
      '\nreturn consumePreparedDependencyActivation;',
  );
  const ports = {
    preparations,
    readyPreparations,
    consumedPreparations,
    transferReadyCleanup: fixture.owner.transferReadyCleanup,
    assertDependencyOwner: () =>
      new Promise<void>(() => {
        /* This inert original read remains pending for the model observation. */
      }),
    captureEdgeRecord: () => {
      throw new Error('pending consume advanced');
    },
    assertSame: () => {
      throw new Error('pending consume inspected evidence');
    },
    closeObservations: () => {
      throw new Error('pending consume cleanup entered');
    },
    releasePreparedDependencyActivation: () => {
      throw new Error('pending consume cleanup entered');
    },
    refuseActivation: () => {
      throw new Error('pending consume refusal entered');
    },
  };
  // Boundary: actual consume body, blocked at its first owner observation with no native work.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- Exact current consume with inert lexical ports.
  const construct = new Function(...Object.keys(ports), emitted) as (
    ...values: unknown[]
  ) => (owner: Owner, prepared: object) => Promise<unknown>;
  const consume = construct(...Object.values(ports));
  let closes = 0;
  await fixture.owner.withDependencyOwner(
    fixture.plan,
    async (owner) => {
      await Promise.resolve();
      preparations.set(key, {
        owner,
        deadline: performance.now() + 10000,
        layouts: { prod: fixture.layout, dev: fixture.layout },
        request: { owner: { sha: fixture.plan.sha } },
      });
      readyPreparations.set(
        key,
        fixture.owner.enrollReadyCleanup(owner, () => {
          closes++;
        }),
      );
      void consume(owner, key).then(
        () => {
          throw new Error('inert pending consume unexpectedly settled');
        },
        (cause: unknown) => {
          throw new Error('inert pending consume unexpectedly refused', { cause });
        },
      );
      expect(consumedPreparations.has(key)).toBe(true);
    },
    fixture.root,
  );
  expect(closes).toBe(0);
  expect(readyPreparations.has(key)).toBe(false);
});

test('ready cleanup model rejects an owner that expires during its original publication read', async () => {
  let finishRead: (() => void) | undefined;
  const readBarrier = new Promise<void>((finish) => {
    finishRead = finish;
  });
  const fixture = await harness(undefined, readBarrier);
  let assertion: Promise<void> | undefined;
  await fixture.owner.withDependencyOwner(
    fixture.plan,
    async (owner) => {
      await Promise.resolve();
      assertion = fixture.owner.assertDependencyOwner(owner, fixture.layout);
    },
    fixture.root,
  );
  if (assertion === undefined || finishRead === undefined)
    throw new Error('original read fixture missing');
  finishRead();
  await rejects(assertion, /not active/);
});

for (const unknown of ['ready', 'capsule'] as const)
  test(`mixed cleanup retains ${unknown} UNKNOWN while closing the other original`, async () => {
    const diagnosticFailure = new Error('PRIVATE mixed diagnostic failure');
    const fixture = await harness(diagnosticFailure);
    const cleanupFailure = new Error('PRIVATE mixed original failure');
    const primary = unknown === 'ready' ? new Error('PRIVATE mixed callback failure') : undefined;
    let originalOwner: Owner | undefined;
    let originalComposition: Promise<unknown> | undefined;
    let readyCloses = 0;
    let capsuleCloses = 0;
    let settled = false;
    const operation = fixture.owner.withDependencyOwner(
      fixture.plan,
      async (owner) => {
        originalOwner = owner;
        fixture.owner.enrollReadyCleanup(owner, () => {
          readyCloses++;
          if (unknown === 'ready') throw cleanupFailure;
        });
        const preparation = fixture.owner.enrollDependencyPreparation(owner, {
          layouts: [fixture.layout],
          deadline: performance.now() + 10000,
          purpose: 'initial-handoff',
        });
        const graph = {
          closeFiles() {
            expect(this).toBe(graph);
            capsuleCloses++;
            if (unknown === 'capsule') throw cleanupFailure;
          },
        };
        fixture.owner.retainPreparationOriginal(preparation, {
          kind: 'graph',
          role: 'initial-evidence',
          graph,
        });
        originalComposition = Promise.resolve(Object.freeze({ inert: true }));
        expect(fixture.owner.bindPreparationComposition(preparation, originalComposition)).toBe(
          originalComposition,
        );
        await originalComposition;
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- The capsule case deliberately retains an original undefined callback rejection.
        return Promise.reject(primary);
      },
      fixture.root,
    );
    void operation.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    expect(
      await Promise.race([
        fixture.holdObserved.then(() => 'held'),
        operation.then(
          () => 'returned',
          () => 'threw',
        ),
      ]),
    ).toBe('held');
    if (originalOwner === undefined) throw new Error('mixed original owner absent');
    const ownership = fixture.owner.inspect(originalOwner);
    if (ownership === undefined) throw new Error('mixed UNKNOWN owner discarded');
    expect(readyCloses).toBe(1);
    expect(capsuleCloses).toBe(1);
    expect(settled).toBe(false);
    expect(ownership.state).toBe('unknown');
    expect(ownership.outcome).toEqual({ kind: 'threw', cause: primary });
    const outcome = ownership.outcome;
    if (outcome === undefined) throw new Error('mixed callback outcome absent');
    expect(Object.hasOwn(outcome, 'cause')).toBe(true);
    expect(ownership.outcome?.cause).toBe(primary);
    expect(ownership.diagnosticFailure).toBe(diagnosticFailure);
    expect(ownership.ready.size).toBe(unknown === 'ready' ? 1 : 0);
    if (unknown === 'ready') expect([...ownership.ready][0]?.failure).toBe(cleanupFailure);
    expect(ownership.preparations.size).toBe(1);
    const preparation = [...ownership.preparations].at(0);
    if (preparation === undefined) throw new Error('mixed capsule absent');
    expect(preparation.composition.original).toBe(originalComposition);
    expect(preparation.originals.size).toBe(1);
    const original = [...preparation.originals].at(0);
    if (original === undefined) throw new Error('mixed capsule original absent');
    expect(original.state).toBe(unknown === 'capsule' ? 'unknown' : 'closed');
    expect(original.failure).toBe(unknown === 'capsule' ? cleanupFailure : undefined);
    expect(fixture.held.size).toBe(2);
    expect(fixture.timers).toHaveLength(1);
    expect(fixture.timers[0]?.cleared).toBe(false);
    const retained = fixture.timers[0]?.callback() as {
      owner: unknown;
      ownership: unknown;
      preparations: unknown;
      ready: unknown;
    };
    expect(retained.owner).toBe(originalOwner);
    expect(retained.ownership).toBe(ownership);
    expect(retained.preparations).toBe(ownership.preparations);
    expect(retained.ready).toBe(ownership.ready);
    const reads = fixture.reads.count;
    await rejects(fixture.owner.assertDependencyOwner(originalOwner, fixture.layout), /not active/);
    expect(fixture.reads.count).toBe(reads);
    expect(readyCloses).toBe(1);
    expect(capsuleCloses).toBe(1);
  });
