## Why

Readers can see assignments, team labels and stored parallelism but cannot read the effective resource constraint of one leaf step without reproducing scheduler rules.

## What Changes

Expose optional additive `nodeResources`, keyed by step ID, on live leaf reads. Each value names the stable node ID, explicit/assumed/unassigned assignment, stated/unstated effective teams with project capacities and inheritance source, stored maxParallel and resolved width. Emit an empty map for stepless leaves and omit the field on parents. Share resource resolution with scheduler slicing while preserving slice bytes, pool order and effort arithmetic. Resolve from complete retained project values, including held leaves and filtered ancestors, using shared snapshots when active. Include the field in constraints pages and MCP schemas. Exclude it from plan documents and saved-plan persistence.

## Non-goals

No StepBlockage activation, row status or Board semantics, scheduler policy changes, persistence or migration.

## Constraints

Older responses may omit the field. No directory labels or additional store reads are needed. Keep stage7a in progress until coordinated review and host gating.
