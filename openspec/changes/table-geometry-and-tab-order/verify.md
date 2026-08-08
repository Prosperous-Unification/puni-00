# Verification

## The gate

```
$ bunx nx format:check --all
(no files listed, exit 0)

$ bunx nx run-many -t test lint typecheck build --parallel=2
NX   Successfully ran targets test, lint, typecheck, build for 21 projects
      fe-01 (vitest)   22 files   485 pass  0 fail   (445 before this change, +40)

$ bunx nx run-many -t test lint typecheck --projects=fe-01 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck for project fe-01
      Test Files  22 passed (22)
      Tests       485 passed (485)

$ bunx @fission-ai/openspec@1.3.0 validate --all --json
{"items": 35, "passed": 35, "failed": 0}
```

The 40 new fe-01 tests: 5 in `table-frame.test.ts`, 13 in `box-geometry.test.ts`,
14 in `wbs-table.test.tsx` (6 for the widths and the column names, 8 for Tab),
and 8 in `vite-config.test.ts` — a file that existed before this change and had
never been executed by anything, see "Cross-review, 2026-08-08".

**The ten tests in `apps/fe-01/e2e/layout.spec.ts` are not in any figure
above.** They were written on a machine with no browser and first run on
2026-08-08, on h2puni, against a real chromium and the real three-app stack:

```
$ bun run tools/dev/setup.ts && bunx playwright test --config apps/fe-01/playwright.config.ts
  10 passed (17.1s)
```

Their fault table is "The browser gate itself", below.

## The checks, and the faults that broke them

Every row was watched failing with the fault in place and passing again with it
removed: the unit-level tables on 2026-08-07 on h1claw, and "The browser gate
itself" at the end on 2026-08-08 on h2puni, which is where a browser exists.

### The widths

| Check                                                                    | Fault injected                                                                                    | What the run reported                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The pinned offsets are prefix sums of the width table (`table-frame.ts`) | `PINNED_COLUMNS` written back out by hand with `number` at 180 instead of derived from `widthFor` | `is the same table the pinned offsets are prefix sums of` failed on `expected 180 to be 168`; in the same run the pre-existing `starts at the left edge and stacks each column after the last` failed on `{left: 28, width: 180}` against `{left: 28, width: 168}` |
| An unsized column id is an error, not a width (`widthFor`)               | `throw new UnknownColumnError(columnId)` replaced by `return 120`                                 | `treats an id it never renders as an error, not a plausible width` failed on `expected function to throw an error, but it didn't`                                                                                                                                  |
| The colgroup declares the columns **in order** (`wbs-table.tsx`)         | the colgroup rendered from a reversed id list                                                     | `declares every rendered column once, in the order they are rendered` failed on `['110px','260px','90px']` against `['28px','168px','360px']`                                                                                                                      |
| The popover cells do not clip (`opensAPopover`, `wbs-table.tsx`)         | the `opensAPopover` spread removed from the `<td>` style                                          | `does not clip the cells whose popovers open over the rows` failed on `expected 'hidden' to be 'visible'`; in the same run `gives every cell the chrome its declared width is measured with` failed on the same comparison                                         |
| …and covers the picker columns, not only `depends` and `notes`           | `opensAPopover` narrowed back to `new Set(['depends', 'notes'])`                                  | `does not clip the cells whose popovers open over the rows` failed on `expected 'hidden' to be 'visible'`, at the `team` cell                                                                                                                                      |
| Every cell names its column (`wbs-table.tsx`)                            | `data-column` dropped from the `td`                                                               | `names every cell with the column it belongs to, in both halves of the table` failed on a row of `null`s against the header's names                                                                                                                                |

Four more in this group were watched failing before the code existed rather
than by injection — written first, run against the unmodified component:
`declares every rendered column once` (`expected +0 to be 18`), `is as wide as
its columns add up to` (`expected '' to be 'fixed'`), `gives every cell the
chrome its declared width is measured with` (`expected '' to be 'hidden'`), and
`lets no control in a cell assert a width of its own`
(`expected ['100%','auto',''] to include '22em'`).

### Tab

