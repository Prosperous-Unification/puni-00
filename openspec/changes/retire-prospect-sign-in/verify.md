# Verification

## 2026-10-11 (branch `batch-10/website-scope-s4-retire-api`)

Local only; the h2puni gate is the orchestrator's.

Deploy prerequisite: before the API restarts on this code, S5 (puni-pr-00 PR #42) removes the four `OIDC_*` keys from the `deploy/website/k8s/encrypt-secret.ts:19-33` allowlist and from every deployed runtime file and secret, empty lines included; otherwise startup refuses.

- `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT NX_DAEMON=false bunx nx run-many -t lint,typecheck,test -p website-be-01 website-store-sqlite website-fe-01 website-contracts --skip-nx-cache`: "Successfully ran targets lint, typecheck, test for 4 projects". Direct `bun test` counts: be-01 121, store-sqlite 73, fe-01 74, contracts 15 pass, 0 fail.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json`: 159 items, 159 passed.
- `bun install --frozen-lockfile`: no changes. The `bun.lock` diff has 0 added lines (only the three removed packages and their transitive entries).
- Browser, on loopback stacks with `TRUSTED_PROXY_HOPS=1` and ports offset by 2000 (demo API 5118 / app 6218, AI-off API 5119 / app 6219, scripted-provider API 5120 / app 6220): `PUNI_SCREENS_STRICT=1 PUNI_SCREENS_PORT_OFFSET=2000 bun apps/website/fe-01/browser/screens.mjs` exit 0, 77 OK (`build-disabled`, `build-paused`, `build-live` at 1440, 1024, 768, 390 and 320); `explicit-send.mjs` exit 0 (0 stream POSTs before Send, 1 after); `conversation.mjs` exit 0.

## R5 proofs

Each fault was injected into production source, observed, and reverted.

| Check                                       | Fault                                                                        | Observed                                                                                                                                                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OIDC_*` startup refusal                    | `if (retired.length > 0 && false)`                                           | `(fail) a retired OIDC setting stops startup`: "Received function did not throw"                                                                                                                  |
| Retired routes are unmounted                | a `POST /chat/stream` handler answering as the old one did without a session | `(fail) retired prospect routes answer 404 and write nothing`: status 401, code `prospect_unauthorized`                                                                                           |
| Legacy `provider_call` in the site-day sum  | sum only `conversation_operation` in the admission                           | `(fail) the site-day ceiling still counts legacy provider_call rows` (Expected 429, Received 200) and `(fail) the site-day ceiling and unsettled-call count still read legacy provider_call rows` |
| `readProviderRates` validation (moved test) | skip every rate check                                                        | ten of twelve `paid inference with ...` cases fail                                                                                                                                                |
| `nonblank` (rewritten test)                 | plain `trim()`                                                               | `(fail) blank legacy content neither anchors a subject nor counts as content`                                                                                                                     |
