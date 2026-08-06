# Verification

## The gate, uncached

```
$ bunx nx format:check --all
(no files listed)

$ bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck, build for 21 projects
      be-01 (bun:test)   252 pass  0 fail
      fe-01 (vitest)     185 pass  0 fail (11 new)

$ bunx @fission-ai/openspec@1.3.0 validate --all --json
15 items, 0 invalid — project-picker valid
```

## The checks, and the faults that broke them

| Check                                                    | Fault injected                                                       | What the run reported                                                                                                   |
| -------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Recency orders the list (`project.ts`, `listFor`)        | `desc(projectAccess.lastOpenedAt)` dropped from the `orderBy`        | both order tests failed — the list came back in creation order; restored, 9 pass                                        |
| The access join is per account (`project.ts`, `listFor`) | the join narrowed to `eq(projectAccess.projectId, project.id)` alone | `gives another account its own order` failed — one account's history reordered the other's list; restored, 9 pass       |
| Opening is actually recorded (`project.controller.ts`)   | the route answered 204 without calling `projects.open`               | 3 controller tests failed, including the 404 for an absent project; restored, 9 pass                                    |
| The client keeps be-01's order (`project-picker.ts`)     | `matchingProjects` sorted by name before filtering                   | 4 tests failed across the pure filter and the page; restored, 22 pass                                                   |
| A restored project counts as opened (`project-page.tsx`) | the record moved from the selection effect into the click handler    | `records the project restored from a previous visit` failed — the commonest arrival recorded nothing; restored, 18 pass |

The SQLite fact the ordering rests on — `ORDER BY x DESC` puts NULLs **last**,
because NULL sorts below every value — is held by the first row of that table
rather than by a comment: a project nobody opened must come after one that was,
and with the recency term gone it did not.

## What is not watched here

The dropdown's pixels. jsdom renders the listbox and the tests drive it by
role, id and key, but nobody on this box has seen the list open under the
input, scroll, or highlight — h1claw has no browser and no Playwright. Same
standing gap named in `pick-deps-and-keep-the-project/verify.md`; it needs
Dany's screen at <https://dev.wbs.bulletpoints.club>.

The migration has run against a real SQLite file in the repository tests
(`project.test.ts` migrates a temp database and reads it back) and its
rollback is covered by `migrate-down.test.ts`. It has **not** run against
dev's existing database yet — that happens on the next dev deploy, and be-01
restarts on a migration change.
