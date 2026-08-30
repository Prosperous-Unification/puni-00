# verify — `gantt-svg-download`

Branch `change/gantt-svg-download`, cut from `origin/main` @ `1a17190` (#65,
#68, #69, #71, #72 all merged) on 2026-08-17. PR **#75**, head `dfa7226`.

**Run under the PoC-mode contract of 2026-08-14** (`notes/delivery-modes.md`)
— Dany's call that delivery, not testing, is what has been slow. No
`design.md`, no citation table, no watched red per copy behaviour, and **CI is
the gate of record** rather than a full local run. New guards still get their
injected fault (§2 below is that fault, found by hand rather than injected —
see the note there).

## Wall clock

| moment                                           | UTC (2026-08-17) |
| ------------------------------------------------ | ---------------- |
| branch cut, first read                           | 10:57            |
| code + unit tests written                        | 11:00            |
| unit gate green on h2puni                        | 11:20            |
| watched standalone in real Chromium — red        | 11:24            |
| the NUL fix, watched standalone — green          | 11:29            |
| full PoC gate green (test/lint/typecheck/format) | 11:33            |
| record written, PR open                          | 11:34            |

**Branch cut to unit-green: ~23 minutes.** The single largest cost was neither
code nor record: it was the composite-document design (rebuilding the label
column and the calendar axis as `<text>`, since neither exists inside the live
`<svg>` — design §1) and reading `gantt-panel.tsx` far enough to reuse
`GanttRowLabel`/`AxisDay`/`PlacedBar` and the bar-text pure helpers rather than
re-deriving their arithmetic.

**A second, unplanned ~12 minutes** went to §2: the standalone-in-a-real-browser
check the brief's own §4 asks for is not a formality — it is what caught a bug
no unit test could, because jsdom's `DOMParser` does not enforce the XML
well-formedness a real browser's does.

## The gate

`bunx nx affected -t test lint typecheck --base=origin/main` plus
`bunx nx format:check --all`, on **h2puni**, in
`/home/puni1/wd/puni/wt-gantt-svg-download` (a worktree of
`/home/puni1/wbs-reds`). Nothing was compiled or tested on h1claw
(`bin/block-local-builds.sh`).

| run                                           | result                                                         |
| --------------------------------------------- | -------------------------------------------------------------- |
| affected projects (only `apps/fe-01` touched) | **fe-01** alone                                                |
| `nx affected -t test lint typecheck`          | **1,408 passed, 53 files**, lint clean, typecheck clean, 63.6s |
| `nx format:check --all`                       | clean, exit 0, 15.2s                                           |

One `nx affected` run mid-session reported `fe-01:lint` failed with **no
printed error** and Nx's own "flaky task" notice; `nx run fe-01:lint` alone,
immediately after, was clean. Not chased further — it reproduced zero times
in three subsequent full-gate runs, and the failure carried no diagnostic to
chase. The two real lint failures on this branch (below) both printed a rule
name and a location; this one printed neither.

**Two real lint failures, both fixed, neither a behaviour bug:**

- `@typescript-eslint/no-unnecessary-type-assertion` on `blobs[0] as Blob` in
  the test file — `blobs: Blob[]` already narrows the index without
  `noUncheckedIndexedAccess`, so the cast was dead. Dropped.
- `no-control-regex` on `XML_INVALID_ATTR_CHARS`'s own character class — the
  control characters are exactly what the regex exists to match. Silenced
  with a one-line justification, the house pattern
  (`grep eslint-disable apps/fe-01/src/components/wbs/*.tsx`).

## §2. Watched, standalone — the fault a browser found and jsdom could not

**Not injected.** Design §1 states the plan: run a real plan through the
button, open the downloaded file with no application around it, and say what
was watched. That is what found this.

**First run, real Chromium (Playwright, official `mcr.microsoft.com/playwright`
image, on h2puni — h2puni has no `sudo` for `playwright install-deps`), a
throwaway two-row plan with a dependency (`010 Strip the hull` → `020
Rewire`), not committed:**

> This page contains the following errors: error on line 2 at column 7712:
> invalid character in attribute value. Below is a rendering of the page up to
> the first error.

The row labels and the calendar axis rendered — they are hand-built `<text>`,
ahead of the point of failure in document order. Every mark inside the nested
`<svg>` (both bars, every gridline, both weekend bands) did not: the parser
stopped at the first `<rect data-gantt-bar="…">`.

**The byte at column 7712:** `data-gantt-bar="…-a9b970db7531\x00506f4d2e-…"` —
a raw NUL. `apps/be-01/src/service/schedule.ts:95` builds a slice id as
`` `${workItemId}\u0000${roleId ?? ''}` `` — a separator deliberately nobody
can type, the same technique `capacity-oracle-2026-08-13.json`'s fixture data
uses. A browser paints a NUL into an HTML/SVG attribute without complaint
(confirmed: the **live** app shows nothing wrong, the bug is invisible on
screen), which is exactly why nine merged PRs and this branch's own 111 jsdom
tests never saw it — jsdom's `DOMParser` does not enforce XML's stricter rule
either, so even the structural unit tests in §1 above stayed green throughout.

**The fix:** `XML_INVALID_ATTR_CHARS` strips XML's forbidden C0 control range
(everything `\u0000`–`\u001F` except tab/LF/CR) from **every** attribute on
the cloned tree, not only `data-gantt-bar` — replaced with `-` rather than
dropped, so two ids differing only in the separator do not become the same
string.

**Second run, same plan, same button, after the fix:**

```
SVG_PATH=/work/tmp/m4-verify/gantt-chart-2026-08-17.svg
```

No parser-error banner. The file's XML parses clean (`xml.dom.minidom`,
checked independently of the browser). Read directly: every colour is a
literal — `fill="#94a3b8"` on both bars (their own literal `PERSON_BAR_COLORS`
attribute, untouched), `fill="oklch(0.129 0.042 264.695)"` on the row-label
text (the **real** resolved `--foreground`, not the jsdom fallback — this run
was the real browser), `stroke="oklab(0.929 -0.00325318 -0.0125864 / 0.4)"` on
the light gridlines (Chromium's own serialization of `stroke-border/40`,
resolved off the live cascade, never hand-computed here). Both bars carry
their `aria-label` sentence whole, including the dependency's own words
("Waits for a dependency's first estimated role. after 010 Strip the hull").

