# Website AI operations figures

## Why

WBS 060.06.5 asks the operator to see active and denied calls, provider failures, per-request,
per-account and site spend and unsettled reservations, with a kill switch that keeps manual
proposals, and a test that recovery does not reset spend. The Guardrails and Funnel panels
already show today's spend, the pause, caps, alerts and ceiling-settled operations, but not the
calls in flight now, not spend for any day but today, and no test proves a restart or resume
keeps the day's spend.

## What Changes

- `GET /operator/guardrails` gains `inflightToday: { count, reservedMicroUsd }`, today's admitted
  and unsettled paid calls; the Guardrails panel shows it as `In flight now`.
- Each `GET /operator/funnel` day gains `spendMicroUsd`, that day's recorded site spend by the same
  rule as today's spend; the Funnel panel shows it as a `Spend` column.
- Store test: a restart settles an in-flight call at its reservation and a pause and resume leave
  the day's spend unchanged.
- `docs/website/build-runtime.md` gains "Reading the operator panels", mapping provider failure,
  exhausted cap, noisy source, stuck reservation and kill switch to the figure and the action.

## Non-Goals

Reconciliation of ceiling-settled calls (retired by batch 10 decision D3); per-account or
per-visitor spend (there are no accounts, and sources are salted daily hashes); stored counts of
individual refusals or provider failures (no new table; their floods raise alerts); choosing the
alert receiver (Dany: `GUARDRAIL_WEBHOOK_URL`); k3s metrics and a `ServiceMonitor`.

## Constraints

Counts and micro-USD only, no new table or migration, reads write nothing.
