## 0. Dany reads M1 to M12

- [ ] 0.1 Dany confirms or amends design.md M1 to M12. The ones most likely to be overruled
      are M1 (client credentials, not a raw key at `/mcp`), M3 (a multi-use grant), M7 (bulk
      issuance, not a pool credential) and M9 (refuse machine bearers on `/api`). Slices 1 to
      4 wait for M1 to M3. Slice 5 waits for M8. Slice 6 waits for M7. Slice 7 waits for M9.
- [ ] 0.2 Re-read the client facts design.md marks "from memory" against vendor docs, and
      record each with its date in verify.md: client-credentials support in Claude Code, the
      Agent SDK and the Messages API connector; Claude Code `headers`; RFC 6749 §4.4.3; RFC
      7523 §2.1 and §2.2. A fact that turns out false reopens M1 or M4 before slice 3.

## 1. be-01 issues and admits machine grants

- [ ] 1.1 Red: `machine-grant.test.ts` in `@wbs/core` covers the pure grant decision. Given a
      verified credential admission, it answers the grant claims (`sub`, person, organization,
      source, `exp` ≤ now + TTL). Given a presented grant, the service-secret fact and the
      credential row, it answers `machinePrincipalOf`'s principal or `unknown_identity`. Cases:
      one per refusal, and a property that a revoked or unbound credential is never admitted
      whatever the grant's `exp`.
- [ ] 1.2 Green: `POST /internal/mcp/machine-grants` (shape in `mcp-delegation-shapes.ts`)
      takes `{ kind: 'api_key', key } | { kind: 'oidc', assertion, clientId }` under
      `x-internal-auth`. It runs the existing `authenticateMachineKey` / trusted-issuer path,
      requires the matched id to equal `clientId`, and signs with `WBS_DELEGATION_SIGNING_KEY`
      at `aud wbs-be-01/machine-grant`. Test: `machine-grant.controller.db.test.ts` answers a
      grant for a live key and for a GitHub-shaped assertion, and refuses `unauthorized`
      without the header. Negative: drop the `clientId` equality and the "another credential's
      id" case admits; watched, restored, `Proof:` adjacent.
- [ ] 1.3 Grant admission on `/api` in `identity.ts`: a third direct audience, admitted only
      with a valid `x-internal-auth`. Every use rereads the credential (`findById`, unrevoked,
      person bound, account a member). There is no consume write. Test: the mounted controller
      admits a grant with the header to its organization's projects only. It refuses the same
      grant without the header `401 invalid_token` and after a revoke `credential_revoked`, and
      100 reads leave the delegation-use table empty. Negatives, each watched failing: remove
      the header check (the no-header case admits); remove the credential reread (the
      post-revoke case admits); call the consume function (the no-write assertion reddens).
- [ ] 1.4 Parity: a fixture runs one credential's claim through a grant and through its raw
      key. The test asserts equal principals, L1 leasing, renewal by `/api/claims/renew`, and
      the same `claim_limit` refusal. Negative: have the grant principal omit `personId` and
      the lease assertion reddens.

## 2. mcp-01's token endpoint answers client credentials

- [ ] 2.1 Red: `machine-token.test.ts` covers the form parse at the boundary (body and Basic,
      `client_id` versus key id, `client_assertion_type` exact, `resource` equal to
      `MCP_PUBLIC_URL`, scope ⊆ `wbs:read wbs:write`). Values are held in a redacting
      `MachineSecret` whose `toString`/`toJSON` print `[credential]`.
