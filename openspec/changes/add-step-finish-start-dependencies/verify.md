# verify — add-step-finish-start-dependencies

## Spec-time commands

Repository-root `bunx @fission-ai/openspec@1.12.0 validate --all --json` exited 0: 125 passed, 0 failed; this change was valid. The CLI emitted informational archive warnings because its target main specs are absent. File-scoped `bunx prettier --write` and `bunx prettier --check` exited 0; check reported all matched files use Prettier style. No application behavior is verified by this packet.

## Planned checks — pending implementation

- **Pending:** Migration lint, apply and rollback with an empty typed table; production rollback guard refusal when typed rows exist, plus explicit recovery command. Check absent versus unreadable trusted migration state separately.
- **Pending:** Expanded slice-graph cases: parent Cartesian product, self-slice/cycle refusal, apparent work-item cycle acceptance, referenced-step deletion refusal, reparenting, step insertion/deletion/reorder, legacy write, project `depReach` change, estimate-driven dynamic-anchor change and history replay.
- **Pending:** Mounted HTTP/MCP old-client compatibility and typed add/edit/remove, duplicate and invalid-reference 4xx, batch atomicity, stale undo/redo.
- **Pending:** Versioned export/import, whole-project copy, subtree duplication and frozen saved plan/snapshot round trips, including malformed new-format rejection.
- **Pending:** Fast and CP-SAT golden corpus, canonical hash/cache retirement, independent materialized FS validation and unknown zero-duration predecessor.
- **Pending:** Browser/geometry and accessibility checks for default add, Customize, chips, keyboard/mobile, endpoint ticks and collapsed proxies.
- **Pending R5 proof:** Omit one parent-expanded edge; a mounted add or scheduler validation test must fail. Restore and add adjacent `Proof:` comment naming the observed failure.
- **Pending R5 proof:** Bypass rollback guard with typed rows; rollback safety test must fail. Restore and record the observed output.
- **Pending R5 proof:** Pin legacy anchor or substitute visual placeholder duration; a production-path scheduling test must fail. Restore and record output.
- **Pending R5 proof:** Accept a dangling step or stale undo; mounted refusal test must fail. Restore and record output.
- **Pending:** Format, lint, typecheck, build, OpenSpec validation and applicable h2puni gate. All implementation checks remain unverified at spec time.

- **Pending R5 proof:** Bypass the combined-graph check on a mounted legacy write or B.Dev estimate clearing; the cycle-refusal test must fail. Restore and record observed output.
- **Pending R5 proof:** Bypass project-update graph validation; a mounted `anchor-slice` to `whole-item` update with typed A.QA → B.QA and legacy B → A must fail its atomic cycle-refusal test. Restore and record observed output.
- **Pending R5 proof:** Skip the hand-down endpoint remap; the mounted node-endpoint hand-down test must fail. Restore and record observed output.
- **Pending R5 proof:** Preselect the predecessor step by name or substitute a different step when it is missing; the step-cell picker test must fail. Restore and record observed output.

## Rebase note

2026-09-27 (WBS 010.4.11.1): endpoints, validation, picker defaults and lifecycle rebased on `address-step-nodes`. Repository-root `bunx @fission-ai/openspec@1.12.0 validate --all --json` on 2026-09-27, after the Astra high review fixes on branch `batch-9/step-nodes-spec`, reported 129 items, 129 passed, 0 failed; this change was valid. File-scoped `bunx prettier --check` on every touched file reported all files use Prettier style. No application behavior is verified by this packet; the h2puni gate result is recorded in the PR.

## Task 1 — endpoints on the step-node graph (WBS 010.4.6, 2026-09-27)

- `env -u CLAUDECODE bun test libs/wbs/domain/contracts libs/wbs/domain/domain`: 1110 pass, 0 fail.
- `bunx nx run-many -t typecheck lint:fast -p wbs-domain wbs-contracts wbs-core`: green.
- **R5 proof (1.3):** `resolveEndpoint` narrowed to `leaves.slice(0, 1)` for a whole endpoint; `refuses a cycle a parent expansion closes` failed on `- Expected - 6 / + Received + 1` (the cycle through the second leaf went unseen) and `expands a whole parent to every descendant leaf` on `- Expected - 1`. Restored; `Proof:` comment beside the expansion in `slice-edges.ts`.
- **Astra review (high), round 1:** no Critical; Important: a whole successor skipped the slice lookup and `findStepNodeCycle` counted an unheld node as a source (fixed: both ends looked up, unheld nodes throw); Important: R5 proofs for every new refusal (added, below); Minor: JSDoc claimed later enforcement, verb-object names (fixed: `findTypedEndpointDefect`, `formatTypedDependencyKey`).
- **R5 proofs, each fault injected alone and the named test watched failing (2026-09-27):** whole-successor lookup skipped → `asks the lookup for both ends of an authored edge` (`Received function did not throw`); node-on-parent, descendant-step-on-leaf and unknown-step refusals disabled in turn → `refuses a node endpoint on a parent, a descendant-step on a leaf, and an unknown step`; self-pair branch disabled → `refuses a self-node pair`; `return null` unconditionally → the four cycle cases; unheld-node refusal disabled → `refuses to order a graph whose edge names a node it does not hold`; `findTypedEndpointDefect`'s two leafhood lines removed in turn → `refuses a node on a parent and a descendant-step on a leaf` (`Received: null`). Each restored with an adjacent `Proof:` comment.
- **Astra review (high), round 2:** round-1 fixes confirmed. Important: a self-node pair answered before graph membership was checked, and `not_found`/`unknown_step` lacked proofs (fixed; membership is checked first). Minor: private helper names, silent invariant fallbacks in the sort, and no two-parent Cartesian case (fixed: `formatNodeKey`, `collectAuthoredIds`, `formatEndpointKey`, `isLeaf`; the sort throws on an impossible pop or a double release; `constrains every pair when both ends are parents`).
- **R5 proofs, round 2 (2026-09-27):** the `not_found` line made `null` → `refuses an unknown work item and a step outside the project` (`Expected: "not_found", Received: null`); the `unknown_step` line removed → the same case and `leaves a stepless project whole scope only`; the membership refusal disabled → `refuses to order a graph whose edge names a node it does not hold` and `refuses an unheld node before answering a self-node pair` (`Received function did not throw`).
