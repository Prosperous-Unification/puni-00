# Verify — project-dropdown-details

Branch `change/project-dropdown-details`, off `7f0d059` (main, carrying
`compact-columns` and `gantt-calendar-axis`). Date 2026-08-09.

## Commands

| Command                                                                                      | Result                                                                    |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `bunx nx format:check --all`                                                                 | green (three files reformatted by `format:write` first, then re-checked)  |
| `bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache --exclude=gw-01` | **Successfully ran targets test, lint, typecheck, build for 20 projects** |
| `bunx nx run-many -t test lint typecheck build --projects=gw-01 --skip-nx-cache`             | `gw-01:test` **fails** — pre-existing, see below                          |
| `bunx openspec validate --all --json`                                                        | 57 items, 57 passed, 0 failed                                             |
| `bunx playwright test --config tmp/pw-shifted.config.ts`                                     | **88 passed (2.0m)**, chromium                                            |
| `bunx playwright test --config tmp/pw-shifted.config.ts apps/fe-01/e2e/header.spec.ts`       | 8 passed, the three new picker tests among them                           |
| `apps/be-01` `bun test`                                                                      | 553 pass, 0 fail                                                          |

### The e2e ports

`bun run e2e` was **not** used. Its committed config sets
`reuseExistingServer: !isCi` against 3100/3200/4200, and another checkout on this
machine (`~/wd/puni/wbs-tool-v1`) holds those ports — the landmine `G
gantt-calendar-axis` recorded, where 66 browser tests passed against code the
worktree had never built. `tmp/pw-shifted.config.ts` (gitignored, not part of the
change) is the repository config with `repoRoot` pinned to this worktree,
`reuseExistingServer: false`, and be-01/gw-01/fe-01 on **3121/3221/4221** — its
own three servers, started from this tree, on ports no sibling agent holds.

### gw-01:test — pre-existing, not this change

`gw-01:test` fails on `fan-out.integration.test.ts`'s two presence-roster cases
(`no roster arrived for ada, linus`) — real sockets against real ports, timing
out on this machine. **Reproduced on the untouched baseline**: with every change
stashed, `bunx nx run-many -t test --parallel=2 --skip-nx-cache` failed on
`gw-01:test` exactly the same way, and Nx labels the task flaky itself. gw-01 is
not touched by this change. Not fixed here, and named rather than hidden.

### fe-01's spec tsconfig

`bunx tsc --noEmit -p apps/fe-01/tsconfig.spec.json` reports 14 errors. It is not
in the gate (`teams-and-assignees/verify.md` names that debt). Three of the
fourteen **were** this change's and are fixed — two `listProjects` fakes and one
`createProject` fake in `wbs-table.test.tsx` that still built the old shape. None
of the remaining fourteen mentions `ProjectListEntry`, `CreatedProject` or
`ownerName`; checked by grep.

## Failure-proof table

Every check below was watched failing against the named fault, in the named
environment, and the fault reverted afterwards.

| Check                                                                          | Where                                   | Injected fault                                                                        | Observed failure                                                                                                                                                                                   |
| ------------------------------------------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `names each entry's own owner, whoever is asking`                              | `repository/project.test.ts`            | the `users` join and `ownerName` select absent (the state before 1.1)                 | `["Rewire the shed", undefined, 1000]` against `["Rewire the shed", "owner", 1000]`                                                                                                                |
| `fails the list rather than answering a project whose owner is nobody`         | `repository/project.test.ts`            | `withOwnerName`'s throw replaced by `?? ''`                                           | `listFor` **resolved** with `["Orphan", ""]` beside `["Rewire the shed", "owner"]`                                                                                                                 |
| `costs one statement however many projects there are`                          | `repository/project.test.ts`            | the join replaced by one `select` per row against `users`                             | `Expected length: 1 / Received length: 51`                                                                                                                                                         |
| `answers a list entry with the owner's name beside everything it already sent` | `controller/project.controller.test.ts` | `inMemoryProjects` not resolving an owner name (the fixture's own `ownerName` select) | `missingFrom(...)` returned `["ownerName"]` against `[]`                                                                                                                                           |
| `tells two projects of one name apart by their owners`                         | `wbs/project-page.test.tsx`             | `aria-hidden="true"` on the meta span — on screen, out of the accessibility tree      | `Unable to find an accessible element with the role "option" and name "Rewire the shed (kat · 1 Jun)"`                                                                                             |
| `carries the year only when it is not this one`                                | `wbs/project-page.test.tsx`             | the entry rendering `{entry.name}` alone (the state before 3.1)                       | `['This year', 'Next year']` against `['This year (kat · 1 Jun)', …]`                                                                                                                              |
| `never matches an owner, however plainly the entry shows one`                  | `wbs/project-picker.test.ts`            | filter widened to `\|\| project.ownerName.toLowerCase().includes(wanted)`             | `expected [ { id: 'p2', …(3) } ] to deeply equal []`                                                                                                                                               |
| `matches the name alone — an owner's username offers nothing`                  | `wbs/project-page.test.tsx`             | the same widened filter                                                               | `expected [ 'Paint the fence (strip · 1 Jun)' ] to deeply equal []`                                                                                                                                |
| `the widest entry be-01 permits stays inside the window`                       | `e2e/header.spec.ts` (chromium)         | the listbox back to `min-w-full` with no cap                                          | precondition failed at **all three** widths (`entryOverflow 0` — nothing clipped); with the precondition relaxed to read the bound underneath, `the listbox reaches 46px past the window at 900px` |
| `the entry is clipped and its full text is still readable`                     | `e2e/header.spec.ts` (chromium)         | `title={entry.name}` — the meta dropped from the hover title                          | `Expected substring: "w1786301985729WWWWWWWWWWWWWWWWWW"` against a title holding the project name alone                                                                                            |
| `the entry is clipped and its full text is still readable`                     | `e2e/header.spec.ts` (chromium)         | the listbox back to `min-w-full` (same fault as two rows up)                          | `the entry was not clipped, so its title is not standing in for anything` — `entryOverflow 0`                                                                                                      |

### Checks whose non-vacuity rests on a precondition

Three preconditions are asserted **before** the claim they guard, each because
the claim would hold trivially without them:

- the e2e bound asserts `entryOverflow > 0` at every width first — a listbox that
  fits needs no cap, and the sixteenth recorded fault was exactly a measurement
  taken against something with no size;
- `costs one statement` asserts the list came back with fifty projects in it — a
  list that answered nothing also costs one statement;
- `a short entry is shown whole` is the other side of the clipping claim, so
  "clipped" cannot be satisfied by a picker that clips every name there is.

## What is **not** verified

- **Task 5.2** — deploy to dev and Dany looking at the dropdown. Not done; this
  branch is not pushed.
- **gw-01's two flaky presence tests**, above: pre-existing, reproduced on the
  baseline, untouched here.
- **A screen reader.** The meta being part of the accessible name is asserted
  through the accessibility tree (`getByRole('option', { name })` in jsdom, whose
  name computation is `dom-accessibility-api`'s), not by listening to VoiceOver.
- **Any browser but chromium.** `playwright.config.ts` runs one engine, by the
  decision recorded in that file.
- **A viewport narrower than 900px for the picker.** `FIT_WIDTHS` is
  `header.spec.ts`'s own matrix, and the bound is proven at 1280, 1024 and 900.
  The listbox takes the combobox's width, and the combobox is inside the bar, so
  the bound does not depend on the viewport — but that reasoning is not a
  measurement below 900.
