# Private latest-main documentation reconciliation

The private integration branch incorporates main `2e3c035ad5bee90ed9329bd476bc299e2357a618` into reviewed R13 `8e15504ea0171b796fdb325f6c3277fb3d7081e7`. Its main additions are the proposed WBS questions and shared occupancy documents. This private merge grants no architectural main merge, activation or deployment.

Main advanced from the initially observed `77d970776697b9c26c38a29299d8d88c424ae996` before merge preparation. The actual `MERGE_HEAD` above, rather than the earlier remote observation, defines this packet. All sixteen added main document files are byte-identical to that parent; the merged glossary preserves both parents' term headings.

Main owns [ADR 0062: a question is a satellite fact](../../../docs/adr/0062-a-question-is-a-satellite-fact-judged-by-the-plan.md). The private proposed root-authority followup moved from number 0062 to [ADR 0065](../../../docs/adr/0065-root-authority-publishes-live-supervisor-identity.md), with its content unchanged and three current links repaired. The historical verification entries retain the numbers recorded in those earlier packets; this mapping identifies the current followup. ADRs 0063/0064 and the proposed broker's delivery scope are unchanged.

Fresh bounded verification before this evidence file was added:

- `bun node_modules/prettier/bin/prettier.cjs --check CONTEXT.md docs/adr/0065-root-authority-publishes-live-supervisor-identity.md docs/adr/0063-supervisor-exclusion-does-not-require-an-identity-broker.md openspec/changes/solver-supervisor-identity-broker/proposal.md openspec/changes/solver-supervisor-identity-broker/design.md`: exit 0.
- `bunx nx run tool-devsync:check:docs --skip-nx-cache`: exit 0, including document checks, four ADR/retired-root tests, and the root migration check; 11.8 seconds.
- `git diff --check` and `git diff --cached --check`: exit 0.
- Private audit `/tmp/puni-r14-doc-integration-audit-20261027.json`: 123 R13 source pins excluding the intentionally merged glossary unchanged; all three protected test pins unchanged; 202 SQL files unchanged; all 65 ADR numbers unique; renamed proposal byte-identical; only Markdown paths changed.

The required contracts memory test still fails the unchanged 500 MB limit. The copies-only optimizer experiment was rejected after fixed repeats measured 563, 553 and 476 MB; its initial 482 MB pass did not establish the requirement. No memory repair is carried here. Full exact-SHA host gate/CI, native Stage B, complete participant exclusion, compatible restoration and feature activation remain unverified or incomplete. No runtime test, build, migration, host gate or production operation was rerun for these documentation changes.
