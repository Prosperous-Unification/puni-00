## Context

The website API (`apps/website/be-01/src/server.ts`) answers every public route of `dev.puni.dev/api/*` and `dev.app.puni.dev` behind one Caddy gateway (`puni-pr-00` `deploy/website/dev/Caddyfile.site`), which forwards exactly one `X-Forwarded-For` value; the API runs with `TRUSTED_PROXY_HOPS=1`. Its defences on 2026-10-07 (`d4f458a76`):

- `admitRequestRate`: fixed 60 s windows, 30 per path per hashed source and 300 per path globally, in an in-memory `Map`, on `/intakes`, `/conversation/stream` (also per claim), `/brief`, `/proposals`, `/session/demo`, `/chat/stream`, `/chat`, `/operator/session`. `GET /conversation`, `/conversation/cancel`, `/draft/discard`, `/entry`, `/draft`, `/session`, `/session/oidc/*`, `/chat/cancel`, `/concept*`, the operator reads and the 404 fall-through have no window.
- The conversation allowance (`conversationAllowance` in `libs/website/adapters/store-sqlite/src/conversation-store.ts`): 8 visitor turns, 1,500 characters, the configured completion cap (700 for Luna), $0.15 per conversation, $0.30 and 3 conversations per source per UTC day, $10 per site per UTC day shared with account reservations, 4 in-flight paid calls site-wide, 1 per conversation, conservative settlement.
- A source is `sha256(day salt || address prefix)` (`conversation/source.ts`), IPv6 by /64, the salt shared through `source_salt` and deleted after a day.
- Operator login: `Bun.password.verify` (Argon2id) behind the 30-per-minute window; sessions 8 h; drafts 24 h; all cookies `__Host-`, `HttpOnly`, `SameSite=Lax`, `Secure`, stored as SHA-256.
- Logging: exactly one `console.info` at startup with the port. No request log in the API or the gateway; the edge Caddy's access log skips the OIDC callback.

Nothing persists a window across a restart or a blue/green pair, nothing bounds drafts or proposals per day, nothing pauses spend across midnight, and nothing tells anyone. Dany (2026-10-07): "make sure to implement certain guardrails - first of all rate limiting; also how r u tracking user sessions; just think these things through before implementing".

## Goals / Non-Goals

**Goals:** a scripted visitor cannot drain more than the site ceiling once and then runs into a human; a human visitor never notices a guardrail except the one-off browser check; every refusal is a typed 4xx the UI renders; every count that must outlive a minute is durable in SQLite and agreed on by blue and green; Dany hears about spend, lockouts and floods without opening a dashboard; nothing new leaks addresses, emails or prompts; the session model is written down and its gaps closed.

**Non-Goals:** a CAPTCHA vendor, metrics scraping and dashboards (k3s follow-up), an edge rate limiter on the shared WBS Caddy, changes to the allowance figures, account-path (`/chat*`) redesign, outbound email, production `puni.dev`.

## Threat model

Cost figures use the Luna rates ($0.11/$0.55 per million tokens; about $0.003 per turn, $0.024 per eight-turn conversation; the per-conversation reservation ceiling is $0.15).

