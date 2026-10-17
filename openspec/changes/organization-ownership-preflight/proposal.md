## Why

Operators have separate ownership queries but no single read-only report over a copied WBS database. Without a coherent snapshot, individually correct answers can describe different database states and obscure unresolved ownership findings.

## What Changes

Add an operator CLI using explicit `DB_PATH`, reporting the durable activation marker, unmapped roots, catalog name drift, and ownership conflicts from one snapshot. A completed report exits zero even with findings; inability to read trusted state exits nonzero without a report. Document exactly what this prerequisite inspects.

## Non-Goals

No ownership mutation, backfill, activation, deployment, reviewed production identity or access mapping, journal payload or captured saved-body inspection, old-process drain, or MCP credential epoch proof. Empty findings do not establish rollout readiness. Parent `organization-ownership-and-access` tasks 1.1 and 7.1 and WBS010.5.4 remain open.

## Constraints

Compose existing marker validation and ownership queries. Use an existing copied/disposable database, a dedicated read-only connection, one deferred read transaction, bounded local validation, no network installation, and R5 watched negatives. Preserve all existing parent requirements.

## Capabilities

### New Capabilities

- `organization-ownership-preflight`: Read-only ownership findings from one WBS snapshot.

### Modified Capabilities

None.

## Domain Terms

None; existing Organization and Legacy organization terms suffice.

## Decisions Recorded

None.

## Impact

WBS SQLite adapter, be-01 operator CLI, focused SQLite and CLI tests, operator runbook. No migration or runtime routing changes.
