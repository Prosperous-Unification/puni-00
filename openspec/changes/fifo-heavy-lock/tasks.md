Ordered slices for `bin/heavy-lock-lib.sh` and its two callers. Every safety check below names the
fault injected to watch its negative fail; the observed output belongs in the `Proof:` comment
beside the check, per AGENTS.md R5.

## 1. Serve waiters in arrival order

- [x] 1.1 Enqueue a ticket per waiting run under `<lock path>.queue`, claim only as the oldest live
      ticket, delete the ticket on claim and on EXIT/INT/TERM, and add `HEAVY_LOCK_POLL_SECONDS`
      (default 5) — test: `bin/heavy-lock.test.sh` case 8 runs a holder, waiter A, then waiter B
      with a one-second poll, and asserts A's command ran first; watched failing as `b a` against
      the poll-first lottery before the queue existed.
- [x] 1.2 Remove a ticket whose pid is gone, naming it on stderr — test: case 9 plants a ticket
      from an exited pid and asserts the next run takes the lock; negative: with the reclaim
      skipped the run is refused 75 behind a process that will never release.
- [x] 1.3 Refuse exit 70 when the queue directory cannot be read or written — test: case 10 runs
      against a mode-000 queue directory; negative: with the guard removed the run reads an empty
      queue and takes the lock out of arrival order.
- [x] 1.4 Refuse exit 70 for a queued name that is not `<nanoseconds>-<pid>`, and for a host with
      no nanosecond clock — test: case 12 plants an unorderable name; negative: with the guard
      removed the run treats it as a dead ticket and deletes it.
- [x] 1.5 Report the queue: `report_heavy_lock_status` behind `bin/with-heavy-lock.sh status`, and
      `heavy lock: waited <n>s behind <k> tickets` on every claim — test: case 11 asserts holder
      then two waiters oldest first; case 13 asserts exit 70 on an unreadable lock directory;
      negative: with the readability guard removed status reports a holder with an empty pid.

## 2. The gate names its lane and reports its wait

- [x] 2.1 Export `HEAVY_LOCK_LABEL="gate:<resolved sha>"` from `bin/h2puni-gate.sh` — test:
      `bin/h2puni-gate.test.sh` case 31 pins that the shipped gate labels its lane from the
      resolved commit, alongside the contract checks for the wait default.
- [x] 2.2 Assert the gate's wait line precedes its `running on` line and reports an integer —
      test: case 31 gates behind a three-second dummy holder; watched failing with no wait line at
      all before slice 1.5 landed.

## 3. Verification

- [ ] 3.1 Run the full gate on h2puni at the change head and record commands, results and the R5
      proof table in `verify.md`.
