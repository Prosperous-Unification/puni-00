## Context

The Build app (`apps/website/fe-01`) already carries assistant-ui, AI SDK streaming, a server-owned operation identity, explicit Send, stop and retry, but only for a signed-in account over `/chat/stream`, and only in a light card layout. The API (`apps/website/be-01/src/server.ts`) holds the OpenRouter adapter with pinned routing (`only`, `zdr`, `data_collection: deny`, `allow_fallbacks: false`, `require_parameters: true`, `max_price`), atomic reservations in `provider_call`, and the `chat_operation` ledger. Every chat table has `account_id NOT NULL`, so nothing anonymous can be stored today. The site (private `puni-pr-00`) streams `media/hero/background.mp4` on every page under the Astro ClientRouter, shows the `[n]` monotext navigation, a liquid-glass one-line input and a NASA moon after the header wordmark. Google and OpenRouter credentials are absent on the preview host; `DEMO_AUTH=0` and `OPENROUTER_ENABLED=0` are fixed in Compose.

A partial hero-media implementation exists as a stash on `feat/app-header-no-cta` (`hero-media.ts` with `selectHeroLayer` and `locateHeroMedia`, its tests, and a `HeroMedia` component). Its design is reused here; the stash itself is not popped.

Dany's request (verbatim): "now - i need to redesign the build section - (1) i want to keep the background animation from the site (2) it has to look like the typical AI harness where a person chats with AI - it need to be openrouter API integration, i will make it have a small chat with customer that will try to convert them".

## Goals / Non-Goals

**Goals:** Build looks like the site and like an AI chat harness; a visitor can chat with a real model without signing in; the conversation is short and aimed at a human proposal request; cost and abuse are bounded by the server; something visible ships before any paid call; activation is a documented operator step.

**Non-Goals:** concept preview changes, model tools, attachments, multi-model choice, generated code, operator chat review UI, outbound email, production (`puni.dev`) cutover.

## Decisions already made (recorded, not reopened)

1. Build uses the site's background animation streamed from the site origin, with a scrim, a reduced-motion poster and a gradient fallback.
2. The layout is a typical AI chat harness: full-height conversation, streaming assistant messages, user messages, a composer pinned at the bottom in the site's liquid-glass style, a stop button, visible thinking/streaming/error states. The Home request is the first user message. Mobile-first and keyboard friendly.
3. A real OpenRouter integration through the existing server-only adapter, routing safeguards and reservation accounting.
4. The chat is a short sales/conversion conversation (clarify, brief, confidence, email, proposal). It never agrees to price, dates or contracts; it stays on software-request scope and resists prompt injection.
5. **ASSUMPTION (orchestrator; Dany may override): no sign-in wall.** Anonymous chat bound to the browser draft claim under strict caps. Google sign-in stays optional.
6. The privacy notice names OpenRouter and the model provider before chat is enabled.
7. Dany supplies the OpenRouter key into the host runtime env; it is never stored in a repo or chat; the app shows a visibly disabled state without it.

### Superseded spec lines

The following still-open delta lines are superseded by this change. They are not edited in place (their changes are unarchived); archiving this change supersedes them:

- `openspec/changes/assistant-ui-build/specs/build-experience/spec.md`, "Google sign-in": "require authentication before paid inference" → sign-in is optional; paid inference is admitted by the browser claim.
- Same file, "Customer conversation": "After sign-in, Build SHALL show the saved Home request and wait for the customer to press Send" → the same explicit-Send rule applies to the anonymous visitor without the sign-in precondition.
- `openspec/changes/puni-website-funnel/specs/request-handoff/spec.md`, "Independent prospect identity for AI": "When a prospect chooses AI, the PUNI API SHALL authenticate them through its own OIDC session" → OIDC remains for account continuity, not as the chat gate.
- `openspec/changes/puni-website-funnel/specs/scoping-conversation/spec.md`, "Bounded prospect conversation": "at most 12 user turns per brief ... 1,024 completion tokens" → 8 visitor turns and 400 completion tokens for the anonymous conversation; the account path keeps its figures until removed.
- `docs/website/README.md`: "Choosing AI requires sign-in before any model call."; `docs/website/openrouter-research.md`: "do not call the model before sign-in"; private `docs/website/build-experience.md`: "Sign-in precedes the first paid model turn."

