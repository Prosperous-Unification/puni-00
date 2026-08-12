# Verification

Every number here was measured, not remembered. Where a claim in the code cites
a ratio, this is the file it cites.

## Where it was measured

Not on the workstation: this box does not run the suites (a `PreToolUse` hook
denies it, and the rule is in `AGENTS.md`). Everything below ran on the build
host `h2puni`, in a checkout of this branch at `~/wbs-dark`.

Two harnesses, both throwaway and neither committed:

- `run-e2e.sh` — `bunx playwright test --config apps/fe-01/playwright.config.ts`
  inside `mcr.microsoft.com/playwright:v1.62.1-noble`, because the host has no
  `sudo` for `playwright install-deps`.
- `run-vitest.sh` — `bunx vitest run` inside the same image.

**The second one is not a convenience.** Run on the host directly, `vitest`
dies in its worker pool with `TypeError: port.addListener is not a function`,
reports `Test Files no tests`, and **exits 0** — so `nx run fe-01:test` prints
`Successfully ran target test` having run nothing at all. The host has no
`node`; the image does. Anybody verifying a front-end change on `h2puni` and
reading that green is reading a suite that never started. CI is unaffected —
`ubuntu-latest` ships `node` beside the bun `setup-bun` installs — but the trap
is worth writing down where the next person will meet it.

## The gate

Commands, on the branch at the SHA in the PR:

```
bunx nx format:check --all
bunx nx run-many -t test lint typecheck build --parallel=2
bunx @fission-ai/openspec@1.3.0 validate --all --json
./run-e2e.sh                      # bun run e2e, in the image
./run-vitest.sh                   # nx's fe-01:test, in the image
```

Two failures on `h2puni` are the host's and not the branch's, and both were
checked against `origin/main` in the same checkout before being called that:

| Failure                                                             | Why it is the host's                                                                                                                                                                               |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fe-01:lint`: 81 × `@nx/enforce-module-boundaries` on `@/…` imports | `origin/main` produces 77 of the same in this checkout, on files this branch never touches. The four extra are this change's new files, importing the way every file in `apps/fe-01` already does. |
| `tool-bootstrap:build`, `tool-devsync:build`                        | `shellcheck` is not installed on `h2puni`. CI asserts it is present before the gate.                                                                                                               |

## The watched reds — the browser gate

Each row is the fix reverted in the working tree, `run-e2e.sh dark-mode -g …`
run against the revert, and the tree restored. `2026-08-12`, Chromium 141 in
the image above.

