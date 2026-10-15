## 1. Receipt consistency boundary

- [x] 1.1 Add Burokrat strict CLI and typed checker — test: progress-receipt.test.ts real v6/v7/v8 deterministic reports; negatives: tampered documents, complete PlanRef mismatch, unknown and parent-only task, unknown step, existing semantic faults, strict fields and file/operand faults; watch removed checks fail.

## 2. Consumers and packaging

- [x] 2.1 Reuse checker in Navigator — test: receipt-to-commands.test.ts unchanged bytes and exclusive creation; negative: bypass shared invocation and watch semantic refusal fail.
- [x] 2.2 Register installed route and help — test: packaging/build.test.ts installed report and semantic refusal; negative: remove registration and watch installed success fail.

## 3. Evidence

- [x] 3.1 Update JSDoc and CLI READMEs, record focused checks and R5 proofs in verify.md; full gate delegated to parent.
