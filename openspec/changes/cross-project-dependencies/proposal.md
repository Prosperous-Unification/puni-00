## Why

Work items cannot currently depend on work in another project, and their numbers identify them only inside one plan. Planners must coordinate external prerequisites manually. Project-qualified addresses and real cross-project dependencies make those prerequisites visible and enforce their ordering without flooding the existing picker.

## What Changes

- Every project receives a unique abbreviation within its organization. Generated recommendations use 3–5 uppercase letters; manual values accept 1–20 characters, beginning with a letter and continuing with letters, digits, hyphens or underscores. Input is case-insensitive.
- Qualified addresses use dots: `PUNI.080.39`, `PUNI-CORE.080.39`, and qualified step references. Existing numeric addresses stay local; stored relationships retain stable endpoint identities across renumbering and abbreviation edits.
- Empty or numeric dependency searches remain local. An alphabetic current token starts bounded project autocomplete, preserving local title matches. Selecting a project scopes its work-item/step search.
- Authorized cross-project dependencies retain the existing relationship types and endpoint scopes. Readiness, blocking and dates respect external prerequisites. Priority orders eligible work; it cannot override a dependency.
- Validation rejects actual resolved task/step cycles while allowing interleaving such as `A.design → B.build → A.test`.
- Live updates, undo, copying, exports/imports and saved plans preserve external relationships and their meaning.

## Non-Goals

Cross-organization dependencies, project-level ordering restrictions, whole-project endpoints, or claims of globally optimal scheduling.

## Constraints

Preserve local behavior and access boundaries; require successor edit and predecessor read access. Use additive migrations with rollback and explicit compatibility for older writers. Never omit unresolved prerequisites or fabricate dates. Preserve API/MCP contracts through explicit versioning, and prove new safety guards with watched production-path negatives. CI and the isolated host gate remain release gates.

## Capabilities

### New Capabilities

- `project-addresses`: abbreviation allocation, editing, qualification and authorized lookup.
- `cross-project-dependencies`: external relationships, graph integrity and dependency-first scheduling.

### Modified Capabilities

- `wbs-domain`: dependency endpoints and lifecycle across projects.
- `plan-import`: preserve and explicitly resolve external references.
- `saved-plans`: capture external identity and scheduling evidence.
- `live-plan-snapshot`: authorized remote endpoint projections and invalidation.
- `scheduler-optimization`: validate connected schedules across project boundaries.
- `plan-command-registry`: external endpoint admission without changing batch aliases.

## Domain Terms

Project abbreviation; qualified work-item address; cross-project dependency.

## Decisions Recorded

- [ADR 0064: cross-project dependency activation is monotone](../../../docs/adr/0064-cross-project-dependency-activation-is-monotone.md).
- [ADR 0066: supervisor exclusion does not require an identity broker](../../../docs/adr/0066-supervisor-exclusion-does-not-require-an-identity-broker.md).

## Impact

WBS domain/application/store libraries, HTTP/MCP contracts, be-01/gw-01/fe-01, scheduler engines, migrations, snapshots and plan documents.
