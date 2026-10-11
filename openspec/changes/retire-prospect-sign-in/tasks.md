# Tasks: retire prospect sign-in

Each slice is red-green. "Negative" names the production-path fault injected and watched before
the adjacent `Proof:` comment. Run Bun tests with `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`.

## 1. Startup refusal

- [x] 1.1 `runtime-config.test.ts` "a retired OIDC setting stops startup": each of `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI`, set or empty, and any other `OIDC_*` name throws the retirement message; watched failing first. `refuseRetiredOidc` in `runtime-config.ts`; `WebsiteApiConfig` loses its `oidc*` fields. Negative: disable the refusal; the test reports "Received function did not throw".

## 2. Retired routes

- [x] 2.1 `server.test.ts` "retired prospect routes answer 404 and write nothing" (twelve method and path pairs, every table's row count unchanged, no `Set-Cookie`); watched failing first (`GET /session` answered 200). Delete the handlers and their helpers from `server.ts`; `/draft`, `/entry`, `/brief`, `/intakes`, `/proposals` keep only the claim branch. Negative: leave `/chat/stream` mounted; the test gets 401 `prospect_unauthorized`.
- [x] 2.2 Delete the OIDC, demo sign-in, sign-out, `/chat*` and `/concept*` tests in `server.test.ts` and `conversation.test.ts` "the account chat routes answer provider_paused during a pause". Port the bad-rate and missing-privacy refusals to `conversation.test.ts` "paid inference with ... is unconfigured and calls nothing". Negative: skip the `readProviderRates` checks; ten bad-rate cases fail.

## 3. One pump and the store

- [x] 3.1 `stream.ts`: drop `abortOnDisconnect`; `decline`, `recordGeneration` and `onProviderFailure` required. The existing conversation negatives rerun green.
- [x] 3.2 `store.ts`: remove every account writer and the account reservation; `tripInferencePause`'s only caller is `admitConversationOperation`; remove the dead `anchorRequestContent`. Keep `provider_call` in the site-day sum and unsettled-call count. `conversation.test.ts` "the site-day ceiling still counts legacy provider_call rows" seeds a row directly. Negative: drop `provider_call` from the site-day sum; the call is admitted (200 instead of 429), and the store test "the site-day ceiling and unsettled-call count still read legacy provider_call rows" fails too.
- [x] 3.3 Retention and guardrail tests seed legacy rows directly (`src/testing/legacy-account-fixture.ts`); the write-time anchoring tests of the removed writers are deleted. The nonblank negative reruns on the rewritten blank-content test.

## 4. Front end, dependencies, docs

- [x] 4.1 Delete `concept.ts`, `concept-preview.tsx`, `concept.test.ts` and their CSS; drop `@ai-sdk/react`, `@assistant-ui/ai-sdk`, `@assistant-ui/react` (lockfile: deletions only).
- [x] 4.2 `.env.example`, `docs/website/build-runtime.md`, `provider-activation.md`, `request-retention.md`, `CONTEXT.md`; the `prospect-sign-out` delta marked retired.
- [x] 4.3 Browser: `screens.mjs` (no sign-in text on Build at five widths), `explicit-send.mjs`, `conversation.mjs`.

## 5. Follow-up (not this change)

- [ ] 5.1 Drop `provider_call` from the site-day sum and unsettled-call count when `SELECT count(*) FROM provider_call` is 0 on the deployed database.
- [ ] 5.2 Private repo (S5): remove the `OIDC_*` keys from the secret allowlist and from every runtime file, empty ones included, before deploying this API.
