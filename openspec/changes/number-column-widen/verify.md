# verify — `number-column-widen`

Branch `change/number-column-widen`, cut from `main` @ `cf57109` (#69 merged) on
2026-08-16. Follow-on to `table-width-budget`, whose own `design.md` **D4** is
the authority this change acts on rather than restates.

**Run under the PoC-mode contract** (`notes/delivery-modes.md`): no `design.md`,
no citation table, watched reds for new guards only, `nx affected` on h2puni
plus **`nx format:check --all`**, and **CI is the gate of record**.

## Provenance of this run — read this first

This change was authored by a sub-agent whose session **died mid-run** with
`Claude CLI turn output exceeded limit`, after it had committed and pushed
`948e110` but **before** it wrote this file or opened a PR. The main session
picked the branch up at that point and finished it. Consequences worth stating
plainly:

- Everything below the "Provenance" heading that reports a **command and its
  output** was re-run by the main session at `f3de24e` and is first-hand.
- Everything reported as **reasoning** (the depth-5 measurement, task 2.1's
  negative) is the dead session's, taken on its word as recorded in `tasks.md`,
  and is flagged again in "What was not watched" below.
- No code changed hands between the two sessions. `948e110` is exactly what the
  sub-agent pushed; `f3de24e` is `prettier --write` on `tasks.md` and nothing
  else.

## What the change is

`table-frame.ts`'s `COLUMN_WIDTHS` entry `['number', 93]` → `['number', 105]`,
plus every literal across the repo derived from it, +12px each.

| commit    | UTC   | what                                                             |
| --------- | ----- | ---------------------------------------------------------------- |
| `948e110` | 18:36 | the width, the two new e2e guards, every derived literal, record |
| `f3de24e` | 19:04 | `tasks.md` — `prettier --write` only                             |

Diff against `main`, 10 files, +402 / −94:

| area   | files                                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| source | `table-frame.ts` (the constant), `wbs-table.tsx`                                                                                           |
| tests  | `table-frame.test.ts`, `wbs-table.test.tsx`, `phases-dialog.test.tsx`, `e2e/layout.spec.ts` (**the two new guards**), `e2e/phases.spec.ts` |
| record | `proposal.md`, `tasks.md`, `specs/wbs-domain/spec.md`                                                                                      |

## The gate

`bunx nx affected -t test lint typecheck --base=origin/main` on **h2puni**, in
`~/wd/puni/wt-number-column-widen` (a worktree of `~/wbs-reds`), at `f3de24e`.

| run                                  | result                                                     |
| ------------------------------------ | ---------------------------------------------------------- |
| affected projects                    | **fe-01** alone                                            |
| `nx affected -t test lint typecheck` | **1,392 passed, 53 files**, lint and typecheck clean, ~61s |
| `nx format:check --all`              | clean, exit 0                                              |
| `openspec validate --all` (v1.3.0)   | **54/54 change items pass**, 0 failed                      |

be-01, gw-01 and `libs/domain` are not affected and were not run — nothing
outside `apps/fe-01` and `openspec/` is touched.

Nx served all three fe-01 targets from cache on the main session's re-run,
matching the sub-agent's own earlier run at identical content. The 1,392 figure
is the _unit_ suite; it is unchanged in count because this change adds no unit
test — both new tests are e2e, which `nx affected -t test` does not run.

## The two new guards, and where they actually run

Both live in `apps/fe-01/e2e/layout.spec.ts` and are Playwright, not vitest:

1. `two rows a level apart read as two different numbers, at depth 5 and 6` —
   `DEEPER_CLIPPED_PAIR` (`030.1.1.1.1` / `030.1.1.1.1.1`). This is the guard
   the change exists to satisfy.
2. `the break moves to depth 6 and 7, and this change does not claim to have
closed it` — `DEEPEST_CLIPPED_PAIR` (`030.1.1.1.1.1` / `030.1.1.1.1.1.1`),
   asserting the two still **do** read alike. It exists so guard 1 cannot be
   misread as "the clipping is fixed": `deriveNumbers` has no depth bound, so a
   fixed-width column always has a next depth that overruns it. Widening buys
   exactly one level, as D4 said.

Neither executes in the local gate. They execute in **CI's `pixels` job**
(`bun run e2e`, chromium, `layout.spec.ts` among them). CI is therefore the
gate of record for this change's only new behaviour, which is the PoC-mode
contract working as intended — but it does mean a green local gate here proves
the _refit_ of the 100-odd derived literals, not the fix itself.

## What was not watched

Stated rather than buried, because the PoC-mode contract asks for a watched red
per new guard and this run has one gap:

- **Guard 1 has no separately re-watched red.** `tasks.md` 2.1 reasons the
  negative from `table-width-budget`'s own character-by-character measurement of
  this exact pair at `['number', 93]` (2026-08-14), on the ground that the
  geometry it measured _is_ this pair's geometry. That is a defensible
  inference, not an observation. If it is wrong, guard 1 passes vacuously and
  nothing in this run would have caught it.
- **Guard 2 is an anti-regression assertion**, not a check with a fault to
  inject — its failure mode is the codebase becoming _better_ than claimed.
- No browser was driven from h1claw for this change. The screenshot evidence
  for the depth-5/6 pair is CI's `wbs-table-screenshot` artifact on the
  `pixels` run, not a session recording.

## CI, and the one thing the local gate could not have caught

The `pixels` job is the gate of record here, and it earned that on the first
run.

| run               | head      | gate    | pixels                      |
| ----------------- | --------- | ------- | --------------------------- |
| [31966615755][r1] | `7be1d5a` | ✅ pass | ❌ **1 failed, 173 passed** |
| [31967230462][r2] | `a2ea8bd` | ✅ pass | ✅ **174 passed**           |

[r1]: https://github.com/Prosperous-Unification/wbs-tool-v1/actions/runs/31966615755
[r2]: https://github.com/Prosperous-Unification/wbs-tool-v1/actions/runs/31967230462

**The red was not one of the two new guards — both passed first time.** It was
`clips a number past the envelope and keeps it whole in the title`, an existing
test, at `expect(overrun.clipped).toBe(true)`. Its fixture
`PAST_ENVELOPE_NUMBER = '030.1.1'` was chosen in 2026-08-09 as _the nearest
number the 93px column could not draw_. At 105px it fits, so nothing clipped and
the assertion was correct to fail. This is precisely the class of fallout
`tasks.md` 3.1 set out to sweep — a value derived from the column width — and it
was missed because it is a **string fixture**, not one of the numeric literals
the grep for `93`/`1219`/`117`/… was built to find.

`a2ea8bd` retargets it to `030.1.1.1.1.1.1` (depth 7). That depth is provably
clipped rather than guessed: guard 2 has depth 6 and depth 7 showing the same
string, and depth 7's number is two characters longer, so depth 7 cannot be
whole. It is **not** the nearest overrun any more — the true boundary is depth 6
or 7 and this branch cannot tell which. The weakening is written into the
constant's JSDoc rather than left for a reader to discover.

**Why the fix was not verified locally before pushing:** h2puni's Playwright
chromium cannot launch — `libatk-1.0.so.0: cannot open shared object file`. The
system libs `playwright install --with-deps` would add are missing, and adding
them is a `sudo apt` on the prod host, which is not a change to make in passing
for a test run. So `a2ea8bd` was reasoned from CI's own passing guards, then
confirmed by CI. Lint, typecheck and `prettier --check` on the edited spec were
run on h2puni and are clean.

**Worth fixing separately: h2puni cannot run e2e at all.** Every e2e claim on
this box currently has to round-trip through CI at ~9 minutes a cycle.

## Reversibility

Single constant, one line. Reverting `['number', 105]` to `93` and running
`nx format:write` restores the prior geometry; the +12px literals across the
test suites are the only other edit and they revert with it as one diff.
