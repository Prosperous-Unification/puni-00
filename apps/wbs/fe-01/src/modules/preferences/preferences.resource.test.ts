import fc from 'fast-check';
import { describe, expect, it, test } from 'vitest';

import { isPreferenceStoreLifecycleError, PreferenceStoreLifecycleError } from './contract';
import { fakeBrowserStorage } from './fake-browser-storage';
import { createPreferences } from './preferences.resource';

const isColour = (claimed: unknown): claimed is 'light' | 'dark' =>
  claimed === 'light' || claimed === 'dark';
const isSection = (stored: string): stored is 'teams' | 'steps' =>
  stored === 'teams' || stored === 'steps';

test('a JSON-written value comes back as it was written', () => {
  const store = fakeBrowserStorage();
  const held = createPreferences(store).json('wbs.demo', isColour);
  held.write('dark');
  expect(store.held()['wbs.demo']).toBe('"dark"');
  expect(held.read()).toBe('dark');
  expect(held.claim()).toEqual({ status: 'held', value: 'dark' });
});

test('nothing stored is absent, and is not a refusal', () => {
  const held = createPreferences(fakeBrowserStorage()).json('wbs.demo', isColour);
  expect(held.claim()).toEqual({ status: 'absent' });
  expect(held.read()).toBeNull();
});

test('a read that drops removes the refused key; a plain read writes nothing', () => {
  const store = fakeBrowserStorage({ 'wbs.demo': '"midnight"' });
  const held = createPreferences(store).json('wbs.demo', isColour);
  expect(held.read()).toBeNull();
  expect(store.held()['wbs.demo']).toBe('"midnight"');
  expect(held.readAndDrop()).toBeNull();
  expect(store.held()['wbs.demo']).toBeUndefined();
});

test('bytes that will not parse are refused rather than thrown', () => {
  const store = fakeBrowserStorage({ 'wbs.demo': '{not json' });
  const held = createPreferences(store).json('wbs.demo', isColour);
  expect(held.claim()).toEqual({ status: 'refused' });
  expect(held.readAndDrop()).toBeNull();
  expect(store.held()['wbs.demo']).toBeUndefined();
});

test('a bare-text key is written without quotes and read without a parse', () => {
  const store = fakeBrowserStorage();
  const held = createPreferences(store).text('wbs.demo.section', isSection);
  held.write('steps');
  expect(store.held()['wbs.demo.section']).toBe('steps');
  expect(held.read()).toBe('steps');
});

test('a bare-text value the guard refuses takes its key with it', () => {
  const store = fakeBrowserStorage({ 'wbs.demo.section': '7' });
  const held = createPreferences(store).text('wbs.demo.section', isSection);
  expect(held.readAndDrop()).toBeNull();
  expect(store.held()['wbs.demo.section']).toBeUndefined();
});

test('an unchecked key holds every string, the empty one included', () => {
  const store = fakeBrowserStorage({ 'wbs.demo.id': '' });
  const held = createPreferences(store).unchecked('wbs.demo.id');
  expect(held.claim()).toEqual({ status: 'held', value: '' });
  expect(held.read()).toBe('');
  expect(held.readAndDrop()).toBe('');
  expect(store.held()['wbs.demo.id']).toBe('');
});

test('an unchecked key is written as bare text', () => {
  const store = fakeBrowserStorage();
  const held = createPreferences(store).unchecked('wbs.demo.id');
  held.write('p1');
  expect(store.held()['wbs.demo.id']).toBe('p1');
});

test('forgetting removes the key and writes no default over it', () => {
  const store = fakeBrowserStorage({ 'wbs.demo': '"dark"' });
  const held = createPreferences(store).json('wbs.demo', isColour);
  held.forget();
  expect(store.held()).toEqual({});
});

test('a store that refuses access is not recovered from', () => {
  const refusing = {
    read: (): string | null => {
      throw new Error('site data blocked');
    },
    write: (): void => {
      throw new Error('site data blocked');
    },
    forget: (): void => {
      throw new Error('site data blocked');
    },
  };
  const held = createPreferences(refusing).json('wbs.demo', isColour);
  expect(() => held.read()).toThrow('site data blocked');
});

