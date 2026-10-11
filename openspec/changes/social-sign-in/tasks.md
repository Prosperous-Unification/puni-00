## 1. Change and method catalogue

- [x] 1.1 This change: proposal, design, delta specs, tasks, verify; `openspec validate --all --json` green; no ADR.
- [x] 1.2 `libs/wbs/domain/contracts/src/auth-methods.ts` catalogue and `parseAuthMethods` (+ test, R5 negatives: duplicate and unknown checks).
- [x] 1.3 `auth-oidc-shapes.ts`: `startOidcLogin` `method` query, `listAuthMethods`, `startAuth0Link` `{ password?, method? }`, no empty 409 on the callback.

## 2. Method hint and methods endpoint in be-01

- [x] 2.1 `oidc-client.ts` `connection` passed to `/authorize` only when present.
- [x] 2.2 `oidc-options.ts` required `AUTH_METHODS` (negative: defaulting it); swap preflight required key and value rule (negatives: key dropped, rule admitting all); k8s overlays `none`.
- [x] 2.3 `auth-oidc-endpoints.ts` `listAuthMethods` and the enablement check before `transactions.save` (negatives: check moved after save; connection dropped).
- [x] 2.4 mcp-01 exposes no `/api/auth/*` tool for the methods list.

## 3. fe-01 sign-in buttons

- [x] 3.1 `auth-methods.ts` query with `loading | ready | failed` states.
- [x] 3.2 `auth-form.tsx` one button per enabled method, SSO last; failed read renders the SSO link and a quiet notice (negative: unknown id rendered).
- [ ] 3.3 Eye review on the dev stack after tenant configuration (operator).

## 4. account_exists and the unverified-provider hint

- [x] 4.1 Callback `null` → `302 /?auth_error=account_exists` (negative: empty 409 restored).
- [x] 4.1b fe-01 renders the `account_exists` sentence.
- [x] 4.2 Onboarding verification hint for OIDC sessions.
- [x] 4.3 Store tests with Auth0-shaped subjects (A7, A8, A10, A11, A20).

## 5. Several verified pairs per user (store)

- [x] 5.1 `resolveMappedIdentity` invariant 2 (negative: own-pair check deleted).
- [x] 5.2 `linkIdentity` (renamed from `linkPasswordIdentity`) in sqlite and memory stores (negatives: different-pair refusal re-added; idempotence by second insert).
- [x] 5.3 Model-based test `user-oidc.model.db.test.ts` with `fc.asyncModelRun`, pinned seed (negative: invariant 2 broken).

## 6. Link start from an OIDC session

- [x] 6.1 `sessionUser` resolving a password session or a verified OIDC access token.
- [x] 6.2 `startAuth0Link` / `completeAuth0Link` for both kinds (negatives: skipped re-verification; password accepted on an OIDC session).
- [x] 6.3 `linkedMethods` on `GET /api/auth/me` from mappings (negative: account read answering no pairs).
- [x] 6.3b fe-01 "Add <method>" items in the account menu, one per enabled method not yet linked, calling the link start (negative: linked methods not subtracted).

## 7. MCP follows the identity

- [x] 7.1 be-01 integration: Bearer with either linked pair is the same user.
- [x] 7.2 mcp-01 consent with an Auth0-shaped subject forwards the upstream token; README paragraph.
- [x] 7.3 `docs/auth-integration.md` "Sign-in methods".

## 8. Evidence

- [ ] 8.1 `verify.md` with commands, observed output and every `Proof:` fault.

## 9. Operator and Dany (outside this repository)

- [ ] 9.1 Auth0 connections `google-oauth2`, `github`, `email` (OTP, own SMTP) enabled on the WBS application.
- [ ] 9.2 Post-login Action grants `<env>:wbs:read` and `<env>:wbs:write` to every WBS user.
- [ ] 9.3 Apple connection (paid Apple Developer Program).
- [ ] 9.4 `AUTH_METHODS` in dev's shared OIDC env before this change reaches dev; prod `be-01.env` `AUTH_METHODS=none` before the next prod release.
