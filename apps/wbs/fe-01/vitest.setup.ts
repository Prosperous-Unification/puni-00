import '@testing-library/jest-dom/vitest';

import { afterAll } from 'vitest';

/**
 * React captures Bun's host reportError before event handlers run. Route it through jsdom's
 * cancelable ErrorEvent before React loads; uncanceled errors reach the original reporter.
 * Vitest can itself cancel and report an unexpected window event as a test failure.
 * Per-file cleanup restores the captured host value. Other runners keep their existing path.
 * @throws when the required Bun/browser reporting APIs are absent.
 */
function installBunBrowserReporter(): void {
  // Proof: removing this selector failed the body-time original-binding assertion in
  // `reporter leaves other host binding unchanged`; synthetic host selection only.
  if (process.versions['bun'] === undefined) return;
  const original = globalThis.reportError;
  // Proof: removing this grouped guard made both missing-native-API and missing-ErrorEvent
  // reporter controls reach React/body instead of their contextual refusal (one guard).
  if (typeof original !== 'function' || typeof window.ErrorEvent !== 'function')
    throw new Error('Bun/jsdom error reporting APIs are absent');
  function reportBrowserError(failure: unknown): void {
    const message =
      typeof failure === 'object' &&
      failure !== null &&
      'message' in failure &&
      typeof failure.message === 'string'
        ? failure.message
        : String(failure);
    const event = new window.ErrorEvent('error', {
      bubbles: true,
      cancelable: true,
      message,
      error: failure,
    });
    // Proof: unconditional forwarding escaped the original write-denied error in the actual
    // modal identity test; dropping forwarding hid the uncanceled unexpected sentinel.
    // Each own reporter parent failed its first status assertion, then passed on restoration.
    if (window.dispatchEvent(event)) original(failure);
  }
  // Proof: omitting restoration failed the first file's afterAll reporter-identity assertion
  // in `reporter restores the host binding after each file`; later-file fallout adds no proof.
  afterAll(() => {
    globalThis.reportError = original;
  });
  globalThis.reportError = reportBrowserError;
}

// Proof: omitting installation failed the actual modal's reported-array assertion at
// work-package-settings-modal.test.tsx:975. Separately reviewed raw evidence: the frozen
// checker misspelled .tsx as .ts and stopped; verification-fe-reporter.json retains that STOP.
installBunBrowserReporter();

// Under Bun + jsdom 24 the window is there, the origin is set, and
// `window.localStorage` is still undefined (probed, not assumed). Real
// browsers have it; tests get the same contract from this in-memory stand-in,
// installed only when it is missing so a runtime that grows one keeps its own.
if (typeof window !== 'undefined' && typeof window.localStorage === 'undefined') {
  const backing = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return backing.size;
    },
    clear: () => {
      backing.clear();
    },
    getItem: (key) => backing.get(key) ?? null,
    key: (index) => [...backing.keys()][index] ?? null,
    removeItem: (key) => {
      backing.delete(key);
    },
    setItem: (key, value) => {
      backing.set(key, value);
    },
  };
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
}

/**
 * A `MediaQueryList` a test can drive.
 *
 * The extra method is the whole reason this stand-in is worth having: the fault
 * it has to be able to show is **the app's subscription coming loose**, and a
 * stub that answers `false` for ever cannot show it — which is
 * `plan-renderer.ts`'s own objection to stubbing `matchMedia`, written down
 * there in 2026-08-09. What a browser makes of `(prefers-color-scheme: dark)`
 * is Chromium's business and is asserted in `e2e/dark-mode.spec.ts` through
 * Playwright's `emulateMedia`; what jsdom is asked here is only whether this
 * app listens to the answer and re-paints on it.
 */
export interface DriveableMediaQueryList extends MediaQueryList {
  /** Flips the answer and tells every live listener, exactly as a platform does. */
  setMatches(matches: boolean): void;
  /**
   * How many `change` listeners are live on this list.
   *
   * The half {@link setMatches} cannot show. Driving the list proves a
   * subscription *arrived*; nothing a driven list does can prove one **left**,
   * because the component that would have repainted on it is already gone —
   * React runs no effect for an unmounted hook, so `stops listening to the
   * machine once it is gone` passed with the `removeEventListener` deleted.
   * Caught in cross-review, 2026-08-12. A count is the only thing the platform
   * can be asked that an unmount is allowed to change.
   */
  readonly listenerCount: number;
}

