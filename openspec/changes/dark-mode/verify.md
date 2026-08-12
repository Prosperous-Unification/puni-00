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
