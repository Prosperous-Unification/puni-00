## 1. Store

- [x] 1.1 Paired migration `20261021120000_mcp_client` (table `mcp_client`, source and expiry indexes) appended to `MCP_STORE_MIGRATIONS`; ledger expectations in `store-migrations.test.ts` name it. Test: `rolls back to the binding migration, dropping clients, and forward again`.
  - Proof: `down.sql` with `SELECT 1` in place of `DROP TABLE` fails that test.
- [x] 1.2 `McpSessionStore` client API: `admitClient` (census and insert under one IMMEDIATE transaction), `client`, `clientsFromSource`, `extendClient`, `promoteClient`, `deleteExpiredClients`. Test: `keeps a registered client across a reopen until it expires`.
  - Proof: dropping each `expires_at > ?` filter, or turning the delete into a SELECT, fails that test.
- [x] 1.3 Malformed stored rows throw instead of reading as absent. Test: `refuses a stored client with … instead of reading it as absent` (five cases).
  - Proof: dropping the type, redirect-list and JSON checks in turn fails their cases.

## 2. OAuth server over the store

- [x] 2.1 Registration, authorization and code exchange read and write clients through the store; promotion reservations stay in memory (JSDoc on `promotionReservations`). Tests: `authorizes and exchanges a code for a client registered before the restart`, `counts clients registered before the restart against the global and source limits`, `keeps a promoted client proven and counted across the restart`, `keeps the absolute unproven lifetime an authorization extension stored before the restart`, `deletes an expired client from the store when the next request sweeps`, and the existing lifetime and cap tests.
  - Proof: a store that forgets clients at open, a zero census, an empty source census, a skipped extension, a skipped promotion, a dropped reservation and a skipped sweep each fail named tests (see `verify.md`).
- [x] 2.2 Unknown or expired `client_id` at authorize answers `400 invalid_client` with `error_description`; other malformed requests stay `invalid_request`. Tests: `answers invalid_client with a re-register hint for an unknown client_id`, `answers invalid_client once an unproven client expires across a restart`, `keeps the request error for a malformed authorization of a registered client`.
  - Proof: answering `invalid_request` for the unknown client, or `invalid_client` for the malformed or unregistered-redirect branches, fails those tests.

## 2b. Review fixes (PR #622)

- [x] 2b.1 Authorization re-checks a stored redirect against the current allowlist (`isListedRedirect`). Test: `refuses a stored redirect that is no longer on the allowlist`.
  - Proof: dropping `isListedRedirect` from the check makes that test answer 302.
- [x] 2b.2 `extendClient` only moves a lifetime forward (`MAX`). Test: `never shortens a lifetime when an extension follows a promotion`.
  - Proof: plain `SET expires_at = ?` fails that test.
- [x] 2b.3 `oauthError` renamed `protocolError` to remove the CodeQL `js/insufficient-password-hash` misclassification (see `verify.md`).

## 3. Names and docs

- [x] 3.1 Rename `InMemoryMcpOAuth` to `McpOAuthServer` across mcp-01 sources and tests (mechanical).
- [x] 3.2 README durable-store section, `docs/auth-integration.md` client lifetimes paragraph, `CONTEXT.md` term **Registered MCP client**.

## 4. Close

- [x] 4.1 Fresh `wbs-mcp-01` test, typecheck and lint; migration lint; `openspec validate --all --json`; record in `verify.md`.
- [ ] 4.2 Full gate on CI for the PR head (the laptop runs only mcp-01 targets).
- [ ] 4.3 Dev check after the next deploy: a connected client authorizes without clearing its authentication.
