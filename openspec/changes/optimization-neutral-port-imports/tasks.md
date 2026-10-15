## 1. Neutral optimization contracts

- [x] 1.1 Establish the installed K6 baseline, then narrow core and SQLite transaction imports, the adapter event-log type re-export, and reader imports until the production graph loses the accidental barrel dependencies; test: installed K6 graph and optimized-schedule-reader tests; negative: restore one owner barrel import and reader barrel re-export separately.
- [x] 1.2 Extract committed event/delivery contracts to ports with compatible service re-exports and narrow coordinator/contract consumers; test: installed K6 graph, committed-fanout and optimization DB suites, backend/core typechecks; negative: restore coordinator recorder type import.

## 2. Evidence

- [x] 2.1 Run focused format, lint, tests, typechecks, and OpenSpec validation serially; record observed production graph faults and remaining findings in verify.md. Full host gate belongs to parent integration.
