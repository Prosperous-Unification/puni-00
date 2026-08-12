# Tasks

Ordered TDD slices. Each negative is watched failing before the line it guards
is believed (R5).

## 1. The setting, as a module

- [x] `lib/theme.ts`: `ThemeChoice` (`system` | `light` | `dark`), `THEME_KEY`,
      `rememberedTheme`/`rememberTheme` around `localStorage`, `systemMedia`,
      `paletteFor`, `paintPalette`, and the `useTheme` hook that holds the
      answer, subscribes to the platform, and repaints the root.
- [x] `systemMedia` throws where the runtime has no `matchMedia` (R5: the only
      source there is for "what is this machine set to"). jsdom has none, so
      `vitest.setup.ts` grows a **driveable** stand-in — one list per query,
      cached, with a `setMatches` that fires at live listeners. A stub that
      answered `false` for ever could not show the fault this exists for.
- [x] `theme.test.ts`: the three states resolved, storage read back, a stored
      value that is not one of the three refused **and the key dropped**,
      storage that is not JSON at all, the platform changing under an open page
      while the choice is `system`, the same change ignored while it is not,
      and the subscription released on unmount.
- [x] Watch each fail with the line it names removed.

## 2. The palette before the first paint

- [x] An inline, non-deferred script in `index.html` reading the same key and
      putting `.dark` on the root. React mounts one paint after the document,
      so without this a browser remembering `dark` shows a white page first —
      to exactly the reader who asked not to be shown one.
- [x] `index-bootstrap.test.ts`: run **that script**, as text, against every
      stored value `rememberedTheme` has an answer for × both platform answers,
      and assert it agrees with `paletteFor(rememberedTheme(), …)`. Plus: the
      key and the query are in it by name, and it carries no attribute that
      would defer it.
- [x] Watch it fail with the script deleted, with the key misspelt, and with
      `type="module"` added.

## 3. The control

- [x] `chrome/theme-choice.tsx`: three `menuitemradio`s in one `role="group"`
      named `Theme`, drawn as a row inside the account menu's existing width.
- [x] `account-menu.tsx`: a roving tab stop over four items, arrows in both
      axes, wrapping, `Escape`/`Tab` shared by every item, and the modified
      `Enter`/`Space` taken away with `preventDefault` — R5 #14, whose fault
      was a guard that returned without it.
- [x] `app.tsx` mounts `useTheme` **above** the signed-in branch, so the
      sign-in form is painted like the plan behind it.
- [x] `account-menu.test.tsx`: the three answers offered as one question, the
      one in force checked and only that one, the answer reported, the menu
      **staying open** on a choice, `Log out` still the item the menu opens
      onto, the arrows walking all four and wrapping, the roving `tabindex`,
      and `Escape` from a palette item.
- [x] Watch each fail with the wiring it names removed.

## 4. The dark palette's own defects

Each of these was found by measuring, in Chromium, with the probe described in
`verify.md`. The token values before and after are in the same file.

- [x] `styles.css`: preflight's `background-color: transparent` on `<button>`,
      outside the grid. Three raw buttons kept the user agent's `ButtonFace`;
      on a dark page that is near-white paint under near-white text.
- [x] `styles.css`: `color-scheme` beside the tokens on `:root` and `.dark`, so
      the platform's own scrollbars, carets and pickers follow the class rather
      than a second declaration written from JavaScript.
- [x] `page-nav.tsx`: `text-foreground` on the page links, which had kept
      `-webkit-link` blue — the reset gives `color: inherit` to form controls
      and not to anchors.
- [x] `wbs-table.tsx`, attributes only: the dependency picker's option list
      reads `--popover`/`--popover-foreground`/`--border` instead of
      `#fff`/`#ccc`, and its active option drops the inline `#e8f0fe` that was
      outranking the stylesheet's own `aria-selected` rule.

## 5. The browser facts

In `apps/fe-01/e2e/dark-mode.spec.ts` — jsdom computes no colours and has no
`prefers-color-scheme` (R5 #14–16).

- [x] The control repaints the page, and the answer survives a reload.
- [x] `emulateMedia({ colorScheme: 'dark' })` paints the app dark with nothing
      chosen, and does not once `Light` has been.
- [x] A remembered dark page is dark **at first paint**, asserted before the
      app has mounted.
- [x] `color-scheme` on the root follows the palette.
- [x] Contrast, measured over the real composited surfaces: the Gantt's row
      labels, `Log out`, and the dependency picker's options, in dark.
- [x] No visible element painted the user agent's button face.
- [x] Watch each fail with the fix it covers reverted.

## 6. The existing both-palette checks

- [x] `hover-cards.spec.ts` and `deps-cell.spec.ts` toggle `.dark` by hand and
      say in a comment that the app ships no theme switch. It does now: the
      comments are corrected and one of the two is driven **through the
      control**, so the direction rule is asserted against the palette a reader
      can actually reach.

## 7. Gate

- [x] `bunx nx format:check --all`
- [x] `bunx nx run-many -t test lint typecheck build --parallel=2`
- [x] `bun run e2e` (this checkout's dev server only — see the landmine)
- [x] `openspec validate --all --json`
- [x] `verify.md` with the commands, their output, and the failure-proof table.