- [ ] 2.2 Green: `McpOAuthServer.token` dispatches `client_credentials` to the be-01 route and
      signs the access token (`aud` resource, `token_use machine`, `wbs_grant`, `exp` =
      the grant's, no refresh token). Metadata gains the grant and the three auth methods.
      `MCP_MACHINE_TOKEN_TTL` is parsed at boot and refused outside 60 to 3,600 s. Test:
      `oauth.test.ts` issues, lists tools with the token, and gets the four failures as one
      identical `401 invalid_client`. Negatives: answer `invalid_grant` for a revoked
      credential and the indistinguishability test reddens; let DCR register
      `client_credentials` and its refusal test reddens; watched.
- [ ] 2.3 Secrets: an injected be-01 failure during a token request is captured by the
      unexpected-failure reporter and by route evidence. The test asserts no `wbs_mk_` string
      or assertion appears, using the `plaintext-secrets` hook's own pattern. Negative: put the
      form in the report and the test reddens; watched.

## 3. /mcp admits machine tokens statelessly

- [ ] 3.1 `verifyLocal` dispatches on `token_use`. A machine token is verified by signature,
      `aud`, `exp` and the activated epoch, with no `familyForSession` read. `bearerFor` returns
      the embedded grant and the client sends it with `x-internal-auth`. Test:
      `machine-session.boot.test.ts` (production be-01 composition via
      `mcp-delegation-backend.ts`) lists projects and runs a command batch, and both stores
      gain no row. A second `McpOAuthServer` with an empty store and the same keys answers the
      same token. Negatives, each watched: forward the access token instead of the grant (be-01
      answers `401` and the batch test reddens); read the session store for machine tokens (the
      second-replica case reddens).
- [ ] 3.2 Refusals at `/mcp`: a raw `wbs_mk_` key, a trusted-issuer token, and a machine token
      at `/refresh` or `/revoke`. Test: each is refused as the spec says and be-01's fake
      records zero requests. Negative: route `wbs_mk_` to the machine path and the raw-key test
      reddens; watched.
- [ ] 3.3 Revocation: revoking the credential mid-token makes the next tool call answer a
      `credential_revoked` tool error and the next token request `invalid_client`. Negative:
      cache the be-01 credential read for the token's life and the test reddens; watched.
- [ ] 3.4 Gateway mode (M11): `client_credentials` is `unsupported_grant_type`, the metadata
      omits it, and a `token_use: machine` JWT on `/mcp` is `401`. Negative: let the gateway
      decode path run first and the forwarded-nothing assertion reddens; watched.

## 4. Limits

- [ ] 4.1 A pure token-bucket and in-flight counter in mcp-01, with fake-clock property tests:
      a bucket never admits more than burst + rate × elapsed; the in-flight count returns to
      zero after every settled call, whether it resolved or threw.
- [ ] 4.2 Wire the four limits (M10) with startup parsing. Test: the runaway/neighbour
      scenario, the token-guessing scenario (≤ 60 be-01 calls), and `Retry-After` present.
      Negatives: key the `/mcp` limit by organization instead of credential and the neighbour
      reddens; decrement in-flight only on success and the property reddens; watched.
- [ ] 4.3 Load evidence, not a gate: 50 machine tokens × 2 tool calls a second for 5 minutes
      against a dev-shaped be-01 on h2puni under the heavy lock. Record p50/p99 latency, be-01
      writes a second and write-coordinator wait in verify.md, beside the same run on consent
      sessions (one consume write per call).

## 5. Human-only tools by policy

- [ ] 5.1 Add a `humanOnly` endpoint policy and tag the routes M8 lists. `openapi-tools.ts`
      excludes by policy, and `EXCLUDED_PATHS` shrinks to auth, internal, smoke and
      `/api/organization/active`. The capacity report route becomes a tool. Test: the
      production-document test asserts the absent set and the present report tool, and a
      `humanOnly` shape matching no operation throws at derivation. Negatives: untag one route
      and its absence assertion reddens; delete a tagged route from the document and startup
      throws; watched.
- [ ] 5.2 Same list for every principal: one test lists tools as a consented human, a consented
      agent and a machine token, and asserts equal names and descriptions.

## 6. Agent pools

- [ ] 6.1 Migration `add_agent_pool`: an `agent_pool` row (organization, name, issued_by,
      expires_at, revoked_at, audit columns) and a nullable `machine_credential.agent_pool_id`.
      Audit vocabulary gains `agent_pool_created` and `agent_pool_revoked` by the compatible
      rebuild, with a `down.sql` refusing while any pool or new-action row exists. Test: the
      migration forward, back and the refusal. Negative: drop the guard and rollback deletes a
      pool; watched.
- [ ] 6.2 Create and revoke routes (admin only, `humanOnly`), one transaction each, with the
      cap checked inside the batch's `BEGIN IMMEDIATE`. Expiry is read at admission. Tests: the
      spec's five scenarios. Negatives: check the cap outside the transaction and a concurrent
      pair crosses it (model-based, `fc.asyncModelRun`); let a member create and its refusal
      reddens; skip a credential in the unit revoke and the lease release assertion reddens;
      watched.
- [ ] 6.3 fe-01 pool panel on `@ui/core-01`/`@ui/saas-01`. It shows keys once, then a revoke
      with the count of what it ends, listed before confirming. Covers loading, empty, failure
      and the cap refusal as rendered states, and is reviewed by eye.

## 7. REST stops being an agent surface

- [ ] 7.1 be-01 refuses machine bearers on `/api` (M9) before any read. Test: the spec's
      scenarios. Negative: move the refusal after `parseMachineKey`'s read and the "no
      credential row read" assertion reddens; watched.
- [ ] 7.2 Twilight Dash's capacity reporter becomes an MCP client: client credentials, then
      the report tool. Test: `report-capacity.test.ts` against the booted fixture. Negative: the
      old HTTP path now answers `machine_bearer_not_accepted`, and its test proves that.
- [ ] 7.3 Docs (M12): rewrite `docs/auth-integration.md` "Fleets and the MCP endpoint" and
      `docs/local-dev.md` (PR #738), add the headless section to `docs/import-with-ai.md`
      with dated vendor sources, and update `apps/wbs/mcp-01/README.md`. Burokrat
      `check-indexes` exits 0.

## 8. Roll-out

- [ ] 8.1 Dev: deploy, mint a pool of 3, and run three Claude Code agents over MCP with
      orchestrator-fetched tokens. Each claims, heartbeats and releases. Revoke the pool
      mid-run and observe the leases end. Record this in verify.md.
- [ ] 8.2 Prod runbook: the swap window says HTTP fleets stop at the swap (M9), and PUNI's
      fleets move to MCP on dev first.
