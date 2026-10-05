# Day-to-minute Gantt-axis experiment (020.07 / R6b)

Both zoom interactions preserve elapsed geometry and keyboard access from seven days
to five minutes. In this headless Chromium experiment, all tested conditions up to
2,500 attempts stay below the provisional 100 ms p95 interaction target. Both
interactions exceed it at 10,000 attempts. This supplies a measured density bracket,
not a production ceiling or a human preference verdict.

## Intent and boundary

Execute R6b from the [agentic planning research plan](../../superpowers/plans/2026-09-20-wbs-agentic-planning-research.md),
following the accepted Astra high protocol handed to Sol medium on 2026-10-05.
The [sub-day desk research](2026-09-20-sub-day-estimates-calendars-measures.md)
left T5/T7's minute-level legibility and density unanswered. A standalone read-only
prototype compares a six-rung ladder with a minimal logarithmic slider, using the
same fixture, renderer, selection and fit commands. The experiment was isolated
from merged main c5f16573afab47065bd8b6d4dba40755544ca8e3 on branch
`experiment/r6b-timeline`, independently of shared-people PR #269.

No production scheduling, calendar, rounding, per-step status, attempt storage,
token-time conversion, contract, migration, package-version or deployment change.
Production `DAY_SCALES=[28,12,4]` remains pixels per workday; none of those workdays
is mapped to 24 elapsed hours. The research prototype and report implement the
existing research-plan experiment; they do not adopt a normative production spec.

## Fixture and provenance

Source provenance: `puni-plan/exec/ledger.jsonl`; full-source SHA-256
`9c03d393ade0bb8c46a6288fbd1d8e405a1708d361d6491374b1fe783a1e55dd` was verified before extraction.
Pair `dispatched` → `returned` by attempt ID for the requested 2026-09-19
21:22–2026-09-20 08:06 UTC batch; extraction includes the final minute with an
exclusive 08:07 bound. The actual first dispatch is 2026-09-19T21:22:27Z, last return
2026-09-20T08:04:59Z; no included pair extends into that final minute. Only ID,
packet, slice and timestamps survive in the [sanitized fixture](../../../experiments/r6b-timeline/fixtures/batch-1.json).
Fixture SHA-256: `793e4c8198812da5dfb052926251d97fc0d95cd0511ca88df31eb3f8d58b3bb7`.

31 complete separate pairs, 19,724 summed seconds, minimum 112 s, median 587 s,
maximum 1,491 s. Pair identities and endpoint metadata match, and every pair is
retained exactly once. No real attempts overlap. Returned means executor return,
not implementation success, integration or review approval. Raw detail/session,
token payloads and local filesystem paths are not published. Synthetic load,
overlap, touching, repeated/identical-start, zero/open endpoint and date-only facts
are visibly labeled and provide no real concurrency evidence.

## Implementation and acceptance

Run `bun experiments/r6b-timeline/serve.ts`; instructions and exact commands are
in the [prototype README](../../../experiments/r6b-timeline/README.md).
No chart library, APIs or persistence. Packet rows retain separate attempts;
buttons support keyboard selection/details even when the true duration paints
less than one pixel. Pointer surfaces expand to at least 18 CSS px while paint
remains true duration; collisions expose an explicit selection list.

The discrete spans are 7d, 24h, 6h, 1h, 15m and 5m. The continuous control offers
1,001 logarithmic slider positions across the same extent, with no separate
renderer. Both keep the selected instant's x position when visible, otherwise
the viewport center. Fit all/selected can produce a custom span; the discrete
control labels that fitted span and the slider synchronizes to it. Pan buttons,
keyboard and ruler drag remain elapsed operations. The ruler adapts spacing and
checks actual label bounds. Zone choices UTC, Europe/Kyiv and Pacific/Auckland
change labels, never instants or durations. Details retain exact UTC endpoints
and elapsed seconds. Zero and missing ends are different; no end is invented.
A labeled date-only fact stays day precision without a fabricated midnight.

[Browser acceptance](../../../experiments/r6b-timeline/evidence/browser-checks.json)
passed both 1440×900 and 390×844. It checks all six scales in both variants,
each real pair's identity, shortest-attempt keyboard details, <=1 CSS px
mapping/anchor drift, unchanged geometry after zone changes, nonoverlapping
ruler labels, pan, intended ambiguous selection and zero/open/day facts.
[Additional painted-geometry and refusal audit](../../../experiments/r6b-timeline/evidence/browser-audit.json)
records actual CSS bounds, UTC midnight pan and invalid/duplicate/reversed
fixture refusal with no painted attempts. This is automated checking, not a human study.

Screenshots: [batch desktop](../../../experiments/r6b-timeline/evidence/batch-1440.png),
[batch narrow](../../../experiments/r6b-timeline/evidence/batch-390.png),
[ambiguity desktop](../../../experiments/r6b-timeline/evidence/ambiguity-1440.png),
[ambiguity narrow](../../../experiments/r6b-timeline/evidence/ambiguity-390.png).

## Measurement protocol and full results

