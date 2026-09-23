import {
  createContext,
  createElement,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { isPreferenceStoreLifecycleError, type Remembered } from '@/modules/preferences/contract';
import { THEME_KEY } from '@/modules/preferences/preference-keys';
import { useApplicationServicesState } from '@/runtime/application-services-context';

/**
 * What a reader has asked for, which is not the same as what is painted.
 *
 * Three states and not a boolean, because "follow the machine" is an answer of
 * its own and cannot be spelled as either of the other two: a reader whose
 * laptop turns dark at sunset has not chosen dark, and a reader who has chosen
 * light means it at midnight as well.
 */
export type ThemeChoice = 'system' | 'light' | 'dark';

/** What is actually on screen once {@link ThemeChoice} has been resolved. */
export type Palette = 'light' | 'dark';

/** The three, in the order the control offers them. */
export const THEME_CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark'];

/**
 * Where this browser remembers the answer.
 *
 * One key for the browser and not one per project, for `wbs.ganttArrows`'
 * reason: a palette is an answer about **this screen in this room**, and having
 * to say it again in the next project is the fault remembering it away is for.
 */
export { THEME_KEY };

/** The query the platform answers with its own light/dark setting. */
export const DARK_QUERY = '(prefers-color-scheme: dark)';

/** The class `styles.css` hangs the dark token set on. */
export const DARK_CLASS = 'dark';

/** Whether a value read from storage names one of the three {@link ThemeChoice}s. */
export function isThemeChoice(claimed: unknown): claimed is ThemeChoice {
  return claimed === 'system' || claimed === 'light' || claimed === 'dark';
}

/**
 * The choice as this browser last said it, over the given store — and `system`
 * where it has never said, which is the state every reader starts in.
 *
 * Takes its store rather than closing over a module-load singleton:
 * {@link useTheme} is this file's one caller inside a render tree, and it builds
 * the store from {@link useApplicationServicesState} instead — a module-scope
 * binding here would be built at import time, before any runtime exists.
 *
 * The stored value is a claim, not a fact, and {@link Remembered} is where that
 * is dealt with for every key this app holds: anything that is not one of the
 * three takes the key with it and the answer goes back to `system`.
 *
 * @throws `PreferenceStoreLifecycleError` when `themeStore`'s own runtime has
 * gone withdrawn or been revoked since this store was built — see
 * `modules/preferences/contract.ts`. {@link useTheme}'s own resync effect is the
 * one caller that catches it; every other caller runs it against a store it
 * knows is live.
 */
export function rememberedTheme(themeStore: Remembered<ThemeChoice>): ThemeChoice {
  // Proof: `readAndDrop` replaced by `read`, which is what "read the claim,
  // drop nothing" comes to. `refuses a stored answer that is not one of the
  // three, and drops the key` failed on `expected '"midnight"' to be null` —
  // the unreadable key left in storage to be read again next time — and
  // `refuses storage that is not JSON at all` with it.
  // Proof: the shared refusal drop made a no-op failed three resource cases,
  // including `a read that drops removes the refused key; a plain read writes
  // nothing`, on `expected '"midnight"' to be undefined`. Observed 2026-09-20.
  return themeStore.readAndDrop() ?? 'system';
}

/**
 * The same read with **nothing written** — what a React render is allowed to
 * do.
 *
 * {@link useTheme}'s lazy `useState` initialiser calls this and its resync
 * effect calls {@link rememberedTheme}, which is the same split
 * {@link useTheme}'s own `chooseTheme` states in prose: a function React may
 * call twice during a render is no place for a side effect. Cross-review,
 * 2026-08-12; {@link Remembered.read} carries the whole reason now, and it is
 * the distinction the other ten stores did not make.
 *
 * Not folded into one function returning a pair, because the boundary API is
 * the one `index.html`'s bootstrap is checked against for parity
 * (`index-bootstrap.test.ts`) and that check reads "what does this module make
 * of these bytes, storage and all".
 */
export function readTheme(themeStore: Remembered<ThemeChoice>): ThemeChoice {
  return themeStore.read() ?? 'system';
}

/** Writes the answer down. `system` is stored, not absent — see {@link rememberedTheme}. */
export function rememberTheme(themeStore: Remembered<ThemeChoice>, choice: ThemeChoice): void {
  // Proof: on 2026-09-23, replacing this write with a read failed the model at
  // run 14: stored bytes in A were undefined instead of '"system"'.
  themeStore.write(choice);
}

/**
 * The platform's own answer, live.
 *
 * Returned as the `MediaQueryList` rather than as a boolean so a caller can
 * both read it and subscribe to it through one object: two calls to
 * `matchMedia` produce two lists, and a listener attached to the second says
 * nothing about the first.
 *
 * @throws When the runtime has no `matchMedia`. Unknown is not OK: this is the
 * only source there is for "what has the machine been set to", and a `false`
 * returned in its place is a light page shown to somebody whose machine asked
 * for a dark one, silently and forever. Every browser this ships to has it;
 * **jsdom does not** (probed 2026-08-09, `plan-renderer.ts` has the note), and
 * `vitest.setup.ts` installs a driveable stand-in rather than letting the app
 * carry a branch for a test environment.
 */
export function systemMedia(): MediaQueryList {
  if (typeof window.matchMedia !== 'function') {
    throw new Error('this runtime cannot be asked what colour scheme it prefers');
  }
  return window.matchMedia(DARK_QUERY);
}

/** What gets painted, given what was asked for and what the machine says. */
export function paletteFor(choice: ThemeChoice, systemPrefersDark: boolean): Palette {
  if (choice === 'system') return systemPrefersDark ? 'dark' : 'light';
  return choice;
}

/**
 * Puts the palette on the document, which is the whole of what "applying a
 * theme" is here.
 *
 * One class on the root element and nothing else. `styles.css` declares the
 * dark token set under `.dark` and every `bg-card`, `--grid-band` and
 * `color-mix` in the app reads it through a custom property, so this is the
 * only line in the front end that knows a second palette exists.
 *
 * `color-scheme` is **not** set here: it is declared in the stylesheet beside
 * the tokens, on the same two selectors, so the native scrollbars and date
 * pickers follow the class rather than a second write that could disagree
 * with it.
 */
export function paintPalette(palette: Palette): void {
  document.documentElement.classList.toggle(DARK_CLASS, palette === 'dark');
}

/**
 * What {@link useTheme} hands back: the answer, the way to change it, and
 * whether that answer is actually being remembered right now.
 */
export interface Theme {
  choice: ThemeChoice;
  /** What is on screen right now, which is `choice` unless `choice` is `system`. */
  palette: Palette;
  chooseTheme: (choice: ThemeChoice) => void;
  /**
   * Whether this browser is remembering `choice`, as of the render that produced
   * this value.
   *
   * React state, not a live probe, and the difference is observable: the slot
   * withdraws publication **synchronously**, while this flag is only corrected by
   * the chooser (within its own call) or by the resynchronisation effect (after
   * the commit the slot's own deferred notification caused). Between those two
   * instants a reader can still see `true` for a runtime that has already gone.
   * That lag is exactly why `chooseTheme` catches the store's lifecycle refusal
   * instead of consulting this flag, and it is what
   * `docs/superpowers/plans/2026-09-21-batch-6/050-7-f1-theme-hook-model.md`
   * section 3.2 states precisely.
   *
   * Once it has converged it is the explicit, visible degradation R5 asks for — a
   * silently-accepted, unpersisted choice is exactly the misleading behaviour
   * `browser-storage.repository.ts`'s own JSDoc warns against for a blocked
   * store.
   */
  persists: boolean;
}

/**
 * The palette, followed and remembered, for as long as the app is open.
 *
 * Mounted once, in `app.tsx`, above the branch that decides whether anybody is
 * signed in — so the sign-in form is painted the same as the plan behind it,
 * and a remembered dark page does not go white the moment somebody signs out.
 *
 * `useState(readTheme)` — the lazy initialiser, not `useState(readTheme())` —
 * for `rememberedGanttHeight`'s reason: the second reads storage on every
 * render of every parent, and the first reads it once, before the first paint
 * this component is part of. The class still lands one paint after the
 * document's, which is what the bootstrap in `index.html` is for.
 *
 * {@link readTheme} and not {@link rememberedTheme}, because the initialiser is
 * a render: dropping an unreadable key is a write, StrictMode calls this twice
 * on purpose, and the rule against a side effect in a function React may call
 * twice is the one `chooseTheme` states below. The drop happens in the resync
 * effect instead. Nothing on screen moved either way — see {@link readTheme}.
 *
 * ## The state machine
 *
 * `docs/superpowers/plans/2026-09-21-batch-6/050-7-f1-theme-hook-model.md`
 * section 3 is the record, and `theme.model.test.tsx` is that record executed
 * against this hook. In short: four states of the store this hook reads (no
 * store; live; withdrawn after live; replaced by another live one), five events
 * (render, chooser call, slot notification, this effect, disposal), and four
 * invariants —
 *
 * 1. the displayed `choice` and `persists` are functions of the model alone,
 * 2. a superseded chooser never changes the current runtime's state,
 * 3. an unexpected storage failure propagates unchanged, with the displayed
 *    state and the stored bytes unchanged, and
 * 4. withdrawal is handled at the access boundary that observes it — the
 *    chooser's own write and this effect's own read each catch the lifecycle
 *    refusal where it is raised, and nothing else.
 */
export function useTheme(): Theme {
  const services = useApplicationServicesState();
  const remembered = services.status === 'live' ? services.remembered : null;
  const themeStore = useMemo<Remembered<ThemeChoice> | null>(
    () => (remembered ? remembered.themeChoice(isThemeChoice) : null),
    [remembered],
  );

  /**
   * The store the most recent render built, read by `chooseTheme` below to tell
   * a superseded closure apart from the current one — invariant 2.
   *
   * Assigned in the render body rather than from an effect: an effect would
   * leave one commit where a stale closure could read a stale ref, and the write
   * here is idempotent.
   */
  const themeStoreRef = useRef<Remembered<ThemeChoice> | null>(themeStore);
  themeStoreRef.current = themeStore;

  const [choice, setChoice] = useState<ThemeChoice>(() =>
    themeStore ? readTheme(themeStore) : 'system',
  );
  const [persists, setPersists] = useState<boolean>(() => themeStore !== null);
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => systemMedia().matches);

  /**
   * Resyncs `choice`/`persists` to the store this render holds — on mount, on
   * withdrawal, and on reactivation or replacement.
   *
   * {@link rememberedTheme} rather than {@link readTheme} on the live branch:
   * the write half of the drop, exactly as it was before this hook read the
   * runtime's own store. Its return value reseeds `choice` directly, which is
   * what makes a newly published runtime's own saved answer the displayed one.
   *
   * The `themeStore` this effect closes over can itself go withdrawn between
   * this render and this effect actually running — a passive effect runs after
   * every layout effect has committed, and a sibling's layout effect can retire
   * the slot in between. `rememberedTheme` then raises the lifecycle refusal;
   * caught here as the same recoverable transition the withdrawn branch already
   * models, never left to reach `AppFaultBoundary`, because a withdrawn tick is
   * a normal lifecycle event and not a fault. Anything else is rethrown.
   */
  useEffect(() => {
    if (!themeStore) {
      // Proof: on 2026-09-23, deleting these two state updates failed the model
      // at run 1: persists was true instead of false after withdrawal.
      setChoice('system');
      setPersists(false);
      return;
    }
    // Proof: on 2026-09-23, removing this recovery failed the model at run 1
    // when the withdrawn PreferenceStoreLifecycleError escaped the effect.
    try {
      setChoice(rememberedTheme(themeStore));
      setPersists(true);
    } catch (refusal) {
      if (!isPreferenceStoreLifecycleError(refusal)) throw refusal;
      setChoice('system');
      setPersists(false);
    }
  }, [themeStore]);

  /**
   * Follows the machine while the page is open.
   *
   * Subscribed unconditionally rather than only while the choice is `system`:
   * the listener costs nothing when nothing is listened to, and a subscription
   * that comes and goes with the choice is one that has to be re-attached at
   * exactly the moment somebody switches back — a race with no reason to exist.
   * What the choice decides is what {@link paletteFor} does with the answer.
   */
  useEffect(() => {
    const media = systemMedia();
    const follow = (event: MediaQueryListEvent): void => {
      setSystemPrefersDark(event.matches);
    };
    media.addEventListener('change', follow);
    // Read again on subscribing: between the lazy initialiser above and this
    // effect the machine may have changed, and the event for that change was
    // fired at nobody.
    setSystemPrefersDark(media.matches);
    return () => {
      media.removeEventListener('change', follow);
    };
  }, []);

  const palette = paletteFor(choice, systemPrefersDark);

  useEffect(() => {
    paintPalette(palette);
  }, [palette]);

  const chooseTheme = useCallback(
    (next: ThemeChoice): void => {
      // Superseded: this closure's own store is not the one the most recent
      // render read, so a replacement runtime made this callback stale
      // (invariant 2). A no-op, before any store access or state write at all.
      // Proof: on 2026-09-23, disabling this guard failed the model at run 14:
      // persists was false instead of true after a superseded chooser ran.
      if (themeStore !== themeStoreRef.current) return;
      if (!themeStore) {
        setChoice(next);
        setPersists(false);
        return;
      }
      try {
        // Written before `setChoice` below, on purpose: an unexpected failure —
        // never a lifecycle refusal, which is caught just below — must
        // propagate without this hook ever having shown a choice it could not
        // keep (invariant 3).
        rememberTheme(themeStore, next);
      } catch (refusal) {
        // Proof: on 2026-09-23, swallowing every refusal failed the model at
        // run 42: the retained write-denied Error did not reach the caller.
        if (!isPreferenceStoreLifecycleError(refusal)) throw refusal;
        setChoice(next);
        setPersists(false);
        return;
      }
      setChoice(next);
      setPersists(true);
    },
    [themeStore],
  );

  return { choice, palette, chooseTheme, persists };
}

