# `name-title-body` — verify

Every command below was run on 2026-08-09 on Dany's Mac (darwin arm64, bun
1.3.14), from `/Users/danylofedorov/wd/puni/wbs-tool-v1` on branch
`change/name-title-body`.

## What landed

| file                                                   | what                                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------------- |
| `apps/fe-01/src/components/wbs/hover-preview.tsx`      | renamed from `notes-preview.tsx`; takes `name`, heads the preview     |
| `apps/fe-01/src/components/wbs/hover-preview.test.tsx` | new — 3                                                               |
| `apps/fe-01/src/components/wbs/cell-input.tsx`         | `restShowsFirstLineOnly`, and the measured at-rest height in `resize` |
| `apps/fe-01/src/components/wbs/wbs-table.tsx`          | the Name column passes it, drops `maxRestRows`, passes the name       |
| `apps/fe-01/src/components/wbs/wbs-table.test.tsx`     | 2 rewritten, 1 added, 2 assertions added                              |
| `apps/fe-01/src/components/wbs/plan-cards.test.tsx`    | 1 added — the card face's cap, which nothing else covered             |
| `apps/fe-01/e2e/name-cell.spec.ts`                     | new — 3, and the only oracle for the height                           |
| `apps/fe-01/e2e/layout.spec.ts`, `keyboard.spec.ts`    | comments corrected; no assertion changed                              |

fe-01 counted 851 unit tests before and **853** after; the browser suite 63
before and **66** after. `plan-cards.tsx` is untouched.

## The gate

| command                                                      | result                        |
| ------------------------------------------------------------ | ----------------------------- |
| `bunx nx format:check --all`                                 | pass                          |
| `bunx nx run-many -t test lint typecheck build --parallel=2` | pass, 21 projects             |
| `bunx nx test fe-01`                                         | **853 passed**, 41 files      |
| `openspec validate --all --json`                             | 49 items, 49 passed, 0 failed |
| the browser suite (below)                                    | **66 passed**, 0 failed       |

Nx labelled `gw-01:test` flaky on the run; it passed, and nothing in this
change touches gw-01.

## The browser suite, on ports nobody else was using

A stack was already listening on 3100/3200/4200 (`lsof` showed bun on both and
node on 4200), and a second one on those ports reads as a crash rather than as
a collision. This run used **be 3112, gw 3212, fe 4212**:

- `playwright.config.ts`, temporarily: `PORT`/`GW_URL` on be-01, `PORT`/`BE_URL`
  on gw-01, `bunx vite --mode e2e --port 4212` for fe-01, and the `baseURL`.
- `apps/fe-01/.env.e2e`, temporarily: the two `VITE_` proxy targets on the new
  ports, which is what `vite --mode e2e` reads through `loadEnv`.

Both were reverted before committing — `git diff` on `playwright.config.ts` is
empty and the `.env.e2e` is deleted. The suite therefore ships pointing at the
default ports, which is what CI's `pixels` job starts.

```
$ bunx playwright test --config apps/fe-01/playwright.config.ts
  66 passed (1.3m)
```

## The checks, and the faults that broke them

Every row was watched: the fault applied to the production file, the test run,
the output copied here, the fault reverted, the test re-run green.

