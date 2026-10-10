# Build runtime setup

The approved Build experience uses assistant-ui, AI SDK, the existing Bun API and OpenRouter. Google is the first sign-in provider. The [change contract](../../openspec/changes/assistant-ui-build/design.md) owns behavior; this page owns deployment configuration. Implementation and verification are tracked in that change's tasks and verify files.

## Google

Create a Google OAuth client of type Web application in the PUNI Google Cloud project. Brand the consent screen PUNI and request only `openid email`. Register exact redirect URIs:

| Environment       | Redirect URI                                     |
| ----------------- | ------------------------------------------------ |
| Preview           | `https://dev.puni.dev/api/session/oidc/callback` |
| Production        | `https://api.puni.dev/session/oidc/callback`     |
| Local integration | `http://localhost:3101/session/oidc/callback`    |

Use separate preview/production clients when available. Store `OIDC_ISSUER=https://accounts.google.com`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` and the environment's `OIDC_REDIRECT_URI` only in the host's protected runtime environment. Do not put the secret in a Vite/Astro public variable, shell command history, Git or a screenshot. The preview runtime file is `/home/puni1/puni-site-dev/runtime/runtime.env` with mode 0600.

Google requires the redirect URI to exactly match the registered value. Its server flow exchanges the authorization code for an ID token, which the API validates before creating a PUNI session. [Google OpenID Connect documentation](https://developers.google.com/identity/openid-connect/openid-connect).

The gateway strips preview's `/api` prefix before forwarding the callback. The browser's HttpOnly draft and session cookies remain host-only on `dev.puni.dev`; the app on `dev.app.puni.dev` accesses the API with credentials and an exact allowed Origin. App static requests must not forward those credentials. The API requires outbound HTTPS access to Google's discovery, token and key endpoints.

## OpenRouter

The [provider candidate and activation checks](provider-activation.md) record the current proposed model, exact endpoint and listed rates. They are not live billing or eligibility evidence.

Runtime settings remain `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENROUTER_PROVIDER`, `OPENROUTER_INPUT_USD_PER_MILLION`, `OPENROUTER_OUTPUT_USD_PER_MILLION`, `OPENROUTER_PRIVACY_VERIFIED` and `OPENROUTER_ENABLED`, plus `TRUSTED_PROXY_HOPS` for the anonymous conversation and the optional `OPENROUTER_REASONING_EFFORT` and `OPENROUTER_MAX_COMPLETION_TOKENS` for a reasoning model (see [GPT-6 Luna on `azure/eu`](provider-activation.md#gpt-6-luna-on-azureeu-2026-10-06)). Use a dedicated capped key and explicitly verified model/provider/prices. Never infer a free or zero price from missing configuration. The provider policy remains pinned routing, zero data retention and denied data collection. On the signed-in account path, missing final usage retains the reservation and holds the request. On the anonymous conversation, a reply whose final usage is unknown (Stop, disconnect, timeout, provider error, restart) is settled at its full reservation, which can only over-count, and the conversation stays open; see the [Build AI chat harness design](../../openspec/changes/build-ai-chat-harness/design.md).

The existing pilot limits are 12 user turns per request, $0.50 per request, $1 per account per UTC day and $10 across the site per UTC day. Admission counts outstanding reservations toward those limits and permits at most one unsettled call per account and four across the site. These limits are enforced by the API/store, independently of the visible remaining-turn counter.

Do not enable the paid provider until the selected model/provider policy, final usage and cancellation tests pass. A local fixture can prove transport behavior but cannot prove a real provider accepts the selected routing policy or price. A real smoke must check the actual account debit and persisted conversation.

## Activation evidence

Before claiming live Google/AI, record:

- Exact deployed public/private source and container image receipts.
- Home submission, Google return, owned request and first message surviving reload.
- Foreign origin/account refusal, expired request recovery and API failure feedback.
- Successful streamed reply, durable history, duplicate retry without a second call, and Stop cancelling generation.
- Provider usage/debit and retained reservation for unknown usage.
- Desktop/mobile chat, brief, preview and explicit proposal conversion.

Missing credentials are an activation dependency, not evidence of a working login. Keep unavailable states visible until real checks are recorded.

## Preview activation sequence

The preview Compose file explicitly sets `DEMO_AUTH=0` and `OPENROUTER_ENABLED=0`. Its `environment` entries override the protected `env_file`: adding `OPENROUTER_ENABLED=1` to `runtime/runtime.env` alone will not enable inference. Keep the base release disabled and retain a separate reviewed activation configuration with the release receipts.

1. Provision a PUNI Google **Web application** client and register the preview callback above. Add its four OIDC settings to the existing mode-0600 runtime file without replacing the operator credential. Recreate the API with the existing release's immutable images and runtime/data paths. An API restart alone does not reload a Compose env file.
2. With inference still disabled, verify a real browser's Home submission, Google return, verified identity, owned request and reload. Keep the manual brief available if Google rejects or the user cancels sign-in. Record this result before activating paid calls.
3. Create a dedicated OpenRouter key with a $100 monthly ceiling, model/provider restrictions and the required privacy settings. Verify current endpoint compatibility, prices and processor wording. Store the key and approved nonsecret model/provider/rate settings in the protected file. Catalog research is not proof of account eligibility or successful paid accounting.
4. After those checks, an operator may apply a separate Compose override containing only the following enable switch. Use the same release Compose file, image IDs, runtime file and database path; validate the merged configuration with `docker compose ... config --quiet`, then recreate the API. Retain the exact override and runtime change receipt outside Git; never print expanded configuration containing credentials.

   ```yaml
   services:
     api:
       environment:
         OPENROUTER_ENABLED: '1'
   ```

5. Run the bounded real-provider checks in **Activation evidence** above. Inspect provider-side debit and the durable operation/usage record without copying request content or credentials into logs. A successful reply alone does not prove accounting. Keep unknown usage held for investigation; do not clear its reservation to make another request succeed.
6. To disable inference, recreate the API using the base Compose configuration without the enable override. Retain the same database and runtime file so saved requests and manual conversion remain available. Confirm provider readiness is unavailable and all services remain healthy.

Configuration-only proof on 2026-09-29: with a synthetic env file containing `OPENROUTER_ENABLED=1`, `docker compose -f deploy/website/dev/compose.yml config --format json` still resolved the API flag to `0`. Adding the override above resolved it to `1`; both configurations retained `DEMO_AUTH=0`. No service was started and no live setting was changed by this proof. The deployed runtime still contains only its operator credential, so steps 1–5 remain pending.

## Anonymous conversation activation

The [Build AI chat harness](../../openspec/changes/build-ai-chat-harness/design.md) answers visitors without sign-in, bound to the browser draft claim under the conversation allowance (8 visitor turns, 400 completion tokens per reply, $0.15 per conversation, $0.30 and three conversations per source per UTC day, $10 per site day shared with the account path). The host-side commands, the Compose override file and the receipts live in the private companion: `puni-pr-00` `deploy/website/dev/README.md`, section "Activating AI chat" (puni-pr-00 PR #19). This page states the order and the gates; it never holds a key.

1. **Key.** Dany creates a dedicated OpenRouter key with a $100 monthly limit, the model allowlist `openai/gpt-4.1-mini`, the provider allowlist `azure/swedencentral` and zero data retention. The key goes straight into the mode-0600 runtime file (`/home/puni1/puni-site-dev/runtime/runtime.env` on preview), never into Git, chat, a shell history or a screenshot.
2. **Nonsecret settings.** Add `OPENROUTER_MODEL`, `OPENROUTER_PROVIDER` and both rates re-read from the [endpoint catalog](provider-activation.md) that day to the same file. `OPENROUTER_PRIVACY_VERIFIED` stays `0` until step 5.
3. **Source identification.** The API environment carries `TRUSTED_PROXY_HOPS=1` behind the gateway; the API refuses to start on an `https` app origin without it and refuses a request missing the forwarded hop. Sources are salted hashes of the client address (an IPv6 address by its /64), with a per-UTC-day salt shared through the database and deleted after a day.
4. **Evaluation corpus.** On h2puni, against a loopback API with the real key, run `bun apps/website/be-01/src/conversation/eval-cli.ts`. It drives the twelve scripts in `apps/website/be-01/eval/sales-corpus.json` through `POST /conversation/stream` and prints pass/fail and token totals only (`--show` prints transcripts locally and is never used on a shared terminal). Record the totals in the change's `verify.md`. **Any failed assertion blocks activation**; fix the prompt and rerun.
5. **Privacy gate.** Verify a real response's provider identifier and the key's privacy settings, then set `OPENROUTER_PRIVACY_VERIFIED=1`. The privacy page must name OpenRouter, Inc. and Microsoft Azure OpenAI Service (Sweden Central) as processors before the next step; missing wording blocks activation.
6. **Enable.** Apply the reviewed Compose override that contains only `OPENROUTER_ENABLED: '1'` (the private runbook names the file), validate the merged configuration with `docker compose ... config --quiet` and recreate the API with the same images, runtime file and database.
7. **Bounded smoke.** One conversation to handoff on the live preview: a streamed reply, final usage, the account debit on OpenRouter, a replay of the same key without a second charge, Stop with its operation settled at the reserved ceiling and the conversation still usable, and a proposal submission. Record the evidence in `verify.md` and the private receipt without copying conversation text or credentials.
8. **Disable.** Recreate the API without the override. `GET /conversation` reports `disabled`, saved conversations stay readable and the manual brief keeps working.

Locally, `DEMO_AUTH=1` answers the anonymous conversation with canned replies labelled **Simulated** and reserves nothing; `apps/website/fe-01/browser/conversation-api.mjs` serves a scripted OpenRouter stream through the real admission, cancel and settlement code for the browser regression. Neither proves the real provider.

## Guardrails

The [abuse guardrails design](../../openspec/changes/website-abuse-guardrails/design.md) owns the threat model, the numbers and their rationale; this section owns operating them. All of them are always on; none needs a flag.

- **Request windows.** Every route but `GET /health` passes a general window of 120 requests per source and 3,000 across the site per minute; the write routes and both OIDC routes keep their 30/300 per-path windows. A refusal is `429 rate_limited` with `Retry-After`. The windows live in process memory, so a restart or a blue/green overlap can allow one extra minute; nothing to operate.
- **Daily caps.** Per UTC day: 20 drafts per source and 2,000 per site; 5 proposal requests per source, 3 per email (salted) and 200 per site. A refusal is `429` with its code (`draft_source_limit`, `draft_site_limit`, `proposal_source_limit`, `proposal_email_limit`, `proposal_site_limit`) and `Retry-After` to UTC midnight; nothing is stored. The counts are rows in `admission_count` and reset at UTC midnight.
- **Operator login lockout.** Five failures from one source in 15 minutes lock that source for 15 minutes; twenty failures on the account in an hour lock the account for an hour and raise `operator_locked`. A locked login is `429 login_locked` with `Retry-After` and costs no password check. Existing operator sessions keep working, so an operator already signed in can still pause and resume.
- **Browser check.** The first paid reply of each conversation needs a solved proof-of-work challenge from `GET /conversation` ([ADR 0040](../adr/0040-bot-deterrence-is-a-self-hosted-proof-of-work.md)). Build solves it in a Web Worker before the visitor presses Send; it costs about 0.2 to 0.8 s normally and 0.6 to 2.7 s once half the day's ceiling is spent (measured in Chrome, see the change's `verify.md`). The manual brief never needs it.
- **Inference pause.** When a reservation brings the site's UTC-day spend to 80% of the $10 ceiling, paid inference pauses: Build shows `AI chat is paused right now` with the manual path, and paid streams answer `503 provider_paused`. The automatic pause opens at most once per UTC day and never clears by itself, not at midnight and not on restart. To resume, sign in at `/operator`, open the Guardrails panel above the inbox and press `Resume AI chat`, then confirm. After a resume the day runs to the hard ceiling; the next day's spend can pause again. `Pause AI chat` in the same panel pauses by hand.

### Alert webhook

Alerts (`site_spend_half`, `inference_paused`, `operator_locked`, `draft_cap_half`, `draft_cap_full`, `proposal_cap_half`, `proposal_cap_full`, `provider_failures`, `refusals`, `rate_limited`) are rows in `guardrail_alert` first; the operator panel lists the last 50 with their delivery. They carry counts, kinds, UTC days and micro-USD only, never an address, hash, email or message text.

`GUARDRAIL_WEBHOOK_URL` is optional and must be `https`; any other value stops the API at startup. When set, each new alert is one `POST` with a `text/plain` body and a `Title` header, given 10 seconds, recorded as `sent` or `failed` and never retried. When unset, alerts are `recorded` only. Startup prints `guardrail alerts: webhook set` or `unset`, never the URL.

The intended receiver is [ntfy](https://ntfy.sh): install the ntfy app, subscribe to a new topic with a random name of at least 32 characters (the name is the only secret), and put `GUARDRAIL_WEBHOOK_URL=https://ntfy.sh/<topic>` in the protected `runtime.env` beside the other secrets. A self-hosted ntfy works the same way. Check delivery after a restart by pausing and resuming once from the operator panel: the phone receives `inference_paused` and the panel shows it as `sent`.

