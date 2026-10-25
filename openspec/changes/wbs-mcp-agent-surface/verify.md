## Verification record

Drafted 2026-10-25 as an OpenSpec proposal only. Nothing is implemented, and M1 to M12 are
assumed until Dany reads them.

Sources read on 2026-10-25 at `origin/main` 277fdf03c:

- mcp-01 `caller-auth.ts`, `http.ts`, `oauth.ts` (token dispatch, `callerSessionFor`,
  `bearerFor`, TTLs, signing keys), `organization-authority.ts`, `openapi-tools.ts`
  (`EXCLUDED_PATHS`), `server.ts` (scope check, `bearerFor` per call), `config.ts`
  (gateway guard), `credential-epoch.ts`, `README.md`;
- be-01 `middleware/authenticated.ts`, `http/identity.ts` (direct audiences),
  `runtime/mcp-delegation.ts`, `runtime/delegation.ts` (single-use consume), `boot.ts`
  (`SqliteDelegationUse`);
- `@wbs/core` `authentication.feature.ts` and `service/machine-key.ts`; `@wbs/contracts`
  `mcp-delegation-shapes.ts`;
- Twilight Dash `compute/configuration.ts` and `report-capacity.ts`;
- `docs/auth-integration.md`, `docs/local-dev.md` and `docs/import-with-ai.md`;
- the changes `wbs-machine-credentials` (A1 to A25), `wbs-claim-leases`,
  `wbs-organization-limits`, `compute-providers` and `wbs-permissions` (P17);
- PR #738.

External sources, read 2026-10-25:

- MCP authorization, revision 2025-11-25:
  https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
- MCP OAuth Client Credentials extension, stable 2026-07-28:
  https://github.com/modelcontextprotocol/ext-auth, file
  `specification/stable/oauth-client-credentials/2026-07-28/oauth-client-credentials.mdx`

Client facts (Claude Code, Agent SDK, Messages API connector, claude.ai connectors) were read 2026-10-25 by the coordinator from the URLs cited in design.md. MCP SDK 1.31.0 facts come from `node_modules` and the reviewer. RFC 6749 §4.4.3 and RFC 7523 §2.2 remain from memory.

## Review of 24dcae0a5 (Fable, high), how each item is addressed

| Item                                                                        | Where                                                                                                                   |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| S1-1 the upstream fallback passes through an Auth0 token                    | design Context table; M13; spec "accepts no upstream token after activation"; task 3.1                                  |
| S1-1 groups-less configured-issuer tokens                                   | M9 (refused, #731 a precondition); machine-credentials spec; task 0.3                                                   |
| S1-1 constraint wording                                                     | design Context ("any authorization server the metadata lists"); proposal Constraints                                    |
| S1-1 / S2-12 re-argue (b), cost table                                       | M1, now (i) + (ii), with a cost table                                                                                   |
| S1-2 the TTL cliff                                                          | M4 (12 h default, 24 h cap, jitter, behaviour at expiry); task 0.1 done first                                           |
| S2-1 a separate grant key, typ, verifier and cap                            | M3; spec "verified apart from delegations"; task 1.3                                                                    |
| S2-2 dedicated secret, constant-time compare, dot segments, honest property | M14; spec "Tool path values cannot traverse"; tasks 1.3, 3.4                                                            |
| S2-3 stateless versus the epoch                                             | M5 (no grants before activation, no epoch read); spec "A second replica" with spies                                     |
| S2-4 optional `client_id`, signing algorithms, federated profile            | M2; spec "workload token without client_id"; task 2.2                                                                   |
| S2-5 exp from the assertion, `jti`, WBS-unique audience                     | M3 (cap and optional `jti`); M2 (canonical resource, plus a registration audience under `MCP_PUBLIC_URL`, amending A25) |
| S2-6 rate limits                                                            | M10 (hop count, split counters, sizing, 429); four spec scenarios; task 4.2                                             |
| S2-7 leases are per person                                                  | M15; spec "One running agent per credential"; task 6.4                                                                  |
| S2-8 OIDC pools                                                             | M7: v1 is API keys only; seat selection is reopened for OIDC                                                            |
| S2-9 blast radius, key handoff, re-key                                      | M7; agent-pools spec "re-keyed"; tasks 6.5, 6.6                                                                         |
| S2-10 roll-out                                                              | tasks 7.0–7.2 and 8.1 (gate); fleets go straight to MCP                                                                 |
| S2-11 no env switch, Basic form in the absence test, A5 vocabulary          | M9 seam; secrets spec; M3 `unknown_identity`                                                                            |
| S3 items                                                                    | tasks 2.1, 2.2, 3.2, 3.6, 1.1, 4.2, 6.0, 6.2; M3 scopes and audit; glossary trimmed                                     |

## Commands run for this proposal

Recorded in the PR description with their output: `openspec validate wbs-mcp-agent-surface
--strict`, `openspec validate --all --json`, Burokrat `check-indexes working . HEAD`, and
Prettier on the changed files. Not run: the h2puni gate and the full Nx suites. Nothing is
implemented, and CI carries them.

## Failure-proof table

| Check                                                                           | Fault injected | Test that observed it failing | Result |
| ------------------------------------------------------------------------------- | -------------- | ----------------------------- | ------ |
| (none yet: every row is added by the slice that builds the check, per tasks.md) |                |                               |        |
