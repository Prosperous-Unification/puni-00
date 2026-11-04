# Verification record

## Scope and selected direction

On 2026-11-04 the owner selected **PostgreSQL with serialized writes per physical store** and requested that all work be pushed in PRs or merged. [ADR0069](../../../docs/adr/0069-postgresql-is-the-second-workflow-store.md) records that decision. Concrete lock/bootstrap details, lifecycle topology/observer behavior and the transfer envelope remain open implementation prerequisites. This initial change publishes planning and evidence, not an adapter.

## Existing observed SQL feasibility

The one reviewed disposable experiment used PostgreSQL18.6 and Bun1.4.4 with container-local psql. It observed SQLSTATE54000 for direct indexing of a65,550-byte identity, nine exact byte roundtrips through a fixed-bucket/full-key candidate, deliberate collisions, three healthy independent-backend concurrency cases, and three real duplicate-producing controls. Separate READ COMMITTED lock/lookup succeeded; omitted locking, a combined statement and an established REPEATABLE READ snapshot each failed the one-row oracle.

The independent audit verified72 native command/client terminal observations and original stream hashes, retained SQL inputs and actual blocking identities. Normal client shutdown was followed by a zero-backend census; the exact owned container stopped0/noOOM, was removed and daemon-confirmed absent. The [findings](evidence/postgres-index-findings.md) and [audit](evidence/postgres-index-audit.json) explain scope. Original304-file/1,285,442-byte evidence is preserved in [the compressed packet](evidence/postgres-index-20261104.json.gz), with [manifest](evidence/packet-manifest.json). This is SQL mechanics, not Bun adapter acceptance, durable-storage certification or production-path R5.

## Independent design review

[The review](evidence/postgres-provider-proposal-review.md) found three Important draft gaps, all corrected and checked: preserve adapter guards in addition to planners; require and negatively prove effective durability settings; scope reconciliation to operations with actual retained evidence. No remaining Critical/Important document issue. No runtime/provider acceptance follows from document review.

## Publication audit

The session's older attached feature heads are ancestors of mainf158ed1b79d2b38b7a5d918290f44cedc1a00fa1. The remaining runtime implementation is already pushed in [PR787](https://github.com/Prosperous-Unification/puni-00/pull/787), head9917286d18ae327182558f9eec17463fe01339ac. Its ongoing canonical gate stays separate from this planning-only publication. All nine file versions in an old staged preparation draft already occur in that published history; unrelated worktrees were not changed. [The audit](evidence/publication-audit.json) retains identities and classification.

The SDK release note is retained as dated research, not a new pin/adoption or a substitute for the still-pending output/ACP choices. Package source caches, dependencies, operational WBS/transport captures and host logs are not new product code.

## Initial publication checks

Fresh scoped Prettier check and the complete `nx format:check --all` passed (native0). `openspec validate --all --json` reported324valid/0failed/699warnings; every returned item was independently checked as valid. Staged `git diff --check` passed. The compressed PostgreSQL packet was independently reopened and all304file hashes/lengths matched; the inventory sidecar and dated SDK packets are also published with readback-verified manifests. No product tests/lint/typecheck/build or new full host gate were run for this planning/evidence publication. CI is pending publication; normal hooks run on the ensuing commit. The canonical post-apply `verify.md` is deliberately deferred until implementation completes. The source worktree was created from mainf158 and installed its lockfile with `bun install --frozen-lockfile` (native0,1498packages). An initial `openspec instructions proposal` request failed because this repository calls that artifact `intent`; the correct instructions were then read. That setup error supplies no verification credit.

## Remaining unverified work

All implementation tasks are open. No new PostgreSQL RunStore/ArtifactStore adapter, Bun SQL lifecycle protocol, production-path negative, durable driver restart/commit proof, complete shared conformance, transfer, new exact-SHA host gate, current-change CI, merge or deployment is accepted. Earlier P10 immediate backend-absence failures remain unresolved. No operator-store migration or production action.

## Private observer implementation checkpoint

The initial planning-only checkpoint has advanced to a reviewed private observer/deadline implementation. [The observer publication record](evidence/postgres-observer-publication.md) preserves exact source identities, real-driver checks, negative controls, reviews, tooling deviations and limits. Task1 of [the lifecycle plan](lifecycle-tasks.md) is approved; Task2 session ownership and all complete-provider/transfer acceptance remain open. Earlier sections describe the initial checkpoint and do not certify the new runtime code.