Authoritative [raw measurements](../../../experiments/r6b-timeline/evidence/measurements.json)
recorded 2026-10-05T20:47:24.481Z. Browser 153.0.8010.12, headless Chromium,
Linux x86_64, 12th Gen Intel(R) Core(TM) i7-12800HX, 24 logical
CPUs, 30.9 GiB RAM. Desktop viewport
1440×900; narrow viewport 390×844. Narrow means this viewport on the same desktop
CPU, not a measured phone. The host was not exclusively reserved; small differences
are not evidence of a faster interaction design.

24 conditions = 2 viewports × 2 interactions × 3 row densities × 2 attempts/row.
One warmup, then five fresh-DOM reload mounts with warm browser/HTTP cache per
condition. Mounted time begins in the app module, includes its fixture fetch and
row construction, and ends at initial synchronous rendering; it is not a cold
browser startup, first paint or network navigation metric. Zoom uses the actual
discrete select change or continuous slider input (near 15 min); pan uses the
actual button click. Interaction completion waits two animation frames; the
roughly 33 ms floor includes that deliberate frame wait. Continuous actual
spans are recorded, including slider quantization. p95 is nearest rank: with
five samples, the maximum, not a population estimate. Long tasks use Chromium
PerformanceObserver (>50 ms), not duration guesses.

Each latency cell is **median / p95 ms**. Visible rows/marks are intersections
with the scroll viewport after zoom/pan; all rows and marks remain mounted.
Long tasks are **count across five repetitions / largest ms**; raw event
timestamps and durations are retained in JSON. No virtualization was added.

| Viewport | Interaction | Rows×attempts | Fresh mount   | Zoom          | Pan           | DOM elements | Visible rows/marks | >50 ms tasks/max |
| -------- | ----------- | ------------- | ------------- | ------------- | ------------- | ------------ | ------------------ | ---------------- |
| 1440×900 | discrete    | 50×1          | 7.7 / 8.2     | 33.4 / 34.0   | 33.3 / 33.5   | 324          | 16/15              | 0/0.0            |
| 1440×900 | discrete    | 50×5          | 14.3 / 16.5   | 33.4 / 33.6   | 33.3 / 33.5   | 725          | 16/60              | 0/0.0            |
| 1440×900 | discrete    | 500×1         | 32.0 / 58.1   | 33.4 / 33.5   | 33.4 / 33.5   | 2574         | 16/15              | 1/54.0           |
| 1440×900 | discrete    | 500×5         | 82.9 / 87.4   | 52.1 / 66.4   | 47.8 / 49.9   | 6575         | 16/60              | 6/85.0           |
| 1440×900 | discrete    | 2000×1        | 99.6 / 112.9  | 50.0 / 50.4   | 50.0 / 51.6   | 10074        | 16/15              | 5/110.0          |
| 1440×900 | discrete    | 2000×5        | 293.9 / 308.3 | 136.8 / 166.2 | 137.0 / 154.2 | 26075        | 16/60              | 15/305.0         |
| 1440×900 | continuous  | 50×1          | 9.9 / 11.4    | 33.7 / 34.2   | 33.2 / 34.5   | 325          | 16/15              | 0/0.0            |
| 1440×900 | continuous  | 50×5          | 15.3 / 19.7   | 33.2 / 33.4   | 33.4 / 33.5   | 725          | 16/60              | 0/0.0            |
| 1440×900 | continuous  | 500×1         | 31.2 / 31.9   | 32.8 / 33.4   | 33.5 / 33.8   | 2575         | 16/15              | 0/0.0            |
| 1440×900 | continuous  | 500×5         | 79.9 / 84.8   | 49.5 / 50.2   | 50.1 / 50.4   | 6575         | 16/60              | 5/82.0           |
| 1440×900 | continuous  | 2000×1        | 92.7 / 110.8  | 50.6 / 51.0   | 49.6 / 52.2   | 10075        | 16/15              | 5/108.0          |
| 1440×900 | continuous  | 2000×5        | 295.5 / 317.8 | 150.1 / 183.0 | 133.3 / 153.0 | 26075        | 16/60              | 15/314.0         |
| 390×844  | discrete    | 50×1          | 9.5 / 11.4    | 33.5 / 33.7   | 33.3 / 33.5   | 318          | 11/11              | 0/0.0            |
| 390×844  | discrete    | 50×5          | 17.1 / 21.6   | 33.4 / 33.9   | 33.3 / 33.4   | 719          | 11/44              | 0/0.0            |
| 390×844  | discrete    | 500×1         | 28.6 / 34.7   | 33.6 / 33.8   | 33.2 / 33.8   | 2568         | 11/11              | 0/0.0            |
| 390×844  | discrete    | 500×5         | 77.2 / 82.3   | 50.0 / 66.6   | 34.4 / 50.1   | 6569         | 11/44              | 6/79.0           |
| 390×844  | discrete    | 2000×1        | 101.4 / 116.1 | 49.9 / 50.6   | 49.6 / 50.3   | 10068        | 11/11              | 5/113.0          |
| 390×844  | discrete    | 2000×5        | 302.7 / 308.8 | 133.8 / 167.4 | 133.5 / 137.5 | 26069        | 11/44              | 15/306.0         |
| 390×844  | continuous  | 50×1          | 8.8 / 14.9    | 33.5 / 34.1   | 33.3 / 33.4   | 319          | 11/11              | 0/0.0            |
| 390×844  | continuous  | 50×5          | 13.1 / 18.2   | 33.4 / 33.6   | 33.4 / 33.6   | 719          | 11/44              | 0/0.0            |
| 390×844  | continuous  | 500×1         | 30.0 / 37.5   | 33.4 / 33.7   | 33.2 / 33.6   | 2569         | 11/11              | 0/0.0            |
| 390×844  | continuous  | 500×5         | 73.9 / 80.5   | 50.0 / 50.4   | 33.1 / 50.2   | 6569         | 11/44              | 5/78.0           |
| 390×844  | continuous  | 2000×1        | 99.6 / 109.5  | 50.1 / 50.5   | 37.0 / 50.0   | 10069        | 11/11              | 5/107.0          |
| 390×844  | continuous  | 2000×5        | 306.7 / 339.7 | 150.1 / 201.7 | 133.3 / 171.1 | 26069        | 11/44              | 15/337.0         |

