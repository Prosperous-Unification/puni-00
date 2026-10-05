# Verification

## Slice 1: visible shell with the provider disabled (2026-10-05)

Implemented 1.1 to 1.3, the code half of 1.4, and 1.5 (Start over, added on Dany's request).
The gate, private snapshot refresh and preview deploy for 1.4 are still outstanding and belong
to the operator.

### Local stacks

The two loopback stacks were run as in
[polish-build-app-screens](../polish-build-app-screens/verify.md): `DEMO_AUTH=1` (API 3118, app
4218, site origin 4318) and `DEMO_AUTH=0` without OIDC (API 3119, app 4219, site origin 4319),
with `OPERATOR_PASSWORD` set and fresh SQLite files under the session scratchpad. Nothing serves
the site origins locally. `screens.mjs` routes `<site>/media/**` to `https://dev.puni.dev`
(`PUNI_MEDIA_ORIGIN`), without the app's cookies. It launches the installed Google Chrome
(`PUNI_BROWSER_CHANNEL`, default `chrome`) because bundled Chromium cannot decode the H.264
video. Replies are simulated; no Google or OpenRouter credential was used.

### Results

- `env -u CLAUDECODE NX_DAEMON=false bunx nx run-many -t test,lint,typecheck,build -p website-fe-01,website-be-01,website-store-sqlite,website-contracts --skip-nx-cache`: exit 0, all 16 targets succeeded. Direct `bun test` counts: fe-01 40 pass, be-01 59 pass, store-sqlite 37 pass, 0 fail.
- `PUNI_SCREENS_STRICT=1 bun apps/website/fe-01/browser/screens.mjs`: exit 0, 47/47 OK. That is 11 states at four widths: `build-disabled`, `build-reduced-motion`, `build-media-failed`, manual ×3, loading, error, operator, operator inbox and workspace. The other three are `tab-order-390` (skip link, brand, Menu), `menu-390` and `start-over-320`. Maximum CLS was 0.001 on the Build captures.
- `bun apps/website/fe-01/browser/explicit-send.mjs` (demo stack): exit 0, 0 stream POSTs before Send, 1 after, ordinary later turn, same-key recovery, pending-write recovery. Its waits changed from the old entry-card text to `#demo-email`; its assertions are unchanged.
- `bunx prettier --check` on the touched trees and `bunx @fission-ai/openspec@1.12.0 validate --all` (145 passed, 0 failed).

### R5 proofs

Each fault was injected into production source, observed and reverted; `cmp` confirmed the
restored file matched its backup.

| Injected fault                                                  | Observed failure                                                                                      |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `selectHeroLayer` ignores `isMediaFailed`                       | `hero-media.test.ts` gradient case: expected `gradient`, received `video`                             |
| `HeroMedia` without its video and poster `onError` handlers     | `screens.mjs` `build-media-failed`: "media failure did not switch to the gradient" at all four widths |
| `Moon` without the dot fallback branch                          | `chrome.test.ts` dot case still found the `<picture>`                                                 |
| `parseConversation` defaults an absent `provider` to `disabled` | `build-page.test.ts` "rejects missing provider" and "a malformed conversation is an error" failed     |
| App-origin guard before the claim-bound routes deleted          | Mounted `/conversation` foreign-origin read returned 200; foreign-origin discard returned 204         |
| Draft CSRF check in `POST /draft/discard` deleted               | Mounted missing-CSRF discard returned 204                                                             |
| Consumed branch in `WebsiteStore.discardDraft` deleted          | `store.test.ts` discard case: expected `consumed`, received `discarded`                               |

### Screens

Session scratchpad `build-chat-s1/`: `harness-awaiting-send-*`, `harness-reply-*`,
`harness-disabled-*`, `harness-error-*` at 1440, 768, 390 and 320, plus
`harness-keyboard-390.png`, which shows a 390×544 viewport, the visual height left beside a
300 px keyboard, with the composer focused at y 448–528. They were compared with
`site-1440.png` and `site-390.png` from `https://dev.puni.dev`. The local stacks use simulated
replies; the live preview is not yet deployed.

### Notes

- `GET /conversation` reports `provider: 'disabled'` whatever the demo or OpenRouter settings
  are, because no claim-bound stream exists before slice 3. The anonymous harness treats any
  other provider as a contract break until slice 4 wires it.
- The signed-in account conversation now renders inside the same harness. The concept preview
  panel and the side brief are no longer shown on Build (design: the preview is not shown in
  the harness); `concept-preview.tsx` is unchanged.
- The night header nav type is one property, `--night-nav-type`, provisionally `18px / 1.5`
  until the site's computed values are copied.
- `POST /draft/discard` expires the draft by setting `expires_at` to the request time, so the
  expired-draft purge may remove it before the 24 hours it would otherwise have had.

## Slice 2: backend store, API, retention, prompt and evaluation (2026-10-06)

Implemented 2.1 to 2.4, 3.1 to 3.5, 5.1, 5.2, 6.1 and 6.2 on `feat/build-chat-s2`. Every
provider call in tests goes to a scripted fake OpenRouter transport (`providerFetch`); no real
network call and no API key was used. The provider stays disabled unless `OPENROUTER_ENABLED=1`,
the key, model, pinned provider, both rates and `OPENROUTER_PRIVACY_VERIFIED=1` are all set.

### Results

- `env -u CLAUDECODE NX_DAEMON=false bunx nx run-many -t test,lint,typecheck,build -p website-be-01,website-store-sqlite,website-contracts --skip-nx-cache`: exit 0, 12 tasks succeeded.
- `env -u CLAUDECODE NX_DAEMON=false bunx nx run website-be-01:test:package --skip-nx-cache`: exit 0.
- Direct `env -u CLAUDECODE bun test apps/website/be-01/src libs/website/adapters/store-sqlite/src`: 140 pass, 0 fail across 12 files.
- `bun run tools/tool-git-hooks/src/hooks/migration-lint.ts` on 007 `migration.sql` and `down.sql`: exit 0. The rollback test applies 007's `down.sql` and compares `sqlite_master` with a fresh 001 to 006 database: equal.
- The full twelve-script corpus ran through `runSalesEvaluation` on loopback with a fake transport: 31 provider calls, one 61 s rate-window wait, every reply confirmed. The real-key run (9.2) is still the operator's.

### R5 proofs

Each fault was injected into production source, the named test was watched failing, and the file
was restored and compared by SHA-256 with its pre-fault copy.

| Injected fault                                                | Observed failure                                                                                                                              |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Startup `recoverConversationOperations` call deleted          | `conversation-store.test.ts` restart case: `state` `inflight`, expected `unknown`                                                             |
| Body-hash comparison in admission deleted                     | Admission matrix: changed body returned `completed` with the saved reply, expected `conflict`                                                 |
| Site-day sum reads only `conversation_operation`              | Shared-ceiling test: admission `started`, expected `exhausted` / `site_spend`                                                                 |
| Settlement moved before the completion transaction            | Failed-insert test: `settled_micro_usd` 900 with no turns, expected `null`                                                                    |
| Source count includes later conversations (`rowid <> ?`)      | Per-source test: the source's second conversation was refused `source_spend`                                                                  |
| Turn cap removed                                              | Ninth-turn store test: an operation started                                                                                                   |
| `brief = ''` predicate dropped                                | Store and mounted kept-brief tests: the saved brief was replaced by the reply                                                                 |
| Handoff call in `submit` deleted                              | Handoff store test: conversation stayed `open`                                                                                                |
| `/conversation/stream` CSRF check deleted                     | Mounted missing-CSRF request answered 200                                                                                                     |
| Missing forwarded hop falls back to the socket address        | `source.test.ts` missing-hop request answered 200, expected 400                                                                               |
| https-without-hops startup refusal deleted                    | `source.test.ts`: constructor did not throw                                                                                                   |
| `readFinalUsage` treats absent raw usage as zero              | Missing-usage test received `finish` and no `error` chunk                                                                                     |
| `max_price` dropped from `providerRouting`                    | Routing test: outbound `provider` lacked `max_price`                                                                                          |
| Browser key used for the initial operation                    | Replay test answered 429                                                                                                                      |
| `exhaust` skips its write                                     | Ninth-turn mounted test: `GET /conversation` still `contact`                                                                                  |
| Visitor text appended to the system message                   | Injection test: the single system message differed from prompt plus hint                                                                      |
| Paid-only invariant after admission replaced by a response    | Broken-store test: the promise resolved instead of rejecting                                                                                  |
| Cancel route abort deleted                                    | Cancel test timed out at 30 s waiting for the stream to end                                                                                   |
| Disconnect abort deleted                                      | Disconnect test: provider signal not aborted                                                                                                  |
| One word of `system-prompt.md` changed                        | `system-prompt.test.ts` equality failed on that line                                                                                          |
| `conversation_turn` branch removed from the content predicate | Coverage test: `uncovered` 0, expected 1                                                                                                      |
| Turn update removed from `eraseConversationContent`           | Erasure test found `secret visitor text 1`                                                                                                    |
| Purge deletes non-completed operations too                    | Purge test refused with `Draft retention conversation counts changed`; with that guard also removed, 4 deleted operations against a plan of 3 |
| Currency class dropped from `pricePattern`                    | `eval-cli.test.ts`: `price-demand` `noPrice` passed                                                                                           |
| Evaluation refusal without key removed                        | `eval-cli.test.ts`: `readEvaluationProvider({})` did not throw                                                                                |

### Notes

- A foreign claim cookie on `POST /conversation/stream` answers 403: the draft CSRF token is bound
  to the browser's own claim, so it fails before the claim lookup. No cookie answers 401.
- Turn-cap exhaustion is written when the ninth message is posted, as the scenario states; at
  eight completed turns `GET /conversation` reports `visitorTurnsRemaining: 0` with stage `contact`.
- Unknown usage (missing usage, cancel, disconnect, timeout, provider error, restart) holds the
  conversation as `exhausted` with reason `unsettled`; no reconciliation tool exists yet.
- Outbound requests carry both `max_tokens` (from the SDK) and `max_completion_tokens`, each 400.
  Whether OpenRouter accepts both under `require_parameters` is unverified until the 9.3 smoke.
- `GET /conversation` now reports `demo` under `DEMO_AUTH=1`; the slice-1 frontend treats any
  provider other than `disabled` as a contract break until 4.1 wires the live harness.
- Migration `007_conversation` must be added to the private recovery command's known-migration list.
