import type { BrowserStorage, Claim, Preferences, Remembered } from './contract';

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
 */
export function createPreferences(storage: BrowserStorage): Preferences {
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
      // Proof: making the refusal drop a no-op failed the JSON, unparsable JSON,
      // and bare-text refusal cases on `expected <stored value> to be
      // undefined`. Observed 2026-09-20.
      if (claimed.status === 'refused') storage.forget(key);
      return null;
    },
    write,
    forget: () => {
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
          const stored = storage.read(key);
          if (stored === null) return { status: 'absent' };
          const claimed = parsedOrNothing(stored);
          return isValid(claimed) ? { status: 'held', value: claimed } : { status: 'refused' };
        },
        (value) => {
          storage.write(key, JSON.stringify(value));
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
          const stored = storage.read(key);
          if (stored === null) return { status: 'absent' };
          return isValid(stored) ? { status: 'held', value: stored } : { status: 'refused' };
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
        // the caller's own rule is the only judge there is.
        () => {
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
