## Why

Twilight Burokrat is a static judge: no clock, no network, no credentials. Its package still holds
the activation controller, the GitHub reader, the observation tick and service, review retrieval,
selection and attestation, and the review invoker. Those processes poll GitHub, spawn review
harnesses, hold a token and read 38 ambient clocks. The Burokrat clock guard lists them as Twilight
Dash's debt, and `docs/twilight-structure/names.md` promises they move.

## What Changes

The controller moves to `twilight-dash/cli/src/activation/`, keeping its file names. The review
invoker's runtime half (journal lock, file journal, process invoker) moves to `review/`, and the
observation unit renderer and templates move to `activation/units/`. Burokrat keeps every judge,
including the invocation journal records, `readInvocationJournal` and
`validate-review-provenance`. Dash reaches Burokrat only through `@twilight-burokrat/judge`, which
grows by exactly the names the moved modules import. Dash composes one wall clock and one
monotonic clock per process. Dash owns the observation store through `bootstrap-observation` and
`migrate-observation`, and renders the systemd units with `render-observation-units` from a
launcher that `twilight-dash:build` bundles. CI gates both suite apps on one shard,
`gate_twilight`.

## Non-Goals

Installing anything on a host, a live provider, running `bootstrap-observation` on a real host, a
Burokrat 0.2.0 release, merging the activation store with the admission authority, changing
`prepare-activation`, and closing `automatic-trusted-activation` tasks 1.2 and 2.1.

## Constraints

Burokrat never imports Dash. The store keeps its identity: `activation.sqlite`, the `activation_*`
tables, `user_version 10` and `observation.lock`. Unit semantics stay the same; only the unit file
names change. Every moved test keeps its name, and counts are recorded before and after each
slice. Every new or changed safety check gets a watched negative.

## Capabilities

### New Capabilities

- `dash-activation`: the relocated activation controller, its observation store commands and
  its launcher.

### Modified Capabilities

None.

## Domain Terms

Activation controller, Observation tick and Invocation journal are defined in
`docs/twilight-structure/CONTEXT.md` (slice S5).

## Decisions Recorded

ADR 0051 (slice S5): the activation controller runs in Twilight Dash as a second authority and
keeps the observation store identity.

## Impact

- **Burokrat:** loses `activation-controller/` and `review/invoker.ts`, and gains
  `review/invocation-journal.ts`.
- **Dash:** gains `activation/`, `review/`, three commands, a build target and a second
  composition root.
- **CI:** `gate_tool_wiki` becomes `gate_twilight`, and `infra/ci/burokrat/observation/` is
  removed.
- **Unchanged:** the npm CLI surface and the packed suite.
