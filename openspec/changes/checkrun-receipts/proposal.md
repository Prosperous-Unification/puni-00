## Why

Twilight Burokrat is a static judge, yet both `prepare-*-activation` commands ran the candidate's
checks themselves and read the host clock around each one. They were the last clock reads in the
Burokrat package, kept on an allow-list until a receipt protocol let Twilight Dash measure them
(WBS a81d93a0, assumption A32). WBS ba5d3298 asks for that protocol.

## What Changes

Twilight Dash gains `run-activation-checks`. It plans the candidate's checks through
`@twilight-burokrat/judge`, runs each check and its `bun test` skip probe after a pass, stamps the
instants from its injected wall clock, and writes a digest-chained CheckRun ledger beside
digest-named stream files. Burokrat defines the `CheckRun` and `CheckRunLedger` records. Both
preparers take a required `--check-runs <dir>` flag and judge the ledger against their own plan
instead of running anything, refusing it with a typed `CheckRunRefusal`. Burokrat's clock guard
loses its allow-list. The packed-package suite prepares through the installed `bin.mjs` from golden
ledgers that Dash wrote for a reproducible candidate.

## Non-Goals

Signing check runs, publishing Dash, a Burokrat 0.2.0 release, changing which checks a policy
selects or how a check receipt is derived from a run, any host install.

## Constraints

Burokrat never imports Dash, and the modules the judge facade reaches never name it. The npm CLI
keeps every command. Each new refusal gets a watched negative and a `Proof:` comment, and both sides
of every instant rule are tested. Dash's runner holds no store, lock or token, and shares only
`src/clock.ts` with its two authorities (ADR 0051).
