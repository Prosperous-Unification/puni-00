# Request notifications

A proposal request creates one durable notification obligation in the same SQLite transaction as its submission. Draft creation alone sends no notification. The queue contains only submission IDs and delivery metadata; the protected operator inbox retains contact details and the brief. Migration `015_request_notifications` also queues existing unerased submissions still awaiting review. Compatible predecessor API inserts are covered by the same database trigger.

The API package includes `request-notifications-cli.js` and declares `request-notifications/1`. Run it once per minute in a CronJob using the **same immutable API image and retained database volume** as the API. Set `concurrencyPolicy: Forbid`, `backoffLimit: 0`, and `activeDeadlineSeconds: 300`; the next scheduled invocation recovers failed or crashed work. The command attempts at most twenty notifications, each with a ten-second deadline. Keep Kubernetes Job history and alert on nonzero exits.

```sh
APP_ORIGIN=https://request.puni.dev \
  bun /srv/api/request-notifications-cli.js /srv/data/website.sqlite
```

`REQUEST_WEBHOOK_URL` must come from an explicit Secret binding, not the command line. It must be an HTTPS endpoint accepting an ntfy-style text POST; userinfo, fragments and redirects are refused. `APP_ORIGIN` must be exactly `https://request.puni.dev` or `https://dev.request.puni.dev`. The command never creates or migrates a database: API startup must first apply the current migration ledger, and every worker invocation validates the ledger/schema and integrity.

Delivery includes only `New PUNI proposal request: <submission ID>` and the appropriate `/operator` link. No email, brief, visitor text, claim, receipt token or webhook URL is logged or transmitted in that body. The provider's successful HTTP response is acceptance, not proof of human reading; verify the selected destination reaches the owner during production acceptance.

Success prints a JSON `request_notifications` event with `accepted`, `failed` and `cancelled` counts. Failed HTTP responses, network failures and deadlines leave an obligation due after 1, 2, 4, 8… minutes, capped at one hour, and cause CLI exit 1. Unexpected defects also exit 1 with a fixed, secret-free diagnostic. Retry attempts do not exhaust or delete obligations. A sixty-second lease prevents competing workers from sending concurrently; a crashed lease becomes available again. A worker whose lease expired or was replaced cannot acknowledge another attempt. Remote acceptance followed by a crash before acknowledgement can cause a duplicate with the same request ID; delivery is at least once.

Erasing a proposal's contact or brief content cancels its obligation. An already-started send contains only the ID and inbox link and may still complete. Ordinary code rollback keeps the additive migration and trigger; do not run `down.sql` on a live store to roll back application code. A previous image without `request-notifications/1` cannot run this worker: update its image with the API pin or suspend it visibly during an explicit recovery.

Implementation and proof records: [production operations](../../openspec/changes/website-production-operations/verify.md). Live production notification scheduling, destination acceptance and end-to-end request evidence are incomplete until recorded there.
