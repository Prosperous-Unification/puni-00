# Twilight review hardening tasks

Scope: apply the accepted branch review, using [design](design.md) and the
[workflow contract](specs/twilight/workflow-maintenance/spec.md). Runtime changes
are specification corrections only. The existing product plan remains unexecuted.

## Task 1: Resolve the architecture and planning contracts

- [x] 1.1 Amend proposed design/specs/tasks, glossary and explanatory docs for
      restore compatibility, live revocation, dispatch fencing, idempotent human
      decisions, parallel plans and input/output receipt lineage.

Owns `docs/twilight-structure/{CONTEXT,assumptions,client-repositories,product-experience}.md`
and `openspec/changes/twilight-control-plane/{design,tasks,specs/**}.md`.
Preserve established terms and historical receipts. Add concrete failure scenarios
and task-level oracles without claiming they ran. Review cross-document agreement,
relative links, OpenSpec structure and formatting. Does not depend on Task 2.

## Task 2: Repair and reproduce the repository workflow

- [x] 2.1 Include conditional design in fast-forward traversal; make archive
      failures explicit; generate installed variants from canonical sources and
      enforce reproducibility in the Nx/CI gate.

Owns `openspec/schemas/twilight-v1/schema.yaml`, generated `.agents/.claude`
OpenSpec skills and commands, scoped workflow tooling/targets/tests and upgrade
documentation. First retain a negative for omitted design traversal and workflow
drift. Observe failure, implement, observe restoration; exercise the actual pinned
CLI and generator entrypoints. Test real source absence/unreadability and a
deliberately divergent provider variant. Record the observed failures before Proof
comments. Skill scenarios cover malformed output and controlled optional absence.

## Task 3: Verify the combined change

- [x] 3.1 Review both slices together, run affected tests/lint/typechecks and the
      repository format/OpenSpec/doc-cap checks, and write `verify.md` with observed
      failure proofs, limits and the disposition of every original finding.

Depends on Tasks 1–2. Owns this change's evidence and navigation to the corrections.
No runtime implementation, remote writes, merge, release or archive is authorized
by completing this task. Use disposable fixtures for mutations, preserving the
working branch and other agents' write scopes.
