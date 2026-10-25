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

Claims marked "from memory" in design.md are unverified until task 0.2.

## Commands run for this proposal

Recorded in the PR description with their output: `openspec validate wbs-mcp-agent-surface
--strict`, `openspec validate --all --json`, Burokrat `check-indexes working . HEAD`, and
Prettier on the changed files. Not run: the h2puni gate and the full Nx suites. Nothing is
implemented, and CI carries them.

## Failure-proof table

| Check                                                                           | Fault injected | Test that observed it failing | Result |
| ------------------------------------------------------------------------------- | -------------- | ----------------------------- | ------ |
| (none yet: every row is added by the slice that builds the check, per tasks.md) |                |                               |        |
