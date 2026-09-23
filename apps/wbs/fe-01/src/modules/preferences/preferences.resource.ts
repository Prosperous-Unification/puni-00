import {
  type BrowserStorage,
  type Claim,
  type IsRuntimeLive,
  type Preferences,
  PreferenceStoreLifecycleError,
  type Remembered,
} from './contract';

/**
 * What every member of a {@link Remembered} throws once `isLive()` answers
 * `false`, checked against the slot's own **current** state.
 *
 * Distinct from `browser-storage.repository.ts`'s `REVOKED`: that message is
 * the store's own record that its disposal actually ran `revoke()`. This one
 * fires from the instant `accept()` publishes `retiring`, before `revoke()`
 * runs — but it is not the *only* message a caller can ever observe: once
 * a later runtime becomes live, `isLive()` answers `true` again for a stale
 * reference too (`IsRuntimeLive` asks "is something live here", not "is it
 * still me" — see its own JSDoc), and that reference's own read then reaches
 * its own store directly, which throws `REVOKED` if that store has already
 * been given back. `WITHDRAWN` is what a reference sees *while the slot is
 * not live*; `REVOKED` is what the *same* reference can see afterward, once
 * it is.
 */
const WITHDRAWN = 'the page withdrew this preference store before the access completed';

/** Stored bytes parsed as they were written, or `undefined` when they will not parse. */
function parsedOrNothing(stored: string): unknown {
  try {
    const claimed: unknown = JSON.parse(stored);
    return claimed;
  } catch {
    // Nothing but this app writes these keys, so the only way here is a
    // hand-edited store. Recovered from by the caller rather than rethrown.
    // Proof: rethrowing the parse error failed `bytes that will not parse are
    // refused rather than thrown` with `SyntaxError: Expected property name or
    // '}' in JSON at position 1`. Observed 2026-09-20.
    return undefined;
  }
}

/**
 * Everything this browser remembers, over one store.
 *
 * `isValid` carries the whole rule, including ranges: a height outside its
 * bounds is not a height, and refusing it here is what keeps a hand-edited
 * `1e999` off the screen. Per-entry sanitising is **not** here and is the
 * caller's: the width store drops entries for columns this reader no longer
 * has, and it must not write the sanitised set back — a step that is only
 * temporarily absent would lose its width for good.
 *
 * `isLive` defaults to always-`true`: every direct caller of this function —
 * this file's own tests, and any code that builds a `Preferences` outside the
 * preferences DI Bag module entirely — keeps today's behaviour exactly.
 * Installing the module itself (`module.ts`) does **not** fall through to this
 * default: the module's own `preferences` factory declares `isLive` as a host
 * requirement, so a host that omits it gets `DI_BAG_MISSING_DEPENDENCY:
 * Cannot resolve "preferences": dependency "isLive" is not registered.`
 * rather than silently always-live preferences. A host built through a
 * lifetime slot (`installApplicationRuntime`) passes its own
 * `() => slot.snapshot().status === 'live'`; see {@link IsRuntimeLive}.
 */
