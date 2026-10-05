# Task 1.1 — pure step-board projection

Only task 1.1 is implemented. Task 1.2, page integration, mounted/browser proofs,
review, full gate and integration remain pending. No API or wire contract changed.
The delivered workItems order and each delivered PlanRead.steps array order are
preserved. Card identity uses formatStepNodeId, independently of labels.

## TDD evidence

From apps/wbs/fe-01:

`TZ=UTC bunx vitest run --config vitest.node.config.ts src/components/board/step-board.test.ts`

- Before production implementation: exit 1; typed empty-column scaffold produced
  seven assertion failures and one passing no-steps control. The exact all-Unknown
  fixture expected sn1.z-leaf.qa, sn1.z-leaf.dev, sn1.a-leaf.qa, sn1.a-leaf.dev;
  it received an empty array. Separate leaf/step duplicate tests each failed no-throw.
- After implementation: exit 0; eight tests passed.
- Reverse steps in a second projection: exact per-leaf reversed IDs are asserted,
  retaining identity. Mixed progress checks literal arrays: Unknown 2, In progress 1,
  Done 1, preserving the separate server-derived row status.

## R5 watched faults

Each mutation ran individually through the real projector with the same Vitest
command plus `-t <test name>`, then the original source was restored. Every mutation
exited 1 with one assertion failure and seven skipped tests. Adjacent Proof comments
name these watched faults and tests; the local transcript is
`.superpowers/sdd/tasks/task-1-mutations.log`.

| Fault                                          | Observed assertion                                                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Bypass malformed-progress union check          | rejects malformed progress instead of treating it as Unknown: expected function to throw                                        |
| Bypass absent-step membership                  | rejects progress naming a step absent from this delivered tree: expected function to throw                                      |
| Bypass identity membership with duplicate leaf | rejects duplicate card identities from repeated leaf IDs: expected function to throw                                            |
| Bypass identity membership with duplicate step | rejects duplicate card identities from repeated step IDs: expected function to throw                                            |
| Reverse workItems traversal                    | preserves delivered leaf and step order independently of IDs and numbers: received sn1.a-leaf.qa first instead of sn1.z-leaf.qa |
| Reverse steps traversal                        | same order test: received sn1.z-leaf.dev first instead of sn1.z-leaf.qa                                                         |
| Bypass parent exclusion                        | literal mixed projection gained extra sn1.parent.qa and sn1.parent.dev cards                                                    |

## Focused verification

- `TZ=UTC bunx vitest run --config vitest.node.config.ts src/components/board/step-board.test.ts src/test-tiers.test.ts`: exit 0, 14 tests passed in two files.
- `bunx tsc --build --force apps/wbs/fe-01/tsconfig.json`: exit 0.
- `bunx eslint apps/wbs/fe-01/src/components/board/step-board.ts apps/wbs/fe-01/src/components/board/step-board.test.ts apps/wbs/fe-01/vitest.node-suites.ts`: exit 0 after building Nx graph.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx graph --file=/tmp/board-projection-graph.json`: exit 0, JSON graph emitted; avoids sandbox-denied sockets and provides the lint rule graph.
- Scoped Prettier and git diff checks are rerun before the candidate commit.

The first lint run lacked a cached graph and found the static union made runtime
fault guards appear redundant. The final guard explicitly reads stored progress
as unknown at the delivered-store fault boundary; Object.hasOwn distinguishes
legitimate absence before column mapping. No union widening or eslint suppression.
Vitest prints the existing native-config warning for extensionless imports and __dirname.

## Pending and unavailable

`openspec validate read-only-step-board --strict --json` could not run locally:
exit 127, openspec command missing. No dependency installation was performed.
Required OpenSpec validation remains pending in the coordinator's canonical
exact-SHA h2puni gate, along with full format/test/lint/typecheck/build and exact-head CI.
Mounted UI, browser, build, full node/conformance suites and gate were not run for
this pure slice. This artifact does not claim overall board acceptance.
