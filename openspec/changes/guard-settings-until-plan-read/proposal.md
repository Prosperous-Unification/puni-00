## Why

Opening Project settings before the first plan read arrives mounts the priority editor with an empty ladder. Its drafts intentionally seed once, so the later authoritative bands never appear. A post-merge browser trace showed five valid server bands arriving after the dialog opened and an empty editor remaining for thirty seconds.

## What Changes

Project settings remains disabled until the first plan read supplies its priority ladder. Once ready, the same control opens editors seeded from the authoritative settings, and uncommitted drafts survive section changes.

## Non-Goals

Do not reseed mounted editors on refetch, change scheduling, modify solver contracts, or activate shared people mode.

## Constraints

Keep one settings control and its layout, preserve dirty/write close refusals, and prove the first-read race with a deterministic delayed GET. Keep slice 5 and its current exact-main gate unchanged. Missing first-read settings must not become an editable empty ladder.

## Capabilities

### New Capabilities

- `project-settings-readiness`: Require the initial plan read before opening project settings.

### Modified Capabilities

None.

## Domain Terms

None; project, plan, and priority ladder already have established meanings.

## Decisions Recorded

None; the loading guard is a reversible local boundary change.

## Impact

The frontend settings trigger and its unit/browser tests. No backend, persistence, dependency, or deployment contract changes.
