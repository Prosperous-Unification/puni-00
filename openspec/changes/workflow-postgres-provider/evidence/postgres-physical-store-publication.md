# PostgreSQL physical-store proposal publication

Status: proposed for owner review. This packet makes the namespace/lock/bootstrap/admission protocol concrete; it does not adopt or implement it. [Design](../physical-store-design.md), [ordered TDD tasks](../physical-store-tasks.md), [proposed ADR0070](../../../../docs/adr/0070-workflow-store-locks-bind-to-postgres-namespaces.md).

The [independent review](postgres-physical-store-design-review-20261105.md) identified one important bootstrap-to-open incarnation gap and one checklist ambiguity. The scoped re-review marks both addressed, with no outstanding findings. Exact reviewed document hashes and original command/stream receipts are in the [manifest](postgres-physical-store-design-20261105-manifest.json) and [gzip JSON packet](postgres-physical-store-design-20261105.json.gz). The packet is declarative UTF-8 evidence and requires no code execution to inspect.

Locked Bun installation, explicit document formatting, required full Nx format, all328 OpenSpec items (0failed) and git diff whitespace checks completed with observed native exit0 on the seven reviewed source documents. These are document checks, not real PostgreSQL behavior. The initial PR846 source remains independently frozen at b1fd7fd15f59e8064d6e9286f0ba82cc723c880f; its gate evidence is separate.

No new runtime safety check was implemented. Every proposed bootstrap/catalog/ledger/durability/semantic gate and its R5 control remains unimplemented and unproved. Full project test/lint/typecheck/build, a fresh physical-store fixture, restart/COMMIT faults, all27 shared suites and complete transfer acceptance were not run for this design packet. The complete provider remains in progress; verify.md is intentionally not produced before implementation completes.

## Evidence inventory repair

Both shipped policies now declare this existing proposal gzip by its exact path, direct publication consumer and external historical evidence authority. Both original policies refused the committed archive; independently removing each corrected row reproduced that refusal. Both restorations emitted the exact binary metadata, and both policies still refused a same-byte unlisted sibling. The unchanged accepted-observe and prose-authority pilot cases recorded **2 pass / 0 fail / 73 assertions**. The ten parent PostgreSQL declarations remain unchanged.

The [UTF-8 proof envelope](postgres-physical-store-classification-20261105.json) and [manifest](postgres-physical-store-classification-manifest.json) preserve the original helper, current frozen helpers, source/input snapshots, native argv/exit/signal receipts and streams. Decode as data only: verify base64/gzip and decoded JSON hashes, reconstruct files from ordered content chunks, then verify every file length/hash. The manifest records roundtrip checks and the production plaintext-secret scanner’s decoded-file findings. Never execute archived helpers. The manifest’s publication verification receipt follows the packet’s explicit completed-capture cutoff; it is retained separately to avoid self-reference.

This restores the existing inventory contract. The physical-store protocol remains proposed and unimplemented; provider acceptance, runtime PostgreSQL tests, full project tests/build and current-source hosted/canonical gates are outside this repair. Root review, final relevant checks and normal commit hooks remain separate.

The inner packet intentionally retains a historical pre-close progress snapshot. Its later457-byte status append duplicates the retained report facts and is outside the publication cutoff; no unique source, control or native proof is omitted by that exclusion.
