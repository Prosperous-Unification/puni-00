# verify — `quiet-critical-slack`

One slice, implemented. Every figure below was read off a run in this worktree
on 2026-08-31; nothing here is derived, and what was not run says so.

## Commands

| Command                                                             | Result                                                       |
| ------------------------------------------------------------------- | ------------------------------------------------------------ |
| `E2E_PORT_SHIFT=1900 bunx playwright test` (the whole browser gate) | **265 passed / 0 failed in 7.0m, exit 0**                    |
| `… slack-cell priority-ramp`                                        | **4 passed** (9.0s) — the two new cases and the two it lends |
| `bunx nx test fe-01`                                                | **1995 passed** over 63 files, exit 0                        |
| `bunx nx lint fe-01`                                                | exit 0                                                       |
| `bunx nx typecheck fe-01`                                           | exit 0 — `tsc --build --force`, app and e2e projects         |
| `bunx nx format:check --all`                                        | exit 0                                                       |
| `bunx openspec validate quiet-critical-slack --json`                | see below                                                    |
| `bin/h2puni-gate.sh`                                                | **not run** — exits 127 on this macOS host                   |

The browser gate was run **whole** rather than filtered, deliberately: this
change edits a rule in the shared stylesheet, and `linked-row-hover` is the day
a filtered run called that green while four assertions in another file were red.
It measured 265 cases against a stack on shift 1900 — never the shared dev
server, which is the 2026-08-09 landmine.

`tool-bootstrap:test` is excluded and **was not run**: it times out on this
macOS host at ~272s a case, pre-existing and recorded in
`teams-and-assignees/verify.md`. Nothing here touches it.

## Failure proofs (R5)

| Check                                   | Fault injected                                                             | Observed failure                                                                                                                            | Watched                        |
| --------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| the tag's ink carries no nameable hue   | `color: var(--destructive)` — `main`'s own rule                            | `the critical tag's ink carries a hue · Expected: < 0.09 · Received: 0.23866607416984745` light, `0.18922641250344935` dark                 | Chromium, both palettes, 08-31 |
| the tag's ground has no tint mixed in   | `background: color-mix(… var(--destructive) 12% …)` with the grey ink kept | `the critical tag's ground has a tint mixed into it · Expected: < 0.015 · Received: 0.026692250029499404` light, `0.02483930165071019` dark | Chromium, both palettes, 08-31 |
| the tag's ink is the **column's** ink   | `color: color-mix(in oklab, var(--foreground) 40%, var(--background))`     | `the tag's ink is not the column's ink · Expected: 0.5541629781808084 · Received: 0.6524588994008041` light, `0.7038…`/`0.4706…` dark       | Chromium, both palettes, 08-31 |
| it is still a tag, not a word           | `background` deleted from the rule                                         | `the tag lost the ground that tells it from a figure · Expected: > 0.01 · Received: 0`                                                      | Chromium, both palettes, 08-31 |
| the fixture measures a tag and a figure | —                                                                          | the seeding asserts `data-critical` present on `010` and absent on `020` before it measures anything                                        | Chromium, 08-31                |

## A check that could not fail, caught before it shipped

`still a tag` was first written against the **slack row's** ground — the tag's
`surface.lightness` against the figure's. Rows alternate a band, so the two
grounds differ by the stripe whether the tag paints a ground or not. With
`background` deleted from the rule entirely, **both palettes passed**, watched.

It is measured against the Start figure on the tag's **own row** now
(`groundBesideIt`), and the same deletion then failed on `Expected: > 0.01 ·
Received: 0`. The tint-gap check moved to the same ground for the same reason.
This is `estimate-triple-visible`'s rule wearing a fourth hat: **a claim about
one element's own ground is a claim inside one row.**

## Two measures that could not carry this claim

Recorded because both looked obviously right and neither works across this pair
of palettes — the reasoning is in `NAMELESS_TINT_GAP`'s JSDoc:

- **A chroma ceiling on the ground.** The dark palette's own background carries
  a hue, so an ordinary cell's composited ground measures chroma **0.0405** —
  _more_ than the 12% `--destructive` tint's **0.0325**. The red tint lowers
  chroma there. A ceiling of 0.015 was watched failing the **correct** grey on
  `Received: 0.04157914303556483`.
- **A hue window.** In the light palette the ordinary ground is chroma 0.0011,
  where hue is quantisation noise: 197° against the grey tag's 248°. Two
  near-neutrals 50° apart are the same colour.

The shipped measure is the distance between the two grounds' `(a, b)` in OKLab,
which is what "a tint was mixed in" means.

## The bar this tag is not held to

WCAG asks 4.5:1 of small text and the tag is small text — 10px at weight 600.
It cannot answer to it and **neither can the column**: the ordinary slack figure
beside it measures **4.4775:1** in the light palette, because
`--muted-foreground` on `--background` is 4.48 and the requirement makes the tag
share that ink. `expected 3.8684939564563 to be greater than or equal to 4.5`
was watched with a correct tag on screen.

So the claim made is the available one: the tag's own tint costs it no more than
a fifth of the legibility the column already has (86% light, 88% dark measured),
and it never falls under 3:1. Stated here rather than buried, because a bar
lowered to fit is worth a reader's suspicion.
