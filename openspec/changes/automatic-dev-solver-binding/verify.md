# Verify — Automatic dev solver binding

No implementation evidence yet. All builds and automated tests run on h2puni or
in CI, never on the queue worker host.

## Structural validation

At `3c98fec8`, on h2puni in detached worktree
`/dev/shm/t326-spec-3c98fec8`:

```text
bunx @fission-ai/openspec@1.3.0 validate --all --json
40 items, 40 passed, 0 failed; automatic-dev-solver-binding valid
```

The first attempt used the repository's unqualified `openspec` command and
failed with exit 127 because h2puni has no global binary. No validation was
claimed from it; the pinned package command above is the accepted gate.

The terminal proof must include:

| proof | required failure control | evidence |
| --- | --- | --- |
| compatibility identity | solver byte changed / unrelated byte changed | pending |
| target-pinned runner | import available only in old live checkout | pending |
| pre-reset ordering | omit each prepare/verify phase | pending |
| exclusion | two different targets overlap | pending |
| interrupted retry | stop after publish and during install | pending |
| live solver change | poll target differs under `libs/solver-py` | pending |
| alarm backstop | ten consecutive injected preparation failures | pending |