/**
 * The live theme, shared across the tree.
 *
 * The router freezes the props it is handed into its match context — a React
 * element passed down as `account` keeps the `theme` it was built with until
 * the next navigation, which is the exact seam `wbs-theme-indicator-lies`
 * found: a control that repaints the page dark while still reporting `System`.
 * React context is not frozen: a consumer re-renders the moment the value
 * changes, whatever sits between it and the provider. {@link ThemeProvider}
 * holds the state, and the account menu reads it back through
 * {@link useThemeChoice}, so the checked answer follows the stored choice
 * live and after a reload.
 */
export interface ThemeContextValue {
  choice: ThemeChoice;
  chooseTheme: (choice: ThemeChoice) => void;
  /** See {@link Theme.persists}. Not yet read by any consumer below this provider. */
  persists: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Mounted once, above the router, where {@link useTheme} used to be called
 * directly by `app.tsx`. The palette still paints the document from here, and
 * the answer is shared with whatever reads it through {@link useThemeChoice}.
 */
export function ThemeProvider({ children }: { children: ReactNode }): ReactElement {
  const { choice, chooseTheme, persists } = useTheme();
  const value = useMemo<ThemeContextValue>(
    () => ({ choice, chooseTheme, persists }),
    [choice, chooseTheme, persists],
  );
  return createElement(ThemeContext.Provider, { value }, children);
}

/** The live theme, from anywhere under {@link ThemeProvider}. */
export function useThemeChoice(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (value === null) throw new Error('useThemeChoice must be read below a ThemeProvider');
  return value;
}
