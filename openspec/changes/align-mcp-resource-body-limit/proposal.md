## Why

The public Caddy edge caps every MCP request at 64KB, although the MCP resource deliberately accepts 4,194,304 bytes. A WBS notes update received HTTP 413 before reaching the resource. The note’s 62,467 UTF-8 bytes alone do not measure its serialized JSON-RPC request.

## What Changes

Exact `/mcp` requests can reach the resource through its existing 4,194,304-byte body boundary. Larger requests receive 413. OAuth and every other `/mcp*` path retain the existing 64KB edge boundary. The reviewed candidate and the configuration rendered during a swap agree.

## Non-Goals

Changing OAuth capacity, SDK body limits, authentication, discovery, exposure activation, forwarding trust, SSO, solver configuration, or live Caddy configuration.

## Constraints

Preserve byte-exact paths and overwrite caller-supplied forwarding sources. Exercise both production configuration paths with disposable Caddy, record serialized UTF-8 request sizes, and prove rejection leaves upstream writes unchanged. Required CI and host test targets must run the integration test and refuse missing tools. No live reload is authorized.

## Capabilities

### New Capabilities

- `mcp-edge-body-limit`: Match the resource body limit at the exact public route while bounding anonymous routes independently.

### Modified Capabilities

None.

## Domain Terms

None. Existing MCP authentication terms suffice; HTTP body limits are general technical concepts.

## Decisions Recorded

None. This is a reversible alignment of existing boundaries.

## Impact

Caddy candidate, swap renderer, their unit tests, and a required Docker-backed Caddy integration target. No application or database contract changes.
