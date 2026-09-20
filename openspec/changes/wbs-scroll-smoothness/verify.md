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

|  Rows | Frames sampled | Max frame gap |  p95 gap | Mismatch frames |                React commits | React commit time | `placeRows` time |      Paint |     Layout |
| ----: | -------------: | ------------: | -------: | --------------: | ---------------------------: | ----------------: | ---------------: | ---------: | ---------: |
|    50 |            121 |       70.9 ms |  47.4 ms |              16 |                           60 |          495.9 ms |           0.3 ms |   394.6 ms |   148.9 ms |
|   500 |             37 |      186.6 ms | 160.3 ms |               0 |                          293 |       12,165.8 ms |           3.6 ms | 3,036.7 ms | 1,316.3 ms |
| 2,000 |             25 |      311.4 ms | 277.9 ms |               0 | profiling run exceeded 600 s |     not completed |          10.0 ms | 3,239.1 ms | 1,838.9 ms |

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

## Retained-window follow-up

The effective tree at `4136f9fa` retains compositor offsets inside a 640px row
publication bucket backed by 768px overscan. The probe now positions its pointer
before counters start and caches the complete, stable Gantt label list instead
of rebuilding a 500/2,000-entry observer array on every animation frame. One
h2puni repeat at each size measured:

|  Rows | React commits | React commit time | Gantt commits | Worst pairing | Worst frame gap |
| ----: | ------------: | ----------------: | ------------: | ------------: | --------------: |
|    50 |            30 |           55.7 ms |             0 |     0.018 row |        116.6 ms |
|   500 |           129 |          548.3 ms |             0 |     0.018 row |        201.3 ms |
| 2,000 |           129 |          589.2 ms |             0 |     0.016 row |        187.8 ms |

The 500-row React cost is down from the prior chunk's 162 commits / 1,309 ms;
the 2,000-row cost is down from 1,344 ms, and pairing remained inside the
0.1-row gate at every size. The 50ms frame gate is still red, so close task 3.1
remains open. These three frame maxima are not a clean-host verdict: at the
measurement checkpoint h2puni was at load 8.11 on 8 cores with `containerd` at
126% CPU and `dockerd` at 86.8% CPU; `/` was also 96% used. A clean CI runner or
a quiet h2puni window must repeat all five traces before terminal disposition.

Two bounded negative controls at 500 rows ruled out the probe's heavy artifacts
as the source of the current red: disabling CDP timeline collection still
measured a 180.0ms worst gap, and disabling both timeline collection and video
still measured 247.2ms. Both controls preserved the same 129 React commits,
zero Gantt commits, and 0.018-row pairing. The strict result therefore remains
red; the controls are diagnostic only and do not replace the required recorded
five-trace run.

## Residual scheduler attribution

The controls at `75a1b7e2` narrowed the remaining 500-row stall further. An
idle sampler with zero inputs, commits, link writes, height reads, or viewport
work stayed green at 42.4ms on the same host. Real scrolling remained red when
CDP timeline collection and video were both disabled (247.2ms), when the whole
Gantt was hidden (287.8ms), and when the follower's native `scrollTop` was
replaced by an inert synthetic property (238.9ms). The follower control did
break pairing as intended, but left 129 WBS commits in place, so chart paint and
the native follower scroll are not the residual source.

The recorded trace named every top main-thread event: React scheduler
`performWorkUntilDeadline` calls in the production profiling bundle occupied
228.7, 217.4, 188.2, 180.5, 172.7, 170.0, 168.7, 164.4 and 156.2ms. The exact
head also prevents viewport no-op state dispatches and keeps shown-row guard
updates silent while pointer publication is suspended; focused store/seam
coverage is 33/33 green. The remaining close work is therefore table-side React
scheduling below the full `WbsTable` owner, not Gantt isolation, paint, the
scroll link, CDP tracing, video, or idle host scheduling. Task 3.1 remains red;
the next implementation chunk should localize viewport publication below that
owner, then repeat the recorded 50/500/2,000 probes.

## Rewritten-plan review

Sol (`openai/gpt-5.6-sol`) and Gemini (Antigravity CLI) reviewed section 2 at
the probe head before implementation. Both requested changes: the old
height-batching requirement contradicted the measured cutoff, and the existing
scroll link already aligns by row id and within-row fraction. The 50-row defect
is instead the shorter follower clamping against unequal terminal scroll
ranges, including the table frame's 13rem picker allowance.

The plan and delta spec now target window publication and matching terminal
extent with production-path negatives and positive boundary controls.
The follow-up exact-head trace at `20a27d9f` completed five 500-row repeats on
h2puni. Their final counters were 313/12,142.4/11,303.2, 292/10,802.0/10,113.4,
293/10,963.7/10,242.6, 285/10,590.4/9,910.0, and
294/12,284.8/11,405.7 for WBS commits/WBS commit ms/Gantt commit ms. Medians are
293 commits, 10,963.7 ms total React commit time and 10,242.6 ms inside the
Gantt subtree: one Gantt commit per WBS commit and 93.4% of React commit time.
Task 2.2 therefore remains in scope; Gantt windowing remains out.

Focused h2puni lint is green at `20a27d9f`; the expected-red browser probe
completed in 5.0 minutes and failed only its existing 50 ms frame-gap assertion
(241.6 ms observed). The full gate at `98629c19` proved TASK-558 formatting,
OpenSpec validation, typecheck, build and unit tests; it also exposed the probe
lint now fixed at `20a27d9f` and two unrelated `tool-devsync` baseline failures
(the managed-Bun literal and namespacing digest). No local build or autotest ran.
