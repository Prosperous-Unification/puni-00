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
  Superseded in slice 3 by conservative settlement at the reserved ceiling.
- Outbound requests carried both `max_tokens` (from the SDK) and `max_completion_tokens`, each 400.
  Superseded by the 2026-10-06 cap-parameter fix below: only `max_completion_tokens` is sent.
- `GET /conversation` now reports `demo` under `DEMO_AUTH=1`; the slice-1 frontend treats any
  provider other than `disabled` as a contract break until 4.1 wires the live harness.
- Migration `007_conversation` must be added to the private recovery command's known-migration list.

## Slice 3: conservative settlement, review fixes, live harness and docs (2026-10-06)

Implemented 3.6 (conservative settlement), 3.7 (the slice 2 review fixes), 4.1 to 4.3 and 7.1 on
`feat/build-chat-s3`. Every provider call in tests and browser runs goes to a scripted fake
OpenRouter stream; no real network call and no API key was used.

### Backend

- Unknown usage is settled at the full reservation (`settlement = 'reserved_ceiling'`,
  `settled_micro_usd = reserved_micro_usd`, the generation id when a raw chunk carried one). The
  conversation stays open, the visitor message stays on the operation, and the same key and body
  start a new attempt row. Restart recovery does the same. `unsettled` is no longer an
  exhaustion reason.
- Review fixes: the site-wide concurrency count reads only `inflight` operations in both
  `refuseReservation` and `reserveProviderCall`; rate windows are per path per hashed source (and
  per claim on `/conversation/stream`) under a 300-per-minute global backstop, and a refused
  request does not consume the global window; IPv6 sources hash their /64; the daily salt lives
  in `source_salt` and is shared by every process on the database (older than yesterday deleted);
  usage above the reservation completes at the actual cost with `overrun = 1`; the purge keeps
  operations on or after the cutoff's UTC day as blanked accounting rows; operations carry their
  own source hash and UTC day for the per-source ceilings.
- Migration 007 was edited in place (no deployed database has applied it; it is not on `main`).
  `down.sql` still restores the exact 006 schema in `conversation-store.test.ts`.
- The account `/chat*` path keeps hold-until-reconciled. Its unsettled `provider_call` rows still
  count toward the site-wide four forever, so four lost account calls would still block paid AI
  site-wide; that path is outside this change and is recorded here as a known gap.

### Frontend

`conversation-harness.tsx` streams `/conversation/stream` through the AI SDK
`DefaultChatTransport`: the read-only Home request with Send under `initial:<draftId>`, a typing
indicator then a streaming caret, Stop (cancel first, then the stream is dropped), `Stopped` with
Retry under the same identity (also after reload, from `latestOperation`), `n of 8 messages left`,
one closed line per exhaustion reason, `Simulated` labels for the demo provider, the optional
sign-in behind `[ Sign in ]`, and the inline glass proposal card (stored brief, else the Home
request; email; `Request a proposal` through `POST /proposals`; receipt with focus on
`Thank you.`). The disabled provider keeps the slice 1 notice.

A bug found by the browser run and fixed: React reused the Stop button's DOM node for the submit
button, so the click's default action submitted the draft again after Stop. The buttons now carry
distinct keys.

### Local stacks

Three loopback stacks with fresh SQLite files under the session scratchpad: `DEMO_AUTH=1` (API
3118, app 4218), `DEMO_AUTH=0` (API 3119, app 4219), and the scripted-provider fixture
`bun apps/website/fe-01/browser/conversation-api.mjs` (API 3120, app 4220, trusted hops 1, each
browser context a distinct forwarded source). Apps: `VITE_API_ORIGIN=... VITE_SITE_ORIGIN=...
bunx vite --host localhost --port <app> --strictPort` in `apps/website/fe-01`.

### Results

