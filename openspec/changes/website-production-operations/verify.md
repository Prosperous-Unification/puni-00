# Verification

## Initial live inventory, 2026-11-09 UTC

Current public/private/fleet working checkouts were clean. Public HEAD 39c913718; private 1226f76; fleet 10f85c7. This work starts in isolated public branch feat/website-prod-20261109.

SSH to root@h4 and puni1@h2puni succeeded. k3s shows website-dev with one Ready API/app/site each, a retained 2Gi PVC, hourly backups and daily restore verification. No website-prod namespace exists. The last inspected development backup (20261109T202301323Z) uploaded a versioned object and report with migrations 001–013. The current source includes 014, so current development health is not evidence that new source is deployed.

Public HTTPS puni.dev answers 200 with a 114-byte placeholder; request.puni.dev fails DNS resolution. This is not production readiness. Cluster observability/alerts/backup Flux units have spec.suspend=true and no observability pods exist. API stdout is retrievable using kubectl logs, but centralized production logs are absent. The runtime Secret has GUARDRAIL_WEBHOOK_URL; no proposal-notification delivery exists in the submission path.

No production deploy, DNS mutation, secret copying or notification send has been performed. Exact-source gate, production builds/pins, notification implementation and live acceptance remain incomplete.

## Durable notification source and package, 2026-11-09 UTC

The implementation adds additive migration 015, its down script, transactional capture/backfill/erasure triggers, atomic expiring leases and token-fenced acknowledgement. A bounded CLI validates explicit configuration and an existing current database before delivery, retries expected failures, and emits count-only summaries with nonzero failure exits. The API package declares `request-notifications/1`. Deployment and live provider acceptance remain incomplete.

Fresh checks:

- `bun test libs/website/adapters/store-sqlite/src/request-notifications.test.ts`: first capture run 0 pass/4 fail (missing migration/table), then 4 pass/13 assertions; lease extension initially 4 pass/3 fail (missing module), then 7 pass/51 assertions.
- `bun test apps/website/be-01/src/request-notifications-cli.test.ts`: initially 0 pass/8 fail; initial implementation 8 pass/70 assertions; expanded command tests 14 pass/98 assertions. Native HTTPS extension separately passed 3 cases/33 assertions. The initial missing-argument test was tightened after it incorrectly passed on a missing module: it now requires the usage diagnostic, and its initial red failed as required.
- Complete uncached Nx suites: `website-store-sqlite:test` **287 pass, 0 fail, 1485 assertions** (25.07s); `website-be-01:test` **589 pass, 0 fail, 9340 assertions** (205.38s). Nx reported both targets successful. This run included all 17 delivery tests and seven store tests.
- Uncached Nx lint/typecheck/build for both projects and one build dependency: all successful (6.3s). No warnings in these changed-project checks.
- Actual API build smoke: empty packaged command, nonempty packaged command against a real HTTPS receiver, and original compiled-main country/retention checks passed. HTTPS cases 201, 503 and 302 each assert the native command exit, payload, redaction, redirect refusal and persisted SQLite acknowledgement. The receiver uses an ephemeral local certificate trusted through NODE_EXTRA_CA_CERTS; no fetch stub is used for these cases.
- Migration lint on the real forward/down pair passed. Strict `openspec validate website-production-operations --strict` passed after splitting a too-long requirement paragraph. The canonical full host gate has not yet passed this source.

Twenty-two runtime/schema fault injections each failed the selected real test, then the restored selector passed: capture trigger, erasure trigger, backfill presence/filter, due time, delivered-state selection, lease token/expiry, acknowledgement, retry delay, origin, URL parse classification, HTTPS scheme, userinfo, fragment, response acceptance, deadline, batch bound, unexpected-error classification, cancellation, redirect refusal and secret-error logging. Adjacent Proof comments name these observed faults. Network and cancellation are tested outcomes; unexpected defects still abort the command.

Package faults independently removed the actual bundled worker and the notification capability: both refused. An unknown selector also refused natively in Bun 1.4.4, so it was not claimed as proof of the extra count check. A separate omitted-201-case fault yielded two passing HTTPS cases and made the count check refuse; removing that count check admitted exit 0, and complete restoration passed. The earlier attempted empty-selection guard-removal probe remained failing because Bun itself refused zero matches; it was diagnostic, not accepted as a false-green witness.

Independent source review identified the initially absent native/package transport check; the real HTTPS/package extension closed it. Re-review reported no remaining material source findings. These results establish notification source/package behavior, not a production CronJob, configured owner subscription, off-host backup, retained logs, DNS cutover or live availability.

Raw logs remain at the absolute paths, sizes and SHA256 identities in [check receipts](evidence/notification-checks.json) and [fault receipts](evidence/notification-proofs.json). Fault source hashes identify the bytes at proof time before adjacent Proof comments were added. No customer content or real webhook credentials were used by tests.

Read-only follow-up confirmed the configured notification host is ntfy.sh without exposing its topic. Existing GoDaddy access successfully listed 19 records: the apex A record is Parked; development A records already point to 204.168.155.134; production request/app A records are absent. Existing h3 monitoring services are running, while the Kubernetes observability units remain suspended. Both gate hosts have confirmed live unrelated gate holders; no process was stopped or restarted.