**Screenshotted both, side by side** (`live-chart.png` — `[data-gantt-panel]`
in the running app; `standalone-svg.png` — the same file opened via `file://`
in a fresh browser context, `Detail` off in both, matching): row order,
labels, month caption ("Aug 2026"), the day-of-month axis with weekend
shading, both bars' width/position/critical outline/person colour, and both
bars' overlay text ("010 - Strip the hull", "020 - Rewire") all match. What is
not on the standalone file is exactly what the live one was not showing
either — the dependency arrow is off by default (`declutter-one-button`) and
this run never pressed `Detail`. Screenshots are ephemeral
(`/tmp/m4-verify/*.png` on this machine), not committed.

Verify script (not committed, deleted from the worktree after this run):
`apps/fe-01/e2e/tmp-svg-verify.spec.ts`, run via
`bunx playwright test --config apps/fe-01/playwright.config.ts` inside the
`mcr.microsoft.com/playwright:v1.62.1-noble` image (the house pattern for
h2puni's Playwright suite, `tw-e2e.sh`'s shape) — `be-01`/`gw-01`/`fe-01` all
started fresh against a throwaway SQLite file by Playwright's own `webServer`
config, a real signup, a real two-row plan typed through the UI, a real click
on the download button, the real downloaded bytes opened standalone.

## CI

Run **32025575114** on head `dfa7226` — **green first attempt**, both jobs:
`gate` (test/lint/typecheck/format/secrets/doc-caps/migration-lint/OpenSpec)
and `pixels` (the browser suite). No rerun needed.

## The control owed

**`wbs-table.tsx`'s toolbar has no button for this.** The download lives in
`gantt-panel.tsx`'s own sticky corner instead — beside the `Detail` toggle,
`data-gantt-svg-download`, `aria-label="Download this chart as a standalone
SVG"` — because this branch may not touch `wbs-table.tsx` (another agent's
file). #65/#68 shipped writers with no button and it cost a P1
(`notes/wbs-cloud-regression-2026-08-15.md` §5); #69 fixed that for
**Copy as Mermaid** / **Download as Markdown**. **This is the same debt for
M4**, named here loudly rather than only in this file: the intended home is
beside those two and **Download CSV**, matching their wording, placement and
toast-driven refusal shape. The panel-corner button is a real, working entry
point in the meantime — not a stand-in that does nothing.

## Open question for Dany

**Row-label truncation.** The label column in the standalone file is a fixed
176px-wide `<text>` with no clipping — a long name can overflow into the
chart area. Not observed on the two-row test plan above (both names fit); not
attempted here (cheap with an SVG `<clipPath>` per row, skipped for PoC-mode
time). Worth a follow-up if a real plan's names run long.
