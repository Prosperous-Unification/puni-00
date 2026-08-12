import { useCallback, useEffect, useState } from 'react';

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
export const THEME_KEY = 'wbs.theme';

/** The query the platform answers with its own light/dark setting. */
export const DARK_QUERY = '(prefers-color-scheme: dark)';

/** The class `styles.css` hangs the dark token set on. */
export const DARK_CLASS = 'dark';

function isThemeChoice(claimed: unknown): claimed is ThemeChoice {
  return claimed === 'system' || claimed === 'light' || claimed === 'dark';
}

/**
 * The choice as this browser last said it — and `system` where it has never
 * said, which is the state every reader starts in.
 *
 * The stored value is a claim, not a fact: user-editable storage read at a
 * boundary. Anything that is not one of the three takes the key with it and the
 * answer goes back to `system`. `JSON.parse` and a membership check rather than
 * a bare string compare, for {@link https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage | localStorage}'s
 * reason and `rememberedArrows`': the three answers a browser can hold have to
 * be told apart from the strings that merely look like them, and the key is
 * written with `JSON.stringify` so it must be read with its inverse.
 *
 * Deliberately not the "unknown is not OK" throw, for `rememberedArrows`'
 * reason: the alternative is an app nobody can open until they clear storage by
 * hand, over a preference about a colour.
 */
export function rememberedTheme(): ThemeChoice {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === null) return 'system';
  let claimed: unknown;
  try {
    claimed = JSON.parse(stored);
  } catch {
    // Nothing but this module writes the key, so the only way here is a
    // hand-edited store. Recovered from below rather than rethrown.
    claimed = undefined;
  }
  // Proof: this refusal replaced by `return stored as ThemeChoice`, which is
  // what "read the claim, drop nothing" comes to. `refuses a stored answer that
  // is not one of the three, and drops the key` failed on `expected '"midnight"'
  // to be null` — the unreadable key left in storage to be read again next
  // time — and `refuses storage that is not JSON at all` with it.
  if (!isThemeChoice(claimed)) {
    localStorage.removeItem(THEME_KEY);
    return 'system';
  }
  return claimed;
}

/** Writes the answer down. `system` is stored, not absent — see {@link rememberedTheme}. */
export function rememberTheme(choice: ThemeChoice): void {
  localStorage.setItem(THEME_KEY, JSON.stringify(choice));
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

/** What {@link useTheme} hands back: the answer, and the way to change it. */
export interface Theme {
  choice: ThemeChoice;
  /** What is on screen right now, which is `choice` unless `choice` is `system`. */
  palette: Palette;
  chooseTheme: (choice: ThemeChoice) => void;
}

/**
 * The palette, followed and remembered, for as long as the app is open.
 *
 * Mounted once, in `app.tsx`, above the branch that decides whether anybody is
 * signed in — so the sign-in form is painted the same as the plan behind it,
 * and a remembered dark page does not go white the moment somebody signs out.
 *
 * `useState(rememberedTheme)` — the lazy initialiser, not `useState(rememberedTheme())`
 * — for `rememberedGanttHeight`'s reason: the second reads storage on every
 * render of every parent, and the first reads it once, before the first paint
 * this component is part of. The class still lands one paint after the
 * document's, which is what the bootstrap in `index.html` is for.
 */
export function useTheme(): Theme {
  const [choice, setChoice] = useState<ThemeChoice>(rememberedTheme);
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => systemMedia().matches);

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

  const chooseTheme = useCallback((next: ThemeChoice): void => {
    // Written here, beside the setter and outside it: a state updater React may
    // call twice is no place for a side effect. `gantt-panel.tsx`'s arrows
    // switch makes the same bargain for the same reason.
    rememberTheme(next);
    setChoice(next);
  }, []);

  return { choice, palette, chooseTheme };
}
