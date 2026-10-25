## Verification record

Drafted 2026-10-25 as an OpenSpec proposal only. Nothing is implemented, and M1 to M16 are
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

## Second review of 58e0cea79 (Fable, high), how each item is addressed

| Item                                                           | Where                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1-1 a claude.ai Team/Enterprise header is a shared credential | M1: (ii) is out of v1, Pro/Max only if Dany chooses it, Team/Enterprise consent-only; M12; Risks; task 0.2 (a)                                                                                                                                                                                                                                      |
| S2-2 the A25 audience amendment                                | machine-credentials MODIFIED delta; M2: `WBS_MCP_RESOURCE_URL`, equality or prefix plus `/`, existing rows, narrowing, URL change, dry-run preflight; task 1.5; task 0.3 (archive order)                                                                                                                                                            |
| S2-3 RFC 7523 conformance                                      | M2: OIDC moves to the §2.1 JWT-bearer grant (conformant); the client-assertion profile becomes the documented-deviation alternative; the Context RFC lines are corrected                                                                                                                                                                            |
| S2-4 a static assertion dies                                   | M2 `WorkloadJwtBearerProvider`; spec "A run outlives its workload token"; task 2.2 negative                                                                                                                                                                                                                                                         |
| S2-5 M15 cannot be enforced                                    | M15: the run is signed into the grant, renewal and claims are scoped to `(person, run)`, plus `run_mismatch`; spec requirement; task 6.1                                                                                                                                                                                                            |
| S2-6 raw-key failures, audit volume, lifetime                  | M5 (if (ii)): 60 s grants, failures counted, no per-miss audit; M3 audit per token grant only                                                                                                                                                                                                                                                       |
| S2-7 client facts                                              | Context: Agent SDK `headersHelper` and stored sign-in; M1 table reframed; proposal fixed                                                                                                                                                                                                                                                            |
| S2-8 negatives that cannot fail                                | task 3.3 (cache answers without be-01); task 1.2 (verifier accepts the delegation key)                                                                                                                                                                                                                                                              |
| S3-1 to S3-12                                                  | M1 (deviation, after M9); M10 (128 × R, 429 `invalid_request`); M11 (never forwarded, prefix detection; task 3.5 non-circular); stale text fixed (CONTEXT, line numbers, M1–M16); M14 (empty value, pathname, proxies, cutover; tasks 3.4, 3.7); M2 (two methods); M13 (markers; task 3.1); M3 (keys absent, `jti`); M7 (cleanup; agent-pools spec) |
| M16 undo                                                       | removed from the slices; now a dependency (task 0.3); the analysis is kept in the M16 table                                                                                                                                                                                                                                                         |

## Commands run for this proposal

Recorded in the PR description with their output: `openspec validate wbs-mcp-agent-surface
--strict`, `openspec validate --all --json`, Burokrat `check-indexes working . HEAD`, and
Prettier on the changed files. Not run: the h2puni gate and the full Nx suites. Nothing is
implemented, and CI carries them.

## Failure-proof table

| Check                                                                           | Fault injected | Test that observed it failing | Result |
| ------------------------------------------------------------------------------- | -------------- | ----------------------------- | ------ |
| (none yet: every row is added by the slice that builds the check, per tasks.md) |                |                               |        |