| Fault injected                                            | Test                                                      | What the run reported                                                                                                                   |
| --------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| the heading rendered through concatenated markdown source | `a name containing markdown and HTML reads as typed`      | **passed first** — see below; then `expected '… and not emphasis' to be '… and *not* emphasis'` and `expected <em> to be null`          |
| the Name column passing `name=""` to the preview          | `renders the markdown on hover, and nothing when …`       | `expected '' to be 'Strip'`                                                                                                             |
| `restShowsFirstLineOnly` off the Name column (jsdom)      | `clips the notes at rest and opens the box to write in`   | `expected 'auto' to be 'hidden'`                                                                                                        |
| the `maxRestRows` cap kept under the clamp                | `clips the notes at rest and opens the box to write in`   | `expected '5.6em' to be 'none'`                                                                                                         |
| `restShowsFirstLineOnly` passed on the card face too      | `keeps a card's notes on show at rest, capped at eight …` | `expected 'none' to be '11.2em'`                                                                                                        |
| the value restore dropped from `resize`                   | `still holds the whole text in the box it shows one …`    | `expected '' to be 'measure twice'` — and it failed at the **setup** blur: the truncated box was read and the note deleted              |
| `restShowsFirstLineOnly` off the Name column (browser)    | all three of `e2e/name-cell.spec.ts`                      | `the cell with ten lines of notes is taller at rest — Expected: 20, Received: 88`, and both overflow assertions `"auto"` for `"hidden"` |
| `overflow-y` left on `auto` at the clamped height         | `the notes cannot be scrolled into view at rest`          | `the wheel scrolled the notes into view — Expected: 0, Received: 182`                                                                   |
| `resize` dropped from the blur handler                    | `focus shows the notes and blur hides them again`         | `the cell stayed open after the focus left it — Expected: 20, Received: 200`                                                            |

## The negative that could not fail, and did not ship

The heading test was written with the name `# not a heading <script>alert(1)</script>`,
and with the faulted component — the name concatenated into the markdown
source — it **passed**. `# # x` is an ATX heading whose content is the literal
`# x`, so the parser handed back exactly the string the test was asserting was
never parsed. Watched passing, which is the only reason it was found.

What makes the fault visible is punctuation the parser eats rather than keeps:
the name now carries `*not*`, and the heading is asserted to hold no element
the parser made. Both failures are in the table above. The test is the
eighteenth instance of R5's failure mode in this repository and the third not
to ship; it is recorded in `AGENTS.md` beside the `phases-ui` pair.

## What the browser had to be asked twice

Two assertions were written as "nothing is hidden" in pixels and failed by one:
`scrollHeight` 58 against `clientHeight` 57 for a wrapped name, and 202 against
201 for a focused cell. The Name cell is `box-sizing: border-box` with a 1px
border, so a box laid out at exactly its `scrollHeight` always reports a pixel
or two of overflow — pre-existing, independent of this change, and true of the
old capped box as well. The assertions ask what they mean instead: no _line_ of
the text is hidden (`linesHidden`, in the spec).

## Audit of the existing browser specs

`layout.spec.ts`, `keyboard.spec.ts` and `mobile.spec.ts` were read for
assertions that encoded the old four-line rest cap. **None did**, and all 63
existing browser tests passed against the clamp unchanged:

- `opens the notes preview out past the bottom of the name cell` measures the
  preview's overhang, which the clamp makes larger. Its comment claimed the cap
  was what made the preview taller than the cell; corrected, no assertion
  touched.
- `types a note under a name with Enter, and the box grows to hold it` measures
  both boxes with the caret in the cell, where nothing changed. Comment
  extended to say so.
- `moves the caret through a wrapped name before it leaves the row` fills one
  logical line with no notes, and its "the name has to wrap" precondition is
  now also a witness that a wrapped name is shown whole at rest.
- The mobile specs measure the card face, which keeps `maxRestRows={8}`.

## Deviations from the artifacts

1. **The tooltip keeps its `aria-label`**: `Notes for 010, rendered`. The
   component is `HoverPreview` now and the glossary term is Hover preview, but
   the label is what the notes are still read through, and no requirement asked
   for a new one. Renaming it would have edited a passing browser assertion for
   no behavioural reason.
2. **The card face's cap gained a test it never had.** The only test covering
   `maxRestRows` was the Name cell's, which this change replaces. The cap is now
   asserted where it still applies, in `plan-cards.test.tsx`, with the negative
   being the table's own prop passed there.
3. **Two jsdom tests were rewritten rather than deleted.** `caps how tall a name
box gets at rest…` became `clips the notes at rest…`, and `makes room for a
note written under the name, focus or no focus` lost its at-rest half, which
   jsdom could only ever answer with a stubbed `scrollHeight`. The at-rest
   height is proven in the browser and nowhere else.

## What is not watched here

Whether one line is the right amount at a glance across forty rows, and whether
the preview's heading is the right size next to the notes under it. Neither is
a measurement. Dany's screen, <https://dev.wbs.bulletpoints.club>.
