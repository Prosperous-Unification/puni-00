## 1. Project-list boundary

- [ ] 1.1 Capture the committed base's exact K6 rank-to-project edge, then introduce the neutral project-list port and replace the concrete type dependency; test: production K6 CLI with an external policy and exact-edge oracle.
- [ ] 1.2 Prove the exact-edge oracle rejects committed direct and transitive-barrel concrete dependencies, restore the neutral implementation, and record an adjacent Proof comment; test: the same production committed-candidate CLI and oracle.

## 2. Preservation and delivery evidence

- [ ] 2.1 Run `project-rank.controller.db.test.ts` and `project-rank.db.test.ts`, scoped typecheck/lint/format, and OpenSpec validation; record actual outcomes and skipped full host gate in `verify.md`.
- [ ] 2.2 Commit the isolated candidate with normal hooks and report its exact SHA/tree for independent review; full host gate, push, merge and deployment remain with the coordinating agent.
