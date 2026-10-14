## 1. Lease parking safety

- [x] 1.1 Reproduce delayed heartbeat success and failure through executeRelease, then stop and drain renewals before parking — tests: `drains a delayed heartbeat before parking when renewal succeeds/fails`; negative: baseline parks before renewal completes.
- [x] 1.2 Propagate delayed renewal failure before parking — test: `drains a delayed heartbeat before parking when renewal fails`; negative: removing the ownership check returns ReleaseFailedError and parks.
- [x] 1.3 Keep heartbeats stopped during slow parking — test: `stops heartbeats throughout a delayed terminal park`; negative: removing shutdown observes renewals during parking.

## 2. Evidence

- [x] 2.1 Run focused executor/adapter tests, lint, typecheck, formatting, and OpenSpec validation; record actual output and skipped full gate/live actions in verify.md.