| Check                                                            | Fault injected                                                         | What the run reported                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A caret is only asked of an element that has one (`focusCellAt`) | the element check removed, so `setSelectionRange` reaches a date input | `the arrows land in a date cell without asking it for a caret it has none of` failed on `expected [ …(2) ] to deeply equal []` — the test collects `window` error events, because as a bare focus assertion the `InvalidStateError` surfaced as a run-level uncaught error attributed to no test |
| Disabled cells are outside the grid (`editableGrid`)             | `:not([disabled])` dropped                                             | `steps over the date cell until the plan is on a calendar` failed with the key taken and nothing landed                                                                                                                                                                                          |
| Read-only cells are outside the grid (`editableGrid`)            | `:not([readonly])` dropped                                             | **2 failed**: `never stops on a parent's rolled-up figures` (the focus moved onto the parent's box instead of staying) and `Shift+Tab steps over a parent's read-only estimate boxes` (landed on `Dev pessimistic … readonly=""` instead of the team box)                                        |
| Every cell handles Tab (`wbs-table.tsx`)                         | `onTabKey` dropped from the notes cell's chain                         | `walks every field of a row in turn, and on into the next row` failed, `Notes for 010` where `Name of 020` was expected                                                                                                                                                                          |
| A picker handles Tab (`creatable-picker.tsx`)                    | `gridCell?.onTabKey(e)` dropped, leaving the bare `return`             | the same walk failed at `Service or team for 010`                                                                                                                                                                                                                                                |
| The dependency box handles Tab (`wbs-table.tsx`)                 | its Tab branch dropped, leaving the bare `return`                      | **2 failed**: `Tab from the depends input closes the picker, discards the typed search, and moves once` and `Shift+Tab from the depends input lands in the name, not on a chip button`                                                                                                           |
| The grid does not wrap at its edge (`focusAdjacentCell`)         | the `at + delta < 0` guard removed, so the index reaches `.at(-1)`     | `at the edges of the grid the key is left to the browser` failed — the key was taken and the focus jumped to the last cell of the table                                                                                                                                                          |

Seven of the eight Tab tests were also watched failing before the feature
existed. The eighth, `at the edges of the grid the key is left to the browser`,
passed against the unmodified component — it asserts what the browser is left,
which a table that does nothing satisfies — and is kept honest by the
wrap-around fault in the last row above.

### The layout gate's arithmetic

The predicates the browser spec asserts with live in
`src/components/wbs/box-geometry.ts`, deliberately: everything about this
change that can be tested without a rendering engine has been pulled out to
where the repo gate runs it.

| Check                                                      | Fault injected                                           | What the run reported                                                                          |
| ---------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| The half-pixel tolerance exists (`findOverlap`)            | `EDGE_TOLERANCE` dropped from the comparison             | `forgives a half-pixel, which is a border rounding and not an overlap` failed                  |
| …and does not swallow a real overlap                       | (asserted, not injected) a box 0.6px over its neighbour  | `reports more than a half-pixel, so the tolerance cannot swallow a real overlap` passes        |
| Adjacency is pairwise (`findOverlap`)                      | the walk kept the first box rather than the previous one | `reports the first offending pair rather than the last` failed                                 |
| A control overrunning to the right is seen (`findOverrun`) | the right-edge branch replaced by `return undefined`     | `says which edge a control ran past on the right` failed on `expected undefined to be 'right'` |
| The tolerance exists on the left edge too (`findOverrun`)  | `EDGE_TOLERANCE` dropped from the left-edge branch       | `forgives a half-pixel on either edge` failed on `expected 'left' to be undefined`             |

All thirteen were also watched failing before the module existed
(`Failed to resolve import "./box-geometry"`).

### The browser gate itself

**Observed on 2026-08-08**, on h2puni: a throwaway clone, bun pinned to CI's
1.3.14, the three real servers, and chromium 151 inside
`mcr.microsoft.com/playwright:v1.62.1-noble` — h2puni has no sudo, so
`playwright install-deps` could not run and the official image supplied the
system libraries instead. Each fault was injected alone and reverted before the
next; the clean run either side reported **10 passed**.

| Check                                                                                                                   | Fault injected                                                                                               | What the run reported                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A control stays inside its cell (`keeps every control inside the cell it belongs to`)                                   | `['name', 360]` → `['name', 100]` in `table-frame.ts`, and the Name cell's `width: '100%'` → `width: '22em'` | failed on `["Name of 010 in name runs past the name cell", "Name of 020 in name runs past the name cell"]` against `[]`. Two more failed for a reason the prediction missed — a 260px-narrower table cannot scroll 400px, so `scrollFrameTo` failed on `expected 400 … 376` |
| Two width tables again (`lays every body row out with no two cells on top of each other`, and the heading-row test)     | `PINNED_COLUMNS` replaced by literals with `number` at 180                                                   | **2 failed**, exactly those two, both on the pair `{id: 'name', x: 248, width: 360}` → `{id: 'depends', x: 596, width: 220}` — Name 12px into "Depends on" with the frame unscrolled                                                                                        |
| The pin itself (`holds the pinned columns there once the table is scrolled sideways`)                                   | `position: 'sticky'` dropped from `pinnedCellStyle`                                                          | failed on `{drag: -400, number: -372, name: -204}` against `{drag: 0, number: 28, name: 196}` — the block scrolled away with its row. **1 failed, not 2**: see below                                                                                                        |
| The pinned block stops at its own edge (`paints the pinned block over the row that scrolls behind it, and stops there`) | `PINNED_COLUMNS` pinned in the order `['name', 'number', 'drag']`                                            | failed on `expect(PINNED_IDS).not.toContain('number')`, received `["name", "number", "drag"]` — a pinned column owning the pixel past the block's right edge                                                                                                                |
| The popovers really leave their cell (`opens the dependency list …`, and the notes one)                                 | the `opensAPopover` spread dropped from the `<td>` style in `wbs-table.tsx`                                  | **2 failed**, exactly those two, on `ownsPixelBelow`: `4px below the depends cell is <input> in the team column, not the open list` and `4px below the notes cell is <textarea> in the notes column, not the preview`                                                       |
| The gate runs at all (the `pixels` job)                                                                                 | —                                                                                                            | ten tests reported and `wbs-table.png` in the uploaded artifact — see "The seed the gate never had" below for the run that first got there                                                                                                                                  |

**Two predictions written without a browser were wrong.** Both are corrected in
the comment at the foot of the spec rather than dropped.

Fault A was predicted to fail one test and failed three: narrowing Name by
260px leaves a table that cannot scroll 400px, so `scrollFrameTo`'s own
precondition — `expect(reached).toBe(scrollLeft)`, added because an unscrolled
table would make every sticky assertion pass meaninglessly — fired first in the
two scrolled tests. That is the precondition working, not the pin being
measured, and it is the reason those two are not evidence about the pin.

Fault C was predicted to break the `elementFromPoint` probe as well, and does
not. The probe asks which cell owns the pixel either side of the _measured_
right edge of the Name cell, and an unpinned table answers correctly: the
neighbour is where the declared widths put it. Losing the pin is invisible to a
probe that follows the cell. So the probe needed a fault of its own, and finding
one took three attempts — the two that did **not** break it are recorded here
because a negative test that fails to fail is exactly what R5 is about:

- dropping `position: 'sticky'` (fault C): 9 passed, the probe among them.
- dropping `zIndex` from `pinnedCellStyle`: **10 passed**. A sticky cell is a
  positioned element, so it already paints over the unpositioned cells sliding
  behind it; those two z-indexes only order the sticky elements against each
  other. The probe cannot see their absence, and nothing else in this spec can
  either — stated rather than left as an assumption.
- reversing the pin order: the probe failed, as tabled above.

### The seed the gate never had

The first CI run of the `pixels` job (31215500819) failed all ten tests
identically in `beforeEach`, on
`waiting for getByRole('button', { name: 'New project' })` after a 60s timeout.
The page snapshot in the artifact showed why: `Something went wrong (http_404)`
under the register form — the account was never created.

`src/lib/api.ts` fetches same-origin paths, because the edge serves the app and
proxies `/api/*` and `/ws` on the same host. Every environment gets that routing
from Caddy (`tools/tool-compose/src/templates/site.caddy.tmpl`), including
dev-in-a-container, so nothing had ever asked what a bare `bunx vite` does with
`POST /api/auth/register`. It serves `index.html` and answers 404. The layout
gate is the first thing to run this stack with no edge in front of it.

`apps/fe-01/vite.config.ts` now carries the same two routes for the dev server —
`^/api/` to be-01 with its prefix intact, `/ws` to gw-01 with the upgrade
forwarded — read from `VITE_BE_URL`/`VITE_GW_URL` and throwing if the app has no
`.env`, on `command === 'serve'` only so that `nx build fe-01` on a checkout
with no `.env` is unaffected. Reverting that one block reproduces the ten
timeouts exactly; the failure was watched before the fix and after reverting it,
on h2puni, which is the proof for this change.

This is the only production-source file this fix touched. It is dev-server
configuration — nothing in `dist/apps/fe-01` changes — and `bun run dev` behind
Caddy never reaches it, because Caddy answers `/api/*` before Vite sees it.

The `command === 'serve'` guard and the throw were both watched, on h2puni:

```
$ nx run fe-01:build                          # .env present
NX   Successfully ran target build for project fe-01
$ mv apps/fe-01/.env /tmp && nx run fe-01:build
NX   Successfully ran target build for project fe-01      # the gate job's case
$ cd apps/fe-01 && bunx vite                  # still no .env
error when starting dev server:
Error: apps/fe-01/.env must set VITE_BE_URL and VITE_GW_URL; got
VITE_BE_URL=(unset) VITE_GW_URL=(unset). Run `bun run dev:setup` to seed it
from .env.example.
```

A build on a checkout with no dev settings is unaffected; a dev server that
would proxy nowhere refuses to start rather than 404ing every request an hour
later.

**Fault A is the one to read carefully.** The obvious expectation — "a control
that overruns its column shows up as an overlap" — is wrong, and writing it
down is the point: a table never lays two cells on top of each other, so a
`22em` box in a 100px column is only ever visible as _containment_. If the
containment test were dropped as redundant, that fault class would pass the
gate untouched. The adjacency tests catch the other half, where the offsets and
the layout disagree (fault B), and the two halves are not substitutes.

## Cross-review, 2026-08-07

Two reviewers read the whole branch after the tables above were written. Three
findings, all fixed here; a fourth — RTL sticky offsets — was parked by both,
because nothing in this product has an RTL contract to hold it to.

**The cell clip really did cut the popovers off, and the reasoning that said it
did not was wrong CSS.** The claim was that an absolutely positioned box is
clipped only by a positioned ancestor's overflow, so a `position: relative`
wrapper that does not clip keeps the dependency listbox and the notes preview
visible. That is backwards. An absolutely positioned box escapes an
`overflow: hidden` ancestor only when its containing block is **outside** that
ancestor — and here the containing block is the wrapper span, which is
_inside_ the `<td>` doing the clipping. Both popovers were being cut to the
cell rectangle in a real browser; no jsdom test could see it, because jsdom
lays nothing out and clips nothing.

The fix keeps the backstop and cuts holes in it: a column holding a popover
renders its `<td>` with `overflow: visible`, written out as an explicit
exception (`opensAPopover` in `wbs-table.tsx`) with the rule stated beside it.
Containment for those cells is now carried by their controls being `width: 100%`
with `border-box` sizing — which `lets no control in a cell assert a width of
its own` pins in jsdom and `keeps every control inside the cell it belongs to`
measures in a browser.

**Four kinds of column, where the finding named two.** The reviewers wrote the
fix direction as `depends` and `notes`. Those are not the only cells with a
popover in them: a `CreatablePicker`'s list is the same absolutely positioned
box in the same kind of wrapper, and it is rendered in the service/team cell
and in each role's assignee cell. Those columns were clipped by this branch's
own `overflow: hidden` exactly as the other two were — a dropdown cut to a
one-line cell is a picker nobody can pick from — so the exception covers them
too, `<roleId>-assignee` matched by suffix the way `widthFor` sizes it. This is
the one place this fix wave went past what was asked for, and it is called out
here rather than folded in quietly. The narrowed version (`depends` and `notes`
only) was watched failing at the `team` cell; the row is in the table above.

The unit test that claimed to prove the old reasoning asserted the wrong
condition (the wrappers' styles) and its `Proof:` narrative described a fault
that could never have broken the real invariant. It has been rewritten to
assert the cells — `depends`, `notes`, `team` and every `-assignee` column
visible, `name` still hidden — and watched failing with the exception removed.
The two browser tests that measure the escape in pixels have since been watched
failing on a real chromium, with the `opensAPopover` spread dropped from the
`<td>` style: **2 failed**, exactly those two, on `ownsPixelBelow` — the row is
in the fault table above and the run is task 4.6. They measure the dependency
list and the notes preview, not the picker list, whose single "add this one"
entry is too short to be sure of clearing the cell it hangs from.

**One assertion in the browser spec could not fail.** The occlusion probe
finished with
`expect(PINNED_IDS).not.toContain(edge.outside ?? 'nothing at all')`, which
passes when the probe finds nothing at all — the state a pinned block painting
over the whole row would produce. It is now three assertions with distinct
messages: the pixel past the pinned block belongs to some cell, that cell is
not a pinned one, and it is the column the width table declares at that offset.
The third is computed from the declared widths rather than written out as
`depends`: by `SCROLLED` px both `depends` and `team` have scrolled in behind
the pinned block, so the first unpinned column is not the one showing at its
edge.

**The cheat sheet described Tab wrongly.** It said that past the last field of
a row Tab reaches that row's Duplicate and Delete. It does not: the grid is the
whole table, so Tab at the end of a row walks into the first field of the next
one, and the actions are reached only past the last field of the last row. The
entry now says that, and the same wrong sentence has been corrected in the
`onTabKey` JSDoc and in the comment on `at the edges of the grid the key is
left to the browser`. `PROVEN_BY` names tests rather than copy, so it is
unchanged and still passes.

## Cross-review, 2026-08-08

Both reviewers read the dev-server proxy on top of the branch. Two findings and
a stale sentence, all three fixed here.

**A test file that had never run once.** `apps/fe-01/vite.config.test.ts`
asserted `config.server?.host` on a default export that had become a factory,
so every one of its three assertions read `undefined` — and nothing failed,
because nothing ran it. Two reasons, not one: `vitest.config.ts` included only
`src/**`, and vitest's default `exclude` ends in
`**/{…,vite,vitest,…}.config.*`, which swallows that filename whatever the
include says. Watched: with the include widened but the name left alone,
`bunx vitest run vite.config.test.ts` printed `No test files found, exiting with
code 1`. So the file is now `apps/fe-01/vite-config.test.ts`, the include is
`['src/**/*.{test,spec}.{ts,tsx}', '*.{test,spec}.{ts,tsx}']`, and the suite
went from **21 files / 477 tests** to **22 files / 485 tests** with
`vite-config.test.ts (8 tests)` named in the run.

It calls the factory with a `ConfigEnv` for both commands and stubs `loadEnv` —
otherwise the "no env" case would only ever run in CI and the "env set" case
only ever here, each machine skipping the half the other proved. Five faults,
one at a time, `bunx vitest run vite-config.test.ts` on h1claw:

| Fault injected into `vite.config.ts`              | What the run reported                                                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| the `server.proxy` line deleted                   | **4 failed** — two on `the serve config has no proxy to assert on`, two on `expected [Function] to throw an error`       |
| `'^/api/'` back to the plain `'/api'` it replaced | **2 failed** — the key set, and the routing one on `/apiary`: `expected true to be false`                                |
| the `'/ws'` entry deleted                         | **2 failed** — `expected { Object (^/api/) } to deeply equal { …(2) }`, then `expected false to be true` on `/ws`        |
| the `command === 'serve'` guard dropped           | **1 failed** — `a build must not read apps/fe-01/.env`, thrown by the stub                                               |
| the `!backend \|\| !gateway` guard dropped        | **2 failed** — both `expected [Function] to throw an error`                                                              |
| `host: '0.0.0.0'` back to `'localhost'`           | **1 failed** — `expected 'localhost' to be '0.0.0.0'`, the oldest assertion in the file, seen failing for the first time |

**`'/api'` was a prefix, and the edge's matcher is a subtree.** Vite matches a
string proxy key with `startsWith` (`doesProxyContextMatchUrl`), so `'/api'`
also forwarded `/apiary`, which Caddy's `handle /api/*` hands to the SPA —
"/foo/\* will not match /foo or /foobar", its path matcher docs. The key is now
the regex `^/api/`, which is the same set. `/ws` is left as a string on
purpose: the template says `/ws*`, not `/ws/*`, and a string key already means
exactly that prefix. The comment claiming the config matched the template
"route for route" now says which matcher is which shape instead of claiming
they are the same. `vite preview` throwing without an `.env` — the other
reviewer's note — is stated in the `@throws` rather than changed.

## What is proven, and by what

**Proven by the repo gate, on this machine:** the width table and its
consumers, the Tab grid, the geometry predicates, and the dev-server proxy —
485 fe-01 tests, the fault tables above.

**Proven by running the stack, on this machine:** `bun run e2e` was run to the
point of failure. `dev:setup` seeded three `.env` files, all three servers
started from their own directories, be-01 migrated a brand-new
`tmp/e2e-<ms>.db` (176KB of schema, `local.db` untouched), and Playwright's
health waits on `:3100/health`, `:3200/health` and `:4200` all resolved — the
run reached test execution and failed on
`browserType.launch: Executable doesn't exist … chrome-headless-shell`, eight
times — the spec held eight tests when that run was made. The webServers were
torn down cleanly afterwards. So the config, the readiness, the database
isolation, the ports and the Nx wiring are verified; the assertions are not.

**Proven by a browser, on h2puni, 2026-08-08:** every assertion in
`layout.spec.ts`. Ten passing, and each of the four faults above watched
breaking the tests named beside it. The stack was the same one CI starts —
`bun run tools/dev/setup.ts`, then the three webServers from
`playwright.config.ts` — run inside `mcr.microsoft.com/playwright:v1.62.1-noble`
because h2puni has no sudo for `playwright install-deps`. Chromium 151, the
image's own, not the one `playwright install` downloads for CI.

**Verified as text, not as behaviour:** the spec transpiles, resolves both of
its imports of application source, and enumerates its ten tests
(`playwright test --list`); it passes `eslint` and `tsc --build` through a new
`tsconfig.e2e.json` — and that typecheck was proven non-vacuous by putting
`const x: number = 'nope'` first in the spec and then in the config and
watching each fail, because `nx typecheck` running against a solution-style
config and compiling nothing is a failure this repo has already had once.

**Not verified on the machine this change was written on:** anything needing a
rendering engine. h1claw has no browser and does not run builds, so every
rectangle here was measured on h2puni and then again by CI's `pixels` job.

## What is not verified here, beyond the browser

**No second engine.** Chromium only. A layout that Firefox or WebKit disagrees
about is out of this gate's scope and always was.

**The `select()` half of the date-cell guard is still unproven.** jsdom's
`select()` does not throw on a date input, so only the `setSelectionRange` half
was watched failing. The real-engine behaviour is inherited from the brief's
claim. The Tab walk in `layout.spec.ts` passes through the date cell only when
a project has a start date, which the seeded plan does not — so the browser run
will not settle this either. Stated rather than left to be assumed.

**The pickers are Tab destinations, not arrow sources.** Left and right at the
caret's edge do not leave a `CreatablePicker`. Deliberate, out of scope, and
recorded in the proposal's non-goals rather than fixed quietly.

**The widths are not proven to be _good_.** Nothing here can be: `1956px` of
declared table on a 1400px viewport reads however it reads. The screenshot
artifact exists for that judgement and for nothing else — it is not a baseline,
and no test compares against it.

**`apps/fe-01/tsconfig.spec.json` is still outside the gate**, unchanged, as
`teams-and-assignees/verify.md` recorded. The new unit tests were run, not
type-checked. `tsconfig.e2e.json` is new and _is_ in the gate, so the browser
spec is type-checked even though it cannot be run.
