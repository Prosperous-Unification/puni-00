## 1. Native dependency and complete topology

### Task 1: Native topology

- [x] 1.1 Pin `configurable-tree-traversal` 0.12.0 in `package.json`/`bun.lock`; add `src/coordination/topology.ts` and `topology.test.ts` under Twilight Dash. Export `materializeOrderedSteps(workItemId: string, steps: readonly { id: string; position: number }[])` returning native `MaterializedDagInput<StepNodeRef, string>`, and `prepareCoordination(input: MaterializedDagInput<StepNodeRef, string>)` returning native `PreparedDag<StepNodeRef, string>`. Test real work tickets, bytewise ties, accepted-work seeds, parallel joins and W/C separation; negative: disconnected cycle and absent prerequisite must prevent executable topology. Observe red before implementing; independently bypass preparation validation and observe the negative fail before restoring.

## 2. Host-controlled admission and reconstruction

### Task 2: Run coordination

- [ ] 2.1 Add `src/coordination/run-coordinator.ts` and `run-coordinator.test.ts`. Export `createRunCoordinator({ dag, runs, runId, readWbs })`; the returned object exposes async `ready()`, `admit(ticket, guard, admission)`, `complete(ticket)` and callback-free `summary()`. `readWbs` supplies complete validated WBS identities, step catalog, accepted progress and eligible step IDs. Test accepted predecessors, absence of implicit completion, foreign/fabricated/replaced tickets and duplicate completion receipts; negative: bypass accepted-progress or ticket ownership checks and observe successor release or unsafe acknowledgement.
- [ ] 2.2 Connect `admit` to existing `RunStore.admitAttempt`; preserve exact duplicate replay, original operation keys, stale-owner/revision conflicts and global capacity. Overlay durable active/wait/reconciliation/retry state. Run the same contract against memory and SQLite stores in `run-coordinator.test.ts` and `run-coordinator.db.test.ts`, closing all stores before scratch removal. Test two kernel-ready runs racing for one store slot and restart with an unfinished attempt; negative: bypass host eligibility/history identity checks or the actual guarded admission call and observe changed admission/reservation behavior. Do not replace existing provider tests with synthetic admission facts.

## 3. Integration evidence and parent plan

### Task 3: Evidence and integration

- [ ] 3.1 Update parent `twilight-agentic-workflows/design.md` and related delta-spec terminology to 0.12 native tickets without marking the full coordinator complete. Record exact dependency provenance, red/green commands, independent production-path faults, restoration hashes, focused lint/typecheck and remaining limits in `verify.md`. Run OpenSpec validation and normal commit hooks; obtain code review, source-specific CI and canonical gate before any readiness/merge claim. Keep WBS row 100.2 accurate and preserve the architectural merge hold.

The implementation uses Bun 1.4.4, TypeScript and native CTT exports. Execute each coherent slice test-first in the existing isolated CTT worktree. Expected assertions include `readyIds === [firstStepNodeId]`, no successor after admission, `complete(ticket).kind === 'alreadyAccepted'` on repeated accepted reports, and exactly one reserved slot after the concurrent admission race. No `plan.md`, new graph DSL, storage migration or automatic business-outcome policy is part of this change.
