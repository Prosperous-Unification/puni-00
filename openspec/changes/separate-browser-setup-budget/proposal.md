## Why

Puni delivery tracking is implemented, but its browser verification has timed out three times while tests kept passing. Ubuntu package downloads consumed 9–12 minutes of the existing 25-minute whole-job limit, preventing the selected suite and organization checks from completing. Retrying the same budget repeats work and blocks a reviewable result.

## What Changes

Give browser provisioning, layout validation and organization validation explicit bounded allowances inside one finite job budget: 15, 25 and five minutes respectively, with a 50-minute whole-job limit. Keep the existing tests and required verdicts. Retain evidence that missing budget declarations and exceeded deadlines fail visibly.

## Non-Goals

No runner migration, extra capacity, mirror rewrites, caching, test sharding changes, automatic retries, scope-selection changes, ruleset changes, application behavior changes, merge or deployment. This contains setup variance; it does not repair the package mirror's transfer speed.

## Constraints

Preserve four browser shards, zero Playwright retries, existing commands and organization acceptance, and the stable fail-closed pixels reducer. The layout allowance retains the former maximum whole-job duration; it does not reduce slow shards to a provisional 20-minute cap. Failed, cancelled and missing checks remain unacceptable. Record actual Actions deadline faults separately from static YAML contract proofs. Keep this correction separate from the provider-neutral delivery model.

## Capabilities

### New Capabilities

- `browser-validation-budget`: bounded provisioning and browser validation within the existing CI gate.

### Modified Capabilities

None.

## Domain Terms

None; existing CI and delivery terms apply.

## Decisions Recorded

None; these operational limits are reversible.

## Impact

The browser shard workflow, its existing production-YAML contract tests, and a narrow OpenSpec verification record. This correction is necessary to complete the autonomously authorized delivery-tracking validation; it is merged under the 2026-10-24 goal, and production deployment and secrets stay outside it.