| #   | Actor and capability                                                           | What it costs us today                                                                                 | Control in this change                                                                                                                               | Residual risk                                                                                                                        |
| --- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| T1  | One script, one address, loops Home → Send until refused                       | 3 conversations × up to $0.15 = $0.45 per day per address; the site ceiling ($10) resets at midnight   | Browser check (D4) adds CPU per conversation; daily draft cap (D2); inference pause at $8 (D5) stops the daily reset; alert at $5 (D6)               | Up to $8 of paid replies before a human looks, once                                                                                  |
| T2  | Distributed script, hundreds of addresses or an IPv6 /48                       | Reaches the $10 site ceiling in minutes, every day                                                     | Same as T1; the check is per conversation so cost scales with addresses; global windows (D1) cap the request rate                                    | Same $8 once; a GPU solver pays the check cheaply, so the ceilings and the pause stay the real gate                                  |
| T3  | Script posts `/intakes` in a loop                                              | 2 KB per row, unbounded rows, 24 h purge; Home is also the only free route a bot needs                 | Draft caps: 20 per source per day, 2,000 per site per day (D2); alert at 50% of the site cap                                                         | At most about 4 MB of draft text per day                                                                                             |
| T4  | Script posts `/proposals` with a valid claim                                   | Operator inbox rows forever (retention subjects), one per draft                                        | Proposal caps: 5 per source, 3 per email, 200 per site per day (D2); alert at 50%                                                                    | 200 junk rows per day; a griefer who reaches 200 blocks real submissions for that UTC day, visibly, with the manual contact fallback |
| T5  | Password guessing on `/operator/session`                                       | 30 guesses per minute per address; Argon2id costs us ~0.1 s CPU each                                   | Lockout before verification: 5 failures per 15 min per source, 20 per hour on the account (D3); alert                                                | A griefer can keep the login locked while they hammer it; existing 8 h sessions keep working                                         |
| T6  | Request flood on windowless routes (`GET /conversation`, `/entry`, OIDC start) | CPU, SQLite reads, and `oidc_login` rows that are never swept                                          | General window 120 per minute per source, 3,000 global (D1); per-path window on OIDC start; `oidc_login` sweep                                       | Volumetric floods beyond the API are Hetzner's and later Traefik's problem (D7)                                                      |
| T7  | Forged `X-Forwarded-For`                                                       | Would collapse or spread sources                                                                       | Unchanged: the gateway overwrites the header (`trusted_proxies_strict`); the API refuses a missing hop                                               | Any container on `wbs-dev-net` can reach the gateway and pick an address (documented, WBS dev only)                                  |
| T8  | Restart or blue/green swap used to reset counters                              | Nothing today persists                                                                                 | Minute windows stay in memory by design (at most one doubled minute); daily caps, lockouts, the pause and alert dedupe are rows (D1, D2, D3, D5, D6) | One minute at twice the window during a swap                                                                                         |
| T9  | Stolen or fixed cookie                                                         | A claim is a 24 h draft; a session is 8 h                                                              | Unchanged `__Host-`, `HttpOnly`, server-minted tokens, hashed at rest; new prospect sign-out (D8)                                                    | A stolen claim reads one conversation for its remaining life                                                                         |
| T10 | Prompt injection                                                               | A bad reply, bounded by the completion cap                                                             | Unchanged (harness design)                                                                                                                           | Same                                                                                                                                 |
| T11 | Operator lockout griefing (T5 with a botnet)                                   | Login unavailable while attacked                                                                       | Account lock is time-bound (60 min) and alerts; sources lock separately                                                                              | Repeated hourly locks until the attacker stops or the k3s edge limiter lands                                                         |
| T12 | Alert webhook down, misconfigured or unset                                     | Silence                                                                                                | Delivery outcome is a column (`recorded`, `sent`, `failed`), visible on the operator page; startup prints whether the webhook is set                 | Nobody is paged until someone opens the operator page                                                                                |
| T13 | One IPv6 /56 (256 /64s) or similar block of /64s, scripting `/intakes`         | Sources are keyed per /64, so 100 /64s at 20 drafts each fill the 2,000-draft site cap for the UTC day | Accepted residual: the `draft_cap_half` alert at 1,000 and `draft_cap_full` at 2,000 tell Dany; the manual brief and existing drafts keep working    | Real visitors cannot start a new draft for the rest of that UTC day; proposals from existing drafts still go through                 |

## Decisions

### D1. Request windows: one general window, per-path windows, memory for minutes and rows for days

- **General window.** Every request except `GET /health` first passes a window keyed `*|source`: 120 per minute per source, 3,000 per minute globally. A Build page load makes three or four API calls and the harness never polls, so 120 is about thirty page loads a minute; 3,000 is ten times the per-path backstop and far above the site's traffic. `OPTIONS` counts too; it is cheaper to count than to special-case.
- **Per-path windows** stay at 30 per source and 300 global and gain `/session/oidc/start` and `/session/oidc/callback` (each start writes an `oidc_login` row). The claim key on `/conversation/stream` stays.
- **Order.** Origin and method checks that cost nothing stay first where they exist (`/entry`, `/intakes`); the general window runs before any store read; the per-path window stays where it is (after CSRF, before the body). A refused request counts against no window, as today.
- **`Retry-After`.** Every 429 from a window or a lockout carries `Retry-After` in whole seconds to the end of its window or lock, so the harness can show "try again in n s" and well-behaved clients back off.
- **Memory, not rows, for minute windows.** A SQLite write per request would make the single writer the flood's amplifier and contend with the paid admission transaction. A restart loses at most one minute of counts and a blue/green pair counts separately for the minutes they overlap, so the worst case is one minute at twice the window. An attacker cannot trigger a restart. This is a deliberate exception to the persistence rule below and the reason it is written down.
- **Rows for anything that outlives a minute:** daily caps, lockouts, the pause and alert dedupe (D2, D3, D5, D6) live in `009_guardrails` tables, written inside the transaction that creates the thing they count, so blue and green agree and a refusal is atomic with the count.
- **`oidc_login` sweep.** `createOidcLogin` deletes rows whose `expires_at` has passed before inserting, inside one transaction, so a loop over `/session/oidc/start` leaves at most ten minutes of rows.
- **Map growth.** The admission `Map` is swept every minute already; distinct keys need distinct addresses, and the global window caps the number of keys that can be admitted in a minute.

