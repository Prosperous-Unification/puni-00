## Why

Agents reach WBS two ways: a human-consented MCP session, or be-01's HTTP API with a machine
credential. An API key or trusted-issuer token gets `401 invalid_token` on `/mcp`, and one
connector entry holds one consent, so a swarm cannot get per-agent identities over MCP
without a browser sign-in each. Two surfaces mean two sets of tools and docs to maintain;
Dany chose MCP as the one (2026-10-25).

## What Changes

**How a headless agent connects**

- From: HTTP with a `wbs_mk_` key or a trusted-issuer token.
- To: MCP. The agent gets a short-lived mcp-01 access token through the OAuth client
  credentials grant (an MCP authorization extension), authenticating with its API key or its
  workload's OIDC token.

**Who it is on MCP**

- From: a human, or an agent person a human consented to.
- To: also the credential's agent person, with the principal, leases, member cap, limits and
  tool list it has today.

**What be-01's HTTP API is**

- From: a documented agent API.
- To: internal transport for mcp-01 and the browser app; it refuses machine bearers. Tools
  still derive from its OpenAPI document.

**How a swarm gets N identities**

- From: one admin act per key.
- To: an admin approves an agent pool once: N agent persons and credentials in one act.

Credential, issuer, pool and organization administration stay human-only and leave the MCP
tool list.

Impact: breaking for HTTP fleets and the Dash capacity reporter; no external users, so no
compatibility window.

## Non-Goals

- Changing consent or hosted-connector sign-in.
- Wildcard OIDC subjects, machines minting credentials, per-organization rate limits, billing.
- A REST deprecation period.

## Constraints

- MCP authorization (2025-11-25): mcp-01 accepts only tokens its own server issued, and never
  passes a client's token through.
- A2, A12, A23 and A24 hold; a machine never administers or mints credentials.
- A machine session leaves no mcp-01 store rows.
- Additive migration with a guarded `down.sql`. Secrets are never logged.
- Every refusal has a production-path negative and a `Proof:` comment.

## Capabilities

### New Capabilities

- `mcp-agent-surface`: admission, machine grant, parity, limits, human-only tools.
- `agent-pools`: admin-approved bulk issuance.

### Modified Capabilities

- `machine-credentials` (`wbs-machine-credentials`): be-01 refuses machine bearers on `/api`.
  This reverses that change's non-goal "MCP `client_credentials`".

## Domain Terms

Agent surface, Machine grant, Agent pool (in `CONTEXT.md`).

## Decisions Recorded

M1 to M12 are assumed, awaiting Dany (design.md).