- `env -u CLAUDECODE NX_DAEMON=false bunx nx run-many -t test,lint,typecheck,build -p website-fe-01,website-be-01,website-store-sqlite,website-contracts --skip-nx-cache`: exit 0, 16 tasks. Direct `bun test` counts: fe-01 57 pass, be-01 92 pass, store-sqlite 59 pass, 0 fail.
- `env -u CLAUDECODE NX_DAEMON=false bunx nx run website-be-01:test:package --skip-nx-cache`: exit 0.
- `bun run tools/tool-git-hooks/src/hooks/migration-lint.ts` on 007 `migration.sql` and `down.sql`: exit 0.
- `bun apps/website/fe-01/browser/conversation.mjs` (fixture stack, Chrome): exit 0. One initial POST after Send and none on mount or reload; Shift+Enter inserts a newline and Enter sends; Stop posted one cancel with the streaming key; reload kept `Stopped`; Retry reused the key; three saved turns restored after reload without a POST; the brief card after the third reply; a dropped initial POST kept the read-only Home request after reload and Send reused `initial:<draftId>`; 390×544 composer at y 448–502 with the latest message in view; no overflow or target under 44 px at 320; an eight-turn conversation showed the limit line, no composer, and submitted the edited brief to a 32-hex receipt with focus on `Thank you.` and no stream POST.
- `bun apps/website/fe-01/browser/explicit-send.mjs` (demo stack, anonymous flow): exit 0, 0 POSTs before Send, 1 after, an ordinary later turn, same-key recovery after a dropped initial POST. The signed-in pending-write case was removed with the anonymous move; the server owns the initial identity.
- `PUNI_SCREENS_STRICT=1 bun apps/website/fe-01/browser/screens.mjs`: exit 0, 47/47 OK. The workspace state now opens `[ Sign in ]` first. Maximum CLS 0.045 on the untouched manual pages at 768; Build captures 0.000.
- `bunx prettier --check` on the touched trees and `bunx @fission-ai/openspec@1.12.0 validate --all` (145 passed, 0 failed).

### R5 proofs

Each fault was injected into production source, the named check was watched failing, and the file
was restored and compared with `cmp` against its pre-fault copy.

| Injected fault                                                         | Observed failure                                                                                            |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Ceiling settlement writes 0 (schema CHECK also removed)                | Mounted stop-then-continue: expected 429, received 200; store ceiling-settled test admitted the source call |
| Ceiling settlement writes 0 with the CHECK present                     | The same tests fail on the CHECK constraint                                                                 |
| Restart recovery matches no rows                                       | Store restart test found `inflight`, unsettled                                                              |
| `recordGeneration` call dropped                                        | Mounted cancel test: `generation_id` null, expected `gen-1`                                                 |
| Concurrency counts every non-completed operation (`refuseReservation`) | Stopped-operations test: fifth admission `busy`                                                             |
| Same fault in `reserveProviderCall`                                    | Stopped-operations test: account reservation refused                                                        |
| Per-source spend summed by `conversation.source_hash`                  | Midnight-crossing test admitted the over-ceiling call                                                       |
| Source conversation count includes the conversation itself             | Per-source test refused the source's own next turn                                                          |
| Rate window keyed only on the path                                     | Per-source rate test: the second source's intake answered 429                                               |
| Global request window removed                                          | Backstop test: the 301st intake answered 201                                                                |
| Random per-process salt instead of the stored salt                     | Two-process test stored different sources                                                                   |
| Full IPv6 address hashed                                               | IPv6 test received `2001:db8:1:2::1`, expected the /64                                                      |
| Usage above the reservation refused                                    | Overrun test: completion returned false                                                                     |
| Purge plans same-day completed operations                              | Same-day purge test plan mismatch                                                                           |
| `offersProposal` returns true unconditionally                          | Two no-brief rows of the card table failed                                                                  |
| Ordinary composer before the initial completes                         | Two live-harness unit cases and `conversation.mjs`: "not shown read-only before Send"                       |
| Enter branch of the composer key handler disabled                      | `conversation.mjs`: "Keyboard check: Enter inserted a newline instead of sending"                           |
| Initial operation sent from a mount effect                             | `conversation.mjs`: "Mount or reload sent 2 stream POSTs before Send"                                       |