### D2. Daily caps on drafts and proposal requests

One table, `admission_count (scope, key_hash, utc_day, count)`, incremented with a conditional upsert inside the transaction that creates the row being counted (`createDraft`, `submit`, `submitAccount`): `INSERT … ON CONFLICT DO UPDATE SET count = count + 1 WHERE count < :cap`. Zero changes means refused, and the transaction rolls back the draft or submission. Scopes and caps:

| Scope             | Key                                    | Cap per UTC day | Why this number                                                                                                                                          |
| ----------------- | -------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `draft:source`    | source hash                            | 20              | Retrying Home a dozen times is human; 20 × 2 KB is 40 KB. A bot needs a draft per conversation and already has 3 conversations a day.                    |
| `draft:site`      | `*`                                    | 2,000           | About 4 MB of draft text at most; two hundred times a realistic day; the alert fires at 1,000.                                                           |
| `proposal:source` | source hash                            | 5               | One person submits once, maybe twice after editing the brief.                                                                                            |
| `proposal:email`  | `sha256(day salt ‖ lower-cased email)` | 3               | Stops one script reusing one address; the salt makes the key pseudonymous and unlinkable after a day, like a source.                                     |
| `proposal:site`   | `*`                                    | 200             | Bounds the inbox; real traffic is single digits. Refusal is visible and names the manual contact. The alert fires at 100 so a human sees a flood coming. |

Refusals are typed 429 `draft_source_limit`, `draft_site_limit`, `proposal_source_limit`, `proposal_email_limit`, `proposal_site_limit`, with `Retry-After` to UTC midnight. The Home form on the private site shows the refusal in its own words (private task). Rows whose `utc_day` is older than yesterday are deleted on the same sweep that deletes old salts (`readSourceSalt`), so the table holds two days.

The signed-in `submitAccount` path counts `proposal:source` and `proposal:email` too; an account is not a licence to spam the inbox.

### D3. Operator login lockout

A table `login_failure (scope, key_hash, failures, window_opened_at, locked_until)`, `PRIMARY KEY (scope, key_hash)`:

