## Why

Twilight Burokrat resolves service kinds from filename suffixes and `view` directories only. `docs/code-organization/kinds.json` records the reviewed kind of every unsuffixed backend service, but no rule reads it, so a file it classifies is invisible to K2 through K6 and a forbidden import from it passes vacuously (WBS 080.18.4).

## What Changes

A rule policy may name a kind inventory by candidate-relative path. The inventory is read from the selected candidate's blob, validated, and merged into the kind graph: `delivery`, `feature`, `resource` and `repository` entries are judged like suffix-declared files, and `support` entries are recorded and never judged. An inventory the candidate cannot supply leaves every rule that reads kinds unevaluated. The repository rule policy names `docs/code-organization/kinds.json`, and every rule stays in observe mode.

## Non-Goals

No new service roots in the Dev inventory check, no port kind, no whole-repository relationship request, and no change in mode for any rule. The inventory stays optional for consumers that have none.

## Constraints

The inventory declares kinds and never selects rules or modes, so reading it from the candidate keeps the rule that a candidate cannot select its own policy. Suffixes and composition roots keep precedence: the check refuses an inventory entry that contradicts them instead of ranking it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `burokrat-rules`: kind resolution reads an optional, candidate-held kind inventory.

## Domain Terms

None.

## Decisions Recorded

None. This implements [ADR 0029](../../../docs/adr/0029-services-have-a-kind-and-one-direction.md) for unsuffixed files.

## Impact

`twilight-burokrat` rule policy schema (additive optional field), kind graph and rule evaluation; `docs/code-organization/rule-policy.json`.