/**
 * jsdom 24 ships **no `window.matchMedia` at all** — probed 2026-08-09, and
 * `plan-renderer.ts` carries the note. `lib/theme.ts` throws rather than
 * guessing when it is missing, because "what has this machine been set to" has
 * exactly one source and a `false` in its place is a light page shown to
 * somebody who asked for a dark one. So the test environment grows one instead
 * of the app growing a branch for the test environment.
 *
 * One list per query string, cached: two `matchMedia` calls with the same query
 * must be the same object here, or a test would drive one list while the app
 * listened to another and the assertion would be about the stub.
 *
 * Installed only when it is missing, like the storage above, so a runtime that
 * grows its own keeps it.
 */
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  const lists = new Map<string, DriveableMediaQueryList>();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string): DriveableMediaQueryList => {
      const already = lists.get(query);
      if (already !== undefined) return already;
      const listeners = new Set<(event: MediaQueryListEvent) => void>();
      const list = {
        media: query,
        matches: false,
        onchange: null,
        addEventListener: (type: string, listener: (event: MediaQueryListEvent) => void) => {
          if (type === 'change') listeners.add(listener);
        },
        removeEventListener: (type: string, listener: (event: MediaQueryListEvent) => void) => {
          if (type === 'change') listeners.delete(listener);
        },
        addListener: (listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
        removeListener: (listener: (event: MediaQueryListEvent) => void) =>
          listeners.delete(listener),
        dispatchEvent: () => true,
        // A getter and not a snapshot: the list is cached and handed to every
        // caller of `matchMedia`, so a number captured at construction would
        // answer for the moment the stand-in was built rather than for now.
        get listenerCount(): number {
          return listeners.size;
        },
        setMatches: (matches: boolean) => {
          list.matches = matches;
          for (const listener of [...listeners]) {
            listener({ matches, media: query } as MediaQueryListEvent);
          }
        },
      } as unknown as DriveableMediaQueryList & { matches: boolean };
      lists.set(query, list);
      return list;
    },
  });
}

// jsdom *has* a `window.scrollTo`, and all it does is print "Not implemented:
// window.scrollTo" to its virtual console — so unlike the storage above this is
// replaced rather than filled in, and unconditionally: a `typeof` guard here
// would be a branch that never runs. The router scrolls to the top on every
// navigation, which is 66 lines of stderr per suite about a scroll position no
// jsdom test asserts on. The scrolling that matters is measured in `e2e/`, by a
// browser that really does it.
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'scrollTo', { value: () => undefined, configurable: true });
}

/**
 * A width for a `<text>`, so a document with no layout can still be asked one.
 *
 * jsdom implements no `SVGTextContentElement` at all — probed 2026-08-31,
 * `grep getComputedTextLength node_modules/jsdom/lib/jsdom/living/` finds
 * nothing — and `gantt-panel.tsx`'s `measureLabelGutterPx` **throws** when the
 * document cannot measure text rather than guessing a width, for the reason
 * the gutter exists at all: a guessed one is what drew a long name across the
 * divider and under the bars.
 *
 * So the test environment grows a ruler instead of the app growing a branch
 * for the test environment, exactly as it does for `matchMedia` above. What it
 * answers is deterministic and **not** a claim about any real font: half an em
 * per character. That makes the gutter's *arithmetic* assertable in jsdom —
 * widest word wins, short names keep the constant — while what a real Chromium
 * makes of a real font stack is asserted where it can be, in
 * `e2e/gantt.spec.ts`.
 *
 * Installed only when it is missing, like the two above.
 */
if (typeof SVGElement !== 'undefined') {
  const svgTextElement = SVGElement.prototype as unknown as {
    getComputedTextLength?: () => number;
  };
  if (typeof svgTextElement.getComputedTextLength !== 'function') {
    Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', {
      configurable: true,
      value(this: SVGElement): number {
        const fontSize = Number(this.getAttribute('font-size') ?? '10');
        return (this.textContent.length * fontSize) / 2;
      },
    });
  }
}
