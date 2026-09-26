## Why

The public `/mcp` URL is configured, but production ingress does not route OAuth discovery to mcp-01. The current redirect rule excludes documented hosted clients. A successful login alone also cannot establish WBS import permission, and live refresh at the public URL is unproven.

## What Changes

- Route protected-resource and authorization-server discovery through production ingress and prove the public HTTPS MCP/OAuth flow end to end.
- Admit loopback callbacks with valid arbitrary ports and a reviewed list of exact hosted HTTPS callback URIs. Keep exact registered-URI checks at authorization and grant-bound checks at token exchange.
- Verify requested and granted `wbs:write`, refresh, revocation and project authorization with a disposable project before declaring import-capable public access.

## Non-Goals

No personal access tokens, broad callback wildcard, default write grant, client-specific import guide or commitment to the current identity provider. The identity vendor may change to WorkOS with organizations; this contract stays IdP-agnostic.

## Constraints

Current omitted OAuth scope defaults to `wbs:read`. The mcp-01 default access-token TTL is 3600 seconds because a live client refresh grant has not been observed. Client registration advertising refresh does not prove renewal. Unknown hosted callbacks require exact evidence and review before addition.

## Capabilities

### Modified Capabilities

- federated-authentication: admissible callbacks and exact OAuth binding.
- mcp-session: write-scope, refresh and revocation proof.
- deployment-pipeline: production discovery ingress and live URL proof.

## Domain Terms

None.

## Decisions Recorded

None; the allowlist is an operational security boundary, not an IdP choice.

## Impact

mcp-01 OAuth tests, public ingress, deployed smoke and runbook evidence. No database migration.
