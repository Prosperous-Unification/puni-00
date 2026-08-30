# verify — `critical-snap`

Branch `change/critical-snap`, off `main` @ `94ed488`. be-01 only —
`schedule.ts` and the three schedule test files beside it. No migration, no API
shape change, no fe-01 change.

## The gate

Run from the repo root on this branch, 2026-08-11.

| Command                                                 | Result                                                                                                      |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `bunx nx format:check --all`                            | green, exit 0                                                                                               |
| `bunx nx run-many -t test lint typecheck --parallel=2`  | green — 21 projects                                                                                         |
| `bunx nx run-many -t test --skip-nx-cache` (counts)     | be-01 **585** in 52 files, fe-01 **1091** in 45, domain **40** in 2, gw-01 **45** in 8; every project green |
| `bunx @fission-ai/openspec@1.3.0 validate --all --json` | green — 24 items, 24 passed, 0 failed                                                                       |

be-01 was 582 before this change; the three added are the A1 regression, the
sixth-of-a-day negative, and the differential's non-vacuity count.

**`build` was not run on this host** — the standing rule and the `PreToolUse`
hook forbid local builds here; CI's `checks` job runs the full
`test lint typecheck build` gate and is the proof for `build`. `bun run e2e`
was likewise not run (no browser on this host) and nothing here touches fe-01.

## A1, watched failing first

Cloud case A1, live on dev at `94ed488`: rows 010/020/030 estimated 45/6, 25/6
and 20/6 and chained, plus a flat 15-day 040. The chain's finish accumulates to
15.000000000000002, all four rows end the project, and the Slack column printed
`0` on each of them with `data-critical` present on 030 alone.

`paints every row that ends the project red, drift and all` reproduces that
shape against the engine and was watched failing on the pre-fix code before the
fix existed:

```
- "critical": true,          + "critical": false,
- "float": 0,                + "float": 0.0000000000000008881784197001252,
```

## What moved

- `schedule.ts` grows `slackOf`: `snapWorkdays(latestStart - earliestStart)` at
  `@wbs/domain`'s existing 1e-9 window, with `-0` normalised to `0`. It is read
  where a slice's `float`/`critical` are built and where a leaf's **tiling**
  endpoints are projected onto the work item. The aggregated (person-split)
  branch takes `Math.min` over already-snapped slice floats and keeps its own
  `some(critical)`.
- `latestStart`, `latestFinish`, every date and the leveller's `goesFirst`
  priority float are untouched. The tight-path rule in `lateTimes` is untouched
  and still scoped to plans with resource queues.
- `schedule-shapes.test.ts`: the A1 regression; the pinned defect test flipped
  to the endorsed answer and rewritten to say it guarded the defect until this
  change; a new negative for the window itself.
- `schedule-identity.test.ts`: the 2000-plan differential snaps the **oracle's**
  slack the same way, through a two-line rule copied rather than imported, and
  derives the oracle's `critical` from it. Every other field stays `toBe`-exact.
  A new case counts what the snap moves.

## The scale of the defect

Measured over the differential's own 1000-plan corpus (`RELEASED_ROLES`, the
shuffled sums), by counting rows where the pre-slice oracle's raw slack and its
snapped reading differ:

- **1946** rows carried drifted slack.
- **1598** of those were the wrong colour — reporting slack they do not have,
  and showing `0` in the column while doing it.

A1 was not a corner.

## Failure-proof table

Every check this change adds or moves, the fault injected, and what was
watched — all 2026-08-11, locally, each fault reverted and the suite watched
green after.

| Check                                                           | Injected fault                                               | Observed                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The snap itself (`slackOf`)                                     | the `snapWorkdays` call dropped — a bare `latest - earliest` | four failed: `paints every row that ends the project red…` on `critical: false` / float `8.881784197001252e-16` for `chain-a`; `reports no float on a row a notBefore floor…` on `Expected: 0 Received: -1.7763568394002505e-15`; both differentials on `seed 1, r0c0g0.float: 0 became -1.7763568394002505e-15` |
| **`-0` normalisation** (`slackOf`)                              | `return snapWorkdays(...)` with the `=== 0 ? 0` removed      | `reports no float on a row a notBefore floor stands at the project finish` failed **alone**, `Expected: 0 Received: -0`                                                                                                                                                                                          |
| **Window must not swallow real slack** (production path)        | `DRIFT` widened from `1e-9` to `0.5` in `@wbs/domain`        | `keeps a sixth of a day of real slack…` failed on the colour, `Expected: false Received: true`; with that assertion removed, on `Expected: 0.16666666666666666 Received: 0`                                                                                                                                      |
| **The differential still measures the engine** (`snappedSlack`) | none needed — it is watched by the first row above           | with the engine's snap dropped, both differentials failed in the mirror direction (`0 became -1.77e-15`), so the oracle-side snap cannot pass a schedule that stopped snapping                                                                                                                                   |
| **The corpus is not snap-free** (`holds plans the snap moves…`) | the counters read against the corpus                         | `drifted=1946 turnedRed=1598` — nonzero, so `snappedSlack` in `expectSameSchedule` is not a no-op and the two differentials are not the pre-change tests wearing a new name                                                                                                                                      |

The A1 regression also asserts `chain-c.earliestFinish` is **not** exactly 15
and the floor test asserts its `latestStart` is **not** exactly 13: both would
otherwise go green on a future engine that stopped drifting, proving nothing
about the snap. Those two assertions are pinned deliberately and cannot fail
through the faults above — they describe the input the snap is applied to.

## Deliberately not done

- **`latestStart`/`latestFinish` are not snapped.** They are what the identity
  claim rests on and what `lateTimes`' anchoring is careful about; only the
  difference the reader is shown is snapped.
- **The leveller's priority float is not snapped.** `goesFirst` ranks
  critical-path floats to choose who gets a person first, and two rows the
  schedule can genuinely tell apart must stay apart there. No leveling test
  moved.
- **The tight-path rule was not widened.** Dropping its `hasQueues` scoping
  fixes some of this by moving `latestStart`, and moves numbers in every plan
  that exists. Still out of scope, as `lateTimes` says.

## Not verified

- **`build`** — forbidden on this host; CI's `checks` job is the proof.
- **CI itself** — recorded on the PR after push, not here.
- **The browser** — no browser on this host, and no fe-01 claim is made. The
  Gantt's ring and the Slack column read the fields this change fixes, but
  through the API; be-01's tests are where that is asserted.
- **Dev** — not deployed from this branch. A1's live reproduction was on
  `94ed488`, before the fix.