| Fix reverted                                                                 | What went red                                                       | What it said                                                                                                           |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `styles.css`: `button:not([data-grid], …) { background-color: transparent }` | `nothing on the page is painted a colour the palette never names`   | `Error: the Gantt chart` — `button «Arrows»`, `button «010 - Survey the existin»`, `button «020 - Draft the replacem»` |
| `styles.css`: `color-scheme: dark` on `.dark`                                | `hands the platform its own controls in the right palette`          | `Expected: "dark"`, `Received: "light"`                                                                                |
| `page-nav.tsx`: `text-foreground` on the page links                          | `the header's page links are chrome rather than the browser's blue` | `Error: the Directory link kept a user agent link colour` — `Expected: not "rgb(158, 158, 255)"`                       |
| `wbs-table.tsx`: the picker list's `var(--popover)` → `#fff`                 | `the dependency picker is a card of the palette's own colour`       | `Error: a dependency option reads at 1.05:1` — `Received: 1.0462758042084466`                                          |

### One red that did not come, and what it changed

Making the bootstrap deferred — `<script>` → `<script type="module">` — left
`is dark at the first paint, before the app has mounted` **green**. That test
blocks the entry module and then reads the root, but Playwright's `goto`
resolves on `load`, by which time a deferred script has run anyway. It is a
real guard against the bootstrap being deleted or reading the wrong key, and no
guard at all against the deferral. The one that catches that is
`index-bootstrap.test.ts`'s `is not deferred past the paint it exists to get in
front of`, which reads the opening tag's attributes out of the file — see the
jsdom table below.

## The watched reds — jsdom

Each row: the line removed, `./run-vitest.sh <file>` against the removal, tree
restored.

| Fix reverted                                                               | What went red                                                                               |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `index.html`: `<script>` → `<script type="module">`                        | `index-bootstrap.test.ts` — `is not deferred past the paint it exists to get in front of`   |
| `index.html`: the `classList.toggle` line                                  | `index-bootstrap.test.ts` — every `agrees with the module` case with a dark answer          |
| `theme.ts`: `localStorage.removeItem(THEME_KEY)` in `rememberedTheme`      | `theme.test.ts` — `refuses a stored answer that is not one of the three, and drops the key` |
| `theme.ts`: `systemMedia`'s throw                                          | `theme.test.ts` — the R5 negative for a runtime with no `matchMedia`                        |
| `theme.ts`: `media.addEventListener('change', follow)`                     | `theme.test.ts` — the platform changing under an open page on `system`                      |
| `account-menu.tsx`: `event.preventDefault()` on a modified `Enter`/`Space` | `account-menu.test.tsx` — R5 #14's guard                                                    |

## The cross-review round, 2026-08-12

Four holds came back from the cross-review
(`notes/wbs-cross-review-2026-08-12-dark-mode.md`). Two were P2 and are the
reason this branch moved at all; two are the rules this change states in prose
and did not keep. Every red below was watched on **h2puni** — jsdom under
vitest, browser in the official Playwright image — and every injection was
reverted with `git checkout --` before the next.

| #   | Fault injected                                                                     | Test that went red                                                                       | What it said                                                                                                                                              |
| --- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| X1  | `theme.ts`: `media.removeEventListener('change', follow)` deleted from the cleanup | `theme.test.ts` — `stops listening to the machine once it is gone`                       | `the hook left its listener on the platform: expected 8 to be 7`                                                                                          |
| X2  | `theme.ts`: `readTheme` pointed back at `rememberedTheme`                          | `theme.test.ts` — `reads the same answer without writing anything, for a render to call` | `expected null to be '"midnight"'`                                                                                                                        |
| X3  | `account-menu.tsx`: `onFocus` taken off `itemProps`                                | `dark-mode.spec.ts` — `answers the arrows after a palette was taken with the mouse`      | `the arrow after a click moved no focus … 24 × locator resolved to <button tabindex="0" … role="menuitem">Log out</button> - unexpected value "inactive"` |
| X4  | `styles.css`: the `button { background-color: transparent }` reset deleted         | `dark-mode.spec.ts` — `takes the platform’s grey off the light page too`                 | `the Gantt chart … Received + Array [ "button «Arrows»", "button «010 - Survey the existin»", "button «020 - Draft the replacem»" ]`                      |

### X1 — the check that could not fail, again

`stops listening to the machine once it is gone` shipped asserting the **root
class**, and it could not fail. `paintPalette` runs from a `useEffect`, React
runs no effect for an unmounted hook, so deleting the unsubscribe left the class
exactly where the test expected it. The jsdom table above is its own evidence:
`media.addEventListener` is a row in it and `media.removeEventListener` is not —
the subscribe red was watched and the unsubscribe red was never asked for.

The implementation was correct all along (`[]` deps, the same function object
added and removed), so this is a test-honesty defect and not a leak. The fix is
to ask the platform instead of the document: `vitest.setup.ts`'s stand-in now
reports `listenerCount`, and the test asserts the **difference** one mount and
one unmount make — a literal `0` would have made this test's verdict depend on
how many hooks the tests above it mounted, which the first injection run
reported as `expected 7 to be 0`. The class assertion is kept as a pin on the
consequence.

That makes at least seven instances of this shape in this repository.

### X3 — one dead arrow key, and only a browser could see it

`active` is the roving tab stop's index and, until this round, only the arrows
ever moved it. A **mouse** click on a `menuitemradio` calls `onChoose` alone
while Chromium moves the DOM focus to the clicked button, so the two disagree —
and when they disagree by exactly the step an arrow takes, `setActive` is handed
the value it already holds, React bails out of the re-render, and the focus
effect's `[open, active]` deps never change. Click `Dark`, press ArrowDown:
nothing moves. This is the interaction the control is designed around, since the
menu stays open on purpose so a reader can compare and keep choosing.

Nothing in the suite could see it. `account-menu.test.tsx` drives by keyboard,
where the two are always in sync, and jsdom's `fireEvent.click` moves no focus
even where it would matter. The fix is an `onFocus` on each item — the focus
event and not the click, because the fault is the disagreement rather than the
click, and anything that moves the focus is then answered by the same line.

### X4 — the light palette changed here too, and nothing said so

`button:not([data-grid], …) { background-color: transparent }` is in
`@layer base` and is **not** scoped to `.dark`, so the three buttons that
carried Chromium's `rgb(239, 239, 239)` lose it on a light page as well. Every
assertion in `dark-mode.spec.ts` ran behind `chooseTheme(page, 'Dark')`, no
other spec in the repository reads a `backgroundColor`, and there is no
screenshot baseline anywhere — so a real change to the light UI was shipping
inside a change whose body describes dark-palette repairs, unmentioned and
unmeasured.

It is an improvement: the requirement "no surface is painted a colour the
palette does not name" is palette-agnostic and the grey chip was never a token.
What it was not is stated or measured. Both now are — the sweep runs from the
light page too, and the three elements it finds under the injection are the same
three, by name, that the dark sweep finds.

### The collision with `table-mechanics`, closed on this side

#49 landed first (`704eba9`), so this branch was rebased onto it and inherits
its two hover tokens. The cross-review flagged the semantic half: `--grid-hover`
and `--grid-band-hover` carry no `.dark` twin on the argument that both are
mixes of properties `.dark` re-points, so the pair "inverts by itself" — and
that argument was written while `.dark` was **unreachable**. Nothing in the app
put the class on the document until this change, so the arithmetic had been
argued and never measured, and neither branch's e2e read a hovered grid row in
dark. Whichever landed second would ship an unmeasured surface; this is the one
that landed second.

`e2e/hover-cards.spec.ts`'s two step tests now run in both palettes. Green in
dark on the merged tree, and non-vacuous:

| Fault injected                                                       | Light case      | Dark case          |
| -------------------------------------------------------------------- | --------------- | ------------------ |
| `--grid-band-hover` overridden to `--grid-hover`'s 7%, below `:root` | `Received: 7.0` | `Received: 3.5748` |

Both against a `< 3` bar, so both go red. The dark case is a third of the
signal for the same fault, because sRGB luminance compresses at the dark end —
stated in the test rather than left to be found, because a _smaller_ mismatch
than this one would pass in dark and fail in light.

**And one thing that turned out to be false as first written.** The same
override placed _inside_ the `.dark` block changed no pixel: the grid's token
block is `:root`, which is `(0, 1, 0)` — equal weight to `.dark` — and it is
written after it, so source order decides and `:root` wins. A `.dark` override
of a `--grid-*` token has to sit below that block to exist at all. Measured
2026-08-12, after a first injection run passed and the reason turned out to be
the cascade rather than the test. The note is in the `.dark` block, which is
where somebody about to make that mistake is reading.

### The two P3s taken, and the one left

Taken, because both are one line and both are rules this change states
elsewhere in its own prose:

- `readTheme` (X2): the lazy `useState` initialiser is a render, StrictMode
  double-invokes it on purpose, and dropping an unreadable key is a write. The
  read and the write are now two functions; the mount effect does the write.
  Nothing observable moved — `removeItem` is idempotent and only a corrupt
  stored value reaches it — which is why this is a rule kept, not a defect
  fixed.
- `setActive` called from inside the `setOpen` updater in the trigger's
  `onClick`: computed beside the setter now, the way `chooseTheme` does it.

**Left, deliberately: storage that throws.** `localStorage.getItem` is
unguarded here, and it is unguarded in `gantt-panel.tsx`'s `rememberedArrows`,
`project-page.tsx` and eleven places in `wbs-table.tsx`. This change copied an
existing decision rather than making one, and a `SecurityError` in a
partitioned iframe takes the whole app down with or without this branch.
A repo-wide `safeStorage` is worth doing and is not this change's to do alone.
Cross-tab sync is the same call and is Dany's, not a reviewer's: nothing in the
proposal or the spec claims it, and `wbs.ganttArrows` set the precedent.

## The palette's own defects: before and after

Ratios are WCAG contrast over the real composited surface — every ancestor's
paint stacked until an opaque one is found, rasterised through a canvas because
a token resolves to `oklch(…)` and a tint to `oklab(…)`, neither of which can be
turned into a luminance by reading the string. The method is `contrastOf` in
`e2e/dark-mode.spec.ts`.

**Read the middle column.** The audit that opened this change forced `.dark` on
a root that declared no `color-scheme`, so the browser still believed the page
was light and painted its own light defaults onto it. Declaring `color-scheme:
dark` moves those defaults on its own, without touching a single component —
which is why two of the four fixes below buy no contrast at all, and are not
asserted as though they did.

| Surface                                | Forced `.dark`, no `color-scheme`       | `color-scheme: dark` alone                             | Shipped                                              |
| -------------------------------------- | --------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------- |
| Gantt row label (`<button>`, unstyled) | `rgb(239, 239, 239)` paint — **1.10:1** | `rgb(107, 107, 107)` paint — **5.13:1**                | `--background`, 15.9:1                               |
| `Log out` (`<button>`, unstyled)       | `rgb(239, 239, 239)` paint — **1.10:1** | `rgb(107, 107, 107)` paint — 5.13:1                    | `--popover`, 15.4:1                                  |
| Header page link (`<a>`, unstyled)     | `rgb(0, 0, 238)` ink — **2.14:1**       | `rgb(158, 158, 255)` ink — **8.0:1**                   | `--foreground`, `oklch(0.984 0.003 247.858)`, 15.9:1 |
| Dependency picker option               | `#fff` card — **1.05:1**                | `#fff` card — **1.05:1** (hard-coded, follows nothing) | `--popover` / `--popover-foreground`, 12.6:1         |

