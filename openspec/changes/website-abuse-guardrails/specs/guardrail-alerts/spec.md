## ADDED Requirements

### Requirement: Alerts are rows first, then an optional webhook

Every alert SHALL be inserted into `guardrail_alert` with a unique `dedupe_key` before any delivery attempt; a duplicate key SHALL write and send nothing. When `GUARDRAIL_WEBHOOK_URL` is set, the API SHALL make one `POST` with a `text/plain` body and a `Title` header within a 10-second deadline and record `delivery` as `sent` or `failed` with `delivered_at`; when unset it SHALL record `recorded`. Delivery failure SHALL NOT fail the request that raised the alert. A non-`https` URL SHALL throw at startup. Startup SHALL print whether the webhook is set, never the URL.

#### Scenario: Webhook unset

- **WHEN** a pause opens with no webhook configured
- **THEN** the alert row has `delivery = 'recorded'` and no outbound request is made

#### Scenario: Webhook fails

- **WHEN** the fake webhook answers 500
- **THEN** the alert row has `delivery = 'failed'`, the visitor's request completes with its own typed answer, and the operator overview lists the failed alert

#### Scenario: Deduplicated

- **WHEN** the site spend crosses 50% twice in one UTC day because of a resumed pause
- **THEN** exactly one `site_spend_half` row exists for that day and the webhook received one message

### Requirement: Thresholds and in-memory flood counters

The API SHALL raise: `site_spend_half` when the site's UTC-day spend crosses 50% of the ceiling; `inference_paused` when a pause opens; `operator_locked` when the account lock opens; `draft_cap_half` and `draft_cap_full` at 1,000 and 2,000 site drafts; `proposal_cap_half` and `proposal_cap_full` at 100 and 200 site proposals; `provider_failures` when 5 provider failures (5xx, timeout, non-refusal stream error) occur within 10 minutes, deduplicated per UTC hour; `refusals` when 10 declined completions occur in a UTC day; `rate_limited` when 500 window or lock refusals occur within 60 minutes, deduplicated per UTC hour. Flood counts (`provider_failures`, `rate_limited`) SHALL be held in memory and SHALL write a row only on crossing the threshold.

#### Scenario: Provider failures

- **WHEN** the fake provider answers 502 five times within ten minutes
- **THEN** one `provider_failures` alert exists for that hour and a sixth failure writes no second row

#### Scenario: Rate-limit flood writes one row

- **WHEN** 500 requests are refused by windows within an hour
- **THEN** exactly one `rate_limited` row exists and no row was written per refusal

### Requirement: No personal data in alerts

Alert `detail` and webhook bodies SHALL contain only kinds, counts, UTC days or hours and micro-USD amounts. They SHALL NOT contain client addresses, source hashes, emails, claim material or any visitor or model text.

#### Scenario: Canary never appears

- **WHEN** a conversation containing a canary phrase, a proposal with a canary email and requests from a fixed address drive every alert kind
- **THEN** no `guardrail_alert.detail` and no fake-webhook body contains the phrase, the email, the address, its source hash or the claim
