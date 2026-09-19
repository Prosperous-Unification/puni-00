# Verification — dev-deploy-from-puni-00

## Checkout and diagnosis

- Checkout commit before implementation: `4a147ec3bcb957bc863f4d4da7a4b6fc7bbc5be3`.
- h2puni observation at `2026-09-19T20:55:36Z`:
  - `/home/puni1/wbs-dev/src` origin: `https://github.com/Prosperous-Unification/wbs-tool-v1.git`
  - checkout: `73e0057401c44a78d4170ade9cd4a0f8bb3fca9e`
  - `docker exec wbs-dev-src curl -s -w '\nHTTP_STATUS=%{http_code}\n' http://127.0.0.1:3100/health` returned `{"status":"ok","commit":"73e0057401c44a78d4170ade9cd4a0f8bb3fca9e"}` and HTTP 200.
- The same reader pipeline returned the 40-hex commit at diagnosis time. The recorded `<unreadable>` therefore describes the health response during the earlier restart window, not a persistent parser failure. The defect was still durable: after `sync.ts` moved `HEAD`, later ticks exited at `HEAD == origin/main` and never retried the failed proof.

## Automated proof

Focused gate on h2puni at `fd28a6356664e411e717eb2fcf2c0cc1f4d359a4`:

- `bun test tools/tool-devsync/src/poller.test.ts tools/tool-devsync/src/sync.test.ts`
- Result: **68 passed, 0 failed, 199 assertions** in 3.02 seconds.
- Fixture coverage: valid 200/ok/40-hex, mismatched commit, 503 with commit, malformed body, short SHA, and non-ok JSON status.
- Two-tick coverage: the first tick deploys but cannot prove, exits non-zero and leaves `last-proven` absent; the second tick has `HEAD == origin/main`, rechecks health, and atomically records the matching SHA.
- Rehearsal fencing covers source, container and state independently, and refuses each live value before `sync()` can invoke Git or Docker.

**Proof:** Removing the HTTP-status predicate makes the 503-with-commit fixture pass wrongly. Removing the JSON `status:"ok"` predicate makes the degraded fixture pass wrongly.

**Proof:** Restoring the old `HEAD == origin/main` early exit removes the seventh health observation and leaves `last-proven` absent after the second tick.

**Proof:** Each live-path rehearsal case calls only `devSyncPathsOf`; a missing refusal would reach the assertion without any Git or Docker seam available.

## Gate note

The first full exact-head h2puni gate at `19c960cc51e56c84f5f5e62edd48c1e630f95137` was invalidated by the still-active wbs-tool-v1 poller moving the shared live checkout during the gate. OpenSpec validation had passed 99/99 before Prettier reported many paths disappearing. The cutover procedure must stop that race, then the exact final head gets a fresh full gate.