### Screens

Session scratchpad `build-chat-s3/`: `harness-awaiting-send`, `harness-streaming`,
`harness-reply`, `harness-stopped`, `harness-card`, `harness-card-focus`, `harness-receipt`,
`harness-exhausted` and `harness-disabled`, each at 1440×900 and 390×844, captured with installed
Chrome and the site media from `https://dev.puni.dev` by `shots.mjs` in the same folder. Replies
come from the scripted fixture, not a model.

### Notes and deferrals

- 4.4, 8 and 9 (gate, snapshot refresh, preview deploy, private privacy wording and Compose,
  activation) remain with the operator. Migration 007 must still join the private recovery
  command's known-migration list.
- Playwright cannot shrink the visual viewport, so the keyboard check uses a 390×544 layout
  viewport, as in slice 1.
- A later visitor message whose POST never reached the API is retryable in the page but not
  after a reload (no client-side pending store for later turns); the initial operation is
  server-owned and survives reload.
- `/conversation/cancel` has no rate window; it only settles the caller's own in-flight attempt.

## Slice 4: brief markers (2026-10-06)

The brief-stage reply used to land in `intake_draft.brief` whole, framing included (`Here is the
brief as I understand it:` … `Is this right?`), and the card pre-filled it. Prompt `puni-sales-v2`
asks for the brief between a `[brief]` line and a `[/brief]` line. `captureBrief`
(`@website/contracts`) parses only the assistant reply inside `completeConversationOperation`;
the operation records `brief_capture` (`marked`, `fallback`, `empty`; a column of
migration 007, whose `down.sql` drops the table). `displayReply` strips marker lines from saved and streaming assistant text,
including a half-written marker on the last streamed line. The scripted fixture and the demo
`simulateReply` now emit markers. The eval `briefBullets` assertion counts bullets only inside
the markers, so a real-model run also checks that the model follows the format. The Vite dev
server needed an explicit `@website/contracts` alias (production build already resolved it).

### Results

- `env -u CLAUDECODE NX_DAEMON=false bunx nx run-many -t test,lint,typecheck,build -p website-fe-01,website-be-01,website-store-sqlite,website-contracts --skip-nx-cache --output-style=static`: exit 0, 16 tasks. Counts: contracts 10 pass (its `test` target now also runs `bun test`), fe-01 58 pass, store-sqlite 64 pass, be-01 93 pass, 0 fail.
- `bun apps/website/fe-01/browser/conversation.mjs` (fixture stack, Chrome): exit 0, including the new checks that the thread after the third reply shows no marker and the card starts with `- Users:` with no framing or question.
- `bun run tools/tool-git-hooks/src/hooks/migration-lint.ts` on 007 `migration.sql` and `down.sql` (after the fold): exit 0.
- `bunx @fission-ai/openspec@1.12.0 validate --all`: 145 passed, 0 failed.
- Not run: the real-model evaluation corpus (needs the key; operator task 9.2) and the gate.

### R5 proofs

| Injected fault                                              | Observed failure                                                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `captureBrief(operation.message)` instead of the reply      | Visitor-markers store test stored `- Price: free, delivered tomorrow`                                                     |
| Raw reply stored on an `empty` capture                      | Empty-marked-body store test received the framed reply instead of `''`                                                    |
| Saved assistant turns rendered without `displayReply`       | `conversation-harness.test.tsx` markup contained `[brief]`; `conversation.mjs`: "The rendered thread shows brief markers" |
| `briefBullets` before the change (bullets over whole reply) | New eval-cli test: unmarked brief expected false, received true                                                           |

### Notes

