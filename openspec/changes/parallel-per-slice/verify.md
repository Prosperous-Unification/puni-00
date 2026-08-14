# verify — `parallel-per-slice`

Branch `change/capacity-c3-p3s`, cut from `main` @ `30e8c4c` (#62, #63 both
merged) on 2026-08-14. PR **#66**.

**Run under the PoC-mode contract of 2026-08-14** — `notes/delivery-modes.md`.
No `design.md`, no citation table, watched reds only where a new guard was
written, and **CI is the gate of record** rather than a full local run.

## CI

**Run 31831765348** on head `211e7fb` — **success**, first attempt. `gate`
green in 3m56s (format, test/lint/typecheck/build, secrets scan, doc caps,
compose files, migration lint, openspec — all as one job); `pixels` (the
browser suite) green in 9m18s. The PR reads MERGEABLE / CLEAN. Not merged —
PoC mode keeps cross-review before merge until Dany says otherwise.

## Wall clock

| moment                                                                                | UTC (2026-08-14) |
| ------------------------------------------------------------------------------------- | ---------------- |
| task dispatched                                                                       | 18:32            |
| first commit (fix, test, docs, record)                                                | 18:44            |
| lint fix (a redundant guard the linter caught)                                        | 18:47            |
| format fix (prettier's own reflow broke a paragraph; fixed and reverified idempotent) | 19:02            |
| this file, PR open                                                                    | ~19:06           |

**Task dispatch to PR open: roughly 34 minutes.** Investigation ran longer than
the code: `commitRename`'s draft-collapse had to be traced through
`directory-page.tsx`'s current source, then through `git log -S forgetDraft`
to find the commit (`db73f54`) that made the finding stale, before any file
was touched. The `∥` cell's fix needed reading `work-item.service.ts`'s
`widthFor`/`personFor`/`assumedAssignee` to get the per-slice rule right, and
a detour into whether `chartRead.slices` (be-01's own computed widths, already
on the table) would be a truer source than re-deriving `personFor` from
`row.assignees`/`estimates` — rejected because the existing test fixture only
ever builds one hard-coded, always-width-1 slice per row, and rebuilding it to
carry real multi-role widths was a bigger, riskier change to shared test
infrastructure than the P3 warranted. The formatting pass then cost its own
ten minutes: `nx format:check --all` is not idempotent-safe against
hand-wrapped Markdown — see below.

## The gate

`bunx nx affected -t test lint typecheck --base=origin/main` and
`bunx nx format:check --all`, both on **h2puni**, in
`/home/puni1/wd/puni/wt-capacity-c3-p3s` (a worktree of `/home/puni1/wbs-reds`),
bun 1.2.20. Nothing was compiled or tested on h1claw — `bin/block-local-builds.sh`
denies it there.

| run                                                                             | result                                                                                         |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| affected projects (`nx show projects`)                                          | **fe-01** alone                                                                                |
| `nx affected -t test lint typecheck` (1st)                                      | **fe-01:lint failed** — see "The lint red" below                                               |
| `nx affected -t test lint typecheck` (2nd)                                      | **1 test file failed, 2 tests failed** — a pre-existing flake, not this branch's (see below)   |
| `nx test fe-01` (rerun, isolated)                                               | **1343 passed / 52 files**, 0 failed                                                           |
| `nx affected -t lint typecheck` (rerun)                                         | clean                                                                                          |
| `nx format:check --all` (1st)                                                   | **3 files unformatted** — see "The formatting reds" below                                      |
| `nx format:check --all` (final)                                                 | clean, exit 0                                                                                  |
| `nx affected -t test lint typecheck --base=origin/main` (final, at pushed head) | **1343 passed / 52 files**, lint and typecheck clean                                           |
| `@fission-ai/openspec@1.3.0 validate --all --json`                              | **49 items, 49 passed, 0 failed** (47 at `main`, +2 for this change's proposal and spec delta) |

be-01 is not affected and was not run: nothing outside `apps/fe-01`, `docs/`
and `openspec/` is touched. The full gate (`run-many`, e2e, secrets, doc caps)
was not run here by contract — CI is the gate of record.

## The lint red

Not injected — the first `nx affected` run caught it. `const [row] =
api.rows; if (row === undefined) throw ...` in the new test: this codebase's
own `tsconfig` gives that destructure `WorkItemView`, not `WorkItemView |
undefined` — line 1514 of the same test file already relies on that,
unguarded. `@typescript-eslint/no-unnecessary-condition` flagged the redundant
check. Fixed by dropping it, matching the existing pattern.

## The formatting reds

`nx format:check --all` failed on three files the first time it ran, and one
of them exposed a real defect in the source rather than a cosmetic one.

**`docs/capacity.md`** — a sentence ending "...had also collapsed to 1." had
its bare `1.` land at the start of a line once prettier reflowed the
paragraph, which CommonMark parses as the start of a new ordered-list item.
The paragraph split in two mid-sentence. Fixed by writing `width 1` as one
code span instead of a bare numeral — the fact is unaffected, the markup no
longer collides with list syntax.

**`openspec/changes/parallel-per-slice/tasks.md`** — a code span
(`` `order.length === 0` ``) was hand-wrapped across a line break in the
source. `prettier --write` followed immediately by `prettier --check` on the
same file kept failing — not idempotent — because its reflow of a
line-broken span produces different indentation each pass. Fixed by not
hand-wrapping inside a span at all: the paragraph is now one long source
line and prettier owns 100% of the wrapping, which is the only way this class
of bug cannot recur.

**`openspec/changes/parallel-per-slice/proposal.md`** — cosmetic only,
`*second*` → `_second_` (prettier's own emphasis-marker convention).

Verified idempotent after the fix: `prettier --write` on all three reported
`(unchanged)` on the next pass, and `nx format:check --all` reads clean.

## The pre-existing flake

The second full `nx affected` run reported `1 test file failed, 2 tests
failed`, inside `wbs-table.test.tsx`'s `unfoldRole` → `threeRoots` →
`openTheChart` path — not the new test, and not anywhere this branch's diff
touches. Isolating and rerunning just that suite (`nx test fe-01`) gave
**1343 passed / 52 files, 0 failed**, and Nx's own cache flagged
`fe-01:test` as a **detected flaky task** on the affected run. Same class as
the repo's own documented `ws proxy ECONNRESET` / cross-fixture flakes on
record in five other PRs' verify.md files; not investigated further here,
per the PoC-mode contract's stated bet on CI as the gate of record.

## The one red, watched

**`says a number is not applied where two different people are named on two
different roles`**, `wbs-table.test.tsx`. Reverting `everySliceNamed` to the
old `named = row.original.doesEveryPhase` reading (kept as a diff, not
committed) gives:

| test                                                                                       | observed                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `says a number is not applied where two different people are named on two different roles` | **1 failed, 1342 skipped** (run in isolation). `expected 'one at a time whatever this says'`, received `'3 people at once. The item's effort is compressed across them, up to the team's size.'` |

Restoring the fix (`cp` from a pre-edit backup, diffed clean against the
committed tree) turns it green again — 1343/1343, the full suite.

**Reasoned, not watched:** the spec delta's third scenario, "an unnamed role
among two named ones keeps the cell applied" (three roles: two named on
different people, one estimated and unnamed). `everySliceNamed`'s `.every`
over `estimatedRoles` fails as soon as one role's `personForRole` is `null`,
and a third role stays `null` only where `doesEveryPhase` is itself `null` —
which needs **two or more** named roles project-wide, not one. Walked by
hand against `work-item.service.ts`'s `personFor` and confirmed to agree; not
given its own UI-driven test, which would need a third role added to the
fixture's `roleList` and was judged more machinery than a reasoned P3-level
scenario warrants under this contract. Whoever next touches this cell's test
coverage for a reason that already needs a third role should add it then.

## `commitRename`'s dropped draft — the refutation, in full

No code, no test — the finding does not reproduce.

1. **The record's own words**: "`commitRename` calls the both-drafts
   `forgetDraft`, so committing a name drops an unsent size draft beside it."
   Recorded against `capacity-ui` (#57, 2026-08-13).
2. **`directory-page.tsx`, current source**: `forgetDraft` and
   `forgetNameDraft` are the _same function_ — both call
   `withoutDraft(current, id)` against `renamed`, the page's one remaining
   draft. The doc comment above them says so explicitly: "since
   `capacity-per-project` is the only draft this page holds: the size box
   that made these two functions two moved to the plan's own `TeamsDialog`."
3. **`git log -p -S forgetDraft`** on the file: commit `db73f54`
   ("capacity-per-project: the box moves out of the directory and onto the
   plan") deletes `forgetSizeDraft` outright, along with every call site —
   the `commitSize`/Escape wiring that used to touch a size draft is gone
   from this file, not merely renamed.
4. **`teams-dialog.tsx`**, where the size/capacity box now lives, has no
   rename affordance at all — one `typed` draft, keyed by team id, with
   nothing beside it a commit could collide with.

`commitRename` (#58, 2026-08-13) landed **before** this P3 was ever recorded
as still-open in `capacity-ui`'s own `verify.md` (2026-08-13, same day, later
commit). The asymmetry the finding named was real when C3 wrote it down and
was fixed as a side effect of a refactor for an unrelated reason before the
record caught up. Nothing to watch a red for; there is no guard left to
collapse.

## What the lighter contract cost

- **The `nx affected` local run is what caught both the lint issue and the
  markdown formatting defect**, neither of which CI would have refused to
  merge on its own terms at all — `format:check` is part of the gate CI runs
  too, but finding it locally cost minutes instead of a CI round trip.
- **The non-idempotent prettier/Markdown interaction is worth a standing
  note**: hand-wrapping prose that contains inline code spans or numerals at
  a line start is unsafe under this formatter. Writing prose as long
  unwrapped lines and letting `prettier --write` own 100% of the wrapping
  avoids the whole class.
- **Investigating and refuting P3 #1 cost real time and produced no diff.**
  That is the correct outcome to report rather than force a stale finding
  into an unnecessary fix, but it means "two P3s taken" is not two roughly
  equal units of work — the refutation was most of the reading.
