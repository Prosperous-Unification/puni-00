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

## Isolated rehearsal

At `2026-09-19T21:26:13Z`, h2puni rehearsed exact head `bab79f35286d5a4a4be629432539915a64c39165` from a standalone puni-00 clone with its own source, `task555-dev-src` container, data, and state. The scratch container had no live solver socket mount. `bun install --frozen-lockfile` completed with the repository's apps/wiki and Twilight packages present. The explicit `sync.ts ... --source ... --container task555-dev-src --state ... --rehearsal` invocation reported code-only pickup and `/health` returned `{"status":"ok","commit":"bab79f35286d5a4a4be629432539915a64c39165"}` before and after sync.

## Gate note

The first full exact-head h2puni gate at `19c960cc51e56c84f5f5e62edd48c1e630f95137` was invalidated by the still-active wbs-tool-v1 poller moving the shared live checkout during the gate. OpenSpec validation had passed 99/99 before Prettier reported many paths disappearing. Every later full gate runs in an isolated h2puni worktree, so the live poller cannot move its checkout.

## Attended cutover and successor proof

- At `2026-09-19T22:23:20Z`, the old crontab, origin URL and installed poller pair were backed up under `/home/puni1/wbs-dev/state/cutover-20260919T222320Z`.
- At `2026-09-19T22:23:21Z`, the new pair was atomically installed while holding `state/poll.lock`, origin changed from `https://github.com/Prosperous-Unification/wbs-tool-v1.git` to `https://github.com/Prosperous-Unification/puni-00.git`, and `origin/main` fetched `3f2aa197f5eb709e840110ba956009a9393683b8`.
- The first live tick failed before reset because the lock child re-normalized the exact production tuple as custom input. Dev remained safely at `73e0057401c44a78d4170ade9cd4a0f8bb3fca9e`; repair PR 13 added a regression test and retained rejection of every non-live custom tuple.
- The repaired successor `5c61ccf6406abcfaaaea4f140ea3e85166882709` was fetched on the `2026-09-19T22:56:01Z` tick, reset and recorded in `last-synced` at `2026-09-19T22:56:13.680091234Z`, then recorded in `last-proven` at `2026-09-19T22:56:34.088210349Z`.
- At `2026-09-19T22:56:34Z`, an independent observation returned HTTP 200 with `{"status":"ok","commit":"5c61ccf6406abcfaaaea4f140ea3e85166882709"}`; `HEAD`, `origin/main`, `last-synced`, and `last-proven` all matched.
- Exact-head repair proof on h2puni: **73 passed, 0 failed, 221 assertions**, followed by focused ESLint with no errors. The affected CI project passed; the run's only failures were five unrelated Twilight Bureaucrat production-CLI tests exceeding their fixed 5-second/20-second timeout limits.

**Proof:** The first failed tick did not advance either durable marker. The repaired successor came from the target commit's streamed loader, advanced `last-synced` only after sync returned zero, and advanced `last-proven` only after exact HTTP/JSON/commit equality.