- **Per source** (`scope = 'source'`, key = source hash): 5 failures inside a 15-minute window lock the source for 15 minutes. Five is enough for a person who mistypes; a guesser gets 20 tries an hour per address.
- **Per account** (`scope = 'account'`, key = `operator`; there is one operator credential): 20 failures inside 60 minutes lock the account for 60 minutes and raise an alert. Twenty guesses an hour against Argon2id is noise.
- **Order:** the lock is read and the attempt counted as a failure in one immediate transaction before `Bun.password.verify`, so a locked source costs no Argon2id CPU (T5) and a concurrent burst cannot reach the verifier more often than the caps (review of #281); a success refunds the counted account attempt. A success deletes the source row; the account row is left to its window. Refusal is 429 `login_locked` with `Retry-After` fixed at the longest lock (3,600 s); neither the body nor the header says which scope locked, so a guesser cannot tell the account lock from their own.
- A source hash changes at UTC midnight, so a source lock that straddles midnight lapses early; the account lock does not depend on the salt. Accepted.
- Existing operator sessions are untouched by a lock; `DELETE /operator/session` still works.

### D4. Browser check: a self-hosted proof of work once per conversation

Rationale and the rejected Turnstile path: [ADR 0040](../../../docs/adr/0040-bot-deterrence-is-a-self-hosted-proof-of-work.md). The mechanism:

- **Challenge.** `GET /conversation` returns `challenge: { salt, challenge, maxnumber, expiresAt } | null`. It is non-null only while the conversation has no admitted operation and the provider is `openrouter`. The server picks a random `n` in `[0, maxnumber]`, `salt = "<claimHashPrefix16>.<mintedUtcDay>.<expiresMs>.<random8>"`, `challenge = sha256(salt ‖ n)`, and signs it: `signature = HMAC-SHA256(key, challenge)`. The key is derived from the day salt already in the store, `key = HMAC-SHA256(sourceSalt(mintedUtcDay), "puni-browser-check-v1")`, so blue and green agree, nothing new is stored, and the key dies with the salt. A challenge minted yesterday is still verifiable today because yesterday's salt is kept; one minted the day before is expired by construction. Minting writes nothing.
- **Solving.** The harness solves in a Web Worker (`@noble/hashes` `sha256`, synchronous, zero dependencies; WebCrypto's async digest is an order of magnitude too slow for this) by counting `n` up until `sha256(salt ‖ n) === challenge`. Expected work is `maxnumber / 2` hashes. It starts in the background as soon as the harness loads with a live provider, so by the time a visitor has read the page the answer is ready. If the answer is older than its `expiresAt` at Send, the harness re-reads `GET /conversation`, shows `Checking your browser…` (`aria-live="polite"`) and solves again.
- **Submitting.** The initial operation's body carries `check: { salt, challenge, signature, number }`. The server verifies, in this order and before the admission transaction: shape; `expiresMs` in the future; `mintedUtcDay` is today or yesterday; the salt's claim prefix equals the caller's claim hash prefix; `signature` equals the HMAC under that day's key (`timingSafeEqual`); `sha256(salt ‖ number) === challenge`. The admission transaction receives `browserCheck: 'verified' | 'absent'` and refuses `challenge_required` (428) when it would create the conversation row without `verified`. Later operations, retries of an `unknown` attempt and replays never need a check because the row exists.
- **Replay.** A solved challenge is bound to one claim and only a conversation without a row accepts one; a claim has exactly one draft and one conversation (`draft_id UNIQUE`), so the same solution cannot start a second conversation anywhere. No solution table is needed. The expiry bounds how long a pre-solved answer stays useful.
- **Difficulty.** `maxnumber` 200,000 normally: expected 100,000 SHA-256s, about 0.1 s on a laptop and under a second on a low-end phone at a conservative 0.3 MH/s. Elevated 1,000,000 when the site's UTC-day spend is at or above 50% of the ceiling ($5): about five times the work, still under four seconds on that phone. The difficulty is inside the signed salt, so a client cannot lower it. The browser regression records the solve time; the numbers above are estimates until it does.
- **Demo and fixtures.** `DEMO_AUTH=1` (free pricing) needs no check. The eval CLI and `browser/conversation-api.mjs` solve the check with the shared solver from `@website/contracts`, so the paid path is exercised end to end.
- **Accessibility and no-JS.** The check has no puzzle, no image, no audio and no interaction; it shows one polite status line. A browser without Worker support solves on the main thread; one without JS has no Build app at all and the manual brief (`/manual`, a plain form, free of the check and of AI cost) is the path. A failed or unsupported check shows the manual path.
- **Privacy page.** No change: nothing leaves the browser except the number; no third party, no cookie, no fingerprint. One sentence under "AI chat on Build" saying the browser performs a short computation before the first reply is optional copy, not a processor change.

### D5. Inference pause

- **State.** `inference_pause (id, paused_at, reason, paused_by, resumed_at, resumed_by)`, with a partial unique index `WHERE resumed_at IS NULL` so at most one pause is open. `reason` is `site_spend` or `operator`.
- **Trip.** Inside the admission transaction (anonymous `admitConversationOperation` and the account path's `reserveProviderCall`), after the site spend is summed: if `siteSpend + reservation ≥ 80%` of the site-day ceiling ($8,000,000 µUSD), no pause is open and no `site_spend` pause was opened earlier the same UTC day, insert the pause and refuse. An open pause refuses inside the same transaction, so a pause opened by the other colour is seen. The once-a-day rule is what makes a resume mean something: the refused reservation added no spend, so without it the first reservation after a resume would trip again; after a resume the day runs to the hard ceiling and the next day's spend trips the pause again. The 80% leaves $2 of the day untouched, and more to the point the pause does not reset at midnight: a drain that reaches $8 pauses the AI until a human looks (T1). Two dollars is three days of realistic traffic (about 80 conversations at $0.024), so a busy real day would trip it rarely, and resuming is one click.
- **Effect.** While a pause is open: `GET /conversation` reports `provider: 'paused'`; `POST /conversation/stream` and `/chat/stream` answer 503 `provider_paused` without admitting an operation; replays still answer; everything free (reading, the brief, proposals, the manual path) works. The provider selection reads the pause row, so a configuration restart does not clear it.
- **Operator.** `GET /operator/guardrails` returns the pause, today's site spend and ceiling, today's draft and proposal counts, the account lock, open source locks, and the last 50 alerts. `POST /operator/inference/pause` and `POST /operator/inference/resume` (operator session and CSRF) write the rows with `paused_by`/`resumed_by = 'operator'`. The operator page shows a `Guardrails` panel above the inbox with the state and the button.
- **Build.** A new rendered state `paused`: `AI chat is paused right now. A person still reads every brief.` with `Shape your brief →`, next to the existing `disabled` state.

### D6. Guardrail alerts

- **Where they go.** `GUARDRAIL_WEBHOOK_URL`, optional, `https` only, `POST` with a `text/plain` body and a `Title` header, which is what [ntfy](https://ntfy.sh) accepts; a random 32-character topic on ntfy.sh (or a self-hosted ntfy later on h3mon) reaches Dany's phone with no account and no SMTP. The receiver is Dany. The URL is a secret and lives in `runtime.env`. The h3mon Victoria and Grafana stack stays untouched: the API has no network path to `10.1.0.2` that has been verified, no exporter exists, and a Grafana contact point would be a second unverified hop; `/metrics` and a `ServiceMonitor` are the k3s follow-up (D7).
- **Durable first.** Every alert is a row in `guardrail_alert (id, kind, dedupe_key UNIQUE, detail, created_at, delivery, delivered_at)` before any network call; `delivery` is `recorded` (webhook unset), `sent` or `failed` (one attempt, 10 s deadline, no retry; the next alert of a different key tries again). Delivery is the one modelled optional outcome, visible in the column and on the operator page, and startup prints `guardrail alerts: webhook set` or `unset`.
- **Counting floods in memory.** 429s and provider failures can arrive thousands of times; they are counted in fixed in-memory windows, and only crossing a threshold writes a row. Rare events (pause, lockout, cap) write directly.

| Kind                         | Trigger                                                               | Dedupe key               |
| ---------------------------- | --------------------------------------------------------------------- | ------------------------ |
| `site_spend_half`            | site-day spend crosses 50% of the ceiling                             | kind + UTC day           |
| `inference_paused`           | a pause opens (either reason)                                         | kind + pause id          |
| `operator_locked`            | the account lock opens                                                | kind + lock window start |
| `draft_cap_half`, `_full`    | `draft:site` reaches 1,000 / 2,000                                    | kind + UTC day           |
| `proposal_cap_half`, `_full` | `proposal:site` reaches 100 / 200                                     | kind + UTC day           |
| `provider_failures`          | ≥ 5 provider 5xx, timeouts or non-refusal stream errors in 10 minutes | kind + UTC hour          |
| `refusals`                   | ≥ 10 `content_filter` or `provider_refusal` completions in a UTC day  | kind + UTC day           |
| `rate_limited`               | ≥ 500 window or lock refusals in 60 minutes                           | kind + UTC hour          |

- **PII-free by test.** `detail` and the webhook text carry counts, kinds, UTC days and amounts in micro-USD, never an address, a hash of one, an email or any message text. A test posts a canary message, canary email and a fixed address through every alert path and asserts none appears in any row or webhook body.

### D7. Edge: nothing now, Traefik on k3s

The WBS edge Caddy (`deploy/compose/base.yml`, stock `caddy:2-alpine`) and the website gateway (`Dockerfile.site`, stock `caddy:2-alpine`) have no rate limiter; one needs a custom `xcaddy` build with `github.com/mholt/caddy-ratelimit`, a module version pin, a Go toolchain in the release build and a second image-hash receipt. The API answers a refused request in microseconds from memory, so the general window (D1) is the control for request floods that reach the host; volumetric floods are absorbed upstream of either Caddy. Decision: no edge limiter on Compose. On k3s the website Ingress gains a Traefik `RateLimit` middleware (average 50 requests per second per client address, burst 100: a page load fetches dozens of assets, the API's own windows are far below this) as one Kustomize object in `puni-fleet`, and the API exposes `/metrics` (Prometheus text) to a cluster-internal `ServiceMonitor` with the pause, spend, cap, lock and refusal counters, so the platform's Alertmanager (`alertmanager-puni`) can page the same way the webhook does. Both are recorded as follow-ups for `website-on-k3s`, not implemented here.

### D8. The session model, written down

Five cookies, all `__Host-` (so `Secure`, host-only, `Path=/`, no `Domain`), `HttpOnly`, `SameSite=Lax`, minted only by the API as 32 random bytes in hex, stored only as SHA-256:

| Cookie                 | What it proves                                                        | Life           | Set by                                  | Ends                                                                   |
| ---------------------- | --------------------------------------------------------------------- | -------------- | --------------------------------------- | ---------------------------------------------------------------------- |
| `__Host-puni_draft`    | this browser created this intake draft (and so owns its conversation) | 24 h, absolute | `POST /intakes`                         | expiry, `POST /draft/discard`, or consumption by a proposal or account |
| `__Host-puni_replay`   | this browser may replay the receipt of a draft it already submitted   | 24 h           | the next `POST /intakes` after a submit | expiry                                                                 |
| `__Host-puni_session`  | this browser is the signed-in prospect account                        | 8 h, absolute  | OIDC callback or loopback demo          | expiry, or `DELETE /session` (new)                                     |
| `__Host-puni_oidc`     | this browser started this OIDC login (the `state`)                    | 10 min         | `GET /session/oidc/start`               | the callback clears it                                                 |
| `__Host-puni_operator` | this browser is an operator                                           | 8 h, absolute  | `POST /operator/session`                | expiry or `DELETE /operator/session`                                   |

The app on `dev.app.puni.dev` and the API on `dev.puni.dev/api` are the same site (`puni.dev`), so `Lax` cookies travel with the app's credentialed fetches; a third-party site cannot send them on a cross-site `POST`, and every write also demands the exact app `Origin` and a CSRF header. The CSRF token for a draft is `sha256("draft-csrf:" ‖ claim)`, for a session `sha256("prospect-csrf:" ‖ token)`, handed out only in JSON to the allowed origin, never readable from the cookie by script because the cookie is `HttpOnly`.

What was reviewed and left alone, with the reason:

- **Claim rotation on submit.** Not needed: submission consumes the draft in the same transaction (`consumed_at`), after which the claim grants only receipt replay through `submission_replay`, never draft or conversation access.
- **Fixation.** Not possible: no route accepts a client-chosen token; `__Host-` stops a sibling host from planting one; the OIDC `state` cookie binds the callback to the browser that started it, which also defeats login CSRF (an attacker's `state` is in the attacker's browser).
- **Rotation on sign-in.** The callback mints a fresh session token every time; the draft attaches to the account in the same request.
- **Cookie size.** Five cookies of about 90 bytes.
- **Concurrent drafts per source.** Unbounded today; D2 bounds them at 20 per day.
- **Timing.** Comparisons go through `timingSafeEqual` on digests.

What changes: `DELETE /session` (CSRF, 204, cookie expired, row deleted) so a prospect can sign out on a shared device; the harness `[ Sign in ]` becomes `[ Sign out ]` when a session exists. A restart changes nothing about sessions: they are rows.

### D9. Logging and IP handling

Verified on `d4f458a76`: the API writes one line at startup (the port); `stream.ts`, the store and the CLIs write no request data (the CLIs print JSON aggregates). The gateway has no `log` directive; the edge vhost's access log holds client addresses and request lines for Caddy's default rotation and skips the OIDC callback. New code keeps the rule: the raw address exists only on the way into `hashSource`; alerts and `guardrail_alert.detail` hold counts; the operator page shows counts and kinds. Two additions: startup prints one line for the webhook state (set or unset, never the URL), and the PII canary test in D6 guards every alert path. The edge access log's retention is a private operating fact to confirm, not a change here.

### D10. Refused exchanges leave the model's context (2026-10-07)

The live smoke on Luna (Azure) showed that after one provider refusal the next benign message was refused too: the history sent with every later turn still held the flagged visitor message, so the provider's filter tripped again and the conversation was dead until Start over. The admission now builds the model's context with `listModelContext`, which leaves out every exchange whose operation carries a `refusal` (the visitor message and the server-owned decline). The visible thread, the stored turns, the turn count and every allowance keep the exchange; only what is sent to the provider changes, and the reservation is priced on what is sent.

## Numbers in one place

| Guardrail                | Value                                        | Rationale                                                                              |
| ------------------------ | -------------------------------------------- | -------------------------------------------------------------------------------------- |
| General window           | 120/min per source, 3,000/min global         | thirty page loads a minute; ten per-path backstops                                     |
| Per-path write windows   | 30/min per source, 300/min global (existing) | unchanged; OIDC start and callback join                                                |
| `oidc_login` sweep       | rows older than their 10 min expiry          | bounds T6                                                                              |
| Draft caps               | 20/source/day, 2,000/site/day                | 40 KB per source; 4 MB per site; alert at 1,000                                        |
| Proposal caps            | 5/source, 3/email, 200/site per day          | single-digit real traffic; inbox bounded; alert at 100                                 |
| Source login lock        | 5 failures / 15 min → 15 min                 | 20 guesses an hour per address                                                         |
| Account login lock       | 20 failures / 60 min → 60 min + alert        | Argon2id makes 20/h worthless; the alert makes griefing visible                        |
| Browser check difficulty | 200,000; 1,000,000 at ≥ 50% site spend       | about 0.1 s / 0.5 s laptop, under 1 s / 4 s low-end phone (estimates, measured in 5.3) |
| Browser check validity   | 30 min                                       | long enough to pre-solve, short enough to bound pre-solved stock                       |
| Inference pause          | 80% of the site-day ceiling ($8)             | survives midnight; $2 is three realistic days; one click to resume                     |
| Alert thresholds         | table in D6                                  | 50% marks are early warnings; the full marks are the caps                              |
| Webhook delivery         | one attempt, 10 s                            | the row is the record; a retry loop would be a second queue to prove                   |
| Edge limiter (k3s)       | 50 r/s per address, burst 100                | whole-host figure including assets; the API's windows are far below                    |

## Data model (migration `009_guardrails`, additive, paired `down.sql`)

```sql
CREATE TABLE admission_count (
  scope TEXT NOT NULL CHECK(scope IN ('draft:source', 'draft:site', 'proposal:source', 'proposal:email', 'proposal:site')),
  key_hash TEXT NOT NULL,
  utc_day TEXT NOT NULL,
  count INTEGER NOT NULL CHECK(count > 0),
  PRIMARY KEY (scope, key_hash, utc_day)
);
CREATE TABLE login_failure (
  scope TEXT NOT NULL CHECK(scope IN ('source', 'account')),
  key_hash TEXT NOT NULL,
  failures INTEGER NOT NULL CHECK(failures > 0),
  window_opened_at INTEGER NOT NULL,
  locked_until INTEGER,
  PRIMARY KEY (scope, key_hash)
);
CREATE TABLE inference_pause (
  id TEXT PRIMARY KEY,
  paused_at INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK(reason IN ('site_spend', 'operator')),
  paused_by TEXT NOT NULL CHECK(paused_by IN ('system', 'operator')),
  resumed_at INTEGER,
  resumed_by TEXT CHECK(resumed_by IN ('operator')),
  CHECK((resumed_at IS NULL) = (resumed_by IS NULL))
);
CREATE UNIQUE INDEX inference_pause_open ON inference_pause((resumed_at IS NULL)) WHERE resumed_at IS NULL;
CREATE TABLE guardrail_alert (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  detail TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  delivery TEXT NOT NULL CHECK(delivery IN ('recorded', 'sent', 'failed')),
  delivered_at INTEGER
);
CREATE INDEX guardrail_alert_created ON guardrail_alert(created_at);
```

`down.sql` drops the four tables and the index. Nothing existing changes; `008_refusal` stays the last applied migration on the preview database until this one is applied by the API at startup, and the private recovery list learns `009_guardrails`.

## API surface

- New refusals: 429 `rate_limited` (now with `Retry-After`), `draft_source_limit`, `draft_site_limit`, `proposal_source_limit`, `proposal_email_limit`, `proposal_site_limit`, `login_locked`; 428 `challenge_required`, 403 `challenge_invalid`; 503 `provider_paused`.
- `GET /conversation` gains `challenge` and the provider value `paused`.
- `POST /conversation/stream` `initial` body accepts `check`.
- New routes: `DELETE /session`; `GET /operator/guardrails`; `POST /operator/inference/pause`; `POST /operator/inference/resume`.
- New config: `GUARDRAIL_WEBHOOK_URL` (optional; a non-`https` value throws at startup).
- Constants live beside `conversationAllowance` as `guardrailAllowance` in the store (caps, lock figures, pause fraction) and `browserCheckDifficulty` in `@website/contracts` (shared with the solver).

## Frontend

- `build-contract.ts`: `providers` gains `paused`; `parseConversation` reads `challenge`.
- `conversation-harness.tsx`: background solver in a Worker (`browser-check.worker.ts`), the `Checking your browser…` status, the `paused` and `limit` states, `Retry-After` countdown copy, `[ Sign out ]`.
- `main.tsx` `OperatorPage`: the `Guardrails` panel (state, spend, counts, locks, last alerts, pause/resume button with inline confirmation).
- `browser/conversation.mjs` adds: the check is solved before the first POST and the POST carries it; a tampered `number` is refused `challenge_invalid` and the harness shows the manual path; paused fixture; cap-refusal copy.

## Testing strategy

Mounted API tests on the fake transport for every refusal before the provider (`server.test.ts`, `conversation.test.ts`); store tests for 009 forward and down, the conditional upsert under two connections, the lock windows, the open-pause index and the alert dedupe (`store.test.ts`, a new `guardrail-store.test.ts`); pure tests for the challenge mint/verify pair and the solver (`browser-check.test.ts` in contracts and be-01); the PII canary test; the browser regression. Every safety check has a watched negative named in `tasks.md`.

## Superseded spec lines

In the unarchived `build-ai-chat-harness/specs/anonymous-conversation/spec.md`: "Rate-limited routes SHALL count one-minute windows per hashed source (and per claim on `/conversation/stream`) under a larger global backstop" is widened by `request-windows` (every route, plus `Retry-After`); "When the provider is disabled and demo mode is off, `GET /conversation` SHALL report `provider: 'disabled'`" gains the `paused` value from `inference-pause`. Neither file is edited in place; archiving this change supersedes them.

## Risks / Trade-offs

- The browser check is a cost multiplier, not a gate: a GPU solver pays it for nothing. The ceilings and the pause are the gate; the check only prices out the lazy script. Accepted (ADR 0040).
- A pause stops paid replies for every visitor until a human resumes. That is the point, and the state is visible with the manual path beside it.
- Daily site caps on proposals can be used to block real submissions for a day. Bounded, visible, alerted at 50%, and far above real traffic.
- Minute windows are not durable. One doubled minute during a swap, by design (D1).
- `@noble/hashes` is a new dependency in `@website/contracts`. Audited, zero dependencies, MIT; the alternative was a hand-written SHA-256 in the domain library.
- The webhook is a single attempt. The row is the record; the operator page shows failures. A retry queue was rejected as a second system to prove.
- Solve times are estimates until measured in slice 5.

## Migration Plan

1. Store slices (1–2) ship `009_guardrails`; the API applies it at startup; `down.sql` is tested.
2. API slices (3–7) ship behind no flag: windows, caps and the lockout are always on; the browser check applies only to the paid provider; the pause starts closed; alerts record without a webhook.
3. Frontend slices render the new states; the browser regression runs on the fixture stack.
4. Private: Home form copy for the cap refusals, `GUARDRAIL_WEBHOOK_URL` in `runtime.env`, the recovery list learns 009, a receipt in `dev-preview.md`.
5. Activation (the existing runbook) proceeds only after slices 1–8 are deployed to preview; the bounded smoke adds: one browser check solved, one forced pause and resume on preview, one alert received on Dany's phone.

## Open Questions

- Dany confirms the ntfy receiver (or names another webhook target) and the 80% pause threshold.
- Whether the private site should name the browser check on the privacy page as a courtesy sentence.
