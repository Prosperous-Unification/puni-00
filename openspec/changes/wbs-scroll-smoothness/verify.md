# Scroll smoothness verification

## Reproduction setup

Head `38abe44532409854ae4a5e252a59aede50c274a5` was exercised on h2puni in
Chromium at 1280×800. The real HTTP fixture seeded 50, 500, and 2,000 rows in
200-command batches, with every fifth name measuring exactly two lines. Each
completed size ran five equal 60-step wheel sequences down and up. A continuous
`requestAnimationFrame` sampler recorded both faces' first visible row and
within-row fraction; CDP traces recorded layout and paint; production React's
profiling bundle recorded commits.

The probe is opt-in with `WBS_SCROLL_PROBE=1`; normal pixels jobs discover it
but skip it. Every run retained a video, Playwright trace, and the JSON
attachment in the failed test's `trace.zip`.

## Before numbers

Medians below are across five traces. Durations cover one down/up repeat.
“Mismatch frames” means the table and Gantt exposed different first-row ids.

| Rows | Frames sampled | Max frame gap | p95 gap | Mismatch frames | React commits | React commit time | `placeRows` time | Paint | Layout |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 50 | 121 | 70.9 ms | 47.4 ms | 16 | 60 | 495.9 ms | 0.3 ms | 394.6 ms | 148.9 ms |
| 500 | 37 | 186.6 ms | 160.3 ms | 0 | 293 | 12,165.8 ms | 3.6 ms | 3,036.7 ms | 1,316.3 ms |
| 2,000 | 25 | 311.4 ms | 277.9 ms | 0 | profiling run exceeded 600 s | not completed | 10.0 ms | 3,239.1 ms | 1,838.9 ms |

The 2,000-row non-profiler figures are medians from five complete traces; its
profiler run itself timed out after ten minutes, after the same harness completed
50 rows in about one minute and 500 rows in about six. The complete 2,000-row
traces had median task time 77,951.8 ms and script time 37,606.9 ms.

## Attribution

At 500 rows, React commits consume 28.3% of task time (12,165.8 / 43,003.0 ms)
and script consumes 47.6%. The run performs 293 commits for 120 wheel inputs.
That is the measured primary cause: raw scroll offsets are React state, so
compositor scrolling repeatedly commits the whole table/chart subtree.

The following provisional causes are below the plan's 5% cutoff and are dropped:

- `placeRows`: 3.6 ms at 500 rows and 10.0 ms at 2,000 (<0.03%).
- height recording: zero steady-state calls; the first trace measured 36 calls
  at 500 rows and 39 at 2,000, both under 2 ms total.
- layout: 3.1% at 500 rows and 2.4% at 2,000.
- paint: 7.1% at 500 rows but 4.2% at 2,000; it does not explain the scaling.
- anchor writes: zero during every steady-state trace.

The independent pairing defect is visible at 50 rows: a median 16 sampled frames
per repeat expose different first-row ids, with a worst observed separation of
7.35 rows. The 500 and 2,000 traces remain paired once the plan is long enough
not to clamp near its end.

## Gate status

Remote h2puni formatting, lane lint, and typecheck are green at the probe head.
The acceptance probe is intentionally red on current behavior: 50 rows fails
pairing, 500 rows stalls to 220.1 ms, and the 2,000-row profiled run exceeds the
600-second test cap. No local build or autotest was run.

Dependency-integrity trust remains gated: the maintained checker refuses the
repository's three tracked nested `package.json` files, so these are
development measurements, not a terminal green gate.