describe('once the runtime that owns this store is no longer live', () => {
  /**
   * A store whose own liveness can be flipped — models `lifetime-slot.ts`'s
   * own synchronous `accept()` (`runtime/lifetime-slot.model.test.ts` and
   * `application-runtime.test.ts` cover a real slot end to end; this file's
   * own job is the resource's response to that signal, isolated).
   */
  interface Liveness {
    live: boolean;
    readonly isLive: () => boolean;
  }
  const createLiveness = (): Liveness => {
    const state: Liveness = { live: true, isLive: () => state.live };
    return state;
  };

  /**
   * `fakeBrowserStorage`'s own `held()` records the bytes a write left
   * behind, but a `read` has no side effect to observe that way — a pre-check
   * moved to run *after* `storage.read` still throws before returning
   * anything, so a test that only checks the thrown message and the stored
   * bytes cannot tell "never read" from "read, then refused to answer".
   * This wraps the same fake with an access log so a test can assert the
   * store itself was never asked, not only that nothing came back.
   */
  interface RecordingStorage {
    readonly read: (key: string) => string | null;
    readonly write: (key: string, value: string) => void;
    readonly forget: (key: string) => void;
    readonly held: () => Record<string, string>;
    readonly reads: () => readonly string[];
  }
  const recordingBrowserStorage = (seed: Record<string, string> = {}): RecordingStorage => {
    const store = fakeBrowserStorage(seed);
    const reads: string[] = [];
    return {
      read: (key) => {
        reads.push(key);
        return store.read(key);
      },
      write: store.write,
      forget: store.forget,
      held: store.held,
      reads: () => reads,
    };
  };

  describe('the pre-check: an operation begun after withdrawal refuses, and never reaches the store at all', () => {
    /**
     * `unchecked`'s own write has no second, shape-specific check of its own
     * (unlike `json`'s, section 4.2 item 2's own third `ensureLive()` call) —
     * this is `storeOver`'s **shared** pre-check, exercised on a shape where
     * nothing else could mask its removal.
     */
    test('a write refuses, and never reaches the store', () => {
      const store = fakeBrowserStorage();
      const withdrawn = createLiveness();
      const held = createPreferences(store, withdrawn.isLive).unchecked('wbs.demo.id');
      withdrawn.live = false;

      expect(() => {
        held.write('p1');
      }).toThrow('the page withdrew this preference store before the access completed');
      expect(store.held()).toEqual({});
    });

    test('a forget refuses, and never reaches the store', () => {
      const store = fakeBrowserStorage({ 'wbs.demo': '"dark"' });
      const withdrawn = createLiveness();
      const held = createPreferences(store, withdrawn.isLive).json('wbs.demo', isColour);
      withdrawn.live = false;

      expect(() => {
        held.forget();
      }).toThrow('the page withdrew this preference store');
      expect(store.held()).toEqual({ 'wbs.demo': '"dark"' });
    });

    /**
     * Important 1 (review 2): a fake that only records bytes cannot prove a
     * read never happened — throwing after an unauthorized read would still
     * satisfy a test that checks only the thrown message. `recordingStore`
     * asserts the store's own `read` was never called at all, including for
     * the absent-value case, which carries no bytes to check either way.
     */
    test('a JSON read refuses before the store, or the validator, is ever reached', () => {
      const recordingStore = recordingBrowserStorage({ 'wbs.demo': '"dark"' });
      const withdrawn = createLiveness();
      let validatorRan = false;
      const held = createPreferences(recordingStore, withdrawn.isLive).json(
        'wbs.demo',
        (claimed) => {
          validatorRan = true;
          return isColour(claimed);
        },
      );
      withdrawn.live = false;

      expect(() => held.read()).toThrow('the page withdrew this preference store');
      expect(() => held.readAndDrop()).toThrow('the page withdrew this preference store');
      expect(validatorRan).toBe(false);
      expect(recordingStore.reads()).toEqual([]);
      expect(recordingStore.held()).toEqual({ 'wbs.demo': '"dark"' });
    });

    test('a JSON read of an absent key still never reaches the store once withdrawn', () => {
      const recordingStore = recordingBrowserStorage();
      const withdrawn = createLiveness();
      const held = createPreferences(recordingStore, withdrawn.isLive).json('wbs.demo', isColour);
      withdrawn.live = false;

      expect(() => held.read()).toThrow('the page withdrew this preference store');
      expect(recordingStore.reads()).toEqual([]);
    });

    test('a bare-text read refuses before the store, or the validator, is ever reached', () => {
      const recordingStore = recordingBrowserStorage({ 'wbs.demo.section': 'steps' });
      const withdrawn = createLiveness();
      let validatorRan = false;
      const held = createPreferences(recordingStore, withdrawn.isLive).text(
        'wbs.demo.section',
        (stored) => {
          validatorRan = true;
          return isSection(stored);
        },
      );
      withdrawn.live = false;

      expect(() => held.read()).toThrow('the page withdrew this preference store');
      expect(validatorRan).toBe(false);
      expect(recordingStore.reads()).toEqual([]);
    });

    test('an unchecked read refuses before the store is ever reached', () => {
      const recordingStore = recordingBrowserStorage({ 'wbs.demo.id': 'p1' });
      const withdrawn = createLiveness();
      const held = createPreferences(recordingStore, withdrawn.isLive).unchecked('wbs.demo.id');
      withdrawn.live = false;

      expect(() => held.read()).toThrow('the page withdrew this preference store');
      expect(recordingStore.reads()).toEqual([]);
    });
  });

  describe('the write-serialization recheck: JSON.stringify running caller code', () => {
    /**
     * Important 1 (review 2): `JSON.stringify(value)` runs `value`'s own
     * `toJSON()` before `write`'s own body ever calls `storage.write` — a
     * hazard on the write side with the same shape as a re-entrant
     * validator. Rechecking liveness only *before* serialization (as a
     * single pre-check would) misses this gap entirely.
     */
    test('a value whose toJSON withdraws the runtime is never written', () => {
      const store = fakeBrowserStorage();
      const withdrawn = createLiveness();
      const held = createPreferences(store, withdrawn.isLive).json<{ readonly test: number }>(
        'wbs.demo',
        (claimed): claimed is { readonly test: number } =>
          typeof claimed === 'object' && claimed !== null && 'test' in claimed,
      );
      const reenteringValue = {
        test: 1,
        toJSON(): { readonly test: number } {
          withdrawn.live = false; // the re-entrant `slot.retire()`/`replace()`, modelled
          return { test: this.test };
        },
      };

      expect(() => {
        held.write(reenteringValue);
      }).toThrow('the page withdrew this preference store before the access completed');
      expect(store.held()).toEqual({});
    });
  });

  describe('the post-validator recheck: a validator that withdraws its own runtime, from a fresh live fixture', () => {
    /**
     * Every example in this block starts `withdrawn.live` at `true` — the
     * fixture is live until the validator itself, mid-call, withdraws it —
     * so each one exercises the recheck *after* `isValid` returns, never the
     * pre-check above. Review 1's own finding: an example that starts already
     * withdrawn "exercises the pre-check", not this one.
     */

    test('JSON, accepting: the accepted value is not returned', () => {
      const store = fakeBrowserStorage({ 'wbs.demo': '"dark"' });
      const withdrawn = createLiveness();
      const reenteringIsValid = (claimed: unknown): claimed is 'light' | 'dark' => {
        withdrawn.live = false; // the re-entrant `slot.retire()`/`replace()`, modelled
        return claimed === 'light' || claimed === 'dark'; // and it accepts anyway
      };
      const held = createPreferences(store, withdrawn.isLive).json('wbs.demo', reenteringIsValid);

      expect(() => held.read()).toThrow('the page withdrew this preference store');
      expect(() => held.readAndDrop()).toThrow('the page withdrew this preference store');
    });

    /**
     * Critical 1: a refusing validator that withdraws must not let
     * `readAndDrop` reach `storage.forget` — the recheck after `isValid`
     * returns runs on **both** branches, and `readAndDrop` only calls
     * `forget` after `claim()` has already returned, so a throw from inside
     * `claim()` here means `forget` is never reached at all.
     */
    test('JSON, refusing: the refusal itself still refuses for withdrawal, and the key survives', () => {
      const store = fakeBrowserStorage({ 'wbs.demo': '"midnight"' });
      const withdrawn = createLiveness();
      const reenteringIsValid = (_claimed: unknown): _claimed is 'light' | 'dark' => {
        withdrawn.live = false;
        return false;
      };
      const held = createPreferences(store, withdrawn.isLive).json('wbs.demo', reenteringIsValid);

      expect(() => held.read()).toThrow('the page withdrew this preference store');
      expect(store.held()).toEqual({ 'wbs.demo': '"midnight"' });

      const fresh = createLiveness();
      const alsoWithdraws = (_claimed: unknown): _claimed is 'light' | 'dark' => {
        fresh.live = false;
        return false;
      };
      const heldAgain = createPreferences(store, fresh.isLive).json('wbs.demo', alsoWithdraws);
      expect(() => heldAgain.readAndDrop()).toThrow('the page withdrew this preference store');
      expect(store.held()).toEqual({ 'wbs.demo': '"midnight"' });
    });

    test('bare text, accepting: the accepted value is not returned', () => {
      const store = fakeBrowserStorage({ 'wbs.demo.section': 'steps' });
      const withdrawn = createLiveness();
      const reenteringIsValid = (stored: string): stored is 'teams' | 'steps' => {
        withdrawn.live = false;
        return stored === 'teams' || stored === 'steps';
      };
      const held = createPreferences(store, withdrawn.isLive).text(
        'wbs.demo.section',
        reenteringIsValid,
      );

      expect(() => held.read()).toThrow('the page withdrew this preference store');
    });

    /**
     * The bare-text shape's own post-check had zero coverage before this
     * example: its only prior test started already withdrawn and so never
     * reached `isValid` at all. This one is the fresh-fixture, re-entrant
     * case, and `readAndDrop` must not delete the key either.
     */
    test('bare text, refusing: the refusal itself still refuses for withdrawal, and the key survives', () => {
      const store = fakeBrowserStorage({ 'wbs.demo.section': 'nonsense' });
      const withdrawn = createLiveness();
      const reenteringIsValid = (_stored: string): _stored is 'teams' | 'steps' => {
        withdrawn.live = false;
        return false;
      };
      const held = createPreferences(store, withdrawn.isLive).text(
        'wbs.demo.section',
        reenteringIsValid,
      );

      expect(() => held.readAndDrop()).toThrow('the page withdrew this preference store');
      expect(store.held()).toEqual({ 'wbs.demo.section': 'nonsense' });
    });
  });

  /**
   * A validator generates its own re-entrant behaviour, over every
   * combination of accept/refuse, read/readAndDrop and whether it withdraws
   * before answering — always from a fresh live fixture, and always
   * asserting the stored bytes as well as the thrown message. Not
   * `fc.scheduler()`: a validator's re-entrant call to `retire`/`replace` is
   * a single synchronous statement, fully ordered by the call stack that
   * contains it — there is no scheduling ambiguity to generate here.
   * `lifetime-slot.model.test.ts`'s own extended property is where generated
   * interleavings of a *real* slot, real retirement/replacement and real
   * pending/failed disposal are exercised.
   */
  it('never returns a value, and never deletes a refused key, once its own validator has withdrawn the runtime', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('accept', 'refuse'),
        fc.constantFrom('read', 'readAndDrop'),
        fc.boolean(),
        (verdict, operation, withdrawsFirst) => {
          const store = fakeBrowserStorage({ 'wbs.demo': '"dark"' });
          const withdrawn = createLiveness();
          const isValid = (claimed: unknown): claimed is 'light' | 'dark' => {
            if (withdrawsFirst) withdrawn.live = false;
            return verdict === 'accept' && (claimed === 'light' || claimed === 'dark');
          };
          const held = createPreferences(store, withdrawn.isLive).json('wbs.demo', isValid);

          const read = (): 'dark' | 'light' | null =>
            operation === 'read' ? held.read() : held.readAndDrop();

          if (withdrawsFirst) {
            expect(read).toThrow('the page withdrew this preference store');
            // Critical 1: withdrawal refuses before either branch is acted
            // on, so the stored bytes are untouched regardless of verdict.
            expect(store.held()).toEqual({ 'wbs.demo': '"dark"' });
          } else if (verdict === 'accept') {
            expect(read()).toBe('dark');
          } else {
            expect(read()).toBeNull();
          }
        },
      ),
      { seed: 20260924, numRuns: 200 },
    );
  });

  /**
   * The refusal is **classified**, not only worded: a delivery consumer has to
   * tell a lifecycle refusal apart from an unmodelled storage failure without
   * matching on message text, which is what `lib/theme.ts`'s own narrow catch
   * does. Asserted on the caught value's own type and `kind`, deliberately not
   * on its message — the message assertions elsewhere in this file already
   * cover the wording and would keep passing for a plain `Error`.
   */
  test('a withdrawn refusal is a lifecycle refusal of kind withdrawn', () => {
    const store = fakeBrowserStorage();
    const withdrawn = createLiveness();
    const held = createPreferences(store, withdrawn.isLive).unchecked('wbs.demo.id');
    withdrawn.live = false;

    let caught: unknown = null;
    try {
      held.write('p1');
    } catch (refusal) {
      caught = refusal;
    }

    expect(isPreferenceStoreLifecycleError(caught)).toBe(true);
    expect(caught).toBeInstanceOf(PreferenceStoreLifecycleError);
    expect(caught instanceof PreferenceStoreLifecycleError ? caught.kind : null).toBe('withdrawn');
  });
});
