## Why

Workers telemetry can disappear without an alert, and the Elastic snapshot setup Job proves policy installation rather than continuing snapshot success. These gaps leave operators unaware of missing telemetry and failed daily recovery points.

## What Changes

Alert after ten minutes without the expected workers cluster host metrics. Validate the daily Elastic SLM policy every fifteen minutes and alert when successful freshness checks stop for thirty-five minutes. Reject foreign cluster and namespace series as evidence.

## Non-Goals

No h3/h4 rollout, recipient delivery, per-node inventory reconciliation, or snapshot restore rehearsal.

## Constraints

Use shipped locked images, explicit environment cluster selectors, existing kube-state-metrics, and production-path negative proofs. Preserve current alerts.

## Capabilities

### New Capabilities

- `fleet-alert-freshness`: workers heartbeat and daily snapshot freshness alerts.

## Domain Terms

None; existing workers cluster and snapshot terms apply.

## Decisions Recorded

None.

## Impact

Platform alert, telemetry, Prometheus and snapshot resources; tool-fleet conformance tests.