At 500×5, interaction p95 tops out at 66.6 ms. At 2000×1, interaction p95 remains
<=52.2 ms but fresh mount p95 is 109.5–116.1 ms. At 2000×5, fresh mount p95 is
308.3–339.7 ms; zoom p95 is 166.2–201.7 ms and pan p95 137.5–171.1 ms.
The measured interaction bracket is therefore between the tested 2,500 and
10,000 attempts, not an exact threshold. Mount constraints show up earlier.

Discrete jumps are larger and explicitly named; the slider reaches intermediate
spans without a renderer change. Neither removes the density cost. The measurements
do not establish which is easier to use, nor a meaningful speed winner. Sustained
slider/ruler gestures, production React rendering and windowing are unmeasured.

## RED/GREEN, faults and unsuccessful attempts

The model stub first failed 0/6, then parsing/mapping implementation passed 6/6.
Final model run: 6 pass, 0 fail, 48 assertions. Browser harness XPath syntax was
corrected before acceptance; a subpixel left-edge mouse probe rounded outside
the actual interval and was moved 5 px inside. Neither changed chart semantics.
Visual inspection caught stale fit-all controls. A new browser regression failed
with displayed 604,800,000 ms versus actual 42,407,200 ms, then passed after
synchronizing controls. [Observed RED](../../../experiments/r6b-timeline/evidence/fit-display-red.txt).

[Fault inventory](../../../experiments/r6b-timeline/evidence/proofs.json): all 13
injected faults produced actual exit 1 and a failed named assertion; source was
restored in finally. Five requested faults: shifted anchor; merged repeated
attempts; parsed an offset-local timestamp as UTC; hid an attempt behind enlarged
hit targets; defaulted a missing endpoint. Additional faults disabled duplicate,
reversed, identity calendar, list and finite-instant checks, allowed unzoned local timestamps, and
disabled fit-control synchronization. Adjacent Proof comments name these checks;
individual sanitized logs are in the evidence directory.

The first API-level performance run is retained as
[superseded](../../../experiments/r6b-timeline/evidence/api-level-measurements.superseded.json).
The first actual-control run predating the fit fix is also
[superseded](../../../experiments/r6b-timeline/evidence/actual-controls-pre-fit-fix.superseded.json).
Only the final fixed-UI run supplies the table above. No unsuccessful alternative
was quietly promoted to a pass claim.

## Verification and remaining limits

Fresh scoped commands: frozen Bun install; model tests; browser acceptance/full
measurements; painted-geometry/refusal audit; fault proofs; strict experiment-local
TypeScript; repository ESLint with file-scoped browser-global declarations; Prettier; Bun
browser build; pinned OpenSpec validate --all --json. Initial lint/typecheck failures
were experiment-local missing TSconfig/browser globals and harness nullability/types;
they were fixed without disabling repository rules. Nx graph was populated before
final lint so the graph was available. The experiment is not an Nx project and
imports no product modules; this is not a claim of product boundary coverage.
JavaScript renderer
is checked by ESLint/build/browser behavior; TypeScript covers the harness, not a
claim of strict checked-JS conversion. Final exact command outcomes are recorded
in evidence/checks.json before commit.

The standalone experiment commands are not invoked by an existing Nx target;
their fresh manual outputs supplement the normal repository gate. The
[source manifest](../../../experiments/r6b-timeline/evidence/source-manifest.json)
pins the final renderer/fixtures/harness. Raw measurements include latency and
long-task event observations; no full DevTools CPU profile was captured.

Canonical exact-head h2puni gate, CI and independent final review are pending at
report preparation and required before merge. No raw full Nx gate on h2puni.
No human participant/task-time/error/preference study, actual phone, other browser,
exclusive-hardware benchmark, production schedule/calendar migration, solver,
deployment or capacity-mode activation was tested or decided. WBS 020.07 records
progress truthfully; this experiment stops at the interaction comparison and
measured density bracket. Later domain decisions still require their interview.
