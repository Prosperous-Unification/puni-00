## Why

The WBS logger serializes an `err` into `{ type, message, stack }` while the declared log schema says `{ name, message, stack }`, so a query written against the schema reads a field the logger never emits, and no test noticed because no test logs an `err`. `@shared/failures` now produces a redacted, bounded diagnostic report with an occurrence identifier and a fingerprint, and nothing carries it into a log line.

## What Changes

**Failure log records**

- From: the logger renders a caught value itself, into a shape the log schema contradicts, with no correlation handle, no retry signal and no redaction.
- To: the logger writes the sanitized diagnostic report of one failure under `err` — for every value a boundary logged there, `undefined` included — and the log schema declares that record as exactly one of a diagnostic report or a visible reporting loss, so an operator can correlate a line with what a user or agent was told.
- Impact: contractual for anything reading WBS log lines; the Pino envelope, levels and correlation fields are unchanged.

## Non-Goals

No boundary adopts the contract in this change: the backend unexpected-error boundary, the MCP tool-call boundary and the gateway remain as they are. No new service name, no new telemetry endpoint, no dashboard or ingestion query change, no HTTP status, WebSocket frame or MCP envelope change, and no browser-execution claim.

## Constraints

A caught value is untrusted data, so provenance is a registration this process performed, never a shape read off the value. Redaction and the byte budget belong to `@shared/failures` and are not applied a second time. The diagnostic report goes only to the operator sink; the public report is never written in its place. Pino rethrows a throwing serializer and writes no line, so serializing a failure never throws, and every safety check here carries a watched production-path negative under R5.

## Capabilities

### New Capabilities

- `failure-log-records`: What a log line carries about one failure, and what it must never carry.

### Modified Capabilities

None.

## Domain Terms

None.

## Decisions Recorded

None.

## Impact

`libs/wbs/adapters/observability/src/{serializers.ts,logger.ts,log-schema.ts,index.ts}` and their tests. The ten existing `logger.error`, `logger.warn` and `logger.info` call sites that pass `err` in `apps/wbs/be-01`, `apps/wbs/gw-01` and `libs/wbs/application/core` keep compiling and change only the shape of the `err` field they produce.
