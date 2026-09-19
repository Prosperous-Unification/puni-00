## 1. Diagnose the unreadable health check

- [ ] 1.1 On h2puni, read what `docker exec wbs-dev-src curl -s http://127.0.0.1:3100/health` returns today (path, port, body shape) and why `read_served_commit`'s `"commit":"…"` pattern misses. Record the answer in `verify.md`.
- [ ] 1.2 Test for `bin/dev-poll-sync.sh`'s served-commit reader against a fixture of the real body, plus unreadable and mismatched bodies. Fix the reader; make unreadable a non-zero exit. Negative with `Proof:`: restore the log-only branch and watch the exit-code assertion fail.

## 2. Make puni-00's loader carry puni-00

- [ ] 2.1 Dry-run `bin/dev-poll-sync.sh` from a puni-00 tree into a scratch source directory on h2puni (never the live one): install and serve succeed with `apps/wiki` and Twilight tooling present. Fix anything the extra projects break.

## 3. Cut over

- [ ] 3.1 Commit the new host `poll.sh` text under `ops/h2puni/wbs-dev-poll.sh` with the source URL as a variable, reviewed with the rest of this change.
- [ ] 3.2 Attended, on h2puni: back up `poll.sh` and crontab; `git -C /home/puni1/wbs-dev/src remote set-url origin https://github.com/Prosperous-Unification/puni-00.git`; fetch; install the new `poll.sh`. Next tick deploys puni-00 `main`; confirm health reports it. Rollback: restore both backups and the old remote URL.
- [ ] 3.3 Update `LLM_README.md` (deploy section) and prod runbooks/`tool-deploy` defaults to name puni-00.

## 4. Close

- [ ] 4.1 Merge one trivial puni-00 commit and watch dev serve it within two ticks; record timestamps in `verify.md`.
