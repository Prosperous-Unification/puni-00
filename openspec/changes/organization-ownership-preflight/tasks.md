## 1. Snapshot report

- [x] 1.1 Watch report tests fail, implement exact marker and three finding arrays; test empty and mixed findings, activated state, absent/unreadable/malformed marker, and unavailable query table. Negative: omit marker validation and each probe separately and observe the corresponding report test fail.
- [x] 1.2 Hold a deferred read snapshot across asynchronous probes; test a single competing commit changing marker and all three findings, requiring the complete old report then complete new report, and success reuse. Negatives: remove transaction begin/commit, then independently commit after marker, after unmapped roots, and after catalog drift; each must fail the snapshot test.
- [x] 1.3 Roll back failures without swallowing them; test restored table and successful reuse after a failed probe. Negative: remove rollback and watch reuse fail.

## 2. Operator boundary

- [x] 2.1 Implement the no-argument DB_PATH CLI; subprocess tests cover complete JSON with findings, missing/empty DB_PATH from clean cwd, unexpected argv, missing file with no creation, chmod-unreadable file, invalid SQLite, broken marker, unavailable ownership query table despite a valid marker, and no stdout for every refusal. Watch argument/env validation bypasses fail their negatives.
- [x] 2.2 Prove actual CLI opened connection refuses writes and report leaves bytes unchanged; preload a write attempt through that connection, then replace the read-only opener with a writable opener and watch the test fail.
- [x] 2.3 Publish operator scope and exclusions without updating parent completion checkboxes; run focused verification and record all R5 proofs and skipped full checks.
