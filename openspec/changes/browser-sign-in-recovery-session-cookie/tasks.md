## Task 1: Session-cookie-only predecessor proof

- [x] 1.1 Write failing mounted tests `signs a browser whose access cookie expired in again without reset`, `closes an OIDC predecessor proved by its correlation cookie alone before native login`, and `closed-session-cookie` / `foreign-session-cookie` cases of `redirects a bound callback with an unverifiable predecessor to browser recovery`; observe the positives fail on main's proof.
- [x] 1.2 Prove the session-only correlation through `lifecycle.generation`; return a typed refusal naming each branch; keep store faults as server failures. Inject: refusal restored, read skipped, refusal rethrown, store active/revocation checks removed; record Proof comments.

## Task 2: Refusal log and documentation

- [x] 2.1 Log the refusal branch at info on the SSO recovery redirect; assert it per case and assert no cookie value appears; remove the log and observe the cases fail.
- [x] 2.2 Update `docs/auth-integration.md` "Browser sign-in recovery".

## Task 3: Verification

- [x] 3.1 Run the touched tests, the full `wbs-be-01:test`, affected lint and typecheck, format check, OpenSpec validation and Burokrat `check-indexes`; record results in `verify.md`. The host gate is the merging session's.
