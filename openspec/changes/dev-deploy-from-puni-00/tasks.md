## 0. Before implementation

- [x] 0.1 Add **Checkout commit** to `CONTEXT.md`.

## 1. Diagnose and fix the proof (in `bin/dev-poll.sh`)

- [x] 1.1 On h2puni, record what `docker exec wbs-dev-src curl -s -w '%{http_code}' http://127.0.0.1:3100/health` returns today and why `read_served_commit` yields nothing. Record in `verify.md`.
- [x] 1.2 Make the reader require HTTP 200, `status:"ok"`, one exact 40-hex `commit`. Tests execute the real `bin/dev-poll.sh` function against fixture bodies: ok, 503-with-commit, malformed, short SHA, mismatched. Negative with `Proof:`: drop the status check; the 503 fixture must pass wrongly and the test catch it.
- [x] 1.3 Durable `state/last-proven`; skip only when `HEAD == origin/main == last-proven`. Test drives two ticks through the real script with a stub fetch/sync/health: unreadable then matching. Negative: restore the early exit; the second tick must fail to prove.

## 2. Isolate the deployer

- [x] 2.1 `sync.ts`: source, container and state paths become arguments (defaults unchanged for the live poller); refuse a rehearsal whose paths resolve to live ones. Negative test per refusal with `Proof:`.
- [x] 2.2 Rehearse on h2puni from a puni-00 tree into a scratch source/container/state set: install and serve succeed with `apps/wiki` and Twilight tooling present. Fix anything they break.

## 3. Cut over (attended)

- [ ] 3.1 On h2puni: back up the crontab and record the current remote; stage the new `bin/dev-poll.sh` beside `/home/puni1/wbs-dev/bin/poll.sh`, then take `state/poll.lock` and atomically install it so the external poller cannot be reset with the checkout; `git -C /home/puni1/wbs-dev/src remote set-url origin https://github.com/Prosperous-Unification/puni-00.git`; fetch. The next tick deploys puni-00 `main` through the installed poller and proves it. Rollback: restore the old poller and remote URL; the poller resumes from wbs-tool-v1.
- [x] 3.2 `LLM_README.md` deploy section names puni-00.

## 4. Close

- [ ] 4.1 Merge one trivial puni-00 commit; record fetch, reset and proof timestamps in `verify.md`.
