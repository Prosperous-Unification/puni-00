## Why

The repository pins `caught-object-report-json` 11.0.1 and `application-exception` 0.5.0; the
registry carries 13.0.0 and 0.7.0, each release breaking. The two cannot move one at a time:
application-exception 0.5.0 depends on the report library at `^11.0.1`, 0.6.0 at `^12.0.0` and
0.7.0 at `^13.0.0`. Moving the report library alone installs a second, nested copy at 11.0.1,
and application-exception keeps writing the operator's reports in the old format through it.

## What Changes

**Report libraries**

- From: report library 11.0.1 and application-exception 0.5.0, one installed copy, held only by
  lockfile keys.
- To: 13.0.0 and 0.7.0 moved together in one step, and a test that proves the installed tree
  resolves one copy — the one application-exception loads — at the pinned version.
- Impact: internal. Every boundary keeps reporting through `@shared/failures`.

**Operator failure records**

- From: diagnostic reports carry `v: "corj/v0.14"`; a reporting-error row names `key` and `prop`.
- To: `v: "corj/v0.15"`; a row names `reportKey` and `sourceProperty`. The fingerprint of a
  failure is unchanged, and the log schema still accepts records written before the move.
- Impact: contractual for anything reading WBS log lines. HTTP, WebSocket and MCP responses and
  the public report (`appex/public/v4`) are unchanged.

## Non-Goals

No new boundary, exception kind, limit or public byte budget; no `di-bag` move; no telemetry
endpoint. A revoked `Proxy` as a cause still makes the report library throw (its issue 217 is
open on 13.0.0), so the never-throw wrapper stays exactly as it is.

## Constraints

Exact pins through Bun, one lockfile edit. Every changed safety check carries a watched
production-path negative under R5, and the proofs the byte budget moved away from are observed
again on the new versions.

## Capabilities

### New Capabilities

- `report-libraries`: One installed report library serves every report, and operator records
  written before and after a report-format change stay readable.

### Modified Capabilities

None.

## Domain Terms

None.

## Decisions Recorded

None.

## Impact

`package.json`, `bun.lock`, `libs/shared/domain/failures`, the pins suite in `tools/tool-devsync`,
the version literals in the observability, backend, gateway and MCP boundary tests, and the
frontend's browser package probe.
