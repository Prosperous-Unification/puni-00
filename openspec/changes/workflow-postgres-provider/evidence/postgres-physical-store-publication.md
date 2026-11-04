# PostgreSQL physical-store proposal publication

Status: proposed for owner review. This packet makes the namespace/lock/bootstrap/admission protocol concrete; it does not adopt or implement it. [Design](../physical-store-design.md), [ordered TDD tasks](../physical-store-tasks.md), [proposed ADR0070](../../../../docs/adr/0070-workflow-store-locks-bind-to-postgres-namespaces.md).

The [independent review](postgres-physical-store-design-review-20261105.md) identified one important bootstrap-to-open incarnation gap and one checklist ambiguity. The scoped re-review marks both addressed, with no outstanding findings. Exact reviewed document hashes and original command/stream receipts are in the [manifest](postgres-physical-store-design-20261105-manifest.json) and [gzip JSON packet](postgres-physical-store-design-20261105.json.gz). The packet is declarative UTF-8 evidence and requires no code execution to inspect.

Locked Bun installation, explicit document formatting, required full Nx format, all328 OpenSpec items (0failed) and git diff whitespace checks completed with observed native exit0 on the seven reviewed source documents. These are document checks, not real PostgreSQL behavior. The initial PR846 source remains independently frozen at b1fd7fd15f59e8064d6e9286f0ba82cc723c880f; its gate evidence is separate.

No new runtime safety check was implemented. Every proposed bootstrap/catalog/ledger/durability/semantic gate and its R5 control remains unimplemented and unproved. Full project test/lint/typecheck/build, a fresh physical-store fixture, restart/COMMIT faults, all27 shared suites and complete transfer acceptance were not run for this design packet. The complete provider remains in progress; verify.md is intentionally not produced before implementation completes.
