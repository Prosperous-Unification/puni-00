## 1. Make public discovery routable

- [x] 1.1 Add failing ingress/rendered-manifest and mounted-route tests for the exact protected-resource and authorization-server discovery URLs; prove the existing fallback reaches the frontend.
- [x] 1.2 Add narrow production ingress routes to mcp-01 and preserve `/mcp` and API routing.
- [x] 1.3 Remove one discovery route in a fault run; watch the routing test fail, restore and add an adjacent Proof: comment.

## 2. Bound OAuth redirects

- [x] 2.1 Add failing mounted registration, authorization and token tests for every exact hosted URI and loopback arbitrary ports; add negatives for lookalikes, path/query/port changes, credentials, fragments and redirect substitution.
- [x] 2.2 Implement the reviewed allowlist, with ChatGPT stable URI gated on issuer proof and exact per-connection entries for callback-ID mode. Retain exact registration and grant binding.
- [x] 2.3 Inject host-suffix acceptance and swapped token redirect; watch mounted negatives fail, restore and add Proof: comments.
- [x] 2.4 Add failing tests for VS Code's four-callback registration, a mixed list registering only its listed subset, an all-unlisted list and malformed entries (non-string, relative, over-long, credentials, fragments, planted and percent-encoded response fields) refusing the whole list; near-miss negatives for the Insiders entry and Cursor's scheme.
- [x] 2.5 List `https://insiders.vscode.dev/redirect`; register the listed subset and return it; refuse malformed entries atomically. Keep exact matching at authorization and token exchange.
- [x] 2.6 Remove the malformed check, the fragment test, the response-field test, the empty-subset check, the filter and the Insiders entry in turn; watch the tests fail, restore and add Proof: comments.

## 3. Prove write and renewal

- [ ] 3.1 (partial: read-only default, explicit read/write, granted-scope narrowing, refresh, replay and revocation done; organization cases pending activation, see verify.md) Add failing mounted tests for read-only default, explicit read/write request, granted-scope narrowing, restricted foreign-created project denial, viewer refusal, cross-organization 404, audited super-admin recovery and same-organization unrestricted project success, refresh/replay and revocation.
- [x] 3.2 Repair any contract gaps without coupling to an IdP. Keep the 3600-second default until a live refresh trace justifies change.
- [x] 3.3 Inject omitted write check and bypassed revocation; watch negatives fail, restore and add Proof: comments.

## 4. Verify the public URL

- [ ] 4.1 Run HTTPS smoke against the deployed public URL: discovery, DCR, ordinary-user sign-in, owned-project read and reversible write, restricted foreign-created project refusal, viewer refusal, cross-organization 404, audited super-admin recovery and same-organization unrestricted project write success, expiration, refresh and revoked-token denial. Record exact callback, client version, grant-bound organization, current role, scopes and evidence without secrets.
- [ ] 4.2 Run focused tests, format, lint, typecheck, OpenSpec validation and applicable host gate; record outcomes in verify.md. Do not mark live acceptance from local tests alone.