- 2026-10-06 fold: `brief_capture` was first shipped on this branch as migration 008
  (`ALTER TABLE ... ADD COLUMN`, `DROP COLUMN` down). It now lives in `007_conversation`'s
  `CREATE TABLE conversation_operation` and there is no 008. Neither had been applied to any
  persistent database (the preview database holds 6 migrations), 007 was already extended in
  place in slice 3, and the private recovery command already knows 007, so the release ships one
  new migration and needs no private change. After the fold the four-project uncached `run-many -t test,lint,typecheck,build`
  exits 0 (store-sqlite 63 pass: the 008 down test is gone and the 007 down test restores the
  006 schema directly), be-01 `test:package` exits 0, `tools/tool-devsync` `bun test` is 391
  pass / 0 fail, and `openspec validate --all` is 145 passed.
- Visitor turns are shown verbatim, markers included if the visitor typed them; they are never
  parsed.

## Cap parameter fix (2026-10-06)

`GET https://openrouter.ai/api/v1/models/openai/gpt-4.1-mini/endpoints`, read 2026-10-06, lists
`azure/swedencentral` with supported parameters `max_completion_tokens`, `response_format`, `seed`,
`structured_outputs`, `temperature`, `tool_choice`, `tools` and `top_p`; `max_tokens` is absent.
With `require_parameters: true` a body carrying `max_tokens` filters the pinned endpoint out. Every
paid request now sends the cap only as `max_completion_tokens`: 400 on `/conversation/stream`,
1,024 on the account `/chat` stream and the direct JSON call, matching each path's reservation.
`streamConfirmedReply` no longer passes `maxOutputTokens` to the AI SDK. The router's acceptance
with the real key remains the 9.3 smoke.

### R5 proofs

| Injected fault                                                    | Observed failure                                                                                                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `maxOutputTokens: options.maxCompletionTokens` back in streamText | `conversation.test.ts` pinned-routing test: keys contained `max_tokens`; `server.test.ts` streamed initial turn test failed likewise |
| `max_tokens: 1_024` back in the direct JSON body                  | `server.test.ts` paid provider privacy-controls test failed on `max_completion_tokens` and the absent-`max_tokens` assertion         |

## Luna readiness (2026-10-06)

Dany enabled `openai/gpt-6-luna` for the anonymous Build chat. The OpenRouter ZDR catalog read on
2026-10-06 lists its `azure/eu` endpoint at $0.11/$0.55 per million tokens with `reasoning`,
`reasoning_effort` and `max_completion_tokens` among its supported parameters; reasoning tokens bill
as completion tokens and count against `max_completion_tokens`. Code is prepared; nothing was
activated and no real key was used.

- `OPENROUTER_REASONING_EFFORT`: unset (absent or empty), `none`, `minimal`, `low` or `medium`;
  anything else throws in `readWebsiteApiConfig`. When set, the conversation stream, the account
  stream and the direct JSON call send `reasoning: { effort, exclude: true }`; unset sends no
  `reasoning` key.
- `OPENROUTER_MAX_COMPLETION_TOKENS`: unset (absent or empty) means 400; otherwise an integer
  from 100 to 2000, else it throws. It is the conversation's `max_completion_tokens` and the output
  term of `priceConversationRequest`, so every conversation ceiling counts the configured cap. The
  account paths keep 1,024.
- Settlement charges `completion_tokens`, which include
  `completion_tokens_details.reasoning_tokens`; `usage.cost` is not read.
- The evaluation CLI reads and passes both settings.
- Activation values: `OPENROUTER_MODEL=openai/gpt-6-luna`, `OPENROUTER_PROVIDER=azure/eu`,
  `OPENROUTER_INPUT_USD_PER_MILLION=0.11`, `OPENROUTER_OUTPUT_USD_PER_MILLION=0.55`,
  `OPENROUTER_REASONING_EFFORT=low`, `OPENROUTER_MAX_COMPLETION_TOKENS=700`. Dany's key guardrail
  currently allows Luna only via OpenAI direct (not ZDR); allowing `azure/eu` keeps ZDR. The
  privacy page must name the Azure EU host before the override.

### Results