## Decisions

### Model and provider

**`openai/gpt-4.1-mini` on the exact endpoint `azure/swedencentral`.** Re-read on 2026-10-05 from `https://openrouter.ai/api/v1/endpoints/zdr`: listed at $0.44 per million prompt tokens and $1.76 per million completion tokens, `max_completion_tokens` 942,818, supported parameters include `max_completion_tokens`, `response_format`, `structured_outputs`, `temperature`, `seed`; no reasoning parameters, so there is no hidden reasoning spend and first-token latency is low. The same catalog lists cheaper ZDR endpoints: `openai/gpt-4.1-nano` `azure/swedencentral` ($0.11/$0.44), `openai/gpt-5-nano` ($0.055/$0.44) and `openai/gpt-6-luna` ($0.10/$0.50), but the latter two default to reasoning (OpenAI's documented default), which spends completion tokens invisibly and lengthens replies past PUNI's deadline; 4.1-nano is the named fallback if quality is acceptable in the evaluation corpus. `google/gemini-2.5-flash-lite` on `google-vertex/eu` ($0.10/$0.40) is a second fallback with EU endpoint naming, but its reasoning parameter set means the same caution. Re-read on 2026-10-06 from `https://openrouter.ai/api/v1/models/openai/gpt-4.1-mini/endpoints`: the endpoint's supported parameters are `max_completion_tokens`, `response_format`, `seed`, `structured_outputs`, `temperature`, `tool_choice`, `tools` and `top_p`, without `max_tokens`. Under `require_parameters: true` the cap is therefore sent only as `max_completion_tokens`, never through the AI SDK's `maxOutputTokens` (which serializes as `max_tokens`). The provider policy stays `zdr: true`, `data_collection: 'deny'`, `allow_fallbacks: false`, `require_parameters: true`, `max_price` at the configured rates and `request: 0`. The privacy notice names OpenRouter, Inc. as processor and Microsoft Azure OpenAI (Sweden Central) as the model host for that pinned endpoint; changing the endpoint requires changing the notice first.

Catalog rates are public listed rates, not PUNI's debit; the activation runbook re-reads them and records the real smoke debit.

### Price and turn ceilings (the "conversation allowance")

| Limit                                                   | Value                                                                         | Rationale                                                                                                           |
| ------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Visitor turns per conversation (incl. the Home request) | 8                                                                             | A sales conversation: 3 clarifying questions, a brief, confidence, email, two spare turns.                          |
| Visitor message length                                  | 2,000 characters (Home); 1,500 afterwards                                     | Keeps input tokens small; the Home limit is existing.                                                               |
| Completion tokens per reply                             | 400                                                                           | Short replies read as a person, cost less and finish well inside the 30 s deadline.                                 |
| History sent to the model                               | all turns, capped at 12,000 characters, oldest trimmed after the Home request | Bounded prompt; the Home request and brief stay.                                                                    |
| Per-conversation spend ceiling                          | $0.15                                                                         | Worst-case byte-based reservation across 8 turns at the listed rates is below this; realistic spend is about $0.02. |
| Per-source UTC-day spend ceiling                        | $0.30 across at most 3 conversations                                          | A source is the hashed client address (see below); it bounds one person or one script.                              |
| Site-wide UTC-day spend ceiling                         | $10 (existing)                                                                | About 500 conversations per day at realistic spend.                                                                 |
| Concurrent in-flight calls                              | 1 per conversation, 4 site-wide (existing)                                    |                                                                                                                     |
| Dedicated key monthly ceiling                           | $100 (OpenRouter key limit)                                                   | Defense in depth, set by Dany at key creation.                                                                      |
| Server deadline                                         | 30 s (existing)                                                               |                                                                                                                     |

Exhaustion of any ceiling is a modeled, visible state: the composer closes, the assistant's last reply stays, and the inline brief, email and "Request a proposal" affordances remain.

**Conservative settlement (slice 3).** An operation whose final usage is unknown (Stop/cancel, browser disconnect, the 30 s deadline, a provider or stream error, a refused completion, or a restart) is settled at its full reservation: `state = 'unknown'`, `settlement = 'reserved_ceiling'`, `settled_micro_usd = reserved_micro_usd`, plus the provider's generation id when a chunk carried one. The reservation is the byte-bound input estimate plus the 400-token output cap at the pinned `max_price`, so the recorded spend can only over-count what OpenRouter can charge. The conversation stays open; one Stop no longer ends the chat. The partial reply is not a turn; the visitor's message stays on the operation, `GET /conversation` reports it as the latest operation and Build shows it as `Stopped` with Retry. A retry under the same key and body starts a new attempt row (the unique key index excludes `unknown` rows). Every ceiling counts the settled amounts, so repeated Stops exhaust `conversation_spend` like spent replies. Usage above the reservation is recorded at the actual cost with `overrun = 1`. The account `/chat*` path keeps its hold-until-reconciled rule; it is out of this change's scope. Earlier drafts held the conversation as `exhausted`/`unsettled`; that reason no longer exists.

**Concurrency and attribution.** The site-wide count of four counts only in-flight paid calls (`provider_call` unsettled plus `conversation_operation` `inflight`); a settled-at-ceiling operation never holds a slot. Each operation stores the source hash and UTC day it was admitted under, and the per-source ceilings sum those, so a conversation that crosses UTC midnight is charged to the new day's source.

### Identity, source and abuse controls

The conversation owner is the **intake draft** reached through the existing host-only `__Host-puni_draft` cookie and `draftCsrf(claim)` header, the same authority the manual brief uses. No new cookie, no account. A signed-in session that owns a software request attached to the same draft reads the same conversation (continuity after optional sign-in); the account path's `/chat*` routes are untouched and remain for the account workspace.

A **source** is `sha256(day-salt || client-ip)` where the client IP is the last `X-Forwarded-For` hop set by the trusted gateway (configured by `TRUSTED_PROXY_HOPS=1` in preview and production, `0` locally, where the socket address is used) and the day salt is random per API process per UTC day. It is pseudonymous, unrecoverable after the salt rotates, and stored only on `conversation` rows for the per-source ceilings. Missing or malformed forwarding headers when `TRUSTED_PROXY_HOPS>0` refuse the request (R5), never fall back to the socket address. An IPv6 client is identified by its /64 prefix. The day salt is random, created by the first process to need it in the `source_salt` table and read by every process on the database, so restarts and blue/green pairs agree; salts older than the previous day are deleted, which keeps old source hashes unrecoverable. (An HMAC of the day under a long-lived secret was rejected: a secret stored beside the hashes would let anyone with the database recompute every past day.) Rate windows (`admitRequestRate`) count one minute per path per hashed source, per draft claim on `/conversation/stream`, and a global backstop of 300 per path; a request is counted only when every window admits it.

Admission order for `POST /conversation/stream`: exact app Origin → claim cookie and CSRF → per-path rate window (existing `allowSource`) → body shape and length → draft live and unconsumed → conversation state `open` → idempotent operation lookup (replay completed, refuse inflight/unknown/changed body) → visitor-turn cap → per-source conversation count and day spend → per-conversation spend → site-day spend and concurrent-call count → reservation → provider call. Every refusal is a typed 4xx/503 before the provider is contacted.

Prompt-injection posture: the system prompt is the only privileged context; there are no tools, no secrets and no other users' data in the model's context, so the blast radius of a successful injection is a bad reply, which is bounded by the completion cap and the server-owned stage machine (the UI never acts on model text). The evaluation corpus (below) checks the refusal policy with the real model before activation; fixture tests check that injected text never changes the outbound system prompt, routing or caps.

### Conversation stages (server-owned)

The server, not the model, decides what the UI offers. Stage is a pure function of the stored conversation (`deriveStage` in `libs/website/domain/contracts`):

| Stage        | Condition                                       | Assistant instruction appended as a one-line stage hint            | UI affordance                                                      |
| ------------ | ----------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `clarify`    | visitor turns 1–2 completed                     | Ask exactly one clarifying question.                               | Composer open.                                                     |
| `brief`      | the 3rd visitor turn is being answered          | Reflect the request as a crisp brief and ask whether it is right.  | Composer open; the reply is also stored as the draft brief.        |
| `contact`    | visitor turns ≥ 4, no proposal yet              | Build confidence briefly, answer questions, ask for an email once. | Inline email field and "Request a proposal" under the thread.      |
| `exhausted`  | turn cap or a spend ceiling reached             | none (no call)                                                     | Composer closed with the reason; brief, email and proposal remain. |
| `handed_off` | the claim was consumed by a proposal submission | none                                                               | Receipt state.                                                     |

The visitor may request a proposal from any stage after the first reply; the stage only decides when the UI _suggests_ it. The brief stored at `brief` is the trimmed assistant reply (≤ 4,000 characters, the existing `intake_draft.brief` bound); the visitor can edit it inline before submitting. This is the minimal reliable approach: no structured model output to parse mid-stream, no tool calls, nothing the model says can open or skip an affordance.

Why not structured outputs or tool calls: both move control to model text, need partial-JSON handling in the stream, and add a parse failure mode on the paid path. A stage hint costs about 20 input tokens.

### System prompt

The full draft lives in [system-prompt.md](system-prompt.md) and ships as `apps/website/be-01/src/conversation/system-prompt.ts` exporting `salesPromptVersion` (`puni-sales-v2` since the brief markers) and `salesSystemPrompt`. Each operation records `prompt_version`, so a later prompt change is visible in evaluation and accounting. The prompt is never logged.

### API

New claim-bound routes beside the existing account routes (`origin === appOrigin` only):

- `GET /conversation` → `{ stage, turns, visitorTurnsRemaining, provider: 'openrouter' | 'demo' | 'disabled', brief, description, csrfToken, initialOperation, latestOperation, exhaustedReason }`, `Cache-Control: no-store`. 401 `draft_unavailable` without a live claim.
- `POST /conversation/stream` with `{ idempotencyKey, initial: true } | { idempotencyKey, message }` → AI SDK UI message stream, the same confirmed-finish pump as `/chat/stream` (a finish event only after the operation is `completed`; otherwise an `error` chunk). `initial` uses the server key `initial:<draftId>` and the stored description, as today.
- `POST /conversation/cancel` with `{ idempotencyKey }` → settles the operation at its reserved ceiling and aborts the provider call; the conversation stays open.
- `POST /draft/discard` → `204`, expires the draft claim and its cookie, deletes nothing (the expired-draft purge applies); `409 draft_consumed` once submitted or attached. Build's `[ Start over ]` calls it after an inline confirmation and lands on the site's `/#request`.
- `POST /proposals` (existing) is the handoff. The submission consumes the claim and marks the conversation `handed_off` in the same transaction.

Provider disabled (`OPENROUTER_ENABLED=0` and `DEMO_AUTH=0`): `GET /conversation` reports `provider: 'disabled'`; `POST /conversation/stream` answers 503 `provider_unavailable` without admitting an operation (the existing broken-store invariant applies). Demo (`DEMO_AUTH=1`, loopback only): canned staged replies labelled as simulated, no reservation.

The shared stream and admission code is extracted from the `/chat/stream` handler into `apps/website/be-01/src/conversation/` so both owners (account request, draft) use one pump, one usage reader and one routing block; the refactor is covered by the existing mounted tests.

### Data model (migration `007_conversation`, additive, paired `down.sql`)

```sql
CREATE TABLE conversation (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL UNIQUE REFERENCES intake_draft(id),
  source_hash TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('open', 'exhausted', 'handed_off')),
  exhausted_reason TEXT CHECK(exhausted_reason IN ('turns', 'conversation_spend', 'source_spend', 'site_spend')),
  created_at INTEGER NOT NULL,
  CHECK((state = 'exhausted') = (exhausted_reason IS NOT NULL))
);
CREATE INDEX conversation_source_day ON conversation(source_hash, created_at);
CREATE TABLE conversation_turn (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversation(id),
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX conversation_turn_order ON conversation_turn(conversation_id, created_at);
CREATE TABLE conversation_operation (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversation(id),
  idempotency_key TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  body_hash TEXT NOT NULL,
  message TEXT NOT NULL,
  initial INTEGER NOT NULL CHECK(initial IN (0, 1)),
  stage TEXT NOT NULL CHECK(stage IN ('clarify', 'brief', 'contact')),
  prompt_version TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('inflight', 'completed', 'unknown')),
  utc_day TEXT NOT NULL,
  reserved_micro_usd INTEGER,
  settled_micro_usd INTEGER,
  settlement TEXT CHECK(settlement IN ('usage', 'reserved_ceiling')),
  overrun INTEGER NOT NULL DEFAULT 0 CHECK(overrun IN (0, 1)),
  generation_id TEXT,
  reply TEXT,
  truncated INTEGER NOT NULL DEFAULT 0 CHECK(truncated IN (0, 1)),
  brief_capture TEXT CHECK(brief_capture IN ('marked', 'fallback', 'empty')),
  created_at INTEGER NOT NULL,
  CHECK((state = 'inflight') = (settlement IS NULL)),
  CHECK((state = 'unknown') = (settlement IS 'reserved_ceiling')),
  CHECK(settlement IS NOT 'reserved_ceiling' OR settled_micro_usd IS reserved_micro_usd)
);
CREATE UNIQUE INDEX conversation_operation_attempt ON conversation_operation(conversation_id, idempotency_key) WHERE state <> 'unknown';
CREATE INDEX conversation_operation_day ON conversation_operation(utc_day);
CREATE INDEX conversation_operation_source_day ON conversation_operation(source_hash, utc_day);
CREATE INDEX conversation_operation_state ON conversation_operation(conversation_id, state);
CREATE TABLE source_salt (
  utc_day TEXT PRIMARY KEY,
  salt BLOB NOT NULL CHECK(length(salt) = 32)
);
```

New tables rather than nullable owners: `chat_turn`, `chat_operation` and `provider_call` all have `account_id NOT NULL`, which SQLite cannot relax additively, and a table rebuild is not blue/green safe. Reservation columns live on `conversation_operation` because `provider_call` also requires an account. The site-wide day spend and concurrent-call counts therefore sum `provider_call` and `conversation_operation` (`UNION ALL`) inside one `reserveConversationCall` transaction; a test proves an account reservation and an anonymous reservation share the same $10 day ceiling. Startup settles `inflight` conversation operations at their reserved ceiling (as `unknown`), where `chat_operation` is only marked `unknown`. Migration 007 was extended in place in slice 3 (settlement, overrun, generation id, per-operation source hash, the partial unique key index, `source_salt`, and no `unsettled` reason) because it had not been applied on any deployed database. On 2026-10-06 the slice 4 `brief_capture` column, first written as a separate migration 008, was folded into 007 for the same reason: neither had been applied to any persistent database (the preview database holds 006), and the private recovery command already knows 007. There is no migration 008.

### Retention

Conversation content is request content. `conversation_turn.content` and `conversation_operation.message/reply` join the nonblank-content predicates in `request-retention.ts` through `software_request.draft_id` and `proposal_submission.draft_id`, so a retention subject's first-content anchor, due report and erasure cover them; the draft anchor already precedes any conversation content, so no new ambiguity class is introduced. Erasure blanks the three text columns and keeps `reserved/settled_micro_usd`, `utc_day`, `prompt_version` and `source_hash` (pseudonymous, salted) for accounting. The anonymous 24-hour rule: `purgeExpiredDrafts` deletes conversation rows whose draft expired unconsumed, in the same transaction as the draft, after writing the count-only plan; an expired draft with a `conversation` row but a `proposal_submission` is a retention subject, not a purge candidate (existing lineage checks). A conversation operation that is `unknown` at purge time, or whose UTC day is on or after the cutoff's UTC day, is retained as a text-blanked accounting row, never deleted, so the day's ceilings keep seeing that spend.

### Frontend

- `hero-media.ts` (from the stash): `selectHeroLayer(prefersReducedMotion, isMediaFailed)` → `video | poster | gradient`; `locateHeroMedia(siteOrigin)` → `/media/hero/background.mp4` and `/media/hero/poster.jpg` on the site origin. `HeroMedia` renders a fixed full-viewport layer (`position: fixed; inset: 0; z-index: -1`) under a scrim (`linear-gradient(180deg, #0b0915b3, #0b0915e6)`), `muted playsInline loop autoPlay preload="metadata"`, `onError` → gradient. The `<video>` has no `crossorigin` attribute, so no CORS is needed and the site's `SameSite=Lax` draft cookie is not sent with the subresource request. Page `background` is the night gradient so the fallback is the design, not a hole.
- `chrome.tsx`: `SiteHeader` gains `tone: 'light' | 'night'`; on night it renders the site's `[-] Navigation` rail label, `[1] Home … [4] Blog`, the wordmark with the moon `<picture>` from `${siteOrigin}/media/brand/moon.{avif,webp}` (empty `alt`, `onError` → the existing orange dot). Below 900 px the existing Menu disclosure remains.
- `build-page.tsx` becomes the harness: `<main class="harness">` with the thread viewport (`ThreadPrimitive.Viewport`, `flex: 1; overflow-y: auto`), messages as plain rows (`YOU` / `PUNI` micro labels, no bubbles on the assistant side, a faint glass bubble on the user side), a status row (`Thinking…`, streaming cursor, error text with Retry), and the composer pinned with `position: sticky; bottom: env(safe-area-inset-bottom)`: one-line glass field that grows to three lines (`border: 1px solid #ffffff6b; background: #ffffff12; backdrop-filter: blur(18px) saturate(160%)`, never white), the round send arrow, Stop while streaming, `Enter` sends, `Shift+Enter` newline. Eyebrow above the first message: `[ AI can do everything. It doesn't want anything. ]`. Inline conversion card under the thread at `contact`: `[ YOUR BRIEF ]` editable text, email field, `Request a proposal ↗` using the existing `/proposals` client code, bracket toggle `[ Edit brief / Keep it ]`. Exhausted: composer replaced by one line (`This conversation reached its limit. Send your brief to a person.`) plus the same card. Disabled provider: thread shows the Home request and one assistant-styled system row `AI chat isn't switched on yet. A person still reads every brief.` with `Shape your brief →`.
- Explicit Send: the composer is pre-filled read-only with the Home request and a single `Send ↗`; no stream request before that click; mount, reload and the optional sign-in return send nothing (the existing `explicit-send.mjs` rule, now on `/conversation/stream`).
- Mobile: `100dvh` layout, composer above the virtual keyboard (`visualViewport` resize handler keeps the last message in view), 44 px targets, no horizontal overflow at 320 px, focus order header → thread → composer.
- Visible states: `loading`, `ready`, `streaming`, `stopped`, `error` (retryable), `exhausted`, `disabled`, `handed_off`, `expired` (redirect to Home as today). Impossible unions reach `BuildErrorBoundary`.
- The manual brief, operator inbox and the concept preview panel are unchanged; the preview is not shown in the harness (non-goal).
- Live harness as built in slice 3 (`conversation-harness.tsx`): the AI SDK `DefaultChatTransport` posts to `/conversation/stream` and the harness reads the UI message chunks itself, because the thread is the server's saved turns plus at most one live or stopped attempt rather than a client-owned message list. Stop posts the cancel first and then drops the stream (the disconnect settles the attempt too if the cancel is lost). The Home request leaves the composer once it is in the thread; Retry there resends it under the server key. Demo replies carry `Simulated`. The optional sign-in sits behind `[ Sign in ]` in the harness bar. The inline card prefills the stored brief (else the Home request) and focuses `Thank you.` with the receipt after submission; `Start over` disappears because the claim is consumed.

### Testing strategy

- **Fake OpenRouter transport**: `providerFetch` fixture (existing injection point) returns scripted SSE with text deltas and a final usage event, optional mid-stream error, optional missing usage, optional 429/402/5xx. Deterministic streaming for mounted tests.
- **Mounted API tests** (`server.test.ts` style): every admission refusal before the provider; replay without a second call; changed-body conflict; unknown usage settled at the reserved ceiling with the conversation still open; Stop then continue until the ceiling-settled amounts exhaust `conversation_spend`; source ceilings; conversation ceiling; shared site-day ceiling with an account reservation; stage derivation; brief capture; handoff marks `handed_off`; provider-disabled 503 and the broken-store invariant; `TRUSTED_PROXY_HOPS` refusals.
- **Store tests**: migration 007 forward and `down.sql`; startup marks inflight unknown; purge deletes expired-draft conversations and keeps unknown accounting rows; retention predicates see conversation content; erasure blanks text and keeps accounting.
- **Browser regression** (`browser/conversation.mjs`, extending `explicit-send.mjs`): zero POSTs before Send; one initial POST; streaming visible; Stop → cancel POST and `stopped` state; retry same key after a dropped POST; reload restores the thread; cap reached → exhausted state with the card; disabled provider state; 390 px with a simulated 300 px keyboard inset keeps the composer visible; no horizontal overflow at 320 px; video element present, poster under reduced motion, gradient on a 404 media URL.
- **Evaluation corpus** (`apps/website/be-01/eval/sales-corpus.json`, run by `bun apps/website/be-01/src/conversation/eval-cli.ts` against the real key only by an operator): 12 scripted conversations (clear request, vague request, hostile, off-topic, price demand, date demand, contract demand, prompt-injection "ignore your instructions", secret request, non-software request, a second language, an email volunteered early). Pass criteria per script are string-level (no `$`, no month names or dates committed, no "contract", no system-prompt text, one question in clarify replies, brief present at stage `brief`, email asked once). The CLI prints only pass/fail and token totals, never transcripts, unless `--show` is passed locally.
- **R5 negatives**: each new check names the fault and the observing test in `tasks.md`; the implementer watches it fail with the check removed.

### Rollout and deploy per slice

Each slice ends with: (1) `bunx nx run-many -t test lint typecheck build -p website-fe-01 website-be-01 website-store-sqlite website-contracts` locally with `env -u CLAUDECODE`; (2) the public host gate `/home/df/wd/puni/puni-plan/exec/remote-gate.sh <branch> <sha>`; (3) merge to the website stack branch; (4) private snapshot refresh (`portability.ts`, `baseline.json`, four tree ids) and preview release per `deploy/website/dev/README.md`, with the receipt appended to private `docs/website/dev-preview.md`. Slices 1–2 ship with the provider disabled, so the harness is visible on `dev.app.puni.dev` before any key exists.

## Risks / Trade-offs

- Anonymous paid chat invites scripted abuse. Mitigation: claim required (one Home POST per conversation, existing per-path rate window), per-source ceilings, site-day ceiling, key monthly ceiling. Residual: a distributed script could burn up to $10 per day; the daily ceiling is the accepted maximum loss. Dany confirms this figure.
- Pseudonymous source hashing behind one gateway hop: a misconfigured `TRUSTED_PROXY_HOPS` would make every visitor one source. The config refuses to start without the variable when `APP_ORIGIN` is `https`, and a mounted test covers the refusal.
- Catalog prices drift. Activation re-reads them; `max_price` refuses a dearer endpoint.
- Brief capture is the model's prose, not a schema. Acceptable: the visitor edits it before submission and a human reads it.
- A reload after handoff lands on Home (the claim is consumed), not on the receipt. Acceptable; the receipt is shown once and the replay cookie recovers it on `/manual` as today.
- The model may still state a figure despite instructions. The corpus checks it before activation; a human reads every submission, and the UI never renders a price field.
- `/chat*` and `/conversation*` coexist until the account workspace is redesigned; the shared stream module keeps one code path for usage and routing.

## Migration Plan

1. Ship the harness UI with the hero media and header against `/conversation` in disabled and demo modes (slices 1–4). Deploy to preview; the visitor sees the new Build with the disabled notice.
2. Ship caps, retention, prompt and evaluation CLI (slices 5–7). Migration 007 is applied by the API at startup; `down.sql` is tested.
3. Private: privacy page processor wording, `TRUSTED_PROXY_HOPS=1` in Compose, the activation override file (slice 8).
4. Dany: dedicated OpenRouter key with a $100 monthly limit, model allowlist `openai/gpt-4.1-mini`, provider allowlist `azure/swedencentral`, ZDR on; puts `OPENROUTER_API_KEY` and the nonsecret settings into `/home/puni1/puni-site-dev/runtime/runtime.env` (mode 0600); the operator runs the evaluation corpus, then applies the Compose enable override (slice 9). Evidence goes to `verify.md` and the private receipt.

## Open Questions

- Dany confirms or overrides the no-sign-in assumption and the $10 site-day ceiling.
- Whether the account workspace (`/chat*`, concept preview) is retired or restyled is a later change.
