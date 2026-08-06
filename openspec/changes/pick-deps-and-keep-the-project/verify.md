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
