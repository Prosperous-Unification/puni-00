# R6b elapsed timeline — throwaway experiment

Compare a six-rung elapsed-time ladder (7d, 24h, 6h, 1h, 15m, 5m) with a
minimal logarithmic slider using identical renderer, fixtures and selection.
This standalone read-only prototype does not import WBS services or write APIs.
It is not a replacement for the production workday axis (`DAY_SCALES=[28,12,4]`).

From the repository root, with frozen Bun dependencies installed:

```sh
bun experiments/r6b-timeline/serve.ts
```

Open <http://127.0.0.1:4317/> or `?variant=continuous`. Tab to an attempt and
press Enter for exact details. Arrow keys on a packet track pan; drag the ruler
or use pan buttons. Enlarged hit surfaces expose an explicit ambiguity list;
painted bars retain true elapsed widths. Fit commands synchronize both zoom
controls, with a disabled custom-fit label between discrete rungs.

The real fixture contains only attempt ID, packet, slice and two UTC endpoints.
Returned means executor return, not implementation success or review approval.
Synthetic ambiguity/load/day-precision cases are visibly labeled. Missing end
and zero duration are distinct. No timestamp is fabricated for a date-only fact.

With the server running, reproduce the checks:

```sh
bun test experiments/r6b-timeline/model.test.ts
bun experiments/r6b-timeline/browser.ts --measure
bun experiments/r6b-timeline/audit.ts
bun experiments/r6b-timeline/proofs.ts --browser
bunx tsc -p experiments/r6b-timeline/tsconfig.json
bunx eslint experiments/r6b-timeline/*.{js,ts}
bunx prettier --check experiments/r6b-timeline
bun build experiments/r6b-timeline/app.js --target browser --outdir /tmp/r6b-timeline-build
```

The fault command temporarily edits this experiment's sources and restores
each file in `finally`; run it without other readers/measurements. Chromium
must be installed. Evidence JSON and screenshots are generated beside this
file. Only `measurements.json` is authoritative; both `*.superseded.json`
files describe earlier exploratory runs.

The [research report](../../docs/wbs/research/2026-10-05-day-to-minute-gantt-experiment.md)
records protocol, findings, source hashes and limitations. Human task times,
errors and preference remain unmeasured. No production unit, calendar, rounding,
status, storage, solver or deployment decision follows from this experiment.