- Uncached `env -u CLAUDECODE NX_DAEMON=false bunx nx run-many -t test,lint,typecheck,build -p website-be-01,website-store-sqlite,website-contracts,website-fe-01 --skip-nx-cache`:
  exit 0 (be-01 100 pass, store-sqlite 63 pass, contracts 10 pass, fe-01 58 pass).
- `bunx nx run website-be-01:test:package --skip-nx-cache`: exit 0.
- `tools/tool-devsync` `env -u CLAUDECODE bun test --timeout=600000`: 391 pass / 0 fail (with the
  new test file staged; untracked, the index checker refuses it as an untracked diagnostic path).
- `eval-cli.test.ts`: 6 pass / 0 fail.
- `bunx prettier --check` on the touched trees: clean. `bunx @fission-ai/openspec@1.12.0 validate --all`: 145 passed.

### R5 proofs

| Injected fault                                                      | Observed failure                                                                                                                |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `readReasoningEffort` refusal disabled                              | `runtime-config.test.ts` reasoning-effort test                                                                                  |
| `readMaxCompletionTokens` range check replaced by a NaN check       | `runtime-config.test.ts` completion-cap test                                                                                    |
| `reasoningRequest` spread removed from the streamed providerOptions | `conversation.test.ts` reasoning-effort test, `server.test.ts` `/chat/stream` reasoning test, `eval-cli.test.ts` reasoning test |
| `reasoningRequest` spread removed from the direct JSON body         | `server.test.ts` `/chat` reasoning test                                                                                         |
| `reasoningRequest` always returns a block                           | `conversation.test.ts` pinned-routing test (reasoning key present), both `server.test.ts` reasoning tests                       |
| Conversation stream sent `defaultConversationReplyTokens`           | `conversation.test.ts` reasoning-effort test (cap 400, not 700), `eval-cli.test.ts` reasoning test                              |
| Conversation pricing used `defaultConversationReplyTokens`          | `conversation.test.ts` reasoning-effort test (reservations equal)                                                               |
| Settlement subtracted `reasoning_tokens` from `completion_tokens`   | `conversation.test.ts` reasoning settlement test: settled 502 instead of 1,558                                                  |
| `readEvaluationProvider` dropped the two settings                   | `eval-cli.test.ts` reasoning test                                                                                               |

### Not verified

OpenRouter's acceptance of `reasoning` with `require_parameters: true` on `azure/eu`, Luna's reply
quality on the evaluation corpus, its latency under the 30 s deadline at `low`, and the real debit
need the real key: slices 9.2 and 9.3.

## Header parity with the site (2026-10-06)

Dany: switching between Home and Build, the navigation looked different. Every app route now
renders one `SiteHeader` re-implemented to the live site's measured geometry; no CSS or markup
was copied from the private site repo.

### Site measurements

Measured with Playwright (installed Chrome) on `https://dev.puni.dev/`, read-only. Boxes are
`x,y width×height` in CSS px. Services, Blog, a blog post and Privacy use the same white header;
no site page has a light header variant, and no page marks the current link visually (no
`aria-current`, identical colour). Links turn `#f6ae4c` on hover.

| Part            | 1440×900                      | 1024×768       | 768×1024         | 390×844                         | 320×568         |
| --------------- | ----------------------------- | -------------- | ---------------- | ------------------------------- | --------------- |
| Rail label      | 40,48 112.2×52.8, Geist 18/27 | 32,48          | hidden           | hidden                          | hidden          |
| Nav links       | 184.2,48+52.8n 98.7×52.8      | 176.2,48+52.8n | hidden           | hidden                          | hidden          |
| Wordmark (link) | 662.1,48 115.9×52.8, 36px 800 | 454.1,48       | 24,38 115.9×44   | 20,32 92.7×44, 28.8px           | 20,32           |
| Moon            | 748.4,57.9 29.5×29.5          | 540.4,57.9     | 110.4,43.5       | 89.1,40 23.6×23.6               | 89.1,40         |
| Menu button     | hidden                        | hidden         | 646.7,38 97.3×44 | 272.7,32 97.3×44, Geist 16/16   | 202.7,32        |
| Open panel      | –                             | –              | 424,90 320×282.4 | 50,84 320×282.4                 | 20,84 280×282.4 |
| Open items      | –                             | –              | 449,144.2+52.8n  | 75,138.2+52.8n, Geist 19.2/28.8 | 45,138.2+52.8n  |

