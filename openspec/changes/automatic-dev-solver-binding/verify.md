# Verify — Automatic dev solver binding

No implementation evidence yet. All builds and automated tests run on h2puni or
in CI, never on the queue worker host.

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
