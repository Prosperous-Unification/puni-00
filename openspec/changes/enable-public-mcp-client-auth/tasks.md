## 1. Make public discovery routable

- [ ] 1.1 Add failing ingress/rendered-manifest and mounted-route tests for the exact protected-resource and authorization-server discovery URLs; prove the existing fallback reaches the frontend.
- [ ] 1.2 Add narrow production ingress routes to mcp-01 and preserve `/mcp` and API routing.
- [ ] 1.3 Remove one discovery route in a fault run; watch the routing test fail, restore and add an adjacent Proof: comment.

## 2. Bound OAuth redirects

- [ ] 2.1 Add failing mounted registration, authorization and token tests for every exact hosted URI and loopback arbitrary ports; add negatives for lookalikes, path/query/port changes, credentials, fragments and redirect substitution.
- [ ] 2.2 Implement the reviewed allowlist, with ChatGPT stable URI gated on issuer proof and exact per-connection entries for callback-ID mode. Retain exact registration and grant binding.
- [ ] 2.3 Inject host-suffix acceptance and swapped token redirect; watch mounted negatives fail, restore and add Proof: comments.

## 3. Prove write and renewal

- [ ] 3.1 Add failing mounted tests for read-only default, explicit read/write request, granted-scope narrowing, foreign-project denial, refresh/replay and revocation.
- [ ] 3.2 Repair any contract gaps without coupling to an IdP. Keep the 3600-second default until a live refresh trace justifies change.
- [ ] 3.3 Inject omitted write check and bypassed revocation; watch negatives fail, restore and add Proof: comments.

## 4. Verify the public URL

- [ ] 4.1 Run HTTPS smoke against the deployed public URL: discovery, DCR, ordinary-user sign-in, owned-project read and reversible write, foreign-project refusal, expiration, refresh and revoked-token denial. Record exact callback, client version, scopes and evidence without secrets.
- [ ] 4.2 Run focused tests, format, lint, typecheck, OpenSpec validation and applicable host gate; record outcomes in verify.md. Do not mark live acceptance from local tests alone.