Breakpoints probed from 320 to 2560 px: the rail shows from 992 px; the container measure is
`100% − 40px` below 768, then 720, 960 (992), 1152 (1280), 1360 (1440) and 1760 (1920, top 56 px);
the wordmark is 28.8px at 600 px and below, with the header top at 32 px, else 38 px below 992.

### Decisions

- **Manual brief:** its header sits on a night band (the site's video and scrim, falling back to
  the night colour) like the site's inner-page heroes, so the white header is unchanged across the
  switch; the context and form panels below keep their look. The rail is in flow there, so the
  band is 259.2 px tall from 992 px, as on the site.
- **Operator:** the light tone, same geometry, ink on paper; it now carries the site navigation.
- **Build:** the rail overlays the page as on the site's Home. From 992 to 1439 px the 720 px
  column would run under the rail, so the harness is padded to the rail's right there.
- **Menu:** the button reads `Menu ☰` open or closed, like the site; `aria-expanded` carries the
  state. Build keeps `aria-current` without a visual mark, like the site.
- `--night-nav-type` is replaced by `--header-nav-type` (18px/27px) and sibling tokens equal to the
  site values.

### Parity before and after

`PUNI_SCREENS_ONLY=header-parity` compares the live site with `/`, `/manual` and `/operator` at
five widths, plus the open menu at 390 (±2 px, same family, size, line height and weight).

| Capture             | Before (4cacc8ced)                                                                        | After       |
| ------------------- | ----------------------------------------------------------------------------------------- | ----------- |
| Build 1440          | brand 664.6,24 Geist 16px; moon 750.2,33.4 25.2px; rail 96,48 44 px rows; links 73.3 wide | OK          |
| Manual 1440         | wordmark 686.1,12 28px 700; no moon, no rail; links inline at y=12, 14px                  | OK          |
| Operator 1440       | no site header                                                                            | OK          |
| Build 1024          | Menu instead of rail (app switched at 1280)                                               | OK          |
| Build 390 (+ open)  | brand 16,24; moon 19.6px; Menu 267.9,24 106.1×44 Geist 18px/27px                          | OK          |
| Manual 390 (+ open) | brand 16,12 28px 700; Menu 277.5,12 14px                                                  | OK          |
| All 15 captures     | FAIL (exit 1)                                                                             | OK (exit 0) |

### Results

- Uncached `env -u CLAUDECODE NX_DAEMON=false bunx nx run-many -t test,lint,typecheck,build -p website-fe-01 --skip-nx-cache`:
  exit 0; direct `bun test apps/website/fe-01/src`: 59 pass, 0 fail.
- `PUNI_SCREENS_STRICT=1 bun apps/website/fe-01/browser/screens.mjs` (with `PUNI_OPERATOR_PASSWORD`):
  exit 0, 62/62 OK (11 states × 4 widths, tab-order-390, menu-390, start-over-320, 15 header-parity).
  The `manual` check now waits for the `/session` resource instead of `networkidle`, because the
  band's looping video keeps the network busy.
- `bun apps/website/fe-01/browser/conversation.mjs` and `explicit-send.mjs`: exit 0.

### R5 proofs

| Injected fault                                 | Observed failure                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------------------- |
| Previous header (4cacc8ced, before the change) | `header-parity`: 15/15 captures failed, exit 1                                    |
| Moon back to `0.7em`                           | `header-parity`: 15/15 failed on the brand, wordmark and moon boxes               |
| `offersAiExploration` returns `true`           | `manual`: "manual brief links back to Build" at all four widths with the new wait |

Both injected files were restored and `cmp` matched their backups.
