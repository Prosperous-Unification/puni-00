## 1. Pure policy and durable journal

- [x] 1.1 Extract the standalone policy and tests from `043f75f0e`; test: exact safe-integer cutoffs and current-consumer shared-tier retirement; negatives: remove cutoff, graph/history and retained-closure guards and observe covering tests fail.
- [x] 1.2 Extract journal, tests and explicit CLI from `2b1119372`; tests: crash before acknowledgement, competing kernel lock, missing/unreadable/corrupt state, ordered recovery and orphan cleanup; negatives: remove ownership, durability, capacity, phase and replacement guards and observe command-path failures.

## 2. Canonical chronology and reviewable delivery

- [x] 2.1 Add ordinary production-command standard/expanded/negative-year reversal and advancement regressions before replacing the lexical receipt comparison; negative: removed predicate admits reversal and restored lexical ordering fails expanded-year cases.
- [x] 2.2 Record fresh focused tests, lint, typecheck, changed-file formatting, strict OpenSpec and failure-proof inventory; preserve dormant runtime scope and original feature work. Commit normally and prepare a draft PR for independent review, remote CI and exact-revision host gating; these merge requirements remain external to local validation.

- [x] 2.3 Clarify the existing sticky write-fence recovery and whole-filesystem journal capacity domain; add exact-threshold, low-reserve, valid-reopening and failed-abandonment command tests, observe the six independent omission faults, rerun the existing inventory against final source and refresh local evidence without changing runtime expressions.
