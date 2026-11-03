# Build runtime setup

The Build experience is the claim-bound conversation harness: React, the AI SDK UI message stream, the existing Bun API and OpenRouter. There is no prospect sign-in ([ADR 0039](../adr/0039-anonymous-paid-chat-bound-to-the-browser-claim.md), [retire-prospect-sign-in](../../openspec/changes/retire-prospect-sign-in/proposal.md)). The [change contract](../../openspec/changes/build-ai-chat-harness/design.md) owns behavior, implementation and verification; this page owns deployment configuration.

## OpenRouter

The [provider candidate and activation checks](provider-activation.md) record the current proposed model, exact endpoint and listed rates. They are not live billing or eligibility evidence.

Runtime settings remain `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENROUTER_PROVIDER`, `OPENROUTER_INPUT_USD_PER_MILLION`, `OPENROUTER_OUTPUT_USD_PER_MILLION`, `OPENROUTER_PRIVACY_VERIFIED` and `OPENROUTER_ENABLED`, plus `TRUSTED_PROXY_HOPS` for the anonymous conversation and the optional `OPENROUTER_REASONING_EFFORT` and `OPENROUTER_MAX_COMPLETION_TOKENS` for a reasoning model (see [GPT-6 Luna on `azure/eu`](provider-activation.md#gpt-6-luna-on-azureeu-2026-10-06)). The API refuses to start while any `OIDC_*` setting is present, even an empty one (`OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI` were the prospect sign-in settings); remove them from the runtime file. The check reads the whole process environment, so a process co-hosted with the API must not export `OIDC_*` either. Use a dedicated capped key and explicitly verified model/provider/prices. Never infer a free or zero price from missing configuration. The provider policy remains pinned routing, zero data retention and denied data collection. A reply whose final usage is unknown (Stop, disconnect, timeout, provider error, restart, or refusal without valid reported usage) is conservatively settled at its full reservation using verified applicable pricing, and the conversation stays open; see the [Build AI chat harness design](../../openspec/changes/build-ai-chat-harness/design.md).

Paid readiness also requires `OPENROUTER_INPUT_CEILING_USD_PER_MILLION` and `OPENROUTER_OUTPUT_CEILING_USD_PER_MILLION`: independently verified maximum effective rates covering cache writes, cache reads and all applicable pricing tiers. They must be finite, positive and at least the corresponding base rate. Missing ceilings leave even a previously enabled installation unconfigured: no new paid calls, with saved briefs and manual submission available. Malformed values throw at configuration loading. Set these nonsecret activation inputs from current endpoint evidence before enabling a deployment; there are no default multipliers or prices.

Base rates still constrain `provider.max_price` and supply the conservative token floor; that routing filter does not cap cache surcharges. Reservations use the effective ceilings, the serialized input bound and full completion cap. Known settlement uses the greater of the safe rounded token estimate and validated provider `usage.cost`, with reasoning included in completion once. Missing/malformed charge retains the complete reservation through the existing unknown-operation path, even when token counts are present. Explicit zero charge is valid; a nonzero token floor still applies. Above-reservation charges are recorded without clamping and remain visible to the existing spending/pause controls.

Do not enable the paid provider until the selected model/provider policy, final usage and cancellation tests pass. A local fixture can prove transport behavior but cannot prove a real provider accepts the selected routing policy or price. A real smoke must check the actual account debit and persisted conversation.

## Activation evidence

Before claiming live AI, record:

- Exact deployed public/private source and container image receipts.
- Home submission, the claim-bound conversation and its first message surviving reload.
- Foreign origin/claim refusal, expired request recovery and API failure feedback.
- Successful streamed reply, durable history, duplicate retry without a second call, and Stop cancelling generation.
- Provider usage/debit and the full-reservation settlement of unknown usage.
- Desktop/mobile chat, brief and explicit proposal conversion.

Missing credentials are an activation dependency, not evidence of working inference. Keep unavailable states visible until real checks are recorded.

## Preview activation sequence

The preview Compose file explicitly sets `DEMO_AUTH=0` and `OPENROUTER_ENABLED=0`. Its `environment` entries override the protected `env_file`: adding `OPENROUTER_ENABLED=1` to `runtime/runtime.env` alone will not enable inference. Keep the base release disabled and retain a separate reviewed activation configuration with the release receipts.

The enable override contains only this switch; the steps that apply it are in [Anonymous conversation activation](#anonymous-conversation-activation):

```yaml
services:
  api:
    environment:
      OPENROUTER_ENABLED: '1'
```

Configuration-only proof on 2026-09-29: with a synthetic env file containing `OPENROUTER_ENABLED=1`, `docker compose -f deploy/website/dev/compose.yml config --format json` still resolved the API flag to `0`. Adding the override above resolved it to `1`; both configurations retained `DEMO_AUTH=0`. No service was started and no live setting was changed by this proof. The deployed runtime still contains only its operator credential, so the key, provider-check and smoke steps of the then sequence remained pending at that time.

## Anonymous conversation activation

The [Build AI chat harness](../../openspec/changes/build-ai-chat-harness/design.md) answers visitors without sign-in, bound to the browser draft claim under the conversation allowance (8 visitor turns, a default 400 completion tokens per reply, $0.15 per conversation, $0.30 and three conversations per source per UTC day, $10 per site day). The host-side commands, the Compose override file and the receipts live in the private companion: `puni-pr-00` `deploy/website/dev/README.md`, section "Activating AI chat" (puni-pr-00 PR #19). This page states the order and the gates; it never holds a key. The evaluated host configuration sets `OPENROUTER_MAX_COMPLETION_TOKENS=700`, including reasoning; record that configured cap separately from the default. The Compose steps below describe the earlier preview procedure; applying the same gates to the current k3s release belongs to private release integration, not this synthetic evaluation.

1. **Key.** Preserve the existing dedicated website OpenRouter key at USD50 per month; do not raise its cap or recreate it at USD100. Record the currently evaluated model, exact provider, rates and verified account controls in the receipt; configured request routing does not prove account allowlists or privacy settings. The key stays in the mode-0600 runtime file (`/home/puni1/puni-site-dev/runtime/runtime.env` on preview), never into Git, chat, a shell history or a screenshot.
2. **Nonsecret settings.** Add `OPENROUTER_MODEL`, `OPENROUTER_PROVIDER`, both base rates and both effective-rate ceilings re-read from the [endpoint catalog](provider-activation.md) that day to the same file; catalog research is not proof of account eligibility or successful paid accounting. `OPENROUTER_PRIVACY_VERIFIED` stays `0` until step 5.
3. **Source identification.** The API environment carries `TRUSTED_PROXY_HOPS=1` behind the gateway; the API refuses to start on an `https` app origin without it and refuses a request missing the forwarded hop. Sources are salted hashes of the client address (an IPv6 address by its /64), with a per-UTC-day salt shared through the database and deleted after a day.
4. **Evaluation corpus.** Use a clean, committed, task-owned h2puni checkout; never the live source tree or a shared gate checkout. The corpus in `apps/website/be-01/eval/sales-corpus.json` preserves twelve legacy scenarios and adds twenty-four scoping scenarios. Thirty-four are eligible for real-provider evaluation; truncation and provider refusal are two scripted transport-only cases. The former direct `eval-cli.ts` command refuses paid use. Run the bounded host entry with the existing protected host-local runtime file:

   ```sh
   bun apps/website/be-01/src/conversation/eval-host.ts pilot /home/puni1/puni-site-dev/runtime/runtime.env
   # Review the complete synthetic pilot conversations and receipt before proceeding.
   bun apps/website/be-01/src/conversation/eval-host.ts full /home/puni1/puni-site-dev/runtime/runtime.env
   ```

   The runner parses only allowlisted provider assignments as text, checks the unchanged USD50/month key cap and remaining allowance, and verifies the pinned endpoint, base rates, complete cache/tier pricing and strict routing. It derives and records the conservative effective ceilings in memory for the synthetic API without modifying the runtime file. Never copy the credential, source the runtime file as shell code, or raise the cap. Pilot and full-run ceilings are USD0.05 and USD0.50 respectively; these are bounds, not measured spend. Full mode requires a passing pilot for the same code SHA. The mounted loopback API uses synthetic visitors and an in-memory store, with no live prospect content, submission, email or deployment changes.

   Complete visible transcripts stay in the checkout's ignored `.superpowers/evaluation-private/` directory (0700, files 0600); shared output contains scenario assertions and usage/cost metadata only. Review them privately against understanding, useful judgment, non-repetition, honest uncertainty and helpful handoff. Distinguish agent assessment from human approval and client conversion. Record non-content aggregates, code/prompt identities, reported versus reserved usage/cost, latency and evidence limits in the change's `verify.md`. Reasoning is a subset of completion billing; missing usage or charge retains a conservative ceiling. Keep the base-rate estimate, provider-reported charge and conservative accounted spend distinct. Account spend deltas may include concurrent usage. **Any safety or protocol failure stops paid progression and blocks activation**; diagnose it before a bounded, justified rerun. Synthetic h2 evidence does not establish the deployed h4 key identity or account privacy settings.

5. **Privacy gate.** Verify the actual selected provider and the deployed key/account privacy settings before setting `OPENROUTER_PRIVACY_VERIFIED=1`. The privacy notice must name OpenRouter, Inc. and Microsoft Azure OpenAI Service and match verified processing, retention and transfer facts. A selected Azure EU endpoint does not prove that every processing step occurs in the EU. Synthetic h2 evidence does not identify the h4 runtime key or establish its account settings; missing deployment evidence or inaccurate notice wording blocks activation.
6. **Enable.** Apply the reviewed Compose override that contains only `OPENROUTER_ENABLED: '1'` (the private runbook names the file), validate the merged configuration with `docker compose ... config --quiet` and recreate the API with the same release Compose file, images, runtime file and database. Retain the exact override and runtime change receipt outside Git; never print expanded configuration containing credentials.
7. **Bounded smoke.** Run the checks in [Activation evidence](#activation-evidence) with one conversation to handoff on the live preview: a streamed reply, final usage, the account debit on OpenRouter, a replay of the same key without a second charge, Stop with its operation settled at the reserved ceiling and the conversation still usable, and a proposal submission. Inspect the provider-side debit and the durable operation/usage record; a successful reply alone does not prove accounting, and a settled amount is never edited to make another request succeed. Record the evidence in `verify.md` and the private receipt without copying conversation text or credentials.
8. **Disable.** Recreate the API from the base Compose configuration without the override, keeping the same database and runtime file. `GET /conversation` reports `disabled`, saved conversations stay readable, the manual brief and manual conversion keep working, and all services remain healthy.

Locally, `DEMO_AUTH=1` answers the anonymous conversation with canned replies labelled **Simulated** and reserves nothing; `apps/website/fe-01/browser/conversation-api.mjs` serves a scripted OpenRouter stream through the real admission, cancel and settlement code for the browser regression. Neither proves the real provider.

## Guardrails

The [abuse guardrails design](../../openspec/changes/website-abuse-guardrails/design.md) owns the threat model, the numbers and their rationale; this section owns operating them. All of them are always on; none needs a flag.

- **Request windows.** Every route but `GET /health` passes a general window of 120 requests per source and 3,000 across the site per minute; the write routes keep their 30/300 per-path windows. A refusal is `429 rate_limited` with `Retry-After`. The windows live in process memory, so a restart or a blue/green overlap can allow one extra minute; nothing to operate.
- **Daily caps.** Per UTC day: 20 drafts per source and 2,000 per site; 5 proposal requests per source, 3 per email (salted) and 200 per site. A refusal is `429` with its code (`draft_source_limit`, `draft_site_limit`, `proposal_source_limit`, `proposal_email_limit`, `proposal_site_limit`) and `Retry-After` to UTC midnight; nothing is stored. The counts are rows in `admission_count` and reset at UTC midnight.
- **Operator login lockout.** Five failures from one source in 15 minutes lock that source for 15 minutes; twenty failures on the account in an hour lock the account for an hour and raise `operator_locked`. A locked login is `429 login_locked` with `Retry-After` and costs no password check. Existing operator sessions keep working, so an operator already signed in can still pause and resume.
- **Browser check.** The first paid reply of each conversation needs a solved proof-of-work challenge from `GET /conversation` ([ADR 0040](../adr/0040-bot-deterrence-is-a-self-hosted-proof-of-work.md)). Build solves it in a Web Worker before the visitor presses Send; it costs about 0.2 to 0.8 s normally and 0.6 to 2.7 s once half the day's ceiling is spent (measured in Chrome, see the change's `verify.md`). The manual brief never needs it.
- **Inference pause.** When a reservation brings the site's UTC-day spend to 80% of the $10 ceiling, paid inference pauses: Build shows `AI chat is paused right now` with the manual path, and paid streams answer `503 provider_paused`. The automatic pause opens at most once per UTC day and never clears by itself, not at midnight and not on restart. To resume, sign in at `/operator`, open the Guardrails panel above the inbox and press `Resume AI chat`, then confirm. After a resume the day runs to the hard ceiling; the next day's spend can pause again. `Pause AI chat` in the same panel pauses by hand.

### Reading the operator panels

- `Today's spend` is the UTC day's recorded site spend against the $10 ceiling: settled amounts, plus the reservations of calls still in flight. It never under-counts.
- `In flight now` is the paid calls admitted today (UTC admission day) and not yet settled, and the reservation they hold; a call admitted before midnight is not listed after it. A call normally settles within the 30-second deadline. One that stays here longer is a stuck reservation: restart the API with only one replica running (the k3s Deployment uses `Recreate`), because startup settles every in-flight call in the database at its full reservation, including another live process's, so the line returns to `None` and `Today's spend` does not change.
- `Ceiling-settled today` is how far `Today's spend` may over-count: calls whose usage never arrived (Stop, disconnect, timeout, stream error, restart) were recorded at their full reservation. There is no reconciliation ([batch 10 decision D3](../../openspec/changes/website-funnel-counts/proposal.md)).
- The Funnel's `Spend` column is the same daily figure for each of the last 30 UTC days, so a trend in spend sits beside the drafts, briefs and proposals it bought.

What each operator question maps to:

| Situation                       | Where it shows                                                                                          | What to do                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Provider unavailable or failing | `provider_failures` alert (5 in 10 minutes); failed calls appear under `Ceiling-settled today`          | Pause AI chat; the manual brief and the Build proposal card keep working. Resume when it recovers. |
| A spend cap is reached          | `site_spend_half` at 50%; the automatic pause and `inference_paused` at 80%; Funnel `Exhausted` reasons | Nothing for per-conversation and per-source caps; for the site pause, resume or wait for tomorrow. |
| A noisy source                  | `rate_limited` and `refusals` alerts; `draft_cap_*` and `proposal_cap_*` alerts                         | The windows and caps already refuse it; pause AI chat if paid calls are the target.                |
| A stuck reservation             | `In flight now` stays above `None`                                                                      | Restart the API; spend is unchanged.                                                               |
| Kill switch                     | `Pause AI chat` / `Resume AI chat`                                                                      | Pausing stops new paid calls only; manual proposals and the Build card still submit.               |

Not shown, by design: per-visitor spend (sources are salted daily hashes and the funnel is anonymous), stored counts of individual refusals (paused, busy, browser check, request windows and cap refusals store nothing; their floods raise the alerts above), and a durable provider-failure count (the alert is the signal).

### Alert webhook

Alerts (`site_spend_half`, `inference_paused`, `operator_locked`, `draft_cap_half`, `draft_cap_full`, `proposal_cap_half`, `proposal_cap_full`, `provider_failures`, `refusals`, `rate_limited`) are rows in `guardrail_alert` first; the operator panel lists the last 50 with their delivery. They carry counts, kinds, UTC days and micro-USD only, never an address, hash, email or message text.

`GUARDRAIL_WEBHOOK_URL` is optional and must be `https`; any other value stops the API at startup. When set, each new alert is one `POST` with a `text/plain` body and a `Title` header, given 10 seconds, recorded as `sent` or `failed` and never retried. When unset, alerts are `recorded` only. Startup prints `guardrail alerts: webhook set` or `unset`, never the URL.

The intended receiver is [ntfy](https://ntfy.sh): install the ntfy app, subscribe to a new topic with a random name of at least 32 characters (the name is the only secret), and put `GUARDRAIL_WEBHOOK_URL=https://ntfy.sh/<topic>` in the protected `runtime.env` beside the other secrets. A self-hosted ntfy works the same way. Check delivery after a restart by pausing and resuming once from the operator panel: the phone receives `inference_paused` and the panel shows it as `sent`.

### Activation smoke additions

The bounded preview smoke in [Anonymous conversation activation](#anonymous-conversation-activation) adds three checks: one browser check solved in a real browser before the first reply, one forced pause and resume from the operator panel (Build shows the paused state in between), and one alert received on the phone.

### On k3s

Recorded for `website-on-k3s`, not built here (design D7): a Traefik `RateLimit` middleware on the website Ingress (average 50 requests per second per client address, burst 100), and a `/metrics` endpoint with a cluster-internal `ServiceMonitor` exposing the pause, spend, cap, lock and refusal counters to the platform Alertmanager.

## Funnel

The operator page shows a Funnel panel below Guardrails: per UTC day for the last 30 days, the drafts, started conversations, captured briefs, exhausted conversations by reason, proposal requests split into manual and from-chat, and ceiling-settled operations, with the from-chat share of the window's proposal requests. Every figure is a count over rows the funnel already stores (`GET /operator/funnel`, operator session only, counts only); no analytics script or beacon runs in the browser, and a conversion is a `proposal_submission` row. Exhaustions count on the conversation's first day, and days whose drafts were erased by [draft retention](draft-retention.md) undercount drafts, conversations and briefs. The Guardrails panel's [`Ceiling-settled today`](#reading-the-operator-panels) line bounds the spend over-count. The counting rules are in the [website-funnel-counts design](../../openspec/changes/website-funnel-counts/design.md).

## Browser request recovery

Version-1 chat and manual review share an editor. It stores unsent brief body, references,
email and saved-field baselines in tab-scoped `sessionStorage`, keyed by the claim's CSRF
identity. These fields do not cause inference or proposal submission. The cache uses the authoritative draft access deadline returned by the API, keeps it
across reloads, removes expired entries when read, and is cleared on explicit
draft discard, successful submission/recovery or changing claims in that tab. There is no
background browser deletion job. A fresh tab without a cache loads the canonical brief and
separate references from the server. Missing version-1 expiry metadata and denied browser storage are visible recovery limitations;
the in-memory review and explicit submission remain available. Anonymous access expiry is
not proof that server or provider content has been deleted.

The final preview composes brief and references once. New proposal requests explicitly send
`version: 1`, preserving raw reviewed bytes and a versioned idempotency hash; stored pending
recovery forwards the same version. Legacy pending requests omit the version and retain
trimmed brief/hash semantics. The receipt confirms a saved request, with the destination
email and next review step; it makes no automatic email-delivery or response-time promise.
The private site's privacy integration and analytics remain separate release work.
