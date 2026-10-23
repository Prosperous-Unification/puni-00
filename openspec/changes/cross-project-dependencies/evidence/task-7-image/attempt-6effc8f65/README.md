# Controlled installed-image proof — 2026-10-23

**Passed at `6effc8f653fa0c6d67f903f576b6d97cd6f2adad`, exit 0.**
Isolated h2 checkout `/home/puni1/task7-image-proof-6effc8f65`; canonical heavy
lock label `task7-image-proof:6effc8f65`, observed holder PID 1020519. The wrapper
waited zero seconds. After completion the canonical status reported `holder none`.

The runner completed full built and supplied image modes with installed Python,
real SQLite/service composition, durable optimized publication and recomposed
read reuse. Baseline digest:
`127.0.0.1:33136/wbs-be-01@sha256:02e0ab60dc83e4e72f252b14f60530917c0ab71749fbc72a4a1a18b3764bd706`.

Each derivative independently used that immutable baseline plus one production
source replacement. The [raw inventory](inventory.log) records all distinct
digests and replacement hashes. Retained Dockerfiles prove independent FROM/COPY
inputs; no worktree source was edited.

| Fault                                                   | Observed installed failure                                                                                        | Restoration                                               |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| [Missing connected source binding](source-binding.log)  | Exact scheduled-placement assertion, `engine_unavailable:connected_optimization_not_supported`, scenario line 242 | [Same baseline passed](source-binding-restored.log)       |
| [Owned reader close omitted](owned-close.log)           | Terminal ledger assertion at scenario line 269; no admitted terminals                                             | [Same baseline passed](owned-close-restored.log)          |
| [Forced baseline publication](baseline-publication.log) | Optimized publication choice assertion at scenario line 299                                                       | [Same baseline passed](baseline-publication-restored.log) |
| [Both healthy reuse guards bypassed](healthy-reuse.log) | Settled durable ledger assertion at scenario line 347                                                             | [Same baseline passed](healthy-reuse-restored.log)        |

Every mutant exited 1 at its expected AssertionError. Every restoration exited 0.
The full [built](built-green.log) and [supplied](supplied-green.log) smokes also
exited 0. The missing-binding diagnosis is the exact assertion correction after
the separately retained [failed first attempt](../attempt-bb8ec1a91/README.md).

All ten smoke invocations emitted their own cleanup receipt. Independent recovery
recorded caller and supervisor stopped, stable ownership/admission inventories
and zero failures for every invocation. Outer cleanup read back absence of its
registry and all six recorded tags; `cleanupFailures` is empty. The raw host
`inventory.json` is retained unchanged with a `.log` suffix. Other `command-*.log`
files retain Docker build/push/readback output; the four `*.Dockerfile.log` files
are the unchanged independent mutation Dockerfiles with a log suffix.

The dependency tree was reused from the isolated gate checkout, with unchanged
`package.json` and `bun.lock` across the tested range. Host Bun reported 1.4.2.
No fresh install, production service/store mutation, activation or deployment
occurred. The ephemeral registry and invocation-owned tags were removed, so this
is test evidence rather than a retained deployable release.

This completes the bounded actual-image proof for this exact commit. It does not
establish full Tasks 7.3/7.4, later untested commits, semantic activation or the
required final integrated h2 gate and CI.