### Activation smoke additions

The bounded preview smoke in [Anonymous conversation activation](#anonymous-conversation-activation) adds three checks: one browser check solved in a real browser before the first reply, one forced pause and resume from the operator panel (Build shows the paused state in between), and one alert received on the phone.

### On k3s

Recorded for `website-on-k3s`, not built here (design D7): a Traefik `RateLimit` middleware on the website Ingress (average 50 requests per second per client address, burst 100), and a `/metrics` endpoint with a cluster-internal `ServiceMonitor` exposing the pause, spend, cap, lock and refusal counters to the platform Alertmanager.

## Funnel

The operator page shows a Funnel panel below Guardrails: per UTC day for the last 30 days, the drafts, started conversations, captured briefs, exhausted conversations by reason, proposal requests split into manual and from-chat, and ceiling-settled operations, with the from-chat share of the window's proposal requests. Every figure is a count over rows the funnel already stores (`GET /operator/funnel`, operator session only, counts only); no analytics script or beacon runs in the browser, and a conversion is a `proposal_submission` row. Exhaustions count on the conversation's first day, and days whose drafts were erased by [draft retention](draft-retention.md) undercount drafts, conversations and briefs. The Guardrails panel's `Ceiling-settled today` line is how far today's spend may over-count: operations whose usage never arrived were settled at their full reservation. The counting rules are in the [website-funnel-counts design](../../openspec/changes/website-funnel-counts/design.md).