So the change has one root-cause fix and three consequences of taking it
seriously:

1. `color-scheme` beside the tokens. This is the one that moves the numbers.
2. The `<button>` reset, and `text-foreground` on the links. These move nothing
   a reader can measure as contrast — 5.13:1 and 8.0:1 are both legible — and
   they are still defects: a mid-grey and a periwinkle that no token names, in a
   palette whose whole claim is that it names everything. Held by
   `nothing on the page is painted a colour the palette never names` and by an
   equality against `var(--foreground)`, not by a ratio.
3. The picker's tokens. The only one of the four that `color-scheme` cannot
   touch, because a hard-coded `#fff` follows nothing.

### The check that could not fail, and how it was caught

Both of the fixes in (2) were first asserted as `≥ 4.5:1`, and both reverts
stayed green — because `color-scheme` had already lifted them past 4.5. The
`ButtonFace` sweep had the same shape: it compared backgrounds against the
single literal `rgb(239, 239, 239)`, which no element on a correctly-declared
dark page is ever painted, so it passed with the `<button>` reset deleted.

Found by watching for a red that never came. Fixed by naming both faces the user
agent has — `rgb(239, 239, 239)` and `rgb(107, 107, 107)` — and by asserting the
link **is** the palette's ink rather than merely legible. Both reverts go red
now; they are the first and third rows of the browser table above.

