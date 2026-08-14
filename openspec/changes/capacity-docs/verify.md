# verify — `capacity-docs`

Branch `change/capacity-docs`, cut from `main` @ `f2d021b` (#58, C5, merged) on
2026-08-14. PR **#59**.

C4 of five, and the only one that ships no behaviour. One expression changes in
`gantt-geometry.ts` and everything else is prose. **What this document has to
prove is not that the code works — it is that every sentence added here is
true**, so the R5 table is short and the citation table under it is long.

## The gate

Run on **h2puni** over plain ssh, in `/home/puni1/wd/puni/wt-capacity-c4` (a
worktree of `/home/puni1/wbs-reds`). Nothing was compiled or tested on h1claw;
that box denies both (`bin/block-local-builds.sh`), and the two attempts this
document does not otherwise mention were denied by it — `bunx nx format:check`
in a worktree with no `node_modules`, and a `gh pr create` whose **body text**
contained `-t build` and matched the guard's regex. The second is worth naming:
the guard reads the whole command string, so prose about a build command is a
build command as far as it is concerned. The body went into a file.

| target                                                  | result                                                                                                                                                                             |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx nx format:check --all`                            | clean, exit 0                                                                                                                                                                      |
| be-01 unit (bun **1.3.14**, in `apps/be-01`)            | **696 pass, 0 fail**, 24,461 `expect()` calls, 11.90s across 57 files                                                                                                              |
| fe-01 unit (`node vitest run`)                          | **1,304 pass across 50 files, 0 fail**, 56.70s                                                                                                                                     |
| `bunx nx run-many -t lint typecheck --skip-nx-cache`    | pass, 21 projects                                                                                                                                                                  |
| `bunx nx run-many` build target                         | **not run here.** `tool-bootstrap` and `tool-devsync` refuse without `shellcheck`, which h2puni does not have — the refusal is quoted below. CI runs it and is the gate of record. |
| `bunx @fission-ai/openspec@1.3.0 validate --all --json` | **44 items, 44 passed, 0 failed**                                                                                                                                                  |
| `bun run tools/tool-git-hooks/src/hooks/doc-caps.ts`    | exit 0, `LLM_README.md` at **148** of 150                                                                                                                                          |
| secrets scan, every tracked file                        | exit 0                                                                                                                                                                             |
| fe-01 e2e (`pixels`)                                    | CI — see "CI" below. Nothing here makes a claim about real layout.                                                                                                                 |

be-01 is **696 → 696** and 24,461 → 24,461: this change adds no be-01 test and
touches one JSDoc there, so the number holding still is the claim. fe-01 is
**1,303 → 1,304**, the one new case.

`nx run be-01:test` and `nx run fe-01:test` are **not** how the suites were run —
under bun on h2puni the fe-01 target runs zero tests and exits 0. be-01 is
`bun test` in `apps/be-01`; fe-01 is `node ../../node_modules/vitest/vitest.mjs
run` with node 22 on `PATH`. Five agents have now hit that trap; it is in C5's
`verify.md` too.

The build refusal, quoted rather than summarised:

```
[tool-devsync] shellcheck is required but not installed.
```

`which shellcheck` on h2puni: absent. Same state C3 and C5 recorded.

## R5 — the failure-proof table

One thing in this change is testable. It gets two rows, because a fix for
"said `others` once too often" can itself be a copy defect.

| #   | test                                                                     | fault injected                                                                                    | observed                                                                                                          |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | `counts the rest of the blocking set rather than naming every one of it` | the shipped `` ` and ${String(otherBlockers)} others` `` restored — no number agreement           | **1 fail, 92 pass.** `- Waits for Platform to free 2 people — after strip (Dev) and 1 other` / `+ … and 1 others` |
| 2   | `keeps the plural where more than one other bar was holding the pool`    | the `s` dropped from the plural arm — `` ` and ${String(otherBlockers)} other` `` for every count | **1 fail, 92 pass.** `- Waits for Platform to free 2 people — after strip (Dev) and 2 others` / `+ … and 2 other` |

Row 2 exists because row 1 alone cannot see it. With only the two-blocker case
pinned, "never say `others`" is green — and that is the same fault this change
is fixing, wearing the other hat. Both injections were run on h2puni against the
real suite, and the file was restored from a copy taken before the first
(`/tmp/gg.orig`) rather than by hand-editing it back.

**Nothing else here has a negative test, and this document does not pretend
otherwise.** Prose has no injected fault. What it has is the table below.

## Every prose claim, and where it was read

The documentation equivalent of a watched red is a citation somebody else can
re-run. Each row is a claim added by this change and the symbol it was checked
against — at `f2d021b`, in this worktree, not from memory.

| Claim                                                                                            | Read at                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A capacity is a fact about the (project, team) pair, with no fallback to a global                | `apps/be-01/src/repository/capacity.ts:10`, `apps/be-01/src/repository/index.ts:555`, `schema.ts`'s `projectTeamCapacity` JSDoc                                                                    |
| Duration is `effort / width`, one indivisible block                                              | `apps/be-01/src/service/schedule.ts`, the window scan; `capacity-engine/specs/wbs-domain/spec.md`                                                                                                  |
| A width is clamped to the pool's slots                                                           | `apps/be-01/src/service/work-item.service.ts:198` — `Math.min(row.maxParallel, slots ?? row.maxParallel)`                                                                                          |
| A named person collapses the width to 1                                                          | `apps/be-01/src/service/work-item.service.ts:197` — `if (personId !== null) return 1;`                                                                                                             |
| A capacity tie is never reported as the capacity floor                                           | `apps/be-01/src/service/schedule.ts:1069` — `if (floor.at <= start) continue;`, and `capacity` ordered after `person`                                                                              |
| The box is the plan toolbar's `Teams` dialog, titled _Teams on this plan_                        | `apps/fe-01/src/components/wbs/teams-dialog.tsx:244` and `:249`                                                                                                                                    |
| The dialog lists inherited labels too                                                            | `teams-dialog.tsx`'s `teamsOnThePlan`, which counts over `effective`                                                                                                                               |
| The directory offers no size                                                                     | `apps/fe-01/src/components/directory/directory-page.tsx:669` — the "No size box" copy                                                                                                              |
| The floor sentence's four pieces, and `work that is not shown`                                   | `apps/fe-01/src/components/wbs/gantt-geometry.ts`, `capacityFloorWords`                                                                                                                            |
| The display referent is the latest finisher, ties to the one placed first                        | `apps/be-01/src/service/schedule.ts:1104-1118`                                                                                                                                                     |
| The export prints `People at once` and `Ran at`                                                  | `apps/fe-01/src/components/wbs/plan-export.ts:362`, `:365`                                                                                                                                         |
| `effort` and `duration` on `ExportSlice` are read by nothing                                     | `grep -n '\.effort\|\.duration' plan-export.ts plan-export.test.ts wbs-table.tsx` → the producer and one test fixture, no reader                                                                   |
| The accepted range is a whole number 1–1000, `null` clears                                       | `apps/be-01/src/controller/capacity.controller.ts`, `capacityOf`                                                                                                                                   |
| Remembered capacity: the dialog lists only labelled teams, so the row has no control             | `teams-dialog.tsx`'s `teamsOnThePlan` filter, and `capacity-per-project/verify.md`'s own "Deferred" entry                                                                                          |
| `directory_changed` survives for four writes, not for a size                                     | `apps/be-01/src/service/directory.service.ts:120,185,228,252` — renameTeam, renamePerson (rename only), removePerson, removeTeam                                                                   |
| `PATCH /api/teams/:id/size` is gone; the route is `PUT /api/projects/:id/teams/:teamId/capacity` | `capacity-per-project/tasks.md` 3.5, and `capacity.controller.ts:98`                                                                                                                               |
| Nothing outside the change folders explained capacity                                            | `grep -rniE '\bcapacity\b' README.md HUMAN_README.md LLM_README.md AGENTS.md CONTEXT.md docs/adr docs/local-dev.md docs/runbook-*.md libs/*/README.md apps/*/README.md` → empty before this change |
| No capacity change touched `CONTEXT.md`                                                          | `grep -rc CONTEXT openspec/changes/capacity-*/ \| grep -v :0` → empty                                                                                                                              |
| `priority-column/proposal.md` is 423 words against a 400-word cap                                | counted with the template's HTML comments excluded, which is what the cap says                                                                                                                     |

Two claims are **not** in that table because they are readings rather than
lookups, and they are the two most worth a reviewer's disagreement:

1. **That four requirements contradict the shipped behaviour.** The contradiction
   is between two live delta folders, not between a folder and the code; it is
   argued in `design.md` D3 and a reviewer who thinks the archive would have
   resolved it is disagreeing with a judgement, not with a fact.
2. **That two of C3's six P3s belong here and four do not.** D6's rule — words
   versus behaviour — is a line drawn by this change and not by C3.

## The scope, and how it was derived

Nothing declares C4's contents. `design.md` D1 is the table of where each item
came from; the short version is that the four proposals name exactly one item
("the delta spec's priority edit") and everything else was read out of what the
program left behind.

Checked and **found not to be a debt**, so that the absence is on the record
rather than looking like an oversight:

- `README.md`, `HUMAN_README.md` and the runbooks describe no product behaviour
  at all — they are about the repo and the deployment. There is nothing stale in
  them about capacity because there was never anything.
- `LLM_README.md` needed one row, not a rewrite. Its C2 landmine and C3 deploy
  gate were both removed on merge, correctly.
- The code JSDoc is in good shape: C5 was thorough. The single stale sentence was
  `schema.ts`'s `serviceTeamId`, which spent the label through
  `{@link serviceTeam.size}` thirty lines above the comment C5 wrote to retire
  that column.
- `docs/plans/2026-08-09-resource-planning.md` describes the global model
  throughout and is **left alone**: it is a dated plan, a record of what was
  planned on that day, and editing it would be rewriting history rather than
  fixing documentation.
- `openspec/config.yaml` says "There is no CI." That is stale — there is, and it
  is the gate of record — but it is not capacity's debt and not this change's.

## Deferred, and recorded rather than done

C3's four remaining P3s (`capacity-ui/verify.md`, "Recorded and not applied"),
each with why it is not a docs change:

- **`commitRename` drops an unsent size draft** — behaviour. The fix splits
  `forgetDraft` into two, and the Escape pair's watched red covers Escape only.
- **The chart never says the team's size clamped the width** — a new sentence on
  a surface the plan's §4.3 letter lists three for and not this one. As far as
  words reach, `docs/capacity.md` now states the gap and names where the answer
  can be had (the export's two columns).
- **The `∥` cell mutes per row (`doesEveryPhase`) where be-01 collapses per
  slice** — behaviour, and the fix is a per-slice read the table does not have.
  Stated in `docs/capacity.md` so a reader who sees an un-muted number that does
  nothing knows why.
- **The over-bar `{team} ×{n}` label reaches every team-labelled plan** — a
  visual to compare a screenshot against, not a sentence.

C5's deferred list contributes one item to the diff and leaves the rest:

- **Taken: the capacity that survives its last label.** C5's own entry says it is
  "a third state beside stated and unstated that no artifact named until this
  line". Naming it is a docs job. It is `CONTEXT.md`'s `Remembered capacity` and
  a numbered section of `docs/capacity.md`.
- **Left: `CapacityService.set`'s unread response body**, and with it `listFor`'s
  binary-collation ordering versus `tree()`'s `localeCompare`. C5's own verdict is
  "nothing is broken", the JSDoc there is true about what it argues, and the
  unstated part — that the two orderings cannot disagree only because team ids are
  lowercase-hex UUIDs — is a sentence on a repository method in a file this change
  does not otherwise touch. Adding it is tidiness with a bigger blast radius than
  its value.
- **Left, unchanged: dropping `serviceTeam.size`**, the three cases that start
  unconstrained, no undo for a capacity, no e2e of the dialog, and
  `DROP TABLE IF EXISTS` in `down.sql`. All five are C5's and none is prose.

Not done, deliberately, and not a P3 at all: **`LLM_README.md`'s `Tables:` list**
names eight tables and the schema has more — `service_team`, `person`,
`dependency` and `project_team_capacity` among them. It was already incomplete
before capacity existed, so it is a pre-existing debt of the orientation file
rather than something this program introduced, and fixing it inside a change
titled `capacity-docs` would put an unrelated edit under a title that hides it.

## Deployment

**Not deployed, and there is nothing to deploy.** No migration, no wire change,
no route. `./bin/dev-deploy.sh` was not run. The one runtime change is a string
in fe-01's chart, which the dev container's watcher would pick up with no
restart if anybody wanted to look at it.

## CI

**PR #59, head `94eee78`, run 31772536960 — `gate` and `pixels` both green
first time.** `gate` 3m35s (05:17:35 → 05:21:10), `pixels` 8m49s (05:17:35 →
05:26:24).

`gate` is the only record of `nx run-many -t build` — h2puni has no `shellcheck`
— and of the secrets scan, the migration lint (no `.sql` in this diff), the doc
caps check and `openspec validate` on a runner that resolves the CLI from the
pinned scope rather than from a local `PATH`. `pixels` is the only record of the
browser suite, and it is here as a regression check rather than as evidence for
anything: this change draws nothing new.

The head this paragraph names and the head that merges differ by **this file and
nothing else**. C5 recorded a run against the wrong head by not saying so; the
run at the merged head goes in the merge report.
