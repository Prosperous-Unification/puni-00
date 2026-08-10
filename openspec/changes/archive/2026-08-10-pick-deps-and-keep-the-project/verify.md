# Verification

## The gate, uncached

```
$ bunx nx format:check --all
(no files listed)

$ bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck, build for 21 projects
      bun:test (be-01, gw-01, libs, tools)   477 pass  0 fail
      fe-01 (vitest)                         156 pass  0 fail

$ bunx @fission-ai/openspec@1.3.0 validate --all --json
11 items, 0 invalid — pick-deps-and-keep-the-project valid
```

## Every check, and the fault that broke it

| Check                                           | Fault injected                                                         | What the run reported                                                                                                                                                                                                          |
| ----------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The picker never offers self (`dep-picker.ts`)  | `row.id !== forRow.id` replaced with `true`                            | `never offers the row itself or its existing predecessors` failed (and `offers every other row` with it); restored, 6 pass                                                                                                     |
| A stray Enter adds nothing (`wbs-table.tsx`)    | the focus handler's `highlight: null` replaced with `highlight: 0`     | only `Enter with nothing typed and nothing highlighted adds nothing` failed — `addDependency` was called with the first entry; restored, 58 pass                                                                               |
| A remembered id is a claim (`project-page.tsx`) | the `found.some((project) => project.id === remembered)` guard removed | the first version of the test **passed with the guard gone** — a `<select>` whose value matches no option reads back `''` either way. Rewritten to watch `api.tree` calls; then it failed under the fault (`asked = ['gone']`) |

The third row is the thirteenth-plus-one instance of a check that could not
fail: the select's read-back value was no evidence at all. The test now observes
the thing the guard prevents — a tree request for a project the list no longer
has.

## Cross review #6 — the fixes, and the fault that broke each

Gate after the fixes, uncached: **21 projects green, 477 bun + 165 vitest**
(fe-01 grew nine tests). `openspec validate --all --json`: 11 items, 0 invalid.

| Check                                           | Fault injected                                               | What the run reported                                                                                               |
| ----------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| A rename cannot retarget (`project-page.tsx`)   | `setRename(null)` removed from `create()`                    | only `creating a project mid-rename cancels the draft` failed — the input survived the click; restored, 11 pass     |
| The selection is a claim (`project-page.tsx`)   | the `found.some(...)` membership check for `current` removed | only `a selected project deleted elsewhere is dropped` failed — the read-back was `''`, not `p1`; restored, 11 pass |
| Blur closes the picker (`wbs-table.tsx`)        | the dep input's `onBlur` handler deleted                     | only `leaving the cell closes the list` failed — two options still rendered; restored, 62 pass                      |
| A mouse press keeps the focus (`wbs-table.tsx`) | the `ul`'s `onMouseDown` preventDefault deleted              | **both** mousedown tests failed — option and scrollbar; restored, 62 pass                                           |

Two checks in this round were **born red** rather than fault-injected: the `ul`
preventDefault (the scrollbar test failed before the handler existed) and the
id-based highlight (the peer-reshuffle test failed against the index-based
implementation, `addDependency` receiving the row that took the index).

One check was **removed rather than proved**: the `li`'s own
`onMouseDown.preventDefault()`. With the `ul` handler in place, bubbling makes
the `li`'s copy unfalsifiable — deleting it fails nothing — which is the same
rule that removed `onBlur`'s second condition in the keep-focus change.

And one test corrected itself: the first version of the highlight test asserted
on `api.rows[...].dependsOn`, which the fake never materializes — it passed for
the wrong reason before the chip assertion replaced it.

### The test environment grew a localStorage

Under Bun + vitest + jsdom 24, `window` exists, `window.location.href` is
`http://localhost:3000/`, and `window.localStorage` is `undefined` — probed with
a throwaway test before anything was built on it. `vitest.setup.ts` installs an
in-memory stand-in only when the property is missing, so a runtime that grows a
real one keeps its own.

## On dev

Deployed to dev at this branch (`bin/dev-deploy.sh`). Verified through the real
edge with a real account: `PATCH /api/projects/:id {name}` renames and the next
`GET /api/projects` lists the new name (the endpoint existed; the UI now calls
it — the client method is the same request curl made).

**Not watched, said plainly:** the picker's dropdown, the highlight, the
persistence across a real refresh and the rename input are browser behaviours.
h1claw has no browser and no Playwright; jsdom proves the DOM and the requests,
not the pixels. Watching them needs Dany's screen at
<https://dev.wbs.bulletpoints.club>.