This is R5's own failure mode, and the sixth-plus instance of it in this
repository: a check whose green says nothing because its red is unreachable.

## The transition, and a red about nothing

`the header's page links…` failed at **1.03:1** on a branch where the fix was
correct. The chrome carries `transition-colors`, so flipping the class starts a
~150ms colour animation on every surface at once, and a `getComputedStyle` taken
inside that window answers with an interpolated `oklab(0.5209 …)` — a colour
belonging to neither palette. Measured mid-flight: 1.03:1. Measured at rest:
`oklch(0.984 0.003 247.858)`, 15.9:1.

The same window is worse for the sweep, which compares against literals: an
interpolating background matches no literal at all, so the check would have been
green for the wrong reason.

`chooseTheme` now drains `document.getAnimations()` before returning, in
`dark-mode.spec.ts` and in `deps-cell.spec.ts` both. Document-wide rather than
per-element because the flip moves every surface and the reads walk ancestors;
safe to drain rather than wait out because nothing in this app animates without
end — checked, no `animate-spin` and no `infinite` in `apps/fe-01/src`.

## `color-scheme` at the first paint

`is dark at the first paint` asserts the class and deliberately not
`color-scheme`. Under the dev server the stylesheet is an import of the entry
module that test refuses, so there is no `.dark { color-scheme: dark }` on the
page to read and Chromium answers `normal`. Watched: asserting it there failed
on `expected 'normal' to be 'dark'` with the bootstrap working perfectly. The
claim is made instead by `hands the platform its own controls in the right
palette`, against a page whose stylesheet has loaded — which is the only page it
is a claim about.