export function createPreferences(
  storage: BrowserStorage,
  isLive: IsRuntimeLive = () => true,
): Preferences {
  /**
   * Refuses once this runtime has been withdrawn.
   *
   * Called before every `storage` access, **and again after any code this
   * function has to run inline before it can decide what `storage` sees** —
   * a caller-supplied validator (regardless of whether it accepts or
   * refuses: a refusal is not exempt, since `readAndDrop`'s own
   * `storage.forget` call must never run against a store a re-entrant
   * validator has just withdrawn), and `json`'s own `JSON.stringify(value)`
   * (a `toJSON` method or a getter it walks is exactly the same re-entrancy
   * hazard on the write side). See
   * `docs/superpowers/plans/2026-09-21-batch-6/050-7-d-withdrawal-and-page-lifecycle.md`
   * section 4.
   */
  const ensureLive = (): void => {
    // Proof: on 2026-09-22, inverting this condition failed 27 of 44 resource,
    // module and runtime tests; consulting `isLive` without throwing failed 16.
    // Proof: on 2026-09-23, replacing the typed refusal with a plain Error made
    // 'a withdrawn refusal is a lifecycle refusal of kind withdrawn' fail on expected false to be true.
    if (!isLive()) throw new PreferenceStoreLifecycleError(WITHDRAWN, 'withdrawn');
  };

  /** The three reads every shape shares, given one way of judging what is there. */
  const storeOver = <T>(
    key: string,
    claim: () => Claim<T>,
    write: (value: T) => void,
  ): Remembered<T> => ({
    claim,
    read: () => {
      const claimed = claim();
      return claimed.status === 'held' ? claimed.value : null;
    },
    readAndDrop: () => {
      const claimed = claim();
      if (claimed.status === 'held') return claimed.value;
      // `claim()` has already rechecked liveness after any validator it ran
      // (see the claim thunks below), so reaching here with `refused` means
      // this runtime is still live: dropping the key is safe.
      // Proof: making the refusal drop a no-op failed the JSON, unparsable JSON,
      // and bare-text refusal cases on `expected <stored value> to be
      // undefined`. Observed 2026-09-20.
      if (claimed.status === 'refused') storage.forget(key);
      return null;
    },
    write: (value) => {
      // Proof: on 2026-09-22, removing this check failed 'a write refuses, and
      // never reaches the store' while the other 21 resource tests passed.
      ensureLive();
      write(value);
    },
    forget: () => {
      // Proof: on 2026-09-22, removing this check failed 'a forget refuses, and
      // never reaches the store' while the other 21 resource tests passed.
      ensureLive();
      storage.forget(key);
    },
  });

  const writeText = (key: string) => (value: string) => {
    storage.write(key, value);
  };

  return {
    json: <T>(key: string, isValid: (claimed: unknown) => claimed is T): Remembered<T> =>
      storeOver<T>(
        key,
        // A tagged shape rather than a sentinel, because `refused` has to be
        // told apart from a stored value that legitimately *is* the string
        // `'refused'`: several of these stores hold a union of short strings.
        () => {
          // Proof: on 2026-09-22, removing this check failed both JSON pre-check
          // cases; moving it after `read` recorded ['wbs.demo'] instead of [].
          ensureLive();
          const stored = storage.read(key);
          if (stored === null) return { status: 'absent' };
          const claimed = parsedOrNothing(stored);
          if (!isValid(claimed)) {
            // Rechecked here, not only in the accepting branch below: a
            // validator that withdraws and then refuses must still refuse
            // for withdrawal, not quietly answer 'refused' — its caller
            // (readAndDrop) would otherwise delete a key from a store this
            // runtime no longer owns.
            // Proof: on 2026-09-22, removing this check failed the JSON refusal
            // example and shrank the property to ["refuse","read",true].
            ensureLive();
            return { status: 'refused' };
          }
          // Proof: on 2026-09-22, removing this check failed the JSON acceptance
          // example and shrank the property to ["accept","read",true].
          ensureLive();
          return { status: 'held', value: claimed };
        },
        (value) => {
          // `JSON.stringify` runs arbitrary caller-owned code (a `toJSON`
          // method, or a getter reached while walking `value`) before this
          // function ever touches `storage` — exactly the same re-entrancy
          // hazard as a caller-supplied validator (section 3.2's own
          // finding), just on the write side. Serialize first, then recheck
          // liveness immediately before the write it could still prevent.
          const serialized = JSON.stringify(value);
          // Proof: on 2026-09-22, removing this check failed 'a value whose
          // toJSON withdraws the runtime is never written'.
          ensureLive();
          storage.write(key, serialized);
        },
      ),
    text: <T extends string>(
      key: string,
      isValid: (stored: string) => stored is T,
    ): Remembered<T> =>
      storeOver<T>(
        key,
        // No parse to fail here, so absent and refused are the only two ways not
        // to hold a value.
        () => {
          // Proof: on 2026-09-22, removing this check failed the bare-text
          // pre-check; moving it after `read` recorded ['wbs.demo.section'].
          ensureLive();
          const stored = storage.read(key);
          if (stored === null) return { status: 'absent' };
          if (!isValid(stored)) {
            // Same post-validator recheck as `json`'s own claim thunk above,
            // on both branches, for the same reason.
            // Proof: on 2026-09-22, removing this check failed only the
            // bare-text refusing example; the stored key would be deleted.
            ensureLive();
            return { status: 'refused' };
          }
          // Proof: on 2026-09-22, removing this check failed only the
          // bare-text accepting example; the accepted value was returned.
          ensureLive();
          return { status: 'held', value: stored };
        },
        // Proof: JSON-stringifying this write failed the resource case on
        // `expected '"steps"' to be 'steps'` and the named-answer compatibility
        // case on the quoted settings-section bytes. Observed 2026-09-20.
        writeText(key),
      ),
    unchecked: (key: string): Remembered<string> =>
      storeOver<string>(
        key,
        // Never refused, so `readAndDrop` and `read` answer the same thing and
        // the caller's own rule is the only judge there is. No caller-supplied
        // validator runs here, so one `ensureLive` before the read is the
        // whole of it.
        () => {
          // Proof: on 2026-09-22, removing this check failed the unchecked-read
          // pre-check; moving it after `read` recorded ['wbs.demo.id'].
          ensureLive();
          const stored = storage.read(key);
          // Proof: treating the empty string as absent failed the unchecked-key
          // case on `expected { status: 'absent' } to deeply equal { status:
          // 'held', value: '' }` and the project-page case on `expected '' to
          // be null`. Observed 2026-09-20.
          return stored === null ? { status: 'absent' } : { status: 'held', value: stored };
        },
        writeText(key),
      ),
  };
}
