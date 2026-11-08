## Why

Main's schema1 registry foundation and the retained managed schema3/4 authority occupy the same module and CLI paths with incompatible initialization, grammar and recovery behavior. Taking either implementation wholesale would discard an existing contract and prevent faithful source integration.

## What Changes

Preserve the six foundation exports and one-directory CLI at their current paths. Expose the nineteen retained managed exports and installed-authority CLI through explicit managed modules while preserving the existing publication facade's managed meaning.

Use one shared transaction coordinator with fixed internal profiles and precise external types. Preserve each profile's state versions, command grammar, ownership, durability, capacity, chronology and recovery behavior. Retarget only named managed imports and artifact builders; ordinary delivery and active manifests retain their baseline behavior.

## Non-Goals

No activation, automatic state migration, installed-artifact replacement, provider operation, publication, physical maintenance qualification or completion of the original rollout. The backup physical-budget adapter and first-recovery interoperability acceptance remain open.

## Constraints

Preserve normal source ancestry, all original additions, main's complete foundation policy/tests/evidence and accepted safety fixes. Reject wrong-profile reads before state or orphan changes; only explicit managed upgrade may consume legacy versions. Do not infer profiles from catalogs, ports, paths or state absence, widen managed responses to schema1, duplicate coordinators or weaken guards. Scoped source acceptance precedes parent push; complete hosted CI on the exact published head precedes external merge; deployment/adoption retains its separate canonical host gate.

## Capabilities

### New Capabilities

- `registry-journal-profiles`: Compatible explicit foundation and managed command surfaces sharing durable coordination.

### Modified Capabilities

None; both existing behavior contracts remain intact.

## Domain Terms

None newly resolved; retain the existing factory and registry-foundation glossary scopes, including maintenance record's distinction from verified physical evidence.

## Decisions Recorded

None; these dormant source boundaries do not meet all three ADR criteria.

## Impact

Fleet journal modules, affected managed callers/facade, CLI tests/build selection and source installer recipes. No new dependency or runtime wiring.
